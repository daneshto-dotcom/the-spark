/**
 * SPARK — S167 — **EVERY FED-TOWER UNIT IS IN `POTATO_CLEARS`.**
 *
 * ## ⛔ THE DRIFT THIS ENDS, WHICH HAS NOW HAPPENED THREE TIMES
 *
 * The potato's blast originally selected its victims with the PREDICATE `sourceSpawnerId !== null`
 * — "anything a spawner made". That is a rule which silently widens: S151 made `goblinTowerFeed`
 * stamp every goblin with a spawner id, so a potato quietly began deleting goblins; W1-C's race unit
 * joined the same way. `potatoLifecycle.ts` records both.
 *
 * S165 replaced the predicate with an EXPLICIT LIST, and said why in its own words: *"what it buys
 * is that the NEXT spawner-sourced creature has to be added here on purpose instead of being swept
 * in silently."*
 *
 * ⭐ **AND THE VERY NEXT ONE WAS NOT.** S166 added the six tier-3 units, `applyFeedTower` stamps
 * them with a spawner id like every goblin, and the list was never extended — so for a whole session
 * the tier-3 units were UNIQUELY POTATO-IMMUNE among tower units. `tsc` cannot see it (the set is
 * built from a `CreatureType[]` literal, and a SHORT list is still well-typed) and no test asked.
 *
 * **An explicit list only helps if something FAILS when it is incomplete.** This is that something.
 *
 * ## How it decides what belongs
 *
 * `fedCreatureType(recipeId, sparkType)` is the single mapping from "a fed tower and a shape" to the
 * creature that comes out, and `applyFeedTower` is the only caller — it dispatches with
 * `sourceSpawnerId: action.spawnerId`, non-null, always. So **every creature type that function can
 * return is spawner-sourced by construction**, and the answer is derived from the shipped mapping
 * rather than from a second hand-written list that could drift from the first.
 *
 * ⚠ IT DOES NOT ASSERT THE CONVERSE. Plenty of things in `POTATO_CLEARS` are not fed-tower output —
 * the chewer and the lightning drone are emitted on a cadence, the race unit by the castle. A
 * two-way pin would fail on correct data and would also freeze a set the owner may want to tune.
 *
 * ## ⚠ AND ONE MEMBERSHIP IS DELIBERATELY DENIED
 *
 * The six tier-9 BOSSES must stay OUT. They are dispatched with `sourceSpawnerId: null`, so the old
 * predicate never covered them either — the same class as the Voltkin, which has always been
 * potato-immune. `applyRadialClear` DELETES rather than damages, so a boss in the set would mean the
 * game's most expensive build, at full health, erased outright by its cheapest item.
 */

import { describe, expect, it } from 'vitest';
import { ALL_RACES } from './races.ts';
import { ALL_SPARK_TYPES } from '../constants.ts';
import { RACE_TOWER_IDS } from './raceTowerIds.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { fedCreatureType } from './goblinTowerFeed.ts';
import { potatoClearsType } from './potatoLifecycle.ts';
import type { CreatureType } from './creatures/creature.ts';

/** Every creature a fed tower can produce, derived from the shipped mapping. */
function fedOutputs(): ReadonlySet<CreatureType> {
  const out = new Set<CreatureType>();
  const feedable = ['goblinTower' as const, ...ALL_RACES.map((r) => RACE_TOWER_IDS[r])];
  for (const recipeId of feedable) {
    for (const shape of ALL_SPARK_TYPES) {
      const t = fedCreatureType(recipeId, shape);
      if (t !== null) out.add(t);
    }
  }
  return out;
}

describe('S167 — the potato blast covers every fed-tower unit', () => {
  const fed = fedOutputs();

  it('is not vacuous — the feed mapping really does produce units', () => {
    /*
     * A guard over an empty set passes forever. Six goblins from the goblin tower plus six tier-3
     * units from the race towers is twelve; asserting the floor rather than the exact number keeps
     * this from failing for the good reason (a new feedable tower) as well as the bad one.
     */
    expect(fed.size).toBeGreaterThanOrEqual(12);
  });

  it('⛔ every unit a fed tower can produce is cleared by a potato', () => {
    const missing = [...fed].filter((t) => !potatoClearsType(t)).sort();
    expect(
      missing,
      `⛔ ${missing.join(', ')} come(s) out of a FED tower, and applyFeedTower stamps every one `
        + 'with a non-null sourceSpawnerId, so the pre-S165 predicate cleared them — but they are '
        + 'absent from POTATO_CLEARS. That leaves them uniquely potato-immune among tower units, '
        + 'which is exactly how the tier-3 units shipped for a whole session.',
    ).toEqual([]);
  });

  it('⛔ and the six BOSSES are NOT cleared — a decision, not the same omission', () => {
    /*
     * ⭐ THE NEGATIVE HALF, and it is the one a future session is most likely to "fix" by pattern-
     * matching. A boss carries `sourceSpawnerId: null`, so it was never in the old predicate's
     * class; and `applyRadialClear` DELETES rather than damages, so adding it would let the cheapest
     * item in the game erase the most expensive build at full health, instantly.
     */
    for (const race of ALL_RACES) {
      expect(
        potatoClearsType(T9_BOSS_TYPE[race]),
        `${race}'s boss must NOT be deletable by a potato — see potatoLifecycle's note`,
      ).toBe(false);
    }
  });

  it('the Voltkin stays immune too — the class the bosses were put in', () => {
    // Cited by the boss exclusion as its precedent, so it is pinned rather than assumed.
    expect(potatoClearsType('voltkin')).toBe(false);
  });
});
