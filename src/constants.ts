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
export const MERGE_IMPULSE_MAGNITUDE = 1.2;

// Tier-gated corner pulse boundary. scoreProgress crossing each multiple
// of SCORE_TIER_STEP fires one SCORE_TIER effect. At 15 + threshold 50:
// 3 tier events before WIN.
export const SCORE_TIER_STEP = 15;

// === Bond rendering ===
export const BOND_LINE_WIDTH = 2;
export const BOND_GLOW_INTENSITY = 0.6;

// === Audio ===
export const AUDIO_MASTER_VOLUME_DB = -6;
