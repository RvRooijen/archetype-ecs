export const TYPED = Symbol('typed');

export const TYPE_MAP = {
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

/**
 * Parse a type specifier string into a TypedArray constructor (or [Ctor, arraySize] for fixed-size arrays).
 * Examples: 'f32' → Float32Array, 'u16[28]' → [Uint16Array, 28]
 */
export function parseTypeSpec(typeStr) {
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

/** @type {Map<symbol, Record<string, typeof Float32Array>>} */
export const componentSchemas = new Map();

/** Extract the underlying symbol from a component object or pass through a plain symbol */
export function toSym(type) {
  return type._sym || type;
}
