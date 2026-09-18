# 更新日志 (Changelog)

本项目遵循 [Semantic Versioning (语义化版本规范)](https://semver.org/lang/zh-CN/)。

---

## [1.2.0] - 2026-09-18

### 🚀 核心修复与性能突破 (Critical Fixes & Robustness)

- **彻底修复流式增量解码与空回复死循环 (Stream Decoder)**
  - 深度适配 DeepSeek 网页端最新 SSE 协议中以分段增量下发的 `response/content` 与 `response/thinking_content` 数据结构。
  - 彻底杜绝因内容未正确解包导致的“空回复”假死现象，消除客户端陷入 `（服务连接已恢复就绪，请继续发送您的指令）` 的无响应死循环。

- **增强 Agent / Task 子任务工具参数鲁棒性 (Tool Parser)**
  - 修复 Claude Code 派发并发子任务时 `description` 字段类型异常（或缺失）导致 Zod schema 校验失败的问题。
  - 重构提取算法，独立解析并清洗 `description` 与 `prompt` 参数，增加类型兜底，确保 100% 符合终端 Agent 的参数规范。
  - 智能清除模型输出尾部未闭合的残余 XML 标签（如 `</tool_call>` 等），杜绝语法污染。

- **固化原生全网搜索与防暴力爬虫 (Prompt & Behavior Guidance)**
  - 系统级强化模型对 DeepSeek 网页端原生搜索能力的自我感知。
  - 严厉禁止终端调用 `curl`、`wget` 等底层命令暴力爬取网页，强制引导走网页端原生搜索管道，保障爬取质量与格式规整。
  - 针对子任务完成节点注入明确汇报锚点，子任务交付后直接向用户呈现结构化中文成果汇总，杜绝反复输出空指令。

- **超大 Payload 与高难度 PoW 防风控调优 (Payload & PoW)**
  - 将提示词防风控折叠阈值 `MAX_PROMPT_CHARS` 由 35,000 上调至 60,000，完美兼容多子任务合并返回的长篇技术报告。
  - 杜绝长文本误触 DeepSeek 144,000 级超高难度 PoW 阻断算法，大幅降低解算延迟与超时失败率。

- **Claude Code 上下文自动压缩 (/compact) 与窗口标定**
  - 在 `.claude/settings.local.json` 中原生注入 `CLAUDE_CODE_MAX_CONTEXT_TOKENS: 64000` 与 `CLAUDE_CODE_AUTO_COMPACT_WINDOW: 45000`。
  - 无缝联动 Claude Code 内部上下文自动压缩机制，达到 45k 预算时自动归纳历史，保障超长任务平稳运行不撞 64k 物理天花板。

---

## [1.1.0] - 2026-09-17

### 🌟 新增特性与防封号重构

- **Claude Code 原生 Agent 工具转译引擎**：
  - 本地 9999 代理端口提供与 Anthropic Messages 协议完全兼容的转换层。
  - 实时转译 Bash, FileEdit, Glob, Grep, Read 等工具调用，在流式数据传输中即时拦截与封装 `tool_use` 事件。
- **六重全方位防封号体系**：
  - Chrome 132 真实浏览器指纹注入（Sec-CH-UA, Client Hints）。
  - 智能会话复用（杜绝后台遗留大量垃圾会话）。
  - 高斯分布拟人化随机延迟抖动。
  - 终端超长日志智能折叠裁剪。
  - 429/403/滑块人机风控熔断器。
  - 原生 WebAssembly (WASM) 算力加速与零拷贝内存池。
- **自动化更新服务**：
  - 支持从 GitHub Release 或自定义源静默检测新版本并一键热重载。

---

## [1.0.0] - 2026-09-16

### 🚀 初始版本发布

- VS Code 侧边栏网页端免 API 费用直连体验。
- 完整支持 R1 深度思考推导过程折叠展示与生成测速。
- 编辑器右键一键解释代码、重构优化、查修 Bug 与单元测试。
