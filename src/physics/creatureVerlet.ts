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
  CREATURE_BRAKE_DAMPING,
  POOP_SLOW_MULTIPLIER,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  VELOCITY_DAMPING,
  WORLD_EDGE_MARGIN,
} from '../constants.ts';
import type { Creature } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { isStunned, rageMultiplier } from '../state/creatures/creature.ts';
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
export function creatureVerletStep(
  c: Creature, dtSub: number, accel: Vec2 = ZERO_ACCEL, damping: number = VELOCITY_DAMPING,
): void {
  const px = c.pos.x;
  const py = c.pos.y;
  const vx = (px - c.prevPos.x) * damping;
  const vy = (py - c.prevPos.y) * damping;
  const ax = accel.x * dtSub * dtSub;
  const ay = accel.y * dtSub * dtSub;
  c.prevPos.x = px;
  c.prevPos.y = py;
  c.pos.x = px + vx + ax;
  c.pos.y = py + vy + ay;
  clampIntoPlayfield(c.pos, c.prevPos);
}

/**
 * ⭐⭐⭐ S178 (owner) — **THE PLAYFIELD EDGE. THE SIM HAD NEVER HAD ONE.**
 *
 * Owner, S178: *"they just chased my creatures behind my castle … it just chased them out of bounds,
 * like, above my castle to the east. What the shit? How does that happen?"*
 *
 * ⛔ IT LIVES INSIDE THE INTEGRATOR, AND THAT IS LOAD-BEARING RATHER THAN TIDY. `stepPhysics` is
 * driven by the host AND by `workerSim` / `simWorker`, and both reach a creature only through
 * `creatureVerletStep`. Clamping in `physicsLoop` or in `hostTick` instead would leave the worker
 * mirror unclamped and convert a gameplay bug into a HOST-VS-WORKER DIVERGENCE, which is the one
 * defect class this codebase treats as worse than the bug being fixed.
 *
 * ⛔⛔ AND `prevPos` MOVES WITH `pos`, WHICH IS THE WHOLE TRAP. This is a Verlet integrator: velocity
 * is implicit in `pos − prevPos`. Clamping the position ALONE manufactures a one-frame velocity of
 * exactly the overshoot, pointing back inward, and the next substep FLINGS the unit across the
 * board. Shifting `prevPos` by the identical delta preserves the velocity the creature actually had,
 * so a unit pressed against the edge simply stays pressed against it. `recallArmies` documents this
 * same trap at its own teleport (*"⚠ prevPos MOVES WITH pos"*).
 *
 * ⚠ PURE: no clock, no rng, no accumulator. Two sims stepping identical state produce identical
 * clamps, so this adds no divergence surface of its own.
 *
 * ⚠⚠ TWO SIBLING INTEGRATORS ARE DELIBERATELY NOT CLAMPED, AND THE REASON IS RECORDED HERE SO THE
 * NEXT SESSION DOES NOT "FINISH THE JOB" AND BREAK SOMETHING.
 *   · `defenders/defenderMotion.ts` (Helga) writes `pos` unbounded too, but she is held by her HUB
 *     LEASH — the anti-kite gate the owner asked for after *"she effectively lasers across the
 *     map"* — so she has no path to an edge in the first place. Clamping her would be dead code
 *     today and would silently become her real bound if that leash were ever retuned.
 *   · `hunters/hunterAI.ts` is the same shape and MUST NOT be clamped without a ruling: the hunter
 *     legitimately spawns from OUTSIDE the board (`hunterLifecycle` seeds it off-canvas) and the
 *     seagull's `SEAGULL_DEPART_MARGIN` shows the codebase deliberately lets some entities live
 *     past the edge. A clamp here would trap a hunter at its own spawn point.
 * Both are latent rather than live. Named in the S178 open questions rather than guessed at.
 */
export function clampIntoPlayfield(pos: Vec2, prevPos: Vec2): void {
  const lo = WORLD_EDGE_MARGIN;
  const hiX = CANVAS_WIDTH - WORLD_EDGE_MARGIN;
  const hiY = CANVAS_HEIGHT - WORLD_EDGE_MARGIN;
  const cx = pos.x < lo ? lo : pos.x > hiX ? hiX : pos.x;
  const cy = pos.y < lo ? lo : pos.y > hiY ? hiY : pos.y;
  if (cx !== pos.x) {
    prevPos.x += cx - pos.x;
    pos.x = cx;
  }
  if (cy !== pos.y) {
    prevPos.y += cy - pos.y;
    pos.y = cy;
  }
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
/**
 * ⭐⭐ S175 P10 (owner) — PURE: what this creature's velocity should damp at THIS substep.
 *
 * Owner: *"they keep sliding forward while hitting … it's like they're ice skating … then they lose
 * whoever they were attacking, and then they need to move back to him, slide a little bit closer."*
 *
 * A creature that has stopped steering does not stop MOVING — `ZERO_ACCEL` means coast. Braking is
 * the missing half, and it is applied as DAMPING rather than as an opposing force on purpose: a
 * counter-accel can overshoot into reverse and jitter, while damping is unconditionally stable and
 * cannot push a unit backwards.
 *
 * ⛔ THREE EXEMPTIONS, AND EVERY ONE OF THEM IS SOMETHING THE CODEBASE ALREADY ARGUED FOR:
 *
 *  1. **STUNNED coasts.** R139's sonar wave *"stuns and pushes back"*, and the stun gate returns
 *     ZERO_ACCEL precisely so the unit is free to slide under that impulse. Braking a stunned
 *     creature would eat the knockback — two halves of one owner sentence fighting each other.
 *  2. **SPAWNING and DESPAWNING coast.** Force-free by Q7/Δ4; they are not trying to stand still,
 *     they are entering and leaving. Touching them reopens the momentum trap.
 *  3. **A `holdsRange` fighter coasts** — it is the ONE family that keeps steering while attacking
 *     (S154 P2), and its `arriveForce` already brakes it onto a standoff ring. Damping it too
 *     would fight the force that is holding its station.
 *
 * Which leaves exactly the case he described: a melee unit, mid-swing, still gliding.
 */
export function creatureDamping(c: Creature, tick = 0): number {
  if (c.state !== 'ATTACKING') return VELOCITY_DAMPING;
  if (isStunned(c, tick)) return VELOCITY_DAMPING;
  if (getCreatureConfig(c.type).holdsRange) return VELOCITY_DAMPING;
  return CREATURE_BRAKE_DAMPING;
}

export function computeSteeringAccel(c: Creature, tick = 0): Vec2 {
  /*
   * ⭐ S154 P2 — Δ4 IS NARROWED FOR STANDOFF FIGHTERS, AND ONLY FOR THEM.
   *
   * Δ4 above says "ZERO_ACCEL when state !== 'SEEKING'", and the trap it cross-resolves is real:
   * SPAWNING and DESPAWNING must be force-free. But `ZERO_ACCEL` means **COAST, NOT STOP** — a
   * creature that enters ATTACKING still carrying velocity keeps gliding, and `VELOCITY_DAMPING` is
   * 0.998 per SUBSTEP (≈0.984/tick), so a modest 0.2 px/tick takes ~200 ticks to bleed away.
   *
   * Traced with the real host tick: the bat rider engaged correctly at 121 px and then drifted to
   * **53.7 px** over the next three seconds, asymptoting there. Nothing was wrong with the engage,
   * the range, or the destination — the unit simply had no force available to hold station, and the
   * one SEEKING tick each cadence buys is far too small to fight 200 ticks of momentum. Two earlier
   * attempts (re-arming in ATTACKING; moving the destination onto a standoff ring) each helped and
   * neither was sufficient, because both left the coast unopposed.
   *
   * So a `holdsRange` creature keeps steering while ATTACKING. `arriveForce` then does exactly what
   * it already does everywhere else: ramps down linearly inside `CREATURE_ARRIVE_RADIUS` and holds
   * the unit at its target — which for these two kinds is a point on the standoff ring, not the
   * victim. It brakes on the way in and pushes back out if it drifts inside.
   *
   * ⚠ SPAWNING AND DESPAWNING ARE UNTOUCHED, so neither half of the Q7 momentum trap is
   * reintroduced. And `holdsRange` is false on all seven other configs, so every shipped unit whose
   * locomotion is a replay-equivalence guard (Voltkin especially) is byte-identical.
   */
  /*
   * ⭐⭐ S169 (owner R152) — **STUN GATE 2 OF 4: NO STEERING.**
   *
   * Owner: *"stuck on idle and cant do anything."* The FSM gate in `creatureLifecycle` freezes the
   * state machine, which means a creature stunned mid-SEEKING STAYS in SEEKING — so without this
   * line it would keep steering toward its target for the whole stun and walk away unharmed. The
   * frozen FSM is precisely why this second gate is not redundant.
   *
   * ⭐ `ZERO_ACCEL` IS THE RIGHT ANSWER RATHER THAN A HARD STOP, and that is a design choice worth
   * stating because Δ4 above warns that ZERO_ACCEL means **COAST, NOT STOP**. Here coasting is the
   * feature: R139's sonar wave *"stuns and pushes back"*, so the unit must be free to slide under an
   * external impulse while unable to steer. A hard stop would eat the knockback the same wave applies
   * — the two halves of one owner sentence fighting each other. Velocity damping bleeds the slide off
   * on its own.
   */
  if (isStunned(c, tick)) return ZERO_ACCEL;
  const steersWhileAttacking = c.state === 'ATTACKING' && getCreatureConfig(c.type).holdsRange;
  if (c.state !== 'SEEKING' && !steersWhileAttacking) return ZERO_ACCEL;
  // S100 P1 (TD Phase 1a, R16) — de-hardcode the peak accel: read it from the
  // creature's config instead of the bare CREATURE_MAX_ACCEL module const. For
  // Voltkin `config.maxAccel === CREATURE_MAX_ACCEL === 200` (× hopSpeedMul 1), so
  // its locomotion is byte-identical (the byte-equivalence guard). A chewer's config
  // already bakes hopSpeedMul into maxAccel (200 × 0.6 = 120) → the slower, readable
  // hop. The per-behavior helpers take the same effective cap so the arrive/repulse
  // ramps scale with it (not just the post-sum clamp).
  const config = getCreatureConfig(c.type);
  // ⭐ S168 (R149) — RAGE: *"moves x2 quicker"*. One multiplier, defined in `creatures/creature.ts`
  // and read here and at the attack cadence, so the two halves of "quicker" cannot drift apart.
  const maxAccel = config.maxAccel * rageMultiplier(c);
  const arrive = arriveForce(c, c.targetPos, CREATURE_ARRIVE_RADIUS, maxAccel);
  // S102 #3 — the SPAWNER_POS repulse is the canvas-CENTRE spark-spawner zone (legacy
  // Voltkin scaffolding). A CHEWER must close ONTO its target connector to chew it at
  // melee range, not be held ~300px off by a phantom centre-repulse — so it is skipped
  // for chewers (`sourceSpawnerId !== null`). Voltkin (`sourceSpawnerId === null`) keeps
  // the repulse byte-identical (its locomotion is the replay-equivalence guard).
  // S139 P2 — a STRUCTURE-ATTACKER is also exempt, for the same reason a chewer is. The goblin is
  // granted with `sourceSpawnerId === null` (it comes from the match-start seeder, not a spawner), so
  // on the provenance test alone it would have inherited Voltkin's phantom ~300 px centre-repulse and
  // been physically unable to close on any shape built near the middle of the board. The exemption is
  // keyed on the CONFIG flag rather than widened provenance, so Voltkin's locomotion — which is the
  // replay-equivalence guard — stays byte-identical.
  const repulse =
    c.sourceSpawnerId === null && !config.targetsStructures
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
