// === Basis types ===
export type EntityId = number;
export type ComponentType = symbol;

// === Archetype ===
export interface Archetype {
  readonly key: number;
  readonly types: ReadonlySet<ComponentType>;
  readonly entityIds: EntityId[];
  readonly components: Map<ComponentType, unknown[]>;
  readonly entityToIndex: Map<EntityId, number>;
  count: number;
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
  addComponent(entityId: EntityId, type: ComponentType, data: unknown): void;
  removeComponent(entityId: EntityId, type: ComponentType): void;
  getComponent(entityId: EntityId, type: ComponentType): unknown;
  hasComponent(entityId: EntityId, type: ComponentType): boolean;
  query(include: ComponentType[], exclude?: ComponentType[]): EntityId[];
  getAllEntities(): EntityId[];
  createEntityWith(components: Map<ComponentType, unknown>): EntityId;
  count(include: ComponentType[], exclude?: ComponentType[]): number;
  serialize(
    symbolToName: Map<ComponentType, string>,
    stripComponents?: ComponentType[],
    skipEntitiesWith?: ComponentType[],
    options?: SerializeOptions
  ): SerializedData;
  deserialize(
    data: SerializedData,
    nameToSymbol: Record<string, ComponentType>,
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
export const profiler: Profiler;
