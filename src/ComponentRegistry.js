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

/** @type {Map<symbol, Record<string, typeof Float32Array>>} */
export const componentSchemas = new Map();

/** Extract the underlying symbol from a component object or pass through a plain symbol */
export function toSym(type) {
  return type._sym || type;
}
