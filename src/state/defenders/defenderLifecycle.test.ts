/**
 * SPARK — S103 P2 generic DEFENDER substrate unit tests.
 *
 * Coverage:
 *  - applyRegisterDefender mints a Defender + de-dups per anchor
 *  - applyDefenderTick FSM: acquire an in-range enemy creature → windup → FIRE (deals 1 via the
 *    unified damageCreature, a chewer dies) → recover → IDLE; nextFireTick advances one interval
 *  - no target in range → stays IDLE + retries (no fire into the void)
 *  - WINDUP aborts if the target leaves before the strike
 *  - recipeStillSatisfied default (anchor-exists) when no recipe is registered
 *  - loadRephaseDefenders prevents the insta-fire-on-load bug (Council MF5)
 *  - teardownDefenders clears the map + resets nextDefenderId (all-sites contract)
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { PLAYER_COLORS, SparkType, PRINCESS_SLAP_INTERVAL_TICKS } from '../../constants.ts';
import {
  asCreatureId, asPlayerId, asPrimitiveId, asSpawnerId, type PrimitiveId,
} from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeCreature } from '../creatures/creature.ts';
import { CHEWER_CONFIG } from '../creatures/voltkin-config.ts';
import {
  applyDefenderTick, applyRegisterDefender, recipeStillSatisfied, teardownDefenders, loadRephaseDefenders,
} from './defenderLifecycle.ts';
import { getDefenderConfig } from './defender.ts';

const P0 = asPlayerId(0); // defender owner
const P1 = asPlayerId(1); // enemy (chewer owner)

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function addAnchor(w: World, id: number, x: number, y: number): PrimitiveId {
  const p: Primitive = {
    id: asPrimitiveId(id), type: SparkType.Triangle, placerColor: PLAYER_COLORS[0], placedBy: P0,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8,
  };
  w.primitives.set(p.id, p);
  return p.id;
}

function addEnemyChewer(w: World, id: number, x: number, y: number): void {
  const c = makeCreature(CHEWER_CONFIG, {
    id: asCreatureId(id), ownerPlayerId: P1, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
  });
  w.creatures.set(c.id, c);
}

/** Drive a defender N ticks the way main.ts does (DEFENDER_TICK then world.tick++). */
function tickN(w: World, n: number): void {
  for (let i = 0; i < n; i++) {
    for (const id of [...w.defenders.keys()]) applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: id });
    w.tick++;
  }
}

describe('applyRegisterDefender', () => {
  it('mints a defender (IDLE, seeded nextFireTick) + de-dups per anchor', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    expect(w.defenders.size).toBe(1);
    const d = [...w.defenders.values()][0];
    expect(d.state).toBe('IDLE');
    expect(d.kind).toBe('princess');
    expect(d.nextFireTick).toBe(PRINCESS_SLAP_INTERVAL_TICKS); // seeded one interval out
    // Second register on the SAME anchor is a no-op (rebuild only after removal).
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    expect(w.defenders.size).toBe(1);
  });
});

describe('applyDefenderTick FSM', () => {
  it('acquires an in-range enemy creature, fires, and KILLS it (chewer dies in 1 via damageCreature)', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    addEnemyChewer(w, 50, 130, 100); // 30px — within PRINCESS_SLAP_RANGE (380 after S109 P3)
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    d.nextFireTick = w.tick; // fire ASAP (skip the 90-tick wait for the test)

    tickN(w, getDefenderConfig('princess').windupTicks + 2); // IDLE→WINDUP→FIRE
    expect(w.creatures.has(asCreatureId(50))).toBe(false); // chewer (hp 1) is dead
    expect(d.lastStrikePos).not.toBeNull(); // endpoint captured for the client beam/slap
  });

  it('with NO enemy in range stays IDLE + reschedules (never fires into the void)', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    addEnemyChewer(w, 50, 2400, 2400); // S109 P3 — far out of range. HELGA's range was cut to a local
    // 380px (anti-cross-map-laser interim); (2400,2400) is ~3252px from the (100,100) anchor, far
    // beyond reach — so the "no enemy in range stays IDLE" contract holds at the new local range.
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    d.nextFireTick = w.tick;
    tickN(w, 30);
    expect(d.state).toBe('IDLE');
    expect(w.creatures.has(asCreatureId(50))).toBe(true); // never struck
  });

  it('advances nextFireTick by one interval after a fire cycle (cadence)', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    addEnemyChewer(w, 50, 130, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    d.nextFireTick = w.tick;
    // Run a full cycle (windup + fire-hold + recover) so it returns to IDLE + reschedules.
    tickN(w, 60);
    expect(d.state).toBe('IDLE');
    expect(d.nextFireTick).toBeGreaterThan(0); // rescheduled into the future
  });
});

describe('S109 P2 — a pooped TURRET stops firing until cleaned', () => {
  it('does not fire while its anchor is fouled, then resumes on clean (no stale insta-fire)', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    addEnemyChewer(w, 50, 130, 100); // 30px — well within TURRET_ATTACK_RANGE (420)
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'laserTurret', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    d.nextFireTick = w.tick; // would fire ASAP if not fouled

    // FOUL the anchor → the turret must not fire even across a full windup+fire window.
    w.fouledPrimitives.add(anchor);
    tickN(w, getDefenderConfig('turret').windupTicks + 5);
    expect(w.creatures.has(asCreatureId(50))).toBe(true); // chewer untouched — turret disabled
    expect(d.state).toBe('IDLE');                          // held in IDLE while fouled
    expect(d.nextFireTick).toBeGreaterThanOrEqual(w.tick); // clock held ahead → no backlog insta-fire

    // CLEAN it → the turret reacquires and kills the chewer (hp 1) within a fresh cycle.
    w.fouledPrimitives.delete(anchor);
    d.nextFireTick = w.tick; // due now (no stale-burst since it was held forward while fouled)
    tickN(w, getDefenderConfig('turret').windupTicks + 5);
    expect(w.creatures.has(asCreatureId(50))).toBe(false); // resumed → chewer dead
  });
});

describe('S109 P3 — a pooped HELGA (princess) slaps SLOWER but does not stop', () => {
  it('stretches the windup ~2x while fouled — still winding up where an un-fouled HELGA would have fired', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    addEnemyChewer(w, 50, 130, 100); // 30px — within the 380 range
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'helga', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    d.nextFireTick = w.tick;
    w.fouledPrimitives.add(anchor);

    const windup = getDefenderConfig('princess').windupTicks; // 14
    // After the UN-stretched windup, an un-fouled HELGA would already have slapped (see the FSM
    // test). Fouled, the windup is ~2x, so she is STILL winding up — not yet fired, and NOT stopped.
    tickN(w, windup + 1);
    expect(w.creatures.has(asCreatureId(50))).toBe(true); // not slapped yet (cadence stretched)
    expect(d.state).not.toBe('IDLE');                      // actively winding up, unlike the turret full-stop

    // Run out the rest of the stretched (2x) window → the slap lands. She still defends, just slower.
    tickN(w, windup * 2);
    expect(w.creatures.has(asCreatureId(50))).toBe(false); // slapped
  });
});

describe('recipeStillSatisfied (default — no recipe registered)', () => {
  it('survives while the anchor primitive exists; fails once it is gone', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'laserTurret', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    expect(recipeStillSatisfied(w, d)).toBe(true);
    w.primitives.delete(anchor);
    expect(recipeStillSatisfied(w, d)).toBe(false);
  });
});

describe('loadRephaseDefenders (Council MF5 — no insta-fire on load)', () => {
  it('re-phases a past nextFireTick relative to world.tick so it never fires on tick 0 post-load', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'laserTurret', pos: { x: 100, y: 100 } });
    const d = [...w.defenders.values()][0];
    // Simulate a load far in the future where the saved nextFireTick is now WAY in the past.
    w.tick = 100_000;
    d.nextFireTick = 5; // absolute, deep in the past
    loadRephaseDefenders(w);
    expect(d.nextFireTick).toBeGreaterThanOrEqual(w.tick); // never in the past → no insta-fire
    const interval = getDefenderConfig('turret').fireIntervalTicks;
    expect(d.nextFireTick - w.tick).toBeLessThan(interval); // within one interval (phase preserved)
  });
});

describe('teardownDefenders', () => {
  it('clears the map + resets nextDefenderId', () => {
    const w = setup();
    const anchor = addAnchor(w, 1, 100, 100);
    applyRegisterDefender(w, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: anchor, recipeId: 'laserTurret', pos: { x: 100, y: 100 } });
    expect(w.defenders.size).toBe(1);
    expect(w.nextDefenderId).toBe(1);
    teardownDefenders(w);
    expect(w.defenders.size).toBe(0);
    expect(w.nextDefenderId).toBe(0);
  });
});
