# DeepSeek Free Relay (网页版桥接 & VS Code 插件)

> 🚀 **开源主页**：[https://github.com/makemk/deepseek-free-relay](https://github.com/makemk/deepseek-free-relay)

在 VS Code 与 Claude Code 中直接无缝接入 **DeepSeek 网页版 (chat.deepseek.com)**，**免 API 充值与额度消耗**，直接使用深度思考推理与极速对话模型（统一使用 `-web` 后缀，无需填写版本号），支持实时全网搜索、预设技能工作台、代码一键应用与右键审查，并为 **Claude Code** 提供一键直连代理与**「Agent 终端命令行自动执行引擎」**！

部分核心特性与设计参考自优秀开源项目 [deepseek-pp (DeepSeek++)](https://github.com/zhu1090093659/deepseek-pp)。

---

## 🌟 核心特性

1. **零成本使用 DeepSeek 网页端能力**：
   - 直连官方网页端会话，免去平台充值和 API 峰值限流困扰。
   - 完整支持 **深度思考推理**（思维推导全过程可视化）与 **联网搜索**。
   - **极简模型命名**：无繁琐版本号，统一采用 `-web` 后缀（`deepseek-web` 深度思考 / `deepseek-chat-web` 极速对话）。
2. **Claude Code 原生 Agent 工具转译引擎**：
   - 本地 9999 代理搭载专为 Claude Code 设计的 **Agent 工具转译引擎**：将 Claude Code 的工具定义（`Bash`, `FileEdit`, `GlobTool` 等）自动转译为严格的 XML 工具调用指令。
   - **流式实时拦截**：在数据流中实时剥离 XML 标签，封装为 Anthropic 原生 `tool_use` 事件并触发终端执行，**实现全自动终端敲命令与多轮持续推进任务**！
3. **六重全方位防封号与反风控保护体系**：
   - 🛡️ **真实 Chrome 132 浏览器指纹全模拟**：精确注入现代浏览器的 `Sec-CH-UA`、`Sec-Fetch-*`、`Accept-Language` 等 Client Hints 特征。
   - ♻️ **智能会话复用 (Smart Session Reuse)**：杜绝每轮调用新建会话而在后台留下海量垃圾会话的高危特征。
   - 🎲 **自适应高斯拟人化时间抖动 (Adaptive Pacing)**：打破机械式固定间隔，通过正态分布随机抖动模拟真人思考与交互节奏。
   - ✂️ **超长输出智能折叠裁剪 (Payload Sanitizer)**：针对 `git log` 等万字终端输出自动进行首尾保留折叠，防超大 Payload 审计。
   - 🚨 **429/403/人机滑块智能熔断器 (Circuit Breaker)**：遭遇风控即刻熔断阻断盲目撞墙，留出人工验证窗口，守护账号绝对安全。
   - ⚡ **WASM 算力加速与零拷贝内存池**：官方同款 `DeepSeekHashV1` 原生 WebAssembly 并发解算，不堵塞主线程。
4. **高性能模块化分层架构**：
   - 代理核心解耦为 `security`、`pow`、`session`、`agent`、`protocols` 等清晰子模块，充分释放高性能宿主机算力。
5. **深度思考思维链可视化**：
   - 独立可折叠卡片展示深度思考与多步推导链条。
   - 实时生成速度检测（`tok/s`），生成完毕自动折叠保持编辑区清爽。
6. **编辑器原生深度集成**：
   - **选中文本右键菜单**：解释代码 (`/explain`)、重构优化 (`/refactor`)、排查修复 Bug (`/bugfix`)、生成单元测试 (`/test`)、规范注释文档 (`/doc`)。
   - **代码块便捷操作**：插入到光标处、替换当前选中、新建文件打开、复制代码。
7. **Token 生命周期与失效保护**：
   - 针对网页端 `userToken` 的有效期刷新机制，自动捕获 `401 Unauthorized` 认证失效，插件顶部提供醒目的一键重登提示。

---

## 📖 技术与防封文档

- 🏛️ [DeepSeek Web 高性能分层架构与全方位防封号防护指南 (docs/ARCHITECTURE_AND_ANTI_BAN.md)](file:///c:/Users/J03378/Documents/vscode_env/vscode-deepseek-web/docs/ARCHITECTURE_AND_ANTI_BAN.md)
- 🛠️ [Claude Code 直连 DeepSeek Web 代理技术全解与避坑排障指南 (docs/CLAUDE_CODE_INTEGRATION_AND_TROUBLESHOOTING.md)](file:///c:/Users/J03378/Documents/vscode_env/vscode-deepseek-web/docs/CLAUDE_CODE_INTEGRATION_AND_TROUBLESHOOTING.md)

---

## 🚀 快速上手

### 第一步：获取网页版 UserToken（只需一次，免 API 费用）

1. 在浏览器中打开 [chat.deepseek.com](https://chat.deepseek.com) 并登录您的账号。
2. 按快捷键 `F12`（或右键点击“检查”）打开开发者工具。
3. 点击顶部标签页中的 **Application（应用程序）**（若未显示可在 `>>` 更多图标中找到）。
4. 在左侧面板展开 **Storage -> Local Storage**，点击 `https://chat.deepseek.com`。
5. 在右侧列表中找到 Key 为 `userToken` 的项，双击它的 Value 并完整复制（形如 `eyJhbGciOi...`）。

### 第二步：在 VS Code 中配置凭证

1. 在 VS Code 中按下 `Ctrl+Shift+P` (Mac 上为 `Cmd+Shift+P`) 打开命令面板。
2. 输入并执行：`DeepSeek: 配置网页版 UserToken`。
3. 将刚才复制的 `userToken` 粘贴并回车，凭证将通过 VS Code 原生 `SecretStorage` 安全加密存储。

### 第三步：开始在 VS Code 中使用

- 点击 VS Code 左侧活动栏（Activity Bar）的 **🐳 DeepSeek Web** 图标，打开对话窗口。
- 在编辑器中选中任何代码段，点击鼠标右键即可直接调用解释、重构或测试！

---

## 💻 如何在 Claude Code 中使用（终端全自动 Agent）

Claude Code 是 Anthropic 官方推出的命令行代码 Agent。本插件内置的高性能代理服务（默认端口 **9999**）原生实现了 Anthropic Messages 协议与工具转译引擎。

### 插件一键开启 / 关闭配置（极简使用）

只需在 VS Code 中选择以下任意一种方式即可一键开启：

1. **侧边栏一键切换**：在 DeepSeek 侧边栏顶部，点击 **`⚡ Claude`** 按钮即可一键开启/关闭。
2. **状态栏菜单切换**：点击 VS Code 右下角的状态栏 `$(hubot) DeepSeek-Web`，选择 **【开启 / 关闭 Claude Code 直连配置】**。
3. **命令面板切换**：按 `Ctrl+Shift+P`，输入并执行：
   - `DeepSeek: 一键开启 Claude Code 直连配置 (.claude/settings.local.json)`
   - `DeepSeek: 一键关闭 Claude Code 直连配置`

开启后，插件会自动在当前项目根目录写入或更新 `.claude/settings.local.json`：

```json
{
  "allowedTools": ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "Skill", "Agent", "Task"],
  "permissions": { "defaultMode": "bypassPermissions" },
  "autoCompactWindow": 45000,
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:9999",
    "ANTHROPIC_AUTH_TOKEN": "dummy",
    "ANTHROPIC_MODEL": "deepseek-chat-web",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "64000",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "45000",
    "DEEPSEEK_ENABLE_SEARCH": "true"
  },
  "model": "deepseek-chat-web"
}
```

> **提示**：
> - 写入时会**完整保留您现有的自定义字段**，绝不破坏原有配置。
> - **上下文自动压缩 (/compact)**：配置将 DeepSeek 上下文窗口标定为 64k tokens，并在达到 45,000 tokens 时自动调用 Claude Code 内部 `/compact` 机制浓缩历史，保证超长对话流畅不超时。
> - 配置好后，在项目目录下直接运行 `claude` 即可，**无需在终端每次手动输入长环境变量**！
> - 您可以直接输入如 *“帮我查看项目结构并运行测试”*，Claude Code 将通过 DeepSeek 网页端在你的本地终端**全自动执行命令**！

---

## ⚙️ 插件设置项

在 VS Code 的 `设置 (Settings)` 中搜索 `deepseek` 可配置：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `deepseek.model` | `deepseek-web` | 默认模型：`deepseek-web` (深度思考) 或 `deepseek-chat-web` (极速对话) |
| `deepseek.searchEnabled` | `false` | 是否默认开启联网搜索功能 |
| `deepseek.autoStartProxy` | `true` | VS Code 启动时是否自动在后台运行本地 9999 代理服务 |
| `deepseek.updateUrl` | `https://github.com/makemk/deepseek-free-relay` | 自定义更新源（支持 GitHub 仓库、API 链接或版本 JSON 接口） |
| `deepseek.autoCheckUpdates` | `true` | 是否在 VS Code 启动时自动静默检查插件更新 |
| `deepseek.toolPacingIntervalMs` | `2000` | 自动化连续请求之间的安全平滑基准间隔（毫秒） |
| `deepseek.defaultThinkingOpen` | `true` | 深度思考过程在生成中是否默认展开 |

---

## 🔄 插件自动更新与自定义更新地址

1. **一键检查更新**：
   - 按快捷键 `Ctrl+Shift+P` 打开命令面板，输入并执行：`DeepSeek: 检查插件更新 (Check for Updates)`。
   - 或者点击 VS Code 右下角状态栏的 DeepSeek 图标，在菜单中选择 **`$(cloud-download) 检查插件更新`**。
   - 发现新版本后将自动弹出对话框，支持一键下载安装 `.vsix` 并重载窗口。
2. **自定义更新源**：
   - 默认使用官方 GitHub 仓库：`https://github.com/makemk/deepseek-free-relay`。
   - 用户可在 VS Code 设置中搜索 `deepseek.updateUrl`，或在状态栏菜单选择 **`$(gear) 配置更新源地址`**，填入自己的 GitHub 仓库或企业内网镜像版本 JSON 地址。

---

## 🛠️ 本地开发与重新打包

```bash
# 1. 编译 TypeScript 与代理核心
npm run compile

# 2. 打包生成 .vsix 安装包
npx @vscode/vsce package --no-dependencies

# 3. 安装/更新到当前 VS Code
code --install-extension deepseek-free-relay-1.1.0.vsix --force
```
