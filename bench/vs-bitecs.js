// Benchmark: archetype-ecs (current) vs archetype+TypedArrays (hypothetical) vs bitECS
// Tests: system loop, entity creation, component add/remove churn

import { createEntityManager } from '../src/EntityManager.js';
import {
  createWorld, addEntity,
  addComponent, removeComponent,
  query
} from 'bitecs';

const ENTITY_COUNTS = [100, 1_000, 10_000, 100_000];
const FRAMES = 500;
const MAX_ENTITIES = 110_000;

const pad = (s, n) => String(s).padStart(n);

// =========================================================================
//  System loop: Position += Velocity
// =========================================================================

function benchArchetypeLoop(entityCount) {
  const em = createEntityManager();
  const Position = Symbol('Position');
  const Velocity = Symbol('Velocity');

  for (let i = 0; i < entityCount; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: Math.random() * 100, y: Math.random() * 100 });
    em.addComponent(id, Velocity, { vx: Math.random() * 10, vy: Math.random() * 10 });
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    const entities = em.query([Position, Velocity]);
    for (let i = 0; i < entities.length; i++) {
      const pos = em.getComponent(entities[i], Position);
      const vel = em.getComponent(entities[i], Velocity);
      pos.x += vel.vx;
      pos.y += vel.vy;
    }
  }
  return (performance.now() - t0) / FRAMES;
}

// Simulates archetype-ecs with TypedArray backing:
// Dense arrays per archetype, but Float32Arrays instead of object arrays
function benchArchetypeTypedLoop(entityCount) {
  // One archetype with all entities (they all have Position+Velocity)
  const count = entityCount;
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    px[i] = Math.random() * 100;
    py[i] = Math.random() * 100;
    vx[i] = Math.random() * 10;
    vy[i] = Math.random() * 10;
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    // Dense iteration — no entity ID lookup, no getComponent, no sparse gaps
    for (let i = 0; i < count; i++) {
      px[i] += vx[i];
      py[i] += vy[i];
    }
  }
  return (performance.now() - t0) / FRAMES;
}

function benchBitECSLoop(entityCount) {
  const world = createWorld();
  const Position = {
    x: new Float32Array(MAX_ENTITIES),
    y: new Float32Array(MAX_ENTITIES)
  };
  const Velocity = {
    vx: new Float32Array(MAX_ENTITIES),
    vy: new Float32Array(MAX_ENTITIES)
  };

  for (let i = 0; i < entityCount; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Velocity);
    Position.x[eid] = Math.random() * 100;
    Position.y[eid] = Math.random() * 100;
    Velocity.vx[eid] = Math.random() * 10;
    Velocity.vy[eid] = Math.random() * 10;
  }

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    const entities = query(world, [Position, Velocity]);
    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i];
      Position.x[eid] += Velocity.vx[eid];
      Position.y[eid] += Velocity.vy[eid];
    }
  }
  return (performance.now() - t0) / FRAMES;
}

// =========================================================================
//  Entity creation with 2 components
// =========================================================================

function benchArchetypeCreate(entityCount) {
  const em = createEntityManager();
  const Position = Symbol('Position');
  const Velocity = Symbol('Velocity');

  const t0 = performance.now();
  for (let i = 0; i < entityCount; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: i, y: i });
    em.addComponent(id, Velocity, { vx: 1, vy: 1 });
  }
  return performance.now() - t0;
}

function benchBitECSCreate(entityCount) {
  const world = createWorld();
  const Position = {
    x: new Float32Array(entityCount + 10),
    y: new Float32Array(entityCount + 10)
  };
  const Velocity = {
    vx: new Float32Array(entityCount + 10),
    vy: new Float32Array(entityCount + 10)
  };

  const t0 = performance.now();
  for (let i = 0; i < entityCount; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Velocity);
    Position.x[eid] = i;
    Position.y[eid] = i;
    Velocity.vx[eid] = 1;
    Velocity.vy[eid] = 1;
  }
  return performance.now() - t0;
}

// =========================================================================
//  Component add/remove churn
// =========================================================================

function benchArchetypeChurn(entityCount) {
  const em = createEntityManager();
  const Position = Symbol('Position');
  const Health = Symbol('Health');

  const ids = [];
  for (let i = 0; i < entityCount; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: 0, y: 0 });
    ids.push(id);
  }

  const ops = Math.min(entityCount, 10_000);
  const t0 = performance.now();
  for (let i = 0; i < ops; i++) {
    em.addComponent(ids[i], Health, { hp: 100 });
  }
  for (let i = 0; i < ops; i++) {
    em.removeComponent(ids[i], Health);
  }
  return { ms: performance.now() - t0, ops: ops * 2 };
}

function benchBitECSChurn(entityCount) {
  const world = createWorld();
  const Position = {
    x: new Float32Array(entityCount + 10),
    y: new Float32Array(entityCount + 10)
  };
  const Health = {
    hp: new Float32Array(entityCount + 10)
  };

  const eids = [];
  for (let i = 0; i < entityCount; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    Position.x[eid] = 0;
    Position.y[eid] = 0;
    eids.push(eid);
  }

  const ops = Math.min(entityCount, 10_000);
  const t0 = performance.now();
  for (let i = 0; i < ops; i++) {
    addComponent(world, eids[i], Health);
    Health.hp[eids[i]] = 100;
  }
  for (let i = 0; i < ops; i++) {
    removeComponent(world, eids[i], Health);
  }
  return { ms: performance.now() - t0, ops: ops * 2 };
}

// =========================================================================
//  RUN
// =========================================================================

// Warmup
benchArchetypeLoop(100);
benchArchetypeTypedLoop(100);
benchBitECSLoop(100);

console.log(`\n=== System loop: Position += Velocity (${FRAMES} frames, per-frame time) ===\n`);
console.log('Entities    | arch (now)    | arch+typed   | bitECS       | arch+typed vs bitECS');
console.log('------------|---------------|--------------|--------------|---------------------');

for (const count of ENTITY_COUNTS) {
  const arch = benchArchetypeLoop(count);
  const archTyped = benchArchetypeTypedLoop(count);
  const bit = benchBitECSLoop(count);
  const vsNow = arch / archTyped;
  const vsBit = bit / archTyped;
  console.log(
    `${pad(count.toLocaleString(), 11)} | ` +
    `${pad(arch.toFixed(3), 10)} ms | ` +
    `${pad(archTyped.toFixed(3), 9)} ms | ` +
    `${pad(bit.toFixed(3), 9)} ms | ` +
    `${vsBit > 1.1 ? `arch+typed ${vsBit.toFixed(1)}x sneller` : vsBit < 0.9 ? `bitECS ${(1/vsBit).toFixed(1)}x sneller` : '~gelijk'}`
  );
}

console.log(`\n=== Entity creation (with 2 components) ===\n`);
console.log('Entities    | archetype-ecs | bitECS       | Δ');
console.log('------------|---------------|--------------|-------');

for (const count of ENTITY_COUNTS) {
  const arch = benchArchetypeCreate(count);
  const bit = benchBitECSCreate(count);
  const ratio = arch / bit;
  const winner = ratio > 1.1 ? `bitECS ${ratio.toFixed(1)}x` : ratio < 0.9 ? `arch ${(1/ratio).toFixed(1)}x` : '~gelijk';
  console.log(
    `${pad(count.toLocaleString(), 11)} | ` +
    `${pad(arch.toFixed(1), 10)} ms | ` +
    `${pad(bit.toFixed(1), 9)} ms | ` +
    `${winner}`
  );
}

console.log(`\n=== Component add/remove churn (10k ops) ===\n`);
console.log('Entities    | archetype-ecs | bitECS       | Δ');
console.log('------------|---------------|--------------|-------');

for (const count of [1_000, 10_000, 100_000]) {
  const arch = benchArchetypeChurn(count);
  const bit = benchBitECSChurn(count);
  const ratio = arch.ms / bit.ms;
  const winner = ratio > 1.1 ? `bitECS ${ratio.toFixed(1)}x` : ratio < 0.9 ? `arch ${(1/ratio).toFixed(1)}x` : '~gelijk';
  console.log(
    `${pad(count.toLocaleString(), 11)} | ` +
    `${pad(arch.ms.toFixed(1), 10)} ms | ` +
    `${pad(bit.ms.toFixed(1), 9)} ms | ` +
    `${winner}`
  );
}

console.log();
