import { ToolDefinition, ExtractedToolCall } from '../types';

/**
 * 过滤残余孤立的 DSML 内部标记或工具闭合标签，防止泄漏到用户终端
 */
export function stripOrphanToolTags(text: string): string {
  if (!text) return '';
  return text
    // 1. 完整的 DSML / XML / Tool 标签 (包括开闭标签与带属性标签)
    .replace(/<\/?(?:[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*)?(?:calls|invoke|parameter|tool_call|tool|tools|function_calls?|function_call)(?:\s+[^>]*)?>/gi, '')
    // 2. DeepSeek 特殊控制 Token (<｜tool calls begin｜> 等)
    .replace(/<[｜|\uff5c]{1,2}tool[^\uff5c|>]*[｜|\uff5c]{1,2}>/gi, '')
    // 3. 闭合标签各种变体 (如 </calls >, </tool_call >)
    .replace(/<\/\s*(?:calls|invoke|parameter|tool_call|tool|tools)[^>]*>/gi, '')
    // 4. 残余碎片与脱落前缀的残肢 (严格使用负向后行断言，绝不能误杀 </tool_call> 或 <tool_call> 内部的 _call>)
    .replace(/(?<![</]tool)_call>/gi, '')
    .replace(/(?<![</][\w\uff5c|]*)calls>/gi, '')
    .replace(/(?<![</][\w\uff5c|]*)invoke>/gi, '')
    .replace(/(?<![</][\w\uff5c|]*)parameter>/gi, '')
    .replace(/(?<!<)\btool_call>/gi, '')
    // 5. 孤立的工具名回声 (如换行后孤立出现的 SubagentHandback)
    .replace(/(?:^|\n)\s*(?:SubagentHandback)\s*(?=\n|$)/gi, '');
}

/**
 * 工具名称别名映射表
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  'write': 'Write',
  'filewrite': 'Write',
  'writefile': 'Write',
  'write_file': 'Write',
  'create_file': 'Write',
  'createfile': 'Write',
  'file_write': 'Write',

  'edit': 'Edit',
  'fileedit': 'Edit',
  'editfile': 'Edit',
  'edit_file': 'Edit',
  'file_edit': 'Edit',
  'str_replace_editor': 'Edit',
  'str_replace': 'Edit',
  'modify_file': 'Edit',
  'modifyfile': 'Edit',
  'replace_string': 'Edit',
  'replacestring': 'Edit',
  'text_editor': 'Edit',

  'read': 'Read',
  'readfile': 'Read',
  'view_file': 'Read',
  'viewfile': 'Read',
  'read_file': 'Read',
  'view': 'Read',
  'cat': 'Read',

  'find_files': 'Glob',
  'findfiles': 'Glob',
  'file_search': 'Glob',
  'glob': 'Glob',

  'grep_search': 'Grep',
  'search_files': 'Grep',
  'grep': 'Grep',

  'run_command': 'Bash',
  'execute_command': 'Bash',
  'terminal': 'Bash',
  'sh': 'Bash',
  'cmd': 'Bash',
  'bash': 'Bash',

  'skill': 'Skill',
  'run_skill': 'Skill',
  'invoke_skill': 'Skill',
  'use_skill': 'Skill',
  'execute_skill': 'Skill',
  'slash_command': 'Skill',

  'agent': 'Agent',
  'subagent': 'Agent',
  'sub_agent': 'Agent',
  'spawn_agent': 'Agent',
  'invoke_agent': 'Agent',
  'task': 'Task',
  'subtask': 'Task',

  'subagenthandback': 'SubagentHandback',
  'subagent_handback': 'SubagentHandback',
  'subagent_hand_back': 'SubagentHandback',
  'handback': 'SubagentHandback',
  'hand_back': 'SubagentHandback',
};

/**
 * 容错修复非法 JSON 字符串 (包含未转义双引号、物理换行符、Windows 反斜杠等高发语法错误)
 */
export function repairAndParseJson(rawJson: string): Record<string, any> {
  const trimmed = (rawJson || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // 步骤 1: 尝试对 Windows 路径中的非法单反斜杠进行修复 (例如 C:\Users -> C:\\Users)
    let sanitized = trimmed.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');
    try {
      return JSON.parse(sanitized);
    } catch {}

    // 步骤 2: 尝试修复字符串字面量内部包含的未转义物理换行符与制表符
    let inString = false;
    let escaped = false;
    let fixedChars: string[] = [];
    for (let i = 0; i < sanitized.length; i++) {
      const ch = sanitized[i];
      if (ch === '"' && !escaped) {
        inString = !inString;
        fixedChars.push(ch);
      } else if (inString && (ch === '\n' || ch === '\r')) {
        if (ch === '\n') fixedChars.push('\\n');
      } else if (inString && ch === '\t') {
        fixedChars.push('\\t');
      } else {
        fixedChars.push(ch);
      }
      escaped = (ch === '\\' && !escaped);
    }
    const fixedStringLit = fixedChars.join('');
    try {
      return JSON.parse(fixedStringLit);
    } catch {}

    // 步骤 3: 智能规则兜底抽取
    const nameMatch = trimmed.match(/"(?:name|tool)":\s*"([^"]+)"/i);
    const name = nameMatch
      ? nameMatch[1]
      : (trimmed.includes('"old_string"') || trimmed.includes('"old_str"') || trimmed.includes('"target_content"')
        ? 'Edit'
        : (trimmed.includes('"subagenthandback"') || trimmed.includes('"subagent_handback"') || trimmed.includes('"SUBAGENT_ALIVE"')
          ? 'SubagentHandback'
          : (trimmed.includes('"content"') || trimmed.includes('"file_content"')
            ? 'Write'
            : (trimmed.includes('"skill"') || trimmed.includes('"skill_name"')
              ? 'Skill'
              : (trimmed.includes('"subagent_type"') || trimmed.includes('"agent"')
                ? 'Agent'
                : (trimmed.includes('"command"') || trimmed.includes('"cmd"') ? 'Bash' : 'Bash'))))));

    // 针对 Bash command/cmd 字段内部嵌套双引号自愈修复
    const cmdMatch = trimmed.match(/"(?:command|cmd)":\s*"([\s\S]*)"\s*\}?\s*\}?/i);
    if (cmdMatch && (name.toLowerCase() === 'bash' || (!trimmed.includes('"file_path"') && !trimmed.includes('"old_string"') && !trimmed.includes('"content"')))) {
      let cmd = cmdMatch[1].replace(/\s*\}*\s*$/, '').trim();
      const quoteCount = (cmd.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        cmd += '"';
      }
      return { name, input: { command: cmd } };
    }

    // 针对 Write / Edit / Read 提取参数
    const inputObj: Record<string, any> = {};
    const pathMatch = trimmed.match(/"(?:file_path|path|filepath|target_file|filename|file)":\s*"([^"]+)"/i);
    if (pathMatch) {
      inputObj.file_path = pathMatch[1].replace(/\\\\/g, '\\');
    }

    const isEdit = (name.toLowerCase() === 'edit' ||
      trimmed.includes('"old_string"') ||
      trimmed.includes('"old_text"') ||
      trimmed.includes('"old_str"') ||
      trimmed.includes('"target_content"') ||
      trimmed.includes('"str_replace'));

    if (isEdit) {
      const oldKeyRegex = '"(?:old_string|old_text|old_str|target_content|original_content|original|search|find|match)"';
      const newKeyRegex = '"(?:new_string|new_text|new_str|replacement_content|replacement|replace_string|replace|content|text)"';
      const anyOtherKeyRegex = '"(?:file_path|path|filepath|target_file|filename|file|replace_all|replaceAll)"';

      const oldBeforeNew = trimmed.match(new RegExp(`${oldKeyRegex}:\\s*"([\\s\\S]*?)"\\s*,\\s*${newKeyRegex}:\\s*"`, 'i'));
      const newBeforeOld = trimmed.match(new RegExp(`${newKeyRegex}:\\s*"([\\s\\S]*?)"\\s*,\\s*${oldKeyRegex}:\\s*"`, 'i'));

      if (oldBeforeNew) {
        inputObj.old_string = oldBeforeNew[1];
        const afterNew = trimmed.match(new RegExp(`${newKeyRegex}:\\s*"([\\s\\S]*?)(?:"\\s*,\\s*${anyOtherKeyRegex}|"\\s*\\}|\\s*<\\/(?:tool_call|[｜|\\uff5c]{1,2}DSML|invoke)|$)`, 'i'));
        if (afterNew) {
          inputObj.new_string = afterNew[1];
        }
      } else if (newBeforeOld) {
        inputObj.new_string = newBeforeOld[1];
        const afterOld = trimmed.match(new RegExp(`${oldKeyRegex}:\\s*"([\\s\\S]*?)(?:"\\s*,\\s*${anyOtherKeyRegex}|"\\s*\\}|\\s*<\\/(?:tool_call|[｜|\\uff5c]{1,2}DSML|invoke)|$)`, 'i'));
        if (afterOld) {
          inputObj.old_string = afterOld[1];
        }
      } else {
        const oldOnly = trimmed.match(new RegExp(`${oldKeyRegex}:\\s*"([\\s\\S]*?)(?:"\\s*,\\s*(?:${newKeyRegex}|${anyOtherKeyRegex})|"\\s*\\}|\\s*<\\/(?:tool_call|[｜|\\uff5c]{1,2}DSML|invoke)|$)`, 'i'));
        if (oldOnly) {
          inputObj.old_string = oldOnly[1];
        }
        const newOnly = trimmed.match(new RegExp(`${newKeyRegex}:\\s*"([\\s\\S]*?)(?:"\\s*,\\s*(?:${oldKeyRegex}|${anyOtherKeyRegex})|"\\s*\\}|\\s*<\\/(?:tool_call|[｜|\\uff5c]{1,2}DSML|invoke)|$)`, 'i'));
        if (newOnly) {
          inputObj.new_string = newOnly[1];
        }
      }

      const replaceAllMatch = trimmed.match(/"(?:replace_all|replaceAll)":\s*(true|false|"true"|"false")/i);
      if (replaceAllMatch) {
        inputObj.replace_all = replaceAllMatch[1].includes('true');
      }
    } else if (name.toLowerCase() === 'skill' || trimmed.includes('"skill"')) {
      const skillMatch = trimmed.match(/"(?:skill|skill_name|skillName|command|name)":\s*"([^"]+)"/i);
      if (skillMatch) {
        inputObj.skill = skillMatch[1];
      }
      const argsMatch = trimmed.match(/"(?:args|arguments|params)":\s*"([\s\S]*?)(?:"\s*\}|\s*<\/(?:tool_call|[｜|\uff5c]{1,2}DSML|invoke)|$)/i);
      if (argsMatch) {
        inputObj.args = argsMatch[1];
      }
    } else if (name.toLowerCase() === 'agent' || name.toLowerCase() === 'task' || trimmed.includes('"subagent_type"')) {
      const typeMatch = trimmed.match(/"(?:subagent_type|type|agent_type|agentType)":\s*"([^"]+)"/i);
      if (typeMatch) {
        inputObj.subagent_type = typeMatch[1];
      }
      const promptMatch = trimmed.match(/"(?:prompt|task|description|instruction|query|message)":\s*"([\s\S]*?)(?:"\s*\}|\s*<\/(?:tool_call|[｜|\uff5c]{1,2}DSML|invoke)|$)/i);
      if (promptMatch) {
        inputObj.prompt = promptMatch[1];
      }
    } else if (name.toLowerCase() === 'subagenthandback' || name.toLowerCase() === 'handback' || trimmed.includes('"subagenthandback"') || trimmed.includes('"SUBAGENT_ALIVE"')) {
      const msgMatch = trimmed.match(/"(?:message|report|content|text|summary|result|output)":\s*"([\s\S]*?)(?:"\s*\}|\s*<\/(?:tool_call|[｜|\uff5c]{1,2}DSML|invoke)|$)/i);
      if (msgMatch) {
        inputObj.message = msgMatch[1];
      }
    } else {
      const contentMatch = trimmed.match(/"(?:content|text|body|file_content|contents|code)":\s*"([\s\S]*?)(?:"\s*\}|\s*<\/(?:tool_call|[｜|\uff5c]{1,2}DSML|invoke)|$)/i);
      if (contentMatch) {
        inputObj.content = contentMatch[1];
      }
    }

    // 正则抽取所有剩余键值对
    const propRegex = /"([^"]+)":\s*"([\s\S]*?)"(?=\s*[,}])/g;
    let m: RegExpExecArray | null;
    while ((m = propRegex.exec(trimmed)) !== null) {
      if (m[1] !== 'name' && m[1] !== 'tool' && !inputObj[m[1]]) {
        inputObj[m[1]] = m[2];
      }
    }

    if (Object.keys(inputObj).length > 0) {
      return { name, input: inputObj };
    }

    throw err;
  }
}

/**
 * 规范化工具调用名称与参数 (强化 Write / Edit / Read 别名映射与 Zod 校验强兜底)
 */
export function normalizeToolCall(name: string, rawInput: any, tools?: ToolDefinition[]): { name: string; input: Record<string, any> } {
  let matchedName = (name || '').trim();
  const lowerName = matchedName.toLowerCase();

  // 1. 工具名别名映射
  if (TOOL_NAME_ALIASES[lowerName]) {
    matchedName = TOOL_NAME_ALIASES[lowerName];
  }

  // 2. 根据可用工具库定义对齐大小写
  let toolDef: ToolDefinition | undefined = undefined;
  if (Array.isArray(tools)) {
    toolDef = tools.find(t => t.name && t.name.toLowerCase() === matchedName.toLowerCase());
    if (toolDef) matchedName = toolDef.name;
  }

  let input = rawInput;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch {}
  }
  if (typeof input !== 'object' || input === null) {
    input = {};
  }

  // 1. 递归展平并解包可能存在的 input / parameters / arguments 包装层
  if (input.input !== undefined && input.input !== null) {
    let unwrapped = input.input;
    if (typeof unwrapped === 'string') {
      try {
        const parsed = JSON.parse(unwrapped);
        if (typeof parsed === 'object' && parsed !== null) unwrapped = parsed;
      } catch {}
    }
    delete input.input;
    if (typeof unwrapped === 'object' && unwrapped !== null && !Array.isArray(unwrapped)) {
      input = { ...input, ...unwrapped };
    } else if (typeof unwrapped === 'string') {
      if (!input.command && (matchedName.toLowerCase() === 'bash' || !input.content)) {
        input.command = unwrapped;
      } else if (!input.content && matchedName.toLowerCase() === 'write') {
        input.content = unwrapped;
      }
    }
  }

  if (input.parameters !== undefined && input.parameters !== null) {
    let unwrapped = input.parameters;
    if (typeof unwrapped === 'string') {
      try {
        const parsed = JSON.parse(unwrapped);
        if (typeof parsed === 'object' && parsed !== null) unwrapped = parsed;
      } catch {}
    }
    delete input.parameters;
    if (typeof unwrapped === 'object' && unwrapped !== null && !Array.isArray(unwrapped)) {
      input = { ...input, ...unwrapped };
    }
  }

  if (input.arguments !== undefined && input.arguments !== null) {
    let unwrapped = input.arguments;
    if (typeof unwrapped === 'string') {
      try {
        const parsed = JSON.parse(unwrapped);
        if (typeof parsed === 'object' && parsed !== null) unwrapped = parsed;
      } catch {}
    }
    delete input.arguments;
    if (typeof unwrapped === 'object' && unwrapped !== null && !Array.isArray(unwrapped)) {
      input = { ...input, ...unwrapped };
    }
  }

  const targetName = matchedName.toLowerCase();

  // 3. 针对 Write 工具的强力补全与容错 (彻底杜绝 content provided as unknown)
  if (targetName === 'write') {
    if (!input.file_path) {
      input.file_path = input.path || input.filepath || input.target_file || input.filename || input.file || input.dest || input.destination || '';
    }
    if (input.content === undefined || input.content === null) {
      const candidateContent = input.text ?? input.body ?? input.file_content ?? input.contents ?? input.code ?? input.data ?? input.value ?? input.string;
      if (candidateContent !== undefined && candidateContent !== null) {
        input.content = typeof candidateContent === 'string' ? candidateContent : JSON.stringify(candidateContent);
      } else {
        // 【核心保障】：Claude Code 对 Write 强校验 content 必为 string！
        // 若模型省略了 content（例如新建空文件），强制赋值为空字符串 ""，绝不允许 undefined 导致 Zod 抛出 invalid_type!
        input.content = '';
      }
    } else if (typeof input.content !== 'string') {
      input.content = String(input.content);
    }
  }

  // 4. 针对 Edit 工具的强力补全与容错 (彻底杜绝 old_string / new_string 为 undefined 导致 Zod 报错)
  else if (targetName === 'edit') {
    if (!input.file_path) {
      input.file_path = input.path || input.filepath || input.target_file || input.filename || input.file || '';
    }
    if (typeof input.file_path !== 'string') input.file_path = String(input.file_path || '');

    if (input.old_string === undefined || input.old_string === null) {
      input.old_string = input.old_text ?? input.old_str ?? input.target_content ?? input.original_content ?? input.original ?? input.search ?? input.find ?? input.match ?? '';
    }
    if (input.new_string === undefined || input.new_string === null) {
      input.new_string = input.new_text ?? input.new_str ?? input.replacement_content ?? input.replacement ?? input.replace_string ?? input.replace ?? input.content ?? input.text ?? '';
    }
    if (typeof input.old_string !== 'string') input.old_string = String(input.old_string);
    if (typeof input.new_string !== 'string') input.new_string = String(input.new_string);

    if (input.replace_all === undefined && input.replaceAll !== undefined) {
      input.replace_all = input.replaceAll;
    }
    if (typeof input.replace_all === 'string') {
      input.replace_all = input.replace_all.toLowerCase() === 'true';
    }
  }

  // 5. 针对 Read 工具的强力补全与容错
  else if (targetName === 'read') {
    if (!input.file_path) {
      input.file_path = input.path || input.filepath || input.target_file || input.filename || input.file || '';
    }
  }

  // 6. 针对 Bash 工具的常见容错 (cmd -> command)
  else if (targetName === 'bash') {
    if (!input.command && input.cmd) input.command = input.cmd;
    if (!input.command && input.script) input.command = input.script;
    if (!input.command && typeof rawInput === 'string') input.command = rawInput;
    if (input.command === undefined || input.command === null) input.command = '';
    // 严格清理非 Bash schema 定义的参数，彻底杜绝 Claude Code Zod 报 unrecognized_keys input 错误！
    delete input.input;
    delete input.parameters;
    delete input.arguments;
    delete input.cmd;
    delete input.script;
  }

  // 7. 针对 Glob / Grep 工具的容错
  else if (targetName === 'glob' || targetName === 'grep') {
    if (!input.pattern && input.query) input.pattern = input.query;
    if (!input.pattern && input.regex) input.pattern = input.regex;
    if (!input.pattern && typeof rawInput === 'string') input.pattern = rawInput;
  }

  // 8. 针对 Skill 工具的强力补全与容错 (Claude Code 原生 Skill 调用规范)
  else if (targetName === 'skill') {
    if (!input.skill) {
      input.skill = input.name || input.skill_name || input.skillName || input.command || input.action || input.id || '';
    }
    if (typeof input.skill !== 'string') input.skill = String(input.skill || '');
    // 兼容模型带 / 前缀 (例如 /diagram-design -> diagram-design)
    if (input.skill.startsWith('/')) {
      input.skill = input.skill.substring(1).trim();
    }
    // args 处理: Claude Code 要求 args 为 optional string
    if (input.args !== undefined && input.args !== null) {
      if (typeof input.args !== 'string') {
        input.args = typeof input.args === 'object' ? JSON.stringify(input.args) : String(input.args);
      }
    } else if (input.arguments !== undefined && input.arguments !== null) {
      input.args = typeof input.arguments === 'string' ? input.arguments : JSON.stringify(input.arguments);
      delete input.arguments;
    } else if (input.params !== undefined && input.params !== null) {
      input.args = typeof input.params === 'string' ? input.params : JSON.stringify(input.params);
      delete input.params;
    }
  }

  // 9. 针对 Agent / Task 工具的强力补全与容错 (Claude Code 原生子智能体规范)
  else if (targetName === 'agent' || targetName === 'task') {
    if (!input.prompt) {
      input.prompt = input.task || input.description || input.instruction || input.message || input.query || '';
    }
    if (!input.subagent_type) {
      input.subagent_type = input.type || input.agent_type || input.agentType || 'general';
    }
    if (typeof input.prompt !== 'string') input.prompt = String(input.prompt || '');
    if (typeof input.subagent_type !== 'string') input.subagent_type = String(input.subagent_type || 'general');
  }

  // 10. 针对 SubagentHandback 工具的强力补全与容错 (Claude Code 原生子智能体交付汇报规范)
  else if (targetName === 'subagenthandback' || targetName === 'handback' || targetName === 'subagent_handback') {
    matchedName = 'SubagentHandback';
    if (input.message === undefined || input.message === null) {
      const candidateMsg = input.report ?? input.content ?? input.text ?? input.summary ?? input.result ?? input.output ?? input.data ?? '';
      input.message = typeof candidateMsg === 'string' ? candidateMsg : JSON.stringify(candidateMsg);
    } else if (typeof input.message !== 'string') {
      input.message = String(input.message);
    }
  }

  return { name: matchedName, input };
}

/**
 * 从完整文本中提取并解析工具调用 (全面容错标准 XML 与 DeepSeek 特有的 DSML 标记)
 */
export function extractToolCalls(rawText: string, tools?: ToolDefinition[]): { cleanText: string; toolCalls: ExtractedToolCall[] } {
  if (!rawText) return { cleanText: '', toolCalls: [] };

  const toolCalls: ExtractedToolCall[] = [];
  let text = rawText;

  // 1. 匹配 <tool_call>... 或 <tool>... 或 _call>...（支持标准 </tool_call> 及各类 DSML 闭合标记与碎片）
  const toolCallRegex = /(?:```(?:xml|json|tool_call)?\s*)?(?:<tool_call[^>]*>|<tool\b[^>]*>|(?<![</]tool)_call>)([\s\S]*?)(?:<\/tool_call\s*>|<\/tool\s*>|<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}[^>]*>|<\/invoke\s*>|<\/calls\s*>|(?=```)|$)(?:\s*<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}[^>]*>|\s*<\/invoke\s*>|\s*<\/calls\s*>|\s*<\/tool_call\s*>|\s*<\/tool\s*>)*(?:\s*```)?/gi;

  text = text.replace(toolCallRegex, (match, body) => {
    const trimmed = body.trim();
    if (!trimmed) return match;

    try {
      const cleanJson = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const obj = repairAndParseJson(cleanJson);
      const name = obj.name || obj.tool || obj.function?.name || 'Bash';
      let rawInput = obj.input || obj.parameters || obj.arguments || obj.function?.arguments;

      // 如果没有显式 input，但是根对象有参数字段，自动提升为 input
      if (!rawInput || typeof rawInput !== 'object' || Object.keys(rawInput).length === 0) {
        const rootProps: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (k !== 'name' && k !== 'tool' && k !== 'function' && k !== 'input' && k !== 'parameters' && k !== 'arguments') {
            rootProps[k] = v;
          }
        }
        rawInput = Object.keys(rootProps).length > 0 ? rootProps : (rawInput || {});
      }

      if (typeof rawInput === 'string') {
        rawInput = { command: rawInput };
      }

      const normalized = normalizeToolCall(name, rawInput, tools);
      toolCalls.push({
        id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: normalized.name,
        input: normalized.input,
      });
      return '';
    } catch (err) {
      return match;
    }
  });

  // 2. 匹配 ```tool_call ... ```
  const fenceRegex = /```tool_call\s*([\s\S]*?)\s*```/gi;
  text = text.replace(fenceRegex, (match, body) => {
    try {
      const obj = repairAndParseJson(body.trim());
      const name = obj.name || obj.tool;
      const rawInput = obj.input || obj.parameters || obj.arguments || {};
      if (name) {
        const normalized = normalizeToolCall(name, rawInput, tools);
        toolCalls.push({
          id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: normalized.name,
          input: normalized.input,
        });
        return '';
      }
    } catch {}
    return match;
  });

  // 3. 统一匹配 DeepSeek 原生 DSML (<｜｜DSML｜｜ invoke name="...">) 与标准 (<invoke name="...">)
  const invokeRegex = /<(?:[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*)?invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/(?:[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*)?invoke>/gi;
  text = text.replace(invokeRegex, (match, name, body) => {
    const input: Record<string, any> = {};
    const paramRegex = /<(?:[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*)?parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*)?parameter>/gi;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = paramRegex.exec(body)) !== null) {
      const pName = pMatch[1];
      const pVal = pMatch[2];
      if (['content', 'text', 'old_string', 'new_string', 'old_text', 'new_text'].includes(pName)) {
        input[pName] = pVal.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      } else if (pName === 'input' || pName === 'parameters' || pName === 'arguments') {
        const trimmedVal = pVal.trim();
        try {
          const parsedVal = JSON.parse(trimmedVal);
          if (typeof parsedVal === 'object' && parsedVal !== null && !Array.isArray(parsedVal)) {
            Object.assign(input, parsedVal);
          } else {
            input[pName] = trimmedVal;
          }
        } catch {
          input[pName] = trimmedVal;
        }
      } else {
        input[pName] = pVal.trim();
      }
    }
    const normalized = normalizeToolCall(name, input, tools);
    toolCalls.push({
      id: `toolu_dsml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: normalized.name,
      input: normalized.input,
    });
    return '';
  });

  const clean = stripOrphanToolTags(text).trim();
  return { cleanText: clean, toolCalls };
}

/**
 * 流式工具拦截器 (StreamToolInterceptor)
 * 具备流式前缀防泄漏缓冲池、DSML 容错与闭合标签解析自愈能力
 */
export class StreamToolInterceptor {
  private textBuffer: string = '';
  private tools?: ToolDefinition[];
  private onTextChunk: (text: string) => void;
  private onToolCall: (tc: ExtractedToolCall) => void;

  constructor(
    tools: ToolDefinition[] | undefined,
    onTextChunk: (text: string) => void,
    onToolCall: (tc: ExtractedToolCall) => void
  ) {
    this.tools = tools;
    this.onTextChunk = (txt: string) => {
      const cleaned = stripOrphanToolTags(txt);
      if (cleaned.trim().length === 0 && txt.trim().length > 0) {
        // 全是标签被清理后的残留空白，直接丢弃，不向客户端发送空内容块
        return;
      }
      if (cleaned.length > 0) {
        onTextChunk(cleaned);
      }
    };
    this.onToolCall = onToolCall;
  }

  public feed(chunk: string): void {
    if (!this.tools || this.tools.length === 0) {
      this.onTextChunk(chunk);
      return;
    }

    // 零拷贝极速快道 (Zero-copy Fast Path):
    // 若缓冲池为空且当前数据块不含任何潜在标签或残肢字符，直接直通输出，杜绝密集正则表达式计算开销
    if (this.textBuffer.length === 0) {
      const lower = chunk.toLowerCase();
      if (!chunk.includes('<') && !chunk.includes('_') && !chunk.includes('`') && !lower.includes('call') && !lower.includes('invoke')) {
        this.onTextChunk(chunk);
        return;
      }
    }

    this.textBuffer += chunk;

    // 自愈前缀残肢：若缓冲池以 tool_call>、_call> 开头或包含 <tool>_call>，自动缝合为标准 <tool_call>
    if (this.textBuffer.startsWith('tool_call>')) {
      this.textBuffer = '<' + this.textBuffer;
    } else if (this.textBuffer.startsWith('_call>')) {
      this.textBuffer = '<tool' + this.textBuffer;
    } else if (this.textBuffer.startsWith('<tool>_call>')) {
      this.textBuffer = this.textBuffer.replace(/^<tool>_call>/, '<tool_call>');
    }

    while (this.textBuffer.length > 0) {
      if (this.textBuffer.startsWith('tool_call>')) {
        this.textBuffer = '<' + this.textBuffer;
      } else if (this.textBuffer.startsWith('_call>')) {
        this.textBuffer = '<tool' + this.textBuffer;
      } else if (this.textBuffer.startsWith('<tool>_call>')) {
        this.textBuffer = this.textBuffer.replace(/^<tool>_call>/, '<tool_call>');
      }

      // 1. 检查是否存在工具调用起始标签 (严格使用负向后行断言，防止把 tool_call> 内部的 _call> 误判为独立标签)
      const tagStartIdx = this.textBuffer.search(/<tool_call|<tool\b|<tools\b|<calls\b|<invoke\b|<[｜|\uff5c]{1,2}DSML|<[｜|\uff5c]{1,2}tool|```tool_call|(?<![</]tool)_call>|\btool_call>/i);

      if (tagStartIdx !== -1) {
        // 发现工具调用标签开头：先将前面的普通文本安全输出
        if (tagStartIdx > 0) {
          this.outputSafeText(this.textBuffer.slice(0, tagStartIdx));
          this.textBuffer = this.textBuffer.slice(tagStartIdx);
        }

        let fullTagLen = 0;
        let closeTagMatch = false;

        const lowerBuf = this.textBuffer.toLowerCase();

        if (lowerBuf.startsWith('<tool_call') || lowerBuf.startsWith('<tool') || lowerBuf.startsWith('_call>') || lowerBuf.startsWith('tool_call>')) {
          // 容错匹配标准的 </tool_call> 以及各类闭合标记 (严禁在闭合正则中包含 _call>，防止把开头的 <tool_call> 误判为闭合)
          const dsmlCloseMatch = this.textBuffer.match(/(?:<\/tool_call\s*>|<\/tool\s*>|<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}[^>]*>|<\/invoke\s*>|<\/calls\s*>)/i);
          if (dsmlCloseMatch && dsmlCloseMatch.index !== undefined) {
            let endPos = dsmlCloseMatch.index + dsmlCloseMatch[0].length;
            const remaining = this.textBuffer.slice(endPos);
            // 贪婪扫描后续连续的 DSML 闭合标记与尾部回声
            const extraTags = remaining.match(/^(?:\s*<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}[^>]*>|\s*<\/invoke\s*>|\s*<\/calls\s*>|\s*<\/tool_call\s*>|\s*<\/tool\s*>|\s*(?<![</]tool)_call>|\s*(?<![</][\w\uff5c|]*)calls>|\s*SubagentHandback)*/i);
            if (extraTags) {
              endPos += extraTags[0].length;
            }
            fullTagLen = endPos;
            closeTagMatch = true;
          }
        } else if (this.textBuffer.match(/^<[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*calls/i) || lowerBuf.startsWith('<calls')) {
          // 容器为 calls，等待匹配的 </｜｜DSML｜｜ calls> 或 </calls> 闭合
          const dsmlClose = this.textBuffer.match(/(?:<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*calls>|<\/calls\s*>)/i);
          if (dsmlClose && dsmlClose.index !== undefined) {
            fullTagLen = dsmlClose.index + dsmlClose[0].length;
            closeTagMatch = true;
          }
        } else if (this.textBuffer.match(/^<[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*invoke/i)) {
          // 单个 invoke 调用，等待 </｜｜DSML｜｜ invoke> 闭合
          const dsmlClose = this.textBuffer.match(/<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*invoke>/i);
          if (dsmlClose && dsmlClose.index !== undefined) {
            let endPos = dsmlClose.index + dsmlClose[0].length;
            const remaining = this.textBuffer.slice(endPos);
            // 扫描后续连带闭合的 </｜｜DSML｜｜ calls> 或 </calls>
            const extraCalls = remaining.match(/^\s*(?:<\/[｜|\uff5c]{1,2}DSML[｜|\uff5c]{1,2}\s*calls>|<\/calls\s*>)/i);
            if (extraCalls) {
              endPos += extraCalls[0].length;
            }
            fullTagLen = endPos;
            closeTagMatch = true;
          }
        } else if (lowerBuf.startsWith('<invoke')) {
          const closeMatch = this.textBuffer.match(/<\/invoke\s*>/i);
          if (closeMatch && closeMatch.index !== undefined) {
            fullTagLen = closeMatch.index + closeMatch[0].length;
            closeTagMatch = true;
          }
        } else if (this.textBuffer.startsWith('```tool_call')) {
          const secondFence = this.textBuffer.slice(12).indexOf('```');
          if (secondFence !== -1) {
            fullTagLen = 12 + secondFence + 3;
            closeTagMatch = true;
          }
        }

        if (closeTagMatch && fullTagLen > 0) {
          const completeTag = this.textBuffer.slice(0, fullTagLen);
          this.textBuffer = this.textBuffer.slice(fullTagLen);

          const { toolCalls } = extractToolCalls(completeTag, this.tools);
          for (const tc of toolCalls) {
            this.onToolCall(tc);
          }
        } else {
          // 工具调用尚未完整闭合，保持在缓冲池中等待下一数据帧
          break;
        }
      } else {
        // 未发现工具调用开头。
        // 【核心本质法则】：检查末尾是否悬空着未闭合的标签或可能为残肢的片段
        const danglingMatch = this.textBuffer.match(/(?:<[^>]*|(?<![<>/]\w*)\b(?:_call|calls|invoke|parameter))$/i);
        if (danglingMatch && danglingMatch.index !== undefined && this.textBuffer.length - danglingMatch.index < 60) {
          const safeEnd = danglingMatch.index;
          if (safeEnd > 0) {
            this.outputSafeText(this.textBuffer.slice(0, safeEnd));
            this.textBuffer = this.textBuffer.slice(safeEnd);
          }
          break;
        }

        const lastLt = this.textBuffer.lastIndexOf('<');
        const lastGt = this.textBuffer.lastIndexOf('>');

        if (lastLt !== -1 && lastLt > lastGt) {
          if (this.textBuffer.length - lastLt > 1000) {
            this.outputSafeText(this.textBuffer);
            this.textBuffer = '';
            break;
          }

          if (lastLt > 0) {
            this.outputSafeText(this.textBuffer.slice(0, lastLt));
            this.textBuffer = this.textBuffer.slice(lastLt);
          }
          break;
        } else {
          this.outputSafeText(this.textBuffer);
          this.textBuffer = '';
          break;
        }
      }
    }
  }

  private outputSafeText(text: string): void {
    if (!text) return;
    this.onTextChunk(text);
  }

  public flush(): void {
    if (this.textBuffer.length > 0) {
      const { cleanText, toolCalls } = extractToolCalls(this.textBuffer, this.tools);
      for (const tc of toolCalls) {
        this.onToolCall(tc);
      }
      if (cleanText) {
        this.onTextChunk(cleanText);
      }
      this.textBuffer = '';
    }
  }
}
