/**
 * SPARK — visual effect events.
 * Effects are write-only telemetry from `dispatch` to the renderer:
 *   - dispatch pushes events onto `world.effects[]`
 *   - the renderer drains the queue each frame, spawns animated sprites
 *   - effects are NOT persisted (save.ts ignores them)
 *
 * Each effect has a `tick` so the renderer knows the age in ticks for
 * easing curves. The renderer's effects layer ages them at PHYSICS_HZ —
 * on a tab switch, ticks pause (because physics pauses), so the visual
 * pause matches the simulation pause exactly.
 */

import type { Vec2 } from '../types.ts';

export type GameEffect =
  | {
      readonly kind: 'BOND_COMMIT';
      readonly tick: number;
      readonly pos: Vec2;
      readonly color: number;
      readonly radius: number;
      /**
       * S6 P3: combo signature (from combos.ts ComboOutcome.visualEffectId)
       * so the renderer can pick distinct placeholder flair per magic combo.
       * Generic 24/36 combos use 'fx.bond.default' = the original ring pop.
       * Spec § V.2 calls these "polish placeholders" — full Phase-2 effects
       * land later.
       */
      readonly visualEffectId: string;
      /** Endpoint of the new bond (other end is `pos`). Used for line-based effects. */
      readonly otherPos: Vec2;
    }
  | {
      readonly kind: 'SEVER_ERASE';
      readonly tick: number;
      readonly pos: Vec2;
      readonly color: number;
      readonly radius: number;
    };

/** Soft cap on the queue — anything older than this many ticks is dropped. */
export const EFFECT_LIFETIME_TICKS = 36; // 0.6s at 60Hz

/**
 * Hard cap on the renderer's active list. Lifetime alone is enough under
 * normal play (worst-case ~30 simultaneous), but a pathological burst
 * (spam-place + spam-sever) could outpace ageing for one frame. When over
 * cap, the renderer drops oldest first. Set well above any natural usage.
 */
export const MAX_ACTIVE_EFFECTS = 64;
