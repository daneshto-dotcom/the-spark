/**
 * SPARK — WorldSnapshot serializer + localStorage save/load + NetSnapshot
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
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSparkId,
  asCreatureId,
  type BondId,
  type CreatureId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
  type Vec2,
} from '../types.ts';
import { type GameMode, type GameState, type World } from './world.ts';
import { type Player } from '../game/player.ts';
import type { Creature, CreatureState, CreatureType } from './creatures/creature.ts';

const STORAGE_KEY = 'spark.snapshot.v1';
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
  /** S15 P2 — active turn player. Optional for pre-S15 compat (defaults to 0). */
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
}

interface SerializedSpark {
  id: SparkId;
  type: SparkType;
  pos: Vec2;
  prevPos: Vec2;
  radius: number;
  createdTick: number;
  state: SparkState;
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
export type SerializedEffect =
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
      readonly cause: 'player' | 'physics' | 'godly' | 'creature';
    };

/**
 * S28 P0 — Voltkin Phase 2D Council Q4 2/3 B trimmed render-only shape (~36 B).
 * Client renderer derives scale/tint/alpha from (state, ticksInState) via the
 * pure helpers in creatureRenderer.ts — no AI fields (targetBondId, targetPos)
 * needed since client never simulates. PRIME-AUDIT Δ7: readonly to guard
 * against accidental client-side mutation post-applyNetSnapshot.
 */
export interface SerializedCreature {
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
}

export function snapshot(world: World): WorldSnapshot {
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
    currentPlayerId: world.currentPlayerId,
    scoreByPlayer: [...world.scoreByPlayer.entries()],
    // S28 P0 — NetSnapshot v2: only emit `creatures` when non-empty so pre-S28
    // saves stay byte-identical (the field stays `undefined` and is dropped by
    // JSON.stringify). Host always emits; clients never read this for serialize
    // (host-authoritative — see netSnapshot consumer in applySnapshotCore).
    creatures: world.creatures.size > 0
      ? [...world.creatures.values()].map(serializeCreature)
      : undefined,
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
}

/**
 * S15 P2 — NetSnapshot wire variant. Omits host-only fields (Council R2 +
 * PRIME-AUDIT consolidated retain-list).
 */
export type NetSnapshot = Omit<
  WorldSnapshot,
  'savedAt' | 'rngSeed' | 'nextPrimitiveId' | 'nextBondId'
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
    ...rest
  } = full;
  void _savedAt; void _rngSeed; void _nextPrimitiveId; void _nextBondId;
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
  world.currentPlayerId = snap.currentPlayerId ?? asPlayerId(0);
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
  };
}

/**
 * S28 P0 — Voltkin Phase 2D Council Q4 2/3 B trimmed shape: only fields the
 * client renderer needs (id/type/pos/state/ticksInState). All AI + lifecycle
 * fields (targetBondId, targetPos, prevPos, spawnedAtTick, despawnAtTick,
 * ownerPlayerId) intentionally omitted — host runs FSM, client only renders.
 */
function serializeCreature(c: Creature): SerializedCreature {
  return {
    id: c.id,
    type: c.type,
    pos: { x: c.pos.x, y: c.pos.y },
    state: c.state,
    ticksInState: c.ticksInState,
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
  }
}

/**
 * S28 P0 — rehydrate a SerializedCreature on the client side. Sim-only fields
 * (prevPos, targetPos, targetBondId, ownerPlayerId, spawnedAtTick, despawnAtTick)
 * are reconstructed with neutral defaults: prevPos snaps to pos (zero implicit
 * velocity — client never integrates anyway), targetPos snaps to pos (no AI),
 * targetBondId=null (no AI), ownerPlayerId=0 (renderer ignores), spawnedAtTick=0
 * and despawnAtTick=0 (renderer ignores — host owns the despawn dispatch).
 */
function deserializeCreature(s: SerializedCreature): Creature {
  return {
    id: s.id,
    type: s.type,
    ownerPlayerId: asPlayerId(0),
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

// Brand re-exports so save callers don't need to import types.ts.
export const SaveBrands = { asPlayerId, asPrimitiveId, asBondId, asCreatureId };

export function saveToLocalStorage(world: World): WorldSnapshot {
  const snap = snapshot(world);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  }
  return snap;
}

export function loadFromLocalStorage(world: World): WorldSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const snap = JSON.parse(raw) as WorldSnapshot;
  restore(snap, world);
  return snap;
}
