// Allocation benchmark: creating 1M entities with Position + Velocity
// Compares: archetype-ecs (typed) vs bitECS vs archetype-ecs (untyped/legacy)

import {
  createWorld, addEntity, addComponent, removeEntity, query
} from 'bitecs';
import { createEntityManager, component } from '../dist/src/index.js';

const COUNT = 1_000_000;
const RUNS = 5;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function memMB() {
  if (globalThis.gc) globalThis.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

// --- archetype-ecs: typed (SoA) ---
function benchOursTyped() {
  const Position = component('AllocPos', { x: 'f32', y: 'f32' });
  const Velocity = component('AllocVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager();

  const memBefore = memMB();
  const t0 = performance.now();

  for (let i = 0; i < COUNT; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: i, y: i });
    em.addComponent(id, Velocity, { vx: 1, vy: 1 });
  }

  const createTime = performance.now() - t0;
  const memAfter = memMB();

  // Destroy all
  const t1 = performance.now();
  const ids = em.query([Position]);
  for (const id of ids) em.destroyEntity(id);
  const destroyTime = performance.now() - t1;

  return { createTime, destroyTime, memDelta: memAfter - memBefore };
}

// --- archetype-ecs: typed (SoA) with createEntityWith (no migration) ---
function benchOursTypedBatch() {
  const Position = component('AllocPosBatch', { x: 'f32', y: 'f32' });
  const Velocity = component('AllocVelBatch', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager();

  const memBefore = memMB();
  const t0 = performance.now();

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Position, { x: i, y: i }, Velocity, { vx: 1, vy: 1 });
  }

  const createTime = performance.now() - t0;
  const memAfter = memMB();

  const t1 = performance.now();
  const ids = em.query([Position]);
  for (const id of ids) em.destroyEntity(id);
  const destroyTime = performance.now() - t1;

  return { createTime, destroyTime, memDelta: memAfter - memBefore };
}

// --- archetype-ecs: untyped (legacy object arrays) ---
function benchOursUntyped() {
  const Position = Symbol('AllocPosUn');
  const Velocity = Symbol('AllocVelUn');
  const em = createEntityManager();

  const memBefore = memMB();
  const t0 = performance.now();

  for (let i = 0; i < COUNT; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: i, y: i });
    em.addComponent(id, Velocity, { vx: 1, vy: 1 });
  }

  const createTime = performance.now() - t0;
  const memAfter = memMB();

  const t1 = performance.now();
  const ids = em.query([Position]);
  for (const id of ids) em.destroyEntity(id);
  const destroyTime = performance.now() - t1;

  return { createTime, destroyTime, memDelta: memAfter - memBefore };
}

// --- bitECS ---
function benchBitECS() {
  const world = createWorld();
  const Position = { x: new Float32Array(COUNT + 10), y: new Float32Array(COUNT + 10) };
  const Velocity = { vx: new Float32Array(COUNT + 10), vy: new Float32Array(COUNT + 10) };

  const memBefore = memMB();
  const t0 = performance.now();

  for (let i = 0; i < COUNT; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Velocity);
    Position.x[eid] = i;
    Position.y[eid] = i;
    Velocity.vx[eid] = 1;
    Velocity.vy[eid] = 1;
  }

  const createTime = performance.now() - t0;
  const memAfter = memMB();

  const t1 = performance.now();
  const entities = query(world, [Position, Velocity]);
  for (const eid of entities) removeEntity(world, eid);
  const destroyTime = performance.now() - t1;

  return { createTime, destroyTime, memDelta: memAfter - memBefore };
}

// --- Run ---
console.log(`\n=== Allocation benchmark: ${(COUNT / 1e6).toFixed(0)}M entities (Position + Velocity) ===`);
console.log(`    ${RUNS} runs, median taken\n`);

const results = { typed: [], typedBatch: [], untyped: [], bitecs: [] };

for (let r = 0; r < RUNS; r++) {
  results.typed.push(benchOursTyped());
  results.typedBatch.push(benchOursTypedBatch());
  results.untyped.push(benchOursUntyped());
  results.bitecs.push(benchBitECS());
}

function report(label, runs) {
  const create = median(runs.map(r => r.createTime));
  const destroy = median(runs.map(r => r.destroyTime));
  const mem = median(runs.map(r => r.memDelta));
  console.log(`  ${label}`);
  console.log(`    create:  ${create.toFixed(1)} ms`);
  console.log(`    destroy: ${destroy.toFixed(1)} ms`);
  console.log(`    heap:    +${mem.toFixed(1)} MB`);
  return { create, destroy, mem };
}

const t = report('typed + addComponent (2 migraties)', results.typed);
const tb = report('typed + createEntityWith (0 migraties)', results.typedBatch);
const u = report('untyped + addComponent', results.untyped);
const b = report('bitECS', results.bitecs);

console.log(`\n  createEntityWith vs addComponent: ${(t.create / tb.create).toFixed(1)}x sneller`);
console.log(`  createEntityWith vs bitECS:       ${(tb.create / b.create).toFixed(1)}x (${tb.create < b.create ? 'sneller' : 'trager'})`);
console.log(`  memory: typed ${t.mem.toFixed(0)} MB, batch ${tb.mem.toFixed(0)} MB, bitECS ${b.mem.toFixed(0)} MB`);
console.log();
