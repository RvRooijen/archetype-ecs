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
import { createEntityManager, component, add, random } from 'archetype-ecs'

const Position = component('Position', 'f32', ['x', 'y'])

const em = createEntityManager()

for (let i = 0; i < 10_000; i++) {
  em.createEntityWith(Position, { x: Math.random() * 800, y: Math.random() * 600 })
}

// ~0.3 ms base + ~0.3 ms random per call / 1M entities
em.apply(Position.x, add(Position.x, random(-0.5, 0.5)))
em.apply(Position.y, add(Position.y, random(-0.5, 0.5)))
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

// true
em.hasComponent(player, Health)
em.removeComponent(player, Health)
em.destroyEntity(player)
```

### Read & write

```ts
// Access a single field (doesn't allocate)
// => 0
em.get(player, Position.x)
// => 'Hero'
em.get(player, Name.name)
em.set(player, Velocity.vx, 5)

// Or grab the whole component as an object (allocates)
// => { x: 0, y: 0 }
em.getComponent(player, Position)
// => { name: 'Hero', title: 'Sir' }
em.getComponent(player, Name)
```

### Iteration — `apply`, `forEach`, and `query`

Three ways to work with entities. Pick the right one for the job. All examples below use the same components:

```ts
const Position = component('Position', 'f32', ['x', 'y'])
const Velocity = component('Velocity', 'f32', ['vx', 'vy'])
const Health   = component('Health', { hp: 'i32' })
const Enemy    = component('Enemy')
const Dead     = component('Dead')
```

#### `apply` — bulk math, SIMD-accelerated

The primary way to update fields every frame. Required components are inferred from the expression. An optional `filter` restricts which archetypes are processed — archetype matching is cached, so the filter adds no per-frame overhead after the first call.

```ts
import { add, scale } from 'archetype-ecs'

// move allies only — skip enemies
// ~0.3 ms per call / 1M entities
em.apply(Position.x, add(Position.x, Velocity.vx), { without: [Enemy] })
em.apply(Position.y, add(Position.y, Velocity.vy), { without: [Enemy] })

// apply friction to everyone
em.apply(Velocity.vx, scale(Velocity.vx, 0.99))
em.apply(Velocity.vy, scale(Velocity.vy, 0.99))
```

#### `forEach` — per-entity iteration

For per-entity logic with conditional branches or structural changes.

```ts
// mark entities with no health as dead
em.forEach([Health], (id) => {
  if ((em.get(id, Health.hp) as number) <= 0) em.addComponent(id, Dead)
}, [Dead]) // skip already-dead entities
```

#### `query` — cross-entity lookups, excludes, counting

Returns a flat list of entity IDs. Use when you need to relate entities to each other, filter with excludes, or just count matches.

```ts
// find the closest live enemy to the player
// allocates number[] — ~21 ms / 1M entities
const enemies = em.query([Position, Enemy], [Dead])
let closest = -1, minDist = Infinity
for (const id of enemies) {
  const dx = em.get(id, Position.x) - playerX
  const dy = em.get(id, Position.y) - playerY
  const dist = dx * dx + dy * dy
  if (dist < minDist) { minDist = dist; closest = id }
}

// store the result as a component
em.addComponent(player, Target, { entityId: closest })

// just need a count? ~0.001 ms / 1M entities, no allocation
const aliveEnemies = em.count([Enemy], [Dead])
```

#### When to use which

| | `apply` | `forEach` | `query` |
|---|---|---|---|
| **Use for** | Bulk math, no branching | Conditionals, structural changes | Cross-entity lookups, excludes, counting |
| **Runs** | Every frame | Every frame | On demand |
| **Allocates** | Nothing | Nothing | `number[]` of entity IDs |
| **Access** | Declarative expressions | `get` / `set` per entity | `get` / `set` by entity ID |
| **Filtering** | `{ with?, without? }` optional filter | `exclude?` array | `exclude?` array |

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
// a[i] + b[i]
add(a, b)
// a[i] - b[i]
sub(a, b)
// a[i] * b[i]
mul(a, b)
// a[i] * s
scale(a, s)
// fill with random values in [min, max]
random(min, max)
// a[i] + random value in [min, max]
add(a, random(min, max))
```

`random()` uses a vectorized LCG (Linear Congruential Generator) in the WASM module — 4 random floats per SIMD instruction, fully independent of `Math.random()`. `b` in `add`/`sub`/`mul` can be either a field reference or a `random()` expression.

**1M `f32` entities — SIMD vs scalar JS fallback:**

| expression | SIMD (ms) | JS (ms) | speedup |
|---|---|---|---|
| `add(a, b)` | 0.30 | 2.05 | **7×** |
| `sub(a, b)` | 0.29 | 2.06 | **7×** |
| `mul(a, b)` | 0.30 | 2.05 | **7×** |
| `scale(a, s)` | 0.19 | 4.80 | **25×** |
| `random(min, max)` | 0.54 | 10.7 | **20×** |
| `add(a, random())` | 0.62 | 12.9 | **21×** |

When WASM SIMD is available and the fields are `f32`, operations automatically use the SIMD path. Otherwise they fall back to scalar JS. For operations that can't be expressed as simple math, use [`forEach`](#forEach--custom-operations).

#### When does SIMD kick in?

| Condition | Check | Fallback |
|---|---|---|
| Runtime supports WASM SIMD | Tested once at startup by compiling a 1475-byte SIMD module | All operations use scalar JS |
| WASM mode not disabled | `createEntityManager()` (default) or `{ wasm: true }` | `createEntityManager({ wasm: false })` forces JS-only |
| Field type is `f32` | `apply` checks if arrays are `Float32Array` | Scalar JS loop |

WASM SIMD is supported in all modern browsers (Chrome 91+, Firefox 89+, Safari 16.4+) and Node.js 16+.

```ts
import { isWasmSimdAvailable } from 'archetype-ecs'

// true if runtime supports SIMD
isWasmSimdAvailable()
// force JS-only mode
createEntityManager({ wasm: false })
```

#### How SIMD acceleration works

Regular JavaScript processes one float at a time. When you write `px[i] += vx[i]` on a `Float32Array`, V8 converts each value from `f32` to `f64` and back — that's the only float precision JS supports natively.

WASM SIMD uses `f32x4.add`: a single CPU instruction that adds **4 floats in parallel**, directly in 32-bit precision. For 1M entities, that's 250K instructions instead of 1M, with no conversion overhead.

#### Storage layout

When WASM mode is active, all numeric TypedArrays (`Float32Array`, `Int32Array`, etc.) are allocated on a shared `WebAssembly.Memory` via a bump allocator. This means the SIMD kernel operates directly on the data — no copying between JS and WASM. String fields always use regular JS arrays.

- The arena reserves 128 MB virtual address space (lazily committed — no physical RAM cost on most OSes)
- Freed slots from archetype growth are reused via a size-bucketed free list — total arena usage stays bounded at ~2× peak live size

---

## TypeScript

Component types are inferred from their definition. Field names autocomplete, wrong fields are compile errors.

```ts
// Schema is inferred — Position becomes ComponentDef<'x' | 'y'>
const Position = component('Position', 'f32', ['x', 'y'])

// FieldRef — autocompletes to .x and .y
Position.x
// compile error: Property 'z' does not exist
Position.z

// zero-alloc field access
em.get(id, Position.x)
// zero-alloc field write
em.set(id, Position.x, 5)
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
| `apply(target, expr, filter?)` | Set a field to an expression result — SIMD-accelerated for `f32`. Optional `{ with?, without? }` restricts which archetypes are processed. |
| `forEach(include, callback, exclude?)` | Iterate matching entities — callback receives `EntityId` |
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

### `createSystems(em, entries)`

Creates a pipeline from an array of `System` subclasses. Returns a callable that runs all systems in order, with a `dispose()` method.

---

## Benchmarks

1M entities, Position += Velocity, 5 runs (median), Node.js:

| | archetype-ecs | [bitecs](https://github.com/NateTheGreatt/bitECS) | [wolf-ecs](https://github.com/EnderShadow8/wolf-ecs) | [harmony-ecs](https://github.com/3mcd/harmony-ecs) | [miniplex](https://github.com/hmans/miniplex) |
|---|---:|---:|---:|---:|---:|
| **Iteration** — `apply()` (ms/frame) | **0.29** | 1.6 | 1.4 | 1.1 | 28.9 |
| **Entity creation** (ms) | 501 | 359 | **105** | 255 | 157 |
| **Memory** (MB) | 86+128 | 204 | 60 | **31** | 166 |

Each library iterates 1M entities over 500 frames (`Position += Velocity`):

```ts
// apply() — declarative, SIMD-accelerated
em.apply(Position.x, add(Position.x, Velocity.vx))
em.apply(Position.y, add(Position.y, Velocity.vy))

// forEach — per-entity logic with conditional branches
em.forEach([Position, Velocity], (id) => {
  const vy = em.get(id, Velocity.vy) as number
  em.set(id, Velocity.vy, Math.max(vy - 9.81 * dt, -50))
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
