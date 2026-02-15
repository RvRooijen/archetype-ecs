import { TYPED, componentSchemas, toSym } from './ComponentRegistry.js';

const INITIAL_CAPACITY = 64;

// ── Array-based bitmask helpers ──────────────────────────

/** Number of u32 slots needed for the given bit count */
function slotsNeeded(bitCount) {
  return ((bitCount - 1) >>> 5) + 1;
}

function createMask(slots) {
  return new Uint32Array(slots);
}

function maskSetBit(mask, bit) {
  const slot = bit >>> 5;
  // Grow if needed
  if (slot >= mask.length) {
    const grown = new Uint32Array(slot + 1);
    grown.set(mask);
    mask = grown;
    mask[slot] |= (1 << (bit & 31));
    return grown;
  }
  mask[slot] |= (1 << (bit & 31));
  return mask;
}

/** Ensure mask has at least `slots` length, returning a new array if grown */
function ensureMaskSize(mask, slots) {
  if (mask.length >= slots) return mask;
  const grown = new Uint32Array(slots);
  grown.set(mask);
  return grown;
}

/** Check: (a & b) === b  (all bits in b are set in a) */
function maskContains(a, b) {
  for (let i = 0; i < b.length; i++) {
    const av = i < a.length ? a[i] : 0;
    if ((av & b[i]) !== b[i]) return false;
  }
  return true;
}

/** Check: (a & b) === 0  (no bits in b are set in a) */
function maskDisjoint(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] & b[i]) !== 0) return false;
  }
  return true;
}

/** Check: (a & b) !== 0  (any bit in b is set in a) */
function maskOverlaps(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] & b[i]) !== 0) return true;
  }
  return false;
}

/** Deterministic string key for a mask (used as Map key) */
function maskKey(mask) {
  let key = '';
  for (let i = 0; i < mask.length; i++) {
    if (i > 0) key += ',';
    key += mask[i];
  }
  return key;
}

// ── SoA helpers ──────────────────────────────────────────

/** Extract the base constructor and array size from a schema entry.
 *  Scalar: spec = Float32Array → [Float32Array, 0]
 *  Array:  spec = [Uint16Array, 28] → [Uint16Array, 28]
 */
function unpackSpec(spec) {
  if (Array.isArray(spec)) return spec;         // [Ctor, arraySize]
  return [spec, 0];                             // scalar
}

function createSoAStore(schema, capacity) {
  const store = { [TYPED]: true, _schema: schema, _capacity: capacity, _arraySizes: {} };
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    if (size > 0) {
      store[field] = new Ctor(capacity * size);
      store._arraySizes[field] = size;
    } else {
      store[field] = new Ctor(capacity);
    }
  }
  return store;
}

function growSoAStore(store, newCapacity) {
  store._capacity = newCapacity;
  for (const [field, spec] of Object.entries(store._schema)) {
    const [Ctor, size] = unpackSpec(spec);
    const old = store[field];
    const allocSize = size > 0 ? newCapacity * size : newCapacity;
    store[field] = new Ctor(allocSize);
    if (Ctor === Array) {
      for (let i = 0; i < old.length; i++) store[field][i] = old[i];
    } else {
      store[field].set(old);
    }
  }
}

function soaWrite(store, idx, data) {
  for (const field in store._schema) {
    const size = store._arraySizes[field] || 0;
    if (size > 0) {
      const base = idx * size;
      const src = data[field];
      if (src) {
        // Accept both arrays and TypedArray views
        for (let j = 0; j < size; j++) {
          store[field][base + j] = src[j] ?? 0;
        }
      }
    } else {
      store[field][idx] = data[field];
    }
  }
}

function soaRead(store, idx) {
  const obj = {};
  for (const field in store._schema) {
    const size = store._arraySizes[field] || 0;
    if (size > 0) {
      const base = idx * size;
      obj[field] = Array.from(store[field].subarray(base, base + size));
    } else {
      obj[field] = store[field][idx];
    }
  }
  return obj;
}

function soaSwap(store, idxA, idxB) {
  for (const field in store._schema) {
    const arr = store[field];
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

function createSnapshotStore(schema, capacity) {
  const snap = {};
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    snap[field] = new Ctor(size > 0 ? capacity * size : capacity);
  }
  return snap;
}

function growSnapshotStore(snap, schema, newCapacity) {
  for (const [field, spec] of Object.entries(schema)) {
    const [Ctor, size] = unpackSpec(spec);
    const old = snap[field];
    snap[field] = new Ctor(size > 0 ? newCapacity * size : newCapacity);
    if (Ctor === Array) {
      for (let i = 0; i < old.length; i++) snap[field][i] = old[i];
    } else {
      snap[field].set(old);
    }
  }
}

// ── Entity Manager ───────────────────────────────────────

export function createEntityManager() {
  let nextId = 1;
  let nextArchId = 1; // unique archetype ID (not a bitmask, used by DirtyTracker)
  const allEntityIds = new Set();

  // Change tracking (opt-in via enableTracking)
  let trackFilter = null;   // Uint32Array mask — only track archetypes matching this
  let createdSet = null;     // Set<EntityId>
  let destroyedSet = null;   // Set<EntityId>

  // Double-buffered snapshots: tracked archetypes get back-buffer arrays
  // Game systems write to front (normal SoA arrays), flushSnapshots copies front→back
  const trackedArchetypes = [];  // archetypes that match trackFilter

  // Component bit registry (symbol → bit index, no upper limit)
  const componentBitIndex = new Map();
  let nextBitIndex = 0;

  function getBit(type) {
    const sym = toSym(type);
    let bit = componentBitIndex.get(sym);
    if (bit === undefined) {
      bit = nextBitIndex++;
      componentBitIndex.set(sym, bit);
    }
    return bit;
  }

  function computeMask(types) {
    const slots = nextBitIndex > 0 ? slotsNeeded(nextBitIndex) : 1;
    let mask = createMask(slots);
    for (const t of types) {
      mask = maskSetBit(mask, getBit(t));
    }
    return mask;
  }

  // Archetype storage — keyed by mask string
  const archetypes = new Map();         // maskKey → Archetype
  const entityArchetype = new Map();    // entityId → Archetype

  // Query cache
  let queryCacheVersion = 0;
  const queryCache = new Map();         // queryKey → { version, archetypes[] }

  function getOrCreateArchetype(types) {
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
          arch.snapshots.set(t, createSnapshotStore(schema, INITIAL_CAPACITY));
        }
      }
      archetypes.set(key, arch);
      if (tracked) trackedArchetypes.push(arch);
      queryCacheVersion++;
    }
    return arch;
  }

  function ensureCapacity(arch) {
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

  function addToArchetype(arch, entityId, componentMap) {
    ensureCapacity(arch);
    const idx = arch.count;
    arch.entityIds[idx] = entityId;
    for (const t of arch.types) {
      const store = arch.components.get(t);
      if (store) soaWrite(store, idx, componentMap[t]);
    }
    arch.entityToIndex.set(entityId, idx);
    arch.count++;
    entityArchetype.set(entityId, arch);
  }

  function removeFromArchetype(arch, entityId) {
    const idx = arch.entityToIndex.get(entityId);
    const lastIdx = arch.count - 1;

    if (idx !== lastIdx) {
      const lastEntity = arch.entityIds[lastIdx];
      arch.entityIds[idx] = lastEntity;
      for (const [type, store] of arch.components) {
        if (store) soaSwap(store, idx, lastIdx);
      }
      arch.entityToIndex.set(lastEntity, idx);
    }

    arch.entityIds.length = lastIdx;
    arch.entityToIndex.delete(entityId);
    arch.count--;
    entityArchetype.delete(entityId);
  }

  function readComponentData(arch, type, idx) {
    const store = arch.components.get(type);
    if (!store) return undefined;
    return soaRead(store, idx);
  }

  function getMatchingArchetypes(types, excludeTypes) {
    const includeMask = computeMask(types);
    const excludeMask = excludeTypes && excludeTypes.length > 0 ? computeMask(excludeTypes) : null;
    const queryStr = maskKey(includeMask) + ':' + (excludeMask ? maskKey(excludeMask) : '');

    const cached = queryCache.get(queryStr);
    if (cached && cached.version === queryCacheVersion) {
      return cached.archetypes;
    }

    const matching = [];
    for (const arch of archetypes.values()) {
      if (maskContains(arch.key, includeMask) &&
          (!excludeMask || maskDisjoint(arch.key, excludeMask))) {
        matching.push(arch);
      }
    }

    queryCache.set(queryStr, { version: queryCacheVersion, archetypes: matching });
    return matching;
  }

  return {
    createEntity() {
      const id = nextId++;
      allEntityIds.add(id);
      return id;
    },

    destroyEntity(id) {
      const arch = entityArchetype.get(id);
      if (arch) {
        if (destroyedSet && trackFilter && maskOverlaps(arch.key, trackFilter)) destroyedSet.add(id);
        removeFromArchetype(arch, id);
      }
      allEntityIds.delete(id);
    },

    addComponent(entityId, comp, data) {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);

      if (!arch) {
        const newArch = getOrCreateArchetype([type]);
        addToArchetype(newArch, entityId, { [type]: data });
        return;
      }

      if (arch.types.has(type)) {
        const store = arch.components.get(type);
        if (store) {
          const idx = arch.entityToIndex.get(entityId);
          soaWrite(store, idx, data);
        }
        return;
      }

      const newTypes = [...arch.types, type];
      const newArch = getOrCreateArchetype(newTypes);

      const idx = arch.entityToIndex.get(entityId);
      const map = { [type]: data };
      for (const t of arch.types) {
        map[t] = readComponentData(arch, t, idx);
      }

      removeFromArchetype(arch, entityId);
      addToArchetype(newArch, entityId, map);
    },

    removeComponent(entityId, comp) {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);
      if (!arch || !arch.types.has(type)) return;

      // If entity is leaving a tracked archetype, treat as destroyed
      if (destroyedSet && trackFilter && maskOverlaps(arch.key, trackFilter)) destroyedSet.add(entityId);

      if (arch.types.size === 1) {
        removeFromArchetype(arch, entityId);
        return;
      }

      const newTypes = [];
      for (const t of arch.types) {
        if (t !== type) newTypes.push(t);
      }
      const newArch = getOrCreateArchetype(newTypes);

      const idx = arch.entityToIndex.get(entityId);
      const map = {};
      for (const t of newTypes) {
        map[t] = readComponentData(arch, t, idx);
      }

      removeFromArchetype(arch, entityId);
      addToArchetype(newArch, entityId, map);
    },

    getComponent(entityId, comp) {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);
      if (!arch) return undefined;
      const idx = arch.entityToIndex.get(entityId);
      if (idx === undefined) return undefined;
      return readComponentData(arch, type, idx);
    },

    get(entityId, fieldRef) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return undefined;
      const store = arch.components.get(fieldRef._sym);
      if (!store) return undefined;
      const idx = arch.entityToIndex.get(entityId);
      const size = store._arraySizes[fieldRef._field] || 0;
      if (size > 0) {
        const base = idx * size;
        return store[fieldRef._field].subarray(base, base + size);
      }
      return store[fieldRef._field][idx];
    },

    set(entityId, fieldRef, value) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return;
      const store = arch.components.get(fieldRef._sym);
      if (!store) return;
      const idx = arch.entityToIndex.get(entityId);
      const size = store._arraySizes[fieldRef._field] || 0;
      if (size > 0) {
        store[fieldRef._field].set(value, idx * size);
      } else {
        store[fieldRef._field][idx] = value;
      }
    },

    hasComponent(entityId, comp) {
      const type = toSym(comp);
      const arch = entityArchetype.get(entityId);
      return arch ? arch.types.has(type) : false;
    },

    query(includeTypes, excludeTypes) {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      const result = [];
      for (let a = 0; a < matching.length; a++) {
        const arch = matching[a];
        const ids = arch.entityIds;
        for (let i = 0; i < arch.count; i++) {
          result.push(ids[i]);
        }
      }
      return result;
    },

    getAllEntities() {
      return [...allEntityIds];
    },

    createEntityWith(...args) {
      const id = nextId++;
      allEntityIds.add(id);

      const types = [];
      const map = {};
      for (let i = 0; i < args.length; i += 2) {
        const sym = toSym(args[i]);
        types.push(sym);
        map[sym] = args[i + 1];
      }
      const arch = getOrCreateArchetype(types);
      addToArchetype(arch, id, map);

      if (createdSet && trackFilter && maskOverlaps(arch.key, trackFilter)) createdSet.add(id);
      return id;
    },

    count(includeTypes, excludeTypes) {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      let total = 0;
      for (let a = 0; a < matching.length; a++) {
        total += matching[a].count;
      }
      return total;
    },

    forEach(includeTypes, callback, excludeTypes) {
      const matching = getMatchingArchetypes(includeTypes, excludeTypes);
      for (let a = 0; a < matching.length; a++) {
        const arch = matching[a];
        if (arch.count === 0) continue;
        const snaps = arch.snapshots;
        const view = {
          id: arch.id,
          entityIds: arch.entityIds,
          count: arch.count,
          snapshotEntityIds: arch.snapshotEntityIds,
          snapshotCount: arch.snapshotCount,
          field(ref) {
            const sym = ref._sym || ref;
            const store = arch.components.get(sym);
            if (!store) return undefined;
            return store[ref._field];
          },
          fieldStride(ref) {
            const sym = ref._sym || ref;
            const store = arch.components.get(sym);
            if (!store) return 1;
            return store._arraySizes[ref._field] || 1;
          },
          snapshot(ref) {
            if (!snaps) return undefined;
            const sym = ref._sym || ref;
            const snap = snaps.get(sym);
            if (!snap) return undefined;
            return snap[ref._field];
          }
        };
        callback(view);
      }
    },

    enableTracking(filterComponent) {
      const bit = getBit(filterComponent);
      const slots = slotsNeeded(bit + 1);
      trackFilter = createMask(slots);
      trackFilter = maskSetBit(trackFilter, bit);
      createdSet = new Set();
      destroyedSet = new Set();
      // Retroactively add snapshots to existing matching archetypes
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
      const result = { created: createdSet, destroyed: destroyedSet };
      createdSet = new Set();
      destroyedSet = new Set();
      return result;
    },

    flushSnapshots() {
      for (let a = 0; a < trackedArchetypes.length; a++) {
        const arch = trackedArchetypes[a];
        const count = arch.count;
        // Copy entityIds
        const eids = arch.entityIds;
        const snapEids = arch.snapshotEntityIds;
        for (let i = 0; i < count; i++) snapEids[i] = eids[i];
        arch.snapshotCount = count;
        // Copy all field arrays via .set() (one memcpy per field)
        for (const [type, store] of arch.components) {
          if (!store) continue;
          const snap = arch.snapshots.get(type);
          if (!snap) continue;
          for (const field in store._schema) {
            const src = store[field];
            const dst = snap[field];
            const size = store._arraySizes[field] || 0;
            const len = size > 0 ? count * size : count;
            if (src.set) {
              // TypedArray — use .set() for memcpy, only copy active region
              dst.set(src.subarray(0, len));
            } else {
              // Regular Array (string fields)
              for (let i = 0; i < len; i++) dst[i] = src[i];
            }
          }
        }
      }
    },

    serialize(symbolToName, stripComponents = [], skipEntitiesWith = [], { serializers } = {}) {
      const stripSymbols = new Set(stripComponents.map(toSym));
      const skipSymbols = new Set(skipEntitiesWith.map(toSym));
      const skipEntityIds = new Set();

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

      const serializedComponents = {};

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

      const serializedEntities = [];
      for (const id of allEntityIds) {
        if (!skipEntityIds.has(id)) serializedEntities.push(id);
      }

      return {
        nextId,
        entities: serializedEntities,
        components: serializedComponents
      };
    },

    deserialize(data, nameToSymbol, { deserializers } = {}) {
      allEntityIds.clear();
      archetypes.clear();
      entityArchetype.clear();
      queryCache.clear();
      queryCacheVersion = 0;

      nextId = data.nextId;

      const entityComponents = new Map();

      for (const id of data.entities) {
        allEntityIds.add(id);
        entityComponents.set(id, {});
      }

      for (const [name, store] of Object.entries(data.components)) {
        const entry = nameToSymbol[name];
        if (!entry) continue;
        const sym = toSym(entry);

        const customDeserializer = deserializers && deserializers.get(name);

        for (const [entityIdStr, compData] of Object.entries(store)) {
          const entityId = Number(entityIdStr);
          const obj = entityComponents.get(entityId);
          if (!obj) continue;

          if (customDeserializer) {
            obj[sym] = customDeserializer(compData);
          } else {
            obj[sym] = compData;
          }
        }
      }

      const groupedByKey = new Map();
      for (const [entityId, compMap] of entityComponents) {
        const types = Object.getOwnPropertySymbols(compMap);
        if (types.length === 0) continue;

        const key = maskKey(computeMask(types));
        if (!groupedByKey.has(key)) {
          groupedByKey.set(key, []);
        }
        groupedByKey.get(key).push({ entityId, compMap });
      }

      for (const [key, entries] of groupedByKey) {
        const types = Object.getOwnPropertySymbols(entries[0].compMap);
        const arch = getOrCreateArchetype(types);

        for (const { entityId, compMap } of entries) {
          addToArchetype(arch, entityId, compMap);
        }
      }
    }
  };
}
