// Component Churn Benchmark: 1M entities, component add/remove over 500 frames
// Vergelijkt runtime van code gecompileerd met tsc (JS) vs tsgo (Go)
// Run met: node --expose-gc bench/component-churn-bench.js
// Of via: bash bench/run-js-vs-go-ts.sh

import { createEntityManager, component } from '../dist/index.js';

const COUNT = 1_000_000;
const FRAMES = 500;
const CHURN_BATCH = 1_000;
const RUNS = 5;

// ── Utilities ────────────────────────────────────────────────────────────────

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length & 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const memMB = () => {
  if (globalThis.gc) globalThis.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

// ── Components ───────────────────────────────────────────────────────────────

const Position = component('ChurnPos', { x: 'f32', y: 'f32' });
const Velocity = component('ChurnVel', { vx: 'f32', vy: 'f32' });
const Active   = component('ChurnActive', { frame: 'i32' });

// ── Benchmark: iteration only (baseline) ─────────────────────────────────────

function benchIterationOnly() {
  const em = createEntityManager();
  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  // Warmup
  for (let f = 0; f < 10; f++) {
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

// ── Benchmark: iteration + component churn ───────────────────────────────────

function benchComponentChurn() {
  const em = createEntityManager();

  const entityIds = new Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    entityIds[i] = em.createEntityWith(
      Position, { x: i * 0.1, y: i * 0.1 },
      Velocity, { vx: 1, vy: 1 },
    );
  }

  let activeIds = [];

  // Warmup
  for (let f = 0; f < 10; f++) {
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
    // 1. Movement system: iterate all entities with Position + Velocity
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

    // 2. Remove Active from previous batch (archetype migration)
    for (const id of activeIds) {
      em.removeComponent(id, Active);
    }

    // 3. Add Active to new batch (archetype migration, rotating through entities)
    activeIds = [];
    const base = (f * CHURN_BATCH) % (COUNT - CHURN_BATCH);
    for (let i = 0; i < CHURN_BATCH; i++) {
      const id = entityIds[base + i];
      em.addComponent(id, Active, { frame: f });
      activeIds.push(id);
    }

    // 4. Process Active entities (small set, tests multi-archetype iteration)
    em.forEach([Position, Active], (arch) => {
      const px = arch.field(Position.x);
      const frame = arch.field(Active.frame);
      for (let i = 0; i < arch.count; i++) {
        px[i] += frame[i] * 0.001;
      }
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const compiler = process.env.TS_COMPILER || 'unknown';

  console.log(`=== Component Churn Benchmark ===`);
  console.log(`    ${(COUNT / 1e6).toFixed(0)}M entities | ${FRAMES} frames | ${CHURN_BATCH} churn/frame | ${RUNS} runs`);
  console.log(`    Compiler: ${compiler}`);
  console.log();

  const memBefore = memMB();

  // ── Baseline: iteration only ──────────────────────────────────────────────
  console.log('  [1/2] Iteration only (baseline)');
  const iterResults = [];
  for (let r = 0; r < RUNS; r++) {
    process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
    const ms = benchIterationOnly();
    iterResults.push(ms);
    console.log(` ${ms.toFixed(2)} ms/frame`);
  }
  const iterMedian = median(iterResults);

  // ── Component churn ───────────────────────────────────────────────────────
  console.log('  [2/2] Iteration + component churn');
  const churnResults = [];
  for (let r = 0; r < RUNS; r++) {
    process.stdout.write(`        Run ${r + 1}/${RUNS}...`);
    const ms = benchComponentChurn();
    churnResults.push(ms);
    console.log(` ${ms.toFixed(2)} ms/frame`);
  }
  const churnMedian = median(churnResults);

  const memAfter = memMB();
  const churnOverhead = ((churnMedian / iterMedian - 1) * 100).toFixed(1);

  // ── Resultaten ────────────────────────────────────────────────────────────
  console.log();
  console.log(`  Resultaten (${compiler}):`);
  console.log(`    Iteratie baseline:  ${iterMedian.toFixed(2)} ms/frame`);
  console.log(`    Met component churn: ${churnMedian.toFixed(2)} ms/frame`);
  console.log(`    Churn overhead:     +${churnOverhead}%`);
  console.log(`    Geheugen (heap):    ~${(memAfter - memBefore).toFixed(0)} MB`);
  console.log();

  // Machine-readable output voor runner script
  console.log(`__ITER__=${iterMedian.toFixed(4)}`);
  console.log(`__CHURN__=${churnMedian.toFixed(4)}`);
}

main();
