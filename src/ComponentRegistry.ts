export const TYPED: unique symbol = Symbol('typed');

type TypedArrayConstructor =
  | typeof Float32Array | typeof Float64Array
  | typeof Int8Array | typeof Int16Array | typeof Int32Array
  | typeof Uint8Array | typeof Uint16Array | typeof Uint32Array
  | typeof Array;

export const TYPE_MAP: Record<string, TypedArrayConstructor> = {
  'f32': Float32Array,
  'f64': Float64Array,
  'i8': Int8Array,
  'i16': Int16Array,
  'i32': Int32Array,
  'u8': Uint8Array,
  'u16': Uint16Array,
  'u32': Uint32Array,
  'string': Array,
};

export type TypeSpec = TypedArrayConstructor | [TypedArrayConstructor, number];

export function parseTypeSpec(typeStr: string): TypeSpec {
  const match = typeStr.match(/^(\w+)\[(\d+)\]$/);
  if (match) {
    const Ctor = TYPE_MAP[match[1]];
    if (!Ctor) throw new Error(`Unknown base type "${match[1]}"`);
    return [Ctor, parseInt(match[2])];
  }
  const Ctor = TYPE_MAP[typeStr];
  if (!Ctor) throw new Error(`Unknown type "${typeStr}"`);
  return Ctor;
}

export const componentSchemas = new Map<symbol, Record<string, TypeSpec>>();

export interface FieldRef {
  readonly _sym: symbol;
  readonly _field: string;
}

export type ComponentDef<F extends string = never> = {
  readonly _sym: symbol;
  readonly _name: string;
} & { readonly [K in F]: FieldRef };

export function toSym(type: ComponentDef | symbol): symbol {
  return (type as ComponentDef)._sym || (type as symbol);
}
