import * as vscode from 'vscode';
import { PresetSkill } from '../types';

export class PresetManager {
  private globalState: vscode.Memento;

  private static defaultSkills: PresetSkill[] = [
    {
      id: 'explain',
      name: '代码深度解析',
      command: '/explain',
      icon: '💡',
      description: '逐行剖析代码实现、算法复杂度与潜在边界陷阱',
      systemPrompt: '你是一名资深技术专家。请深入解析提供的代码，从核心设计思想、运行逻辑、时间与空间复杂度、潜在缺陷及边界条件进行系统性讲解。',
      promptPrefix: '请帮我详细解析以下代码：\n',
    },
    {
      id: 'refactor',
      name: '重构与性能优化',
      command: '/refactor',
      icon: '⚡',
      description: '应用设计模式与现代编程范式提升可读性与性能',
      systemPrompt: '你是一名重构专家。请在保证行为完全一致的前提下，应用 Clean Code 与现代设计模式优化代码，消除代码坏味道，并给出修改前后的对比与理由。',
      promptPrefix: '请重构并优化以下代码：\n',
    },
    {
      id: 'bugfix',
      name: '缺陷排查与修复',
      command: '/bugfix',
      icon: '🐛',
      description: '定位空指针、并发竞争、内存泄露与逻辑漏洞',
      systemPrompt: '你是一名代码安全与排错专家。请细致审查代码，指出可能导致异常崩溃、内存泄漏或逻辑错误的潜在 Bug，并给出完整的安全修复方案。',
      promptPrefix: '请帮我审查并修复这段代码中的 Bug：\n',
    },
    {
      id: 'test',
      name: '单元测试生成',
      command: '/test',
      icon: '🧪',
      description: '自动推导边界用例，生成覆盖率高的测试代码',
      systemPrompt: '你是一名资深测试架构师。请根据提供的代码编写规范的单元测试，包含正常路径用例、边界值用例以及异常/报错断言。',
      promptPrefix: '请为以下代码编写高质量单元测试：\n',
    },
    {
      id: 'doc',
      name: '注释与文档编写',
      command: '/doc',
      icon: '📝',
      description: '为函数/类添加符合标准规范的 JSDoc/Docstring 注释',
      systemPrompt: '请为以下代码添加完整、符合该语言社区标准的 API 注释（如 JSDoc、Docstring），注明每个参数的类型、含义及返回值。',
      promptPrefix: '请为以下代码添加规范注释：\n',
    },
    {
      id: 'architect',
      name: '架构设计与评估',
      command: '/architect',
      icon: '🏛️',
      description: '评估模块解耦、扩展性、设计模式与微服务边界',
      systemPrompt: '你是一名资深软件架构师。请从高可用、高内聚低耦合、领域建模和未来可扩展性维度，对当前系统或模块设计提出架构演进意见。',
      promptPrefix: '请从架构师视角评估以下模块方案：\n',
    },
  ];

  constructor(context: vscode.ExtensionContext) {
    this.globalState = context.globalState;
  }

  public getSkills(): PresetSkill[] {
    const customSkills = this.globalState.get<PresetSkill[]>('deepseek.customSkills', []);
    return [...PresetManager.defaultSkills, ...customSkills];
  }

  public getSkillByCommand(command: string): PresetSkill | undefined {
    return this.getSkills().find((s) => s.command.toLowerCase() === command.toLowerCase());
  }

  public async addCustomSkill(skill: PresetSkill): Promise<void> {
    const customSkills = this.globalState.get<PresetSkill[]>('deepseek.customSkills', []);
    customSkills.push(skill);
    await this.globalState.update('deepseek.customSkills', customSkills);
  }
}

