import * as vscode from 'vscode';

export class RateLimiter {
  private static instance: RateLimiter;
  private lastRequestTime: number = 0;
  private queue: Promise<void> = Promise.resolve();
  private challengeBlocked: boolean = false;
  private challengeResolver: (() => void) | null = null;

  private constructor() {}

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * 获取用户配置的最小请求间隔（毫秒），默认 2000ms
   */
  public getMinIntervalMs(): number {
    const config = vscode.workspace.getConfiguration('deepseek');
    return config.get<number>('toolPacingIntervalMs', 2000);
  }

  /**
   * 线程安全排队：确保连续的自动化调用留有安全时间间隔，防止触发网页端风控验证
   */
  public async schedule<T>(task: () => Promise<T>): Promise<T> {
    const runTask = async (): Promise<T> => {
      // 1. 如果当前处于人机验证阻断状态，挂起等待用户解锁
      if (this.challengeBlocked) {
        await new Promise<void>((resolve) => {
          this.challengeResolver = resolve;
        });
      }

      // 2. 计算与上次请求的间隔，执行节奏控制 (Adaptive Pacing)
      const now = Date.now();
      const minInterval = this.getMinIntervalMs();
      const timeSinceLast = now - this.lastRequestTime;

      if (timeSinceLast < minInterval) {
        const waitTime = minInterval - timeSinceLast + Math.floor(Math.random() * 300); // 引入微小随机抖动模拟人工
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      try {
        const result = await task();
        return result;
      } finally {
        this.lastRequestTime = Date.now();
      }
    };

    // 将任务串行追加到队列中
    const nextInQueue = this.queue.then(runTask, runTask);
    this.queue = nextInQueue.then(() => {}, () => {});
    return nextInQueue;
  }

  /**
   * 触发人机验证/滑块拦截阻断
   */
  public triggerChallengeBlocked(): void {
    this.challengeBlocked = true;
  }

  /**
   * 用户在浏览器完成验证后调用，唤醒所有挂起的请求继续执行
   */
  public resumeAfterChallenge(): void {
    this.challengeBlocked = false;
    if (this.challengeResolver) {
      const resolve = this.challengeResolver;
      this.challengeResolver = null;
      resolve();
    }
  }

  public isBlocked(): boolean {
    return this.challengeBlocked;
  }
}

