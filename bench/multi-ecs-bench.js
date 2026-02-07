// Multi-ECS Benchmark: archetype-ecs vs bitECS vs wolf-ecs vs harmony-ecs vs miniplex
// Tests: iteration (Position += Velocity), entity creation, memory usage
// Run with: node --expose-gc bench/multi-ecs-bench.js

import { createEntityManager, component } from '../src/index.js';

const COUNT = 1_000_000;
const FRAMES = 500;
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

const pad = (s, n) => String(s).padStart(n);
const padEnd = (s, n) => String(s).padEnd(n);

// ── Safe import ──────────────────────────────────────────────────────────────

async function tryImport(specifier) {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}

// ── Library adapters ─────────────────────────────────────────────────────────

function adapterArchetypeECS() {
  return {
    name: 'archetype-ecs',
    setup() {
      const Position = component('BPos', { x: 'f32', y: 'f32' });
      const Velocity = component('BVel', { vx: 'f32', vy: 'f32' });
      const em = createEntityManager();
      return { em, Position, Velocity };
    },
    createEntities(ctx, count) {
      const { em, Position, Velocity } = ctx;
      for (let i = 0; i < count; i++) {
        em.createEntityWith(
          Position, { x: i * 0.1, y: i * 0.1 },
          Velocity, { vx: 1, vy: 1 },
        );
      }
    },
    iterateFrame(ctx) {
      const { em, Position, Velocity } = ctx;
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
    },
  };
}

async function adapterBitECS() {
  const mod = await tryImport('bitecs');
  if (!mod) return null;
  const { createWorld, addEntity, addComponent, query } = mod;
  return {
    name: 'bitecs',
    setup() {
      const world = createWorld();
      const Position = {
        x: new Float32Array(COUNT + 10),
        y: new Float32Array(COUNT + 10),
      };
      const Velocity = {
        vx: new Float32Array(COUNT + 10),
        vy: new Float32Array(COUNT + 10),
      };
      return { world, Position, Velocity };
    },
    createEntities(ctx, count) {
      const { world, Position, Velocity } = ctx;
      for (let i = 0; i < count; i++) {
        const eid = addEntity(world);
        addComponent(world, eid, Position);
        addComponent(world, eid, Velocity);
        Position.x[eid] = i * 0.1;
        Position.y[eid] = i * 0.1;
        Velocity.vx[eid] = 1;
        Velocity.vy[eid] = 1;
      }
    },
    iterateFrame(ctx) {
      const { world, Position, Velocity } = ctx;
      const entities = query(world, [Position, Velocity]);
      for (let i = 0; i < entities.length; i++) {
        const eid = entities[i];
        Position.x[eid] += Velocity.vx[eid];
        Position.y[eid] += Velocity.vy[eid];
      }
    },
  };
}

async function adapterWolfECS() {
  const mod = await tryImport('wolf-ecs');
  if (!mod) return null;
  const { ECS, types } = mod;
  return {
    name: 'wolf-ecs',
    setup() {
      const ecs = new ECS(COUNT + 10);
      const Position = ecs.defineComponent({ x: types.f32, y: types.f32 });
      const Velocity = ecs.defineComponent({ x: types.f32, y: types.f32 });
      const q = ecs.createQuery(Position, Velocity);
      return { ecs, Position, Velocity, q };
    },
    createEntities(ctx, count) {
      const { ecs, Position, Velocity } = ctx;
      for (let i = 0; i < count; i++) {
        const e = ecs.createEntity();
        ecs.addComponent(e, Position);
        ecs.addComponent(e, Velocity);
        Position.x[e] = i * 0.1;
        Position.y[e] = i * 0.1;
        Velocity.x[e] = 1;
        Velocity.y[e] = 1;
      }
    },
    iterateFrame(ctx) {
      const { Position, Velocity, q } = ctx;
      for (let i = 0; i < q.a.length; i++) {
        const arch = q.a[i].e;
        for (let j = 0; j < arch.length; j++) {
          const id = arch[j];
          Position.x[id] += Velocity.x[id];
          Position.y[id] += Velocity.y[id];
        }
      }
    },
  };
}

async function adapterHarmonyECS() {
  const mod = await tryImport('harmony-ecs');
  if (!mod) return null;
  const { World, Schema, Entity, Query, Format } = mod;
  return {
    name: 'harmony-ecs',
    setup() {
      const world = World.make(COUNT + 10);
      const Position = Schema.makeBinary(world, { x: Format.float32, y: Format.float32 });
      const Velocity = Schema.makeBinary(world, { x: Format.float32, y: Format.float32 });
      const layout = [Position, Velocity];
      const q = Query.make(world, layout);
      return { world, Position, Velocity, layout, q };
    },
    createEntities(ctx, count) {
      const { world, layout } = ctx;
      for (let i = 0; i < count; i++) {
        Entity.make(world, layout);
      }
    },
    iterateFrame(ctx) {
      const { q } = ctx;
      for (const [entities, [p, v]] of q) {
        for (let i = 0; i < entities.length; i++) {
          p.x[i] += v.x[i];
          p.y[i] += v.y[i];
        }
      }
    },
  };
}

async function adapterMiniplex() {
  let mod = await tryImport('miniplex');
  if (!mod) return null;
  const World = mod.World || mod.default?.World;
  if (!World) return null;
  return {
    name: 'miniplex',
    setup() {
      const world = new World();
      const q = world.with('position', 'velocity');
      return { world, q };
    },
    createEntities(ctx, count) {
      const { world } = ctx;
      for (let i = 0; i < count; i++) {
        world.add({
          position: { x: i * 0.1, y: i * 0.1 },
          velocity: { x: 1, y: 1 },
        });
      }
    },
    iterateFrame(ctx) {
      const { q } = ctx;
      for (const { position, velocity } of q) {
        position.x += velocity.x;
        position.y += velocity.y;
      }
    },
  };
}

// ── Benchmark runner ─────────────────────────────────────────────────────────

function benchIteration(adapter) {
  const ctx = adapter.setup();
  adapter.createEntities(ctx, COUNT);
  // Warmup
  for (let f = 0; f < 5; f++) adapter.iterateFrame(ctx);

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    adapter.iterateFrame(ctx);
  }
  return (performance.now() - t0) / FRAMES;
}

function benchCreation(adapter) {
  const ctx = adapter.setup();
  const t0 = performance.now();
  adapter.createEntities(ctx, COUNT);
  return performance.now() - t0;
}

function benchMemory(adapter) {
  try {
    const before = memMB();
    const ctx = adapter.setup();
    adapter.createEntities(ctx, COUNT);
    const after = memMB();
    return after - before;
  } catch {
    return null;
  }
}

function runMultiple(fn, adapter, runs) {
  const results = [];
  for (let r = 0; r < runs; r++) {
    try {
      results.push(fn(adapter));
    } catch {
      // Some libraries (e.g. harmony-ecs) have global state that breaks on re-creation
      break;
    }
  }
  return results.length > 0 ? median(results) : null;
}

// ── Output formatting ────────────────────────────────────────────────────────

function printTable(title, unit, results, baselineName, { moreLabel = 'slower', lessLabel = 'faster' } = {}) {
  console.log(`\n--- ${title} ---\n`);

  const baseline = results.find(r => r.name === baselineName)?.value;
  const nameWidth = 20;
  const valueWidth = 12;

  console.log(`  ${padEnd('Library', nameWidth)} ${pad(unit, valueWidth)}     vs ${baselineName}`);
  console.log(`  ${'─'.repeat(nameWidth + valueWidth + 25)}`);

  for (const { name, value } of results) {
    const valueStr = pad(value.toFixed(1), valueWidth);
    let comparison;
    if (name === baselineName) {
      comparison = 'baseline';
    } else if (baseline != null && baseline > 0) {
      const ratio = value / baseline;
      if (ratio > 1.05) {
        comparison = `${ratio.toFixed(1)}x ${moreLabel}`;
      } else if (ratio < 0.95) {
        comparison = `${(1 / ratio).toFixed(1)}x ${lessLabel}`;
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
  if (!globalThis.gc) {
    console.log('⚠  Run with --expose-gc for accurate memory measurements');
    console.log('   node --expose-gc bench/multi-ecs-bench.js\n');
  }

  console.log(`=== Multi-ECS Benchmark: ${(COUNT / 1e6).toFixed(0)}M entities ===`);
  console.log(`    ${RUNS} runs, median | node --expose-gc bench/multi-ecs-bench.js\n`);

  // Resolve adapters
  const adapterFactories = [
    adapterArchetypeECS,
    adapterBitECS,
    adapterWolfECS,
    adapterHarmonyECS,
    adapterMiniplex,
  ];

  const adapters = [];
  for (const factory of adapterFactories) {
    try {
      const adapter = await (typeof factory === 'function' && factory.constructor.name === 'AsyncFunction'
        ? factory()
        : factory());
      if (adapter) {
        adapters.push(adapter);
      } else {
        const name = factory.name.replace('adapter', '').replace(/([A-Z])/g, ' $1').trim();
        console.log(`  [skip] ${name} — not installed`);
      }
    } catch (e) {
      const name = factory.name.replace('adapter', '').replace(/([A-Z])/g, ' $1').trim();
      console.log(`  [skip] ${name} — ${e.message}`);
    }
  }

  if (adapters.length === 0) {
    console.log('\nNo libraries available. Install dependencies and try again.');
    process.exit(1);
  }

  console.log(`\n  Running benchmarks for: ${adapters.map(a => a.name).join(', ')}\n`);

  // ── Iteration benchmark ──────────────────────────────────────────────────
  const iterResults = [];
  for (const adapter of adapters) {
    process.stdout.write(`  Benchmarking iteration: ${adapter.name}...`);
    const ms = runMultiple(benchIteration, adapter, RUNS);
    if (ms != null) {
      iterResults.push({ name: adapter.name, value: ms });
      process.stdout.write(` ${ms.toFixed(2)} ms/frame\n`);
    } else {
      process.stdout.write(` failed\n`);
    }
  }
  iterResults.sort((a, b) => a.value - b.value);
  printTable(`Iteration (${FRAMES} frames, ${(COUNT / 1e6).toFixed(0)}M entities) — ms/frame`, 'ms/frame', iterResults, 'archetype-ecs');

  // ── Creation benchmark ───────────────────────────────────────────────────
  const createResults = [];
  for (const adapter of adapters) {
    process.stdout.write(`  Benchmarking creation: ${adapter.name}...`);
    const ms = runMultiple(benchCreation, adapter, RUNS);
    if (ms != null) {
      createResults.push({ name: adapter.name, value: ms });
      process.stdout.write(` ${ms.toFixed(1)} ms\n`);
    } else {
      process.stdout.write(` failed\n`);
    }
  }
  createResults.sort((a, b) => a.value - b.value);
  printTable(`Entity creation (${(COUNT / 1e6).toFixed(0)}M with Position + Velocity) — ms total`, 'ms', createResults, 'archetype-ecs');

  // ── Memory benchmark ─────────────────────────────────────────────────────
  const memResults = [];
  for (const adapter of adapters) {
    process.stdout.write(`  Benchmarking memory: ${adapter.name}...`);
    const mb = benchMemory(adapter);
    if (mb != null) {
      memResults.push({ name: adapter.name, value: mb });
      process.stdout.write(` ${mb.toFixed(1)} MB\n`);
    } else {
      process.stdout.write(` failed\n`);
    }
  }
  memResults.sort((a, b) => a.value - b.value);
  printTable(`Memory (heap delta, ${(COUNT / 1e6).toFixed(0)}M entities) — MB`, 'MB', memResults, 'archetype-ecs', { moreLabel: 'more', lessLabel: 'less' });

  console.log();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
