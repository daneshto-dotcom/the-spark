/**
 * SPARK — godly-recipe type surface (S22 P3 D2 from S21 Council).
 *
 * A "godly" is a high-impact mechanic triggered when the world reaches a
 * specific structural pattern. Detection runs on BOND_FORMED only (D12),
 * host-side, by iterating registered recipes' predicates. On match: host
 * dispatches GODLY_TRIGGER + broadcasts GodlyTriggerMsg. Both peers play
 * the cinematic + apply the sustained effect via SEVER_BOND cause='godly'.
 *
 * v1 GodlyId = 'voltkin'. S24 adds 'anvil', S25+ 'pac-predator'.
 */

import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { World } from '../world.ts';

export type GodlyId = 'voltkin';

export interface GodlyMatch {
  readonly triggererPlayerId: PlayerId;
  /** The component whose bonds will SEVER_BOND cascade in the sustained window. */
  readonly targetComponentPrimitiveIds: ReadonlyArray<PrimitiveId>;
  /** Centroid of the target component (used for the post-cinematic sprite crossfade). */
  readonly targetPos: { readonly x: number; readonly y: number };
}

/**
 * Recipe predicate runs on each BOND_FORMED on the host. Returns a match or
 * null. The world is read-only — predicates MUST NOT mutate (the matcher
 * dispatches GODLY_TRIGGER separately).
 */
export type RecipePredicate = (world: World, bondPos: { x: number; y: number }) => GodlyMatch | null;

export interface GodlyRecipe {
  readonly id: GodlyId;
  readonly predicate: RecipePredicate;
  /** Path served from public/, e.g. '/godly/voltkin/cinematic/voltkin-intro.mp4'. */
  readonly cinematicAsset: string;
  /** Path served from public/, e.g. '/godly/voltkin/audio/voltkin-voice.ogg'. */
  readonly voiceAsset: string;
  /** Path served from public/, e.g. '/godly/voltkin/sprites/voltkin-zap.png'. */
  readonly characterSprite: string;
  /** Cinematic + sustained-effect timing (wall-clock ms). */
  readonly cinematicMs: number;
  readonly sustainedEffectMs: number;
  /** Voice playback offset within cinematic (ms, e.g. 3500 = 3.5s for VOLT-KIIIN!). */
  readonly voiceOffsetMs: number;
  /** Luma-key shader application — removes mostly-white pixels (mp4 bg). */
  readonly lumaKey: { readonly enabled: boolean; readonly threshold: number };
}

/** Queue entry used by world.pendingCinematics + sync.ts broadcast. */
export interface GodlyTriggerEvent {
  readonly godlyId: GodlyId;
  readonly triggererPlayerId: PlayerId;
  readonly targetComponentPrimitiveIds: ReadonlyArray<PrimitiveId>;
  readonly targetPos: { readonly x: number; readonly y: number };
  /** Tick at which the host validated + dispatched. Used for replay determinism. */
  readonly triggerTick: number;
}
