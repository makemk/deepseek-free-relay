import * as vscode from 'vscode';
import { TokenStorage } from './services/tokenStorage';
import { DeepSeekWebClient } from './services/deepseekWebClient';
import { PresetManager } from './services/presetManager';
import { ProxyManager } from './services/proxyManager';
import { ClaudeConfigManager } from './services/claudeConfigManager';
import { UpdateManager } from './services/updateManager';
import { ChatViewProvider } from './providers/chatViewProvider';
import { registerEditorCommands } from './commands/editorCommands';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  // 1. 初始化核心单例服务
  const tokenStorage = new TokenStorage(context);
  const webClient = new DeepSeekWebClient(tokenStorage, context.extensionPath);
  const presetManager = new PresetManager(context);
  const proxyManager = ProxyManager.getInstance();
  const claudeConfigManager = ClaudeConfigManager.getInstance();
  const updateManager = UpdateManager.getInstance(context);

  // 2. 注册 Webview 侧边栏
  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    tokenStorage,
    webClient,
    presetManager,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 3. 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek.openChat', async () => {
      await vscode.commands.executeCommand('deepseek.chatView.focus');
    }),
    vscode.commands.registerCommand('deepseek.setToken', async () => {
      await tokenStorage.promptSetUserToken();
      updateStatusBar(tokenStorage);
    }),
    vscode.commands.registerCommand('deepseek.newSession', async () => {
      await vscode.commands.executeCommand('deepseek.chatView.focus');
      chatProvider.clearChat();
    }),
    vscode.commands.registerCommand('deepseek.exportMarkdown', async () => {
      await chatProvider.exportSessionToMarkdown();
    }),
    vscode.commands.registerCommand('deepseek.clearChat', () => {
      chatProvider.clearChat();
    }),
    vscode.commands.registerCommand('deepseek.startProxy', async () => {
      const token = await tokenStorage.getUserToken();
      proxyManager.restart(context.extensionPath, token);
    }),
    vscode.commands.registerCommand('deepseek.stopProxy', () => {
      proxyManager.stop();
    }),
    vscode.commands.registerCommand('deepseek.enableClaudeConfig', async () => {
      await claudeConfigManager.enable();
      updateStatusBar(tokenStorage);
    }),
    vscode.commands.registerCommand('deepseek.disableClaudeConfig', async () => {
      await claudeConfigManager.disable();
      updateStatusBar(tokenStorage);
    }),
    vscode.commands.registerCommand('deepseek.toggleClaudeConfig', async () => {
      await claudeConfigManager.toggle();
      updateStatusBar(tokenStorage);
    }),
    vscode.commands.registerCommand('deepseek.checkForUpdates', async () => {
      await updateManager.checkForUpdates(true);
    }),
    vscode.commands.registerCommand('deepseek.setUpdateUrl', async () => {
      await updateManager.promptSetUpdateUrl();
    })
  );

  // 4. 注册右键菜单场景命令
  registerEditorCommands(context, chatProvider);

  // 5. 根据配置自动拉起本地 9999 端口代理（服务 Claude Code）
  const autoStart = vscode.workspace.getConfiguration('deepseek').get<boolean>('autoStartProxy', true);
  if (autoStart) {
    tokenStorage.getUserToken().then((token) => {
      proxyManager.start(context.extensionPath, token);
    });
  }

  // 6. 创建状态栏项 (显示网页版 Token 状态与代理状态)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'deepseek.statusMenu';
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek.statusMenu', async () => {
      const isClaudeEnabled = claudeConfigManager.isEnabled();
      const choice = await vscode.window.showQuickPick([
        {
          label: isClaudeEnabled ? '$(check) 关闭 Claude Code 直连配置' : '$(plug) 开启 Claude Code 直连配置 (.claude/settings.local.json)',
          detail: isClaudeEnabled ? '从当前工作区配置文件中移除代理配置，恢复官方默认' : '一键写入 .claude/settings.local.json，无需环境变量即可直连 DeepSeek-Web',
          action: 'toggleClaude',
        },
        {
          label: `$(cloud-download) 检查插件更新 (当前: v${updateManager.getCurrentVersion()})`,
          detail: `检查新版本并支持一键下载安装 (更新源: ${updateManager.getUpdateUrl()})`,
          action: 'checkUpdate',
        },
        {
          label: '$(gear) 配置更新源地址',
          detail: '自定义 GitHub 仓库、Release API 链接或版本 JSON 接口',
          action: 'setUpdateUrl',
        },
        {
          label: '$(key) 配置网页版 UserToken',
          detail: '配置或更新 chat.deepseek.com 的 userToken (免 API 费用)',
          action: 'setToken',
        },
        {
          label: '$(server) 启动 / 重启本地代理服务 (端口: 9999)',
          detail: '为 Claude Code 提供 http://127.0.0.1:9999 端点',
          action: 'startProxy',
        },
        {
          label: '$(link-external) 打开 DeepSeek 网页版 (获取凭证)',
          detail: '在默认浏览器中打开 chat.deepseek.com',
          action: 'openWeb',
        },
        {
          label: '$(comment-discussion) 打开 DeepSeek 对话侧边栏',
          detail: '展开 AI 辅助编程工作台',
          action: 'openChat',
        },
      ]);

      if (choice) {
        if (choice.action === 'toggleClaude') {
          await claudeConfigManager.toggle();
          updateStatusBar(tokenStorage);
        } else if (choice.action === 'checkUpdate') {
          await updateManager.checkForUpdates(true);
        } else if (choice.action === 'setUpdateUrl') {
          await updateManager.promptSetUpdateUrl();
        } else if (choice.action === 'setToken') {
          await tokenStorage.promptSetUserToken();
          updateStatusBar(tokenStorage);
        } else if (choice.action === 'startProxy') {
          const token = await tokenStorage.getUserToken();
          proxyManager.restart(context.extensionPath, token);
        } else if (choice.action === 'openWeb') {
          vscode.env.openExternal(vscode.Uri.parse('https://chat.deepseek.com'));
        } else if (choice.action === 'openChat') {
          await vscode.commands.executeCommand('deepseek.chatView.focus');
        }
      }
    })
  );

  // 7. 启动时自动检查更新 (延迟 4 秒执行，静默无干扰)
  if (updateManager.isAutoCheckEnabled()) {
    setTimeout(() => {
      updateManager.checkForUpdates(false);
    }, 4000);
  }

  tokenStorage.onTokenStatusChanged(() => {
    updateStatusBar(tokenStorage);
  });

  updateStatusBar(tokenStorage);
  statusBarItem.show();
}

function updateStatusBar(tokenStorage: TokenStorage): void {
  const status = tokenStorage.getStatus();
  const claudeEnabled = ClaudeConfigManager.getInstance().isEnabled();
  const claudeSuffix = claudeEnabled ? ' [Claude Code 已配置]' : '';

  if (status === 'expired') {
    statusBarItem.text = `$(alert) DeepSeek (Token 过期)${claudeSuffix}`;
    statusBarItem.tooltip = 'DeepSeek 网页版 UserToken 已过期，点击重新配置';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (status === 'missing') {
    statusBarItem.text = `$(key) DeepSeek (未配 Token)${claudeSuffix}`;
    statusBarItem.tooltip = '点击配置网页版 UserToken 即可开始免费使用 (代理端口: 9999)';
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(hubot) DeepSeek-Web (9999 代理就绪)${claudeSuffix}`;
    statusBarItem.tooltip = 'DeepSeek 网页版已就绪，Claude Code 已可通过 .claude/settings.local.json 直连';
    statusBarItem.backgroundColor = undefined;
  }
}

export function deactivate(): void {
  ProxyManager.getInstance().stop();
}
