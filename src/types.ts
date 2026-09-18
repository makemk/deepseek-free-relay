export type TokenStatus = 'valid' | 'expired' | 'missing';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string; // R1 深度思考推导过程
  thinkingTimeSeconds?: number;
  tokenSpeed?: number; // tok/s
  timestamp: number;
  model?: string;
  status?: 'sending' | 'thinking' | 'streaming' | 'done' | 'error';
  errorMessage?: string;
}

export interface ChatSession {
  id: string;
  deepseekSessionId?: string; // 远端 chat.deepseek.com 对应的会话 ID
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface PowChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  difficulty: number;
  signature: string;
  expireAt: number;
  expireAfter?: number;
}

export interface PowAnswer {
  algorithm: string;
  challenge: string;
  salt: string;
  answer: number;
  signature: string;
}

export interface StreamCallbacks {
  onReasoningChunk?: (delta: string, fullReasoning: string) => void;
  onTextChunk?: (delta: string, fullText: string) => void;
  onSpeedUpdate?: (speedToks: number) => void;
  onFinished?: (fullText: string, fullReasoning: string) => void;
  onError?: (error: Error) => void;
  onTokenExpired?: () => void;
  onCaptchaChallenge?: () => void;
}

export interface PresetSkill {
  id: string;
  name: string;
  command: string; // e.g. "/explain", "/refactor", "/bugfix"
  icon: string;
  description: string;
  systemPrompt: string;
  promptPrefix?: string;
}

export interface EditorContextData {
  fileName?: string;
  fileLanguage?: string;
  filePath?: string;
  selectedText?: string;
  selectionRange?: { startLine: number; endLine: number };
  diagnostics?: string; // linter/compiler 错误信息
}

export interface ToolCallPayload {
  name: string;
  parameters: Record<string, any>;
}

export interface RateLimiterOptions {
  minIntervalMs: number; // 连续请求最小安全冷却时间 (默认 2000ms)
  maxRetries: number;
  backoffFactor: number;
}
