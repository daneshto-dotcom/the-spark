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

import type { BondId, PrimitiveId, Vec2 } from '../types.ts';

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
    }
  | {
      /**
       * S10 P2 — structure-wide pulse outward from a newly-placed primitive.
       * BFS hop maps are precomputed at emit time; the renderer ages the
       * effect and flashes each primitive when the wavefront reaches it.
       * Maps are NOT JSON-serialisable, but effects are not persisted.
       */
      readonly kind: 'STRUCTURE_GROW';
      readonly tick: number;
      readonly originPrimId: PrimitiveId;
      readonly hopByPrimId: ReadonlyMap<PrimitiveId, number>;
      /** Bond hop = max(hop a, hop b) — highlights after both endpoints lit. */
      readonly hopByBondId: ReadonlyMap<BondId, number>;
      readonly color: number;
      /** Cached so the renderer can compute total lifetime without iterating the map. */
      readonly maxHop: number;
    }
  | {
      /**
       * S10 P3 — merge cinematic. Fires once per merge bond. Renderer flashes
       * every primitive in the union (both pre-merge components) on a single
       * synchronized window. Verlet impulse on the candidate component is
       * applied in placePrimitive before this effect is emitted (the impulse
       * is the *physics* half; this effect is the *visual* half).
       */
      readonly kind: 'STRUCTURE_MERGE';
      readonly tick: number;
      readonly originPos: Vec2;
      readonly unionPrimIds: ReadonlyArray<PrimitiveId>;
      readonly color: number;
    }
  | {
      /**
       * S10 P4 / S13 P4 — score tier crossing. Emitted once per multiple
       * of SCORE_TIER_STEP that scoreProgress crossed during the
       * placement. S13 P4 moves the visual from a fixed HUD corner to
       * the placement position (effect.pos) so the pulse lands where
       * the player's eyes already are. The HUD progress bar itself
       * still fills continuously as the running indicator.
       */
      readonly kind: 'SCORE_TIER';
      readonly tick: number;
      readonly tier: number;
      readonly color: number;
      /** S13 P4: world position to render the pulse at — the new prim's pos. */
      readonly pos: Vec2;
    }
  | {
      /**
       * S18 P1 — bond-formation audio event. Emitted ONCE per placePrimitive
       * call (regardless of how many bonds the placement actually created
       * — multi-adjacent merges, redundancy bonds, and primary bond all
       * collapse to a single emit so the clave SFX doesn't stack per
       * Council R1 Adoption-B / Gemini #4).
       *
       * Anchor placements (no bonds formed) do NOT emit this effect.
       *
       * Audio-only: renderer ignores this kind. Drained by audioManager
       * via lastDrainedTick cursor for replay safety.
       */
      readonly kind: 'BOND_FORMED';
      readonly tick: number;
      readonly pos: Vec2;
      /** Number of bonds formed in this placement (1+). Informational. */
      readonly bondCount: number;
    }
  | {
      /**
       * S18 P1 — bond-severance audio event. Emitted ONCE per SEVER_BOND
       * dispatch. The `cause` discriminator distinguishes player-raid
       * (audible fart SFX) from physics-overstretch (silent — the
       * constraint solver firing is not a disruption action).
       *
       * Audio-only: renderer ignores this kind. The visual SEVER_ERASE
       * effect still emits per-deleted-primitive separately (S17 P1).
       */
      readonly kind: 'BOND_SEVERED';
      readonly tick: number;
      readonly pos: Vec2;
      readonly cause: 'player' | 'physics';
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
