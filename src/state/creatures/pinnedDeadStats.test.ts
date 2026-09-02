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

  it('⛔ and NOTHING SPENDS THEM: applyDroneExplode severs bonds and never reads atk/pen', () => {
    const drone = src('..', 'droneLifecycle.ts');
    // The drone's explosion is a bond-sever. When the stat-driven blast lands, these two assertions
    // are the ones to delete — together with the ⛔ block in constants.ts above `DRONE_ATK`.
    expect(
      drone.includes('DRONE_ATK'),
      'DRONE_ATK is now read by droneLifecycle — the R77 drone AoE has landed. Delete this assertion ' +
        'and update the ⛔ note above DRONE_ATK in constants.ts, which says the numbers are dead.',
    ).toBe(false);
    expect(drone.includes('DRONE_PEN')).toBe(false);
    expect(drone).toContain('SEVER_BOND');
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

  it('constants.ts states the drone gap in the same place the numbers live', () => {
    const c = src('..', '..', 'constants.ts');
    expect(c).toContain('`DRONE_ATK` AND `DRONE_PEN` ARE DECLARED BUT DEAD');
    // And the note that went false at S158 P3 must stay corrected: the suicide goblin's AoE IS built.
    expect(c).not.toContain('THE AoE SHAPE IS NOT IMPLEMENTED IN P3');
  });
});
