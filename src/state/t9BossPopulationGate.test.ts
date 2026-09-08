/**
 * SPARK — S169 (owner playtest) — TWO PHARAOHS. THE SECOND ONE MAY NOT WAIT FOR THE FIRST TO DIE.
 *
 * Owner, verbatim: *"my wife did two pharaohs, and the second pharaoh building waited until the
 * first pharaoh is dead. And only then he let out the pharaoh, which is silly. You know? The
 * pharaoh, like, the boss building should let out the boss in the beginning of the fight."*
 *
 * ## ⛔ WHAT IT WAS, AND WHY EVERY GATE STAYED GREEN
 *
 * `hostTick`'s tier-9 arm releases its boss with **no `sourceSpawnerId`** — deliberately, and its
 * own comment says so, because the release should answer to the summon rule rather than to a
 * spawner population. That routes it into `applySpawnCreature`'s null-spawner branch, whose gate is
 * *one live creature per (owner, type)*:
 *
 *     if (creatureType !== 'voltkin' && creatureType !== 'direwolf') {
 *       for (const c of world.creatures.values())
 *         if (c.sourceSpawnerId === null && c.ownerPlayerId === owner && c.type === type)
 *           return world;            // ← discarded. No error. No effect. No red test.
 *     }
 *
 * A boss IS one type per race, and both her pyramids were one seat and one race. So the second
 * tower's release was silently thrown away while the tower itself had already paid its nine shapes,
 * and the next due slot only passed once the first pharaoh died — *"waited until the first pharaoh
 * is dead"*, exactly.
 *
 * ## ⚠ THE THIRD TIME THIS LATCH ATE A FEATURE, AND IT WAS PREDICTED IN WRITING
 *
 * The direwolf exemption added one session earlier says: *"That is the exact failure the tier-3
 * tower shipped with earlier this same session, one layer down."* Two exemptions for two summons
 * were already in place and nobody checked the most expensive unit in the game against the same
 * rule. So this file does not just pin the boss — it pins the SHAPE of the bug, with a control that
 * proves the gate still exists for everything it is genuinely meant to bound.
 *
 * `isT9BossType` is used at the gate rather than six more `!==` arms, so a seventh race cannot
 * reintroduce it by being forgotten.
 *
 * ## ⚠ NOT UNBOUNDED — the real cap is the one the design already had
 *
 * A second boss costs a fresh ring of NINE race shapes, because the tier-9 arm razes the ring on
 * release precisely so the tower cannot re-ignite. The spec names that as the intended price. This
 * gate was a second, invisible cap sitting on top of the designed one.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { ALL_RACES } from './races.ts';
import { T9_BOSS_TYPE, isT9BossType } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeatWorld(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

/**
 * Release a boss the way `hostTick`'s tier-9 arm does — **with no `sourceSpawnerId`**. That omission
 * is the whole point of this file; passing one would route the spawn down the spawner-population
 * path and the bug under test would not be reachable.
 */
function releaseBoss(world: World, type: string, owner = P0, x = 500): void {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y: 500 },
    targetPos: { x, y: 500 },
  });
}

function countOf(world: World, type: string): number {
  return [...world.creatures.values()].filter((c) => c.type === type).length;
}

describe('S169 — the tier-9 boss is exempt from the one-live-per-(owner, type) latch', () => {
  it('⭐⭐ TWO PHARAOHS, ONE SEAT, BOTH ALIVE — the owner report, pinned', () => {
    const world = twoSeatWorld();
    releaseBoss(world, T9_BOSS_TYPE.mummies, P0, 400);
    releaseBoss(world, T9_BOSS_TYPE.mummies, P0, 700);
    expect(countOf(world, T9_BOSS_TYPE.mummies)).toBe(2);
  });

  it('⭐ and the second one is a REAL creature, not a duplicate id or a shared record', () => {
    const world = twoSeatWorld();
    releaseBoss(world, T9_BOSS_TYPE.mummies, P0, 400);
    releaseBoss(world, T9_BOSS_TYPE.mummies, P0, 700);
    const bosses = [...world.creatures.values()].filter(
      (c) => c.type === T9_BOSS_TYPE.mummies,
    );
    expect(new Set(bosses.map((b) => b.id)).size, 'distinct ids').toBe(2);
    expect(new Set(bosses.map((b) => b.pos.x)), 'distinct positions').toEqual(new Set([400, 700]));
  });

  it('⭐ ALL SIX RACES, not just the mummies he happened to play', () => {
    // The gate was type-scoped, so a fix that named only the pharaoh would leave five bosses broken
    // and one owner report "closed". `isT9BossType` is what makes this loop pass by construction.
    for (const race of ALL_RACES) {
      const world = twoSeatWorld();
      const type = T9_BOSS_TYPE[race];
      expect(isT9BossType(type), `${race} is recognised as a boss type`).toBe(true);
      releaseBoss(world, type, P0, 400);
      releaseBoss(world, type, P0, 700);
      expect(countOf(world, type), race).toBe(2);
    }
  });

  it('CONTROL — two seats each fielding their own boss always worked; this is not what broke', () => {
    // The old gate keyed on (owner, type), so cross-seat was never affected. Pinned so a future
    // "simplification" of the gate cannot break the case that was fine.
    const world = twoSeatWorld();
    releaseBoss(world, T9_BOSS_TYPE.mummies, P0, 400);
    releaseBoss(world, T9_BOSS_TYPE.mummies, P1, 700);
    expect(countOf(world, T9_BOSS_TYPE.mummies)).toBe(2);
  });

  /*
   * ⭐⭐ THE CONTROL THAT MATTERS MOST, because the cheap way to "fix" the report is to delete the
   * gate — and the gate is a real host-side population bound for every other null-spawner creature.
   * If this ever goes to 2, the exemption has been widened into a removal.
   */
  it('CONTROL — the latch STILL BITES for a non-exempt null-spawner creature', () => {
    const world = twoSeatWorld();
    releaseBoss(world, 'goblinMelee', P0, 400);
    releaseBoss(world, 'goblinMelee', P0, 700);
    expect(countOf(world, 'goblinMelee'), 'one live goblinMelee per (owner, type)').toBe(1);
  });

  it('CONTROL — and the two pre-existing exemptions are untouched', () => {
    // The Voltkin (owner S158 B3: "you should be able to build as many voltkins as you wish") and
    // the direwolf (R149: "summons 3 direwolves") were exempted before this session. A regression
    // in either would look identical to the pharaoh bug from the outside.
    const world = twoSeatWorld();
    releaseBoss(world, 'voltkin', P0, 400);
    releaseBoss(world, 'voltkin', P0, 700);
    expect(countOf(world, 'voltkin'), 'voltkin').toBe(2);

    const w2 = twoSeatWorld();
    releaseBoss(w2, 'direwolf', P0, 400);
    releaseBoss(w2, 'direwolf', P0, 700);
    releaseBoss(w2, 'direwolf', P0, 900);
    expect(countOf(w2, 'direwolf'), 'a pack of three, per R149').toBe(3);
  });
});
