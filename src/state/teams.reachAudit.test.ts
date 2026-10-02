/**
 * ⭐⭐ S194 fix round (audit MED-1) — **FOUR ENEMY DECISIONS THE CENSUS GUARDED AND NO REACH TEST DID.**
 *
 * The independent audit mutated each of these back to seat equality and every `teams.reach*` test stayed
 * green: the census (`teams.sites.test.ts`) saw the line, but nothing proved the line is REACHED. Each pair
 * below drives the real `runHostTick` with a TEAMMATE (must NOT be struck / marched on / sagged) and the
 * identical setup with an ENEMY (must be) — the enemy being seat 1 itself in a free-for-all, so the only thing
 * that differs between the two halves is `world.teams`.
 *
 *   · `creatureAI.enemyCastleInReach`     — a unit parked at a keep strikes it only if it is an enemy's;
 *   · `creatureAI.enemyCastleMarchPos`    — an idle unit marches on the nearest ENEMY keep, never a friend's;
 *   · `creatureAI.killableDefenderInReach`— a unit beside a Helga swings at her only if she is an enemy's;
 *   · `territory.computeTerritorialInfluence` — a seat's territory sags an enemy's bond, never a friend's.
 *
 * Board: four seats, TL 0 · TR 1 · BR 2 · BL 3; TEAMS = seats 0+1 vs 2+3; FFA = no teams.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { PLAYER_COLORS, TERRITORY_ENGULF_STIFFNESS, phaseDurationTicks } from '../constants.ts';
import { asDefenderId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeDefender } from './defenders/defender.ts';
import { addBond, addPrim, weld } from './s191PerfOracle.fixtures.ts';

const P = [0, 1, 2, 3].map((s) => asPlayerId(s));
const TEAMS: (number | undefined)[] = [0, 0, 1, 1];
const FFA: (number | undefined)[] = [undefined, undefined, undefined, undefined];

function fourSeat(teams: (number | undefined)[]): World {
  const w = makeWorld(0x5194a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s], ...(teams[s] !== undefined ? { team: teams[s] } : {}) })),
    botSeats: [1, 2, 3],
  });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 10;
  w.creatures.clear();
  w.primitives.clear();
  w.bonds.clear();
  w.draft = null;
  return w;
}

function unit(w: World, owner: PlayerId, at: { x: number; y: number }, type: CreatureType): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function ticks(w: World, n: number, each?: () => void): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  for (let i = 0; i < n; i++) { each?.(); runHostTick(w, d, st); }
}

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
/** A point `by` px from seat `seat`'s keep, toward the board centre. */
function besideKeep(w: World, seat: number, by: number): { x: number; y: number } {
  const a = castleAnchor(seat, w.layout);
  const cx = 960;
  const cy = 540;
  const len = Math.sqrt(d2(a, { x: cx, y: cy }));
  return { x: a.x + ((cx - a.x) / len) * by, y: a.y + ((cy - a.y) / len) * by };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('MED-1 · enemyCastleInReach — a unit at seat 1\'s keep strikes it only if seat 1 is an enemy', () => {
  /** Seat 0's tier-9 boss parked at seat 1's keep; how much keep HP seat 1 lost in 300 ticks. */
  function keepLoss(teams: (number | undefined)[]): number {
    const w = fourSeat(teams);
    const keep = w.players.get(P[1])!;
    const full = keep.castleHp;
    unit(w, P[0], besideKeep(w, 1, 30), 't9BossVampires' as CreatureType);
    ticks(w, 300);
    return full - keep.castleHp;
  }
  it('⛔ TEAMS — a teammate\'s keep is never struck', () => expect(keepLoss(TEAMS)).toBe(0));
  it('CONTROL — FFA, the same keep is an enemy\'s and takes the boss\'s swings', () => expect(keepLoss(FFA)).toBeGreaterThan(0));
});

describe('MED-1 · enemyCastleMarchPos — an idle unit never marches on a teammate\'s keep', () => {
  /** Seat 0's unit starts 200 px from seat 1's keep (its NEAREST keep); its distance to that keep after 180 ticks
   *  (short enough that, sent toward an enemy keep, it has not yet reached that keep's gun). */
  function distToSeat1Keep(teams: (number | undefined)[]): number {
    const w = fourSeat(teams);
    const c = unit(w, P[0], besideKeep(w, 1, 200), 'goblinMelee');
    ticks(w, 180);
    const now = w.creatures.get(c.id);
    if (now === undefined) return -1;
    return Math.sqrt(d2(now.pos, castleAnchor(1, w.layout)));
  }
  it('⛔ TEAMS — it walks AWAY from the friendly keep, toward an enemy\'s', () => {
    expect(distToSeat1Keep(TEAMS)).toBeGreaterThan(200);
  });
  it('CONTROL — FFA, seat 1 is the nearest ENEMY keep and the unit closes on it', () => {
    const d = distToSeat1Keep(FFA);
    expect(d === -1 || d < 200, `ended ${d} px from the keep (−1 = killed at it by its gun)`).toBe(true);
  });
});

describe('MED-1 · killableDefenderInReach — a unit beside a Helga swings at her only if she is an enemy\'s', () => {
  /** Helga of seat 1 at open ground in seat 0's quadrant, seat 0's unit beside her; her pool lost in 300 ticks. */
  function helgaLoss(teams: (number | undefined)[]): number {
    const w = fourSeat(teams);
    const at = { x: 600, y: 330 };
    const home = addPrim(w, 1, at.x, at.y);
    const h = makeDefender({
      id: asDefenderId(1), kind: 'princess', ownerPlayerId: P[1], anchorPrimitiveId: home.id,
      recipeId: 'helga', pos: { ...at }, registeredAtTick: w.tick,
    });
    w.defenders.set(h.id, h);
    const full = h.ehp!;
    const spot = { x: at.x + 12, y: at.y };
    const c = unit(w, P[0], spot, 't3Warband');
    // ⚠ The unit AND Helga are PINNED side by side every tick (she walks to her own targets otherwise). Navigation is team-aware too (it marches an idle unit on
    // an ENEMY keep), so an unpinned unit simply walks away from a teammate's Helga and the pair would pass
    // without ever consulting `killableDefenderInReach` — the audit's exact finding. Pinned, the engage and
    // strike decision is that function's alone.
    ticks(w, 300, () => {
      c.pos.x = spot.x; c.pos.y = spot.y;
      const hh = w.defenders.get(h.id);
      if (hh !== undefined) { hh.pos.x = at.x; hh.pos.y = at.y; }
    });
    return full - (w.defenders.get(h.id)?.ehp ?? 0);
  }
  it('⛔ TEAMS — a teammate\'s Helga is never struck', () => expect(helgaLoss(TEAMS)).toBe(0));
  it('CONTROL — FFA, the same Helga is an enemy\'s and is struck', () => expect(helgaLoss(FFA)).toBeGreaterThan(0));

  /*
   * ⚠ WHY A SECOND PAIR. Through the host tick this decision is defended in depth: Helga's own walk and the
   * unit's march are team-aware, so with `killableDefenderInReach` reverted the two still drift apart before a
   * strike lands and the pair above stays green (measured: the reverted unit reaches ATTACKING on her, then
   * the two separate). The STRIKE is the function's alone — `applyCreatureAttack`'s defender arm — so this
   * pair drives the real reducer through `dispatch` with the unit already ATTACKING beside her.
   */
  function strikeLoss(teams: (number | undefined)[]): number {
    const w = fourSeat(teams);
    const at = { x: 600, y: 330 };
    const home = addPrim(w, 1, at.x, at.y);
    const h = makeDefender({
      id: asDefenderId(1), kind: 'princess', ownerPlayerId: P[1], anchorPrimitiveId: home.id,
      recipeId: 'helga', pos: { ...at }, registeredAtTick: w.tick,
    });
    w.defenders.set(h.id, h);
    const full = h.ehp!;
    const c = unit(w, P[0], { x: at.x + 12, y: at.y }, 't3Warband');
    c.state = 'ATTACKING';
    dispatch(w, { type: 'CREATURE_ATTACK', creatureId: c.id, bondId: null });
    return full - (w.defenders.get(h.id)?.ehp ?? 0);
  }
  it('⛔ TEAMS — the strike reducer never lands on a teammate\'s Helga', () => expect(strikeLoss(TEAMS)).toBe(0));
  it('CONTROL — FFA, the same strike lands on her', () => expect(strikeLoss(FFA)).toBeGreaterThan(0));
});

describe('MED-1 · territory — a seat\'s territory never sags a teammate\'s bond', () => {
  /** Seat 0's shape projects territory; seat 1's bond sits inside it. Its multiplier after one host tick. */
  function multiplier(teams: (number | undefined)[]): number {
    const w = fourSeat(teams);
    addPrim(w, 0, 600, 330);
    const a = addPrim(w, 1, 620, 330);
    const b = addPrim(w, 1, 650, 330);
    const bond = addBond(w, a, b);
    ticks(w, 1);
    return bond.stiffnessMultiplier ?? 1;
  }
  it('⛔ TEAMS — a teammate\'s bond inside your territory keeps full stiffness', () => expect(multiplier(TEAMS)).toBe(1));
  it('CONTROL — FFA, the same bond is an enemy\'s and sags', () => expect(multiplier(FFA)).toBe(TERRITORY_ENGULF_STIFFNESS));
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('LOW-2 · the Voltkin never cuts a weld that has a TEAMMATE\'s end (⚠ MINE, R192-T1)', () => {
  /** A weld between seat 1's shape and seat 2's shape, seat 0's Voltkin beside it; the weld's damage after 600 ticks. */
  function weldHit(teams: (number | undefined)[]): { banked: number; standing: boolean } {
    const w = fourSeat(teams);
    const mate = addPrim(w, 1, 600, 330);
    const foe = addPrim(w, 2, 640, 330);
    const id = weld(w, mate, foe);
    const full = w.bonds.get(id)!;
    unit(w, P[0], { x: 620, y: 380 }, 'voltkin');
    ticks(w, 600);
    const b = w.bonds.get(id);
    return { banked: b?.damageFifths ?? -1, standing: b !== undefined && full === b };
  }
  it('⛔ TEAMS — a teammate+enemy weld is not his target: untouched', () => {
    expect(weldHit(TEAMS)).toEqual({ banked: 0, standing: true });
  });
  it('CONTROL — FFA, seat 1 is an enemy too, so the same weld is cut or damaged', () => {
    const r = weldHit(FFA);
    expect(!r.standing || r.banked > 0, JSON.stringify(r)).toBe(true);
  });
});
