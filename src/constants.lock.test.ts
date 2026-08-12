/**
 * SPARK — USER-LOCKED constant tripwires (S86 P1).
 *
 * Each assertion here encodes a decision the USER made explicitly, recorded in
 * LOCKED_DECISIONS.md. A failing test in this file is NOT a bug to "fix" by
 * updating the expected value — it means a session is about to override a
 * locked user decision. Stop and re-read the cited section; only a fresh,
 * explicit user ask in the CURRENT session justifies editing both the constant
 * and this lock together.
 *
 * Born from the S85→S86 fog regression: S63 user tuning ("kill the blue fog
 * tint") was overridden by S85 P4b restoring the dim tier from an old design
 * note, and the round-6 playtest caught it ("the stupid blue fog is back").
 * Docs alone didn't stop it; a CI-blocking test does (Council S86 ledger #1).
 */

import { describe, expect, it } from 'vitest';
import {
  CHEW_INTERVAL_TICKS,
  DOT_CADENCE_TICKS,
  MEMORY_FOG_COLOR,
  PHYSICS_HZ,
  PRIMITIVE_MAX_HP,
} from './constants.ts';
import { CREATURE_CONFIGS } from './state/creatures/voltkin-config.ts';

describe('USER-LOCKED constants (LOCKED_DECISIONS.md)', () => {
  it('MEMORY_FOG_COLOR is pure black — LOCKED_DECISIONS.md §14, user decided twice (S63 + S86 round-6)', () => {
    expect(MEMORY_FOG_COLOR).toBe(0x000000);
  });
});

/**
 * S139 P1 — INVARIANT tripwires, not value tripwires.
 *
 * The distinction matters and is the whole point of this block. Pinning `PRIMITIVE_MAX_HP === 1000`
 * alone would still let someone change it to 1024 and silently break the property the number exists
 * for. So each test below asserts the RELATIONSHIP that makes the value load-bearing.
 *
 * Why these three, specifically: S138 shipped a damage substrate whose integer-only guard
 * (`damageEntity` throws on a fractional amount) depends entirely on the % -of-max-hp arithmetic
 * landing on integers, and S139 P1 made that substrate live for the first time. A.0 measured that
 * `constants.lock.test.ts` pinned exactly ONE value in the whole repo, and that the chewer's
 * "5 chews" coupling existed only as a COMMENT (`chewHits: 5, // = constants.ts CHEW_HITS`) with a
 * hardcoded literal beside it.
 */
describe('S139 P1 — damage-substrate INVARIANTS (relationships, not values)', () => {
  it('the DoT percentages the design actually uses all land on INTEGERS of PRIMITIVE_MAX_HP', () => {
    // This is why the scale is 1000 and not 100 (constants.ts records the reasoning verbatim).
    // If someone lowers it, 2.5% stops being an integer and `damageEntity` throws AT RUNTIME —
    // which no type check would have caught.
    for (const pct of [1, 2.5, 5]) {
      const perApplication = (PRIMITIVE_MAX_HP * pct) / 100;
      expect(Number.isInteger(perApplication)).toBe(true);
    }
  });

  it('DOT_CADENCE_TICKS is exactly the 0.5 s the owner-ruled DoT model specifies', () => {
    // Guards against a re-derivation drifting off PHYSICS_HZ. "5% per tick" at 60 Hz is death in
    // 0.33 s — the S137 footgun this cadence exists to make impossible.
    expect(DOT_CADENCE_TICKS).toBe(30);
    expect(DOT_CADENCE_TICKS).toBe(0.5 * PHYSICS_HZ);
    expect(Number.isInteger(DOT_CADENCE_TICKS)).toBe(true);
  });

  it('every chewing creature: attackFireTick === chewHits × CHEW_INTERVAL_TICKS', () => {
    // ⚠ THE COUPLING THAT WAS ONLY A COMMENT. A.0b measured that breaking it makes the sever
    // dispatch at hostTick.ts:451 never fire: the chew loop caps at chewHits forever with the bond
    // left intact. Both values are hardcoded literals in voltkin-config.ts, so nothing but this
    // test connects them. Asserted across ALL configs so a new chewing type inherits the guard.
    const chewers = Object.entries(CREATURE_CONFIGS).filter(([, c]) => c.chewHits > 0);
    expect(chewers.length).toBeGreaterThan(0); // else this test would pass vacuously
    for (const [type, cfg] of chewers) {
      expect(cfg.attackFireTick, `${type}.attackFireTick`).toBe(cfg.chewHits * CHEW_INTERVAL_TICKS);
    }
  });
});
