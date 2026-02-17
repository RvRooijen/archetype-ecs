// Focused benchmark: archetype+TypedArrays vs bitECS at 1M entities

import {
  createWorld, addEntity, addComponent, query
} from 'bitecs';
import { createEntityManager, component } from '../dist/src/index.js';

const COUNT = 1_000_000;
const FRAMES = 500;

// archetype-ecs: component() with schema + forEach() hot path
function benchArchetypeTyped() {
  const Position = component('BenchPos', { x: 'f32', y: 'f32' });
  const Velocity = component('BenchVel', { vx: 'f32', vy: 'f32' });
  const em = createEntityManager();

  for (let i = 0; i < COUNT; i++) {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: Math.random() * 100, y: Math.random() * 100 });
    em.addComponent(id, Velocity, { vx: Math.random() * 10, vy: Math.random() * 10 });
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

// bitECS: sparse TypedArrays, query returns entity ID list
function benchBitECS() {
  const world = createWorld();
  const Position = {
    x: new Float32Array(COUNT + 10),
    y: new Float32Array(COUNT + 10)
  };
  const Velocity = {
    vx: new Float32Array(COUNT + 10),
    vy: new Float32Array(COUNT + 10)
  };

  for (let i = 0; i < COUNT; i++) {
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

// Warmup
benchArchetypeTyped();

console.log(`\n=== 1M entities, ${FRAMES} frames: Position += Velocity ===\n`);

const archTyped = benchArchetypeTyped();
console.log(`  arch+typed:  ${archTyped.toFixed(3)} ms/frame`);

const bit = benchBitECS();
console.log(`  bitECS:      ${bit.toFixed(3)} ms/frame`);

const ratio = bit / archTyped;
console.log(`\n  → arch+typed is ${ratio.toFixed(1)}x sneller`);
console.log();
