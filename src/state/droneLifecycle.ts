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
import type { BondId, CreatureId, DefenderId, PlayerId, PrimitiveId, SpawnerId, Vec2 } from '../types.ts';
import { bondMidpoint, isEnemyBond } from './creatures/creatureAI.ts';
import {
  PLAYER_COLORS,
  DRONE_EXPLODE_RADIUS,
  DRONE_MAX_CONNECTORS,
  DRONE_MAX_GLOBAL,
  DRONE_MAX_PER_SPAWNER,
} from '../constants.ts';
import { damageEntity, type DamageTarget } from './damage.ts';
import { creatureAttackFifths, type Creature } from './creatures/creature.ts';
import { BLAST_KIND_WEIGHT_DEFAULT, blastSplitWeight, splitBlastPool } from './blastFalloff.ts'; // ⭐ S195 B-10
import { sameTeam, sameTeamColor } from './teams.ts';

/*
 * ⭐ S160 P5 (owner R77) — **THE DRONE'S AoE DAMAGE, WHICH IT NEVER HAD.** The last unbuilt item on
 * R77's deferred list: *"5 damage(atk) and 1 pierce in an area of effect (suicide drones)"*.
 *
 * ⭐ S190 (draft-atk) — READ FROM THE DRONE, NOT FROM `DRONE_ATK` / `DRONE_PEN`. This was a module
 * constant `attackFifths(DRONE_ATK, DRONE_PEN)`, so a drone born to a seat that drafted ATK or PEN
 * exploded for the UNBUFFED 30. The drone's config atk/pen ARE those constants, so an undrafted drone
 * still blasts for exactly 30 (`creatureAttackFifths` in `applyDroneExplode`). The connector arm
 * below severs by COUNT (`DRONE_MAX_CONNECTORS`, the owner's ruling), not by damage, so it takes no
 * strike number and is unchanged.
 */

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
 * ⭐⭐ S195 B-10 (owner, RULED) — **THE DRONE'S SPLASH IS ONE POOL, SPLIT — NOT A FULL HIT PER UNIT.**
 *
 * > *"it should be like a total pool of damage that he does … spread out between all the units. Not like
 * > he kills all the units around … I saw him this game kill like four units around."* — owner, S195
 *
 * ⚠ MINE (merge-owner call, S195 turn 3) — THE POOL IS THE DRONE'S OWN STRIKE: `creatureAttackFifths(drone)`
 * = `attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = **30** fifths undrafted (R77's *"5 damage(atk) and 1 pierce in an
 * area of effect"*), drafted-buffed like every S190 strike. Reasoning: 30 was already the number ONE unit in the
 * blast took, so a lone victim is unchanged and a crowd now shares what one of them used to take — the smallest
 * move that gives him "a total pool". His alternatives: a bespoke pool constant (off the ladder — this project's
 * most-repeated defect), or 2 × the strike (a crowd of two keeps today's per-unit hit). Overrule on sight.
 */
export function droneSplashPoolFifths(drone: Creature): number {
  return creatureAttackFifths(drone);
}

type DroneSplashKind = 'creature' | 'defender' | 'primitive';
/** Total-order tiebreak after distance — the hub's convention (`HUB_BLAST_KIND_RANK`), connectors excluded. */
const DRONE_SPLASH_KIND_RANK: Readonly<Record<DroneSplashKind, number>> = { creature: 0, defender: 1, primitive: 2 };

export interface DroneSplashShare {
  readonly kind: DroneSplashKind;
  readonly id: number;
  readonly d2: number;
  /** Its share of the pool, in fifths — integers that sum to EXACTLY the pool (`splitBlastPool`). */
  readonly amount: number;
}

/**
 * ⭐ S195 B-10 — WHO THE DRONE'S SPLASH REACHES, IN WHAT ORDER, FOR HOW MUCH. Pure: reads the world, mutates
 * nothing; `applyDroneExplode` executes it (collect first, mutate second — `applyRadialDamage`'s discipline).
 *
 * WHO — exactly the set `applyRadialDamage` hit until S195, so ONLY the amount rule changes: every creature,
 * every unit-class defender (Helga — `ehp !== null`; a tower has no pool, R75) and every SHAPE inside
 * `DRONE_EXPLODE_RADIUS` whose side is not the drone's (`sameTeam` — FFA: its owner, byte-identical to the
 * old `spared`). ⚠ Shapes INSIDE a structure are hit, as before (the S179 "three drones fell a shape" rule was
 * about a structure member); the hub's free-shapes-only rule is NOT adopted here — that would be a second
 * change nobody ruled. The connector arm below is untouched: his COUNT ruling (*"3 connectors per lightning"*).
 *
 * ORDER — a TOTAL order: squared distance (nearest first), then kind, then id. Never `Map` order.
 *
 * HOW MUCH — the pool split by distance exactly as the hub's (`blastSplitWeight`: `max(1, floor(R − d))`,
 * kind weight `BLAST_KIND_WEIGHT_DEFAULT` 1 : 1 — ⚠ MINE, the hub's default), the leftover fifths one apiece
 * nearest-first, so the shares are integers summing to EXACTLY the pool (R193-B4: closer = more, §9d-5).
 */
export function planDroneSplash(world: World, cx: number, cy: number, radius: number, owner: PlayerId, pool: number): DroneSplashShare[] {
  const r2 = radius * radius;
  const found: Array<{ kind: DroneSplashKind; id: number; d2: number }> = [];
  const at = (kind: DroneSplashKind, id: number, x: number, y: number): void => {
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) found.push({ kind, id, d2 });
  };
  for (const [id, c] of world.creatures) if (!sameTeam(world, c.ownerPlayerId, owner)) at('creature', id as number, c.pos.x, c.pos.y);
  for (const [id, d] of world.defenders) {
    if (d.ehp !== null && !sameTeam(world, d.ownerPlayerId, owner)) at('defender', id as number, d.pos.x, d.pos.y);
  }
  for (const [id, p] of world.primitives) if (!sameTeam(world, p.placedBy, owner)) at('primitive', id as number, p.pos.x, p.pos.y);
  found.sort((a, b) => a.d2 - b.d2 || DRONE_SPLASH_KIND_RANK[a.kind] - DRONE_SPLASH_KIND_RANK[b.kind] || a.id - b.id);
  if (found.length === 0) return [];
  const shares = splitBlastPool(pool, found.map((t) => blastSplitWeight(t.d2, radius, BLAST_KIND_WEIGHT_DEFAULT)));
  return found.map((t, i) => ({ ...t, amount: shares[i]! }));
}

function droneSplashTarget(kind: DroneSplashKind, id: number): DamageTarget {
  switch (kind) {
    case 'creature':
      return { kind, id: id as unknown as CreatureId };
    case 'defender':
      return { kind, id: id as unknown as DefenderId };
    case 'primitive':
      return { kind, id: id as unknown as PrimitiveId };
  }
}

/**
 * The drone detonates: a radial sever of <= DRONE_MAX_CONNECTORS ENEMY bonds within
 * DRONE_EXPLODE_RADIUS of the drone, nearest-first (lowest-BondId tie-break), then despawn.
 * No-op (idempotent) if the drone is already gone (stale fan-out snapshot — defense-in-depth).
 */
export function applyDroneExplode(world: World, action: DroneExplodeAction): World {
  const drone = world.creatures.get(action.creatureId);
  if (drone === undefined) return world;
  const blastFifths = droneSplashPoolFifths(drone); // ⭐ S190 — the drone's own baked strike; ⭐ S195 B-10 — now the POOL
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
    // ⭐ S192 — spares its own SIDE: an endpoint on the drone's team is spared like its own. A missing
    // endpoint (`undefined`) is nobody's teammate, exactly as `undefined !== ownerColor` was.
    !sameTeamColor(world, world.primitives.get(bond.aId)?.placerColor, ownerColor) &&
    !sameTeamColor(world, world.primitives.get(bond.bId)?.placerColor, ownerColor);

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
  /*
   * ⭐⭐ S170 P2b (owner R170) — **NO BLAST GRAPHIC WHEN THE BLAST HITS NOTHING.**
   *
   * Owner: *"the drone sometimes still explodes, like, in his own building or in his own area when
   * the fight just starts... he didn't destroy anything but I saw him blow up in my zone when the
   * fight started."* Verified still live, and the mechanism is three facts meeting:
   *   1. `hostTick`'s Step 1.5 detonates a drone whose fly-time fuse expires **wherever it happens
   *      to be** — `world.tick >= despawnAtTick - 1`, explode-in-place rather than fade. At
   *      `DRONE_LIFETIME_TICKS` = 8 s (and the 30-tick materialize window eating part of that), the
   *      hub's first drone after the bell can run out mid-flight, still inside its owner's zone.
   *   2. The candidate scan above collects **ENEMY bonds only**, and `applyRadialDamage` below is
   *      owner-sparing. So a detonation at home is guaranteed to damage nothing at all.
   *   3. This push was UNCONDITIONAL and ran BEFORE either of those — so the player got the full
   *      orange shock ring and flash for an event with no effect whatsoever.
   *
   * ⚠ THE GATE IS ON "HIT NOTHING", NOT ON "FUSE EXPIRED", and the distinction is deliberate. The
   * docblock above chose explode-in-place over a silent fade on purpose, and a fuse-expiry blast
   * that lands NEXT TO an enemy base is a real hit that should still read. Only the empty one is
   * wrong, so the effect now follows the OUTCOME: `candidates` is the enemy-bond list this blast
   * will actually sever, and an empty list means the drone fizzles quietly.
   *
   * ⚠ AND IT STAYS A RENDER-ONLY DECISION. `world.effects` is client-side cosmetic and is not
   * hashed, so gating it moves no determinism oracle and costs no protocol bump. The sever and the
   * radial damage below are untouched — a drone that hit nothing already changed nothing.
   */
  if (candidates.length > 0) {
    world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: DRONE_EXPLODE_RADIUS });
  }

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
  /*
   * ⭐⭐ S195 B-10 (owner) — ONE POOL, SPLIT. Until S195 this was `applyRadialDamage(…, blastFifths, blastFifths,
   * 'creature', owner, 'physical', 'distance')`: the full 30 to EVERY unit and shape in the radius, falling to
   * 15 at the rim — *"I saw him this game kill like four units around."* Now `planDroneSplash` shares the ONE
   * pool (`droneSplashPoolFifths`, ⚠ MINE above) over the same set by distance, the hub's way. Same source
   * (`'creature'`), same seat credit (⭐ S191 — a blast names no ENTITY, nobody retaliates), same class
   * (`'physical'`, R192-M3), same sparing (the side that sent it — the contract every area hazard here holds).
   */
  for (const t of planDroneSplash(world, cx, cy, DRONE_EXPLODE_RADIUS, drone.ownerPlayerId, blastFifths)) {
    if (t.amount === 0) continue; // a far target among many may take 0 — a fifth is the ladder's smallest unit
    damageEntity(world, droneSplashTarget(t.kind, t.id), t.amount, 'creature', { kind: 'seat', seat: drone.ownerPlayerId }, 'physical');
  }

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

  // ⭐ S194 (audit T10 LOW-1) — a SELF-DETONATION: the stat board records it as NEITHER a loss nor a kill.
  // The unit spent itself as a weapon, and what it hit is already on the board through the blast it set off.
  world.creatures.delete(action.creatureId);
  return world;
}
