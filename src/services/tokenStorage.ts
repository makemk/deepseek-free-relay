import * as vscode from 'vscode';
import { TokenStatus } from '../types';

const SECRET_KEY_USER_TOKEN = 'deepseek.userToken';

export class TokenStorage {
  private secrets: vscode.SecretStorage;
  private extensionPath: string;
  private _onTokenStatusChanged = new vscode.EventEmitter<TokenStatus>();
  public readonly onTokenStatusChanged = this._onTokenStatusChanged.event;
  private currentStatus: TokenStatus = 'missing';

  constructor(context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
    this.extensionPath = context.extensionPath;
    this.initStatus();
  }

  private async initStatus(): Promise<void> {
    const token = await this.getUserToken();
    if (!token) {
      this.currentStatus = 'missing';
    } else if (this.isJwtExpired(token)) {
      this.currentStatus = 'expired';
    } else {
      this.currentStatus = 'valid';
      this.syncTokenToLocalConfig(token);
    }
  }

  public getStatus(): TokenStatus {
    return this.currentStatus;
  }

  public setStatus(status: TokenStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this._onTokenStatusChanged.fire(status);
    }
  }

  public async getUserToken(): Promise<string | undefined> {
    const token = await this.secrets.get(SECRET_KEY_USER_TOKEN);
    if (token) {
      this.syncTokenToLocalConfig(token);
    }
    return token;
  }

  public async setUserToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (trimmed) {
      await this.secrets.store(SECRET_KEY_USER_TOKEN, trimmed);
      this.setStatus(this.isJwtExpired(trimmed) ? 'expired' : 'valid');
      this.syncTokenToLocalConfig(trimmed);
    } else {
      await this.secrets.delete(SECRET_KEY_USER_TOKEN);
      this.setStatus('missing');
      this.syncTokenToLocalConfig('');
    }
  }

  public syncTokenToLocalConfig(token: string): void {
    if (!token) return;
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      // 1. 写入用户主目录 ~/.deepseek_token.json (供本地所有代理与测试进程直接读取)
      const homePath = path.join(os.homedir(), '.deepseek_token.json');
      let existingHome: any = {};
      if (fs.existsSync(homePath)) {
        try {
          existingHome = JSON.parse(fs.readFileSync(homePath, 'utf-8'));
        } catch {}
      }
      const updateUrl = vscode.workspace.getConfiguration('deepseek').get<string>('updateUrl', 'https://github.com/makemk/deepseek-free-relay');
      const payload = {
        ...existingHome,
        userToken: token,
        updateUrl: updateUrl || 'https://github.com/makemk/deepseek-free-relay',
      };
      fs.writeFileSync(homePath, JSON.stringify(payload, null, 2), 'utf-8');

      // 2. 写入插件所在目录 config.json
      if (this.extensionPath) {
        const extConfigPath = path.join(this.extensionPath, 'config.json');
        fs.writeFileSync(extConfigPath, JSON.stringify(payload, null, 2), 'utf-8');
      }

      // 3. 写入当前打开的工作区根目录 config.json
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const wsConfigPath = path.join(workspaceRoot, 'config.json');
        fs.writeFileSync(wsConfigPath, JSON.stringify(payload, null, 2), 'utf-8');
      }
    } catch {
      // 忽略写入失败
    }
  }

  public getModel(): string {
    const config = vscode.workspace.getConfiguration('deepseek');
    return config.get<string>('model', 'deepseek-web');
  }

  public async setModel(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('deepseek');
    await config.update('model', model, vscode.ConfigurationTarget.Global);
  }

  public isSearchEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('deepseek');
    return config.get<boolean>('searchEnabled', false);
  }

  public async setSearchEnabled(enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('deepseek');
    await config.update('searchEnabled', enabled, vscode.ConfigurationTarget.Global);
  }

  public isDefaultThinkingOpen(): boolean {
    const config = vscode.workspace.getConfiguration('deepseek');
    return config.get<boolean>('defaultThinkingOpen', true);
  }

  /**
   * 检查 JWT 令牌是否已经在本地时间戳上过期
   */
  private isJwtExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload && typeof payload.exp === 'number') {
        return Date.now() >= payload.exp * 1000;
      }
    } catch {
      // 非标准 JWT 或解析失败，交由服务端校验
    }
    return false;
  }

  /**
   * 处理 401 Unauthorized 认证失效，向用户展示直观的处理流程
   */
  public async handleUnauthorized(): Promise<void> {
    this.setStatus('expired');
    const action = await vscode.window.showErrorMessage(
      'DeepSeek 网页版凭证 (userToken) 已过期或失效，请重新登录网页获取最新凭据。',
      '在浏览器打开网页',
      '更新 UserToken',
    );

    if (action === '在浏览器打开网页') {
      vscode.env.openExternal(vscode.Uri.parse('https://chat.deepseek.com'));
    } else if (action === '更新 UserToken') {
      await this.promptSetUserToken();
    }
  }

  /**
   * 弹出引导输入网页版 UserToken 的交互弹窗
   */
  public async promptSetUserToken(): Promise<string | undefined> {
    const current = await this.getUserToken();
    const token = await vscode.window.showInputBox({
      title: '配置 DeepSeek 网页版 UserToken (免 API 额度)',
      prompt: '步骤：1. 浏览器打开 chat.deepseek.com 登录 -> 2. 按 F12 打开控制台 -> 3. Application/应用程序 -> Local Storage -> 复制 userToken 的值',
      value: current || '',
      password: true,
      placeHolder: '例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      ignoreFocusOut: true,
    });

    if (token !== undefined) {
      await this.setUserToken(token);
      if (token.trim()) {
        vscode.window.showInformationMessage('DeepSeek 网页版 UserToken 保存成功！');
      } else {
        vscode.window.showInformationMessage('DeepSeek 网页版 UserToken 已清除。');
      }
    }
    return token;
  }
}
