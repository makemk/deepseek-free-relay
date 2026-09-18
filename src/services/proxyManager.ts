import * as vscode from 'vscode';
import * as path from 'path';
import { ChildProcess, fork } from 'child_process';

export class ProxyManager {
  private static instance: ProxyManager;
  private process: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('DeepSeek Web Proxy');
  }

  public static getInstance(): ProxyManager {
    if (!ProxyManager.instance) {
      ProxyManager.instance = new ProxyManager();
    }
    return ProxyManager.instance;
  }

  public isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  public start(extensionPath: string, token?: string): void {
    if (this.isRunning()) {
      vscode.window.showInformationMessage('DeepSeek Web 本地代理服务已在运行中 (端口: 9999)');
      return;
    }

    const scriptPath = path.join(extensionPath, 'bin', 'proxy-server.js');
    this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 正在启动 DeepSeek Web 本地代理服务...`);

    try {
      this.process = fork(scriptPath, [], {
        env: {
          ...process.env,
          PORT: '9999',
          DEEPSEEK_USER_TOKEN: token || process.env.DEEPSEEK_USER_TOKEN || '',
        },
        silent: true,
      });

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        this.outputChannel.append(text);
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        this.outputChannel.append(`[ERROR] ${text}`);
      });

      this.process.on('exit', (code) => {
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 代理进程退出，退出码: ${code}`);
        this.process = null;
      });

      vscode.window.showInformationMessage('DeepSeek Web 代理服务已就绪 (http://127.0.0.1:9999)');
    } catch (err: any) {
      this.outputChannel.appendLine(`[ERROR] 启动代理失败: ${err.message}`);
      vscode.window.showErrorMessage(`启动代理失败: ${err.message}`);
    }
  }

  public restart(extensionPath: string, token?: string): void {
    this.stop();
    setTimeout(() => {
      this.start(extensionPath, token);
    }, 600);
  }

  public stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 已停止本地代理服务。`);
      vscode.window.showInformationMessage('已停止 DeepSeek Web 本地代理服务。');
    }
  }
}

