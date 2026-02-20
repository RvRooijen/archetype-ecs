import type { SoAArrayValue } from './EntityManager.js';

export type NumericTypedArrayConstructor =
  | typeof Float32Array | typeof Float64Array
  | typeof Int8Array | typeof Int16Array | typeof Int32Array
  | typeof Uint8Array | typeof Uint16Array | typeof Uint32Array;

interface ViewRegistration {
  fields: Record<string, SoAArrayValue>;
  field: string;
  offset: number;
  Ctor: NumericTypedArrayConstructor;
  count: number;
}

const ALIGN = 16; // 16-byte alignment for SIMD

export class WasmArena {
  memory: WebAssembly.Memory;
  private nextOffset: number = 0;
  private views: ViewRegistration[] = [];

  constructor(initialPages = 2048, maxPages = 16384) {
    this.memory = new WebAssembly.Memory({ initial: initialPages, maximum: maxPages });
  }

  alloc(byteLength: number): number {
    // Align up to 16 bytes
    const aligned = (this.nextOffset + ALIGN - 1) & ~(ALIGN - 1);
    const end = aligned + byteLength;

    if (end > this.memory.buffer.byteLength) {
      const needed = Math.ceil((end - this.memory.buffer.byteLength) / 65536);
      this.memory.grow(needed);
      this.handleGrow();
    }

    this.nextOffset = end;
    return aligned;
  }

  createView<T extends SoAArrayValue>(
    Ctor: NumericTypedArrayConstructor,
    offset: number,
    count: number,
    fields: Record<string, SoAArrayValue>,
    field: string
  ): T {
    const view = new Ctor(this.memory.buffer, offset, count) as unknown as T;
    this.views.push({ fields, field, offset, Ctor, count });
    fields[field] = view;
    return view;
  }

  private handleGrow(): void {
    const buf = this.memory.buffer;
    for (const reg of this.views) {
      reg.fields[reg.field] = new reg.Ctor(buf, reg.offset, reg.count);
    }
  }

  /** Update a registered view to point to a new (larger) allocation. */
  updateView(
    fields: Record<string, SoAArrayValue>,
    field: string,
    offset: number,
    Ctor: NumericTypedArrayConstructor,
    count: number
  ): void {
    // Find and update the existing registration
    for (const reg of this.views) {
      if (reg.fields === fields && reg.field === field) {
        reg.offset = offset;
        reg.Ctor = Ctor;
        reg.count = count;
        fields[field] = new Ctor(this.memory.buffer, offset, count);
        return;
      }
    }
    // Not found — register as new
    this.createView(Ctor, offset, count, fields, field);
  }
}
