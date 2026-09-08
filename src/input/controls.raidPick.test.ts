/**
 * SPARK — S168 P1 — WHICH THING A RIGHT-CLICK RAID ACTUALLY HITS.
 *
 * ## ⛔ The owner's report, and the half of it that lives here
 *
 * *"enemy bots can still destroy my connectors with one raid! same bug we had before - we need to
 * fix it one and for all and make it consistent! not fair that they can destroy my tower with one
 * raid action and when i attack its just a cloud and some atk damage as it should be"*
 *
 * Two separate defects composed into that one sentence:
 *
 *   1. **the damage** — a 10-fifth raid met or exceeded seven of the nine shipped tower capacities,
 *      so one hit deleted a whole tower. Fixed by `RAID_CONNECTOR_MAX_FIFTHS`; pinned in
 *      `state/raid.test.ts`.
 *   2. **the aim** — THIS file. `raidParity.test.ts` has proved for sessions that a bot raid and a
 *      human raid are byte-identical AT THE REDUCER, and it was right, which is exactly why the
 *      asymmetry survived so long: it was never in the reducer. It was in the picker.
 *
 * ⭐ THE PICKER WAS AN UNCONDITIONAL FAMILY PRECEDENCE — creature, then defender, then bond — over
 * radii that differ by more than 4x (`CREATURE_PICK_DIST` 34 px vs `BOND_PICK_DIST` 8). So ANY enemy
 * unit within 34 px swallowed the click. An enemy tower in FIGHT is ringed by the units it just
 * spawned, which is precisely when a player wants to raid it, so his raid landed on a unit and read
 * as *"just a cloud and some atk damage"*. The bot has no picker at all: `botRaidAction` always
 * emits `{kind:'bond'}` and `nearestEnemySpawnerBond` hunts connectors INTERNAL to spawner
 * components. **The bot could always aim where the player never could.**
 *
 * `bestPickIndex` is pure, so this runs with no DOM, no canvas and no world.
 */

import { describe, expect, it } from 'vitest';
import { bestPickIndex, type PickHit } from './controls.ts';

/** The three families, in the historical R78 precedence order the caller passes them in. */
const CREATURE = 0;
const DEFENDER = 1;
const BOND = 2;

const hit = (ratio: number): PickHit<number> => ({ id: 1, ratio });

/** Distances, converted the way the real pickers do. Kept here so the cases read in PIXELS. */
const CREATURE_PICK_DIST = 34;
const BOND_PICK_DIST = 8;
const creatureAt = (px: number): PickHit<number> => hit(px / CREATURE_PICK_DIST);
const bondAt = (px: number): PickHit<number> => hit(px / BOND_PICK_DIST);

describe('S168 P1 — a raid hits what the player aimed at', () => {
  it('nothing in range → nothing is raided', () => {
    expect(bestPickIndex([null, null, null])).toBe(null);
  });

  it('the only candidate wins, whichever family it is', () => {
    expect(bestPickIndex([null, null, bondAt(4)])).toBe(BOND);
    expect(bestPickIndex([creatureAt(30), null, null])).toBe(CREATURE);
    expect(bestPickIndex([null, creatureAt(9), null])).toBe(DEFENDER);
  });

  /*
   * ⭐ R78 IS PRESERVED WHERE IT WAS ACTUALLY MEANT. S102 wrote the precedence for one case and
   * said so: "a chewer hopping on top of a bond should be the target, not the bond under it".
   * That case still resolves to the creature — it is genuinely the closer thing.
   */
  it('⭐ a chewer hopping ON the bond still beats the bond under it', () => {
    expect(bestPickIndex([creatureAt(3), null, bondAt(5)])).toBe(CREATURE);
  });

  /*
   * ⭐⭐ THE OWNER'S CASE, AND THE ONE THAT USED TO FAIL. The cursor is on the connector; a spawned
   * unit is 20 px away — nowhere near the cursor, but well inside the 34 px creature radius. The
   * old code handed the click to the unit unconditionally.
   */
  it('⭐⭐ a connector UNDER the cursor beats a unit 20 px away — the fix', () => {
    expect(bestPickIndex([creatureAt(20), null, bondAt(2)])).toBe(BOND);
  });

  it('⭐ and the old behaviour really was the opposite, else this fix is decoration', () => {
    // The negative control. Under a pure family precedence ANY creature hit wins, so the case
    // above would return CREATURE. Asserting the ratios really do order the other way is what
    // makes the test above evidence rather than restatement.
    expect(creatureAt(20).ratio).toBeGreaterThan(bondAt(2).ratio);
  });

  it('a unit truly on top of the cursor still wins over a connector at the edge of its radius', () => {
    expect(bestPickIndex([creatureAt(1), null, bondAt(7)])).toBe(CREATURE);
  });

  /*
   * ⚠ TIES KEEP ARRAY ORDER, which IS the old precedence. Stated as a test because the tie rule is
   * the whole reason this change is safe: nothing that used to resolve one way at equal
   * deliberateness resolves differently now.
   */
  it('⚠ an exact tie still resolves creature → defender → bond', () => {
    expect(bestPickIndex([hit(0.5), hit(0.5), hit(0.5)])).toBe(CREATURE);
    expect(bestPickIndex([null, hit(0.5), hit(0.5)])).toBe(DEFENDER);
  });

  it('Helga (a unit-class defender) sits with the units, not the structures', () => {
    // S158 A3: she is a UNIT that happens to live in `world.defenders`, so she is scored on the
    // CREATURE radius. A defender at 10 px beats a bond at 7 px (0.29 vs 0.88).
    expect(bestPickIndex([null, creatureAt(10), bondAt(7)])).toBe(DEFENDER);
  });

  it('ignores holes in the candidate list rather than treating them as ratio 0', () => {
    // A null must never win. If `bestPickIndex` coerced null to 0 it would beat every real hit.
    expect(bestPickIndex([null, null, bondAt(7.9)])).toBe(BOND);
  });
});
