import { PROXY_CONFIG } from '../config';

export enum CircuitState {
  CLOSED = 'CLOSED',       // 正常通行
  OPEN = 'OPEN',           // 熔断拦截 (阻断所有请求，防止频繁撞墙封号)
  HALF_OPEN = 'HALF_OPEN', // 冷却后尝试恢复
}

/**
 * 反风控熔断保护器 (Circuit Breaker)
 * 实时监测 429 / 403 / 人机滑块特征，发现风控即刻熔断阻断盲目重试，最大程度护号
 */
export class CircuitBreaker {
  private static instance: CircuitBreaker;
  private state: CircuitState = CircuitState.CLOSED;
  private tripTime: number = 0;
  private blockReason: string = '';

  private constructor() {}

  public static getInstance(): CircuitBreaker {
    if (!CircuitBreaker.instance) {
      CircuitBreaker.instance = new CircuitBreaker();
    }
    return CircuitBreaker.instance;
  }

  /**
   * 检查当前熔断器状态，如阻断中则抛出明确提示
   */
  public checkPass(): void {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.tripTime;
      if (elapsed < PROXY_CONFIG.CIRCUIT_BREAKER.COOLDOWN_MS) {
        const remainingSec = Math.ceil((PROXY_CONFIG.CIRCUIT_BREAKER.COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`[CIRCUIT_BREAKER_ACTIVE] 触发防封号熔断保护 (${this.blockReason})。为防止账号被封禁，系统已暂停发送请求，请在浏览器中打开 https://chat.deepseek.com 完成滑块验证，剩余冷却时间: ${remainingSec} 秒。`);
      } else {
        // 进入半开状态尝试放行一次
        this.state = CircuitState.HALF_OPEN;
      }
    }
  }

  /**
   * 记录异常并触发熔断
   */
  public trip(reason: string): void {
    this.state = CircuitState.OPEN;
    this.tripTime = Date.now();
    this.blockReason = reason;
    console.error(`\n🚨 [CircuitBreaker] 触发防封号熔断保护! 触发原因: ${reason}`);
    console.error(`🚨 [CircuitBreaker] 已自动锁定请求 ${PROXY_CONFIG.CIRCUIT_BREAKER.COOLDOWN_MS / 1000} 秒，请勿强行高频并发，建议在浏览器打开 chat.deepseek.com 验证！\n`);
  }

  /**
   * 成功请求后重置状态
   */
  public reset(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.tripTime = 0;
      this.blockReason = '';
      console.log(`✅ [CircuitBreaker] 熔断保护已解除，服务恢复正常。`);
    }
  }

  public isBlocked(): boolean {
    return this.state === CircuitState.OPEN;
  }
}

