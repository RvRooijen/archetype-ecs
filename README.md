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

Two reasons: **composability** and **performance**.

**Composability.** Want some enemies to be on fire? Add a `Burning` component. Now your fire system processes every burning entity — enemy, player, barrel — without any of them needing to know about each other. No inheritance hierarchies, no `instanceof` checks, no mixins.

**Performance.** In a class-based approach, 10,000 enemies are 10,000 objects scattered across memory. Iterating them means 10,000 cache misses. In archetype-ecs, all positions are stored in one contiguous `Float32Array`. Iterating them is one tight loop over a block of memory — the CPU prefetcher loves it.

---

## Why this one?

- **SIMD acceleration** — `apply()` uses WebAssembly SIMD to process 4 entities per CPU instruction automatically. ~7× faster than a plain JS loop for numeric fields.
- **No allocations in hot paths** — `apply`, `forEach`, `get`, `set`, and `count` don't allocate. Your frame budget goes to game logic, not garbage collection.
- **TypeScript-first** — field names autocomplete, wrong fields are compile errors, `get()` returns the right type without casting.
- **Strings** — most ECS libraries only handle numbers. archetype-ecs stores strings in the same SoA layout with the same API.
- **Small** — ~5 KB gzip, no dependencies.

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
