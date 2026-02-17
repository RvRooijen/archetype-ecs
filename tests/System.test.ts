import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager, type EntityManager } from '../src/EntityManager.js';
import { createSystem, createSystems, System, OnAdded, OnRemoved } from '../src/System.js';
import type { EntityId } from '../src/EntityManager.js';
import { component } from '../src/index.js';

// ── Components (shared across all suites) ────────────────

const Position = component('Position', 'f32', ['x', 'y']);
const Velocity = component('Velocity', 'f32', ['vx', 'vy']);
const Health = component('Health', 'f32', ['hp']);
const Tag = component('Tag');

// ── Functional API ───────────────────────────────────────

describe('createSystem (functional)', () => {
  let em: EntityManager;

  beforeEach(() => {
    em = createEntityManager();
  });

  it('onAdded fires callback after flush + run', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Health, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('onAdded with multiple types only fires when entity has ALL types', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Health, Position, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, []);

    em.addComponent(e1, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('onAdded deduplicates when multiple types trigger for same entity', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Health, Position, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntityWith(Health, { hp: 50 }, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('onRemoved fires callback after flush + run', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onRemoved(Health, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 50 });
    em.flushHooks();
    sys();

    em.removeComponent(e1, Health);
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('onRemoved with multiple types deduplicates', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onRemoved(Health, Position, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntityWith(Health, { hp: 50 }, Position, { x: 0, y: 0 });
    em.flushHooks();
    sys();

    em.removeComponent(e1, Health);
    em.removeComponent(e1, Position);
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    sys.dispose();
  });

  it('buffers cleared after sys() — no double processing', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Health, (id: EntityId) => collected.push(id));
    });

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, [e1]);

    collected.length = 0;
    sys();
    assert.deepEqual(collected, []);

    sys.dispose();
  });

  it('dispose() unsubscribes hooks', () => {
    const collected: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Health, (id: EntityId) => collected.push(id));
    });

    sys.dispose();

    const e1 = em.createEntity();
    em.addComponent(e1, Health, { hp: 100 });
    em.flushHooks();
    sys();
    assert.deepEqual(collected, []);
  });

  it('forEach wraps em.forEach correctly (include + exclude)', () => {
    const e1 = em.createEntity();
    em.addComponent(e1, Position, { x: 1, y: 2 });
    em.addComponent(e1, Velocity, { vx: 3, vy: 4 });

    const e2 = em.createEntity();
    em.addComponent(e2, Position, { x: 5, y: 6 });
    em.addComponent(e2, Tag);

    let count = 0;
    const sys = createSystem(em, (s) => {
      return () => {
        s.forEach([Position], (view) => { count += view.count; }, [Tag]);
      };
    });

    sys();
    assert.equal(count, 1);
    sys.dispose();
  });

  it('hooks-only system (no tick) works', () => {
    const added: EntityId[] = [];
    const sys = createSystem(em, (s) => {
      s.onAdded(Tag, (id: EntityId) => added.push(id));
    });

    const e1 = em.createEntity();
    em.addComponent(e1, Tag);
    em.flushHooks();
    sys();
    assert.deepEqual(added, [e1]);
    sys.dispose();
  });

  it('query-only system (no hooks) works', () => {
    const e1 = em.createEntity();
    em.addComponent(e1, Position, { x: 10, y: 20 });
    em.addComponent(e1, Velocity, { vx: 1, vy: 2 });

    let totalCount = 0;
    const sys = createSystem(em, (s) => {
      return () => {
        s.forEach([Position, Velocity], (view) => { totalCount += view.count; });
      };
    });

    sys();
    assert.equal(totalCount, 1);
    sys.dispose();
  });
});

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

  it('runs functional systems in order', () => {
    const order: string[] = [];
    function SysA() { return () => { order.push('A'); }; }
    function SysB() { return () => { order.push('B'); }; }

    const pipeline = createSystems(em, [SysA, SysB]);
    pipeline();
    assert.deepEqual(order, ['A', 'B']);
    pipeline.dispose();
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

  it('mixes functional and class-based systems', () => {
    const order: string[] = [];

    function FuncSys() { return () => { order.push('func'); }; }
    class ClassSys extends System { tick() { order.push('class'); } }

    const pipeline = createSystems(em, [FuncSys, ClassSys]);
    pipeline();
    assert.deepEqual(order, ['func', 'class']);
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
