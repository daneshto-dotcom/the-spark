/**
 * SPARK — S72 P3 potato-bomb lifecycle reducers.
 *
 * Mirrors the bomb/creature lifecycle shape: pure case-body helpers consumed by
 * world.ts dispatch. Actions:
 *   SPAWN_POTATO    (host-internal; emitted by the spawner cadence) — mint a FREE potato.
 *   PICKUP_POTATO   (client INTENT) — grab a FREE potato (carry-slot exclusive with a spark).
 *   PLACE_POTATO    (client INTENT) — plant the carried potato at the cursor → ARMED.
 *   DROP_POTATO     (client INTENT) — discard the carried potato; it stays ARMED at the
 *                   drop position and keeps its fuse.
 *   POTATO_DETONATE (host-internal; polled in main.ts) — deterministic radial AoE.
 *
 * FORK E (user reading): the fuse runs FROM SPAWN (set in makePotato, NOT reset on
 * place) — a potato held too long cooks off in your hand. One-line flip to Council's
 * from-PLACEMENT is documented in makePotato + applyPlacePotato.
 *
 * Determinism (Council Fork F + the replay guards): the AoE is a PURE fn of the frozen
 * pre-state — SQUARED distance (no sqrt/hypot) + victims iterated in SORTED PrimitiveId
 * order + incident bonds deleted in SORTED BondId order. Host-authoritative; clients
 * receive the result (deleted prims/bonds + BOMB_EXPLODE burst) in the next NetSnapshot.
 */

import { POTATO_BLAST_RADIUS, POTATO_CARRIER_BENCH_TICKS, POTATO_HOLD_DETONATE_TICKS } from '../constants.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import { asPotatoId, type BondId, type CreatureId, type PlayerId, type PotatoId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makePotato, type Potato } from './potato.ts';
import { reconcileFouledPrimitives } from './seagulls/seagullLifecycle.ts';
import type { Creature } from './creatures/creature.ts';
import type { World } from './worldTypes.ts';

const POTATO_BLAST_RADIUS_SQ = POTATO_BLAST_RADIUS * POTATO_BLAST_RADIUS;

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnPotatoAction {
  readonly type: 'SPAWN_POTATO';
  readonly pos: Vec2;
}
export interface PickupPotatoAction {
  readonly type: 'PICKUP_POTATO';
  readonly potatoId: PotatoId;
  readonly playerId: PlayerId;
}
export interface PlacePotatoAction {
  readonly type: 'PLACE_POTATO';
  readonly playerId: PlayerId;
  readonly pos: Vec2;
}
export interface DropPotatoAction {
  readonly type: 'DROP_POTATO';
  readonly playerId: PlayerId;
}
export interface PotatoDetonateAction {
  readonly type: 'POTATO_DETONATE';
  readonly potatoId: PotatoId;
}
export interface DissipatePotatoAction {
  readonly type: 'DISSIPATE_POTATO';
  readonly potatoId: PotatoId;
}
/** S113 Batch C — the lightningHub structure self-destruct (host-internal; main.ts emit poll). */
export interface StructureSelfDestructAction {
  readonly type: 'STRUCTURE_SELFDESTRUCT';
  readonly pos: Vec2;
  readonly radius: number;
}

/** Host-only: mint a FREE potato at the spawner-chosen position. */
export function applySpawnPotato(world: World, action: SpawnPotatoAction): World {
  const id = asPotatoId(world.nextPotatoId++);
  world.potatoes.set(id, makePotato({ id, pos: action.pos, spawnedAtTick: world.tick }));
  return world;
}

/**
 * Grab a potato. S75 P1: accepts FREE *or* ARMED — a placed potato is RE-GRABBABLE so it can
 * be passed around as a true hot-potato until the fuse fires. Rejects if: the potato is gone;
 * the potato is CARRIED (already in a hand — first-grab-wins race: two same-tick grabs, the
 * first sets CARRIED, the second sees CARRIED and no-ops); the player is gone; OR the player
 * is already Carrying a spark / a potato (carry-1 mutual exclusion, both directions).
 */
export function applyPickupPotato(world: World, action: PickupPotatoAction): World {
  const potato = world.potatoes.get(action.potatoId);
  if (potato === undefined || potato.state === 'CARRIED') return world;
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;
  if (player.kind === 'Carrying' || player.carriedPotatoId !== undefined) return world;
  potato.state = 'CARRIED';
  potato.carrierId = action.playerId;
  // S81 P2 — stamp the grab: the hold-detonate window (3s) starts NOW. A re-grab (pass)
  // restarts it — that's the hot-potato loop: grab → pass within 3s → repeat.
  potato.carriedAtTick = world.tick;
  player.carriedPotatoId = action.potatoId;
  return world;
}

/**
 * S81 P2 — pure hot-potato predicate for the main.ts poll: a CARRIED potato held
 * continuously for POTATO_HOLD_DETONATE_TICKS cooks off IN HAND (the existing
 * applyPotatoDetonate carrier path benches the holder). Exported for unit tests.
 */
export function shouldCookOffInHand(potato: Potato, tick: number): boolean {
  return (
    potato.state === 'CARRIED' &&
    potato.carriedAtTick !== undefined &&
    tick - potato.carriedAtTick >= POTATO_HOLD_DETONATE_TICKS
  );
}

/**
 * Plant the carried potato at the cursor → ARMED. FORK E: detonateAtTick is UNCHANGED
 * (fuse from-SPAWN). One-line flip to from-PLACEMENT: assign
 * `potato.detonateAtTick = world.tick + POTATO_FUSE_TICKS;` below + arm to Infinity in makePotato.
 */
export function applyPlacePotato(world: World, action: PlacePotatoAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined || player.carriedPotatoId === undefined) return world;
  const potatoId = player.carriedPotatoId;
  player.carriedPotatoId = undefined;
  const potato = world.potatoes.get(potatoId);
  if (potato === undefined) return world; // detonated mid-carry (race) — slot already cleared
  potato.state = 'ARMED';
  potato.pos.x = action.pos.x;
  potato.pos.y = action.pos.y;
  potato.prevPos.x = action.pos.x;
  potato.prevPos.y = action.pos.y;
  potato.carrierId = null;
  potato.carriedAtTick = undefined; // S81 P2 — placed in time: the hold window dies with the carry
  return world;
}

/**
 * Discard the carried potato: it stays ARMED at its current (last carrier-synced) pos
 * and keeps its from-SPAWN fuse (PDR — "drop stays armed, continues its fuse").
 */
export function applyDropPotato(world: World, action: DropPotatoAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined || player.carriedPotatoId === undefined) return world;
  const potatoId = player.carriedPotatoId;
  player.carriedPotatoId = undefined;
  const potato = world.potatoes.get(potatoId);
  if (potato === undefined) return world;
  potato.state = 'ARMED';
  potato.carrierId = null;
  potato.carriedAtTick = undefined; // S81 P2 — dropped in time: the hold window dies with the carry
  // CHECK-Grok hygiene — keep prevPos consistent with pos (matches applyPlacePotato).
  // prevPos is vestigial in v1 (the potato is never Verlet-integrated), so this has no
  // functional effect today; it forward-protects a future thrown-potato variant.
  potato.prevPos.x = potato.pos.x;
  potato.prevPos.y = potato.pos.y;
  return world;
}

/**
 * DETERMINISTIC radial AoE at the potato's pos (the uniform blast center across all
 * states). Owner-AGNOSTIC + POSITION-based (fires at the coord even if the structure
 * there is already gone = area denial); NO chain reaction (deletes prims/bonds — and,
 * S100 P1, any CHEWER in radius — only). The chewer kill is the Phase-1 swarm counterplay
 * (R6): chewers are otherwise untargetable since every other primitive hits bonds/positions.
 */
export function applyPotatoDetonate(world: World, action: PotatoDetonateAction): World {
  const potato = world.potatoes.get(action.potatoId);
  if (potato === undefined) return world;
  const cx = potato.pos.x;
  const cy = potato.pos.y;

  // Burst visual — reuse BOMB_EXPLODE (wire-mirrored, so the 1v1 client sees the blast).
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: POTATO_BLAST_RADIUS });

  // S75 P1 — if the potato cooked off while still CARRIED (held too long, or force-detonated
  // on carrier disconnect), free the carrier's slot AND bench them (avatar hidden + input
  // locked, reusing the hunter bench infra; Math.max so a longer existing bench can't be
  // shortened). A placed (ARMED) or un-grabbed (FREE) detonation has carrierId===null => no
  // bench: only holding the potato to detonation is punished (the AoE already hit their base).
  if (potato.carrierId !== null) {
    const carrier = world.players.get(potato.carrierId);
    if (carrier !== undefined) {
      carrier.carriedPotatoId = undefined;
      carrier.benchedUntilTick = Math.max(
        carrier.benchedUntilTick ?? 0,
        world.tick + POTATO_CARRIER_BENCH_TICKS,
      );
    }
  }
  world.potatoes.delete(action.potatoId);

  // S100 P1 (TD Phase 1a) — Phase-1 CHEWER KILL PATH (TOWER_DEFENSE_DESIGN.md §4.3, R6):
  // a potato blast also DESPAWNS any CHEWER within the same radius, so chewers are not
  // untargetable in Phase 1 ("blow up the swarm"). Owner-AGNOSTIC (your own potato can
  // catch an enemy chewer or a stray of your own) + POSITION-based (same blast center as
  // the prim AoE), and only CHEWERS (sourceSpawnerId !== null) — a Voltkin is summoned-
  // lifetime and not part of this counterplay. Iterated in SORTED CreatureId order (the
  // canonical sequence, mirroring the sorted prim/bond deletion below) so removal is
  // replay-deterministic regardless of Map insertion history. Runs BEFORE the empty-prim
  // early-return so a chewer-only blast (no structure at the coord) still clears the swarm.
  // S113 (Δ1 guarded extraction) — the chewer/drone-kill + prim/bond radial clear, SAME
  // predicate (sourceSpawnerId !== null) + SAME step order + SAME sorted-id iteration as the
  // original inline body, now via the shared `applyRadialClear` so the lightningHub structure
  // self-destruct reuses ONE tested radial clear instead of duplicating it. The potato call site
  // is byte-IDENTICAL (the save.replay.test.ts two-seed gate is the proof).
  return applyRadialClear(world, cx, cy, POTATO_BLAST_RADIUS_SQ, (c) => c.sourceSpawnerId !== null);
}

/**
 * S113 Batch C (Δ1) — the DETERMINISTIC radial-clear core, lifted VERBATIM (same step order, same
 * SORTED-id iteration, same effects) from the S72 applyPotatoDetonate body so the structure
 * self-destruct shares it WITHOUT a second copy. The CALLER emits its own burst effect
 * (BOMB_EXPLODE) BEFORE calling this, preserving the original effect order (burst, then per-victim
 * SEVER_ERASE). `creatureKill` selects which creatures the blast despawns: the potato passes
 * `c => c.sourceSpawnerId !== null` (chewers + drones — its original filter); the structure
 * self-destruct passes `() => true` (owner: "destroying EVERYTHING in its radius").
 *
 * Order (unchanged from S72): creature-kill (SORTED CreatureId) -> collect prim victims (SQUARED
 * dist, SORTED PrimitiveId) -> early-return if none -> SEVER_ERASE per victim + collect incident
 * bonds -> delete bonds (SORTED BondId) -> delete prims + snapPrevPos -> reconcileFouledPrimitives.
 */
export function applyRadialClear(
  world: World,
  cx: number,
  cy: number,
  radiusSq: number,
  creatureKill: (creature: Creature) => boolean,
): World {
  const creatureVictims: CreatureId[] = [];
  for (const [cid, creature] of world.creatures) {
    if (!creatureKill(creature)) continue;
    const dx = creature.pos.x - cx;
    const dy = creature.pos.y - cy;
    if (dx * dx + dy * dy <= radiusSq) creatureVictims.push(cid);
  }
  creatureVictims.sort((a, b) => (a as number) - (b as number));
  for (const cid of creatureVictims) world.creatures.delete(cid);

  const victims: PrimitiveId[] = [];
  for (const [pid, prim] of world.primitives) {
    const dx = prim.pos.x - cx;
    const dy = prim.pos.y - cy;
    if (dx * dx + dy * dy <= radiusSq) victims.push(pid);
  }
  victims.sort((a, b) => (a as number) - (b as number));
  if (victims.length === 0) return world;

  const incidentBonds = new Set<BondId>();
  for (const pid of victims) {
    const prim = world.primitives.get(pid);
    if (prim === undefined) continue;
    world.effects.push({ kind: 'SEVER_ERASE', tick: world.tick, pos: { x: prim.pos.x, y: prim.pos.y }, color: prim.placerColor, radius: prim.radius });
    for (const bondId of prim.bonds) incidentBonds.add(bondId);
  }

  for (const bondId of [...incidentBonds].sort((a, b) => (a as number) - (b as number))) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    world.primitives.get(bond.aId)?.bonds.delete(bondId);
    world.primitives.get(bond.bId)?.bonds.delete(bondId);
    world.bonds.delete(bondId);
  }

  for (const pid of victims) world.primitives.delete(pid);
  snapPrevPosForUnbonded(world.primitives);
  reconcileFouledPrimitives(world);
  return world;
}

/**
 * S113 Batch C — the lightningHub STRUCTURE self-destruct: after the hub has produced its 3 drones,
 * on the next cadence slot it blows up in a LARGE owner-AGNOSTIC "lightning storm" at the anchor
 * (owner spec: "destroying EVERYTHING in its radius"). A BOMB_EXPLODE burst + the shared radial
 * clear with `() => true` (every creature in radius dies too — matching the potato precedent that
 * already clears creatures). Position-based; host-internal (main.ts dispatches it, then immediately
 * REMOVE_SPAWNER so it fires exactly once).
 */
export function applyStructureSelfDestruct(world: World, action: StructureSelfDestructAction): World {
  const cx = action.pos.x;
  const cy = action.pos.y;
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: action.radius });
  return applyRadialClear(world, cx, cy, action.radius * action.radius, () => true);
}

/**
 * Host-only: a FREE (never-picked-up) potato's from-SPAWN fuse elapsed — remove it HARMLESSLY
 * (no blast, no victims), mirroring applyDissipateBomb. S78 fix for "random explosions": a FREE
 * potato used to DETONATE in the spawn-zone centre ~23s after spawning, deleting central structures
 * nobody triggered. Now only a CARRIED (cooked-off-in-hand) or ARMED (planted) potato detonates;
 * an un-engaged one quietly rots, freeing the POTATO_MAX_ACTIVE slot for the next spawn.
 */
export function applyDissipatePotato(world: World, action: DissipatePotatoAction): World {
  world.potatoes.delete(action.potatoId);
  return world;
}

/**
 * Teardown — clear all potato state. Called on PLAYING -> WIN (WIN_TRIGGER) and on
 * RETURN_TO_TITLE / START_GAME so no potato / carry-slot persists across matches.
 */
export function teardownPotatoes(world: World): void {
  world.potatoes.clear();
  world.nextPotatoId = 0;
  for (const player of world.players.values()) player.carriedPotatoId = undefined;
}
