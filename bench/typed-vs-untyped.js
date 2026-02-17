// Benchmark: forEach+field (bulk TypedArray) vs query+get/set (per-entity) vs query+getComponent (allocating)

import { createEntityManager, component } from '../dist/src/index.js';

const COUNT = 1_000_000;
const FRAMES = 200;

// --- forEach + field() — bulk dense TypedArray access ---
function benchForEachField() {
  const Pos = component('FP', 'f32', ['x', 'y']);
  const Vel = component('FV', 'f32', ['vx', 'vy']);
  const em = createEntityManager();

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Pos, { x: i, y: i }, Vel, { vx: 1, vy: 1 });
  }

  // Warmup
  for (let f = 0; f < 5; f++) {
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

// --- query + get/set — per-entity field access (zero-alloc per field) ---
function benchQueryGetSet() {
  const Pos = component('GP', 'f32', ['x', 'y']);
  const Vel = component('GV', 'f32', ['vx', 'vy']);
  const em = createEntityManager();

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Pos, { x: i, y: i }, Vel, { vx: 1, vy: 1 });
  }

  const ids = em.query([Pos, Vel]);

  // Warmup
  for (let f = 0; f < 5; f++) {
    for (let i = 0; i < ids.length; i++) {
      em.set(ids[i], Pos.x, em.get(ids[i], Pos.x) + em.get(ids[i], Vel.vx));
      em.set(ids[i], Pos.y, em.get(ids[i], Pos.y) + em.get(ids[i], Vel.vy));
    }
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    for (let i = 0; i < ids.length; i++) {
      em.set(ids[i], Pos.x, em.get(ids[i], Pos.x) + em.get(ids[i], Vel.vx));
      em.set(ids[i], Pos.y, em.get(ids[i], Pos.y) + em.get(ids[i], Vel.vy));
    }
  }
  return (performance.now() - t0) / FRAMES;
}

// --- query + getComponent — per-entity object allocation ---
function benchQueryGetComponent() {
  const Pos = component('CP', 'f32', ['x', 'y']);
  const Vel = component('CV', 'f32', ['vx', 'vy']);
  const em = createEntityManager();

  for (let i = 0; i < COUNT; i++) {
    em.createEntityWith(Pos, { x: i, y: i }, Vel, { vx: 1, vy: 1 });
  }

  const ids = em.query([Pos, Vel]);

  // Only 20 frames for this one — it's very slow at 1M
  const frames = 20;

  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < ids.length; i++) {
      const pos = em.getComponent(ids[i], Pos);
      const vel = em.getComponent(ids[i], Vel);
      em.set(ids[i], Pos.x, pos.x + vel.vx);
      em.set(ids[i], Pos.y, pos.y + vel.vy);
    }
  }
  return (performance.now() - t0) / frames;
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

// --- Run ---
console.log(`\n=== Access patterns: ${(COUNT / 1e6).toFixed(0)}M entities ===\n`);

console.log(`Iteration (${FRAMES} frames, Position += Velocity):`);
const forEachField = benchForEachField();
console.log(`  forEach + field():            ${forEachField.toFixed(2)} ms/frame`);

const queryGetSet = benchQueryGetSet();
console.log(`  query + get/set:              ${queryGetSet.toFixed(2)} ms/frame`);

const queryGetComp = benchQueryGetComponent();
console.log(`  query + getComponent:         ${queryGetComp.toFixed(2)} ms/frame`);

console.log(`\n  forEach vs get/set:           ${(queryGetSet / forEachField).toFixed(1)}x faster`);
console.log(`  forEach vs getComponent:      ${(queryGetComp / forEachField).toFixed(1)}x faster`);

// String components
console.log(`\nString component (${(COUNT / 1e6).toFixed(0)}M entities, { name, tag }):`);
const str = benchStringSoA();
console.log(`  create:                       ${str.createTime.toFixed(0)} ms`);
console.log(`  forEach(field):               ${str.forEachTime.toFixed(1)} ms/frame`);
console.log(`  get() per entity:             ${str.getTime.toFixed(1)} ms/frame`);
console.log(`  forEach vs get:               ${(str.getTime / str.forEachTime).toFixed(1)}x faster`);
console.log();
