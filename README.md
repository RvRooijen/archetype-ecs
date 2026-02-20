<p align="center">
  <br>
  <img src="https://em-content.zobj.net/source/apple/391/dna_1f9ec.png" width="80" />
  <br><br>
  <strong>archetype-ecs</strong>
  <br>
  <sub>ECS with TypedArray storage. No dependencies.</sub>
  <br><br>
  <a href="https://www.npmjs.com/package/archetype-ecs"><img src="https://img.shields.io/npm/v/archetype-ecs.svg?style=flat-square&color=000" alt="npm" /></a>
  <img src="https://img.shields.io/badge/gzip-~5kb-000?style=flat-square" alt="size" />
  <a href="https://github.com/RvRooijen/archetype-ecs/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/archetype-ecs.svg?style=flat-square&color=000" alt="license" /></a>
</p>

---

An Entity Component System for games and simulations in TypeScript. Entities with the same components are grouped into archetypes, and their fields are stored in TypedArrays — so iterating a million entities is a tight loop over contiguous memory, not a scatter of object lookups.

```
npm i archetype-ecs
```

```ts
import { createEntityManager, component } from 'archetype-ecs'

const Position = component('Position', 'f32', ['x', 'y'])
const Velocity = component('Velocity', 'f32', ['vx', 'vy'])

const em = createEntityManager()

for (let i = 0; i < 10_000; i++) {
  em.createEntityWith(
    Position, { x: Math.random() * 800, y: Math.random() * 600 },
    Velocity, { vx: Math.random() - 0.5, vy: Math.random() - 0.5 },
  )
}

em.forEach([Position, Velocity], (arch) => {
  const px = arch.field(Position.x)  // Float32Array
  const py = arch.field(Position.y)
  const vx = arch.field(Velocity.vx)
  const vy = arch.field(Velocity.vy)
  for (let i = 0; i < arch.count; i++) {
    px[i] += vx[i]
    py[i] += vy[i]
  }
})
```

---

### Why archetype-ecs?

<table>
<tr><td><strong>Fast iteration</strong></td><td>1.7 ms/frame over 1M entities. Faster than bitecs, wolf-ecs, harmony-ecs — see <a href="#benchmarks">benchmarks</a>.</td></tr>
<tr><td><strong>Low memory</strong></td><td>86 MB for 1M entities. Sparse-array ECS libraries use up to 2.4x more.</td></tr>
<tr><td><strong>No allocations</strong></td><td><code>get</code>, <code>set</code>, and <code>forEach</code> don't allocate.</td></tr>
<tr><td><strong>Typed</strong></td><td>TypeScript generics throughout. Field names autocomplete, wrong fields don't compile.</td></tr>
<tr><td><strong>Systems</strong></td><td>Class-based systems with <code>@OnAdded</code> / <code>@OnRemoved</code> decorators. Functional API also available.</td></tr>
</table>

---

### Components

```ts
import { createEntityManager, component } from 'archetype-ecs'

// Numeric — stored as TypedArrays
const Position = component('Position', 'f32', ['x', 'y'])
const Velocity = component('Velocity', 'f32', ['vx', 'vy'])
const Health   = component('Health', { hp: 'i32', maxHp: 'i32' })

// Strings — stored as arrays, same API
const Name     = component('Name', 'string', ['name', 'title'])

// Mixed — numeric and string fields in one component
const Item     = component('Item', { name: 'string', weight: 'f32' })

// Tag — no data, just a marker
const Enemy    = component('Enemy')
```

> Field types: `f32` `f64` `i8` `i16` `i32` `u8` `u16` `u32` `string`

### Entities

```ts
const em = createEntityManager()

// One at a time
const player = em.createEntity()
em.addComponent(player, Position, { x: 0, y: 0 })
em.addComponent(player, Velocity, { vx: 0, vy: 0 })
em.addComponent(player, Health, { hp: 100, maxHp: 100 })
em.addComponent(player, Name, { name: 'Hero', title: 'Sir' })

// Or all at once
for (let i = 0; i < 10_000; i++) {
  em.createEntityWith(
    Position, { x: Math.random() * 800, y: Math.random() * 600 },
    Velocity, { vx: Math.random() - 0.5, vy: Math.random() - 0.5 },
    Enemy,    {},
  )
}

em.hasComponent(player, Health)   // true
em.removeComponent(player, Health)
em.destroyEntity(player)
```

### Read & write

```ts
// Access a single field (doesn't allocate)
em.get(player, Position.x)         // 0
em.get(player, Name.name)          // 'Hero'
em.set(player, Velocity.vx, 5)

// Or grab the whole component as an object (allocates)
em.getComponent(player, Position)  // { x: 0, y: 0 }
em.getComponent(player, Name)      // { name: 'Hero', title: 'Sir' }
```

### Queries — `forEach` vs `query`

Two ways to work with entities in bulk. Pick the right one for the job:

#### `forEach` — bulk processing

Iterates over matching archetypes. You get the backing TypedArrays directly.

```ts
function movementSystem(dt: number) {
  em.forEach([Position, Velocity], (arch) => {
    const px = arch.field(Position.x)  // Float32Array
    const py = arch.field(Position.y)
    const vx = arch.field(Velocity.vx)
    const vy = arch.field(Velocity.vy)
    for (let i = 0; i < arch.count; i++) {
      px[i] += vx[i] * dt
      py[i] += vy[i] * dt
    }
  })
}
```

#### `query` — when you need entity IDs

Returns entity IDs for when you need to target specific entities.

```ts
// Find the closest enemy to the player
const enemies = em.query([Position, Enemy])
let closest = -1, minDist = Infinity
for (const id of enemies) {
  const dx = em.get(id, Position.x) - playerX
  const dy = em.get(id, Position.y) - playerY
  const dist = dx * dx + dy * dy
  if (dist < minDist) { minDist = dist; closest = id }
}

// Store the result as a component
em.addComponent(player, Target, { entityId: closest })

// Exclude enemies from friendly queries
const friendly = em.query([Health], [Enemy])

// Just need a count? No allocation needed
const total = em.count([Position])
```

#### When to use which

| | `forEach` | `query` |
|---|---|---|
| **Use for** | Movement, physics, rendering | Damage events, UI, spawning |
| **Runs** | Every frame | On demand |
| **Allocates** | Nothing | `number[]` of entity IDs |
| **Access** | TypedArrays by field | `get` / `set` by entity ID |

### Systems

Class-based systems with decorators for component lifecycle hooks:

```ts
import { System, OnAdded, OnRemoved, createSystems, type EntityId } from 'archetype-ecs'

class MovementSystem extends System {
  tick() {
    this.forEach([Position, Velocity], (arch) => {
      const px = arch.field(Position.x)
      const py = arch.field(Position.y)
      const vx = arch.field(Velocity.vx)
      const vy = arch.field(Velocity.vy)
      for (let i = 0; i < arch.count; i++) {
        px[i] += vx[i]
        py[i] += vy[i]
      }
    })
  }
}

class DeathSystem extends System {
  @OnAdded(Health)
  onSpawn(id: EntityId) {
    console.log(`Entity ${id} spawned with ${this.em.get(id, Health.hp)} HP`)
  }

  @OnRemoved(Health)
  onDeath(id: EntityId) {
    this.em.addComponent(id, Dead)
  }
}

const em = createEntityManager()
const pipeline = createSystems(em, [MovementSystem, DeathSystem])

// Game loop
em.flushHooks()
pipeline()
```

`@OnAdded(Health, Position)` fires when an entity has **all** specified components. `@OnRemoved(Health)` fires when any specified component is removed. Hooks are buffered and deduplicated — they fire during `pipeline()` (or `sys.run()`), after `flushHooks()` collects the pending changes.

A functional API is also available:

```ts
import { createSystem } from 'archetype-ecs'

const deathSystem = createSystem(em, (sys) => {
  sys.onAdded(Health, (id: EntityId) => console.log(`${id} spawned`))
  sys.onRemoved(Health, (id: EntityId) => console.log(`${id} died`))
})

em.flushHooks()
deathSystem()
```

### Serialize

```ts
const symbolToName = new Map([
  [Position._sym, 'Position'],
  [Velocity._sym, 'Velocity'],
  [Health._sym, 'Health'],
])

const snapshot = em.serialize(symbolToName)
const json = JSON.stringify(snapshot)

// Later...
em.deserialize(JSON.parse(json), { Position, Velocity, Health })
```

Supports stripping components, skipping entities, and custom serializers.

---

## TypeScript

Component types are inferred from their definition. Field names autocomplete, wrong fields are compile errors.

```ts
// Fields are typed as FieldRef — Position becomes ComponentDef & { x: FieldRef; y: FieldRef }
const Position = component('Position', 'f32', ['x', 'y'])

Position.x                // FieldRef — autocompletes to .x and .y
Position.z                // compile error: Property 'z' does not exist

em.get(id, Position.x)    // zero-alloc field access
em.set(id, Position.x, 5) // zero-alloc field write

arch.field(Position.x)    // Float32Array — direct TypedArray access
```

---

## API reference

### `component(name)`

Tag component — no data, used as a marker for queries.

### `component(name, type, fields)`

Schema component with uniform field type.

```ts
const Position = component('Position', 'f32', ['x', 'y'])
const Name     = component('Name', 'string', ['name', 'title'])
```

### `component(name, schema)`

Schema component with mixed field types.

```ts
const Item = component('Item', { name: 'string', weight: 'f32', armor: 'u8' })
```

### `createEntityManager()`

Returns an entity manager with the following methods:

| Method | Description |
|---|---|
| `createEntity()` | Create an empty entity |
| `createEntityWith(Comp, data, ...)` | Create entity with components in one call |
| `destroyEntity(id)` | Remove entity and all its components |
| `addComponent(id, Comp, data)` | Add a component to an existing entity |
| `removeComponent(id, Comp)` | Remove a component |
| `hasComponent(id, Comp)` | Check if entity has a component |
| `getComponent(id, Comp)` | Get component data as object *(allocates)* |
| `get(id, Comp.field)` | Read a single field |
| `set(id, Comp.field, value)` | Write a single field |
| `query(include, exclude?)` | Get matching entity IDs |
| `count(include, exclude?)` | Count matching entities |
| `forEach(include, callback, exclude?)` | Iterate archetypes with TypedArray access |
| `onAdd(Comp, callback)` | Register callback for component additions *(deferred)* |
| `onRemove(Comp, callback)` | Register callback for component removals *(deferred)* |
| `flushHooks()` | Collect pending add/remove events for registered hooks |
| `serialize(symbolToName, strip?, skip?, opts?)` | Serialize world to JSON-friendly object |
| `deserialize(data, nameToSymbol, opts?)` | Restore world from serialized data |

### `System`

Base class for decorator-based systems.

| | Description |
|---|---|
| `@OnAdded(...Comps)` | Decorator — method fires when entity gains **all** specified components |
| `@OnRemoved(...Comps)` | Decorator — method fires when **any** specified component is removed |
| `tick()` | Override — called every `run()` after hook callbacks |
| `forEach(types, callback, exclude?)` | Shorthand for `this.em.forEach(...)` |
| `run()` | Fire buffered hook callbacks, then `tick()` |
| `dispose()` | Unsubscribe all hooks |

### `createSystem(em, constructor)`

Functional alternative to class-based systems. The constructor receives a context with `onAdded`, `onRemoved`, and `forEach`, and optionally returns a tick function.

### `createSystems(em, entries)`

Creates a pipeline from an array of class-based (`System` subclasses) and/or functional system constructors. Returns a callable that runs all systems in order, with a `dispose()` method.

---

## Benchmarks

1M entities, Position += Velocity, 5 runs (median), Node.js:

| | archetype-ecs | [bitecs](https://github.com/NateTheGreatt/bitECS) | [wolf-ecs](https://github.com/EnderShadow8/wolf-ecs) | [harmony-ecs](https://github.com/3mcd/harmony-ecs) | [miniplex](https://github.com/hmans/miniplex) |
|---|---:|---:|---:|---:|---:|
| **Iteration** (ms/frame) | **1.7** | 2.2 | 2.2 | 1.8 | 32.5 |
| **Entity creation** (ms) | 401 | 366 | **106** | 248 | 265 |
| **Memory** (MB) | 86 | 204 | 60 | **31** | 166 |

Each library runs the same test — iterate 1M entities over 500 frames:

```ts
// archetype-ecs
em.forEach([Position, Velocity], (arch) => {
  const px = arch.field(Position.x)   // Float32Array, dense
  const py = arch.field(Position.y)
  const vx = arch.field(Velocity.vx)
  const vy = arch.field(Velocity.vy)
  for (let i = 0; i < arch.count; i++) {
    px[i] += vx[i]
    py[i] += vy[i]
  }
})
```

archetype-ecs is fastest at iteration. Harmony-ecs and wolf-ecs are close; miniplex is ~20x slower due to object-based storage.

Run them yourself:

```bash
npm run bench
```

---

## Feature comparison

Compared against other JS ECS libraries:

### Unique to archetype-ecs

| Feature | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|:---:|:---:|:---:|:---:|:---:|
| String SoA storage | ✓ | — | — | — | — |
| Mixed string + numeric components | ✓ | — | — | — | — |
| `forEach` with dense TypedArray field access | ✓ | — | — | — | — |
| Field descriptors for both per-entity and bulk access | ✓ | — | — | — | — |
| TC39 decorator system (`@OnAdded` / `@OnRemoved`) | ✓ | — | — | — | — |
| Built-in profiler | ✓ | — | — | — | — |

### Full comparison

| Feature | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|:---:|:---:|:---:|:---:|:---:|
| TypedArray iteration | ✓ | ✓ | ✓ | ✓ | — |
| String support | ✓ | ✓ | — | — | ✓ |
| Serialize / deserialize | ✓ | ✓✓ | — | — | — |
| TypeScript type inference | ✓ | — | ✓ | ✓ | ✓✓ |
| Batch entity creation | ✓ | — | — | ✓ | ✓ |
| Zero-alloc per-entity access | ✓ | ✓ | ✓ | ✓ | — |
| System framework (class + functional) | ✓ | — | — | — | — |
| Component lifecycle hooks | ✓ | — | — | — | ✓ |
| Relations / hierarchies | — | ✓ | — | — | — |
| React integration | — | — | — | — | ✓ |

✓✓ = notably stronger implementation in that library.

archetype-ecs is the only one that combines fast iteration, string storage, serialization, decorator-based systems, and type safety.

---

## License

MIT
