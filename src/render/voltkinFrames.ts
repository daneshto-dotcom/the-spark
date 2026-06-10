/**
 * SPARK — Voltkin animation-frame selector (S36 P2).
 *
 * Pure-function module mapping `(CreatureState, ticksInState, killCount)` to
 * one of 6 sprite URLs / frame keys. Used by `creatureRenderer.ts` to swap
 * `sprite.texture` per tick. Layer ON TOP of S28 P0 procedural transforms
 * (scale/tint/rotation preserved in `creatureRenderer.ts`).
 *
 * # Transformation Arc design (S36 user-confirmed)
 *
 * The 6 WINNER sprites are in TWO art styles — chibi-form (boxy, cute) at
 * rest, lion-form (fierce, anatomical) in combat. Pokemon-style power-up:
 * the creature "transforms" between forms at FSM boundaries.
 *
 *   LION form:  zap, charge
 *   CHIBI form: idle1, idle2, hurt, victory
 *
 * # Frame schedule per state
 *
 *   SPAWNING (0..59):
 *     t  0-29  zap     (lion — cinematic continuity, voltkin-intro.mp4
 *                       ends on the lion-form zap pose; the creature
 *                       carries that energy into the world)
 *     t 30-59  idle1   (chibi — settled into world, calm)
 *
 *   SEEKING (continuous, alternating walk-cycle):
 *     idle1 <-> idle2 every IDLE_CYCLE_TICKS (60 = 1 s @ 60Hz natural breath)
 *
 *   ATTACKING (0..59, FIRE_TICK=30):
 *     t  0-14  idle1   (chibi — pre-windup)
 *     t 15-29  charge  (lion form materializes — windup)
 *     t 30     zap     (the strike — single tick coincides with
 *                       CREATURE_ATTACK dispatch + ARC_FLASH effect emit)
 *     t 31-44  charge  (lion — recovery hold)
 *     t 45-59  idle1   (chibi — cooldown, settles back)
 *
 *   DESPAWNING (0..59):
 *     killCount > 0  -> victory (chibi — landed at least one zap)
 *     killCount == 0 -> hurt    (chibi — never connected, sad fade)
 *
 * # Transformation flash (form-swap moments)
 *
 * Frame transitions WITHIN a form (idle1<->idle2, charge<->zap, hurt<->victory)
 * are silent. Transitions BETWEEN forms (chibi<->lion) trigger a 2-tick
 * scale+tint flash punch in `creatureRenderer.ts`. Form-swap ticks:
 *
 *   SPAWNING t=30   (lion -> chibi, post-cinematic settle)
 *   ATTACKING t=15  (chibi -> lion, windup ignites)
 *   ATTACKING t=45  (lion -> chibi, recovery completes)
 *
 * The fire moment (ATTACKING t=30) does NOT trigger transformation flash
 * because both prev (charge) and curr (zap) are lion-form — and the
 * existing ARC_FLASH effect + screen-shake already carry the visual punch
 * at that tick. Avoid double-juicing.
 *
 * # Replay determinism
 *
 * Pure function of `(state, ticksInState, killCount)` — all three inputs are
 * serialized in `save.ts` (S33 P1-12 replay-determinism baseline) and in
 * NetSnapshot v2 (S37 P14). Frame derivation is render-only — no game-state
 * mutation. `save.replay.test.ts` stays green.
 */

import {
  CREATURE_DESPAWNING_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
  VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK,
  type CreatureState,
} from '../state/creatures/creature.ts';

const BASE = '/godly/voltkin/sprites';

/**
 * Canonical sprite URLs. Each file ships in `public/godly/voltkin/sprites/`
 * (S36 P1 asset pipeline: `scripts/compress-voltkin-frames.py`).
 */
export const VOLTKIN_FRAME_URLS = {
  idle1: `${BASE}/voltkin-idle-1.png`,
  idle2: `${BASE}/voltkin-idle-2.png`,
  charge: `${BASE}/voltkin-charge.png`,
  zap: `${BASE}/voltkin-zap.png`,
  hurt: `${BASE}/voltkin-hurt.png`,
  victory: `${BASE}/voltkin-victory.png`,
} as const;

export type VoltkinFrameKey = keyof typeof VOLTKIN_FRAME_URLS;
export const ALL_FRAME_KEYS: readonly VoltkinFrameKey[] = [
  'idle1', 'idle2', 'charge', 'zap', 'hurt', 'victory',
];

/**
 * SPAWNING lion->chibi morph boundary. Ticks 0..29 show zap (lion);
 * ticks 30..59 show idle1 (chibi). Half the 60-tick spawn window each side.
 */
const SPAWNING_MORPH_TICK = 30;

/**
 * SEEKING walk-cycle alternation period. 60 @ 60Hz = 1 second per frame —
 * natural "breath in / breath out" cadence. Each full idle1<->idle2 cycle
 * is 2 * IDLE_CYCLE_TICKS = 120 ticks (2 s).
 */
export const IDLE_CYCLE_TICKS = 60;

/**
 * ATTACKING windup tick at which charge frame engages (lion materializes).
 * 15 = halfway through windup (ticks 0..29). idle1 holds ticks 0..14 then
 * charge appears ticks 15..29. Pairs with VOLTKIN_ATTACK_FIRE_TICK=30.
 *
 * S37 P7 — promoted to voltkin-config.attackChargeEngageTick so the
 * state-layer `applyCreatureTick` emit of CREATURE_CHARGE shares the same
 * source (Council R1 D1 DRY fix). Local alias retained for readability
 * inside the schedule body; future Anvil creatures would consume
 * `getCreatureConfig(type).attackChargeEngageTick` directly.
 */
const ATTACKING_CHARGE_ENGAGE_TICK = VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK;

/**
 * ATTACKING recovery tick at which charge frame releases back to idle1.
 * 45 = halfway through recovery (ticks 31..59). charge holds ticks 31..44
 * (post-zap pose held briefly), then idle1 from ticks 45..59 (cooldown).
 * Symmetrical with ATTACKING_CHARGE_ENGAGE_TICK around FIRE_TICK.
 */
const ATTACKING_IDLE_RELEASE_TICK = 45;

/**
 * Compute the current sprite URL for a creature given its FSM state, ticks
 * elapsed in that state, and accumulated kill count.
 *
 * Pure function. Unit-testable without Pixi.
 */
export function currentSpriteUrl(
  state: CreatureState,
  ticksInState: number,
  killCount: number,
): string {
  return VOLTKIN_FRAME_URLS[currentFrameKey(state, ticksInState, killCount)];
}

/**
 * Map to a frame key. The renderer uses the key for two purposes:
 *   1. Look up the texture in its preloaded Map<FrameKey, Texture>
 *   2. Detect form-swap transitions for the transformation flash effect
 *      (via `isLionForm(prev) !== isLionForm(curr)`)
 */
export function currentFrameKey(
  state: CreatureState,
  ticksInState: number,
  killCount: number,
): VoltkinFrameKey {
  if (state === 'SPAWNING') {
    return ticksInState < SPAWNING_MORPH_TICK ? 'zap' : 'idle1';
  }
  if (state === 'SEEKING') {
    const phase = Math.floor(ticksInState / IDLE_CYCLE_TICKS) % 2;
    return phase === 0 ? 'idle1' : 'idle2';
  }
  if (state === 'ATTACKING') {
    if (ticksInState < ATTACKING_CHARGE_ENGAGE_TICK) return 'idle1';
    if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) return 'charge';
    if (ticksInState === VOLTKIN_ATTACK_FIRE_TICK) return 'zap';
    if (ticksInState < ATTACKING_IDLE_RELEASE_TICK) return 'charge';
    return 'idle1';
  }
  if (state === 'DESPAWNING') {
    return killCount > 0 ? 'victory' : 'hurt';
  }
  // CreatureState union is closed (4 members); this is unreachable but
  // TypeScript requires an exhaustive return. Treat as idle1.
  return 'idle1';
}

/**
 * Form classification — lion (fierce combat) vs chibi (cute resting).
 * Used by the renderer to detect transformation-flash moments.
 */
export function isLionForm(key: VoltkinFrameKey): boolean {
  return key === 'zap' || key === 'charge';
}

/**
 * Transformation-flash intensity at the given (state, ticksInState).
 *
 * Returns:
 *   1.0  on the form-swap tick itself (FULL flash)
 *   0.5  on the tick immediately after (DECAY)
 *   0.0  otherwise (no flash)
 *
 * Three flash moments per attack cycle, all chibi<->lion transitions:
 *   SPAWNING   t=30 (lion -> chibi settle after cinematic)
 *   ATTACKING  t=15 (chibi -> lion ignite)
 *   ATTACKING  t=45 (lion -> chibi recover)
 *
 * The ATTACKING fire tick (t=30) does NOT flash — both prev (charge) and curr
 * (zap) are lion-form, and the existing ARC_FLASH + screen-shake already
 * carry the visual punch. Avoid double-juicing.
 *
 * Pure function. Constants kept in sync with `currentFrameKey` form-swap
 * boundaries by design — see top-of-file comment. Test
 * `voltkinFrames.test.ts` empirically verifies sync by walking
 * `currentFrameKey` and asserting `flashIntensity > 0` exactly on the
 * three form-swap ticks.
 */
export function flashIntensity(
  state: CreatureState,
  ticksInState: number,
): number {
  if (state === 'SPAWNING') {
    if (ticksInState === SPAWNING_MORPH_TICK) return 1.0;
    if (ticksInState === SPAWNING_MORPH_TICK + 1) return 0.5;
  }
  if (state === 'ATTACKING') {
    if (ticksInState === ATTACKING_CHARGE_ENGAGE_TICK) return 1.0;
    if (ticksInState === ATTACKING_CHARGE_ENGAGE_TICK + 1) return 0.5;
    if (ticksInState === ATTACKING_IDLE_RELEASE_TICK) return 1.0;
    if (ticksInState === ATTACKING_IDLE_RELEASE_TICK + 1) return 0.5;
  }
  return 0;
}

/**
 * Flash tint — cyan (0x66FFFF). Applied as `sprite.tint = FLASH_TINT` for
 * 2 ticks at form-swap moments. Overrides procedural ATTACKING wind-up
 * yellow tint during the flash window (cyan flash visually punctuates the
 * morph; yellow charge-up resumes after).
 */
export const FLASH_TINT = 0x66ffff;

/**
 * Flash scale multiplier at FULL intensity (1.0). Combined with procedural
 * scale: `finalScale = baseSpriteScale * procScale * (1 + flashAmplitude * intensity)`.
 * Peak scale at SPAWNING t=30: 1.0 (proc, sin-pulse returns to base) *
 * (1 + 0.15 * 1.0) = 1.15. At ATTACKING t=15: 1.0 (proc, no other ATTACKING
 * scale at windup) * 1.15 = 1.15. Punchy without being a zoom.
 */
export const FLASH_SCALE_AMPLITUDE = 0.15;

// Re-export ATTACKING_CADENCE for test sanity-check that the schedule
// covers all 60 ticks of the cycle (no gaps, no overlap with SEEKING entry).
export { VOLTKIN_ATTACK_CADENCE_TICKS };

// ===== S83 P3 — real-animation atlas layer =====
//
// Per-state Veo-generated clips packed into ONE atlas of `cell`-sized frames
// (public/godly/voltkin/anim/voltkin-atlas.png + voltkin-anim.json, built by
// scripts/build-voltkin-atlas.py). This layer REPLACES the 6-pose frame flip
// when the atlas is loaded; the legacy frame path remains the fallback
// (per-state Council fallback decision + instant first paint while the
// atlas streams in).
//
// Determinism: cell choice is a pure function of (state, ticksInState,
// killCount, worldTick, isMoving, manifest). LOOPS key off worldTick so a
// SEEKING re-entry never restarts the gait mid-stride (Grok R1 adopt);
// ONE-SHOTS key off ticksInState so action timing stays glued to the LOCKED
// FSM constants — the zap apex frame lands EXACTLY on VOLTKIN_ATTACK_FIRE_TICK.
// `isMoving` is supplied by the renderer's own frame-to-frame position
// estimate (NOT pos-prevPos: the NetSnapshot mirror rehydrates prevPos=pos,
// so wire velocity is identically zero on the 1v1 client).

export type VoltkinClipKey = 'walk' | 'idle' | 'charge' | 'zap' | 'hurt' | 'victory';

export interface VoltkinClipEntry {
  /** First cell index of this clip in the atlas (row-major). */
  readonly start: number;
  readonly len: number;
  readonly kind: 'loop' | 'oneshot';
  /** zap only: clip-local index of the burst-apex frame. */
  readonly apex?: number;
  /** Art's native horizontal facing. -1 = drawn facing left (walk). Default 1. */
  readonly nativeFacing?: 1 | -1;
}

export interface VoltkinAnimManifest {
  readonly cell: number;
  readonly cols: number;
  readonly atlas: string;
  readonly clips: Readonly<Record<VoltkinClipKey, VoltkinClipEntry>>;
}

export interface VoltkinAnimCell {
  readonly clip: VoltkinClipKey;
  /** Clip-local frame index (atlas cell = clips[clip].start + frame). */
  readonly frame: number;
}

/** 60 Hz sim / 5 = native 12 fps clip playback for loops + despawn one-shots. */
export const ANIM_TICKS_PER_FRAME = 5;

export const VOLTKIN_ANIM_MANIFEST_URL = '/godly/voltkin/anim/voltkin-anim.json';
export const VOLTKIN_ANIM_ATLAS_URL = '/godly/voltkin/anim/voltkin-atlas.png';

/**
 * Form classification for the atlas path — mirrors `isLionForm` for the
 * legacy keys. charge/zap are lion-form; the chibi<->lion boundaries fall on
 * the SAME (state, ticksInState) moments as the legacy schedule, so
 * `flashIntensity` needs no changes.
 */
export function isLionClip(clip: VoltkinClipKey): boolean {
  return clip === 'charge' || clip === 'zap';
}

/**
 * Map FSM state to an atlas animation cell. Pure; unit-tested against the
 * production manifest in voltkinFrames.anim.test.ts.
 *
 * Schedule (FSM timing constants UNTOUCHED — LOCKED 13.15):
 *   SPAWNING  t<30: zap apex hold (cinematic lion continuity, as legacy)
 *             t>=30: idle loop (chibi settle; morph flash at t=30 as legacy)
 *   SEEKING   walk loop while moving, idle loop while still (worldTick-keyed)
 *   ATTACKING t<15: idle loop | t in [15,30): charge one-shot spread over the
 *             wind-up window | t=30: zap APEX (FIRE tick) | t in (30,45):
 *             zap follow-through spread over the recovery hold | t>=45: idle
 *   DESPAWNING victory (killCount>0) / hurt one-shot across the 60-tick window
 *             — 12 frames at native 12 fps fits exactly.
 */
export function currentAnimCell(
  state: CreatureState,
  ticksInState: number,
  killCount: number,
  worldTick: number,
  isMoving: boolean,
  m: VoltkinAnimManifest,
): VoltkinAnimCell {
  const loopFrame = (key: VoltkinClipKey): number =>
    Math.floor(worldTick / ANIM_TICKS_PER_FRAME) % m.clips[key].len;
  const zapApex = m.clips.zap.apex ?? 0;

  if (state === 'SPAWNING') {
    if (ticksInState < SPAWNING_MORPH_TICK) return { clip: 'zap', frame: zapApex };
    return { clip: 'idle', frame: loopFrame('idle') };
  }
  if (state === 'SEEKING') {
    const clip = isMoving ? 'walk' : 'idle';
    return { clip, frame: loopFrame(clip) };
  }
  if (state === 'ATTACKING') {
    if (ticksInState < ATTACKING_CHARGE_ENGAGE_TICK) {
      return { clip: 'idle', frame: loopFrame('idle') };
    }
    if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) {
      // Wind-up: spread the whole charge clip across the 15-tick window.
      const span = VOLTKIN_ATTACK_FIRE_TICK - ATTACKING_CHARGE_ENGAGE_TICK;
      const t = ticksInState - ATTACKING_CHARGE_ENGAGE_TICK;
      const len = m.clips.charge.len;
      return { clip: 'charge', frame: Math.min(Math.floor((t * len) / span), len - 1) };
    }
    if (ticksInState === VOLTKIN_ATTACK_FIRE_TICK) {
      return { clip: 'zap', frame: zapApex };
    }
    if (ticksInState < ATTACKING_IDLE_RELEASE_TICK) {
      // Recovery hold: zap follow-through frames (apex..end) across 15 ticks —
      // replaces the legacy static charge hold with real discharge motion.
      const span = ATTACKING_IDLE_RELEASE_TICK - VOLTKIN_ATTACK_FIRE_TICK;
      const t = ticksInState - VOLTKIN_ATTACK_FIRE_TICK;
      const len = m.clips.zap.len;
      const tail = len - zapApex;
      return { clip: 'zap', frame: Math.min(zapApex + Math.floor((t * tail) / span), len - 1) };
    }
    return { clip: 'idle', frame: loopFrame('idle') };
  }
  if (state === 'DESPAWNING') {
    const clip: VoltkinClipKey = killCount > 0 ? 'victory' : 'hurt';
    const len = m.clips[clip].len;
    const frame = Math.min(
      Math.floor((ticksInState * len) / CREATURE_DESPAWNING_TICKS),
      len - 1,
    );
    return { clip, frame };
  }
  // Closed union; unreachable. Mirror currentFrameKey's idle default.
  return { clip: 'idle', frame: loopFrame('idle') };
}
