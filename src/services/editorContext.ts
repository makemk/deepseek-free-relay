import * as vscode from 'vscode';
import * as path from 'path';
import { EditorContextData } from '../types';

export class EditorContext {
  /**
   * 捕获当前活动编辑器的上下文数据（文件路径、语言、选中文本、Linter 诊断报错）
   */
  public static getCurrentContext(): EditorContextData {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return {};
    }

    const doc = editor.document;
    const selection = editor.selection;
    const selectedText = !selection.isEmpty ? doc.getText(selection) : undefined;

    let diagnosticsText = '';
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    if (diagnostics.length > 0) {
      const relevant = diagnostics.slice(0, 5).map((d) => {
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
        return `[Line ${d.range.start.line + 1}] ${severity}: ${d.message}`;
      });
      diagnosticsText = relevant.join('\n');
    }

    return {
      fileName: path.basename(doc.fileName),
      filePath: doc.fileName,
      fileLanguage: doc.languageId,
      selectedText,
      selectionRange: !selection.isEmpty
        ? { startLine: selection.start.line + 1, endLine: selection.end.line + 1 }
        : undefined,
      diagnostics: diagnosticsText || undefined,
    };
  }

  /**
   * 将编辑器上下文包装成高质量的 Prompt
   */
  public static buildContextPrompt(instruction: string, context: EditorContextData): string {
    const parts: string[] = [];

    if (context.fileName) {
      parts.push(`【当前文件】: ${context.fileName} (${context.fileLanguage || 'plaintext'})`);
    }

    if (context.selectedText) {
      parts.push(
        `【选中的代码片段 (第 ${context.selectionRange?.startLine ?? 1} - ${context.selectionRange?.endLine ?? 1} 行)】:\n\`\`\`${context.fileLanguage || ''}\n${context.selectedText}\n\`\`\``
      );
    }

    if (context.diagnostics) {
      parts.push(`【当前文件存在的编译器/Linter 诊断报错】:\n${context.diagnostics}`);
    }

    parts.push(`【任务需求】:\n${instruction}`);
    return parts.join('\n\n');
  }

  /**
   * 在当前光标位置插入代码
   */
  public static async insertAtCursor(code: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先在编辑器中打开一个文件并定位光标。');
      return false;
    }

    return editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, code);
    });
  }

  /**
   * 替换当前选中的代码
   */
  public static async replaceSelection(code: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先在编辑器中选定需要替换的代码。');
      return false;
    }

    return editor.edit((editBuilder) => {
      if (editor.selection.isEmpty) {
        editBuilder.insert(editor.selection.active, code);
      } else {
        editBuilder.replace(editor.selection, code);
      }
    });
  }

  /**
   * 在右侧新标签页中打开并预览生成的代码
   */
  public static async openInNewFile(code: string, language: string = 'plaintext'): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language,
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }
}

