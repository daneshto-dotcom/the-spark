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
import type { BondId, CreatureId, PrimitiveId, SpawnerId, Vec2 } from '../types.ts';
import { bondMidpoint, isEnemyBond } from './creatures/creatureAI.ts';
import {
  DRONE_ATK,
  PLAYER_COLORS,
  DRONE_EXPLODE_RADIUS,
  DRONE_MAX_CONNECTORS,
  DRONE_MAX_GLOBAL,
  DRONE_MAX_PER_SPAWNER,
  DRONE_PEN,
} from '../constants.ts';
import { applyRadialDamage } from './damage.ts';
import { attackFifths, primitiveDamageForAtk } from './stats.ts';

/**
 * ⭐ S160 P5 (owner R77) — **THE DRONE'S AoE DAMAGE, WHICH IT NEVER HAD.** The last unbuilt item on
 * R77's deferred list: *"5 damage(atk) and 1 pierce in an area of effect (suicide drones)"*.
 *
 * Named rather than inlined for the reason `suicideBlast.ts` gives at its own constant:
 * `applyRadialDamage` takes a 1000-per-shape amount and a FIFTHS amount ADJACENTLY, and swapping
 * them typechecks silently.
 */
const DRONE_BLAST_UNIT_FIFTHS = attackFifths(DRONE_ATK, DRONE_PEN);

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

  /*
   * ⛔ S161 OPEN-2 (owner) — **A DRONE MUST NOT CUT A BOND THAT TOUCHES ITS OWNER'S OWN STRUCTURE.**
   *
   * Owner, playing: *"My own lightning drone destroyed his own tower when fight started and he
   * spawned!"* Reproduced in `droneFriendlyFire.test.ts` before this line existed.
   *
   * `isEnemyBond` is an **OR** — `primA.placerColor !== ownerColor || primB.placerColor !== ownerColor`
   * — so a MIXED bond, one end yours and one end theirs, reads as enemy. For a chewer gnawing at the
   * seam between two empires that is the right reading. For the drone it is fatal: cutting a mixed
   * bond changes the OWNER'S OWN topology, so the hub's star degree drops, its recipe breaks, and the
   * recipe-break branch in `hostTick.ts` fires `STRUCTURE_SELFDESTRUCT`, which razes the hub's whole
   * component. The player's own drone deletes the player's own tower.
   *
   * ⭐ AND THIS FUNCTION ALREADY DISAGREED WITH ITSELF. Thirty lines below, `applyRadialDamage` is
   * called with `drone.ownerPlayerId` under the comment *"spares the side that sent it — the contract
   * every area hazard here holds"*. The blast honoured owner-sparing and the sever beside it did not.
   * This restores the contract to both halves rather than inventing a new rule.
   *
   * ⚠ BY COLOUR, THE SAME NOTION `isEnemyBond` USES — and the first attempt got this wrong. It
   * tested `placedBy` (player id) to match the radial-damage call, and two shipped drone tests went
   * red: `lightningDrone.test.ts` builds enemy prims with an enemy COLOUR while leaving `placedBy`
   * defaulted to the owner (its own comment at :60 records that default), so an id-keyed guard
   * spared genuinely-enemy bonds and disarmed the drone. Reading the same field the enemy test reads
   * makes this an exact AND-tightening of that predicate rather than a second, disagreeing one.
   *
   * ⚠ THE DRONE IS NOT DISARMED: a wholly-enemy bond still severs, which both the shipped tests and
   * `droneFriendlyFire.test.ts`'s control assert. What it can no longer do is cut a connector that
   * touches its own side.
   */
  const ownerColor =
    world.players.get(drone.ownerPlayerId)?.color
    ?? PLAYER_COLORS[drone.ownerPlayerId as unknown as number];
  const sparesOwn = (bond: { aId: PrimitiveId; bId: PrimitiveId }): boolean =>
    world.primitives.get(bond.aId)?.placerColor !== ownerColor &&
    world.primitives.get(bond.bId)?.placerColor !== ownerColor;

  // Collect candidate ENEMY bonds within radius (squared dist; reuse the locked isEnemyBond rule).
  const candidates: { bondId: BondId; dSq: number }[] = [];
  for (const [bondId, bond] of world.bonds) {
    if (!isEnemyBond(world, drone, bond)) continue;
    if (!sparesOwn(bond)) continue; // ⛔ never a bond attached to the side that sent this drone
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

  /*
   * ⭐ S160 P5 (owner R77) — **AND NOW IT ACTUALLY DEALS ITS DAMAGE.**
   *
   * Owner R77: *"5 damage(atk) and 1 pierce in an area of effect (suicide drones)"*. Until S160 those
   * two numbers reached `LIGHTNING_DRONE_CONFIG.atk/pen` and stopped: this function severed bonds and
   * never read either, so the dictated damage model described a mechanic the game did not have.
   * `pinnedDeadStats.test.ts` asserted that gap on purpose and is inverted by this change.
   *
   * The shape of the fix follows `suicideBlast.ts` exactly — same shared ladder, same unit-and-shape
   * split, same owner-sparing radial helper — which is what its docblock advertised itself as.
   *   · units:  `attackFifths(5, 1)` = **30 fifths**
   *   · shapes: `primitiveDamageForAtk(5)` = **418** of a primitive's 1000, so three drones fell one
   *
   * ⛔ **AND THE CONNECTOR SEVER BELOW IS DELIBERATELY LEFT UNCONDITIONAL. THIS IS THE WHOLE
   * DESIGN DECISION, AND IT IS WHY THE GAP COULD BE CLOSED WITHOUT AN OWNER RULING.**
   *
   * `constants.ts` warned, correctly, that CONVERTING the sever into stat damage is a balance change
   * the owner should see first: 30 fifths against `connectorCapacityFifths(n) = n + 4` cuts a
   * connector only while n <= 26, so a stat-gated drone would go from "always takes 3 connectors" to
   * "takes NOTHING off a 30-connector fortress" — weaker against exactly the big bases it exists to
   * open up. Nobody asked for that.
   *
   * So this is ADDITIVE, not a conversion. The drone keeps `DRONE_MAX_CONNECTORS` unconditional
   * severs — the owner's own COUNT ruling (*"3 connectors per lightning"*) — and GAINS the unit and
   * shape damage it was always specified to have. R77's damage sentence is now spent; R77's connector
   * count is untouched. ⚠ The asymmetry with `suicideBlast.ts`, whose connector arm IS stat-gated, is
   * intentional and this is the reason: the goblin has no count ruling, the drone does.
   *
   * ⚠ ORDER: candidates were collected ABOVE, before this damage lands, because a destroyed
   * primitive takes its bonds with it. The sever loop re-checks `world.bonds.get(bondId)` and skips
   * what is already gone, which is the same stale-entry defence it already had for sibling drones.
   */
  applyRadialDamage(
    world,
    cx,
    cy,
    DRONE_EXPLODE_RADIUS,
    primitiveDamageForAtk(DRONE_ATK),
    DRONE_BLAST_UNIT_FIFTHS,
    'creature',
    drone.ownerPlayerId, // spares the side that sent it — the contract every area hazard here holds
  );

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
