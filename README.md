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

## Why ECS?

In OOP, a `Player` has a `move()` method, an `Enemy` has its own `move()`, and sooner or later you're wrestling with inheritance just to share logic. In ECS there are no types — just entities (IDs) with components (data) attached. A `MovementSystem` runs on every entity that has a `Position` and `Velocity`, whether it's a player, enemy, or barrel. Behaviour comes from combining components, not from hierarchies.

```
           Position  Velocity  Health  Enemy  Dead
  id 1        ●         ●        ●                   (player)
  id 2        ●         ●                 ●           (enemy)
  id 3        ●                  ●        ●     ●    (dead enemy)

  MovementSystem  needs: Position + Velocity  →  runs on id 1, id 2
  HealthSystem    needs: Health, skip: Dead   →  runs on id 1
```

This also means the data layout can be optimised independently of the logic. In a class-based loop, 10,000 enemies are 10,000 heap objects scattered across memory. Reading their positions means following 10,000 pointers to random locations — a cache miss on almost every one. In archetype-ecs each field lives in its own packed array. Iterating positions is one straight walk the CPU can prefetch and process 4 at a time with SIMD.

```
OOP — objects scattered across the heap

  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
  │ x:  10       │       │ x:  55       │       │ x:  22       │
  │ y:   4       │       │ y:   9       │       │ y:   7       │
  │ hp:  80      │       │ hp:  50      │       │ hp: 100      │
  └──────────────┘       └──────────────┘       └──────────────┘
   addr 0x1a4c            addr 0x8f20   ↑        addr 0x3b91   ↑
                                   cache miss              cache miss

ECS — each field in a contiguous typed array

  Position.x │ 10 │ 55 │ 22 │ 78 │ 31 │ ...    (Float32Array)
  Position.y │  4 │  9 │  7 │ 31 │ 12 │ ...    (Float32Array)
  Health.hp  │ 80 │ 50 │100 │ 60 │ 75 │ ...    (Int32Array)
             └─────────────────────────────
               sequential read, prefetched, SIMD-ready
```

**Why this library specifically** — SIMD-accelerated bulk updates (~7× over plain JS), zero allocations in hot paths, TypeScript types that flow from definition to `get()` without casting, string component support, ~5 KB gzip.

1M entities, `Position += Velocity`, Node.js:

| | archetype-ecs | bitecs | wolf-ecs | harmony-ecs | miniplex |
|---|---:|---:|---:|---:|---:|
| ms / frame | **0.29** | 1.6 | 1.4 | 1.1 | 28.9 |
| memory (MB) | 86+128 | 204 | 60 | **31** | 166 |

→ [Full benchmarks](./ADVANCED.md#benchmarks)

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
