import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager, type EntityManager } from '../src/EntityManager.js';
import { component, add, sub, mul, scale, random, type ComponentDef } from '../src/index.js';

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
    const nameToSymbol: Record<string, ComponentDef> = { Position, Velocity, Health };

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
      assert.equal((result.components['Meta'][a] as Record<string, unknown>).secret, undefined);
    });

    it('custom deserializers are used when provided', () => {
      const Meta = component('Meta2', { x: 'f32', y: 'f32' });
      const metaSymbolToName = new Map([...symbolToName, [Meta._sym, 'Meta2']]);
      const metaNameToSymbol: Record<string, ComponentDef> = { ...nameToSymbol, Meta2: Meta };

      const a = em.createEntity();
      em.addComponent(a, Meta, { x: 1, y: 2 });

      const data = em.serialize(metaSymbolToName);

      const deserializers = new Map<string, (data: unknown) => unknown>([
        ['Meta2', (compData) => ({ ...(compData as Record<string, unknown>), restored: true })]
      ]);

      em.deserialize(data, metaNameToSymbol, { deserializers });
      const result = em.getComponent(a, Meta)!;
      assert.ok(Math.abs(result.x as number - 1) < 0.01);
      assert.ok(Math.abs(result.y as number - 2) < 0.01);
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
    const result = em.getComponent(id, Pos)!;
    assert.ok(Math.abs(result.x as number - 1.5) < 0.001);
    assert.ok(Math.abs(result.y as number - 2.5) < 0.001);
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
      const result = em.getComponent(ids[i], Pos)!;
      assert.ok(Math.abs(result.x as number - i) < 0.001);
      assert.ok(Math.abs(result.y as number - i * 2) < 0.001);
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

    const resultB = em.getComponent(b, Pos)!;
    assert.ok(Math.abs(resultB.x as number - 3) < 0.001);
    const resultC = em.getComponent(c, Pos)!;
    assert.ok(Math.abs(resultC.x as number - 5) < 0.001);
  });

  it('typed + tag on same entity', () => {
    const Pos = component('PosMixed', 'f32', ['x', 'y']);
    const Tag = component('Tag');
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 10, y: 20 });
    em.addComponent(id, Tag, {});

    const pos = em.getComponent(id, Pos)!;
    assert.ok(Math.abs(pos.x as number - 10) < 0.001);
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
      const px = arch.field(Pos.x) as Float32Array;
      const py = arch.field(Pos.y) as Float32Array;
      const vx = arch.field(Vel.vx) as Float32Array;
      const vy = arch.field(Vel.vy) as Float32Array;
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });

    const ids = em.query([Pos, Vel]);
    for (const id of ids) {
      const pos = em.getComponent(id, Pos)!;
      assert.ok((pos.x as number) >= 1);
      assert.ok(Math.abs(pos.y as number - 2) < 0.001);
    }
  });

  it('serialize/deserialize round-trip with typed components', () => {
    const Pos = component('PosSer', 'f32', ['x', 'y']);
    const symbolToName = new Map([[Pos._sym, 'PosSer']]);
    const nameToSymbol: Record<string, ComponentDef> = { PosSer: Pos };

    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1.5, y: 2.5 });
    const b = em.createEntity();
    em.addComponent(b, Pos, { x: 3.5, y: 4.5 });

    const data = em.serialize(symbolToName);
    em.deserialize(data, nameToSymbol);

    const posA = em.getComponent(a, Pos)!;
    assert.ok(Math.abs(posA.x as number - 1.5) < 0.01);
    const posB = em.getComponent(b, Pos)!;
    assert.ok(Math.abs(posB.x as number - 3.5) < 0.01);
  });

  it('archetype migration with typed components', () => {
    const Pos = component('PosMig', 'f32', ['x', 'y']);
    const Vel = component('VelMig', 'f32', ['vx', 'vy']);

    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 5, y: 10 });
    em.addComponent(id, Vel, { vx: 1, vy: 2 });

    const pos = em.getComponent(id, Pos)!;
    assert.ok(Math.abs(pos.x as number - 5) < 0.001);

    em.removeComponent(id, Vel);
    const pos2 = em.getComponent(id, Pos)!;
    assert.ok(Math.abs(pos2.x as number - 5) < 0.001);
    assert.equal(em.hasComponent(id, Vel), false);
  });

  it('overwrite typed component data in-place', () => {
    const Pos = component('PosOw', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Pos, { x: 99, y: 88 });
    const result = em.getComponent(id, Pos)!;
    assert.ok(Math.abs(result.x as number - 99) < 0.001);
  });

  it('get/set for zero-allocation field access', () => {
    const Pos = component('PosGS', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 3.5, y: 7.5 });
    assert.ok(Math.abs(em.get(id, Pos.x)! as number - 3.5) < 0.001);
    em.set(id, Pos.x, 42);
    assert.ok(Math.abs(em.get(id, Pos.x)! as number - 42) < 0.001);
  });

  it('get returns undefined for missing entity/component', () => {
    const Pos = component('PosGFM', 'f32', ['x', 'y']);
    assert.equal(em.get(999, Pos.x), undefined);
    const id = em.createEntity();
    assert.equal(em.get(id, Pos.x), undefined);
  });

  it('forEach field returns undefined for tag component', () => {
    const Tag = component('TagFE');
    const Pos = component('PosFE', 'f32', ['x', 'y']);
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Tag, {});

    em.forEach([Pos, Tag], (arch) => {
      assert.ok(arch.field(Pos.x) instanceof Float32Array);
    });
  });

  it('string component round-trip (add/get/set)', () => {
    const Name = component('NameRT', { name: 'string', title: 'string' });
    const id = em.createEntity();
    em.addComponent(id, Name, { name: 'Hero', title: 'Sir' });

    assert.equal(em.get(id, Name.name), 'Hero');
    assert.equal(em.get(id, Name.title), 'Sir');

    em.set(id, Name.name, 'Villain');
    assert.equal(em.get(id, Name.name), 'Villain');

    const obj = em.getComponent(id, Name);
    assert.deepEqual(obj, { name: 'Villain', title: 'Sir' });
  });

  it('string component short form', () => {
    const Label = component('LabelSF', 'string', ['text', 'color']);
    const id = em.createEntity();
    em.addComponent(id, Label, { text: 'hello', color: 'red' });

    assert.equal(em.get(id, Label.text), 'hello');
    assert.equal(em.get(id, Label.color), 'red');
  });

  it('string component growth past capacity', () => {
    const Name = component('NameGrow', 'string', ['value']);
    for (let i = 0; i < 100; i++) {
      const id = em.createEntity();
      em.addComponent(id, Name, { value: `entity_${i}` });
    }
    const ids = em.query([Name]);
    assert.equal(ids.length, 100);
    assert.equal(em.get(ids[0], Name.value), 'entity_0');
    assert.equal(em.get(ids[99], Name.value), 'entity_99');
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
    assert.equal(em.get(b, Name.value), 'bbb');
    assert.equal(em.get(c, Name.value), 'ccc');
  });

  it('mixed string + numeric fields in one component', () => {
    const Item = component('Item', { name: 'string', weight: 'f32' });
    const id = em.createEntity();
    em.addComponent(id, Item, { name: 'Sword', weight: 3.5 });

    assert.equal(em.get(id, Item.name), 'Sword');
    assert.ok(Math.abs(em.get(id, Item.weight)! as number - 3.5) < 0.01);
  });

  it('string component forEach field access', () => {
    const Name = component('NameFE', 'string', ['value']);
    for (let i = 0; i < 5; i++) {
      const id = em.createEntity();
      em.addComponent(id, Name, { value: `e${i}` });
    }

    em.forEach([Name], (arch) => {
      const values = arch.field(Name.value);
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
        if (ids[i] === a) em.removeComponent(a, Pos);
      }
    });

    assert.equal(visited.length, 3);
    assert.equal(em.hasComponent(a, Pos), false);
    assert.equal(em.hasComponent(b, Pos), true);
  });

  it('addComponent (migration) during forEach is deferred', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Pos, { x: 2, y: 0 });

    em.forEach([Pos], (arch) => {
      const ids = arch.entityIds;
      for (let i = 0; i < arch.count; i++) {
        if (ids[i] === a) em.addComponent(a, Vel, { vx: 10, vy: 20 });
      }
    });

    assert.equal(em.hasComponent(a, Vel), true);
    const vel = em.getComponent(a, Vel)!;
    assert.ok(Math.abs((vel.vx as number) - 10) < 0.001);
  });

  it('addComponent overwrite during forEach is immediate (no migration)', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });

    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      em.addComponent(a, Pos, { x: 99, y: 88 });
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
        if (ids[i] === b) em.destroyEntity(b);
      }
    });

    assert.equal(visited.length, 3);
    assert.equal(em.hasComponent(b, Pos), false);
    assert.equal(em.getAllEntities().includes(b), false);
  });

  it('multiple deferred operations are applied in order', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });

    em.forEach([Pos], () => {
      em.removeComponent(a, Pos);
      em.addComponent(a, Vel, { vx: 5, vy: 6 });
    });

    assert.equal(em.hasComponent(a, Pos), false);
    assert.equal(em.hasComponent(a, Vel), true);
  });

  it('nested forEach properly defers until outermost forEach completes', () => {
    const a = em.createEntity();
    const b = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 0 });
    em.addComponent(b, Vel, { vx: 2, vy: 0 });

    em.forEach([Pos], () => {
      em.forEach([Vel], () => {
        em.removeComponent(b, Vel);
      });
      assert.equal(em.hasComponent(b, Vel), true); // still deferred
    });

    assert.equal(em.hasComponent(b, Vel), false);
  });

  it('em.set() remains immediate during forEach', () => {
    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });

    em.forEach([Pos], (arch) => {
      em.set(a, Pos.x, 42);
      const px = arch.field(Pos.x) as Float32Array;
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

describe('apply()', () => {
  const Pos = component('ApplyPos', 'f32', ['x', 'y']);
  let em: EntityManager;

  beforeEach(() => {
    em = createEntityManager();
    for (let i = 0; i < 20; i++) {
      em.createEntityWith(Pos, { x: i * 1.0, y: i * 2.0 });
    }
  });

  it('add(a, b) adds two fields element-wise', () => {
    const Vel = component('ApplyVel', 'f32', ['vx', 'vy']);
    const em2 = createEntityManager();
    em2.createEntityWith(Pos, { x: 10, y: 20 });
    em2.createEntityWith(Vel, { vx: 1, vy: 2 });
    const id = em2.createEntity();
    em2.addComponent(id, Pos, { x: 5, y: 6 });
    em2.addComponent(id, Vel, { vx: 3, vy: 4 });

    em2.apply(Pos.x, add(Pos.x, Vel.vx));

    // Only the entity with both Pos and Vel is affected
    assert.equal(em2.get(id, Pos.x), 8);  // 5 + 3
    assert.equal(em2.get(id, Pos.y), 6);  // unchanged (applied to x only)
  });

  it('sub(a, b) subtracts two fields element-wise', () => {
    const A = component('SubA', 'f32', ['v']);
    const B = component('SubB', 'f32', ['v']);
    const em2 = createEntityManager();
    const id = em2.createEntity();
    em2.addComponent(id, A, { v: 10 });
    em2.addComponent(id, B, { v: 3 });

    em2.apply(A.v, sub(A.v, B.v));
    assert.equal(em2.get(id, A.v), 7);
  });

  it('mul(a, b) multiplies two fields element-wise', () => {
    const A = component('MulA', 'f32', ['v']);
    const B = component('MulB', 'f32', ['v']);
    const em2 = createEntityManager();
    const id = em2.createEntity();
    em2.addComponent(id, A, { v: 6 });
    em2.addComponent(id, B, { v: 4 });

    em2.apply(A.v, mul(A.v, B.v));
    assert.equal(em2.get(id, A.v), 24);
  });

  it('scale(a, s) multiplies field by a scalar', () => {
    const em2 = createEntityManager();
    const id = em2.createEntity();
    em2.addComponent(id, Pos, { x: 5, y: 10 });

    em2.apply(Pos.x, scale(Pos.x, 3));
    assert.equal(em2.get(id, Pos.x), 15);
    assert.equal(em2.get(id, Pos.y), 10); // unchanged
  });

  it('random() fills field with values in [min, max]', () => {
    em.apply(Pos.x, random(5, 15));

    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) {
        assert.ok(px[i] >= 5, `px[${i}]=${px[i]} should be >= 5`);
        assert.ok(px[i] <= 15, `px[${i}]=${px[i]} should be <= 15`);
      }
    });
  });

  it('random() produces different values across elements', () => {
    em.apply(Pos.x, random(0, 100));

    const vals: number[] = [];
    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) vals.push(px[i]);
    });
    // With 20 entities and range [0,100] the values should not all be identical
    const allSame = vals.every(v => v === vals[0]);
    assert.ok(!allSame, 'random() should produce varying values');
  });

  it('add(a, random(min, max)) shifts each element by a random amount', () => {
    // Record original values
    const before: number[] = [];
    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) before.push(px[i]);
    });

    em.apply(Pos.x, add(Pos.x, random(-1, 1)));

    let idx = 0;
    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) {
        const delta = px[i] - before[idx++];
        assert.ok(delta >= -1 - 1e-5, `delta ${delta} should be >= -1`);
        assert.ok(delta <=  1 + 1e-5, `delta ${delta} should be <= 1`);
      }
    });
  });

  it('sub(a, random(min, max)) shifts each element by a negative random amount', () => {
    const before: number[] = [];
    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) before.push(px[i]);
    });

    em.apply(Pos.x, sub(Pos.x, random(0, 2)));

    let idx = 0;
    em.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      for (let i = 0; i < arch.count; i++) {
        const delta = before[idx++] - px[i]; // original - result = the subtracted amount
        assert.ok(delta >= -1e-5, `delta ${delta} should be >= 0`);
        assert.ok(delta <= 2 + 1e-5, `delta ${delta} should be <= 2`);
      }
    });
  });

  it('apply skips archetypes missing target component', () => {
    const Other = component('ApplyOther', 'f32', ['v']);
    const em2 = createEntityManager();
    em2.createEntityWith(Pos, { x: 7, y: 7 });
    em2.createEntityWith(Other, { v: 99 });

    // Should not throw; Other archetype has no Pos.x
    em2.apply(Pos.x, scale(Pos.x, 2));

    em2.forEach([Pos], (arch) => {
      const px = arch.field(Pos.x) as Float32Array;
      assert.equal(px[0], 14);
    });
  });
});
