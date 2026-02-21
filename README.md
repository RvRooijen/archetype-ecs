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

A TypeScript library for managing large numbers of game objects. Built around the Entity Component System pattern — designed to stay fast even with hundreds of thousands of entities.

```
npm i archetype-ecs
```

---

## What is ECS?

ECS is a way of organizing game code. Instead of one big `Player` class that mixes data and behaviour together, you separate them:

- **Entity** — a thing in your game. Just a number (an ID). A player, an enemy, a bullet.
- **Component** — data attached to an entity. A position, a health value, a name.
- **System** — logic that runs on all entities that have certain components.

So instead of a `Player` with a `move()` method, you have a `MovementSystem` that processes every entity that has both a `Position` and a `Velocity`. This makes it easy to share behaviour across entity types and very efficient to process lots of them.

---

## Ok, but why?

### vs object-oriented

In OOP you'd write a `Player` class with a `move()` method, an `Enemy` class with its own `move()`, and eventually a base class `Character` to share the logic — until a `Barrel` also needs to move, and the hierarchy falls apart.

ECS flips this around. There is no `Player` class. There's just an entity with a `Position` and a `Velocity`. The movement logic lives in one `MovementSystem` that runs on *every* entity that has those components, regardless of what "type" it is. Want a burning barrel? Add a `Burning` component. The fire system doesn't know or care that it's a barrel.

Behaviour comes from combining components, not from inheritance.

### vs functional

Functional programming says: transform data with pure functions, avoid mutation. ECS agrees on the separation of data and logic — systems are essentially functions that transform component data. But it doesn't pretend mutation doesn't exist. Instead it embraces in-place updates: all positions live in one `Float32Array`, and the movement system writes directly into it.

The result is code that reads like functional transforms but runs at the speed of raw array writes.

### the memory angle

In a class-based game loop, 10,000 enemies are 10,000 objects scattered across the heap. Iterating them means following 10,000 pointers to random memory locations — the CPU cache misses on almost every one.

In archetype-ecs, all positions are packed into one contiguous `Float32Array`. Iterating them is a straight walk through memory. The CPU can prefetch ahead and process multiple values per instruction. That's where the 7× speedup over plain JS comes from — not from a clever algorithm, but from how the data is laid out.

---

## Why this one?

- **SIMD acceleration** — `apply()` uses WebAssembly SIMD to process 4 entities per CPU instruction automatically. ~7× faster than a plain JS loop for numeric fields.
- **No allocations in hot paths** — `apply`, `forEach`, `get`, `set`, and `count` don't allocate. Your frame budget goes to game logic, not garbage collection.
- **TypeScript-first** — field names autocomplete, wrong fields are compile errors, `get()` returns the right type without casting.
- **Strings** — most ECS libraries only handle numbers. archetype-ecs stores strings in the same SoA layout with the same API.
- **Small** — ~5 KB gzip, no dependencies.

1M entities, `Position += Velocity`, Node.js:

| | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|---:|---:|---:|---:|---:|
| ms / frame | **0.29** | 1.6 | 1.4 | 1.1 | 28.9 |
| memory (MB) | 86+128 | 204 | 60 | **31** | 166 |

Full benchmark details in [ADVANCED.md](./ADVANCED.md#benchmarks).

---

## Quick start

```ts
import { createEntityManager, component, add } from 'archetype-ecs'

// Define components
const Position = component('Position', 'f32', ['x', 'y'])
const Velocity = component('Velocity', 'f32', ['vx', 'vy'])

const em = createEntityManager()

// Create entities
for (let i = 0; i < 10_000; i++) {
  em.createEntityWith(
    Position, { x: Math.random() * 800, y: Math.random() * 600 },
    Velocity, { vx: Math.random() - 0.5, vy: Math.random() - 0.5 },
  )
}

// Move all of them — one call, no loop
em.apply(Position.x, add(Position.x, Velocity.vx))
em.apply(Position.y, add(Position.y, Velocity.vy))
```

---

## Updating entities

### `apply` — bulk math, no loop needed

Updates every entity with matching components in one call. SIMD-accelerated on supported runtimes.

```ts
import { add, scale } from 'archetype-ecs'

em.apply(Position.x, add(Position.x, Velocity.vx))
em.apply(Position.y, add(Position.y, Velocity.vy))
em.apply(Velocity.vx, scale(Velocity.vx, 0.99))  // friction
```

You can restrict which entities are updated with an optional filter:

```ts
// only move allies — skip enemies
em.apply(Position.x, add(Position.x, Velocity.vx), { without: [Enemy] })
```

### `forEach` — per-entity logic

Use this when you need to make a decision per entity, or change what components an entity has.

```ts
// kill anything with no health left
em.forEach([Health], (id) => {
  if (em.get(id, Health.hp) <= 0) em.addComponent(id, Dead)
}, [Dead]) // skip entities that are already dead
```

The callback receives the entity ID. Use `em.get` and `em.set` to read and write.

### `count` — just count matches

```ts
const livingEnemies = em.count([Enemy], [Dead])
```

---

## Systems

For larger projects, organize your logic into systems. A system is a class with a `tick()` method that runs every frame, plus optional lifecycle hooks.

```ts
import { System, OnAdded, OnRemoved, createSystems, add, type EntityId } from 'archetype-ecs'

class MovementSystem extends System {
  tick() {
    this.em.apply(Position.x, add(Position.x, Velocity.vx))
    this.em.apply(Position.y, add(Position.y, Velocity.vy))
  }
}

class HealthSystem extends System {
  // fires once when an entity first gets a Health component
  @OnAdded(Health)
  onSpawn(id: EntityId) {
    console.log(`Entity ${id} spawned with ${this.em.get(id, Health.hp)} HP`)
  }

  tick() {
    this.forEach([Health], (id) => {
      if (this.em.get(id, Health.hp) <= 0) this.em.addComponent(id, Dead)
    }, [Dead])
  }
}

const em = createEntityManager()
const pipeline = createSystems(em, [MovementSystem, HealthSystem])

// game loop
function update() {
  pipeline()
  requestAnimationFrame(update)
}
update()
```

`@OnAdded` and `@OnRemoved` are deferred — they fire at the start of each `pipeline()` call, not immediately when the component changes.

---

## Further reading

- [Advanced docs](./ADVANCED.md) — full API reference, serialization, WASM SIMD details, TypeScript types, benchmarks
