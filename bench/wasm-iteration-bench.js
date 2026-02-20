// WASM SIMD Iteration Benchmark
// Compares: ECS forEach (JS), ECS forEach (WASM-backed), ECS + WASM SIMD kernel
// Run with: node --expose-gc bench/wasm-iteration-bench.js

import { createEntityManager, component, instantiateKernels } from '../dist/index.js';

const COUNT = 1_000_000;
const FRAMES = 500;
const WARMUP = 10;
const RUNS = 5;

// ── Utilities ────────────────────────────────────────────────────────────────

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length & 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const pad = (s, n) => String(s).padStart(n);
const padEnd = (s, n) => String(s).padEnd(n);

// ── Benchmark 1: ECS forEach — default JS storage (baseline) ─────────────────

function benchECSForEach() {
  const Position = component('BPos', { x: 'f32', y: 'f32' });
  const Velocity = component('BVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager();

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  for (let f = 0; f < WARMUP; f++) {
    em.forEach([Position, Velocity], (arch) => {
      const px = arch.field(Position.x);
      const py = arch.field(Position.y);
      const vx = arch.field(Velocity.vx);
      const vy = arch.field(Velocity.vy);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.forEach([Position, Velocity], (arch) => {
      const px = arch.field(Position.x);
      const py = arch.field(Position.y);
      const vx = arch.field(Velocity.vx);
      const vy = arch.field(Velocity.vy);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Benchmark 2: ECS forEach — WASM-backed storage, JS iteration ────────────

function benchECSWasmStorage() {
  const Position = component('WPos', { x: 'f32', y: 'f32' });
  const Velocity = component('WVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager({ wasm: true });

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  for (let f = 0; f < WARMUP; f++) {
    em.forEach([Position, Velocity], (arch) => {
      const px = arch.field(Position.x);
      const py = arch.field(Position.y);
      const vx = arch.field(Velocity.vx);
      const vy = arch.field(Velocity.vy);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.forEach([Position, Velocity], (arch) => {
      const px = arch.field(Position.x);
      const py = arch.field(Position.y);
      const vx = arch.field(Velocity.vx);
      const vy = arch.field(Velocity.vy);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Benchmark 3: ECS WASM-backed + WASM SIMD kernel ─────────────────────────

async function benchECSWasmSIMD() {
  const Position = component('SPos', { x: 'f32', y: 'f32' });
  const Velocity = component('SVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager({ wasm: true });

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  const kernels = await instantiateKernels(em.wasmMemory);

  for (let f = 0; f < WARMUP; f++) {
    em.forEach([Position, Velocity], (arch) => {
      kernels.iterate_simd(
        arch.fieldOffset(Position.x),
        arch.fieldOffset(Position.y),
        arch.fieldOffset(Velocity.vx),
        arch.fieldOffset(Velocity.vy),
        arch.count,
      );
    });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.forEach([Position, Velocity], (arch) => {
      kernels.iterate_simd(
        arch.fieldOffset(Position.x),
        arch.fieldOffset(Position.y),
        arch.fieldOffset(Velocity.vx),
        arch.fieldOffset(Velocity.vy),
        arch.count,
      );
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Benchmark 4: ECS fieldAdd (auto SIMD dispatch) ──────────────────────────

function benchECSFieldAdd() {
  const Position = component('FAPos', { x: 'f32', y: 'f32' });
  const Velocity = component('FAVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager({ wasm: true });

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  for (let f = 0; f < WARMUP; f++) {
    em.forEach([Position, Velocity], (arch) => {
      arch.fieldAdd(Position.x, Velocity.vx);
      arch.fieldAdd(Position.y, Velocity.vy);
    });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.forEach([Position, Velocity], (arch) => {
      arch.fieldAdd(Position.x, Velocity.vx);
      arch.fieldAdd(Position.y, Velocity.vy);
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Output ───────────────────────────────────────────────────────────────────

function printTable(title, results, baselineName) {
  console.log(`\n--- ${title} ---\n`);

  const baseline = results.find(r => r.name === baselineName)?.value;
  const nameWidth = 28;
  const valueWidth = 12;

  console.log(`  ${padEnd('Test', nameWidth)} ${pad('ms/frame', valueWidth)}     vs ${baselineName}`);
  console.log(`  ${'─'.repeat(nameWidth + valueWidth + 25)}`);

  for (const { name, value } of results) {
    const valueStr = pad(value.toFixed(3), valueWidth);
    let comparison;
    if (name === baselineName) {
      comparison = 'baseline';
    } else if (baseline != null && baseline > 0) {
      const ratio = value / baseline;
      if (ratio > 1.05) {
        comparison = `${ratio.toFixed(2)}x slower`;
      } else if (ratio < 0.95) {
        comparison = `${(1 / ratio).toFixed(2)}x faster`;
      } else {
        comparison = '~same';
      }
    } else {
      comparison = '';
    }
    console.log(`  ${padEnd(name, nameWidth)} ${valueStr}     ${comparison}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== WASM SIMD Iteration Benchmark: ${(COUNT / 1e6).toFixed(0)}M entities ===`);
  console.log(`    ${FRAMES} frames | ${RUNS} runs (median) | ${WARMUP} warmup frames`);
  console.log();

  const results = [];

  // 1. ECS forEach (default JS storage)
  {
    console.log('  [1/4] ECS forEach (JS storage, baseline)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = benchECSForEach();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'ECS forEach (JS)', value: median(times) });
  }

  // 2. ECS forEach (WASM-backed storage, JS iteration)
  {
    console.log('  [2/4] ECS forEach (WASM storage, JS iter)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = benchECSWasmStorage();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'ECS forEach (WASM storage)', value: median(times) });
  }

  // 3. ECS WASM-backed + WASM SIMD kernel
  {
    console.log('  [3/4] ECS + WASM SIMD kernel (manual)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = await benchECSWasmSIMD();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'ECS + WASM SIMD (manual)', value: median(times) });
  }

  // 4. ECS fieldAdd (auto SIMD dispatch)
  {
    console.log('  [4/4] ECS fieldAdd (auto SIMD)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = benchECSFieldAdd();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'ECS fieldAdd (auto)', value: median(times) });
  }

  printTable(
    `Iteration (${FRAMES} frames, ${(COUNT / 1e6).toFixed(0)}M entities) — ms/frame`,
    results,
    'ECS forEach (JS)',
  );

  console.log();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
