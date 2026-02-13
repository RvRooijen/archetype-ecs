// === Basis types ===
export type EntityId = number;

// === Field reference descriptor ===
export interface FieldRef<V = number> {
  readonly _sym: symbol;
  readonly _field: string;
}

// === Component definition ===
declare const __phantom: unique symbol;
export type ComponentDef<T = unknown> = {
  readonly _sym: symbol;
  readonly _name: string;
  readonly [__phantom]?: T;
} & (T extends Record<string, number | string>
  ? { readonly [K in keyof T & string]: FieldRef<T[K]> }
  : {});

/** @deprecated Use ComponentDef<T> instead */
export type Component<T = unknown> = ComponentDef<T>;
export type ComponentType = ComponentDef;

// === TypedArray schema ===
export type TypedArrayType = 'f32' | 'f64' | 'i8' | 'i16' | 'i32' | 'u8' | 'u16' | 'u32' | 'string';

export type Schema = Record<string, TypedArrayType>;

/** Maps a schema type to its runtime value type */
type FieldToType<T extends TypedArrayType> = T extends 'string' ? string : number;

/** Maps a schema definition to its runtime value type */
type SchemaToType<S extends Schema> = { [K in keyof S]: FieldToType<S[K]> };

export declare const TYPED: unique symbol;

export declare const componentSchemas: Map<symbol, Record<string, Float32ArrayConstructor | Float64ArrayConstructor | Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | ArrayConstructor>>;

// === TypedArray union ===
type TypedArray = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array;

// === ArchetypeView (forEach callback) ===
export interface ArchetypeView {
  readonly id: number;
  readonly entityIds: EntityId[];
  readonly count: number;
  readonly snapshotEntityIds: EntityId[] | null;
  readonly snapshotCount: number;
  field(ref: FieldRef<any>): TypedArray | unknown[] | undefined;
  snapshot(ref: FieldRef<any>): TypedArray | unknown[] | undefined;
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
  addComponent<T>(entityId: EntityId, type: ComponentDef<T>, data: T): void;
  removeComponent(entityId: EntityId, type: ComponentDef): void;
  getComponent<T>(entityId: EntityId, type: ComponentDef<T>): T | undefined;
  get<V>(entityId: EntityId, fieldRef: FieldRef<V>): V | undefined;
  set<V>(entityId: EntityId, fieldRef: FieldRef<V>, value: V): void;
  hasComponent(entityId: EntityId, type: ComponentDef): boolean;
  query(include: ComponentDef[], exclude?: ComponentDef[]): EntityId[];
  getAllEntities(): EntityId[];
  createEntityWith(...args: unknown[]): EntityId;
  count(include: ComponentDef[], exclude?: ComponentDef[]): number;
  forEach(include: ComponentDef[], callback: (view: ArchetypeView) => void, exclude?: ComponentDef[]): void;
  enableTracking(filterComponent: ComponentDef): void;
  flushChanges(): { created: Set<EntityId>; destroyed: Set<EntityId> };
  flushSnapshots(): void;
  serialize(
    symbolToName: Map<symbol, string>,
    stripComponents?: ComponentDef[],
    skipEntitiesWith?: ComponentDef[],
    options?: SerializeOptions
  ): SerializedData;
  deserialize(
    data: SerializedData,
    nameToSymbol: Record<string, ComponentDef>,
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
export function component(name: string): ComponentDef;
export function component<T extends TypedArrayType, F extends string>(name: string, type: T, fields: F[]): ComponentDef<Record<F, FieldToType<T>>>;
export function component<S extends Schema>(name: string, schema: S): ComponentDef<SchemaToType<S>>;
export const profiler: Profiler;
