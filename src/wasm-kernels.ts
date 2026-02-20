// Auto-generated from src/iterate.wat — do not edit by hand
const ITERATE_WASM = new Uint8Array([
  0,97,115,109,1,0,0,0,1,21,3,96,5,127,127,127,127,127,0,96,
  3,127,127,127,0,96,3,127,125,127,0,2,15,1,3,101,110,118,6,109,
  101,109,111,114,121,2,0,1,3,7,6,0,0,1,1,1,2,7,75,6,
  14,105,116,101,114,97,116,101,95,115,99,97,108,97,114,0,0,12,105,116,
  101,114,97,116,101,95,115,105,109,100,0,1,7,97,100,100,95,102,51,50,
  0,2,7,115,117,98,95,102,51,50,0,3,7,109,117,108,95,102,51,50,
  0,4,9,115,99,97,108,101,95,102,51,50,0,5,10,148,6,6,87,1,
  2,127,65,0,33,5,2,64,3,64,32,5,32,4,79,13,1,32,5,65,
  2,116,33,6,32,0,32,6,106,32,0,32,6,106,42,2,0,32,2,32,
  6,106,42,2,0,146,56,2,0,32,1,32,6,106,32,1,32,6,106,42,
  2,0,32,3,32,6,106,42,2,0,146,56,2,0,32,5,65,1,106,33,
  5,12,0,11,11,11,183,1,1,3,127,32,4,65,124,113,33,7,65,0,
  33,5,2,64,3,64,32,5,32,7,79,13,1,32,5,65,2,116,33,6,
  32,0,32,6,106,32,0,32,6,106,253,0,4,0,32,2,32,6,106,253,
  0,4,0,253,228,1,253,11,4,0,32,1,32,6,106,32,1,32,6,106,
  253,0,4,0,32,3,32,6,106,253,0,4,0,253,228,1,253,11,4,0,
  32,5,65,4,106,33,5,12,0,11,11,2,64,3,64,32,5,32,4,79,
  13,1,32,5,65,2,116,33,6,32,0,32,6,106,32,0,32,6,106,42,
  2,0,32,2,32,6,106,42,2,0,146,56,2,0,32,1,32,6,106,32,
  1,32,6,106,42,2,0,32,3,32,6,106,42,2,0,146,56,2,0,32,
  5,65,1,106,33,5,12,0,11,11,11,128,1,1,3,127,32,2,65,124,
  113,33,5,65,0,33,3,2,64,3,64,32,3,32,5,79,13,1,32,3,
  65,2,116,33,4,32,0,32,4,106,32,0,32,4,106,253,0,4,0,32,
  1,32,4,106,253,0,4,0,253,228,1,253,11,4,0,32,3,65,4,106,
  33,3,12,0,11,11,2,64,3,64,32,3,32,2,79,13,1,32,3,65,
  2,116,33,4,32,0,32,4,106,32,0,32,4,106,42,2,0,32,1,32,
  4,106,42,2,0,146,56,2,0,32,3,65,1,106,33,3,12,0,11,11,
  11,128,1,1,3,127,32,2,65,124,113,33,5,65,0,33,3,2,64,3,
  64,32,3,32,5,79,13,1,32,3,65,2,116,33,4,32,0,32,4,106,
  32,0,32,4,106,253,0,4,0,32,1,32,4,106,253,0,4,0,253,229,
  1,253,11,4,0,32,3,65,4,106,33,3,12,0,11,11,2,64,3,64,
  32,3,32,2,79,13,1,32,3,65,2,116,33,4,32,0,32,4,106,32,
  0,32,4,106,42,2,0,32,1,32,4,106,42,2,0,147,56,2,0,32,
  3,65,1,106,33,3,12,0,11,11,11,128,1,1,3,127,32,2,65,124,
  113,33,5,65,0,33,3,2,64,3,64,32,3,32,5,79,13,1,32,3,
  65,2,116,33,4,32,0,32,4,106,32,0,32,4,106,253,0,4,0,32,
  1,32,4,106,253,0,4,0,253,230,1,253,11,4,0,32,3,65,4,106,
  33,3,12,0,11,11,2,64,3,64,32,3,32,2,79,13,1,32,3,65,
  2,116,33,4,32,0,32,4,106,32,0,32,4,106,42,2,0,32,1,32,
  4,106,42,2,0,148,56,2,0,32,3,65,1,106,33,3,12,0,11,11,
  11,123,2,3,127,1,123,32,1,253,19,33,6,32,2,65,124,113,33,5,
  65,0,33,3,2,64,3,64,32,3,32,5,79,13,1,32,3,65,2,116,
  33,4,32,0,32,4,106,32,0,32,4,106,253,0,4,0,32,6,253,230,
  1,253,11,4,0,32,3,65,4,106,33,3,12,0,11,11,2,64,3,64,
  32,3,32,2,79,13,1,32,3,65,2,116,33,4,32,0,32,4,106,32,
  0,32,4,106,42,2,0,32,1,148,56,2,0,32,3,65,1,106,33,3,
  12,0,11,11,11
]); // 925 bytes

export interface IterateKernels {
  iterate_scalar(px: number, py: number, vx: number, vy: number, count: number): void;
  iterate_simd(px: number, py: number, vx: number, vy: number, count: number): void;
  add_f32(dst: number, src: number, count: number): void;
  sub_f32(dst: number, src: number, count: number): void;
  mul_f32(dst: number, src: number, count: number): void;
  scale_f32(dst: number, scalar: number, count: number): void;
}

// Cached compiled module (shared across all EntityManager instances)
let cachedModule: WebAssembly.Module | null = null;

function getCompiledModule(): WebAssembly.Module {
  if (!cachedModule) {
    cachedModule = new WebAssembly.Module(ITERATE_WASM);
  }
  return cachedModule;
}

/** Returns true if the runtime supports WebAssembly SIMD. Result is cached. */
export function isWasmSimdAvailable(): boolean {
  if (cachedModule !== null) return true;
  try {
    getCompiledModule();
    return true;
  } catch {
    return false;
  }
}

export async function instantiateKernels(memory: WebAssembly.Memory): Promise<IterateKernels> {
  const module = getCompiledModule();
  const instance = await WebAssembly.instantiate(module, { env: { memory } });
  return instance.exports as unknown as IterateKernels;
}

/** Synchronous instantiation — only for small modules (<4KB). Used internally. */
export function instantiateKernelsSync(memory: WebAssembly.Memory): IterateKernels {
  const module = getCompiledModule();
  const instance = new WebAssembly.Instance(module, { env: { memory } });
  return instance.exports as unknown as IterateKernels;
}
