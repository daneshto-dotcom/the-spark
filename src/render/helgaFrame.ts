/**
 * SPARK — S112 — HELGA veo-atlas FRAME SELECTOR (pure, deterministic).
 *
 * Picks which atlas cell (state strip + frame index) to draw for a princess defender, as a PURE
 * function of her SYNCED FSM state. Council Δ3: the animation phase MUST key off synced
 * `world.tick` / `ticksInState` (NOT a free-running local clock) so host and the 1v1 client render
 * the same frame from the same snapshot — exactly the determinism the procedural puppet had.
 *
 *   IDLE / WALK : looping strips, advanced by world.tick / ticksPerFrame (+ a per-instance phase so
 *                 two HELGAs don't breathe/step in robotic unison — mirrors the puppet's id offset).
 *   slap strip  : the WINDUP→FIRE→RECOVER window mapped onto the slap clip; the SFX + impact burst
 *                 (princessRenderer, on the synced FIRE edge) sell the actual hit.
 */
import type { DefenderState } from '../state/defenders/defender.ts';

export type HelgaAnimState = 'idle' | 'walk' | 'slap';

export interface HelgaAnimConfig {
  idleFrames: number;
  walkFrames: number;
  slapFrames: number;
  idleTicksPerFrame: number;
  walkTicksPerFrame: number;
  /** FSM durations that the slap strip is phased across (from constants). */
  windupTicks: number;
  fireTicks: number;
  recoverTicks: number;
}

function loopIndex(t: number, ticksPerFrame: number, frames: number): number {
  if (frames <= 0) return 0;
  const raw = Math.floor(t / Math.max(1, ticksPerFrame));
  return ((raw % frames) + frames) % frames;
}

/**
 * Pure cell selection. `id` desyncs the looping ambient across instances (integer defenderId — the
 * synced, replay-safe phase source). Returns the strip + frame to draw.
 */
export function helgaCell(
  state: DefenderState,
  ticksInState: number,
  worldTick: number,
  id: number,
  cfg: HelgaAnimConfig,
): { state: HelgaAnimState; frame: number } {
  const phase = (id % 8) * 5; // small per-instance offset; deterministic (integer id)
  switch (state) {
    case 'IDLE':
      return { state: 'idle', frame: loopIndex(worldTick + phase, cfg.idleTicksPerFrame, cfg.idleFrames) };
    case 'WALK':
      return { state: 'walk', frame: loopIndex(worldTick + phase, cfg.walkTicksPerFrame, cfg.walkFrames) };
    case 'WINDUP':
    case 'FIRE':
    case 'RECOVER': {
      const total = cfg.windupTicks + cfg.fireTicks + cfg.recoverTicks;
      let elapsed: number;
      if (state === 'WINDUP') {
        elapsed = Math.min(Math.max(ticksInState, 0), cfg.windupTicks);
      } else if (state === 'FIRE') {
        elapsed = cfg.windupTicks + Math.min(Math.max(ticksInState, 0), cfg.fireTicks);
      } else {
        elapsed = cfg.windupTicks + cfg.fireTicks + Math.min(Math.max(ticksInState, 0), cfg.recoverTicks);
      }
      const p = total > 0 ? elapsed / total : 0;
      const frame = Math.min(cfg.slapFrames - 1, Math.max(0, Math.floor(p * cfg.slapFrames)));
      return { state: 'slap', frame };
    }
  }
}
