export { createEntityManager } from './EntityManager.js';
export { profiler } from './Profiler.js';
export { TYPED, componentSchemas } from './ComponentRegistry.js';
import { TYPE_MAP, componentSchemas } from './ComponentRegistry.js';

export function component(name, typeOrSchema, fields) {
  const sym = Symbol(name);
  const comp = { _sym: sym, _name: name };

  let schema;

  if (typeof typeOrSchema === 'string' && Array.isArray(fields)) {
    // Short form: component('Position', 'f32', ['x', 'y'])
    const Ctor = TYPE_MAP[typeOrSchema];
    if (!Ctor) throw new Error(`Unknown type "${typeOrSchema}"`);
    schema = {};
    for (const f of fields) {
      schema[f] = Ctor;
      comp[f] = { _sym: sym, _field: f };
    }
  } else if (typeOrSchema && typeof typeOrSchema === 'object') {
    // Schema form: component('Position', { x: 'f32', y: 'f32' })
    schema = {};
    for (const [field, type] of Object.entries(typeOrSchema)) {
      const Ctor = TYPE_MAP[type];
      if (!Ctor) throw new Error(`Unknown type "${type}" for field "${field}"`);
      schema[field] = Ctor;
      comp[field] = { _sym: sym, _field: field };
    }
  }

  if (schema) {
    componentSchemas.set(sym, schema);
  }

  return comp;
}
