import { PROXY_CONFIG } from '../config';
import { PowPoolManager } from '../pow/powPoolManager';

/**
 * 拟人化节奏控制器 (Adaptive Gaussian Pacing)
 * 打破机械式固定等待时间，通过高斯正态分布随机抖动模拟真实人工思考与交互节奏
 * 支持工具循环极速微步 (Micro-pacing) 与动态风控雷达缓行联动
 */
export class PacingManager {
  private static instance: PacingManager;
  private lastRequestTime: number = 0;
  private queue: Promise<void> = Promise.resolve();

  private constructor() {}

  public static getInstance(): PacingManager {
    if (!PacingManager.instance) {
      PacingManager.instance = new PacingManager();
    }
    return PacingManager.instance;
  }

  /**
   * 使用 Box-Muller 变换生成高斯正态分布随机数
   */
  private generateGaussian(mean: number, stdDev: number): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
  }

  /**
   * 根据上下文负载与风控状态计算拟人化等待时间 (毫秒)
   */
  public calculateHumanizedDelay(inputCharCount: number = 0, isToolLoop: boolean = false): number {
    // 1. 动态风控雷达联动：若 PoW 难度飙升 (>60k)，说明服务端正在审校当前 IP/Token，自动进入隐身缓行保护 (1500~2500ms)
    if (PowPoolManager.getInstance().isElevatedRisk()) {
      const riskDelay = this.generateGaussian(2000, 300);
      return Math.max(1200, Math.round(riskDelay));
    }

    // 2. 连续工具调用极速微步 (Micro-pacing, 100ms ~ 180ms)，显著加速 Agent 命令执行节奏
    if (isToolLoop) {
      const toolDelay = this.generateGaussian(130, 25);
      return Math.max(80, Math.round(toolDelay));
    }

    // 3. 常规用户交互：高斯拟人抖动
    const { MEAN_DELAY_MS, STD_DEV_MS, MIN_DELAY_MS, READING_FACTOR_PER_1K_MS, MAX_READING_DELAY_MS } = PROXY_CONFIG.PACING;

    let baseDelay = this.generateGaussian(MEAN_DELAY_MS, STD_DEV_MS);
    if (baseDelay < MIN_DELAY_MS) baseDelay = MIN_DELAY_MS;

    const readingDelay = Math.min(
      (inputCharCount / 1000) * READING_FACTOR_PER_1K_MS,
      MAX_READING_DELAY_MS
    );

    return Math.round(baseDelay + readingDelay);
  }

  /**
   * 请求拟人节奏平滑调度 (非阻塞并发流式架构)
   * 仅在请求发起起点处施加微步防封抖动，杜绝将长达数十秒的流式传输串行锁定导致的死锁与卡顿
   */
  public async schedule<T>(task: () => Promise<T>, payloadChars: number = 0, isToolLoop: boolean = false): Promise<T> {
    const paceWait = this.queue.then(async () => {
      const now = Date.now();
      const delayNeeded = this.calculateHumanizedDelay(payloadChars, isToolLoop);
      const elapsed = now - this.lastRequestTime;

      if (elapsed < delayNeeded) {
        const sleepTime = delayNeeded - elapsed;
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
      this.lastRequestTime = Date.now();
    });

    this.queue = paceWait.then(() => {}, () => {});

    // 等待发起节拍间隔就绪后，立即执行 task 本身，彻底释放后续请求并发通道！
    await paceWait;
    return task();
  }
}

