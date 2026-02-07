<p align="center">
  <br>
  <img src="https://em-content.zobj.net/source/apple/391/dna_1f9ec.png" width="80" />
  <br><br>
  <strong>archetype-ecs</strong>
  <br>
  <sub>Tiny, fast ECS with TypedArray storage. Zero dependencies.</sub>
  <br><br>
  <a href="https://www.npmjs.com/package/archetype-ecs"><img src="https://img.shields.io/npm/v/archetype-ecs.svg?style=flat-square&color=000" alt="npm" /></a>
  <img src="https://img.shields.io/badge/gzip-~5kb-000?style=flat-square" alt="size" />
  <a href="https://github.com/RvRooijen/archetype-ecs/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/archetype-ecs.svg?style=flat-square&color=000" alt="license" /></a>
</p>

---

Entities grouped by component composition. Numeric fields in contiguous TypedArrays, strings in SoA arrays. Bitmask query matching. Zero-allocation hot paths.

```
npm i archetype-ecs
```

---

### The full picture in 20 lines

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

Define components, spawn entities, iterate with raw TypedArrays — no allocations, no cache misses, full type safety.

---

### Why archetype-ecs?

<table>
<tr><td><strong>1.5x faster iteration</strong></td><td>SoA TypedArrays iterate faster than sparse arrays. Benchmarked at 2.1 ms/frame vs 3.1 ms for bitECS over 1M entities.</td></tr>
<tr><td><strong>2.4x less memory</strong></td><td>Packed archetypes use 86 MB for 1M entities vs 204 MB for sparse-array ECS.</td></tr>
<tr><td><strong>Zero-alloc hot path</strong></td><td><code>em.get</code>, <code>em.set</code>, and <code>forEach</code> never allocate. Your GC stays quiet.</td></tr>
<tr><td><strong>Type-safe</strong></td><td>Full TypeScript generics. Field names autocomplete. Wrong fields don't compile.</td></tr>
<tr><td><strong>Zero dependencies</strong></td><td>~5kb gzipped. No build step. Ships as ES modules.</td></tr>
</table>

---

### Components

```ts
import { createEntityManager, component } from 'archetype-ecs'

// Numeric — backed by TypedArrays for cache-friendly iteration
const Position = component('Position', 'f32', ['x', 'y'])
const Velocity = component('Velocity', 'f32', ['vx', 'vy'])
const Health   = component('Health', { hp: 'i32', maxHp: 'i32' })

// Strings — backed by SoA arrays, same field access API
const Name     = component('Name', 'string', ['name', 'title'])

// Mixed — numeric and string fields in one component
const Item     = component('Item', { name: 'string', weight: 'f32' })

// Tag — no data, just a marker
const Enemy    = component('Enemy')
```

> Field types: `f32` `f64` `i8` `i16` `i32` `u8` `u16` `u32` `string`

### Entities

```js
const em = createEntityManager()

// One at a time
const player = em.createEntity()
em.addComponent(player, Position, { x: 0, y: 0 })
em.addComponent(player, Velocity, { vx: 0, vy: 0 })
em.addComponent(player, Health, { hp: 100, maxHp: 100 })
em.addComponent(player, Name, { name: 'Hero', title: 'Sir' })

// Or all at once — no archetype migration overhead
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

```js
// Zero allocation — access any field directly
em.get(player, Position.x)         // 0
em.get(player, Name.name)          // 'Hero'
em.set(player, Velocity.vx, 5)

// Or grab the whole component as an object (allocates)
em.getComponent(player, Position)  // { x: 0, y: 0 }
em.getComponent(player, Name)      // { name: 'Hero', title: 'Sir' }
```

### Systems — `forEach` vs `query`

Two ways to work with entities in bulk. Pick the right one for the job:

#### `forEach` — zero-alloc bulk processing

Best for **systems that run every frame**. Gives you raw TypedArrays — no entity lookups, no object allocations, no cache misses.

```js
function movementSystem(dt) {
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

Best for **event-driven logic** where you need to store, pass around, or target specific entity IDs.

```js
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
| **Access** | Raw TypedArrays by field | `get` / `set` by entity ID |

### Serialize

```js
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

Strip components, skip entities, or plug in custom serializers — see the API section below.

---

## TypeScript

Every component carries its type. Field names autocomplete, wrong fields and shapes are compile errors.

```ts
// Schema is inferred — Position becomes ComponentDef<{ x: number; y: number }>
const Position = component('Position', 'f32', ['x', 'y'])

Position.x                // autocompletes to .x and .y
Position.z                // Property 'z' does not exist

em.get(id, Position.x)    // number | undefined
em.set(id, Position.z, 5) // Property 'z' does not exist

em.addComponent(id, Position, { x: 1, y: 2 })  // ok
em.addComponent(id, Position, { x: 1 })         // Property 'y' is missing

em.getComponent(id, Position)  // { x: number; y: number } | undefined
```

String fields are fully typed too:

```ts
const Name = component('Name', 'string', ['name', 'title'])

em.get(id, Name.name)    // string | undefined
em.set(id, Name.name, 'Hero')    // ok
em.set(id, Name.name, 42)        // number not assignable to string

em.addComponent(id, Name, { name: 'Hero', title: 'Sir' })  // ok
em.addComponent(id, Name, { foo: 'bar' })                   // type error
```

---

## API reference

### `component(name)`

Tag component — no data, used as a marker for queries.

### `component(name, type, fields)`

Schema component with uniform field type.

```js
const Position = component('Position', 'f32', ['x', 'y'])
const Name     = component('Name', 'string', ['name', 'title'])
```

### `component(name, schema)`

Schema component with mixed field types.

```js
const Item = component('Item', { name: 'string', weight: 'f32', armor: 'u8' })
```

### `createEntityManager()`

Returns an entity manager with the following methods:

| Method | Description |
|---|---|
| `createEntity()` | Create an empty entity |
| `createEntityWith(Comp, data, ...)` | Create entity with components — no migration cost |
| `destroyEntity(id)` | Remove entity and all its components |
| `addComponent(id, Comp, data)` | Add a component to an existing entity |
| `removeComponent(id, Comp)` | Remove a component |
| `hasComponent(id, Comp)` | Check if entity has a component |
| `getComponent(id, Comp)` | Get component data as object *(allocates)* |
| `get(id, Comp.field)` | Read a single field *(zero-alloc)* |
| `set(id, Comp.field, value)` | Write a single field *(zero-alloc)* |
| `query(include, exclude?)` | Get matching entity IDs |
| `count(include, exclude?)` | Count matching entities |
| `forEach(include, callback, exclude?)` | Iterate archetypes with raw TypedArray access |
| `serialize(symbolToName, strip?, skip?, opts?)` | Serialize world to JSON-friendly object |
| `deserialize(data, nameToSymbol, opts?)` | Restore world from serialized data |

---

## Benchmarks

1M entities, Position += Velocity, measured on Node.js:

```
Iteration (500 frames)
  archetype-ecs     2.1 ms/frame
  bitECS            3.1 ms/frame     → 1.5x slower

Entity creation (1M)
  createEntityWith  427 ms
  bitECS            394 ms           → comparable

Memory (1M entities)
  archetype-ecs     86 MB
  bitECS            204 MB           → 2.4x more
```

Run them yourself:

```bash
node bench/typed-vs-bitecs-1m.js
node --expose-gc bench/allocations-1m.js
```

---

## License

MIT
