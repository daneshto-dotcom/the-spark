/**
 * SPARK — ⭐⭐ S192 (owner, A3): **THE ENDGAME MONSTER WAVES** — the spawner, the targeting arm and
 * the end-of-fight sweep. Pure policy lives in `endgame.ts`.
 *
 * > *"there are going to be monsters coming from the spawn zone where … usually the shapes come out
 * > of, right? The primitives. And they attack each player … let's say at wave 27, you're gonna have
 * > like 10 of those monsters come out … for each of those two players. So 20 in total, and they will
 * > go … target their first … enemy who they're supposed to attack. And if he's already destroyed,
 * > then they go to the other enemies."*
 *
 * HOST-ONLY: called from `runHostTick` (host and `?worker=1` mirror alike), never by a client.
 *
 * ## Determinism
 * No RNG and no wall clock. Birth position is a fixed point on the quarry rim facing the lane's keep; the assigned seat is round-robin over `livingSeats` (id order); every
 * scan below is a total order — squared distance, then id. The spawn counter is synced world state
 * (`monsterWaveSpawned`), so a NONET freeze that skips ticks catches up rather than losing monsters.
 */

import {
  GOBLIN_SPREAD_RADIUS,
  GOBLIN_UNIT_ACQUIRE_RADIUS,
  GOBLIN_UNIT_LEASH_RADIUS,
  MONSTER_BIRTH_RADIUS_PX,
  MONSTER_MAX_LIVE_TOTAL,
  MONSTER_MAX_RELEASES_PER_TICK,
  MONSTER_OWNER_SEAT,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
} from '../constants.ts';
import { asPlayerId, type BondId, type CreatureId, type PlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { dispatch, type World } from './world.ts';
import { livingSeats } from './elimination.ts';
import { megaPantsDue, monsterLaneSeats, monstersDueBy, monstersPerSeatForWave, monsterVictimSeat, pantsWindowTicks } from './endgame.ts';
import { isLiveCreatureTarget, type Creature } from './creatures/creature.ts';
import { bondMidpoint, distSq, spreadTargetPos } from './creatures/creatureAI.ts';
import { castleAnchor } from './gatherers/gatherer.ts';

/** The owner of every endgame monster — a sentinel that is never a seat. See `MONSTER_OWNER_SEAT`. */
export const MONSTER_OWNER_ID: PlayerId = asPlayerId(MONSTER_OWNER_SEAT);

/**
 * ⚠ MINE — how often a monster re-scans for a BUILDING (bond / lone shape), phase-spread by id. A
 * full scan of the victim's structures for up to 300 monsters every tick is the S190 perf hazard again;
 * a committed target that is still valid is kept between scans, and an invalid one re-scans at once.
 */
export const MONSTER_BUILDING_RESCAN_TICKS = 15;

/**
 * ⭐ S193 — where lane `seat`'s pants is born: on the quarry rim (`MONSTER_BIRTH_RADIUS_PX`, ⚠ MINE)
 * on the ray from the quarry centre to that seat's keep, so each lane walks out of the circle on its
 * own side and the next of the lane is born where the last one no longer stands. `Math.sqrt` (correctly
 * rounded, the same on every peer), never `Math.hypot`.
 */
export function monsterBirthPos(world: World, seat: PlayerId): Vec2 {
  const a = castleAnchor(seat as unknown as number, world.layout);
  const dx = a.x - SPAWNER_CENTER_X;
  const dy = a.y - SPAWNER_CENTER_Y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
  return {
    x: SPAWNER_CENTER_X + (dx * MONSTER_BIRTH_RADIUS_PX) / len,
    y: SPAWNER_CENTER_Y + (dy * MONSTER_BIRTH_RADIUS_PX) / len,
  };
}

/**
 * Release this tick's due pants — ⭐ HIS PACE, one at a time out of the circle (`monstersDueBy`), on
 * his counts (`MONSTER_WAVE_PER_SEAT`). Release `k` goes to lane `lanes[k mod N]` (S194: the seats that started the fight), so every seat's
 * share grows at the same rate (*"10 … for each of those two players"*).
 *
 * The clock is `monsterFightStartTick` (synced), NOT the deadline: a monster fight HOLDS its deadline
 * while pants are still to come out (`isMonsterFightHeld`), so the deadline no longer says when the
 * fight began. Then, in the final fight only, the MEGA PANTS (`megaPantsDue`).
 */
/** ⭐ S194 R194-27 — the measured live cap's per-seat share: `MONSTER_MAX_LIVE_TOTAL` split over the living seats. */
export function monsterMaxLivePerSeat(living: number): number {
  return living <= 0 ? 0 : Math.floor(MONSTER_MAX_LIVE_TOTAL / living);
}

export function tickEndgameSpawner(world: World): void {
  if (world.gameState !== 'PLAYING' || world.matchPhase !== 'FIGHT') return;
  if (world.monsterFightStartTick <= 0) return;
  const perSeat = monstersPerSeatForWave(world.waveNumber);
  if (perSeat === 0) return;
  const living = livingSeats(world);
  if (living.length === 0) return;
  // ⭐ S194 (owner) — the lanes are the seats that STARTED this fight (`monsterLaneSeats`); a fallen
  // seat's lane is skipped below, so its queued pants stop coming and nobody else's share or pace moves.
  const lanes = monsterLaneSeats(world);
  const elapsed = world.tick - world.monsterFightStartTick;
  // ⭐ S194 R194-17 — his window: the whole wave out, evenly, by `pantsWindowTicks` after the whistle. The
  // schedule runs over the LANES (the seats that started the fight), never `living`: a fallen seat's slots
  // are skipped below but still counted, so `monsterWaveSpawned` reaches the lane total and the mega pants
  // (R194-26, `megaPantsDue`) still comes at his 251st slot.
  const due = monstersDueBy(elapsed, lanes.length, perSeat * lanes.length, pantsWindowTicks(world.waveNumber));
  // ⚠ MINE (S193 audit) — live pants per assigned seat, for the cap (⭐ S194 R194-27: `monsterMaxLivePerSeat`, measured). Counted once,
  // bumped as this tick releases. A lane whose seat is at the cap WAITS — and because release `k` must
  // go to lane `k mod N` (that is what makes each seat's remaining count derivable, `monstersLeftForSeat`),
  // the whole sequence waits with it until one of that seat's pants is gone.
  // ⭐ S194 re-audit MED-1 — counted by the seat each pants is ACTUALLY going for (`monsterVictimSeat`), so
  // a fallen seat's leftovers count against the survivor they retarget to, and a TOTAL is kept: the 360 is a
  // true ceiling on live pants, not 360 plus whatever a fallen seat left behind (measured before: 450 / 570).
  const live = new Map<PlayerId, number>();
  let liveTotal = 0;
  for (const c of world.creatures.values()) {
    if (c.type !== 'endgameMonster') continue;
    liveTotal++;
    const v = monsterVictimSeat(world, c);
    if (v !== null) live.set(v, (live.get(v) ?? 0) + 1);
  }
  let released = 0;
  while (world.monsterWaveSpawned < due && released < MONSTER_MAX_RELEASES_PER_TICK) {
    const k = world.monsterWaveSpawned;
    const seat = lanes[k % lanes.length]!;
    if (!living.includes(seat)) {
      world.monsterWaveSpawned = k + 1; // ⭐ S194 — a fallen seat's slot: it stops coming, at no cost
      continue;
    }
    if (liveTotal >= MONSTER_MAX_LIVE_TOTAL) break;
    if ((live.get(seat) ?? 0) >= monsterMaxLivePerSeat(living.length)) break;
    live.set(seat, (live.get(seat) ?? 0) + 1);
    liveTotal++;
    released++;
    const a = castleAnchor(seat as unknown as number, world.layout);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'endgameMonster',
      ownerPlayerId: MONSTER_OWNER_ID,
      pos: monsterBirthPos(world, seat),
      targetPos: { x: a.x, y: a.y },
      sourceSpawnerId: null,
      monsterSeat: seat,
    });
    // Counted whether or not the reducer accepted it, so a refusal can never spin this loop.
    world.monsterWaveSpawned = k + 1;
  }
  if (megaPantsDue(world)) {
    // ⭐ HIS (Q2) — *"a huge boss that just comes and destroys everything"*. Born at the quarry centre
    // with no assigned seat, so `monsterVictimSeat` spreads it over the living seats by id, and walks
    // to its victim's keep; it re-targets as each one falls until one seat is left standing.
    const victim = monsterVictimSeat(world, { id: world.nextCreatureId as unknown as CreatureId, monsterSeat: undefined });
    const a = victim === null ? { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y } : castleAnchor(victim as unknown as number, world.layout);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'megaPants',
      ownerPlayerId: MONSTER_OWNER_ID,
      pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
      targetPos: { x: a.x, y: a.y },
      sourceSpawnerId: null,
    });
  }
}

/** Is `type` one of the endgame's pants (the wave pants or the mega pants)? */
export function isPantsType(type: Creature['type']): boolean {
  return type === 'endgameMonster' || type === 'megaPants';
}

/**
 * ⭐ HIS (S193, Q3 — *"they vanish when this wave ends"*) — at the FIGHT→BUILD edge every surviving
 * pants leaves the board, so each monster wave starts fresh from the centre and none stands frozen in
 * a player's base through BUILD (the creature fan-out is FIGHT-gated). Ascending id order; idempotent.
 */
export function removeEndgameMonsters(world: World): void {
  const ids: CreatureId[] = [];
  for (const c of world.creatures.values()) if (isPantsType(c.type)) ids.push(c.id);
  ids.sort((x, y) => (x as unknown as number) - (y as unknown as number));
  for (const id of ids) dispatch(world, { type: 'DESPAWN_CREATURE', creatureId: id });
}

function victimColor(world: World, seat: PlayerId): number | null {
  return world.players.get(seat)?.color ?? null;
}

/**
 * ⭐ S194 R194-27 (perf, identical verdict) — the creatures each seat OWNS, indexed once per tick instead of
 * every pants scanning the whole creature map (500 pants × ~500 creatures = the measured 34 % of a
 * 500-pants host tick). Valid for one (world, tick, nextCreatureId): a creature born mid-tick bumps
 * `nextCreatureId` and rebuilds it; one that died mid-tick is skipped at use (`world.creatures.get(id) === q`
 * + the same liveness test). Ownership never changes after birth (no `ownerPlayerId =` write anywhere in the
 * sim), so the candidate SET is exactly the old scan's, and the pick is the same total order (distSq, then
 * id) — so the verdict is the old one, tick for tick. A memo, not state: nothing is hashed or sent.
 */
interface OwnedIndex { world: World; tick: number; nextId: number; bySeat: Map<PlayerId, Creature[]> }
let ownedIndex: OwnedIndex | null = null;
/** Test seam ONLY (the differential in `endgameS194Perf.test.ts`): false rebuilds the index on every call. */
export const __ownedIndexMemo = { enabled: true };
function ownedBy(world: World, seat: PlayerId): readonly Creature[] {
  const nextId = world.nextCreatureId as unknown as number;
  if (!__ownedIndexMemo.enabled || ownedIndex === null || ownedIndex.world !== world || ownedIndex.tick !== world.tick || ownedIndex.nextId !== nextId) {
    const bySeat = new Map<PlayerId, Creature[]>();
    for (const q of world.creatures.values()) {
      let list = bySeat.get(q.ownerPlayerId);
      if (list === undefined) bySeat.set(q.ownerPlayerId, (list = []));
      list.push(q);
    }
    ownedIndex = { world, tick: world.tick, nextId, bySeat };
  }
  return ownedIndex.bySeat.get(seat) ?? [];
}

/** Nearest creature OWNED BY `seat` within `r2`, holding `held` inside the wider leash. */
function victimUnit(world: World, c: Creature, seat: PlayerId): CreatureId | null {
  const held = c.targetCreatureId;
  if (held !== null) {
    const q = world.creatures.get(held);
    if (
      q !== undefined &&
      q.ownerPlayerId === seat &&
      isLiveCreatureTarget(world, q) && // ⭐ S193 merge — master's S192 T13 liveness rule (no corpse-in-waiting)
      distSq(c.pos, q.pos) <= GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS
    ) {
      return held;
    }
  }
  const r2 = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
  let best: CreatureId | null = null;
  let bestD = Infinity;
  for (const q of ownedBy(world, seat)) {
    const id = q.id;
    if (world.creatures.get(id) !== q || !isLiveCreatureTarget(world, q)) continue;
    const d = distSq(c.pos, q.pos);
    if (d > r2) continue;
    if (d < bestD || (d === bestD && best !== null && (id as unknown as number) < (best as unknown as number))) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function isVictimBond(world: World, color: number, bondId: BondId): boolean {
  const b = world.bonds.get(bondId);
  if (b === undefined) return false;
  const pa = world.primitives.get(b.aId);
  const pb = world.primitives.get(b.bId);
  return pa !== undefined && pb !== undefined && pa.placerColor === color && pb.placerColor === color;
}

function isVictimLoneShape(world: World, color: number, primId: PrimitiveId): boolean {
  const p = world.primitives.get(primId);
  return p !== undefined && p.placerColor === color && p.bonds.size === 0 && p.hp > 0;
}

/**
 * The victim's nearest BUILDING: a lone shape or a connector (STRICT — both endpoints the victim's
 * colour), whichever is nearer — `structureTargets`' rule, restricted to one seat. Exactly one of the
 * two is returned, for the reason `structureTargets` gives. Total order: distSq, then id.
 */
function victimBuilding(
  world: World,
  c: Creature,
  color: number,
): { primitiveId: PrimitiveId | null; bondId: BondId | null } {
  let bestPrim: PrimitiveId | null = null;
  let dPrim = Infinity;
  for (const [id, p] of world.primitives) {
    if (p.placerColor !== color || p.bonds.size > 0 || p.hp <= 0) continue;
    const d = distSq(c.pos, p.pos);
    if (d < dPrim || (d === dPrim && bestPrim !== null && (id as unknown as number) < (bestPrim as unknown as number))) {
      dPrim = d;
      bestPrim = id;
    }
  }
  let bestBond: BondId | null = null;
  let dBond = Infinity;
  for (const [id, b] of world.bonds) {
    if (!isVictimBond(world, color, id)) continue;
    const d = distSq(c.pos, bondMidpoint(b));
    if (d < dBond || (d === dBond && bestBond !== null && (id as unknown as number) < (bestBond as unknown as number))) {
      dBond = d;
      bestBond = id;
    }
  }
  if (bestPrim === null && bestBond === null) return { primitiveId: null, bondId: null };
  return dBond < dPrim ? { primitiveId: null, bondId: bestBond } : { primitiveId: bestPrim, bondId: null };
}

/**
 * ⭐ THE MONSTER'S TARGET LADDER — its own fan-out arm, every SEEKING tick, AHEAD of the shipped
 * structure-attacker arm (which would aim it at EVERY seat, since it belongs to none):
 *   1. a unit of its victim seat inside the acquire radius (held inside the leash);
 *   2. else that seat's nearest building — through its connectors, like every unit (canon §4);
 *   3. else that seat's castle — the strike then lands through `enemyCastleInReach`.
 * The strike itself needs nothing new: the fan-out fire step and `applyCreatureAttack` already serve a
 * `targetsStructures` creature's unit / connector / shape / castle targets, on the ladder.
 */
export function runEndgameMonsterTargeting(world: World, c: Creature): void {
  const seat = monsterVictimSeat(world, c);
  const color = seat === null ? null : victimColor(world, seat);
  if (seat === null || color === null) {
    c.targetCreatureId = null;
    c.targetBondId = null;
    c.targetPrimitiveId = null;
    return;
  }
  const unit = victimUnit(world, c, seat);
  c.targetCreatureId = unit;

  const keepBond = c.targetBondId !== null && isVictimBond(world, color, c.targetBondId);
  const keepPrim = c.targetPrimitiveId !== null && isVictimLoneShape(world, color, c.targetPrimitiveId);
  const rescanSlot = (world.tick + (c.id as unknown as number)) % MONSTER_BUILDING_RESCAN_TICKS === 0;
  if (rescanSlot || (!keepBond && !keepPrim)) {
    const b = victimBuilding(world, c, color);
    c.targetPrimitiveId = b.primitiveId;
    c.targetBondId = b.bondId;
  } else if (!keepBond) {
    c.targetBondId = null;
  } else if (!keepPrim) {
    c.targetPrimitiveId = null;
  }

  let steer: Vec2 | null = null;
  if (unit !== null) steer = world.creatures.get(unit)?.pos ?? null;
  if (steer === null && c.targetPrimitiveId !== null) steer = world.primitives.get(c.targetPrimitiveId)?.pos ?? null;
  if (steer === null && c.targetBondId !== null) {
    const b = world.bonds.get(c.targetBondId);
    if (b !== undefined) steer = bondMidpoint(b);
  }
  if (steer === null) steer = castleAnchor(seat as unknown as number, world.layout);
  const spread = spreadTargetPos(steer, c.id, GOBLIN_SPREAD_RADIUS);
  c.targetPos.x = spread.x;
  c.targetPos.y = spread.y;
}
