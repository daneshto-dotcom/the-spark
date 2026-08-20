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

import {
  PRIMITIVE_MAX_HP,
  SPAWN_INTERVAL_TICKS,
  type StiffnessTier,
  type SparkType,
  PHASE_DURATION_TICKS,
} from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { makePrimitiveFromSpark, type Primitive } from '../game/primitive.ts';
import {
  makeFreeSpark,
  type Spark,
  type SparkState,
} from '../game/spark.ts';
import { type Bond } from '../physics/bonds.ts';
import { type ComboKey } from '../combos.ts';
import { type GodlyId } from './godlyRecipes/types.ts';
import { generateSudoku } from './sudoku.ts';
import {
  asPlayerId,
  asSparkId,
  type BombId,
  type BondId,
  type CreatureId,
  type GathererId,
  type HunterId,
  type PlayerId,
  type PotatoId,
  type RainbowId,
  type PoopId,
  type PrimitiveId,
  type SeagullId,
  type SparkId,
  type SpawnerId,
  type DefenderId,
  type Vec2,
} from '../types.ts';
import { type GameMode, type GameState, type MatchPhase, type World } from './world.ts';
import type { ZoneLayout } from './zones.ts';
import { type Player } from '../game/player.ts';
import type { SpawnerState } from '../game/spawner.ts';
import type { Bomb } from './bomb.ts';
import type { Creature, CreatureState, CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import type { Gatherer, GathererState } from './gatherers/gatherer.ts';
import type { Hunter, HunterState } from './hunters/hunter.ts';
import type { Potato, PotatoState } from './potato.ts';
import type { Rainbow } from './rainbow.ts';
import type { Poop, PoopState, Seagull } from './seagulls/seagull.ts';
import { makeSpawner, type CreatureSpawner } from './spawners/spawner.ts';
import {
  makeDefender,
  type Defender,
  type DefenderKind,
  type DefenderState,
} from './defenders/defender.ts';
import { loadRephaseDefenders } from './defenders/defenderLifecycle.ts';
import { makeCastleBank } from './castleBank.ts';
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
  /**
   * S147 P1 — the match clock. Additive-OPTIONAL on the wire (the `rainbowSwitchTick` precedent, no
   * schemaVersion bump): a pre-S147 save simply has neither key and rehydrates to a fresh full BUILD
   * stage. Both ride `NetSnapshot` deliberately — the deadline is host-authoritative, so a joiner
   * must never compute it locally.
   */
  matchPhase?: MatchPhase;
  phaseEndsAtTick?: number;
  /**
   * S148 P1 — WHICH BOARD. Additive-OPTIONAL on the wire, same precedent as the clock above: a
   * pre-S148 save has no key and rehydrates to `PITCH_2P`.
   *
   * ⚠ THE FALLBACK IS A REAL DECISION, NOT A DEFAULT. A restored save with no layout is a
   * pre-quadrant world whose keeps were on the old polar ring; there is no way to recover which
   * board it "was", because it was on neither. `PITCH_2P` is chosen because it is what a solo or
   * 1v1 save — overwhelmingly the common case — would get from `layoutForSeatCount` anyway.
   */
  layout?: ZoneLayout;
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
   * despawnAtTick/ownerPlayerId were all omitted (~36 B/creature × max 2 = ~72 B per
   * snapshot — negligible vs prims/bonds payload).
   * ⚠ CORRECTED S134 — that list is HISTORY, not the current contract. `ownerPlayerId`
   * (S58), `targetBondId` (S133) and `despawnAtTick` (S134) all ride the wire now. Only
   * `targetCreatureId` is stripped; `targetPos`/`prevPos`/`spawnedAtTick` have no
   * serializer surface at all. The single source of truth is `trimMirrorCreature`. Pre-S28 saves omit this
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
   * V6-1.1 — bought gatherer units. Additive-optional (creature/hunter precedent); emitted only
   * when non-empty so a pre-V6 save stays byte-identical. MUST round-trip: a gatherer costs 105
   * victory points, so losing one on host migration / worker resume would silently burn the
   * purchase.
   */
  gatherers?: SerializedGatherer[];
  /**
   * S136 P1 (V6-1.3) — per-seat CASTLE BANKS: shapes held INSIDE the castle, out of `freeSparks`.
   *
   * Additive-optional (the creature/hunter/gatherer precedent): emitted only when a bank is
   * non-empty, so every pre-S136 save stays byte-identical and loads with empty banks.
   *
   * MUST round-trip. A banked shape is work the player's gatherer already paid travel time for, and
   * it is NOT in `freeSparks` — so a successor that inherited a world without this field would lose
   * every stored shape silently, with no entity left behind to notice. Same failure class as the
   * S135 hunter-lifetime gap, which is why the entries carry the FULL SerializedSpark rather than a
   * bare type: the spark that comes back out of a pull is the same entity that went in, id included.
   */
  /**
   * S146 P2 — per-seat shape TALLY indexed by SparkType (length 6), uncapped. Emitted only for seats
   * holding something, so an empty-castle world stays byte-identical.
   *
   * `shapes` (the pre-S146 entity list) is accepted on LOAD for disk back-compat and tallied; it is
   * never emitted. See applySnapshotCore.
   */
  castleBanks?: Array<{ seat: PlayerId; counts?: number[]; shapes?: SerializedSpark[] }>;
  /**
   * S141 P2 (V6-1.4) — the per-player gatherer ORDER QUEUE. Additive-optional: emitted only for seats
   * with a non-empty queue, so a pre-S141 world round-trips byte-identically and an idle match pays
   * nothing.
   *
   * MUST round-trip for the same reason `castleBanks` does. A queue is host-authoritative input to
   * `pickGathererTarget`, so a successor that inherited a world without it would silently re-point
   * every one of that player's gatherers to "nearest, any type" — the player's standing instructions
   * would evaporate at a host migration with no entity left behind to notice.
   */
  gathererOrders?: Array<{ seat: PlayerId; types: SparkType[] }>;
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
   * S97 P5 — per-type godly once-per-match guard (SORTED GodlyId[]). Additive-optional (emitted
   * only when non-empty); a new host (host-migration) / save-load won't re-fire an already-used
   * godly type. Mirror of discoveredCombos' Set↔sorted-string[] wire form.
   */
  godlyFiredThisMatch?: string[];
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
  /**
   * S100 P1 (TD Phase 1a) — host-authoritative creature spawners for the 1v1 client
   * mirror + host save/load. Additive-optional (creature/hunter precedent; NO
   * schemaVersion bump): emitted only when non-empty, so every pre-S100 save AND every
   * networked NetSnapshot (no spawner live) stays byte-identical. Unlike the `spawner`
   * field above (the host-only spark-cadence RNG state, stripped from the wire), this
   * one DOES ride the wire — clients need to render the live spawn-zone aura — but only
   * the tiny SerializedSpawner identity (id/ownerPlayerId/anchorPrimitiveId/recipeId);
   * the cadence state stays host-only and is re-seeded from `world.tick` on rehydrate.
   */
  creatureSpawners?: SerializedSpawner[];
  /**
   * S103 P2 — host-authoritative generic defenders (laser turret / HELGA) for the 1v1 client
   * mirror + host save/load. Additive-optional (creatureSpawners precedent; NO schemaVersion
   * bump): emitted only when non-empty, so a no-defender world stays byte-identical. Unlike
   * creatures, NOTHING is host-only-stripped — ALL fields ride the wire because the client
   * renders the beam/slap off the synced FIRE state + the windup rings off `nextFireTick`
   * (Council MF1/MF6). Serialized sorted by id (deterministic); `nextFireTick` is re-phased on
   * load (Council MF5) to prevent an insta-fire. PROTOCOL_VERSION 11->12 covers the wire shape.
   */
  defenders?: SerializedDefender[];
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
  /** V6-1.2 — gatherer escrow (hauled/banked). Additive-optional; undefined = an ordinary free spark. */
  escrow?: 'hauled' | 'banked';
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
  /**
   * S138 P1 — ADDITIVE-OPTIONAL, emitted by serializePrimitive ONLY when DAMAGED
   * (`hp < PRIMITIVE_MAX_HP`), exactly as `serializeCreature` does for creature hp. An undamaged
   * board therefore serializes byte-for-byte as it did pre-S138, which is why this needed no
   * PROTOCOL_VERSION bump (protocol.ts:152 precedent: re-adding creature `hp`/`chewProgress`/
   * `targetBondId` to the wire did not bump either — additive-optional, schemaVersion-gated).
   * ⚠ Consequence, stated rather than discovered later: a pre-S138 save restores every primitive
   * at FULL health, because absence means undamaged. That is correct, not lossy.
   */
  hp?: number;
  /**
   * S152 — BLUEPRINT PROVENANCE (R13). ADDITIVE-OPTIONAL, emitted by `serializePrimitive` ONLY for
   * a shape a blueprint stamp minted, exactly as `hp` is emitted only when damaged — so a board of
   * hand-placed shapes serializes byte-for-byte as it did pre-S152.
   *
   * ⚠ AND IT MUST ROUND-TRIP, unlike a purely cosmetic field. A successor host that dropped this
   * would see every restored tower as freeform rubble: FIX would refuse (no bill to restore to)
   * while SCRAP kept working, so the same structure would behave differently either side of a
   * save/load, a host migration or a `?worker=1` restore. That is the `escrow` lesson, one field
   * over.
   */
  origin?: { blueprintId: GodlyId; nodeIndex: number };
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
      readonly cause: 'player' | 'physics' | 'godly' | 'creature' | 'bomb' | 'chewer' | 'drone'; // S102 #2 — chewer gnaw sever; S113 — 'drone' lightning detonation sever
      /**
       * V6-0.3 (S131) — sever attribution, additive-optional on the `creatureId?` precedent
       * above. NO `PROTOCOL_VERSION` bump and NO `schemaVersion` bump: `deserializeEffect`
       * reconstructs by NAME, so a payload without these fields rehydrates to a GameEffect
       * without them. See the GameEffect docblock (effects.ts) for why there are two.
       *
       * These four sites — this type, the GameEffect variant, `serializeEffect`'s BOND_SEVERED
       * case and `deserializeEffect`'s — are per-case object literals with NO spread, so a field
       * added to some of them silently never reaches the wire. Edit them together.
       */
      readonly actor?: PlayerId;
      readonly victim?: PlayerId;
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
  /**
   * S100 P1 (TD Phase 1a) — HOST-SAVE-ONLY persistent chewer fields. These are
   * ROUND-TRIPPED through the host save path (`snapshot()` → `restore()`) so a
   * persistent mid-chew chewer survives a save/load (TOWER_DEFENSE_DESIGN.md §3.5,
   * R3) — the SerializedBomb.dissipateAtTick precedent.
   * ⚠ AMENDED S134 — ONLY `targetCreatureId` is still stripped from the wire by
   * `netSnapshot()`. `chewProgress` + `targetBondId` were un-stripped in S133 (a successor
   * inherited every chew reset to zero, and chewProgress IS the bond's HP);
   * `despawnAtTick` + `sourceSpawnerId` in S134 (a successor deleted its whole creature
   * population and mass-detonated its drones). See `trimMirrorCreature`.
   * ⛔ THE VOLTKIN BYTE-IDENTITY PROPERTY IS DELIBERATELY BROKEN AS OF S134 — do not cite
   * it as a constraint. `despawnAtTick` is now emitted for EVERY creature including a
   * Voltkin, so the Voltkin wire shape HAS changed and pre-S100 byte-equivalence no longer
   * holds for it. That was the price of the fix and it was paid knowingly (+21 B/Voltkin,
   * +41 B/chewer, measured). `sourceSpawnerId` stays conditional NOT to preserve that
   * property but because absence rehydrates to the correct value via `?? null`.
   *
   *  - despawnAtTick: a persistent chewer's lifetime is governed by the FSM
   *    `!config.persistent` gate, but `deserializeCreature` defaults despawnAtTick=0
   *    → a rehydrated chewer would mis-render its DESPAWNING window; round-trip it so
   *    save/load preserves the construction-time value.
   *  - chewProgress: the in-flight chew accumulator vs the committed bond.
   *  - sourceSpawnerId: provenance (which spawner minted it) — drives the split caps
   *    + FFA target-spread + scoped stickiness. ⚠ CORRECTED S134 — NO LONGER lost on the
   *    wire; it survives, which is what keeps the per-spawner caps armed on a successor.
   *  - targetBondId: the committed bond the chewer is chewing; round-tripped so a
   *    mid-chew save resumes against the same bond (the wire rehydrates it null since
   *    the client doesn't run the AI).
   */
  readonly despawnAtTick?: number;
  readonly chewProgress?: number;
  readonly sourceSpawnerId?: SpawnerId;
  readonly targetBondId?: BondId;
  /**
   * S103 #8 — the enemy creature a Voltkin is zapping this cycle. HOST-SAVE-ONLY (stripped
   * from the wire by trimMirrorCreature; the client rehydrates null — it never runs the AI).
   * Emitted by serializeCreature ONLY when non-null, so an undamaged/idle creature stays
   * byte-identical to a pre-S103 save; round-tripped so a Voltkin mid-zap resumes its target.
   */
  readonly targetCreatureId?: CreatureId;
  /**
   * S139 P2 — the goblin's committed enemy shape. Additive-optional: emitted ONLY when non-null, so
   * every pre-goblin snapshot stays byte-identical and an older save deserializes to `null`.
   * ⚠ NOT stripped from the wire. `trimMirrorCreature` strips `targetCreatureId` alone, and S133/S134
   * had to UN-strip four creature fields after host-migration successors silently healed damaged
   * creatures and re-detonated spent ones — so the default posture for a new gameplay-bearing field
   * is "keep it on the wire" unless there is a measured reason not to.
   */
  readonly targetPrimitiveId?: PrimitiveId;
  /**
   * S102 (unified HP model) — remaining creature hit-points.
   * ⚠ AMENDED S133 — this now RIDES THE WIRE. It was host-save-only and stripped by
   * trimMirrorCreature, which meant a host-migration successor took over with every
   * damaged creature healed to full.
   * Emitted by serializeCreature ONLY when DAMAGED (hp < config.hp) so an undamaged
   * creature (every creature in normal play until P3's combat) stays byte-identical to
   * a pre-S102 save. deserializeCreature defaults a missing value to the per-type config.
   */
  readonly hp?: number;
  /**
   * ⛔ S142 P1 — ADDED. `Creature.poopyUntilTick` existed and was READ at runtime
   * (`creatureVerlet` halves a poop-slowed creature's steering accel while
   * `tick < poopyUntilTick`), but `SerializedCreature` had no such field — so the debuff was
   * silently erased by every save/load, every host migration and every sim-worker INIT.
   *
   * Found by the S142 defect-class sweep, which is the generalisation of the spawner-cadence
   * bug in the same session: compare each entity interface's MUTABLE fields against what its
   * serializer actually emits, because a field that is simply absent from the payload can
   * never round-trip and nothing in the type system complains.
   *
   * `SerializedSpark` has round-tripped this exact field since S77 P3 — so the two halves of
   * one debuff disagreed for 65 sessions. Emitted only when defined, so an un-poopy world
   * stays byte-identical. Kept ON the wire per the S133/S134 default posture recorded above.
   */
  readonly poopyUntilTick?: number;
}

/**
 * S100 P1 (TD Phase 1a) — tiny additive-optional spawner wire/save shape.
 *
 * ⛔ S142 P1 — AMENDED, AND THE OLD DOCBLOCK'S DEFENCE WAS FALSE ON ONE PATH.
 * It used to read: "the cadence state is HOST-ONLY … on rehydrate makeSpawner re-seeds
 * from `world.tick` … a host save/load with a live spawner can't desync because both
 * peers re-derive cadence the same way."
 *
 * The ANTI-CHEAT half is real and is PRESERVED below: the upcoming spawn schedule must
 * never reach a modified client (rngSeed-exclusion precedent, TOWER_DEFENSE_DESIGN.md
 * §3.3). But "both peers re-derive identically" is FALSE on the sim-worker INIT path,
 * where only ONE side re-derives: `makeWorkerSim` runs `restore()` while the main thread
 * keeps its ORIGINAL spawner objects. And in solo / VS-BOTS there is no NetSnapshot at
 * all, so nothing ever re-syncs it.
 *
 * That mattered because host-migration TAKEOVER sets `world.isHost = true` MID-MATCH on a
 * peer whose `simWorkerDriver` is null, so its next frame adopts the worker with LIVE
 * spawners. `spawnedCount` is not telemetry — `hostTick` self-destructs a structure
 * spawner at `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` — so re-seeding silently granted the
 * promoted host a FRESH self-destruct lifetime. Invisible to every runtime instrument:
 * spawners are absent from `NARROW_HASHED_FAMILIES` (the only hash compared at runtime),
 * and a mismatch merely increments a counter.
 *
 * ⇒ The four cadence fields are now ADDITIVE-OPTIONAL and are emitted by
 * `serializeSpawner` for the LOCAL consumers (disk save + worker INIT), and STRIPPED from
 * the wire by `trimMirrorSpawner` in `netSnapshot()` — the same place, and the same
 * defence-in-depth posture, as every other host-only field. A client therefore receives
 * exactly the pre-S142 identity shape and `deserializeSpawner` re-seeds for it as before,
 * so the wire stays byte-identical and the client path is provably unchanged.
 *
 * Emitted only when `creatureSpawners` is non-empty (creature/hunter precedent), so every
 * pre-S100 save stays byte-identical when no spawner is live.
 */
interface SerializedSpawner {
  readonly id: SpawnerId;
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  /**
   * S142 P1 — host-local cadence. Present on disk saves and the worker INIT snapshot;
   * ALWAYS absent on the wire (stripped by `trimMirrorSpawner`). Absent ⇒ re-seed, which
   * is exactly the client/legacy-save case.
   */
  readonly nextSpawnTick?: number;
  readonly lastValidatedTick?: number;
  readonly spawnedCount?: number;
  readonly ignitedAtTick?: number;
}

/**
 * S103 P2 — full defender wire/save shape. Unlike the trimmed creature, EVERY field rides the
 * wire (the client renders the strike + windup off the synced FSM + nextFireTick + targetCreatureId
 * + lastStrikePos — Council MF1/MF6). `lastStrikePos` / `targetCreatureId` are emitted only when
 * non-null (additive-optional). Re-phased on load via loadRephaseDefenders (Council MF5).
 */
interface SerializedDefender {
  readonly id: DefenderId;
  readonly kind: DefenderKind;
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  readonly pos: Vec2;
  readonly state: DefenderState;
  readonly ticksInState: number;
  readonly hp: number;
  readonly nextFireTick: number;
  /** S141 P1 — Stink Tower ammo. Additive-optional: absent ⇒ 0, so no other kind pays a byte. */
  readonly bagsRemaining?: number;
  readonly targetCreatureId?: CreatureId;
  readonly lastStrikePos?: Vec2;
  // S110 P4 (Batch B) — HELGA walk locomotion. Both additive-optional: prevPos is emitted only while
  // MOVING (≠ pos) so a stationary turret / idle-home HELGA stays byte-identical; walkTargetPos only
  // while pursuing. A mid-walk host save/load resumes with the right velocity + facing (replay-safe).
  readonly prevPos?: Vec2;
  readonly walkTargetPos?: Vec2;
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
 * S72 P2 / S135 P0 — hunter wire shape. The client renderer derives the wedge facing +
 * chomp from (state, ticksInState, targetPlayerId) and the target's avatarPos, so on the
 * client-render path prevPos USED TO be snapped to pos; since S135 P0 it travels and is restored
 * on every path (the `?? pos` fallback fires only for a pre-S135 sender).
 * spawnedAtTick / despawnAtTick / prevPos NOW RIDE (additive-optional, no schemaVersion
 * bump). They are HOST-AUTHORITATIVE, not render fields: restore() (workerSim INIT + host
 * save/load) and applyNetSnapshot() (promoted successor) both rehydrate through
 * deserializeHunter, where hardcoding despawnAtTick=0 made hunterLifecycle.ts SEEKING
 * escape gate (world.tick >= despawnAtTick) unconditionally true and a live hunter
 * abandoned its chase on the first post-rehydrate tick. prevPos travels so momentum survives.
 */
interface SerializedHunter {
  readonly id: HunterId;
  readonly pos: Vec2;
  readonly state: HunterState;
  readonly ticksInState: number;
  readonly targetPlayerId: PlayerId;
  readonly spawnedAtTick?: number;
  readonly despawnAtTick?: number;
  readonly prevPos?: Vec2;
}

/**
 * V6-1.1 — gatherer wire shape. FULL FIDELITY on purpose (every field the entity carries
 * travels), which is the S134/S135 lesson applied at add-time rather than retrofitted: this
 * family is rehydrated by BOTH host-authoritative consumers (restore → workerSim INIT + host
 * save/load; applyNetSnapshot → promoted successor), so a field omitted here is a field the
 * successor invents. The cosmetic shapeshift is deliberately ABSENT — it is renderer-only, a
 * pure fn of (tick, gathererId), so it carries no wire cost and cannot desync.
 * Additive-optional → no schemaVersion bump (PROTOCOL_VERSION 15→16 covers the peer gate).
 */
interface SerializedGatherer {
  readonly id: GathererId;
  readonly ownerPlayerId: PlayerId;
  readonly pos: Vec2;
  readonly spawnedAtTick: number;
  /**
   * V6-1.2 — the haul cycle rides the wire in full. A successor that inherited a gatherer without
   * its FSM state would drop the cargo it is holding (the spark stays escrowed forever = a leaked,
   * un-reapable, un-grabbable shape) and re-seek from scratch. Additive-optional: a pre-V6-1.2
   * gatherer rehydrates as an idle SEEKER, which is the correct degradation.
   */
  readonly state?: GathererState;
  readonly targetSparkId?: SparkId | null;
  readonly carriedSparkId?: SparkId | null;
  readonly speedLevel?: number;
  readonly preferredType?: SparkType | null;
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
    // S147 P1 — the match clock rides the snapshot (host-authoritative deadline).
    matchPhase: world.matchPhase,
    phaseEndsAtTick: world.phaseEndsAtTick,
    // S148 P1 — the board rides the snapshot. A joiner must NEVER derive it from its own view of
    // the roster: it would compute a different board for one tick during a join and place every
    // keep somewhere else.
    layout: world.layout,
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
    // V6-1.1 — emit gatherers only when present so pre-V6 saves stay byte-identical.
    gatherers: world.gatherers.size > 0
      ? [...world.gatherers.values()].map(serializeGatherer)
      : undefined,
    // S136 P1 (V6-1.3) — the castle banks (omitted entirely when every bank is empty).
    castleBanks: serializeCastleBanks(world),
    gathererOrders: serializeGathererOrders(world),
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
    // S97 P5 — emit the per-type godly guard only when non-empty (sorted ⇒ byte-stable, like discoveredCombos).
    godlyFiredThisMatch:
      world.godlyFiredThisMatch.size > 0 ? [...world.godlyFiredThisMatch].sort() : undefined,
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
    // S100 P1 (TD Phase 1a) — emit creature spawners only when present (byte-identical
    // pre-S100 + when no spawner is live). Tiny identity-only shape; cadence stays host-only.
    creatureSpawners: world.creatureSpawners.size > 0
      ? [...world.creatureSpawners.values()].map(serializeSpawner)
      : undefined,
    // S103 P2 — emit defenders only when present (byte-identical when none live). Sorted by id
    // (deterministic serialization — Council MF6); full shape (every field is render-relevant + synced).
    defenders: world.defenders.size > 0
      ? [...world.defenders.values()]
          .sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number))
          .map(serializeDefender)
      : undefined,
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
  // S100 P1 (TD Phase 1a) — strip the HOST-SAVE-ONLY persistent chewer fields from the
  // wire (TOWER_DEFENSE_DESIGN.md §3.3/§3.5 R1+R3).
  // ⚠ AMENDED S134 — the stripped set is now `targetCreatureId` ONLY. `hp`/`chewProgress`/
  // `targetBondId` were un-stripped in S133 (damage reverted on every handoff);
  // `despawnAtTick`/`sourceSpawnerId` in S134 (the successor deleted its entire creature
  // population and mass-detonated its drones) — see the trimMirrorCreature docblock.
  // here we re-map `creatures` to drop them so a swarm doesn't balloon the 10 Hz full-world
  // payload, and the client (which never simulates) rehydrates them neutral (null/0). When
  // no chewer is live this re-map is a no-op (Voltkin emits none of those keys anyway), so
  // the Voltkin wire shape stays byte-identical. `creatureSpawners` IS kept on the wire
  // (clients render the live spawn-zone) — but as of S142 P1 its host-local cadence is no
  // longer absent BY OMISSION, so it must be stripped HERE, explicitly.
  if (rest.creatures !== undefined) {
    rest.creatures = rest.creatures.map(trimMirrorCreature);
  }
  // ⛔ S142 P1 — LOAD-BEARING ANTI-CHEAT STRIP, NOT A SIZE OPTIMISATION.
  // `serializeSpawner` now emits nextSpawnTick/lastValidatedTick/spawnedCount/ignitedAtTick
  // so the LOCAL consumers (disk save, sim-worker INIT) can round-trip an authority handoff
  // losslessly. Those four fields ARE the upcoming spawn schedule, and shipping them would
  // hand a modified client perfect knowledge of when the next chewer arrives — the exact
  // thing the rngSeed-exclusion precedent forbids (TOWER_DEFENSE_DESIGN.md §3.3).
  // Deleting this line re-introduces that leak with tsc and the bundle gate both GREEN.
  if (rest.creatureSpawners !== undefined) {
    rest.creatureSpawners = rest.creatureSpawners.map(trimMirrorSpawner);
  }
  return rest;
}

/**
 * ⚠ AMENDED S133 P1 — `hp`, `chewProgress` and `targetBondId` are NO LONGER STRIPPED.
 *
 * THE BUG THIS FIXES. A client builds its world from `applyNetSnapshot`. When a client is
 * promoted on host migration it becomes AUTHORITATIVE from that world. Because this
 * function stripped `hp` and `chewProgress`, and `deserializeCreature` rehydrates
 * `hp: s.hp ?? getCreatureConfig(s.type).hp`, the successor took over with **every
 * damaged creature healed to full and every chew reset to zero** — i.e. BOTH of the
 * game's damage models silently reverted on every host handoff. (`CONNECTOR_HP` is not a
 * field: it IS `chewProgress`, so chew progress is the bond's HP.) Meanwhile
 * `defender.hp` is non-optional on the wire and DID survive, so the two hp fields had
 * opposite migration behaviour.
 *
 * WHY `targetBondId` COMES ALONG. It is not decoration: this docblock's own words are
 * that `chewProgress` is "the in-flight chew accumulator **vs the committed bond**".
 * Shipping progress while dropping the bond it is progress AGAINST would hand the
 * successor 4-of-5 chews with no target, to be re-aimed at whatever it re-acquires —
 * strictly worse than resetting. The damage-coherent set is the triple, or nothing.
 *
 * COST. These fields exist only on live chewers (a Voltkin emits none of them), and only
 * `hp` when actually damaged — `serializeCreature` omits it at full health. So the 10 Hz
 * balloon this trim was built to prevent is bounded by live-chewer count, not swarm size.
 * No `PROTOCOL_VERSION` bump: all three are already ADDITIVE-OPTIONAL on
 * `SerializedCreature`, `deserializeCreature` already defaults them, and
 * `parseNetMessage` gates on `schemaVersion` only — never on extra keys.
 *
 * ✅ AMENDED S134 P1 — `despawnAtTick` AND `sourceSpawnerId` ARE NO LONGER STRIPPED EITHER.
 * `targetCreatureId` is now the ONLY field this function removes.
 *
 * ⛔ THE S133 TEXT THAT USED TO LIVE HERE WAS WRONG, AND ITS WRONGNESS IS THE REASON THIS
 * BUG SURVIVED AN EXTRA SESSION. It said the lifetime fix "changes the SERIALIZER's emit
 * condition", i.e. not here. That is at most half the fix, and the half that does NOT
 * reach the wire: `netSnapshot()` post-trims every already-serialized creature through
 * THIS function, so an emit-only change leaves the wire byte-for-byte unchanged and host
 * migration completely untouched. Two sibling docblocks (at `serializeCreature` and
 * `deserializeCreature`) repeated the same claim; all three are corrected.
 * The tell that this was never caught: `save.migrationDamage.test.ts` asserts through
 * `netSnapshot`, so an emit-only "fix" would have left the suite fully GREEN.
 *
 * THE BUG, and it is NOT only a migration bug. `deserializeCreature` rehydrates
 * `despawnAtTick ?? 0`, and 0 is a DETONATION default, not a neutral one:
 *   - `creatureLifecycle.ts` deletes any `!config.persistent` creature once
 *     `world.tick >= creature.despawnAtTick`. ALL THREE `CREATURE_CONFIGS` are
 *     `persistent: false` (Voltkin, chewer since S104 P1, lightning drone), so a promoted
 *     successor deleted its ENTIRE creature population on the first creature tick.
 *   - worse and earlier: `hostTick.ts` Step 1.5 fires DRONE_EXPLODE when
 *     `world.tick >= despawnAtTick - 1` — with 0 that is `>= -1`, unconditionally true —
 *     BEFORE the lifetime gate. Every inherited drone detonated, each severing up to
 *     DRONE_MAX_CONNECTORS enemy bonds, up to DRONE_MAX_GLOBAL drones.
 * `SPARK_Blueprint.md` §XV.6 recorded this first, as a live hazard in three paths.
 *
 * ⚠ THE THIRD PATH IS LIVE WITHOUT ANY MIGRATION, which is what made this urgent rather
 * than theoretical. `main.ts` hands `snapshot(world)` to `workerSim.restore()` and then
 * sets `isHost = true`, so under `?worker=1` a Voltkin's lifetime was destroyed on the
 * ORIGINAL host — no peer, no disconnect, no worker failure. MEASURED pre-fix: the host's
 * Voltkin at 1700 rehydrated to 0 while the chewer's 3600 survived, because the emit was
 * coupled to `sourceSpawnerId !== null` and `creature.ts` hardcodes null for a Voltkin.
 *
 * WHY `sourceSpawnerId` SHIPPED IN THE SAME COMMIT. Fixing lifetimes alone would have
 * traded one loud bug for two silent ones, because the deletion was MASKING them:
 * `applySpawnCreature` treats any null-spawner creature as its owner's Voltkin population
 * (so a rehydrated chewer blocked that owner's summon), and the perSpawner terms in
 * `underChewerCaps` / `underDroneCaps` compare against a real SpawnerId, so a rehydrated
 * null silently disabled CHEWER_MAX_PER_SPAWNER and DRONE_MAX_PER_SPAWNER, degrading both
 * to the global cap. Decisively: those defects are UNOBSERVABLE while creatures are being
 * deleted, so a split would have shipped a regression that could not be tested until the
 * second half landed.
 *
 * ⚠ STILL STRIPPED, AND CORRECTLY SO: `targetCreatureId` — the opportunistic zap target,
 * re-acquired every IDLE tick by the host AI, which a client never runs.
 * ⚠ STILL NOT TRAVELLING AT ALL (no serializer surface, logged not fixed):
 * `prevPos`, `targetPos`, `spawnedAtTick`. So this fix does NOT make the successor's world
 * equal the predecessor's — do not attach a round-trip-fidelity claim to it, and do not
 * write a host-vs-successor `hashWorldStateFull` equality test expecting it to pass.
 *
 * S100 P1 (TD Phase 1a) — produce the render-trimmed wire shape of a serialized creature.
 * A creature with no live zap target returns unchanged (no allocation).
 */
function trimMirrorCreature(c: SerializedCreature): SerializedCreature {
  // ⚠ The guard tests ONLY `targetCreatureId` — the single remaining stripped field.
  // Do not re-add `despawnAtTick` here: since S134 `serializeCreature` emits it
  // unconditionally, so `c.despawnAtTick === undefined` is unreachable and an
  // AND-guard containing it would never early-return, silently making this a
  // destructure-and-reallocate on every creature every snapshot.
  if (c.targetCreatureId === undefined) {
    return c; // already in wire shape — no allocation
  }
  const {
    targetCreatureId: _tc, // S103 #8 — strip the opportunistic creature target from the wire
    ...wire
  } = c;
  void _tc;
  return wire;
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
  // S147 P1 — the match clock. Rehydrated UNCONDITIONALLY so a joiner and a promoted successor adopt
  // the host's phase and deadline exactly. The `??` fallbacks cover a pre-S147 save only: BUILD plus
  // a deadline one full phase out from the restored tick, i.e. a clean fresh build stage rather than
  // an instant flip. Note it must be `snap.tick`-relative, not 0-relative, or an old save restored at
  // tick 900k would flip phase on its very first tick.
  world.matchPhase = snap.matchPhase ?? 'BUILD';
  world.phaseEndsAtTick = snap.phaseEndsAtTick ?? snap.tick + PHASE_DURATION_TICKS;
  // S148 P1 — the board, rehydrated UNCONDITIONALLY so a joiner and a promoted successor adopt the
  // host's board exactly. See the `layout` field docblock for why the pre-S148 fallback is PITCH_2P.
  world.layout = snap.layout ?? 'PITCH_2P';
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

  // V6-1.1 — gatherers: clear + rehydrate (mirror of the hunter/bomb/creature pattern). Reset the
  // mint counter past the max loaded id so a host save/load (or a promoted successor) never mints a
  // colliding id on the next BUY_GATHERER. Client never mints (no-op there).
  world.gatherers.clear();
  world.nextGathererId = 0;
  if (snap.gatherers !== undefined) {
    let maxGathererId = -1;
    for (const g of snap.gatherers) {
      world.gatherers.set(g.id, deserializeGatherer(g));
      if ((g.id as number) > maxGathererId) maxGathererId = g.id as number;
    }
    if (maxGathererId >= 0) world.nextGathererId = maxGathererId + 1;
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
  world.godlyFiredThisMatch = new Set((snap.godlyFiredThisMatch ?? []) as GodlyId[]); // S97 P5

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

  // S100 P1 (TD Phase 1a) — creature spawners: clear + rehydrate (mirror of the
  // hunter/seagull pattern). Reset the mint counter past the max loaded id so a host
  // save/load with a live spawner does not mint a colliding SpawnerId on the next
  // REGISTER_SPAWNER (save.ts:690 nextCreatureId precedent). The nullish guard keeps an
  // old/pre-S100 save (no `creatureSpawners` field) loading as an empty map → no
  // TypeError (R18). deserializeSpawner re-seeds the host-only cadence from world.tick,
  // which applySnapshotCore set above (so the post-load first-emit / first-revalidate
  // are one interval out — deterministic across peers; the next NetSnapshot re-syncs).
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
  if (snap.creatureSpawners !== undefined) {
    let maxSpawnerId = -1;
    for (const s of snap.creatureSpawners) {
      world.creatureSpawners.set(s.id, deserializeSpawner(s, world.tick));
      if ((s.id as number) > maxSpawnerId) maxSpawnerId = s.id as number;
    }
    if (maxSpawnerId >= 0) world.nextSpawnerId = maxSpawnerId + 1;
  }

  // S103 P2 — defenders: clear + rehydrate (mirror of the spawner block). Advance the mint
  // counter past the max loaded id (no colliding DefenderId on the next REGISTER_DEFENDER). The
  // nullish guard keeps a pre-S103 save loading as an empty map. AFTER loading, re-phase every
  // defender's nextFireTick relative to the loaded world.tick (Council MF5) so a host save/load
  // doesn't make every defender insta-fire on the first post-load tick (the despawnAtTick=0 bug class).
  world.defenders.clear();
  world.nextDefenderId = 0;
  if (snap.defenders !== undefined) {
    let maxDefenderId = -1;
    for (const d of snap.defenders) {
      world.defenders.set(d.id, deserializeDefender(d));
      if ((d.id as number) > maxDefenderId) maxDefenderId = d.id as number;
    }
    if (maxDefenderId >= 0) world.nextDefenderId = maxDefenderId + 1;
    loadRephaseDefenders(world);
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
    const spark = deserializeSpark(s);
    world.freeSparks.set(spark.id, spark);
  }

  // S136 P1 (V6-1.3) — castle banks: clear + rehydrate. Banked shapes are NOT in freeSparks, so this
  // is the only path that restores them; a missing field means "no banks" (a pre-S136 save), never
  // "leave whatever was there" — otherwise a promoted successor inherits stale banks.
  world.castleBanks.clear();
  world.gathererOrders.clear(); // S141 P2 — the order queues tear down with the gatherer economy
  if (snap.castleBanks !== undefined) {
    for (const entry of snap.castleBanks) {
      // ⭐ S146 P2 — ACCEPT BOTH SHAPES. `counts` is the current tally. `shapes` is the pre-S146
      // entity list, which still arrives from a v21 disk save; it is TALLIED rather than rejected so
      // an old save keeps the player's stored shapes instead of silently loading an empty castle.
      // (Cross-VERSION peers cannot mix — protocol.ts hard-rejects a PROTOCOL_VERSION mismatch at
      // HELLO — so this branch is a disk-compat path only, never a live-wire one.)
      const legacy = (entry as { shapes?: SerializedSpark[] }).shapes;
      if (entry.counts !== undefined) {
        const bank = makeCastleBank();
        for (let i = 0; i < bank.length; i++) bank[i] = entry.counts[i] ?? 0;
        world.castleBanks.set(entry.seat, bank);
      } else if (legacy !== undefined) {
        const bank = makeCastleBank();
        for (const ss of legacy) bank[ss.type as number] = (bank[ss.type as number] ?? 0) + 1;
        world.castleBanks.set(entry.seat, bank);
      }
    }
  }
  // S141 P2 — same contract as the banks above: the clear() already ran, so a MISSING field means
  // "no queues" (a pre-S141 save), never "leave whatever was there".
  if (snap.gathererOrders !== undefined) {
    for (const entry of snap.gathererOrders) {
      if (entry.types.length > 0) world.gathererOrders.set(entry.seat, [...entry.types]);
    }
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
      // S138 P1 — the coalesce covers BOTH the emit-only-when-damaged case and every pre-S138
      // save/snapshot, which carry no `hp` at all: absent means undamaged. Mirrors the
      // `s.hp ?? getCreatureConfig(s.type).hp` restore used for creatures.
      hp: p.hp ?? PRIMITIVE_MAX_HP,
      // S152 — absent means "hand-placed", which is also exactly right for every pre-S152 save:
      // those boards predate provenance, so their towers restore as freeform and FIX refuses them
      // rather than guessing a bill. Copied, not aliased, for the same reason the writer copies.
      origin:
        p.origin !== undefined
          ? { blueprintId: p.origin.blueprintId, nodeIndex: p.origin.nodeIndex }
          : null,
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

/**
 * S136 P1 — the inverse of `serializeSpark`, extracted from the inline `freeSparks` loop so the
 * castle-bank round-trip cannot drift from the free-spark one. Any field added to SerializedSpark
 * now has exactly ONE place to be rehydrated, serving both consumers.
 */
function deserializeSpark(s: SerializedSpark): Spark {
  return {
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
    escrow: s.escrow, // V6-1.2 — gatherer haul/bank escrow
  };
}

/**
 * S136 P1 — emit only non-empty banks; undefined when no seat holds anything, so a pre-S136 world
 * round-trips byte-identically.
 */
function serializeCastleBanks(
  world: World,
): Array<{ seat: PlayerId; counts: number[] }> | undefined {
  const out: Array<{ seat: PlayerId; counts: number[] }> = [];
  for (const [seat, bank] of world.castleBanks) {
    let total = 0;
    for (const nn of bank) total += nn;
    if (total === 0) continue;
    out.push({ seat, counts: [...bank] });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * S141 P2 — emit only non-empty queues; undefined when no seat has one, so a pre-S141 world
 * round-trips byte-identically. Order within a queue is significant and preserved as-is.
 */
function serializeGathererOrders(
  world: World,
): Array<{ seat: PlayerId; types: SparkType[] }> | undefined {
  const out: Array<{ seat: PlayerId; types: SparkType[] }> = [];
  for (const [seat, q] of world.gathererOrders) {
    if (q.length === 0) continue;
    out.push({ seat, types: [...q] }); // copy — never alias live world state into a snapshot
  }
  return out.length > 0 ? out : undefined;
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
    // V6-1.2 — escrow MUST round-trip: a successor that loses it would reap a hauled shape at the
    // 10 s TTL and rim-snap a banked stockpile back into the spawn disc.
    escrow: s.escrow,
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
    // S138 P1 — emit ONLY when damaged (the serializeCreature trick at the c.hp site below), so an
    // undamaged board is byte-identical to the pre-S138 wire.
    ...(p.hp < PRIMITIVE_MAX_HP ? { hp: p.hp } : {}),
    // S152 — emit ONLY for a blueprint-stamped shape (the same emit-when-interesting trick as `hp`
    // just above). A fresh object, not the live reference: a shared reference would let a mutation
    // of the serialized snapshot reach back into the world.
    ...(p.origin !== null
      ? { origin: { blueprintId: p.origin.blueprintId, nodeIndex: p.origin.nodeIndex } }
      : {}),
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
 * client renderer needs (id/type/pos/state/ticksInState).
 * ⚠ CORRECTED S134 — the old sentence here said the AI + lifecycle fields
 * "(targetBondId, targetPos, prevPos, spawnedAtTick, despawnAtTick) stay omitted — host
 * runs FSM, client only renders". That is no longer true and its survival mattered: it sat
 * 44 lines above the emit it described and helped a real bug live an extra session.
 * `targetBondId` (S133) and `despawnAtTick` (S134) ARE emitted; `despawnAtTick`
 * unconditionally, because a promoted client DOES run the FSM. Only `targetPos`, `prevPos`
 * and `spawnedAtTick` are genuinely omitted — they have no `SerializedCreature` field.
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
    // ⛔ S134 P1 — `despawnAtTick` IS NOW EMITTED UNCONDITIONALLY, and it is deliberately
    // NOT part of the `sourceSpawnerId` spread any more. Read this before "simplifying"
    // the two back together.
    //
    // Until S134 the two shared one spread gated on `sourceSpawnerId !== null`, so a
    // Voltkin (`creature.ts` hardcodes null) emitted NEITHER. That coupling is a live bug
    // on THREE consumers, only one of which is host migration:
    //   1. main.ts `snapshot()` → workerSim `restore()` + `isHost = true` — under
    //      `?worker=1` a Voltkin's lifetime is destroyed on the ORIGINAL host, no peer and
    //      no disconnect involved. MEASURED pre-fix: host 1700 → rehydrated 0.
    //   2. host migration — the promoted client runs the lifetime gate with 0.
    //   3. the worker-failure direct-resume repair, which rebuilds allocators only.
    // And 0 is not a neutral default, it is a DETONATION default: `creatureLifecycle.ts`
    // deletes on `world.tick >= despawnAtTick`, and `hostTick.ts` Step 1.5 fires
    // DRONE_EXPLODE on `world.tick >= despawnAtTick - 1` — i.e. `>= -1` — BEFORE the
    // lifetime gate, severing up to DRONE_MAX_CONNECTORS enemy bonds per drone.
    //
    // ⚠ Emitting here is only HALF the fix and does nothing for the wire on its own —
    // `netSnapshot()` post-trims through `trimMirrorCreature`, which used to strip the
    // field straight back off. Three docblocks in this file (including the two previously
    // at this site and at `deserializeCreature`) claimed the emit condition WAS the fix.
    // They were wrong, and that error is what scoped this out of S133. See the
    // `trimMirrorCreature` header for the other half.
    despawnAtTick: c.despawnAtTick,
    // S100 P1 (TD Phase 1a) — provenance, still CONDITIONAL on purpose. A Voltkin's null
    // is exactly what `deserializeCreature` rehydrates via `?? null`, so emitting it would
    // be zero-information bytes on every snapshot forever and would break the pre-S100
    // Voltkin byte-identity property this file is built around. Unlike `despawnAtTick`,
    // absence here is genuinely neutral.
    ...(c.sourceSpawnerId !== null ? { sourceSpawnerId: c.sourceSpawnerId } : {}),
    ...(c.chewProgress > 0 ? { chewProgress: c.chewProgress } : {}),
    ...(c.targetBondId !== null ? { targetBondId: c.targetBondId } : {}),
    // S103 #8 — host-save-only; emit only when a Voltkin is mid-zap (non-null) so an idle/
    // no-creature world stays byte-identical to a pre-S103 save. Stripped from the wire.
    ...(c.targetCreatureId !== null ? { targetCreatureId: c.targetCreatureId } : {}),
    ...(c.targetPrimitiveId !== null ? { targetPrimitiveId: c.targetPrimitiveId } : {}),
    // S102 — emit hp ONLY when damaged (below the per-type config default) so an undamaged
    // creature stays byte-identical to a pre-S102 save (every creature until P3 combat).
    ...(c.hp < getCreatureConfig(c.type).hp ? { hp: c.hp } : {}),
    // ⛔ S142 P1 — the poop slow now round-trips (see the SerializedCreature field docblock).
    // Conditional, so an un-poopy creature — i.e. nearly every creature, nearly always —
    // stays byte-identical to every prior save.
    ...(c.poopyUntilTick !== undefined ? { poopyUntilTick: c.poopyUntilTick } : {}),
  };
}

/**
 * S100 P1 (TD Phase 1a) — spawner round-trip.
 * S142 P1 — now carries the host-local cadence too (see SerializedSpawner). The wire copy
 * is trimmed back to the identity shape by `trimMirrorSpawner` inside `netSnapshot()`.
 */
function serializeSpawner(sp: CreatureSpawner): SerializedSpawner {
  return {
    id: sp.id,
    ownerPlayerId: sp.ownerPlayerId,
    anchorPrimitiveId: sp.anchorPrimitiveId,
    recipeId: sp.recipeId,
    nextSpawnTick: sp.nextSpawnTick,
    lastValidatedTick: sp.lastValidatedTick,
    spawnedCount: sp.spawnedCount,
    ignitedAtTick: sp.ignitedAtTick,
  };
}

/**
 * S142 P1 — the wire trim, mirroring `trimMirrorCreature`. Drops the four host-local
 * cadence fields so the upcoming spawn schedule never reaches a modified client
 * (TOWER_DEFENSE_DESIGN.md §3.3, rngSeed-exclusion precedent). The result is EXACTLY the
 * pre-S142 identity shape, so the wire stays byte-identical and a client rehydrates via
 * the same re-seed path it always used.
 */
function trimMirrorSpawner(s: SerializedSpawner): SerializedSpawner {
  return {
    id: s.id,
    ownerPlayerId: s.ownerPlayerId,
    anchorPrimitiveId: s.anchorPrimitiveId,
    recipeId: s.recipeId,
  };
}

/**
 * S100 P1 (TD Phase 1a) — rehydrate a SerializedSpawner.
 *
 * S142 P1 — cadence is applied VERBATIM when present (disk save + worker INIT). It is
 * absent only on the wire, where `trimMirrorSpawner` removed it, and in pre-S142 saves —
 * and for both of those the historical re-seed is exactly right: the first chewer emits
 * one full SPAWN_INTERVAL after the load (the register-reducer seeding rule) and the first
 * re-validation runs one throttle window later.
 *
 * ⚠ Do NOT "simplify" this to an unconditional re-seed. That is the S142 P1 defect: it
 * silently reset `spawnedCount` — a live self-destruct cap, not telemetry — every time a
 * migration-promoted host adopted the sim worker mid-match.
 */
function deserializeSpawner(s: SerializedSpawner, tick: number): CreatureSpawner {
  const sp = makeSpawner({
    id: s.id,
    ownerPlayerId: s.ownerPlayerId,
    anchorPrimitiveId: s.anchorPrimitiveId,
    recipeId: s.recipeId,
    ignitedAtTick: s.ignitedAtTick ?? tick,
    nextSpawnTick: s.nextSpawnTick ?? tick + SPAWN_INTERVAL_TICKS,
  });
  // `makeSpawner` seeds these two from ignitedAtTick / 0 (the fresh-ignition contract).
  // Restore them when the payload carried them, so an authority handoff is lossless.
  if (s.lastValidatedTick !== undefined) sp.lastValidatedTick = s.lastValidatedTick;
  if (s.spawnedCount !== undefined) sp.spawnedCount = s.spawnedCount;
  return sp;
}

/**
 * S103 P2 — full defender round-trip. Unlike the spawner (whose cadence is host-only + re-seeded),
 * a defender's FSM is fully synced (the client renders off it), so EVERY field round-trips exactly.
 * targetCreatureId / lastStrikePos emit only when non-null (additive-optional). nextFireTick is
 * re-phased AFTER the load by loadRephaseDefenders (Council MF5) — emitted verbatim here.
 */
function serializeDefender(d: Defender): SerializedDefender {
  return {
    id: d.id,
    kind: d.kind,
    ownerPlayerId: d.ownerPlayerId,
    anchorPrimitiveId: d.anchorPrimitiveId,
    recipeId: d.recipeId,
    pos: { x: d.pos.x, y: d.pos.y },
    state: d.state,
    ticksInState: d.ticksInState,
    hp: d.hp,
    nextFireTick: d.nextFireTick,
    // S141 P1 — STINK TOWER AMMO. Additive-optional: emitted only when NON-ZERO, so every turret and
    // HELGA on the wire stays byte-identical to pre-S141 (they carry 0 and always will). Only a kind
    // with a magazine pays a byte.
    ...(d.bagsRemaining !== 0 ? { bagsRemaining: d.bagsRemaining } : {}),
    ...(d.targetCreatureId !== null ? { targetCreatureId: d.targetCreatureId } : {}),
    ...(d.lastStrikePos !== null ? { lastStrikePos: { x: d.lastStrikePos.x, y: d.lastStrikePos.y } } : {}),
    // S110 P4 — emit prevPos only while moving (≠ pos) so a stationary defender stays byte-identical.
    ...(d.prevPos.x !== d.pos.x || d.prevPos.y !== d.pos.y
      ? { prevPos: { x: d.prevPos.x, y: d.prevPos.y } } : {}),
    ...(d.walkTargetPos !== null ? { walkTargetPos: { x: d.walkTargetPos.x, y: d.walkTargetPos.y } } : {}),
  };
}

/** S103 P2 — rehydrate a SerializedDefender, preserving the full mid-cycle FSM state (a defender
 *  mid-windup resumes there). makeDefender seeds the immutable identity; the FSM fields are then
 *  overwritten from the saved values (makeDefender would reset to IDLE).
 *
 *  ⛔ THERE IS NO SPREAD HERE AND THAT MAKES OMISSIONS SILENT. `makeDefender` returns a COMPLETE
 *  Defender, so forgetting an assignment below leaves the FACTORY DEFAULT in place and `tsc` sees
 *  nothing wrong — the object is fully typed either way. That is the `despawnAtTick = 0` /
 *  `hp`-healed bug class that cost S133 and S134 a session each. For `bagsRemaining` specifically
 *  the factory default is a FULL magazine, so a missing assignment would mean every Stink Tower
 *  silently RELOADS on save/load, on host migration and on every `?worker=1` restore — a tower you
 *  starved would come back armed. Guarded by an explicit round-trip test rather than by hope. */
function deserializeDefender(s: SerializedDefender): Defender {
  const d = makeDefender({
    id: s.id,
    kind: s.kind,
    ownerPlayerId: s.ownerPlayerId,
    anchorPrimitiveId: s.anchorPrimitiveId,
    recipeId: s.recipeId,
    pos: s.pos,
    registeredAtTick: 0,
  });
  d.state = s.state;
  d.ticksInState = s.ticksInState;
  d.hp = s.hp;
  d.nextFireTick = s.nextFireTick;
  // S141 P1 — absent means ZERO (the additive-optional emit skips 0), NOT the factory's full
  // magazine. `?? 0` rather than `?? config.bags` is the whole point: a spent tower must stay spent.
  d.bagsRemaining = s.bagsRemaining ?? 0;
  d.targetCreatureId = s.targetCreatureId ?? null;
  d.lastStrikePos = s.lastStrikePos !== undefined ? { x: s.lastStrikePos.x, y: s.lastStrikePos.y } : null;
  // S110 P4 — prevPos defaults to pos (at rest) when omitted; walkTargetPos defaults to null.
  d.prevPos = s.prevPos !== undefined ? { x: s.prevPos.x, y: s.prevPos.y } : { x: s.pos.x, y: s.pos.y };
  d.walkTargetPos = s.walkTargetPos !== undefined ? { x: s.walkTargetPos.x, y: s.walkTargetPos.y } : null;
  return d;
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
        // V6-0.3 (S131) — pass-through; `undefined` for 'physics'/'godly' and for any
        // pre-S131 effect. JSON.stringify drops undefined properties, so the wire stays
        // byte-identical to pre-S131 for unattributed severs (creatureId precedent above).
        actor: e.actor,
        victim: e.victim,
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
    // S100 P1 — CHEW_BITE joins this host-local-only club (TOWER_DEFENSE_DESIGN.md
    // §5.2): zero wire/protocol surface, the chewer's per-bite VFX is host-side cosmetic.
    case 'BOND_COMMIT':
    case 'SEVER_ERASE':
    case 'STRUCTURE_GROW':
    case 'STRUCTURE_MERGE':
    case 'SCORE_TIER':
    case 'CHEW_BITE':
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
        // V6-0.3 (S131) — pass-through. Pre-S131 payloads carry neither field; the
        // rehydrated GameEffect then omits both and the sever-toast reducer degrades to
        // its actor-less copy rather than naming a wrong seat.
        actor: s.actor,
        victim: s.victim,
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
 * S28 P0 — rehydrate a SerializedCreature. On the WIRE (client mirror) the sim-only
 * fields (prevPos, targetPos, spawnedAtTick) are reconstructed with neutral defaults:
 * prevPos snaps to pos (zero implicit velocity — client never integrates anyway),
 * targetPos snaps to pos (no AI), spawnedAtTick=0.
 * ⛔ CORRECTED S134 — this list used to include `targetBondId` and `despawnAtTick` and
 * called `despawnAtTick=0` a neutral default the "renderer ignores — host owns the despawn
 * dispatch". BOTH CLAIMS WERE FALSE and this exact sentence is why the bug survived S133:
 * a promoted client BECOMES the host and runs the despawn dispatch itself, and 0 is a
 * DETONATION value there, not a neutral one (it makes the lifetime gate and the drone fuse
 * unconditionally true). `targetBondId` has ridden the wire since S133 and `despawnAtTick`
 * since S134; their coalesces below are stale-peer back-compat, not the normal path.
 * S58 (#3) — `ownerPlayerId` now rehydrates from the wire (was hardcoded 0);
 * the client fog mask reveals around OWN creatures. Pre-S58 NetSnapshots omit
 * the field → nullish-coalesce to 0 (old data stays valid).
 * S100 P1 (TD Phase 1a) — on the HOST SAVE path `snapshot()` ROUND-TRIPS despawnAtTick /
 * targetBondId / sourceSpawnerId / chewProgress for a persistent mid-chew chewer (R3).
 * ⚠ AMENDED S134 — the wire now strips only targetCreatureId; chewProgress, targetBondId,
 * despawnAtTick and sourceSpawnerId all arrive intact, so their nullish-coalescing
 * defaults below are no longer the normal path for a mirror. prevPos/targetPos/spawnedAtTick stay
 * host-derived/neutral as before (a chewer's pos-relative steering re-derives next tick).
 */
function deserializeCreature(s: SerializedCreature): Creature {
  return {
    id: s.id,
    type: s.type,
    ownerPlayerId: asPlayerId(s.ownerPlayerId ?? 0),
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: { x: s.pos.x, y: s.pos.y },
    targetPos: { x: s.pos.x, y: s.pos.y },
    state: s.state,
    ticksInState: s.ticksInState,
    // S36 P3 — additive-optional rehydrate. Pre-S36 saves + pre-S36
    // NetSnapshots omit the field; nullish-coalesce to 0 keeps old data
    // valid and rehydrates as "creature never landed an attack" (hurt
    // frame at DESPAWNING).
    killCount: s.killCount ?? 0,
    spawnedAtTick: 0,
    // ⛔ S134 P1 — `?? 0` IS RETAINED FOR STALE-PEER BACK-COMPAT ONLY, AND 0 IS A
    // DETONATION DEFAULT. Do not read this line as "0 is the safe neutral value".
    // Since S134 both `serializeCreature` and the wire carry `despawnAtTick` for EVERY
    // creature, so in an all-current-build session this coalesce is unreachable. It
    // survives for exactly one case: a predecessor still running a pre-S134 build (no
    // `PROTOCOL_VERSION` bump, so such a peer stays connected). When it DOES fire, 0
    // makes `creatureLifecycle.ts`'s `world.tick >= despawnAtTick` and `hostTick.ts`
    // Step 1.5's `world.tick >= despawnAtTick - 1` both unconditionally true — mass
    // delete plus mass drone detonation.
    // ⚠ The S133 text here claimed "the fix belongs in serializeCreature's emit condition,
    // not here". Both halves were wrong: the emit alone never reaches the wire (see the
    // `trimMirrorCreature` header), and there is no persisted user save this default is
    // protecting — the save/load seams in `main.ts` are DEV-only and the sole production
    // `restore()` consumer is the sim worker, fed in-process.
    despawnAtTick: s.despawnAtTick ?? 0,
    targetBondId: s.targetBondId ?? null,
    // S103 #8 — host save carries a mid-zap Voltkin's creature target; the wire strips it so a
    // client mirror (+ pre-S103 save) rehydrates null (the client never runs the AI).
    targetCreatureId: s.targetCreatureId ?? null,
    targetPrimitiveId: s.targetPrimitiveId ?? null,
    // ⚠ AMENDED S134 — the wire no longer strips this, so a mirror now rehydrates the
    // REAL parent spawner. `?? null` is correct for a genuine Voltkin (emitted only when
    // non-null, since absence here IS neutral) and for a pre-S134 peer. It is what
    // re-arms CHEWER_MAX_PER_SPAWNER / DRONE_MAX_PER_SPAWNER on a promoted host, and what
    // stops `applySpawnCreature` counting a rehydrated chewer as its owner's Voltkin.
    sourceSpawnerId: s.sourceSpawnerId ?? null,
    chewProgress: s.chewProgress ?? 0,
    // S102 — rehydrate hp from a host save of a damaged creature.
    // ⚠ CORRECTED S134 — the S133 text here still said "the wire strips it
    // (trimMirrorCreature)". Untrue since S133 itself un-stripped `hp`; it rides the wire.
    // The coalesce covers the emit-only-when-damaged case (`hp < config.hp`) and pre-S102
    // saves, defaulting to the per-type config hp (chewer 1 / Voltkin 2).
    hp: s.hp ?? getCreatureConfig(s.type).hp,
    // ⛔ S142 P1 — the poop slow survives the round-trip now. `undefined` is the genuinely
    // neutral value here (it means "not poopy"), unlike `despawnAtTick`'s 0 above, because
    // every reader gates on `!== undefined && tick < poopyUntilTick`.
    poopyUntilTick: s.poopyUntilTick,
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
 * S72 P2 / S135 P0 — hunter serialize. The client renderer needs only
 * id/pos/state/ticksInState/targetPlayerId, but spawnedAtTick / despawnAtTick / prevPos
 * are now emitted UNCONDITIONALLY: they are read by the host-authoritative rehydrate
 * (deserializeHunter, reached by restore() and applyNetSnapshot()), and emitting them is
 * what keeps a rehydrated SEEKING hunter chasing instead of escaping on its first tick.
 */
function serializeHunter(h: Hunter): SerializedHunter {
  return {
    id: h.id,
    pos: { x: h.pos.x, y: h.pos.y },
    state: h.state,
    ticksInState: h.ticksInState,
    targetPlayerId: h.targetPlayerId,
    spawnedAtTick: h.spawnedAtTick,
    despawnAtTick: h.despawnAtTick,
    prevPos: { x: h.prevPos.x, y: h.prevPos.y },
  };
}

/**
 * S72 P2 / S135 P0 — rehydrate a SerializedHunter. spawnedAtTick, despawnAtTick and prevPos
 * now travel and are restored from the wire; the ?? 0 / ?? pos fallbacks fire ONLY for a
 * pre-S135 save that predates the fix. For a hunter a rehydrated despawnAtTick of 0 is a
 * benign EARLY ESCAPE (SEEKING -> DESPAWNING, one hunter, no cascade), NOT the creature
 * "detonation default"; do not carry that framing here. The old claim "renderer ignores;
 * host owns the despawn" was FALSE and is deleted: restore() (workerSim INIT + host
 * save/load) and applyNetSnapshot() (promoted successor) are both host-authoritative
 * consumers that run applyHunterTick.
 */
/**
 * V6-1.1 — gatherer serialize/deserialize. FULL FIDELITY: every field round-trips, so a
 * successor's gatherer is byte-equal to the predecessor's and `hashWorldStateFull` equality holds.
 * No neutral-default rehydration anywhere in this pair — that is the whole S134/S135 lesson
 * (a `?? 0` on a tick field is a gate-tripping value, not a neutral one), so there is nothing here
 * to default. The cosmetic morph is NOT serialized: it is a pure fn of (tick, gathererId) at
 * render time.
 */
function serializeGatherer(g: Gatherer): SerializedGatherer {
  return {
    id: g.id,
    ownerPlayerId: g.ownerPlayerId,
    pos: { x: g.pos.x, y: g.pos.y },
    spawnedAtTick: g.spawnedAtTick,
    state: g.state,
    targetSparkId: g.targetSparkId,
    carriedSparkId: g.carriedSparkId,
    speedLevel: g.speedLevel,
    preferredType: g.preferredType,
  };
}

function deserializeGatherer(s: SerializedGatherer): Gatherer {
  return {
    id: s.id,
    ownerPlayerId: s.ownerPlayerId,
    pos: { x: s.pos.x, y: s.pos.y },
    spawnedAtTick: s.spawnedAtTick,
    state: s.state ?? 'SEEKING',
    targetSparkId: s.targetSparkId ?? null,
    carriedSparkId: s.carriedSparkId ?? null,
    speedLevel: s.speedLevel ?? 0,
    preferredType: s.preferredType ?? null,
  };
}

function deserializeHunter(s: SerializedHunter): Hunter {
  return {
    id: s.id,
    pos: { x: s.pos.x, y: s.pos.y },
    prevPos: s.prevPos !== undefined ? { x: s.prevPos.x, y: s.prevPos.y } : { x: s.pos.x, y: s.pos.y },
    state: s.state,
    ticksInState: s.ticksInState,
    targetPlayerId: s.targetPlayerId,
    spawnedAtTick: s.spawnedAtTick ?? 0,
    despawnAtTick: s.despawnAtTick ?? 0,
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

