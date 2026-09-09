/**
 * SPARK — S170 P3 (owner R158): **TIER-3 RACE TOWERS ARE TRULY LIMITLESS.**
 *
 * Owner, asked whether the cap should stay: *"Tier three towers, yes, truly limitless. Because
 * everyone is building tier three towers, so all the spawn are killing each other. So it's just
 * gonna sort itself out."* — mutual attrition is the cap, not a constant.
 *
 * ## ⛔ WHY THIS IS A BUG FIX AND NOT A TUNING PREFERENCE
 *
 * `GOBLIN_MAX_PER_SPAWNER = 10` silenced a tier-3 tower PERMANENTLY once ten of its units were
 * alive. Nothing culls creatures at a phase edge — the tier-9 boss demonstrably survives
 * FIGHT→BUILD→FIGHT — so across a long match a tower reaches ten and never emits again, with no
 * message and nothing in the suite to notice. That is the owner's original report returning:
 * *"the Piranha ... didn't produce at all"*, which S169 diagnosed as a phase offset and fixed only
 * halfway.
 *
 * ## ⚠ AND THE GOBLIN TOWER MUST KEEP ITS TEN, WHICH IS WHY BOTH HALVES ARE ASSERTED HERE
 *
 * Ten-per-goblin-tower is the owner's own bought design (*"a second tower is now worth building,
 * because the first one stops at ten"*, recorded at the constant) and the two populations SHARE that
 * one number. Deleting or raising it would silently re-tune the goblin economy while fixing tier 3 —
 * the exact "one population's ceiling gating another's" failure that the three pre-existing
 * exclusions in `underGoblinCaps` were each added to undo. So the fix is an EXEMPTION, and a test
 * that only proved tier 3 is uncapped would not notice the collateral.
 */

import { describe, expect, it } from 'vitest';
import { GOBLIN_MAX_PER_SPAWNER, PRIMITIVE_MAX_HP } from '../constants.ts';
import { underGoblinCaps } from './creatures/creatureLifecycle.ts';
import { makeWorld } from './world.ts';
import { asCreatureId, asPlayerId, asSpawnerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { World } from './world.ts';

const P0 = asPlayerId(0);
const SPAWNER = asSpawnerId(1);

/** Put `n` live creatures of `type` on the board, all attributed to `SPAWNER`. */
function seed(world: World, type: CreatureType, n: number): void {
  for (let i = 0; i < n; i++) {
    const id = asCreatureId(i + 1);
    world.creatures.set(id, {
      id,
      type,
      ownerPlayerId: P0,
      pos: { x: 100 + i, y: 100 },
      prevPos: { x: 100 + i, y: 100 },
      state: 'SEEKING',
      stateEnteredTick: 0,
      spawnTick: 0,
      despawnAtTick: 1_000_000,
      targetPos: { x: 900, y: 900 },
      targetBondId: null,
      targetCreatureId: null,
      targetPrimitiveId: null,
      chewProgress: 0,
      ehp: PRIMITIVE_MAX_HP,
      sourceSpawnerId: SPAWNER,
    } as never);
  }
}

describe('S170 P3 (owner R158) — tier-3 race towers are truly limitless', () => {
  it('⭐ a tier-3 tower still emits with FAR more than the cap already alive', () => {
    const world = makeWorld(0);
    seed(world, 't3Piranha' as CreatureType, GOBLIN_MAX_PER_SPAWNER * 5);
    expect(
      underGoblinCaps(world, SPAWNER),
      'fifty live tier-3 units must not silence their own tower',
    ).toBe(true);
  });

  it('⭐ and exactly AT the old ceiling, which is the tick the tower used to go quiet forever', () => {
    const world = makeWorld(0);
    seed(world, 't3Warband' as CreatureType, GOBLIN_MAX_PER_SPAWNER);
    expect(underGoblinCaps(world, SPAWNER)).toBe(true);
  });

  it('⛔ POSITIVE CONTROL — the GOBLIN tower still stops at ten, so the fix did not leak', () => {
    /*
     * Without this the suite could not tell "tier 3 is exempt" from "the cap is gone", and the
     * second would quietly rewrite an economy the owner deliberately chose. This is the assertion
     * that makes the one above mean something.
     */
    const world = makeWorld(0);
    seed(world, 'goblinMelee' as CreatureType, GOBLIN_MAX_PER_SPAWNER);
    expect(
      underGoblinCaps(world, SPAWNER),
      'the owner bought this ceiling: "a second tower is now worth building"',
    ).toBe(false);
  });

  it('⛔ POSITIVE CONTROL — one under the ceiling a goblin tower still pays out', () => {
    const world = makeWorld(0);
    seed(world, 'goblinMelee' as CreatureType, GOBLIN_MAX_PER_SPAWNER - 1);
    expect(underGoblinCaps(world, SPAWNER)).toBe(true);
  });

  it('⚠ and tier-3 units do not consume the GOBLIN allowance either', () => {
    /*
     * The S168 half of this exclusion, re-pinned from the other side: a board full of tier-3 units
     * must leave a goblin tower's own budget untouched. Nine goblins plus fifty tier-3 units is
     * still under the goblin ceiling, because only the goblins count.
     */
    const world = makeWorld(0);
    seed(world, 't3Bat' as CreatureType, 50);
    const base = world.creatures.size;
    for (let i = 0; i < GOBLIN_MAX_PER_SPAWNER - 1; i++) {
      const id = asCreatureId(base + i + 1);
      world.creatures.set(id, {
        ...[...world.creatures.values()][0],
        id,
        type: 'goblinMelee' as CreatureType,
      } as never);
    }
    expect(underGoblinCaps(world, SPAWNER)).toBe(true);
  });
});
