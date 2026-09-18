import { PROXY_CONFIG } from '../config';
import { buildRealisticHeaders } from '../security/fingerprint';
import { CircuitBreaker } from '../security/circuitBreaker';

export interface ActiveSession {
  sessionId: string;
  sessionKey: string;
  firstMessageSignature: string;
  lastMessageId: string | null;
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;
  inFlight: boolean;
}

/**
 * 智能会话生命周期与复用管理器 (Smart Session Manager)
 * 支持主智能体与子智能体通道隔离 (Channel Isolation)，彻底隔绝并发会话串线与上下文污染
 */
export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, ActiveSession> = new Map();
  private lastUsedSessionKey: string = 'main';

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * 计算对话首条消息的指纹，用于识别是否为同一个 Claude Code Agent 任务
   */
  public getFirstMessageSignature(messages: any[]): string {
    if (!messages || messages.length === 0) return '';
    const first = messages[0];
    const content = typeof first.content === 'string' ? first.content : JSON.stringify(first.content || '');
    return `${first.role || 'user'}_${content.slice(0, 100)}`;
  }

  /**
   * 检查指定活跃会话是否仍可复用
   */
  public canReuseSession(session: ActiveSession | undefined, messages: any[]): boolean {
    if (!session) return false;

    // 0. 并发防撞锁：若当前会话正在处于流式传输处理中 (inFlight)，严禁并发重入复用！
    if (session.inFlight) {
      return false;
    }

    // 1. 检查寿命
    const now = Date.now();
    if (now - session.createdAt > PROXY_CONFIG.SESSION_REUSE.MAX_AGE_MS) {
      return false;
    }

    // 2. 检查轮数上限
    if (session.turnCount >= PROXY_CONFIG.SESSION_REUSE.MAX_TURNS) {
      return false;
    }

    // 3. 检查任务指纹
    const sig = this.getFirstMessageSignature(messages);
    return sig === session.firstMessageSignature;
  }

  /**
   * 清理已过期的陈旧会话通道
   */
  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.createdAt > PROXY_CONFIG.SESSION_REUSE.MAX_AGE_MS) {
        this.sessions.delete(key);
      }
    }
  }

  /**
   * 获取或创建远端会话 (支持 channel 隔离：主智能体 'main' 与子智能体 'subagent')
   */
  public async getOrCreateSession(
    token: string,
    messages: any[],
    forceNew: boolean = false,
    channel: string = 'main'
  ): Promise<{ sessionId: string; parentMessageId: string | null; isNew: boolean; sessionKey: string }> {
    CircuitBreaker.getInstance().checkPass();
    this.cleanExpiredSessions();

    const sig = this.getFirstMessageSignature(messages);
    const sessionKey = `${channel}_${sig}`;
    this.lastUsedSessionKey = sessionKey;

    const existingSession = this.sessions.get(sessionKey);

    // 如果可以复用
    if (!forceNew && this.canReuseSession(existingSession, messages) && existingSession) {
      existingSession.inFlight = true;
      existingSession.turnCount++;
      existingSession.lastActiveAt = Date.now();
      console.log(`[SessionManager] ♻️ 智能复用会话 [${existingSession.sessionId.slice(0, 8)}...] (通道: ${channel}, 第 ${existingSession.turnCount} 轮)`);
      return {
        sessionId: existingSession.sessionId,
        parentMessageId: existingSession.lastMessageId,
        isNew: false,
        sessionKey,
      };
    }

    // 否则新建远端会话
    const headers = buildRealisticHeaders(token);
    const res = await fetch(`${PROXY_CONFIG.DEEPSEEK_WEB_ORIGIN}/api/v0/chat_session/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (res.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }

    if (res.status === 429 || res.status === 403) {
      CircuitBreaker.getInstance().trip(`创建会话遭遇 HTTP ${res.status}`);
      throw new Error('CAPTCHA_OR_RATE_LIMIT');
    }

    const data = await res.json() as any;
    const sessionId = data?.data?.biz_data?.id || data?.data?.biz_data?.chat_session?.id || data?.data?.id;
    if (!sessionId) {
      throw new Error(`创建会话失败: ${JSON.stringify(data)}`);
    }

    const newSession: ActiveSession = {
      sessionId,
      sessionKey,
      firstMessageSignature: sig,
      lastMessageId: null,
      turnCount: 1,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      inFlight: true,
    };

    this.sessions.set(sessionKey, newSession);

    console.log(`[SessionManager] 🆕 创建全新 Agent 会话 [${sessionId.slice(0, 8)}...] (通道: ${channel})`);
    return {
      sessionId,
      parentMessageId: null,
      isNew: true,
      sessionKey,
    };
  }

  /**
   * 标记会话的流式收发状态 (退出传输时释放 inFlight 锁)
   */
  public setInFlight(sessionKey: string, inFlight: boolean): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.inFlight = inFlight;
      if (!inFlight) {
        session.lastActiveAt = Date.now();
      }
    }
  }

  /**
   * 记录本轮回复产生的 message_id，作为下轮交互的父节点
   */
  public updateLastMessageId(messageId: string, sessionKey?: string): void {
    const key = sessionKey || this.lastUsedSessionKey;
    const session = this.sessions.get(key);
    if (session && messageId) {
      session.lastMessageId = messageId;
    }
  }

  /**
   * 作废会话
   */
  public invalidateCurrentSession(sessionKey?: string): void {
    if (sessionKey) {
      this.sessions.delete(sessionKey);
    } else {
      this.sessions.delete(this.lastUsedSessionKey);
    }
  }
}
