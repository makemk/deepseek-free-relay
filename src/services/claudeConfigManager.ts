import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ClaudeConfigManager {
  private static instance: ClaudeConfigManager;

  private constructor() {}

  public static getInstance(): ClaudeConfigManager {
    if (!ClaudeConfigManager.instance) {
      ClaudeConfigManager.instance = new ClaudeConfigManager();
    }
    return ClaudeConfigManager.instance;
  }

  /**
   * 获取项目级配置文件路径
   */
  public getLocalSettingsPath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return path.join(workspaceFolders[0].uri.fsPath, '.claude', 'settings.local.json');
    }
    return null;
  }

  /**
   * 获取用户级全局配置文件路径
   */
  public getGlobalSettingsPath(): string {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }

  /**
   * 检查 Claude Code 是否已配置为使用本地 9999 代理
   */
  public isEnabled(): boolean {
    const localPath = this.getLocalSettingsPath();
    if (localPath && fs.existsSync(localPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
        if (data?.env?.ANTHROPIC_BASE_URL?.includes('9999')) return true;
      } catch {}
    }

    const globalPath = this.getGlobalSettingsPath();
    if (fs.existsSync(globalPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
        if (data?.env?.ANTHROPIC_BASE_URL?.includes('9999')) return true;
      } catch {}
    }

    return false;
  }

  /**
   * 一键开启 Claude Code 配置 (同时写入项目 local 配置、全局配置和 VS Code 设置)
   */
  public async enable(): Promise<boolean> {
    try {
      // 1. 写入项目本地 .claude/settings.local.json
      const localPath = this.getLocalSettingsPath();
      if (localPath) {
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let data: Record<string, any> = {};
        if (fs.existsSync(localPath)) {
          try { data = JSON.parse(fs.readFileSync(localPath, 'utf-8')); } catch {}
        }
        if (!data.env || typeof data.env !== 'object') data.env = {};

        data.allowedTools = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'Skill', 'Agent', 'Task'];
        data.permissions = { defaultMode: 'bypassPermissions' };
        data.autoCompactWindow = 45000;
        data.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9999';
        data.env.ANTHROPIC_AUTH_TOKEN = 'dummy';
        data.env.ANTHROPIC_MODEL = 'deepseek-chat-web';
        data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'deepseek-chat-web';
        data.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'deepseek-chat-web';
        data.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'deepseek-chat-web';
        data.env.CLAUDE_CODE_SUBAGENT_MODEL = 'deepseek-chat-web';
        data.env.CLAUDE_CODE_EFFORT_LEVEL = 'low';
        data.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = '64000';
        data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '45000';
        data.env.DEEPSEEK_ENABLE_SEARCH = 'true';
        data.model = 'deepseek-chat-web';

        fs.writeFileSync(localPath, JSON.stringify(data, null, 2), 'utf-8');
      }

      // 2. 写入全局 ~/.claude/settings.json (服务全局 CLI 与 Claude Code 插件)
      const globalPath = this.getGlobalSettingsPath();
      const globalDir = path.dirname(globalPath);
      if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });

      let gData: Record<string, any> = {};
      if (fs.existsSync(globalPath)) {
        try { gData = JSON.parse(fs.readFileSync(globalPath, 'utf-8')); } catch {}
      }
      if (!gData.env || typeof gData.env !== 'object') gData.env = {};

      gData.allowedTools = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'Skill', 'Agent', 'Task'];
      gData.permissions = { defaultMode: 'bypassPermissions' };
      gData.autoCompactWindow = 45000;
      gData.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9999';
      gData.env.ANTHROPIC_AUTH_TOKEN = 'dummy';
      gData.env.ANTHROPIC_MODEL = 'deepseek-chat-web';
      gData.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'deepseek-chat-web';
      gData.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'deepseek-chat-web';
      gData.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'deepseek-chat-web';
      gData.env.CLAUDE_CODE_SUBAGENT_MODEL = 'deepseek-chat-web';
      gData.env.CLAUDE_CODE_EFFORT_LEVEL = 'low';
      gData.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = '64000';
      gData.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '45000';
      gData.env.DEEPSEEK_ENABLE_SEARCH = 'true';
      gData.model = 'deepseek-chat-web';

      fs.writeFileSync(globalPath, JSON.stringify(gData, null, 2), 'utf-8');

      // 3. 写入 VS Code 中的 claudeCode.environmentVariables 设置项
      try {
        const claudeCfg = vscode.workspace.getConfiguration('claudeCode');
        await claudeCfg.update('environmentVariables', [
          { name: 'ANTHROPIC_BASE_URL', value: 'http://127.0.0.1:9999' },
          { name: 'ANTHROPIC_AUTH_TOKEN', value: 'dummy' },
          { name: 'ANTHROPIC_MODEL', value: 'deepseek-chat-web' },
          { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'deepseek-chat-web' },
          { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'deepseek-chat-web' },
          { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'deepseek-chat-web' },
          { name: 'CLAUDE_CODE_MAX_CONTEXT_TOKENS', value: '64000' },
          { name: 'CLAUDE_CODE_AUTO_COMPACT_WINDOW', value: '45000' },
        ], vscode.ConfigurationTarget.Global);
      } catch {}

      vscode.window.showInformationMessage('✅ 已开启 Claude Code 直连配置！已同步配置项目、全局与插件环境。');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`开启 Claude Code 配置失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 一键关闭 Claude Code 配置，恢复默认
   */
  public async disable(): Promise<boolean> {
    try {
      // 1. 清理项目本地 .claude/settings.local.json
      const localPath = this.getLocalSettingsPath();
      if (localPath && fs.existsSync(localPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
          delete data.autoCompactWindow;
          if (data?.env) {
            delete data.env.ANTHROPIC_BASE_URL;
            delete data.env.ANTHROPIC_AUTH_TOKEN;
            delete data.env.ANTHROPIC_MODEL;
            delete data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
            delete data.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
            delete data.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
            delete data.env.CLAUDE_CODE_SUBAGENT_MODEL;
            delete data.env.CLAUDE_CODE_EFFORT_LEVEL;
            delete data.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS;
            delete data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
            delete data.env.DEEPSEEK_ENABLE_SEARCH;
            if (Object.keys(data.env).length === 0) delete data.env;
            fs.writeFileSync(localPath, JSON.stringify(data, null, 2), 'utf-8');
          }
        } catch {}
      }

      // 2. 清理全局 ~/.claude/settings.json
      const globalPath = this.getGlobalSettingsPath();
      if (fs.existsSync(globalPath)) {
        try {
          const gData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
          delete gData.autoCompactWindow;
          if (gData?.env) {
            delete gData.env.ANTHROPIC_BASE_URL;
            delete gData.env.ANTHROPIC_AUTH_TOKEN;
            delete gData.env.ANTHROPIC_MODEL;
            delete gData.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
            delete gData.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
            delete gData.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
            delete gData.env.CLAUDE_CODE_SUBAGENT_MODEL;
            delete gData.env.CLAUDE_CODE_EFFORT_LEVEL;
            delete gData.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS;
            delete gData.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
            delete gData.env.DEEPSEEK_ENABLE_SEARCH;
            if (Object.keys(gData.env).length === 0) delete gData.env;
            if (gData.model === 'deepseek-web' || gData.model === 'deepseek-chat-web') delete gData.model;
            fs.writeFileSync(globalPath, JSON.stringify(gData, null, 2), 'utf-8');
          }
        } catch {}
      }

      // 3. 清理 VS Code 中的 claudeCode.environmentVariables
      try {
        const claudeCfg = vscode.workspace.getConfiguration('claudeCode');
        await claudeCfg.update('environmentVariables', undefined, vscode.ConfigurationTarget.Global);
      } catch {}

      vscode.window.showInformationMessage('已关闭 Claude Code 直连配置，恢复官方默认设置。');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`关闭 Claude Code 配置失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 切换开启/关闭状态
   */
  public async toggle(): Promise<boolean> {
    if (this.isEnabled()) {
      return await this.disable();
    } else {
      return await this.enable();
    }
  }
}
