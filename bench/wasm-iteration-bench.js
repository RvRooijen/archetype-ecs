// WASM SIMD Iteration Benchmark
// Compares: ECS forEach (JS), ECS forEach (WASM-backed), ECS + WASM SIMD kernel
// Run with: node --expose-gc bench/wasm-iteration-bench.js

import { createEntityManager, component, add } from '../dist/index.js';

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

// ── Benchmark 3: em.apply (auto SIMD dispatch) ──────────────────────────────

function benchECSApply() {
  const Position = component('APos', { x: 'f32', y: 'f32' });
  const Velocity = component('AVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager({ wasm: true });

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  for (let f = 0; f < WARMUP; f++) {
    em.apply(Position.x, add(Position.x, Velocity.vx));
    em.apply(Position.y, add(Position.y, Velocity.vy));
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.apply(Position.x, add(Position.x, Velocity.vx));
    em.apply(Position.y, add(Position.y, Velocity.vy));
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Benchmark 4: em.apply with filter (half entities excluded) ───────────────
// 500K entities have [Position, Velocity], 500K have [Position, Velocity, Frozen].
// apply({ without: [Frozen] }) processes only the 500K active entities.
// Demonstrates that filter overhead is negligible (cached archetype lookup)
// and that processing fewer entities reduces time proportionally.

function benchECSApplyFiltered() {
  const Position = component('FPos', { x: 'f32', y: 'f32' });
  const Velocity = component('FVel', { vx: 'f32', vy: 'f32' });
  const Frozen   = component('FFrozen');
  const em = createEntityManager({ wasm: true });

  const half = COUNT / 2;
  for (let i = 0; i < half; i++) {
    em.createEntityWith(Position, { x: i * 0.1, y: i * 0.1 }, Velocity, { vx: 1, vy: 1 });
  }
  for (let i = 0; i < half; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: i * 0.1, y: i * 0.1 });
    em.addComponent(id, Velocity, { vx: 1, vy: 1 });
    em.addComponent(id, Frozen);
  }

  for (let f = 0; f < WARMUP; f++) {
    em.apply(Position.x, add(Position.x, Velocity.vx), { without: [Frozen] });
    em.apply(Position.y, add(Position.y, Velocity.vy), { without: [Frozen] });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.apply(Position.x, add(Position.x, Velocity.vx), { without: [Frozen] });
    em.apply(Position.y, add(Position.y, Velocity.vy), { without: [Frozen] });
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

  // 3. em.apply (auto SIMD dispatch)
  {
    console.log('  [3/4] em.apply (auto SIMD)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = benchECSApply();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'em.apply (auto SIMD)', value: median(times) });
  }

  // 4. em.apply with filter (500K active, 500K frozen)
  {
    console.log('  [4/4] em.apply (filter: without Frozen, 500K entities)');
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
      const ms = benchECSApplyFiltered();
      times.push(ms);
      console.log(` ${ms.toFixed(3)} ms/frame`);
    }
    results.push({ name: 'em.apply (filtered, 500K)', value: median(times) });
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
