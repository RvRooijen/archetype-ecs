// Compile-time type tests — run with: npx tsc --noEmit
// These tests validate TS types flow correctly through the API.
// No runtime execution needed; if this file compiles, the types are correct.

import {
  createEntityManager, createSystems, component,
  System, OnAdded, OnRemoved,
  type ComponentDef, type FieldRef, type EntityId,
  type Pipeline
} from '../src/index.js';

// --- component() creates ComponentDef ---
const Position = component('Position', 'f32', ['x', 'y']);
const Velocity = component('Velocity', { vx: 'f32', vy: 'f32' });
const Tag = component('Tag');
const Name = component('Name', { name: 'string', title: 'string' });
const Label = component('Label', 'string', ['text', 'color']);

// component() returns ComponentDef
const _assertComp: ComponentDef = Position;
const _assertTag: ComponentDef = Tag;

// --- EntityManager typed methods ---
const em = createEntityManager();
const id: EntityId = em.createEntity();

// addComponent: accepts data
em.addComponent(id, Position, { x: 1, y: 2 });
em.addComponent(id, Velocity, { vx: 0, vy: 0 });
em.addComponent(id, Name, { name: 'Hero', title: 'Sir' });

// getComponent: returns data or undefined
const pos = em.getComponent(id, Position);

// get/set: field descriptor access
const px = em.get(id, Position.x);
em.set(id, Position.x, 10);

// forEach + field: accepts FieldRef
em.forEach([Position, Velocity], (arch) => {
  const count: number = arch.count;
  const ids: EntityId[] = arch.entityIds;
  const arrX = arch.field(Position.x);
});

// createEntityWith: alternating type, data
em.createEntityWith(Position, { x: 0, y: 0 }, Velocity, { vx: 1, vy: 1 });

// --- Class-based System ---
class TestSystem extends System {
  @OnAdded(Position)
  handleAdd(id: EntityId) {}

  @OnRemoved(Position)
  handleRemove(id: EntityId) {}

  tick() {
    this.forEach([Position], (view) => {
      const count: number = view.count;
    });
  }
}

const testSys = new TestSystem(em);
testSys.run();
testSys.dispose();

// --- createSystems returns Pipeline ---
const pipeline: Pipeline = createSystems(em, [TestSystem]);
pipeline();
pipeline.dispose();
