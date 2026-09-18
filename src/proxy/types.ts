/**
 * DeepSeek Web 代理服务类型定义
 */

export interface ToolPropertySchema {
  type?: string;
  description?: string;
  enum?: string[];
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema?: {
    type?: string;
    properties?: Record<string, ToolPropertySchema>;
    required?: string[];
    [key: string]: any;
  };
}

export interface ExtractedToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface PowChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  difficulty: number;
  expire_at?: number;
  expireAt?: number;
  signature: string;
}

export interface PowAnswer {
  algorithm: string;
  challenge: string;
  salt: string;
  answer: number;
  signature: string;
  target_path?: string;
}

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string; [key: string]: any }>;
  is_error?: boolean;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicPayload {
  model?: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: string; text: string }>;
  tools?: ToolDefinition[];
  stream?: boolean;
  thinking?: {
    type: string;
    budget_tokens?: number;
  };
  max_tokens?: number;
}

export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface OpenAiPayload {
  model?: string;
  messages: OpenAiMessage[];
  tools?: Array<{
    type: 'function';
    function: ToolDefinition;
  }>;
  stream?: boolean;
  max_tokens?: number;
}
