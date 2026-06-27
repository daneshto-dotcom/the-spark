/**
 * SPARK — S103 P4 (#10) — HELGA's articulated-puppet POSE function (pure, deterministic).
 *
 * This is the heart of the owner-critical "a REAL functioning, state-driven character — NOT a
 * looping gif AND NOT a cheap procedural transform-twitch" (OC3). HELGA is a MULTI-PART rig (skirt,
 * torso, head, beer-arm + stein, slap-arm, two legs) whose every part is posed per FSM state with
 * HAND-AUTHORED keyframe poses, interpolated — a genuine wind-up → impact → recover SLAP arc, idle
 * breathing, and a periodic beer-sip. The Council LOCKED the rig over veo-frames (deterministic,
 * zero-bundle, zero-API, original CtCD-style). `helgaPose` is pure: pose = f(state, ticksInState,
 * facing) — replay-safe + unit-testable; the renderer just draws the returned transforms.
 *
 * Distinction from the S96-rejected "PowerPoint spin": that twitched ONE flat sprite. This rotates
 * INDEPENDENT limbs through authored per-state angles — the slap-arm swings back in WINDUP, snaps
 * across in FIRE, and eases home in RECOVER, while the beer-arm + skirt + head move on their own.
 */

import {
  DEFENDER_FIRE_HOLD_TICKS,
  DEFENDER_RECOVER_TICKS,
  PRINCESS_SLAP_INTERVAL_TICKS,
  PRINCESS_WINDUP_TICKS,
} from '../constants.ts';
import type { DefenderState } from '../state/defenders/defender.ts';

/** All angles in radians. `facing` is +1 (target to the right) / -1 (left); the renderer mirrors X. */
export interface HelgaPose {
  /** Vertical bob of the whole body (breathing / weight-shift), px. */
  bodyBobY: number;
  /** Torso/head lean into the slap, radians (+ = lean toward the target). */
  leanAngle: number;
  /** Head tilt, radians. */
  headTilt: number;
  /** Beer-arm angle at the shoulder, radians (0 = held out at the side; raises to sip). */
  beerArmAngle: number;
  /** How raised the stein is toward the mouth, 0..1 (1 = sipping). */
  sip: number;
  /** Slap-arm angle at the shoulder, radians. Negative = wound back/up; large positive = slapped across. */
  slapArmAngle: number;
  /** Extra forward reach of the slapping hand at impact, px (0 except around FIRE). */
  slapReach: number;
  /** Skirt sway, radians. */
  skirtSway: number;
}

const REST_SLAP = -0.35; // resting slap-arm angle (relaxed, slightly back)
const WINDUP_PEAK = -2.1; // fully wound back/up
const FIRE_PEAK = 1.9; // slapped fully across the front

/** Smoothstep 0..1. */
function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Compute HELGA's full-body pose for the given FSM state + ticksInState. `phaseTick` (world.tick)
 * drives the slow idle breathing/sip cadence so two clients agree on the idle phase. `offset` (the
 * synced defenderId — Council CHECK, Gemini) desynchronizes the idle ambient ACROSS instances so two
 * HELGAs don't breathe/sip in robotic unison (the owner "real character, not a robot/gif" bar).
 * Deterministic: pose = f(state, ticksInState, phaseTick, offset).
 */
export function helgaPose(state: DefenderState, ticksInState: number, phaseTick: number, offset = 0): HelgaPose {
  // Per-instance phase so each HELGA's idle ambient runs on its own clock (replay-safe — offset is
  // the synced, integer defenderId).
  const ph = phaseTick + offset * 37;
  // Idle ambient: gentle breathing + a beer-sip that crests once per slap-interval-ish window.
  const breath = Math.sin(ph * 0.06) * 1.4;
  const sipCycle = (((ph % PRINCESS_SLAP_INTERVAL_TICKS) + PRINCESS_SLAP_INTERVAL_TICKS) % PRINCESS_SLAP_INTERVAL_TICKS) / PRINCESS_SLAP_INTERVAL_TICKS;
  // Sip crests in the back third of the idle cycle (a quick raise-drink-lower).
  const sip = sipCycle > 0.7 ? smooth((sipCycle - 0.7) / 0.15) * smooth((1 - sipCycle) / 0.15) : 0;
  const skirtSway = Math.sin(ph * 0.05 + 1) * 0.06;

  const base: HelgaPose = {
    bodyBobY: breath,
    leanAngle: 0,
    headTilt: Math.sin(ph * 0.04) * 0.05,
    beerArmAngle: -0.5 - sip * 1.3, // raises toward the mouth as sip → 1
    sip,
    slapArmAngle: REST_SLAP + Math.sin(ph * 0.05) * 0.04,
    slapReach: 0,
    skirtSway,
  };

  switch (state) {
    case 'IDLE':
      return base;

    case 'WALK': {
      // S110 P4 (Batch B) — marching to the target: a determined forward lean + a brisk walking BOB
      // (gait driven by phaseTick so host + client agree), slap-arm cocked back ready, stein braced
      // out of the way. A real state-driven gait, NOT a slide — distinct from the idle breathing.
      const gait = Math.sin(ph * 0.5); // brisk step cadence
      return {
        ...base,
        bodyBobY: Math.abs(gait) * 2.2 - 1.0, // up-down stride bob
        leanAngle: 0.16, // lean forward into the march
        headTilt: base.headTilt - 0.04,
        beerArmAngle: -0.35, // stein braced out of the way
        sip: 0,
        slapArmAngle: REST_SLAP - 0.25, // arm cocked slightly back, ready to swing
        skirtSway: gait * 0.12, // skirt swings with the stride
      };
    }

    case 'WINDUP': {
      // Pull the slap-arm back/up + coil the torso AWAY from the target (anticipation).
      const p = smooth(ticksInState / Math.max(1, PRINCESS_WINDUP_TICKS));
      return {
        ...base,
        slapArmAngle: REST_SLAP + (WINDUP_PEAK - REST_SLAP) * p,
        leanAngle: -0.18 * p, // lean back before the strike
        headTilt: base.headTilt - 0.12 * p,
        beerArmAngle: -0.4, // brace the stein out of the way
        sip: 0,
      };
    }

    case 'FIRE': {
      // SNAP across on entry (impact at ticksInState 0), then a short follow-through settle.
      const f = smooth(ticksInState / Math.max(1, DEFENDER_FIRE_HOLD_TICKS));
      return {
        ...base,
        slapArmAngle: FIRE_PEAK - (FIRE_PEAK - 0.9) * f, // peak across, easing slightly
        slapReach: (1 - f) * 14, // hand thrusts out at the moment of impact
        leanAngle: 0.34 * (1 - f * 0.5), // lunge toward the target
        headTilt: base.headTilt + 0.16,
        beerArmAngle: -0.2 + f * 0.3, // stein flails out for balance
        sip: 0,
      };
    }

    case 'RECOVER': {
      // Ease the arm back from the slap to rest; unwind the lean.
      const r = smooth(ticksInState / Math.max(1, DEFENDER_RECOVER_TICKS));
      return {
        ...base,
        slapArmAngle: 0.9 + (REST_SLAP - 0.9) * r,
        leanAngle: 0.17 * (1 - r),
        beerArmAngle: -0.5,
        sip: 0,
      };
    }
  }
}
