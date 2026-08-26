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
] as const;

/**
 * S147 R45 — THE 7th "SILVER" SEAT COLOUR IS RETIRED, and the palette above is now SIX entries.
 *
 * It only ever existed because VS-BOTS could seat SEVEN (1 human + up to 6 bots). R41 caps the game at
 * FOUR players total, so a 7th seat cannot exist and nothing can be seated in Silver.
 *
 * ⚠ THE PALETTE IS A RACE/CLASS ROSTER, NOT A SEAT-COUNT PROXY (owner, R45): *"its ok to have 6
 * colors with only 4 players max — in the future we'll make each color a class/race and give players
 * an option to choose... during pregame lobby stage be able to chose your color."* So do NOT shrink
 * `PLAYER_COLORS` to match `MAX_PLAYERS`, now or later — six colours are six future races, of which at
 * most four are in play at once. `PLAYER_COLORS[seat]` is therefore only ever a DEFAULT assignment,
 * never an invariant; the authority is `Player.color`, which already rides the wire as
 * `RosterEntry.color` and is what every sim consumer actually reads.
 */
export const BOT_ACCENT_COLOR = 0xc0c8d0;

/**
 * S62 / S147 R41 — max seats in a match. Seats are 0..MAX_PLAYERS-1. Wire and lobby validators all
 * cap on THIS constant, so lowering it is a wire-behaviour change and owes a `PROTOCOL_VERSION` bump.
 *
 * ⭐ S147 R41 — 6 → 4, on the owner's ruling: *"from now on the game will be only upto 4 players"*.
 * This is not cosmetic: it is the precondition for the tower-defence zone partition. `QUADRANTS_4P`
 * has exactly FOUR zones, so at a cap of 6 `zoneOwner(seat)` would have no total answer for seats 4
 * and 5, and the whole partition would be incoherent.
 *
 * ⚠ NOT the size of `PLAYER_COLORS` (6, and deliberately larger — see R45 above). Never use the
 * palette length as a proxy for the seat cap, or a future race-selection screen breaks the mechanics.
 */
export const MAX_PLAYERS = 4;
/**
 * S87 / S147 R41 — bots-mode cap, 6 → 3: one human at seat 0 plus up to 3 bots = MAX_PLAYERS.
 * Local-only mode (no wire surface).
 */
export const MAX_BOTS = MAX_PLAYERS - 1;

// === Canvas, Spawner, Vision ===
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
// V6-1.2 (owner instruction 2026-08-09) — HALVED 250 -> 125. The spawn zone is no longer the place
// the player works; it is the gatherers' quarry, and a tighter disc makes the haul legible (a
// gatherer visibly leaves the zone, crosses open ground, and arrives home). Tests derive from this
// constant rather than hard-coding 250, so they follow it. Note this shrinks the no-build zone too,
// which gives the player MORE buildable ground near the centre — intended.
export const SPAWNER_RADIUS = 125;
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
/**
 * S136 P4 — B3, THE FAUCET: 0.1875 → 1.125 (×6). OWNER-RULED.
 *
 * WHY. The v0.6 pivot made gatherers, not the player, do the hauling — and the S128 A.0 audit
 * established that the faucet, not transport, is the bottleneck. By Little's Law the standing
 * arena-wide free-spark pool at λ=0.1875 with FREE_SPARK_TTL_TICKS=600 (10 s) is λ·W = 1.875
 * sparks; the S132 probe MEASURED a mean of 2.2 and a peak of 4. With one gatherer per seat that
 * means a hauler routinely arrives at the quarry to find NOTHING to fetch and idles at its keep,
 * which is exactly what the S135 handoff predicted the owner would feel. At ×6 the standing pool is
 * λ·W = 11.25, so there is essentially always something to fetch.
 *
 * ⚠ THIS SUPERSEDES THE S105 AMENDMENT ABOVE, which itself superseded LOCKED_DECISIONS Item 3. The
 * S5 "strategic bet — wait for the type you need" feel is now DELIBERATELY GONE: it is the feel that
 * directives and per-gatherer preferences replace, and the owner ruled the ×6 explicitly. Recorded as
 * a sanctioned revocation rather than left as an unexplained contradiction of the lock.
 *
 * Determinism is unaffected: λ scales the interarrival only, never the RNG draw ORDER, so replay
 * byte-identity for a fixed seed holds exactly as it did across the 0.15 → 0.1875 change.
 *
 * ⚠ MATCH LENGTH GETS SHORTER AND THAT IS NOT COMPENSATED HERE. Score is quadratic in time, so match
 * length scales as 1/sqrt(throughput). B5 (match length) is UNRULED and owned by V6-4.3, and no slot
 * yet owns PHASE_1_WIN_SCORE or SCORE_INCOME_PER_COMPLEXITY_PER_SEC — so this change deliberately
 * touches neither. Logged as a carry-forward, not silently absorbed.
 */
export const SPAWN_RATE_PER_SECOND = readTestSpawnRate() ?? 1.125;

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

/* ========================================================================== *
 *          S147 — THE MATCH CLOCK (the tower-defence BUILD/FIGHT cycle)      *
 * ========================================================================== */

/**
 * S147 P1 — one phase of the match cycle, in TICKS. The owner's notes: *"90 sec to gather & build.
 * End of 90 sec 'build' stage you have 'fight' stage."* and *"Fight Stage is also 90 sec (for now)."*
 * So BUILD and FIGHT are the same length and the cycle repeats forever (R3).
 *
 * ⛔ TICKS, NEVER SECONDS OF WALL-CLOCK. The blueprint ranks a wall-clock phase timer as the #1
 * CRITICAL desync risk in the whole pivot: the host would enter FIGHT while a peer was still in
 * BUILD, the peer would submit a build command the host rejects, and the state hash would diverge
 * instantly. `world.matchPhase` / `world.phaseEndsAtTick` are therefore derived from `world.tick`
 * only, are hashed, and ride the snapshot so a joiner cannot disagree about the deadline.
 *
 * ⚠ MUST STAY > 800. `hostTick.differential.test.ts`'s longest frozen-reference scenario is 800
 * ticks; those 8 scenarios run with `matchPhase` pinned to FIGHT (see that file), so a phase edge
 * must never land inside one or the frozen reference — which scores unconditionally — would diverge
 * from the live path. `matchPhase.test.ts` asserts this bound by name so a future re-tune fails
 * loudly with the reason instead of reddening eight unrelated determinism scenarios.
 */
/**
 * ⭐ S149 — THE TWO PHASES NO LONGER SHARE A LENGTH. Owner, S149: *"fighting is too long. bring down
 * to 45 sec from 90. 90 build 45 fight."*
 *
 * `PHASE_DURATION_TICKS` is RETAINED as the BUILD length — it is what the name always meant in
 * practice, it is what every existing consumer wanted, and renaming it would churn nine call sites
 * for no behavioural gain. Read `phaseDurationTicks(phase)` for the length of a SPECIFIC phase.
 */
export const PHASE_DURATION_TICKS = 90 * PHYSICS_HZ; // 5400 ticks = 90 s @ 60 Hz — the BUILD stage
/** S149 — the FIGHT is half a BUILD: long enough to resolve, short enough not to drag. */
export const FIGHT_PHASE_TICKS = 45 * PHYSICS_HZ; // 2700 ticks = 45 s @ 60 Hz

/**
 * ⭐ HOW LONG `phase` LASTS, in ticks. The ONE place the asymmetry is expressed.
 *
 * ⚠ CALLERS MUST ASK ABOUT THE PHASE THEY ARE ENTERING, NOT THE ONE THEY ARE LEAVING. The host tick
 * flips `matchPhase` and only THEN extends the deadline, so it reads this with the new phase — get
 * that backwards and every stage runs for its predecessor's length, which reads as a clock that
 * drifts rather than as an off-by-one.
 */
export function phaseDurationTicks(phase: 'BUILD' | 'FIGHT'): number {
  return phase === 'BUILD' ? PHASE_DURATION_TICKS : FIGHT_PHASE_TICKS;
}

/**
 * ⭐ S149 P2 (R6/R12/Q2) — HOW LONG BEFORE THE WALLS DROP EVERY GATHERER IS SAFE INSIDE.
 *
 * The owner's rule: *"a gatherer can never be caught outside — they are built to come in exactly
 * 1 s before the walls drop, regardless of speed upgrade."*
 *
 * ⛔ THIS IS A DEADLINE, NOT A HEAD START. The mechanism deliberately does NOT send gatherers
 * walking home and hope they arrive: a hauler at speed level 0 starting from the far corner cannot
 * cross the board in a second, so a pathfinding race would make the rule TRUE ONLY FOR FAST
 * GATHERERS — precisely the speed-dependence the ruling forbids. Instead every gatherer
 * UNCONDITIONALLY enters `SHELTERED` at `phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS`: removed
 * from the field, cargo auto-deposited, no travel involved. Deterministic, speed-independent, and
 * impossible to fail. Nothing can attack during BUILD, so the snap is unobservable as unfairness.
 */
export const GATHERER_SHELTER_LEAD_TICKS = 1 * PHYSICS_HZ; // 60 ticks = 1 s @ 60 Hz

/**
 * S147 P1 Step 0 (R14 / R23) — the four CUT hazards: potato bomb, regular bomb, seagull, rainbow.
 * *"CUT FOR NOW … DISABLE (cadence → 0), do not delete — restoring then costs one line instead of
 * an archaeology session."* This flag IS that one line. **Flip to `true` and all four return.**
 *
 * ⛔ WHY THIS IS A DISPATCH-SITE GATE AND NOT A CADENCE OF ZERO. A.0 measured the mechanism and the
 * ruling's own suggested implementation would have done the OPPOSITE of switching them off:
 *
 *   1. The cadence is a **spark COUNTDOWN**, not a tick rate — `spawner.ts` draws
 *      `MIN + floor(rng() * (MAX - MIN + 1))` sparks-until-next. Setting MIN=MAX=0 makes the span 1
 *      and the countdown 0, so `--sparksUntilBomb <= 0` fires on the VERY NEXT SPARK. Zero cadence
 *      means MAXIMUM frequency.
 *   2. The spawner is **skip-and-redraw**: it mints the request and redraws its countdown regardless
 *      of whether the dispatch site caps it, each hazard on its own RNG stream. Gating at dispatch
 *      therefore leaves every spark/bomb/potato/rainbow/seagull RNG sequence **byte-identical**, so
 *      no replay or differential expectation moves. Editing MIN/MAX would change the draw VALUES.
 *   3. `*_MAX_ACTIVE = 0` looked equivalent but is not: only the seagull REDUCER self-gates on it
 *      (`seagullLifecycle.ts`), so that route would silently no-op a determinism test's direct
 *      `dispatch(SPAWN_SEAGULL)` and quietly delete that coverage.
 *
 * ⚠ INVARIANT — GATE **AFTER** THE DRAW, NEVER AT THE DRAW. This flag is consulted in
 * `physicsLoop.ts` only, downstream of every RNG call. Never move it up into `Spawner.tick`, and
 * never introduce an RNG call inside a block this flag guards, or hazards-off stops being
 * RNG-neutral. `spawnerRngInvariance.test.ts` asserts exactly that and will fail if it is violated.
 */
export const HAZARD_SPAWN_ENABLED = readTestHazardsEnabled() ?? false;

/**
 * S147 P1 (R28) — *"Anti-coast LEADER SCORE-DECAY is switched OFF (retained, not deleted)."*
 * The S107 rubber-band bled the leader's score once past 75% of the win threshold. Under the
 * tower-defence cycle scoring already stops for half of every match (R3: FIGHT only), so the decay
 * would double-punish the leader. The code stays in `scoring.ts`; this gates it.
 */
export const LEADER_DECAY_ENABLED = false;

// V6-1.1 — the automation FOOTER BAR occupies the bottom strip of the 1920x1080 logical canvas.
// V6-1.1 ships ONE control in it (the buy button); the shape buttons / build queue / bank meter
// (V6-1.4) slot into the same reserved strip later without a relayout. SHARED with controls.ts:
// the raw canvas pointerdown handler hit-tests world objects with no notion of HUD elements, so it
// early-returns inside this rect — otherwise every buy click ALSO grabs a spark or severs a bond.
export const FOOTER_HEIGHT = 84;
export const FOOTER_TOP_Y = CANVAS_HEIGHT - FOOTER_HEIGHT;

// V6-1.1 — flat price of one gatherer, bought from the placeholder keep. ~7% of
// PHASE_1_WIN_SCORE (owner ruling S134; precise figure 105 confirmed 2026-08-09). ONE POOL:
// spending victory points SETS YOU BACK toward the win. Flat, not a rising curve — tune after
// it is playable. B5/match-length retune is owned by V6-4.3; do NOT re-tune the win score here.
export const GATHERER_PRICE = 105;

// V6-1.2 — every player STARTS owning one gatherer (the S134 "START AT 1" ruling) plus this many
// victory points. 100 against a 105 price is deliberate: you cannot instantly buy a second unit, so
// the opening decision is "two speed upgrades now, or save toward another hauler".
export const STARTING_VICTORY_POINTS = 100;
/**
 * ⛔ S148 P1 — `KEEP_RING_SEATS` AND `KEEP_RING_RADIUS` ARE DELETED. THE POLAR RING IS GONE.
 *
 * Both constants existed to fan the seats evenly around the central spawner at a fixed radius. The
 * tower-defence pivot replaces that with a real ZONE PARTITION (`src/state/zones.ts`): the board is
 * split (one vertical line on `PITCH_2P`, a cross on `QUADRANTS_4P`) and each castle sits at a
 * lookup into that partition. Both docblocks predicted this deletion by name; this is that deletion.
 *
 * WHY THE RING HAD TO GO, RECORDED SO IT IS NOT RE-LITIGATED. A ring is a set of positions. A zone
 * is a region you OWN — which is what build legality, the border walls (S149) and castle placement
 * all need to ask about. The owner corrected this reading twice in S146: a keep ring that happens to
 * sit near the extremities is NOT a zone system, and treating the two as equivalent is exactly the
 * lazy pattern-match that made the first two readings of the hand-drawn map wrong.
 *
 * WHAT THE MOVE COST, MEASURED (S148 A.0 delta D2), so the economy is not re-tuned from memory:
 * the quarry-rim-to-castle haul goes from 295 px to 715 px on `PITCH_2P` (2.42x) and 800.7 px on
 * `QUADRANTS_4P` (2.71x). ⚠ The figure "420 -> ~1100 px" that circulated in the S147 handoff is
 * WRONG in both numbers — 420 was a centre-distance and 1100 was never any measurement. The
 * gatherer speed below is set against 800.7.
 *
 * ⚠ DO NOT REINTRODUCE A RING CONSTANT HERE. `castleAnchor(seat, layout)` takes the board as a
 * required parameter precisely so that a caller which forgot to thread `world.layout` is a compile
 * error rather than a silently wrong (and hashed, and therefore desyncing) position.
 */
/**
 * S136 P0 — the keep BOX, promoted out of gathererRenderer.ts because it is no longer only a
 * drawing: clicking it is what opens the castle panel (owner playtest, item 2 — "that footer with
 * those options should be clickable once you click on the castle and not always there"). The hit
 * test (`isPointInKeep`) and the renderer now read the SAME two numbers, so a resized keep can
 * never leave a click target floating off the art — the drift class that `isOverFooterControl`
 * already documents for the footer buttons.
 */
export const KEEP_W = 74;
export const KEEP_H = 58;
/** V6-1.2 — flat price of ONE speed upgrade; steps every gatherer the buyer owns. */
export const GATHERER_SPEED_UPGRADE_PRICE = 50;
/**
 * Base gatherer travel speed, px/tick.
 *
 * ⭐ S148 P1 — RAISED 1.9 -> 2.6 BECAUSE THE ZONE PARTITION MOVED THE CASTLES. Derived from the
 * measured geometry, not guessed, and the owner ruled the target: a first tower must be affordable
 * inside ONE 90 s BUILD with **zero upgrades bought**.
 *
 * THE ARITHMETIC, so the next session can re-derive it instead of re-guessing:
 *   · the haul (quarry rim -> castle) is now 800.7 px on QUADRANTS_4P, up from 295 px — 2.71x;
 *   · a round trip is therefore `2 * 800.7 / speed` ticks;
 *   · the first tower is the Stink Tower, `STINK_TOWER_SIZE = 4` (1 Square + 3 Circle), so the
 *     opening BUILD must fund FOUR type-directed hauls inside `PHASE_DURATION_TICKS` = 5400;
 *   · the opening BUILD is hard-locked to ONE gatherer — `STARTING_VICTORY_POINTS` 100 is below
 *     `GATHERER_PRICE` 105, and S147 R3 gated income to FIGHT, so no second hauler is buyable.
 *
 * ⚠ MEASURED, AND THE HONEST READING IS NARROWER THAN "IT WAS NECESSARY". `zoneEconomy.test.ts`
 * runs a full 5400-tick BUILD through the real host loop, one un-upgraded gatherer, order queue set
 * to the tower's bill. On QUADRANTS_4P, over five seeds:
 *
 *     speed 1.9 (the old value) -> 6 shapes banked, always >= 1 Square + 3 Circle
 *     speed 2.6 (this value)    -> 8-9 shapes banked, always >= 1 Square + 3 Circle
 *
 * So the owner's gate — a first tower affordable un-upgraded — was ALREADY met at 1.9, and the raise
 * is not what makes the board playable. What it actually buys, and the reason it is kept:
 *   (a) HEADROOM. The margin over the 4-shape tower goes from 1.5x to ~2.2x, so a player who
 *       mis-orders, or wants a second structure, is not left with a dead BUILD stage.
 *   (b) THE TTL INTERACTION (S148 A.0 delta D3). `FREE_SPARK_TTL_TICKS` is 600 and an unclaimed
 *       spark simply dies. At 1.9 the outbound leg alone is 421 ticks — **70 % of a target spark's
 *       entire lifetime** — so a gatherer spends most of its walk watching its target expire and
 *       re-aiming. At 2.6 the leg is 308 ticks (51 %). The owner authorised moving the TTL as well;
 *       it was not needed, and leaving it alone keeps spawn-zone churn exactly as playtested.
 *
 * The ordered types always land regardless of speed, because `pickGathererTarget` treats a queue
 * entry as a priority override at any distance — that, not the speed, is what guarantees the bill.
 *
 * ⚠ IT ALSO FIXES A TTL INTERACTION NOBODY HAD NAMED (S148 A.0 delta D3). `FREE_SPARK_TTL_TICKS` is
 * 600 (10 s) and an unclaimed spark simply dies. At the old 1.9 the outbound leg alone was 421 ticks
 * — **70 % of a target spark's entire lifetime** — so gatherers spent the walk watching their target
 * expire and re-aiming. At 2.6 the leg is 308 ticks (51 %), which buys the margin back WITHOUT
 * touching the TTL. The owner authorised moving `FREE_SPARK_TTL_TICKS` too; it was not needed, and
 * leaving it alone keeps the spawn-zone churn rate exactly as playtested.
 */
export const GATHERER_BASE_SPEED = 2.6;
/** Added to the base speed per purchased upgrade level. */
export const GATHERER_SPEED_PER_LEVEL = 0.8;
/** Upgrade levels are capped so the price stays meaningful and a gatherer cannot outrun its target. */
export const GATHERER_MAX_SPEED_LEVEL = 5;
/** How close a gatherer must be to a spark to pick it up / to its keep to deposit. */
export const GATHERER_REACH = 22;
/** Where a hauled shape is parked, relative to the owner's keep anchor. */
export const GATHERER_DEPOSIT_OFFSET_Y = 74;

/**
 * S141 P2 (V6-1.4) — how many entries one player's gatherer ORDER QUEUE may hold.
 *
 * A bound is REQUIRED, not defensive nicety: the queue is SERIALIZED AND HASHED, so an unbounded
 * array is an unbounded wire payload and an unbounded hash input that a player can grow by holding a
 * mouse button down. Hitting the cap is a silent no-op, the same shape as a full porch refusing a
 * pull. 24 is far past any real queue (the largest recipe is 9 shapes) and small enough that a stuck
 * button cannot affect the match.
 */
export const GATHERER_ORDER_QUEUE_MAX = 24;

/**
 * ⛔ S146 P2 — `CASTLE_BANK_CAP` IS DELETED. THE CASTLE INVENTORY IS LIMITLESS.
 *
 * Owner ruling: *"we will continue developing this by giving the castle limitless primitive place in
 * the inventory... just hold the 6 shape parts and show how many you have of each"*. This closes the
 * long-open 7-vs-12/13 question by removing the dial rather than turning it.
 *
 * WHAT THE CAP COST, RECORDED SO THE DECISION IS NOT RE-LITIGATED FROM MEMORY. Measured twice in a
 * real browser, solo, no seeding: the 7-slot bank filled in ~46 s and its composition then FROZE for
 * 11,449 further ticks — every build tile reading "NEED n MORE" forever, zero towers ever built, zero
 * errors. The cap also forced a whole apparatus into existence (a WAITING-on-full gatherer state, a
 * park-cargo-on-porch release, a decant-to-make-room click, free-slot arithmetic in four modules),
 * every line of which is now gone with it.
 *
 * The `__TEST_CASTLE_BANK_CAP__` seam went too, and so did the spec that used it: `bank-throughput.spec.ts`
 * was DELETED in the same commit (it existed to compare haul throughput across caps, and there is
 * nothing left to compare). ⚠ Do not send a future session looking for it — S148 measured the
 * zone-partition haul with a headless vitest harness instead (`gatherers/zoneEconomy.test.ts`).
 *
 * ⚠ DO NOT REINTRODUCE A CAP HERE without a new owner ruling. `bankAdd` returns `void` specifically
 * so that a failure branch cannot be added back at a call site by accident (see castleBank.ts).
 */


/**
 * S136 P1 — how many PORCH slots sit outside the castle gate, and where.
 *
 * A stored shape is PULLED from the bank onto the porch, one at a time, on the player's command
 * (owner item 5: "you can either pull them and build them one by one"). The pulled shape is an
 * ordinary Free spark, so the shipped drag-and-place flow handles it with zero changes.
 *
 * ⚠ WHY SLOTS AND NOT ONE POINT. The V6-1.2 deposit bug was `depositSlot` choosing a slot by
 * COUNTING banked shapes: the count is an occupancy TOTAL, not a high-water index, so grabbing one
 * from the middle collapsed the mapping and the next shape landed exactly on top of an existing one.
 * Two sparks at the same position sit inert (resolvePair early-returns under EPSILON) until a grab
 * perturbs them, at which point a near-zero distance with a near-maximal overlap gets converted by
 * Verlet into a large velocity — the owner's "the other flies to all hells". The pull path picks the
 * first slot that is actually UNOCCUPIED (see `firstFreePorchSlot`), which cannot co-locate by
 * construction, and refuses the pull when the porch is full.
 */
export const CASTLE_PORCH_SLOTS = 4;
/** Porch row offset below the keep anchor, and the horizontal pitch between slots. */
export const CASTLE_PORCH_OFFSET_Y = 74;
export const CASTLE_PORCH_PITCH_X = 30;
/** A porch slot counts as occupied if any spark is within this radius of it. */
export const CASTLE_PORCH_SLOT_CLEAR_RADIUS = 17;

// === Spawner physics ===
export const SPAWNER_BOUNCE_DAMPING = 0.92;
// S110 P2 — UNIFORM spawn speed (owner live-playtest: "same speed but random shapes").
// Was random 5–20; now both bounds = 12 so every fresh Free spark drifts at one speed while
// the SHAPE stays uniform-random (rngPick, spawner.ts) and the per-match reseed (S105) keeps
// the sequence unpredictable. CRITICAL determinism note: spawner.ts still calls
// rngRange(rng, MIN, MAX) — with MIN==MAX it returns 12 but STILL consumes one rng() draw, so
// the draw sequence (and thus the shape distribution, drawn first) is byte-identical to before.
export const SPARK_INITIAL_VELOCITY_MIN = 12;
export const SPARK_INITIAL_VELOCITY_MAX = 12;

/**
 * Phase-1 soft-cap. Despawn-on-overflow keeps the spawner zone playable during long sandbox
 * sessions. Oldest Free sparks despawn first; Carried sparks never despawn (they belong to the
 * player FSM), and escrowed ones are exempt (a haul in flight / a shape on the porch).
 *
 * S136 P4 — RE-DERIVED FROM MEASUREMENT: 50 → 24.
 *
 * At the old λ=0.1875 this constant was PROVABLY DEAD CODE: Little's Law gives a standing pool of
 * λ·W = 1.875 and the S132 probe measured mean 2.2 / peak 4, so nothing could ever approach 50. The
 * B3 ×6 faucet changes that, and the new number comes from actually watching the game rather than
 * from arithmetic alone — measured this session over 100 s per mode with the cap still at 50, so the
 * natural distribution was unmasked:
 *
 *     solo   mean 8.92   median 10   p95 15   PEAK 18     (1 gatherer consuming)
 *     bots   mean 4.48   median  2   p95 13   PEAK 14     (4 gatherers consuming)
 *
 * Little's Law predicts λ·W = 1.125 × 10 s = 11.25; solo's 8.92 sits just under it, the difference
 * being the gatherer eating from the pool. λ is GLOBAL, so seat count does not raise the mean — more
 * players means more consumption, i.e. the solo figure is the conservative one.
 *
 * 24 is chosen so the cap is a SAFETY VALVE rather than a throttle: comfortably above the observed
 * p95 (15) and peak (18) so ordinary play never touches it, low enough to be genuinely reachable in
 * a long unattended session (which is what the cap exists for), and still under the "≤30 free sparks
 * at 6P steady-state" assumption that src/physics/spatial.ts is sized against. Density check against
 * the S135-halved zone (SPAWNER_RADIUS 125): 24 sparks of r≈10 cover ~15% of the disc — dense enough
 * to read as a busy quarry, not a soup.
 */
export const FREE_SPARK_SOFT_CAP = 24;

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

// ⛔ S138 P2 — `STRUCTURE_GROW_IMPULSE` (S13 P2, 0.8 px) IS DELETED. DO NOT REINTRODUCE IT.
//
// It applied an OUTWARD verlet impulse to every primitive in the primary's pre-existing component
// on each placement, pushing them away from the component's local centroid (via `prevPos -=
// unit_outward × MAG`, so the implied velocity pointed outward). It was authored as a cosmetic
// "the structure is growing" puff.
//
// The owner played the live build and reported it as a DEFECT, verbatim: *"each primitive pushes
// another primitive away as anti-magnetism. get rid of it."* They are right about the mechanism —
// because placed primitives are held ONLY by `solveBonds` distance constraints and are never
// free-integrated (see `anchorStabilize.ts:9-11`), an injected outward velocity has nothing damping
// it except the bonds, so it reads as the shapes repelling each other on every single placement.
//
// The VISUAL half is retained: the `STRUCTURE_GROW` effect still emits under `cinematicsEnabled`, so
// the hop-by-hop flash is unchanged. Only the physics shove is gone (`placePrimitive.ts`).
// `MERGE_IMPULSE_MAGNITUDE` below is the OPPOSITE sign (INWARD, cross-structure merges only) and is
// deliberately KEPT — `session13.test.ts` asserts that split explicitly.

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

// === S125 P2 (F9) — per-peer INTENT token-bucket (trust hardening, AUDIT_S116 F9) ===
// The host validates INTENT *type* (isClientIntentAllowed) + *seat* (stampOrReject) but nothing
// bounds how FAST a modified client can drive dispatch(). A token bucket per sender caps that:
// each remote INTENT costs 1 token; the bucket refills at INTENT_BUCKET_REFILL_PER_SEC (cap
// INTENT_BUCKET_CAPACITY); an empty bucket DROPS the intent (host-only guard — a drop is identical
// to a network drop, so determinism is untouched; wall-clock refill is correct here).
// Sizing (Council S125): legit peak is well under this — UPDATE_AVATAR_POS is already 10Hz
// SENDER-throttled + human-paced builder actions, so even a multi-second tab-unfreeze burst
// (~30 buffered pos + a few actions) stays < 40 « 90 and never starves a real placement. A flood
// (thousands/s) is dropped after the 90-token burst, then held to 40/s. Playtest/telemetry
// (world.diagnostics.intentThrottled) can retune; a movement/action QoS split is the documented v2
// lever if action-drops ever show up.
export const INTENT_BUCKET_CAPACITY = 90;
export const INTENT_BUCKET_REFILL_PER_SEC = 40;

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

// S115 P1 (G2-PROMO Phase-2) — ANCHOR (Dot→Square magic combo) "planted joint". computeTerritorial-
// Influence degrades an enemy bond's stiffnessMultiplier to TERRITORY_ENGULF_STIFFNESS (0.3) inside
// hostile territory — driving a LOW-tier bond's EFFECTIVE stiffness to ~0.06 (the roadmap's "structures
// feel floppy in enemy territory" weakness). applyAnchorStabilize (state/anchorStabilize.ts) then FLOORS
// each live, un-fouled Anchor bond's multiplier back up to this value, so an anchored structure stays
// rigid/planted in contested ground. 1.0 = fully immune to sag; 0.3 = no effect; 0.7 = sags at most 30%
// (effective LOW 0.2×0.7=0.14 vs 0.06). #1 ANCHOR playtest knob. Host-only; the multiplier is ephemeral
// (recomputed every tick, NOT serialized) so this is replay-byte-identical by construction.
export const ANCHOR_STIFFNESS_FLOOR = 0.7;

// S118 P2 (B3 — KEYSTONE ANCHOR symbiotic combo) — an Anchor confers PART of its territorial rigidity
// to MAGIC bonds directly bonded to its endpoint primitives (state/keystoneAnchor.ts, runs AFTER
// applyAnchorStabilize). "Branch your magic structures off an Anchor and they resist enemy engulf-sag
// too" → build ORDER / topology becomes tactical (the North Star: connecting shape A to shape B IS the
// game). Set BELOW the anchor's own floor (0.7) so the Anchor bond stays the strongest joint and the
// neighbor benefit is a partial lift: a sagged magic neighbor rises 0.3 → 0.5 (effective LOW 0.2×0.5=
// 0.10 vs 0.06 sagged vs the anchor's own 0.14). 1.0 = full immunity; ≤ TERRITORY_ENGULF_STIFFNESS
// (0.3) = no effect. #1 KEYSTONE playtest knob. Host-only; stiffnessMultiplier is ephemeral (recomputed
// each tick, NOT serialized) so the whole mechanic is replay-byte-identical by construction.
export const KEYSTONE_STIFFNESS_FLOOR = 0.5;

// S121 P2 (B3 — INCOME KEYSTONE symbiotic combo) — the income-axis mirror of the rigidity Keystone
// above. An un-fouled FILAMENT (Dot↔Line, the income magic combo) confers a small standing-complexity
// (= income) bonus to the un-fouled MAGIC bonds branched off its endpoint primitives (state/scoring.ts,
// computeAllComplexities). "Branch your magic off an income hub and it pays more" → build TOPOLOGY becomes
// an INCOME decision, not just a rigidity one. Counted per Filament, CAPPED at KEYSTONE_INCOME_MAX_NEIGHBORS
// magic neighbors (max +0.75 complexity/Filament) so the mechanic rewards SPREADING income hubs rather than
// clustering N magic "whiskers" off one point (Council S121 Q1 — the magic-bond term is otherwise uncapped).
// #1 INCOME-KEYSTONE playtest knob. Host-authoritative + pure fn of synced state (integer-counted, one-shot
// expression) → replay-self-consistent; no wire/save bytes, PROTOCOL_VERSION unchanged.
export const KEYSTONE_INCOME_COMPLEXITY = 0.25;
export const KEYSTONE_INCOME_MAX_NEIGHBORS = 3;

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
/**
 * S147 P1 — E2E seam: `window.__TEST_HAZARDS_ENABLED__ = true` re-enables the four hazards that
 * Step 0 switched off (R14/R23), so the shipped hazard e2e specs keep their coverage instead of
 * being deleted or quarantined. Mirrors the `__TEST_*_SPAWN_SPARKS__` seams below (read once at
 * module load; Playwright's `addInitScript` runs before page scripts, so the flag is already set).
 *
 * Deliberately boolean-only and deliberately one-way-ish: it can only turn hazards back ON, never
 * off, so a stray flag can never silently disable a hazard the production build expects.
 * Returns null when unset so the production default (`false`) wins via `??`.
 */
function readTestHazardsEnabled(): boolean | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_HAZARDS_ENABLED__?: boolean }).__TEST_HAZARDS_ENABLED__;
  return v === true ? true : null;
}

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
/*
 * ⛔ S151 P2 (owner R76) — `CHEW_HITS` (5) IS DELETED. It said "five bites sever one connector",
 * which made a CONNECTOR'S DURABILITY a property of the ATTACKER — the same inversion owner R72
 * objected to in the goblin. It also meant every bond in the game was equally tough, whether it was
 * half of a loose pair or one strut of a forty-connector fortress, so complexity bought a builder
 * nothing. Durability now lives on the connector: `Bond.damageFifths` measured against
 * `stats.connectorCapacityFifths(count)` = `count + 4` fifths. How fast a chewer gets through it is
 * simply its `atk`.
 */
export const CHEW_INTERVAL_TICKS = 60; // 1 s per bite — the gnaw CADENCE (its damage is the chewer's atk)
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
// ⚠ CORRECTED S134 (the old "~124 B" was never measured, in either era) — MEASURED ~139.5 B JSON
// mid-chew after S133's chewProgress/targetBondId un-strip, and ~+41 B/creature more after S134's
// despawnAtTick/sourceSpawnerId un-strip. The full world rides the DataChannel every 100ms
// (NET_SNAPSHOT_HZ, no delta-encode), so 12 chewers ≈ +558 B/snapshot vs 8 — the old "≈ +1.5 KiB"
// was ~3× high. Trivial on WebRTC (Trystero auto-chunks), guarded by the
// wire-size assertion in save.replay.test.ts — ⚠ which is FIXTURE-scoped and not a runtime budget. CHEWER_MAX_PER_VICTIM (below) stays the governor of how
// many can attack ONE player at once in 1v1/vs-bots; the global cap mostly matters in FFA.
export const CHEWER_MAX_GLOBAL = 12; // hard ceiling on live chewers (overlap buffer; post-playtest ceiling 18)
export const CHEWER_MAX_PER_SPAWNER = 4; // overlap buffer above the ~3.3 steady-state; destruction rate scales with this
export const CHEWER_MAX_PER_VICTIM = 3; // one swarm can't fully strip a single player

// === S102 — UNIFIED HP / DAMAGE MODEL (owner correction OC2: "coherent, logical, epic") ===
// ONE damage scale across the whole game. Two kinds of destructible thing have HP:
//   • CONNECTORS (bonds): 5 chews sever a connector (= the owner's "5 chews to destroy a
//     connector"). A player RAID and a godly Voltkin still INSTANT-sever a connector (decisive
//     teardown) — they don't chip; the chewer is the only thing that whittles a connector down.
//     ⚠ S139 P1 — READ THIS BEFORE TRUSTING THE NAME BELOW. A bond has NO hp field of any kind
//     (`BondHashed` in stateHashFull.ts proves it). The whittling is implemented ENTIRELY as the
//     ATTACKER's commit counter `chewProgress`, and the real per-type ceiling is
//     `CREATURE_CONFIGS[type].chewHits`. `CONNECTOR_HP` below is therefore documentation shorthand
//     with ZERO code consumers — measured, not assumed. Its sibling `CHEW_DAMAGE` had zero
//     references of any kind and was DELETED in S139 P1 rather than left to imply a chip-damage
//     mechanism that does not exist. A constant that reads like the mechanism but drives nothing is
//     how the S137 "5% per tick" footgun happened.
//   • CREATURES (spawn): per-type hit-count HP. A pencil chewer dies in 1 hit; a godly Voltkin takes
//     2 (twice as tough). A "hit" = a player RAID (P3), a Voltkin zap on a chewer (P3), and next
//     session the laser beam + HELGA's slap. Each single-target hit deals 1; AoE (potato) = lethal.
// Creature death VFX: chewer -> green-goo splat; Voltkin -> discombobulated lightning-cloud (P3).
// ⚠ DOCUMENTATION SHORTHAND, NOT A MECHANISM — zero code consumers (S139 P1, verified by grep:
// every reference in src/ is a prose comment). The live ceiling is `CREATURE_CONFIGS[t].chewHits`.
/*
 * ⛔ S151 P2 — `CONNECTOR_HP` IS DELETED, and it is worth saying why it existed at all: it was
 * documentation shorthand with ZERO code consumers (S139 verified by grep — every reference was a
 * prose comment) for a mechanism that did not exist, because a Bond had no hp field. It now does,
 * and it is real: see `Bond.damageFifths`. A constant that reads like the mechanism but drives
 * nothing is how the S137 "5% per tick" footgun happened; this one is replaced rather than renamed.
 */
export const CHEWER_HP = 1; // a pencil chewer dies in 1 single-target hit (raid / Voltkin / laser / slap)
/**
 * ⭐ S150 R71 — 2 → 8. THE GODLY CREATURE WAS THREE TIMES FLIMSIER THAN A GRUNT.
 *
 * Owner: *"Voltkin hp should be 8"*, after seeing the measured table. At 2 hp a Voltkin died to ONE
 * of HELGA's slaps (`PRINCESS_SLAP_DAMAGE_VS_CREATURE` = 3) while a plain goblin at
 * `GOBLIN_MELEE_HP` = 6 survived to take two — so the summoned, cinematic, hard-to-build godly unit
 * was strictly weaker than the basic melee unit it is supposed to outclass. Nothing in the fiction
 * or the build cost justified that ordering; it was an artifact of two tunings done in different
 * sessions against different scales.
 *
 * At 8 it takes THREE slaps (3+3+3 ≥ 8), which puts it above the goblin's two and restores the
 * ladder chewer(1) < goblin(6) < voltkin(8).
 *
 * ⚠ AND THIS IS WHY IT COST A PROTOCOL BUMP. `serializeCreature` emits `hp` ONLY when a creature is
 * DAMAGED (`hp < config.hp`) — an undamaged one omits the field entirely and the receiving peer
 * rebuilds it from ITS OWN copy of this constant. That makes `VOLTKIN_HP` a SHARED CONSTANT BOTH
 * PEERS COMPUTE FROM, exactly like `KEEP_RING_RADIUS` (16→17) and `CASTLE_BANK_CAP` (18→19) before
 * it: a v27 peer would give a freshly-spawned Voltkin 2 hp while a v28 host gives it 8, and the two
 * would disagree about when it dies. See the 27→28 entry in `net/protocol.ts`.
 */
export const VOLTKIN_HP = 8; // a godly Voltkin takes 3 HELGA slaps — tougher than a goblin (6)
/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  ⭐ S151 P2 — THE OWNER'S UNIT STAT TABLE (R77), TRANSCRIBED
 * ────────────────────────────────────────────────────────────────────────────────────────────── *
 *
 * Owner R77 supplied HP / ATK / DEF / PEN for the whole roster outright: *"i can already give you hp
 * and def of all units so you wont be so confused."* Every number below is theirs. Nothing here is
 * derived from anything else — which is the entire point of R72.
 *
 * ⭐ AND THE OWNER'S OWN ARITHMETIC CONFIRMS THE FIFTHS MODEL. For the chewer they wrote
 * *"1 atk 2 pierce, 1hp, 0 def. so 1x1.4 offence, and 1 def"*. Our formula gives
 * `attackFifths(1, 2) = 1 x (5+2) = 7` fifths = 1.4, and `unitPoolFifths(1, 0) = 5` fifths = 1.0.
 * Both match exactly, derived independently.
 */
/** Chewer — "1 atk 2 pierce, 1hp, 0 def". HP lives in CHEWER_HP above. */
export const CHEWER_ATK = 1;
export const CHEWER_PEN = 2;
export const CHEWER_DEF = 0;
/** Melee goblin — "2 atk, 1 pierce, 1hp 2 def". HP lives in GOBLIN_MELEE_HP below. */
export const GOBLIN_MELEE_ATK = 2;
export const GOBLIN_MELEE_PEN = 1;
export const GOBLIN_MELEE_DEF = 2;
/* ── S151 P3 — THE OTHER FIVE GOBLIN KINDS (owner R77), each transcribed from the owner's line ──
 * "ranged goblin 2atk, 2pierce, 1hp, 1 def. melee goblin - 2 atk, 1 pierce, 1hp 2 def. shield
 *  goblin 1 atk, 0 pierce, 2hp, 3def. flying goblin 1 atk, 3 pierce, 2hp, 0 def. goblin hound -
 *  3 atk 2 pierce, 1 hp, 0 def. and terrorist goblin - 2hp 0def, only one attack that deals 4atk
 *  and 0 pierce in an area of effect."
 * The melee goblin's numbers live above with GOBLIN_MELEE_HP — it predates the tower. */
/** ARCHER (Line) — the ranged goblin. Trades toughness for reach and penetration. */
export const GOBLIN_ARCHER_HP = 1;
export const GOBLIN_ARCHER_DEF = 1;
export const GOBLIN_ARCHER_ATK = 2;
export const GOBLIN_ARCHER_PEN = 2;
/**
 * The archer's reach — the whole reason he exists. Well inside the laser turret's 420 so a turret
 * still outranges him (an emplacement should), but far enough that he kills without ever entering
 * the melee band the other five goblins fight in.
 */
export const GOBLIN_ARCHER_RANGE = 220;

/* ── S151 P3 — THE GOBLIN TOWER (owner R70) ─────────────────────────────────────────────────────
 * Owner: *"its a basic like 4 or 5 shape tower that takes one shape to feed to then spawn a goblin
 * of different kinds"*. Roadmap Q9/R24 settled the shape of it: ONE tower with SIX outputs, not six
 * towers.
 *
 * ⛔ WHY A CIRCLE HUB OF DEGREE 4, AND WHY IT HAD TO BE CHECKED RATHER THAN CHOSEN. Sizes 4 AND 5
 * are BOTH already occupied — stinkTower is size 4 (Square hub, degree 3) and pentagram is size 5
 * (a ring of 5 Triangles, every node degree 2). So "a 4 or 5 shape tower" cannot be distinguished
 * by size at all; it needs a free (hub type, hub degree) pair. Measured occupancy across the
 * shipped six: Square@3, Triangle@2 (ring), Dot@>=5, Line@6, Triangle@6, and voltkin's 4+4 split.
 * CIRCLE IS NEVER A HUB in any shipped recipe, and degree 4 is an unoccupied rung. Both facts are
 * re-derived from the live registry by `goblinTower.test.ts` rather than trusted from this comment.
 */
export const GOBLIN_TOWER_HUB_DEGREE = 4;
export const GOBLIN_TOWER_SIZE = GOBLIN_TOWER_HUB_DEGREE + 1; // 1 Circle hub + 4 leaves = 5
/** SHIELD (Square) — the wall. Highest DEF in the game; barely hits anything. */
export const GOBLIN_SHIELD_HP = 2;
export const GOBLIN_SHIELD_DEF = 3;
export const GOBLIN_SHIELD_ATK = 1;
export const GOBLIN_SHIELD_PEN = 0;
/** HOUND (Circle) — the glass sprinter. Top goblin ATK, no defence at all. */
export const GOBLIN_HOUND_HP = 1;
export const GOBLIN_HOUND_DEF = 0;
export const GOBLIN_HOUND_ATK = 3;
export const GOBLIN_HOUND_PEN = 2;
/** BAT RIDER (Spiral) — the owner's "flying goblin". Low ATK, but the highest PEN on a goblin. */
export const GOBLIN_BAT_HP = 2;
export const GOBLIN_BAT_DEF = 0;
export const GOBLIN_BAT_ATK = 1;
export const GOBLIN_BAT_PEN = 3;
/**
 * SUICIDE (Dot) — the owner's "terrorist goblin": *"only one attack that deals 4atk and 0 pierce in
 * an area of effect."*
 * ⚠ THE AoE SHAPE IS NOT IMPLEMENTED IN P3 — it detonates on arrival like the lightning drone, and
 * the drone's own AoE is likewise still a bond-sever rather than a stat-driven blast. Recorded as
 * deferred scope so the number is here when the blast lands, not invented later.
 */
export const GOBLIN_SUICIDE_HP = 2;
export const GOBLIN_SUICIDE_DEF = 0;
export const GOBLIN_SUICIDE_ATK = 4;
export const GOBLIN_SUICIDE_PEN = 0;
/** Owner: the drone's blast radius is LARGER than the suicide goblin's. Held as a relationship. */
export const GOBLIN_SUICIDE_BLAST_RADIUS = 70;

/**
 * Electric drone — "5 damage(atk) and 1 pierce in an area of effect (suicide drones) … 2hp, 0 def".
 * ⚠ THE AoE SHAPE OF ITS ATTACK IS NOT IMPLEMENTED YET — today the drone detonates via DRONE_EXPLODE,
 * which SEVERS bonds outright rather than dealing this atk in a radius. Recorded as scope, not
 * silently absorbed: see the S151 P2 close-out notes.
 */
export const DRONE_HP = 2;
export const DRONE_ATK = 5;
export const DRONE_PEN = 1;
export const DRONE_DEF = 0;
/**
 * HELGA — "4atk, 4pierce, 6hp, 4 def", and listed by the owner under *"those are all spawned
 * units"*. She is therefore a UNIT carrying her own durability, not an emplacement drawing it from
 * connectors — see `DefenderConfig.unitStats`.
 */
export const PRINCESS_ATK = 4;
export const PRINCESS_PEN = 4;
export const PRINCESS_HP = 6;
export const PRINCESS_DEF = 4;
/**
 * VOLTKIN — "3 atk (chain lightning …) 6 pierce. 8hp, and 3 def". HP lives in VOLTKIN_HP above
 * (unchanged at 8 since owner R71).
 * ⚠ CHAIN LIGHTNING IS NOT IMPLEMENTED — the owner describes it hitting *"multiple
 * connectors/targets that are within range of one another … maybe we do max6"*. Today a Voltkin
 * zaps ONE target. Recorded as scope.
 */
export const VOLTKIN_ATK = 3;
export const VOLTKIN_PEN = 6;
export const VOLTKIN_DEF = 3;
/** Owner's suggested ceiling for the chain, held here so the future implementation has a number. */
export const VOLTKIN_CHAIN_MAX_TARGETS = 6;
/**
 * ⭐ S152 P1 (owner R78) — A RAID IS A 2-ATK / 0-PEN HIT, AND NOTHING MORE THAN THAT.
 *
 * Owner: *"a raid point is basically a 2atk hit. you can use it on units and it will hit them (if
 * they are in the >2defensive points range then they will die)"*.
 *
 * ⛔ AUTHOR RAID DAMAGE ONLY VIA `attackFifths(RAID_ATK, RAID_PEN)`. These are ATK **POINTS**, not
 * fifths. Passing `RAID_ATK` to a fifths parameter deals two FIFTHS — 4/5 of nothing — and it
 * COMPILES CLEAN, because a unit change is not tsc-forced the way a type change is (the exact trap
 * S151 P2 recorded: renaming `hp`→`ehp` caught every unconverted READ, while every site that merely
 * PASSED a number stayed silently wrong).
 *
 * The whole R78 kill table falls out of `attackFifths(2,0) = 10` against `HP × (5 + DEF)`, with no
 * bespoke threshold rule anywhere: it one-shots chewer(5), ranged goblin(6), melee goblin(7),
 * hound(5), flying goblin(10), sapper(10) and drone(10); it does NOT one-shot shield goblin(16,
 * needs 2), HELGA(54, needs 6) or voltkin(64, needs 7).
 *
 * ⚠ AGAINST CONNECTORS THIS IS DELIBERATELY WEAK AND THAT IS THE POINT. A connector's capacity is
 * `connectorCapacityFifths(n) = n + 4`, so 10 fifths severs one only while the component has ≤6
 * connectors. Complex geometry is raid-proof, which is exactly the incentive owner R76 asked for
 * (*"this will make people want to build complex structures with as many connectors as possible"*).
 */
export const RAID_ATK = 2;
export const RAID_PEN = 0;
/**
 * ⭐ RAID POINT ACCRUAL, IN TENTHS, AS ONE SHARED POOL.
 *
 * Owner R78: *"either once you build 2 towers or make 5 connections you get one raid point"*.
 *
 * Two towers and five connections must both come to exactly one point, so the least-common unit is
 * a TENTH: a tower is worth 5 and a hand-made connection 2, and the threshold is 10.
 * Check: 2 × 5 = 10 ✓ and 5 × 2 = 10 ✓.
 *
 * ⭐ WHY ONE POOL AND NOT TWO INDEPENDENT COUNTERS. Under two counters a player who builds one tower
 * and three connections has 5 and 6 tenths of nothing and both part-payments are stranded; under one
 * pool they have 11 tenths — a point, with change. "Either/or" describes two ways to EARN the same
 * thing, so mixed play should never waste progress. The asymmetry the owner cares about survives
 * intact: hand-connecting out-earns click-to-build per action (2 tenths for one connection vs 5 for a
 * whole tower).
 *
 * ⚠ FIRST-PASS BALANCE, UNVALIDATED BY PLAY — the cap especially. Nothing has playtested whether 3
 * banked raids is a threat or a nuisance.
 */
export const RAID_PROGRESS_PER_TOWER = 5;
export const RAID_PROGRESS_PER_CONNECTION = 2;
export const RAID_PROGRESS_PER_POINT = 10;
export const MAX_RAID_POINTS = 3;
/**
 * ⭐ HOW LONG THE "RAIDED" CLOUD STANDS — 3 s at PHYSICS_HZ, as an INTEGER TICK COUNT.
 *
 * Owner R78: *"the cloud dissipates within 3 sec"*, and its purpose is attribution, not decoration:
 * *"players wont be confused as in WHAT HAPPENED TO MY UNIT!? it just disappeared!? and they will
 * know who attacked them"*.
 *
 * ⛔ TICKS, NEVER SECONDS OR `dt`. The renderer ages effects by `world.tick - effect.tick` at
 * PHYSICS_HZ, so a float lifetime would be the one place a wall-clock number could leak into a
 * comparison the `?worker=1` mirror also makes.
 */
export const RAIDED_CLOUD_TICKS = 3 * PHYSICS_HZ;
// S103 #8 — single-target creature-vs-creature / defender-vs-creature hit. A Voltkin zap on a
// chewer, a laser beam (P3), and HELGA's slap (P4) all deal this through the SAME `damageCreature`
// path: 1 → a chewer (CHEWER_HP=1) dies in one; a Voltkin (VOLTKIN_HP=8, S150 R71) takes eight of
// THESE, or three of HELGA's heavier slaps, before the lightning-cloud.
// ⚠ S152 P1 — THIS NO LONGER MATCHES THE RAID. It used to read "same value as
// RAID_CREATURE_DAMAGE by design (one coherent damage scale)", and owner R78 moved the raid to
// 2 ATK (`RAID_ATK` above) while leaving creature-vs-creature alone. The two numbers are now
// independent on purpose; do not re-couple them.
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
// === S113 Batch C — LIGHTNING-DRONE BUILDING (the "5-Circle + Dot" suicide-drone spawner) ===
// A player builds 1 Dot hub (bond-degree >= 5) + 5 Circle leaves -> a SPAWNER that emits up to 3
// self-exploding lightning DRONES on the standard 15s cadence. Each drone is the procedural Voltkin
// rig @0.5; it homes on the nearest ENEMY connector and detonates (radial sever of <=3 enemy bonds,
// 1 ARC_FLASH each) on arrival OR fuse-expiry. After the 3rd drone, on the next cadence slot the
// structure SELF-DESTRUCTS in a large owner-AGNOSTIC potato-style AoE (prims+bonds+creatures).
// ALL host-authoritative + tick-deterministic + replay-safe (no RNG, sorted-id AoE, single
// SEVER_BOND path with a new 'drone' cause). Every number below is a post-playtest DIAL.
// Owner design decisions (S113): Dot+Circle / loosened gate / 15s / nearest-enemy / <=3 bonds /
// owner-agnostic 240px self-destruct / own drone cap / Codex tile / host-seeded bots.
// Council R2 carry-forward (#1 post-playtest dial set, Grok balance alt): 20s cadence / 2 drones /
// 180px self-destruct if the 3-drone 240px-nuke proves too swingy on the owner's live playtest.
export const LIGHTNING_HUB_DEGREE = 5; // the Dot hub's minimum bond-degree (LOOSENED gate: >=, not ==)
export const LIGHTNING_HUB_LEAVES = 5; // 5 Circle leaves
export const LIGHTNING_HUB_COMPONENT_SIZE = LIGHTNING_HUB_DEGREE + 1; // 1 hub + 5 leaves = 6
export const DRONE_EMIT_INTERVAL_TICKS = SPAWN_INTERVAL_TICKS; // 900t = 15s — reuse the chewer cadence
export const STRUCTURE_SELFDESTRUCT_DRONE_COUNT = 3; // emit 3 drones, then self-destruct on the next slot
export const DRONE_LIFETIME_TICKS = 8 * PHYSICS_HZ; // 480t = 8s fly-time FUSE (explodes on expiry if it never arrived)
export const DRONE_EXPLODE_RADIUS = 110; // px — small targeted blast (== the drone's arrival/attack range)
export const DRONE_MAX_CONNECTORS = 3; // <=3 ENEMY bonds severed per drone (owner: "3 connectors per lightning")
export const DRONE_MAX_GLOBAL = 12; // hard ceiling on live drones (its OWN population, NOT shared with chewers)
export const DRONE_MAX_PER_SPAWNER = STRUCTURE_SELFDESTRUCT_DRONE_COUNT; // <=3 live from one hub
export const STRUCTURE_SELFDESTRUCT_RADIUS = 240; // px — large owner-AGNOSTIC "lightning storm" AoE on the anchor
export const LIGHTNING_DRONE_SPRITE_SCALE = 0.5; // the Voltkin rig at 50% (owner: "~50% smaller")

// ─────────────────────────────────────────────────────────────────────────────
// === S103 P2 — TOWER-DEFENSE DEFENDERS (the generic Defender substrate) ===
// A player builds a geometric recipe that "comes alive" as a stationary DEFENDER which
// auto-attacks the nearest enemy CREATURE in range via the unified `damageCreature` path
// (chewer dies in 1, Voltkin in 2 → lightning-cloud). Two kinds stand on ONE substrate:
//   • LASER TURRET (#9, P3): 1 Line(deg6) + 6 Spiral 'Whip' leaves — a slow heavy beam (S140 P1).
//   • HELGA PRINCESS (#10, P4): a Triangle hub + 3 'Warped Anchor' + 3 'Star' — a fast slapper.
// Defenders are removed by RECIPE-BREAK (a chewer eats the structure's bonds → the shape no
// longer matches → REMOVE_DEFENDER). ⚠ AMENDED S138 P1: that is no longer the ONLY way. The old
// `DEFENDER_HP = 1e9` sentinel — kept "for a future direct-attack lever (Council MF8) so adding it
// needs no re-bump" — has been cashed in for real per-kind hp (TURRET/PRINCESS_DEFENDER_MAX_HP).
// Recipe-break is unchanged and still primary; hp is additive.
// ALL tick-based + host-authoritative + replay-deterministic (no wall-clock, no Math.random).
export const DEFENDER_FIRE_HOLD_TICKS = 12; // FIRE state held ≥2 snapshot intervals so the 1v1
// client reliably observes it + renders the beam/slap VFX (Council MF1 — state is the event bus).
export const DEFENDER_RECOVER_TICKS = 12; // post-fire recovery before returning to IDLE
export const DEFENDER_REACQUIRE_TICKS = 12; // IDLE retry cadence when no enemy creature is in range
// ─────────────────────────────────────────────────────────────────────────────
// === S138 P1 — THE DAMAGE SUBSTRATE: one HP scale, one dispatcher ===
// Before S138 `damageCreature` was the ONLY damage function in src/ and NOTHING else in the
// game could be damaged: primitives had no hp, `DEFENDER_HP` was a 1e9 sentinel, and
// `CONNECTOR_HP` is not hp at all (it is the ATTACKER's `chewProgress` commit counter). That
// blocked the offence starter units ("walk toward the nearest enemy structure") and the Stink
// Tower's individually-destructible bags, both of which need a real target with real hp.
//
// ⭐ WHY THE SCALE IS 1000 AND NOT 100. The owner-ruled DoT model authors every damage-over-time
// effect as a PERCENTAGE OF MAX HP applied on a 0.5 s cadence (never per engine tick — at
// PHYSICS_HZ 60 "5% per tick" is death in 0.33 s). At a max of 1000, every percentage the design
// actually uses lands on an INTEGER: 1% = 10, 2.5% = 25, 5% = 50. Integer damage arithmetic
// cannot drift, which removes float-determinism risk from the host/worker differential outright
// rather than relying on both sides rounding identically. Do not lower this to 100 — 2.5% of 100
// is 2.5 and reintroduces exactly that hazard.
export const PRIMITIVE_MAX_HP = 1000; // a single placed shape
// ⭐ S139 P1 — THE CADENCE THE PARAGRAPH ABOVE HAS ALWAYS SPECIFIED AND NEVER DECLARED.
// S138 wrote the "% of max hp on a 0.5 s cadence" model into the comment above but minted no
// constant for it, so every future DoT author would have re-derived `0.5 * PHYSICS_HZ` by hand —
// and a hand-derived cadence is how "5% per tick" became death in 0.33 s in the first place.
// One application every 30 ticks = 2/sec. The WC3/Legion-TD lineage uses ~1 s; 0.5 s reads
// smoother and costs nothing. Pair it with an INTEGER per-application amount (see PRIMITIVE_MAX_HP)
// so `damageEntity`'s integer guard can never fire at runtime.
export const DOT_CADENCE_TICKS = 0.5 * PHYSICS_HZ; // 30 — one damage application every 0.5 s

// ─────────────────────────────────────────────────────────────────────────────
// === S139 P2 — THE GOBLIN: the first free, non-godly unit; the first STRUCTURE attacker ===
// Owner spec: "each player starts with one goblin of every kind that either attack the closest
// enemy structure or each other. takes them 6 attacks to destroy a connector or a UNIT."
//
// ⭐ WHY 167 AND NOT 166. The owner's rule is "6 attacks", and `damageEntity` THROWS on a
// fractional amount, so the per-hit number must be an integer that reaches PRIMITIVE_MAX_HP in
// exactly 6. 1000/6 = 166.67, so 166 gives 996 after six hits (a shape that survives on 4 hp — the
// rule silently becomes SEVEN attacks) while 167 gives 1002 ≥ 1000 on the sixth. The overshoot is
// inert: damageEntity does `hp -= amount` then tests `hp > 0`, so a negative residual simply dies.
// The lock test pins the RELATIONSHIP (6 hits fells a full-hp shape), not the literal 167 — because
// if PRIMITIVE_MAX_HP ever moves, 167 silently stops meaning six.
export const GOBLIN_DAMAGE_VS_PRIMITIVE = 167; // 6 × 167 = 1002 ≥ PRIMITIVE_MAX_HP 1000
// Unit-vs-unit runs on the OTHER hp scale. Creature hp is a hit COUNT (CHEWER_HP 1, VOLTKIN_HP 8)
// and every single-target hit deals CREATURE_HIT_DAMAGE = 1, so "6 attacks to destroy a UNIT" is
// expressed as the goblin's own hp being 6. Two scales, one owner-visible rule, all integers.
/**
 * ⭐ S151 P2 — 6 → 1. THE GOBLIN STOPS BEING THE BACKBONE, AND BECOMES CHEWER-FRAGILE.
 *
 * Owner R70: *"why is goblin 6 hp he should be as weak as chewer"*.
 *
 * ⚠ THIS EDIT WAS BLOCKED FOR A WHOLE SESSION, AND THE BLOCKER WAS THE DEFECT. S150 correctly refused
 * to change this number in isolation, because HELGA's slap and the LASER's beam were both DERIVED
 * from it — dropping the goblin would have silently nerfed both against every creature in the game.
 * S150 recorded that as "a constraint to respect". Owner R72 identified it as the thing to delete:
 * *"a goblins power should not be the backbone for the whole stat system."* With those derivations
 * gone (see `PRINCESS_SLAP_ATK` / `TURRET_BEAM_ATK`), this is finally a one-number change again.
 *
 * Now an HP POINT on the shared 1..12 ladder (`state/stats.ts`), not a private hit count: with DEF 0
 * its pool is 1 × (5+0) = 5 fifths, identical to a chewer's, which is exactly what R70 asked for.
 */
export const GOBLIN_MELEE_HP = 1; // R70 — as fragile as a chewer (was 6, and was the damage backbone)
export const GOBLIN_ATTACK_CADENCE_TICKS = 60; // 1 s per swing — the Voltkin ATTACKING→SEEKING bounce
export const GOBLIN_ATTACK_FIRE_TICK = 30; // damage lands mid-cycle (Voltkin's shipped fire tick)
export const GOBLIN_ATTACK_RANGE = 35; // true melee — same as the chewer, closes onto its target
export const GOBLIN_MAX_ACCEL = 140; // between a chewer (120) and a Voltkin (200): eager but readable
// PERSISTENT + a long lifetime: a free starter unit that evaporated on a timer would make the
// owner's "starts with one" meaningless within a minute. `persistent: true` routes it away from the
// DESPAWNING fade entirely, so it lives until something kills it.
export const GOBLIN_LIFETIME_TICKS = 60 * 60 * 60; // 60 min — effectively match-length
// Defenders now carry REAL hp instead of the old 1e9 sentinel. The S103 substrate deliberately
// pre-provisioned this: the sentinel was "kept for a future direct-attack lever (Council MF8) so
// adding it needs no re-bump", and `Defender.hp` has been serialized non-optional + hashed since
// S103. Recipe-break removal (REMOVE_DEFENDER) is UNCHANGED and remains the primary counterplay;
// hp is the second, additive way a defender can die.
// ⚠ FIRST-PASS BALANCE. Nothing in the game deals damage to a defender yet, so these numbers are
// unvalidated by play. They are tuned in the starters session, alongside the attacker that first
// exercises them — see the S138 carry-forward on authoring damage as totals over seconds.
/*
 * ⛔ S151 P2 — `TURRET_DEFENDER_MAX_HP` (3000) AND `PRINCESS_DEFENDER_MAX_HP` (2000) ARE DELETED.
 *
 * Owner R75: *"towers have attack and piercing but not def and hp because they are based on the
 * connectors that build them. its the connectors that have different hp and def (think about it)."*
 *
 * ⭐ THIS IS A REVERSION TO THE ORIGINAL DESIGN INTENT, NOT A NEW IDEA. Defenders shipped with
 * `DEFENDER_HP = 1e9` — a sentinel whose entire meaning was *"defenders die by recipe-break, not
 * damage (v1)"*. S138 cashed that sentinel in for real hit points, and the comment it shipped with
 * said plainly: *"⚠ FIRST-PASS BALANCE. Nothing in the game deals damage to a defender yet, so these
 * numbers are unvalidated by play."* They were never validated, because nothing ever attacked a
 * tower directly. R75 removes the bolt-on and puts durability back where the structure actually
 * lives: in its bonds (`physics/bonds.ts` `damageFifths`, `state/stats.ts`
 * `connectorCapacityFifths`).
 *
 * A tower is therefore killed by breaking the connectors that hold its recipe together — which is
 * what `REMOVE_DEFENDER` recipe-revalidation has always done anyway, and is now the ONLY way.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  ⭐ S151 P2 — TOWER ATK / PEN. THE GOBLIN IS NO LONGER THE BACKBONE OF THE DAMAGE SCALE.
 * ────────────────────────────────────────────────────────────────────────────────────────────── *
 *
 * Owner R72: *"a goblins power should not be the backbone for the whole stat system - there should
 * be a system in place that we define."*
 *
 * ⛔ THE DEFECT THIS REPLACES — and it is the S148 fix's own success turned into a liability. S148
 * gave each tower its own damage number, which was right, but expressed TWO of them as functions of
 * one grunt's hit points:
 *
 *     PRINCESS_SLAP_DAMAGE_VS_CREATURE = max(1, round(GOBLIN_MELEE_HP / 2))   // 3
 *     TURRET_BEAM_DAMAGE_VS_CREATURE   = GOBLIN_MELEE_HP                      // 6
 *
 * The S148 comment defended this as keeping "the arithmetic honest if the goblin's toughness ever
 * moves". It did the opposite: it meant the goblin's toughness could NOT move. Owner R70 asked for a
 * weaker goblin and the derivation silently re-tuned HELGA and the LASER against every creature in
 * the game. A balance lever that moves three unrelated numbers is not a lever, it is a trap.
 *
 * ⭐ THE NUMBERS BELOW ARE THE SAME 6 / 3 / 1 THAT SHIPPED. Nothing about tower-vs-unit balance
 * changes in this priority — only where the numbers COME FROM. They are now stated outright, on the
 * shared 1..12 ATK ladder (`state/stats.ts`), derived from nothing.
 *
 * ⚠ TOWERS HAVE NO HP AND NO DEF (owner R75) — *"towers have attack and piercing but not def and hp
 * because they are based on the connectors that build them"*. `TURRET_DEFENDER_MAX_HP` and
 * `PRINCESS_DEFENDER_MAX_HP` are DELETED, not moved. A tower's durability is its connectors'.
 */
/* ⛔ S151 P2 — `PRINCESS_SLAP_ATK` (3) removed: it was a Claude placeholder that reproduced the
 * shipped damage, and owner R77 superseded it outright with HELGA's real numbers (4 atk / 4 pen).
 * See `PRINCESS_ATK` below. */
/** The laser beam — the heavy single-target weapon, and the top of the roster. */
export const TURRET_BEAM_ATK = 6;
/**
 * The stink bag stays at the floor of the ladder ON PURPOSE. It is the AREA weapon: its damage comes
 * from splashing several targets at once (and from chewing primitives, which neither of the others
 * does), so giving it single-target punch as well would make it strictly better than both.
 */
export const STINK_BAG_ATK = 1; // ⭐ R77 — a bag deals "1atk 1pierce when destroyed"
/**
 * PENETRATION for all three towers. Zero today, and stated rather than omitted so that the roster
 * reads as a deliberate row of the matrix instead of an unfinished one. PEN is the lever that lets a
 * weapon ignore a target's DEF; nothing in the shipped roster needed it yet, and inventing non-zero
 * values here would be exactly the unvalidated first-pass balance R75 just deleted.
 */
export const TURRET_BEAM_PEN = 0; // owner R77 gave no turret PEN; unchanged
export const STINK_BAG_PEN = 1; // ⭐ R77 — was 0
// Laser turret (#9) — slow + heavy; the windup is shown via 5 rings derived from nextFireTick.
export const TURRET_FIRE_INTERVAL_TICKS = 1800; // 30 s @ 60 Hz (owner spec: "every 30s")
export const TURRET_WINDUP_TICKS = 18; // brief pre-beam tell after the long charge completes
export const TURRET_WINDUP_RINGS = 5; // client-visible charge rings across the fire interval (owner: "5 rings")
export const TURRET_ATTACK_RANGE = 420; // long reach (it's a turret)

// === S141 P1 — THE STINK TOWER: the first NON-GODLY, 4-shape buildable defender ===
//
// Recipe: 1 Square hub of bond-degree 3 + 3 Circle leaves = "1 Square + 3 Capsules" (every
// {Square,Circle} bond is the 'Capsule' magic combo). Four shapes, so at CASTLE_BANK_CAP = 7 it is
// holdable outright with three slots to spare — this is the cheapest, most accessible tower in the
// game and the first that is not a godly.
//
// ⚠ THE SHAPES ARE A CLAUDE RULING, NOT AN OWNER RULING — RETUNE FREELY. The S139 spec forbade
// guessing them; the owner then pre-approved a full autonomous run and was asleep. They were chosen
// on measured disjointness (see godlyRecipes/stinkTower.ts for the full collision sweep): Square is
// the ONLY primitive never used as a hub by any shipped recipe, and size 4 / hub-degree 3 are both
// unoccupied rungs of the ladder. Every consumer reads the four constants below, and every test pins
// the RELATIONSHIP rather than a literal, so changing them is one edit — not the copy migration the
// S140 laserTurret retune turned into.
//
// ⚠ AND IT IS THE EASIEST RECIPE IN THE GAME TO TRIGGER BY ACCIDENT — stated, not hidden. Degree 3
// with three leaves is far easier to hit than the shipped degree-5/6 stars, so dropping a Square
// among three loose Circles WILL build one. Two things make that benign rather than a bug: the
// component-size gate is EXACT and re-checked every REVALIDATE_INTERVAL_TICKS, so the tower
// self-removes the moment the player keeps building; and the death blast is gated on the anchor
// being GONE, so a deconstruction never detonates on the player's own structure. Watch it in
// playtest anyway — it is the single most likely thing to feel wrong.
export const STINK_TOWER_SIZE = 4; // 1 Square hub + 3 Circle leaves
export const STINK_TOWER_HUB_DEGREE = 3;
/*
 * ⛔ S151 P2 — `STINK_TOWER_MAX_HP` (1200) IS DELETED, for the same reason as its two siblings.
 * Owner R75: a tower has no hit points of its own. See the note above `TURRET_FIRE_INTERVAL_TICKS`.
 */
// Ammo. Bags are a SERIALIZED count, never derived: throwing is target-gated, so the number thrown
// is not a pure function of elapsed time, and the analogous spawner counter (`spawnedCount`) resets
// to 0 on every load — which would refill a derived magazine on every save, host migration and
// worker restore.
export const STINK_TOWER_BAGS = 5;
// One bag every 8 s. ⚠ MUST BE NON-ZERO: `loadRephaseDefenders` takes `% fireIntervalTicks` with no
// zero guard, so an interval of 0 would write NaN into nextFireTick on every load and migration.
export const STINK_THROW_INTERVAL_TICKS = 8 * PHYSICS_HZ; // 480
export const STINK_TOWER_WINDUP_TICKS = 20; // a visible lob wind-up
export const STINK_TOWER_ATTACK_RANGE = 260; // short — it lobs, it does not snipe (turret is 420)
// Bag impact: a small radial splash. Authored as an INTEGER because `damageEntity` THROWS on a
// fractional amount — 15 % of a primitive's 1000 max hp.
export const STINK_BAG_DAMAGE = 150;
export const STINK_BAG_RADIUS = 90;
// DEPLETED (0 bags): the tower stops throwing and becomes a passive area denier on the shared DoT
// beat. 2 % of max hp per application — integer at PRIMITIVE_MAX_HP 1000, and slow enough that it
// pressures rather than deletes.
export const STINK_AURA_DAMAGE = 20;
export const STINK_AURA_RADIUS = 120;
// Death blast — the owner's "bigger cooler explosion", scaling with the bags left unthrown. A tower
// killed while full is a bomb; one killed after it has spent its magazine is nearly harmless. That
// is the whole tactical read: starve it first, or eat the blast.
export const STINK_DEATH_BLAST_BASE_DAMAGE = 100;
/**
 * S151 P2 — the death blast's ATK against UNITS, on the shared ladder. Laser-weight (6) because a
 * detonation is a one-off event, not the tower's chip damage — the bag and the aura stay at the
 * area weapon's deliberate 1. Its damage to SHAPES remains on the 1000-scale constants below.
 */
export const STINK_DEATH_BLAST_ATK = 1; // ⭐ R77 — the tree "blows up with 1atk and 4pierce"
/** ⭐ R77 — the death blast's PENETRATION. 4, which is what makes a low-atk blast still bite. */
export const STINK_DEATH_BLAST_PEN = 4;
export const STINK_DEATH_BLAST_PER_BAG_DAMAGE = 60; // full 5 bags => 100 + 300 = 400
export const STINK_DEATH_BLAST_BASE_RADIUS = 110;
export const STINK_DEATH_BLAST_PER_BAG_RADIUS = 26; // full 5 bags => 110 + 130 = 240
// How many debris shards the blast throws, for the renderer + the deterministic burst directions.
export const STINK_DEATH_BLAST_SHARDS = 9;

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
// S110 P4 (Batch B): PRINCESS_SLAP_RANGE is now the ACQUISITION + chase-LEASH radius, measured from
// HELGA's hub ANCHOR — she engages enemy creatures near her hub and BREAKS OFF if they flee beyond
// it (bounded, so no cross-map chase — the Council anti-kite gate). She WALKS to the target and only
// STRIKES within PRINCESS_MELEE_RANGE.
export const PRINCESS_SLAP_RANGE = 380;

// === S110 P4 (Batch B) — HELGA full walk-to-target + melee locomotion ===
// She acquires the nearest enemy within PRINCESS_SLAP_RANGE of her hub, WALKS to it (deterministic
// Verlet arrive, mirrors creatureVerlet), slaps ONCE within PRINCESS_MELEE_RANGE, chases while the
// target stays inside the leash, else returns home. All px / px·s⁻²; pure fn of world.tick (no
// wall-clock, no RNG) → replay byte-equivalent. moveAccel sits between a chewer (120) and a Voltkin
// (200) so she CATCHES ground attackers but a fast Voltkin can outrun her (Council: a melee unit
// slower than its prey is pointless — the "too-strong" nerf is the RANGE + travel time, not speed).
export const PRINCESS_MELEE_RANGE = 40; // strike distance — she must be adjacent to slap
export const PRINCESS_MOVE_ACCEL = 150; // walk accel (chewer 120 < 150 < Voltkin 200) — #1 playtest dial
export const PRINCESS_ARRIVE_RADIUS = 50; // arrive ramp-down radius (smooth stop, no overshoot oscillation)
export const PRINCESS_HOME_EPSILON = 6; // within this of her hub anchor she is "home" (snap + idle)

// S112 — in-world render scale for HELGA's veo-atlas sprite (256px-tall cell → ~85px in-world, ~the
// procedural puppet's height). Playtest DIAL (like VOLTKIN_SPRITE_BASE_SCALE 0.17) — left un-pinned.
export const PRINCESS_SPRITE_BASE_SCALE = 0.34;

/**
 * ⭐ S151 P3 — GOBLIN SPRITE SCALE. Owner: *"their size is going to be about half the size of
 * current helga"*, so this is PRINCESS_SPRITE_BASE_SCALE / 2 rather than an independently chosen
 * number — expressed as the division so the relationship survives a retune of hers.
 */
/**
 * ⭐ S152 A3 (owner playtest) — *"make all the goblins about 75% larger than they are."*
 *
 * ⚠ THE DERIVATION FROM HELGA IS DEAD, and pretending otherwise would be the drift this file keeps
 * getting bitten by. The old value was `PRINCESS_SPRITE_BASE_SCALE / 2` = 0.17, from the owner's
 * earlier *"about half the size of current helga"*. That ruling has now been SUPERSEDED by a
 * measurement the owner made in play: at 0.17 the veo art's detail is unreadable on screen.
 *
 * 0.17 x 1.75 = 0.2975. Stated as the literal it now is, with the arithmetic recorded, rather than
 * as `PRINCESS_SPRITE_BASE_SCALE / 2 * 1.75` — which would silently re-scale every goblin the next
 * time Helga's own dial is retuned, and Helga's size is a separate owner decision.
 */
export const GOBLIN_SPRITE_BASE_SCALE = 0.2975;

/**
 * S151 P3 — the STINK TOWER's veo atlas scale. It is an emplacement rather than a unit, and its
 * source art is a tall tree, so it does not follow the goblin relationship.
 */
export const STINK_TOWER_SPRITE_BASE_SCALE = 0.42;

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

// === S115 P2 (G2-PROMO Phase-2) — Spindle tangential swirl (Line↔Circle) ===
// Where a Vortex sucks free sparks radially INWARD, a Spindle pushes them PERPENDICULAR so they SWIRL
// around it ("a spun spindle of stored motion"). A 90°-rotated Vortex (state/spindle.ts), with one
// addition the Council demanded: a CONSTANT tangential impulse would ACCUMULATE angular momentum →
// escape velocity (no centripetal force in this engine). So the push is BOUNDED by a tangential-SPEED
// cap — the swirl is non-accumulating by construction (provably no escape velocity, unit-tested).
export const SPINDLE_PULL_RADIUS = 200; // px — reach within which a free spark feels the swirl
export const SPINDLE_PULL_MIN_DIST = 14; // px — inside the core: no swirl (avoid a singular spin)
export const SPINDLE_PULL_ACCEL = 0.05; // px/tick tangential impulse AT the core, ramped to 0 at the
// edge, then the per-tick SUM across stacked Spindles is capped to this same value (no stacking yank).
export const SPINDLE_MAX_TANGENTIAL_SPEED = 2.0; // px/tick HARD cap on swirl-direction speed — the
// impulse only ever lifts a spark UP TO this, never beyond (the anti-escape-velocity bound). Also the
// #1 Spindle readability/feel knob: higher = faster orbit, lower = gentle drift. Deterministic; host-only.

// ── S122 P1 (B2 phase d — worker-sim cutover) ───────────────────────────────────────────────
// CUTSCENE_FADE_MS: the cutscene overlay's fade-out duration. MOVED here from
// render/cutsceneOverlay.ts (which re-exports it as FADE_MS for its render-side consumers) so the
// WORKER-side cinematic scheduler (state/workerSim.ts) can compute the deterministic tick-domain
// completion moment (cinematicMs + sustainedEffectMs + CUTSCENE_FADE_MS — the exact S31 P0-1
// spawn-delay math) without importing render/ into the worker chunk. Value unchanged since S31.
export const CUTSCENE_FADE_MS = 300;
