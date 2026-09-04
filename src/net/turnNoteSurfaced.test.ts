/**
 * SPARK — S163 P3: **THE TURN REPAIR NOTE MUST REACH BOTH VERDICTS OF THE CONNECTION SELF-TEST.**
 *
 * `TURN_CONFIG_NOTE` records a TURN configuration this build repaired at boot. That is the owner's
 * LIVE case: the three GitHub secrets are still pasted as JS object-literal fragments, so
 * `parseTurnConfig` unwraps them on every load and sets the note every time.
 *
 * Its only consumer used to be the connection test's `.catch()` — and `parseTurnConfig` exists
 * precisely so the probe no longer crashes. So the warning was reachable only on the branch the
 * repair prevents. In practice it went to devtools and nowhere a player or the owner would see it.
 *
 * ⛔ A SOURCE-TEXT TEST, deliberately. `main.ts` is the composition root: the branch that composes
 * this string is inside a `.then()` inside an `onTestConnection` callback inside `makeLobbyScreen`'s
 * options object, with no seam to call it from a unit test, and `lobbyScreen.getConnectionTestText()`
 * is an accessor with no production caller. The realistic regression is textual — somebody edits one
 * of the two `showConnectionTestResult` calls and not the other — so that is what this pins. Same
 * posture as `protocolVersionSync.test.ts` and `ci.deployGate.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MAIN = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('S163 P3 — TURN_CONFIG_NOTE reaches both connection-test verdicts', () => {
  it('the prefix is built exactly ONCE, so the two branches cannot drift apart', () => {
    const declarations = MAIN.match(/const turnNotePrefix\s*=/g) ?? [];
    expect(declarations).toHaveLength(1);
  });

  it('⛔ BOTH showConnectionTestResult calls carry the prefix', () => {
    // The whole defect was that only one of them did.
    const calls = MAIN.match(/showConnectionTestResult\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const uses = MAIN.match(/turnNotePrefix/g) ?? [];
    // one declaration + one use per branch
    expect(uses.length).toBeGreaterThanOrEqual(calls.length + 1);
  });

  it('⭐ the SUCCESS branch specifically — the one that was missing it', () => {
    // Anti-vacuity: the count assertion above would still pass if both uses landed in the catch.
    // This pins the success call by its own arguments.
    expect(MAIN).toMatch(/showConnectionTestResult\(ok, headline, turnNotePrefix \+ detail\)/);
  });

  it('⛔ the note must NOT turn a passing verdict amber — `ok` stays the probe’s own answer', () => {
    // A gate that cries wolf teaches the reader to ignore it (S160, verify-deploy's LIVE carrier).
    // The repaired-paste case is advisory hygiene; the genuinely broken cases are already red via
    // HAS_TURN_CONFIGURED / summarizeIce. So the success call must pass `ok` through untouched.
    expect(MAIN).not.toMatch(/showConnectionTestResult\(\s*ok && TURN_CONFIG_NOTE/);
    expect(MAIN).toMatch(/const ok = rv\.ok && v\.ok;/);
  });
});
