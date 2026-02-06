import { TYPED, componentSchemas } from './ComponentRegistry.js';

const INITIAL_CAPACITY = 64;

function createSoAStore(schema, capacity) {
  const store = { [TYPED]: true, _schema: schema, _capacity: capacity };
  for (const [field, Ctor] of Object.entries(schema)) {
    store[field] = new Ctor(capacity);
  }
  return store;
}

function growSoAStore(store, newCapacity) {
  store._capacity = newCapacity;
  for (const [field, Ctor] of Object.entries(store._schema)) {
    const old = store[field];
    store[field] = new Ctor(newCapacity);
    store[field].set(old);
  }
}

function soaWrite(store, idx, data) {
  for (const field in store._schema) {
    store[field][idx] = data[field];
  }
}

function soaRead(store, idx) {
  const obj = {};
  for (const field in store._schema) {
    obj[field] = store[field][idx];
  }
  return obj;
}

function soaSwap(store, idxA, idxB) {
  for (const field in store._schema) {
    const arr = store[field];
    const tmp = arr[idxA];
    arr[idxA] = arr[idxB];
    arr[idxB] = tmp;
  }
}

export function createEntityManager() {
  let nextId = 1;
  const allEntityIds = new Set();

  // Component bit registry (symbol → bit index 0..31)
  const componentBitIndex = new Map();
  let nextBitIndex = 0;

  function getBit(type) {
    let bit = componentBitIndex.get(type);
    if (bit === undefined) {
      bit = nextBitIndex++;
      componentBitIndex.set(type, bit);
    }
    return bit;
  }

  function computeMask(types) {
    let mask = 0;
    for (const t of types) {
      mask |= (1 << getBit(t));
    }
    return mask;
  }

  // Archetype storage
  const archetypes = new Map();         // bitmask → Archetype
  const entityArchetype = new Map();    // entityId → Archetype

  // Query cache
  let queryCacheVersion = 0;
  const queryCache = new Map();         // queryKey → { version, archetypes[] }

  function getOrCreateArchetype(types) {
    const key = computeMask(types);
    let arch = archetypes.get(key);
    if (!arch) {
      arch = {
        key,
        types: new Set(types),
        entityIds: [],
        components: new Map(),
        entityToIndex: new Map(),
        count: 0,
        capacity: INITIAL_CAPACITY
      };
      for (const t of types) {
        const schema = componentSchemas.get(t);
        if (schema) {
          arch.components.set(t, createSoAStore(schema, INITIAL_CAPACITY));
        } else {
          arch.components.set(t, []);
        }
      }
      archetypes.set(key, arch);
      queryCacheVersion++;
    }
    return arch;
  }

  function ensureCapacity(arch) {
    if (arch.count < arch.capacity) return;
    const newCap = arch.capacity * 2;
    arch.capacity = newCap;
    for (const [type, store] of arch.components) {
      if (store[TYPED]) {
        growSoAStore(store, newCap);
      }
    }
  }

  function addToArchetype(arch, entityId, componentMap) {
    ensureCapacity(arch);
    const idx = arch.count;
    arch.entityIds[idx] = entityId;
    for (const t of arch.types) {
      const store = arch.components.get(t);
      if (store[TYPED]) {
        soaWrite(store, idx, componentMap[t]);
      } else {
        store[idx] = componentMap[t];
      }
    }
    arch.entityToIndex.set(entityId, idx);
    arch.count++;
    entityArchetype.set(entityId, arch);
  }

  function removeFromArchetype(arch, entityId) {
    const idx = arch.entityToIndex.get(entityId);
    const lastIdx = arch.count - 1;

    if (idx !== lastIdx) {
      // Swap with last
      const lastEntity = arch.entityIds[lastIdx];
      arch.entityIds[idx] = lastEntity;
      for (const [type, store] of arch.components) {
        if (store[TYPED]) {
          soaSwap(store, idx, lastIdx);
        } else {
          store[idx] = store[lastIdx];
        }
      }
      arch.entityToIndex.set(lastEntity, idx);
    }

    // Pop last
    arch.entityIds.length = lastIdx;
    for (const [type, store] of arch.components) {
      if (!store[TYPED]) {
        store.length = lastIdx;
      }
    }
    arch.entityToIndex.delete(entityId);
    arch.count--;
    entityArchetype.delete(entityId);
  }

  function readComponentData(arch, type, idx) {
    const store = arch.components.get(type);
    if (!store) return undefined;
    if (store[TYPED]) {
      return soaRead(store, idx);
    }
    return store[idx];
  }

  function getMatchingArchetypes(types, excludeTypes) {
    const includeMask = computeMask(types);
    const excludeMask = excludeTypes && excludeTypes.length > 0 ? computeMask(excludeTypes) : 0;
    const queryKey = `${includeMask}:${excludeMask}`;

    const cached = queryCache.get(queryKey);
    if (cached && cached.version === queryCacheVersion) {
      return cached.archetypes;
    }

    const matching = [];
    for (const arch of archetypes.values()) {
      if ((arch.key & includeMask) === includeMask &&
          (arch.key & excludeMask) === 0) {
        matching.push(arch);
      }
    }

    queryCache.set(queryKey, { version: queryCacheVersion, archetypes: matching });
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
        removeFromArchetype(arch, id);
      }
      allEntityIds.delete(id);
    },

    addComponent(entityId, componentName, data) {
      const arch = entityArchetype.get(entityId);

      if (!arch) {
        // Entity has no archetype yet — create single-type archetype
        const newArch = getOrCreateArchetype([componentName]);
        addToArchetype(newArch, entityId, { [componentName]: data });
        return;
      }

      if (arch.types.has(componentName)) {
        // Already has this component type — just update data
        const idx = arch.entityToIndex.get(entityId);
        const store = arch.components.get(componentName);
        if (store[TYPED]) {
          soaWrite(store, idx, data);
        } else {
          store[idx] = data;
        }
        return;
      }

      // Need to move to a new archetype with the extra type
      const newTypes = [...arch.types, componentName];
      const newArch = getOrCreateArchetype(newTypes);

      // Collect component data from old archetype
      const idx = arch.entityToIndex.get(entityId);
      const map = { [componentName]: data };
      for (const t of arch.types) {
        map[t] = readComponentData(arch, t, idx);
      }

      removeFromArchetype(arch, entityId);
      addToArchetype(newArch, entityId, map);
    },

    removeComponent(entityId, componentName) {
      const arch = entityArchetype.get(entityId);
      if (!arch || !arch.types.has(componentName)) return;

      if (arch.types.size === 1) {
        // Removing last component — entity has no archetype
        removeFromArchetype(arch, entityId);
        return;
      }

      const newTypes = [];
      for (const t of arch.types) {
        if (t !== componentName) newTypes.push(t);
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

    getComponent(entityId, componentName) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return undefined;
      const idx = arch.entityToIndex.get(entityId);
      if (idx === undefined) return undefined;
      return readComponentData(arch, componentName, idx);
    },

    getField(entityId, componentName, field) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return undefined;
      const store = arch.components.get(componentName);
      if (!store) return undefined;
      const idx = arch.entityToIndex.get(entityId);
      if (store[TYPED]) {
        return store[field][idx];
      }
      return store[idx][field];
    },

    setField(entityId, componentName, field, value) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return;
      const store = arch.components.get(componentName);
      if (!store) return;
      const idx = arch.entityToIndex.get(entityId);
      if (store[TYPED]) {
        store[field][idx] = value;
      } else {
        store[idx][field] = value;
      }
    },

    hasComponent(entityId, componentName) {
      const arch = entityArchetype.get(entityId);
      return arch ? arch.types.has(componentName) : false;
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
        types.push(args[i]);
        map[args[i]] = args[i + 1];
      }
      const arch = getOrCreateArchetype(types);
      addToArchetype(arch, id, map);

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
        const view = {
          entityIds: arch.entityIds,
          count: arch.count,
          field(type, name) {
            const store = arch.components.get(type);
            if (!store || !store[TYPED]) return undefined;
            return store[name];
          }
        };
        callback(view);
      }
    },

    serialize(symbolToName, stripComponents = [], skipEntitiesWith = [], { serializers } = {}) {
      const stripSymbols = new Set(stripComponents);
      const skipSymbols = new Set(skipEntitiesWith);
      const skipEntityIds = new Set();

      // Find entities that have any "skip entity" component — these are fully excluded
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
          if (stripSymbols.has(sym) || skipSymbols.has(sym)) continue;
          const name = symbolToName.get(sym);
          if (!name) continue;

          if (!serializedComponents[name]) {
            serializedComponents[name] = {};
          }
          const entries = serializedComponents[name];

          const customSerializer = serializers && serializers.get(name);
          const isTyped = store[TYPED];

          for (let i = 0; i < arch.count; i++) {
            const entityId = arch.entityIds[i];
            if (skipEntityIds.has(entityId)) continue;
            const value = isTyped ? soaRead(store, i) : store[i];
            if (customSerializer) {
              entries[entityId] = customSerializer(value);
            } else {
              entries[entityId] = isTyped ? value : structuredClone(value);
            }
          }
        }
      }

      // Remove empty component groups
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
      // Clear all state
      allEntityIds.clear();
      archetypes.clear();
      entityArchetype.clear();
      queryCache.clear();
      queryCacheVersion = 0;

      nextId = data.nextId;

      // Build per-entity component maps (plain objects with symbol keys)
      const entityComponents = new Map();

      for (const id of data.entities) {
        allEntityIds.add(id);
        entityComponents.set(id, {});
      }

      for (const [name, store] of Object.entries(data.components)) {
        const sym = nameToSymbol[name];
        if (!sym) continue;

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

      // Group by archetype key and bulk-insert
      const groupedByKey = new Map();
      for (const [entityId, compMap] of entityComponents) {
        const types = Object.getOwnPropertySymbols(compMap);
        if (types.length === 0) continue; // entity with no components

        const key = computeMask(types);
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
