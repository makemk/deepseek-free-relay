import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const DEFAULT_GITHUB_REPO_URL = 'https://github.com/makemk/deepseek-free-relay';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  isNewer: boolean;
  releaseNotes?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  publishedAt?: string;
}

export class UpdateManager {
  private static instance: UpdateManager;
  private context: vscode.ExtensionContext;
  private currentVersion: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.currentVersion = context.extension?.packageJSON?.version || '1.2.0';
  }

  public static getInstance(context?: vscode.ExtensionContext): UpdateManager {
    if (!UpdateManager.instance && context) {
      UpdateManager.instance = new UpdateManager(context);
    }
    return UpdateManager.instance;
  }

  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * 获取当前配置的更新地址（如未配置或为空则使用默认 GitHub 仓库地址）
   */
  public getUpdateUrl(): string {
    const config = vscode.workspace.getConfiguration('deepseek');
    const configuredUrl = config.get<string>('updateUrl', '').trim();
    return configuredUrl || DEFAULT_GITHUB_REPO_URL;
  }

  /**
   * 设置更新地址
   */
  public async setUpdateUrl(url: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('deepseek');
    await config.update('updateUrl', url.trim(), vscode.ConfigurationTarget.Global);
  }

  /**
   * 弹出输入框供用户快捷配置更新源
   */
  public async promptSetUpdateUrl(): Promise<void> {
    const current = this.getUpdateUrl();
    const result = await vscode.window.showInputBox({
      title: '配置 DeepSeek Web 插件更新地址',
      prompt: '支持 GitHub 仓库链接（如 https://github.com/deepseek/vscode-deepseek-web ）、Release API 链接或自定义版本 JSON 地址。留空恢复默认。',
      value: current === DEFAULT_GITHUB_REPO_URL ? '' : current,
      placeHolder: DEFAULT_GITHUB_REPO_URL,
    });

    if (result !== undefined) {
      const targetUrl = result.trim();
      await this.setUpdateUrl(targetUrl);
      const displayUrl = targetUrl || DEFAULT_GITHUB_REPO_URL;
      vscode.window.showInformationMessage(`已设置更新地址为: ${displayUrl}`);
    }
  }

  /**
   * 是否开启启动时自动检查更新
   */
  public isAutoCheckEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('deepseek');
    return config.get<boolean>('autoCheckUpdates', true);
  }

  /**
   * 将用户填写的各类 URL 规范化为可供 HTTP 请求的端点
   * 1. GitHub 仓库主页: https://github.com/:owner/:repo -> https://api.github.com/repos/:owner/:repo/releases/latest
   * 2. GitHub Releases 页面: https://github.com/:owner/:repo/releases -> https://api.github.com/repos/:owner/:repo/releases/latest
   * 3. 其它原生 API 或自定义 JSON 地址 -> 原样使用
   */
  public normalizeUpdateUrl(inputUrl: string): string {
    let url = (inputUrl || '').trim();
    if (!url) {
      url = DEFAULT_GITHUB_REPO_URL;
    }

    // 匹配类似 https://github.com/owner/repo 或 https://github.com/owner/repo/
    const githubRepoRegex = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\/(?:releases(?:\/latest)?)?)?\/?$/i;
    const match = url.match(githubRepoRegex);
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/i, '');
      return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    }

    return url;
  }

  /**
   * 语义化版本比对 (SemVer Comparison)
   * 返回 > 0 表示 versionA > versionB (有更新)
   * 返回 = 0 表示版本相同
   * 返回 < 0 表示 versionA < versionB
   */
  public static compareVersions(versionA: string, versionB: string): number {
    const cleanA = (versionA || '').trim().replace(/^[vV]/, '');
    const cleanB = (versionB || '').trim().replace(/^[vV]/, '');

    const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
    const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

    const maxLength = Math.max(partsA.length, partsB.length, 3);
    for (let i = 0; i < maxLength; i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  /**
   * 请求远程更新源并解析版本元数据
   */
  public async fetchUpdateInfo(): Promise<UpdateInfo> {
    const rawUrl = this.getUpdateUrl();
    const endpoint = this.normalizeUpdateUrl(rawUrl);

    const headers: Record<string, string> = {
      'User-Agent': 'VSCode-DeepSeek-Web-Updater/1.2.0 (VSCode Extension)',
      'Accept': 'application/vnd.github.v3+json, application/json;q=0.9, */*;q=0.8',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(endpoint, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data: any = await res.json();

      let remoteVersion = '';
      let releaseNotes = '';
      let releaseUrl = '';
      let downloadUrl = '';
      let publishedAt = '';

      if (data && typeof data === 'object') {
        // 1. 标准 GitHub Release 结构
        if (data.tag_name || data.name) {
          remoteVersion = (data.tag_name || data.name || '').replace(/^[vV]/, '').trim();
          releaseNotes = data.body || '';
          releaseUrl = data.html_url || '';
          publishedAt = data.published_at || '';

          // 从 assets 中查找 .vsix 文件下载地址
          if (Array.isArray(data.assets)) {
            const vsixAsset = data.assets.find(
              (asset: any) =>
                asset &&
                typeof asset.name === 'string' &&
                asset.name.toLowerCase().endsWith('.vsix')
            );
            if (vsixAsset && vsixAsset.browser_download_url) {
              downloadUrl = vsixAsset.browser_download_url;
            }
          }
        }
        // 2. 自定义 JSON 结构 (e.g. { version, downloadUrl, notes, releaseUrl })
        else if (data.version) {
          remoteVersion = String(data.version).replace(/^[vV]/, '').trim();
          releaseNotes = data.notes || data.description || '';
          releaseUrl = data.releaseUrl || data.url || '';
          downloadUrl = data.downloadUrl || data.vsixUrl || '';
          publishedAt = data.publishedAt || '';
        }
      }

      if (!remoteVersion) {
        throw new Error('未能从更新服务器解析出有效的版本号');
      }

      const isNewer = UpdateManager.compareVersions(remoteVersion, this.currentVersion) > 0;

      return {
        version: remoteVersion,
        currentVersion: this.currentVersion,
        isNewer,
        releaseNotes,
        releaseUrl,
        downloadUrl,
        publishedAt,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('检查更新请求超时 (12秒)');
      }
      throw err;
    }
  }

  /**
   * 检查更新入口
   * @param manual 是否由用户手动点击触发（手动触发时即使没有更新也会弹出提示，自动触发则静默无打扰）
   */
  public async checkForUpdates(manual: boolean = false): Promise<void> {
    if (manual) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在检查 DeepSeek Web 更新...',
          cancellable: false,
        },
        async () => {
          await this.doCheck(true);
        }
      );
    } else {
      await this.doCheck(false);
    }
  }

  private async doCheck(manual: boolean): Promise<void> {
    try {
      const updateInfo = await this.fetchUpdateInfo();

      if (updateInfo.isNewer) {
        await this.promptUserForUpdate(updateInfo);
      } else {
        if (manual) {
          vscode.window.showInformationMessage(
            `当前已是最新版本 (v${this.currentVersion})。更新源: ${this.getUpdateUrl()}`
          );
        }
      }
    } catch (err: any) {
      if (manual) {
        const setUrlAction = '配置更新源';
        const choice = await vscode.window.showErrorMessage(
          `检查更新失败: ${err.message}`,
          setUrlAction
        );
        if (choice === setUrlAction) {
          await this.promptSetUpdateUrl();
        }
      } else {
        // 静默模式下记录警告，不弹窗打扰用户
        console.warn('[DeepSeek Update] 自动检查更新失败:', err.message);
      }
    }
  }

  /**
   * 发现新版本时提示用户
   */
  private async promptUserForUpdate(updateInfo: UpdateInfo): Promise<void> {
    const hasDirectDownload = !!updateInfo.downloadUrl;
    const actions: string[] = [];

    if (hasDirectDownload) {
      actions.push('立即更新');
    }
    if (updateInfo.releaseUrl) {
      actions.push('查看发布说明');
    }
    actions.push('稍后提醒');

    let summary = `发现 DeepSeek Web 新版本 v${updateInfo.version} (当前: v${updateInfo.currentVersion})`;
    if (updateInfo.releaseNotes) {
      const previewNotes = updateInfo.releaseNotes.split('\n').slice(0, 3).join(' ');
      if (previewNotes) {
        summary += `\n${previewNotes.slice(0, 100)}...`;
      }
    }

    const choice = await vscode.window.showInformationMessage(summary, ...actions);

    if (choice === '立即更新' && updateInfo.downloadUrl) {
      await this.downloadAndInstallVsix(updateInfo.downloadUrl, updateInfo.version);
    } else if (choice === '查看发布说明' && updateInfo.releaseUrl) {
      vscode.env.openExternal(vscode.Uri.parse(updateInfo.releaseUrl));
    }
  }

  /**
   * 下载并直接通过 VS Code 安装 VSIX 扩展包
   */
  public async downloadAndInstallVsix(downloadUrl: string, targetVersion: string): Promise<void> {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `vscode-deepseek-web-${targetVersion}.vsix`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `正在下载 DeepSeek Web v${targetVersion}...`,
          cancellable: true,
        },
        async (progress, token) => {
          const controller = new AbortController();
          token.onCancellationRequested(() => controller.abort());

          const response = await fetch(downloadUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'VSCode-DeepSeek-Web-Updater',
            },
          });

          if (!response.ok) {
            throw new Error(`下载失败: HTTP ${response.status} ${response.statusText}`);
          }

          const contentLength = response.headers.get('content-length');
          const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
          let receivedBytes = 0;

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fs.writeFileSync(tempFilePath, buffer);

          progress.report({ message: '下载完成，正在安装扩展...' });
        }
      );

      // 调用 VS Code 扩展管理命令静默安装本地 VSIX 文件
      const vsixUri = vscode.Uri.file(tempFilePath);
      await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);

      // 询问用户是否重新加载窗口生效
      const reloadChoice = await vscode.window.showInformationMessage(
        `🎉 DeepSeek Web 已成功更新至 v${targetVersion}！是否立即重新加载窗口以应用更新？`,
        '立即重新加载',
        '稍后'
      );

      if (reloadChoice === '立即重新加载') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        vscode.window.showWarningMessage('已取消下载更新。');
      } else {
        vscode.window.showErrorMessage(`安装更新失败: ${err.message}`);
      }
    } finally {
      // 临时文件清理
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
    }
  }
}
