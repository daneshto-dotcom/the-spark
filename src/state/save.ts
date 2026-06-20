/**
 * SPARK — WorldSnapshot serializer + restore + NetSnapshot
 * wire variant for Phase-2 1v1 (§ 11 LOCKED amendment, S15 P2).
 *
 * § 10.4 LOCKED: schemaVersion: 1 — locked across Phase 1. S15 P2
 * ADDITIVE: gameMode, currentPlayerId, scoreByPlayer; SerializedPlayer
 * gains avatarPos. All new fields are OPTIONAL in serialized form so
 * pre-S15 saves still parse (Council Gemini R1 MINOR — save format
 * compat acknowledged; pre-S15 saves break the WIN-screen banner only,
 * not loadability).
 *
 * Sets are converted to arrays. Object refs (Bond.a/Bond.b) are dropped
 * — they're rebuilt from IDs on load.
 *
 * Phase 3 will reuse the same shape for server snapshots / replay scrubbing,
 * so we keep `rngSeed` and `tick` so determinism can be reconstructed.
 *
 * NetSnapshot (S15 P2): the wire shape sent host→client at NET_SNAPSHOT_HZ.
 * Stripped fields (Council R2 + PRIME-AUDIT): savedAt (timestamp not needed),
 * rngSeed (deterministic RNG not v1), nextPrimitiveId/nextBondId (host-only
 * authority — clients never mint IDs).
 */

import { type StiffnessTier } from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import {
  makeFreeSpark,
  type Spark,
  type SparkState,
} from '../game/spark.ts';
import { type Bond } from '../physics/bonds.ts';
import { type SparkType } from '../constants.ts';
import { type ComboKey } from '../combos.ts';
import { generateSudoku } from './sudoku.ts';
import {
  asPlayerId,
  asSparkId,
  type BombId,
  type BondId,
  type CreatureId,
  type HunterId,
  type PlayerId,
  type PotatoId,
  type RainbowId,
  type PoopId,
  type PrimitiveId,
  type SeagullId,
  type SparkId,
  type Vec2,
} from '../types.ts';
import { type GameMode, type GameState, type World } from './world.ts';
import { type Player } from '../game/player.ts';
import type { SpawnerState } from '../game/spawner.ts';
import type { Bomb } from './bomb.ts';
import type { Creature, CreatureState, CreatureType } from './creatures/creature.ts';
import type { Hunter, HunterState } from './hunters/hunter.ts';
import type { Potato, PotatoState } from './potato.ts';
import type { Rainbow } from './rainbow.ts';
import type { Poop, PoopState, Seagull } from './seagulls/seagull.ts';
// Audit Pass 1 fix 3c8630d7 (Δ4) + Pass 2 refactor 622a7c7f: on restore,
// world.tick may jump backward relative to the audio drain cursor. Without
// resetting the cursor, audio effects whose tick straddles the cursor are
// silently dropped after a load. The state→render dep that Pass-1 introduced
// (direct import of resetAudioDrainCursor from render/audioManager) has been
// replaced by a state-layer publisher: audioManager registers a handler at
// module-init via `registerResetHandler`, save.ts fires `triggerReset()` here.
// Test paths that never load audioManager treat triggerReset() as a no-op
// (single-slot handler stays null), preserving the audit-safe semantics.
import { triggerReset as triggerAudioCursorReset } from './audioCursor.ts';

const PHYSICS_DT = 1 / 60;

export interface WorldSnapshot {
  schemaVersion: 1;
  savedAt: string;
  tick: number;
  rngSeed: number;
  gameState: GameState;
  lastWinnerId: PlayerId | null;
  nextPrimitiveId: number;
  nextBondId: number;
  freeSparks: SerializedSpark[];
  primitives: SerializedPrimitive[];
  bonds: SerializedBond[];
  players: SerializedPlayer[];
  scoreProgress?: number;
  /** S15 P2 — solo/1v1 distinction. Optional for pre-S15 compat. */
  gameMode?: GameMode;
  /**
   * S15 P2 — active turn player. S42: turn-based gameplay was removed
   * (real-time per blueprint). Field kept as ignored-optional slot so
   * existing localStorage saves (S15-S41) still parse cleanly — TypeScript
   * struct typing tolerates the extra key on load. New saves omit it.
   * Council R1 Battle Ledger row 2 (Gemini-#2 modified — zero-migration).
   */
  currentPlayerId?: PlayerId;
  /** S15 P2 — per-player score tuples. Optional for pre-S15 compat. */
  scoreByPlayer?: Array<readonly [PlayerId, number]>;
  /**
   * S28 P0 — Voltkin Phase 2D NetSnapshot v2 (Council Q1 UNANIMOUS A additive-
   * optional pattern; no schemaVersion bump per S15 P2 precedent). Host
   * serializes live creatures so 1v1 clients can render the mirror (resolves
   * S27 RALPH Δ8 visual regression where client saw bonds vanish without
   * visible creature/ARC_FLASH). Council Q4 2/3 B trimmed render-only shape:
   * client doesn't simulate AI so targetBondId/targetPos/prevPos/spawnedAtTick/
   * despawnAtTick/ownerPlayerId all omitted (~36 B/creature × max 2 = ~72 B per
   * snapshot — negligible vs prims/bonds payload). Pre-S28 saves omit this
   * field; applySnapshotCore handles `undefined` via nullish-coalescing (Δ3).
   */
  creatures?: SerializedCreature[];
  /**
   * S71 P1 — host-authoritative bombs for the 1v1 client mirror + host save/load.
   * Additive-optional (creature precedent; NO schemaVersion bump). Emitted only
   * when non-empty so pre-S71 saves stay byte-identical on the wire.
   */
  bombs?: SerializedBomb[];
  /**
   * S72 P2 — host-authoritative Pac-Man hunters for the 1v1 client mirror + host
   * save/load. Additive-optional (creature/bomb precedent; NO schemaVersion bump).
   * Emitted only when non-empty so pre-S72 saves stay byte-identical on the wire.
   */
  hunters?: SerializedHunter[];
  /**
   * S72 P2 — once-per-game hunter-spawned guard. Additive-optional; emitted only
   * when true so a host save/load mid-game does not re-spawn a second hunter on
   * reload. Pre-S72 saves omit it → rehydrates false.
   */
  hunterSpawned?: boolean;
  /**
   * S72 P3 — host-authoritative potato bombs for the 1v1 client mirror + host save/load.
   * Additive-optional; emitted only when non-empty so pre-S72-P3 saves stay byte-identical.
   */
  potatoes?: SerializedPotato[];
  /**
   * S75 P3 — host-authoritative rainbow color-shuffle pickups for the 1v1 client mirror +
   * host save/load. Additive-optional; emitted only when non-empty so pre-S75 saves stay
   * byte-identical. The shuffle RESULT (player/prim colours) rides the existing colour fields.
   */
  rainbows?: SerializedRainbow[];
  /**
   * S84 P2 — tick of the most recent rainbow colour-switch; drives the flyover
   * celebration window + yell on every peer. Additive-optional (S82
   * poopedUntilTick precedent — NO schemaVersion bump): emitted only when set,
   * pre-S84 payloads omit it and rehydrate as undefined (flyover inactive).
   */
  rainbowSwitchTick?: number;
  /**
   * S88 G3a — in-match combo discovery. `discoveredCombos` is a SORTED string[] of
   * discovered ComboKeys (canonical order ⇒ byte-stable snapshots for replay/diff —
   * PRIME-AUDIT R2); `comboToastTick` + `lastDiscoveredComboNames` drive the toast.
   * Additive-optional (rainbowSwitchTick precedent — NO schemaVersion bump): emitted
   * only when non-empty/set; pre-S88 payloads omit them and rehydrate inactive.
   */
  discoveredCombos?: string[];
  comboToastTick?: number;
  lastDiscoveredComboNames?: string[];
  /**
   * S93 — NONET trial wire form (additive-optional). The puzzle is NOT serialized — every peer
   * regenerates it from `seed` (mulberry32). Emitted only while a trial is active; absent ⇒ no
   * trial (the client clears). `sudokuFiredThisMatch` rides along so a host save/load can't re-fire.
   */
  sudoku?: {
    readonly seed: number;
    readonly startTick: number;
    readonly triggeredBy: PlayerId;
    readonly solvedBy: PlayerId | null;
    readonly resolvedTick: number | null;
  };
  sudokuFiredThisMatch?: boolean;
  /**
   * S77 P3 — host-authoritative seagulls + their poop projectiles for the 1v1 client mirror +
   * host save/load. Additive-optional; emitted only when non-empty so pre-S77 saves stay
   * byte-identical. `fouledPrimitives` round-trips the host income-halt set so a save/load (+
   * replay) resumes the halt exactly; the client stores it but never computes income (it reads
   * the host-authoritative scoreProgress), so it is inert on the client path.
   */
  seagulls?: SerializedSeagull[];
  poops?: SerializedPoop[];
  fouledPrimitives?: PrimitiveId[];
  /**
   * S87 — seats occupied by AI bots in 'bots' mode. Additive-optional
   * (creature precedent; NO schemaVersion bump): emitted only when non-empty,
   * so every pre-S87 save AND every networked NetSnapshot (bots never exist
   * while networked) stays byte-identical. A DEV save/restore of a bots match
   * rehydrates the B{n} identity surfaces; bot CONTROLLER state is
   * deliberately not saved (bots re-decide from world state — PDR S87).
   */
  botSeats?: number[];
  /**
   * S31 P0-3 — filtered effects array for 1v1 client mirror. Pre-S31 the
   * snapshot omitted `world.effects` entirely; 1v1 client saw creatures walk
   * + bonds vanish with no visible attack feedback (no ARC_FLASH lightning),
   * no audio (no BOND_FORMED clave / BOND_SEVERED sever), and no shake
   * feedback (host-only `!isClient` gate). Filtered to 3 NET-relevant kinds
   * (ARC_FLASH + BOND_FORMED + BOND_SEVERED) per Council R1 Q2 CONVERGENT
   * + PRIME-AUDIT: STRUCTURE_GROW/MERGE/SCORE_TIER/SEVER_ERASE/BOND_COMMIT
   * are host-local visual flair (placement + score + structure feedback) —
   * adding them to the wire would 5x payload with no client-visible gain.
   * Each effect carries the host `tick` field already (effects.ts existing
   * type surface); client renderer computes age as `(world.tick - effect.tick)`
   * which makes replay deterministic across the network (Gemini Q-01 AUDIT
   * concern satisfied — see PRIME-AUDIT Δ6). Pre-S31 saves omit this field;
   * applySnapshotCore handles `undefined` by clearing world.effects (empty
   * post-restore) for back-compat.
   */
  effects?: SerializedEffect[];
  /**
   * S82 P2 — the Spawner's complete resumable state (5 RNG stream words + countdowns +
   * nextId; S79 P5 capability, finally wired). Additive-optional: present ONLY when the
   * save call site passes it via snapshot(world, { spawnerState }) — pre-S82 saves stay
   * byte-identical. HOST-ONLY by design (rngSeed-exclusion precedent): clients never run
   * a spawner, and shipping the stream words would leak the upcoming spawn schedule to a
   * modified client. netSnapshot() NEVER passes it AND strips it defensively (triple
   * defense: param-injection + Omit type + runtime destructure + wire-absence test).
   */
  spawner?: SpawnerState;
}

interface SerializedSpark {
  id: SparkId;
  type: SparkType;
  pos: Vec2;
  prevPos: Vec2;
  radius: number;
  createdTick: number;
  state: SparkState;
  /** S77 P3 — "poopy" debuff expiry tick (clients render the brown tint). Omitted when un-poopy. */
  poopyUntilTick?: number;
}

interface SerializedPrimitive {
  id: PrimitiveId;
  type: SparkType;
  placerColor: number;
  placedBy: PlayerId;
  createdTick: number;
  pos: Vec2;
  prevPos: Vec2;
  bonds: BondId[];
  ownerColor: number;
  lastOwnershipChange: number;
  radius: number;
}

interface SerializedBond {
  id: BondId;
  aId: PrimitiveId;
  bId: PrimitiveId;
  restLength: number;
  stiffnessTier: StiffnessTier;
  createdTick: number;
}

interface SerializedPlayer {
  id: PlayerId;
  color: number;
  kind: 'Idle' | 'Carrying';
  carriedSparkId: SparkId | null;
  energy: number;
  buildActions: number;
  disruptionCharges: number;
  /** S15 P2 — per-player avatar position. Optional for pre-S15 compat. */
  avatarPos?: Vec2;
  /**
   * S49 P1 (Sym F) — territorial shrink debuff expiry tick. Optional for
   * pre-S49 compat; rehydrates as null via nullish-coalescing (additive-
   * optional precedent from S15 P2 / S28 P0 / S31 P0-3 / S33 P1-11).
   */
  territorialShrinkUntilTick?: number | null;
  /**
   * S72 P2 — Pac-Man hunter bench expiry tick. Additive-optional; emitted only
   * when set so pre-S72 saves stay byte-identical. Rehydrates as undefined.
   */
  benchedUntilTick?: number;
  /**
   * S72 P3 — carried potato id. Additive-optional; emitted only when set. Rehydrates
   * undefined (pre-S72-P3 byte-compat).
   */
  carriedPotatoId?: PotatoId;
  /**
   * S82 P1 — cruiser-poopy-slow debuff expiry tick + cursor-chase target. Additive-
   * optional; emitted only when set so pre-S82 saves/wire payloads stay byte-identical.
   * Both ride NetSnapshot (clients render the foul tint; the chase itself is host-only).
   * Rehydrate as undefined.
   */
  poopedUntilTick?: number;
  poopedCursorTarget?: Vec2;
}

/**
 * S31 P0-3 — discriminated-union subset of GameEffect for the wire. Only
 * the 3 NET-relevant kinds (ARC_FLASH visual, BOND_FORMED clave audio,
 * BOND_SEVERED sever audio + visual cue) are serialized; the other 5 kinds
 * (BOND_COMMIT, SEVER_ERASE, STRUCTURE_GROW, STRUCTURE_MERGE, SCORE_TIER)
 * are host-local visual flair for placement / structure / score feedback
 * and not propagated to client peers. Council R1 Q2 (Grok+Gemini CONVERGENT
 * BLOCKER): filtered serialization is the only acceptable shape — full
 * `world.effects` payload would balloon NetSnapshot from <1 KB to >3 KB and
 * trip Trystero/Nostr bandwidth budgets under jitter.
 *
 * Each variant mirrors its GameEffect counterpart bit-for-bit. The `tick`
 * field is preserved across the wire so effectsRenderer ages effects
 * deterministically (`world.tick - effect.tick`) regardless of snapshot
 * latency (Gemini Q-01 AUDIT mandate).
 *
 * Readonly mirrors GameEffect's readonly semantics; client must not mutate.
 */
type SerializedEffect =
  | {
      readonly kind: 'ARC_FLASH';
      readonly tick: number;
      readonly start: Vec2;
      readonly end: Vec2;
      /**
       * S33 P1-11 — emitter creature ID. Optional for pre-S33 wire compat:
       * legacy NetSnapshots and legacy localStorage saves omit this field;
       * deserializeEffect rehydrates without it; arcFlash.arcSeed coerces
       * `undefined | 0 === 0` so legacy data renders the pre-S33 jitter
       * pattern. Additive-optional precedent (S15 P2 / S28 P0 / S31 P0-3) —
       * NO schemaVersion bump (save.ts:55 stays at 1).
       */
      readonly creatureId?: CreatureId;
    }
  | {
      readonly kind: 'BOND_FORMED';
      readonly tick: number;
      readonly pos: Vec2;
      readonly bondCount: number;
    }
  | {
      readonly kind: 'BOND_SEVERED';
      readonly tick: number;
      readonly pos: Vec2;
      readonly cause: 'player' | 'physics' | 'godly' | 'creature' | 'bomb';
    }
  | {
      /**
       * S37 P7 — wire mirror of the CREATURE_CHARGE GameEffect. Bit-for-bit
       * mirror so the joiner's `drainAudioEffects` fires `playChargeSFX` at
       * the same tick host did (CREATURE_CHARGE emit lives in
       * `applyCreatureTick` at ATTACKING.ticksInState===15).
       *
       * Additive-optional: pre-S37 NetSnapshots + legacy localStorage saves
       * never carry this kind (host doesn't emit pre-S37); `serializeEffect`
       * + `deserializeEffect` handle the new variant additively without a
       * schemaVersion bump (S15 P2 / S28 P0 / S31 P0-3 / S33 P1-11 / S36 P3
       * additive-optional precedent chain).
       */
      readonly kind: 'CREATURE_CHARGE';
      readonly tick: number;
      readonly pos: Vec2;
    }
  | {
      /**
       * S71 P1 — bomb detonation burst, wire-mirrored so the 1v1 client sees the
       * blast (rare event; max 1 bomb). Mirrors the ARC_FLASH precedent; the
       * `radius` field scales the burst. Additive-optional kind → no schema bump.
       */
      readonly kind: 'BOMB_EXPLODE';
      readonly tick: number;
      readonly pos: Vec2;
      readonly radius: number;
    };

/**
 * S28 P0 — Voltkin Phase 2D Council Q4 2/3 B trimmed render-only shape (~36 B).
 * Client renderer derives scale/tint/alpha from (state, ticksInState) via the
 * pure helpers in creatureRenderer.ts — no AI fields (targetBondId, targetPos)
 * needed since client never simulates. PRIME-AUDIT Δ7: readonly to guard
 * against accidental client-side mutation post-applyNetSnapshot.
 */
interface SerializedCreature {
  readonly id: CreatureId;
  readonly type: CreatureType;
  readonly pos: Vec2;
  readonly state: CreatureState;
  readonly ticksInState: number;
  /**
   * S36 P3 — successful-sever count. Additive-optional (pre-S36 saves +
   * pre-S36 NetSnapshots omit the field; `deserializeCreature` rehydrates
   * as 0 via nullish-coalescing). Drives the DESPAWNING victory/hurt frame
   * branch in `voltkinFrames.currentFrameKey`. Wire cost: 1-3 bytes per
   * creature × max 2 creatures = ≤6 B per NetSnapshot — negligible vs
   * the ~3 KB primitives/bonds payload.
   */
  readonly killCount?: number;
  /**
   * S58 (#3) — owning player. Additive-optional (pre-S58 NetSnapshots omit it;
   * `deserializeCreature` rehydrates as 0 via nullish-coalescing). Pre-S58 this
   * was DELIBERATELY omitted ("host runs FSM, client only renders") — fog-of-war
   * vision is the first CLIENT-side consumer of creature ownership: the joiner
   * needs it to reveal the fog around its OWN creatures (computeVisionSources).
   * Wire cost: 1 byte per creature × max 2 = ≤2 B per NetSnapshot — negligible.
   */
  readonly ownerPlayerId?: PlayerId;
}

/**
 * S71 P1 — full bomb wire shape. Unlike the trimmed SerializedCreature, the bomb
 * is tiny so we round-trip every field: `dissipateAtTick` MUST survive a HOST
 * save/load so the TTL poll resumes correctly (a trimmed-to-0 value would make a
 * loaded bomb insta-dissipate). The 1v1 client ignores dissipateAtTick (host-only
 * poll) and just renders pos/radius. Additive-optional → no schemaVersion bump.
 */
interface SerializedBomb {
  readonly id: BombId;
  readonly pos: Vec2;
  readonly radius: number;
  readonly spawnedAtTick: number;
  readonly dissipateAtTick: number;
}

/**
 * S72 P2 — render-trimmed hunter wire shape (mirrors the SerializedCreature
 * approach). The client renderer derives the wedge facing + chomp from
 * (state, ticksInState, targetPlayerId) and the target's avatarPos in the same
 * snapshot — so prevPos / spawnedAtTick / despawnAtTick are host-only + omitted.
 * Additive-optional → no schemaVersion bump.
 */
interface SerializedHunter {
  readonly id: HunterId;
  readonly pos: Vec2;
  readonly state: HunterState;
  readonly ticksInState: number;
  readonly targetPlayerId: PlayerId;
}

/**
 * S72 P3 — potato wire shape. detonateAtTick MUST round-trip (a HOST save/load resumes
 * the fuse poll from it; the client also reads it for the fuse-countdown VFX). prevPos
 * + spawnedAtTick are host-only and omitted. Additive-optional → no schemaVersion bump.
 */
interface SerializedPotato {
  readonly id: PotatoId;
  readonly pos: Vec2;
  readonly state: PotatoState;
  readonly carrierId: PlayerId | null;
  readonly detonateAtTick: number;
  /** S81 P2 — grab tick of a CARRIED potato (in-hand hold-detonate window). Additive-
   *  optional: emitted only while CARRIED, so FREE/ARMED snapshots stay byte-identical. */
  readonly carriedAtTick?: number;
}

/**
 * S75 P3 — rainbow wire shape. dissipateAtTick round-trips (a HOST save/load resumes the TTL
 * poll from it). spawnedAtTick is host-only + omitted (rehydrates 0). Additive-optional.
 */
interface SerializedRainbow {
  readonly id: RainbowId;
  readonly pos: Vec2;
  readonly dissipateAtTick: number;
}

/**
 * S77 P3 — seagull wire shape. pos + vx (facing) + lastPoopTick round-trip (a HOST save/load
 * resumes the drop schedule from lastPoopTick; the client derives facing from sign(vx) + bobs/
 * flaps from world.tick). prevPos/baseY/spawnedAtTick are host-only/derived + omitted.
 */
interface SerializedSeagull {
  readonly id: SeagullId;
  readonly pos: Vec2;
  readonly vx: number;
  readonly lastPoopTick: number;
}

/**
 * S77 P3 — poop wire shape. state + landedAtTick (splat-pop timing via world.tick - landedAtTick)
 * + fouledPrimId (the foul anchor; host uses it for cleaning + the orphan sweep) round-trip;
 * prevPos/spawnedAtTick are host-only + omitted.
 */
interface SerializedPoop {
  readonly id: PoopId;
  readonly pos: Vec2;
  readonly state: PoopState;
  readonly landedAtTick: number;
  readonly fouledPrimId?: PrimitiveId;
}

export function snapshot(
  world: World,
  // S82 P2 — host-only extras injected by the SAVE call site. The Spawner is not part of
  // World (it is a main.ts-owned class), so its state arrives by parameter — which is
  // exactly what keeps it off the wire: netSnapshot() calls snapshot(world) WITHOUT opts,
  // so the field cannot exist on the net path by construction. getState() returning null
  // (non-stateful custom Rng) degrades to the pre-S82 from-seed behaviour (field omitted).
  opts?: { spawnerState?: SpawnerState | null },
): WorldSnapshot {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    tick: world.tick,
    rngSeed: world.rngSeed,
    gameState: world.gameState,
    lastWinnerId: world.lastWinnerId,
    nextPrimitiveId: world.nextPrimitiveId,
    nextBondId: world.nextBondId,
    freeSparks: [...world.freeSparks.values()].map(serializeSpark),
    primitives: [...world.primitives.values()].map(serializePrimitive),
    bonds: [...world.bonds.values()].map(serializeBond),
    players: [...world.players.values()].map(serializePlayer),
    scoreProgress: world.scoreProgress,
    gameMode: world.gameMode,
    // S42 — currentPlayerId field removed from World (turn-based gone).
    // Slot retained on WorldSnapshot as ignored-optional for back-compat
    // (Council R1 Battle Ledger row 2). New saves omit it entirely.
    scoreByPlayer: [...world.scoreByPlayer.entries()],
    // S28 P0 — NetSnapshot v2: only emit `creatures` when non-empty so pre-S28
    // saves stay byte-identical (the field stays `undefined` and is dropped by
    // JSON.stringify). Host always emits; clients never read this for serialize
    // (host-authoritative — see netSnapshot consumer in applySnapshotCore).
    creatures: world.creatures.size > 0
      ? [...world.creatures.values()].map(serializeCreature)
      : undefined,
    // S71 P1 — emit bombs only when present so pre-S71 saves stay byte-identical
    // (the field stays undefined and JSON.stringify drops it).
    bombs: world.bombs.size > 0
      ? [...world.bombs.values()].map(serializeBomb)
      : undefined,
    // S72 P2 — emit hunters only when present so pre-S72 saves stay byte-identical
    // (the field stays undefined and JSON.stringify drops it).
    hunters: world.hunters.size > 0
      ? [...world.hunters.values()].map(serializeHunter)
      : undefined,
    // S72 P2 — emit the once-per-game guard only when true (byte-identical pre-S72).
    hunterSpawned: world.hunterSpawned ? true : undefined,
    // S72 P3 — emit potatoes only when present (byte-identical pre-S72-P3).
    potatoes: world.potatoes.size > 0
      ? [...world.potatoes.values()].map(serializePotato)
      : undefined,
    // S75 P3 — emit rainbows only when present (byte-identical pre-S75).
    rainbows: world.rainbows.size > 0
      ? [...world.rainbows.values()].map(serializeRainbow)
      : undefined,
    // S84 P2 — emit the flyover switch tick only when set (byte-identical pre-S84).
    rainbowSwitchTick: world.rainbowSwitchTick,
    // S88 G3a — emit combo-discovery only when present (byte-identical pre-S88). The set
    // is SORTED so the wire form is canonical regardless of insertion order (PRIME-AUDIT R2).
    discoveredCombos:
      world.discoveredCombos.size > 0 ? [...world.discoveredCombos].sort() : undefined,
    comboToastTick: world.comboToastTick,
    lastDiscoveredComboNames: world.lastDiscoveredComboNames,
    // S93 — emit the NONET trial (compact wire form; puzzle regenerated from seed) only while
    // active; byte-identical pre-S93 otherwise. The fired-guard rides along for save/load.
    sudoku:
      world.sudoku === null
        ? undefined
        : {
            seed: world.sudoku.seed,
            startTick: world.sudoku.startTick,
            triggeredBy: world.sudoku.triggeredBy,
            solvedBy: world.sudoku.solvedBy,
            resolvedTick: world.sudoku.resolvedTick,
          },
    sudokuFiredThisMatch: world.sudokuFiredThisMatch ? true : undefined,
    // S77 P3 — emit seagulls/poops/fouled-prims only when present (byte-identical pre-S77).
    seagulls: world.seagulls.size > 0
      ? [...world.seagulls.values()].map(serializeSeagull)
      : undefined,
    poops: world.poops.size > 0 ? [...world.poops.values()].map(serializePoop) : undefined,
    fouledPrimitives: world.fouledPrimitives.size > 0 ? [...world.fouledPrimitives] : undefined,
    // S87 — emit bot seats only when present (byte-identical pre-S87 + on the wire,
    // where bots can never exist).
    botSeats: world.botSeats.size > 0 ? [...world.botSeats].map((p) => p as number) : undefined,
    // S31 P0-3 — filtered effects for 1v1 client mirror. Map+filter pattern
    // drops the 5 host-local visual kinds (BOND_COMMIT/SEVER_ERASE/
    // STRUCTURE_GROW/STRUCTURE_MERGE/SCORE_TIER) and keeps only the 3 wire
    // kinds (ARC_FLASH/BOND_FORMED/BOND_SEVERED). Empty `effects` array OR
    // all-host-only emission yields `undefined` so pre-S31 save back-compat
    // is preserved (the field absent on the wire round-trips through
    // JSON.stringify→parse as missing → applySnapshotCore clears effects).
    effects: ((): SerializedEffect[] | undefined => {
      if (world.effects.length === 0) return undefined;
      const out: SerializedEffect[] = [];
      for (const e of world.effects) {
        const se = serializeEffect(e);
        if (se !== null) out.push(se);
      }
      return out.length > 0 ? out : undefined;
    })(),
    // S82 P2 — emit the spawner state only when the save call site injected one
    // (byte-identical pre-S82; null getState() fallback also omits — see opts docblock).
    spawner: opts?.spawnerState ?? undefined,
  };
}

export function restore(snap: WorldSnapshot, world: World): void {
  if (snap.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion ${snap.schemaVersion}`);
  }
  applySnapshotCore(snap, world);
  // restore() owns host-only fields (savedAt is informational only; rngSeed
  // + nextPrimitiveId/nextBondId are absent in NetSnapshot but present here).
  world.rngSeed = snap.rngSeed;
  world.nextPrimitiveId = snap.nextPrimitiveId;
  world.nextBondId = snap.nextBondId;
  // Audit Pass 1 fix 3c8630d7 + Pass 2 refactor 622a7c7f: see import comment.
  // world.tick was just set by applySnapshotCore to the persisted value, which
  // may be lower than the audio cursor's prior maximum. Reset so audio effects
  // can replay. applyNetSnapshot does NOT call this — net path tick is host-
  // driven monotonic, so the cursor stays valid across snapshots.
  triggerAudioCursorReset();
}

/**
 * S15 P2 — NetSnapshot wire variant. Omits host-only fields (Council R2 +
 * PRIME-AUDIT consolidated retain-list).
 */
export type NetSnapshot = Omit<
  WorldSnapshot,
  // S82 P2 — 'spawner' joins the host-only omission list (rngSeed precedent: the spawner
  // stream words are the spawn schedule — never ship them to clients).
  'savedAt' | 'rngSeed' | 'nextPrimitiveId' | 'nextBondId' | 'spawner'
>;

/**
 * Strip host-only fields from a full snapshot to produce a NetSnapshot.
 * Used by HostSync.buildSnapshotMessage at NET_SNAPSHOT_HZ.
 */
export function netSnapshot(world: World): NetSnapshot {
  const full = snapshot(world);
  const {
    savedAt: _savedAt,
    rngSeed: _rngSeed,
    nextPrimitiveId: _nextPrimitiveId,
    nextBondId: _nextBondId,
    // S82 P2 — defense-in-depth: snapshot(world) without opts never emits 'spawner',
    // but if a future call path ever does, the destructure still strips it off the wire.
    spawner: _spawner,
    ...rest
  } = full;
  void _savedAt; void _rngSeed; void _nextPrimitiveId; void _nextBondId; void _spawner;
  return rest;
}

/**
 * Apply a NetSnapshot to a client's local world. Same machinery as restore()
 * but does not write host-only counters (rngSeed, nextPrimitiveId, nextBondId).
 * Throws on unsupported schemaVersion.
 */
export function applyNetSnapshot(snap: NetSnapshot, world: World): void {
  if (snap.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion ${snap.schemaVersion}`);
  }
  applySnapshotCore(snap, world);
}

/** Shared apply logic for restore() and applyNetSnapshot(). */
function applySnapshotCore(snap: NetSnapshot, world: World): void {
  world.tick = snap.tick;
  world.gameState = snap.gameState;
  world.lastWinnerId = snap.lastWinnerId;
  world.scoreProgress = snap.scoreProgress ?? 0;
  world.gameMode = snap.gameMode ?? 'solo';
  // S42 PRIME-AUDIT Δ3 — DELETED `world.currentPlayerId = ...` line (was
  // writing to a field no longer on the World interface). snap.currentPlayerId
  // is ignored on load; new saves omit the field.
  world.scoreByPlayer.clear();
  if (snap.scoreByPlayer !== undefined) {
    for (const [pid, score] of snap.scoreByPlayer) world.scoreByPlayer.set(pid, score);
  }

  world.freeSparks.clear();
  world.primitives.clear();
  world.bonds.clear();
  world.players.clear();
  // S25 P0 → S28 P0 — creatures cleared for parity, then rehydrated from
  // snap.creatures if present (NetSnapshot v2 host→client mirror). PRIME-AUDIT
  // Δ3: nullish-coalescing guard so pre-S28 saves (no `creatures` field) stay
  // back-compat — no TypeError. `nextCreatureId` reset to 0 by default; CHECK
  // Triumvirate cross-Council UNANIMOUS Grok-C1 + Gemini-G1 ACCEPTED fix:
  // advance counter past max-loaded-id so host save-load with live creatures
  // doesn't mint colliding IDs on next SPAWN_CREATURE. Client never mints, so
  // this is a no-op on the 1v1 client path. CHECK Grok-C3 ACCEPTED: also clear
  // `pendingCreatureSpawn` for parity (host save mid-cinematic could otherwise
  // re-fire the schedule on load).
  world.creatures.clear();
  world.nextCreatureId = 0;
  world.pendingCreatureSpawn = null;
  if (snap.creatures !== undefined) {
    let maxId = -1;
    for (const c of snap.creatures) {
      world.creatures.set(c.id, deserializeCreature(c));
      if ((c.id as number) > maxId) maxId = c.id as number;
    }
    if (maxId >= 0) world.nextCreatureId = maxId + 1;
  }

  // S71 P1 — bombs: clear + rehydrate (mirror of the creature pattern). Reset the
  // mint counter past the max loaded id so a host save-load with a live bomb does
  // not mint a colliding id on the next SPAWN_BOMB. Client never mints (no-op there).
  world.bombs.clear();
  world.nextBombId = 0;
  if (snap.bombs !== undefined) {
    let maxBombId = -1;
    for (const b of snap.bombs) {
      world.bombs.set(b.id, deserializeBomb(b));
      if ((b.id as number) > maxBombId) maxBombId = b.id as number;
    }
    if (maxBombId >= 0) world.nextBombId = maxBombId + 1;
  }

  // S72 P2 — hunters: clear + rehydrate (mirror of the bomb/creature pattern). Reset
  // the mint counter past the max loaded id so a host save/load with a live hunter
  // does not mint a colliding id. Restore the once-per-game guard so a reloaded host
  // does not re-spawn a second hunter. Client never mints (no-op there).
  world.hunters.clear();
  world.nextHunterId = 0;
  world.hunterSpawned = snap.hunterSpawned ?? false;
  if (snap.hunters !== undefined) {
    let maxHunterId = -1;
    for (const h of snap.hunters) {
      world.hunters.set(h.id, deserializeHunter(h));
      if ((h.id as number) > maxHunterId) maxHunterId = h.id as number;
    }
    if (maxHunterId >= 0) world.nextHunterId = maxHunterId + 1;
  }

  // S72 P3 — potatoes: clear + rehydrate (mirror of the bomb/hunter pattern). Reset the
  // mint counter past the max loaded id. Client never mints (no-op there).
  world.potatoes.clear();
  world.nextPotatoId = 0;
  if (snap.potatoes !== undefined) {
    let maxPotatoId = -1;
    for (const po of snap.potatoes) {
      world.potatoes.set(po.id, deserializePotato(po));
      if ((po.id as number) > maxPotatoId) maxPotatoId = po.id as number;
    }
    if (maxPotatoId >= 0) world.nextPotatoId = maxPotatoId + 1;
  }

  // S75 P3 — rainbows: clear + rehydrate (mirror of the potato pattern). Client never mints.
  world.rainbows.clear();
  world.nextRainbowId = 0;
  if (snap.rainbows !== undefined) {
    let maxRainbowId = -1;
    for (const rb of snap.rainbows) {
      world.rainbows.set(rb.id, deserializeRainbow(rb));
      if ((rb.id as number) > maxRainbowId) maxRainbowId = rb.id as number;
    }
    if (maxRainbowId >= 0) world.nextRainbowId = maxRainbowId + 1;
  }
  // S84 P2 — flyover switch tick: plain assign (undefined when the snapshot omits it,
  // which also clears a stale local value if the host's window was torn down).
  world.rainbowSwitchTick = snap.rainbowSwitchTick;

  // S88 G3a — combo discovery: rebuild the Set from the (sorted) wire array + plain-assign
  // the toast fields. Absent on pre-S88 / non-discovery snapshots ⇒ empty set + inactive toast.
  world.discoveredCombos = new Set((snap.discoveredCombos ?? []) as ComboKey[]);
  world.comboToastTick = snap.comboToastTick;
  world.lastDiscoveredComboNames = snap.lastDiscoveredComboNames;
  // S93 — NONET: rebuild the trial from the wire form (regenerate the puzzle from the seed so it
  // matches the host byte-for-byte) or clear it when the snapshot omits it (trial ended / none).
  world.sudoku =
    snap.sudoku === undefined
      ? null
      : {
          seed: snap.sudoku.seed,
          puzzle: generateSudoku(snap.sudoku.seed),
          startTick: snap.sudoku.startTick,
          triggeredBy: snap.sudoku.triggeredBy,
          solvedBy: snap.sudoku.solvedBy,
          resolvedTick: snap.sudoku.resolvedTick,
        };
  world.sudokuFiredThisMatch = snap.sudokuFiredThisMatch ?? false;

  // S77 P3 — seagulls + poops: clear + rehydrate (mirror of the hunter/potato pattern). Reset
  // the mint counters past the max loaded id (host save/load). Client never mints (no-op there).
  world.seagulls.clear();
  world.nextSeagullId = 0;
  if (snap.seagulls !== undefined) {
    let maxSeagullId = -1;
    for (const g of snap.seagulls) {
      world.seagulls.set(g.id, deserializeSeagull(g));
      if ((g.id as number) > maxSeagullId) maxSeagullId = g.id as number;
    }
    if (maxSeagullId >= 0) world.nextSeagullId = maxSeagullId + 1;
  }
  world.poops.clear();
  world.nextPoopId = 0;
  if (snap.poops !== undefined) {
    let maxPoopId = -1;
    for (const p of snap.poops) {
      world.poops.set(p.id, deserializePoop(p));
      if ((p.id as number) > maxPoopId) maxPoopId = p.id as number;
    }
    if (maxPoopId >= 0) world.nextPoopId = maxPoopId + 1;
  }
  // S77 P3 — fouled-primitives (host income-halt set). Round-trips so a host save/load + replay
  // resumes the income halt exactly; the client stores-but-ignores it (never computes income).
  world.fouledPrimitives.clear();
  if (snap.fouledPrimitives !== undefined) {
    for (const pid of snap.fouledPrimitives) world.fouledPrimitives.add(pid);
  }

  // S87 — bot-seat identity (clear + rehydrate; absent on every networked /
  // pre-S87 payload → stays empty).
  world.botSeats.clear();
  if (snap.botSeats !== undefined) {
    for (const seat of snap.botSeats) world.botSeats.add(asPlayerId(seat));
  }

  // S31 P0-3 — replace effects array contents from snap.effects. effects are
  // short-lived (max ~30 ticks each) and the host-side effectsRenderer.sync()
  // wipes `world.effects` to length=0 after draining; so the snapshot's effects
  // array is always a SMALL recent-frame subset (typically 0-3 entries).
  // Client-side renderer + audio + (P0-3 implicit) shake-trigger consume the
  // mirrored array. Pre-S31 saves (no `effects` field) → array cleared, world
  // stays valid. Replacement (not append) prevents stale-effect accumulation
  // on the client even if a snapshot is dropped/replayed.
  world.effects.length = 0;
  if (snap.effects !== undefined) {
    for (const se of snap.effects) {
      world.effects.push(deserializeEffect(se));
    }
  }

  for (const s of snap.freeSparks) {
    const spark: Spark = {
      ...makeFreeSpark({
        id: s.id,
        type: s.type,
        pos: s.pos,
        velocity: { x: 0, y: 0 },
        dt: PHYSICS_DT,
        createdTick: s.createdTick,
      }),
      pos: { ...s.pos },
      prevPos: { ...s.prevPos },
      state: s.state,
      poopyUntilTick: s.poopyUntilTick, // S77 P3 — round-trip the "poopy" slow (clients tint it)
    };
    world.freeSparks.set(spark.id, spark);
  }

  for (const p of snap.primitives) {
    const stubSpark = makeFreeSpark({
      id: asSparkId(-1),
      type: p.type,
      pos: p.pos,
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: p.createdTick,
    });
    const prim: Primitive = {
      ...makePrimitiveFromSpark({
        id: p.id,
        spark: stubSpark,
        placerColor: p.placerColor,
        placedBy: p.placedBy,
        tick: p.createdTick,
      }),
      pos: { ...p.pos },
      prevPos: { ...p.prevPos },
      bonds: new Set(p.bonds),
      ownerColor: p.ownerColor,
      lastOwnershipChange: p.lastOwnershipChange,
      radius: p.radius,
    };
    world.primitives.set(prim.id, prim);
  }

  for (const b of snap.bonds) {
    const a = world.primitives.get(b.aId);
    const bb = world.primitives.get(b.bId);
    if (a === undefined || bb === undefined) {
      throw new Error(`bond ${b.id} references missing primitive`);
    }
    const bond: Bond = {
      id: b.id,
      aId: b.aId,
      bId: b.bId,
      a,
      b: bb,
      restLength: b.restLength,
      stiffnessTier: b.stiffnessTier,
      createdTick: b.createdTick,
    };
    world.bonds.set(bond.id, bond);
  }

  for (const p of snap.players) {
    const base = {
      id: p.id,
      color: p.color,
      energy: p.energy,
      buildActions: p.buildActions,
      disruptionCharges: p.disruptionCharges,
      avatarPos: p.avatarPos !== undefined
        ? { x: p.avatarPos.x, y: p.avatarPos.y }
        : { x: 0, y: 0 },
      // S22 P3 — godly cooldown is not yet network-serialized (HostSync emits
      // NetSnapshot subset; cooldown is host-authoritative anyway). Reconstruct
      // as null on snapshot apply; cooldown re-applies via GODLY_TRIGGER reducer.
      godlyCooldownEndsAtTick: null,
      // S49 P1 (Sym F) — rehydrate debuff tick; null for pre-S49 saves.
      territorialShrinkUntilTick: p.territorialShrinkUntilTick ?? null,
      // S72 P2 — rehydrate the hunter bench; undefined for pre-S72 saves.
      benchedUntilTick: p.benchedUntilTick,
      // S72 P3 — rehydrate the carried potato slot; undefined for pre-S72-P3 saves.
      carriedPotatoId: p.carriedPotatoId,
      // S82 P1 — rehydrate the cruiser-slow debuff; undefined for pre-S82 saves. The
      // chase target is deep-copied so the live World never aliases the snapshot object.
      poopedUntilTick: p.poopedUntilTick,
      poopedCursorTarget:
        p.poopedCursorTarget !== undefined
          ? { x: p.poopedCursorTarget.x, y: p.poopedCursorTarget.y }
          : undefined,
    };
    const player: Player =
      p.kind === 'Carrying' && p.carriedSparkId !== null
        ? { ...base, kind: 'Carrying', carriedSparkId: p.carriedSparkId }
        : { ...base, kind: 'Idle' };
    world.players.set(player.id, player);
  }
}

function serializeSpark(s: Spark): SerializedSpark {
  return {
    id: s.id,
    type: s.type,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.prevPos.x, y: s.prevPos.y },
    radius: s.radius,
    createdTick: s.createdTick,
    state: s.state,
    poopyUntilTick: s.poopyUntilTick, // S77 P3 — "poopy" slow expiry (clients render the tint)
  };
}

function serializePrimitive(p: Primitive): SerializedPrimitive {
  return {
    id: p.id,
    type: p.type,
    placerColor: p.placerColor,
    placedBy: p.placedBy,
    createdTick: p.createdTick,
    pos: { x: p.pos.x, y: p.pos.y },
    prevPos: { x: p.prevPos.x, y: p.prevPos.y },
    bonds: [...p.bonds],
    ownerColor: p.ownerColor,
    lastOwnershipChange: p.lastOwnershipChange,
    radius: p.radius,
  };
}

function serializeBond(b: Bond): SerializedBond {
  return {
    id: b.id,
    aId: b.aId,
    bId: b.bId,
    restLength: b.restLength,
    stiffnessTier: b.stiffnessTier,
    createdTick: b.createdTick,
  };
}

function serializePlayer(p: Player): SerializedPlayer {
  return {
    id: p.id,
    color: p.color,
    kind: p.kind,
    carriedSparkId: p.kind === 'Carrying' ? p.carriedSparkId : null,
    energy: p.energy,
    buildActions: p.buildActions,
    disruptionCharges: p.disruptionCharges,
    avatarPos: { x: p.avatarPos.x, y: p.avatarPos.y },
    // S49 P1 (Sym F) — emit only when non-null so pre-S49 saves stay
    // byte-identical on the wire (JSON.stringify drops `undefined` keys).
    // Pre-S49 readers rehydrate as null via nullish-coalescing.
    ...(p.territorialShrinkUntilTick !== null
      ? { territorialShrinkUntilTick: p.territorialShrinkUntilTick }
      : {}),
    // S72 P2 — emit the hunter bench only when set so pre-S72 saves stay
    // byte-identical (JSON.stringify drops undefined keys).
    ...(p.benchedUntilTick !== undefined
      ? { benchedUntilTick: p.benchedUntilTick }
      : {}),
    // S72 P3 — emit the carried potato id only when set (byte-identical pre-S72-P3).
    ...(p.carriedPotatoId !== undefined
      ? { carriedPotatoId: p.carriedPotatoId }
      : {}),
    // S82 P1 — emit the cruiser-slow debuff fields only when set (byte-identical pre-S82).
    ...(p.poopedUntilTick !== undefined
      ? { poopedUntilTick: p.poopedUntilTick }
      : {}),
    ...(p.poopedCursorTarget !== undefined
      ? { poopedCursorTarget: { x: p.poopedCursorTarget.x, y: p.poopedCursorTarget.y } }
      : {}),
  };
}

/**
 * S28 P0 — Voltkin Phase 2D Council Q4 2/3 B trimmed shape: only fields the
 * client renderer needs (id/type/pos/state/ticksInState). AI + lifecycle fields
 * (targetBondId, targetPos, prevPos, spawnedAtTick, despawnAtTick) stay omitted
 * — host runs FSM, client only renders.
 * S58 (#3) — `ownerPlayerId` is now emitted: the client fog mask reveals around
 * OWN creatures, so the joiner needs to know which creatures are its own.
 */
function serializeCreature(c: Creature): SerializedCreature {
  return {
    id: c.id,
    type: c.type,
    pos: { x: c.pos.x, y: c.pos.y },
    state: c.state,
    ticksInState: c.ticksInState,
    // S58 (#3) — always emit (0 is a valid owner, so no omit-on-default like
    // killCount). Determinism-safe: save.replay compares two host snapshots that
    // both carry the same ownerPlayerId, so byte-equality holds.
    ownerPlayerId: c.ownerPlayerId,
    // S36 P3 — emit only when > 0 so pre-S36 saves with no kills stay
    // byte-identical on the wire (JSON.stringify drops `undefined` keys).
    // Pre-S36 readers tolerate the missing field via deserializeCreature's
    // nullish-coalescing default 0.
    ...(c.killCount > 0 ? { killCount: c.killCount } : {}),
  };
}

/**
 * S31 P0-3 — drop host-local visual effects (BOND_COMMIT, SEVER_ERASE,
 * STRUCTURE_GROW, STRUCTURE_MERGE, SCORE_TIER) and preserve the 3 NET-relevant
 * kinds. Pure: returns the trimmed wire-shape variant or null to signal drop.
 *
 * The shape mirrors GameEffect bit-for-bit for the kept variants. JSON
 * stringification flattens Vec2 / readonly down to plain objects; deserializer
 * reinflates via spread to defensive-copy.
 */
function serializeEffect(e: GameEffect): SerializedEffect | null {
  switch (e.kind) {
    case 'ARC_FLASH':
      return {
        kind: 'ARC_FLASH',
        tick: e.tick,
        start: { x: e.start.x, y: e.start.y },
        end: { x: e.end.x, y: e.end.y },
        // S33 P1-11 — pass-through; undefined for legacy pre-S33 effects.
        // JSON.stringify drops `undefined` properties so wire stays clean
        // for pre-S33-emit ARC_FLASH (additive-optional precedent).
        creatureId: e.creatureId,
      };
    case 'BOND_FORMED':
      return {
        kind: 'BOND_FORMED',
        tick: e.tick,
        pos: { x: e.pos.x, y: e.pos.y },
        bondCount: e.bondCount,
      };
    case 'BOND_SEVERED':
      return {
        kind: 'BOND_SEVERED',
        tick: e.tick,
        pos: { x: e.pos.x, y: e.pos.y },
        cause: e.cause,
      };
    case 'CREATURE_CHARGE':
      // S37 P7 — wire-mirror the lightning charge-up audio cue. Both host and
      // joiner drain this and fire `playChargeSFX` at the same tick + sfx-bus
      // settings, keeping the 250ms wind-up tone synced across 1v1 peers.
      return {
        kind: 'CREATURE_CHARGE',
        tick: e.tick,
        pos: { x: e.pos.x, y: e.pos.y },
      };
    case 'BOMB_EXPLODE':
      // S71 P1 — wire-mirror the detonation burst so the client sees the boom.
      return {
        kind: 'BOMB_EXPLODE',
        tick: e.tick,
        pos: { x: e.pos.x, y: e.pos.y },
        radius: e.radius,
      };
    // Host-local visual flair — not sent to client. Renderer-only.
    case 'BOND_COMMIT':
    case 'SEVER_ERASE':
    case 'STRUCTURE_GROW':
    case 'STRUCTURE_MERGE':
    case 'SCORE_TIER':
      return null;
  }
}

/**
 * S31 P0-3 — rehydrate a SerializedEffect into a GameEffect. The discriminated
 * union variants in SerializedEffect match GameEffect's wire-relevant subset
 * bit-for-bit; TS narrows via `kind` and we reconstruct with defensive Vec2
 * spreads so caller doesn't share refs with the snapshot.
 */
function deserializeEffect(s: SerializedEffect): GameEffect {
  switch (s.kind) {
    case 'ARC_FLASH':
      return {
        kind: 'ARC_FLASH',
        tick: s.tick,
        start: { x: s.start.x, y: s.start.y },
        end: { x: s.end.x, y: s.end.y },
        // S33 P1-11 — pass-through. Pre-S33 wire payloads have no
        // creatureId field; rehydrated GameEffect omits it; arcSeed
        // coerces undefined → 0 so legacy data renders pre-S33 jitter.
        creatureId: s.creatureId,
      };
    case 'BOND_FORMED':
      return {
        kind: 'BOND_FORMED',
        tick: s.tick,
        pos: { x: s.pos.x, y: s.pos.y },
        bondCount: s.bondCount,
      };
    case 'BOND_SEVERED':
      return {
        kind: 'BOND_SEVERED',
        tick: s.tick,
        pos: { x: s.pos.x, y: s.pos.y },
        cause: s.cause,
      };
    case 'CREATURE_CHARGE':
      return {
        kind: 'CREATURE_CHARGE',
        tick: s.tick,
        pos: { x: s.pos.x, y: s.pos.y },
      };
    case 'BOMB_EXPLODE':
      return {
        kind: 'BOMB_EXPLODE',
        tick: s.tick,
        pos: { x: s.pos.x, y: s.pos.y },
        radius: s.radius,
      };
  }
}

/**
 * S28 P0 — rehydrate a SerializedCreature on the client side. Sim-only fields
 * (prevPos, targetPos, targetBondId, spawnedAtTick, despawnAtTick) are
 * reconstructed with neutral defaults: prevPos snaps to pos (zero implicit
 * velocity — client never integrates anyway), targetPos snaps to pos (no AI),
 * targetBondId=null (no AI), spawnedAtTick=0 and despawnAtTick=0 (renderer
 * ignores — host owns the despawn dispatch).
 * S58 (#3) — `ownerPlayerId` now rehydrates from the wire (was hardcoded 0);
 * the client fog mask reveals around OWN creatures. Pre-S58 NetSnapshots omit
 * the field → nullish-coalesce to 0 (old data stays valid).
 */
function deserializeCreature(s: SerializedCreature): Creature {
  return {
    id: s.id,
    type: s.type,
    ownerPlayerId: asPlayerId(s.ownerPlayerId ?? 0),
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x, y: s.pos.y },
    targetPos: { x: s.pos.x, y: s.pos.y },
    targetBondId: null,
    state: s.state,
    ticksInState: s.ticksInState,
    // S36 P3 — additive-optional rehydrate. Pre-S36 saves + pre-S36
    // NetSnapshots omit the field; nullish-coalesce to 0 keeps old data
    // valid and rehydrates as "creature never landed an attack" (hurt
    // frame at DESPAWNING).
    killCount: s.killCount ?? 0,
    spawnedAtTick: 0,
    despawnAtTick: 0,
  };
}

/** S71 P1 — bomb wire round-trip (full shape; see SerializedBomb rationale). */
function serializeBomb(b: Bomb): SerializedBomb {
  return {
    id: b.id,
    pos: { x: b.pos.x, y: b.pos.y },
    radius: b.radius,
    spawnedAtTick: b.spawnedAtTick,
    dissipateAtTick: b.dissipateAtTick,
  };
}

function deserializeBomb(s: SerializedBomb): Bomb {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    radius: s.radius,
    spawnedAtTick: s.spawnedAtTick,
    dissipateAtTick: s.dissipateAtTick,
  };
}

/**
 * S72 P2 — render-trimmed hunter serialize (mirrors serializeCreature). Sim-only
 * fields (prevPos, spawnedAtTick, despawnAtTick) are host-only + omitted; the client
 * renderer needs only id/pos/state/ticksInState/targetPlayerId.
 */
function serializeHunter(h: Hunter): SerializedHunter {
  return {
    id: h.id,
    pos: { x: h.pos.x, y: h.pos.y },
    state: h.state,
    ticksInState: h.ticksInState,
    targetPlayerId: h.targetPlayerId,
  };
}

/**
 * S72 P2 — rehydrate a SerializedHunter on the client. Sim-only fields get neutral
 * defaults: prevPos snaps to pos (client never integrates), spawnedAtTick=0 +
 * despawnAtTick=0 (renderer ignores; host owns the despawn). targetPlayerId carries
 * so the renderer can face the wedge toward the chased player's avatar.
 */
function deserializeHunter(s: SerializedHunter): Hunter {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x, y: s.pos.y },
    state: s.state,
    ticksInState: s.ticksInState,
    targetPlayerId: s.targetPlayerId,
    spawnedAtTick: 0,
    despawnAtTick: 0,
  };
}

/** S72 P3 — potato serialize. prevPos + spawnedAtTick are host-only + omitted. */
function serializePotato(po: Potato): SerializedPotato {
  return {
    id: po.id,
    pos: { x: po.pos.x, y: po.pos.y },
    state: po.state,
    carrierId: po.carrierId,
    detonateAtTick: po.detonateAtTick,
    // S81 P2 — the hold-detonate window rides only while defined (CARRIED).
    ...(po.carriedAtTick !== undefined ? { carriedAtTick: po.carriedAtTick } : {}),
  };
}

/** S72 P3 — rehydrate a potato. prevPos snaps to pos; spawnedAtTick=0 (host owns the
 *  fuse poll via detonateAtTick, which round-trips). */
function deserializePotato(s: SerializedPotato): Potato {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x, y: s.pos.y },
    state: s.state,
    carrierId: s.carrierId,
    spawnedAtTick: 0,
    detonateAtTick: s.detonateAtTick,
    carriedAtTick: s.carriedAtTick, // S81 P2 — resumes the in-hand window (undefined if absent)
  };
}

/** S75 P3 — rainbow serialize. spawnedAtTick is host-only + omitted (dissipateAtTick round-trips). */
function serializeRainbow(rb: Rainbow): SerializedRainbow {
  return {
    id: rb.id,
    pos: { x: rb.pos.x, y: rb.pos.y },
    dissipateAtTick: rb.dissipateAtTick,
  };
}

/** S77 P3 — seagull serialize. prevPos/baseY/spawnedAtTick host-only/derived + omitted. */
function serializeSeagull(g: Seagull): SerializedSeagull {
  return {
    id: g.id,
    pos: { x: g.pos.x, y: g.pos.y },
    vx: g.vx,
    lastPoopTick: g.lastPoopTick,
  };
}

/** S77 P3 — rehydrate a seagull. baseY = pos.y; prevPos derived from vx; spawnedAtTick = 0. */
function deserializeSeagull(s: SerializedSeagull): Seagull {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x - s.vx, y: s.pos.y },
    vx: s.vx,
    baseY: s.pos.y,
    spawnedAtTick: 0,
    lastPoopTick: s.lastPoopTick,
  };
}

/** S77 P3 — poop serialize. prevPos/spawnedAtTick host-only + omitted. */
function serializePoop(p: Poop): SerializedPoop {
  return {
    id: p.id,
    pos: { x: p.pos.x, y: p.pos.y },
    state: p.state,
    landedAtTick: p.landedAtTick,
    fouledPrimId: p.fouledPrimId,
  };
}

/** S77 P3 — rehydrate a poop. prevPos snaps to pos; spawnedAtTick = 0. */
function deserializePoop(s: SerializedPoop): Poop {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x, y: s.pos.y },
    state: s.state,
    spawnedAtTick: 0,
    landedAtTick: s.landedAtTick,
    fouledPrimId: s.fouledPrimId,
  };
}

/** S75 P3 — rehydrate a rainbow. spawnedAtTick=0 (host owns the TTL poll via dissipateAtTick). */
function deserializeRainbow(s: SerializedRainbow): Rainbow {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    spawnedAtTick: 0,
    dissipateAtTick: s.dissipateAtTick,
  };
}

