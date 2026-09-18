import * as http from 'http';
import { PROXY_CONFIG, resolveUserToken } from './config';
import { handleAnthropicMessages } from './protocols/anthropicHandler';
import { handleOpenAiChatCompletions } from './protocols/openAiHandler';
export { repairAndParseJson, normalizeToolCall, extractToolCalls, StreamToolInterceptor, stripOrphanToolTags } from './agent/toolParser';
export { extractDeepSeekDeltas, createDeepSeekStreamState, formatSearchResults } from './protocols/streamDecoder';
export { SessionManager } from './session/sessionManager';
export { PacingManager } from './security/pacingManager';
export { PromptInjector } from './agent/promptInjector';
export { PowPoolManager } from './pow/powPoolManager';
export { PayloadSanitizer } from './security/payloadSanitizer';
export { resolveSearchEnabled, resolveUserToken } from './config';

export function createProxyServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // 跨域支持
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = req.url ? req.url.split('?')[0].replace(/\/+/g, '/') : '/';

    // 1. 健康状态探测端点
    if (req.method === 'GET' && (urlPath === '/' || urlPath === '/health')) {
      const hasToken = !!resolveUserToken(req.headers['authorization'] as string || req.headers['x-api-key'] as string);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'deepseek-web-proxy-9999',
        architecture: 'modular-layered',
        features: [
          'anthropic-messages-v1',
          'openai-chat-v1',
          'agent-tool-calling-engine',
          'smart-session-reuse',
          'gaussian-pacing-jitter',
          'chrome-132-fingerprint',
          'circuit-breaker-429-defense',
        ],
        defaultModel: PROXY_CONFIG.DEFAULT_MODEL,
        supportedModels: [PROXY_CONFIG.DEFAULT_MODEL, PROXY_CONFIG.FAST_MODEL],
        hasToken,
      }));
      return;
    }

    // 2. 模型列表接口 (Anthropic 与 OpenAI 统一列表)
    if (req.method === 'GET' && (urlPath === '/v1/models' || urlPath === '/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        has_more: false,
        first_id: PROXY_CONFIG.DEFAULT_MODEL,
        last_id: PROXY_CONFIG.FAST_MODEL,
        data: [
          {
            id: PROXY_CONFIG.DEFAULT_MODEL,
            object: 'model',
            type: 'model',
            display_name: 'DeepSeek-Web (深度思考 + Agent 终端工具)',
            created: 1735689600,
            owned_by: 'deepseek-web',
          },
          {
            id: PROXY_CONFIG.FAST_MODEL,
            object: 'model',
            type: 'model',
            display_name: 'DeepSeek-Web (极速对话 + Agent 终端工具)',
            created: 1735689600,
            owned_by: 'deepseek-web',
          },
          {
            id: 'claude-3-7-sonnet-20250219',
            object: 'model',
            type: 'model',
            display_name: 'Claude 3.7 Sonnet (Alias -> DeepSeek-Web)',
            created: 1740000000,
            owned_by: 'anthropic-alias',
          },
          {
            id: 'claude-3-5-sonnet-20241022',
            object: 'model',
            type: 'model',
            display_name: 'Claude 3.5 Sonnet (Alias -> DeepSeek-Web)',
            created: 1729555200,
            owned_by: 'anthropic-alias',
          },
        ],
      }));
      return;
    }

    // 3. Anthropic Messages API 端点 (Claude Code 直连)
    if (req.method === 'POST' && (urlPath === '/v1/messages' || urlPath === '/messages' || urlPath === '/v1/v1/messages')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        await handleAnthropicMessages(req, res, body);
      });
      return;
    }

    // 4. OpenAI Chat Completions 端点
    if (req.method === 'POST' && (urlPath === '/v1/chat/completions' || urlPath === '/chat/completions')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        await handleOpenAiChatCompletions(req, res, body);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Not Found: ${req.method} ${urlPath}` } }));
  });

  return server;
}

export function startServer(port: number = PROXY_CONFIG.PORT): http.Server {
  const server = createProxyServer();

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[ProxyServer] ⚠️ 端口 ${port} 已被占用，已有代理服务实例正在运行。`);
    } else {
      console.error(`[ProxyServer] ❌ 启动发生异常:`, err);
    }
  });

  server.listen(port, PROXY_CONFIG.HOST, () => {
    console.log(`================================================================`);
    console.log(`🚀 DeepSeek Web 高性能分层代理服务器已就绪!`);
    console.log(`🌐 监听地址: http://${PROXY_CONFIG.HOST}:${port}`);
    console.log(`🦊 Claude Code 兼容端点 (Anthropic): http://${PROXY_CONFIG.HOST}:${port}/v1/messages`);
    console.log(`🤖 OpenAI 兼容端点: http://${PROXY_CONFIG.HOST}:${port}/v1/chat/completions`);
    console.log(`🛡️ 六重防封保护已挂载:`);
    console.log(`   1. 真实 Chrome 132 浏览器指纹全模拟`);
    console.log(`   2. 智能会话复用 (防海量垃圾会话审计)`);
    console.log(`   3. 自适应高斯拟人化时间抖动 (Adaptive Pacing)`);
    console.log(`   4. 上下文过载智能折叠裁剪 (Context Budgeting)`);
    console.log(`   5. 429/403/人机滑块智能熔断器 (Circuit Breaker)`);
    console.log(`   6. WASM 算力加速与零拷贝内存池`);
    console.log(`💡 默认模型: ${PROXY_CONFIG.DEFAULT_MODEL} (深度思考), ${PROXY_CONFIG.FAST_MODEL} (极速对话)`);
    console.log(`================================================================`);
  });
  return server;
}

// 如果直接运行此脚本
if (require.main === module) {
  startServer();
}

