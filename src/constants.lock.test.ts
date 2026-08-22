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
import { attackFifths, connectorCapacityFifths } from './state/stats.ts';

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

  /**
   * ⭐ S151 P2 (owner R76) — THIS INVARIANT IS GONE BECAUSE THE COUPLING IT GUARDED IS GONE.
   *
   * It used to assert `attackFireTick === chewHits × CHEW_INTERVAL_TICKS`, because a chewer fired
   * ONCE at the end of a fixed five-bite span and that single strike severed the bond outright — so
   * if the two literals drifted, the sever dispatch never fired and the chew loop capped forever
   * with the bond intact.
   *
   * Neither half survives. `chewHits` is deleted (it was a CONNECTOR'S durability stored on the
   * ATTACKER — the same inversion owner R72 objected to in the goblin), and a gnawer now fires on
   * EVERY bite via the cadence, with the connector deciding when it gives way. The replacement
   * guard is the one below: the gnaw must be able to make progress at all.
   */
  it('every gnawing creature can actually get through a connector (the R76 replacement guard)', () => {
    const gnawers = Object.entries(CREATURE_CONFIGS).filter(([, c]) => c.chewsConnectors);
    expect(gnawers.length).toBeGreaterThan(0); // else this test would pass vacuously
    for (const [type, cfg] of gnawers) {
      // A bite must deal SOMETHING, or the chewer gnaws forever and the FSM never releases.
      expect(attackFifths(cfg.atk, cfg.pen), `${type} bite`).toBeGreaterThan(0);
      // And the cadence must be a positive integer number of ticks, since the fire gate is
      // `ticksInState % CHEW_INTERVAL_TICKS === 0` — a zero or fractional cadence would either
      // divide by zero or never align.
      expect(Number.isInteger(CHEW_INTERVAL_TICKS)).toBe(true);
      expect(CHEW_INTERVAL_TICKS).toBeGreaterThan(0);
    }
  });

  it('⭐ R76 — a connector in a COMPLEX structure genuinely outlasts one in a simple structure', () => {
    // The owner's whole reason for the change: "this will make people want to build complex
    // structures with as many connectors as possible". If bites-to-break stopped scaling with
    // complexity, the feature would be inert while every unit test still passed.
    const chewer = CREATURE_CONFIGS.chewer;
    const bite = attackFifths(chewer.atk, chewer.pen);
    const bitesFor = (connectors: number): number =>
      Math.ceil(connectorCapacityFifths(connectors) / bite);
    expect(bitesFor(2)).toBeGreaterThanOrEqual(bitesFor(1));
    expect(bitesFor(40)).toBeGreaterThan(bitesFor(2));
  });
});
