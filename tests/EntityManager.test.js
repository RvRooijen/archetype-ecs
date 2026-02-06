import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager } from '../src/EntityManager.js';

describe('EntityManager', () => {
  let em;
  const Position = Symbol('Position');
  const Velocity = Symbol('Velocity');
  const Health = Symbol('Health');

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
      const map = new Map();
      map.set(Position, { x: 3, y: 4 });
      map.set(Velocity, { vx: 1, vy: 0 });

      const id = em.createEntityWith(map);
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
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2, _internal: 'secret' });

      const serializers = new Map([
        ['Position', (data) => ({ x: data.x, y: data.y })]
      ]);

      const result = em.serialize(symbolToName, [], [], { serializers });
      assert.deepEqual(result.components['Position'][a], { x: 1, y: 2 });
      assert.equal(result.components['Position'][a]._internal, undefined);
    });

    it('custom deserializers are used when provided', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      const data = em.serialize(symbolToName);

      const deserializers = new Map([
        ['Position', (compData) => ({ ...compData, restored: true })]
      ]);

      em.deserialize(data, nameToSymbol, { deserializers });
      assert.deepEqual(em.getComponent(a, Position), { x: 1, y: 2, restored: true });
    });

    it('deserialize clears previous state', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      em.deserialize({ nextId: 1, entities: [], components: {} }, nameToSymbol);
      assert.deepEqual(em.getAllEntities(), []);
    });
  });
});
