import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const PROXY_CONFIG = {
  PORT: parseInt(process.env.PORT || '9999', 10),
  HOST: '127.0.0.1',
  DEEPSEEK_WEB_ORIGIN: 'https://chat.deepseek.com',
  DEFAULT_MODEL: 'deepseek-chat-web',
  FAST_MODEL: 'deepseek-chat-web',
  REASONER_MODEL: 'deepseek-web',

  // 拟人化抖动控制 (毫秒) - 极速模式：微秒级平滑抖动，杜绝固定机械并发，兼顾极速与安全
  PACING: {
    MEAN_DELAY_MS: 500,          // 高斯分布中心延迟 ~500ms (大幅缩短)
    STD_DEV_MS: 120,             // 随机标准差 (380ms ~ 620ms 拟人波动)
    MIN_DELAY_MS: 300,           // 严格底线间隔 300ms
    READING_FACTOR_PER_1K_MS: 8, // 每 1000 字符仅 8ms
    MAX_READING_DELAY_MS: 250,   // 最大阅读模拟上限 250ms
  },

  // 智能上下文预算与工具长文本截断 (防超限与后台风控，毫秒级释放 Prefill 计算)
  PAYLOAD_LIMITS: {
    MAX_TOOL_RESULT_LENGTH: 3000, // 单个工具执行结果最大保留字符
    HEAD_PRESERVE: 1800,          // 头部保留字符
    TAIL_PRESERVE: 1000,          // 尾部保留字符
    MAX_TOTAL_PROMPT_LENGTH: 28000, // 单个请求总提示词安全警戒线 (压制在 ~8k tokens 内提速 Prefill)
  },

  // 429 / 403 熔断保护机制
  CIRCUIT_BREAKER: {
    COOLDOWN_MS: 30000,          // 熔断后冷却时间 (30秒)
    MAX_RETRIES: 2,              // 异常最大重试次数
  },

  // 会话复用配置
  SESSION_REUSE: {
    MAX_AGE_MS: 15 * 60 * 1000,  // 单会话最大存活 15 分钟
    MAX_TURNS: 8,                // 单会话最大交互轮数 (由25降至8，防止服务端消息树膨胀爆炸)
    MAX_PROMPT_CHARS: 24000,     // 提示词字符超 2.4 万时自动强制开辟全新会话
  },

  // 网络强超时控制 (杜绝长连接无响应无限挂起假死)
  TIMEOUTS: {
    UPSTREAM_COMPLETION_MS: 45000, // completion 流式建立强超时 45 秒
    POW_CHALLENGE_MS: 15000,       // PoW 挑战拉取超时 15 秒
    SESSION_CREATE_MS: 15000,      // 创建远端会话超时 15 秒
  },
};

/**
 * 定位 sha3_wasm_bg.wasm 文件
 */
export function resolveWasmPath(): string {
  const candidates = [
    path.join(__dirname, '..', 'resources', 'sha3_wasm_bg.wasm'),
    path.join(__dirname, '..', '..', 'resources', 'sha3_wasm_bg.wasm'),
    path.join(process.cwd(), 'resources', 'sha3_wasm_bg.wasm'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`未找到 sha3_wasm_bg.wasm，候选路径: ${candidates.join(', ')}`);
}

/**
 * 多源提取并验证 DeepSeek 网页端凭证 (userToken)
 */
export function resolveUserToken(authHeader?: string): string | null {
  // 1. 环境变量
  if (process.env.DEEPSEEK_USER_TOKEN && process.env.DEEPSEEK_USER_TOKEN.trim()) {
    return process.env.DEEPSEEK_USER_TOKEN.trim();
  }

  // 2. 用户主目录 ~/.deepseek_token.json
  try {
    const homePath = path.join(os.homedir(), '.deepseek_token.json');
    if (fs.existsSync(homePath)) {
      const data = JSON.parse(fs.readFileSync(homePath, 'utf-8'));
      if (data.userToken && data.userToken.trim()) return data.userToken.trim();
    }
  } catch {}

  // 3. 项目根目录 config.json
  const configCandidates = [
    path.join(__dirname, '..', 'config.json'),
    path.join(__dirname, '..', '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ];

  for (const p of configCandidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (data.userToken && data.userToken.trim()) return data.userToken.trim();
      } catch {}
    }
  }

  // 4. 请求 Authorization 或 x-api-key 传入的 JWT Token
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const key = bearerMatch ? bearerMatch[1].trim() : authHeader.trim();
    if (key.split('.').length === 3) {
      return key;
    }
  }

  return null;
}

/**
 * 智能决策是否开启 DeepSeek 网页端原生全网搜索 (Web Search)
 * 优先级判断链:
 * 1. HTTP 请求头显式指定: `x-deepseek-search: 1` 或 `true`
 * 2. 环境变量显式开启: `DEEPSEEK_ENABLE_SEARCH=1` 或 `true`
 * 3. 配置文件开启: `~/.deepseek_token.json` 或 `config.json` 中的 `searchEnabled: true`
 * 4. 模型名称中包含搜索意图: 如 `deepseek-chat-web-search`、`deepseek-web-search`、`deepseek-chat-online`
 * 5. 用户输入提示词自动意图识别 (Auto-Search on Demand)
 */
export function resolveSearchEnabled(
  model?: string,
  prompt?: string,
  headers?: Record<string, string | string[] | undefined>
): boolean {
  // 1. 请求头
  if (headers) {
    const headVal = (headers['x-deepseek-search'] || headers['x-search-enabled']) as string;
    if (headVal === '1' || headVal === 'true') return true;
    if (headVal === '0' || headVal === 'false') return false;
  }

  // 2. 环境变量
  if (process.env.DEEPSEEK_ENABLE_SEARCH) {
    const envVal = process.env.DEEPSEEK_ENABLE_SEARCH.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(envVal)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(envVal)) return false;
  }

  // 3. 模型名称含有 search 或 online
  if (model) {
    const m = model.toLowerCase();
    if (m.includes('search') || m.includes('online') || m.includes('web-search')) {
      return true;
    }
  }

  // 4. 用户主目录 ~/.deepseek_token.json 或工作区 config.json
  try {
    const homePath = path.join(os.homedir(), '.deepseek_token.json');
    if (fs.existsSync(homePath)) {
      const data = JSON.parse(fs.readFileSync(homePath, 'utf-8'));
      if (typeof data.searchEnabled === 'boolean') return data.searchEnabled;
    }
  } catch {}

  // 5. 提示词动态意图识别 (若明确包含搜索意图则必定开启)
  if (prompt && typeof prompt === 'string') {
    const searchIntentRegex = /(?:联网搜索|全网搜索|网上搜|搜索一下|搜一下|查一下最新的|搜索最新|最新发布|实时天气|实时资讯|实时新闻|search\s+online|search\s+the\s+web|web\s+search)/i;
    if (searchIntentRegex.test(prompt)) {
      return true;
    }
  }

  // 6. 默认启用原生全网实时搜索 (DeepSeek Web 服务端原生支持按需智能联网：
  // 开启时，模型遇到最新外部信息或文档会智能触发云端检索；若不需要则直出答案。
  // 绝不能默认关闭，否则模型会丧失联网能力并在终端滥用 curl 抓取网页引发假死)
  return true;
}
