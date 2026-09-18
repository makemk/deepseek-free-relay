#!/usr/bin/env node
/**
 * DeepSeek Web 本地代理服务器执行入口 (端口: 9999)
 * 启动高性能分层代理服务 (集成六重防封号体系与 Claude Code Agent 工具转译引擎)
 */

const path = require('path');
const fs = require('fs');

const distServer = path.join(__dirname, '..', 'dist', 'proxy-server.js');

if (!fs.existsSync(distServer)) {
  console.error('[FATAL] 未找到编译产物: ' + distServer);
  console.error('请先在插件目录执行: npm run compile');
  process.exit(1);
}

const { startServer } = require(distServer);
startServer();
