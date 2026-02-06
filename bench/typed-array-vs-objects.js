// Benchmark: TypedArray SoA vs plain object arrays
// Tests performance + allocation / GC pressure
// Run with: node --expose-gc bench/typed-array-vs-objects.js

const hasGC = typeof globalThis.gc === 'function';
if (!hasGC) {
  console.log('WARNING: Run with --expose-gc for accurate allocation measurements\n');
}

const ENTITY_COUNTS = [100, 1_000, 10_000, 100_000, 1_000_000];
const ITERATIONS = 1_000;

function getHeapUsed() {
  if (hasGC) globalThis.gc();
  return process.memoryUsage().heapUsed;
}

// =========================================================================
//  PERFORMANCE BENCHMARKS
// =========================================================================

function getIters() {
  return ITERATIONS;
}

function benchObjectArrays(entityCount) {
  const iters = getIters(entityCount);
  const positions = [];
  const velocities = [];
  for (let i = 0; i < entityCount; i++) {
    positions.push({ x: Math.random() * 100, y: Math.random() * 100 });
    velocities.push({ vx: Math.random() * 10, vy: Math.random() * 10 });
  }

  const t0 = performance.now();
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < entityCount; i++) {
      positions[i].x += velocities[i].vx;
      positions[i].y += velocities[i].vy;
    }
  }
  return { ms: performance.now() - t0, iters };
}

function benchTypedArraysSoA(entityCount) {
  const iters = getIters(entityCount);
  const px = new Float32Array(entityCount);
  const py = new Float32Array(entityCount);
  const vx = new Float32Array(entityCount);
  const vy = new Float32Array(entityCount);
  for (let i = 0; i < entityCount; i++) {
    px[i] = Math.random() * 100;
    py[i] = Math.random() * 100;
    vx[i] = Math.random() * 10;
    vy[i] = Math.random() * 10;
  }

  const t0 = performance.now();
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < entityCount; i++) {
      px[i] += vx[i];
      py[i] += vy[i];
    }
  }
  return { ms: performance.now() - t0, iters };
}

// =========================================================================
//  ALLOCATION: Storage footprint
// =========================================================================

function benchStorageAlloc(entityCount) {
  // Objects
  const heapBefore1 = getHeapUsed();
  const positions = [];
  const velocities = [];
  for (let i = 0; i < entityCount; i++) {
    positions.push({ x: Math.random() * 100, y: Math.random() * 100 });
    velocities.push({ vx: Math.random() * 10, vy: Math.random() * 10 });
  }
  const objectBytes = getHeapUsed() - heapBefore1;

  // Clear
  positions.length = 0;
  velocities.length = 0;

  // TypedArrays
  const heapBefore2 = getHeapUsed();
  const px = new Float32Array(entityCount);
  const py = new Float32Array(entityCount);
  const vx = new Float32Array(entityCount);
  const vy = new Float32Array(entityCount);
  for (let i = 0; i < entityCount; i++) {
    px[i] = Math.random() * 100;
    py[i] = Math.random() * 100;
    vx[i] = Math.random() * 10;
    vy[i] = Math.random() * 10;
  }
  const typedBytes = getHeapUsed() - heapBefore2;

  return { objectBytes, typedBytes };
}

// =========================================================================
//  ALLOCATION: getComponent reconstruction GC pressure
// =========================================================================

function benchGetComponentGC(entityCount) {
  const px = new Float32Array(entityCount);
  const py = new Float32Array(entityCount);
  for (let i = 0; i < entityCount; i++) {
    px[i] = Math.random() * 100;
    py[i] = Math.random() * 100;
  }

  const positions = [];
  for (let i = 0; i < entityCount; i++) {
    positions.push({ x: px[i], y: py[i] });
  }

  const calls = 100_000;

  // Object array — return existing ref, no allocation
  if (hasGC) globalThis.gc();
  const heapBefore1 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < calls; i++) {
    const pos = positions[i % entityCount];
    sink += pos.x + pos.y;
  }
  const objTime = performance.now() - t0;
  const objHeapAfter = process.memoryUsage().heapUsed;

  // TypedArray — reconstruct object each call
  if (hasGC) globalThis.gc();
  const heapBefore2 = process.memoryUsage().heapUsed;
  const t1 = performance.now();
  for (let i = 0; i < calls; i++) {
    const idx = i % entityCount;
    const pos = { x: px[idx], y: py[idx] };
    sink += pos.x + pos.y;
  }
  const typedTime = performance.now() - t1;
  const typedHeapAfter = process.memoryUsage().heapUsed;

  return {
    calls,
    objTime,
    objHeapDelta: objHeapAfter - heapBefore1,
    typedTime,
    typedHeapDelta: typedHeapAfter - heapBefore2,
    sink
  };
}

// =========================================================================
//  ALLOCATION: addComponent — object creation vs TypedArray write
// =========================================================================

function benchAddComponentAlloc(entityCount) {
  const calls = 100_000;

  // Objects: creating new objects (simulates current addComponent)
  const objectStore = new Array(entityCount);
  if (hasGC) globalThis.gc();
  const heapBefore1 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  for (let i = 0; i < calls; i++) {
    const idx = i % entityCount;
    objectStore[idx] = { x: i, y: i * 2 };
  }
  const objTime = performance.now() - t0;
  const objHeapAfter = process.memoryUsage().heapUsed;

  // TypedArrays: write to existing arrays (zero allocation)
  const px = new Float32Array(entityCount);
  const py = new Float32Array(entityCount);
  if (hasGC) globalThis.gc();
  const heapBefore2 = process.memoryUsage().heapUsed;
  const t1 = performance.now();
  for (let i = 0; i < calls; i++) {
    const idx = i % entityCount;
    px[idx] = i;
    py[idx] = i * 2;
  }
  const typedTime = performance.now() - t1;
  const typedHeapAfter = process.memoryUsage().heapUsed;

  return {
    calls,
    objTime,
    objHeapDelta: objHeapAfter - heapBefore1,
    typedTime,
    typedHeapDelta: typedHeapAfter - heapBefore2,
  };
}

// =========================================================================
//  RUN
// =========================================================================

// Warmup
benchObjectArrays(1000);
benchTypedArraysSoA(1000);

const fmt = (bytes) => {
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const pad = (s, n) => String(s).padStart(n);

// --- Performance ---
console.log(`\n=== System loop: Position += Velocity ===\n`);
console.log('Entities    | Frames | Objects      | TypedArr SoA | Speedup');
console.log('------------|--------|--------------|--------------|--------');

for (const count of ENTITY_COUNTS) {
  const obj = benchObjectArrays(count);
  const soa = benchTypedArraysSoA(count);
  const perFrameObj = obj.ms / obj.iters;
  const perFrameSoa = soa.ms / soa.iters;
  console.log(
    `${pad(count.toLocaleString(), 11)} | ` +
    `${pad(obj.iters, 6)} | ` +
    `${pad(perFrameObj.toFixed(3), 9)} ms | ` +
    `${pad(perFrameSoa.toFixed(3), 9)} ms | ` +
    `${pad((perFrameObj / perFrameSoa).toFixed(1), 5)}x`
  );
}

// --- Storage footprint ---
console.log(`\n=== Storage footprint (2 components × 2 fields each) ===\n`);
console.log('Entities  | Objects      | TypedArrays  | Savings');
console.log('----------|--------------|--------------|--------');

for (const count of ENTITY_COUNTS) {
  const { objectBytes, typedBytes } = benchStorageAlloc(count);
  console.log(
    `${pad(count.toLocaleString(), 9)} | ` +
    `${pad(fmt(objectBytes), 12)} | ` +
    `${pad(fmt(typedBytes), 12)} | ` +
    `${pad(((1 - typedBytes / objectBytes) * 100).toFixed(0), 4)}%`
  );
}

// --- getComponent GC pressure ---
console.log(`\n=== getComponent ×100k: existing object vs reconstruct from TypedArray ===\n`);

for (const count of [1_000, 10_000, 1_000_000]) {
  const r = benchGetComponentGC(count);
  console.log(`${count.toLocaleString()} entities, ${r.calls.toLocaleString()} getComponent calls:`);
  console.log(`  Object (return ref):  ${pad(r.objTime.toFixed(1), 6)} ms | heap Δ ${fmt(r.objHeapDelta)}`);
  console.log(`  TypedArr (construct): ${pad(r.typedTime.toFixed(1), 6)} ms | heap Δ ${fmt(r.typedHeapDelta)}`);
  console.log();
}

// --- addComponent allocation ---
console.log(`=== addComponent ×100k: object creation vs TypedArray write ===\n`);

for (const count of [1_000, 10_000, 1_000_000]) {
  const r = benchAddComponentAlloc(count);
  console.log(`${count.toLocaleString()} entities, ${r.calls.toLocaleString()} addComponent calls:`);
  console.log(`  Object (new {}):      ${pad(r.objTime.toFixed(1), 6)} ms | heap Δ ${fmt(r.objHeapDelta)}`);
  console.log(`  TypedArr (write):     ${pad(r.typedTime.toFixed(1), 6)} ms | heap Δ ${fmt(r.typedHeapDelta)}`);
  console.log();
}
