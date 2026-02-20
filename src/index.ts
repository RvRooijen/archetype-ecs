export { createEntityManager, add, sub, mul, scale, random } from './EntityManager.js';
export type { EntityId, EntityManager, SerializedData, FieldExpr, RandomExpr, Operand } from './EntityManager.js';
export { createSystems, System, OnAdded, OnRemoved } from './System.js';
export type { Pipeline } from './System.js';
export { profiler } from './Profiler.js';
export type { Profiler, ProfilerEntry } from './Profiler.js';
export { TYPED, componentSchemas, parseTypeSpec } from './ComponentRegistry.js';
export type { ComponentDef, FieldRef, TypeSpec } from './ComponentRegistry.js';
export { isWasmSimdAvailable } from './wasm-kernels.js';

import { parseTypeSpec, componentSchemas, type ComponentDef, type FieldRef, type TypeSpec } from './ComponentRegistry.js';

// Tag component (no fields)
export function component(name: string): ComponentDef<Record<never, never>>;
// Uniform type with field list
export function component<const F extends readonly string[], const T extends string>(name: string, type: T, fields: F): ComponentDef<Record<F[number], T>>;
// Schema object with mixed types
export function component<const S extends Record<string, string>>(name: string, schema: S): ComponentDef<S>;
export function component(name: string, typeOrSchema?: string | Record<string, string>, fields?: string[]): ComponentDef {
  const sym = Symbol(name);
  const comp: Record<string, unknown> = { _sym: sym, _name: name };

  let schema: Record<string, TypeSpec> | undefined;

  if (typeof typeOrSchema === 'string' && Array.isArray(fields)) {
    const spec = parseTypeSpec(typeOrSchema);
    schema = {};
    for (const f of fields) {
      schema[f] = spec;
      comp[f] = { _sym: sym, _field: f } satisfies FieldRef;
    }
  } else if (typeOrSchema && typeof typeOrSchema === 'object') {
    schema = {};
    for (const [field, type] of Object.entries(typeOrSchema)) {
      schema[field] = parseTypeSpec(type);
      comp[field] = { _sym: sym, _field: field } satisfies FieldRef;
    }
  }

  if (schema) {
    componentSchemas.set(sym, schema);
  }

  return comp as ComponentDef;
}
