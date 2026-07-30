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

import { SparkType, SPARK_VISUAL_SIZE, SPAWN_RATE_PER_SECOND, FREE_SPARK_TTL_TICKS, PHYSICS_HZ } from '../constants.ts';

/** Mirrors `spawner.ts:47` — PHYSICS_DT is derived there, not exported from constants.ts. */
const PHYSICS_DT = 1 / PHYSICS_HZ;
import { makeFreeSpark } from '../game/spark.ts';
import { asSparkId } from '../types.ts';
import type { PlayerId, SparkId, Vec2 } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import type { GameAction } from '../state/world.ts';

/** Grep target proving DEV-only stripping. MUST NOT appear in a production bundle. */
export const PROBE_SENTINEL = 'SPARK_V06_ECONOMY_PROBE_HARNESS';

/** Disjoint id range so probe sparks never collide with the Spawner's allocator. */
const PROBE_ID_BASE = 1_000_000;

const SLOT_LADDER: readonly number[] = [4, 8, 12, Number.POSITIVE_INFINITY];

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
  /** Ticks at which a primitive count INCREASE was observed (a build action). */
  buildTicks: number[];
  /** Count of primitive-count DECREASES — only a sever can remove primitives ⇒ sculpt proxy. */
  sculptEvents: number;
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
    buildTicks: [], sculptEvents: 0, peakPrimitives: 0, poolSamples: [],
    regimeStartTick: tick, winAtSec: null,
  };
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
  let regime: Regime = params.get('regime') === 'new' ? 'NEW' : 'OLD';
  let slotIdx = (() => {
    const want = Number(params.get('slots'));
    const found = SLOT_LADDER.findIndex((n) => n === want);
    return found >= 0 ? found : 1; // default 8
  })();

  /** The exact-type inventory: types only, not entities. Drawn on demand. */
  const inventory: SparkType[] = [];
  let nextProbeId = PROBE_ID_BASE;
  let disarmedReason: string | null = null;

  let prevPrimCount = 0;
  let metrics = freshMetrics(0);
  let lastPoolSampleTick = -1;

  const slots = (): number => SLOT_LADDER[slotIdx]!;

  // ---- overlay (DOM, not Pixi — a dev tool has no business in the render tree) ----
  const el = document.createElement('div');
  el.setAttribute('data-probe', PROBE_SENTINEL);
  el.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'background:rgba(8,10,18,0.88)', 'color:#cfe3ff', 'padding:9px 11px',
    'border:1px solid #2c4a7a', 'border-radius:5px', 'white-space:pre',
    'pointer-events:none', 'max-width:44ch',
  ].join(';');
  document.body.appendChild(el);

  function drawSparkFromInventory(world: World): void {
    if (regime !== 'NEW') return;
    const type = inventory.shift();
    if (type === undefined) return;
    const player = world.players.get(deps.playerId);
    if (player === undefined || player.kind !== 'Idle') return; // carry-1 still holds
    const at: Vec2 = { x: player.avatarPos.x, y: player.avatarPos.y };
    const id: SparkId = asSparkId(nextProbeId++);
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
      prevPrimCount = countOwnedPrimitives(world);
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

  function countOwnedPrimitives(world: World): number {
    let n = 0;
    for (const p of world.primitives.values()) if (p.placedBy === deps.playerId) n++;
    return n;
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

      const owned = countOwnedPrimitives(world);
      if (owned > prevPrimCount) metrics.buildTicks.push(world.tick);
      else if (owned < prevPrimCount) metrics.sculptEvents++;
      prevPrimCount = owned;
      metrics.peakPrimitives = Math.max(metrics.peakPrimitives, owned);

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
    const elapsed = ((world.tick - metrics.regimeStartTick) / PHYSICS_HZ).toFixed(0);

    // λ·W predicts the standing pool. Show the PREDICTION beside the MEASUREMENT so the
    // Little's-Law claim in the spec is checked against the running game, not asserted.
    const predictedPool = SPAWN_RATE_PER_SECOND * (FREE_SPARK_TTL_TICKS / PHYSICS_HZ);
    const observedPool = mean(metrics.poolSamples);

    // Recipes that fit in ONE inventory load at this cap — the B4 mechanism, made visible.
    const fit = RECIPE_SIZES.filter(([, n]) => n <= cap).map(([name]) => name);

    const lines = [
      `▍v0.6 ECONOMY PROBE — ${regime}${disarmedReason !== null ? '  [DISARMED]' : ''}`,
      disarmedReason !== null ? `  ⚠ ${disarmedReason}` : '',
      '',
      `REGIME   [ toggle · OLD = carry-1 + uniform (baseline)`,
      `SLOTS    ] cycle   · ${capLabel}${cap === Number.POSITIVE_INFINITY ? '' : ` of ${SLOT_LADDER.map((n) => (n === Number.POSITIVE_INFINITY ? '∞' : n)).join('/')}`}`,
      regime === 'NEW' ? `INVENTORY 1-6 add · Q draw · ${inventory.length}/${capLabel}  ${inv}` : '',
      '',
      `── B3 · faucet ─────────────────────`,
      `λ observed      ${SPAWN_RATE_PER_SECOND.toFixed(4)}/s${Math.abs(SPAWN_RATE_PER_SECOND - 0.1875) > 1e-9 ? '  (OVERRIDDEN)' : '  (shipped default)'}`,
      `TTL             ${(FREE_SPARK_TTL_TICKS / PHYSICS_HZ).toFixed(0)}s`,
      `pool λ·W pred   ${predictedPool.toFixed(2)}`,
      `pool observed   ${observedPool.toFixed(2)}   (n=${metrics.poolSamples.length})`,
      '',
      `── B4 · does carving survive? ──────`,
      `recipes fitting one load: ${fit.length === 0 ? 'none' : fit.join(', ')}`,
      `peak primitives owned    ${metrics.peakPrimitives}`,
      `sculpt/sever events      ${metrics.sculptEvents}`,
      '',
      `── V6-1.7 gate proxies ─────────────`,
      `build actions   ${metrics.buildTicks.length}`,
      `median gap      ${gap === null ? '—' : gap.toFixed(1) + 's'}`,
      `elapsed         ${elapsed}s${metrics.winAtSec !== null ? `   WIN @ ${metrics.winAtSec.toFixed(0)}s` : ''}`,
      '',
      `\\ reset counters · ?spawn=N&slots=N&regime=new`,
    ];
    el.textContent = lines.filter((l) => l !== '').join('\n');
  }

  const timer = window.setInterval(sample, 250);
  // Silence the unused-import complaint while keeping the visual-size constant documented as the
  // reason probe sparks need no bespoke sizing: makeFreeSpark already derives radius from it.
  void SPARK_VISUAL_SIZE;

  console.info(
    `[probe] ${PROBE_SENTINEL} ARMED (DEV only). regime=${regime} slots=${slots()} ` +
    `λ=${SPAWN_RATE_PER_SECOND}. Keys: [ regime · ] slots · 1-6 stock · Q draw · \\ reset.`,
  );

  return {
    dispose(): void {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
