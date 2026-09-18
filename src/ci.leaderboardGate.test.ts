/**
 * SPARK — S182: source-text tripwires for the shared leaderboard.
 *
 * ⛔ WHY SOURCE TEXT AND NOT BEHAVIOUR. Every defect guarded here is one where the code RUNS FINE and
 * the damage is elsewhere: a bundle that differs between CI and a local build, a CORS header that is
 * permissive, a backend deployed to a store whose free tier cannot carry it. A behaviour test cannot
 * see any of them, because in each case the behaviour under test is correct.
 *
 * This is the same class of guard as `ci.deployGate.test.ts`, written for the same reason: S181
 * shipped eight defects green because the failure mode was UNREACHED CODE, and the answer the project
 * settled on is to assert that the call site EXISTS, not only that the function works.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CLIENT_SRC = read('./render/arcadeLeaderboard.ts');
const VITE_CONFIG = read('../vite.config.ts');
const WORKER_SRC = read('../server/leaderboard/worker.js');
const SCHEMA_SQL = read('../server/leaderboard/schema.sql');
const SCORES_SRC = read('./render/arcadeScores.ts');
const MAIN_SRC = read('./main.ts');

describe('S182 — the build stays reproducible, so verify-deploy keeps meaning something', () => {
  /**
   * ⛔ THE S158 P8 TRAP, WITH A DIFFERENT KEY. An undeclared `VITE_` name is ABSENT in a local build
   * and PRESENT-BUT-EMPTY in CI (GitHub expressions always produce a string), Vite inlines
   * `import.meta.env` as exactly the keys it found, and the two bundles then differ by those bytes.
   * `npm run verify-deploy` proves a deploy landed by comparing content hashes — so it would go red
   * on every green deploy, and a gate that cries wolf trains its reader to skip the run where it is
   * right. That regression cost a session once already.
   */
  it('⭐ VITE_LEADERBOARD_URL is DECLARED in vite.config, not merely read', () => {
    expect(VITE_CONFIG).toContain('VITE_LEADERBOARD_URL');
    expect(VITE_CONFIG).toMatch(/^\s*define:\s*turnDefines\s*,?\s*$/m);
  });

  it('the declaration DEFAULTS when unset, rather than leaving the key out', () => {
    expect(VITE_CONFIG).toMatch(/process\.env\[[^\]]+\]\s*\?\?\s*''/);
  });

  it('⭐ the client reads the DOTTED form, so vite.config\'s define is what replaces it', () => {
    // An aliased `const env = import.meta.env` has no textual match for the define and would work
    // only via Vite's internal whole-object merge — behaviour, not a documented contract.
    const code = CLIENT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, 'comment-stripping must not have eaten the module').toContain('getLeaderboard');
    expect(code).toContain('import.meta.env.VITE_LEADERBOARD_URL');
    expect(code).not.toMatch(/(?:const|let|var)\s+\w+\s*=\s*\(?\s*import\.meta\b[^;]*\.env\b/);
  });
});

describe('S182 — the backend is OFF, and shipping the seam did not ship the dependency', () => {
  it('⛔ no base URL is hardcoded — the gate is an env var the owner has not set', () => {
    const code = CLIENT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // A literal worker URL in the source would make the account exist in practice whatever the
    // env var said, which is precisely the decision that is not mine to make.
    expect(code).not.toMatch(/https?:\/\/[^\s'"]*workers\.dev/);
    expect(code).toMatch(/REMOTE_BASE\s*===\s*''\s*\?\s*new LocalLeaderboard/);
  });

  it('the async publish is actually WIRED in main.ts, not merely exported', () => {
    // The S181 lesson: unreached code stays green. `syncRunToBoard` being correct is worthless if
    // nothing calls it, and no behaviour test in this suite drives main.ts's key handler.
    expect(MAIN_SRC).toContain('syncRunToBoard');
    // ⛔ AND THE STALE-REPLY GUARD MUST BE AT THE CALL SITE. Without it a slow reply repaints a
    // finished run's board over a run already in progress.
    expect(MAIN_SRC).toMatch(/if \(arcadeRun === committed\) arcadeRun = synced/);
  });

  it('the local board remains the offline tier rather than a stub that was replaced', () => {
    expect(CLIENT_SRC).toContain('class LocalLeaderboard');
    expect(CLIENT_SRC).toMatch(/private readonly local = new LocalLeaderboard\(\)/);
  });
});

describe('S182 — the worker, if and when the owner ever says yes', () => {
  it('⛔ CORS is PINNED to the one origin and is never `*`', () => {
    // `*` on a public WRITE endpoint lets any page on the internet POST to this board from a
    // visitor's browser, including in a loop.
    expect(WORKER_SRC).toContain('https://spark-online.space');
    expect(WORKER_SRC).not.toMatch(/access-control-allow-origin['"]\s*:\s*['"]\*/);
  });

  it('⛔ a cross-origin WRITE is refused in the worker, not merely by CORS', () => {
    // CORS is enforced by the browser on the RESPONSE. It does not stop the request arriving or the
    // row being written — a script posting from another page would have its reply blocked and its
    // garbage stored anyway.
    expect(WORKER_SRC).toMatch(/if \(!ALLOWED_ORIGINS\.has\(origin\)\) return json\(\{ error: 'forbidden' \}/);
  });

  it('⛔ it is D1, NOT Workers KV — whose free tier is 1,000 writes per DAY', () => {
    expect(WORKER_SRC).toContain('env.DB.prepare');
    expect(WORKER_SRC).not.toMatch(/\benv\.[A-Z_]*KV\b/);
  });

  it('⭐ stage scoping is a COLUMN on day one, so the 30-stage ladder is not a migration', () => {
    expect(SCHEMA_SQL).toMatch(/board\s+TEXT\s+NOT NULL/);
    expect(SCHEMA_SQL).toContain('idx_scores_board_rank');
    expect(SCORES_SRC).toContain('export const BOARD_NONET');
  });

  it("⛔ the prune's ordering matches the read's, or it would evict rows still on screen", () => {
    // One ordering rule — `ms ASC, at ASC` — in the index, the SELECT and the DELETE subquery, and
    // it is the same rule as `compare()` in arcadeScores.ts.
    const orderings = WORKER_SRC.match(/ORDER BY ms ASC, at ASC/g) ?? [];
    expect(orderings.length).toBeGreaterThanOrEqual(2);
    expect(SCHEMA_SQL).toContain('ms ASC, at ASC');
  });

  it('the server re-clamps a submitted name rather than trusting the client to have done it', () => {
    expect(WORKER_SRC).toContain('function normaliseName');
    expect(WORKER_SRC).toMatch(/NAME_ALPHABET\s*=\s*'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '/);
  });

  it('the IP hash is SALTED — an unsalted SHA-256 of an IPv4 address is brute-forced in seconds', () => {
    expect(WORKER_SRC).toMatch(/hashIp\(ip, env\.IP_SALT/);
    expect(WORKER_SRC).toContain('`${salt}:${ip}`');
  });

  it('⚠ TOP_N agrees between the worker and the client, or the board truncates differently on each', () => {
    const workerN = /const TOP_N = (\d+);/.exec(WORKER_SRC)?.[1];
    const clientN = /export const TOP_N = (\d+);/.exec(SCORES_SRC)?.[1];
    expect(workerN, 'CONTROL — the worker must declare TOP_N').toBeDefined();
    expect(clientN, 'CONTROL — the client must declare TOP_N').toBeDefined();
    expect(workerN).toBe(clientN);
  });

  it("nothing in the repo deploys it — `wrangler.toml` still carries a placeholder id", () => {
    // The gate is the owner's, and it is not mine to quietly open by leaving a working config behind.
    expect(read('../server/leaderboard/wrangler.toml')).toContain('PASTE-THE-ID-FROM');
  });
});
