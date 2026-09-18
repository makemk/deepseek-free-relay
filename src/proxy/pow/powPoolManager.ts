import { PROXY_CONFIG } from '../config';
import { buildRealisticHeaders } from '../security/fingerprint';
import { CircuitBreaker } from '../security/circuitBreaker';
import { WasmManager } from './wasmManager';

export interface CachedPowItem {
  header: string;
  expireAt: number;
  difficulty: number;
}

/**
 * 算力挑战预热池与动态风控雷达 (PoW Pool & Risk Radar)
 * 1. 0ms 极速发包：在内存中预维护 1~2 个有效算力挑战结果，随取随用，后台自动异步补货；
 * 2. 动态风控雷达：实时捕获服务端 difficulty 波动，难度飙升时预警并提供防风控依据。
 */
export class PowPoolManager {
  private static instance: PowPoolManager;
  private pool: CachedPowItem[] = [];
  private isReplenishing: boolean = false;
  private latestDifficulty: number = 10000;

  private constructor() {}

  public static getInstance(): PowPoolManager {
    if (!PowPoolManager.instance) {
      PowPoolManager.instance = new PowPoolManager();
    }
    return PowPoolManager.instance;
  }

  /**
   * 获取最新记录的服务端 PoW 算力难度
   */
  public getLatestDifficulty(): number {
    return this.latestDifficulty;
  }

  /**
   * 是否处于高风控风险状态 (难度 > 60,000 说明服务端对当前 IP/Token 正在加大审校)
   */
  public isElevatedRisk(): boolean {
    return this.latestDifficulty > 60000;
  }

  /**
   * 清理池中已过期的凭据
   */
  private cleanExpired(): void {
    const now = Date.now();
    // 预留 20 秒安全缓冲时间
    this.pool = this.pool.filter(item => item.expireAt - now > 20000);
  }

  /**
   * 获取可用的 X-DS-PoW-Response 请求头
   * 优先从预热池中 0ms 获取，池空时即时解算并启动异步补货
   */
  public async getPowHeader(token: string): Promise<string> {
    this.cleanExpired();

    if (this.pool.length > 0) {
      const item = this.pool.shift()!;
      // 消费后异步补充池容量
      this.triggerReplenish(token);
      return item.header;
    }

    // 池中无现成凭据，即时同步解算
    const freshItem = await this.fetchAndSolve(token);
    // 异步补齐下一张凭证
    this.triggerReplenish(token);
    return freshItem.header;
  }

  /**
   * 触发后台异步补货 (非阻塞)
   */
  public triggerReplenish(token: string): void {
    if (this.isReplenishing || this.pool.length >= 2) return;
    this.replenish(token).catch(err => {
      // 补货异常静默记录，不影响主流程
      console.warn(`[PowPoolManager] ⚠️ 后台预热 PoW 凭证失败: ${err.message}`);
    });
  }

  private async replenish(token: string): Promise<void> {
    if (this.isReplenishing) return;
    this.isReplenishing = true;
    try {
      this.cleanExpired();
      while (this.pool.length < 2) {
        const item = await this.fetchAndSolve(token);
        this.pool.push(item);
      }
    } finally {
      this.isReplenishing = false;
    }
  }

  /**
   * 从服务端拉取 PoW 算力挑战并调用 WASM 高性能求解
   */
  private async fetchAndSolve(token: string): Promise<CachedPowItem> {
    CircuitBreaker.getInstance().checkPass();

    const powRes = await fetch(`${PROXY_CONFIG.DEEPSEEK_WEB_ORIGIN}/api/v0/chat/create_pow_challenge`, {
      method: 'POST',
      headers: buildRealisticHeaders(token),
      body: JSON.stringify({ target_path: '/api/v0/chat/completion' }),
      signal: AbortSignal.timeout(PROXY_CONFIG.TIMEOUTS.POW_CHALLENGE_MS),
    });

    if (!powRes.ok) {
      if (powRes.status === 429 || powRes.status === 403) {
        CircuitBreaker.getInstance().trip('PoW 挑战阶段触发 HTTP 429/403');
        throw new Error('CAPTCHA_OR_RATE_LIMIT');
      }
      throw new Error(`获取 PoW 挑战失败: HTTP ${powRes.status}`);
    }

    const powData = await powRes.json() as any;
    const challenge = powData?.data?.biz_data?.challenge;
    if (!challenge) {
      throw new Error(`PoW 挑战响应数据异常: ${JSON.stringify(powData)}`);
    }

    // 动态更新风控难度雷达
    const diff = typeof challenge.difficulty === 'number' ? challenge.difficulty : 10000;
    this.latestDifficulty = diff;
    if (diff > 60000) {
      console.warn(`[PowRadar] ⚠️ 警报：服务端 PoW 难度跃升至 ${diff} (正常约 10000~20000)，系统已启动动态缓行防封保护！`);
    }

    const answer = await WasmManager.solve(challenge);
    const header = WasmManager.buildPowHeader(answer);

    const rawExpire = challenge.expire_at || challenge.expireAt;
    const expireAt = rawExpire ? (rawExpire > 1e11 ? rawExpire : rawExpire * 1000) : (Date.now() + 240000);

    return {
      header,
      expireAt,
      difficulty: diff,
    };
  }
}

