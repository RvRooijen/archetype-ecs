export { createEntityManager } from './EntityManager.js';
export { profiler } from './Profiler.js';
export { TYPED, componentSchemas, parseTypeSpec } from './ComponentRegistry.js';
import { parseTypeSpec, componentSchemas } from './ComponentRegistry.js';

export function component(name, typeOrSchema, fields) {
  const sym = Symbol(name);
  const comp = { _sym: sym, _name: name };

  let schema;

  if (typeof typeOrSchema === 'string' && Array.isArray(fields)) {
    // Short form: component('Position', 'f32', ['x', 'y'])
    // Also supports array types: component('Slots', 'u16[28]', ['a', 'b'])
    const spec = parseTypeSpec(typeOrSchema);
    schema = {};
    for (const f of fields) {
      schema[f] = spec;
      comp[f] = { _sym: sym, _field: f };
    }
  } else if (typeOrSchema && typeof typeOrSchema === 'object') {
    // Schema form: component('Inventory', { items: 'u16[28]', count: 'u8' })
    schema = {};
    for (const [field, type] of Object.entries(typeOrSchema)) {
      schema[field] = parseTypeSpec(type);
      comp[field] = { _sym: sym, _field: field };
    }
  }

  if (schema) {
    componentSchemas.set(sym, schema);
  }

  return comp;
}
