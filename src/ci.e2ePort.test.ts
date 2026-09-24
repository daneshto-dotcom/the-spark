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
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:net';

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
    expect(code).toContain('command: `npm run dev -- --port ${E2E_PORT} --strictPort --host`');
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

/**
 * ⛔ S189 — **AN OCCUPIED E2E PORT MUST FAIL FAST, NOT DRIFT TO +1 WHILE PLAYWRIGHT POLLS THE OLD ONE.**
 *
 * `vite.config.ts` sets `strictPort: false`. A socket still bound on the worktree's port that does
 * not answer HTTP (a hung orphan vite) is not reusable, so Playwright launches a fresh server; that
 * server printed "Port P is in use, trying another one...", bound P+1, and Playwright polled P for
 * the whole 60 s `timeout` and failed naming nothing. `--strictPort` on the webServer command makes
 * vite exit 1 at once instead.
 *
 * ⭐ THIS IS A REACH TEST, NOT A SOURCE-TEXT ONE. It lifts the argument list out of the config's own
 * `command:` line and runs the REAL vite with the REAL `vite.config.ts` against a port that is
 * genuinely held — so it proves the flag is present AND that it beats the config's `strictPort:
 * false` (a CLI flag the config silently overrode would pass a `toContain` and fail here).
 * The occupant listens with NO host argument — the same default (`::`, dual-stack where available)
 * vite's `--host` binds — because a `0.0.0.0` occupant does not block a `::` bind on Windows
 * (measured S189: vite started happily on the "occupied" port).
 */
/**
 * ⭐ S189 fix round (audit NET-6) — OPT-IN: `SPARK_SPAWN_VITE=1 npx vitest run src/ci.e2ePort.test.ts`.
 * The two cases that start REAL vite dev servers never run in the default suite, which gates the
 * live deploy. The source-level assertions around them always run.
 */
const SPAWN_VITE = process.env.SPARK_SPAWN_VITE === '1';

describe('S189 — the e2e webServer fails fast on an occupied port', () => {
  const m = code.match(/command: `npm run dev -- ([^`]*)`/);

  /** The webServer's vite arguments, exactly as the config writes them, with the port filled in. */
  function viteArgs(port: number, dropStrict = false): string[] {
    expect(m, 'webServer.command must stay `npm run dev -- <vite args>`').not.toBeNull();
    const args = m![1]!.replace('${E2E_PORT}', String(port)).split(/\s+/).filter(Boolean);
    return dropStrict ? args.filter((a) => a !== '--strictPort') : args;
  }

  function occupy(): Promise<{ srv: Server; port: number }> {
    return new Promise((resolve, reject) => {
      const srv = createServer(() => {});
      srv.once('error', reject);
      srv.listen(0, () => {
        const a = srv.address();
        if (a && typeof a === 'object') resolve({ srv, port: a.port });
        else reject(new Error('no port'));
      });
    });
  }

  /** Runs vite until it exits, or until `stopWhen` matches its output (then kills it). */
  function runVite(
    args: string[],
    stopWhen: RegExp | null,
    limitMs: number,
  ): Promise<{ code: number | null; out: string; ms: number; killed: boolean }> {
    return new Promise((resolve) => {
      const t0 = Date.now();
      // node + vite's bin directly: `npm run` would put a shell between us and the process we kill.
      // BROWSER=none: the config has `open: true`, and a test must not open a browser tab.
      const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args], {
        env: { ...process.env, BROWSER: 'none' },
      });
      let out = '';
      let killed = false;
      const onData = (d: Buffer): void => {
        out += d.toString();
        if (stopWhen && stopWhen.test(out) && !killed) {
          killed = true;
          child.kill();
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const timer = setTimeout(() => {
        killed = true;
        child.kill();
      }, limitMs);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, out, ms: Date.now() - t0, killed });
      });
    });
  }

  it('⛔ (audit NET-6) the default unit suite never spawns vite — the two spawning cases are opt-in', () => {
    // The unit suite gates the live deploy (`deploy.yml` runs `npx vitest run`). A test that starts real
    // dev servers there is slow, port-hungry and can hang a deploy on a busy runner, so the two REACH
    // cases below run only with SPARK_SPAWN_VITE=1 — and no workflow sets it.
    const self = readFileSync('src/ci.e2ePort.test.ts', 'utf-8');
    expect(self.match(/it\.runIf\(SPAWN_VITE\)\(/g)?.length).toBe(2);
    for (const wf of ['.github/workflows/deploy.yml', '.github/workflows/e2e.yml']) {
      expect(readFileSync(wf, 'utf-8'), wf).not.toContain('SPARK_SPAWN_VITE');
    }
  });

  it('the webServer command carries --strictPort (and still binds every interface)', () => {
    const args = viteArgs(1);
    expect(args).toContain('--strictPort');
    expect(args).toContain('--host');
    expect(args.slice(0, 2)).toEqual(['--port', '1']);
  });

  it.runIf(SPAWN_VITE)('⭐ REACH: the real vite, with the config\'s own arguments, EXITS 1 on a held port', async () => {
    const { srv, port } = await occupy();
    try {
      const r = await runVite(viteArgs(port), null, 25_000);
      expect(r.killed, `vite was still running after 25 s — it drifted instead of failing:\n${r.out}`).toBe(false);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`Port ${port} is already in use`);
    } finally {
      srv.close();
    }
  }, 40_000);

  it.runIf(SPAWN_VITE)('NEGATIVE: without the flag the same vite DRIFTS — the config alone does not fail fast', async () => {
    // This is why the flag is load-bearing: `vite.config.ts`'s `strictPort: false` is the behaviour
    // the flag has to override. If the config ever becomes strict itself, this goes red and the
    // docblock above should be re-read rather than the assertion flipped.
    const { srv, port } = await occupy();
    try {
      const r = await runVite(viteArgs(port, true), /trying another one/, 25_000);
      expect(r.out).toContain(`Port ${port} is in use, trying another one`);
      expect(r.killed, 'we stopped it ourselves — it never exited on its own').toBe(true);
    } finally {
      srv.close();
    }
  }, 40_000);
});
