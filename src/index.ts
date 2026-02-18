export { createEntityManager } from './EntityManager.js';
export type { EntityId, ArchetypeView, EntityManager, SerializedData } from './EntityManager.js';
export { createSystem, createSystems, System, OnAdded, OnRemoved } from './System.js';
export type { SystemContext, FunctionalSystemConstructor, FunctionalSystem, Pipeline } from './System.js';
export { profiler } from './Profiler.js';
export type { Profiler, ProfilerEntry } from './Profiler.js';
export { TYPED, componentSchemas, parseTypeSpec } from './ComponentRegistry.js';
export type { ComponentDef, FieldRef, TypeSpec } from './ComponentRegistry.js';

import { parseTypeSpec, componentSchemas, type ComponentDef, type FieldRef, type TypeSpec } from './ComponentRegistry.js';

// Tag component (no fields)
export function component(name: string): ComponentDef;
// Uniform type with field list
export function component<const F extends readonly string[]>(name: string, type: string, fields: F): ComponentDef<F[number]>;
// Schema object with mixed types
export function component<S extends Record<string, string>>(name: string, schema: S): ComponentDef<Extract<keyof S, string>>;
export function component(name: string, typeOrSchema?: string | Record<string, string>, fields?: string[]): ComponentDef<string> {
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

  return comp as ComponentDef<string>;
}
