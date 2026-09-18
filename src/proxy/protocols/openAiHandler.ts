import * as http from 'http';
import { PROXY_CONFIG, resolveUserToken, resolveSearchEnabled } from '../config';
import { OpenAiPayload, ToolDefinition } from '../types';
import { PromptInjector } from '../agent/promptInjector';
import { extractToolCalls } from '../agent/toolParser';
import { extractDeepSeekDeltas, createDeepSeekStreamState, formatSearchResults } from './streamDecoder';
import { SessionManager } from '../session/sessionManager';
import { PowPoolManager } from '../pow/powPoolManager';
import { PacingManager } from '../security/pacingManager';
import { CircuitBreaker } from '../security/circuitBreaker';
import { buildRealisticHeaders } from '../security/fingerprint';
import { estimateTokens } from '../agent/tokenEstimator';

function sendError(res: http.ServerResponse, status: number, errType: string, message: string) {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({
    error: {
      message,
      type: errType,
      code: status,
    },
  }));
}

function readWithTimeout(reader: any, timeoutMs: number): Promise<{ done: boolean; value?: Uint8Array }> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<{ done: boolean; value?: Uint8Array }>((_, reject) => {
    timer = setTimeout(() => reject(new Error('UPSTREAM_STREAM_TIMEOUT')), timeoutMs);
  });
  return Promise.race([
    reader.read().then((res: any) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

export async function handleOpenAiChatCompletions(req: http.IncomingMessage, res: http.ServerResponse, rawBody: string): Promise<void> {
  let payload: OpenAiPayload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch (err: any) {
    sendError(res, 400, 'invalid_request_error', '无效的 JSON 请求体');
    return;
  }

  try {
    CircuitBreaker.getInstance().checkPass();
  } catch (err: any) {
    sendError(res, 429, 'rate_limit_error', err.message);
    return;
  }

  const token = resolveUserToken(req.headers['authorization'] as string || req.headers['x-api-key'] as string);
  if (!token) {
    sendError(res, 401, 'authentication_error', '未检测到 DeepSeek userToken，请先配置。');
    return;
  }

  const tools: ToolDefinition[] = (payload.tools || []).map(t => t.function || t);
  const prompt = PromptInjector.formatOpenAiMessagesToPrompt(payload.messages, tools);
  const inputTokens = estimateTokens(prompt);
  const modelStr = (payload.model || '').toLowerCase();
  const isReasoner = (modelStr.includes('reasoner') || modelStr.includes('r1') || modelStr === 'deepseek-web') && !modelStr.includes('chat') && !modelStr.includes('fast');
  const stream = !!payload.stream;
  const isSearchEnabled = resolveSearchEnabled(payload.model, prompt, req.headers);

  const isToolLoop = Array.isArray(payload.messages) && payload.messages.length > 0 &&
    payload.messages.some(m => m.role === 'tool' || (Array.isArray(m.content) && m.content.some((b: any) => b?.type === 'tool_result')));

  await PacingManager.getInstance().schedule(async () => {
    let sessionInfo: { sessionId: string; parentMessageId: string | null; isNew: boolean; sessionKey: string };
    try {
      sessionInfo = await SessionManager.getInstance().getOrCreateSession(token, payload.messages, false, 'openai', prompt.length);
    } catch (err: any) {
      if (err.message === 'TOKEN_EXPIRED') {
        sendError(res, 401, 'authentication_error', 'DeepSeek 网页端凭据 (userToken) 已失效，请重新配置。');
      } else if (err.message === 'CAPTCHA_OR_RATE_LIMIT') {
        sendError(res, 429, 'rate_limit_error', '触发了网页端人机验证，请在浏览器中完成验证。');
      } else {
        sendError(res, 500, 'api_error', err.message || '创建会话失败');
      }
      return;
    }

    let heartbeatTimer: NodeJS.Timeout | null = null;

    try {
      // 0ms 获取预热算力挑战 (PoW Token Pool & Dynamic Radar)
      let powHeader: string;
      try {
        powHeader = await PowPoolManager.getInstance().getPowHeader(token);
      } catch (err: any) {
        if (err.message === 'CAPTCHA_OR_RATE_LIMIT') {
          CircuitBreaker.getInstance().trip('PoW 挑战阶段触发人机限制');
          sendError(res, 429, 'rate_limit_error', '触发了网页端人机验证，请在浏览器中打开 chat.deepseek.com 验证。');
          return;
        }
        sendError(res, 500, 'api_error', `PoW 解算失败: ${err.message}`);
        return;
      }

      const headers = {
        ...buildRealisticHeaders(token),
        'X-DS-PoW-Response': powHeader,
      };

      let dsRes: Response;
      try {
        dsRes = await fetch(`${PROXY_CONFIG.DEEPSEEK_WEB_ORIGIN}/api/v0/chat/completion`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chat_session_id: sessionInfo.sessionId,
            parent_message_id: sessionInfo.parentMessageId,
            model_type: isReasoner ? 'expert' : 'default',
            prompt,
            ref_file_ids: [],
            thinking_enabled: isReasoner,
            search_enabled: isSearchEnabled,
            action: null,
            preempt: false,
          }),
          signal: AbortSignal.timeout(PROXY_CONFIG.TIMEOUTS.UPSTREAM_COMPLETION_MS),
        });
      } catch (err: any) {
        SessionManager.getInstance().invalidateCurrentSession(sessionInfo.sessionKey);
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        const errMsg = isTimeout ? 'DeepSeek 网页端响应超时 (45s)，已自动清理会话重试' : `连接 DeepSeek 网页端失败: ${err.message}`;
        sendError(res, 502, 'api_error', errMsg);
        return;
      }

      if (!dsRes.ok || !dsRes.body) {
        SessionManager.getInstance().invalidateCurrentSession(sessionInfo.sessionKey);
        if (dsRes.status === 429 || dsRes.status === 403) {
          CircuitBreaker.getInstance().trip(`调用 completion 阶段触发 HTTP ${dsRes.status}`);
          sendError(res, 429, 'rate_limit_error', '触发了网页端人机限制，已启动熔断保护。请在浏览器中完成滑块验证。');
          return;
        }
        sendError(res, dsRes.status, 'api_error', `DeepSeek 网页端响应异常 HTTP ${dsRes.status}`);
        return;
      }

      CircuitBreaker.getInstance().reset();

      const chatId = `chatcmpl-${Date.now()}`;
      const createdTime = Math.floor(Date.now() / 1000);
      const respModel = payload.model || (isReasoner ? PROXY_CONFIG.DEFAULT_MODEL : PROXY_CONFIG.FAST_MODEL);

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // 周期性发送 SSE 保活心跳
        heartbeatTimer = setInterval(() => {
          if (!res.writableEnded) {
            try { res.write(': ping\n\n'); } catch {}
          }
        }, 8000);

        req.on('close', () => {
          try { reader.cancel(); } catch {}
        });
      }

      const reader = dsRes.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let fullReasoning = '';
      let buffer = '';
      const streamState = createDeepSeekStreamState();

      while (true) {
        let chunkResult: { done: boolean; value?: Uint8Array };
        try {
          chunkResult = await readWithTimeout(reader, 60000);
        } catch (readErr: any) {
          if (readErr.message === 'UPSTREAM_STREAM_TIMEOUT') {
            console.warn('[OpenAI Handler] ⚠️ 上游数据流超过 60 秒无响应，安全退出流循环');
            break;
          }
          throw readErr;
        }

        const { done, value } = chunkResult;
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          let parsed: any;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          const { textDelta, reasoningDelta, messageId } = extractDeepSeekDeltas(parsed, streamState);

          if (messageId) {
            SessionManager.getInstance().updateLastMessageId(messageId, sessionInfo.sessionKey);
          }

          if (reasoningDelta) {
            fullReasoning += reasoningDelta;
            if (stream) {
              res.write(`data: ${JSON.stringify({
                id: chatId,
                object: 'chat.completion.chunk',
                created: createdTime,
                model: respModel,
                choices: [{ index: 0, delta: { reasoning_content: reasoningDelta }, finish_reason: null }],
              })}\n\n`);
            }
          }

          if (textDelta) {
            fullText += textDelta;
            if (stream) {
              res.write(`data: ${JSON.stringify({
                id: chatId,
                object: 'chat.completion.chunk',
                created: createdTime,
                model: respModel,
                choices: [{ index: 0, delta: { content: textDelta }, finish_reason: null }],
              })}\n\n`);
            }
          }
        }
      }

      const searchRefText = formatSearchResults(streamState.searchResults);
      if (searchRefText) fullText += searchRefText;

      if (stream) {
        if (searchRefText) {
          res.write(`data: ${JSON.stringify({
            id: chatId,
            object: 'chat.completion.chunk',
            created: createdTime,
            model: respModel,
            choices: [{ index: 0, delta: { content: searchRefText }, finish_reason: null }],
          })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({
          id: chatId,
          object: 'chat.completion.chunk',
          created: createdTime,
          model: respModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const { cleanText, toolCalls } = extractToolCalls(fullText, tools);
        const messageObj: any = {
          role: 'assistant',
          content: cleanText || (toolCalls.length > 0 ? null : fullText),
          reasoning_content: fullReasoning || undefined,
        };

        if (toolCalls.length > 0) {
          messageObj.tool_calls = toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }

        const outTokens = estimateTokens(fullText + fullReasoning);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: chatId,
          object: 'chat.completion',
          created: createdTime,
          model: respModel,
          choices: [{
            index: 0,
            message: messageObj,
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          }],
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outTokens,
            total_tokens: inputTokens + outTokens,
          },
        }));
      }
    } catch (err: any) {
      console.error('[OpenAI Handler] ❌ 请求处理异常:', err);
      if (sessionInfo?.sessionKey) {
        SessionManager.getInstance().invalidateCurrentSession(sessionInfo.sessionKey);
      }
      if (!res.headersSent) {
        sendError(res, 502, 'api_error', `请求处理失败: ${err.message}`);
      }
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      SessionManager.getInstance().setInFlight(sessionInfo.sessionKey, false);
      if (stream && !res.writableEnded) {
        try { res.end(); } catch {}
      }
    }
  }, prompt.length, isToolLoop);
}
