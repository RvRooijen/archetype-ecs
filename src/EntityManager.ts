import { TYPED, componentSchemas, toSym, type ComponentDef, type TypeSpec, type FieldRef } from './ComponentRegistry.js';

export type { FieldRef } from './ComponentRegistry.js';

export type EntityId = number;

export type SoAArrayValue = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array
  | Uint8Array | Uint16Array | Uint32Array | unknown[];

export interface ArchetypeView {
  readonly id: number;
  readonly entityIds: EntityId[];
  readonly count: number;
  readonly snapshotEntityIds: EntityId[] | null;
  readonly snapshotCount: number;
  field(ref: FieldRef): any;
  fieldStride(ref: FieldRef): number;
  snapshot(ref: FieldRef): any;
}

export interface SerializedData {
  nextId: number;
  entities: EntityId[];
  components: Record<string, Record<string, unknown>>;
}

export type ComponentData = Record<string, number | string | ArrayLike<number>> | null | undefined;

export interface EntityManager {
  createEntity(): EntityId;
  destroyEntity(id: EntityId): void;
  addComponent(entityId: EntityId, type: ComponentDef, data?: ComponentData): void;
  removeComponent(entityId: EntityId, type: ComponentDef): void;
  getComponent(entityId: EntityId, type: ComponentDef): Record<string, number | string | number[]> | undefined;
  get(entityId: EntityId, fieldRef: FieldRef): number | string | undefined;
  set(entityId: EntityId, fieldRef: FieldRef, value: number | string | ArrayLike<number>): void;
  hasComponent(entityId: EntityId, type: ComponentDef): boolean;
  query(include: ComponentDef[], exclude?: ComponentDef[]): EntityId[];
  getAllEntities(): EntityId[];
  createEntityWith(...args: unknown[]): EntityId;
  count(include: ComponentDef[], exclude?: ComponentDef[]): number;
  forEach(include: ComponentDef[], callback: (view: ArchetypeView) => void, exclude?: ComponentDef[]): void;
  onAdd(type: ComponentDef, callback: (entityId: EntityId) => void): () => void;
  onRemove(type: ComponentDef, callback: (entityId: EntityId) => void): () => void;
  flushHooks(): void;
  commitRemovals(): void;
  enableTracking(filterComponent: ComponentDef): void;
  flushChanges(): { created: Set<EntityId>; destroyed: Set<EntityId> };
  flushSnapshots(): void;
  serialize(
    symbolToName: Map<symbol, string>,
    stripComponents?: ComponentDef[],
    skipEntitiesWith?: ComponentDef[],
    options?: { serializers?: Map<string, (data: unknown) => unknown> }
  ): SerializedData;
  deserialize(
    data: SerializedData,
    nameToSymbol: Record<string, ComponentDef>,
    options?: { deserializers?: Map<string, (data: unknown) => unknown> }
  ): void;
}

// ── Internal types ───────────────────────────────────────

interface SoAStore {
  [TYPED]: true;
  _schema: Record<string, TypeSpec>;
  _capacity: number;
  _arraySizes: Record<string, number>;
  _fields: Record<string, SoAArrayValue>;
}

type SnapshotStore = Record<string, SoAArrayValue>;

interface Archetype {
  key: Uint32Array;
  id: number;
  types: Set<symbol>;
  entityIds: EntityId[];
  components: Map<symbol, SoAStore | null>;
  snapshots: Map<symbol, SnapshotStore> | null;
  snapshotEntityIds: EntityId[] | null;
  snapshotCount: number;
  entityToIndex: Map<EntityId, number>;
  count: number;
  capacity: number;
}

type HookCallback = (entityId: EntityId) => void;

interface Hooks {
  addCbs: Map<symbol, HookCallback[]>;
  removeCbs: Map<symbol, HookCallback[]>;
  pendingAdd: Map<symbol, EntityId[]>;
  pendingRemove: Map<symbol, EntityId[]>;
}

const INITIAL_CAPACITY = 64;

// ── Array-based bitmask helpers ──────────────────────────

function slotsNeeded(bitCount: number): number {
  return ((bitCount - 1) >>> 5) + 1;
}

function createMask(slots: number): Uint32Array {
  return new Uint32Array(slots);
}

function maskSetBit(mask: Uint32Array, bit: number): Uint32Array {
  const slot = bit >>> 5;
  if (slot >= mask.length) {
    const grown = new Uint32Array(slot + 1);
    grown.set(mask);
    grown[slot] |= (1 << (bit & 31));
    return grown;
  }
  mask[slot] |= (1 << (bit & 31));
  return mask;
}

function maskContains(a: Uint32Array, b: Uint32Array): boolean {
  for (let i = 0; i < b.length; i++) {
    const av = i < a.length ? a[i] : 0;
    if ((av & b[i]) !== b[i]) return false;
  }
  return true;
}

function maskDisjoint(a: Uint32Array, b: Uint32Array): boolean {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] & b[i]) !== 0) return false;
  }
  return true;
}

function maskOverlaps(a: Uint32Array, b: Uint32Array): boolean {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] & b[i]) !== 0) return true;
  }
  return false;
}

function maskKey(mask: Uint32Array): string {
  let key = '';
  for (let i = 0; i < mask.length; i++) {
    if (i > 0) key += ',';
    key += mask[i];
  }
  return key;
}

// ── SoA helpers ──────────────────────────────────────────

function unpackSpec(spec: TypeSpec): [{ new(len: number): SoAArrayValue }, number] {
  if (Array.isArray(spec)) return spec;
  return [spec, 0];
}

function createSoAStore(schema: Record<string, TypeSpec>, capacity: number): SoAStore {
  const fields: Record<string, SoAArrayValue> = {};
  const arraySizes: Record<string, number> = {};
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    if (size > 0) {
      fields[field] = new Ctor(capacity * size);
      arraySizes[field] = size;
    } else {
      fields[field] = new Ctor(capacity);
    }
  }
  return { [TYPED]: true, _schema: schema, _capacity: capacity, _arraySizes: arraySizes, _fields: fields };
}

function growSoAStore(store: SoAStore, newCapacity: number): void {
  store._capacity = newCapacity;
  for (const [field, spec] of Object.entries(store._schema)) {
    const [Ctor, size] = unpackSpec(spec);
    const old = store._fields[field];
    const allocSize = size > 0 ? newCapacity * size : newCapacity;
    const grown = new Ctor(allocSize);
    if (Ctor === Array) {
      for (let i = 0; i < old.length; i++) (grown as unknown[])[i] = (old as unknown[])[i];
    } else {
      (grown as Exclude<SoAArrayValue, unknown[]>).set(old as Exclude<SoAArrayValue, unknown[]>);
    }
    store._fields[field] = grown;
  }
}

function soaWrite(store: SoAStore, idx: number, data: ComponentData): void {
  if (!data) {
    for (const field in store._schema) {
      const arr = store._fields[field];
      const size = store._arraySizes[field] || 0;
      if (size > 0) {
        const base = idx * size;
        for (let j = 0; j < size; j++) (arr as never[])[base + j] = 0 as never;
      } else {
        (arr as never[])[idx] = 0 as never;
      }
    }
    return;
  }
  for (const field in store._schema) {
    const arr = store._fields[field];
    const size = store._arraySizes[field] || 0;
    if (size > 0) {
      const base = idx * size;
      const src = data[field];
      if (src) {
        for (let j = 0; j < size; j++) {
          (arr as never[])[base + j] = ((src as ArrayLike<number>)[j] ?? 0) as never;
        }
      }
    } else {
      (arr as never[])[idx] = data[field] as never;
    }
  }
}

function soaRead(store: SoAStore, idx: number): Record<string, number | string | number[]> {
  const obj: Record<string, number | string | number[]> = {};
  for (const field in store._schema) {
    const arr = store._fields[field];
    const size = store._arraySizes[field] || 0;
    if (size > 0) {
      const base = idx * size;
      obj[field] = Array.from((arr as Float32Array).subarray(base, base + size));
    } else {
      obj[field] = (arr as never[])[idx];
    }
  }
  return obj;
}

function soaSwap(store: SoAStore, idxA: number, idxB: number): void {
  for (const field in store._schema) {
    const arr = store._fields[field] as never[];
    const size = store._arraySizes[field] || 0;
    if (size > 0) {
      const baseA = idxA * size;
      const baseB = idxB * size;
      for (let j = 0; j < size; j++) {
        const tmp = arr[baseA + j];
        arr[baseA + j] = arr[baseB + j];
        arr[baseB + j] = tmp;
      }
    } else {
      const tmp = arr[idxA];
      arr[idxA] = arr[idxB];
      arr[idxB] = tmp;
    }
  }
}

function createSnapshotStore(schema: Record<string, TypeSpec>, capacity: number): SnapshotStore {
  const snap: SnapshotStore = {};
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    snap[field] = new Ctor(size > 0 ? capacity * size : capacity);
  }
  return snap;
}

function growSnapshotStore(snap: SnapshotStore, schema: Record<string, TypeSpec>, newCapacity: number): void {
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    const old = snap[field];
    const grown = new Ctor(size > 0 ? newCapacity * size : newCapacity);
    if (Ctor === Array) {
      for (let i = 0; i < old.length; i++) (grown as unknown[])[i] = (old as unknown[])[i];
    } else {
      (grown as Exclude<SoAArrayValue, unknown[]>).set(old as Exclude<SoAArrayValue, unknown[]>);
    }
    snap[field] = grown;
  }
}

// ── Entity Manager ───────────────────────────────────────

export function createEntityManager(): EntityManager {
  let nextId: EntityId = 1;
  let nextArchId = 1;
  const allEntityIds = new Set<EntityId>();

  let trackFilter: Uint32Array | null = null;
  let createdSet: Set<EntityId> | null = null;
  let destroyedSet: Set<EntityId> | null = null;
  const trackedArchetypes: Archetype[] = [];

  let hooks: Hooks | null = null;

  const removedData = new Map<EntityId, Map<symbol, Record<string, number | string | number[]>>>();

  // Deferred structural changes during forEach iteration
  type DeferredOp =
    | { kind: 'add'; entityId: EntityId; comp: ComponentDef; data?: ComponentData }
    | { kind: 'remove'; entityId: EntityId; comp: ComponentDef }
    | { kind: 'destroy'; entityId: EntityId };
  let iterating = 0;
  const deferred: DeferredOp[] = [];

  const componentBitIndex = new Map<symbol, number>();
  let nextBitIndex = 0;

  function getBit(type: symbol | ComponentDef): number {
    const sym = toSym(type);
    let bit = componentBitIndex.get(sym);
    if (bit === undefined) {
      bit = nextBitIndex++;
      componentBitIndex.set(sym, bit);
    }
    return bit;
  }

  function computeMask(types: (symbol | ComponentDef)[]): Uint32Array {
    const slots = nextBitIndex > 0 ? slotsNeeded(nextBitIndex) : 1;
    let mask = createMask(slots);
    for (const t of types) {
      mask = maskSetBit(mask, getBit(t));
    }
    return mask;
  }

  const archetypes = new Map<string, Archetype>();
  const entityArchetype = new Map<EntityId, Archetype>();

  let queryCacheVersion = 0;
  const queryCache = new Map<string, { version: number; archetypes: Archetype[] }>();

  function getOrCreateArchetype(types: symbol[]): Archetype {
    const mask = computeMask(types);
    const key = maskKey(mask);
    let arch = archetypes.get(key);
    if (!arch) {
      const tracked = trackFilter !== null && maskOverlaps(mask, trackFilter);
      arch = {
        key: mask,
        id: nextArchId++,
        types: new Set(types),
        entityIds: [],
        components: new Map(),
        snapshots: tracked ? new Map() : null,
        snapshotEntityIds: tracked ? [] : null,
        snapshotCount: 0,
        entityToIndex: new Map(),
        count: 0,
        capacity: INITIAL_CAPACITY
      };
      for (const t of types) {
        const schema = componentSchemas.get(t);
        const store = schema ? createSoAStore(schema, INITIAL_CAPACITY) : null;
        arch.components.set(t, store);
        if (tracked && store) {
          arch.snapshots!.set(t, createSnapshotStore(schema!, INITIAL_CAPACITY));
        }
      }
      archetypes.set(key, arch);
      if (tracked) trackedArchetypes.push(arch);
      queryCacheVersion++;
    }
    return arch;
  }

  function ensureCapacity(arch: Archetype): void {
    if (arch.count < arch.capacity) return;
    const newCap = arch.capacity * 2;
    arch.capacity = newCap;
    for (const [type, store] of arch.components) {
      if (store) {
        growSoAStore(store, newCap);
        if (arch.snapshots) {
          const snap = arch.snapshots.get(type);
          if (snap) growSnapshotStore(snap, store._schema, newCap);
        }
      }
    }
  }

  function addToArchetype(arch: Archetype, entityId: EntityId, componentMap: Map<symbol, ComponentData>): void {
    ensureCapacity(arch);
    const idx = arch.count;
    arch.entityIds[idx] = entityId;
    for (const t of arch.types) {
      const store = arch.components.get(t);
      if (store) soaWrite(store, idx, componentMap.get(t));
    }
    arch.entityToIndex.set(entityId, idx);
    arch.count++;
    entityArchetype.set(entityId, arch);
  }

  function removeFromArchetype(arch: Archetype, entityId: EntityId): void {
    const idx = arch.entityToIndex.get(entityId)!;
    const lastIdx = arch.count - 1;

    if (idx !== lastIdx) {
      const lastEntity = arch.entityIds[lastIdx];
      arch.entityIds[idx] = lastEntity;
      for (const [, store] of arch.components) {
        if (store) soaSwap(store, idx, lastIdx);
      }
      arch.entityToIndex.set(lastEntity, idx);
    }

    arch.entityIds.length = lastIdx;
    arch.entityToIndex.delete(entityId);
    arch.count--;
    entityArchetype.delete(entityId);
  }

  function readComponentData(arch: Archetype, type: symbol, idx: number): Record<string, number | string | number[]> | undefined {
    const store = arch.components.get(type);
    if (!store) return undefined;
    return soaRead(store, idx);
  }

  function getMatchingArchetypes(types: (symbol | ComponentDef)[], excludeTypes?: (symbol | ComponentDef)[]): Archetype[] {
    const includeMask = computeMask(types);
    const excludeMask = excludeTypes && excludeTypes.length > 0 ? computeMask(excludeTypes) : null;
    const queryStr = maskKey(includeMask) + ':' + (excludeMask ? maskKey(excludeMask) : '');

    const cached = queryCache.get(queryStr);
    if (cached && cached.version === queryCacheVersion) {
      return cached.archetypes;
    }

    const matching: Archetype[] = [];
    for (const arch of archetypes.values()) {
      if (maskContains(arch.key, includeMask) &&
          (!excludeMask || maskDisjoint(arch.key, excludeMask))) {
        matching.push(arch);
      }
    }

    queryCache.set(queryStr, { version: queryCacheVersion, archetypes: matching });
    return matching;
  }

  function doDestroyEntity(id: EntityId): void {
    const arch = entityArchetype.get(id);
    if (arch) {
      if (hooks) {
        for (const type of arch.types) {
          const pending = hooks.pendingRemove.get(type);
          if (pending) pending.push(id);
        }
        if (hooks.removeCbs.size > 0) {
          const idx = arch.entityToIndex.get(id)!;
          let entitySnap: Map<symbol, Record<string, number | string | number[]>> | undefined;
          for (const type of arch.types) {
            if (hooks.removeCbs.has(type)) {
              const store = arch.components.get(type);
              if (store) {
                if (!entitySnap) { entitySnap = new Map(); removedData.set(id, entitySnap); }
                entitySnap.set(type, soaRead(store, idx));
              }
            }
          }
        }
      }
      if (destroyedSet && trackFilter && maskOverlaps(arch.key, trackFilter)) destroyedSet.add(id);
      removeFromArchetype(arch, id);
    }
    allEntityIds.delete(id);
  }

  function doAddComponent(entityId: EntityId, comp: ComponentDef, data?: ComponentData): void {
    const type = toSym(comp);
    const arch = entityArchetype.get(entityId);

    if (!arch) {
      const newArch = getOrCreateArchetype([type]);
      addToArchetype(newArch, entityId, new Map([[type, data]]));
      if (hooks) {
        const pending = hooks.pendingAdd.get(type);
        if (pending) pending.push(entityId);
      }
      return;
    }

    if (arch.types.has(type)) {
      const store = arch.components.get(type);
      if (store) {
        const idx = arch.entityToIndex.get(entityId)!;
        soaWrite(store, idx, data);
      }
      return;
    }

    const newTypes = [...arch.types, type];
    const newArch = getOrCreateArchetype(newTypes);

    const idx = arch.entityToIndex.get(entityId)!;
    const map = new Map<symbol, ComponentData>([[type, data]]);
    for (const t of arch.types) {
      map.set(t, readComponentData(arch, t, idx));
    }

    removeFromArchetype(arch, entityId);
    addToArchetype(newArch, entityId, map);
    if (hooks) {
      const pending = hooks.pendingAdd.get(type);
      if (pending) pending.push(entityId);
    }
  }

  function doRemoveComponent(entityId: EntityId, comp: ComponentDef): void {
    const type = toSym(comp);
    const arch = entityArchetype.get(entityId);
    if (!arch || !arch.types.has(type)) return;

    if (hooks) {
      const pending = hooks.pendingRemove.get(type);
      if (pending) pending.push(entityId);
      if (hooks.removeCbs.has(type)) {
        const store = arch.components.get(type);
        if (store) {
          const idx = arch.entityToIndex.get(entityId)!;
          if (!removedData.has(entityId)) removedData.set(entityId, new Map());
          removedData.get(entityId)!.set(type, soaRead(store, idx));
        }
      }
    }

    if (destroyedSet && trackFilter && maskOverlaps(arch.key, trackFilter)) destroyedSet.add(entityId);

    if (arch.types.size === 1) {
      removeFromArchetype(arch, entityId);
      return;
    }

    const newTypes: symbol[] = [];
    for (const t of arch.types) {
      if (t !== type) newTypes.push(t);
    }
    const newArch = getOrCreateArchetype(newTypes);

    const idx = arch.entityToIndex.get(entityId)!;
    const map = new Map<symbol, ComponentData>();
    for (const t of newTypes) {
      map.set(t, readComponentData(arch, t, idx));
    }

    removeFromArchetype(arch, entityId);
    addToArchetype(newArch, entityId, map);
  }

  function flushDeferred(): void {
    const ops = deferred.splice(0);
    for (const op of ops) {
      switch (op.kind) {
        case 'add': doAddComponent(op.entityId, op.comp, op.data); break;
        case 'remove': doRemoveComponent(op.entityId, op.comp); break;
        case 'destroy': doDestroyEntity(op.entityId); break;
      }
    }
  }

  return {
    createEntity(): EntityId {
      const id = nextId++;
      allEntityIds.add(id);
      return id;
    },

    destroyEntity(id: EntityId): void {
      if (iterating > 0) {
        deferred.push({ kind: 'destroy', entityId: id });
        return;
      }
      doDestroyEntity(id);
    },

    addComponent(entityId: EntityId, comp: ComponentDef, data?: ComponentData): void {
      if (iterating > 0) {
        // In-place overwrite (entity already has component) is safe — no migration
        const type = toSym(comp);
        const arch = entityArchetype.get(entityId);
        if (arch && arch.types.has(type)) {
          const store = arch.components.get(type);
          if (store) {
            const idx = arch.entityToIndex.get(entityId)!;
            soaWrite(store, idx, data);
          }
          return;
        }
        // Migration required — defer
        deferred.push({ kind: 'add', entityId, comp, data });
        return;
      }
      doAddComponent(entityId, comp, data);
    },

    removeComponent(entityId: EntityId, comp: ComponentDef): void {
      if (iterating > 0) {
        deferred.push({ kind: 'remove', entityId, comp });
        return;
      }
      doRemoveComponent(entityId, comp);
    },

    getComponent(entityId: EntityId, comp: ComponentDef): Record<string, number | string | number[]> | undefined {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);
      if (arch) {
        const idx = arch.entityToIndex.get(entityId);
        if (idx !== undefined) return readComponentData(arch, type, idx);
      }
      // Fallback: check recently-removed data (accessible during @OnRemoved hooks)
      const removed = removedData.get(entityId);
      if (removed) return removed.get(type);
      return undefined;
    },

    get(entityId: EntityId, fieldRef: FieldRef): number | string | undefined {
      const arch = entityArchetype.get(entityId);
      if (arch) {
        const store = arch.components.get(fieldRef._sym);
        if (store) {
          const idx = arch.entityToIndex.get(entityId)!;
          const size = store._arraySizes[fieldRef._field] || 0;
          if (size > 0) {
            const base = idx * size;
            return (store._fields[fieldRef._field] as Float32Array).subarray(base, base + size) as unknown as number;
          }
          return (store._fields[fieldRef._field] as never[])[idx];
        }
      }
      // Fallback: check recently-removed data (accessible during @OnRemoved hooks)
      const removed = removedData.get(entityId);
      if (removed) {
        const compData = removed.get(fieldRef._sym);
        if (compData) return compData[fieldRef._field] as number | string;
      }
      return undefined;
    },

    set(entityId: EntityId, fieldRef: FieldRef, value: number | string | ArrayLike<number>): void {
      const arch = entityArchetype.get(entityId);
      if (!arch) return;
      const store = arch.components.get(fieldRef._sym);
      if (!store) return;
      const idx = arch.entityToIndex.get(entityId)!;
      const size = store._arraySizes[fieldRef._field] || 0;
      if (size > 0) {
        (store._fields[fieldRef._field] as Float32Array).set(value as ArrayLike<number>, idx * size);
      } else {
        (store._fields[fieldRef._field] as never[])[idx] = value as never;
      }
    },

    hasComponent(entityId: EntityId, comp: ComponentDef): boolean {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);
      return arch ? arch.types.has(type) : false;
    },

    query(includeTypes: ComponentDef[], excludeTypes?: ComponentDef[]): EntityId[] {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      const result: EntityId[] = [];
      for (let a = 0; a < matching.length; a++) {
        const arch = matching[a];
        const ids = arch.entityIds;
        for (let i = 0; i < arch.count; i++) {
          result.push(ids[i]);
        }
      }
      return result;
    },

    getAllEntities(): EntityId[] {
      return [...allEntityIds];
    },

    createEntityWith(...args: unknown[]): EntityId {
      const id = nextId++;
      allEntityIds.add(id);

      const types: symbol[] = [];
      const map = new Map<symbol, ComponentData>();
      for (let i = 0; i < args.length; i += 2) {
        const sym = toSym(args[i] as ComponentDef);
        types.push(sym);
        map.set(sym, args[i + 1] as ComponentData);
      }
      const arch = getOrCreateArchetype(types);
      addToArchetype(arch, id, map);

      if (hooks) {
        for (let i = 0; i < types.length; i++) {
          const pending = hooks.pendingAdd.get(types[i]);
          if (pending) pending.push(id);
        }
      }

      if (createdSet && trackFilter && maskOverlaps(arch.key, trackFilter)) createdSet.add(id);
      return id;
    },

    count(includeTypes: ComponentDef[], excludeTypes?: ComponentDef[]): number {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      let total = 0;
      for (let a = 0; a < matching.length; a++) {
        total += matching[a].count;
      }
      return total;
    },

    forEach(includeTypes: ComponentDef[], callback: (view: ArchetypeView) => void, excludeTypes?: ComponentDef[]): void {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      iterating++;
      try {
        for (let a = 0; a < matching.length; a++) {
          const arch = matching[a];
          if (arch.count === 0) continue;
          const snaps = arch.snapshots;
          const view: ArchetypeView = {
            id: arch.id,
            entityIds: arch.entityIds,
            count: arch.count,
            snapshotEntityIds: arch.snapshotEntityIds,
            snapshotCount: arch.snapshotCount,
            field(ref: FieldRef) {
              const store = arch.components.get(ref._sym);
              if (!store) return undefined;
              return store._fields[ref._field];
            },
            fieldStride(ref: FieldRef) {
              const store = arch.components.get(ref._sym);
              if (!store) return 1;
              return store._arraySizes[ref._field] || 1;
            },
            snapshot(ref: FieldRef) {
              if (!snaps) return undefined;
              const snap = snaps.get(ref._sym);
              if (!snap) return undefined;
              return snap[ref._field];
            }
          };
          callback(view);
        }
      } finally {
        iterating--;
        if (iterating === 0 && deferred.length > 0) {
          flushDeferred();
        }
      }
    },

    enableTracking(filterComponent: ComponentDef): void {
      const bit = getBit(filterComponent);
      const slots = slotsNeeded(bit + 1);
      trackFilter = createMask(slots);
      trackFilter = maskSetBit(trackFilter, bit);
      createdSet = new Set();
      destroyedSet = new Set();
      for (const arch of archetypes.values()) {
        if (maskOverlaps(arch.key, trackFilter) && !arch.snapshots) {
          arch.snapshots = new Map();
          arch.snapshotEntityIds = [];
          arch.snapshotCount = 0;
          for (const [t, store] of arch.components) {
            if (store) {
              arch.snapshots.set(t, createSnapshotStore(store._schema, arch.capacity));
            }
          }
          trackedArchetypes.push(arch);
        }
      }
    },

    flushChanges() {
      const result = { created: createdSet!, destroyed: destroyedSet! };
      createdSet = new Set();
      destroyedSet = new Set();
      return result;
    },

    flushSnapshots(): void {
      for (let a = 0; a < trackedArchetypes.length; a++) {
        const arch = trackedArchetypes[a];
        const count = arch.count;
        const eids = arch.entityIds;
        const snapEids = arch.snapshotEntityIds!;
        for (let i = 0; i < count; i++) snapEids[i] = eids[i];
        arch.snapshotCount = count;
        for (const [type, store] of arch.components) {
          if (!store) continue;
          const snap = arch.snapshots!.get(type);
          if (!snap) continue;
          for (const field in store._schema) {
            const src = store._fields[field];
            const dst = snap[field];
            const size = store._arraySizes[field] || 0;
            const len = size > 0 ? count * size : count;
            if ('set' in src) {
              (dst as Exclude<SoAArrayValue, unknown[]>).set((src as Float32Array).subarray(0, len));
            } else {
              for (let i = 0; i < len; i++) (dst as unknown[])[i] = (src as unknown[])[i];
            }
          }
        }
      }
    },

    onAdd(comp: ComponentDef, callback: HookCallback): () => void {
      const type = toSym(comp);
      if (!hooks) {
        hooks = {
          addCbs: new Map(),
          removeCbs: new Map(),
          pendingAdd: new Map(),
          pendingRemove: new Map(),
        };
      }
      if (!hooks.addCbs.has(type)) {
        hooks.addCbs.set(type, []);
        hooks.pendingAdd.set(type, []);
      }
      hooks.addCbs.get(type)!.push(callback);
      return () => {
        const cbs = hooks && hooks.addCbs.get(type);
        if (!cbs) return;
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
        if (cbs.length === 0) {
          hooks!.addCbs.delete(type);
          hooks!.pendingAdd.delete(type);
        }
        if (hooks!.addCbs.size === 0 && hooks!.removeCbs.size === 0) hooks = null;
      };
    },

    onRemove(comp: ComponentDef, callback: HookCallback): () => void {
      const type = toSym(comp);
      if (!hooks) {
        hooks = {
          addCbs: new Map(),
          removeCbs: new Map(),
          pendingAdd: new Map(),
          pendingRemove: new Map(),
        };
      }
      if (!hooks.removeCbs.has(type)) {
        hooks.removeCbs.set(type, []);
        hooks.pendingRemove.set(type, []);
      }
      hooks.removeCbs.get(type)!.push(callback);
      return () => {
        const cbs = hooks && hooks.removeCbs.get(type);
        if (!cbs) return;
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
        if (cbs.length === 0) {
          hooks!.removeCbs.delete(type);
          hooks!.pendingRemove.delete(type);
        }
        if (hooks!.addCbs.size === 0 && hooks!.removeCbs.size === 0) hooks = null;
      };
    },

    flushHooks(): void {
      if (!hooks) return;
      for (const [sym, pending] of hooks.pendingAdd) {
        if (pending.length === 0) continue;
        const cbs = hooks.addCbs.get(sym)!;
        for (let c = 0; c < cbs.length; c++) {
          for (let i = 0; i < pending.length; i++) cbs[c](pending[i]);
        }
        pending.length = 0;
      }
      for (const [sym, pending] of hooks.pendingRemove) {
        if (pending.length === 0) continue;
        const cbs = hooks.removeCbs.get(sym)!;
        for (let c = 0; c < cbs.length; c++) {
          for (let i = 0; i < pending.length; i++) cbs[c](pending[i]);
        }
        pending.length = 0;
      }
    },

    commitRemovals(): void {
      removedData.clear();
    },

    serialize(
      symbolToName: Map<symbol, string>,
      stripComponents: ComponentDef[] = [],
      skipEntitiesWith: ComponentDef[] = [],
      { serializers }: { serializers?: Map<string, (data: unknown) => unknown> } = {}
    ): SerializedData {
      const stripSymbols = new Set(stripComponents.map(toSym));
      const skipSymbols = new Set(skipEntitiesWith.map(toSym));
      const skipEntityIds = new Set<EntityId>();

      if (skipSymbols.size > 0) {
        for (const arch of archetypes.values()) {
          let hasSkip = false;
          for (const sym of skipSymbols) {
            if (arch.types.has(sym)) { hasSkip = true; break; }
          }
          if (!hasSkip) continue;
          for (let i = 0; i < arch.count; i++) {
            skipEntityIds.add(arch.entityIds[i]);
          }
        }
      }

      const serializedComponents: Record<string, Record<string, unknown>> = {};

      for (const arch of archetypes.values()) {
        for (const [sym, store] of arch.components) {
          if (!store) continue;
          if (stripSymbols.has(sym) || skipSymbols.has(sym)) continue;
          const name = symbolToName.get(sym);
          if (!name) continue;

          if (!serializedComponents[name]) {
            serializedComponents[name] = {};
          }
          const entries = serializedComponents[name];

          const customSerializer = serializers && serializers.get(name);

          for (let i = 0; i < arch.count; i++) {
            const entityId = arch.entityIds[i];
            if (skipEntityIds.has(entityId)) continue;
            const value = soaRead(store, i);
            entries[entityId] = customSerializer ? customSerializer(value) : value;
          }
        }
      }

      for (const name of Object.keys(serializedComponents)) {
        if (Object.keys(serializedComponents[name]).length === 0) {
          delete serializedComponents[name];
        }
      }

      const serializedEntities: EntityId[] = [];
      for (const id of allEntityIds) {
        if (!skipEntityIds.has(id)) serializedEntities.push(id);
      }

      return {
        nextId,
        entities: serializedEntities,
        components: serializedComponents
      };
    },

    deserialize(
      data: SerializedData,
      nameToSymbol: Record<string, ComponentDef>,
      { deserializers }: { deserializers?: Map<string, (data: unknown) => unknown> } = {}
    ): void {
      allEntityIds.clear();
      archetypes.clear();
      entityArchetype.clear();
      queryCache.clear();
      queryCacheVersion = 0;

      nextId = data.nextId;

      const entityComponents = new Map<EntityId, Map<symbol, ComponentData>>();

      for (const id of data.entities) {
        allEntityIds.add(id);
        entityComponents.set(id, new Map());
      }

      for (const [name, store] of Object.entries(data.components)) {
        const entry = nameToSymbol[name];
        if (!entry) continue;
        const sym = toSym(entry);

        const customDeserializer = deserializers && deserializers.get(name);

        for (const [entityIdStr, compData] of Object.entries(store as Record<string, unknown>)) {
          const entityId = Number(entityIdStr);
          const obj = entityComponents.get(entityId);
          if (!obj) continue;

          if (customDeserializer) {
            obj.set(sym, customDeserializer(compData) as ComponentData);
          } else {
            obj.set(sym, compData as ComponentData);
          }
        }
      }

      const groupedByKey = new Map<string, { entityId: EntityId; compMap: Map<symbol, ComponentData> }[]>();
      for (const [entityId, compMap] of entityComponents) {
        const types = [...compMap.keys()];
        if (types.length === 0) continue;

        const key = maskKey(computeMask(types));
        if (!groupedByKey.has(key)) {
          groupedByKey.set(key, []);
        }
        groupedByKey.get(key)!.push({ entityId, compMap });
      }

      for (const [, entries] of groupedByKey) {
        const types = [...entries[0].compMap.keys()];
        const arch = getOrCreateArchetype(types);

        for (const { entityId, compMap } of entries) {
          addToArchetype(arch, entityId, compMap);
        }
      }
    }
  };
}
