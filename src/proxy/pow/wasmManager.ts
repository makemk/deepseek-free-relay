import * as fs from 'fs';
import { resolveWasmPath } from '../config';
import { PowChallenge, PowAnswer } from '../types';

interface DeepSeekPowWasmExports {
  memory: WebAssembly.Memory;
  wasm_solve(
    retPtr: number,
    challengePtr: number,
    challengeLen: number,
    prefixPtr: number,
    prefixLen: number,
    difficulty: number,
  ): void;
  __wbindgen_add_to_stack_pointer(offset: number): number;
  __wbindgen_export_0(size: number, align: number): number;
}

let cachedWasm: DeepSeekPowWasmExports | null = null;
const textEncoder = new TextEncoder();

export class WasmManager {
  /**
   * 载入并单例缓存 PoW WASM 模块
   */
  public static async getWasmInstance(): Promise<DeepSeekPowWasmExports> {
    if (cachedWasm) return cachedWasm;

    const wasmPath = resolveWasmPath();
    const bytes = fs.readFileSync(wasmPath);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    cachedWasm = instance.exports as unknown as DeepSeekPowWasmExports;
    return cachedWasm;
  }

  private static writeWasmString(wasm: DeepSeekPowWasmExports, value: string) {
    const bytes = textEncoder.encode(value);
    const ptr = wasm.__wbindgen_export_0(bytes.length, 1);
    new Uint8Array(wasm.memory.buffer).set(bytes, ptr);
    return { ptr, len: bytes.length };
  }

  /**
   * 高性能求解 PoW 算力挑战
   */
  public static async solve(challenge: PowChallenge): Promise<PowAnswer> {
    const wasm = await this.getWasmInstance();
    const prefix = `${challenge.salt}_${challenge.expire_at || challenge.expireAt}_`;
    const target = challenge.challenge.toLowerCase();

    const retPtr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const cAlloc = this.writeWasmString(wasm, target);
    const pAlloc = this.writeWasmString(wasm, prefix);

    try {
      wasm.wasm_solve(retPtr, cAlloc.ptr, cAlloc.len, pAlloc.ptr, pAlloc.len, challenge.difficulty);
      const view = new DataView(wasm.memory.buffer);
      const status = view.getInt32(retPtr, true);
      const answer = view.getFloat64(retPtr + 8, true);

      if (status !== 1 || answer < 0) {
        throw new Error(`PoW 挑战解算失败 (难度: ${challenge.difficulty})`);
      }

      return {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        answer,
        signature: challenge.signature,
        target_path: '/api/v0/chat/completion',
      };
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }

  /**
   * 构建 X-DS-PoW-Response 请求头
   */
  public static buildPowHeader(answer: PowAnswer): string {
    return Buffer.from(JSON.stringify(answer)).toString('base64');
  }
}

