import { ToolDefinition, AnthropicMessage, OpenAiMessage } from '../types';
import { PayloadSanitizer } from '../security/payloadSanitizer';

/**
 * Agent 提示词生成器与上下文注入器
 */
export class PromptInjector {
  /**
   * 将可用工具列表构建为强约束的 Agent 提示词
   */
  public static formatToolsPrompt(tools?: ToolDefinition[]): string {
    if (!tools || !Array.isArray(tools) || tools.length === 0) return '';

    // 严格按工具名称字典序确定性排序，确保不同轮次提示词前缀 100% 字节级一致，最大化命中 DeepSeek 服务端 KV Cache
    const sortedTools = [...tools].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const toolLines = sortedTools.map(tool => {
      let paramsDesc = '    (无特定参数)';
      if (tool.input_schema?.properties) {
        paramsDesc = Object.entries(tool.input_schema.properties)
          .map(([key, prop]) => {
            const req = tool.input_schema?.required?.includes(key) ? ', 必填' : '';
            const desc = prop?.description ? `: ${prop.description}` : '';
            return `    - \`${key}\` (${prop?.type || 'any'}${req})${desc}`;
          })
          .join('\n');
      }

      return `### 工具: \`${tool.name}\`
${tool.description || '无说明'}
参数规范:
${paramsDesc}`;
    }).join('\n\n');

    return `
================================================================================
【终端工具执行权限已授予 (Claude Code Agent 运行模式)】
================================================================================
你当前作为全自动终端编程助手 (Claude Code Agent) 运行。
用户已授予你直接操作本地终端、执行命令行、读写文件等所有工具的执行权限！
你必须自主推进任务，严禁要求用户手动复制命令去终端运行。

【可用工具库】:
${toolLines}

【工具调用协议 (CRITICAL - 必须严格遵守)】:
1. 当你需要执行终端命令、查看/修改文件、搜索代码库时，你必须在回答中输出工具调用块。
2. 工具调用必须严格使用标准的 XML 标签包裹 JSON：
<tool_call>
{"name": "工具名称", "input": { "参数键": "参数值" }}
</tool_call>

3. 规范示例 (执行终端命令):
<tool_call>
{"name": "Bash", "input": {"command": "git status"}}
</tool_call>

4. 规范示例 (创建/全量覆写文件 Write - 必须包含 file_path 与 content):
<tool_call>
{"name": "Write", "input": {"file_path": "C:/Users/.../example.md", "content": "这是写入文件的完整文本内容"}}
</tool_call>
※ 警告：调用 Write 时，file_path 与 content 均为必填字段！即使新建空文件，也必须传入 "content": ""，严禁遗漏 content 参数！

5. 规范示例 (精准局部编辑文件 Edit - 必须包含 file_path, old_string 与 new_string):
<tool_call>
{"name": "Edit", "input": {"file_path": "src/index.js", "old_string": "const a = 1;", "new_string": "const a = 2;"}}
</tool_call>
※ 警告：调用 Edit 时，file_path、old_string 与 new_string 均为必填字段！若进行代码删除操作，new_string 必须传入 "" ("new_string": "")，严禁遗漏 new_string 或 old_string！

6. 规范示例 (查看读取文件 Read):
<tool_call>
{"name": "Read", "input": {"file_path": "src/index.js"}}
</tool_call>

7. 规范示例 (调用专业技能 Skill - 必须包含 skill 参数，args 为可选字符串):
<tool_call>
{"name": "Skill", "input": {"skill": "diagram-design", "args": "绘制系统架构图"}}
</tool_call>
※ 说明：skill 参数必须为可用技能库中的技能名称（不要带斜杠前缀），严禁臆造不存在的技能名！

8. 规范示例 (派生子智能体 Agent / Task 处理复杂子任务):
<tool_call>
{"name": "Agent", "input": {"subagent_type": "general", "prompt": "深入调研项目目录结构并提取关键代码文件"}}
</tool_call>
※ 说明：遇到庞大复杂工程或多步骤调研时，可主动调用 Agent 或 Task 派生子智能体协助处理。

9. 规范示例 (子智能体向主智能体交付最终工作报告 SubagentHandback - 必须包含 message):
<tool_call>
{"name": "SubagentHandback", "input": {"message": "这是给主智能体的完整工作总结与结果交付报告"}}
</tool_call>
※ 警告：在子智能体运行模式下，当你完成全部工作时，必须且只能通过调用 SubagentHandback({ message: "..." }) 交付报告并立即停止！

10. 行为准则与语法禁令：
- 【简体中文优先 (CRITICAL)】：你的所有文字说明、中间分析阐述、执行状态反馈与阶段/最终总结汇报，必须**主要以规范的简体中文**展示！仅在涉及代码、终端命令、文件路径、参数名与必要技术专有名词时使用英文，严禁向用户输出大段纯英文内容！
- 【立即主动行动】：你拥有完全的本地终端与文件系统权限！严禁向用户输出如 "你可以运行 npm install"、"请在终端输入 git status"、"建议你修改某某文件" 等口头建议！只要任务需要，直接输出 <tool_call> 触发执行！
- 【主动探索原则】：不要等待用户指导微观步骤。面对需求，主动调用 Glob/Grep 搜索项目，主动调用 Read 查看代码，主动调用 Edit/Write 实施修改，主动调用 Bash 编译测试！
- 【参数完整】：调用 Write 必须提供 file_path 和 content；调用 Edit 必须提供 file_path、old_string、new_string；调用 Skill 必须提供 skill 参数；调用 SubagentHandback 必须提供 message！
- 【子智能体闭环】：若当前可用工具库中包含 SubagentHandback，任务完成时必须调用 SubagentHandback 交付最终结果（且 message 总结必须主要使用简体中文），严禁以纯文本口头汇报！
- 【闭合规范】：工具调用开头必须是 <tool_call>，结尾必须且只能是 </tool_call>！严禁输出 </｜｜DSML｜｜ parameter>、</｜｜DSML｜｜ invoke> 或任何 DSML 内部特殊标记！
- 【引号转义】：在 JSON 字符串内部（例如 PowerShell 命令中的子参数或包含双引号的代码），出现的双引号必须使用反斜杠转义（如 \"command\"），严禁产生未转义双引号破坏 JSON 结构！
- 你可以先输出一两句简短的中文解释或思考，然后立即输出 <tool_call>...</tool_call>。
- 每次工具执行完成后，系统会自动将 [工具执行结果反馈] 发送给你。收到反馈后，你可以根据输出继续调用下一个工具，或者输出最终中文总结。
================================================================================
`;
  }

  /**
   * 检查消息历史中是否已经调用过 SubagentHandback
   */
  public static hasCalledHandback(messages?: any[]): boolean {
    if (!Array.isArray(messages) || messages.length === 0) return false;
    for (const m of messages) {
      if (m.role === 'assistant') {
        if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block?.type === 'tool_use' && typeof block.name === 'string') {
              const name = block.name.toLowerCase();
              if (name === 'subagenthandback' || name === 'subagent_handback' || name === 'handback') {
                return true;
              }
            }
          }
        } else if (typeof m.content === 'string') {
          if (m.content.includes('"name": "SubagentHandback"') || m.content.includes('"name":"SubagentHandback"') || m.content.includes('SubagentHandback')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 判断当前请求是否属于【子智能体在交付 SubagentHandback 后的即时收尾轮次】
   * 必须同时满足以下极严格条件，严禁在主智能体或用户新发送指令时误判：
   * 1. tools 中必须包含 SubagentHandback 工具定义 (证明当前确为子智能体运行环境)
   * 2. 消息历史至少有 2 条 (必须包含前一轮 assistant 发起 handback 与本轮 user 反馈的 tool_result)
   * 3. 消息末尾的 user 消息必须是工具执行反馈 (tool_result)，绝不能是纯文本人类指令 (如 "继续"、"换一个"、"。。")
   * 4. 紧邻前一条 assistant 消息调用了 SubagentHandback，或当前 tool_result 明确包含单次交付提示
   */
  public static isHandbackClosingTurn(messages?: any[], tools?: any[]): boolean {
    if (!Array.isArray(tools) || tools.length === 0) return false;
    const hasHandback = tools.some(t => {
      const name = (t.name || t.function?.name || '').toLowerCase();
      return name === 'subagenthandback' || name === 'subagent_handback' || name === 'handback';
    });
    if (!hasHandback) return false;

    if (!Array.isArray(messages) || messages.length < 2) return false;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return false;

    // 若最后一条消息是纯文本（人类用户在终端输入的指令，如 "继续"、"换一个"、"。。" 等），绝对不是工具交付闭环！
    if (typeof lastMsg.content === 'string') return false;

    if (Array.isArray(lastMsg.content)) {
      // 必须包含 tool_result 块
      const toolResults = lastMsg.content.filter((b: any) => b?.type === 'tool_result');
      if (toolResults.length === 0) return false;

      // 检查倒数第二条 assistant 消息是否调用了 SubagentHandback
      const prevMsg = messages[messages.length - 2];
      if (prevMsg && prevMsg.role === 'assistant' && Array.isArray(prevMsg.content)) {
        const calledHandback = prevMsg.content.some((b: any) => {
          if (b?.type === 'tool_use' && typeof b.name === 'string') {
            const name = b.name.toLowerCase();
            return name === 'subagenthandback' || name === 'subagent_handback' || name === 'handback';
          }
          return false;
        });
        if (calledHandback) return true;
      }

      // 或者 tool_result 内容中明确包含 Claude Code 官方单次交付提示
      for (const tr of toolResults) {
        const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content || '');
        if (contentStr.includes('already delivered') || contentStr.includes('SubagentHandback delivers one report') || contentStr.includes('Nothing was sent: your report was already delivered')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 格式化 Anthropic 消息历史为单个网页端提示词
   */
  public static formatAnthropicToPrompt(
    system?: string | Array<{ type: string; text: string }>,
    messages?: AnthropicMessage[],
    tools?: ToolDefinition[]
  ): string {
    const parts: string[] = [];

    // 1. 系统指令与工具说明
    let systemText = '';
    if (system) {
      if (typeof system === 'string' && system.trim()) {
        systemText = system.trim();
      } else if (Array.isArray(system)) {
        systemText = system.map(b => b.text || '').filter(Boolean).join('\n\n');
      }
    }

    const toolsPrompt = this.formatToolsPrompt(tools);
    if (toolsPrompt) {
      systemText = systemText ? `${systemText}\n\n${toolsPrompt}` : toolsPrompt;
    }

    if (systemText) {
      parts.push(`【系统指令】\n${systemText}`);
    }

    // 2. 对话历史多轮遍历 (保持历史消息输出 100% 确定性稳定，最大化命中 KV Cache Prefix Caching)
    if (Array.isArray(messages)) {
      const totalMessages = messages.length;
      for (let i = 0; i < totalMessages; i++) {
        const m = messages[i];
        const role = m.role || 'user';
        let contentStr = '';

        if (typeof m.content === 'string') {
          contentStr = m.content;
          // 极长单个文本确定性紧凑保护 (>8000 字符)
          if (contentStr.length > 8000) {
            contentStr = contentStr.slice(0, 5000) + '\n...[⚡ 超长输入自动紧凑截断]...\n' + contentStr.slice(contentStr.length - 1500);
          }
        } else if (Array.isArray(m.content)) {
          const blocks: string[] = [];
          for (const b of m.content) {
            if (!b) continue;
            if (typeof b === 'string') {
              blocks.push(b);
            } else if (b.type === 'text' && typeof b.text === 'string') {
              blocks.push(b.text);
            } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
              // 思考链无需在历史提示词中回灌 (DeepSeek 服务端自主生成思考，回灌无益且破坏前缀缓存并剧烈消耗 Token)
              continue;
            } else if (b.type === 'tool_use') {
              // 还原为 <tool_call>，作为天然 Few-shot 学习样本
              const toolJson = JSON.stringify({ name: b.name || 'Bash', input: b.input || {} }, null, 2);
              blocks.push(`<tool_call>\n${toolJson}\n</tool_call>`);
            } else if (b.type === 'tool_result') {
              let res = '';
              if (typeof b.content === 'string') {
                res = b.content;
              } else if (Array.isArray(b.content)) {
                res = b.content.map(c => (c && c.text) ? c.text : JSON.stringify(c)).join('\n');
              } else {
                res = JSON.stringify(b.content || '');
              }
              // 确定性幂等裁剪，绝不因对话轮次推移导致历史输出反复变化而击穿 KV Cache
              const safeRes = PayloadSanitizer.sanitizeToolResult(res, false);
              blocks.push(`【工具执行结果反馈 (ID: ${b.tool_use_id || ''}, 状态: ${b.is_error ? '执行报错' : '执行成功'})】:\n${safeRes}`);
            } else if ((b as any).text) {
              blocks.push((b as any).text);
            }
          }
          contentStr = blocks.join('\n\n');
        }

        if (contentStr.trim()) {
          if (role === 'assistant') {
            parts.push(`【助手历史回复】\n${contentStr.trim()}`);
          } else {
            parts.push(`【用户需求/反馈】\n${contentStr.trim()}`);
          }
        }
      }
    }

    // 3. 尾部强锚点 (Tail Anchor): 消除长上下文导致的指令衰减，强力驱动模型立即主动调用工具行动
    if (tools && tools.length > 0) {
      const isSubagent = tools.some(t => t.name && (t.name.toLowerCase() === 'subagenthandback' || t.name.toLowerCase() === 'subagent_handback'));
      if (isSubagent) {
        if (this.hasCalledHandback(messages)) {
          parts.push(`
================================================================================
【子智能体任务已圆满结束 (SUBAGENT TASK COMPLETE)】
你之前已通过 SubagentHandback 成功向主智能体交付了最终汇报！
严禁再次调用 SubagentHandback 工具（该工具每个子智能体全局仅允许交付一次）！
请直接输出简要中文确认（例如 "子智能体工作报告已成功交付，当前任务已圆满完成。"）并结束本轮（stop）。
================================================================================
`);
        } else {
          parts.push(`
================================================================================
【子智能体交付汇报终极准则 (SUBAGENT HANDBACK MANDATORY)】
你当前作为子智能体 (Subagent) 运行！
- 当你完成调研/执行任务，或收到交付催告指令（如 [handback-send-enforce]）时，你必须且只能立即调用 SubagentHandback 提交最终总结汇报！
- 【语言规范】：交付总结 message 必须主要使用【简体中文】进行结构化汇报（工作摘要、关键产出与结论）！
- 规范示例：
<tool_call>
{"name": "SubagentHandback", "input": {"message": "【任务执行汇报】\\n1. 调研分析：已梳理相关逻辑\\n2. 操作结果：已完成文件修改\\n3. 验证状态：测试全部通过"}}
</tool_call>
- 严禁以纯文本口头汇报！在子智能体运行模式下，唯有调用 SubagentHandback 你的最终产物才能送达主智能体！
================================================================================
`);
        }
      } else {
        parts.push(`
================================================================================
【Agent 立即行动强指令 (ACTION REQUIRED)】
你当前作为全自主终端 Agent 运行，拥有本地工具最高执行权限。用户已明确期望你直接动手推进完成任务。
1. 【简体中文优先】：向用户输出的所有思考阐述、状态说明、代码解释与任务总结，必须主要使用规范的【简体中文】！英文仅用于代码语法、命令行、文件路径与必要专业名词，严禁输出大段纯英文。
2. 【立即行动】：严禁只输出空洞文字分析、方案建议或未经工具执行的理论代码！若需分析环境、检索/读取文件、编辑代码、执行命令、调用技能或派生子任务，必须在当前回答中立即输出 <tool_call>... 触发执行！
================================================================================
`);
      }
    }

    const rawPrompt = parts.join('\n\n');
    return PayloadSanitizer.ensurePromptWithinBudget(rawPrompt);
  }

  /**
   * 格式化 OpenAI 消息历史
   */
  public static formatOpenAiMessagesToPrompt(
    messages?: OpenAiMessage[],
    tools?: ToolDefinition[]
  ): string {
    if (!messages || messages.length === 0) return '';

    const parts: string[] = [];
    const toolsPrompt = this.formatToolsPrompt(tools);
    let systemInjected = false;
    const total = messages.length;

    for (let i = 0; i < total; i++) {
      const m = messages[i];
      const role = m.role || 'user';
      let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');

      if (role === 'system') {
        if (toolsPrompt && !systemInjected) {
          content = `${content}\n\n${toolsPrompt}`;
          systemInjected = true;
        }
        parts.push(`【系统指导】\n${content}`);
      } else if (role === 'assistant') {
        if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            let fnArgs = tc.function?.arguments || {};
            if (typeof fnArgs === 'string') {
              try { fnArgs = JSON.parse(fnArgs); } catch {}
            }
            content += `\n<tool_call>\n${JSON.stringify({ name: tc.function?.name, input: fnArgs }, null, 2)}\n</tool_call>`;
          }
        }
        parts.push(`【历史回答】\n${content.trim()}`);
      } else if (role === 'tool') {
        const safeRes = PayloadSanitizer.sanitizeToolResult(content, false);
        parts.push(`【工具执行结果反馈 (ID: ${m.tool_call_id || ''})】:\n${safeRes}`);
      } else {
        parts.push(`【用户需求】\n${content}`);
      }
    }

    if (toolsPrompt && !systemInjected) {
      parts.unshift(`【系统指导】\n${toolsPrompt}`);
    }

    if (tools && tools.length > 0) {
      parts.push(`
===============================================================================
【Agent 立即行动强指令 (ACTION REQUIRED)】
你当前作为全自主终端 Agent 运行，必须主要使用规范的【简体中文】进行沟通阐述与任务汇报（代码语法与命令除外），并立即在回答中输出 <tool_call>... 触发工具执行，严禁只输出口头建议！
===============================================================================
`);
    }

    const rawPrompt = parts.join('\n\n');
    return PayloadSanitizer.ensurePromptWithinBudget(rawPrompt);
  }
}

