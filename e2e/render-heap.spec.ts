/**
 * SPARK — S124 P3: F10 RENDER-SIDE heap/census audit (~10k sim ticks, DIRECT mode).
 *
 * The other half of F10: S123 P3 audited the `?worker=1` split (main thread as a render
 * MIRROR + the worker isolate) — this spec audits the DIRECT host path, where sim AND the
 * full Pixi render stack share one heap. The churn-heavy VS-BOTS run (3×MID bots building,
 * severing, raiding, dying) is the render-leak crucible: every entity's renderer creates/
 * destroys Graphics per lifecycle, and a missed destroy() is invisible in a static world.
 *
 * Instruments (S123 machinery + one NEW probe):
 *   • stabilized double-GC heap floors (`--expose-gc` + precise memory; repeat until two
 *     consecutive floors differ <1MB) — bounds RETAINED growth, not sawtooth;
 *   • __SPARK__.renderCensus — recursive display-object count over app.stage + Pixi
 *     managed-texture count. A renderer leak shows as census growth DECOUPLED from entity
 *     counts even when heap noise masks the bytes. Entity counts recorded alongside so
 *     legitimate world growth is distinguishable in the log.
 *
 * ASSERT (S127 — recalibrated against MEASURED CI + local numbers; see the calibration block
 * below for the arithmetic, and LOCKED_DECISIONS §SOAK-CALIBRATION for why):
 *   • ALWAYS: display-object growth < a WINDOW-SCALED census limit, texture growth < TEXTURE_LIMIT
 *     (S169 — the latter now tolerates lazily-arriving race sheets; see the constant),
 *     the textures ≥ 0 Pixi tripwire, and post-GC heap growth < GROWTH_LIMIT_MB. Census and
 *     textures are the PRIMARY instruments here — entity-bounded and tick-INSENSITIVE, so they
 *     mean the same thing at 2 200 ticks as at 7 653.
 *   • measured ticks ≥ MIN_VALID_TICKS (floor of MEANING, i.e. the sim actually advanced).
 *   • The BYTE ceiling's resolution is window-dependent and is logged every run. Below
 *     MIN_STRICT_TICKS it is only a macro-leak detector and the run says so, loudly and in the
 *     report — it is NEVER silently treated as a per-tick leak verdict.
 * NOTE the header's "~10k sim ticks" is the TARGET, not the achieved window: TARGET_TICKS has
 * never actually been reached (7 653 local, 2 184-2 268 CI) because ticks are frame-bound.
 */
import { test, expect, type Page } from '@playwright/test';
import { canvasToCss, waitForWorld, titleButtonCss } from './helpers';

// Merged with the project launchOptions (test.use REPLACES them, so repeat the GL args).
test.use({
  launchOptions: {
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
    ],
  },
});

const WARMUP_TICKS = 1_200;
const TARGET_TICKS = 10_000;
const WALL_CAP_MS = 300_000;
const GROWTH_LIMIT_MB = 10;

// ── S127 calibration (all numbers measured; see LOCKED_DECISIONS §SOAK-CALIBRATION) ──────
//
// THE GOVERNING FACT: sim ticks are FRAME-bound, not time-bound. src/main.ts:1389 clamps
// `dtSec = min(deltaMS/1000, 0.05)` and src/constants.ts:169 sets PHYSICS_HZ = 60, so at most
// 3 ticks advance per RENDERED FRAME. Measured throughput in this churn-heavy VS-BOTS world:
// ~7.2-7.7 ticks/s on a 2-core SwiftShader CI runner (~2.5 fps) vs ~26 ticks/s locally.
// ⇒ THIS bots test never reaches TARGET_TICKS: 8 150 locally and 2 184-2 268 in CI, always
// `capped=true`. (Correction to the first S127 draft, which over-claimed that TARGET_TICKS is
// never reached on ANY platform — the NON-bots baseline in worker-heap.spec.ts DOES reach it,
// 10 307 ticks with capped=false in 176 s. The wall cap binds for BOTS worlds specifically,
// because they cost ~3.8x more per tick.) More ticks CANNOT be bought with wall-clock here
// (10k would need ~22 min in CI, and worse than linear as entities accumulate, since throughput
// falls as the world grows). Do NOT "fix" a short window by raising WALL_CAP_MS.
//
// WARM-UP WALL CAP: previously hardcoded 90_000 ms, which needs 13.3 ticks/s to cover
// WARMUP_TICKS — above what CI achieves. CI warm-ups were therefore truncated to ~648-693 of
// 1 200 ticks (54-58 %), so the s0 baseline was sampled MID-JIT/pool-settling. That is a
// second, independent source of the byte-heap noise band below. 240 s ⇒ 1.4x margin at the
// observed CI floor. Whether the cap bound is now LOGGED, never silently swallowed.
const WARMUP_WALL_CAP_MS = 240_000;

// ⛔ S195 T21 — THE WINDOW IS SIZED IN TICKS; ITS WALL CAP IS DERIVED FROM THE RATE THE WARM-UP MEASURED.
//
// Run 37047025269 (deploy #6): the bots worlds ran 3.6 ticks/s on CI — HALF the 7.2–7.7 every number
// in this file (and LOCKED_DECISIONS §15) was calibrated at — so the fixed 300 s window measured 1 098
// ticks and the MIN_VALID_TICKS (1 300) liveness floor fired on a sim that was alive, i.e. the floor
// had become the runner-speed criterion §15.1 rule 3 forbids. The TD-heavy baseline fell further
// (28.3 → 5.6 ticks/s) and ran out of TEST time instead (setup ~137 s + warm-up 226 s + window).
//
// ⚠ THIS IS NOT THE "BUY 10k TICKS WITH WALL-CLOCK" FIX §15.1 rule 2 rejects. The target stays
// TARGET_TICKS and stays unreachable for bots worlds; what is restored is the window S127 CALIBRATED
// against — ~2 200 CI ticks (2 154–2 301), which the census arithmetic (§15.3) and the floor were
// derived from. The wall cap is that design window divided by the warm-up's own measured rate
// (+15 %, because throughput falls as the world grows), clamped to [WALL_CAP_MS, WINDOW_WALL_CEIL_MS].
// A runner as fast as S127's gets exactly the old 300 s window; a slower one gets the TICKS, not a
// stretched limit. Every threshold below is still normalised to `measured`, unchanged.
const DESIGN_WINDOW_TICKS = 2_000;
const WINDOW_WALL_CEIL_MS = 600_000;
/**
 * Browser launch + goto + mode setup + the two stabilizedSample calls (measured ~137 s of setup on CI), plus
 * ⭐ S196 the title → second-match → title CYCLE after them (`CYCLE_WALL_CAP_MS` + a second bots setup, ~10 s):
 * 240 → 300 s. The e2e-soak lane still holds every audit (`ci.e2eLanes.test.ts` derives it from these three
 * constants: 60 + 1 140 + 2 × 1 140 = 3 480 s = the lane's 58 min, read from the yml, not this line).
 */
const SETUP_AND_SAMPLES_MS = 300_000;
const SOAK_TEST_BUDGET_MS = SETUP_AND_SAMPLES_MS + WARMUP_WALL_CAP_MS + WINDOW_WALL_CEIL_MS;
function windowWallCapMs(warmTicks: number, warmMs: number): number {
  const rate = warmTicks / Math.max(warmMs / 1000, 0.001);
  if (!(rate > 0)) return WINDOW_WALL_CEIL_MS;
  const need = Math.ceil(((DESIGN_WINDOW_TICKS / rate) * 1000) * 1.15);
  return Math.min(WINDOW_WALL_CEIL_MS, Math.max(WALL_CAP_MS, need));
}

// Gate for the STRICT byte-heap regime. NOT a pass/fail criterion — the old
// `MIN_MEASURED_TICKS = 4_000` was, and it is the assertion that failed 5/5 attempts in CI run
// 30374235685 while every substantive threshold PASSED. Honesty note: GROWTH_LIMIT_MB = 10
// resolves 10*1024/ticks KB/tick, so the docblock's historical "≥1 KB/tick" intent actually
// needs 10 240 ticks — unreachable on ANY platform here. Each regime logs what it truly resolves.
const MIN_STRICT_TICKS = 4_000;

// ── Census: the primary STRUCTURAL leak instrument. NORMALIZED, not a constant. ───────────────
//
// Three fixed constants were tried in S127 and all three were wrong, each refuted by the next
// sample: 75 (derived from wall-clock instead of SIM time — above the signal, would have missed a
// total leak), 30 (fine against an n=4 max of 13, then Δ20 landed ⇒ 1.5x), and 40 (then Δ39
// landed ⇒ it passed by ONE object). The lesson is not "pick a bigger number".
//
// ⚠ CORRECTION: earlier S127 drafts called this delta "tick-INSENSITIVE / entity-bounded", citing a
// Δ0/Δ20 pair at ~8.2k ticks as proof. **That was wrong**, and it also led me to reject
// GROK-ANALYST's CHECK proposal for a tick-SCALED limit. With n=7 the Δ0 reads as an outlier, not a
// law — the delta clearly DOES scale with the window:
//   ~2 200 ticks:            Δ4, Δ13, Δ4                    ⇒ max 13
//   ~7 650-8 890 ticks:      Δ11, Δ0, Δ20, Δ39              ⇒ max 39
// a 3.9x window ratio against a 3.0x noise-max ratio. Grok's shape was right; my n=4 rebuttal wasn't.
//
// SO: normalize. Creatures spawn at 2 per SIM second and t ticks is t/60 SIM seconds, so a TOTAL
// missed destroy() shows as `t/30` objects — and empirically the NOISE also scales, ~t/220. Their
// RATIO is therefore window-independent (~7.3x), which is exactly what makes a FRACTION of the
// signal the right assertion and any constant the wrong one.
//
// Asserting `CENSUS_LEAK_FRACTION × signal` holds ~2.6x over the observed noise AND ~2.9x under the
// total-leak signal at EVERY window (2.2k, 8.5k, 10.3k) — something no constant achieves. It also
// makes GEMINI-AUDITOR's blind spot STRUCTURALLY IMPOSSIBLE rather than merely patched: the limit
// can no longer exceed the signal, so the coupling to MIN_VALID_TICKS is dissolved, not maintained.
const CENSUS_LEAK_FRACTION = 0.35;
// Absolute floor, so a short window cannot drive the limit down into single digits. Stays below the
// signal at MIN_VALID_TICKS (limit 25 vs signal ~43), which is what preserves the guarantee above.
const CENSUS_FLOOR_OBJECTS = 25;

// Floor of MEANING, hard-asserted: below this, no assertion in this test carries information, so
// a red is honest — the run produced NO measurement and must be RE-RUN, never re-tuned.
//
// HISTORY worth keeping, because it is why the census limit is normalized rather than constant:
// S127 CHECK (GEMINI-AUDITOR, HIGH) caught that with a FIXED census limit the floor had to be high
// enough that even a TOTAL missed destroy() (~2t/60 objects) exceeded it, or the census assertion
// went blind exactly where it mattered. A first pass at 500 against a limit of 30 yields only ~17
// leaked objects — UNDER the limit — so a catastrophic 100 %-destroy-miss would have PASSED.
//
// NO LONGER COUPLED to the census limit, and that is an improvement rather than a regression:
// normalizing the census limit to a FRACTION OF THE SIGNAL (below) makes "limit above signal"
// arithmetically impossible, so the blind spot is designed out instead of held off by a derived
// constant. RALPH:PATROL F4 was right that a prose "keep these in sync" note is too weak a link —
// the fix it prompted (an expression) is simply superseded by removing the dependency altogether.
// (That expression also caused a temporal-dead-zone ReferenceError at module init, since it
// referenced a const declared further down. `tsc` would have caught it; tsconfig.json is
// include:["src"], so e2e/** is unchecked — hence the LOCKED §15.4 habit of running
// `npx playwright test <spec> --list` after any spec edit.)
//
// 1_300 is a pure liveness/meaning tripwire: 1.66x under the observed CI minimum (2 154) and ~6x
// under local (8 484-10 315). Below it the window is too short for ANY assertion here to mean
// something, so a red is honest — RE-RUN, never re-tune.
const MIN_VALID_TICKS = 1_300;

/*
 * ⭐⭐ S169 — RAISED 8 → 40, AND THE PREMISE ABOVE IT WAS INVALIDATED BY DESIGN, NOT BY A LEAK.
 *
 * The old text read: *"atlases/sprites are load-time, so entities never mint per-entity textures.
 * Observed Δ 0/0/+1/0 over n=4; 8 tolerates a lazily loaded atlas mid-run."* That was true while
 * `ensureAtlases` fetched EVERY sheet on first sync — 18 sheets, 50.53 MiB — so the texture count
 * was already at its ceiling before `s0` was ever sampled and growth really was ~0.
 *
 * S169 made the race-keyed sheets LAZY (owner: the green procedural puppet he saw was that 50 MiB
 * queue, with the sheet he needed behind up to sixteen he never would). They now arrive DURING the
 * measurement window, so texture growth is expected and load-bearing rather than suspicious.
 *
 * ⛔ THIS FAILED IN CI AT Δ8 AND WAS REPRODUCED LOCALLY AT Δ11 — worse, i.e. not boundary noise, and
 * that is why it was chased instead of dismissed. The evidence line named the cause outright:
 * `textures 82 → 93` while `census Δ48 vs limit 119` passed comfortably. A texture assertion, not a
 * leak assertion.
 *
 * ⚠ STILL A BOUND, AND DERIVED RATHER THAN PICKED. A VS-BOTS match seats up to 4 players, each race
 * warming THREE sheets (`preloadRaceKit`: raceUnit + tier-3 + tier-9 boss) = 12 sheets. Each sheet is
 * one texture plus its per-cell frames' base, so ~2-3 textures per sheet in practice; 40 covers 12
 * sheets with headroom and still sits an order of magnitude under a per-entity leak signal (~341
 * entity lifecycles happened inside this window — a per-entity mint would read in the hundreds).
 *
 * ⚠ IF THIS EVER FAILS AGAIN, READ THE EVIDENCE LINE FIRST: `textures A → B` growing roughly with
 * SEAT COUNT is this design working; growing with ENTITY COUNT is the leak this assertion is for.
 */
const TEXTURE_LIMIT = 40;

/*
 * ⭐⭐ S196 render-perf (F1) — **THE CENSUS NOW SEPARATES A FULL POOL FROM A LEAK, AND THE MATCH CYCLE IS ASSERTED.**
 *
 * S195 F1: a local 4 401-tick run failed this census at Δ+239 (limit 51), textures 115 → 144. The S196
 * attribution run (`render/renderCensus.ts` docblock) found no leak:
 *   · ~+216 of it was the board fx layers' POOLS reaching a new high-water mark when the first fight began
 *     (`FxLayer` keeps every sprite it has needed at once, hidden; cap `FX_LAYER_MAX_SPRITES` per layer). The
 *     census now reports `pooled`, and the assertion below is on the RESIDUAL (`displayObjects − pooled`) — the
 *     only part a missed destroy() can inflate — with `pooled ≤ poolCap` asserted on its own.
 *   · the texture count was Pixi's `managedTextures.length`, which never falls (a released texture is nulled in
 *     place). It is the LIVE count now; `textureSlots` keeps the old number for the log.
 *   · the rest: lazily-arriving race sheets (S169, by design) and the filter texture pool's size buckets.
 *
 * And the CYCLE — the question F1 actually asked (does the game get heavier the longer you play?): after the
 * soak window, return to the title (C1), play a second short match, return to the title again (C2). Measured
 * S196 (local, two full 7 000-tick matches): residual 809 → 809 (Δ0), pooled 1 201 → 1 205 (high-water),
 * live textures 151 → 175 (+24: a new race's lazy sheets + filter-pool buckets). The first-ever match adds a
 * one-time ~+337 of lazily-built, hidden UI (the bot-setup race picker and its cards), which is why C1 — not
 * the pre-match title — is the cycle's baseline.
 */
/** C2 − C1 residual tolerance. ⚠ MINE: measured Δ0 (n=1); 25 = the census floor, i.e. no looser than the window. */
const CYCLE_RESIDUAL_TOL = 25;
/** The second match runs past the backdrop hold (`ZONE_BG_HOLD_TICKS` 180) so the backdrop art loads and is released. */
const CYCLE_TICKS = 240;
/** ~67 s at the slowest CI rate seen (3.6 ticks/s); the cycle then simply measures fewer ticks, never fails on speed. */
const CYCLE_WALL_CAP_MS = 75_000;

interface RenderSample {
  heapMB: number;
  floorRounds: number;
  tick: number;
  census: Census;
  counts: { prims: number; bonds: number; sparks: number; creatures: number };
}

/** `render/renderCensus.ts` (S196): `pooled` ⊂ `displayObjects`; `textures` = LIVE; `textureSlots` = Pixi's `.length`. */
interface Census { displayObjects: number; pooled: number; poolCap: number; textures: number; textureSlots: number }
const residual = (c: Census): number => c.displayObjects - c.pooled;

async function readCensus(page: Page): Promise<Census> {
  return page.evaluate(() => (window as unknown as { __SPARK__: { renderCensus: Census } }).__SPARK__.renderCensus);
}

async function startBotsMatch(page: Page): Promise<void> {
  const vsBots = await titleButtonCss(page, 'vsBots');
  await page.mouse.click(vsBots.x, vsBots.y);
  await page.waitForFunction(
    () => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
      }).__SPARK__;
      return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
    },
    { timeout: 20_000 },
  );
  const startPt = await page.evaluate(() => {
    const s = (window as unknown as {
      __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
    }).__SPARK__;
    return s.botSetupOverlay.getUiPoints().start;
  });
  const startCss = await canvasToCss(page, startPt.x, startPt.y);
  await page.mouse.click(startCss.x, startCss.y);
  await waitForWorld(
    page,
    (w) => w.gameState === 'PLAYING' && w.players.length === 4,
    'bots PLAYING',
    20_000,
  );
}

/** S153 A2's exit: a DOUBLE Escape leaves a live match; then a few frames so every title-return clear() has run. */
async function returnToTitle(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE after double Escape', 20_000);
  await page.waitForTimeout(2_000);
}

/** One double-GC floor read (first pass queues finalizers, second collects). */
async function readFloorMB(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const w = window as unknown as {
      gc?: () => void;
      performance: { memory?: { usedJSHeapSize: number } };
    };
    if (typeof w.gc !== 'function') throw new Error('window.gc missing — --expose-gc did not take');
    if (w.performance.memory === undefined) throw new Error('performance.memory unavailable');
    w.gc();
    await new Promise((r) => setTimeout(r, 150));
    w.gc();
    await new Promise((r) => setTimeout(r, 150));
    return w.performance.memory.usedJSHeapSize / (1024 * 1024);
  });
}

/** Stabilized floor (S123 CHECK-hardened: repeat until two consecutive floors settle <1MB). */
async function stabilizedSample(page: Page): Promise<RenderSample> {
  let prev = await readFloorMB(page);
  let rounds = 1;
  for (; rounds < 10; rounds++) {
    const next = await readFloorMB(page);
    const settled = Math.abs(next - prev) < 1;
    prev = next;
    if (settled) break;
  }
  const rest = await page.evaluate(() => {
    const w = window as unknown as {
      __SPARK__: {
        renderCensus: Census;
        world: {
          tick: number;
          primitives: Map<number, unknown>;
          bonds: Map<number, unknown>;
          freeSparks: Map<number, unknown>;
          creatures: Map<number, unknown>;
        };
      };
    };
    const world = w.__SPARK__.world;
    return {
      tick: world.tick,
      census: w.__SPARK__.renderCensus,
      counts: {
        prims: world.primitives.size,
        bonds: world.bonds.size,
        sparks: world.freeSparks.size,
        creatures: world.creatures.size,
      },
    };
  });
  return { heapMB: prev, floorRounds: rounds, ...rest };
}

interface WaitResult {
  tick: number;
  /** true ⇒ the WALL CAP ended the wait, not the tick target (the window was truncated). */
  capped: boolean;
  /** `<elapsed>s:<tick>` samples — the declining-rate curve. */
  curve: string;
}

/**
 * S127 — now REPORTS how the wait ended, instead of returning void and hiding it. Two reasons:
 * (1) a truncated warm-up silently invalidated the s0 baseline in CI for two sessions;
 * (2) ticks are frame-bound, so throughput DECLINES as the world grows — the curve is the
 * evidence a future session needs to set a permanent window, rather than extrapolating a single
 * average across a heterogeneous run (the S126-P1 error, repeated once already in S127 PLAN).
 */
async function waitForTick(page: Page, target: number, wallCapMs: number): Promise<WaitResult> {
  const start = Date.now();
  const samples: string[] = [];
  for (;;) {
    const tick = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    const elapsed = Date.now() - start;
    samples.push(`${Math.round(elapsed / 1000)}s:${tick}`);
    if (tick >= target || elapsed >= wallCapMs) {
      return { tick, capped: tick < target, curve: samples.join(' ') };
    }
    await page.waitForTimeout(5_000);
  }
}

// S126 — ` @soak` routes this file to the non-gating `e2e-soak` CI job (see the
// matching note in worker-heap.spec.ts): ~5.9m locally, too slow for the fast
// regression lane whose whole job is a crisp green/red signal.
test.describe('S124 P3 — F10 render-side heap/census audit (direct mode) @soak', () => {
  test('VS-BOTS direct run: bounded post-GC heap + display-object census over ~10k ticks', async ({
    page,
  }) => {
    // S127 CHECK (RALPH:PATROL F1, HIGH) — DERIVED from the two sequential wall caps, never a bare
    // literal. Raising WARMUP_WALL_CAP_MS 90s→240s pushed caps alone to 540s of a hardcoded 600s
    // budget, leaving ~50s for browser launch + goto + the bots-setup flow + TWO stabilizedSample
    // calls (each up to 10 double-GC rounds). A 30% throughput dip would then time out DURING s1 —
    // and with PW_RETRIES: 0 and the evidence line printed only AFTER s1, that yields a red with NO
    // measurement, the exact outcome S127 exists to prevent. An expression, so it cannot drift when
    // a cap is retuned.
    test.setTimeout(SOAK_TEST_BUDGET_MS); // ⛔ S195 T21 — derived; see DESIGN_WINDOW_TICKS
    await page.addInitScript({
      content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;',
    });
    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
    await startBotsMatch(page);

    // Warm-up so JIT/pools/first structures settle before the baseline.
    const t0 = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    const warmStart = Date.now();
    const warm = await waitForTick(page, t0 + WARMUP_TICKS, WARMUP_WALL_CAP_MS);
    const windowCapMs = windowWallCapMs(warm.tick - t0, Date.now() - warmStart);
    // Never swallow a truncated warm-up: it invalidates the s0 baseline below.
    console.log(
      `[S124-P3 RENDER warm-up] ticks=${warm.tick - t0}/${WARMUP_TICKS} ` +
        `capped=${warm.capped} curve=[${warm.curve}]`,
    );
    // S127 CHECK (RALPH:PATROL A2) — annotate, not just log. A truncated warm-up is a BASELINE-
    // INVALIDATING degradation (s0 sampled mid-JIT/pool-settling), i.e. strictly worse than the
    // short-window case below, so it must not get weaker reporting than that case does.
    if (warm.capped) {
      test.info().annotations.push({
        type: 'truncated-warmup',
        description:
          `only ${warm.tick - t0}/${WARMUP_TICKS} warm-up ticks in ${WARMUP_WALL_CAP_MS}ms — ` +
          `s0 baseline sampled MID-SETTLING, so the heap delta below is inflated by JIT/pool churn`,
      });
    }

    const s0 = await stabilizedSample(page);
    const meas = await waitForTick(page, s0.tick + TARGET_TICKS, windowCapMs);
    console.log(`[S124-P3 RENDER window] capped=${meas.capped} wallCap=${Math.round(windowCapMs / 1000)}s curve=[${meas.curve}]`);
    const s1 = await stabilizedSample(page);

    const measured = s1.tick - s0.tick;
    const growthMB = s1.heapMB - s0.heapMB;
    // ⭐ S196 — the RESIDUAL: pool high-water marks are reported (below) and bounded, never counted as growth.
    const censusGrowth = residual(s1.census) - residual(s0.census);
    const pooledGrowth = s1.census.pooled - s0.census.pooled;
    const textureGrowth = s1.census.textures - s0.census.textures;
    const perKtickKB = (growthMB * 1024) / (measured / 1000);
    console.log(
      `[S124-P3 RENDER direct-bots] ticks=${measured} ` +
        `HEAP ${s0.heapMB.toFixed(1)}→${s1.heapMB.toFixed(1)}MB (Δ${growthMB.toFixed(2)}MB, ` +
        `${perKtickKB.toFixed(1)}KB/ktick, floors ${s0.floorRounds}/${s1.floorRounds}) ` +
        `CENSUS ${s0.census.displayObjects}→${s1.census.displayObjects} objects ` +
        `(residual Δ${censusGrowth}, pooled ${s0.census.pooled}→${s1.census.pooled} Δ${pooledGrowth} of cap ${s1.census.poolCap}), ` +
        `textures live ${s0.census.textures}→${s1.census.textures} (slots ${s0.census.textureSlots}→${s1.census.textureSlots}) ` +
        `counts ${JSON.stringify(s0.counts)}→${JSON.stringify(s1.counts)}`,
    );

    // ── S127 two-regime validity gate (replaces the hard MIN_MEASURED_TICKS floor) ─────────
    // The old `expect(measured).toBeGreaterThanOrEqual(4_000)` made the RUNNER'S RENDER
    // THROUGHPUT a pass/fail criterion. It is the assertion that failed 5/5 attempts in CI run
    // 30374235685 (2 268 / 2 184 / 2 217 here) while every substantive threshold PASSED.
    // Liveness is still asserted; hardware speed is not. Neither regime can pass silently.
    expect(measured).toBeGreaterThanOrEqual(MIN_VALID_TICKS);
    const resolvedKBPerTick = (GROWTH_LIMIT_MB * 1024) / measured;
    if (measured < MIN_STRICT_TICKS) {
      console.log(
        `[S124-P3 RENDER SHORT-WINDOW] measured=${measured} < ${MIN_STRICT_TICKS}: a per-tick ` +
          `byte-leak claim is NOT honest at this window. Heap Δ${growthMB.toFixed(2)}MB is ` +
          `RECORDED AS A MEASUREMENT; the ${GROWTH_LIMIT_MB}MB ceiling resolves only ` +
          `≥${resolvedKBPerTick.toFixed(1)}KB/tick here (macro-leak detector). ` +
          `Tick-insensitive invariants below are STILL ASSERTED.`,
      );
      // Annotated AND logged. S127 CHECK (RALPH:PATROL E2) corrected the original justification
      // here, which claimed the annotation surfaces in "the HTML report": it does not in THIS lane
      // — `e2e:soak` passes `--reporter=list`, and a CLI reporter REPLACES the config's
      // [['github'],['html']], which is why e2e.yml uploads test-results-soak/ rather than
      // playwright-report/. So the console.log above is the load-bearing record today (the list
      // reporter forwards test stdout) and the annotation is forward-compatible belt-and-braces for
      // any future run that keeps a structured reporter. Deliberately NOT fixed by adding a json
      // reporter to package.json: that file is in deploy.yml's push path filter, so editing it
      // would ship a PRODUCTION DEPLOY for a test-reporting tweak.
      test.info().annotations.push({
        type: 'short-window',
        description:
          `measured=${measured} < MIN_STRICT_TICKS=${MIN_STRICT_TICKS}; byte-heap sensitivity ` +
          `degraded to ≥${resolvedKBPerTick.toFixed(1)}KB/tick (frame-bound: see calibration block)`,
      });
    } else {
      console.log(
        `[S124-P3 RENDER STRICT-WINDOW] measured=${measured} ⇒ the ${GROWTH_LIMIT_MB}MB ceiling ` +
          `resolves ≥${resolvedKBPerTick.toFixed(1)}KB/tick.`,
      );
    }

    // Tick-INSENSITIVE — asserted in BOTH regimes. These are the instruments that actually work
    // on this hardware, and they are what makes a short-window green still meaningful.
    //
    // The census limit SCALES with the window, because both the leak signal and the two-sample
    // noise do (see the calibration block). This keeps ~2.6x over noise and ~2.9x under a
    // total-leak signal at every window size, which no fixed constant managed across n=7.
    const censusSignal = (2 * measured) / 60; // entity lifecycles in the window (2 per SIM second)
    const censusLimit = Math.max(CENSUS_FLOOR_OBJECTS, CENSUS_LEAK_FRACTION * censusSignal);
    console.log(
      `[S124-P3 RENDER census] Δ${censusGrowth} vs limit ${censusLimit.toFixed(0)} ` +
        `(${CENSUS_FLOOR_OBJECTS} floor, ${CENSUS_LEAK_FRACTION} × signal); ` +
        `~${censusSignal.toFixed(0)} entity lifecycles in window ⇒ detects a leak of ` +
        `≥${((censusLimit / censusSignal) * 100).toFixed(0)}% of them.`,
    );
    expect(censusGrowth).toBeLessThan(censusLimit);
    // ⭐ S196 — a pool may grow to its cap and no further (the census can tell the two apart only if this holds).
    expect(s1.census.pooled).toBeLessThanOrEqual(s1.census.poolCap);
    expect(s1.census.poolCap, 'anti-vacuity: the fx layers are on the stage').toBeGreaterThan(0);
    // Texture probe present (−1 = the Pixi internals moved; census invalid → fail loudly)…
    expect(s0.census.textures).toBeGreaterThanOrEqual(0);
    // …and load-time-bounded: entities reuse atlases, they never mint per-entity textures.
    expect(textureGrowth).toBeLessThan(TEXTURE_LIMIT);
    // Byte heap: asserted UNCONDITIONALLY, but understood as a macro-leak detector at short
    // windows. Deliberately NOT re-derived — n=3 CI samples cannot support a new threshold, and
    // the observed same-test spread here (−0.67 … +4.80MB) is itself ±2.7MB of noise.
    expect(growthMB).toBeLessThan(GROWTH_LIMIT_MB);

    // ⭐⭐ S196 (F1) — THE MATCH CYCLE: title (C1) → a second match → title (C2) returns to C1.
    await returnToTitle(page);
    const c1 = await readCensus(page);
    await startBotsMatch(page);
    const m2t0 = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    const m2 = await waitForTick(page, m2t0 + CYCLE_TICKS, CYCLE_WALL_CAP_MS);
    await returnToTitle(page);
    const c2 = await readCensus(page);
    console.log(
      `[S196 RENDER cycle] second match ${m2.tick - m2t0}/${CYCLE_TICKS} ticks (capped=${m2.capped}); title C1→C2: ` +
        `residual ${residual(c1)}→${residual(c2)} (Δ${residual(c2) - residual(c1)} vs tol ${CYCLE_RESIDUAL_TOL}), ` +
        `pooled ${c1.pooled}→${c2.pooled} of cap ${c2.poolCap}, textures live ${c1.textures}→${c2.textures} ` +
        `(Δ${c2.textures - c1.textures} vs ${TEXTURE_LIMIT}), slots ${c1.textureSlots}→${c2.textureSlots}`,
    );
    expect(residual(c2) - residual(c1)).toBeLessThan(CYCLE_RESIDUAL_TOL);
    expect(c2.pooled).toBeLessThanOrEqual(c2.poolCap);
    expect(c2.textures - c1.textures).toBeLessThan(TEXTURE_LIMIT);
  });
});
