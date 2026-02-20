import type { ComponentDef } from './ComponentRegistry.js';
import type { EntityId, EntityManager } from './EntityManager.js';

// ── Decorators (TC39 Stage 3) ────────────────────────────

export function OnAdded(...types: ComponentDef[]) {
  return function (method: (id: EntityId) => void, _context: ClassMethodDecoratorContext) {
    _context.addInitializer(function () {
      const self = this as unknown as System;
      self._registerHook('add', types, method.bind(self));
    });
  };
}

export function OnRemoved(...types: ComponentDef[]) {
  return function (method: (id: EntityId) => void, _context: ClassMethodDecoratorContext) {
    _context.addInitializer(function () {
      const self = this as unknown as System;
      self._registerHook('remove', types, method.bind(self));
    });
  };
}

// ── Base class ───────────────────────────────────────────

interface Hook {
  buffer: Set<EntityId>;
  handler: (id: EntityId) => void;
}

export class System {
  em: EntityManager;
  _unsubs: (() => void)[] = [];
  _hooks: Hook[] = [];

  constructor(em: EntityManager) {
    this.em = em;
  }

  _registerHook(kind: 'add' | 'remove', types: ComponentDef[], handler: (id: EntityId) => void): void {
    const buffer = new Set<EntityId>();

    if (kind === 'add') {
      for (const comp of types) {
        const unsub = this.em.onAdd(comp, (id: EntityId) => {
          for (let i = 0; i < types.length; i++) {
            if (!this.em.hasComponent(id, types[i])) return;
          }
          buffer.add(id);
        });
        this._unsubs.push(unsub);
      }
    } else {
      for (const comp of types) {
        const unsub = this.em.onRemove(comp, (id: EntityId) => buffer.add(id));
        this._unsubs.push(unsub);
      }
    }

    this._hooks.push({ buffer, handler });
  }

  forEach(types: ComponentDef[], callback: (id: EntityId) => void, exclude?: ComponentDef[]): void {
    this.em.forEach(types, callback, exclude);
  }

  tick?(): void;

  /** Process hooks and tick without clearing removed-data snapshots. */
  _runCore(): void {
    for (const hook of this._hooks) {
      for (const id of hook.buffer) hook.handler(id);
      hook.buffer.clear();
    }
    if (this.tick) this.tick();
  }

  run(): void {
    this._runCore();
    this.em.commitRemovals();
  }

  dispose(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._hooks.length = 0;
  }
}

// ── Activator ────────────────────────────────────────────

export interface Pipeline {
  (): void;
  dispose(): void;
}

export function createSystems(em: EntityManager, entries: (new (em: EntityManager) => System)[]): Pipeline {
  const systems = entries.map(Entry => new Entry(em));

  function pipeline() {
    for (let i = 0; i < systems.length; i++) systems[i]._runCore();
    em.commitRemovals();
  }

  pipeline.dispose = function () {
    for (let i = 0; i < systems.length; i++) systems[i].dispose();
  };

  return pipeline;
}
