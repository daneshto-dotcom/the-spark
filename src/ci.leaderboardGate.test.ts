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

describe('S182 — the wiring REPORT, and the S162 rule it exists to obey', () => {
  const REPORT_SRC = read('../scripts/leaderboard-wiring-report.mjs');

  /**
   * ⛔ THE S162 REGRESSION, RE-ARMED FOR A NEW KEY. `turn-wiring-report.mjs` once printed
   * `✅ RELAY WILL BE SHIPPED` for a build whose ICE config THREW, because it checked
   * `v.trim() !== ''` — the same insufficient test as the code it was watching. The recorded lesson:
   * *"A watchdog that shares the watched code's blind spot is not a watchdog."*
   *
   * These assertions are what stop the leaderboard report and the leaderboard client drifting apart.
   */
  const originRe = (src: string): string | undefined =>
    /const LEADERBOARD_ORIGIN_RE =\s*(\/.*\/[a-z]*);/.exec(src)?.[1];

  it('CONTROL — both files declare a LEADERBOARD_ORIGIN_RE (else the comparison is vacuous)', () => {
    expect(originRe(CLIENT_SRC)).toBeDefined();
    expect(originRe(REPORT_SRC)).toBeDefined();
  });

  it('⭐ the two LEADERBOARD_ORIGIN_RE literals are byte-identical', () => {
    expect(originRe(REPORT_SRC)).toBe(originRe(CLIENT_SRC));
  });

  it('⭐ the report validates SHAPE, not mere presence — it runs the same parse the client runs', () => {
    expect(REPORT_SRC).toContain('function parseLeaderboardBase');
    expect(CLIENT_SRC).toContain('export function parseLeaderboardBase');
    // It must be ABLE to say the words for "set, non-empty, and unusable" — the state that would
    // otherwise render as a green deploy and a board that still shows only your own scores.
    expect(REPORT_SRC).toMatch(/SET but UNUSABLE/);
    expect(REPORT_SRC).toMatch(/mixed content/);
  });

  it('⛔ the report can NEVER fail the deploy — an undeployed worker is a supported state', () => {
    // The S165 rule: an opinion about a not-yet-configured extra must never block shipping the game.
    expect(REPORT_SRC).toContain('process.exit(0)');
    expect(REPORT_SRC).not.toMatch(/process\.exit\([1-9]/);
  });

  it('⭐ the scheme-eating regression cannot come back — the label strip skips `//`', () => {
    // Caught by RUNNING the report, not by reading it: without the negative lookahead the stripper
    // reads `https:` as a `key:` prefix and eats the scheme, so every VALID url was rejected and
    // only wrapped ones survived. Pinned in both copies.
    for (const [name, src] of [['client', CLIENT_SRC], ['report', REPORT_SRC]] as const) {
      expect(src, `${name} must not strip a scheme as if it were a pasted label`).toContain('(?!\\/\\/)');
    }
  });

  it('deploy.yml runs the report AND passes the key to the build — both, or it is decoration', () => {
    const yml = read('../.github/workflows/deploy.yml').split('\r\n').join('\n');
    expect(yml).toContain('node scripts/leaderboard-wiring-report.mjs');
    // The build is the only step whose env actually reaches the bundle. A report without it would
    // print a confident green tick for a build that shipped nothing.
    const buildIdx = yml.indexOf('run: npm run build');
    expect(buildIdx).toBeGreaterThan(-1);
    const buildBlock = yml.slice(buildIdx, buildIdx + 800);
    expect(buildBlock).toContain('VITE_LEADERBOARD_URL');
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
    expect(WORKER_SRC).toMatch(/if \(!isAllowedOrigin\(origin\)\) return json\(\{ error: 'forbidden' \}/);
    // ⚠ AND THE LOCALHOST EXEMPTION MUST NOT LEAK INTO PRODUCTION ORIGINS. `isAllowedOrigin` widens
    // the allowlist to any localhost PORT (this project assigns a random one per session), which is
    // safe only because `Origin` is browser-set and unforgeable by a remote page. The regex must stay
    // anchored to localhost — a stray `.*` here would make the whole check meaningless.
    expect(WORKER_SRC).toMatch(/\^http:\\\/\\\/\(\?:localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)/);
  });

  it('⛔ it is D1, NOT Workers KV — whose free tier is 1,000 writes per DAY', () => {
    expect(WORKER_SRC).toContain('env.DB.prepare');
    expect(WORKER_SRC).not.toMatch(/\benv\.[A-Z_]*KV\b/);
  });

  /**
   * ⛔ THE RATE LIMITER COUNTED A TABLE IT ALSO PRUNED, so every submission that missed the top 25
   * erased its own evidence and the per-IP counter never rose above zero. Unlimited unauthenticated
   * writes from one IP. Four independent reviewers found this separately.
   */
  it('⛔ the rate limit counts `writes`, a table nothing prunes — never `scores`', () => {
    expect(WORKER_SRC).toMatch(/SELECT COUNT\(\*\) AS n FROM writes WHERE ip_hash/);
    expect(
      WORKER_SRC,
      'counting `scores` is self-defeating — the prune deletes the very rows being counted',
    ).not.toMatch(/COUNT\(\*\)[^;]*FROM scores/);
    expect(SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS writes/);
    // The prune must never touch the limiter's table.
    expect(WORKER_SRC).not.toMatch(/DELETE FROM writes WHERE board/);
  });

  it('⛔ the marker is inserted BEFORE the count, so a race over-counts rather than under-counts', () => {
    const insertAt = WORKER_SRC.indexOf('INSERT INTO writes');
    const countAt = WORKER_SRC.indexOf('COUNT(*) AS n FROM writes');
    expect(insertAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(insertAt);
  });

  it('⛔ IP_SALT fails CLOSED — a skipped setup step must not silently publish a known salt', () => {
    // Was `env.IP_SALT ?? 'spark'`: skipping one optional-looking runbook line salted every hash
    // with a constant published in this public repo, making the column a reversible encoding of
    // players' IP addresses while the code claimed otherwise.
    // ⚠ SCAN THE CODE, NOT THE PROSE — and the first cut of this guard failed on exactly that.
    // The worker's own docblock QUOTES the banned `env.IP_SALT ?? 'spark'` form in order to explain
    // why it is gone, so the assertion was reading the explanation as the defect. `ci.deployGate`
    // records this same trap two screens up in its own file; comments are stripped first, and the
    // CONTROL below proves the stripping did not simply empty the haystack.
    const code = WORKER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, 'comment-stripping must not have eaten the module').toContain('async function handle');
    expect(code).not.toMatch(/IP_SALT\s*\?\?/);
    expect(code).toMatch(/IP_SALT unset/);
  });

  it('⛔ every path is wrapped — an unhandled D1 error answers with NO CORS headers at all', () => {
    // Cloudflare's own 1101 error page carries no CORS headers, so the browser rejects it before the
    // client can read the status: a dead backend becomes pixel-identical to being offline.
    expect(WORKER_SRC).toMatch(/return await handle\(request, env, origin\)/);
    expect(WORKER_SRC).toMatch(/catch \(err\)/);
    expect(WORKER_SRC, 'the 500 must carry CORS headers like every other reply').toMatch(
      /json\(\{ error: 'server error' \}, 500, origin\)/,
    );
  });

  it('⛔ the board namespace is bounded by a registry, not by the id regex', () => {
    // BOARD_RE bounds the SHAPE of an id, not how many exist — and the prune only trims WITHIN a
    // board, so unlimited invented boards is unlimited storage that looks correctly capped.
    expect(WORKER_SRC).toMatch(/FROM boards WHERE board = \?1/);
    expect(SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS boards/);
    expect(SCHEMA_SQL).toMatch(/INSERT OR IGNORE INTO boards \(board\) VALUES \('nonet'\)/);
  });

  it('a malformed percent-escape in the path is a 400, not an uncaught URIError', () => {
    expect(WORKER_SRC).toMatch(/try \{\s*board = decodeURIComponent/);
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

  /**
   * ⛔⛔ THIS ASSERTION USED TO BE `toContain('PASTE-THE-ID-FROM')`, AND IT WAS A TRAP THAT WOULD HAVE
   * FIRED ON EXACTLY THE DAY THE FEATURE WAS TURNED ON.
   *
   * The intent was honest: while the owner had not approved a Cloudflare account, prove the repo
   * could not deploy one. But `deploy.yml` runs `npx vitest run` as a GATING step, so the first push
   * after pasting a real `database_id` into `wrangler.toml` would have gone red — and not red with a
   * leaderboard error, red with a failing unit test that stops the GitHub Pages deploy of the entire
   * game. The owner's reward for following the runbook would have been a dead site.
   *
   * ⚠ THE GENERAL LESSON, because this is the second time this project has built one: A GATE THAT
   * ASSERTS A TEMPORARY STATE MUST NOT LIVE IN A LANE THAT BLOCKS SHIPPING. `check:atlas` made the
   * same mistake in S165 (an asset-quality opinion wired into `npm run build`, which reddened the
   * Pages deploy on a missing Python module while the site sat stale). The standing rule that came
   * out of it — an opinion must never block a live deploy — applies to a gate guarding an approval
   * just as much as to one guarding a sprite sheet.
   *
   * What replaces it is the assertion that stays true forever and is the one that actually matters:
   * no SECRET is ever committed. `database_id` is not a credential — it is an opaque identifier that
   * is useless without account auth — but `IP_SALT` is, and `wrangler.toml` is exactly where a
   * hurried person would paste it, because the file is full of other settings.
   */
  it('⛔ no secret is committed in wrangler.toml — the id is not one, IP_SALT is', () => {
    const toml = read('../server/leaderboard/wrangler.toml');
    // The salt must be set out of band with `wrangler secret put`, never written into the repo.
    expect(toml).not.toMatch(/^\s*IP_SALT\s*=/m);
    expect(toml, 'the runbook for setting IP_SALT must stay in the file').toContain('wrangler secret put IP_SALT');
  });

  it('the README runbook never tells the owner to do something the test suite forbids', () => {
    // The trap above was only reachable BECAUSE the runbook instructed the paste. If a future gate
    // re-appears, this is the assertion that catches the contradiction between docs and tests.
    const readme = read('../server/leaderboard/README.md');
    expect(readme).toContain('database_id');
    expect(readme).toContain('wrangler secret put IP_SALT');
  });
});
