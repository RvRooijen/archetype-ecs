// Compile-time type tests — run with: npx tsc --noEmit
// These tests validate TS types flow correctly through the API.
// No runtime execution needed; if this file compiles, the types are correct.

import {
  createEntityManager, createSystem, createSystems, component,
  System, OnAdded, OnRemoved,
  type ComponentDef, type FieldRef, type EntityId,
  type SystemContext, type FunctionalSystemConstructor, type FunctionalSystem, type Pipeline
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
const px: any = em.get(id, Position.x);
em.set(id, Position.x, 10);

// forEach + field: accepts FieldRef
em.forEach([Position, Velocity], (arch) => {
  const count: number = arch.count;
  const ids: EntityId[] = arch.entityIds;
  const arrX = arch.field(Position.x);
});

// createEntityWith: alternating type, data
em.createEntityWith(Position, { x: 0, y: 0 }, Velocity, { vx: 1, vy: 1 });

// --- createSystem returns FunctionalSystem ---
const sys: FunctionalSystem = createSystem(em, (s: SystemContext) => {
  // onAdded with 1 type
  s.onAdded(Position, (entityId: EntityId) => {});
  // onAdded with 2 types
  s.onAdded(Position, Velocity, (entityId: EntityId) => {});
  // onRemoved with 1 type
  s.onRemoved(Position, (entityId: EntityId) => {});
  // onRemoved with 2 types
  s.onRemoved(Position, Velocity, (entityId: EntityId) => {});

  return () => {
    s.forEach([Position, Velocity], (view) => {
      const count: number = view.count;
    });
    s.forEach([Position], (_view) => {}, [Velocity]);
  };
});
sys();
sys.dispose();

// --- FunctionalSystemConstructor type ---
const ctor: FunctionalSystemConstructor = (s) => {
  s.onAdded(Position, (_id) => {});
};

// --- createSystems returns Pipeline ---
const pipeline: Pipeline = createSystems(em, [ctor]);
pipeline();
pipeline.dispose();

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

// --- createSystems accepts mixed entries ---
const mixedPipeline: Pipeline = createSystems(em, [ctor, TestSystem]);
mixedPipeline();
mixedPipeline.dispose();
