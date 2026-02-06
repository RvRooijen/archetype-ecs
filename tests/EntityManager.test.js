import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager } from '../src/EntityManager.js';
import { component } from '../src/index.js';

describe('EntityManager', () => {
  let em;
  const Position = component('Position', { x: 'f32', y: 'f32' });
  const Velocity = component('Velocity', { vx: 'f32', vy: 'f32' });
  const Health = component('Health', { hp: 'f32' });

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
      [Position, 'Position'],
      [Velocity, 'Velocity'],
      [Health, 'Health']
    ]);
    const nameToSymbol = {
      Position, Velocity, Health
    };

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
      const Meta = Symbol('Meta');
      const metaSymbolToName = new Map([...symbolToName, [Meta, 'Meta']]);

      const a = em.createEntity();
      em.addComponent(a, Meta, { x: 1, y: 2, _internal: 'secret' });

      const serializers = new Map([
        ['Meta', (data) => ({ x: data.x, y: data.y })]
      ]);

      const result = em.serialize(metaSymbolToName, [], [], { serializers });
      assert.deepEqual(result.components['Meta'][a], { x: 1, y: 2 });
      assert.equal(result.components['Meta'][a]._internal, undefined);
    });

    it('custom deserializers are used when provided', () => {
      const Meta = Symbol('Meta');
      const metaSymbolToName = new Map([...symbolToName, [Meta, 'Meta']]);
      const metaNameToSymbol = { ...nameToSymbol, Meta };

      const a = em.createEntity();
      em.addComponent(a, Meta, { x: 1, y: 2 });

      const data = em.serialize(metaSymbolToName);

      const deserializers = new Map([
        ['Meta', (compData) => ({ ...compData, restored: true })]
      ]);

      em.deserialize(data, metaNameToSymbol, { deserializers });
      assert.deepEqual(em.getComponent(a, Meta), { x: 1, y: 2, restored: true });
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
  let em;

  beforeEach(() => {
    em = createEntityManager();
  });

  it('typed component round-trip (add/get)', () => {
    const Pos = component('Pos', { x: 'f32', y: 'f32' });
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1.5, y: 2.5 });
    const result = em.getComponent(id, Pos);
    assert.ok(Math.abs(result.x - 1.5) < 0.001);
    assert.ok(Math.abs(result.y - 2.5) < 0.001);
  });

  it('growth past initial capacity (>64 entities)', () => {
    const Pos = component('PosGrow', { x: 'f32', y: 'f32' });
    const ids = [];
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
    const Pos = component('PosSwap', { x: 'f32', y: 'f32' });
    const a = em.createEntity();
    const b = em.createEntity();
    const c = em.createEntity();
    em.addComponent(a, Pos, { x: 1, y: 2 });
    em.addComponent(b, Pos, { x: 3, y: 4 });
    em.addComponent(c, Pos, { x: 5, y: 6 });

    // Remove first, causing swap with last
    em.destroyEntity(a);

    const resultB = em.getComponent(b, Pos);
    assert.ok(Math.abs(resultB.x - 3) < 0.001);
    assert.ok(Math.abs(resultB.y - 4) < 0.001);

    const resultC = em.getComponent(c, Pos);
    assert.ok(Math.abs(resultC.x - 5) < 0.001);
    assert.ok(Math.abs(resultC.y - 6) < 0.001);
  });

  it('mixed typed + untyped on same entity', () => {
    const Pos = component('PosMixed', { x: 'f32', y: 'f32' });
    const Tag = Symbol('Tag');
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 10, y: 20 });
    em.addComponent(id, Tag, { label: 'player' });

    const pos = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos.x - 10) < 0.001);
    assert.ok(Math.abs(pos.y - 20) < 0.001);

    const tag = em.getComponent(id, Tag);
    assert.deepEqual(tag, { label: 'player' });
  });

  it('forEach raw field access and mutation', () => {
    const Pos = component('PosLoop', { x: 'f32', y: 'f32' });
    const Vel = component('VelLoop', { vx: 'f32', vy: 'f32' });

    for (let i = 0; i < 10; i++) {
      const id = em.createEntity();
      em.addComponent(id, Pos, { x: i, y: 0 });
      em.addComponent(id, Vel, { vx: 1, vy: 2 });
    }

    em.forEach([Pos, Vel], (arch) => {
      const px = arch.field(Pos, 'x');
      const py = arch.field(Pos, 'y');
      const vx = arch.field(Vel, 'vx');
      const vy = arch.field(Vel, 'vy');
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i];
        py[i] += vy[i];
      }
    });

    // Verify mutations
    const ids = em.query([Pos, Vel]);
    for (const id of ids) {
      const pos = em.getComponent(id, Pos);
      assert.ok(pos.x >= 1); // was i, now i+1
      assert.ok(Math.abs(pos.y - 2) < 0.001); // was 0, now 0+2
    }
  });

  it('serialize/deserialize round-trip with typed components', () => {
    const Pos = component('PosSer', { x: 'f32', y: 'f32' });
    const symbolToName = new Map([[Pos, 'PosSer']]);
    const nameToSymbol = { PosSer: Pos };

    const a = em.createEntity();
    em.addComponent(a, Pos, { x: 1.5, y: 2.5 });
    const b = em.createEntity();
    em.addComponent(b, Pos, { x: 3.5, y: 4.5 });

    const data = em.serialize(symbolToName);
    em.deserialize(data, nameToSymbol);

    const posA = em.getComponent(a, Pos);
    assert.ok(Math.abs(posA.x - 1.5) < 0.01);
    assert.ok(Math.abs(posA.y - 2.5) < 0.01);

    const posB = em.getComponent(b, Pos);
    assert.ok(Math.abs(posB.x - 3.5) < 0.01);
    assert.ok(Math.abs(posB.y - 4.5) < 0.01);
  });

  it('archetype migration with typed components', () => {
    const Pos = component('PosMig', { x: 'f32', y: 'f32' });
    const Vel = component('VelMig', { vx: 'f32', vy: 'f32' });

    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 5, y: 10 });

    // Migrate to [Pos, Vel] archetype
    em.addComponent(id, Vel, { vx: 1, vy: 2 });

    const pos = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos.x - 5) < 0.001);
    assert.ok(Math.abs(pos.y - 10) < 0.001);

    const vel = em.getComponent(id, Vel);
    assert.ok(Math.abs(vel.vx - 1) < 0.001);
    assert.ok(Math.abs(vel.vy - 2) < 0.001);

    // Migrate back by removing Vel
    em.removeComponent(id, Vel);
    const pos2 = em.getComponent(id, Pos);
    assert.ok(Math.abs(pos2.x - 5) < 0.001);
    assert.ok(Math.abs(pos2.y - 10) < 0.001);
    assert.equal(em.hasComponent(id, Vel), false);
  });

  it('overwrite typed component data in-place', () => {
    const Pos = component('PosOw', { x: 'f32', y: 'f32' });
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Pos, { x: 99, y: 88 });
    const result = em.getComponent(id, Pos);
    assert.ok(Math.abs(result.x - 99) < 0.001);
    assert.ok(Math.abs(result.y - 88) < 0.001);
  });

  it('forEach returns undefined for untyped component fields', () => {
    const Tag = Symbol('TagFE');
    const Pos = component('PosFE', { x: 'f32', y: 'f32' });
    const id = em.createEntity();
    em.addComponent(id, Pos, { x: 1, y: 2 });
    em.addComponent(id, Tag, { label: 'test' });

    em.forEach([Pos, Tag], (arch) => {
      assert.ok(arch.field(Pos, 'x') instanceof Float32Array);
      assert.equal(arch.field(Tag, 'label'), undefined);
    });
  });
});
