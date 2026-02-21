# Advanced docs

← [Back to README](./README.md)

---

## API reference

### `component(name)`

Tag component — no data, used as a marker for filtering.

### `component(name, type, fields)`

Schema component with a uniform field type.

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
| `count(include, exclude?)` | Count matching entities |
| `apply(target, expr, filter?)` | Set a field to an expression result — SIMD-accelerated for `f32`. Optional `{ with?, without? }` filter. |
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

## TypeScript

Field types flow from the component definition through to `get` — no casts needed.

```ts
const Position = component('Position', 'f32', ['x', 'y'])
const Name     = component('Name', { name: 'string', title: 'string' })

// autocompletes to .x and .y — compile error for .z
Position.x

// return type is inferred from the field
const x: number = em.get(id, Position.x)
const n: string = em.get(id, Name.name)
```

---

## Serialize

```ts
const symbolToName = new Map([
  [Position._sym, 'Position'],
  [Velocity._sym, 'Velocity'],
  [Health._sym,   'Health'],
])

const snapshot = em.serialize(symbolToName)
const json = JSON.stringify(snapshot)

// Later...
em.deserialize(JSON.parse(json), { Position, Velocity, Health })
```

Supports stripping components, skipping entities, and custom serializers.

---

## WASM SIMD

`em.apply` runs SIMD-accelerated bulk math — no loops, no raw arrays. Available expressions:

```ts
add(a, b)           // a[i] + b[i]
sub(a, b)           // a[i] - b[i]
mul(a, b)           // a[i] * b[i]
scale(a, s)         // a[i] * s
random(min, max)    // fill with random values in [min, max]
add(a, random(...)) // a[i] + random value
```

`random()` uses a vectorized LCG in the WASM module — 4 random floats per SIMD instruction, fully independent of `Math.random()`.

**1M `f32` entities — SIMD vs scalar JS:**

| expression | SIMD (ms) | JS (ms) | speedup |
|---|---|---|---|
| `add(a, b)` | 0.30 | 2.05 | **7×** |
| `sub(a, b)` | 0.29 | 2.06 | **7×** |
| `mul(a, b)` | 0.30 | 2.05 | **7×** |
| `scale(a, s)` | 0.19 | 4.80 | **25×** |
| `random(min, max)` | 0.54 | 10.7 | **20×** |
| `add(a, random())` | 0.62 | 12.9 | **21×** |

#### When does SIMD kick in?

| Condition | Fallback |
|---|---|
| Runtime supports WASM SIMD | Scalar JS for all operations |
| WASM mode not disabled (`createEntityManager({ wasm: false })`) | Scalar JS for all operations |
| Field type is `f32` | Scalar JS loop |

WASM SIMD is supported in all modern browsers (Chrome 91+, Firefox 89+, Safari 16.4+) and Node.js 16+.

```ts
import { isWasmSimdAvailable } from 'archetype-ecs'

isWasmSimdAvailable()              // true if runtime supports SIMD
createEntityManager({ wasm: false }) // force JS-only mode
```

#### How it works

Regular JavaScript processes one float at a time. When you write `px[i] += vx[i]` on a `Float32Array`, V8 converts each value from `f32` to `f64` and back — the only float precision JS supports natively.

WASM SIMD uses `f32x4.add`: one CPU instruction that adds 4 floats in parallel, directly in 32-bit precision. For 1M entities, that's 250K instructions instead of 1M, with no conversion overhead.

#### Storage layout

When WASM mode is active, all numeric TypedArrays are allocated on a shared `WebAssembly.Memory` via a bump allocator. The SIMD kernel operates directly on the data — no copying between JS and WASM. String fields always use regular JS arrays.

- The arena reserves 128 MB virtual address space (lazily committed)
- Freed slots from archetype growth are reused via a size-bucketed free list — total arena usage stays bounded at ~2× peak live size

---

## Benchmarks

1M entities, Position += Velocity, 5 runs (median), Node.js:

| | archetype-ecs | [bitecs](https://github.com/NateTheGreatt/bitECS) | [wolf-ecs](https://github.com/EnderShadow8/wolf-ecs) | [harmony-ecs](https://github.com/3mcd/harmony-ecs) | [miniplex](https://github.com/hmans/miniplex) |
|---|---:|---:|---:|---:|---:|
| **Iteration** — `apply()` (ms/frame) | **0.29** | 1.6 | 1.4 | 1.1 | 28.9 |
| **Entity creation** (ms) | 501 | 359 | **105** | 255 | 157 |
| **Memory** (MB) | 86+128 | 204 | 60 | **31** | 166 |

```bash
npm run bench                                   # vs other ECS libraries
node --expose-gc bench/wasm-iteration-bench.js  # WASM SIMD benchmark
```

---

## Feature comparison

| Feature | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|:---:|:---:|:---:|:---:|:---:|
| WASM SIMD iteration (auto-detected) | ✓ | — | — | — | — |
| TypedArray iteration | ✓ | ✓ | ✓ | ✓ | — |
| String SoA storage | ✓ | — | — | — | — |
| Mixed string + numeric components | ✓ | — | — | — | — |
| Serialize / deserialize | ✓ | ✓✓ | — | — | — |
| TypeScript type inference | ✓ | — | ✓ | ✓ | ✓✓ |
| Batch entity creation | ✓ | — | — | ✓ | ✓ |
| Zero-alloc per-entity access | ✓ | ✓ | ✓ | ✓ | — |
| System framework (class-based) | ✓ | — | — | — | — |
| Component lifecycle hooks | ✓ | — | — | — | ✓ |
| Relations / hierarchies | — | ✓ | — | — | — |
| React integration | — | — | — | — | ✓ |

✓✓ = notably stronger implementation in that library.
