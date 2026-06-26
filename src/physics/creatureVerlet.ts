/**
 * SPARK — creature Verlet physics + steering (S26 P0 Voltkin Phase 2B).
 *
 * Mirrors the `verletStep` pattern (`src/physics/verlet.ts:24-35`) but operates
 * on Creature bodies in the dedicated `world.creatures` Map. Phase-through prims
 * by construction — creatures are NOT in the sparkArr or bondArr lists that
 * `solveBonds` / `resolveCollisions` operate on; this module's `creatureVerletStep`
 * mutates pos/prevPos in-place independently.
 *
 * Blueprint compliance (`.claude/plans/voltkin_phase2_blueprint_v1.md`):
 *   - Q1: Verlet integration inside the 8-substep loop after bond solver.
 *   - Q5: Time-only lifecycle (despawnAtTick = spawnedAtTick + 480).
 *   - Edge Case #5: Spawner-zone repulsion at SPAWNER_RADIUS + 50px.
 *
 * S26 Council R1 + PRIME-AUDIT deltas:
 *   - Δ2: per-behavior helpers (seekForce / arriveForce / repulseForce) are
 *     exported module-level so unit tests can exercise each force in isolation
 *     (Gemini Q4 testability) while `computeSteeringAccel` retains a simple
 *     public surface (Grok Q4). S27 may compose differently per FSM state.
 *   - Δ4: `computeSteeringAccel` returns ZERO_ACCEL when state !== 'SEEKING'.
 *     Cross-resolves Q7 (SPAWNING+repulse momentum trap — Gemini; DESPAWNING
 *     substep drift — Grok) with one rule.
 *   - Δ5: stub target derives from (spawnedAtTick, ownerPlayerId) — no rng /
 *     no world.rng dependency (world.rng does NOT exist; rng is local to
 *     main.ts:171). ownerPlayerId·π offset prevents both 1v1 creatures from
 *     converging on the same target. Clamped to canvas-with-padding so the
 *     creature can never get stuck pressing against a wall.
 *   - Δ7 (carry-forward): cross-engine IEEE 754 cos/sin determinism is a known
 *     1v1 replay concern; S28 NetSnapshot v2 will resolve by SERIALIZING
 *     targetPos rather than recomputing client-side.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  POOP_SLOW_MULTIPLIER,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  VELOCITY_DAMPING,
} from '../constants.ts';
import type { Creature } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import type { PlayerId, Vec2 } from '../types.ts';

/** Shared zero-accel sentinel. Callers must NOT mutate. */
export const ZERO_ACCEL: Vec2 = { x: 0, y: 0 };

/**
 * Per-substep peak acceleration (px/s²). Steady-state velocity under
 * VELOCITY_DAMPING=0.998/substep at 480Hz ≈ A / 460.8 px-per-substep ≈ A · 1.04 px/s.
 * 200 → ~208 px/s top speed: creature crosses ~500px in ~2.4s, leaving meaningful
 * arrive-time inside an 8-second creature lifetime (60-tick SPAWNING + ~6s SEEKING
 * + 60-tick DESPAWNING).
 */
export const CREATURE_MAX_ACCEL = 200;

/** Arrive ramp-down begins inside this radius (px). Linear scale → zero at target. */
export const CREATURE_ARRIVE_RADIUS = 80;

/** Spawner repulsion zone radius (px). Blueprint Edge Case #5: SPAWNER_RADIUS + 50. */
export const CREATURE_SPAWNER_REPULSE_RADIUS = SPAWNER_RADIUS + 50;

const SPAWNER_POS: Vec2 = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };

/** Stub target orbit radius around spawner centroid for S26 demo (S27 replaces). */
const STUB_TARGET_RADIUS = 360;

/** Edge padding so stub target never clips the canvas walls. */
const STUB_TARGET_PADDING = 80;

/** Irrational angle multiplier so consecutive spawns produce visibly different targets. */
const PHI = 1.6180339887498949;

/**
 * Step a single Creature one Verlet substep. Mutates pos/prevPos in place.
 * Mirrors verletStep (verlet.ts:24-35) exactly: implicit velocity = (pos - prevPos),
 * damped per substep by VELOCITY_DAMPING. accel is in px/s² (multiplied by dt²).
 */
export function creatureVerletStep(c: Creature, dtSub: number, accel: Vec2 = ZERO_ACCEL): void {
  const px = c.pos.x;
  const py = c.pos.y;
  const vx = (px - c.prevPos.x) * VELOCITY_DAMPING;
  const vy = (py - c.prevPos.y) * VELOCITY_DAMPING;
  const ax = accel.x * dtSub * dtSub;
  const ay = accel.y * dtSub * dtSub;
  c.prevPos.x = px;
  c.prevPos.y = py;
  c.pos.x = px + vx + ax;
  c.pos.y = py + vy + ay;
}

/**
 * Combined steering force for a Creature this substep. Composes arriveForce +
 * repulseForce. Clamps the summed magnitude to CREATURE_MAX_ACCEL so simultaneous
 * forces never exceed the per-substep peak (Gemini Q4 RISK).
 *
 * Δ4: returns ZERO_ACCEL when state !== 'SEEKING' — SPAWNING + DESPAWNING are
 * force-free so the creature simply damps to rest, avoiding both
 *   (a) Gemini Q7 SPAWNING+repulse momentum trap (creature pushed backwards
 *       during 60-tick spawning before seek activates), and
 *   (b) Grok Q7 DESPAWNING substep drift (creature accelerating during fade).
 *
 * CHECK Triumvirate trade-off documented (Gemini-Auditor G2 2026-05-14): force-
 * free SPAWNING means a creature whose spawn pos happens to fall inside the
 * spawner repulse zone will sit stationary for 1s before repulse activates at
 * the SEEKING transition. In practice, `event.targetPos` (the chain centroid)
 * is always built away from spawner — players don't construct in the spark
 * spawn zone — so this edge case is rare. Applying repulse-only during SPAWNING
 * was considered and rejected because it reintroduces Gemini's R1 Q7 momentum
 * trap (a different and more severe failure mode). The current behavior is the
 * documented cross-resolve.
 */
export function computeSteeringAccel(c: Creature, tick = 0): Vec2 {
  if (c.state !== 'SEEKING') return ZERO_ACCEL;
  // S100 P1 (TD Phase 1a, R16) — de-hardcode the peak accel: read it from the
  // creature's config instead of the bare CREATURE_MAX_ACCEL module const. For
  // Voltkin `config.maxAccel === CREATURE_MAX_ACCEL === 200` (× hopSpeedMul 1), so
  // its locomotion is byte-identical (the byte-equivalence guard). A chewer's config
  // already bakes hopSpeedMul into maxAccel (200 × 0.6 = 120) → the slower, readable
  // hop. The per-behavior helpers take the same effective cap so the arrive/repulse
  // ramps scale with it (not just the post-sum clamp).
  const maxAccel = getCreatureConfig(c.type).maxAccel;
  const arrive = arriveForce(c, c.targetPos, CREATURE_ARRIVE_RADIUS, maxAccel);
  // S102 #3 — the SPAWNER_POS repulse is the canvas-CENTRE spark-spawner zone (legacy
  // Voltkin scaffolding). A CHEWER must close ONTO its target connector to chew it at
  // melee range, not be held ~300px off by a phantom centre-repulse — so it is skipped
  // for chewers (`sourceSpawnerId !== null`). Voltkin (`sourceSpawnerId === null`) keeps
  // the repulse byte-identical (its locomotion is the replay-equivalence guard).
  const repulse = c.sourceSpawnerId === null
    ? repulseForce(c, SPAWNER_POS, CREATURE_SPAWNER_REPULSE_RADIUS, maxAccel)
    : ZERO_ACCEL;
  let ax = arrive.x + repulse.x;
  let ay = arrive.y + repulse.y;
  const mag = Math.hypot(ax, ay);
  if (mag > maxAccel) {
    const scale = maxAccel / mag;
    ax *= scale;
    ay *= scale;
  }
  // S109 P2 — a seagull-pooped creature (chewer/Voltkin) crawls at POOP_SLOW_MULTIPLIER of its
  // steering accel until poopyUntilTick ("still in effect but slowed if poop hits them"). Applied
  // to the FINAL accel so the whole output scales uniformly. NO-OP (byte-identical) when un-pooped
  // → the Voltkin/chewer replay-equivalence guard holds. Deterministic (pure fn of synced tick).
  if (c.poopyUntilTick !== undefined && tick < c.poopyUntilTick) {
    ax *= POOP_SLOW_MULTIPLIER;
    ay *= POOP_SLOW_MULTIPLIER;
  }
  return { x: ax, y: ay };
}

/**
 * Deterministic stub target for S26 demo. Derived from (spawnedAtTick, ownerPlayerId)
 * so 1v1 simultaneous triggers produce visibly different targets (Δ5 ownerPlayerId·π
 * offset prevents both-creatures-same-target). Result is clamped to canvas-with-
 * padding so the creature can't get stuck pressed against an edge.
 *
 * S27 REPLACES this with AI target selection (nearest enemy bond / fallback to own
 * structures per blueprint Q12). S28 NetSnapshot v2 SERIALIZES targetPos rather
 * than recomputing client-side (Δ7 IEEE 754 cross-engine determinism resolution).
 */
export function computeStubTargetPos(spawnedAtTick: number, ownerPlayerId: PlayerId): Vec2 {
  const angle = spawnedAtTick * PHI + ownerPlayerId * Math.PI;
  const rawX = SPAWNER_CENTER_X + STUB_TARGET_RADIUS * Math.cos(angle);
  const rawY = SPAWNER_CENTER_Y + STUB_TARGET_RADIUS * Math.sin(angle);
  return {
    x: clamp(rawX, STUB_TARGET_PADDING, CANVAS_WIDTH - STUB_TARGET_PADDING),
    y: clamp(rawY, STUB_TARGET_PADDING, CANVAS_HEIGHT - STUB_TARGET_PADDING),
  };
}

// === Per-behavior steering helpers (S26 Council Q4 COMPROMISE Δ2).
//
// @internal — exported for testability ONLY. Production composition lives in
// `computeSteeringAccel` above; the three helpers below are imported solely
// by `src/physics/creatureVerlet.test.ts` (4 sites). Future creatures (Anvil,
// etc.) may compose differently per-FSM-state (S27 carry-forward) so the
// helpers stay public-named to keep the regression-test isolation cheap.
//
// **Do NOT import these from outside src/physics/creatureVerlet.test.ts.**
// S34 P2-17 (S30 audit follow-through) — annotation locks this contract.
// ============================================================================

/**
 * @internal Test-only export. See block comment above.
 * Unit vector × CREATURE_MAX_ACCEL from creature toward target. ZERO at coincident pos.
 */
export function seekForce(c: Creature, target: Vec2, maxAccel: number = CREATURE_MAX_ACCEL): Vec2 {
  const dx = target.x - c.pos.x;
  const dy = target.y - c.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  return {
    x: (dx / dist) * maxAccel,
    y: (dy / dist) * maxAccel,
  };
}

/**
 * @internal Test-only export. See block comment above seekForce.
 * Seek with linear ramp-down inside arriveRadius — smooth approach, no oscillation.
 */
export function arriveForce(
  c: Creature,
  target: Vec2,
  arriveRadius: number,
  maxAccel: number = CREATURE_MAX_ACCEL,
): Vec2 {
  const dx = target.x - c.pos.x;
  const dy = target.y - c.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const scale = dist < arriveRadius ? dist / arriveRadius : 1;
  return {
    x: (dx / dist) * maxAccel * scale,
    y: (dy / dist) * maxAccel * scale,
  };
}

/**
 * @internal Test-only export. See block comment above seekForce.
 * Linear-strength repulsion from `source` inside `radius`; zero outside.
 */
export function repulseForce(
  c: Creature,
  source: Vec2,
  radius: number,
  maxAccel: number = CREATURE_MAX_ACCEL,
): Vec2 {
  const dx = c.pos.x - source.x;
  const dy = c.pos.y - source.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || dist >= radius) return { x: 0, y: 0 };
  const strength = (1 - dist / radius) * maxAccel;
  return {
    x: (dx / dist) * strength,
    y: (dy / dist) * strength,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
