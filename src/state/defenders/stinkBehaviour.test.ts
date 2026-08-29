/**
 * SPARK — S157 B9: THE STINK TOWER FINALLY DOES SOMETHING VISIBLE.
 *
 * Owner: *"Stink tower should visibly shoot out all 5 stink bags (that then damage over time an area
 * of effect for a certain amount of time i have defined before). its not very clear what the stink
 * tower does right now. he should not target any enemies but shoot our at random areas in a radius.
 * the bags (and tower) should be visibly stinking up a radius until destroyed."*
 *
 * ## Four gaps were found; three are fixed here
 *
 *   1. ⭐ THE AURA ONLY EXISTED ONCE THE MAGAZINE WAS EMPTY. `stinkAuraTick` opened with
 *      `if (!stinkIsDepleted(d)) return false;` — the exact inverse of *"until destroyed"*. For the
 *      first stretch of its life the tower had no smell at all.
 *   2. ⭐ IT AIMED. It shared the turret's acquire-or-idle rule, so with no enemy creature inside
 *      260 px it threw NOTHING and just reset its timer. A tower nobody walked past threw zero bags
 *      all match — a better explanation of *"not very clear"* than the cadence ever was.
 *   3. The magazine took 40 s against a 45 s FIGHT. Now 20 s.
 *   4. ⛔ NOT DONE: the landed bag is still an instantaneous splash, not a lingering entity with its
 *      own damage-over-time. That needs a new serialized entity family and is called out in the
 *      handoff rather than half-built here.
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  STINK_THROW_INTERVAL_TICKS,
  STINK_TOWER_ATTACK_RANGE,
  STINK_TOWER_BAGS,
} from '../../constants.ts';
import { stinkLobTarget } from './stinkTower.ts';
import { makeDefender } from './defender.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';

const P0 = asPlayerId(0);

function tower(id = 1) {
  return makeDefender({
    id: asDefenderId(id),
    kind: 'stinkTower',
    ownerPlayerId: P0,
    anchorPrimitiveId: asPrimitiveId(1),
    recipeId: 'stinkTower',
    pos: { x: 700, y: 300 },
    registeredAtTick: 0,
  });
}

describe('S157 B9 — the lob is untargeted, scattered and DETERMINISTIC', () => {
  it('⭐ lands inside the tower radius, never outside it', () => {
    const d = tower();
    for (let tick = 0; tick < 400; tick++) {
      const p = stinkLobTarget(d, tick);
      const dist = Math.hypot(p.x - d.pos.x, p.y - d.pos.y);
      expect(dist).toBeLessThanOrEqual(STINK_TOWER_ATTACK_RANGE + 1e-6);
    }
  });

  it('⭐ SCATTERS — successive throws do not stack on one spot', () => {
    const d = tower();
    const seen = new Set<string>();
    for (let tick = 0; tick < 50; tick++) {
      const p = stinkLobTarget(d, tick);
      seen.add(`${Math.round(p.x)},${Math.round(p.y)}`);
    }
    expect(seen.size, 'the bags spread across the area rather than piling up').toBeGreaterThan(40);
  });

  it('two towers scatter differently from each other on the same tick', () => {
    const a = stinkLobTarget(tower(1), 100);
    const b = stinkLobTarget(tower(2), 100);
    expect(`${a.x},${a.y}`).not.toBe(`${b.x},${b.y}`);
  });

  it('⛔ PURE — same tower, same tick, same point (no rng, no clock)', () => {
    // The FSM is re-run independently by the ?worker=1 mirror. A real random draw here would land
    // the bag somewhere else on the worker, which is a desync; a seeded draw would shift the stream
    // order for everything downstream. This is the mix32/pseudoRand stateless idiom.
    const d = tower();
    for (let i = 0; i < 10; i++) expect(stinkLobTarget(d, 77)).toEqual(stinkLobTarget(d, 77));
  });

  it('the scatter is UNIFORM over the disc, not clustered at the centre', () => {
    // sqrt on the radius is what does this; without it half the bags land in the inner quarter.
    const d = tower();
    let inner = 0;
    const N = 600;
    for (let tick = 0; tick < N; tick++) {
      const p = stinkLobTarget(d, tick);
      if (Math.hypot(p.x - d.pos.x, p.y - d.pos.y) < STINK_TOWER_ATTACK_RANGE / 2) inner++;
    }
    // A uniform disc puts ~25% inside half the radius. Clustered sampling would be ~50%.
    expect(inner / N).toBeGreaterThan(0.15);
    expect(inner / N).toBeLessThan(0.35);
  });
});

describe('S157 B9 — the magazine empties inside a fight', () => {
  it('⭐ all five bags land within one FIGHT phase', () => {
    const total = STINK_THROW_INTERVAL_TICKS * STINK_TOWER_BAGS;
    expect(
      total,
      `${STINK_TOWER_BAGS} bags at ${STINK_THROW_INTERVAL_TICKS} ticks = ${total}, vs a ${FIGHT_PHASE_TICKS}-tick fight`,
    ).toBeLessThan(FIGHT_PHASE_TICKS);
  });
});
