/**
 * 高精度 Token 估算器 (适配 DeepSeek / Claude Code 双语与代码混排场景)
 * - 中文字符与全角标点: ~1.0 token / 字符
 * - 英文字母、代码关键字、标点符号、空白字符: ~1 token / 3.5 字符
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return Math.max(1, Math.ceil(cjkCount * 1.0 + nonCjkCount / 3.5));
}
