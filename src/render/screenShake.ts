/**
 * SPARK — global screen-shake module (S30 P0e). Triggered on Voltkin fire-tick
 * (creatureRenderer detects ARC_FLASH effect in world.effects this frame) to
 * convey weapon impact. Applies decaying ±2px offset to app.stage.position
 * over 6 ticks (~100ms at 60Hz).
 *
 * Tick-deterministic: no wall-clock, no springs. Per-tick offset is derived
 * from (startTick, currentTick, tick-seeded jitter). Replay-safe — same tick
 * stream → same offset sequence. 1v1-safe because both host and client read
 * the same world.effects stream (per existing effectsRenderer pattern).
 *
 * Lifecycle:
 *   - trigger(tick): records startTick + amplitude + duration
 *   - applyToStage(stage, tick): computes current offset, sets stage.position.
 *     Idempotent — when no active shake or shake-expired, position resets to
 *     (0,0). Called every render frame from main.ts.
 *
 * Pure-state class (small mutable state: startTick + amplitude + duration).
 * Could be a function with closure, but a class keeps the construction
 * pattern consistent with other renderers (CreatureRenderer, EffectsRenderer).
 */

import type { Container } from 'pixi.js';
import type { GameEffect } from '../game/effects.ts';
import { pseudoRand } from '../state/rng.ts';

/**
 * S33 P1-6 — pure gate predicate for host-side shake trigger.
 *
 * Pre-S33 main.ts gated shake on `!world.bonds.has(bondId)` after the
 * CREATURE_ATTACK dispatch — functionally equivalent to "ARC_FLASH was
 * emitted this tick" because creatureAttack.ts only emits ARC_FLASH on
 * successful sever. The new gate ties the invariant directly to the
 * effect rather than to the bond-disappearance side-effect.
 *
 * Forward-defense: future creature kinds (e.g. Anvil cleave/AOE) may
 * sever bonds WITHOUT emitting ARC_FLASH (visual-quiet) OR emit
 * ARC_FLASH WITHOUT severing a bond (visual-only flash). The new gate
 * stays tied to the visual signal — shake follows ARC_FLASH, not bond
 * delta — which is the intuitive "weapon impact felt" invariant.
 *
 * Replay-safe + 1v1-safe: both host and client read the same
 * world.effects stream; same effects this tick → same shake decision.
 * Already exploited by client mirror in main.ts (implicit detection
 * post-applyNetSnapshot, S31 P0-3).
 */
export function shouldTriggerShakeForArcFlash(
  effects: readonly GameEffect[],
  currentTick: number,
): boolean {
  return effects.some((e) => e.kind === 'ARC_FLASH' && e.tick === currentTick);
}

/**
 * S95 — pure rising-edge predicate for the NONET resolve celebration shake. Fires once when the
 * trial's resolvedTick goes null→non-null (a solve OR the no-solver timeout). The caller tracks the
 * previous value across frames and resets it to null when world.sudoku clears between trials. Same
 * spirit as shouldTriggerShakeForArcFlash: derived from the synced world.sudoku stream, so host +
 * client fire the shake on the same beat.
 */
export function shouldTriggerNonetResolveShake(
  prevResolvedTick: number | null,
  curResolvedTick: number | null,
): boolean {
  return prevResolvedTick === null && curResolvedTick !== null;
}

/** Default shake duration in ticks. 6 @ 60Hz = ~100ms. */
const DEFAULT_DURATION_TICKS = 6;

/** Default shake amplitude in px. ±2 px is felt-but-not-jarring at 1080p. */
const DEFAULT_AMPLITUDE_PX = 2;

export class ScreenShake {
  private startTick: number = -Infinity;
  private amplitude: number = 0;
  private duration: number = 0;

  /**
   * Trigger a shake starting at `currentTick`. Subsequent trigger() calls
   * within an active shake REPLACE the existing shake (don't stack —
   * compounding noise is worse than refresh-and-continue).
   */
  trigger(
    currentTick: number,
    amplitude: number = DEFAULT_AMPLITUDE_PX,
    duration: number = DEFAULT_DURATION_TICKS,
  ): void {
    this.startTick = currentTick;
    this.amplitude = amplitude;
    this.duration = duration;
  }

  /**
   * Apply current offset to stage. Idempotent per call — sets position each
   * time, so caller doesn't need to reset between frames. When shake is
   * inactive or expired, sets position to (0,0).
   */
  applyToStage(stage: Container, currentTick: number): void {
    const elapsed = currentTick - this.startTick;
    if (elapsed < 0 || elapsed >= this.duration) {
      // Inactive or expired — make sure stage is centered.
      if (stage.position.x !== 0 || stage.position.y !== 0) {
        stage.position.set(0, 0);
      }
      return;
    }
    const { x, y } = this.computeOffset(currentTick, elapsed);
    stage.position.set(x, y);
  }

  /**
   * Pure helper: compute (x, y) offset for a given tick + elapsed. Exported
   * for unit testing (verifies decay curve + tick-determinism).
   */
  computeOffset(currentTick: number, elapsed: number): { x: number; y: number } {
    // Linear decay: amplitude at t=0, 0 at t=duration. Could be ease-out
    // (e.g. (1-fraction)²) for snappier feel; linear is simpler + sufficient.
    const fraction = 1 - (elapsed / this.duration);
    const amp = this.amplitude * fraction;
    // Pseudo-random direction per tick. Mulberry32-ish single-step from tick.
    // Replay-safe — same tick produces same offset (1v1 host+client agree).
    const dx = pseudoRand(currentTick * 2 + 1);
    const dy = pseudoRand(currentTick * 2 + 2);
    return { x: dx * amp, y: dy * amp };
  }

  /** Reset shake state (used on cinematic-abort / GODLY_ABORT / cleanup). */
  reset(): void {
    this.startTick = -Infinity;
    this.amplitude = 0;
    this.duration = 0;
  }

  /** For tests: is a shake currently active at the given tick? */
  isActive(currentTick: number): boolean {
    const elapsed = currentTick - this.startTick;
    return elapsed >= 0 && elapsed < this.duration;
  }
}

// S33 P1-10 — local `pseudoRand` removed; now imported from `state/rng.ts`.
// Math byte-exact: omitting the new `index` arg (defaults to 0) means
// `((seed|0) ^ ((0|0)*K)) >>> 0` reduces to `(seed|0) >>> 0` — identical
// first step to the prior local implementation. Replay-determinism preserved
// (S33 P1-12 save.replay.test.ts guard).
