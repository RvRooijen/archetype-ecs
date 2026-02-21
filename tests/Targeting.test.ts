import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityManager } from '../src/EntityManager.js';
import { createSystems, System } from '../src/System.js';
import { component } from '../src/index.js';

const Position = component('Position', 'f32', ['x', 'y'])
const Enemy    = component('Enemy')
const Ally     = component('Ally')
const Dead     = component('Dead')
const Target   = component('Target', { entityId: 'i32' })

class TargetingSystem extends System {
  private enemies: { id: number, x: number, y: number }[] = []
  private count = 0

  private collectEnemy(id: number): void {
    if (this.count >= this.enemies.length) {
      this.enemies.push({ id: 0, x: 0, y: 0 })
    }
    const e = this.enemies[this.count++]
    e.id = id
    e.x = this.em.get(id, Position.x)
    e.y = this.em.get(id, Position.y)
  }

  private findClosest(ax: number, ay: number): number {
    let closest = -1
    let minDist = Infinity
    for (const e of this.enemies) {
      const dx = e.x - ax
      const dy = e.y - ay
      const dist = dx * dx + dy * dy
      if (dist < minDist) {
        minDist = dist
        closest = e.id
      }
    }
    return closest
  }

  private assignTarget(id: number): void {
    const closest = this.findClosest(
      this.em.get(id, Position.x),
      this.em.get(id, Position.y),
    )
    if (closest !== -1) {
      this.em.addComponent(id, Target, { entityId: closest })
    }
  }

  tick(): void {
    this.count = 0
    this.forEach([Position, Enemy], this.collectEnemy.bind(this), [Dead])
    this.enemies.length = this.count

    this.forEach([Position, Ally], this.assignTarget.bind(this))
  }
}

describe('TargetingSystem', () => {
  it('ally targets the nearest live enemy', () => {
    const em = createEntityManager()
    const run = createSystems(em, [TargetingSystem])

    const near  = em.createEntityWith(Position, { x: 2, y: 0 }, Enemy, {})
    const far   = em.createEntityWith(Position, { x: 9, y: 0 }, Enemy, {})
    const ally  = em.createEntityWith(Position, { x: 0, y: 0 }, Ally,  {})

    run()

    assert.equal(em.get(ally, Target.entityId), near)
    run.dispose()
  })

  it('skips dead enemies', () => {
    const em = createEntityManager()
    const run = createSystems(em, [TargetingSystem])

    const dead  = em.createEntityWith(Position, { x: 1, y: 0 }, Enemy, {}, Dead, {})
    const alive = em.createEntityWith(Position, { x: 5, y: 0 }, Enemy, {})
    const ally  = em.createEntityWith(Position, { x: 0, y: 0 }, Ally,  {})

    run()

    assert.equal(em.get(ally, Target.entityId), alive)
    run.dispose()
  })

  it('each ally targets its own nearest enemy', () => {
    const em = createEntityManager()
    const run = createSystems(em, [TargetingSystem])

    const left  = em.createEntityWith(Position, { x: 1, y: 0 }, Enemy, {})
    const right = em.createEntityWith(Position, { x: 9, y: 0 }, Enemy, {})
    const a1    = em.createEntityWith(Position, { x: 0, y: 0 }, Ally,  {})
    const a2    = em.createEntityWith(Position, { x: 10, y: 0 }, Ally, {})

    run()

    assert.equal(em.get(a1, Target.entityId), left)
    assert.equal(em.get(a2, Target.entityId), right)
    run.dispose()
  })
})
