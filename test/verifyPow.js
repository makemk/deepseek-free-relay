const fs = require('fs');
const path = require('path');

async function testWasmAndPow() {
  console.log('=== 1. 测试 WebAssembly 模块载入 ===');
  const wasmPath = path.join(__dirname, '..', 'resources', 'sha3_wasm_bg.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error('WASM 文件不存在: ' + wasmPath);
  }
  const wasmBuffer = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmBuffer, {});
  console.log('WASM 模块实例化成功，内存大小:', instance.exports.memory.buffer.byteLength, 'bytes');

  console.log('=== 2. 测试 DeepSeek PoW 算力解题逻辑 ===');
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function writeWasmString(value) {
    const bytes = textEncoder.encode(value);
    const ptr = instance.exports.__wbindgen_export_0(bytes.length, 1);
    new Uint8Array(instance.exports.memory.buffer).set(bytes, ptr);
    return { ptr, len: bytes.length };
  }

  function hash(val) {
    const retPtr = instance.exports.__wbindgen_add_to_stack_pointer(-16);
    const alloc = writeWasmString(val);
    instance.exports.wasm_deepseek_hash_v1(retPtr, alloc.ptr, alloc.len);
    const view = new DataView(instance.exports.memory.buffer);
    const resultPtr = view.getInt32(retPtr, true);
    const resultLen = view.getInt32(retPtr + 4, true);
    const resultBytes = new Uint8Array(instance.exports.memory.buffer, resultPtr, resultLen);
    const res = textDecoder.decode(resultBytes);
    instance.exports.__wbindgen_add_to_stack_pointer(16);
    return res;
  }

  // 构造真实 DeepSeek 挑战验证
  const expectedAnswer = 1024;
  const prefix = 'ds_salt_9988_1712345678_';
  const targetChallengeHash = hash(prefix + expectedAnswer);

  const testChallenge = {
    algorithm: 'DeepSeekHashV1',
    challenge: targetChallengeHash,
    salt: 'ds_salt_9988',
    difficulty: 5000,
    expireAt: 1712345678,
    signature: 'mock_signature_ds',
  };

  const retPtr = instance.exports.__wbindgen_add_to_stack_pointer(-16);
  const challengeAlloc = writeWasmString(testChallenge.challenge.toLowerCase());
  const prefixAlloc = writeWasmString(`${testChallenge.salt}_${testChallenge.expireAt}_`);

  const startTime = Date.now();
  instance.exports.wasm_solve(
    retPtr,
    challengeAlloc.ptr,
    challengeAlloc.len,
    prefixAlloc.ptr,
    prefixAlloc.len,
    testChallenge.difficulty
  );

  const view = new DataView(instance.exports.memory.buffer);
  const status = view.getInt32(retPtr, true);
  const answer = view.getFloat64(retPtr + 8, true);
  instance.exports.__wbindgen_add_to_stack_pointer(16);

  const elapsed = Date.now() - startTime;
  console.log(`PoW 解题状态: ${status === 1 ? '成功' : '失败'}, 目标 Answer: ${expectedAnswer}, 求解计算 Answer: ${answer}, 耗时: ${elapsed}ms`);

  if (status !== 1 || answer !== expectedAnswer) {
    throw new Error(`PoW 求解返回异常: expected ${expectedAnswer}, got ${answer}`);
  }

  console.log('=== 3. 测试 X-DS-PoW-Response 请求头构造 ===');
  const payload = {
    algorithm: testChallenge.algorithm,
    challenge: testChallenge.challenge,
    salt: testChallenge.salt,
    answer,
    signature: testChallenge.signature,
    target_path: '/api/v0/chat/completion',
  };
  const header = Buffer.from(JSON.stringify(payload)).toString('base64');
  console.log('生成的 X-DS-PoW-Response 请求头长度:', header.length, '示例:', header.substring(0, 45) + '...');

  console.log('=== 全部自动化验证测试通过！ ===');
}

testWasmAndPow().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});

