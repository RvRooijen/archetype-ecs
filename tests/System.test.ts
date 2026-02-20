import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager, type EntityManager } from '../src/EntityManager.js';
import { createSystems, System, OnAdded, OnRemoved } from '../src/System.js';
import type { EntityId } from '../src/EntityManager.js';
import { component } from '../src/index.js';

// ── Components (shared across all suites) ────────────────

const Position = component('Position', 'f32', ['x', 'y']);
const Velocity = component('Velocity', 'f32', ['vx', 'vy']);
const Health = component('Health', 'f32', ['hp']);
const Tag = component('Tag');

// ── Decorator-based class API ────────────────────────────

describe('System (class + decorators)', () => {
  let em: EntityManager;

  beforeEach(() => {
    em = createEntityManager();
  });

  it('@OnAdded fires decorated method after flush + run', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('@OnAdded with multiple types only fires when entity has ALL types', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health, Position)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);

    // Only Health — should NOT trigger
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, []);

    // Add Position — now matches
    em.addComponent(e1, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('@OnAdded deduplicates with createEntityWith', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health, Position)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Health, { hp: 50 }, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('@OnRemoved fires decorated method after flush + run', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnRemoved(Health)
      handleRemove(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 50 });
    em.flushHooks();
    sys.run();

    em.removeComponent(e1, Health);
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('@OnRemoved fires on destroyEntity for all component types', () => {
    const removedHealth: EntityId[] = [];
    const removedPos: EntityId[] = [];

    class TestSys extends System {
      @OnRemoved(Health)
      handleHealth(id: EntityId) { removedHealth.push(id); }

      @OnRemoved(Position)
      handlePos(id: EntityId) { removedPos.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Health, { hp: 100 }, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys.run();

    em.destroyEntity(e1);
    em.flushHooks();
    sys.run();
    assert.deepEqual(removedHealth, [e1]);
    assert.deepEqual(removedPos, [e1]);

    sys.dispose();
  });

  it('buffers cleared after run() — no double processing', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, [e1]);

    collected.length = 0;
    sys.run();
    assert.deepEqual(collected, []);

    sys.dispose();
  });

  it('dispose() unsubscribes hooks', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const sys = new TestSys(em);
    sys.dispose();

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(collected, []);
  });

  it('tick() is called after hook callbacks', () => {
    const order: string[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(_id: EntityId) { order.push('hook'); }

      tick() { order.push('tick'); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(order, ['hook', 'tick']);

    sys.dispose();
  });

  it('forEach available on System instance', () => {
    const e1 = em.createEntity();
    em.addComponent(e1, Position, { x: 1, y: 2 });
    em.addComponent(e1, Velocity, { vx: 3, vy: 4 });

    let count = 0;

    class TestSys extends System {
      tick() {
        this.forEach([Position, Velocity], (view) => { count += view.count; });
      }
    }

    const sys = new TestSys(em);
    sys.run();
    assert.equal(count, 1);
    sys.dispose();
  });

  it('multiple decorated methods on same class', () => {
    const added: EntityId[] = [];
    const removed: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { added.push(id); }

      @OnRemoved(Health)
      handleRemove(id: EntityId) { removed.push(id); }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys.run();
    assert.deepEqual(added, [e1]);
    assert.deepEqual(removed, []);

    em.removeComponent(e1, Health);
    em.flushHooks();
    sys.run();
    assert.deepEqual(removed, [e1]);

    sys.dispose();
  });

  it('@OnRemoved handler can read removed component data via get()', () => {
    const hpValues: number[] = [];

    class TestSys extends System {
      @OnRemoved(Health)
      handleRemove(id: EntityId) {
        hpValues.push(this.em.get(id, Health.hp) as number);
      }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Health, { hp: 42 });
    em.flushHooks();
    sys.run();

    em.removeComponent(e1, Health);
    em.flushHooks();
    sys.run();

    assert.ok(Math.abs(hpValues[0] - 42) < 0.001);
    sys.dispose();
  });

  it('@OnRemoved handler can read data of destroyed entity via get()', () => {
    const hpValues: number[] = [];

    class TestSys extends System {
      @OnRemoved(Health)
      handleRemove(id: EntityId) {
        hpValues.push(this.em.get(id, Health.hp) as number);
      }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Health, { hp: 99 });
    em.flushHooks();
    sys.run();

    em.destroyEntity(e1);
    em.flushHooks();
    sys.run();

    assert.ok(Math.abs(hpValues[0] - 99) < 0.001);
    sys.dispose();
  });

  it('@OnRemoved handler can read data via getComponent()', () => {
    const results: Record<string, number | string | number[]>[] = [];

    class TestSys extends System {
      @OnRemoved(Position)
      handleRemove(id: EntityId) {
        const comp = this.em.getComponent(id, Position);
        if (comp) results.push(comp);
      }
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Position, { x: 10, y: 20 });
    em.flushHooks();
    sys.run();

    em.removeComponent(e1, Position);
    em.flushHooks();
    sys.run();

    assert.ok(Math.abs(results[0].x as number - 10) < 0.001);
    assert.ok(Math.abs(results[0].y as number - 20) < 0.001);
    sys.dispose();
  });

  it('removed data is cleared after commitRemovals (via run())', () => {
    class TestSys extends System {
      @OnRemoved(Health)
      handleRemove(_id: EntityId) {}
    }

    const sys = new TestSys(em);
    const e1 = em.createEntityWith(Health, { hp: 42 });
    em.flushHooks();
    sys.run();

    em.removeComponent(e1, Health);
    em.flushHooks();
    sys.run(); // calls commitRemovals internally

    // After run(), removed data should be cleared
    assert.equal(em.get(e1, Health.hp), undefined);
    sys.dispose();
  });

  it('multiple instances have independent buffers', () => {
    const collectedA: EntityId[] = [];
    const collectedB: EntityId[] = [];

    class TestSys extends System {
      out: EntityId[];
      constructor(em: EntityManager, out: EntityId[]) {
        super(em);
        this.out = out;
      }
      @OnAdded(Health)
      handleAdd(id: EntityId) { this.out.push(id); }
    }

    const sysA = new TestSys(em, collectedA);
    const sysB = new TestSys(em, collectedB);

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();

    sysA.run();
    sysB.run();

    assert.deepEqual(collectedA, [e1]);
    assert.deepEqual(collectedB, [e1]);

    sysA.dispose();
    sysB.dispose();
  });
});

// ── createSystems (activator) ────────────────────────────

describe('createSystems', () => {
  let em: EntityManager;

  beforeEach(() => {
    em = createEntityManager();
  });

  it('runs class-based systems in order', () => {
    const order: string[] = [];

    class SysA extends System { tick() { order.push('A'); } }
    class SysB extends System { tick() { order.push('B'); } }

    const pipeline = createSystems(em, [SysA, SysB]);
    pipeline();
    assert.deepEqual(order, ['A', 'B']);
    pipeline.dispose();
  });

  it('dispose() disposes all systems', () => {
    const collected: EntityId[] = [];

    class TestSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { collected.push(id); }
    }

    const pipeline = createSystems(em, [TestSys]);
    pipeline.dispose();

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    pipeline();
    assert.deepEqual(collected, []);
  });

  it('@OnRemoved in pipeline can access removed data', () => {
    const hpValues: number[] = [];

    class DeathSys extends System {
      @OnRemoved(Health)
      handleRemove(id: EntityId) {
        hpValues.push(this.em.get(id, Health.hp) as number);
      }
    }

    const pipeline = createSystems(em, [DeathSys]);
    const e1 = em.createEntityWith(Health, { hp: 77 });
    em.flushHooks();
    pipeline();

    em.removeComponent(e1, Health);
    em.flushHooks();
    pipeline();

    assert.ok(Math.abs(hpValues[0] - 77) < 0.001);
    // Data should be cleared after pipeline (commitRemovals)
    assert.equal(em.get(e1, Health.hp), undefined);
    pipeline.dispose();
  });

  it('multiple systems in pipeline all see removed data', () => {
    const hpA: number[] = [];
    const hpB: number[] = [];

    class SysA extends System {
      @OnRemoved(Health)
      handle(id: EntityId) { hpA.push(this.em.get(id, Health.hp) as number); }
    }

    class SysB extends System {
      @OnRemoved(Health)
      handle(id: EntityId) { hpB.push(this.em.get(id, Health.hp) as number); }
    }

    const pipeline = createSystems(em, [SysA, SysB]);
    const e1 = em.createEntityWith(Health, { hp: 33 });
    em.flushHooks();
    pipeline();

    em.destroyEntity(e1);
    em.flushHooks();
    pipeline();

    assert.ok(Math.abs(hpA[0] - 33) < 0.001);
    assert.ok(Math.abs(hpB[0] - 33) < 0.001);
    pipeline.dispose();
  });

  it('class hooks fire through pipeline', () => {
    const added: EntityId[] = [];
    let moved = 0;

    class HookSys extends System {
      @OnAdded(Health)
      handleAdd(id: EntityId) { added.push(id); }
    }

    class TickSys extends System {
      tick() {
        this.forEach([Position, Velocity], (view) => { moved += view.count; });
      }
    }

    const pipeline = createSystems(em, [HookSys, TickSys]);

    const e1 = em.createEntityWith(
      Health, { hp: 100 },
      Position, { x: 0, y: 0 },
      Velocity, { vx: 1, vy: 1 }
    );
    em.flushHooks();
    pipeline();

    assert.deepEqual(added, [e1]);
    assert.equal(moved, 1);
    pipeline.dispose();
  });
});
