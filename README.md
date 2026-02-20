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

Create some entities and move them each frame:

```ts
import { createEntityManager, component } from 'archetype-ecs'

const Position = component('Position', 'f32', ['x', 'y'])

const em = createEntityManager()

for (let i = 0; i < 10_000; i++) {
  em.createEntityWith(Position, { x: Math.random() * 800, y: Math.random() * 600 })
}

em.forEach([Position], (arch) => {
  const px = arch.field(Position.x)
  const py = arch.field(Position.y)
  for (let i = 0; i < arch.count; i++) {
    px[i] += Math.random() - 0.5
    py[i] += Math.random() - 0.5
  }
})
```

---

### Why archetype-ecs?

<table>
<tr><td><strong>Fast iteration</strong></td><td>0.29 ms/frame over 1M entities with auto-detected <a href="#wasm-simd">WASM SIMD</a>. Faster than bitecs, wolf-ecs, harmony-ecs — see <a href="#benchmarks">benchmarks</a>.</td></tr>
<tr><td><strong>Low memory</strong></td><td>86 MB for 1M entities. Sparse-array ECS libraries use up to 2.4x more.</td></tr>
<tr><td><strong>No allocations</strong></td><td><code>apply</code>, <code>get</code>, <code>set</code>, and <code>forEach</code> don't allocate.</td></tr>
<tr><td><strong>Typed</strong></td><td>TypeScript generics throughout. Field names autocomplete, wrong fields don't compile.</td></tr>
<tr><td><strong>Systems</strong></td><td>Class-based systems with <code>@OnAdded</code> / <code>@OnRemoved</code> decorators for component lifecycle hooks.</td></tr>
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

### Iteration — `apply`, `forEach`, and `query`

Three ways to work with entities. Pick the right one for the job:

#### `apply` — bulk math, SIMD-accelerated

The primary way to update fields every frame. Required components are inferred from the expression — no query needed. Runs 4x faster than a manual JS loop when WASM SIMD is available.

```ts
import { add, sub, scale, random } from 'archetype-ecs'

em.apply(Position.x, add(Position.x, Velocity.vx))     // px += vx
em.apply(Position.y, add(Position.y, Velocity.vy))     // py += vy
em.apply(Velocity.vx, scale(Velocity.vx, 0.99))        // friction
em.apply(Position.x, add(Position.x, random(-1, 1)))   // px += random(-1, 1)
em.apply(Position.x, random(0, 800))                   // scatter to random positions
```

#### `forEach` — custom operations

For logic that can't be expressed as simple math. You get the backing TypedArrays directly.

```ts
em.forEach([Position, Velocity], (arch) => {
  const vy = arch.field(Velocity.vy)
  for (let i = 0; i < arch.count; i++)
    vy[i] = Math.max(vy[i] - 9.81 * dt, -50)   // gravity + terminal velocity
})
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

| | `apply` | `forEach` | `query` |
|---|---|---|---|
| **Use for** | Movement, physics, rendering | Custom per-entity logic | Damage events, UI, spawning |
| **Runs** | Every frame | Every frame | On demand |
| **Allocates** | Nothing | Nothing | `number[]` of entity IDs |
| **Access** | Declarative expressions | TypedArrays by field | `get` / `set` by entity ID |

### Systems

Class-based systems with decorators for component lifecycle hooks:

```ts
import { System, OnAdded, OnRemoved, createSystems, add, type EntityId } from 'archetype-ecs'

class MovementSystem extends System {
  tick() {
    this.em.apply(Position.x, add(Position.x, Velocity.vx))
    this.em.apply(Position.y, add(Position.y, Velocity.vy))
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

### WASM SIMD

`em.apply` runs SIMD-accelerated bulk math — no loops, no raw arrays. Available expressions:

```ts
add(a, b)              // a[i] + b[i]
sub(a, b)              // a[i] - b[i]
mul(a, b)              // a[i] * b[i]
scale(a, s)            // a[i] * s
random(min, max)       // fill with random values in [min, max]
add(a, random(min, max))  // a[i] + random value in [min, max]
```

`random()` uses a vectorized LCG (Linear Congruential Generator) in the WASM module — 4 random floats per SIMD instruction, fully independent of `Math.random()`. `b` in `add`/`sub`/`mul` can be either a field reference or a `random()` expression.

When WASM SIMD is available and the fields are `f32`, this runs 4x faster than a manual JS loop. Otherwise it falls back to scalar JS automatically. For operations that can't be expressed as simple math, use [`forEach`](#forEach--custom-operations).

#### When does SIMD kick in?

| Condition | Check | Fallback |
|---|---|---|
| Runtime supports WASM SIMD | Tested once at startup by compiling a 1475-byte SIMD module | All operations use scalar JS |
| WASM mode not disabled | `createEntityManager()` (default) or `{ wasm: true }` | `createEntityManager({ wasm: false })` forces JS-only |
| Field type is `f32` | `apply` checks if arrays are `Float32Array` | Scalar JS loop |

WASM SIMD is supported in all modern browsers (Chrome 91+, Firefox 89+, Safari 16.4+) and Node.js 16+.

```ts
import { isWasmSimdAvailable } from 'archetype-ecs'

isWasmSimdAvailable()                      // true if runtime supports SIMD
createEntityManager({ wasm: false })       // force JS-only mode
```

#### How SIMD acceleration works

Regular JavaScript processes one float at a time. When you write `px[i] += vx[i]` on a `Float32Array`, V8 converts each value from `f32` to `f64` and back — that's the only float precision JS supports natively.

WASM SIMD uses `f32x4.add`: a single CPU instruction that adds **4 floats in parallel**, directly in 32-bit precision. For 1M entities, that's 250K instructions instead of 1M, with no conversion overhead.

#### Storage layout

When WASM mode is active, all numeric TypedArrays (`Float32Array`, `Int32Array`, etc.) are allocated on a shared `WebAssembly.Memory` via a bump allocator. This means the SIMD kernel operates directly on the data — no copying between JS and WASM. String fields always use regular JS arrays.

- The arena reserves 128 MB virtual address space (lazily committed — no physical RAM cost on most OSes)
- The bump allocator doesn't reclaim memory — frequent archetype churn may waste space

---

## TypeScript

Component types are inferred from their definition. Field names autocomplete, wrong fields are compile errors.

```ts
// Schema is inferred — Position becomes ComponentDef<'x' | 'y'>
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

### `createEntityManager(options?)`

Returns an entity manager. WASM SIMD is auto-detected and enabled by default. Pass `{ wasm: false }` to force JS-only mode.

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
| `apply(target, expr)` | Set a field to an expression result — SIMD-accelerated for `f32` |
| `forEach(include, callback, exclude?)` | Iterate archetypes with TypedArray access |
| `onAdd(Comp, callback)` | Register callback for component additions *(deferred)* |
| `onRemove(Comp, callback)` | Register callback for component removals *(deferred)* |
| `flushHooks()` | Collect pending add/remove events for registered hooks |
| `serialize(symbolToName, strip?, skip?, opts?)` | Serialize world to JSON-friendly object |
| `deserialize(data, nameToSymbol, opts?)` | Restore world from serialized data |

The `forEach` callback receives an `ArchetypeView` with:

| Method | Description |
|---|---|
| `field(ref)` | Get the backing TypedArray for a field |
| `fieldStride(ref)` | Elements per entity (1 for scalars, N for arrays) |
| `snapshot(ref)` | Get the snapshot TypedArray (change tracking) |

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

### `createSystems(em, entries)`

Creates a pipeline from an array of `System` subclasses. Returns a callable that runs all systems in order, with a `dispose()` method.

---

## Benchmarks

1M entities, Position += Velocity, 5 runs (median), Node.js:

| | archetype-ecs | [bitecs](https://github.com/NateTheGreatt/bitECS) | [wolf-ecs](https://github.com/EnderShadow8/wolf-ecs) | [harmony-ecs](https://github.com/3mcd/harmony-ecs) | [miniplex](https://github.com/hmans/miniplex) |
|---|---:|---:|---:|---:|---:|
| **Iteration** — `apply()` (ms/frame) | **0.29** | 1.6 | 1.4 | 1.1 | 28.9 |
| **Iteration** — `field()` + loop (ms/frame) | 1.2 | — | — | — | — |
| **Entity creation** (ms) | 501 | 359 | **105** | 255 | 157 |
| **Memory** (MB) | 86+128 | 204 | 60 | **31** | 166 |

Each library iterates 1M entities over 500 frames (`Position += Velocity`):

```ts
// apply() — declarative, SIMD-accelerated
em.apply(Position.x, add(Position.x, Velocity.vx))
em.apply(Position.y, add(Position.y, Velocity.vy))

// forEach + field() — manual loop for custom operations
em.forEach([Position, Velocity], (arch) => {
  const vy = arch.field(Velocity.vy)
  for (let i = 0; i < arch.count; i++)
    vy[i] = Math.max(vy[i] - 9.81 * dt, -50)
})
```

Run them yourself:

```bash
npm run bench                                            # vs other ECS libraries
node --expose-gc bench/wasm-iteration-bench.js           # WASM SIMD benchmark
```

---

## Feature comparison

Compared against other JS ECS libraries:

### Unique to archetype-ecs

| Feature | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|:---:|:---:|:---:|:---:|:---:|
| WASM SIMD iteration (auto-detected) | ✓ | — | — | — | — |
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
| System framework (class-based) | ✓ | — | — | — | — |
| Component lifecycle hooks | ✓ | — | — | — | ✓ |
| Relations / hierarchies | — | ✓ | — | — | — |
| React integration | — | — | — | — | ✓ |

✓✓ = notably stronger implementation in that library.

archetype-ecs is the only one that combines fast iteration, string storage, serialization, decorator-based systems, and type safety.

---

## License

MIT
