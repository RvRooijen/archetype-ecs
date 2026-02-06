export { createEntityManager } from './EntityManager.js';
export { profiler } from './Profiler.js';
export { TYPED, componentSchemas } from './ComponentRegistry.js';
import { TYPE_MAP, componentSchemas } from './ComponentRegistry.js';

export function component(name, schema) {
  const sym = Symbol(name);
  if (schema) {
    const resolved = {};
    for (const [field, type] of Object.entries(schema)) {
      const Ctor = TYPE_MAP[type];
      if (!Ctor) throw new Error(`Unknown type "${type}" for field "${field}"`);
      resolved[field] = Ctor;
    }
    componentSchemas.set(sym, resolved);
  }
  return sym;
}
