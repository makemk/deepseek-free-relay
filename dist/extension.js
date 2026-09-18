"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode9 = __toESM(require("vscode"));

// src/services/tokenStorage.ts
var vscode = __toESM(require("vscode"));
var SECRET_KEY_USER_TOKEN = "deepseek.userToken";
var TokenStorage = class {
  secrets;
  extensionPath;
  _onTokenStatusChanged = new vscode.EventEmitter();
  onTokenStatusChanged = this._onTokenStatusChanged.event;
  currentStatus = "missing";
  constructor(context) {
    this.secrets = context.secrets;
    this.extensionPath = context.extensionPath;
    this.initStatus();
  }
  async initStatus() {
    const token = await this.getUserToken();
    if (!token) {
      this.currentStatus = "missing";
    } else if (this.isJwtExpired(token)) {
      this.currentStatus = "expired";
    } else {
      this.currentStatus = "valid";
      this.syncTokenToLocalConfig(token);
    }
  }
  getStatus() {
    return this.currentStatus;
  }
  setStatus(status) {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this._onTokenStatusChanged.fire(status);
    }
  }
  async getUserToken() {
    const token = await this.secrets.get(SECRET_KEY_USER_TOKEN);
    if (token) {
      this.syncTokenToLocalConfig(token);
    }
    return token;
  }
  async setUserToken(token) {
    const trimmed = token.trim();
    if (trimmed) {
      await this.secrets.store(SECRET_KEY_USER_TOKEN, trimmed);
      this.setStatus(this.isJwtExpired(trimmed) ? "expired" : "valid");
      this.syncTokenToLocalConfig(trimmed);
    } else {
      await this.secrets.delete(SECRET_KEY_USER_TOKEN);
      this.setStatus("missing");
      this.syncTokenToLocalConfig("");
    }
  }
  syncTokenToLocalConfig(token) {
    if (!token)
      return;
    try {
      const fs5 = require("fs");
      const path7 = require("path");
      const os3 = require("os");
      const homePath = path7.join(os3.homedir(), ".deepseek_token.json");
      let existingHome = {};
      if (fs5.existsSync(homePath)) {
        try {
          existingHome = JSON.parse(fs5.readFileSync(homePath, "utf-8"));
        } catch {
        }
      }
      const updateUrl = vscode.workspace.getConfiguration("deepseek").get("updateUrl", "https://github.com/makemk/deepseek-free-relay");
      const payload = {
        ...existingHome,
        userToken: token,
        updateUrl: updateUrl || "https://github.com/makemk/deepseek-free-relay"
      };
      fs5.writeFileSync(homePath, JSON.stringify(payload, null, 2), "utf-8");
      if (this.extensionPath) {
        const extConfigPath = path7.join(this.extensionPath, "config.json");
        fs5.writeFileSync(extConfigPath, JSON.stringify(payload, null, 2), "utf-8");
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const wsConfigPath = path7.join(workspaceRoot, "config.json");
        fs5.writeFileSync(wsConfigPath, JSON.stringify(payload, null, 2), "utf-8");
      }
    } catch {
    }
  }
  getModel() {
    const config = vscode.workspace.getConfiguration("deepseek");
    return config.get("model", "deepseek-web");
  }
  async setModel(model) {
    const config = vscode.workspace.getConfiguration("deepseek");
    await config.update("model", model, vscode.ConfigurationTarget.Global);
  }
  isSearchEnabled() {
    const config = vscode.workspace.getConfiguration("deepseek");
    return config.get("searchEnabled", true);
  }
  async setSearchEnabled(enabled) {
    const config = vscode.workspace.getConfiguration("deepseek");
    await config.update("searchEnabled", enabled, vscode.ConfigurationTarget.Global);
  }
  isDefaultThinkingOpen() {
    const config = vscode.workspace.getConfiguration("deepseek");
    return config.get("defaultThinkingOpen", true);
  }
  /**
   * 检查 JWT 令牌是否已经在本地时间戳上过期
   */
  isJwtExpired(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3)
        return false;
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      if (payload && typeof payload.exp === "number") {
        return Date.now() >= payload.exp * 1e3;
      }
    } catch {
    }
    return false;
  }
  /**
   * 处理 401 Unauthorized 认证失效，向用户展示直观的处理流程
   */
  async handleUnauthorized() {
    this.setStatus("expired");
    const action = await vscode.window.showErrorMessage(
      "DeepSeek \u7F51\u9875\u7248\u51ED\u8BC1 (userToken) \u5DF2\u8FC7\u671F\u6216\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u7F51\u9875\u83B7\u53D6\u6700\u65B0\u51ED\u636E\u3002",
      "\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u7F51\u9875",
      "\u66F4\u65B0 UserToken"
    );
    if (action === "\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u7F51\u9875") {
      vscode.env.openExternal(vscode.Uri.parse("https://chat.deepseek.com"));
    } else if (action === "\u66F4\u65B0 UserToken") {
      await this.promptSetUserToken();
    }
  }
  /**
   * 弹出引导输入网页版 UserToken 的交互弹窗
   */
  async promptSetUserToken() {
    const current = await this.getUserToken();
    const token = await vscode.window.showInputBox({
      title: "\u914D\u7F6E DeepSeek \u7F51\u9875\u7248 UserToken (\u514D API \u989D\u5EA6)",
      prompt: "\u6B65\u9AA4\uFF1A1. \u6D4F\u89C8\u5668\u6253\u5F00 chat.deepseek.com \u767B\u5F55 -> 2. \u6309 F12 \u6253\u5F00\u63A7\u5236\u53F0 -> 3. Application/\u5E94\u7528\u7A0B\u5E8F -> Local Storage -> \u590D\u5236 userToken \u7684\u503C",
      value: current || "",
      password: true,
      placeHolder: "\u4F8B\u5982: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      ignoreFocusOut: true
    });
    if (token !== void 0) {
      await this.setUserToken(token);
      if (token.trim()) {
        vscode.window.showInformationMessage("DeepSeek \u7F51\u9875\u7248 UserToken \u4FDD\u5B58\u6210\u529F\uFF01");
      } else {
        vscode.window.showInformationMessage("DeepSeek \u7F51\u9875\u7248 UserToken \u5DF2\u6E05\u9664\u3002");
      }
    }
    return token;
  }
};

// src/services/deepseekWebClient.ts
var path = __toESM(require("path"));

// src/services/powSolver.ts
var fs = __toESM(require("fs"));
var cachedWasm = null;
var textEncoder = new TextEncoder();
var PowSolver = class {
  /**
   * 载入并缓存 DeepSeek 官方同款 WebAssembly 模块
   */
  static async getWasmInstance(wasmPath) {
    if (cachedWasm) {
      return cachedWasm;
    }
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`PoW WASM file not found at: ${wasmPath}`);
    }
    const wasmBuffer = await fs.promises.readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasmBuffer, {});
    cachedWasm = instance.exports;
    return cachedWasm;
  }
  /**
   * 求解 DeepSeek Web 端下发的 PoW 算力挑战
   */
  static async solve(challenge, wasmPath, signal) {
    this.validateChallenge(challenge);
    if (signal?.aborted) {
      throw new Error("PoW solving aborted");
    }
    const wasm = await this.getWasmInstance(wasmPath);
    const prefix = `${challenge.salt}_${challenge.expireAt}_`;
    const target = challenge.challenge.toLowerCase();
    const retPtr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const challengeAllocation = this.writeWasmString(wasm, target);
    const prefixAllocation = this.writeWasmString(wasm, prefix);
    try {
      wasm.wasm_solve(
        retPtr,
        challengeAllocation.ptr,
        challengeAllocation.len,
        prefixAllocation.ptr,
        prefixAllocation.len,
        challenge.difficulty
      );
      const view = new DataView(wasm.memory.buffer);
      const status = view.getInt32(retPtr, true);
      const answer = view.getFloat64(retPtr + 8, true);
      if (status !== 1 || !Number.isSafeInteger(answer) || answer < 0) {
        throw new Error(`Failed to find PoW solution for difficulty ${challenge.difficulty}`);
      }
      return {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        answer,
        signature: challenge.signature
      };
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * 生成 DeepSeek 请求头 X-DS-PoW-Response
   */
  static buildPowHeader(answer, targetPath) {
    const payload = {
      algorithm: answer.algorithm,
      challenge: answer.challenge,
      salt: answer.salt,
      answer: answer.answer,
      signature: answer.signature,
      target_path: targetPath
    };
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }
  static validateChallenge(challenge) {
    if (challenge.algorithm !== "DeepSeekHashV1") {
      throw new Error(`Unsupported DeepSeek PoW algorithm: ${challenge.algorithm}`);
    }
    if (!/^[0-9a-f]{64}$/i.test(challenge.challenge)) {
      throw new Error("Invalid DeepSeek PoW challenge digest");
    }
    if (!Number.isSafeInteger(challenge.difficulty) || challenge.difficulty <= 0) {
      throw new Error(`Invalid DeepSeek PoW difficulty: ${challenge.difficulty}`);
    }
  }
  static writeWasmString(wasm, value) {
    const bytes = textEncoder.encode(value);
    const ptr = wasm.__wbindgen_export_0(bytes.length, 1);
    new Uint8Array(wasm.memory.buffer).set(bytes, ptr);
    return { ptr, len: bytes.length };
  }
};

// src/services/rateLimiter.ts
var vscode2 = __toESM(require("vscode"));
var RateLimiter = class _RateLimiter {
  static instance;
  lastRequestTime = 0;
  queue = Promise.resolve();
  challengeBlocked = false;
  challengeResolver = null;
  constructor() {
  }
  static getInstance() {
    if (!_RateLimiter.instance) {
      _RateLimiter.instance = new _RateLimiter();
    }
    return _RateLimiter.instance;
  }
  /**
   * 获取用户配置的最小请求间隔（毫秒），默认 2000ms
   */
  getMinIntervalMs() {
    const config = vscode2.workspace.getConfiguration("deepseek");
    return config.get("toolPacingIntervalMs", 2e3);
  }
  /**
   * 线程安全排队：确保连续的自动化调用留有安全时间间隔，防止触发网页端风控验证
   */
  async schedule(task) {
    const runTask = async () => {
      if (this.challengeBlocked) {
        await new Promise((resolve) => {
          this.challengeResolver = resolve;
        });
      }
      const now = Date.now();
      const minInterval = this.getMinIntervalMs();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < minInterval) {
        const waitTime = minInterval - timeSinceLast + Math.floor(Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      try {
        const result = await task();
        return result;
      } finally {
        this.lastRequestTime = Date.now();
      }
    };
    const nextInQueue = this.queue.then(runTask, runTask);
    this.queue = nextInQueue.then(() => {
    }, () => {
    });
    return nextInQueue;
  }
  /**
   * 触发人机验证/滑块拦截阻断
   */
  triggerChallengeBlocked() {
    this.challengeBlocked = true;
  }
  /**
   * 用户在浏览器完成验证后调用，唤醒所有挂起的请求继续执行
   */
  resumeAfterChallenge() {
    this.challengeBlocked = false;
    if (this.challengeResolver) {
      const resolve = this.challengeResolver;
      this.challengeResolver = null;
      resolve();
    }
  }
  isBlocked() {
    return this.challengeBlocked;
  }
};

// src/services/deepseekWebClient.ts
var DEEPSEEK_WEB_ORIGIN = "https://chat.deepseek.com";
var DeepSeekWebClient = class {
  tokenStorage;
  wasmPath;
  rateLimiter;
  constructor(tokenStorage, extensionPath) {
    this.tokenStorage = tokenStorage;
    this.wasmPath = path.join(extensionPath, "resources", "sha3_wasm_bg.wasm");
    this.rateLimiter = RateLimiter.getInstance();
  }
  /**
   * 通用请求头模拟 Chrome 浏览器环境
   */
  getClientHeaders(token) {
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "*/*",
      "Origin": DEEPSEEK_WEB_ORIGIN,
      "Referer": `${DEEPSEEK_WEB_ORIGIN}/`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "X-App-Version": "2.0.0",
      "X-Client-Platform": "web",
      "X-Client-Version": "1.0.0-always"
    };
  }
  /**
   * 创建新的远端会话
   */
  async createSession(signal) {
    return this.rateLimiter.schedule(async () => {
      const token = await this.tokenStorage.getUserToken();
      if (!token) {
        throw new Error("MISSING_TOKEN");
      }
      const res = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat_session/create`, {
        method: "POST",
        headers: this.getClientHeaders(token),
        body: JSON.stringify({}),
        signal
      });
      if (res.status === 401) {
        await this.tokenStorage.handleUnauthorized();
        throw new Error("TOKEN_EXPIRED");
      }
      if (res.status === 429 || res.status === 403) {
        this.rateLimiter.triggerChallengeBlocked();
        throw new Error("CAPTCHA_REQUIRED");
      }
      if (!res.ok) {
        throw new Error(`\u521B\u5EFA DeepSeek \u4F1A\u8BDD\u5931\u8D25: HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.data?.biz_code === 40101 || data?.code === 401) {
        await this.tokenStorage.handleUnauthorized();
        throw new Error("TOKEN_EXPIRED");
      }
      const sessionId = data?.data?.biz_data?.id || data?.data?.biz_data?.chat_session?.id || data?.data?.id;
      if (!sessionId) {
        throw new Error(`\u521B\u5EFA\u4F1A\u8BDD\u8FD4\u56DE\u503C\u5F02\u5E38: ${JSON.stringify(data)}`);
      }
      this.tokenStorage.setStatus("valid");
      return sessionId;
    });
  }
  /**
   * 获取并求解 PoW 算力挑战
   */
  async getPowHeaders(targetPath, signal) {
    const token = await this.tokenStorage.getUserToken();
    if (!token) {
      throw new Error("MISSING_TOKEN");
    }
    const res = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat/create_pow_challenge`, {
      method: "POST",
      headers: this.getClientHeaders(token),
      body: JSON.stringify({ target_path: targetPath }),
      signal
    });
    if (res.status === 401) {
      await this.tokenStorage.handleUnauthorized();
      throw new Error("TOKEN_EXPIRED");
    }
    if (res.status === 429 || res.status === 403) {
      this.rateLimiter.triggerChallengeBlocked();
      throw new Error("CAPTCHA_REQUIRED");
    }
    if (!res.ok) {
      throw new Error(`\u83B7\u53D6 PoW \u7B97\u529B\u6311\u6218\u5931\u8D25: HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawChallenge = data?.data?.biz_data?.challenge;
    if (!rawChallenge) {
      throw new Error(`PoW \u6311\u6218\u8F7D\u8377\u4E3A\u7A7A: ${JSON.stringify(data)}`);
    }
    const challenge = {
      algorithm: rawChallenge.algorithm,
      challenge: rawChallenge.challenge,
      salt: rawChallenge.salt,
      difficulty: rawChallenge.difficulty,
      signature: rawChallenge.signature,
      expireAt: rawChallenge.expire_at || rawChallenge.expireAt
    };
    const answer = await PowSolver.solve(challenge, this.wasmPath, signal);
    const powHeader = PowSolver.buildPowHeader(answer, targetPath);
    return {
      "X-DS-PoW-Response": powHeader
    };
  }
  /**
   * 流式提交对话提示词（经由 RateLimiter 限频保护与自动滑块拦截恢复）
   */
  async submitChat(sessionId, prompt, options, callbacks) {
    await this.rateLimiter.schedule(async () => {
      const token = await this.tokenStorage.getUserToken();
      if (!token) {
        callbacks.onError?.(new Error("\u672A\u914D\u7F6E DeepSeek \u7F51\u9875\u7248 UserToken\uFF0C\u8BF7\u5728\u4FA7\u8FB9\u680F\u53F3\u4E0A\u89D2\u70B9\u51FB\u8BBE\u7F6E\u56FE\u6807\u8FDB\u884C\u914D\u7F6E\u3002"));
        return;
      }
      let powHeaders;
      try {
        powHeaders = await this.getPowHeaders("/api/v0/chat/completion", options.signal);
      } catch (err) {
        if (err.message === "TOKEN_EXPIRED") {
          callbacks.onTokenExpired?.();
          return;
        }
        if (err.message === "CAPTCHA_REQUIRED") {
          callbacks.onCaptchaChallenge?.();
          return;
        }
        callbacks.onError?.(err);
        return;
      }
      const clientHeaders = this.getClientHeaders(token);
      const model = this.tokenStorage.getModel();
      const isThinking = options.thinkingEnabled ?? !model.includes("chat");
      const isSearch = options.searchEnabled ?? this.tokenStorage.isSearchEnabled();
      const requestBody = {
        chat_session_id: sessionId,
        parent_message_id: options.parentMessageId ?? null,
        model_type: isThinking ? "expert" : "default",
        prompt,
        ref_file_ids: [],
        thinking_enabled: isThinking,
        search_enabled: isSearch,
        action: null,
        preempt: false
      };
      let response;
      try {
        response = await fetch(`${DEEPSEEK_WEB_ORIGIN}/api/v0/chat/completion`, {
          method: "POST",
          headers: {
            ...clientHeaders,
            ...powHeaders
          },
          body: JSON.stringify(requestBody),
          signal: options.signal
        });
      } catch (err) {
        if (options.signal?.aborted)
          return;
        callbacks.onError?.(err);
        return;
      }
      if (response.status === 401) {
        await this.tokenStorage.handleUnauthorized();
        callbacks.onTokenExpired?.();
        return;
      }
      if (response.status === 429 || response.status === 403) {
        this.rateLimiter.triggerChallengeBlocked();
        callbacks.onCaptchaChallenge?.();
        callbacks.onError?.(new Error("\u7F51\u9875\u7AEF\u77ED\u65F6\u95F4\u5185\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u89E6\u53D1\u4E86\u4EBA\u673A\u9A8C\u8BC1\u6216\u9650\u6D41\u4FDD\u62A4\u3002"));
        return;
      }
      if (!response.ok || !response.body) {
        const errorText = await response.text();
        callbacks.onError?.(new Error(`DeepSeek \u63A5\u53E3\u9519\u8BEF (${response.status}): ${errorText}`));
        return;
      }
      await this.consumeSseStream(response.body, callbacks, options.signal);
    });
  }
  /**
   * 解码 DeepSeek SSE 流，精准切分 R1 思考过程（THINK）与正文输出（RESPONSE）
   */
  async consumeSseStream(body, callbacks, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullReasoning = "";
    let fullText = "";
    let lastSpeedEmit = Date.now();
    let emittedTokens = 0;
    const state = {
      fragmentTypes: [],
      currentIndex: -1,
      observed: false
    };
    try {
      while (true) {
        if (signal?.aborted)
          break;
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:"))
            continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]")
            continue;
          let parsed;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (parsed?.data?.biz_code === 40101 || parsed?.code === 401) {
            await this.tokenStorage.handleUnauthorized();
            callbacks.onTokenExpired?.();
            return;
          }
          const { textChunk, reasoningChunk } = this.extractStreamDelta(parsed, state);
          if (reasoningChunk) {
            fullReasoning += reasoningChunk;
            callbacks.onReasoningChunk?.(reasoningChunk, fullReasoning);
            emittedTokens += Math.ceil(reasoningChunk.length / 2);
          }
          if (textChunk) {
            fullText += textChunk;
            callbacks.onTextChunk?.(textChunk, fullText);
            emittedTokens += Math.ceil(textChunk.length / 2);
          }
          const now = Date.now();
          const elapsedSec = (now - lastSpeedEmit) / 1e3;
          if (elapsedSec >= 0.3 && emittedTokens > 0) {
            const speed = Math.round(emittedTokens / elapsedSec);
            callbacks.onSpeedUpdate?.(speed);
            lastSpeedEmit = now;
            emittedTokens = 0;
          }
        }
      }
      callbacks.onFinished?.(fullText, fullReasoning);
    } catch (err) {
      if (!signal?.aborted) {
        callbacks.onError?.(err);
      }
    } finally {
      reader.releaseLock();
    }
  }
  /**
   * 精确解析 DeepSeek JSON Patch 增量分片
   */
  extractStreamDelta(parsed, state) {
    let textChunk = "";
    let reasoningChunk = "";
    if (parsed?.o === "BATCH" && Array.isArray(parsed.v)) {
      for (const item of parsed.v) {
        const sub = this.extractStreamDelta(item, state);
        textChunk += sub.textChunk;
        reasoningChunk += sub.reasoningChunk;
      }
      return { textChunk, reasoningChunk };
    }
    if (parsed?.p === "response/fragments" && parsed?.o === "APPEND" && Array.isArray(parsed?.v)) {
      for (const frag of parsed.v) {
        const type = frag?.type ?? "RESPONSE";
        state.fragmentTypes.push(type);
        state.currentIndex = state.fragmentTypes.length - 1;
        if (frag?.content) {
          if (type === "THINK") {
            reasoningChunk += frag.content;
          } else {
            textChunk += frag.content;
          }
        }
      }
      return { textChunk, reasoningChunk };
    }
    if (typeof parsed?.p === "string" && (parsed.p.includes("thinking") || parsed.p.includes("reasoning"))) {
      if (typeof parsed?.v === "string") {
        reasoningChunk += parsed.v;
      }
      return { textChunk, reasoningChunk };
    }
    if (!parsed?.p && typeof parsed?.v === "string") {
      const currentType = state.fragmentTypes[state.currentIndex] ?? "RESPONSE";
      if (currentType === "THINK") {
        reasoningChunk += parsed.v;
      } else {
        textChunk += parsed.v;
      }
      return { textChunk, reasoningChunk };
    }
    const delta = parsed?.choices?.[0]?.delta;
    if (delta) {
      if (delta.reasoning_content) {
        reasoningChunk += delta.reasoning_content;
      }
      if (delta.content) {
        textChunk += delta.content;
      }
    }
    return { textChunk, reasoningChunk };
  }
};

// src/services/presetManager.ts
var PresetManager = class _PresetManager {
  globalState;
  static defaultSkills = [
    {
      id: "explain",
      name: "\u4EE3\u7801\u6DF1\u5EA6\u89E3\u6790",
      command: "/explain",
      icon: "\u{1F4A1}",
      description: "\u9010\u884C\u5256\u6790\u4EE3\u7801\u5B9E\u73B0\u3001\u7B97\u6CD5\u590D\u6742\u5EA6\u4E0E\u6F5C\u5728\u8FB9\u754C\u9677\u9631",
      systemPrompt: "\u4F60\u662F\u4E00\u540D\u8D44\u6DF1\u6280\u672F\u4E13\u5BB6\u3002\u8BF7\u6DF1\u5165\u89E3\u6790\u63D0\u4F9B\u7684\u4EE3\u7801\uFF0C\u4ECE\u6838\u5FC3\u8BBE\u8BA1\u601D\u60F3\u3001\u8FD0\u884C\u903B\u8F91\u3001\u65F6\u95F4\u4E0E\u7A7A\u95F4\u590D\u6742\u5EA6\u3001\u6F5C\u5728\u7F3A\u9677\u53CA\u8FB9\u754C\u6761\u4EF6\u8FDB\u884C\u7CFB\u7EDF\u6027\u8BB2\u89E3\u3002",
      promptPrefix: "\u8BF7\u5E2E\u6211\u8BE6\u7EC6\u89E3\u6790\u4EE5\u4E0B\u4EE3\u7801\uFF1A\n"
    },
    {
      id: "refactor",
      name: "\u91CD\u6784\u4E0E\u6027\u80FD\u4F18\u5316",
      command: "/refactor",
      icon: "\u26A1",
      description: "\u5E94\u7528\u8BBE\u8BA1\u6A21\u5F0F\u4E0E\u73B0\u4EE3\u7F16\u7A0B\u8303\u5F0F\u63D0\u5347\u53EF\u8BFB\u6027\u4E0E\u6027\u80FD",
      systemPrompt: "\u4F60\u662F\u4E00\u540D\u91CD\u6784\u4E13\u5BB6\u3002\u8BF7\u5728\u4FDD\u8BC1\u884C\u4E3A\u5B8C\u5168\u4E00\u81F4\u7684\u524D\u63D0\u4E0B\uFF0C\u5E94\u7528 Clean Code \u4E0E\u73B0\u4EE3\u8BBE\u8BA1\u6A21\u5F0F\u4F18\u5316\u4EE3\u7801\uFF0C\u6D88\u9664\u4EE3\u7801\u574F\u5473\u9053\uFF0C\u5E76\u7ED9\u51FA\u4FEE\u6539\u524D\u540E\u7684\u5BF9\u6BD4\u4E0E\u7406\u7531\u3002",
      promptPrefix: "\u8BF7\u91CD\u6784\u5E76\u4F18\u5316\u4EE5\u4E0B\u4EE3\u7801\uFF1A\n"
    },
    {
      id: "bugfix",
      name: "\u7F3A\u9677\u6392\u67E5\u4E0E\u4FEE\u590D",
      command: "/bugfix",
      icon: "\u{1F41B}",
      description: "\u5B9A\u4F4D\u7A7A\u6307\u9488\u3001\u5E76\u53D1\u7ADE\u4E89\u3001\u5185\u5B58\u6CC4\u9732\u4E0E\u903B\u8F91\u6F0F\u6D1E",
      systemPrompt: "\u4F60\u662F\u4E00\u540D\u4EE3\u7801\u5B89\u5168\u4E0E\u6392\u9519\u4E13\u5BB6\u3002\u8BF7\u7EC6\u81F4\u5BA1\u67E5\u4EE3\u7801\uFF0C\u6307\u51FA\u53EF\u80FD\u5BFC\u81F4\u5F02\u5E38\u5D29\u6E83\u3001\u5185\u5B58\u6CC4\u6F0F\u6216\u903B\u8F91\u9519\u8BEF\u7684\u6F5C\u5728 Bug\uFF0C\u5E76\u7ED9\u51FA\u5B8C\u6574\u7684\u5B89\u5168\u4FEE\u590D\u65B9\u6848\u3002",
      promptPrefix: "\u8BF7\u5E2E\u6211\u5BA1\u67E5\u5E76\u4FEE\u590D\u8FD9\u6BB5\u4EE3\u7801\u4E2D\u7684 Bug\uFF1A\n"
    },
    {
      id: "test",
      name: "\u5355\u5143\u6D4B\u8BD5\u751F\u6210",
      command: "/test",
      icon: "\u{1F9EA}",
      description: "\u81EA\u52A8\u63A8\u5BFC\u8FB9\u754C\u7528\u4F8B\uFF0C\u751F\u6210\u8986\u76D6\u7387\u9AD8\u7684\u6D4B\u8BD5\u4EE3\u7801",
      systemPrompt: "\u4F60\u662F\u4E00\u540D\u8D44\u6DF1\u6D4B\u8BD5\u67B6\u6784\u5E08\u3002\u8BF7\u6839\u636E\u63D0\u4F9B\u7684\u4EE3\u7801\u7F16\u5199\u89C4\u8303\u7684\u5355\u5143\u6D4B\u8BD5\uFF0C\u5305\u542B\u6B63\u5E38\u8DEF\u5F84\u7528\u4F8B\u3001\u8FB9\u754C\u503C\u7528\u4F8B\u4EE5\u53CA\u5F02\u5E38/\u62A5\u9519\u65AD\u8A00\u3002",
      promptPrefix: "\u8BF7\u4E3A\u4EE5\u4E0B\u4EE3\u7801\u7F16\u5199\u9AD8\u8D28\u91CF\u5355\u5143\u6D4B\u8BD5\uFF1A\n"
    },
    {
      id: "doc",
      name: "\u6CE8\u91CA\u4E0E\u6587\u6863\u7F16\u5199",
      command: "/doc",
      icon: "\u{1F4DD}",
      description: "\u4E3A\u51FD\u6570/\u7C7B\u6DFB\u52A0\u7B26\u5408\u6807\u51C6\u89C4\u8303\u7684 JSDoc/Docstring \u6CE8\u91CA",
      systemPrompt: "\u8BF7\u4E3A\u4EE5\u4E0B\u4EE3\u7801\u6DFB\u52A0\u5B8C\u6574\u3001\u7B26\u5408\u8BE5\u8BED\u8A00\u793E\u533A\u6807\u51C6\u7684 API \u6CE8\u91CA\uFF08\u5982 JSDoc\u3001Docstring\uFF09\uFF0C\u6CE8\u660E\u6BCF\u4E2A\u53C2\u6570\u7684\u7C7B\u578B\u3001\u542B\u4E49\u53CA\u8FD4\u56DE\u503C\u3002",
      promptPrefix: "\u8BF7\u4E3A\u4EE5\u4E0B\u4EE3\u7801\u6DFB\u52A0\u89C4\u8303\u6CE8\u91CA\uFF1A\n"
    },
    {
      id: "architect",
      name: "\u67B6\u6784\u8BBE\u8BA1\u4E0E\u8BC4\u4F30",
      command: "/architect",
      icon: "\u{1F3DB}\uFE0F",
      description: "\u8BC4\u4F30\u6A21\u5757\u89E3\u8026\u3001\u6269\u5C55\u6027\u3001\u8BBE\u8BA1\u6A21\u5F0F\u4E0E\u5FAE\u670D\u52A1\u8FB9\u754C",
      systemPrompt: "\u4F60\u662F\u4E00\u540D\u8D44\u6DF1\u8F6F\u4EF6\u67B6\u6784\u5E08\u3002\u8BF7\u4ECE\u9AD8\u53EF\u7528\u3001\u9AD8\u5185\u805A\u4F4E\u8026\u5408\u3001\u9886\u57DF\u5EFA\u6A21\u548C\u672A\u6765\u53EF\u6269\u5C55\u6027\u7EF4\u5EA6\uFF0C\u5BF9\u5F53\u524D\u7CFB\u7EDF\u6216\u6A21\u5757\u8BBE\u8BA1\u63D0\u51FA\u67B6\u6784\u6F14\u8FDB\u610F\u89C1\u3002",
      promptPrefix: "\u8BF7\u4ECE\u67B6\u6784\u5E08\u89C6\u89D2\u8BC4\u4F30\u4EE5\u4E0B\u6A21\u5757\u65B9\u6848\uFF1A\n"
    }
  ];
  constructor(context) {
    this.globalState = context.globalState;
  }
  getSkills() {
    const customSkills = this.globalState.get("deepseek.customSkills", []);
    return [..._PresetManager.defaultSkills, ...customSkills];
  }
  getSkillByCommand(command) {
    return this.getSkills().find((s) => s.command.toLowerCase() === command.toLowerCase());
  }
  async addCustomSkill(skill) {
    const customSkills = this.globalState.get("deepseek.customSkills", []);
    customSkills.push(skill);
    await this.globalState.update("deepseek.customSkills", customSkills);
  }
};

// src/services/proxyManager.ts
var vscode3 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var import_child_process = require("child_process");
var ProxyManager = class _ProxyManager {
  static instance;
  process = null;
  outputChannel;
  constructor() {
    this.outputChannel = vscode3.window.createOutputChannel("DeepSeek Web Proxy");
  }
  static getInstance() {
    if (!_ProxyManager.instance) {
      _ProxyManager.instance = new _ProxyManager();
    }
    return _ProxyManager.instance;
  }
  isRunning() {
    return this.process !== null && !this.process.killed;
  }
  start(extensionPath, token) {
    if (this.isRunning()) {
      vscode3.window.showInformationMessage("DeepSeek Web \u672C\u5730\u4EE3\u7406\u670D\u52A1\u5DF2\u5728\u8FD0\u884C\u4E2D (\u7AEF\u53E3: 9999)");
      return;
    }
    const scriptPath = path2.join(extensionPath, "bin", "proxy-server.js");
    this.outputChannel.appendLine(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] \u6B63\u5728\u542F\u52A8 DeepSeek Web \u672C\u5730\u4EE3\u7406\u670D\u52A1...`);
    try {
      this.process = (0, import_child_process.fork)(scriptPath, [], {
        env: {
          ...process.env,
          PORT: "9999",
          DEEPSEEK_USER_TOKEN: token || process.env.DEEPSEEK_USER_TOKEN || ""
        },
        silent: true
      });
      this.process.stdout?.on("data", (data) => {
        const text = data.toString();
        this.outputChannel.append(text);
      });
      this.process.stderr?.on("data", (data) => {
        const text = data.toString();
        this.outputChannel.append(`[ERROR] ${text}`);
      });
      this.process.on("exit", (code) => {
        this.outputChannel.appendLine(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] \u4EE3\u7406\u8FDB\u7A0B\u9000\u51FA\uFF0C\u9000\u51FA\u7801: ${code}`);
        this.process = null;
      });
      vscode3.window.showInformationMessage("DeepSeek Web \u4EE3\u7406\u670D\u52A1\u5DF2\u5C31\u7EEA (http://127.0.0.1:9999)");
    } catch (err) {
      this.outputChannel.appendLine(`[ERROR] \u542F\u52A8\u4EE3\u7406\u5931\u8D25: ${err.message}`);
      vscode3.window.showErrorMessage(`\u542F\u52A8\u4EE3\u7406\u5931\u8D25: ${err.message}`);
    }
  }
  restart(extensionPath, token) {
    this.stop();
    setTimeout(() => {
      this.start(extensionPath, token);
    }, 600);
  }
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.outputChannel.appendLine(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] \u5DF2\u505C\u6B62\u672C\u5730\u4EE3\u7406\u670D\u52A1\u3002`);
      vscode3.window.showInformationMessage("\u5DF2\u505C\u6B62 DeepSeek Web \u672C\u5730\u4EE3\u7406\u670D\u52A1\u3002");
    }
  }
};

// src/services/claudeConfigManager.ts
var vscode4 = __toESM(require("vscode"));
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var os = __toESM(require("os"));
var ClaudeConfigManager = class _ClaudeConfigManager {
  static instance;
  constructor() {
  }
  static getInstance() {
    if (!_ClaudeConfigManager.instance) {
      _ClaudeConfigManager.instance = new _ClaudeConfigManager();
    }
    return _ClaudeConfigManager.instance;
  }
  /**
   * 获取项目级配置文件路径
   */
  getLocalSettingsPath() {
    const workspaceFolders = vscode4.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return path3.join(workspaceFolders[0].uri.fsPath, ".claude", "settings.local.json");
    }
    return null;
  }
  /**
   * 获取用户级全局配置文件路径
   */
  getGlobalSettingsPath() {
    return path3.join(os.homedir(), ".claude", "settings.json");
  }
  /**
   * 检查 Claude Code 是否已配置为使用本地 9999 代理
   */
  isEnabled() {
    const localPath = this.getLocalSettingsPath();
    if (localPath && fs2.existsSync(localPath)) {
      try {
        const data = JSON.parse(fs2.readFileSync(localPath, "utf-8"));
        if (data?.env?.ANTHROPIC_BASE_URL?.includes("9999"))
          return true;
      } catch {
      }
    }
    const globalPath = this.getGlobalSettingsPath();
    if (fs2.existsSync(globalPath)) {
      try {
        const data = JSON.parse(fs2.readFileSync(globalPath, "utf-8"));
        if (data?.env?.ANTHROPIC_BASE_URL?.includes("9999"))
          return true;
      } catch {
      }
    }
    return false;
  }
  /**
   * 一键开启 Claude Code 配置 (同时写入项目 local 配置、全局配置和 VS Code 设置)
   */
  async enable() {
    try {
      const localPath = this.getLocalSettingsPath();
      if (localPath) {
        const dir = path3.dirname(localPath);
        if (!fs2.existsSync(dir))
          fs2.mkdirSync(dir, { recursive: true });
        let data = {};
        if (fs2.existsSync(localPath)) {
          try {
            data = JSON.parse(fs2.readFileSync(localPath, "utf-8"));
          } catch {
          }
        }
        if (!data.env || typeof data.env !== "object")
          data.env = {};
        data.allowedTools = ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "Skill", "Agent", "Task"];
        data.permissions = { defaultMode: "bypassPermissions" };
        data.autoCompactWindow = 45e3;
        data.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9999";
        data.env.ANTHROPIC_AUTH_TOKEN = "dummy";
        data.env.ANTHROPIC_MODEL = "deepseek-chat-web";
        data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-chat-web";
        data.env.ANTHROPIC_DEFAULT_SONNET_MODEL = "deepseek-chat-web";
        data.env.ANTHROPIC_DEFAULT_OPUS_MODEL = "deepseek-chat-web";
        data.env.CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-chat-web";
        data.env.CLAUDE_CODE_EFFORT_LEVEL = "low";
        data.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = "64000";
        data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = "45000";
        data.env.DEEPSEEK_ENABLE_SEARCH = "true";
        data.model = "deepseek-chat-web";
        fs2.writeFileSync(localPath, JSON.stringify(data, null, 2), "utf-8");
      }
      const globalPath = this.getGlobalSettingsPath();
      const globalDir = path3.dirname(globalPath);
      if (!fs2.existsSync(globalDir))
        fs2.mkdirSync(globalDir, { recursive: true });
      let gData = {};
      if (fs2.existsSync(globalPath)) {
        try {
          gData = JSON.parse(fs2.readFileSync(globalPath, "utf-8"));
        } catch {
        }
      }
      if (!gData.env || typeof gData.env !== "object")
        gData.env = {};
      gData.allowedTools = ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "Skill", "Agent", "Task"];
      gData.permissions = { defaultMode: "bypassPermissions" };
      gData.autoCompactWindow = 45e3;
      gData.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9999";
      gData.env.ANTHROPIC_AUTH_TOKEN = "dummy";
      gData.env.ANTHROPIC_MODEL = "deepseek-chat-web";
      gData.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-chat-web";
      gData.env.ANTHROPIC_DEFAULT_SONNET_MODEL = "deepseek-chat-web";
      gData.env.ANTHROPIC_DEFAULT_OPUS_MODEL = "deepseek-chat-web";
      gData.env.CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-chat-web";
      gData.env.CLAUDE_CODE_EFFORT_LEVEL = "low";
      gData.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = "64000";
      gData.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = "45000";
      gData.env.DEEPSEEK_ENABLE_SEARCH = "true";
      gData.model = "deepseek-chat-web";
      fs2.writeFileSync(globalPath, JSON.stringify(gData, null, 2), "utf-8");
      try {
        const claudeCfg = vscode4.workspace.getConfiguration("claudeCode");
        await claudeCfg.update("environmentVariables", [
          { name: "ANTHROPIC_BASE_URL", value: "http://127.0.0.1:9999" },
          { name: "ANTHROPIC_AUTH_TOKEN", value: "dummy" },
          { name: "ANTHROPIC_MODEL", value: "deepseek-chat-web" },
          { name: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: "deepseek-chat-web" },
          { name: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: "deepseek-chat-web" },
          { name: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: "deepseek-chat-web" },
          { name: "CLAUDE_CODE_MAX_CONTEXT_TOKENS", value: "64000" },
          { name: "CLAUDE_CODE_AUTO_COMPACT_WINDOW", value: "45000" }
        ], vscode4.ConfigurationTarget.Global);
      } catch {
      }
      vscode4.window.showInformationMessage("\u2705 \u5DF2\u5F00\u542F Claude Code \u76F4\u8FDE\u914D\u7F6E\uFF01\u5DF2\u540C\u6B65\u914D\u7F6E\u9879\u76EE\u3001\u5168\u5C40\u4E0E\u63D2\u4EF6\u73AF\u5883\u3002");
      return true;
    } catch (err) {
      vscode4.window.showErrorMessage(`\u5F00\u542F Claude Code \u914D\u7F6E\u5931\u8D25: ${err.message}`);
      return false;
    }
  }
  /**
   * 一键关闭 Claude Code 配置，恢复默认
   */
  async disable() {
    try {
      const localPath = this.getLocalSettingsPath();
      if (localPath && fs2.existsSync(localPath)) {
        try {
          const data = JSON.parse(fs2.readFileSync(localPath, "utf-8"));
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
            if (Object.keys(data.env).length === 0)
              delete data.env;
            fs2.writeFileSync(localPath, JSON.stringify(data, null, 2), "utf-8");
          }
        } catch {
        }
      }
      const globalPath = this.getGlobalSettingsPath();
      if (fs2.existsSync(globalPath)) {
        try {
          const gData = JSON.parse(fs2.readFileSync(globalPath, "utf-8"));
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
            if (Object.keys(gData.env).length === 0)
              delete gData.env;
            if (gData.model === "deepseek-web" || gData.model === "deepseek-chat-web")
              delete gData.model;
            fs2.writeFileSync(globalPath, JSON.stringify(gData, null, 2), "utf-8");
          }
        } catch {
        }
      }
      try {
        const claudeCfg = vscode4.workspace.getConfiguration("claudeCode");
        await claudeCfg.update("environmentVariables", void 0, vscode4.ConfigurationTarget.Global);
      } catch {
      }
      vscode4.window.showInformationMessage("\u5DF2\u5173\u95ED Claude Code \u76F4\u8FDE\u914D\u7F6E\uFF0C\u6062\u590D\u5B98\u65B9\u9ED8\u8BA4\u8BBE\u7F6E\u3002");
      return true;
    } catch (err) {
      vscode4.window.showErrorMessage(`\u5173\u95ED Claude Code \u914D\u7F6E\u5931\u8D25: ${err.message}`);
      return false;
    }
  }
  /**
   * 切换开启/关闭状态
   */
  async toggle() {
    if (this.isEnabled()) {
      return await this.disable();
    } else {
      return await this.enable();
    }
  }
};

// src/services/updateManager.ts
var vscode5 = __toESM(require("vscode"));
var fs3 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var os2 = __toESM(require("os"));
var DEFAULT_GITHUB_REPO_URL = "https://github.com/makemk/deepseek-free-relay";
var UpdateManager = class _UpdateManager {
  static instance;
  context;
  currentVersion;
  constructor(context) {
    this.context = context;
    this.currentVersion = context.extension?.packageJSON?.version || "1.1.0";
  }
  static getInstance(context) {
    if (!_UpdateManager.instance && context) {
      _UpdateManager.instance = new _UpdateManager(context);
    }
    return _UpdateManager.instance;
  }
  getCurrentVersion() {
    return this.currentVersion;
  }
  /**
   * 获取当前配置的更新地址（如未配置或为空则使用默认 GitHub 仓库地址）
   */
  getUpdateUrl() {
    const config = vscode5.workspace.getConfiguration("deepseek");
    const configuredUrl = config.get("updateUrl", "").trim();
    return configuredUrl || DEFAULT_GITHUB_REPO_URL;
  }
  /**
   * 设置更新地址
   */
  async setUpdateUrl(url) {
    const config = vscode5.workspace.getConfiguration("deepseek");
    await config.update("updateUrl", url.trim(), vscode5.ConfigurationTarget.Global);
  }
  /**
   * 弹出输入框供用户快捷配置更新源
   */
  async promptSetUpdateUrl() {
    const current = this.getUpdateUrl();
    const result = await vscode5.window.showInputBox({
      title: "\u914D\u7F6E DeepSeek Web \u63D2\u4EF6\u66F4\u65B0\u5730\u5740",
      prompt: "\u652F\u6301 GitHub \u4ED3\u5E93\u94FE\u63A5\uFF08\u5982 https://github.com/deepseek/vscode-deepseek-web \uFF09\u3001Release API \u94FE\u63A5\u6216\u81EA\u5B9A\u4E49\u7248\u672C JSON \u5730\u5740\u3002\u7559\u7A7A\u6062\u590D\u9ED8\u8BA4\u3002",
      value: current === DEFAULT_GITHUB_REPO_URL ? "" : current,
      placeHolder: DEFAULT_GITHUB_REPO_URL
    });
    if (result !== void 0) {
      const targetUrl = result.trim();
      await this.setUpdateUrl(targetUrl);
      const displayUrl = targetUrl || DEFAULT_GITHUB_REPO_URL;
      vscode5.window.showInformationMessage(`\u5DF2\u8BBE\u7F6E\u66F4\u65B0\u5730\u5740\u4E3A: ${displayUrl}`);
    }
  }
  /**
   * 是否开启启动时自动检查更新
   */
  isAutoCheckEnabled() {
    const config = vscode5.workspace.getConfiguration("deepseek");
    return config.get("autoCheckUpdates", true);
  }
  /**
   * 将用户填写的各类 URL 规范化为可供 HTTP 请求的端点
   * 1. GitHub 仓库主页: https://github.com/:owner/:repo -> https://api.github.com/repos/:owner/:repo/releases/latest
   * 2. GitHub Releases 页面: https://github.com/:owner/:repo/releases -> https://api.github.com/repos/:owner/:repo/releases/latest
   * 3. 其它原生 API 或自定义 JSON 地址 -> 原样使用
   */
  normalizeUpdateUrl(inputUrl) {
    let url = (inputUrl || "").trim();
    if (!url) {
      url = DEFAULT_GITHUB_REPO_URL;
    }
    const githubRepoRegex = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\/(?:releases(?:\/latest)?)?)?\/?$/i;
    const match = url.match(githubRepoRegex);
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/i, "");
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
  static compareVersions(versionA, versionB) {
    const cleanA = (versionA || "").trim().replace(/^[vV]/, "");
    const cleanB = (versionB || "").trim().replace(/^[vV]/, "");
    const partsA = cleanA.split(".").map((p) => parseInt(p, 10) || 0);
    const partsB = cleanB.split(".").map((p) => parseInt(p, 10) || 0);
    const maxLength = Math.max(partsA.length, partsB.length, 3);
    for (let i = 0; i < maxLength; i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;
      if (a > b)
        return 1;
      if (a < b)
        return -1;
    }
    return 0;
  }
  /**
   * 请求远程更新源并解析版本元数据
   */
  async fetchUpdateInfo() {
    const rawUrl = this.getUpdateUrl();
    const endpoint = this.normalizeUpdateUrl(rawUrl);
    const headers = {
      "User-Agent": "VSCode-DeepSeek-Web-Updater/1.1.0 (VSCode Extension)",
      "Accept": "application/vnd.github.v3+json, application/json;q=0.9, */*;q=0.8"
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12e3);
    try {
      const res = await fetch(endpoint, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      let remoteVersion = "";
      let releaseNotes = "";
      let releaseUrl = "";
      let downloadUrl = "";
      let publishedAt = "";
      if (data && typeof data === "object") {
        if (data.tag_name || data.name) {
          remoteVersion = (data.tag_name || data.name || "").replace(/^[vV]/, "").trim();
          releaseNotes = data.body || "";
          releaseUrl = data.html_url || "";
          publishedAt = data.published_at || "";
          if (Array.isArray(data.assets)) {
            const vsixAsset = data.assets.find(
              (asset) => asset && typeof asset.name === "string" && asset.name.toLowerCase().endsWith(".vsix")
            );
            if (vsixAsset && vsixAsset.browser_download_url) {
              downloadUrl = vsixAsset.browser_download_url;
            }
          }
        } else if (data.version) {
          remoteVersion = String(data.version).replace(/^[vV]/, "").trim();
          releaseNotes = data.notes || data.description || "";
          releaseUrl = data.releaseUrl || data.url || "";
          downloadUrl = data.downloadUrl || data.vsixUrl || "";
          publishedAt = data.publishedAt || "";
        }
      }
      if (!remoteVersion) {
        throw new Error("\u672A\u80FD\u4ECE\u66F4\u65B0\u670D\u52A1\u5668\u89E3\u6790\u51FA\u6709\u6548\u7684\u7248\u672C\u53F7");
      }
      const isNewer = _UpdateManager.compareVersions(remoteVersion, this.currentVersion) > 0;
      return {
        version: remoteVersion,
        currentVersion: this.currentVersion,
        isNewer,
        releaseNotes,
        releaseUrl,
        downloadUrl,
        publishedAt
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("\u68C0\u67E5\u66F4\u65B0\u8BF7\u6C42\u8D85\u65F6 (12\u79D2)");
      }
      throw err;
    }
  }
  /**
   * 检查更新入口
   * @param manual 是否由用户手动点击触发（手动触发时即使没有更新也会弹出提示，自动触发则静默无打扰）
   */
  async checkForUpdates(manual = false) {
    if (manual) {
      await vscode5.window.withProgress(
        {
          location: vscode5.ProgressLocation.Notification,
          title: "\u6B63\u5728\u68C0\u67E5 DeepSeek Web \u66F4\u65B0...",
          cancellable: false
        },
        async () => {
          await this.doCheck(true);
        }
      );
    } else {
      await this.doCheck(false);
    }
  }
  async doCheck(manual) {
    try {
      const updateInfo = await this.fetchUpdateInfo();
      if (updateInfo.isNewer) {
        await this.promptUserForUpdate(updateInfo);
      } else {
        if (manual) {
          vscode5.window.showInformationMessage(
            `\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C (v${this.currentVersion})\u3002\u66F4\u65B0\u6E90: ${this.getUpdateUrl()}`
          );
        }
      }
    } catch (err) {
      if (manual) {
        const setUrlAction = "\u914D\u7F6E\u66F4\u65B0\u6E90";
        const choice = await vscode5.window.showErrorMessage(
          `\u68C0\u67E5\u66F4\u65B0\u5931\u8D25: ${err.message}`,
          setUrlAction
        );
        if (choice === setUrlAction) {
          await this.promptSetUpdateUrl();
        }
      } else {
        console.warn("[DeepSeek Update] \u81EA\u52A8\u68C0\u67E5\u66F4\u65B0\u5931\u8D25:", err.message);
      }
    }
  }
  /**
   * 发现新版本时提示用户
   */
  async promptUserForUpdate(updateInfo) {
    const hasDirectDownload = !!updateInfo.downloadUrl;
    const actions = [];
    if (hasDirectDownload) {
      actions.push("\u7ACB\u5373\u66F4\u65B0");
    }
    if (updateInfo.releaseUrl) {
      actions.push("\u67E5\u770B\u53D1\u5E03\u8BF4\u660E");
    }
    actions.push("\u7A0D\u540E\u63D0\u9192");
    let summary = `\u53D1\u73B0 DeepSeek Web \u65B0\u7248\u672C v${updateInfo.version} (\u5F53\u524D: v${updateInfo.currentVersion})`;
    if (updateInfo.releaseNotes) {
      const previewNotes = updateInfo.releaseNotes.split("\n").slice(0, 3).join(" ");
      if (previewNotes) {
        summary += `
${previewNotes.slice(0, 100)}...`;
      }
    }
    const choice = await vscode5.window.showInformationMessage(summary, ...actions);
    if (choice === "\u7ACB\u5373\u66F4\u65B0" && updateInfo.downloadUrl) {
      await this.downloadAndInstallVsix(updateInfo.downloadUrl, updateInfo.version);
    } else if (choice === "\u67E5\u770B\u53D1\u5E03\u8BF4\u660E" && updateInfo.releaseUrl) {
      vscode5.env.openExternal(vscode5.Uri.parse(updateInfo.releaseUrl));
    }
  }
  /**
   * 下载并直接通过 VS Code 安装 VSIX 扩展包
   */
  async downloadAndInstallVsix(downloadUrl, targetVersion) {
    const tempDir = os2.tmpdir();
    const tempFilePath = path4.join(tempDir, `vscode-deepseek-web-${targetVersion}.vsix`);
    try {
      await vscode5.window.withProgress(
        {
          location: vscode5.ProgressLocation.Notification,
          title: `\u6B63\u5728\u4E0B\u8F7D DeepSeek Web v${targetVersion}...`,
          cancellable: true
        },
        async (progress, token) => {
          const controller = new AbortController();
          token.onCancellationRequested(() => controller.abort());
          const response = await fetch(downloadUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": "VSCode-DeepSeek-Web-Updater"
            }
          });
          if (!response.ok) {
            throw new Error(`\u4E0B\u8F7D\u5931\u8D25: HTTP ${response.status} ${response.statusText}`);
          }
          const contentLength = response.headers.get("content-length");
          const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
          let receivedBytes = 0;
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fs3.writeFileSync(tempFilePath, buffer);
          progress.report({ message: "\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6B63\u5728\u5B89\u88C5\u6269\u5C55..." });
        }
      );
      const vsixUri = vscode5.Uri.file(tempFilePath);
      await vscode5.commands.executeCommand("workbench.extensions.installExtension", vsixUri);
      const reloadChoice = await vscode5.window.showInformationMessage(
        `\u{1F389} DeepSeek Web \u5DF2\u6210\u529F\u66F4\u65B0\u81F3 v${targetVersion}\uFF01\u662F\u5426\u7ACB\u5373\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u4EE5\u5E94\u7528\u66F4\u65B0\uFF1F`,
        "\u7ACB\u5373\u91CD\u65B0\u52A0\u8F7D",
        "\u7A0D\u540E"
      );
      if (reloadChoice === "\u7ACB\u5373\u91CD\u65B0\u52A0\u8F7D") {
        await vscode5.commands.executeCommand("workbench.action.reloadWindow");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        vscode5.window.showWarningMessage("\u5DF2\u53D6\u6D88\u4E0B\u8F7D\u66F4\u65B0\u3002");
      } else {
        vscode5.window.showErrorMessage(`\u5B89\u88C5\u66F4\u65B0\u5931\u8D25: ${err.message}`);
      }
    } finally {
      try {
        if (fs3.existsSync(tempFilePath)) {
          fs3.unlinkSync(tempFilePath);
        }
      } catch {
      }
    }
  }
};

// src/providers/chatViewProvider.ts
var vscode7 = __toESM(require("vscode"));
var fs4 = __toESM(require("fs"));
var path6 = __toESM(require("path"));

// src/services/editorContext.ts
var vscode6 = __toESM(require("vscode"));
var path5 = __toESM(require("path"));
var EditorContext = class {
  /**
   * 捕获当前活动编辑器的上下文数据（文件路径、语言、选中文本、Linter 诊断报错）
   */
  static getCurrentContext() {
    const editor = vscode6.window.activeTextEditor;
    if (!editor) {
      return {};
    }
    const doc = editor.document;
    const selection = editor.selection;
    const selectedText = !selection.isEmpty ? doc.getText(selection) : void 0;
    let diagnosticsText = "";
    const diagnostics = vscode6.languages.getDiagnostics(doc.uri);
    if (diagnostics.length > 0) {
      const relevant = diagnostics.slice(0, 5).map((d) => {
        const severity = d.severity === vscode6.DiagnosticSeverity.Error ? "Error" : "Warning";
        return `[Line ${d.range.start.line + 1}] ${severity}: ${d.message}`;
      });
      diagnosticsText = relevant.join("\n");
    }
    return {
      fileName: path5.basename(doc.fileName),
      filePath: doc.fileName,
      fileLanguage: doc.languageId,
      selectedText,
      selectionRange: !selection.isEmpty ? { startLine: selection.start.line + 1, endLine: selection.end.line + 1 } : void 0,
      diagnostics: diagnosticsText || void 0
    };
  }
  /**
   * 将编辑器上下文包装成高质量的 Prompt
   */
  static buildContextPrompt(instruction, context) {
    const parts = [];
    if (context.fileName) {
      parts.push(`\u3010\u5F53\u524D\u6587\u4EF6\u3011: ${context.fileName} (${context.fileLanguage || "plaintext"})`);
    }
    if (context.selectedText) {
      parts.push(
        `\u3010\u9009\u4E2D\u7684\u4EE3\u7801\u7247\u6BB5 (\u7B2C ${context.selectionRange?.startLine ?? 1} - ${context.selectionRange?.endLine ?? 1} \u884C)\u3011:
\`\`\`${context.fileLanguage || ""}
${context.selectedText}
\`\`\``
      );
    }
    if (context.diagnostics) {
      parts.push(`\u3010\u5F53\u524D\u6587\u4EF6\u5B58\u5728\u7684\u7F16\u8BD1\u5668/Linter \u8BCA\u65AD\u62A5\u9519\u3011:
${context.diagnostics}`);
    }
    parts.push(`\u3010\u4EFB\u52A1\u9700\u6C42\u3011:
${instruction}`);
    return parts.join("\n\n");
  }
  /**
   * 在当前光标位置插入代码
   */
  static async insertAtCursor(code) {
    const editor = vscode6.window.activeTextEditor;
    if (!editor) {
      vscode6.window.showWarningMessage("\u8BF7\u5148\u5728\u7F16\u8F91\u5668\u4E2D\u6253\u5F00\u4E00\u4E2A\u6587\u4EF6\u5E76\u5B9A\u4F4D\u5149\u6807\u3002");
      return false;
    }
    return editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, code);
    });
  }
  /**
   * 替换当前选中的代码
   */
  static async replaceSelection(code) {
    const editor = vscode6.window.activeTextEditor;
    if (!editor) {
      vscode6.window.showWarningMessage("\u8BF7\u5148\u5728\u7F16\u8F91\u5668\u4E2D\u9009\u5B9A\u9700\u8981\u66FF\u6362\u7684\u4EE3\u7801\u3002");
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
  static async openInNewFile(code, language = "plaintext") {
    const doc = await vscode6.workspace.openTextDocument({
      content: code,
      language
    });
    await vscode6.window.showTextDocument(doc, vscode6.ViewColumn.Beside);
  }
};

// src/providers/chatViewProvider.ts
var ChatViewProvider = class {
  constructor(extensionUri, tokenStorage, webClient, presetManager) {
    this.extensionUri = extensionUri;
    this.tokenStorage = tokenStorage;
    this.webClient = webClient;
    this.presetManager = presetManager;
    this.tokenStorage.onTokenStatusChanged((status) => {
      this.postMessage({
        command: status === "expired" ? "tokenExpired" : "tokenValid"
      });
    });
  }
  static viewType = "deepseek.chatView";
  view;
  currentAbortController;
  currentSessionId;
  messageHistory = [];
  resolveWebviewView(webviewView, _context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this.handleWebviewMessage(data);
    });
  }
  /**
   * 处理 Webview 发送上来的事件
   */
  async handleWebviewMessage(message) {
    switch (message.command) {
      case "ready":
        this.postMessage({
          command: "init",
          skills: this.presetManager.getSkills(),
          model: this.tokenStorage.getModel(),
          tokenStatus: this.tokenStorage.getStatus(),
          claudeEnabled: ClaudeConfigManager.getInstance().isEnabled()
        });
        break;
      case "sendMessage":
        await this.handleUserMessage(
          message.text,
          message.context,
          message.model,
          message.searchEnabled
        );
        break;
      case "stopGeneration":
        if (this.currentAbortController) {
          this.currentAbortController.abort();
          this.currentAbortController = void 0;
        }
        break;
      case "newSession":
        this.currentSessionId = void 0;
        this.messageHistory = [];
        this.postMessage({ command: "clearMessages" });
        vscode7.window.showInformationMessage("\u5DF2\u5F00\u542F\u65B0\u7684 DeepSeek \u7F51\u9875\u7248\u5BF9\u8BDD\u4F1A\u8BDD\u3002");
        break;
      case "exportMarkdown":
        await this.exportSessionToMarkdown();
        break;
      case "openSettings":
        await this.tokenStorage.promptSetUserToken();
        break;
      case "openWeb":
        vscode7.env.openExternal(vscode7.Uri.parse("https://chat.deepseek.com"));
        break;
      case "setToken":
        await this.tokenStorage.promptSetUserToken();
        break;
      case "resumeCaptcha":
        RateLimiter.getInstance().resumeAfterChallenge();
        vscode7.window.showInformationMessage("\u5DF2\u89E3\u9664\u6ED1\u5757\u9650\u5236\uFF0C\u7EE7\u7EED\u6267\u884C\u4EFB\u52A1\u3002");
        break;
      case "changeModel":
        await this.tokenStorage.setModel(message.model);
        break;
      case "changeSearch":
        await this.tokenStorage.setSearchEnabled(message.enabled);
        break;
      case "toggleClaudeConfig":
        await ClaudeConfigManager.getInstance().toggle();
        this.postMessage({
          command: "claudeConfigStatus",
          enabled: ClaudeConfigManager.getInstance().isEnabled()
        });
        break;
      case "insertCode":
        await EditorContext.insertAtCursor(message.code);
        break;
      case "replaceCode":
        await EditorContext.replaceSelection(message.code);
        break;
      case "openNewFile":
        await EditorContext.openInNewFile(message.code, message.language);
        break;
    }
  }
  /**
   * 核心对话处理链路：网页版会话、Skill 预设、上下文注入、思考过程捕获
   */
  async handleUserMessage(userText, context, overrideModel, overrideSearch) {
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;
    let finalPrompt = userText;
    let systemInstruction = "";
    const matchSkill = this.presetManager.getSkills().find(
      (s) => userText.startsWith(s.command)
    );
    if (matchSkill) {
      systemInstruction = matchSkill.systemPrompt;
      const strippedText = userText.slice(matchSkill.command.length).trim();
      finalPrompt = (matchSkill.promptPrefix || "") + strippedText;
    }
    if (context && (context.fileName || context.selectedText)) {
      finalPrompt = EditorContext.buildContextPrompt(finalPrompt, context);
    }
    if (systemInstruction) {
      finalPrompt = `\u3010\u7CFB\u7EDF\u9884\u8BBE\u8981\u6C42\u3011
${systemInstruction}

${finalPrompt}`;
    }
    const userMsgId = String(Date.now());
    this.messageHistory.push({
      id: userMsgId,
      role: "user",
      content: userText,
      timestamp: Date.now()
    });
    const streamCallbacks = {
      onReasoningChunk: (delta) => {
        this.postMessage({ command: "streamReasoning", delta });
      },
      onTextChunk: (delta) => {
        this.postMessage({ command: "streamText", delta });
      },
      onSpeedUpdate: (speed) => {
        this.postMessage({ command: "streamSpeed", speed });
      },
      onFinished: (fullText, fullReasoning) => {
        this.messageHistory.push({
          id: String(Date.now()),
          role: "assistant",
          content: fullText,
          reasoningContent: fullReasoning,
          timestamp: Date.now()
        });
        this.postMessage({ command: "streamFinished" });
        this.currentAbortController = void 0;
      },
      onError: (error) => {
        this.postMessage({ command: "streamError", error: error.message });
        this.currentAbortController = void 0;
      },
      onTokenExpired: () => {
        this.postMessage({ command: "tokenExpired" });
        this.currentAbortController = void 0;
      },
      onCaptchaChallenge: () => {
        this.postMessage({ command: "captchaChallenge" });
        this.currentAbortController = void 0;
      }
    };
    try {
      if (!this.currentSessionId) {
        this.currentSessionId = await this.webClient.createSession(signal);
      }
      await this.webClient.submitChat(
        this.currentSessionId,
        finalPrompt,
        {
          thinkingEnabled: (overrideModel ?? this.tokenStorage.getModel()) === "deepseek-reasoner",
          searchEnabled: overrideSearch ?? this.tokenStorage.isSearchEnabled(),
          signal
        },
        streamCallbacks
      );
    } catch (err) {
      if (!signal.aborted) {
        streamCallbacks.onError(err);
      }
    }
  }
  /**
   * 从右键菜单或命令注入 Prompt 并触发对话
   */
  async sendPromptWithContext(prompt, context) {
    if (this.view) {
      this.view.show(true);
      if (context) {
        this.postMessage({ command: "setContext", context });
      }
      this.postMessage({ command: "appendPrompt", prompt });
    }
  }
  /**
   * 导出当前会话为 Markdown
   */
  async exportSessionToMarkdown() {
    if (this.messageHistory.length === 0) {
      vscode7.window.showInformationMessage("\u5F53\u524D\u5BF9\u8BDD\u5386\u53F2\u4E3A\u7A7A\uFF0C\u65E0\u9700\u5BFC\u51FA\u3002");
      return;
    }
    const lines = [
      "# DeepSeek \u7F51\u9875\u7248\u5BF9\u8BDD\u5BFC\u51FA",
      `*\u5BFC\u51FA\u65F6\u95F4: ${(/* @__PURE__ */ new Date()).toLocaleString()}*`,
      ""
    ];
    for (const msg of this.messageHistory) {
      const roleName = msg.role === "user" ? "### \u{1F464} \u7528\u6237" : "### \u{1F433} DeepSeek";
      lines.push(roleName);
      if (msg.reasoningContent) {
        lines.push("<details><summary>\u{1F4A1} \u6DF1\u5EA6\u601D\u8003\u8FC7\u7A0B</summary>\n");
        lines.push(msg.reasoningContent);
        lines.push("\n</details>\n");
      }
      lines.push(msg.content);
      lines.push("\n---\n");
    }
    const content = lines.join("\n");
    const defaultUri = vscode7.workspace.workspaceFolders?.[0] ? vscode7.Uri.joinPath(vscode7.workspace.workspaceFolders[0].uri, `deepseek-chat-${Date.now()}.md`) : void 0;
    const fileUri = await vscode7.window.showSaveDialog({
      defaultUri,
      filters: { "Markdown": ["md"] }
    });
    if (fileUri) {
      await vscode7.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));
      vscode7.window.showInformationMessage(`\u5DF2\u6210\u529F\u5BFC\u51FA\u81F3: ${path6.basename(fileUri.fsPath)}`);
    }
  }
  clearChat() {
    this.currentSessionId = void 0;
    this.messageHistory = [];
    this.postMessage({ command: "clearMessages" });
  }
  postMessage(message) {
    this.view?.webview.postMessage(message);
  }
  getHtmlForWebview(webview) {
    const htmlPath = path6.join(this.extensionUri.fsPath, "media", "chat.html");
    let html = fs4.readFileSync(htmlPath, "utf-8");
    const stylesUri = webview.asWebviewUri(
      vscode7.Uri.joinPath(this.extensionUri, "media", "chat.css")
    );
    const scriptsUri = webview.asWebviewUri(
      vscode7.Uri.joinPath(this.extensionUri, "media", "chat.js")
    );
    html = html.replace("{{stylesUri}}", stylesUri.toString());
    html = html.replace("{{scriptsUri}}", scriptsUri.toString());
    return html;
  }
};

// src/commands/editorCommands.ts
var vscode8 = __toESM(require("vscode"));
function registerEditorCommands(context, chatProvider) {
  const commands4 = [
    {
      command: "deepseek.explainCode",
      prompt: "/explain \u8BF7\u8BE6\u7EC6\u89E3\u91CA\u9009\u4E2D\u7684\u4EE3\u7801\uFF0C\u5305\u62EC\u7B97\u6CD5\u903B\u8F91\u4E0E\u8BBE\u8BA1\u8003\u91CF\u3002"
    },
    {
      command: "deepseek.refactorCode",
      prompt: "/refactor \u8BF7\u91CD\u6784\u9009\u4E2D\u7684\u4EE3\u7801\uFF0C\u6D88\u9664\u4EE3\u7801\u5F02\u5473\uFF0C\u63D0\u5347\u53EF\u8BFB\u6027\u4E0E\u6267\u884C\u6548\u7387\u3002"
    },
    {
      command: "deepseek.fixCode",
      prompt: "/bugfix \u8BF7\u5BA1\u67E5\u9009\u4E2D\u7684\u4EE3\u7801\uFF0C\u6392\u67E5\u6F5C\u5728\u8FB9\u754C\u5F02\u5E38\u3001\u7A7A\u6307\u9488\u6216\u5185\u5B58\u6CC4\u9732\uFF0C\u5E76\u7ED9\u51FA\u5B8C\u6574\u4FEE\u590D\u3002"
    },
    {
      command: "deepseek.generateTests",
      prompt: "/test \u8BF7\u4E3A\u9009\u4E2D\u7684\u4EE3\u7801\u7F16\u5199\u5168\u9762\u7684\u5355\u5143\u6D4B\u8BD5\u7528\u4F8B\uFF0C\u8986\u76D6\u5404\u79CD\u6B63\u5E38\u4E0E\u5F02\u5E38\u8FB9\u754C\u3002"
    },
    {
      command: "deepseek.addComments",
      prompt: "/doc \u8BF7\u4E3A\u9009\u4E2D\u7684\u4EE3\u7801\u6DFB\u52A0\u7B26\u5408\u89C4\u8303\u7684\u8BE6\u7EC6\u6CE8\u91CA\u4E0E API \u6587\u6863\u3002"
    }
  ];
  for (const item of commands4) {
    const disposable = vscode8.commands.registerCommand(item.command, async () => {
      const editorCtx = EditorContext.getCurrentContext();
      if (!editorCtx.selectedText && !editorCtx.fileName) {
        vscode8.window.showWarningMessage("\u8BF7\u5148\u5728\u7F16\u8F91\u5668\u4E2D\u6253\u5F00\u4EE3\u7801\u6587\u4EF6\u6216\u9009\u5B9A\u4EE3\u7801\u6BB5\u3002");
        return;
      }
      await chatProvider.sendPromptWithContext(item.prompt, editorCtx);
    });
    context.subscriptions.push(disposable);
  }
}

// src/extension.ts
var statusBarItem;
function activate(context) {
  const tokenStorage = new TokenStorage(context);
  const webClient = new DeepSeekWebClient(tokenStorage, context.extensionPath);
  const presetManager = new PresetManager(context);
  const proxyManager = ProxyManager.getInstance();
  const claudeConfigManager = ClaudeConfigManager.getInstance();
  const updateManager = UpdateManager.getInstance(context);
  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    tokenStorage,
    webClient,
    presetManager
  );
  context.subscriptions.push(
    vscode9.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("deepseek.openChat", async () => {
      await vscode9.commands.executeCommand("deepseek.chatView.focus");
    }),
    vscode9.commands.registerCommand("deepseek.setToken", async () => {
      await tokenStorage.promptSetUserToken();
      updateStatusBar(tokenStorage);
    }),
    vscode9.commands.registerCommand("deepseek.newSession", async () => {
      await vscode9.commands.executeCommand("deepseek.chatView.focus");
      chatProvider.clearChat();
    }),
    vscode9.commands.registerCommand("deepseek.exportMarkdown", async () => {
      await chatProvider.exportSessionToMarkdown();
    }),
    vscode9.commands.registerCommand("deepseek.clearChat", () => {
      chatProvider.clearChat();
    }),
    vscode9.commands.registerCommand("deepseek.startProxy", async () => {
      const token = await tokenStorage.getUserToken();
      proxyManager.restart(context.extensionPath, token);
    }),
    vscode9.commands.registerCommand("deepseek.stopProxy", () => {
      proxyManager.stop();
    }),
    vscode9.commands.registerCommand("deepseek.enableClaudeConfig", async () => {
      await claudeConfigManager.enable();
      updateStatusBar(tokenStorage);
    }),
    vscode9.commands.registerCommand("deepseek.disableClaudeConfig", async () => {
      await claudeConfigManager.disable();
      updateStatusBar(tokenStorage);
    }),
    vscode9.commands.registerCommand("deepseek.toggleClaudeConfig", async () => {
      await claudeConfigManager.toggle();
      updateStatusBar(tokenStorage);
    }),
    vscode9.commands.registerCommand("deepseek.checkForUpdates", async () => {
      await updateManager.checkForUpdates(true);
    }),
    vscode9.commands.registerCommand("deepseek.setUpdateUrl", async () => {
      await updateManager.promptSetUpdateUrl();
    })
  );
  registerEditorCommands(context, chatProvider);
  const autoStart = vscode9.workspace.getConfiguration("deepseek").get("autoStartProxy", true);
  if (autoStart) {
    tokenStorage.getUserToken().then((token) => {
      proxyManager.start(context.extensionPath, token);
    });
  }
  statusBarItem = vscode9.window.createStatusBarItem(vscode9.StatusBarAlignment.Right, 100);
  statusBarItem.command = "deepseek.statusMenu";
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode9.commands.registerCommand("deepseek.statusMenu", async () => {
      const isClaudeEnabled = claudeConfigManager.isEnabled();
      const choice = await vscode9.window.showQuickPick([
        {
          label: isClaudeEnabled ? "$(check) \u5173\u95ED Claude Code \u76F4\u8FDE\u914D\u7F6E" : "$(plug) \u5F00\u542F Claude Code \u76F4\u8FDE\u914D\u7F6E (.claude/settings.local.json)",
          detail: isClaudeEnabled ? "\u4ECE\u5F53\u524D\u5DE5\u4F5C\u533A\u914D\u7F6E\u6587\u4EF6\u4E2D\u79FB\u9664\u4EE3\u7406\u914D\u7F6E\uFF0C\u6062\u590D\u5B98\u65B9\u9ED8\u8BA4" : "\u4E00\u952E\u5199\u5165 .claude/settings.local.json\uFF0C\u65E0\u9700\u73AF\u5883\u53D8\u91CF\u5373\u53EF\u76F4\u8FDE DeepSeek-Web",
          action: "toggleClaude"
        },
        {
          label: `$(cloud-download) \u68C0\u67E5\u63D2\u4EF6\u66F4\u65B0 (\u5F53\u524D: v${updateManager.getCurrentVersion()})`,
          detail: `\u68C0\u67E5\u65B0\u7248\u672C\u5E76\u652F\u6301\u4E00\u952E\u4E0B\u8F7D\u5B89\u88C5 (\u66F4\u65B0\u6E90: ${updateManager.getUpdateUrl()})`,
          action: "checkUpdate"
        },
        {
          label: "$(gear) \u914D\u7F6E\u66F4\u65B0\u6E90\u5730\u5740",
          detail: "\u81EA\u5B9A\u4E49 GitHub \u4ED3\u5E93\u3001Release API \u94FE\u63A5\u6216\u7248\u672C JSON \u63A5\u53E3",
          action: "setUpdateUrl"
        },
        {
          label: "$(key) \u914D\u7F6E\u7F51\u9875\u7248 UserToken",
          detail: "\u914D\u7F6E\u6216\u66F4\u65B0 chat.deepseek.com \u7684 userToken (\u514D API \u8D39\u7528)",
          action: "setToken"
        },
        {
          label: "$(server) \u542F\u52A8 / \u91CD\u542F\u672C\u5730\u4EE3\u7406\u670D\u52A1 (\u7AEF\u53E3: 9999)",
          detail: "\u4E3A Claude Code \u63D0\u4F9B http://127.0.0.1:9999 \u7AEF\u70B9",
          action: "startProxy"
        },
        {
          label: "$(link-external) \u6253\u5F00 DeepSeek \u7F51\u9875\u7248 (\u83B7\u53D6\u51ED\u8BC1)",
          detail: "\u5728\u9ED8\u8BA4\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 chat.deepseek.com",
          action: "openWeb"
        },
        {
          label: "$(comment-discussion) \u6253\u5F00 DeepSeek \u5BF9\u8BDD\u4FA7\u8FB9\u680F",
          detail: "\u5C55\u5F00 AI \u8F85\u52A9\u7F16\u7A0B\u5DE5\u4F5C\u53F0",
          action: "openChat"
        }
      ]);
      if (choice) {
        if (choice.action === "toggleClaude") {
          await claudeConfigManager.toggle();
          updateStatusBar(tokenStorage);
        } else if (choice.action === "checkUpdate") {
          await updateManager.checkForUpdates(true);
        } else if (choice.action === "setUpdateUrl") {
          await updateManager.promptSetUpdateUrl();
        } else if (choice.action === "setToken") {
          await tokenStorage.promptSetUserToken();
          updateStatusBar(tokenStorage);
        } else if (choice.action === "startProxy") {
          const token = await tokenStorage.getUserToken();
          proxyManager.restart(context.extensionPath, token);
        } else if (choice.action === "openWeb") {
          vscode9.env.openExternal(vscode9.Uri.parse("https://chat.deepseek.com"));
        } else if (choice.action === "openChat") {
          await vscode9.commands.executeCommand("deepseek.chatView.focus");
        }
      }
    })
  );
  if (updateManager.isAutoCheckEnabled()) {
    setTimeout(() => {
      updateManager.checkForUpdates(false);
    }, 4e3);
  }
  tokenStorage.onTokenStatusChanged(() => {
    updateStatusBar(tokenStorage);
  });
  updateStatusBar(tokenStorage);
  statusBarItem.show();
}
function updateStatusBar(tokenStorage) {
  const status = tokenStorage.getStatus();
  const claudeEnabled = ClaudeConfigManager.getInstance().isEnabled();
  const claudeSuffix = claudeEnabled ? " [Claude Code \u5DF2\u914D\u7F6E]" : "";
  if (status === "expired") {
    statusBarItem.text = `$(alert) DeepSeek (Token \u8FC7\u671F)${claudeSuffix}`;
    statusBarItem.tooltip = "DeepSeek \u7F51\u9875\u7248 UserToken \u5DF2\u8FC7\u671F\uFF0C\u70B9\u51FB\u91CD\u65B0\u914D\u7F6E";
    statusBarItem.backgroundColor = new vscode9.ThemeColor("statusBarItem.warningBackground");
  } else if (status === "missing") {
    statusBarItem.text = `$(key) DeepSeek (\u672A\u914D Token)${claudeSuffix}`;
    statusBarItem.tooltip = "\u70B9\u51FB\u914D\u7F6E\u7F51\u9875\u7248 UserToken \u5373\u53EF\u5F00\u59CB\u514D\u8D39\u4F7F\u7528 (\u4EE3\u7406\u7AEF\u53E3: 9999)";
    statusBarItem.backgroundColor = void 0;
  } else {
    statusBarItem.text = `$(hubot) DeepSeek-Web (9999 \u4EE3\u7406\u5C31\u7EEA)${claudeSuffix}`;
    statusBarItem.tooltip = "DeepSeek \u7F51\u9875\u7248\u5DF2\u5C31\u7EEA\uFF0CClaude Code \u5DF2\u53EF\u901A\u8FC7 .claude/settings.local.json \u76F4\u8FDE";
    statusBarItem.backgroundColor = void 0;
  }
}
function deactivate() {
  ProxyManager.getInstance().stop();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
