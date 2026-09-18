import * as fs from 'fs';
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

interface WasmStringAllocation {
  ptr: number;
  len: number;
}

let cachedWasm: DeepSeekPowWasmExports | null = null;
const textEncoder = new TextEncoder();

export class PowSolver {
  /**
   * 载入并缓存 DeepSeek 官方同款 WebAssembly 模块
   */
  public static async getWasmInstance(wasmPath: string): Promise<DeepSeekPowWasmExports> {
    if (cachedWasm) {
      return cachedWasm;
    }

    if (!fs.existsSync(wasmPath)) {
      throw new Error(`PoW WASM file not found at: ${wasmPath}`);
    }

    const wasmBuffer = await fs.promises.readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasmBuffer, {});
    cachedWasm = instance.exports as unknown as DeepSeekPowWasmExports;
    return cachedWasm;
  }

  /**
   * 求解 DeepSeek Web 端下发的 PoW 算力挑战
   */
  public static async solve(
    challenge: PowChallenge,
    wasmPath: string,
    signal?: AbortSignal,
  ): Promise<PowAnswer> {
    this.validateChallenge(challenge);
    if (signal?.aborted) {
      throw new Error('PoW solving aborted');
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
        challenge.difficulty,
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
        signature: challenge.signature,
      };
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }

  /**
   * 生成 DeepSeek 请求头 X-DS-PoW-Response
   */
  public static buildPowHeader(answer: PowAnswer, targetPath: string): string {
    const payload = {
      algorithm: answer.algorithm,
      challenge: answer.challenge,
      salt: answer.salt,
      answer: answer.answer,
      signature: answer.signature,
      target_path: targetPath,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private static validateChallenge(challenge: PowChallenge): void {
    if (challenge.algorithm !== 'DeepSeekHashV1') {
      throw new Error(`Unsupported DeepSeek PoW algorithm: ${challenge.algorithm}`);
    }
    if (!/^[0-9a-f]{64}$/i.test(challenge.challenge)) {
      throw new Error('Invalid DeepSeek PoW challenge digest');
    }
    if (!Number.isSafeInteger(challenge.difficulty) || challenge.difficulty <= 0) {
      throw new Error(`Invalid DeepSeek PoW difficulty: ${challenge.difficulty}`);
    }
  }

  private static writeWasmString(
    wasm: DeepSeekPowWasmExports,
    value: string,
  ): WasmStringAllocation {
    const bytes = textEncoder.encode(value);
    const ptr = wasm.__wbindgen_export_0(bytes.length, 1);
    new Uint8Array(wasm.memory.buffer).set(bytes, ptr);
    return { ptr, len: bytes.length };
  }
}
