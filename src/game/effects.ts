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
      /**
       * S22 P3 — 'godly' added for SEVER_BOND cascades during godly sustained effects.
       * S27 P0 — 'creature' added for CREATURE_ATTACK severances (Council R1 Q1 UNANIMOUS B
       * extend-SEVER_BOND-cause). Audio routing in S27 is SILENT for 'creature' (Council R1
       * Q4 2/3 Grok+Claude A — S28 ships procedural Web Audio zap synth per blueprint Audio
       * Plan, Gemini Q4 minority "reuse 'player' SFX" rejected on tonal-mismatch grounds:
       * lightning creature ≠ fart SFX). 'godly' kept for back-compat (no emitter post-S27
       * cascade DELETION but type union widening is free + safe).
       *
       * S102 #2 — 'chewer' added for a pencil-chewer's final-chew severance. The
       * chewer path is split off 'creature' (which stays the Voltkin lightning zap)
       * so the audio drain plays a beaver GNAW (not lightning-crackle) and the
       * attack emits NO ARC_FLASH / screen-shake (see creatureAttack.ts).
       */
      readonly cause: 'player' | 'physics' | 'godly' | 'creature' | 'bomb' | 'chewer';
    }
  | {
      /**
       * S27 P0 — lightning arc visual emitted by CREATURE_ATTACK. Renderer draws a
       * jittered polyline + glow from `start` (creature pos) to `end` (target bond
       * midpoint) over ARC_FLASH_DURATION_TICKS (~300ms @ 60Hz) with alpha fade.
       * Per-attack visual; one ARC_FLASH per CREATURE_ATTACK dispatch. Audio is
       * deferred to S28 (procedural Web Audio zap synth — Δ6 carry-forward).
       *
       * Council R1 Q5 UNANIMOUS creature-only: this effect IS the user-vision
       * "creature attacks/zaps enemy structures" feedback. Visual prominence
       * compensates for S27-silent audio.
       */
      readonly kind: 'ARC_FLASH';
      readonly tick: number;
      readonly start: Vec2;
      readonly end: Vec2;
      /**
       * S33 P1-11 — emitter creature ID. Mixed into arcSeed (arcFlash.ts) so
       * two creatures attacking on the SAME tick from int-truncated-identical
       * positions render distinct jitter patterns. OPTIONAL: legacy snapshots
       * (pre-S33 ARC_FLASH emissions and pre-S33 NetSnapshot wire payloads)
       * omit this field. arcSeed coerces `undefined | 0 === 0` via bitwise OR,
       * degrading to the pre-S33 jitter pattern for legacy data — additive-
       * optional precedent S15 P2 / S28 P0 / S31 P0-3 (NO schemaVersion bump).
       */
      readonly creatureId?: import('../types.ts').CreatureId;
    }
  | {
      /**
       * S37 P7 — Voltkin lightning charge-up audio cue. Emitted by
       * `applyCreatureTick` when `state === 'ATTACKING' && ticksInState === 15`
       * (the lion-form charge sprite engages — see voltkinFrames.ts
       * ATTACKING_CHARGE_ENGAGE_TICK). Drives the procedural rising-tone SFX in
       * `audioManager.playChargeSFX` (250 ms sawtooth + lowpass sweep + exp gain
       * envelope, climaxing right before the FIRE-tick `lightning-crackle.ogg`).
       *
       * Pure audio cue; renderer ignores this kind (no visual). Replay-safe via
       * `lastDrainedTick` cursor in audioManager. Wire-mirrored via SerializedEffect
       * so 1v1 joiner drains the same CHARGE and fires the same SFX locally
       * (Council R1 D1 + Δ6: pattern-consistent with BOND_FORMED/SEVERED/ARC_FLASH).
       *
       * `pos` is the creature position at emit time. Reserved for future positional
       * audio (PannerNode); v1 routing is mono through sfxGainNode.
       */
      readonly kind: 'CREATURE_CHARGE';
      readonly tick: number;
      readonly pos: Vec2;
    }
  | {
      /**
       * S71 P1 — bomb detonation burst. Renderer draws an expanding ring +
       * particle fade at `pos` (radius scales the burst) over its lifetime
       * (severErase visual family). Emitted ONCE per TRIGGER_BOMB (never on
       * dissipation). Visual-only — renderer draws it; audio routing is silent
       * for the per-sever BOND_SEVERED{cause:'bomb'} so the blast reads as one
       * event, not a fart-stack.
       */
      readonly kind: 'BOMB_EXPLODE';
      readonly tick: number;
      readonly pos: Vec2;
      readonly radius: number;
    }
  | {
      /**
       * S100 P1 (TD Phase 1a) — chewer bite. Emitted by `applyCreatureTick` on each
       * NON-final chew of a committed bond (one per CHEW_INTERVAL_TICKS while the
       * chewer is in ATTACKING); the final chew is marked by the SEVER_ERASE the
       * CREATURE_ATTACK → SEVER_BOND emits instead. The renderer (Layer 7) draws a
       * small graphite-dust burst + bite ring at `pos` (the bond midpoint), modeled
       * on `drawBombExplode`.
       *
       * HOST-LOCAL ONLY — like BOND_COMMIT / SEVER_ERASE, this effect is NEVER
       * serialized to the wire (no SerializedEffect case), so it adds zero protocol
       * surface (TOWER_DEFENSE_DESIGN.md §5.2). `creatureId` lets the renderer key
       * per-emitter jitter so simultaneous bites from different chewers read distinct
       * (mirrors the ARC_FLASH.creatureId precedent).
       */
      readonly kind: 'CHEW_BITE';
      readonly tick: number;
      readonly pos: Vec2;
      readonly creatureId: import('../types.ts').CreatureId;
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
