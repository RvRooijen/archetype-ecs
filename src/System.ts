import type { ComponentDef } from './ComponentRegistry.js';
import type { EntityId, EntityManager, ArchetypeView } from './EntityManager.js';

// ── Decorators (TC39 Stage 3) ────────────────────────────

function getMethod(obj: object, name: string | symbol): Function {
  return (obj as Record<string | symbol, Function>)[name];
}

export function OnAdded(...types: ComponentDef[]) {
  return function (_method: Function, context: ClassMethodDecoratorContext) {
    context.addInitializer(function () {
      const self = this as unknown as System;
      self._registerHook('add', types, getMethod(self, context.name).bind(self));
    });
  };
}

export function OnRemoved(...types: ComponentDef[]) {
  return function (_method: Function, context: ClassMethodDecoratorContext) {
    context.addInitializer(function () {
      const self = this as unknown as System;
      self._registerHook('remove', types, getMethod(self, context.name).bind(self));
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

  forEach(types: ComponentDef[], callback: (view: ArchetypeView) => void, exclude?: ComponentDef[]): void {
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

// ── Functional API ───────────────────────────────────────

type HookCallback = (entityId: EntityId) => void;

export interface SystemContext {
  onAdded(...args: [...ComponentDef[], HookCallback]): void;
  onRemoved(...args: [...ComponentDef[], HookCallback]): void;
  forEach(types: ComponentDef[], callback: (view: ArchetypeView) => void, exclude?: ComponentDef[]): void;
}

export type FunctionalSystemConstructor = (sys: SystemContext) => (() => void) | void;

interface FunctionalHook {
  unsubs: (() => void)[];
  buffer: Set<EntityId>;
  callback: HookCallback;
}

export interface FunctionalSystem {
  (): void;
  /** @internal Process hooks and tick without clearing removed-data snapshots. */
  _runCore(): void;
  dispose(): void;
}

export function createSystem(em: EntityManager, constructor: FunctionalSystemConstructor): FunctionalSystem {
  const hooks: FunctionalHook[] = [];

  const sys: SystemContext = {
    onAdded(...args: [...ComponentDef[], HookCallback]) {
      const callback = args[args.length - 1] as HookCallback;
      const types = args.slice(0, -1) as ComponentDef[];
      const buffer = new Set<EntityId>();
      const unsubs: (() => void)[] = [];

      for (const comp of types) {
        const unsub = em.onAdd(comp, (id: EntityId) => {
          for (let i = 0; i < types.length; i++) {
            if (!em.hasComponent(id, types[i])) return;
          }
          buffer.add(id);
        });
        unsubs.push(unsub);
      }

      hooks.push({ unsubs, buffer, callback });
    },

    onRemoved(...args: [...ComponentDef[], HookCallback]) {
      const callback = args[args.length - 1] as HookCallback;
      const types = args.slice(0, -1) as ComponentDef[];
      const buffer = new Set<EntityId>();
      const unsubs: (() => void)[] = [];

      for (const comp of types) {
        const unsub = em.onRemove(comp, (id: EntityId) => {
          buffer.add(id);
        });
        unsubs.push(unsub);
      }

      hooks.push({ unsubs, buffer, callback });
    },

    forEach(types: ComponentDef[], callback: (view: ArchetypeView) => void, exclude?: ComponentDef[]) {
      em.forEach(types, callback, exclude);
    },
  };

  const tick = constructor(sys);

  function runCore() {
    for (const hook of hooks) {
      for (const id of hook.buffer) hook.callback(id);
      hook.buffer.clear();
    }
    if (tick) tick();
  }

  function system() {
    runCore();
    em.commitRemovals();
  }

  system._runCore = runCore;

  system.dispose = function () {
    for (const hook of hooks) {
      for (const unsub of hook.unsubs) unsub();
    }
    hooks.length = 0;
  };

  return system;
}

// ── Activator ────────────────────────────────────────────

interface Runnable {
  _runCore(): void;
  dispose(): void;
}

export interface Pipeline {
  (): void;
  dispose(): void;
}

function isSystemClass(entry: Function): entry is new (em: EntityManager) => System {
  let proto = entry.prototype;
  while (proto) {
    proto = Object.getPrototypeOf(proto);
    if (proto === System.prototype) return true;
  }
  return false;
}

export function createSystems(em: EntityManager, entries: (FunctionalSystemConstructor | (new (em: EntityManager) => System))[]): Pipeline {
  const systems: Runnable[] = entries.map(Entry => {
    if (isSystemClass(Entry)) {
      return new Entry(em);
    }
    const sys = createSystem(em, Entry as FunctionalSystemConstructor);
    return { _runCore: sys._runCore, dispose: sys.dispose };
  });

  function pipeline() {
    for (let i = 0; i < systems.length; i++) systems[i]._runCore();
    em.commitRemovals();
  }

  pipeline.dispose = function () {
    for (let i = 0; i < systems.length; i++) systems[i].dispose();
  };

  return pipeline;
}
