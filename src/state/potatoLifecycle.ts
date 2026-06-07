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

import { POTATO_BLAST_RADIUS, POTATO_CARRIER_BENCH_TICKS } from '../constants.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import { asPotatoId, type BondId, type PlayerId, type PotatoId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makePotato } from './potato.ts';
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
  player.carriedPotatoId = action.potatoId;
  return world;
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
 * there is already gone = area denial); NO chain reaction (deletes prims/bonds only).
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

  // STEP 1 — collect victims within R (SQUARED dist, no sqrt) in SORTED PrimitiveId
  // order (canonical delete sequence → replay-safe regardless of Map insertion history).
  const victims: PrimitiveId[] = [];
  for (const [pid, prim] of world.primitives) {
    const dx = prim.pos.x - cx;
    const dy = prim.pos.y - cy;
    if (dx * dx + dy * dy <= POTATO_BLAST_RADIUS_SQ) victims.push(pid);
  }
  victims.sort((a, b) => (a as number) - (b as number));
  if (victims.length === 0) return world; // position-based area denial: empty coord = visual only

  // STEP 2 — emit SEVER_ERASE per victim (host-local visual; pre-deletion, reads live
  // prims) + collect every incident bond (a bond touching any victim).
  const incidentBonds = new Set<BondId>();
  for (const pid of victims) {
    const prim = world.primitives.get(pid);
    if (prim === undefined) continue;
    world.effects.push({ kind: 'SEVER_ERASE', tick: world.tick, pos: { x: prim.pos.x, y: prim.pos.y }, color: prim.placerColor, radius: prim.radius });
    for (const bondId of prim.bonds) incidentBonds.add(bondId);
  }

  // STEP 3 — delete incident bonds (remove from BOTH endpoints' sets + world.bonds),
  // SORTED for determinism (reuse the locked applySeverTopology cleanup shape).
  for (const bondId of [...incidentBonds].sort((a, b) => (a as number) - (b as number))) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    world.primitives.get(bond.aId)?.bonds.delete(bondId);
    world.primitives.get(bond.bId)?.bonds.delete(bondId);
    world.bonds.delete(bondId);
  }

  // STEP 4 — delete the victim primitives, then refresh Verlet history for any prim
  // whose bond count changed (locked cleanup; prevents surviving neighbours flinging).
  for (const pid of victims) world.primitives.delete(pid);
  snapPrevPosForUnbonded(world.primitives);

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
