/**
 * SPARK — S182: **THE E2E DEV-SERVER PORT MUST BE PER-WORKTREE.**
 *
 * ⛔ WHAT THIS GUARDS, AND IT IS NOT HYPOTHETICAL. `playwright.config.ts` used to pin the dev server
 * to `--port 5173` with `reuseExistingServer: !CI`. Under the S182 parallel-worktree pattern the
 * second session to run `npm run e2e:gating` did not start a server — it adopted whichever branch's
 * Vite already held 5173 and ran its specs against THAT branch's code.
 *
 * Measured on `s182/damage-truth`: one run produced failure stack traces rooted in
 * `worktrees/s182-mp-identity-*` and `worktrees/s182-placement-*`; a later run reported 8 scattered
 * failures which vanished completely (65/65) the moment the lane ran on a private port.
 *
 * ⛔ THE DANGEROUS DIRECTION IS THE QUIET ONE. A falsely RED branch costs a session chasing a
 * phantom. A falsely GREEN branch ships having proved nothing about its own code — and nothing in
 * the output says so.
 *
 * ⚠ THIS FILE IS DELIBERATELY CRLF-SAFE. Its sibling `ci.e2eLanes.test.ts` slices a workflow file
 * with a `\n`-anchored regex; git checks that file out CRLF on Windows, so the anchor never matches,
 * the slice runs to EOF and swallows a later job's `continue-on-error`. It is RED on every Windows
 * checkout and green in CI, which reads as somebody else's broken test. No assertion here may depend
 * on a line ending: use `[\r\n]`, or match a single token.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const CONFIG = 'playwright.config.ts';
const raw = readFileSync(CONFIG, 'utf-8');

/**
 * ⛔ COMMENT-STRIPPED SOURCE. The docblock in the config NAMES the old port while explaining why it
 * is gone, so a whole-file `toContain('5173')` would fire on the explanation and a
 * `not.toContain('5173')` would fail on it. Assert against code, never against prose — the same trap
 * that made two tripwires vacuous elsewhere this session.
 */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The shipped derivation, re-implemented so a change to the algorithm has to be deliberate. */
function derive(cwd: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cwd.length; i++) {
    h ^= cwd.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 20000 + (h % 20000);
}

describe('S182 — the e2e dev server may not sit on a shared, fixed port', () => {
  it('⛔ no hardcoded port survives anywhere in the CONFIG CODE', () => {
    expect(code, 'a fixed port is how one worktree runs another branch').not.toContain('5173');
    expect(code).not.toContain("baseURL: 'http://localhost");
    expect(code).not.toContain('--port 5173');
  });

  it('the port is derived, and both the baseURL and the webServer url use the SAME origin', () => {
    expect(code).toContain('function e2ePort()');
    expect(code).toContain('const E2E_PORT = e2ePort()');
    expect(code).toContain('const E2E_ORIGIN = `http://localhost:${E2E_PORT}`');
    // ⛔ BOTH SITES, or Playwright serves on one port and navigates to another.
    expect(code).toContain('baseURL: E2E_ORIGIN');
    expect(code).toContain('command: `npm run dev -- --port ${E2E_PORT} --host`');
    expect(code).toContain('url: `${E2E_ORIGIN}/?debug=1`');
  });

  it('it derives from the WORKTREE PATH — env vars and dotfiles are not available here', () => {
    // SESSION_PORT is not exported into the Node process and .claude/session-port.json is gitignored
    // and auto-cleaned between sessions, so neither can be the source of truth. cwd always works.
    expect(code).toContain('process.cwd()');
    // …with an explicit escape hatch for anyone who needs a fixed port.
    expect(code).toContain('SPARK_E2E_PORT');
  });

  it('⭐ sibling worktrees get DISTINCT ports, and each is STABLE across runs', () => {
    const base = 'C:/Users/onesh/OneDrive/Desktop/Claude/Founder DNA/Extension Projects/The Spark';
    const paths = [
      base,
      `${base}/.claude/worktrees/s182-damage-truth-21ed2f`,
      `${base}/.claude/worktrees/s182-mp-identity-1e67e3`,
      `${base}/.claude/worktrees/s182-placement-03ea45`,
      `${base}/.claude/worktrees/s182-net-bandwidth-5e80f4`,
      `${base}/.claude/worktrees/s182-lightning-hub-fbb573`,
      `${base}/.claude/worktrees/s182-arcade-leaderboard-02a32c`,
    ];
    const ports = paths.map(derive);
    expect(new Set(ports).size, 'every worktree needs its own server').toBe(paths.length);
    // Stability: the same path must give the same port, or a debugging URL rots between runs.
    expect(paths.map(derive)).toEqual(ports);
  });

  it('every derived port is in the private range, clear of well-known services and of Vite', () => {
    for (const p of ['/a', '/b', '/some/deep/worktree/path', ''].map(derive)) {
      expect(p).toBeGreaterThanOrEqual(20000);
      expect(p).toBeLessThan(40000);
      expect(p).not.toBe(5173);
    }
  });

  it('⚠ the algorithm constants in the config still match the ones asserted here', () => {
    // If someone retunes the hash or the range, this test must be re-read rather than silently drift.
    expect(code).toContain('0x811c9dc5');
    expect(code).toContain('0x01000193');
    expect(code).toContain('20000 + (h % 20000)');
  });
});
