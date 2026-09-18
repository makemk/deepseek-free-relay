import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DeepSeekWebClient } from '../services/deepseekWebClient';
import { TokenStorage } from '../services/tokenStorage';
import { PresetManager } from '../services/presetManager';
import { EditorContext } from '../services/editorContext';
import { RateLimiter } from '../services/rateLimiter';
import { ClaudeConfigManager } from '../services/claudeConfigManager';
import { ChatMessage, EditorContextData } from '../types';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'deepseek.chatView';

  private view?: vscode.WebviewView;
  private currentAbortController?: AbortController;
  private currentSessionId?: string;
  private messageHistory: ChatMessage[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly tokenStorage: TokenStorage,
    private readonly webClient: DeepSeekWebClient,
    private readonly presetManager: PresetManager,
  ) {
    // 监听 Token 状态变化
    this.tokenStorage.onTokenStatusChanged((status) => {
      this.postMessage({
        command: status === 'expired' ? 'tokenExpired' : 'tokenValid',
      });
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this.handleWebviewMessage(data);
    });
  }

  /**
   * 处理 Webview 发送上来的事件
   */
  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'ready':
        this.postMessage({
          command: 'init',
          skills: this.presetManager.getSkills(),
          model: this.tokenStorage.getModel(),
          tokenStatus: this.tokenStorage.getStatus(),
          claudeEnabled: ClaudeConfigManager.getInstance().isEnabled(),
        });
        break;

      case 'sendMessage':
        await this.handleUserMessage(
          message.text,
          message.context,
          message.model,
          message.searchEnabled,
        );
        break;

      case 'stopGeneration':
        if (this.currentAbortController) {
          this.currentAbortController.abort();
          this.currentAbortController = undefined;
        }
        break;

      case 'newSession':
        this.currentSessionId = undefined;
        this.messageHistory = [];
        this.postMessage({ command: 'clearMessages' });
        vscode.window.showInformationMessage('已开启新的 DeepSeek 网页版对话会话。');
        break;

      case 'exportMarkdown':
        await this.exportSessionToMarkdown();
        break;

      case 'openSettings':
        await this.tokenStorage.promptSetUserToken();
        break;

      case 'openWeb':
        vscode.env.openExternal(vscode.Uri.parse('https://chat.deepseek.com'));
        break;

      case 'setToken':
        await this.tokenStorage.promptSetUserToken();
        break;

      case 'resumeCaptcha':
        RateLimiter.getInstance().resumeAfterChallenge();
        vscode.window.showInformationMessage('已解除滑块限制，继续执行任务。');
        break;

      case 'changeModel':
        await this.tokenStorage.setModel(message.model);
        break;

      case 'changeSearch':
        await this.tokenStorage.setSearchEnabled(message.enabled);
        break;

      case 'toggleClaudeConfig':
        await ClaudeConfigManager.getInstance().toggle();
        this.postMessage({
          command: 'claudeConfigStatus',
          enabled: ClaudeConfigManager.getInstance().isEnabled(),
        });
        break;

      case 'insertCode':
        await EditorContext.insertAtCursor(message.code);
        break;

      case 'replaceCode':
        await EditorContext.replaceSelection(message.code);
        break;

      case 'openNewFile':
        await EditorContext.openInNewFile(message.code, message.language);
        break;
    }
  }

  /**
   * 核心对话处理链路：网页版会话、Skill 预设、上下文注入、思考过程捕获
   */
  private async handleUserMessage(
    userText: string,
    context?: EditorContextData,
    overrideModel?: string,
    overrideSearch?: boolean,
  ): Promise<void> {
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    // 1. 检查是否触发了 / 技能命令
    let finalPrompt = userText;
    let systemInstruction = '';
    const matchSkill = this.presetManager.getSkills().find((s) =>
      userText.startsWith(s.command)
    );
    if (matchSkill) {
      systemInstruction = matchSkill.systemPrompt;
      const strippedText = userText.slice(matchSkill.command.length).trim();
      finalPrompt = (matchSkill.promptPrefix || '') + strippedText;
    }

    // 2. 注入编辑器上下文
    if (context && (context.fileName || context.selectedText)) {
      finalPrompt = EditorContext.buildContextPrompt(finalPrompt, context);
    }

    if (systemInstruction) {
      finalPrompt = `【系统预设要求】\n${systemInstruction}\n\n${finalPrompt}`;
    }

    const userMsgId = String(Date.now());
    this.messageHistory.push({
      id: userMsgId,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    });

    const streamCallbacks = {
      onReasoningChunk: (delta: string) => {
        this.postMessage({ command: 'streamReasoning', delta });
      },
      onTextChunk: (delta: string) => {
        this.postMessage({ command: 'streamText', delta });
      },
      onSpeedUpdate: (speed: number) => {
        this.postMessage({ command: 'streamSpeed', speed });
      },
      onFinished: (fullText: string, fullReasoning: string) => {
        this.messageHistory.push({
          id: String(Date.now()),
          role: 'assistant',
          content: fullText,
          reasoningContent: fullReasoning,
          timestamp: Date.now(),
        });
        this.postMessage({ command: 'streamFinished' });
        this.currentAbortController = undefined;
      },
      onError: (error: Error) => {
        this.postMessage({ command: 'streamError', error: error.message });
        this.currentAbortController = undefined;
      },
      onTokenExpired: () => {
        this.postMessage({ command: 'tokenExpired' });
        this.currentAbortController = undefined;
      },
      onCaptchaChallenge: () => {
        this.postMessage({ command: 'captchaChallenge' });
        this.currentAbortController = undefined;
      },
    };

    try {
      // 确保拥有远端会话 ID
      if (!this.currentSessionId) {
        this.currentSessionId = await this.webClient.createSession(signal);
      }

      await this.webClient.submitChat(
        this.currentSessionId,
        finalPrompt,
        {
          thinkingEnabled: (overrideModel ?? this.tokenStorage.getModel()) === 'deepseek-reasoner',
          searchEnabled: overrideSearch ?? this.tokenStorage.isSearchEnabled(),
          signal,
        },
        streamCallbacks,
      );
    } catch (err: any) {
      if (!signal.aborted) {
        streamCallbacks.onError(err);
      }
    }
  }

  /**
   * 从右键菜单或命令注入 Prompt 并触发对话
   */
  public async sendPromptWithContext(prompt: string, context?: EditorContextData): Promise<void> {
    if (this.view) {
      this.view.show(true);
      if (context) {
        this.postMessage({ command: 'setContext', context });
      }
      this.postMessage({ command: 'appendPrompt', prompt });
    }
  }

  /**
   * 导出当前会话为 Markdown
   */
  public async exportSessionToMarkdown(): Promise<void> {
    if (this.messageHistory.length === 0) {
      vscode.window.showInformationMessage('当前对话历史为空，无需导出。');
      return;
    }

    const lines: string[] = [
      '# DeepSeek 网页版对话导出',
      `*导出时间: ${new Date().toLocaleString()}*`,
      '',
    ];

    for (const msg of this.messageHistory) {
      const roleName = msg.role === 'user' ? '### 👤 用户' : '### 🐳 DeepSeek';
      lines.push(roleName);
      if (msg.reasoningContent) {
        lines.push('<details><summary>💡 深度思考过程</summary>\n');
        lines.push(msg.reasoningContent);
        lines.push('\n</details>\n');
      }
      lines.push(msg.content);
      lines.push('\n---\n');
    }

    const content = lines.join('\n');
    const defaultUri = vscode.workspace.workspaceFolders?.[0]
      ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, `deepseek-chat-${Date.now()}.md`)
      : undefined;

    const fileUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Markdown': ['md'] },
    });

    if (fileUri) {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(`已成功导出至: ${path.basename(fileUri.fsPath)}`);
    }
  }

  public clearChat(): void {
    this.currentSessionId = undefined;
    this.messageHistory = [];
    this.postMessage({ command: 'clearMessages' });
  }

  private postMessage(message: any): void {
    this.view?.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'chat.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css')
    );
    const scriptsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js')
    );

    html = html.replace('{{stylesUri}}', stylesUri.toString());
    html = html.replace('{{scriptsUri}}', scriptsUri.toString());

    return html;
  }
}
