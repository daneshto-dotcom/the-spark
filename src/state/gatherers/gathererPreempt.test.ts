/**
 * SPARK — S161 OPEN-3 (owner, playing 2026-09-03): **the gatherer ignores the queue mid-walk.**
 *
 * > *"the gatherer is not collecting always what is in queue! when he leaves to gather, and there is
 * > none of the shapes in queue and then it appears and he is still on the way, then he should switch
 * > targets and go for it immedietly! ... also still about the gatherer it takes him time to aquire or
 * > change the target while it should be immediate"*
 *
 * ⚠ NO EXISTING TEST COULD HAVE SEEN THIS. Every gatherer fixture in the suite sets the board up
 * FIRST and then ticks, so the ordered shape is always already present when the unit picks. The bug
 * only exists in the window the owner described — a spark appearing AFTER the walk has begun — so the
 * fixtures here mutate the world mid-walk, which is the one thing none of the others do.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { asPlayerId, asSparkId, type SparkId } from '../../types.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import {
  GATHERER_PRICE,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../../constants.ts';
import { pickGathererTarget } from './gathererLifecycle.ts';
import type { Gatherer } from './gatherer.ts';

const P0 = asPlayerId(0);

function board(): World {
  const w = makeWorld(0x9a7);
  w.scoreByPlayer.set(P0, GATHERER_PRICE * 4);
  dispatch(w, { type: 'BUY_GATHERER', playerId: P0 });
  return w;
}

const theGatherer = (w: World): Gatherer => [...w.gatherers.values()][0]!;

/**
 * ⚠ EVERY SPARK MUST LAND INSIDE THE QUARRY. `isHarvestable` is not just "free and unescrowed" — it
 * also requires `distSq(pos, SPAWNER_CENTER) <= SPAWNER_RADIUS²`, and SPAWNER_RADIUS is 125 — so
 * every offset below stays well inside it. The first draft of this file put
 * its sparks beside the keep, so the picker correctly returned null and all four cases failed with
 * `expected null to be 1` — a fixture fault that reads exactly like a product fault.
 *
 * `dx` is an offset from the quarry centre: NEGATIVE is toward seat 0's keep (nearer the gatherer),
 * positive is away from it.
 */
function spawn(w: World, id: number, type: SparkType, dx: number, dy = 0): SparkId {
  const s = makeFreeSpark({
    id: asSparkId(id), type,
    pos: { x: SPAWNER_CENTER_X + dx, y: SPAWNER_CENTER_Y + dy },
    velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: w.tick,
  });
  dispatch(w, { type: 'SPAWN_SPARK', spark: s });
  return s.id;
}

/** One SEEKING tick for the only gatherer on the board. */
function tick(w: World): void {
  w.tick++;
  dispatch(w, { type: 'GATHERER_TICK', gathererId: theGatherer(w).id });
}

describe('OPEN-3 — a queued shape that appears MID-WALK is taken immediately', () => {
  it('⭐ switches to the ordered type the tick after it spawns', () => {
    const w = board();
    const g = theGatherer(w);
    // Nothing of the ordered type on the board yet: only a Dot, far away.
    const dot = spawn(w, 1, SparkType.Dot, 90);
    dispatch(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Square });

    tick(w);
    expect(g.targetSparkId, 'it sets off for the only thing available').toBe(dot);

    // …and now the ordered Square appears while it is still walking.
    const square = spawn(w, 2, SparkType.Square, -90);
    tick(w);

    expect(g.targetSparkId, 'it switches to the queued shape on the very next tick').toBe(square);
  });

  it('⛔ does NOT oscillate: once on the wanted type it stays, even if a nearer one appears', () => {
    /*
     * The guard the original `if` was protecting, and the reason this preempts on TYPE CLASS rather
     * than on distance. A unit that re-picked whenever something nearer appeared would ping-pong
     * between two shapes either side of it and deliver nothing.
     */
    const w = board();
    const g = theGatherer(w);
    dispatch(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Square });
    const far = spawn(w, 1, SparkType.Square, 90);
    tick(w);
    expect(g.targetSparkId).toBe(far);

    spawn(w, 2, SparkType.Square, -90); // a NEARER one of the same wanted type
    const before = g.targetSparkId;
    tick(w);
    expect(g.targetSparkId, 'still committed to its original wanted-type target').toBe(before);
  });

  it('with no order and no preference, it keeps its target — unchanged behaviour', () => {
    const w = board();
    const g = theGatherer(w);
    const dot = spawn(w, 1, SparkType.Dot, 90);
    tick(w);
    expect(g.targetSparkId).toBe(dot);
    spawn(w, 2, SparkType.Circle, -90);
    tick(w);
    expect(g.targetSparkId, 'no wanted type ⇒ no preemption ⇒ no thrash').toBe(dot);
  });

  it('a per-unit preferredType preempts too, not just the queue', () => {
    const w = board();
    const g = theGatherer(w);
    const dot = spawn(w, 1, SparkType.Dot, 90);
    dispatch(w, {
      type: 'SET_GATHERER_PREFERENCE', playerId: P0, gathererId: g.id, preferredType: SparkType.Triangle,
    });
    tick(w);
    expect(g.targetSparkId).toBe(dot);
    const tri = spawn(w, 2, SparkType.Triangle, -90);
    tick(w);
    expect(g.targetSparkId).toBe(tri);
  });

  it('CONTROL — the picker itself already preferred the wanted type; only the CALL was missing', () => {
    // Anti-vacuity for the whole file: if this were false the fix would be in the wrong function.
    const w = board();
    const g = theGatherer(w);
    spawn(w, 1, SparkType.Dot, -90); // nearest to the gatherer, WRONG type
    const square = spawn(w, 2, SparkType.Square, 90); // furthest, RIGHT type
    dispatch(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Square });
    expect(pickGathererTarget(w, g), 'preferred type wins at any distance').toBe(square);
  });
});
