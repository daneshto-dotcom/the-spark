/**
 * SPARK — S145 P1: THE FULL-BANK DEADLOCK.
 *
 * ⚠ WHAT THESE TESTS ARE FOR, stated plainly so nobody "simplifies" the third one away.
 *
 * The bug was not a crash and not a tuning miss. Measured in two independent 4-minute solo runs in a
 * real browser with real physics and NO seeding: the castle bank fills to `CASTLE_BANK_CAP` in ~46 s
 * and its composition then FREEZES for the rest of the match — 11,449 further ticks with an identical
 * multiset, every build tile reading "NEED n MORE" forever, and ZERO towers ever built. No errors.
 *
 * The loop was closed. `pickGathererTarget` runs only in SEEKING, so a unit parked in WAITING held
 * cargo it had chosen BEFORE the player ordered anything; WAITING's only exit was a successful
 * deposit; that needed a free slot; a slot freed only by building; building needed a satisfied bill;
 * which needed a composition change; which needed a delivery. The order queue was therefore
 * MEASURABLY INERT — ordering the missing type twice through the real UI left the composition
 * unchanged 60 s later with both orders still queued.
 *
 * `shouldReleaseWaitingCargo` breaks it, and every one of its three conditions is load-bearing.
 * The spin-loop test is the one GROK-ANALYST's Council rejection predicted.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import {
  CASTLE_BANK_CAP, CASTLE_PORCH_SLOTS, PLAYER_COLORS,
  SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SparkType,
} from '../../constants.ts';
import { asGathererId, asPlayerId, asSparkId } from '../../types.ts';
import { makeFreeSpark, type Spark } from '../../game/spark.ts';
import { castleAnchor, makeGatherer, type Gatherer } from './gatherer.ts';
import {
  applyEnqueueGathererOrder, applyGathererTick, shouldReleaseWaitingCargo,
} from './gathererLifecycle.ts';
import { bankPush, isOwnPorchSpark, porchSlot } from '../castleBank.ts';

const P0 = asPlayerId(0);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

let nextSpark = 900;
function mkSpark(type: SparkType, at: { x: number; y: number }): Spark {
  return makeFreeSpark({
    id: asSparkId(nextSpark++), type,
    pos: { x: at.x, y: at.y }, velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  });
}

/** A harvestable spark INSIDE the quarry disc — `isHarvestable` requires that. */
function addQuarrySpark(w: World, type: SparkType, dx = 0): Spark {
  const s = mkSpark(type, { x: SPAWNER_CENTER_X + dx, y: SPAWNER_CENTER_Y });
  w.freeSparks.set(s.id, s);
  return s;
}

/** Fill the seat's bank to cap with a type the recipes will not want. */
function fillBank(w: World, type = SparkType.Spiral): void {
  for (let i = 0; i < CASTLE_BANK_CAP; i++) {
    bankPush(w.castleBanks, P0, mkSpark(type, { x: 0, y: 0 }));
  }
}

/** A gatherer parked at its keep, WAITING, holding `cargoType`. */
function waitingWithCargo(w: World, cargoType: SparkType): { g: Gatherer; cargo: Spark } {
  const home = castleAnchor(0);
  const g = makeGatherer({
    id: asGathererId(w.nextGathererId++), ownerPlayerId: P0,
    pos: { x: home.x, y: home.y }, spawnedAtTick: 0,
  });
  const cargo = mkSpark(cargoType, { x: home.x, y: home.y });
  cargo.escrow = 'hauled';
  w.freeSparks.set(cargo.id, cargo);
  g.carriedSparkId = cargo.id;
  g.state = 'WAITING';
  w.gatherers.set(g.id, g);
  return { g, cargo };
}

const enqueue = (w: World, t: SparkType): void => {
  applyEnqueueGathererOrder(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: t });
};

describe('S145 P1 — a WAITING gatherer may put down cargo the player no longer wants', () => {
  it('condition 1: an EMPTY order queue never releases — an idle player keeps banking', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    addQuarrySpark(w, SparkType.Circle);
    expect(shouldReleaseWaitingCargo(w, g, cargo)).toBe(false);
  });

  it('condition 2: cargo that DOES satisfy a queued order is kept', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Circle);
    enqueue(w, SparkType.Circle);
    addQuarrySpark(w, SparkType.Circle);
    expect(shouldReleaseWaitingCargo(w, g, cargo)).toBe(false);
  });

  it('⭐ condition 3: no ordered-type spark is harvestable ⇒ NO release (the spin-loop)', () => {
    // GROK-ANALYST's Council rejection: drop-and-reseek can cycle — the unit puts the shape down,
    // finds nothing better, picks the same shape back up, forever. Requiring that there is strictly
    // better work to go and do makes the cycle unreachable rather than merely unlikely.
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    enqueue(w, SparkType.Circle);
    // Quarry holds only Squares — nothing of the ordered type to go and fetch.
    addQuarrySpark(w, SparkType.Square);
    expect(shouldReleaseWaitingCargo(w, g, cargo)).toBe(false);
  });

  it('all three conditions met ⇒ release', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    enqueue(w, SparkType.Circle);
    addQuarrySpark(w, SparkType.Circle);
    expect(shouldReleaseWaitingCargo(w, g, cargo)).toBe(true);
  });

  it('⭐ the release PARKS the shape on the porch and frees the unit — nothing is destroyed', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    enqueue(w, SparkType.Circle);
    addQuarrySpark(w, SparkType.Circle);

    applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });

    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
    // The SAME spark is still in the world, keeping its id — the owner's V6-1.3 ruling is that a
    // full bank stalls haulers rather than leaking the player's work.
    const still = w.freeSparks.get(cargo.id);
    expect(still).toBeDefined();
    expect(isOwnPorchSpark(0, still!.pos)).toBe(true);
    // 'banked' is what stops enforceSpawnerBounds rim-snapping it back to the quarry every substep.
    expect(still!.escrow).toBe('banked');
    expect(still!.state.kind).toBe('Free');
    // Verlet pair reset, so it appears at rest instead of inheriting the carry motion.
    expect(still!.prevPos).toEqual(still!.pos);
  });

  it('a parked shape is NOT re-harvestable, so the unit cannot pick it straight back up', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    enqueue(w, SparkType.Circle);
    const wanted = addQuarrySpark(w, SparkType.Circle);
    applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });
    // Now SEEKING: it must target the ORDERED circle in the quarry, never the shape it just parked.
    applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });
    expect(g.targetSparkId).toBe(wanted.id);
    expect(g.targetSparkId).not.toBe(cargo.id);
  });

  it('a FULL porch refuses the park and the unit keeps holding — a refusal loses nothing', () => {
    const w = setup();
    fillBank(w);
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral);
    enqueue(w, SparkType.Circle);
    addQuarrySpark(w, SparkType.Circle);
    // Occupy every porch slot with foreign shapes.
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
      const at = porchSlot(0, i);
      const s = mkSpark(SparkType.Square, at);
      s.escrow = 'banked';
      w.freeSparks.set(s.id, s);
    }
    applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });
    expect(g.state).toBe('WAITING');
    expect(g.carriedSparkId).toBe(cargo.id);
    expect(w.freeSparks.get(cargo.id)?.escrow).toBe('hauled');
  });

  it('deposit still WINS over release when a slot is available', () => {
    // The release must never pre-empt the ordinary happy path.
    const w = setup();
    const { g, cargo } = waitingWithCargo(w, SparkType.Spiral); // bank deliberately EMPTY
    enqueue(w, SparkType.Circle);
    addQuarrySpark(w, SparkType.Circle);
    applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });
    expect(g.state).toBe('SEEKING');
    expect(w.castleBanks.get(P0)?.map((s) => s.id)).toContain(cargo.id);
    expect(w.freeSparks.has(cargo.id)).toBe(false); // banked ⇒ out of the world
  });
});
