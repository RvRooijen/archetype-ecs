import { describe, test, expect, beforeEach } from '@jest/globals';
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
    test('creates entities with incrementing ids', () => {
      const a = em.createEntity();
      const b = em.createEntity();
      expect(b).toBe(a + 1);
    });

    test('destroyEntity removes entity', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 0, y: 0 });
      em.destroyEntity(id);
      expect(em.getAllEntities()).toEqual([]);
      expect(em.getComponent(id, Position)).toBeUndefined();
    });
  });

  describe('addComponent / getComponent / hasComponent', () => {
    test('adds and retrieves a component', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      expect(em.getComponent(id, Position)).toEqual({ x: 1, y: 2 });
      expect(em.hasComponent(id, Position)).toBe(true);
    });

    test('returns undefined for missing component', () => {
      const id = em.createEntity();
      expect(em.getComponent(id, Position)).toBeUndefined();
      expect(em.hasComponent(id, Position)).toBe(false);
    });

    test('overwrites component data on duplicate add', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.addComponent(id, Position, { x: 10, y: 20 });
      expect(em.getComponent(id, Position)).toEqual({ x: 10, y: 20 });
    });

    test('adds multiple component types', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 0, y: 0 });
      em.addComponent(id, Velocity, { vx: 1, vy: 1 });
      expect(em.getComponent(id, Position)).toEqual({ x: 0, y: 0 });
      expect(em.getComponent(id, Velocity)).toEqual({ vx: 1, vy: 1 });
    });
  });

  describe('removeComponent', () => {
    test('removes a component', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.addComponent(id, Velocity, { vx: 1, vy: 1 });
      em.removeComponent(id, Position);
      expect(em.hasComponent(id, Position)).toBe(false);
      expect(em.hasComponent(id, Velocity)).toBe(true);
    });

    test('removing last component leaves entity alive but without archetype', () => {
      const id = em.createEntity();
      em.addComponent(id, Position, { x: 1, y: 2 });
      em.removeComponent(id, Position);
      expect(em.getAllEntities()).toContain(id);
      expect(em.hasComponent(id, Position)).toBe(false);
    });

    test('removing non-existent component is a no-op', () => {
      const id = em.createEntity();
      em.removeComponent(id, Position); // no-op
      expect(em.getAllEntities()).toContain(id);
    });
  });

  describe('query', () => {
    test('returns entities matching component types', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });
      em.addComponent(a, Velocity, { vx: 1, vy: 1 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 5 });

      const result = em.query([Position, Velocity]);
      expect(result).toContain(a);
      expect(result).not.toContain(b);
    });

    test('exclude types filters out entities', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 1, y: 1 });
      em.addComponent(b, Health, { hp: 100 });

      const result = em.query([Position], [Health]);
      expect(result).toContain(a);
      expect(result).not.toContain(b);
    });
  });

  describe('createEntityWith', () => {
    test('creates entity with multiple components at once', () => {
      const map = new Map();
      map.set(Position, { x: 3, y: 4 });
      map.set(Velocity, { vx: 1, vy: 0 });

      const id = em.createEntityWith(map);
      expect(em.getComponent(id, Position)).toEqual({ x: 3, y: 4 });
      expect(em.getComponent(id, Velocity)).toEqual({ vx: 1, vy: 0 });
    });
  });

  describe('count', () => {
    test('counts entities matching query', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 0, y: 0 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 1, y: 1 });
      em.addComponent(b, Velocity, { vx: 1, vy: 0 });

      expect(em.count([Position])).toBe(2);
      expect(em.count([Position, Velocity])).toBe(1);
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

    test('round-trips entities and components', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });
      em.addComponent(a, Velocity, { vx: 3, vy: 4 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 6 });

      const data = em.serialize(symbolToName);
      em.deserialize(data, nameToSymbol);

      expect(em.getAllEntities().sort()).toEqual([a, b].sort());
      expect(em.getComponent(a, Position)).toEqual({ x: 1, y: 2 });
      expect(em.getComponent(a, Velocity)).toEqual({ vx: 3, vy: 4 });
      expect(em.getComponent(b, Position)).toEqual({ x: 5, y: 6 });
    });

    test('strip components excludes component data but keeps entity', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });
      em.addComponent(a, Velocity, { vx: 3, vy: 4 });

      const data = em.serialize(symbolToName, [Velocity]);
      expect(data.components['Velocity']).toBeUndefined();
      expect(data.components['Position']).toBeDefined();
    });

    test('skip entities with component excludes entire entity', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      const b = em.createEntity();
      em.addComponent(b, Position, { x: 5, y: 6 });
      em.addComponent(b, Health, { hp: 100 });

      const data = em.serialize(symbolToName, [], [Health]);
      expect(data.entities).toContain(a);
      expect(data.entities).not.toContain(b);
    });

    test('custom serializers are used when provided', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2, _internal: 'secret' });

      const serializers = new Map([
        ['Position', (data) => ({ x: data.x, y: data.y })]
      ]);

      const result = em.serialize(symbolToName, [], [], { serializers });
      expect(result.components['Position'][a]).toEqual({ x: 1, y: 2 });
      expect(result.components['Position'][a]._internal).toBeUndefined();
    });

    test('custom deserializers are used when provided', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      const data = em.serialize(symbolToName);

      const deserializers = new Map([
        ['Position', (compData) => ({ ...compData, restored: true })]
      ]);

      em.deserialize(data, nameToSymbol, { deserializers });
      expect(em.getComponent(a, Position)).toEqual({ x: 1, y: 2, restored: true });
    });

    test('deserialize clears previous state', () => {
      const a = em.createEntity();
      em.addComponent(a, Position, { x: 1, y: 2 });

      em.deserialize({ nextId: 1, entities: [], components: {} }, nameToSymbol);
      expect(em.getAllEntities()).toEqual([]);
    });
  });
});
