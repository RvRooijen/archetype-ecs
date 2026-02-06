// === Basis types ===
export type EntityId = number;

declare const __component_brand: unique symbol;
export type Component<T = unknown> = symbol & { readonly [__component_brand]?: T };

/** @deprecated Use Component<T> instead */
export type ComponentType = Component;

// === TypedArray schema ===
export type TypedArrayType = 'f32' | 'f64' | 'i8' | 'i16' | 'i32' | 'u8' | 'u16' | 'u32';

export type Schema = Record<string, TypedArrayType>;

export declare const TYPED: unique symbol;

export declare const componentSchemas: Map<symbol, Record<string, Float32ArrayConstructor | Float64ArrayConstructor | Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor>>;

// === Archetype ===
export interface Archetype {
  readonly key: number;
  readonly types: ReadonlySet<Component>;
  readonly entityIds: EntityId[];
  readonly components: Map<Component, unknown[] | Record<string, ArrayLike<number>>>;
  readonly entityToIndex: Map<EntityId, number>;
  count: number;
  capacity: number;
}

// === ArchetypeView (forEach callback) ===
export interface ArchetypeView {
  readonly entityIds: EntityId[];
  readonly count: number;
  field(type: Component, name: string): Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | undefined;
}

// === Serialize/Deserialize ===
export interface SerializeOptions {
  serializers?: Map<string, (data: unknown) => unknown>;
}

export interface DeserializeOptions {
  deserializers?: Map<string, (data: unknown) => unknown>;
}

export interface SerializedData {
  nextId: number;
  entities: EntityId[];
  components: Record<string, Record<string, unknown>>;
}

// === EntityManager ===
export interface EntityManager {
  createEntity(): EntityId;
  destroyEntity(id: EntityId): void;
  addComponent<T>(entityId: EntityId, type: Component<T>, data: T): void;
  removeComponent(entityId: EntityId, type: Component): void;
  getComponent<T>(entityId: EntityId, type: Component<T>): T | undefined;
  hasComponent(entityId: EntityId, type: Component): boolean;
  query(include: Component[], exclude?: Component[]): EntityId[];
  getAllEntities(): EntityId[];
  createEntityWith(...args: Array<Component | unknown>): EntityId;
  count(include: Component[], exclude?: Component[]): number;
  forEach(include: Component[], callback: (view: ArchetypeView) => void, exclude?: Component[]): void;
  serialize(
    symbolToName: Map<Component, string>,
    stripComponents?: Component[],
    skipEntitiesWith?: Component[],
    options?: SerializeOptions
  ): SerializedData;
  deserialize(
    data: SerializedData,
    nameToSymbol: Record<string, Component>,
    options?: DeserializeOptions
  ): void;
}

// === Profiler ===
export interface ProfilerEntry {
  avg: number;
}

export interface Profiler {
  readonly enabled: boolean;
  setEnabled(value: boolean): void;
  begin(): number;
  end(name: string, t0: number): void;
  record(name: string, ms: number): void;
  getData(): Map<string, ProfilerEntry>;
}

// === Exports ===
export function createEntityManager(): EntityManager;
export function component<T>(name: string): Component<T>;
export function component<T>(name: string, schema: Schema): Component<T>;
export const profiler: Profiler;
