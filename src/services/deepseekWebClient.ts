import * as path from 'path';
import { PowChallenge, StreamCallbacks } from '../types';
import { PowSolver } from './powSolver';
import { TokenStorage } from './tokenStorage';
import { RateLimiter } from './rateLimiter';

const DEEPSEEK_WEB_ORIGIN = 'https://chat.deepseek.com';

interface FragmentState {
  fragmentTypes: string[];
  currentIndex: number;
  observed: boolean;
}

export class DeepSeekWebClient {
  private tokenStorage: TokenStorage;
  private wasmPath: string;
  private rateLimiter: RateLimiter;

  constructor(tokenStorage: TokenStorage, extensionPath: string) {
    this.tokenStorage = tokenStorage;
    this.wasmPath = path.join(extensionPath, 'resources', 'sha3_wasm_bg.wasm');
    this.rateLimiter = RateLimiter.getInstance();
  }

  /**
   * 通用请求头模拟 Chrome 浏览器环境
   */
  private getClientHeaders(token: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Origin': DEEPSEEK_WEB_ORIGIN,
      'Referer': `${DEEPSEEK_WEB_ORIGIN}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'X-App-Version': '2.0.0',
      'X-Client-Platform': 'web',
      'X-Client-Version': '1.0.0-always',
    };
  }

  /**
   * 创建新的远端会话
   */
  public async createSession(signal?: AbortSignal): Promise<string> {
    return this.rateLimiter.schedule(async () => {
      const token = await this.tokenStorage.getUserToken();
      if (!token) {
        throw new Error('MISSING_TOKEN');
      }

      const res = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat_session/create`, {
        method: 'POST',
        headers: this.getClientHeaders(token),
        body: JSON.stringify({}),
        signal,
      });

      if (res.status === 401) {
        await this.tokenStorage.handleUnauthorized();
        throw new Error('TOKEN_EXPIRED');
      }

      if (res.status === 429 || res.status === 403) {
        this.rateLimiter.triggerChallengeBlocked();
        throw new Error('CAPTCHA_REQUIRED');
      }

      if (!res.ok) {
        throw new Error(`创建 DeepSeek 会话失败: HTTP ${res.status}`);
      }

      const data = await res.json() as any;
      if (data?.data?.biz_code === 40101 || data?.code === 401) {
        await this.tokenStorage.handleUnauthorized();
        throw new Error('TOKEN_EXPIRED');
      }

      const sessionId = data?.data?.biz_data?.id || data?.data?.biz_data?.chat_session?.id || data?.data?.id;
      if (!sessionId) {
        throw new Error(`创建会话返回值异常: ${JSON.stringify(data)}`);
      }

      this.tokenStorage.setStatus('valid');
      return sessionId;
    });
  }

  /**
   * 获取并求解 PoW 算力挑战
   */
  public async getPowHeaders(targetPath: string, signal?: AbortSignal): Promise<Record<string, string>> {
    const token = await this.tokenStorage.getUserToken();
    if (!token) {
      throw new Error('MISSING_TOKEN');
    }

    const res = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat/create_pow_challenge`, {
      method: 'POST',
      headers: this.getClientHeaders(token),
      body: JSON.stringify({ target_path: targetPath }),
      signal,
    });

    if (res.status === 401) {
      await this.tokenStorage.handleUnauthorized();
      throw new Error('TOKEN_EXPIRED');
    }

    if (res.status === 429 || res.status === 403) {
      this.rateLimiter.triggerChallengeBlocked();
      throw new Error('CAPTCHA_REQUIRED');
    }

    if (!res.ok) {
      throw new Error(`获取 PoW 算力挑战失败: HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    const rawChallenge = data?.data?.biz_data?.challenge;
    if (!rawChallenge) {
      throw new Error(`PoW 挑战载荷为空: ${JSON.stringify(data)}`);
    }

    const challenge: PowChallenge = {
      algorithm: rawChallenge.algorithm,
      challenge: rawChallenge.challenge,
      salt: rawChallenge.salt,
      difficulty: rawChallenge.difficulty,
      signature: rawChallenge.signature,
      expireAt: rawChallenge.expire_at || rawChallenge.expireAt,
    };

    const answer = await PowSolver.solve(challenge, this.wasmPath, signal);
    const powHeader = PowSolver.buildPowHeader(answer, targetPath);

    return {
      'X-DS-PoW-Response': powHeader,
    };
  }

  /**
   * 流式提交对话提示词（经由 RateLimiter 限频保护与自动滑块拦截恢复）
   */
  public async submitChat(
    sessionId: string,
    prompt: string,
    options: {
      parentMessageId?: number | null;
      thinkingEnabled?: boolean;
      searchEnabled?: boolean;
      signal?: AbortSignal;
    },
    callbacks: StreamCallbacks,
  ): Promise<void> {
    await this.rateLimiter.schedule(async () => {
      const token = await this.tokenStorage.getUserToken();
      if (!token) {
        callbacks.onError?.(new Error('未配置 DeepSeek 网页版 UserToken，请在侧边栏右上角点击设置图标进行配置。'));
        return;
      }

      let powHeaders: Record<string, string>;
      try {
        powHeaders = await this.getPowHeaders('/api/v0/chat/completion', options.signal);
      } catch (err: any) {
        if (err.message === 'TOKEN_EXPIRED') {
          callbacks.onTokenExpired?.();
          return;
        }
        if (err.message === 'CAPTCHA_REQUIRED') {
          callbacks.onCaptchaChallenge?.();
          return;
        }
        callbacks.onError?.(err);
        return;
      }

      const clientHeaders = this.getClientHeaders(token);
      const model = this.tokenStorage.getModel();
      const isThinking = options.thinkingEnabled ?? (!model.includes('chat'));
      const isSearch = options.searchEnabled ?? this.tokenStorage.isSearchEnabled();

      const requestBody = {
        chat_session_id: sessionId,
        parent_message_id: options.parentMessageId ?? null,
        model_type: isThinking ? 'expert' : 'default',
        prompt,
        ref_file_ids: [],
        thinking_enabled: isThinking,
        search_enabled: isSearch,
        action: null,
        preempt: false,
      };

      let response: Response;
      try {
        response = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat/completion`, {
          method: 'POST',
          headers: {
            ...clientHeaders,
            ...powHeaders,
          },
          body: JSON.stringify(requestBody),
          signal: options.signal,
        });
      } catch (err: any) {
        if (options.signal?.aborted) return;
        callbacks.onError?.(err);
        return;
      }

      if (response.status === 401) {
        await this.tokenStorage.handleUnauthorized();
        callbacks.onTokenExpired?.();
        return;
      }

      if (response.status === 429 || response.status === 403) {
        this.rateLimiter.triggerChallengeBlocked();
        callbacks.onCaptchaChallenge?.();
        callbacks.onError?.(new Error('网页端短时间内请求过于频繁，触发了人机验证或限流保护。'));
        return;
      }

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        callbacks.onError?.(new Error(`DeepSeek 接口错误 (${response.status}): ${errorText}`));
        return;
      }

      // 实时 SSE 流式解码
      await this.consumeSseStream(response.body, callbacks, options.signal);
    });
  }

  /**
   * 解码 DeepSeek SSE 流，精准切分 R1 思考过程（THINK）与正文输出（RESPONSE）
   */
  private async consumeSseStream(
    body: ReadableStream<Uint8Array>,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let fullReasoning = '';
    let fullText = '';
    let lastSpeedEmit = Date.now();
    let emittedTokens = 0;

    const state: FragmentState = {
      fragmentTypes: [],
      currentIndex: -1,
      observed: false,
    };

    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          // 1. 拦截错误代码
          if (parsed?.data?.biz_code === 40101 || parsed?.code === 401) {
            await this.tokenStorage.handleUnauthorized();
            callbacks.onTokenExpired?.();
            return;
          }

          // 2. 切分思考过程与正文内容
          const { textChunk, reasoningChunk } = this.extractStreamDelta(parsed, state);

          if (reasoningChunk) {
            fullReasoning += reasoningChunk;
            callbacks.onReasoningChunk?.(reasoningChunk, fullReasoning);
            emittedTokens += Math.ceil(reasoningChunk.length / 2);
          }

          if (textChunk) {
            fullText += textChunk;
            callbacks.onTextChunk?.(textChunk, fullText);
            emittedTokens += Math.ceil(textChunk.length / 2);
          }

          // 3. 计算并广播实时生成速度 (tok/s)
          const now = Date.now();
          const elapsedSec = (now - lastSpeedEmit) / 1000;
          if (elapsedSec >= 0.3 && emittedTokens > 0) {
            const speed = Math.round(emittedTokens / elapsedSec);
            callbacks.onSpeedUpdate?.(speed);
            lastSpeedEmit = now;
            emittedTokens = 0;
          }
        }
      }

      callbacks.onFinished?.(fullText, fullReasoning);
    } catch (err: any) {
      if (!signal?.aborted) {
        callbacks.onError?.(err);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 精确解析 DeepSeek JSON Patch 增量分片
   */
  private extractStreamDelta(parsed: any, state: FragmentState): { textChunk: string; reasoningChunk: string } {
    let textChunk = '';
    let reasoningChunk = '';

    if (parsed?.o === 'BATCH' && Array.isArray(parsed.v)) {
      for (const item of parsed.v) {
        const sub = this.extractStreamDelta(item, state);
        textChunk += sub.textChunk;
        reasoningChunk += sub.reasoningChunk;
      }
      return { textChunk, reasoningChunk };
    }

    // 状态更新: response/fragments APPEND
    if (parsed?.p === 'response/fragments' && parsed?.o === 'APPEND' && Array.isArray(parsed?.v)) {
      for (const frag of parsed.v) {
        const type = frag?.type ?? 'RESPONSE';
        state.fragmentTypes.push(type);
        state.currentIndex = state.fragmentTypes.length - 1;
        if (frag?.content) {
          if (type === 'THINK') {
            reasoningChunk += frag.content;
          } else {
            textChunk += frag.content;
          }
        }
      }
      return { textChunk, reasoningChunk };
    }

    // 显式 thinking 路径
    if (typeof parsed?.p === 'string' && (parsed.p.includes('thinking') || parsed.p.includes('reasoning'))) {
      if (typeof parsed?.v === 'string') {
        reasoningChunk += parsed.v;
      }
      return { textChunk, reasoningChunk };
    }

    // 正文或当前活动分片追加
    if (!parsed?.p && typeof parsed?.v === 'string') {
      const currentType = state.fragmentTypes[state.currentIndex] ?? 'RESPONSE';
      if (currentType === 'THINK') {
        reasoningChunk += parsed.v;
      } else {
        textChunk += parsed.v;
      }
      return { textChunk, reasoningChunk };
    }

    // 兼容标准 choices[0].delta 格式
    const delta = parsed?.choices?.[0]?.delta;
    if (delta) {
      if (delta.reasoning_content) {
        reasoningChunk += delta.reasoning_content;
      }
      if (delta.content) {
        textChunk += delta.content;
      }
    }

    return { textChunk, reasoningChunk };
  }
}

