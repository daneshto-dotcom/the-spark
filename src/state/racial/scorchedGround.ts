/**
 * SPARK — S188 — SCORCHED GROUND (demons L0): YOUR WHOLE TERRITORY BURNS.
 *
 * > *"their quadrant … if it's a four player, then it's a quarter of the map. If it's a two player
 * > game, it's half … does damage over time. Anyone who goes into their lands gets a debuff …
 * > burning hell … the same mechanic as our zombie boss, two percent of their total HP per second
 * > that they're there."* — owner, S187
 *
 * ## ⭐ TWO SHIPPED PIECES, JOINED — nothing new is invented
 *
 *  · **WHERE**: `zoneOf(pos) === zoneOwner(seat)` — the partition the build reducer already treats as
 *    authoritative (`zones.ts`). ⛔ NOT the retired radius `isInsideEnemyTerritory`. The shared quarry
 *    belongs to nobody (`zoneOf` returns null there), so it never burns.
 *  · **HOW MUCH**: the zombie aura's mechanic, `damageOverTime.ts`, used UNCHANGED (Council G4): the
 *    tick always deals exactly ONE fifth and the RATE carries the percentage, phase-spread by the
 *    victim's own id, so a crowd does not pulse and stepping out and back in cannot dodge a tick.
 *    **20 per-mille** — his 2 %, not the boss's 2.5 %. A uniform 50 s to burn anything to death,
 *    whatever its size: the "fair" he asked for when he ruled the aura R138.
 *
 * ## THE CALLS THAT ARE MINE
 *
 *  · **Enemy UNITS only — creatures and (⭐ S192, owner: *"Helga is NOT immune"*) an enemy HELGA.** Not
 *    the seat's own units, not gatherers (canon §4: nothing can touch them), not structures. (S188
 *    excluded Helga as MINE; his later answer replaced that.)
 *  · **FIGHT only** — it runs in `racialTick.ts`'s FIGHT slot beside the boss auras, for the reason
 *    that slot is gated: nothing may be attacked during BUILD (R5).
 *  · ⛔ S188 fix round F4 — **A FALLEN CASTLE'S LAND STOPS BURNING.** `castleHp <= 0` is the guard
 *    every castle-derived effect uses (the gun, regen, the race-unit emitter): an eliminated seat's
 *    perk must not go on damaging the board after it is out. The ember look follows the same test.
 *  · **`damageEntity(…, 1, 'aura', null)`** — `'aura'` because it is exactly the zombie aura's kind of
 *    damage; attacker `null` because burning ground is not an entity: nobody retaliates against it
 *    and nobody lifesteals from it. `damage.callSites.test.ts` records it among the `null` sites.
 *  · Inside the strike batch's death deferral, so a unit burned to death this tick still lands its
 *    committed blow and is removed by the same sweep as everything else.
 *
 * No new field, no wire change, no hash change: the perk is read from `Player.draftPicks`, the zone
 * from `World.layout` and the position from `Creature.pos` — all already synced and hashed. The ember
 * look is derived from the same picks on every peer (`render/zoneBackgroundRenderer.ts`).
 *
 * ## ⭐⭐ S191 (owner item 1b) — SCORCHED EARTH: THE SAME PERK, AIMED
 *
 * > *"you can click on any quadrant of the enemy … you will be resistant. Everybody else will … receive
 * > damage over time. And your enemy too, and his structures and everything … with the same … amount
 * > of … health lost per … second … you can place it on your own as well. And then you would have
 * > double scorched earth"* — owner, S191
 *
 * The seat casts once per FIGHT (`CAST_SCORCHED_EARTH`, rules in the leaf `scorchedEarthRules.ts`) and
 * the chosen seat's ZONE — the same `zoneOf` / `zoneOwner` geometry the passive uses — burns until that
 * FIGHT ends. Everything NOT the caster's inside it burns:
 *
 *  · **creatures** at the passive's rate, `SCORCHED_EARTH_CAST_PER_MILLE` = `SCORCHED_GROUND_PER_MILLE`
 *    (*"the same … amount"*), on the same one-fifth tick;
 *  · **structures at HALF** — owner, S191: *"also enemy structures will take half the damage that
 *    units take."* A structure burns as ONE unit (Council): its connected component's CURRENT pool
 *    (`structurePoolFifths`), `dotIntervalTicks` of it at the unit rate, then TWICE that interval
 *    (`SCORCHED_STRUCTURE_RATE_DIV`); phase = tick + its lowest bond id clear of the caster; each due
 *    tick banks one fifth on that bond through `damageConnector` with NO attacker (nobody lifesteals
 *    from burning ground), and a full pool severs it through `applySeverBond` with the EXISTING
 *    `'raid'` cause — POWER OF RA's precedent and its reasoning, never a new discriminant;
 *  · **lone built shapes and landed stink bags** (pool 5 each) at the same half rate.
 *
 * ⛔ NOT: the castle (HIS answer), gatherers and avatars (canon §4 — nothing touches them), shapes lying
 * loose (they are sparks, not primitives).
 *
 * ⭐ OWNER, S191 (later answer) — **HELGA IS NOT IMMUNE: she burns at the units' 2 %.** She is a UNIT that
 * lives in `world.defenders` (R77), so she burns on the creature DoT clock for HER pool (`burnHelgas`),
 * from every source that burns units — the passive and each cast. A DORMANT Helga (S189 C2, `ehp ===
 * null`) is a record, not a live unit, and takes nothing; a tower (`ehp === null`) never did.
 *
 * ⭐ **STACKING — EACH SOURCE ON ITS OWN CLOCK (Council).** The passive and each live cast are separate
 * sources, each dealing its own fifth when due. So a cast on the caster's OWN zone doubles the burn on
 * every outsider's creature there — *"double scorched earth"* — exactly, for every pool, because the
 * two clocks are the same arithmetic (`SCORCHED_EARTH_OWN_ZONE_MUL`, derived). Outsiders' structures
 * cannot stand in his zone (*"enemies cant build buildings in your zone"*), so the double is a
 * creature double.
 *
 * ⭐ **THE PASSIVE'S CREATURE ARM IS BYTE-IDENTICAL.** It runs first, zone by zone in seat order, exactly
 * as S188 did, then its HELGA arm (⭐ S192 — the passive's one change: an enemy Helga standing in a demon
 * seat's land burns too, at the same 2 %); the casts follow in caster-seat order. A board with no Helga
 * in a scorched zone and no cast behaves exactly as before.
 */

import { LONE_PRIMITIVE_POOL_FIFTHS, STINK_BAG_DEF, STINK_BAG_HP } from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import { dotDueThisTick, dotIntervalTicks } from '../damageOverTime.ts';
import { damageConnector, damageEntity, severWithCarry } from '../damage.ts';
import { dotBeat, magicDot } from '../magicResist.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { applySeverBond } from '../severBond.ts';
import { structurePoolFifths, unitPoolFifths } from '../stats.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
import type { World } from '../worldTypes.ts';
import { asPlayerId, type BondId, type CreatureId, type DefenderId, type PlayerId, type PrimitiveId, type StinkCloudId } from '../../types.ts';
import { getDefenderConfig } from '../defenders/defender.ts';
import {
  isScorchImmune,
  scorchedEarthActiveZone,
  scorchedEarthCastRefusal,
  scorchedEarthTargetZone,
  type CastScorchedEarthAction,
} from './scorchedEarthRules.ts';

/** ⭐ OWNER, S187 — *"two percent of their total HP per second"*, per-mille so it is an integer. */
export const SCORCHED_GROUND_PER_MILLE = 20;

/**
 * ⭐ OWNER, S191 — the aimed cast burns creatures *"with the same … amount of … health lost per …
 * second"*. DERIVED from the passive's rate, never a second literal: retune one, both move.
 */
export const SCORCHED_EARTH_CAST_PER_MILLE = SCORCHED_GROUND_PER_MILLE;

/**
 * ⭐ OWNER, S191 — *"also enemy structures will take half the damage that units take."* A structure's
 * burn interval is this many times the unit interval for its pool (half the rate = twice the
 * interval, Council), so the half is exact whatever `dotIntervalTicks` rounds to. HIS ruling.
 */
export const SCORCHED_STRUCTURE_RATE_DIV = 2;

/**
 * ⭐ OWNER, S191 — *"you can place it on your own as well. And then you would have double scorched
 * earth."* DERIVED, and NOT read by the burn: each source runs its own clock, so the double is what
 * two same-rate sources on one zone ARE. Pinned against the measured burn by
 * `scorchedEarth.test.ts`, so a retune that broke the double would go red there.
 */
export const SCORCHED_EARTH_OWN_ZONE_MUL =
  (SCORCHED_GROUND_PER_MILLE + SCORCHED_EARTH_CAST_PER_MILLE) / SCORCHED_GROUND_PER_MILLE;

/** A landed stink bag's pool — off the shared ladder (`makeStinkCloud` computes the same). */
const STINK_BAG_POOL_FIFTHS = unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF);

/**
 * Ticks between single-fifth burns for a STRUCTURE (or a lone shape / stink bag) of `poolFifths`:
 * the unit interval at the cast's rate, `SCORCHED_STRUCTURE_RATE_DIV` times over.
 */
export function scorchedStructureIntervalTicks(poolFifths: number): number {
  return SCORCHED_STRUCTURE_RATE_DIV * dotIntervalTicks(poolFifths, SCORCHED_EARTH_CAST_PER_MILLE);
}

/** The zone each SCORCHED GROUND seat owns, in seat order. Empty when nobody holds it. */
export function scorchedZones(world: World): Array<{ seat: PlayerId; zone: number }> {
  const out: Array<{ seat: PlayerId; zone: number }> = [];
  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of seats) {
    const pl = world.players.get(seat);
    if (pl === undefined || pl.castleHp <= 0 || !seatHoldsPerk(pl, 'demons.l0')) continue; // F4
    const zone = zoneOwner(seat as unknown as number, world.layout);
    if (zone !== null) out.push({ seat, zone });
  }
  return out;
}

/**
 * ⭐ S191 — every LIVE Scorched Earth cast, in caster-seat order: the caster (who is resistant) and the
 * zone that burns. The ONE list the burn and the red backdrop both read (`scorchedEarthActiveZone`).
 */
export function scorchedEarthZones(world: World): Array<{ caster: PlayerId; zone: number }> {
  const out: Array<{ caster: PlayerId; zone: number }> = [];
  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of seats) {
    const pl = world.players.get(seat);
    if (pl === undefined) continue;
    const zone = scorchedEarthActiveZone(world, pl);
    if (zone !== null) out.push({ caster: seat, zone });
  }
  return out;
}

/**
 * ⭐⭐ S191 — THE REDUCER for `CAST_SCORCHED_EARTH`. Host-authoritative, NO-OP-NEVER-THROW: every
 * refusal returns the world untouched — the caster predicate (`scorchedEarthCastRefusal`, the one the
 * square reads) and the target (`scorchedEarthTargetZone`, the one the hover preview reads).
 */
export function applyCastScorchedEarth(world: World, action: CastScorchedEarthAction): World {
  if (scorchedEarthCastRefusal(world, action.playerId) !== null) return world;
  if (scorchedEarthTargetZone(world, action.zoneSeat) === null) return world;
  const caster = world.players.get(action.playerId);
  if (caster === undefined) return world; // unreachable past the refusal; kept so tsc can see it
  caster.scorchedEarth = { wave: world.waveNumber, zoneSeat: asPlayerId(action.zoneSeat as unknown as number) };
  return world;
}

/**
 * ⭐ S191 (Council) — THE FIGHT IS OVER, SO IS THE SCORCH: every seat's record is cleared on the
 * FIGHT→BUILD edge (`hostTick`). The wave key already makes an old record inert; clearing it keeps the
 * wire and the hash free of a spent cast. Idempotent.
 */
export function clearScorchedEarthAtBuild(world: World): void {
  for (const p of world.players.values()) p.scorchedEarth = null;
}

/** One FIGHT tick of SCORCHED GROUND, and of every live SCORCHED EARTH cast. */
export function runScorchedGround(world: World): void {
  // 1 · THE PASSIVE — byte-identical to S188: zone by zone in seat order, the creature arm only.
  for (const { seat, zone } of scorchedZones(world)) {
    burnCreatures(world, seat, zone, SCORCHED_GROUND_PER_MILLE);
    burnHelgas(world, seat, zone, SCORCHED_GROUND_PER_MILLE); // ⭐ OWNER S191 — Helga is NOT immune
  }
  // 2 · ⭐ S191 — THE AIMED CASTS, each on its own clock, in caster-seat order. The caster is spared.
  for (const { caster, zone } of scorchedEarthZones(world)) {
    burnCreatures(world, caster, zone, SCORCHED_EARTH_CAST_PER_MILLE);
    burnHelgas(world, caster, zone, SCORCHED_EARTH_CAST_PER_MILLE);
    burnStructures(world, caster, zone);
    burnLoneShapes(world, caster, zone);
    burnStinkBags(world, caster, zone);
  }
}

/** One fifth to every creature in `zone` not owned by `spared` whose DoT clock is due this tick. */
function burnCreatures(world: World, spared: PlayerId, zone: number, perMille: number): void {
  const victims: CreatureId[] = [];
  for (const [id, c] of world.creatures) {
    if (isScorchImmune(world, c.ownerPlayerId, spared)) continue; // "anyone who goes into THEIR lands" — enemies only
    if (c.ehp <= 0) continue; // already dead this tick, awaiting the sweep
    if (zoneOf(c.pos, world.layout) !== zone) continue;
    if (!dotDueThisTick(world.tick, id as number, c.type, perMille)) continue;
    victims.push(id);
  }
  // Total order before mutating: damage can remove a creature, so the scan finishes first.
  victims.sort((a, b) => (a as number) - (b as number));
  // ⭐ S193 BLAST-2 — the burning ground's OWNER (the perk's seat / the caster) is credited on the stat board.
  // ⭐ S192 (R192-M2) — SCORCHED GROUND / SCORCHED EARTH are MAGIC: a DoT tick rescaled over the
  // victim's own beats (`magicResist.ts`). The beat is this source's due-count for the victim.
  for (const id of victims) {
    const c = world.creatures.get(id);
    const beat = c === undefined ? 0 : dotBeat(world.tick, id as number, c.type, perMille);
    damageEntity(world, { kind: 'creature', id }, 1, 'aura', { kind: 'seat', seat: spared }, magicDot(beat));
  }
}

/**
 * ⭐ OWNER, S191 — *"Helga is NOT immune"* (she burns at the units' 2 %). One fifth to every LIVE unit-class
 * defender (`ehp > 0` — Helga; a tower and a DORMANT Helga carry `null`) in `zone` not owned by `spared`,
 * on the creature DoT clock for HER pool (`dotIntervalTicks(unitPoolFifths(unitStats))`), phase-spread by
 * her id — exactly `dotDueThisTick`'s rule, which keys on a creature TYPE and so cannot be called here.
 * `null` attacker: burning ground is nobody she can retaliate against (`recordDefenderRetaliation`).
 */
function burnHelgas(world: World, spared: PlayerId, zone: number, perMille: number): void {
  const victims: { id: DefenderId; beat: number }[] = [];
  for (const [id, d] of world.defenders) {
    if (isScorchImmune(world, d.ownerPlayerId, spared)) continue;
    if (d.ehp === null || d.ehp <= 0 || d.state === 'DORMANT') continue;
    const stats = getDefenderConfig(d.kind).unitStats;
    if (stats === null) continue;
    if (zoneOf(d.pos, world.layout) !== zone) continue;
    const interval = dotIntervalTicks(unitPoolFifths(stats.hp, stats.def), perMille);
    if (!Number.isFinite(interval)) continue;
    if ((world.tick + (id as unknown as number)) % interval !== 0) continue;
    victims.push({ id, beat: Math.floor((world.tick + (id as unknown as number)) / interval) });
  }
  victims.sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number));
  // ⭐ S192 (R192-M2) — magic DoT, rescaled by HER DEF/MRES over her beats (`(tick + id) / interval`).
  for (const { id, beat } of victims) damageEntity(world, { kind: 'defender', id }, 1, 'aura', { kind: 'seat', seat: spared }, magicDot(beat));
}

/**
 * ⭐ S191 — the STRUCTURE arm. A structure is its connected component (`componentOf`, the same unit
 * `damageConnector` banks across), and it burns as ONE: one clock per component, never one per
 * connector (a five-connector tower would otherwise burn five times as fast).
 *
 *  · A bond is a candidate when its midpoint is in the zone and NEITHER endpoint is the caster's — the
 *    ownership rule POWER OF RA and the raid use (a bond has no owner field). ⛔ So a component welded
 *    to the caster with no bond clear of him does not burn at all (Council).
 *  · The component's target is its LOWEST candidate id; the phase is `tick + that id`, the interval
 *    `scorchedStructureIntervalTicks(structurePoolFifths(current connector count))` — re-derived every
 *    tick, so a structure that loses a connector re-forms at the lower pool and burns on from there.
 *  · Candidates sorted, components visited once, every due target collected BEFORE any damage, then
 *    damaged in id order: a sever splits topology, so nothing is decided mid-mutation.
 */
function burnStructures(world: World, caster: PlayerId, zone: number): void {
  const candidates: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    const aOwner = world.primitives.get(bond.aId)?.placedBy;
    const bOwner = world.primitives.get(bond.bId)?.placedBy;
    if (aOwner === undefined || bOwner === undefined) continue; // orphaned — nothing to burn
    if (isScorchImmune(world, aOwner, caster) || isScorchImmune(world, bOwner, caster)) continue; // resistant
    const mid = { x: (bond.a.pos.x + bond.b.pos.x) / 2, y: (bond.a.pos.y + bond.b.pos.y) / 2 };
    if (zoneOf(mid, world.layout) !== zone) continue;
    candidates.push(bondId);
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  const visited = new Set<BondId>();
  const due: { bondId: BondId; beat: number }[] = [];
  for (const bondId of candidates) {
    if (visited.has(bondId)) continue; // a lower candidate already spoke for this structure
    const bond = world.bonds.get(bondId);
    const anchor = bond === undefined ? undefined : world.primitives.get(bond.aId);
    if (anchor === undefined) continue;
    const comp = componentOf(anchor, world.primitives, world.bonds);
    for (const id of comp.bondIds) visited.add(id);
    const interval = scorchedStructureIntervalTicks(structurePoolFifths(comp.bondIds.size));
    if (!Number.isFinite(interval)) continue;
    if ((world.tick + (bondId as unknown as number)) % interval === 0) due.push({ bondId, beat: Math.floor((world.tick + (bondId as unknown as number)) / interval) });
  }
  for (const { bondId, beat } of due) {
    if (!world.bonds.has(bondId)) continue;
    // `null` attacker: burning ground heals nobody (BLOOD DEBT) — `damageConnector.callSites.test.ts`.
    // ⭐ S192 (R192-M2) — magic DoT. A structure's MRES is its DEF (R192-M5), so every beat lands its one fifth.
    if (damageConnector(world, bondId, 1, { kind: 'seat', seat: caster }, magicDot(beat))) {
      // ⛔ INLINE, NOT DISPATCHED — POWER OF RA's audit F1: the sever is the CONSEQUENCE of damage that
      // has landed, not the caster acting now, so a benched caster must not have it refused. `'raid'`
      // is the existing cause for a player's attack reaching a connector's capacity (⚠ MINE, Ra's).
      // ⭐ S192 (audit OWN-1) — through `severWithCarry`, like every `damageConnector` site (the S191 overkill
      // CARRY ruling; `connectorSeverCarry.census.test.ts`).
      severWithCarry(world, bondId, (id) => applySeverBond(world, { type: 'SEVER_BOND', bondId: id, playerId: caster, cause: 'raid' }), { kind: 'seat', seat: caster });
    }
  }
}

/** ⭐ S191 — a LONE built shape (no connectors: pool 5, canon §2) not the caster's, at the half rate. */
function burnLoneShapes(world: World, caster: PlayerId, zone: number): void {
  const interval = scorchedStructureIntervalTicks(LONE_PRIMITIVE_POOL_FIFTHS);
  const due: PrimitiveId[] = [];
  for (const [id, prim] of world.primitives) {
    if (isScorchImmune(world, prim.placedBy, caster)) continue;
    if (prim.bonds.size > 0) continue; // a shape IN a structure burns through its connectors
    if (prim.hp <= 0) continue;
    if (zoneOf(prim.pos, world.layout) !== zone) continue;
    if ((world.tick + (id as unknown as number)) % interval !== 0) continue;
    due.push(id);
  }
  due.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  // ⭐ S192 (R192-M2) — magic; a shape's MRES is its DEF (0), so the fifth lands as is.
  for (const id of due) damageEntity(world, { kind: 'primitive', id }, 1, 'aura', { kind: 'seat', seat: caster }, 'magic');
}

/**
 * ⭐ S191 — a LANDED STINK BAG (pool 5, *"just like one shape, same system"*) not the caster's, at the
 * half rate. An explicit arm (Council): no radial helper visits `world.stinkClouds`. ⚠ MINE: a bag
 * that burns out BURSTS as any killed bag does — the burst spares the bag's OWNER, not the caster.
 */
function burnStinkBags(world: World, caster: PlayerId, zone: number): void {
  const interval = scorchedStructureIntervalTicks(STINK_BAG_POOL_FIFTHS);
  const due: StinkCloudId[] = [];
  for (const [id, cloud] of world.stinkClouds) {
    if (isScorchImmune(world, cloud.ownerPlayerId, caster)) continue;
    if (cloud.ehp <= 0) continue;
    if (zoneOf(cloud.pos, world.layout) !== zone) continue;
    if ((world.tick + (id as unknown as number)) % interval !== 0) continue;
    due.push(id);
  }
  due.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  for (const id of due) {
    if (world.stinkClouds.has(id)) damageEntity(world, { kind: 'stinkCloud', id }, 1, 'aura', { kind: 'seat', seat: caster }, 'magic'); // ⭐ S192 — R192-M2
  }
}
