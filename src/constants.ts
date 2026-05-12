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

export const SPARK_TYPE_NAMES: Record<SparkType, string> = {
  [SparkType.Dot]: 'Dot',
  [SparkType.Line]: 'Line',
  [SparkType.Triangle]: 'Triangle',
  [SparkType.Square]: 'Square',
  [SparkType.Circle]: 'Circle',
  [SparkType.Spiral]: 'Spiral',
};

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

// Player palette — 6 distinct, max-saturation, color-blind-aware.
export const PLAYER_COLORS = [
  0xff3b6b, // P1 Crimson
  0x3bd7ff, // P2 Cyan
  0x9bff3b, // P3 Lime
  0xffb13b, // P4 Amber
  0xd73bff, // P5 Magenta
  0x3bffb1, // P6 Mint
] as const;

// === Canvas, Spawner, Vision ===
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const SPAWNER_RADIUS = 250;
export const SPAWNER_CENTER_X = CANVAS_WIDTH / 2;
export const SPAWNER_CENTER_Y = CANVAS_HEIGHT / 2;
export const SPAWN_RATE_PER_SECOND = 0.15;

// Phase-2 vision (placeholders — unused in Phase 1)
export const R_PERSONAL = 300;
export const R_BEACON = 80;
export const VISION_FADE_PX = 40;

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
export const AREA_CLAIM_BASE = 1.0;
export const AREA_CLAIM_PER_NEIGHBOR = 0.1;
export const AREA_CLAIM_CAP = 2.0;
export const MEGA_COMBO_MULTIPLIER = 1.75;

// === Disruption ===
export const BUILD_ACTIONS_PER_CHARGE = 5;
export const MAX_DISRUPTION_CHARGES = 2;

// === Win condition ===
export const TERRITORY_WIN_THRESHOLD = 0.51;
// Phase 1 single-player placeholder: trigger WIN at N primitives instead of % canvas.
// S9 P3: kept for back-compat / fallback tooling but unused in the WIN check —
// scoreProgress + PHASE_1_WIN_SCORE drive WIN now.
export const PHASE_1_WIN_PRIMITIVE_COUNT = 30;

// === Scoring (S9 P3) ===
// Replaces flat primitive-count progress with a combo-weighted accumulator.
// Closes the post-S8 playtest report that "every combination of shapes ...
// gives the same amount of points toward victory."
//
// Magic combos (the 12 from § V.1) are worth 3×; Functional placeholders
// 1×; anchor placements (no target = no bond) 1×. WIN fires at 50 points —
// a ~30-primitive all-functional structure (29 functional bonds + 1 anchor =
// 30 score) won't win, but a ~17-primitive all-magic chain (16 magic bonds
// × 3 + 1 anchor = 49) is right at the gate, and any mid-build mix scales
// between. Threshold is one playtest constant; expect S10 tuning.
export const SCORE_ANCHOR = 1;
export const SCORE_FUNCTIONAL_BOND = 1;
export const SCORE_MAGIC_BOND = 3;
export const PHASE_1_WIN_SCORE = 50;

// === Spawner physics ===
export const SPAWNER_BOUNCE_DAMPING = 0.92;
export const SPARK_INITIAL_VELOCITY_MIN = 5;
export const SPARK_INITIAL_VELOCITY_MAX = 20;

// Phase-1 soft-cap. Despawn-on-overflow keeps the spawner zone playable
// during long sandbox sessions. Oldest Free sparks despawn first; Carried
// sparks never despawn (they belong to the player FSM).
export const FREE_SPARK_SOFT_CAP = 50;

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
// (60, primary target picking precision, defined locally in controls.ts).
// 100 px is wide enough that three structures arranged ~90 px apart
// around a placement point all enter the merge sweep, but not so wide
// that distant unrelated structures get pulled in unintentionally.
// Closes the user-reported "place at center of 3 structures and only one
// merges" bug — root cause was AUTO_BOND_RADIUS=60 doubling as both
// primary-pick radius AND merge-sweep radius. S13 P1 splits them.
export const MERGE_REACH_RADIUS = 100;


// Tier-gated corner pulse boundary. scoreProgress crossing each multiple
// of SCORE_TIER_STEP fires one SCORE_TIER effect. At 15 + threshold 50:
// 3 tier events before WIN.
export const SCORE_TIER_STEP = 15;

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

// === Bond rendering ===
export const BOND_LINE_WIDTH = 2;
export const BOND_GLOW_INTENSITY = 0.6;

// === Audio ===
export const AUDIO_MASTER_VOLUME_DB = -6;

// === S15 P2 — Phase-2 1v1 networked play (§ 11 LOCKED amendment) ===
// Trystero/Nostr WebRTC, host-authoritative. Council R2: 10 Hz snapshot
// rate + 100ms lerp interpolation are both MVP-non-negotiable.
export const NET_SNAPSHOT_HZ = 10;
export const NET_INTERPOLATION_MS = 100;
export const NET_ROOM_CODE_LENGTH = 6;
export const NET_CONNECTION_TIMEOUT_MS = 30000;
