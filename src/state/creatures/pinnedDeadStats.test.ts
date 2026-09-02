/**
 * SPARK — S159 P6: **the stats the game DECLARES but does not SPEND, pinned so they cannot rot.**
 *
 * This codebase has been bitten repeatedly by numbers that read as live mechanics and are not:
 * `CONNECTOR_HP` was documentation shorthand for a mechanism that did not exist; `DEFENDER_HP` was a
 * `1e9` sentinel whose docblock stayed false for two sessions; the R72 targeting matrix was
 * "DECLARED BUT DEAD" until S153 P1 finally gave `creatureCanTarget` a caller. Every one of those was
 * discovered by a session going looking, not by anything failing.
 *
 * So the remaining known case is asserted here instead of described in a comment.
 *
 * ## The case: the electric drone's atk/pen
 *
 * Owner R77 dictates *"5 damage(atk) and 1 pierce in an area of effect (suicide drones)"*.
 * `DRONE_ATK`/`DRONE_PEN` reach `LIGHTNING_DRONE_CONFIG` and stop there: the drone's one and only
 * attack path, `applyDroneExplode`, SEVERS enemy bonds inside `DRONE_EXPLODE_RADIUS` and never reads
 * either number. The radius is real; the damage model is not.
 *
 * ⚠ THIS TEST IS DESIGNED TO FAIL WHEN THE GAP CLOSES, and that is the point. Whoever implements the
 * drone's stat-driven blast will see it go red with a message telling them to delete the assertion —
 * which is the moment the comment in `constants.ts` must change too. A gap that is only described in
 * prose drifts; a gap that is asserted announces its own closure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DRONE_ATK, DRONE_PEN, GOBLIN_SUICIDE_ATK, GOBLIN_SUICIDE_PEN } from '../../constants.ts';
import { getCreatureConfig } from './voltkin-config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (...p: string[]): string => readFileSync(join(HERE, ...p), 'utf8');

describe('S159 P6 — declared-but-dead stats are pinned, not merely commented', () => {
  it('the drone still carries the owner\'s numbers on its config', () => {
    // If these ever drift from the constants, the config is no longer a faithful record of R77 and
    // the "dead" finding below would be about the wrong numbers.
    const cfg = getCreatureConfig('lightningDrone');
    expect(cfg.atk).toBe(DRONE_ATK);
    expect(cfg.pen).toBe(DRONE_PEN);
  });

  /**
   * ⭐ S160 P5 — **INVERTED, NOT DELETED, AND THE GAP IS CLOSED.** This asserted that
   * `droneLifecycle.ts` did NOT mention `DRONE_ATK`/`DRONE_PEN` — the "designed to fail when the gap
   * closes" half of the file's own premise. R77's drone AoE landed in S160 P5, so the assertion
   * flips to its opposite rather than vanishing: the same file now guards that the numbers stay
   * SPENT, which is the property a future refactor could silently undo.
   *
   * The S158 B2b treatment, applied to a pin that announced its own closure exactly as designed.
   */
  it('⭐ S160 P5 — the drone SPENDS both numbers now, and still severs its owner-ruled 3', () => {
    const drone = src('..', 'droneLifecycle.ts');
    expect(drone.includes('DRONE_ATK'), 'the drone must spend its atk').toBe(true);
    expect(drone.includes('DRONE_PEN'), 'the drone must spend its pen').toBe(true);
    // ⛔ ADDITIVE, not a conversion: the unconditional sever is the owner's separate COUNT ruling
    // ("3 connectors per lightning"), and stat-gating it would make the drone WEAKER against big
    // fortresses (30 fifths cuts a connector only while the component has <= 26). See the docblock.
    expect(drone).toContain('SEVER_BOND');
    expect(drone).toContain('DRONE_MAX_CONNECTORS');
    // It goes through the SHARED helper, not a bespoke second damage path.
    expect(drone).toContain('applyRadialDamage');
    expect(drone).toContain('primitiveDamageForAtk');
  });

  it('✅ the SIBLING case is live, which is what makes the drone gap a gap and not a design', () => {
    // The terrorist goblin was in exactly this state until S158 P3. Its blast now spends both of the
    // owner's numbers on the shared ladder — so "an AoE unit whose stats are real" already exists in
    // this codebase, and generalising it is the cheap path for the drone.
    const blast = src('suicideBlast.ts');
    expect(blast).toContain('GOBLIN_SUICIDE_ATK');
    expect(blast).toContain('GOBLIN_SUICIDE_PEN');
    expect(blast).toContain('primitiveDamageForAtk');
    expect(GOBLIN_SUICIDE_ATK).toBeGreaterThan(0);
    expect(GOBLIN_SUICIDE_PEN).toBeGreaterThanOrEqual(0);
  });

  it('⭐ S160 P5 — constants.ts no longer CLAIMS a gap that is closed', () => {
    /*
     * This asserted that constants.ts CONTAINED the words "DECLARED BUT DEAD". That was right while
     * the gap was open and it is a lie now, so it inverts with the rest of the file — and inverting
     * it is the point: a note describing a mechanic the game HAS since gained is exactly the stale
     * comment this codebase keeps paying for. Two prior corrections of the same kind are pinned
     * below, so this file is now a small ledger of notes that went false and were fixed.
     */
    const c = src('..', '..', 'constants.ts');
    expect(
      c,
      'the drone AoE shipped at S160 P5, so this claim must be gone from constants.ts',
    ).not.toContain('`DRONE_ATK` AND `DRONE_PEN` ARE DECLARED BUT DEAD');
    // ...and the note that replaced it must say so where the numbers live.
    expect(c).toContain('THESE NUMBERS ARE SPENT');
    // The note that went false at S158 P3 must stay corrected: the suicide goblin's AoE IS built.
    expect(c).not.toContain('THE AoE SHAPE IS NOT IMPLEMENTED IN P3');
    // And the sibling paragraph that pointed at the drone gap must not still point at it.
    expect(c).not.toContain("THE DRONE'S HALF OF THAT OLD SENTENCE IS STILL TRUE");
  });
});
