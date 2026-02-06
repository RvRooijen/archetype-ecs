export function createEntityManager() {
  let nextId = 1;
  const allEntityIds = new Set();

  // Archetype storage
  const archetypes = new Map();         // key → Archetype
  const entityArchetype = new Map();    // entityId → Archetype

  // Query cache
  let queryCacheVersion = 0;
  const queryCache = new Map();         // queryKey → { version, archetypes[] }

  function makeArchetypeKey(types) {
    const descs = [];
    for (const sym of types) {
      descs.push(sym.description);
    }
    descs.sort();
    return descs.join('|');
  }

  function getOrCreateArchetype(types) {
    const key = makeArchetypeKey(types);
    let arch = archetypes.get(key);
    if (!arch) {
      arch = {
        key,
        types: new Set(types),
        entityIds: [],
        components: new Map(),
        entityToIndex: new Map(),
        count: 0
      };
      for (const t of types) {
        arch.components.set(t, []);
      }
      archetypes.set(key, arch);
      queryCacheVersion++;
    }
    return arch;
  }

  function addToArchetype(arch, entityId, componentMap) {
    const idx = arch.count;
    arch.entityIds[idx] = entityId;
    for (const t of arch.types) {
      arch.components.get(t)[idx] = componentMap.get(t);
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
      for (const [type, arr] of arch.components) {
        arr[idx] = arr[lastIdx];
      }
      arch.entityToIndex.set(lastEntity, idx);
    }

    // Pop last
    arch.entityIds.length = lastIdx;
    for (const [type, arr] of arch.components) {
      arr.length = lastIdx;
    }
    arch.entityToIndex.delete(entityId);
    arch.count--;
    entityArchetype.delete(entityId);
  }

  function getMatchingArchetypes(types, excludeTypes) {
    let queryKey = makeArchetypeKey(types);
    if (excludeTypes && excludeTypes.length > 0) {
      queryKey += '!' + makeArchetypeKey(excludeTypes);
    }
    const cached = queryCache.get(queryKey);
    if (cached && cached.version === queryCacheVersion) {
      return cached.archetypes;
    }

    const matching = [];
    for (const arch of archetypes.values()) {
      let match = true;
      for (const t of types) {
        if (!arch.types.has(t)) {
          match = false;
          break;
        }
      }
      if (match && excludeTypes) {
        for (const t of excludeTypes) {
          if (arch.types.has(t)) {
            match = false;
            break;
          }
        }
      }
      if (match) matching.push(arch);
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
        const map = new Map();
        map.set(componentName, data);
        addToArchetype(newArch, entityId, map);
        return;
      }

      if (arch.types.has(componentName)) {
        // Already has this component type — just update data
        const idx = arch.entityToIndex.get(entityId);
        arch.components.get(componentName)[idx] = data;
        return;
      }

      // Need to move to a new archetype with the extra type
      const newTypes = [...arch.types, componentName];
      const newArch = getOrCreateArchetype(newTypes);

      // Collect component data from old archetype
      const idx = arch.entityToIndex.get(entityId);
      const map = new Map();
      for (const t of arch.types) {
        map.set(t, arch.components.get(t)[idx]);
      }
      map.set(componentName, data);

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
      const map = new Map();
      for (const t of newTypes) {
        map.set(t, arch.components.get(t)[idx]);
      }

      removeFromArchetype(arch, entityId);
      addToArchetype(newArch, entityId, map);
    },

    getComponent(entityId, componentName) {
      const arch = entityArchetype.get(entityId);
      if (!arch) return undefined;
      const arr = arch.components.get(componentName);
      if (!arr) return undefined;
      return arr[arch.entityToIndex.get(entityId)];
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

    createEntityWith(componentMap) {
      const id = nextId++;
      allEntityIds.add(id);

      const types = [...componentMap.keys()];
      const arch = getOrCreateArchetype(types);
      addToArchetype(arch, id, componentMap);

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
        for (const [sym, arr] of arch.components) {
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
            if (customSerializer) {
              entries[entityId] = customSerializer(arr[i]);
            } else {
              entries[entityId] = structuredClone(arr[i]);
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

      // Build per-entity component maps
      const entityComponents = new Map();

      for (const id of data.entities) {
        allEntityIds.add(id);
        entityComponents.set(id, new Map());
      }

      for (const [name, store] of Object.entries(data.components)) {
        const sym = nameToSymbol[name];
        if (!sym) continue;

        const customDeserializer = deserializers && deserializers.get(name);

        for (const [entityIdStr, compData] of Object.entries(store)) {
          const entityId = Number(entityIdStr);
          const map = entityComponents.get(entityId);
          if (!map) continue;

          if (customDeserializer) {
            map.set(sym, customDeserializer(compData));
          } else {
            map.set(sym, compData);
          }
        }
      }

      // Group by archetype key and bulk-insert
      const groupedByKey = new Map();
      for (const [entityId, compMap] of entityComponents) {
        if (compMap.size === 0) continue; // entity with no components

        const key = makeArchetypeKey([...compMap.keys()]);
        if (!groupedByKey.has(key)) {
          groupedByKey.set(key, []);
        }
        groupedByKey.get(key).push({ entityId, compMap });
      }

      for (const [key, entries] of groupedByKey) {
        const types = [...entries[0].compMap.keys()];
        const arch = getOrCreateArchetype(types);

        for (const { entityId, compMap } of entries) {
          addToArchetype(arch, entityId, compMap);
        }
      }
    }
  };
}
