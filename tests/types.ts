// Compile-time type tests — run with: npx tsc --noEmit
// These tests validate TS generics flow correctly through the API.
// No runtime execution needed; if this file compiles, the types are correct.

import { createEntityManager, component, type ComponentDef, type FieldRef, type EntityId } from '../src/index.js';

// --- component() infers schema fields ---
const Position = component('Position', 'f32', ['x', 'y']);
const Velocity = component('Velocity', { vx: 'f32', vy: 'f32' });
const Tag = component('Tag');
const Name = component('Name', { name: 'string', title: 'string' });
const Label = component('Label', 'string', ['text', 'color']);

// Position should be ComponentDef<{ x: number, y: number }>
type AssertPosition = typeof Position extends ComponentDef<{ x: number; y: number }> ? true : never;
const _assertPos: AssertPosition = true;

// Position.x should be a FieldRef<number>
type AssertFieldRef = typeof Position.x extends FieldRef<number> ? true : never;
const _assertField: AssertFieldRef = true;

// Name should be ComponentDef<{ name: string, title: string }>
type AssertName = typeof Name extends ComponentDef<{ name: string; title: string }> ? true : never;
const _assertName: AssertName = true;

// Name.name should be a FieldRef<string>
type AssertNameField = typeof Name.name extends FieldRef<string> ? true : never;
const _assertNameField: AssertNameField = true;

// Label short form: ComponentDef<{ text: string, color: string }>
type AssertLabel = typeof Label extends ComponentDef<{ text: string; color: string }> ? true : never;
const _assertLabel: AssertLabel = true;

// Tag should be ComponentDef<unknown> (no schema)
type AssertTag = typeof Tag extends ComponentDef ? true : never;
const _assertTag: AssertTag = true;

// --- EntityManager typed methods ---
const em = createEntityManager();
const id: EntityId = em.createEntity();

// addComponent: accepts correct data shape
em.addComponent(id, Position, { x: 1, y: 2 });
em.addComponent(id, Velocity, { vx: 0, vy: 0 });
em.addComponent(id, Name, { name: 'Hero', title: 'Sir' });

// getComponent: returns typed object or undefined
const pos = em.getComponent(id, Position);
if (pos) {
  const x: number = pos.x;
  const y: number = pos.y;
}

const nameComp = em.getComponent(id, Name);
if (nameComp) {
  const n: string = nameComp.name;
  const t: string = nameComp.title;
}

// get/set: numeric field descriptor access
const px: number | undefined = em.get(id, Position.x);
const py: number | undefined = em.get(id, Position.y);
em.set(id, Position.x, 10);
em.set(id, Position.y, 20);

// get/set: string field descriptor access
const nameVal: string | undefined = em.get(id, Name.name);
em.set(id, Name.name, 'Villain');

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

// @ts-expect-error wrong data shape for Name
em.addComponent(id, Name, { foo: 'bar' });

// @ts-expect-error number not assignable to string field
em.set(id, Name.name, 42);
