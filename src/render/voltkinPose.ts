/**
 * SPARK — S106 P5 — VOLTKIN's procedural electric-being POSE function (pure, deterministic).
 *
 * Replaces the old bitmap Voltkin (a Pixi.Sprite whose texture was swapped each tick = the owner's
 * "looping gif with a visible square"). Voltkin is now drawn entirely with Pixi.Graphics (no texture,
 * no rectangle, no matte) by `drawVoltkin` in creatureRenderer.ts, posed every frame by THIS pure
 * function — the chewer/HELGA precedent ("a puppet rig IS the real character, beats a looping image").
 *
 * `voltkinPose` is pure: pose = f(state, ticksInState, phaseTick, offset). Inputs are all WIRED/synced
 * (creature.state + ticksInState ride the NetSnapshot mirror), so host + 1v1 client animate identically;
 * only the cosmetic per-frame crackle jitter (drawn from wall-clock in the renderer) differs frame-to-
 * frame — invisible as desync, the same render-only license the chewer wobble holds. Unit-testable
 * without Pixi (voltkinPose.test.ts walks every FSM state × tick range; boltCharge peaks at FIRE).
 */

import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
  type CreatureState,
} from '../state/creatures/creature.ts';

export interface VoltkinPose {
  /** Whole-body size multiplier (spawn grow-in, idle breath, FIRE punch, despawn shrink). */
  coreScale: number;
  /** Electric intensity 0..1 — drives the aura mane length, glow alpha, and limb-bolt crackle.
   *  Low ambient while alive; ramps through the ATTACKING wind-up and PEAKS exactly at the FIRE tick. */
  boltCharge: number;
  /** Limb spread/raise 0..1 — arms hang at rest (~0.12), fling out as the charge builds, 1 at FIRE. */
  armSpread: number;
  /** Vertical body bob (breathing / hover), px. */
  bodyBobY: number;
}

/** Smoothstep 0..1 (clamped). */
function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

const IDLE_CHARGE = 0.22; // ambient crackle while alive (never fully "off" — it's a living spark)
const REST_SPREAD = 0.12; // limbs at rest

/**
 * Compute Voltkin's full electric-being pose for the FSM state + ticksInState. `phaseTick` (world.tick)
 * drives the slow idle hover/breath cadence so two clients agree on the idle phase; `offset` (the synced,
 * integer creatureId) desyncs the ambient ACROSS instances so two Voltkins don't pulse in robotic unison.
 * Deterministic: pose = f(state, ticksInState, phaseTick, offset).
 */
export function voltkinPose(state: CreatureState, ticksInState: number, phaseTick: number, offset = 0): VoltkinPose {
  const ph = phaseTick + offset * 23;
  const breath = Math.sin(ph * 0.07) * 1.6; // gentle hover bob
  const base: VoltkinPose = {
    coreScale: 1,
    boltCharge: IDLE_CHARGE + Math.sin(ph * 0.13) * 0.05, // living flicker
    armSpread: REST_SPREAD + Math.sin(ph * 0.06) * 0.03,
    bodyBobY: breath,
  };

  switch (state) {
    case 'SPAWNING': {
      // Coalesce out of a spark: grow in + a charge surge that settles to idle.
      const p = smooth(ticksInState / Math.max(1, CREATURE_SPAWN_TICKS));
      return {
        coreScale: 0.35 + 0.65 * p,
        boltCharge: 0.85 * (1 - p) + IDLE_CHARGE * p, // born crackling, settles
        armSpread: REST_SPREAD,
        bodyBobY: breath * p,
      };
    }

    case 'SEEKING':
      return base;

    case 'ATTACKING': {
      if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) {
        // WIND-UP: charge ramps idle→1, limbs fling out, body swells slightly.
        const t = smooth(ticksInState / VOLTKIN_ATTACK_FIRE_TICK);
        return {
          coreScale: 1 + 0.12 * t,
          boltCharge: IDLE_CHARGE + (1 - IDLE_CHARGE) * t,
          armSpread: REST_SPREAD + (1 - REST_SPREAD) * t,
          bodyBobY: base.bodyBobY * (1 - t),
        };
      }
      if (ticksInState <= VOLTKIN_ATTACK_FIRE_TICK + 1) {
        // FIRE: peak discharge — full charge + a scale punch (the arcFlash lightning emits this tick).
        return { coreScale: 1.22, boltCharge: 1, armSpread: 1, bodyBobY: 0 };
      }
      // RECOVER: ease charge + limbs + scale back toward idle over the rest of the cadence.
      const recoveryStart = VOLTKIN_ATTACK_FIRE_TICK + 2;
      const span = Math.max(1, VOLTKIN_ATTACK_CADENCE_TICKS - 1 - recoveryStart);
      const r = smooth((ticksInState - recoveryStart) / span);
      return {
        coreScale: 1.22 + (1 - 1.22) * r,
        boltCharge: 1 + (IDLE_CHARGE - 1) * r,
        armSpread: 1 + (REST_SPREAD - 1) * r,
        bodyBobY: base.bodyBobY * r,
      };
    }

    case 'DESPAWNING': {
      // Shrink + fade the charge. A KILL (handled by the renderer death-watcher) bursts a lightning
      // cloud instead; this branch is the natural lifetime expiry (quietly winks out).
      const fadeStart = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
      const p = ticksInState < fadeStart ? 0 : smooth((ticksInState - fadeStart) / CREATURE_FADE_TICKS);
      return {
        coreScale: 1 - 0.2 * p,
        boltCharge: IDLE_CHARGE * (1 - p),
        armSpread: REST_SPREAD,
        bodyBobY: breath * (1 - p),
      };
    }
  }
}
