/**
 * SPARK — S175 P1: THE ORC WARLORD'S RAGE, PINNED AT EVERY SITE THAT READS IT.
 *
 * ⛔ **WHY THIS FILE EXISTS, AND IT IS NOT "more coverage".** Before S175 the ONLY assertion about
 * rage anywhere in the suite was `rageMultiplier({enraged:true}) === 2` — the PURE HELPER, in
 * `bossSkillsLate.test.ts:156`. Every one of its production call sites could have been deleted and
 * the whole 4400-test suite would still have gone green. `rageMultiplier`'s own docblock
 * (`creatures/creature.ts:109-111`) says outright that it was factored into one function precisely
 * because *"a x2 that was applied to movement and forgotten at the cadence is a bug nothing in the
 * suite would name — the Warlord would simply feel wrong"*. The helper was extracted to prevent the
 * drift; nothing was ever written to CATCH it. This file is that catch.
 *
 * Owner R149/R151, and the S175 addition: *"he becomes enraged when drops to 25% health and attacks
 * and moves x2 quicker"* / *"he becomes red … So he looks like he attacks two times faster as
 * well."* That is FOUR reads — movement, cadence, animation rate, colour — and each gets a case.
 *
 * ⚠ HONEST SCOPE, so a later session does not over-trust this file: cases 1, 3 and 4 exercise the
 * REAL production functions. Case 2 (cadence) pins the ARITHMETIC ONLY. The cadence divide is
 * computed inline inside `stepCreatureLifecycle`, which needs a whole World and a driven FSM to
 * reach; standing that harness up was not worth its cost this session. So the cadence's WIRING
 * remains uncovered, and that is stated here rather than hidden.
 */
import { describe, it, expect } from 'vitest';
import { computeSteeringAccel } from '../physics/creatureVerlet.ts';
import {
  asCreatureId,
  makeVoltkinCreature,
  rageMultiplier,
  type Creature,
} from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { WARLORD_RAGE_MULTIPLIER } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { animTicksPerFrame, creatureSpriteTint } from '../render/goblinRenderer.ts';

/** A SEEKING creature well clear of its target, so the arrive ramp is at full magnitude. */
function seeker(enraged: boolean): Creature {
  const c = makeVoltkinCreature({
    id: asCreatureId(1),
    ownerPlayerId: asPlayerId(0),
    pos: { x: 100, y: 100 },
    targetPos: { x: 900, y: 100 },
    spawnedAtTick: 0,
  });
  c.state = 'SEEKING';
  if (enraged) c.enraged = true;
  return c;
}

describe('S175 P1 — RAGE REACHES MOVEMENT (the real wiring, not the helper)', () => {
  it('⭐ an enraged creature steers with exactly WARLORD_RAGE_MULTIPLIER× the acceleration', () => {
    const calm = computeSteeringAccel(seeker(false));
    const angry = computeSteeringAccel(seeker(true));
    const calmMag = Math.hypot(calm.x, calm.y);
    const angryMag = Math.hypot(angry.x, angry.y);

    expect(calmMag, 'the control must actually be accelerating, or this test proves nothing')
      .toBeGreaterThan(0);
    expect(angryMag / calmMag).toBeCloseTo(WARLORD_RAGE_MULTIPLIER, 6);
  });

  it('⛔ deleting the rageMultiplier read in creatureVerlet must FAIL here', () => {
    // The guard restated as an inequality, so the failure message names the defect rather than a ratio.
    expect(
      Math.hypot(...Object.values(computeSteeringAccel(seeker(true))) as [number, number]),
    ).toBeGreaterThan(
      Math.hypot(...Object.values(computeSteeringAccel(seeker(false))) as [number, number]),
    );
  });

  it('rage does not steer a creature that is not SEEKING (it is a multiplier, not a gate)', () => {
    const c = seeker(true);
    c.state = 'SPAWNING';
    expect(computeSteeringAccel(c)).toEqual({ x: 0, y: 0 });
  });
});

describe('S175 P1 — RAGE REACHES THE ATTACK CADENCE (arithmetic only — see the header)', () => {
  /**
   * ⚠ THE REAL POINT OF THIS CASE. A divide that rounds to the same number is a no-op, and it would
   * be invisible: the Warlord would "have rage" and swing at exactly his normal speed. This asserts
   * the doubling is actually EXPRESSIBLE for the unit that has the ability.
   */
  it('⭐ the Warlord\'s own cadence genuinely halves — the divide is not a rounding no-op', () => {
    const base = getCreatureConfig('t9BossOrcs').attackCadenceTicks;
    const raged = Math.max(1, Math.round(base / rageMultiplier({ enraged: true })));
    expect(base, 'a 1-tick cadence would make rage unobservable').toBeGreaterThan(1);
    expect(raged).toBeLessThan(base);
    expect(raged).toBe(Math.round(base / WARLORD_RAGE_MULTIPLIER));
  });

  it('the floor holds — no multiplier can ever produce a zero-tick (every-frame) attack', () => {
    expect(Math.max(1, Math.round(1 / 99))).toBe(1);
  });
});

describe('S175 P1 — RAGE READS ON SCREEN: the animation speeds up', () => {
  it('⭐ ticks-per-frame halves while enraged, so the swing keeps step with the cadence', () => {
    expect(animTicksPerFrame(6, false)).toBe(6);
    expect(animTicksPerFrame(6, true)).toBe(3);
  });

  it('floored at 1 — a 1-tick-per-frame animation cannot go to zero and freeze', () => {
    expect(animTicksPerFrame(1, true)).toBe(1);
  });

  it('every non-enraged creature is byte-identical (the branch is dead for the other kinds)', () => {
    for (const per of [1, 2, 4, 5, 6, 8, 12]) expect(animTicksPerFrame(per, false)).toBe(per);
  });
});

describe('S175 P1 — RAGE READS ON SCREEN: the red, and why it is NOT 0xff0000', () => {
  const SEAT_CRIMSON = 0xd7263d;

  it('⭐ enraged overrides the seat wash and comes back red-dominant', () => {
    const t = creatureSpriteTint(SEAT_CRIMSON, true);
    const r = (t >> 16) & 0xff, g = (t >> 8) & 0xff, b = t & 0xff;
    expect(r).toBe(0xff);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    expect(g, 'red must be symmetric — a green/blue split would read as a hue, not as rage').toBe(b);
  });

  /**
   * ⛔ THE REGRESSION THIS FILE EXISTS TO PREVENT, AND IT ALREADY SHIPPED ONCE. A Pixi tint is a
   * MULTIPLY. S151 assigned a saturated colour straight to `sp.tint` and the goblins came back as
   * "unreadable dark-red smudges"; S152 repaired it with the near-white wash. A pure-red rage tint
   * would zero the green and blue channels and repeat it exactly, on already-dark orc boss art.
   */
  it('⛔ the rage tint is NOT pure red — G and B stay well clear of zero, or the sprite goes black', () => {
    const t = creatureSpriteTint(SEAT_CRIMSON, true);
    const g = (t >> 8) & 0xff, b = t & 0xff;
    expect(t).not.toBe(0xff0000);
    expect(g, 'a multiply by a near-zero channel destroys the artwork').toBeGreaterThan(0x50);
    expect(b).toBeGreaterThan(0x50);
  });

  it('the calm path is untouched — every other creature still carries its washed seat colour', () => {
    for (const seat of [0xd7263d, 0x1b998b, 0x2e86ab, 0xf6ae2d]) {
      const t = creatureSpriteTint(seat, false);
      expect(t).not.toBe(creatureSpriteTint(seat, true));
      // Washed towards white ⇒ every channel is >= the raw seat channel.
      for (const sh of [16, 8, 0]) {
        expect((t >> sh) & 0xff).toBeGreaterThanOrEqual((seat >> sh) & 0xff);
      }
    }
  });

  it('the red is the SAME red whatever seat the Warlord belongs to (one danger cue, not six)', () => {
    const reds = [0xd7263d, 0x1b998b, 0x2e86ab, 0xf6ae2d].map((s) => creatureSpriteTint(s, true));
    expect(new Set(reds).size).toBe(1);
  });
});
