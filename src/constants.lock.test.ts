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
import { MEMORY_FOG_COLOR } from './constants.ts';

describe('USER-LOCKED constants (LOCKED_DECISIONS.md)', () => {
  it('MEMORY_FOG_COLOR is pure black — LOCKED_DECISIONS.md §14, user decided twice (S63 + S86 round-6)', () => {
    expect(MEMORY_FOG_COLOR).toBe(0x000000);
  });
});
