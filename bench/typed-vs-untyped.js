// Benchmark: typed (SoA TypedArrays) vs untyped (object arrays) components

import { createEntityManager, component } from '../src/index.js';

const COUNT = 1_000_000;
const FRAMES = 200;

// --- Typed: creation ---
function benchTypedCreate() {
  const Pos = component('TP', 'f32', ['x', 'y']);
  const Vel = component('TV', 'f32', ['vx', 'vy']);
  const em = createEntityManager();

  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Pos, { x: i, y: i }, Vel, { vx: 1, vy: 1 });
  }
  return { em, Pos, Vel, time: performance.now() - t0 };
}

// --- Untyped: creation ---
function benchUntypedCreate() {
  const Pos = component('UP');
  const Vel = component('UV');
  const em = createEntityManager();

  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Pos, { x: i, y: i }, Vel, { vx: 1, vy: 1 });
  }
  return { em, Pos, Vel, time: performance.now() - t0 };
}

// --- Typed: iteration with forEach + field() ---
function benchTypedIterate(em, Pos, Vel) {
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    em.forEach([Pos, Vel], (arch) => {
      const px = arch.field(Pos.x);
      const py = arch.field(Pos.y);
      const vx = arch.field(Vel.vx);
      const vy = arch.field(Vel.vy);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });
  }
  return (performance.now() - t0) / FRAMES;
}

// --- Untyped: iteration with forEach (object access) ---
function benchUntypedIterate(em, Pos, Vel) {
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    const ids = em.query([Pos, Vel]);
    for (let i = 0; i < ids.length; i++) {
      const pos = em.getComponent(ids[i], Pos);
      const vel = em.getComponent(ids[i], Vel);
      pos.x += vel.vx;
      pos.y += vel.vy;
    }
  }
  return (performance.now() - t0) / FRAMES;
}

// --- String SoA: creation + access ---
function benchStringSoA() {
  const Name = component('SSoA', { name: 'string', tag: 'string' });
  const em = createEntityManager();

  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Name, { name: `entity_${i}`, tag: 'npc' });
  }
  const createTime = performance.now() - t0;

  // forEach field access
  const t1 = performance.now();
  let count = 0;
  for (let f = 0; f < 50; f++) {
    em.forEach([Name], (arch) => {
      const names = arch.field(Name.name);
      for (let i = 0; i < arch.count; i++) {
        if (names[i].length > 5) count++;
      }
    });
  }
  const forEachTime = (performance.now() - t1) / 50;

  // get() field access
  const ids = em.query([Name]);
  const t2 = performance.now();
  let count2 = 0;
  for (let f = 0; f < 50; f++) {
    for (let i = 0; i < ids.length; i++) {
      if (em.get(ids[i], Name.name).length > 5) count2++;
    }
  }
  const getTime = (performance.now() - t2) / 50;

  return { createTime, forEachTime, getTime, count, count2 };
}

// --- String untyped: creation + access ---
function benchStringUntyped() {
  const Name = component('SUn');
  const em = createEntityManager();

  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Name, { name: `entity_${i}`, tag: 'npc' });
  }
  const createTime = performance.now() - t0;

  // getComponent access
  const ids = em.query([Name]);
  const t1 = performance.now();
  let count = 0;
  for (let f = 0; f < 50; f++) {
    for (let i = 0; i < ids.length; i++) {
      const n = em.getComponent(ids[i], Name);
      if (n.name.length > 5) count++;
    }
  }
  const accessTime = (performance.now() - t1) / 50;

  return { createTime, accessTime, count };
}

// --- Run ---
console.log(`\n=== Typed vs Untyped: ${(COUNT / 1e6).toFixed(0)}M entities ===\n`);

// Warmup
benchTypedCreate();
benchUntypedCreate();

// Creation
const typed = benchTypedCreate();
const untyped = benchUntypedCreate();

console.log(`Creation (${(COUNT / 1e6).toFixed(0)}M entities, createEntityWith):`);
console.log(`  typed:    ${typed.time.toFixed(0)} ms`);
console.log(`  untyped:  ${untyped.time.toFixed(0)} ms`);
console.log(`  ratio:    ${(untyped.time / typed.time).toFixed(2)}x`);

// Iteration
const typedIter = benchTypedIterate(typed.em, typed.Pos, typed.Vel);
const untypedIter = benchUntypedIterate(untyped.em, untyped.Pos, untyped.Vel);

console.log(`\nIteration (${FRAMES} frames, Position += Velocity):`);
console.log(`  typed (forEach+field):        ${typedIter.toFixed(2)} ms/frame`);
console.log(`  untyped (query+getComponent): ${untypedIter.toFixed(2)} ms/frame`);
console.log(`  ratio:    ${(untypedIter / typedIter).toFixed(1)}x slower`);

// String components
console.log(`\nString component (${(COUNT / 1e6).toFixed(0)}M entities, { name, tag }):`);
const strSoA = benchStringSoA();
const strUn = benchStringUntyped();
console.log(`  SoA create:                   ${strSoA.createTime.toFixed(0)} ms`);
console.log(`  untyped create:               ${strUn.createTime.toFixed(0)} ms`);
console.log(`  SoA forEach(field):           ${strSoA.forEachTime.toFixed(1)} ms/frame`);
console.log(`  SoA get():                    ${strSoA.getTime.toFixed(1)} ms/frame`);
console.log(`  untyped getComponent():       ${strUn.accessTime.toFixed(1)} ms/frame`);
console.log(`  forEach vs getComponent:      ${(strUn.accessTime / strSoA.forEachTime).toFixed(1)}x faster`);
console.log();
