/**
 * SPARK — S113 Batch C — lightning-DRONE lifecycle (the suicide-drone explode reducer + caps).
 *
 * A `lightningDrone` creature (CreatureType / LIGHTNING_DRONE_CONFIG, selfExplode:true) is emitted
 * by a `lightningHub` spawner. The main.ts creature fan-out dispatches DRONE_EXPLODE when the drone
 * arrives within DRONE_EXPLODE_RADIUS of its nearest-enemy-bond target OR its lifetime-fuse expires.
 *
 * applyDroneExplode: a DETERMINISTIC radial sever of up to DRONE_MAX_CONNECTORS ENEMY bonds within
 * DRONE_EXPLODE_RADIUS of the drone's position — nearest-first, with a lowest-BondId tie-break so the
 * cap is replay-deterministic regardless of Map insertion order. Each sever routes through the single
 * locked SEVER_BOND path with the NEW cause 'drone' (canSeverBond bypasses auth/charge for it, exactly
 * like 'creature'/'chewer'); one ARC_FLASH per actually-severed bond (the Voltkin-zap precedent) +
 * one BOMB_EXPLODE burst. Then the drone despawns. Re-dispatching SEVER_BOND from a reducer is the
 * Council-sanctioned applyCreatureAttack pattern (JS is single-threaded so synchronous re-dispatch
 * is safe; world.effects is a plain array, no re-entrant emitter).
 *
 * Determinism: pure tick math; NO RNG; squared distances; enemy-only filter reuses the locked
 * creatureAI.isEnemyBond predicate; SORTED candidate ordering. Host-authoritative — the client sees
 * the deleted bonds + ARC_FLASH/BOMB_EXPLODE in the next NetSnapshot and never simulates.
 */

import type { World } from './world.ts';
import { dispatch } from './world.ts';
import type { BondId, CreatureId, SpawnerId, Vec2 } from '../types.ts';
import { bondMidpoint, isEnemyBond } from './creatures/creatureAI.ts';
import {
  DRONE_EXPLODE_RADIUS,
  DRONE_MAX_CONNECTORS,
  DRONE_MAX_GLOBAL,
  DRONE_MAX_PER_SPAWNER,
} from '../constants.ts';

const DRONE_EXPLODE_RADIUS_SQ = DRONE_EXPLODE_RADIUS * DRONE_EXPLODE_RADIUS;

/** Action shape — exported so world.ts can compose GameAction. Host-internal (NOT a client INTENT). */
export interface DroneExplodeAction {
  readonly type: 'DRONE_EXPLODE';
  readonly creatureId: CreatureId;
}

/**
 * S113 — the drone's OWN independent population cap (NOT shared with the chewer caps, so a drone
 * swarm never blocks a chewer summon or vice-versa — owner decision #7). Counts ONLY live
 * lightningDrone creatures. Pure read; the main.ts emit poll calls it before a drone SPAWN_CREATURE.
 */
export function underDroneCaps(world: World, sourceSpawnerId: SpawnerId): boolean {
  let global = 0;
  let perSpawner = 0;
  for (const c of world.creatures.values()) {
    if (c.type !== 'lightningDrone') continue;
    global++;
    if (c.sourceSpawnerId === sourceSpawnerId) perSpawner++;
  }
  if (global >= DRONE_MAX_GLOBAL) return false;
  if (perSpawner >= DRONE_MAX_PER_SPAWNER) return false;
  return true;
}

/**
 * The drone detonates: a radial sever of <= DRONE_MAX_CONNECTORS ENEMY bonds within
 * DRONE_EXPLODE_RADIUS of the drone, nearest-first (lowest-BondId tie-break), then despawn.
 * No-op (idempotent) if the drone is already gone (stale fan-out snapshot — defense-in-depth).
 */
export function applyDroneExplode(world: World, action: DroneExplodeAction): World {
  const drone = world.creatures.get(action.creatureId);
  if (drone === undefined) return world;
  const cx = drone.pos.x;
  const cy = drone.pos.y;

  // Collect candidate ENEMY bonds within radius (squared dist; reuse the locked isEnemyBond rule).
  const candidates: { bondId: BondId; dSq: number }[] = [];
  for (const [bondId, bond] of world.bonds) {
    if (!isEnemyBond(world, drone, bond)) continue;
    const mid = bondMidpoint(bond);
    const dx = mid.x - cx;
    const dy = mid.y - cy;
    const dSq = dx * dx + dy * dy;
    if (dSq <= DRONE_EXPLODE_RADIUS_SQ) candidates.push({ bondId, dSq });
  }
  // Nearest-first; lowest-BondId tie-break => a TOTAL order, so the <=N cap is replay-deterministic
  // regardless of Map iteration order (no two distinct bonds share both dSq AND bondId).
  candidates.sort(
    (a, b) => a.dSq - b.dSq || (a.bondId as unknown as number) - (b.bondId as unknown as number),
  );

  // Burst visual (wire-mirrored) — emit ONCE, before the severs.
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: DRONE_EXPLODE_RADIUS });

  const arcStart: Vec2 = { x: cx, y: cy };
  let severed = 0;
  for (const { bondId } of candidates) {
    if (severed >= DRONE_MAX_CONNECTORS) break;
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue; // already gone (a sibling drone severed it this tick) — skip
    const arcEnd = bondMidpoint(bond); // capture pre-sever (SEVER_BOND deletes the endpoint prims)
    dispatch(world, { type: 'SEVER_BOND', bondId, playerId: drone.ownerPlayerId, cause: 'drone' });
    // Emit the lightning arc only if the bond actually severed (defense-in-depth vs future
    // canSeverBond changes); count only successful severs against the <=N cap.
    if (!world.bonds.has(bondId)) {
      world.effects.push({ kind: 'ARC_FLASH', tick: world.tick, start: arcStart, end: arcEnd, creatureId: drone.id });
      severed++;
    }
  }

  world.creatures.delete(action.creatureId);
  return world;
}
