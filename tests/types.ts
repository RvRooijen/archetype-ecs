// Compile-time type tests — run with: npx tsc --noEmit
// These tests validate TS generics flow correctly through the API.
// No runtime execution needed; if this file compiles, the types are correct.

import { createEntityManager, component, type Component, type EntityId } from '../src/index.js';

// --- component() infers schema fields ---
const Position = component('Position', { x: 'f32', y: 'f32' });
const Velocity = component('Velocity', { vx: 'f32', vy: 'f32' });
const Tag = component('Tag');

// Position should be Component<{ x: number, y: number }>
type AssertPosition = typeof Position extends Component<{ x: number; y: number }> ? true : never;
const _assertPos: AssertPosition = true;

// Tag should be Component<unknown> (no schema)
type AssertTag = typeof Tag extends Component ? true : never;
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

// getField: field name is constrained to schema keys
const px: number | undefined = em.getField(id, Position, 'x');
const py: number | undefined = em.getField(id, Position, 'y');
const vx: number | undefined = em.getField(id, Velocity, 'vx');

// setField: field name is constrained to schema keys
em.setField(id, Position, 'x', 10);
em.setField(id, Position, 'y', 20);

// forEach + field: field name is constrained
em.forEach([Position, Velocity], (arch) => {
  const count: number = arch.count;
  const ids: EntityId[] = arch.entityIds;
  const arrX = arch.field(Position, 'x');
  const arrVx = arch.field(Velocity, 'vx');
});

// createEntityWith: alternating type, data
em.createEntityWith(Position, { x: 0, y: 0 }, Velocity, { vx: 1, vy: 1 });

// --- These should fail if uncommented (negative tests) ---
// @ts-expect-error 'z' is not a field of Position
em.getField(id, Position, 'z');

// @ts-expect-error 'z' is not a field of Position
em.setField(id, Position, 'z', 5);

// @ts-expect-error 'x' is not a field of Velocity
em.getField(id, Velocity, 'x');

// @ts-expect-error missing 'y' in Position data
em.addComponent(id, Position, { x: 1 });

// @ts-expect-error 'z' is not a field of Position
em.forEach([Position], (arch) => { arch.field(Position, 'z'); });
