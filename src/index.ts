export { createEntityManager } from './EntityManager.js';
export type { EntityId, FieldRef, ArchetypeView, EntityManager, SerializedData } from './EntityManager.js';
export { createSystem, createSystems, System, OnAdded, OnRemoved } from './System.js';
export type { SystemContext, FunctionalSystemConstructor, FunctionalSystem, Pipeline } from './System.js';
export { profiler } from './Profiler.js';
export type { Profiler, ProfilerEntry } from './Profiler.js';
export { TYPED, componentSchemas, parseTypeSpec } from './ComponentRegistry.js';
export type { ComponentDef, TypeSpec } from './ComponentRegistry.js';

import { parseTypeSpec, componentSchemas, type ComponentDef, type TypeSpec } from './ComponentRegistry.js';
import type { FieldRef } from './EntityManager.js';

export function component(name: string): ComponentDef;
export function component<F extends readonly string[]>(name: string, type: string, fields: F): ComponentDef & { readonly [K in F[number]]: FieldRef };
export function component<S extends Record<string, string>>(name: string, schema: S): ComponentDef & { readonly [K in keyof S]: FieldRef };
export function component(name: string, typeOrSchema?: string | Record<string, string>, fields?: string[]): ComponentDef {
  const sym = Symbol(name);
  const comp: any = { _sym: sym, _name: name };

  let schema: Record<string, TypeSpec> | undefined;

  if (typeof typeOrSchema === 'string' && Array.isArray(fields)) {
    const spec = parseTypeSpec(typeOrSchema);
    schema = {};
    for (const f of fields) {
      schema[f] = spec;
      comp[f] = { _sym: sym, _field: f };
    }
  } else if (typeOrSchema && typeof typeOrSchema === 'object') {
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
