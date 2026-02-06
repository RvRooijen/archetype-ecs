// Compile-time type tests — run with: npx tsc --noEmit
// These tests validate TS generics flow correctly through the API.
// No runtime execution needed; if this file compiles, the types are correct.

import { createEntityManager, component, type ComponentDef, type FieldRef, type EntityId } from '../src/index.js';

// --- component() infers schema fields ---
const Position = component('Position', 'f32', ['x', 'y']);
const Velocity = component('Velocity', { vx: 'f32', vy: 'f32' });
const Tag = component('Tag');

// Position should be ComponentDef<{ x: number, y: number }>
type AssertPosition = typeof Position extends ComponentDef<{ x: number; y: number }> ? true : never;
const _assertPos: AssertPosition = true;

// Position.x should be a FieldRef
type AssertFieldRef = typeof Position.x extends FieldRef ? true : never;
const _assertField: AssertFieldRef = true;

// Tag should be ComponentDef<unknown> (no schema)
type AssertTag = typeof Tag extends ComponentDef ? true : never;
const _assertTag: AssertTag = true;

// --- EntityManager typed methods ---
const em = createEntityManager();
const id: EntityId = em.createEntity();

// addComponent: accepts correct data shape
em.addComponent(id, Position, { x: 1, y: 2 });
em.addComponent(id, Velocity, { vx: 0, vy: 0 });

// getComponent: returns typed object or undefined
const pos = em.getComponent(id, Position);
if (pos) {
  const x: number = pos.x;
  const y: number = pos.y;
}

// get/set: field descriptor access
const px: number | undefined = em.get(id, Position.x);
const py: number | undefined = em.get(id, Position.y);
em.set(id, Position.x, 10);
em.set(id, Position.y, 20);

// forEach + field: accepts FieldRef
em.forEach([Position, Velocity], (arch) => {
  const count: number = arch.count;
  const ids: EntityId[] = arch.entityIds;
  const arrX = arch.field(Position.x);
  const arrVx = arch.field(Velocity.vx);
});

// createEntityWith: alternating type, data
em.createEntityWith(Position, { x: 0, y: 0 }, Velocity, { vx: 1, vy: 1 });

// --- These should fail if uncommented (negative tests) ---
// @ts-expect-error 'z' does not exist on Position
em.get(id, Position.z);

// @ts-expect-error 'z' does not exist on Position
em.set(id, Position.z, 5);

// @ts-expect-error 'x' does not exist on Velocity
em.get(id, Velocity.x);

// @ts-expect-error missing 'y' in Position data
em.addComponent(id, Position, { x: 1 });

// @ts-expect-error 'z' does not exist on Position
em.forEach([Position], (arch) => { arch.field(Position.z); });
