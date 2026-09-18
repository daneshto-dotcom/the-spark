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
const RUN_SRC = read('./render/arcadeRun.ts');
const OVERLAY_SRC = read('./render/arcadeRunOverlay.ts');

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

describe('S182 — the backend is LIVE, and the switch is a variable rather than a literal', () => {
  /**
   * ⚠ THIS BLOCK WAS TITLED "the backend is OFF" AND SAID THE OWNER HAD NOT APPROVED AN ACCOUNT.
   * He approved it in S182, the worker was deployed, and the go-live fact then landed in exactly two
   * of the seven places that asserted the old state — this file among the five that were missed. The
   * signature failure of this codebase, on the most consequential fact in the branch.
   */
  it('⛔ no base URL is hardcoded — the switch is a build-time variable, not a literal', () => {
    const code = CLIENT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // A literal worker URL in the source would tie the game to one deployment and make a fork or a
    // local build talk to the owner's account.
    expect(code).not.toMatch(/https?:\/\/[^\s'"]*workers\.dev/);
    expect(code).toMatch(/selectLeaderboard\(REMOTE_BASE\)/);
  });

  it('⭐ the selection rule is a PURE function, so both branches are deterministically testable', () => {
    // Two previous tests asserted `isSharedBoardConfigured() === false` and a local `kind`. Those
    // read the build-time constant, which is unset under vitest and SET in production — so they
    // asserted the opposite of what ships, passed anyway, and could never have caught a regression.
    expect(CLIENT_SRC).toContain('export function selectLeaderboard');
  });

  it('the submit flow is actually WIRED in main.ts, not merely exported', () => {
    // The S181 lesson: unreached code stays green. `submitRun` being correct is worthless if nothing
    // calls it, and no behaviour test in this suite drives main.ts's key handler.
    expect(MAIN_SRC).toContain('submitRun');
    expect(MAIN_SRC).toContain('revealBoard');
    // ⛔ THE STALE-REPLY GUARD MUST BE AT THE CALL SITE, or a slow reply repaints a finished run's
    // ranking over a run already in progress.
    expect(MAIN_SRC).toMatch(/if \(arcadeRun === pending\) arcadeRun = next/);
  });

  it('⛔⛔ R182-G — THE BOARD CANNOT BE REACHED WITHOUT SUBMITTING', () => {
    // Owner: "You can't see all the names before you put your name, and that way people won't cheat
    // and try to change each other's score." Identity is the typed name, so reading the table first
    // lets anyone type a rival's initials and drag their average down on purpose.
    //
    // Asserted as SOURCE TEXT because it is a structural claim: `revealBoard` is the only transition
    // into BOARD and it refuses anything but RECAP, which only `applyUpdate` can produce.
    expect(RUN_SRC).toMatch(/export function revealBoard[\s\S]*?if \(run\.phase !== 'RECAP'/);
    expect(RUN_SRC).toMatch(/export function applyUpdate[\s\S]*?if \(run\.phase !== 'ENTER_INITIALS'/);
    // And no renderer may read rows except through the accessor that is empty before RECAP.
    expect(OVERLAY_SRC).not.toMatch(/run\.update\.rows/);
    expect(OVERLAY_SRC).toContain('visibleRows(run)');
  });

  it('⛔ there is no `top()` — an un-gated read of the table would exist only to be misused', () => {
    // It was dead code under the old design and is a RULE violation under the new one.
    expect(CLIENT_SRC).not.toMatch(/top\s*\(boardId/);
  });

  it('the local tier remains the offline tier rather than a stub that was replaced', () => {
    expect(CLIENT_SRC).toContain('class LocalLeaderboard');
    expect(CLIENT_SRC).toMatch(/savePending/);
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

describe('S182 — the worker, live on the owner account', () => {
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

  it('⛔ N5 — the COUNT comes FIRST, so enforcing the limit cannot extend it', () => {
    /*
     * ⚠ THIS ASSERTION IS THE EXACT INVERSE OF WHAT IT SAID BEFORE, AND THE REVERSAL IS DELIBERATE.
     *
     * It used to pin "marker inserted BEFORE the count", on the reasoning that a race should
     * OVER-count rather than under-count. That reasoning was sound about floods and wrong about
     * everything else: it meant a marker was written for the very request the worker then REFUSED, so
     * every 429 pushed the window further out and an honest player who tripped the limit once kept
     * tripping it. A rate limit that is extended by being enforced is a lockout.
     *
     * The trade is stated at the call site: counting first means two concurrent requests can both
     * pass in a dead heat. Between "an attacker gets a few extra writes in a race" and "a real player
     * is locked out of their own ranking", the first is plainly the better failure.
     */
    const countAt = WORKER_SRC.indexOf('COUNT(*) AS n FROM writes');
    const insertAt = WORKER_SRC.indexOf('INSERT INTO writes (ip_hash, created)');
    expect(countAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt, 'the marker must be written AFTER the limit check').toBeGreaterThan(countAt);
    // And the refusal must return before reaching the insert at all.
    const refuseAt = WORKER_SRC.indexOf("error: 'slow down'");
    expect(refuseAt).toBeGreaterThan(countAt);
    expect(refuseAt).toBeLessThan(insertAt);
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

  it('⭐ the board is a COLUMN, so a second board is a value rather than a migration', () => {
    expect(SCHEMA_SQL).toMatch(/board\s+TEXT\s+NOT NULL/);
    expect(SCHEMA_SQL).toContain('idx_players_rank');
    expect(SCORES_SRC).toContain('export const BOARD_NONET');
  });

  it('⭐ R182-G — the ranking table stores SUM AND COUNT, never a rolling average', () => {
    // Folding into a stored mean rounds at every step and the error compounds with every game a
    // player ever plays — so the bug would not appear in testing and would appear, unfixably, after
    // a season of play. Both sides derive the mean instead.
    expect(SCHEMA_SQL).toMatch(/runs\s+INTEGER\s+NOT NULL/);
    expect(SCHEMA_SQL).toMatch(/total_ms\s+INTEGER\s+NOT NULL/);
    expect(SCHEMA_SQL).not.toMatch(/average_ms|avg_ms/);
    expect(SCORES_SRC).toContain('export function averageMsOf');
  });

  it('⛔ NOTHING PRUNES THE RANKING TABLE — deleting a player erases a whole history', () => {
    /*
     * The old per-RUN table was pruned past the top 25, which was harmless: a run that missed the
     * board was a row nobody would have seen. Carrying that forward would have been destructive in a
     * way that is easy to miss — deleting a PLAYER row erases their entire run history and silently
     * hands them a fresh average, which is both a data loss and a cheat (fall off the table, come
     * back with a clean slate).
     *
     * It is also unnecessary, and the reason is worth pinning: identity is a THREE-CHARACTER name
     * over a 37-character alphabet, so a board is bounded at 37^3 = 50,653 rows by construction.
     */
    // ⚠ SCAN THE CODE, NOT THE PROSE. The worker's own docblock quotes
    // `DELETE FROM players WHERE board = 'nonet';` as the manual remedy if the board is ever abused,
    // so an assertion over the raw file reads that explanation as the defect — the same trap
    // `ci.deployGate` records against itself.
    const code = WORKER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, 'comment-stripping must not have eaten the module').toContain('async function handle');
    expect(code).not.toMatch(/DELETE FROM players/);
    // The only deletes that remain are TIME-based sweeps of bookkeeping tables — the rate-limit
    // markers and the spent idempotency keys. Neither touches a player's history.
    expect(code.match(/DELETE FROM (\w+)/g) ?? []).toEqual([
      'DELETE FROM writes',
      'DELETE FROM seen_runs',
    ]);
  });

  it('⚠ the ordering rule is stated identically on both sides of the wire', () => {
    // average ASC, then runs DESC, then name ASC. If the server and client disagree, two players
    // looking at the same data see a different 4th place.
    expect(SCHEMA_SQL).toMatch(/runs DESC, name ASC/);
    expect(WORKER_SRC).toMatch(/if \(a\.runs !== b\.runs\) return b\.runs - a\.runs;/);
    expect(SCORES_SRC).toMatch(/if \(a\.runs !== b\.runs\) return b\.runs - a\.runs;/);
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

describe('S182 — module INITIALISATION order, which nothing else can see', () => {
  const CLIENT = read('./render/arcadeLeaderboard.ts');

  /**
   * ⛔⛔ THIS EXACT BUG BLACK-SCREENED THE GAME, AND ONLY IN PRODUCTION.
   *
   * `REMOTE_BASE` is a module-level `const` whose initialiser CALLS `parseLeaderboardBase`, which
   * reads `LEADERBOARD_ORIGIN_RE`. Declared after it, that read hits the regex's temporal dead zone
   * and throws `ReferenceError: Cannot access 'LEADERBOARD_ORIGIN_RE' before initialization` at
   * module load — taking `main.ts` down with it. No leaderboard, no game, no menu: a black screen.
   *
   * ⚠ AND IT IS INVISIBLE TO EVERY BEHAVIOUR TEST. With the variable UNSET — vitest, and any build
   * without a backend — `parseLeaderboardBase('')` returns at its empty-string guard before it ever
   * reaches the regex, so the dead zone is never entered and everything passes. The crash existed
   * only in a build with a real URL, which is to say only in production. It was caught by loading
   * the real game in a browser against the live worker, and nothing cheaper would have found it.
   */
  it('⛔ LEADERBOARD_ORIGIN_RE is declared BEFORE the const that calls into it', () => {
    const re = CLIENT.indexOf('const LEADERBOARD_ORIGIN_RE');
    const fn = CLIENT.indexOf('export function parseLeaderboardBase');
    const base = CLIENT.indexOf('const REMOTE_BASE');
    expect(re, 'CONTROL — the regex must exist').toBeGreaterThan(-1);
    expect(base, 'CONTROL — REMOTE_BASE must exist').toBeGreaterThan(-1);
    expect(re, 'the regex must precede REMOTE_BASE or module load throws in production').toBeLessThan(base);
    expect(fn, 'the parser must precede REMOTE_BASE for the same reason').toBeLessThan(base);
  });

  it('LOCAL_HOSTS too — the same dead zone, reached by the http branch', () => {
    expect(CLIENT.indexOf('const LOCAL_HOSTS')).toBeLessThan(CLIENT.indexOf('const REMOTE_BASE'));
  });
});

describe('N6 — ⛔ the leaderboard must never be able to red the GAME\'s production deploy', () => {
  const PKG = read('../package.json');
  const DEPLOY_YML = read('../.github/workflows/deploy.yml').split('\r\n').join('\n');
  const E2E_YML = read('../.github/workflows/e2e.yml').split('\r\n').join('\n');

  /**
   * ⭐ THIS IS THE `check:atlas` RULE, AND IT IS THE PROJECT'S, NOT MINE.
   *
   * S165 wired a sprite-sheet quality check into `npm run build`. The Pages deploy went red on a
   * missing Python module, nothing was actually caught, and the live site simply sat STALE while the
   * owner waited on new art. The standing rule from that incident: **a non-gameplay quality opinion
   * must NEVER block a live deploy.**
   *
   * `typecheck` was briefly `tsc -b --noEmit && tsc -p tsconfig.server.json`, and `deploy.yml` gates
   * the Pages deploy on `npm run typecheck` — so a type error in `server/leaderboard/worker.js`,
   * code that is not in the bundle and cannot affect the artifact GitHub Pages serves, could stop the
   * GAME from shipping. Same shape, same consequence.
   */
  it('⛔ `npm run typecheck` — which the deploy gates on — does NOT typecheck the worker', () => {
    expect(PKG).toMatch(/"typecheck":\s*"tsc -b --noEmit"/);
    expect(PKG, 'the worker must not be folded back into the deploy-gating script').not.toMatch(
      /"typecheck":\s*"[^"]*tsconfig\.server\.json/,
    );
  });

  it('the worker IS still typechecked — by its own script', () => {
    expect(PKG).toMatch(/"typecheck:server":\s*"tsc -p tsconfig\.server\.json"/);
  });

  it('⭐ and that script runs in CI, in its own job, alongside the `atlas-guard` precedent', () => {
    expect(E2E_YML).toContain('worker-typecheck:');
    expect(E2E_YML).toContain('npm run typecheck:server');
    // The precedent it follows — same shape, same reason.
    expect(E2E_YML).toContain('atlas-guard:');
  });

  it('⛔ and it is NOWHERE in the deploy workflow', () => {
    expect(DEPLOY_YML).not.toContain('typecheck:server');
    expect(DEPLOY_YML).not.toContain('tsconfig.server.json');
  });
});
