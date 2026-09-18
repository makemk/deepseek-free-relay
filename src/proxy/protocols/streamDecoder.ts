/**
 * DeepSeek Web SSE 流式增量分片解码器 (Stream Decoder)
 * 支持 JSON Patch BATCH 集合操作、递归解包、message_id 提取与多分片状态追踪
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

export interface DeepSeekStreamState {
  fragmentTypes: string[];
  currentIndex: number;
  searchResults: SearchResultItem[];
}

export interface DeepSeekDeltaResult {
  textDelta: string;
  reasoningDelta: string;
  messageId?: string;
  searchResults?: SearchResultItem[];
}

export function createDeepSeekStreamState(): DeepSeekStreamState {
  return {
    fragmentTypes: [],
    currentIndex: -1,
    searchResults: [],
  };
}

/**
 * 将检索到的网页来源列表格式化为标准 Markdown 引用附录
 */
export function formatSearchResults(results: SearchResultItem[]): string {
  if (!results || results.length === 0) return '';
  const lines = results.filter(r => r.url).map((r, idx) => {
    const title = r.title.trim() || r.url;
    return `${idx + 1}. [${title}](${r.url})${r.snippet ? ` - ${r.snippet.slice(0, 100).replace(/\s+/g, ' ')}...` : ''}`;
  });
  if (lines.length === 0) return '';
  return `\n\n> 🌐 **联网搜索参考来源**:\n` + lines.map(l => `> ${l}`).join('\n') + '\n';
}

/**
 * 精确解析 DeepSeek JSON Patch 增量分片
 * 彻底解决首包 BATCH 操作被遗漏导致的首词/首标签吞字、截断问题
 */
export function extractDeepSeekDeltas(
  parsed: any,
  state: DeepSeekStreamState
): DeepSeekDeltaResult {
  let textDelta = '';
  let reasoningDelta = '';
  let messageId: string | undefined = undefined;

  if (!parsed || typeof parsed !== 'object') {
    return { textDelta, reasoningDelta, messageId };
  }

  // 1. 递归处理 BATCH 批量操作 (DeepSeek Web SSE 在开局或多操作下强制打包为 BATCH)
  if (parsed.o === 'BATCH' && Array.isArray(parsed.v)) {
    for (const item of parsed.v) {
      const sub = extractDeepSeekDeltas(item, state);
      textDelta += sub.textDelta;
      reasoningDelta += sub.reasoningDelta;
      if (sub.messageId) messageId = sub.messageId;
    }
    return { textDelta, reasoningDelta, messageId };
  }

  // 2. 提取并更新 message_id (支持各种嵌套与 SET 路径)
  if (parsed.v?.message_id || parsed.data?.biz_data?.message_id) {
    messageId = parsed.v?.message_id || parsed.data?.biz_data?.message_id;
  } else if (typeof parsed.p === 'string' && parsed.p.includes('message_id') && typeof parsed.v === 'string') {
    messageId = parsed.v;
  }

  // 3. 提取并记录联网搜索结果分片 (response/search_results)
  if (parsed.p === 'response/search_results' && Array.isArray(parsed.v)) {
    state.searchResults = parsed.v.map((item: any) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.snippet || '',
    }));
    return { textDelta, reasoningDelta, messageId, searchResults: state.searchResults };
  }

  // 4. 状态更新: response/fragments APPEND (挂载新分片并附带初始文本/思考内容)
  if (parsed.p === 'response/fragments' && parsed.o === 'APPEND' && Array.isArray(parsed.v)) {
    for (const frag of parsed.v) {
      const type = frag?.type ?? 'RESPONSE';
      state.fragmentTypes.push(type);
      state.currentIndex = state.fragmentTypes.length - 1;
      if (frag?.content) {
        if (type === 'THINK') {
          reasoningDelta += frag.content;
        } else {
          textDelta += frag.content;
        }
      }
    }
  }

  // 5. 显式 thinking / reasoning 增量路径
  if (typeof parsed.p === 'string' && (parsed.p.includes('thinking') || parsed.p.includes('reasoning'))) {
    if (typeof parsed.v === 'string') {
      reasoningDelta += parsed.v;
    }
  }

  // 6. 正文或当前活动分片追加 (当 p 为空且 v 为字符串时，属于当前活动分片的流式增量)
  if (!parsed.p && typeof parsed.v === 'string') {
    const curType = state.fragmentTypes[state.currentIndex] ?? 'RESPONSE';
    if (curType === 'THINK') {
      reasoningDelta += parsed.v;
    } else {
      textDelta += parsed.v;
    }
  }

  // 7. 兼容标准 choices[0].delta 格式
  const delta = parsed.choices?.[0]?.delta;
  if (delta) {
    if (delta.reasoning_content) {
      reasoningDelta += delta.reasoning_content;
    }
    if (delta.content) {
      textDelta += delta.content;
    }
  }

  // 8. 净化 DeepSeek 特有内部搜索引文标记: 将 [citation:1] 规范化为 [1]
  if (textDelta.includes('[citation:')) {
    textDelta = textDelta.replace(/\[citation:(\d+)\]/g, '[$1]');
  }

  return { textDelta, reasoningDelta, messageId, searchResults: state.searchResults };
}

