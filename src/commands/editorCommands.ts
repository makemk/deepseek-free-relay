import * as vscode from 'vscode';
import { ChatViewProvider } from '../providers/chatViewProvider';
import { EditorContext } from '../services/editorContext';

export function registerEditorCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider,
): void {
  const commands = [
    {
      command: 'deepseek.explainCode',
      prompt: '/explain 请详细解释选中的代码，包括算法逻辑与设计考量。',
    },
    {
      command: 'deepseek.refactorCode',
      prompt: '/refactor 请重构选中的代码，消除代码异味，提升可读性与执行效率。',
    },
    {
      command: 'deepseek.fixCode',
      prompt: '/bugfix 请审查选中的代码，排查潜在边界异常、空指针或内存泄露，并给出完整修复。',
    },
    {
      command: 'deepseek.generateTests',
      prompt: '/test 请为选中的代码编写全面的单元测试用例，覆盖各种正常与异常边界。',
    },
    {
      command: 'deepseek.addComments',
      prompt: '/doc 请为选中的代码添加符合规范的详细注释与 API 文档。',
    },
  ];

  for (const item of commands) {
    const disposable = vscode.commands.registerCommand(item.command, async () => {
      const editorCtx = EditorContext.getCurrentContext();
      if (!editorCtx.selectedText && !editorCtx.fileName) {
        vscode.window.showWarningMessage('请先在编辑器中打开代码文件或选定代码段。');
        return;
      }
      await chatProvider.sendPromptWithContext(item.prompt, editorCtx);
    });
    context.subscriptions.push(disposable);
  }
}

