/**
 * SPARK — canonical constants.
 * Source of truth for tunable numbers + locked enums.
 * Cross-reference: LOCKED_DECISIONS.md + SPARK_Blueprint.md v0.5.
 */

// Spec § IV — LOCKED. Do NOT rename.
export enum SparkType {
  Dot = 0,
  Line = 1,
  Triangle = 2,
  Square = 3,
  Circle = 4,
  Spiral = 5,
}

export const ALL_SPARK_TYPES: readonly SparkType[] = [
  SparkType.Dot,
  SparkType.Line,
  SparkType.Triangle,
  SparkType.Square,
  SparkType.Circle,
  SparkType.Spiral,
];

// Spec § IV color codes — LOCKED.
export const SPARK_COLORS: Record<SparkType, number> = {
  [SparkType.Dot]: 0xffffff,
  [SparkType.Line]: 0xffe066,
  [SparkType.Triangle]: 0xff3b3b,
  [SparkType.Square]: 0x3b5bff,
  [SparkType.Circle]: 0x3bff7a,
  [SparkType.Spiral]: 0xa23bff,
};

export const SPARK_VISUAL_SIZE: Record<SparkType, number> = {
  [SparkType.Dot]: 4,
  [SparkType.Line]: 24,
  [SparkType.Triangle]: 16,
  [SparkType.Square]: 14,
  [SparkType.Circle]: 18,
  [SparkType.Spiral]: 20,
};

// Player palette — 6 distinct, max-saturation seats. Index = seat = playerId.
// S62 — re-tuned P3..P6 to the N-player spec (yellow/green/orange/magenta).
// The 3-player ship set (crimson/cyan/yellow) is CVD-safe; green/orange
// collisions only appear at 4-6 players (carry-forward: shape-icon identity,
// S62 Council/Gemini — color alone is not a unique id beyond 3 players).
export const PLAYER_COLORS = [
  0xff3b6b, // P1 Crimson
  0x3bd7ff, // P2 Cyan
  0xffe23b, // P3 Yellow
  0x44ff5e, // P4 Green
  0xff8c1a, // P5 Orange
  0xd73bff, // P6 Magenta
  // S87 — 7th seat exists ONLY for VS-BOTS mode (1 human + up to 6 bots = 7
  // seats; user-mandated "up to 6 bots"). Networked play stays capped at
  // MAX_PLAYERS=6 — every wire/lobby validator keeps that cap. Silver reads
  // "robot"; seat identity beyond 3 players is carried by the B{n}/P{n}
  // nameplates anyway (S62 council note), so hue distinctness is secondary.
  0xc0c8d0, // B7 Silver (bots-mode only)
] as const;

// S62 — max seats per NETWORKED FFA match. Seats are 0..MAX_PLAYERS-1; seat →
// PLAYER_COLORS[seat]. S87: VS-BOTS mode alone may seat MAX_BOTS+1 players
// (human seat 0 + bot seats 1..MAX_BOTS); wire/lobby validators use THIS cap.
export const MAX_PLAYERS = 6;
// S87 — bots-mode caps. Local-only mode (no wire surface); PLAYER_COLORS must
// cover MAX_BOTS+1 seats (tsc-visible via the array literal above).
export const MAX_BOTS = 6;

// === Canvas, Spawner, Vision ===
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const SPAWNER_RADIUS = 250;
export const SPAWNER_CENTER_X = CANVAS_WIDTH / 2;
export const SPAWNER_CENTER_Y = CANVAS_HEIGHT / 2;
/**
 * S51 P1 — E2E test override seam. The seam is mirror-of-`PHASE_1_WIN_SCORE`:
 * Playwright `addInitScript` sets `window.__TEST_SPAWN_RATE_PER_SECOND__` BEFORE
 * the bundled scripts load, so the constant captures the override at module-init.
 * Production paths (SSR / Node tests / browser without addInitScript) fall through
 * to the production rate below.
 *
 * S105 — LOCKED_DECISIONS Item 3 AMENDMENT (owner-authorized this session): the
 * production rate is raised 0.15 → 0.1875 (×1.25 = primitives arrive ~20% sooner)
 * per the owner's explicit "make the spawned primitives come about 20% quicker".
 * The S5 "strategic-bet feel — wait for the type you need" intent is preserved (the
 * draw is still a slow Poisson process, just 20% brisker); the owner — who owns the
 * locked decision — directed the change, so this is a sanctioned amendment, not a
 * violation. Determinism is unaffected: λ scales the interarrival, not the RNG draw
 * order, so replay byte-identity holds for a fixed seed.
 *
 * Root cause of the old S50→S51 e2e cascade failure: with deterministic seed
 * `0xc0ffee` the spawner's first sampled interarrival at λ=0.15 was 25.71s
 * (mulberry32(0xc0ffee).first() = 0.0214 → -ln(0.0214)/0.15 = 25.71). The override
 * at λ=1.5 in the e2e specs drops the first wait to ~2.56s — same seed sequence,
 * just faster pacing — so production replay-determinism is unaffected.
 */
function readTestSpawnRate(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number })
    .__TEST_SPAWN_RATE_PER_SECOND__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
export const SPAWN_RATE_PER_SECOND = readTestSpawnRate() ?? 0.1875;

// S46 P2 Δ1 — host treats joiner's PICKUP_SPARK.pos as untrusted input;
// validates plausibility within REASONABLE_PICKUP_REACH of joiner's last
// authoritative avatarPos to prevent teleport exploit. Bound is the
// max plausible cursor-to-avatar distance during a normal LMB-release;
// strict enough to block warp-anywhere exploits, loose enough to never
// reject legitimate fast-flicking gameplay.
//
// S48 P3 (Sym A targeted fix): RAISED 250 → 600. Live S47 smoke
// reproduced joiner LMB-release silently dropping placements on host;
// rejectReasons telemetry (introduced this priority) will confirm
// pickupReachFail as the culprit. Root cause: avatarPos is 10Hz-
// throttled (100ms staleness) while cursor can swing 400+ px during a
// fast attract-drag-release at typical mouse speeds (500 px/sec × 100ms
// = 50px, but a flick gesture can hit 3000+ px/sec → 300px in 100ms).
// 250 was too tight; 600 is the cursor-displacement upper bound for a
// 200ms-latency flick. Still well below CANVAS_WIDTH=1920 so off-canvas
// teleport exploits remain blocked. If telemetry shows 600 also rejecting
// legitimate plays in S49, consider switching to a "within-canvas only"
// gate (drop reach check entirely).
export const REASONABLE_PICKUP_REACH = 600;

// Phase-2 vision (placeholders — unused in Phase 1)
export const R_PERSONAL = 75; // S63 — halved again 150→75 on live user feedback (reveal still too large around the spark). S58 (#1) had halved 300→150.
export const R_BEACON = 80;
// S58 (#3) — vision radius around your OWN creatures (e.g. Voltkin) so you can
// watch them fight in enemy territory instead of losing them to the fog. Larger
// than a static R_BEACON (the unit roams + you want to see the whole engagement),
// smaller than R_PERSONAL (it's a unit, not the hand). Tunable for balance.
export const R_CREATURE_VISION = 120;
export const VISION_FADE_PX = 40;

// === Fog-of-war MEMORY ("remembered areas", S59) ===
// A coarse exploration grid (state/exploredMemory.ts) is rasterized + bilinear-
// upscaled into the fog mask as an OPAQUE lighter-colour overlay over explored
// cells — NOT a partial-transparency, which would reveal the live board beneath
// (the rejected M1 "leak"). So scouted areas read as a dim "remembered" shade,
// never-seen areas stay near-black, and live vision punches fully-clear holes.
// Grid is resolution-independent (resize re-rasterizes); 48×27 = 40px square
// cells, bilinear-smoothed so the dim tier isn't blocky (live vision keeps the
// smooth RT, so the live edge is unaffected). Council S59 ADOPT HYBRID.
export const EXPLORED_GRID_COLS = 48;
export const EXPLORED_GRID_ROWS = 27;
// The opaque "remembered area" fog shade. Version history: S59 designed
// 0x161b2e → S63 USER tuning collapsed it to pure black → S85 P4b restored
// the dim tier as a carry-forward → S86 round-6 playtest verdict reverted it
// to black AGAIN ("the stupid blue fog is back... should be just black").
// ⚠ USER-LOCKED (LOCKED_DECISIONS.md §14 + constants.lock.test.ts): pure
// black, decided twice. Do NOT "restore" the dim tier without an explicit
// fresh user ask in the current session.
export const MEMORY_FOG_COLOR = 0x000000;
// S60 P2 — last-seen ENEMY-structure "ghost" silhouettes (the StarCraft remembered-
// building tier). A CPU last-seen Map (state/exploredMemory.ts) drives dim silhouette
// sprites in a memoryLayer ABOVE the live fog, masked by the live fog mask so a ghost
// shows ONLY in fogged (non-live) area; re-scouting reveals the real structure or
// confirms it gone. This alpha dims the remembered silhouette so it reads as memory,
// not a live unit. The silhouette is additive paint ABOVE the opaque fog (NOT a
// transparency hole), so alpha < 1 here never leaks the live board. Tunable in preview.
export const MEMORY_GHOST_ALPHA = 0.5;

// === Physics ===
export const PHYSICS_HZ = 60;
export const PHYSICS_SUBSTEPS = 8;
export const VELOCITY_DAMPING = 0.998;
export const POSITION_CORRECTION_CLAMP_RATIO = 0.5;
export const COLLISION_ITERATIONS = 8;

export type StiffnessTier = 'LOW' | 'MID' | 'HIGH';

// Verlet position-based dynamics — coefficient (NOT Hooke's k).
export const STIFFNESS_BY_TIER: Record<StiffnessTier, number> = {
  LOW: 0.2,
  MID: 0.5,
  HIGH: 0.8,
};

// Strain ratio at which a bond breaks (current_length / rest_length).
export const STRAIN_BREAK_BY_TIER: Record<StiffnessTier, number> = {
  LOW: 2.0,
  MID: 1.5,
  HIGH: 1.25,
};

// === Energy & Claim ===
export const ENERGY_PER_SECOND_FLAT = 5.0;

// === Disruption ===
export const BUILD_ACTIONS_PER_CHARGE = 5;
export const MAX_DISRUPTION_CHARGES = 2;
// S90 P2 (G1b DEFENSE) — a Diamond (Tri→Tri) / Lattice (Sq→Sq) costs an attacking player THIS many
// charges to HOSTILE-sever (a normal hostile sever costs 1). Set == MAX_DISRUPTION_CHARGES so an
// opponent must spend their ENTIRE disruption budget to break ONE defensive bond — a meaningful
// "resists enemy sabotage" premium, NOT invincibility (they CAN still break it at full cost, and
// physics/creature/bomb sever bypass this entirely — anti-sabotage ≠ hazard-immunity). #1 DEFENSE
// playtest knob; raise MAX_DISRUPTION_CHARGES first if "costs the whole budget" proves too swingy.
export const DEFENSIVE_SEVER_CHARGE_COST = 2;

// === Win condition ===
// Phase 1 single-player placeholder: trigger WIN at N primitives instead of % canvas.
// S9 P3: kept for back-compat / fallback tooling but unused in the WIN check —
// scoreProgress + PHASE_1_WIN_SCORE drive WIN now.
export const PHASE_1_WIN_PRIMITIVE_COUNT = 30;

// === Scoring weights (S9 P3 origin; S76 P3 repurposed as COMPLEXITY weights) ===
// S9-S75 these weighted a monotonic per-PLACEMENT accumulator (anchor +1, functional
// bond +1, magic bond +3 — banked once, never lost). S76 P3 REPLACED that model with a
// complexity-INCOME model (see SCORE_INCOME_PER_COMPLEXITY_PER_SEC below + state/scoring.ts).
// The SAME weights now define STANDING-structure complexity:
//     complexity(p) = (#p's primitives × SCORE_ANCHOR)
//                   + (#p's MAGIC bonds × (SCORE_MAGIC_BOND − SCORE_FUNCTIONAL_BOND))
//                   = #prims + 2×#magicBonds
// which reproduces the old accumulator's value for a finished TREE (so the 50-pt gate
// stays meaningful) but is recomputed from LIVE state every tick — so destroying a
// structure lowers it and you gain points slower (the user's intent). Counting every
// primitive (not "isolated anchors only") keeps a functional bond complexity-NEUTRAL,
// so connecting can never DROP your score (Council/Grok — closes a "don't-connect" exploit).
export const SCORE_ANCHOR = 1;
export const SCORE_FUNCTIONAL_BOND = 1;
export const SCORE_MAGIC_BOND = 3;
// === S84 P4 — functional bonds re-enter complexity, CAPPED ===
// Field report (4p FFA): builders' incomes "seemed similar" — with functional bonds at
// ZERO weight, a fully-CONNECTED tree earned exactly what the same prims earn scattered,
// flattening differences between building styles ("the whole point is that more complex
// structures get more points per tick"). Functional bonds now add 0.25 each, with the
// COUNTED bonds capped at floor(1.5 × #prims): a spanning tree (n−1 bonds) is fully
// counted (+~25% income when fully connected), but a dense clique field (k(k−1)/2 bonds)
// caps out — 10 prims/45 bonds counts only 15 → bond-spam earns barely more than a tree
// (Council S84 amendment, Grok degenerate-strategy challenge). The S76 "don't-connect"
// exploit cannot return: bonding only ever ADDS complexity.
export const FUNCTIONAL_BOND_COMPLEXITY = 0.25;
export const FUNCTIONAL_BOND_CAP_PER_PRIM = 1.5;
// === S90 P1 (G1b ECONOMY) — Filament (Dot→Line) income trickle ===
// A Filament is the dedicated "income" magic combo. It already earns the standard magic premium
// (MAGIC_BONUS = +2.0, uncapped — counted in the magicBonds branch of computeComplexity). This
// adds an EXTRA per-Filament complexity weight ON TOP of that. The double-count (magic premium +
// trickle) is INTENDED — Filament IS the income combo (Council R2 unanimous; PRIME-AUDIT A3
// flags it as an intended BUFF so a future auditor does NOT "fix" it the way S88 nerfed a bogus
// double-count). Uncapped + cheapest magic (Dot+Line, both basic prims) → spam-dominant risk
// (R12), so the default is conservative and this is the #1 PLAYTEST KNOB for the ECONOMY behavior.
export const FILAMENT_INCOME_COMPLEXITY = 0.6;

// === S76 P3 — complexity-INCOME rate ===
// Each physics tick the host accrues, per player: scoreByPlayer[p] += this × complexity(p)
// / PHYSICS_HZ. So your point-gain RATE ∝ the current total complexity of your standing
// structures: build more / more-magic → gain faster; lose structure → gain slower; hold
// complexity 0 → never progress. WIN still fires at PHASE_1_WIN_SCORE (floored).
//
// #1 PLAYTEST TUNABLE. VERSION HISTORY:
//   S76 P3  0.15  — shipped UN-playtested. complexity-20 wins in ~17s of accrual, complexity-50 in ~7s;
//                   because score accrues DURING the build-up, WIN=50 is reached mid-ramp → games ended
//                   in ~2 min and the bar "ticked too fast" (S78 user report).
//   S78 P1  0.05  — 3× slower accrual → ~3× longer games (≈5-6 min by feel). Directly addresses the
//                   "points tick too quick / over in 2 min" report. Lowest-risk lever: WIN stays 50 so
//                   the HUD, SCORE_TIER cadence, hunter trigger + all tests are untouched.
// If 0.05 still feels short on playtest, the NEXT lever is to RAISE PHASE_1_WIN_SCORE (50→~150) +
// SCORE_TIER_STEP (15→~50) so the build-up is a smaller fraction of the game (HUNTER_TRIGGER_SCORE
// auto-scales). Raise this rate → snappier; lower → grindier. (Host-only; deterministic/replay-safe.)
export const SCORE_INCOME_PER_COMPLEXITY_PER_SEC = 0.05;
/**
 * S50 P4 — E2E test override seam. Playwright's `page.addInitScript()` runs
 * BEFORE bundled scripts, so a `window.__TEST_WIN_SCORE__` assignment from
 * an init script is observable at module-load here. Production: window is
 * undefined (SSR / Node) OR override is absent → 150. Only positive finite
 * numbers override; any other shape falls through to the default.
 *
 * Scope: per-context (Playwright contexts are isolated), so the override
 * does not leak across test describes. See e2e/smoke.spec.ts Sym I describe
 * for the only call site that sets this (PRIME-AUDIT Δ2 mitigation).
 */
function readTestWinScore(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_WIN_SCORE__?: number }).__TEST_WIN_SCORE__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
// S79 P1 — 50→150 (user round-2 playtest "still runs a little quick" after the S78 income cut).
// Raising the WIN target (instead of cutting income again) makes the build-up ramp a smaller
// fraction of the match (~5-7 min by the S78 audit estimate) without touching the locked income
// feel. HUNTER_TRIGGER_SCORE auto-scales (75% → 112). SCORE_TIER_STEP raised in step (15→50)
// so tier-pulse cadence stays ~2-3 per match. All e2e specs inject __TEST_WIN_SCORE__/score
// seams, so this constant is e2e-timing-safe (the S78 hunter.spec lesson).
// S84 P3 — 150→210 (user: "make the game last like 20% longer"). Co-tuned with the S84 P4
// functional-bond complexity weight (+~15% typical late-game income for connected builders):
// 210/150 = 1.40 score budget ÷ 1.15 income ≈ +22% duration for typical play, ≈ +40% for
// pure-blob builders (who gain no bond income — building connected now also ENDS games
// sooner than scattering, the intended incentive). Hunter auto-scales (75% → 157).
// S91 G2-PROMO — 210→630 (×3, with SCORE_TIER_STEP 70→210 in lockstep so the exact-thirds tier
// cadence is preserved). Offsets the structural 8× magic-income premium that promoting Dot→Square
// (Anchor) + Line→Circle (Spindle) to magic adds to combo-leaning builds: holds the canonical
// P=20/B=30 combo build's match length ~constant (152.7s → 157.5s). Accepted v1 trade-off: a pure
// non-combo/blob builder (complexity unchanged) runs ~3× longer — builders out-pace blobs, the
// intended incentive. HUNTER_TRIGGER_SCORE auto-scales (75% → 472). User-approved S91. Damped
// per-combo-premium fallback logged in BACKLOG if blob matches feel too long on playtest.
// S106 — 630→786 (×1.248, owner: "the game needs to last 25% longer ... so players can actually
// try to do shit and build stuff and compete"). SCORE_TIER_STEP raised 210→262 in LOCKSTEP below so
// the exact-thirds tier cadence holds (786=3×262; pulses at 262/524, WIN at 786). HUNTER_TRIGGER_SCORE
// auto-scales to floor(786×0.75)=589. Owner-authorized amendment to the "protected anchor".
// S110 P1 — 786→1500 (×1.908, owner live-playtest: "you can barely build anything before you win
// because some structures take so long to build" → ~2× match length so slow/complex structures finish).
// SCORE_TIER_STEP raised 262→500 in LOCKSTEP below so exact-thirds holds (1500=3×500; pulses at
// 500/1000, WIN at 1500). HUNTER_TRIGGER_SCORE auto-scales to floor(1500×0.75)=1125. Owner-approved S110.
export const PHASE_1_WIN_SCORE = readTestWinScore() ?? 1500;

// === Spawner physics ===
export const SPAWNER_BOUNCE_DAMPING = 0.92;
export const SPARK_INITIAL_VELOCITY_MIN = 5;
export const SPARK_INITIAL_VELOCITY_MAX = 20;

// Phase-1 soft-cap. Despawn-on-overflow keeps the spawner zone playable
// during long sandbox sessions. Oldest Free sparks despawn first; Carried
// sparks never despawn (they belong to the player FSM).
export const FREE_SPARK_SOFT_CAP = 50;

// S109 P1 — un-claimed shapes self-despawn after 10s so the spawn zone never
// piles into chaos (owner playtest #6). This is a TTL reap that runs BEFORE the
// count-cap each tick (physicsLoop.reapExpiredFreeSparks). Only Free sparks are
// reaped — Carried/Bonded never expire (a spark dropped after a long carry gets a
// FRESH window: applyDropSpark re-stamps createdTick = world.tick). NOTE: there is
// deliberately NO velocity clamp — the fast-fling (grab a shape, scatter the pile
// to deny opponents) is an intended owner TACTIC; the TTL alone bounds pile growth.
export const FREE_SPARK_TTL_TICKS = 10 * PHYSICS_HZ; // 600 ticks = 10s

// === AttractDrag follow (S10 P1) ===
// Replaces S5's impulse-on-prevPos model (which produced a damped pendulum
// under verlet damping 0.998 → user-reported "stupid magnet slowly swinging
// back and forward"). Position-lerps spark.pos toward cursor per substep;
// prevPos is restored to the pre-lerp pos so residual velocity ≈ lerp delta,
// not a momentum accumulator. At 8 substeps/frame this closes ~38% of the
// gap per frame → halves remaining distance in ~30ms. Snappy follow, no
// overshoot. ATTRACT_STRENGTH (S5-era) removed.
export const ATTRACT_FOLLOW_RATE = 0.06;

// === Structure cinematics (S10) ===
// Pulse timing for STRUCTURE_GROW: each bond hop delays the next primitive's
// flash by HOP_TICKS; the flash lasts FLASH_TICKS. Total effect lifetime
// ≈ maxHop * HOP_TICKS + FLASH_TICKS. At 60Hz: 4 ticks ≈ 67ms hop, 18 ticks
// ≈ 300ms flash. A 10-deep component finishes in ~700ms.
export const STRUCTURE_GROW_HOP_TICKS = 4;
export const STRUCTURE_FLASH_TICKS = 18;

// Per-primitive verlet impulse for STRUCTURE_MERGE: each prim in the
// candidate's component gets a prevPos nudge toward the new prim.
// 1.2 px on a 60-px bond ≈ 2% strain delta — well under LOW-tier break
// threshold (2.0×). Single application; decays via VELOCITY_DAMPING.
// S13 P3 bump: 1.2 → 3.0 px for playtest visibility (user reported "can't
// see any difference" at 1.2). 5% strain on a 60-px bond — still 5×
// headroom against HIGH-tier 25% break. Compression-only (impulse is
// INWARD on cand component); bonds break on extension only per
// physics/bonds.ts:58, so compression is intrinsically safe.
export const MERGE_IMPULSE_MAGNITUDE = 3.0;

// S13 P3 short-bond safety clamp. When the merge bond's rest_length is
// below this threshold, MERGE_IMPULSE is scaled by (rest_length / MIN).
// At rest_length=10 → scale=0.4 → 1.2 px impulse (preserves S10 visual
// magnitude on tight placements). Primary protection is against the
// impulse exceeding the bond length (which would teleport the cand
// through the new prim and flip the bond's direction).
export const MIN_BOND_LENGTH_FOR_IMPULSE = 25;

// S13 P1 — cross-structure merge reach. Separate from AUTO_BOND_RADIUS
// (60, primary target picking precision).
// 100 px is wide enough that three structures arranged ~90 px apart
// around a placement point all enter the merge sweep, but not so wide
// that distant unrelated structures get pulled in unintentionally.
// Closes the user-reported "place at center of 3 structures and only one
// merges" bug — root cause was AUTO_BOND_RADIUS=60 doubling as both
// primary-pick radius AND merge-sweep radius. S13 P1 splits them.
export const MERGE_REACH_RADIUS = 100;

// S48 P2 (Sym C fix) — primary target pick radius for auto-bond on
// placement. Promoted from controls.ts module-local to shared constant
// so the host's authoritative re-pick (placePrimitive.ts, when a remote
// joiner's intent has a stale/null targetPrimitiveId due to snapshot
// lag) uses the same radius as the client's optimistic pick.
export const AUTO_BOND_RADIUS = 60;


// Tier-gated corner pulse boundary. scoreProgress crossing each multiple
// of SCORE_TIER_STEP fires one SCORE_TIER effect. At 50 + threshold 150:
// 2 tier events before WIN (S79 P1 — raised 15→50 in step with PHASE_1_WIN_SCORE
// 50→150 so the pulse cadence per match is unchanged).
// S84 P3 — 50→70 in step with WIN 150→210 (exact thirds: pulses at 70/140, WIN at 210).
// S91 G2-PROMO — 70→210 in lockstep with PHASE_1_WIN_SCORE 210→630 (exact thirds preserved:
// pulses at 210/420, WIN at 630; scoring.test.ts:330-331 invariant stays green). Per-match tier-
// pulse cadence is unchanged (still 2 pulses before WIN).
// S106 — 210→262 in lockstep with PHASE_1_WIN_SCORE 630→786 (+25% match length). Exact thirds
// preserved (786=3×262: pulses at 262/524, WIN at 786) so the exact-thirds invariant stays green
// and the per-match tier-pulse cadence is still 2 pulses before WIN.
// S110 P1 — 262→500 in lockstep with PHASE_1_WIN_SCORE 786→1500. Exact thirds preserved
// (1500=3×500: pulses at 500/1000, WIN at 1500) so the scoring.test.ts exact-thirds invariant
// stays green and the per-match tier-pulse cadence is still 2 pulses before WIN.
export const SCORE_TIER_STEP = 500;

// S13 P2 — outward verlet impulse for STRUCTURE_GROW. Applied to each
// primitive in the *primary's pre-existing component* (the structure
// being added to) on placement, pushing outward from the component's
// local centroid. 0.8 px on a 30+ px bond ≈ 2.7% strain (well under
// HIGH-tier 25% break threshold). Bonds resist; net effect = brief
// outward "puff" the user sees as the structure physically growing.
//
// Counteracted on the OTHER side of a cross-structure merge by
// MERGE_IMPULSE on cand components (INWARD). Net visual on a merge:
// existing structure puffs out while absorbed components snap in —
// distinct signatures across the post-merge component.
//
// Unlike MERGE_IMPULSE (S10 P3, unconditional physics), this is gated
// on world.cinematicsEnabled: a NEW physics mechanic the user has not
// designated physics-over-visual. If they toggle C off, both halves
// (visual flash + physical puff) disappear together — cleaner mental
// model for the debug toggle.
export const STRUCTURE_GROW_IMPULSE = 0.8;

// === S14 P2.1 — multi-endpoint redundant bonding ===
// Maximum total bonds a single placement can create to its primary's
// connected component (primary bond + up to K-1 redundancy bonds).
// 1 = pre-S14 behavior (primary only). 3 = primary + up to 2 redundancy
// bonds. Capped to bound verlet cost growth (each bond is one constraint
// per substep × 8 substeps/tick × 60 Hz).
//
// Cross-component merge bonds (governed by mergeCandidateIds + the merge
// sweep in placePrimitive.ts) are NOT counted in this K — those are
// bounded by component count within MERGE_REACH_RADIUS, a separate axis.
//
// Tunable: setting K=1 disables redundancy bonding entirely (the helper
// in controls.ts short-circuits) — one-line revert without git history
// rewrite if playtest finds raid-resistance too generous.
export const REDUNDANT_BOND_K = 3;

// Minimum angular separation between the primary-target axis and a
// candidate redundancy bond (and between any two selected redundancy
// bonds), measured from the new primitive's position. Prevents near-
// colinear redundancy where 3 bonds along the same line provide no
// raid-resistance (a single sever near the new prim still amputates the
// whole spur). 25° (5π/36 rad) is the Council R1 (Grok #3) softened
// default — 30° was the original PDR, lowered to admit more redundancy
// formation in moderate-spread geometry. Tunable.
export const REDUNDANT_BOND_MIN_ANGLE_RAD = (5 * Math.PI) / 36; // 25°

// Floating-point tolerance for the angular-distance comparison so a
// candidate exactly at MIN_ANGLE is not silently rejected due to
// atan2/sin rounding. Council R1 (Gemini G3.8) adoption.
export const REDUNDANT_BOND_ANGLE_EPSILON = 1e-6;

// Hard cap on candidate iteration to bound the O(N) sweep cost in
// pathologically dense components. 16 = safe upper bound on
// "primitives within AUTO_BOND_RADIUS=60" given primitive soft-collision
// radius ≥ 8 (so primitives don't overlap; ~16 is a hex-packed disc).
// Council R1 (Gemini § 5 boundary case G3.5) noted: a slightly distant
// 17th candidate with a perfect angular position is skipped — accepted
// trade-off for bounded cost.
export const REDUNDANT_BOND_MAX_CANDIDATES = 16;

// === S15 P2 — Phase-2 1v1 networked play (§ 11 LOCKED amendment) ===
// Trystero/Nostr WebRTC, host-authoritative. Council R2: 10 Hz snapshot
// rate + 100ms lerp interpolation are both MVP-non-negotiable.
// Audit Pass 1 fix 5f1f62c8 + d0f4efc8: deleted speculative placeholder
// constants (BOND_LINE_WIDTH, BOND_GLOW_INTENSITY, AUDIO_MASTER_VOLUME_DB,
// NET_CONNECTION_TIMEOUT_MS) — all four were never imported; renderers and
// audio use inline literals, and the connection timeout is owned by
// iceConfig.ts:HANDSHAKE_TIMEOUT_MS. Chesterton's fence: initial commit
// bc89a53 and S15 P2 add497f respectively introduced these as future-use
// scaffolding; the wire-up never landed. If a future PR wants
// configurable bond line width or master volume, reintroduce there.
export const NET_SNAPSHOT_HZ = 10;
// S89 P5 — the CLIENT renders the world this many ms behind real time and interpolates the two
// buffered snapshots BRACKETING that render clock (ClientSync render-delay buffer). Supersedes
// the old NET_INTERPOLATION_MS=100 single-pair lerp, whose window EQUALLED the 100ms snapshot
// interval → zero jitter buffer → freeze-then-jump on every late packet (the "choppy joiner"
// playtest report). 150ms ≈ 1.5 snapshot intervals: enough slack to bracket through typical P2P
// jitter, yet imperceptible for a builder duel (only REMOTE entity display is delayed — the local
// cursor/avatar is not snapshot-bound). #1 netcode-feel knob; raise toward 200 if stalls persist.
export const NET_RENDER_DELAY_MS = 150;
export const NET_ROOM_CODE_LENGTH = 6;

// === Territorial Repulsion (Sym F, S49 P1) ===
// R(complexity) = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE × log₂(complexity + 1)
// Range in normal play: ~60px (0 prims) to ~140px (complexity ~100).
// Territory is invisible (no ring rendered); hard-blocks enemy placement.
// Engulf-warp: enemy bonds inside territory get stiffness × TERRITORY_ENGULF_STIFFNESS.
// Shrink debuff: SHRINK_TERRITORY action halves enemy radius for TERRITORY_SHRINK_DURATION_TICKS.
/**
 * S51 P1 — E2E test override seam (Sym D specifically). Sym D verifies the
 * S46 P3 cross-color-bond-segregation invariant: place a BLUE prim, then
 * attempt a RED prim within AUTO_BOND_RADIUS=60 → assert NO cross-color
 * bond. After S49 P1 shipped the territory hard-block (min territory radius
 * 60 + 12×log₂(2) = 72px > AUTO_BOND_RADIUS), placing RED within bond range
 * of BLUE is impossible (Sym F mechanic intercepts at placePrimitive's host-
 * auth gate, well before the color-seg check). Sym D's test contract is
 * unreachable in normal play — the color-seg invariant is now defense-in-
 * depth, only reachable if territory is bypassed. The seam lets Sym D set
 * territory base radius to 0 (effectively disabling territory) so its
 * actually-color-seg-targeting predicate becomes observable again.
 * Mirror pattern: PHASE_1_WIN_SCORE / SPAWN_RATE_PER_SECOND. Production
 * gameplay untouched.
 */
function readTestTerritoryBaseRadius(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_TERRITORY_BASE_RADIUS__?: number })
    .__TEST_TERRITORY_BASE_RADIUS__;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}
export const TERRITORY_BASE_RADIUS = readTestTerritoryBaseRadius() ?? 60;
export const TERRITORY_RADIUS_SCALE = 12;
export const TERRITORY_ENGULF_STIFFNESS = 0.3;
export const TERRITORY_SHRINK_DURATION_TICKS = 300; // 5 seconds at 60 Hz

// === S71 P1 — Bomb hazard (Council Full; Fork B leaf-first deterministic sever) ===
// The host-only spawner drops a STATIONARY bomb into the spawn zone every
// BOMB_SPAWN_MIN..MAX sparks (cadence counts SPARKS SPAWNED — user "every random
// amount of shapes"; drawn from a SEPARATE seeded RNG stream so the spark sequence
// is byte-unchanged). Max BOMB_MAX_ACTIVE live at once. Grabbing it (TRIGGER_BOMB
// intent) is an INSTANT self-detonation severing ~BOMB_SEVER_FRACTION of the
// PICKER's OWN bonds, chosen LEAF-FIRST (smallest §VIII.4 split first, tie → lowest
// BondId) and capped at BOMB_PRIM_CAP_FRACTION of their structure (no catastrophic
// wipe). Un-grabbed for BOMB_TTL_TICKS → dissipates harmlessly. All tick-based +
// deterministic (host-authoritative; replay-safe).
//
// E2E seam: window.__TEST_BOMB_SPAWN_SPARKS__ forces both the min and max cadence
// to a small fixed value so a Playwright run can trigger a bomb in a couple of
// spawns (mirror of __TEST_SPAWN_RATE_PER_SECOND__ / __TEST_WIN_SCORE__).
function readTestBombSpawnSparks(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_BOMB_SPAWN_SPARKS__?: number }).__TEST_BOMB_SPAWN_SPARKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
const _BOMB_TEST_CADENCE = readTestBombSpawnSparks();
export const BOMB_SPAWN_MIN_SPARKS = _BOMB_TEST_CADENCE ?? 8;
export const BOMB_SPAWN_MAX_SPARKS = _BOMB_TEST_CADENCE ?? 15;
export const BOMB_TTL_TICKS = 15 * PHYSICS_HZ; // 900 ticks = 15s
export const BOMB_SEVER_FRACTION = 0.25;
export const BOMB_PRIM_CAP_FRACTION = 0.3;
export const BOMB_MAX_ACTIVE = 1;
export const BOMB_RADIUS = 22; // visual + pick radius — a distinct dark orb

// === S72 P2 — Pac-Man Hunter (Council Full; carried from the S71 PDR) ===
// When the LEADING player FIRST reaches HUNTER_TRIGGER_SCORE (75% of the win
// threshold), a single Pac-Man hunter spawns ONCE and chases that player's avatar
// for HUNTER_HUNT_TICKS. Contact (within HUNTER_CATCH_RADIUS) "eats" them: the
// victim is benched (avatar hidden + input locked) for HUNTER_BENCH_TICKS and drops
// any carried spark (reuses DROP_SPARK). Survive the chase → it despawns. Juke-able:
// Verlet momentum vs an instant cursor lets an attentive player lead it + lose it.
// SEPARATE world.hunters Map (Voltkin §13.15 LOCKED + untouched; Council Fork C).
// Host-authoritative, tick-based, deterministic (replay-safe); clients render the
// additive-optional snapshot mirror.
//
// E2E seam: window.__TEST_HUNTER_TRIGGER_SCORE__ forces the trigger score low so a
// Playwright run can spawn the hunter WITHOUT also ending the game (keep WIN at 50).
// Mirror of __TEST_WIN_SCORE__ / __TEST_BOMB_SPAWN_SPARKS__.
function readTestHunterTriggerScore(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_HUNTER_TRIGGER_SCORE__?: number }).__TEST_HUNTER_TRIGGER_SCORE__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
// Local — only feeds HUNTER_TRIGGER_SCORE below (not exported: nothing else reads it).
const HUNTER_TRIGGER_FRACTION = 0.75;
export const HUNTER_TRIGGER_SCORE =
  readTestHunterTriggerScore() ?? Math.floor(PHASE_1_WIN_SCORE * HUNTER_TRIGGER_FRACTION);

// S107 P1 — ANTI-COAST LEADER SCORE-DECAY (gentle proportional rubber-band).
// Once the LEADER's banked score passes LEADER_DECAY_THRESHOLD_FRACTION × PHASE_1_WIN_SCORE,
// it bleeds back toward that threshold at a rate PROPORTIONAL to the excess:
//     bleed/sec = LEADER_DECAY_RATE_PER_SEC × (leaderScore − threshold)
// Why proportional (not a flat rate): it is ZERO at the threshold and grows with the
// lead, so it is SELF-LIMITING — it can never drop the leader below the threshold and
// never HARD-CAPS the win. A leader whose live income (complexity ×
// SCORE_INCOME_PER_COMPLEXITY_PER_SEC) exceeds the decay at their current score still
// climbs to PHASE_1_WIN_SCORE; it only makes COASTING (banking a lead then idling, or
// riding a small/raided structure) bleed — the owner's "don't let a banked leader run
// out the clock" ask, kept gentle.
// Equilibrium complexity (live income == decay) at the win line:
//     C_eq = LEADER_DECAY_RATE_PER_SEC × (1 − FRACTION) × PHASE_1_WIN_SCORE
//            / SCORE_INCOME_PER_COMPLEXITY_PER_SEC
//          = 0.01 × 0.25 × 1500 / 0.05 ≈ 75   (S110 P1: WIN 786→1500 lifted C_eq ~39→~75)
// So a committed builder (sustained standing complexity > ~75) still closes out the
// win; a modest/raided leader stalls below the win line and the trailing player gets a
// window. The threshold coincides with HUNTER_TRIGGER (75%) by design: past 75% you are
// both HUNTED and must keep earning. Host-only + tick-driven + pure fn of synced state
// → replay byte-equivalent (clients read the decayed scoreProgress from the snapshot).
// NOT applied in solo (zen sandbox). Two tuning dials: RATE (harsher↑ / gentler↓) +
// THRESHOLD_FRACTION (earlier↓ / later↑). Owner-tune after the first playtest.
export const LEADER_DECAY_THRESHOLD_FRACTION = 0.75;
export const LEADER_DECAY_RATE_PER_SEC = 0.01;
export const HUNTER_HUNT_TICKS = 30 * PHYSICS_HZ; // 1800 ticks = 30 s chase
export const HUNTER_BENCH_TICKS = 30 * PHYSICS_HZ; // 1800 ticks = 30 s benched
export const HUNTER_CATCH_RADIUS = 30; // px — contact distance for the "eat"
export const HUNTER_CATCH_HOLD_TICKS = 24; // ~0.4 s chomp hold before the hunter despawns
export const HUNTER_DESPAWN_FADE_TICKS = 24; // ~0.4 s fade-out on a successful escape
export const HUNTER_RADIUS = 26; // visual wedge radius (Pac-Man mouth)
// Per-tick momentum pursuit (tuned juke-able). MAX_SPEED is below a flicking cursor
// so an alert player escapes; DAMPING retains momentum so sharp turns overshoot.
// S75 P2 slowed it ~5x (MAX_SPEED 7->1.4, ACCEL 0.6->0.12). S76 P1 — live 2-player
// feedback said 1.4 px/tick was TOO slow (the hunter posed no threat), so both consts
// were scaled back UP by 2.5x: MAX_SPEED 1.4->3.5 and ACCEL 0.12->0.30.
// S81 P6 — round-3 playtest 'pacman should be about 20% faster moving': both consts ×1.2
// (MAX_SPEED 3.5->4.2, ACCEL 0.30->0.36). Terminal speed (accel/(1-damping) = 10*accel
// = 3.6 px/tick) keeps the same just-under-the-cap headroom shape as every prior tune
// (3.0-under-3.5, 1.2-under-1.4, 6-under-7), so the momentum/overshoot juke character is
// UNCHANGED; only the absolute speed rises. At 4.2 px/tick (~252 px/s) a flicking cursor
// still out-runs it. Tunable: dial MAX_SPEED+ACCEL together (keep the 0.0857 ratio).
// S89 P4 — user playtest: hunter too slow, +25%. Both MAX_SPEED and ACCEL scaled by 1.25
// (4.2->5.25, 0.36->0.45), preserving the 0.0857 ratio so the juke character is unchanged.
// Terminal speed (10*accel) 3.6->4.5 px/tick (exactly +25%), still under the new 5.25 cap
// (the same just-under-the-cap headroom shape). ~315 px/s — a flicked cursor still out-runs it.
export const HUNTER_MAX_SPEED = 5.25; // px/tick (~315 px/s); S89 P4 +25%: was 4.2 (S81 P6) / 3.5 (S76) / 1.4 (S75)
export const HUNTER_ACCEL = 0.45; // px/tick² toward the avatar; S89 P4 +25%: was 0.36 (S81 P6) / 0.3 (S76) / 0.12 (S75)
export const HUNTER_DAMPING = 0.9; // per-tick velocity retention (momentum / overshoot) — unchanged (ratio, not speed)

// === S72 P3 — Potato Bomb (Council Full; Fork E fuse FROM-SPAWN [user reading]) ===
// The host-only spawner drops a CARRYABLE potato in the spawn zone on its OWN seeded
// cadence (SEPARATE potatoRng → the spark + bomb streams stay byte-identical). Grab it
// (PICKUP_POTATO; carry-slot MUTUALLY EXCLUSIVE with a spark), carry it (it follows
// your avatar), then PLACE it onto the board (PLACE_POTATO → ARMED) or DROP it. Its
// fuse runs FROM SPAWN (Fork E, user "hot potato": a potato held too long cooks off in
// your hand). On detonation: a DETERMINISTIC radial AoE deletes every primitive within
// POTATO_BLAST_RADIUS (SQUARED distance, iterated in SORTED PrimitiveId order — replay-
// safe, no sqrt) + their incident bonds; owner-AGNOSTIC + POSITION-based (area denial,
// fires at the coord even if the structure there is already gone); NO chain reaction
// (deletes prims/bonds only, not other bombs/potatoes). Host-authoritative + tick-based
// (replay-safe); clients render the snapshot mirror. NO PROTOCOL_VERSION bump (Council:
// the S71 v4→5 bump covers the P1/P2/P3 batch). Fuse-start is a one-line flip to
// Council's from-PLACEMENT (see hunters/.. no — see makePotato + applyPlacePotato).
//
// E2E seam: window.__TEST_POTATO_SPAWN_SPARKS__ forces the cadence small (mirror bomb).
function readTestPotatoSpawnSparks(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_POTATO_SPAWN_SPARKS__?: number }).__TEST_POTATO_SPAWN_SPARKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
const _POTATO_TEST_CADENCE = readTestPotatoSpawnSparks();
export const POTATO_SPAWN_MIN_SPARKS = _POTATO_TEST_CADENCE ?? 10;
export const POTATO_SPAWN_MAX_SPARKS = _POTATO_TEST_CADENCE ?? 18;
// E2E seam: window.__TEST_POTATO_FUSE_TICKS__ shortens the fuse so a Playwright run can
// observe a detonation in ~1-2 s instead of 23 s (mirror of the other __TEST_* seams).
function readTestPotatoFuseTicks(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_POTATO_FUSE_TICKS__?: number }).__TEST_POTATO_FUSE_TICKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
export const POTATO_FUSE_TICKS = readTestPotatoFuseTicks() ?? 23 * PHYSICS_HZ; // 1380 ticks = 23 s (Fork E from-SPAWN; tunable)
export const POTATO_BLAST_RADIUS = 110; // px — small radial AoE (clips a few primitives)
export const POTATO_MAX_ACTIVE = 1;
export const POTATO_RADIUS = 16; // visual + pick radius
// S75 P1 — carrier-bench-on-held-detonation. If a potato detonates while still CARRIED
// (cooked off in hand), the carrier is benched (avatar hidden + input locked, reusing the
// hunter bench infra) for this long. User-specified 15s (distinct from the 30s hunter
// bench). ARMED/FREE detonations do NOT bench — only holding it too long is punished.
export const POTATO_CARRIER_BENCH_TICKS = 15 * PHYSICS_HZ; // 900 ticks = 15s
// S81 P2 — REAL hot potato: a CARRIED potato cooks off IN HAND this long after the grab
// (per-grab timer — re-grabbing/passing restarts the window; place or drop before it fires
// and you're safe). User round-3 playtest: players hogged the 23s from-spawn fuse for ~22s
// and dumped it at the last second — 'it should be a real hot potato where you have to pass
// it on as soon as possible.' The from-spawn fuse is UNCHANGED (FREE dissipate / ARMED
// detonate); this is an ADDITIONAL, earlier in-hand trigger (existing carrier-bench applies).
export const POTATO_HOLD_DETONATE_TICKS = 3 * PHYSICS_HZ; // 180 ticks = 3s of continuous carry

// === S75 P3 — Rainbow color-shuffle pickup (Council Full; protocol 5->6) ===
// The host-only spawner drops a RARE rainbow into the spawn zone on its OWN seeded cadence
// (SEPARATE rainbowRng -> the spark + bomb + potato streams stay byte-identical), much less
// often than the bomb/potato. Clicking it (TRIGGER_RAINBOW client intent) runs an INSTANT global
// colour-shuffle: a deterministic DERANGEMENT permutation of the 6-colour palette remaps every
// player.color + every primitive.placerColor/ownerColor, so every player (even in a 2-player
// game) gets a NEW, UNIQUE colour. Un-clicked for RAINBOW_TTL_TICKS -> dissipates harmlessly.
// Host-authoritative + tick-based; the recoloured player/prim state rides the existing snapshot.
//
// E2E seam: window.__TEST_RAINBOW_SPAWN_SPARKS__ forces the cadence small (mirror bomb/potato).
function readTestRainbowSpawnSparks(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_RAINBOW_SPAWN_SPARKS__?: number }).__TEST_RAINBOW_SPAWN_SPARKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
const _RAINBOW_TEST_CADENCE = readTestRainbowSpawnSparks();
// Rainbow spawn cadence (sparks-between-rainbows). VERSION HISTORY (each tune is a live-feedback
// dial; at the 0.15 spark/s base rate, N sparks => ~N*6.7s to the FIRST rainbow):
//   pre-S76  35-60  -> ~4-7 min   (FIRST rainbow longer than a typical match; "never saw it")
//   S76 P2   15-28  -> ~1.5-3 min (a match sees one; still strictly rarer than potato 10-18)
//   S77 P1    8-14  -> ~53-93 s   (~2x MORE frequent than S76 per the user's "2x more common" ask;
//                                  now OVERLAPS the potato band 10-18 so it is no longer strictly
//                                  the rarest hazard -- accepted per user intent "more chaos").
// Tunable: raise back toward 15-28/35-60 for rarer, or lower toward 5-10 for near-every-match.
export const RAINBOW_SPAWN_MIN_SPARKS = _RAINBOW_TEST_CADENCE ?? 8;
export const RAINBOW_SPAWN_MAX_SPARKS = _RAINBOW_TEST_CADENCE ?? 14;
export const RAINBOW_TTL_TICKS = 20 * PHYSICS_HZ; // 1200 ticks = 20s linger before a harmless dissipate
export const RAINBOW_MAX_ACTIVE = 1;
export const RAINBOW_RADIUS = 28; // visual + pick radius (a chunky, clearly-clickable arc)
// Bounded re-roll cap for the derangement-over-active-colours shuffle (rainbowLifecycle). A fixed
// point is rare for <=6 colours so this is seldom hit; the fallback (last unique permutation)
// still guarantees the hard uniqueness constraint ("no two players the same colour"). Council DR5.
export const RAINBOW_DERANGEMENT_MAX_REROLLS = 12;
// === S84 P2 — rainbow flyover event (the colour-switch celebration) ===
// On TRIGGER_RAINBOW the host stamps world.rainbowSwitchTick; every peer renders the
// flyover (dumb rainbow character arcs L->R + trippy background wash) for the window
// below, keyed purely off (world.tick - rainbowSwitchTick) — deterministic, no RNG,
// no wall-clock. 240 ticks = 4s @60Hz: long enough to land the joke + hear the full
// ~2.7s yell, short enough not to outstay the welcome. Playtest knob.
// E2E seam (mirror of __TEST_WIN_SCORE__): CI software-WebGL renders the flyover's
// full-screen fills at seconds-per-frame, so the sim cannot elapse 240 ticks inside
// any sane wall-clock budget — rainbow.spec shrinks the window to assert the
// open->close LOGIC instead of fighting the render farm (S84 CHECK round 3).
function readTestFlyoverDuration(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_FLYOVER_DURATION_TICKS__?: number }).__TEST_FLYOVER_DURATION_TICKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
export const RAINBOW_FLYOVER_DURATION_TICKS = readTestFlyoverDuration() ?? 240;
// The yell only fires if the switch is OBSERVED fresh (joiner arriving later than 1s
// into the event sees the remaining flyover but skips the scream; also guards replays
// from a restored snapshot mid-window double-firing on top of the cursor reset).
export const RAINBOW_YELL_FRESH_TICKS = 60;

// === S88 G3a — in-match combo discovery toast ===
// The host stamps world.comboToastTick when a magic combo is FIRST formed in a
// match; every peer renders the "NEW COMBO — <name>!" toast for the window below,
// keyed purely off (world.tick - comboToastTick) — deterministic, no RNG/clock
// (the rainbowSwitchTick pattern). 150 ticks = 2.5s @60Hz: long enough to read +
// celebrate, short enough not to nag on a combo-heavy build. Playtest knob.
// E2E seam (mirror of __TEST_FLYOVER_DURATION_TICKS__): a test can shrink the
// window to assert the open->close logic without elapsing 150 sim ticks.
function readTestComboToastDuration(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_COMBO_TOAST_DURATION_TICKS__?: number })
    .__TEST_COMBO_TOAST_DURATION_TICKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
export const COMBO_TOAST_DURATION_TICKS = readTestComboToastDuration() ?? 150;

// ─────────────────────────────────────────────────────────────────────────────
// S77 P3 — SEAGULL hazard (+ its poop projectiles). A seagull flies across the top
// ~every 2 min dropping poop. Poop on a STRUCTURE fouls its whole connected component
// (that structure stops earning income until any avatar passing over the splat cleans
// it). Poop on a free SPARK makes it "poopy" — half-speed for 15s, then auto-clears.
// Host-authoritative + deterministic (mirrors hunter/potato/rainbow); renders ABOVE the
// fog (global-reach). Seagull/poop draw from a dedicated seagullRng so the spark/bomb/
// potato/rainbow sequences stay byte-identical. Poop DROPS use a hash-derived random
// interval (S81 P3 — stateless, no RNG stream; see seagullLifecycle.poopDropIntervalTicks).
// E2E seam: window.__TEST_SEAGULL_SPAWN_SPARKS__ forces the cadence small (mirror rainbow).
function readTestSeagullSpawnSparks(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_SEAGULL_SPAWN_SPARKS__?: number }).__TEST_SEAGULL_SPAWN_SPARKS__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
const _SEAGULL_TEST_CADENCE = readTestSeagullSpawnSparks();
// S79 P2 — 15/24 → 7/12. At the LOCKED 0.15 spark/s base rate the old band meant the FIRST
// gull arrived at ~100-160s — S78-era ~2-min games often ENDED before it ever appeared (user:
// "didn't even see the bird"). 7-12 sparks ≈ 47-80s: first gull inside the opening minute,
// then recurring every ~minute (still gated SEAGULL_MAX_ACTIVE=1).
// RECURRING (not once-per-game like the hunter) — gated on SEAGULL_MAX_ACTIVE.
export const SEAGULL_SPAWN_MIN_SPARKS = _SEAGULL_TEST_CADENCE ?? 7;
export const SEAGULL_SPAWN_MAX_SPARKS = _SEAGULL_TEST_CADENCE ?? 12;
export const SEAGULL_MAX_ACTIVE = 1; // at most one gull in the sky at a time
export const SEAGULL_SPEED = 3.15; // px/tick horizontal cruise; S78 4.5→3.15 (−30%, user "flies really quickly") ⇒ crosses ~1920px in ~10s
export const SEAGULL_Y_MIN = 44; // top band the gull flies through (sim y; render adds a bob)
export const SEAGULL_Y_MAX = 132;
export const SEAGULL_RADIUS = 24; // body radius (render + the pre-drop "hunch" anchor)
export const SEAGULL_BOB_AMPLITUDE = 12; // RENDER-ONLY sine bob (the SIM y is constant → deterministic)
export const SEAGULL_DEPART_MARGIN = 90; // px past the far edge before the gull despawns
// Poop drop cadence while FLYING. S81 P3 — RANDOM per-drop interval in [MIN, MAX] (user
// round-3: 'the bird should poop in random intervals and not every few meters, it should be
// different every time it passes'). Pre-S81 this was a FIXED 33-tick metronome (~every 150px).
// The interval is drawn from a PURE integer hash of (seagullId, lastPoopTick) — stateless
// "randomness": no RNG stream touched, both inputs already ride save/load, so replay + host
// save/load reproduce the identical drop pattern. Avg ≈ 30 ticks (~old density per pass).
export const POOP_DROP_MIN_TICKS = Math.round(0.2 * PHYSICS_HZ); // 12 ticks — tight burst floor
export const POOP_DROP_MAX_TICKS = Math.round(0.8 * PHYSICS_HZ); // 48 ticks — long-gap ceiling
// S81 P7 — 7 → 5.25 (−25%): user round-3 'the poops are falling too fast' (couldn't even get
// hit on purpose); slower fall opens a dodge/intercept window. Constant + gravity-free still.
export const POOP_FALL_SPEED = 5.25; // px/tick downward (constant; gravity-free for determinism)
export const POOP_RADIUS = 7; // visual/collision core radius
export const POOP_HIT_RADIUS = 19; // poop-vs-(primitive|spark) collision radius (squared internally)
export const POOP_GROUND_TTL_TICKS = 4 * PHYSICS_HZ; // a floor splat lingers ~4s then dissipates
export const POOP_SLOW_TICKS = 15 * PHYSICS_HZ; // "poopy" spark: half-speed for 15s ("cruiser speed")
export const POOP_SLOW_MULTIPLIER = 0.5; // 2x slower
export const POOP_CLEAN_RADIUS = 44; // the structure OWNER's avatar within this of a structure-splat cleans it (S81 P1 owner-only)
export const POOP_MAX_LIVE = 24; // safety cap on concurrent poops (snapshot-size guard)
// S79 P2 — pooped-building visibility (user: a hit building "should visibly be pooped on ...
// until the spark wipes it off"). The whole fouled component's prims + bonds tint toward the
// splat colour (world.fouledPrimitives already rides NetSnapshot, so clients see it too), and
// the structure splat itself draws larger than a ground splat so the wipe target is obvious.
export const POOP_FOUL_TINT = 0x9aa15c; // sickly green-brown (poopRenderer's POOP_DARK)
export const POOP_FOUL_TINT_STRENGTH = 0.65; // lerp weight ownerColor → POOP_FOUL_TINT
export const POOP_STRUCTURE_SPLAT_SCALE = 2.3; // structure splat vs ground splat draw size

// === S82 P1 — cruiser-poopy-slow (poop can hit the PLAYER CRUISER) ===
// User decision (S81 carry → S82 explicit go): the slow debuff now also applies to the
// player avatar. A FALLING poop checks avatars FIRST (bodyblock: your cruiser can shield
// the structure beneath — intended gameplay), seat-ascending lowest-id, consume-on-hit.
// While debuffed the cruiser STOPS teleport-to-pointer: UPDATE_AVATAR_POS writes a cursor
// TARGET and a host per-tick chase (gameMode.tickCruiserChase) moves avatarPos toward it
// at ≤ POOP_CRUISER_MAX_SPEED px/tick with exact-snap convergence (Council S82 R2).
// Spam-immune by construction (extra updates only move the target) and deterministic.
export const POOP_AVATAR_HIT_RADIUS = 30; // px — POOP_HIT_RADIUS(19) + avatar outer radius(11)
export const POOP_CRUISER_SLOW_TICKS = 15 * PHYSICS_HZ; // same 15s as the poopy-spark debuff
// === S89 P3 — structure-foul AUTO-EXPIRY (Council synthesis C) ===
// A pooped structure used to stay fouled (olive tint + ZERO income) FOREVER until the owner
// manually flew their avatar onto the splat to wipe it — non-obvious, and a single hit read as
// permanent income-death (user playtest reported it as a bug). The foul now self-cleans after a
// grace window so it is a TEMPORARY tempo cost; the avatar-wipe (canAvatarCleanSplat / CLEAN_POOP)
// remains the INSTANT clean (skill-based fast-recovery — Grok's tempo/diversion depth preserved).
// 30s = 2× the cruiser slow (~14% of a 210s match): a meaningful penalty, not a lost cause.
export const POOP_FOUL_TICKS = 30 * PHYSICS_HZ;
// The structure splat holds full opacity, then fades over its final FADE_TICKS to telegraph the
// imminent auto-clean (render-only cue; deterministic from world.tick − landedAtTick on both peers).
export const POOP_FOUL_FADE_TICKS = 3 * PHYSICS_HZ;
// 7 px/tick ≈ 420 px/s: far below a flicked cursor (~3000 px/s) so the slow BITES, still
// above the hunter's 5.25 px/tick cap (S89 P4 raised it from 4.2; the hunter's TERMINAL speed
// ≈ 4.5 px/tick leaves 7 comfortably clear) so a slowed player can still outrun Pac-Man. #1 knob.
export const POOP_CRUISER_MAX_SPEED = 7;
// === S84 P1 — pooped pickup gate ===
// While debuffed, PICKUP_SPARK additionally requires the (slow-chasing) avatar to have
// ARRIVED at the spark: distSq(spark.pos, avatarPos) <= R^2. Without this the cursor — which
// still moves at full mouse speed — grabbed sparks instantly and the slow never bit for
// collecting (user playtest round-5 report). 36 = avatar outer radius (11) + spark body
// (~10) + slack > two 7px chase steps, so an arriving avatar can't oscillate across the
// boundary between click and dispatch. Playtest knob.
export const POOP_PICKUP_ARRIVAL_RADIUS = 36;

// ─────────────────────────────────────────────────────────────────────────────
// === S100 P1 — TOWER DEFENSE tunables (TD Phase 1a) ===
// A spawner-structure (a closed pentagram of 5 triangles) "comes alive" and emits a
// persistent pencil-drawn CHEWER creature every SPAWN_INTERVAL_TICKS. Chewers slow-hop
// to the nearest ENEMY connector and chew it (CHEW_HITS hits, one per CHEW_INTERVAL_TICKS)
// until it severs, then move on. The spawner is destroyed — and its swarm + income stop
// instantly — when its exact shape is broken (re-validated every REVALIDATE_INTERVAL_TICKS).
//
// ALL tick-based, host-authoritative, replay-deterministic — NEVER wall-clock, NEVER
// Math.random (any jitter uses the stateless mix32 hash idiom; NO 6th RNG stream, the
// spawner cadence is a `world.tick >= nextSpawnTick` poll, NOT game/spawner.ts). Full
// rationale + per-value Phase-1 table in TOWER_DEFENSE_DESIGN.md §4.1.
//
// Caps are LOWERED for Phase 1 (every existing roaming hazard caps at 1; 8 is already an
// 8× leap past anything the sync/perf substrate has been load-tested against — raise only
// after a measured playtest, §3.3 R1).
export const SPAWN_INTERVAL_TICKS = 900; // 15 s @ 60 Hz — chewer emit cadence (user's number)
export const CHEW_HITS = 5; // chews to sever one connector (user's number; = CHEWER_CONFIG.chewHits)
export const CHEW_INTERVAL_TICKS = 60; // 1 s/hit → CHEW_HITS × this = 5 s/connector (user's number)
// S104 P1 — the REAL "constantly produce more every ~15s" fix is the chewer's now-FINITE lifetime
// (voltkin-config.ts: persistent:false + lifetimeTicks), NOT a big cap raise. Once a chewer ages
// out and despawns, the spawner's cadence refills the slot — so the population CHURNS instead of
// hard-stopping at the per-spawner cap. STEADY-STATE per spawner ≈ lifetimeTicks / SPAWN_INTERVAL_TICKS
// = 3000/900 ≈ 3.3 concurrent; the caps below are an OVERLAP BUFFER, never the binding limiter for a
// single spawner. (Keep this relationship in mind before changing any one value: shortening
// SPAWN_INTERVAL or lengthening lifetime raises the steady-state toward the cap.)
//
// Council (S104) reconciled the raise DOWN from a proposed 18/6: 12/4 is a measured, modest step
// (the original TOWER_DEFENSE_DESIGN spec'd 14 before the conservative drop to 8); 18 stays a
// documented post-playtest ceiling, not the ship value. WIRE: a trimMirrorCreature'd chewer is
// ~124 B JSON; the full world rides the DataChannel every 100ms (NET_SNAPSHOT_HZ, no delta-encode),
// so 12 chewers ≈ +1.5 KiB/snapshot vs 8 — trivial on WebRTC (Trystero auto-chunks), guarded by the
// wire-size assertion in save.replay.test.ts. CHEWER_MAX_PER_VICTIM (below) stays the governor of how
// many can attack ONE player at once in 1v1/vs-bots; the global cap mostly matters in FFA.
export const CHEWER_MAX_GLOBAL = 12; // hard ceiling on live chewers (overlap buffer; post-playtest ceiling 18)
export const CHEWER_MAX_PER_SPAWNER = 4; // overlap buffer above the ~3.3 steady-state; destruction rate scales with this
export const CHEWER_MAX_PER_VICTIM = 3; // one swarm can't fully strip a single player

// === S102 — UNIFIED HP / DAMAGE MODEL (owner correction OC2: "coherent, logical, epic") ===
// ONE damage scale across the whole game. Two kinds of destructible thing have HP:
//   • CONNECTORS (bonds): CONNECTOR_HP, chipped by chewers (CHEW_DAMAGE per chew). 5 chews sever a
//     connector (= the owner's "5 chews to destroy a connector"). A player RAID and a godly Voltkin
//     still INSTANT-sever a connector (decisive teardown) — they don't chip; the chewer is the only
//     thing that whittles connector HP. (Implemented as the chewer's commit-counter `chewProgress`;
//     CONNECTOR_HP is tied to CHEW_HITS so the model reads coherently.)
//   • CREATURES (spawn): per-type hit-count HP. A pencil chewer dies in 1 hit; a godly Voltkin takes
//     2 (twice as tough). A "hit" = a player RAID (P3), a Voltkin zap on a chewer (P3), and next
//     session the laser beam + HELGA's slap. Each single-target hit deals 1; AoE (potato) = lethal.
// Creature death VFX: chewer -> green-goo splat; Voltkin -> discombobulated lightning-cloud (P3).
export const CONNECTOR_HP = CHEW_HITS; // 5 — a connector withstands 5 chews
export const CHEW_DAMAGE = 1; // damage one chew deals to a connector (CONNECTOR_HP / CHEW_DAMAGE = CHEW_HITS)
export const CHEWER_HP = 1; // a pencil chewer dies in 1 single-target hit (raid / Voltkin / laser / slap)
export const VOLTKIN_HP = 2; // a godly Voltkin takes 2 hits — twice as tough as a chewer
export const RAID_CREATURE_DAMAGE = 1; // a player raid (right-click a creature) deals 1 (P3)
// S103 #8 — single-target creature-vs-creature / defender-vs-creature hit. A Voltkin zap on a
// chewer, a laser beam (P3), and HELGA's slap (P4) all deal this through the SAME `damageCreature`
// path: 1 → a chewer (CHEWER_HP=1) dies in one, a Voltkin (VOLTKIN_HP=2) in two → lightning-cloud.
// Same value as RAID_CREATURE_DAMAGE by design (one coherent damage scale, OC2); named separately
// so the creature-combat call sites read intentionally and a future tuning of one needn't move both.
export const CREATURE_HIT_DAMAGE = 1;
export const REVALIDATE_INTERVAL_TICKS = 30; // 0.5 s — spawner shape re-validation throttle
// Passive income term added to a spawner owner's complexity (scoring.computeComplexity). Kept
// NEAR-ZERO so it never threatens the protected PHASE_1_WIN_SCORE=630 anchor — the real cost is
// the spawner's raid-vulnerability, and the real balance lever is destruction throughput, not
// income (§4.2). At SCORE_INCOME_PER_COMPLEXITY_PER_SEC=0.05 a +0.5 bump ≈ 1/25200 of a win.
export const SPAWNER_INCOME_COMPLEXITY = 0.5;
// Small one-shot VP reward for destroying an enemy spawner (raid incentive). Awarded via
// gameMode.addScore (the resolveSudoku discrete-mutation precedent — NO parallel accrual loop);
// split across all players who landed a sever (§4.3). Small so it incentivizes raids without
// itself becoming a win path.
export const SPAWNER_KILL_REWARD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// === S103 P2 — TOWER-DEFENSE DEFENDERS (the generic Defender substrate) ===
// A player builds a geometric recipe that "comes alive" as a stationary DEFENDER which
// auto-attacks the nearest enemy CREATURE in range via the unified `damageCreature` path
// (chewer dies in 1, Voltkin in 2 → lightning-cloud). Two kinds stand on ONE substrate:
//   • LASER TURRET (#9, P3): 1 Line(deg7) + 7 Spiral 'Whip' leaves — a slow heavy beam.
//   • HELGA PRINCESS (#10, P4): a Triangle hub + 3 'Warped Anchor' + 3 'Star' — a fast slapper.
// Defenders are removed by RECIPE-BREAK (a chewer eats the structure's bonds → the shape no
// longer matches → REMOVE_DEFENDER), NOT by direct combat in v1 — `DEFENDER_HP` is a high
// sentinel kept for a future direct-attack lever (Council MF8) so adding it needs no re-bump.
// ALL tick-based + host-authoritative + replay-deterministic (no wall-clock, no Math.random).
export const DEFENDER_FIRE_HOLD_TICKS = 12; // FIRE state held ≥2 snapshot intervals so the 1v1
// client reliably observes it + renders the beam/slap VFX (Council MF1 — state is the event bus).
export const DEFENDER_RECOVER_TICKS = 12; // post-fire recovery before returning to IDLE
export const DEFENDER_REACQUIRE_TICKS = 12; // IDLE retry cadence when no enemy creature is in range
export const DEFENDER_HP = 1_000_000_000; // sentinel — defenders die by recipe-break, not damage (v1)
// Laser turret (#9) — slow + heavy; the windup is shown via 5 rings derived from nextFireTick.
export const TURRET_FIRE_INTERVAL_TICKS = 1800; // 30 s @ 60 Hz (owner spec: "every 30s")
export const TURRET_WINDUP_TICKS = 18; // brief pre-beam tell after the long charge completes
export const TURRET_WINDUP_RINGS = 5; // client-visible charge rings across the fire interval (owner: "5 rings")
export const TURRET_ATTACK_RANGE = 420; // long reach (it's a turret)
// HELGA princess (#10) — fast melee-ish swatter; she only acts when an enemy creature is near.
export const PRINCESS_SLAP_INTERVAL_TICKS = 90; // 1.5 s between slaps
export const PRINCESS_WINDUP_TICKS = 14; // arm pulls back (a visible wind-up, not a twitch)
// S109 P3 — anti-cross-map-laser INTERIM (owner playtest #3: "she effectively lasers across the
// map"). The S106 whole-screen diagonal (~2203) made HELGA hit any enemy anywhere — she read as a
// map-wide laser, not a hub defender. Cut to a LOCAL-AREA range JUST under the turret's 420 so the
// turret stays the long-reach unit and HELGA defends her own hub area (no more cross-map hits).
// This is the safe interim; the full "walk to the target + slap on arrival" locomotion rework
// (chase, not loop) is a dedicated session (Batch B). Range is the owner's playtest DIAL — left
// un-pinned (NOT in constants.lock.test) precisely so the next playtest can tune it:
// 380 = area defender; ~120 = near-melee (weaker).
export const PRINCESS_SLAP_RANGE = 380;

// === S82 P4(c) — mid-game peer-drop bench (6p hardening) ===
// A seated peer absent from the transport for GRACE ticks stops ghosting: the host
// re-stamps benchedUntilTick = tick + BENCH ticks EVERY tick while the peer stays absent
// (BENCH_OFFLINE_PLAYER action — host-internal, blocked from client INTENTs by the
// CLIENT_INTENT allowlist). Self-healing by construction: the moment the peer rejoins
// (same in-page Trystero selfId → same frozen seat) the re-stamping stops and the bench
// expires within BENCH ticks — no unbench action, no reconnect/bench race (Council S82).
export const PEER_DROP_GRACE_TICKS = 3 * PHYSICS_HZ; // 3s of absence before benching (blip tolerance)
export const PEER_DROP_BENCH_TICKS = 2 * PHYSICS_HZ; // rolling bench window; expiry = rejoin lag bound

// === S89 P6 (G1b) — Vortex anchor-pull (the first MECHANICAL magic-combo behavior) ===
// A Vortex (Dot→Spiral, its own table description: "Pulls nearby free sparks toward it") exerts a
// capped attraction on nearby FREE sparks, host-side, once per physics tick (pulled positions ride
// the snapshot to clients — clients never recompute the force). The pull is a Verlet velocity
// impulse (shift prevPos), so the 8 substeps carry it; terminal pull speed ≈ ACCEL / (1 −
// VELOCITY_DAMPING^PHYSICS_SUBSTEPS). Conservative defaults — #1 Vortex playtest-feel knob.
export const VORTEX_PULL_RADIUS = 220; // px — reach within which a free spark feels the pull
export const VORTEX_PULL_MIN_DIST = 12; // px — inside the core: no pull (avoid a singular yank/jitter)
export const VORTEX_PULL_ACCEL = 0.04; // px/tick velocity added toward the anchor AT the core,
// ramped linearly to 0 at the radius edge, then the per-tick SUM across multiple Vortexes is
// capped to this same value (no stacking yank). Deterministic (pure float; host-only).
