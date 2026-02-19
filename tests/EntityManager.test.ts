import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager, type EntityManager } from '../src/EntityManager.js';
import { component } from '../src/index.js';

describe('EntityManager', () => {
  let em: EntityManager;
  const Position = component('Position', 'f32', ['x', 'y']);
  const Velocity = component('Velocity', 'f32', ['vx', 'vy']);
  const Health = component('Health', 'f32', ['hp']);

  beforeEach(() => {
    em = createEntityManager();
  });

  describe('createEntity / destroyEntity', () => {
    it('creates entities with incrementing ids', () => {
      const a = em.createEntity();
      const b = em.createEntity();
      assert.equal(b, a + 1);
    });

    it('destroyEntity removes entity', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 0, y: 0 });
      em.destroyEntity(id);
      assert.deepEqual(em.getAllEntities(), []);
      assert.equal(em.getComponent(id, Position), undefined);
    });
  });

  describe('addComponent / getComponent / hasComponent', () => {
    it('adds and retrieves a component', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      assert.deepEqual(em.getComponent(id, Position), { x: 1, y: 2 });
      assert.equal(em.hasComponent(id, Position), true);
    });

    it('returns undefined for missing component', () => {
      const id = em.createEntity();
      assert.equal(em.getComponent(id, Position), undefined);
      assert.equal(em.hasComponent(id, Position), false);
    });

    it('overwrites component data on duplicate add', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.addComponent(id, Position, { x: 10, y: 20 });
      assert.deepEqual(em.getComponent(id, Position), { x: 10, y: 20 });
    });

    it('adds multiple component types', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 0, y: 0 });
      em.addComponent(id, Velocity, { vx: 1, vy: 1 });
      assert.deepEqual(em.getComponent(id, Position), { x: 0, y: 0 });
      assert.deepEqual(em.getComponent(id, Velocity), { vx: 1, vy: 1 });
    });
  });

  describe('removeComponent', () => {
    it('removes a component', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.addComponent(id, Velocity, { vx: 1, vy: 1 });
      em.removeComponent(id, Position);
      assert.equal(em.hasComponent(id, Position), false);
      assert.equal(em.hasComponent(id, Velocity), true);
    });

    it('removing last component leaves entity alive but without archetype', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.removeComponent(id, Position);
      assert.ok(em.getAllEntities().includes(id));
      assert.equal(em.hasComponent(id, Position), false);
    });

    it('removing non-existent component is a no-op', () => {
      const id = em.createEntity();
      em.removeComponent(id, Position);
      assert.ok(em.getAllEntities().includes(id));
    });
  });

  describe('query', () => {
    it('returns entities matching component types', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });
      em.addComponent(a, Velocity, { vx: 1, vy: 1 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 5 });

      const result = em.query([Position, Velocity]);
      assert.ok(result.includes(a));
      assert.ok(!result.includes(b));
    });

    it('exclude types filters out entities', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 1, y: 1 });
      em.addComponent(b, Health, { hp: 100 });

      const result = em.query([Position], [Health]);
      assert.ok(result.includes(a));
      assert.ok(!result.includes(b));
    });
  });

  describe('createEntityWith', () => {
    it('creates entity with multiple components at once', () => {
      const id = em.createEntityWith(Position, { x: 3, y: 4 }, Velocity, { vx: 1, vy: 0 });
      assert.deepEqual(em.getComponent(id, Position), { x: 3, y: 4 });
      assert.deepEqual(em.getComponent(id, Velocity), { vx: 1, vy: 0 });
    });
  });

  describe('count', () => {
    it('counts entities matching query', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 1, y: 1 });
      em.addComponent(b, Velocity, { vx: 1, vy: 0 });

      assert.equal(em.count([Position]), 2);
      assert.equal(em.count([Position, Velocity]), 1);
    });
  });

  describe('serialize / deserialize', () => {
    const symbolToName = new Map([
      [Position._sym, 'Position'],
      [Velocity._sym, 'Velocity'],
      [Health._sym, 'Health']
    ]);
    const nameToSymbol: Record<string, any> = { Position, Velocity, Health };

    it('round-trips entities and components', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });
      em.addComponent(a, Velocity, { vx: 3, vy: 4 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 6 });

      const data = em.serialize(symbolToName);
      em.deserialize(data, nameToSymbol);

      assert.deepEqual(em.getAllEntities().sort(), [a, b].sort());
      assert.deepEqual(em.getComponent(a, Position), { x: 1, y: 2 });
      assert.deepEqual(em.getComponent(a, Velocity), { vx: 3, vy: 4 });
      assert.deepEqual(em.getComponent(b, Position), { x: 5, y: 6 });
    });

    it('strip components excludes component data but keeps entity', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });
      em.addComponent(a, Velocity, { vx: 3, vy: 4 });

      const data = em.serialize(symbolToName, [Velocity]);
      assert.equal(data.components['Velocity'], undefined);
      assert.notEqual(data.components['Position'], undefined);
    });

    it('skip entities with component excludes entire entity', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 6 });
      em.addComponent(b, Health, { hp: 100 });

      const data = em.serialize(symbolToName, [], [Health]);
      assert.ok(data.entities.includes(a));
      assert.ok(!data.entities.includes(b));
    });

    it('custom serializers are used when provided', () => {
      const Meta = component('Meta', { x: 'f32', y: 'f32', secret: 'i32' });
      const metaSymbolToName = new Map([...symbolToName, [Meta._sym, 'Meta']]);

      const a = em.createEntity();
      em.addComponent(a, Meta, { x: 1, y: 2, secret: 42 });

      const serializers = new Map<string, (data: any) => any>([
        ['Meta', (data: any) => ({ x: data.x, y: data.y })]
      ]);

      const result = em.serialize(metaSymbolToName, [], [], { serializers });
      assert.deepEqual(result.components['Meta'][a], { x: 1, y: 2 });
      assert.equal((result.components['Meta'][a] as any).secret, undefined);
    });

    it('custom deserializers are used when provided', () => {
      const Meta = component('Meta2', { x: 'f32', y: 'f32' });
      const metaSymbolToName = new Map([...symbolToName, [Meta._sym, 'Meta2']]);
      const metaNameToSymbol: Record<string, any> = { ...nameToSymbol, Meta2: Meta };

      const a = em.createEntity();
      em.addComponent(a, Meta, { x: 1, y: 2 });

      const data = em.serialize(metaSymbolToName);

      const deserializers = new Map<string, (data: any) => any>([
        ['Meta2', (compData: any) => ({ ...compData, restored: true })]
      ]);

      em.deserialize(data, metaNameToSymbol, { deserializers });
      const result = em.getComponent(a, Meta);
      assert.ok(Math.abs(result.x - 1) < 0.01);
      assert.ok(Math.abs(result.y - 2) < 0.01);
    });

    it('deserialize clears previous state', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      em.deserialize({ nextId: 1, entities: [], components: {} }, nameToSymbol);
      assert.deepEqual(em.getAllEntities(), []);
    });
  });
});

describe('Typed Components (SoA)', () => {
  let em: EntityManager;

  beforeEach(() => {
    em = createEntityManager();
  });

  it('typed component round-trip (add/get)', () => {
    const Pos = component('Pos', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1.5, y: 2.5 });
    const result = em.getComponent(id, Pos);
    assert.ok(Math.abs(result.x - 1.5) < 0.001);
    assert.ok(Math.abs(result.y - 2.5) < 0.001);
  });

  it('growth past initial capacity (>64 entities)', () => {
    const Pos = component('PosGrow', 'f32', ['x', 'y']);
    const ids: number[] = [];
    for (let i = 0; i < 100; i++) {
      const id = em.createEntity();
      em.addComponent(id, Pos, { x: i, y: i * 2 });
      ids.push(id);
    }
    for (let i = 0; i < 100; i++) {
      const result = em.getComponent(ids[i], Pos);
      assert.ok(Math.abs(result.x - i) < 0.001);
      assert.ok(Math.abs(result.y - i * 2) < 0.001);
    }
  });

  it('swap-remove preserves typed data', () => {
    const Pos = component('PosSwap', 'f32', ['x', 'y']);
    const a = em.createEntity();
    const b = em.createEntity();
    const c = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });
    em.addComponent(b, Pos, { x: 3, y: 4 });
    em.addComponent(c, Pos, { x: 5, y: 6 });

    em.destroyEntity(a);

    const resultB = em.getComponent(b, Pos);
    assert.ok(Math.abs(resultB.x - 3) < 0.001);
    const resultC = em.getComponent(c, Pos);
    assert.ok(Math.abs(resultC.x - 5) < 0.001);
  });

  it('typed + tag on same entity', () => {
    const Pos = component('PosMixed', 'f32', ['x', 'y']);
    const Tag = component('Tag');
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 10, y: 20 });
    em.addComponent(id, Tag, {});

    const pos = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos.x - 10) < 0.001);
    assert.equal(em.getComponent(id, Tag), undefined);
    assert.equal(em.hasComponent(id, Tag), true);
  });

  it('forEach raw field access and mutation', () => {
    const Pos = component('PosLoop', 'f32', ['x', 'y']);
    const Vel = component('VelLoop', 'f32', ['vx', 'vy']);

    for (let i = 0; i < 10; i++) {
      const id = em.createEntity();
      em.addComponent(id, Pos, { x: i, y: 0 });
      em.addComponent(id, Vel, { vx: 1, vy: 2 });
    }

    em.forEach([Pos, Vel], (arch) => {
      const px = arch.field(Pos.x as any);
      const py = arch.field(Pos.y as any);
      const vx = arch.field(Vel.vx as any);
      const vy = arch.field(Vel.vy as any);
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });

    const ids = em.query([Pos, Vel]);
    for (const id of ids) {
      const pos = em.getComponent(id, Pos);
      assert.ok(pos.x >= 1);
      assert.ok(Math.abs(pos.y - 2) < 0.001);
    }
  });

  it('serialize/deserialize round-trip with typed components', () => {
    const Pos = component('PosSer', 'f32', ['x', 'y']);
    const symbolToName = new Map([[Pos._sym, 'PosSer']]);
    const nameToSymbol: Record<string, any> = { PosSer: Pos };

    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1.5, y: 2.5 });
    const b = em.createEntity();
    em.addComponent(b, Pos, { x: 3.5, y: 4.5 });

    const data = em.serialize(symbolToName);
    em.deserialize(data, nameToSymbol);

    const posA = em.getComponent(a, Pos);
    assert.ok(Math.abs(posA.x - 1.5) < 0.01);
    const posB = em.getComponent(b, Pos);
    assert.ok(Math.abs(posB.x - 3.5) < 0.01);
  });

  it('archetype migration with typed components', () => {
    const Pos = component('PosMig', 'f32', ['x', 'y']);
    const Vel = component('VelMig', 'f32', ['vx', 'vy']);

    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 5, y: 10 });
    em.addComponent(id, Vel, { vx: 1, vy: 2 });

    const pos = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos.x - 5) < 0.001);

    em.removeComponent(id, Vel);
    const pos2 = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos2.x - 5) < 0.001);
    assert.equal(em.hasComponent(id, Vel), false);
  });

  it('overwrite typed component data in-place', () => {
    const Pos = component('PosOw', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Pos, { x: 99, y: 88 });
    const result = em.getComponent(id, Pos);
    assert.ok(Math.abs(result.x - 99) < 0.001);
  });

  it('get/set for zero-allocation field access', () => {
    const Pos = component('PosGS', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 3.5, y: 7.5 });
    assert.ok(Math.abs(em.get(id, Pos.x as any) - 3.5) < 0.001);
    em.set(id, Pos.x as any, 42);
    assert.ok(Math.abs(em.get(id, Pos.x as any) - 42) < 0.001);
  });

  it('get returns undefined for missing entity/component', () => {
    const Pos = component('PosGFM', 'f32', ['x', 'y']);
    assert.equal(em.get(999, Pos.x as any), undefined);
    const id = em.createEntity();
    assert.equal(em.get(id, Pos.x as any), undefined);
  });

  it('forEach field returns undefined for tag component', () => {
    const Tag = component('TagFE');
    const Pos = component('PosFE', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Tag, {});

    em.forEach([Pos, Tag], (arch) => {
      assert.ok(arch.field(Pos.x as any) instanceof Float32Array);
    });
  });

  it('string component round-trip (add/get/set)', () => {
    const Name = component('NameRT', { name: 'string', title: 'string' });
    const id = em.createEntity();
    em.addComponent(id, Name, { name: 'Hero', title: 'Sir' });

    assert.equal(em.get(id, Name.name as any), 'Hero');
    assert.equal(em.get(id, Name.title as any), 'Sir');

    em.set(id, Name.name as any, 'Villain');
    assert.equal(em.get(id, Name.name as any), 'Villain');

    const obj = em.getComponent(id, Name);
    assert.deepEqual(obj, { name: 'Villain', title: 'Sir' });
  });

  it('string component short form', () => {
    const Label = component('LabelSF', 'string', ['text', 'color']);
    const id = em.createEntity();
    em.addComponent(id, Label, { text: 'hello', color: 'red' });

    assert.equal(em.get(id, Label.text as any), 'hello');
    assert.equal(em.get(id, Label.color as any), 'red');
  });

  it('string component growth past capacity', () => {
    const Name = component('NameGrow', 'string', ['value']);
    for (let i = 0; i < 100; i++) {
      const id = em.createEntity();
      em.addComponent(id, Name, { value: `entity_${i}` });
    }
    const ids = em.query([Name]);
    assert.equal(ids.length, 100);
    assert.equal(em.get(ids[0], Name.value as any), 'entity_0');
    assert.equal(em.get(ids[99], Name.value as any), 'entity_99');
  });

  it('string component swap-remove preserves data', () => {
    const Name = component('NameSwap', 'string', ['value']);
    const a = em.createEntity();
    const b = em.createEntity();
    const c = em.createEntity();
    em.addComponent(a, Name, { value: 'aaa' });
    em.addComponent(b, Name, { value: 'bbb' });
    em.addComponent(c, Name, { value: 'ccc' });

    em.destroyEntity(a);
    assert.equal(em.get(b, Name.value as any), 'bbb');
    assert.equal(em.get(c, Name.value as any), 'ccc');
  });

  it('mixed string + numeric fields in one component', () => {
    const Item = component('Item', { name: 'string', weight: 'f32' });
    const id = em.createEntity();
    em.addComponent(id, Item, { name: 'Sword', weight: 3.5 });

    assert.equal(em.get(id, Item.name as any), 'Sword');
    assert.ok(Math.abs(em.get(id, Item.weight as any) - 3.5) < 0.01);
  });

  it('string component forEach field access', () => {
    const Name = component('NameFE', 'string', ['value']);
    for (let i = 0; i < 5; i++) {
      const id = em.createEntity();
      em.addComponent(id, Name, { value: `e${i}` });
    }

    em.forEach([Name], (arch) => {
      const values = arch.field(Name.value as any);
      assert.ok(Array.isArray(values));
      assert.equal(values[0], 'e0');
      assert.equal(values[4], 'e4');
    });
  });
});

describe('Deferred Structural Changes during forEach', () => {
  let em: EntityManager;
  const Pos = component('DPos', 'f32', ['x', 'y']);
  const Vel = component('DVel', 'f32', ['vx', 'vy']);
  const Tag = component('DTag');

  beforeEach(() => {
    em = createEntityManager();
  });

  it('removeComponent during forEach is deferred and applied after', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    const c = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Pos, { x: 2, y: 0 });
    em.addComponent(c, Pos, { x: 3, y: 0 });

    const visited: number[] = [];
    em.forEach([Pos], (arch) => {
      const ids = arch.entityIds;
      for (let i = 0; i < arch.count; i++) {
        visited.push(ids[i]);
        // Remove first entity during iteration — should be deferred
        if (ids[i] === a) {
          em.removeComponent(a, Pos);
        }
      }
    });

    // All 3 should have been visited (removal was deferred)
    assert.equal(visited.length, 3);
    assert.ok(visited.includes(a));
    assert.ok(visited.includes(b));
    assert.ok(visited.includes(c));

    // After forEach, the removal should have been applied
    assert.equal(em.hasComponent(a, Pos), false);
    assert.equal(em.hasComponent(b, Pos), true);
    assert.equal(em.hasComponent(c, Pos), true);
  });

  it('addComponent (migration) during forEach is deferred', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Pos, { x: 2, y: 0 });

    em.forEach([Pos], (arch) => {
      const ids = arch.entityIds;
      for (let i = 0; i < arch.count; i++) {
        // Add a new component to entity a — causes migration, should be deferred
        if (ids[i] === a) {
          em.addComponent(a, Vel, { vx: 10, vy: 20 });
        }
      }
    });

    // After forEach, migration should have been applied
    assert.equal(em.hasComponent(a, Vel), true);
    const vel = em.getComponent(a, Vel);
    assert.ok(Math.abs(vel.vx - 10) < 0.001);
    assert.ok(Math.abs(vel.vy - 20) < 0.001);
    // Original data preserved after migration
    const pos = em.getComponent(a, Pos);
    assert.ok(Math.abs(pos.x - 1) < 0.001);
  });

  it('addComponent overwrite during forEach is immediate (no migration)', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });

    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x as any);
      // Overwrite via addComponent — same archetype, should be immediate
      em.addComponent(a, Pos, { x: 99, y: 88 });
      // The array should reflect the change immediately
      assert.ok(Math.abs(px[0] - 99) < 0.001);
    });
  });

  it('destroyEntity during forEach is deferred', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    const c = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Pos, { x: 2, y: 0 });
    em.addComponent(c, Pos, { x: 3, y: 0 });

    const visited: number[] = [];
    em.forEach([Pos], (arch) => {
      const ids = arch.entityIds;
      for (let i = 0; i < arch.count; i++) {
        visited.push(ids[i]);
        if (ids[i] === b) {
          em.destroyEntity(b);
        }
      }
    });

    assert.equal(visited.length, 3);
    // After forEach, entity b should be destroyed
    assert.equal(em.hasComponent(b, Pos), false);
    assert.deepEqual(em.getAllEntities().includes(b), false);
  });

  it('multiple deferred operations are applied in order', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });

    em.forEach([Pos], () => {
      // Remove Pos then add Vel — both deferred, applied in order
      em.removeComponent(a, Pos);
      em.addComponent(a, Vel, { vx: 5, vy: 6 });
    });

    assert.equal(em.hasComponent(a, Pos), false);
    assert.equal(em.hasComponent(a, Vel), true);
    const vel = em.getComponent(a, Vel);
    assert.ok(Math.abs(vel.vx - 5) < 0.001);
  });

  it('nested forEach properly defers until outermost forEach completes', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Vel, { vx: 2, vy: 0 });

    let innerComplete = false;
    em.forEach([Pos], () => {
      em.forEach([Vel], () => {
        em.removeComponent(b, Vel);
        innerComplete = true;
      });
      // After inner forEach, structural change is still deferred
      // (outermost forEach is still running)
      assert.equal(innerComplete, true);
      assert.equal(em.hasComponent(b, Vel), true); // live state — still deferred
    });

    // Now outermost forEach is done — deferred ops should be flushed
    assert.equal(em.hasComponent(b, Vel), false);
  });

  it('em.set() remains immediate during forEach', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });

    em.forEach([Pos], (arch) => {
      em.set(a, Pos.x as any, 42);
      // Should be immediately visible
      const px = arch.field(Pos.x as any);
      assert.ok(Math.abs(px[0] - 42) < 0.001);
    });
  });

  it('hooks still fire correctly with deferred structural changes', () => {
    const added: number[] = [];
    const removed: number[] = [];
    em.onAdd(Vel, (id) => added.push(id));
    em.onRemove(Pos, (id) => removed.push(id));

    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.flushHooks();

    em.forEach([Pos], () => {
      em.removeComponent(a, Pos);
      em.addComponent(a, Vel, { vx: 1, vy: 2 });
    });

    // Deferred ops were applied, hooks should be pending
    em.flushHooks();
    assert.deepEqual(removed, [a]);
    assert.deepEqual(added, [a]);
  });
});

describe('Deferred Hooks (onAdd / onRemove)', () => {
  let em: EntityManager;
  const Position = component('HPos', 'f32', ['x', 'y']);
  const Velocity = component('HVel', 'f32', ['vx', 'vy']);
  const Health = component('HHealth', 'f32', ['hp']);

  beforeEach(() => {
    em = createEntityManager();
  });

  it('onAdd fires after flushHooks with correct entity IDs', () => {
    const added: number[] = [];
    em.onAdd(Position, (id) => added.push(id));

    const a = em.createEntity();
    em.addComponent(a, Position, { x: 1, y: 2 });
    const b = em.createEntity();
    em.addComponent(b, Position, { x: 3, y: 4 });

    assert.deepEqual(added, []);
    em.flushHooks();
    assert.deepEqual(added, [a, b]);
  });

  it('onRemove fires after flushHooks on removeComponent', () => {
    const removed: number[] = [];
    em.onRemove(Position, (id) => removed.push(id));

    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });
    em.removeComponent(id, Position);

    assert.deepEqual(removed, []);
    em.flushHooks();
    assert.deepEqual(removed, [id]);
  });

  it('onRemove fires for each component on destroyEntity', () => {
    const removedPos: number[] = [];
    const removedVel: number[] = [];
    em.onRemove(Position, (id) => removedPos.push(id));
    em.onRemove(Velocity, (id) => removedVel.push(id));

    const id = em.createEntityWith(Position, { x: 1, y: 2 }, Velocity, { vx: 3, vy: 4 });
    em.destroyEntity(id);
    em.flushHooks();

    assert.deepEqual(removedPos, [id]);
    assert.deepEqual(removedVel, [id]);
  });

  it('createEntityWith triggers onAdd for all component types', () => {
    const addedPos: number[] = [];
    const addedVel: number[] = [];
    em.onAdd(Position, (id) => addedPos.push(id));
    em.onAdd(Velocity, (id) => addedVel.push(id));

    const id = em.createEntityWith(Position, { x: 1, y: 2 }, Velocity, { vx: 3, vy: 4 });
    em.flushHooks();

    assert.deepEqual(addedPos, [id]);
    assert.deepEqual(addedVel, [id]);
  });

  it('callbacks do not fire before flushHooks (deferred)', () => {
    const added: number[] = [];
    em.onAdd(Position, (id) => added.push(id));

    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });

    assert.deepEqual(added, []);
  });

  it('unsubscribe prevents callback from firing', () => {
    const added: number[] = [];
    const unsub = em.onAdd(Position, (id) => added.push(id));

    const a = em.createEntity();
    em.addComponent(a, Position, { x: 1, y: 2 });
    unsub();
    em.flushHooks();

    assert.deepEqual(added, []);
  });

  it('overwrite (addComponent with existing component) does not trigger onAdd', () => {
    const added: number[] = [];
    em.onAdd(Position, (id) => added.push(id));

    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });
    em.flushHooks();
    added.length = 0;

    em.addComponent(id, Position, { x: 99, y: 88 });
    em.flushHooks();

    assert.deepEqual(added, []);
  });

  it('multiple callbacks on the same component', () => {
    const added1: number[] = [];
    const added2: number[] = [];
    em.onAdd(Position, (id) => added1.push(id));
    em.onAdd(Position, (id) => added2.push(id));

    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });
    em.flushHooks();

    assert.deepEqual(added1, [id]);
    assert.deepEqual(added2, [id]);
  });

  it('flushHooks is a no-op when no hooks registered', () => {
    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });
    em.flushHooks();
  });

  it('addComponent migration triggers onAdd', () => {
    const added: number[] = [];
    em.onAdd(Velocity, (id) => added.push(id));

    const id = em.createEntity();
    em.addComponent(id, Position, { x: 1, y: 2 });
    em.addComponent(id, Velocity, { vx: 1, vy: 1 });
    em.flushHooks();

    assert.deepEqual(added, [id]);
  });

  it('pending arrays are cleared after flushHooks', () => {
    const added: number[] = [];
    em.onAdd(Position, (id) => added.push(id));

    const a = em.createEntity();
    em.addComponent(a, Position, { x: 1, y: 2 });
    em.flushHooks();
    assert.deepEqual(added, [a]);

    em.flushHooks();
    assert.deepEqual(added, [a]);
  });
});
