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

// S100 P1 (TD Phase 1b, Layer 5) — 'pentagram' widens GodlyId for the first
// SPAWNER-variant recipe (a non-cinematic, structure-comes-alive recipe). It is
// NOT a cinematic-bearing godly: it dispatches REGISTER_SPAWNER instead of
// GODLY_TRIGGER, never occupies activeCinematicPlayerId, and is excluded from the
// per-type `godlyFiredThisMatch` gate (see index.ts).
// S103 P2 — 'laserTurret' (#9) + 'helga' (#10) widen GodlyId for the first DEFENDER-variant
// recipes (a stationary auto-attacker structure). Like 'pentagram' they are non-cinematic: they
// dispatch REGISTER_DEFENDER (never GODLY_TRIGGER), never occupy activeCinematicPlayerId, and are
// excluded from the per-type godlyFiredThisMatch gate.
export type GodlyId = 'voltkin' | 'pentagram' | 'laserTurret' | 'helga';

export interface GodlyMatch {
  readonly triggererPlayerId: PlayerId;
  /** The component whose bonds will SEVER_BOND cascade in the sustained window. */
  readonly targetComponentPrimitiveIds: ReadonlyArray<PrimitiveId>;
  /** Centroid of the target component (used for the post-cinematic sprite crossfade). */
  readonly targetPos: { readonly x: number; readonly y: number };
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — a SPAWNER recipe's predicate yields this
 * instead of a GodlyMatch. No cinematic component / target cascade: it carries
 * exactly what REGISTER_SPAWNER needs — the owner + the stable anchor primitive
 * (the lowest PrimitiveId in the matched component, per the spawner identity
 * contract in spawners/spawner.ts).
 */
export interface SpawnerMatch {
  readonly triggererPlayerId: PlayerId;
  /** Stable spawner identity = lowest PrimitiveId in the matched component. */
  readonly anchorPrimitiveId: PrimitiveId;
}

/**
 * Recipe predicate runs on each topology change on the host. Returns a match or
 * null. The world is read-only — predicates MUST NOT mutate (the matcher
 * dispatches GODLY_TRIGGER separately).
 */
export type RecipePredicate = (world: World, bondPos: { x: number; y: number }) => GodlyMatch | null;

/**
 * S100 P1 (TD Phase 1b, Layer 5) — a spawner recipe's predicate. Same purity
 * contract (read-only world); yields a SpawnerMatch the matcher turns into a
 * REGISTER_SPAWNER dispatch.
 */
export type SpawnerRecipePredicate = (world: World, bondPos: { x: number; y: number }) => SpawnerMatch | null;

/**
 * S103 P2 — a DEFENDER recipe's match: the owner + the shape-defining anchor primitive (the Line
 * for a laser turret, the Triangle hub for HELGA) + its centre pos (where the defender stands).
 * The matcher turns this into a REGISTER_DEFENDER dispatch.
 */
export interface DefenderMatch {
  readonly triggererPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly pos: { readonly x: number; readonly y: number };
}

/**
 * S103 P2 — a defender recipe's predicate. Same read-only purity contract. It must return only a
 * BUILDABLE anchor — i.e. it skips an anchor that is ALREADY a live defender (it reads
 * world.defenders) so runDefenderIgnition can register one per frame until all are built and a
 * rebuild re-ignites after a removal.
 */
export type DefenderRecipePredicate = (world: World, bondPos: { x: number; y: number }) => DefenderMatch | null;

/**
 * S100 P1 (TD Phase 1b, Layer 5) — GodlyRecipe is now a discriminated union on
 * `kind`. The original cinematic-bearing recipe (Voltkin) keeps its full asset
 * surface as `kind:'cinematic'`; a 'spawner' recipe (pentagram) needs NONE of the
 * cinematic assets — it dispatches REGISTER_SPAWNER directly, never playing a
 * cinematic. Splitting via a discriminant (rather than making every cinematic
 * field optional) keeps the cinematic pipeline — cutsceneOverlay.play,
 * entryFromRecipe, makeTriggerEvent — type-safe: those consume CinematicGodlyRecipe
 * and the matcher narrows on `kind` before touching cinematic fields.
 */
export interface CinematicGodlyRecipe {
  readonly kind: 'cinematic';
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

/**
 * S100 P1 (TD Phase 1b, Layer 5) — a non-cinematic recipe whose match mints a
 * persistent creature-spawner (the "structure comes alive" loop). It carries a
 * `characterSprite` for the Codex gallery only (entryFromRecipe needs it); no
 * cinematic/voice/timing fields exist because it never plays a cinematic.
 */
export interface SpawnerGodlyRecipe {
  readonly kind: 'spawner';
  readonly id: GodlyId;
  readonly predicate: SpawnerRecipePredicate;
  /** Codex gallery sprite (the only render-surface a spawner recipe shares with cinematic ones). */
  readonly characterSprite: string;
}

/**
 * S103 P2 — a non-cinematic recipe whose match mints a generic stationary DEFENDER (laser turret
 * / HELGA). Carries `defenderKind` (which substrate variant), a `stillValid` re-validation rule
 * (the host poll calls it each tick — a broken structure removes the defender), and a Codex
 * sprite. `defenderKind` is the 2-literal union inlined here (NOT imported from defenders/defender
 * to avoid a types <-> defender import cycle — it stays assignable to DefenderKind).
 */
export interface DefenderGodlyRecipe {
  readonly kind: 'defender';
  readonly id: GodlyId;
  readonly defenderKind: 'turret' | 'princess';
  readonly predicate: DefenderRecipePredicate;
  /** Re-validation: does the recipe STILL hold at this anchor? (false → REMOVE_DEFENDER). */
  readonly stillValid: (world: World, anchorPrimitiveId: PrimitiveId) => boolean;
  /** Codex gallery sprite (the only render-surface a recipe shares). */
  readonly characterSprite: string;
}

export type GodlyRecipe = CinematicGodlyRecipe | SpawnerGodlyRecipe | DefenderGodlyRecipe;

/** Queue entry used by world.pendingCinematics + sync.ts broadcast. */
export interface GodlyTriggerEvent {
  readonly godlyId: GodlyId;
  readonly triggererPlayerId: PlayerId;
  readonly targetComponentPrimitiveIds: ReadonlyArray<PrimitiveId>;
  readonly targetPos: { readonly x: number; readonly y: number };
  /** Tick at which the host validated + dispatched. Used for replay determinism. */
  readonly triggerTick: number;
}
