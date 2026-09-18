import { PROXY_CONFIG } from '../config';

/**
 * 上下文负载优化器与防风控数据裁剪器
 * 针对 Claude Code 在 Agent 模式下可能返回的巨量日志（如 git log, npm list, 编译报错）进行智能折叠
 */
export class PayloadSanitizer {
  /**
   * 智能裁剪过长的工具执行输出 (Byte-for-byte 确定性幂等格式化)
   * 采用「保留头部核心上下文 + 保留尾部最新输出/错误 + 折叠中间冗余数据」算法
   * 保证同一条工具输出在后续多轮对话中字符序列 100% 恒定不变，最大化命中 DeepSeek 服务端 KV Cache Prefix Caching
   */
  public static sanitizeToolResult(rawContent: string, isHistorical: boolean = false): string {
    if (!rawContent || typeof rawContent !== 'string') return '';

    const maxLimit = isHistorical ? 600 : PROXY_CONFIG.PAYLOAD_LIMITS.MAX_TOOL_RESULT_LENGTH;
    const headPreserve = isHistorical ? 360 : PROXY_CONFIG.PAYLOAD_LIMITS.HEAD_PRESERVE;
    const tailPreserve = isHistorical ? 180 : PROXY_CONFIG.PAYLOAD_LIMITS.TAIL_PRESERVE;

    if (rawContent.length <= maxLimit) {
      return rawContent;
    }

    const head = rawContent.slice(0, headPreserve);
    const tail = rawContent.slice(rawContent.length - tailPreserve);
    const omittedChars = rawContent.length - headPreserve - tailPreserve;

    return `${head}\n... [⚡ 输出过长，中间略过 ${omittedChars} 字符以加速 Prefill] ...\n${tail}`;
  }

  /**
   * 确保整体最终发往网页端的 Prompt 保持在安全预算内 (毫秒级释放 Prefill 计算)
   */
  public static ensurePromptWithinBudget(prompt: string): string {
    const maxBudget = PROXY_CONFIG.PAYLOAD_LIMITS.MAX_TOTAL_PROMPT_LENGTH;
    if (prompt.length <= maxBudget) {
      return prompt;
    }

    console.warn(`[PayloadSanitizer] ⚡ 提示词 (${prompt.length} 字符) 超过安全预算 (${maxBudget})，执行结构化精简以提速 Prefill`);
    let head = prompt.slice(0, 8000);
    const lastNewline = head.lastIndexOf('\n');
    if (lastNewline > 4000) {
      head = head.slice(0, lastNewline);
    }
    let tail = prompt.slice(prompt.length - 18000);
    const firstNewline = tail.indexOf('\n');
    if (firstNewline !== -1 && firstNewline < 2000) {
      tail = tail.slice(firstNewline + 1);
    }
    return `${head}\n\n... [⚡ 上下文自动紧凑折叠：已略过早期历史日志，确保极速生成] ...\n\n${tail}`;
  }
}

