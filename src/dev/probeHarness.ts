/**
 * SPARK — v0.6 ECONOMY PROBE HARNESS (V6-0.1, S128). DEV BUILDS ONLY.
 *
 * PURPOSE
 * -------
 * Settle the two blockers that gate the whole v0.6 economy pivot BEFORE seven Full-tier slots
 * of protocol/reducer/save surgery are spent on an untested premise:
 *
 *   B3 — THE FAUCET. `SPAWN_RATE_PER_SECOND = 0.1875` with `FREE_SPARK_TTL_TICKS = 600` (10 s)
 *        implies a standing free-spark pool of ~1.9 ARENA-WIDE by Little's Law. If that is right,
 *        an 8-slot bank takes ~256 s to fill and a type-filtered directive starves. This harness
 *        MEASURES the standing pool live, and lets `?spawn=` sweep λ.
 *
 *   B4 — THE CARVE-DOWN TACTIC. Every godly recipe is an EXACT isolated component (pentagram 5,
 *        lightningHub 6, Helga 7, Voltkin 8, laserTurret 8) and scoring has no per-component term.
 *        So a bank cap >= 5 plus a hard type filter makes "assemble the recipe directly, first
 *        try" rational — which would DELETE the build-big-then-carve tactic the pivot exists to
 *        protect. This harness puts an exact-type N-slot inventory in the player's hands and asks
 *        whether they still choose to build large and carve.
 *
 * THE EXPERIMENT (both Council legs independently rejected the first design, which gave free
 * material under carry-1 and could therefore only have illustrated starvation, never tested B4):
 *
 *   REGIME OLD — untouched game: carry-1 + uniform-random types. The baseline.
 *   REGIME NEW — an exact-type inventory of N slots. You choose what you hold.
 *   Switch LIVE, mid-match, with `[`. A rebuild would destroy the sensory A/B (Council R2).
 *
 * N IS A DIAL (4 / 8 / 12 / unlimited, `]`), not a fixed 8 — because a fixed 8 might be too few
 * to permit building large and would manufacture a "confirmed" reading. This turns a binary test
 * into a THRESHOLD measurement: find the slot count at which carving stops.
 *
 * ⚠ THE EVIDENCE IS ASYMMETRIC, AND THAT IS DELIBERATE. The owner has read the pivot and knows
 * the hypothesis, so an inventory UI prompts optimal play (Hawthorne / affordance effect).
 * Therefore: FALSIFICATION IS STRONG, CONFIRMATION IS WEAK. If you still build large and carve
 * down with an 8-slot exact-type inventory, B4 is genuinely dead and directives+bank are safe.
 * If you assemble recipes directly, that is SUGGESTIVE ONLY — corroborate with the measured
 * counters below (sculpt events, structure size), play the regimes in RANDOMISED order, and treat
 * a weak "confirmed" as authorising a second probe, not a redesign of directives.
 *
 * WHAT THIS IS NOT
 * ----------------
 * No castle. No gatherer entity. No bank entity. No directives entity. No new action type, no new
 * reducer, no protocol bump, no NetSnapshot field, no save format change, no `stateHash` change.
 * All of that is Phase 1 and each piece needs its own PDR. This harness only reaches the world
 * through TWO already-shipped, already-allowlisted actions — `SPAWN_SPARK` and `PICKUP_SPARK`
 * (`protocol.ts:453,455`) — so the existing place/bond flow runs completely unmodified.
 *
 * SAFETY
 * ------
 * · DEV builds only. `import.meta.env.DEV` is statically replaced with `false` in production, so
 *   this entire module dead-code-eliminates. Verify, don't trust: after `npm run build`, grep the
 *   production bundle for PROBE_SENTINEL — it must be ABSENT.
 *   ⚠ GREP `dist/assets/*.js`, **NOT** `dist/` (S132). A recursive grep also hits
 *   `index-*.js.map`, whose `sourcesContent` embeds the original TypeScript of every module by
 *   design — so the broad form reports a LEAK that isn't one. S132 tripped over exactly this.
 *   The executable contract, re-verified S132: zero occurrences of `probeHarness`,
 *   `takeFromInventory` or `seatShareReadout` in the entry chunk, and the entry stayed byte-for-byte
 *   at 645.5 KiB across this file's +120 lines — which is itself independent evidence of stripping.
 * · A redundant runtime guard throws if any entry point is somehow reached in a non-dev build.
 *   It lives INSIDE the stripped module, so it costs production zero bytes (Council R2 resolution
 *   between GROK's "don't rely on the bundler alone" and GEMINI's "don't add prod bytes").
 * · SOLO ONLY. Refuses to arm, and auto-disarms, in a networked match — so the wire, the bench
 *   gate and host migration are never touched.
 * · Spark ids are minted from a disjoint high range (PROBE_ID_BASE) so they cannot collide with
 *   the Spawner's own monotonic allocator. Consequence, stated: a probe session is not intended
 *   to be saved or replayed. Don't use it to produce replay fixtures.
 * · Consumes NO RNG. Nothing here draws from a seeded stream, per `constants.ts:885` ("NO 6th RNG
 *   stream"), so an armed probe cannot shift the replay draw order.
 */

import { SparkType, SPARK_VISUAL_SIZE, SPAWN_RATE_PER_SECOND, FREE_SPARK_TTL_TICKS, PHYSICS_HZ, MAX_PLAYERS } from '../constants.ts';

/**
 * The SHIPPED faucet, as a name rather than a magic number (S132). `SPAWN_RATE_PER_SECOND` is
 * `readTestSpawnRate() ?? 0.1875`, so once `?spawn=` overrides it the shipped value is no longer
 * recoverable from the constant — but both the OVERRIDDEN badge and the seat-share readout need it
 * to say anything true. This literal was already duplicated inline in `render()`; naming it removes
 * a magic number instead of adding one. Keep in lockstep with `constants.ts:107`.
 */
// S136 P4 — tracks the constants.ts default. MUST move with it: this value exists only to detect
// whether a ?spawn= override is in effect, so a stale copy would report an override as "shipped".
const SHIPPED_SPAWN_RATE_PER_SECOND = 1.125;

/** Mirrors `spawner.ts:47` — PHYSICS_DT is derived there, not exported from constants.ts. */
const PHYSICS_DT = 1 / PHYSICS_HZ;
import { makeFreeSpark } from '../game/spark.ts';
import { asSparkId } from '../types.ts';
import type { PlayerId, SparkId, Vec2 } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import type { GameAction } from '../state/world.ts';
// S143 P1 — the ONE sim-worker flag predicate, shared with main.ts. The refuse-to-arm guard
// below MUST track the worker's actual activation, not the spelling of a URL parameter.
import { isSimWorkerRequestedHere } from '../workerFlag.ts';

/** Grep target proving DEV-only stripping. MUST NOT appear in a production bundle. */
export const PROBE_SENTINEL = 'SPARK_V06_ECONOMY_PROBE_HARNESS';

/** Disjoint id range so probe sparks never collide with the Spawner's allocator. */
const PROBE_ID_BASE = 1_000_000;

const SLOT_LADDER: readonly number[] = [4, 8, 12, Number.POSITIVE_INFINITY];

/**
 * Sampler period. 100 ms rather than 250 ms because the median-build-gap statistic inherits this as
 * its resolution (S128 CHECK, GEMINI-AUDITOR), and the overlay states the resolution rather than
 * implying more precision than it has. Placement COUNTS are exact regardless — `diffOwned` reports
 * every added id in the window, not one event per window.
 */
const SAMPLE_MS = 100;

/**
 * How long the pool must be observed before its mean means anything (S132).
 *
 * The standing pool mixes on the TTL timescale, so a window of a few TTLs is dominated by the ramp
 * up from zero and carries only a handful of independent samples. Six TTLs = 60 s is the point at
 * which the ramp is ~1/6 of the window and the reading stops moving. S132 misread this pool twice
 * before measuring it properly (2.73 and 12.79 — both ramp/variance artifacts, not defects).
 *
 * ⚠ Counted in SIM TICKS, deliberately **not** in `poolSamples.length`. The sampler fires every
 * `SAMPLE_MS` (100 ms → ~10 samples/s) while the sim runs at 60 ticks/s, so a sample-count
 * threshold of `TTL * 6` would silently demand 360 s of hold while the message promised 60 s —
 * which is exactly the bug the first cut of this warning shipped, caught only by screenshotting
 * the overlay after a 63 s hold and seeing it still say "ramping".
 */
export const RAMP_SETTLE_TICKS = FREE_SPARK_TTL_TICKS * 6;

const TYPE_KEYS: Readonly<Record<string, SparkType>> = {
  '1': SparkType.Dot,
  '2': SparkType.Line,
  '3': SparkType.Triangle,
  '4': SparkType.Square,
  '5': SparkType.Circle,
  '6': SparkType.Spiral,
};

const TYPE_NAMES: Readonly<Record<SparkType, string>> = {
  [SparkType.Dot]: 'Dot',
  [SparkType.Line]: 'Line',
  [SparkType.Triangle]: 'Tri',
  [SparkType.Square]: 'Sqr',
  [SparkType.Circle]: 'Cir',
  [SparkType.Spiral]: 'Spi',
};

/**
 * Recipe component sizes — printed in the overlay next to the slot count on purpose. A cap at or
 * above any of these makes that recipe assemblable from one inventory load, which is precisely
 * the B4 mechanism. Sourced from src/state/godlyRecipes/*.ts.
 */
const RECIPE_SIZES: readonly (readonly [string, number])[] = [
  ['pentagram', 5], ['lightningHub', 6], ['Helga', 7], ['Voltkin', 8], ['laserTurret', 8],
];

type Regime = 'OLD' | 'NEW';

export interface ProbeDeps {
  getWorld(): World;
  dispatch(action: GameAction): void;
  readonly playerId: PlayerId;
}

interface Metrics {
  /** Ticks at which at least one placement was observed. Resolution = the sampler interval. */
  buildTicks: number[];
  /** TOTAL primitives placed (not windows-with-a-placement) — see `diffOwned`. */
  buildCount: number;
  /**
   * Count of SEVER ACTIONS, derived from set-difference rather than net count.
   * A sever deletes the smaller resulting component, so one action can remove many primitives;
   * what B4 asks is *whether* the player carves, so actions are the right unit, not primitives.
   */
  sculptEvents: number;
  /** Primitives removed in total, for context on how deep the carving goes. */
  primitivesRemoved: number;
  /** Rolling max of primitives owned, to see whether "build large" actually happens. */
  peakPrimitives: number;
  /** Standing Free-spark samples, for the B3 pool measurement. */
  poolSamples: number[];
  /** Tick the current regime was entered, so per-regime timings are separable. */
  regimeStartTick: number;
  /** Seconds of match elapsed when the win fired, or null. */
  winAtSec: number | null;
}

function freshMetrics(tick: number): Metrics {
  return {
    buildTicks: [], buildCount: 0, sculptEvents: 0, primitivesRemoved: 0,
    peakPrimitives: 0, poolSamples: [], regimeStartTick: tick, winAtSec: null,
  };
}

/**
 * Compare two snapshots of the player's owned-primitive id set.
 *
 * WHY A SET DIFF AND NOT A COUNT DELTA — this is the fix for the defect the S128 CHECK phase
 * called fatal. Comparing `count > prevCount` / `count < prevCount` ALIASES: if the player places
 * one primitive and severs one within the same sampling window, the net change is zero and BOTH
 * events vanish. Place two and sever one, and the sever vanishes. That bias runs in exactly the
 * worst direction for this instrument — it under-reports carving, which is the reading that would
 * wrongly "confirm" B4 and authorise redesigning directives. A set difference reports additions
 * and removals independently, so co-occurring events cannot cancel.
 *
 * Exported purely so the aliasing property is directly testable.
 */
export function diffOwned(
  prev: ReadonlySet<number>, next: ReadonlySet<number>,
): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const id of next) if (!prev.has(id)) added++;
  for (const id of prev) if (!next.has(id)) removed++;
  return { added, removed };
}

function guardDev(): void {
  if (!import.meta.env.DEV) {
    throw new Error(
      `${PROBE_SENTINEL}: reached in a NON-DEV build. This module must be dead-code-eliminated ` +
      `in production. Something imports it outside an import.meta.env.DEV branch — fix that ` +
      `rather than relaxing this guard.`,
    );
  }
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Seconds for the overlay. `null` (an unlimited bank) prints '—', never 'Infinity' or 'NaN'. */
function fmtSec(s: number | null): string {
  return s === null ? '—' : `${s.toFixed(0)}s`;
}

/** Median gap between consecutive build actions, in seconds. The V6-1.7 "is the player bored?" proxy. */
function medianBuildGapSec(buildTicks: readonly number[]): number | null {
  if (buildTicks.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < buildTicks.length; i++) gaps.push((buildTicks[i]! - buildTicks[i - 1]!) / PHYSICS_HZ);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
}

/**
 * Take one type off the inventory — **but only if the draw can actually happen** (S132).
 *
 * WHY THIS IS ITS OWN FUNCTION, AND WHY IT OWNS THE ARRAY
 * ------------------------------------------------------
 * This existed inline, and the carry-1 refusal sat BELOW the `shift()`. So pressing Q while
 * already carrying silently DESTROYED one slot — measured in a real browser as 8/8 → 7/8 (a
 * genuine draw) → 6/8 (a REFUSED draw, item gone anyway). Players press Q while carrying
 * constantly, so the bank leaked under exactly the input pattern the B4 playtest generates, and
 * `buildCount`/`peakPrimitives` under-read along with it. This is the instrument that settles a
 * blocker gating seven Full-tier slots, so a silent drain here corrupts the ruling.
 *
 * The reorder alone would be a one-line fix that the next edit could silently undo, and the live
 * handler is unreachable from vitest (Node has no `window`, so `installProbeHarness` returns
 * null). A source-text order assertion is the other tempting option and is a known trap in this
 * repo: `indexOf` over source matches your own COMMENTS, and the paragraph you are reading names
 * `shift` several times. So instead the decision and the consume live in ONE unit that owns the
 * array — which makes "consumed despite refusing" directly observable from a Node test, and makes
 * the bug class structurally hard to reintroduce rather than merely pinned by a comment.
 *
 * CONTRACT: returns `null` and leaves `inventory` **byte-identical** on every refusal path.
 * Mutates it by exactly one `shift()` iff it returns non-null.
 */
export function takeFromInventory(
  world: World,
  playerId: PlayerId,
  inventory: SparkType[],
): { readonly type: SparkType; readonly at: Vec2 } | null {
  const player = world.players.get(playerId);
  // carry-1 still holds: a player already holding a spark cannot draw another.
  if (player === undefined || player.kind !== 'Idle') return null;
  const type = inventory[0];
  if (type === undefined) return null;
  inventory.shift();
  return { type, at: { x: player.avatarPos.x, y: player.avatarPos.y } };
}

export interface SeatShareReadout {
  /** Seconds to fill `cap` slots at the CURRENT λ — what THIS run actually delivers. */
  readonly fillHereSec: number | null;
  /** The λ a single seat receives in a full 6-seat match at the SHIPPED faucet. */
  readonly fairShareLambda: number;
  /** Seconds to fill `cap` slots at that fair share — the number B3's ruling turns on. */
  readonly fillFairShareSec: number | null;
  /** True iff this run's λ already equals a fair 1/6 share, i.e. the run IS representative. */
  readonly representative: boolean;
}

/**
 * THE SEAT-SHARE TRAP (S132) — pure, so it is testable without a DOM or a browser.
 *
 * B3 is a **six-seat** claim, but this probe is **solo-only** by construction: it refuses to draw
 * and auto-disarms the moment a peer or bot appears, precisely so it never touches the wire. So the
 * local player receives the **entire arena faucet**, and at the shipped λ an 8-slot bank fills in
 * ~43 s here against ~256 s at a fair 1/6 share — a faucet **6× more generous than the condition
 * B3 describes**. Measured, S132: solo 41 s observed vs 248 s at a fair share.
 *
 * Reading the solo number as B3's number rules the blocker the WRONG WAY, and that ruling gates
 * seven Full-tier slots. The instrument cannot reproduce the condition it exists to test, so it
 * must at minimum say which condition it IS reproducing rather than leaving the division to the
 * reader. `?spawn=<shipped λ / MAX_PLAYERS>` makes a solo run representative.
 *
 * ⚠ `fillFairShareSec` is an IDEALISATION and must not be quoted as a prediction. Six seats do not
 * each receive λ/6; they contend for one shared pool, so a stronger player takes more than a sixth
 * and a weaker one less. It is the right number for ruling on *aggregate* supply, and the wrong
 * number for predicting any individual seat.
 */
export function seatShareReadout(cap: number, lambda: number): SeatShareReadout {
  const fairShareLambda = SHIPPED_SPAWN_RATE_PER_SECOND / MAX_PLAYERS;
  // An unlimited bank (SLOT_LADDER's ∞) has no fill time; so does a nonsensical λ. Return null
  // rather than Infinity/NaN so the renderer prints '—' instead of a number that looks measured.
  const finite = Number.isFinite(cap) && cap > 0;
  return {
    fillHereSec: finite && lambda > 0 ? cap / lambda : null,
    fairShareLambda,
    fillFairShareSec: finite ? cap / fairShareLambda : null,
    // Relative tolerance: a hand-typed, rounded ?spawn= should read as representative rather than
    // silently failing an equality check. S136 P4 — the fair share is now 1.125/6 = 0.1875.
    representative: Math.abs(lambda - fairShareLambda) <= fairShareLambda * 0.02,
  };
}

/**
 * Install the probe. Returns null (and touches nothing) unless DEV **and** `?probe=1`.
 * Call this from inside an `import.meta.env.DEV` branch in main.ts.
 */
export function installProbeHarness(deps: ProbeDeps): { dispose(): void } | null {
  if (!import.meta.env.DEV) return null;
  // Node / SSR / vitest safety, mirroring `readTestSpawnRate` at constants.ts:101. Without this,
  // merely importing this module and calling it from a non-browser test throws on `window`.
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (new URLSearchParams(window.location.search).get('probe') !== '1') return null;
  guardDev();

  const params = new URLSearchParams(window.location.search);

  // ── REFUSE TO ARM IN SIM-WORKER MODE (S128 CHECK, GEMINI-AUDITOR finding, verified) ──
  // `dispatchFn` routes to the worker as an INTENT when the sim-worker is active, and
  // `SPAWN_SPARK` is ABSENT from `CLIENT_INTENT_TYPES_RECORD` while `PICKUP_SPARK: true` is
  // present. So with the worker active the spawn would be dropped and the pickup would then
  // reference a spark that does not exist in the worker's authoritative world — a silent broken
  // state, in the instrument whose whole job is to produce a trustworthy measurement.
  //
  // ⛔ S143 P1 — THIS GUARD USED TO READ `params.get('worker') === '1'` AND THAT WAS BACKWARDS
  // FOR THE ONE CASE IT MATTERS IN. It asked about the SPELLING OF A URL PARAMETER, not about
  // the state it guards. With worker-on-by-default the param is ABSENT, so the old test was
  // FALSE, so the harness ARMED WHILE THE WORKER WAS ACTIVE — the exact broken-instrument state
  // this block exists to prevent, reached by the flip it was supposed to survive. It now asks
  // the same shared predicate `main.ts` uses to decide whether to construct the driver at all,
  // so the two can no longer disagree. See `workerFlag.ts`.
  if (isSimWorkerRequestedHere()) {
    console.error(
      `[probe] REFUSING TO ARM: the sim worker is active. SPAWN_SPARK is not a client intent, ` +
      `so the NEW-regime draw cannot survive the sim-worker path. Reload with ?worker=0.`,
    );
    return null;
  }

  // ── HMR SAFETY (S128 CHECK, both reviewers) ──
  // main.ts discards the handle, so a Vite hot reload would otherwise stack overlays, keydown
  // listeners and interval timers — each extra sampler double-counting into its own metrics.
  const g = globalThis as { __SPARK_PROBE__?: { dispose(): void } };
  g.__SPARK_PROBE__?.dispose();
  for (const stale of Array.from(document.querySelectorAll(`[data-probe]`))) stale.remove();
  let regime: Regime = params.get('regime') === 'new' ? 'NEW' : 'OLD';
  let slotIdx = (() => {
    const want = Number(params.get('slots'));
    const found = SLOT_LADDER.findIndex((n) => n === want);
    return found >= 0 ? found : 1; // default 8
  })();

  /** The exact-type inventory: types only, not entities. Drawn on demand. */
  const inventory: SparkType[] = [];
  let disarmedReason: string | null = null;

  /**
   * Owned-primitive id snapshot from the previous sample. Seeded from the LIVE world at install
   * (S128 CHECK, confirmed by both reviewers): starting from an empty set would make the first
   * sample report every pre-existing primitive as a fresh placement, inflating buildCount and
   * peakPrimitives — a measurement error in the owner's favour, which is the worst kind here.
   */
  let prevOwned: Set<number> = new Set();
  let metrics = freshMetrics(0);
  let lastPoolSampleTick = -1;

  /**
   * Probe spark ids live above every id the Spawner has issued. Recomputed at install AND before
   * every draw, rather than trusting a fixed constant: a long session or a loaded late-game save
   * could in principle carry ids past a hardcoded base (S128 CHECK, both reviewers), and a
   * duplicate SparkId would corrupt the very world being measured.
   */
  function nextFreeProbeId(world: World): number {
    let max = PROBE_ID_BASE - 1;
    for (const id of world.freeSparks.keys()) if ((id as number) > max) max = id as number;
    for (const id of world.primitives.keys()) if ((id as number) > max) max = id as number;
    return max + 1;
  }

  const slots = (): number => SLOT_LADDER[slotIdx]!;

  // ---- overlay (DOM, not Pixi — a dev tool has no business in the render tree) ----
  const el = document.createElement('div');
  el.setAttribute('data-probe', PROBE_SENTINEL);
  el.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'background:rgba(8,10,18,0.88)', 'color:#cfe3ff', 'padding:9px 11px',
    'border:1px solid #2c4a7a', 'border-radius:5px', 'white-space:pre',
    // 80ch, not 44ch (S132). `white-space:pre` never wraps, so max-width CLIPS instead — and 44ch
    // was already too narrow for content that shipped in S128: the REGIME line (53), a full 12-slot
    // INVENTORY (77) and the recipes-fitting line (77) were all silently cut off mid-word. Found by
    // screenshotting the overlay rather than reading its source, which is the only way this class of
    // defect shows up: every string was correct, only the viewport was wrong.
    'pointer-events:none', 'max-width:80ch',
  ].join(';');
  document.body.appendChild(el);

  function drawSparkFromInventory(world: World): void {
    if (regime !== 'NEW') return;
    if (disarmedReason !== null) return;
    // Re-check solo HERE, not only in the 250 ms sampler (S128 CHECK, GROK-ANALYST): a peer or bot
    // could appear between two samples and a keypress land in that window, dispatching into a
    // networked match. Two lines of insurance on a gate whose whole point is not to touch the wire.
    if (world.players.size > 1 || world.botSeats.size > 0) return;
    const drawn = takeFromInventory(world, deps.playerId, inventory);
    if (drawn === null) return;
    const { type, at } = drawn;
    const id: SparkId = asSparkId(nextFreeProbeId(world));
    // Existing actions only: mint a Free spark, then claim it through the normal pickup path.
    deps.dispatch({
      type: 'SPAWN_SPARK',
      spark: makeFreeSpark({
        id, type, pos: at, velocity: { x: 0, y: 0 },
        dt: PHYSICS_DT, createdTick: world.tick,
      }),
    });
    deps.dispatch({ type: 'PICKUP_SPARK', sparkId: id, playerId: deps.playerId, pos: at });
  }

  function onKey(e: KeyboardEvent): void {
    if (disarmedReason !== null) return;
    const world = deps.getWorld();
    if (e.key === '[') {
      regime = regime === 'OLD' ? 'NEW' : 'OLD';
      inventory.length = 0;
      metrics = freshMetrics(world.tick);
      prevOwned = ownedIds(world);
      return;
    }
    if (e.key === ']') { slotIdx = (slotIdx + 1) % SLOT_LADDER.length; return; }
    if (e.key === '\\') { metrics = freshMetrics(world.tick); return; }
    if (regime !== 'NEW') return;
    const t = TYPE_KEYS[e.key];
    if (t !== undefined) {
      if (inventory.length < slots()) inventory.push(t);
      return;
    }
    if (e.key === 'q' || e.key === 'Q') drawSparkFromInventory(world);
  }
  window.addEventListener('keydown', onKey);

  function ownedIds(world: World): Set<number> {
    const s = new Set<number>();
    for (const p of world.primitives.values()) {
      if (p.placedBy === deps.playerId) s.add(p.id as number);
    }
    return s;
  }

  function sample(): void {
    const world = deps.getWorld();

    // SOLO-ONLY: auto-disarm rather than interfere with a networked match.
    if (world.players.size > 1 || world.botSeats.size > 0) {
      if (disarmedReason === null) {
        disarmedReason = world.botSeats.size > 0
          ? 'bots detected — probe is solo-only'
          : 'networked match detected — probe is solo-only';
        inventory.length = 0;
      }
    }

    if (world.tick !== lastPoolSampleTick) {
      lastPoolSampleTick = world.tick;
      let free = 0;
      for (const s of world.freeSparks.values()) if (s.state.kind === 'Free') free++;
      metrics.poolSamples.push(free);
      if (metrics.poolSamples.length > 3600) metrics.poolSamples.shift();

      // Set difference, NOT a count delta — placements and severs in the same window must not
      // cancel each other out. See `diffOwned`.
      const owned = ownedIds(world);
      const { added, removed } = diffOwned(prevOwned, owned);
      if (added > 0) {
        metrics.buildCount += added;
        metrics.buildTicks.push(world.tick);
      }
      if (removed > 0) {
        metrics.sculptEvents++;            // one carving ACTION per window in which anything went
        metrics.primitivesRemoved += removed;
      }
      prevOwned = owned;
      metrics.peakPrimitives = Math.max(metrics.peakPrimitives, owned.size);

      if (metrics.winAtSec === null && world.gameState !== 'PLAYING' && metrics.buildTicks.length > 0) {
        metrics.winAtSec = (world.tick - metrics.regimeStartTick) / PHYSICS_HZ;
      }
    }
    render(world);
  }

  function render(world: World): void {
    const cap = slots();
    const capLabel = cap === Number.POSITIVE_INFINITY ? '∞' : String(cap);
    const inv = inventory.length === 0
      ? '(empty)'
      : inventory.map((t) => TYPE_NAMES[t]).join(' ');
    const gap = medianBuildGapSec(metrics.buildTicks);
    const elapsedTicks = world.tick - metrics.regimeStartTick;
    const elapsed = (elapsedTicks / PHYSICS_HZ).toFixed(0);
    const seat = seatShareReadout(cap, SPAWN_RATE_PER_SECOND);

    // λ·W predicts the standing pool. Show the PREDICTION beside the MEASUREMENT so the
    // Little's-Law claim in the spec is checked against the running game, not asserted.
    const predictedPool = SPAWN_RATE_PER_SECOND * (FREE_SPARK_TTL_TICKS / PHYSICS_HZ);
    const observedPool = mean(metrics.poolSamples);

    // Recipes that fit in ONE inventory load at this cap — the B4 mechanism, made visible.
    const fit = RECIPE_SIZES.filter(([, n]) => n <= cap).map(([name]) => name);

    // A/B ISOLATION WARNING (S128 CHECK, GEMINI-AUDITOR — confirmed and unfixable in-harness).
    // `[` resets the counters but CANNOT reset the world. If the owner builds large under OLD and
    // then toggles to NEW, any carving of that pre-existing structure is attributed to NEW — which
    // would falsely read as "players still carve under an inventory", the exact false-negative that
    // matters most here. The honest fix is procedural, so say so on screen rather than in a doc.
    const standing = prevOwned.size;
    const carryoverWarning = standing > 0
      ? `⚠ ${standing} of your primitives predate this counter reset.\n  For a clean A/B, RESTART the match after toggling regime.`
      : '';

    // λ MISMATCH (S128 CHECK). probeBootstrap depends on module import ORDER, so the override can
    // silently fail. GEMINI claimed the overlay would then falsely report OVERRIDDEN — refuted:
    // the value shown is the IMPORTED CONSTANT, so a failed override displays the true 0.1875.
    // But a silent no-op is still a trap, so compare requested against observed and shout.
    const requested = params.get('spawn');
    const lambdaMismatch = requested !== null
      && Number.isFinite(Number(requested)) && Number(requested) > 0
      && Math.abs(Number(requested) - SPAWN_RATE_PER_SECOND) > 1e-9
        ? `⚠ ?spawn=${requested} did NOT take effect (engine is running ${SPAWN_RATE_PER_SECOND}/s).\n  probeBootstrap.ts must be main.ts's FIRST import. B3 readings are INVALID.`
        : '';

    const lines = [
      `▍v0.6 ECONOMY PROBE — ${regime}${disarmedReason !== null ? '  [DISARMED]' : ''}`,
      disarmedReason !== null ? `  ⚠ ${disarmedReason}` : '',
      '',
      `REGIME   [ toggle · OLD = carry-1 + uniform (baseline)`,
      `SLOTS    ] cycle   · ${capLabel}${cap === Number.POSITIVE_INFINITY ? '' : ` of ${SLOT_LADDER.map((n) => (n === Number.POSITIVE_INFINITY ? '∞' : n)).join('/')}`}`,
      regime === 'NEW' ? `INVENTORY 1-6 add · Q draw · ${inventory.length}/${capLabel}  ${inv}` : '',
      '',
      `── B3 · faucet ─────────────────────`,
      lambdaMismatch,
      `λ observed      ${SPAWN_RATE_PER_SECOND.toFixed(4)}/s${Math.abs(SPAWN_RATE_PER_SECOND - SHIPPED_SPAWN_RATE_PER_SECOND) > 1e-9 ? '  (OVERRIDDEN)' : '  (shipped default)'}`,
      `TTL             ${(FREE_SPARK_TTL_TICKS / PHYSICS_HZ).toFixed(0)}s`,
      `pool λ·W pred   ${predictedPool.toFixed(2)}`,
      `pool observed   ${observedPool.toFixed(2)}   (n=${metrics.poolSamples.length})`,
      // ⚠ Judge the pool inside a long hold, never on the edge of the ramp. See RAMP_SETTLE_TICKS
      // for why this counts SIM TICKS and not `poolSamples.length`.
      elapsedTicks < RAMP_SETTLE_TICKS
        ? `  ⚠ ramping — hold ${(RAMP_SETTLE_TICKS / PHYSICS_HZ).toFixed(0)}s`
          + ` (${Math.ceil((RAMP_SETTLE_TICKS - elapsedTicks) / PHYSICS_HZ)}s to go)`
        : '  ✅ past the ramp — pool reading is settled',
      '',
      `── B3 · SEAT SHARE · READ FIRST ────`,
      `fill ${capLabel} slots, THIS run   ${fmtSec(seat.fillHereSec)}`,
      `fill ${capLabel} slots @ 1/6 share ${fmtSec(seat.fillFairShareSec)}  ← B3`,
      seat.representative
        ? `✅ = ONE SEAT of a ${MAX_PLAYERS}-seat match.`
        : `⚠ NOT ${MAX_PLAYERS}-seat-representative:\n`
          + `  solo takes the WHOLE faucet, so this run\n`
          + `  is ${(SPAWN_RATE_PER_SECOND / seat.fairShareLambda).toFixed(1)}× more generous than B3's case.\n`
          + `  FIX:  ?spawn=${seat.fairShareLambda}`,
      `  (1/6 = equal-split idealisation. Six seats\n`
      + `   contend for one pool, so the leader takes\n`
      + `   more. Aggregate supply only.)`,
      '',
      `── B4 · does carving survive? ──────`,
      `recipes fitting one load: ${fit.length === 0 ? 'none' : fit.join(', ')}`,
      `peak primitives owned    ${metrics.peakPrimitives}`,
      `sever actions            ${metrics.sculptEvents}`,
      `primitives removed       ${metrics.primitivesRemoved}`,
      carryoverWarning,
      '',
      `── V6-1.7 gate proxies ─────────────`,
      `placements      ${metrics.buildCount}`,
      `median gap      ${gap === null ? '—' : gap.toFixed(1) + 's'}  (±${(SAMPLE_MS / 1000).toFixed(2)}s resolution)`,
      `elapsed         ${elapsed}s${metrics.winAtSec !== null ? `   WIN @ ${metrics.winAtSec.toFixed(0)}s` : ''}`,
      '',
      `\\ reset counters · ?spawn=N&slots=N&regime=new`,
    ];
    el.textContent = lines.filter((l) => l !== '').join('\n');
  }

  // Seed the baseline from the LIVE world before the first sample, so pre-existing primitives are
  // never mistaken for placements (S128 CHECK).
  prevOwned = ownedIds(deps.getWorld());
  metrics = freshMetrics(deps.getWorld().tick);

  const timer = window.setInterval(sample, SAMPLE_MS);
  // Silence the unused-import complaint while keeping the visual-size constant documented as the
  // reason probe sparks need no bespoke sizing: makeFreeSpark already derives radius from it.
  void SPARK_VISUAL_SIZE;

  console.info(
    `[probe] ${PROBE_SENTINEL} ARMED (DEV only). regime=${regime} slots=${slots()} ` +
    `λ=${SPAWN_RATE_PER_SECOND}. Keys: [ regime · ] slots · 1-6 stock · Q draw · \\ reset.`,
  );

  const handle = {
    dispose(): void {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      el.remove();
      if (g.__SPARK_PROBE__ === handle) delete g.__SPARK_PROBE__;
    },
  };
  // Published so a Vite hot reload can dispose the previous instance (see the HMR guard above)
  // even though main.ts discards the handle.
  g.__SPARK_PROBE__ = handle;
  return handle;
}
