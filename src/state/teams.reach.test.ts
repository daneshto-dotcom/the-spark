/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **TEAMS, PROVEN THROUGH THE REAL HOST TICK.**
 *
 * *"you also don't get damage … Your towers don't attack each other, even though you're different
 * colors, different races."* (R192-T1) · *"there's no wall between you and your … teammate zone"* (T2).
 *
 * Every REACH test here has a CONTROL beside it: the identical setup with an ENEMY instead of a
 * teammate, which MUST take the hit. A no-friendly-fire assertion with no control would be green on a
 * board where nobody can hurt anybody at all.
 *
 * Board: four seats, `QUADRANTS_4P` (TL 0 · TR 1 · BR 2 · BL 3), teams [A, A, B, B] — seats 0 and 1 are
 * teammates and share the north wall; seats 2 and 3 are the enemy.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { applyRadialDamage } from './damage.ts';
import { makeDefender } from './defenders/defender.ts';
import { addPrim } from './s191PerfOracle.fixtures.ts';
import { asDefenderId } from '../types.ts';
import { wallSegments, wallSeparatesSides } from './walls.ts';
import { netSnapshot, applyNetSnapshot } from './save.ts';
import {
  arrangeTeamSeats, isEnemySeat, normalizeTeams, sameTeam, sameTeamColor, teamOf, teamsPlayable,
} from './teams.ts';

const P = [0, 1, 2, 3].map((s) => asPlayerId(s));

/** A four-seat match, seats 0+1 vs 2+3 (or `teams` as given), in FIGHT, nothing on the board. */
function fourSeat(teams: (number | undefined)[] = [0, 0, 1, 1]): World {
  const w = makeWorld(0x5192);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s], ...(teams[s] !== undefined ? { team: teams[s] } : {}) })),
    botSeats: [1, 2, 3],
  });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 10;
  w.creatures.clear();
  w.draft = null;
  return w;
}

function unit(w: World, owner: PlayerId, at: { x: number; y: number }, type: CreatureType = 'goblinMelee', held = false): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  if (held) c.stunnedUntilTick = w.tick + 1_000_000;
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
  for (let i = 0; i < n; i++) { runHostTick(w, d, st); each?.(); }
}

/** Open ground in seat 0's quadrant, > 300 px (the castle gun) from every keep. */
const OPEN = { x: 600, y: 330 };

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 teams — the predicate', () => {
  it('free-for-all: sameTeam is exactly seat equality', () => {
    const w = { teams: undefined };
    expect(sameTeam(w, P[0], P[0])).toBe(true);
    expect(sameTeam(w, P[0], P[1])).toBe(false);
    expect(sameTeam(w, undefined, P[0])).toBe(false);
    expect(isEnemySeat(w, P[2], P[3])).toBe(true);
  });

  it('teams: teammates are one side, the rest are enemies', () => {
    const w = { teams: [0, 0, 1, 1] };
    expect(sameTeam(w, P[0], P[1])).toBe(true);
    expect(sameTeam(w, P[2], P[3])).toBe(true);
    expect(sameTeam(w, P[1], P[2])).toBe(false);
    expect(sameTeam(w, P[0], undefined)).toBe(false);
    expect(sameTeam(w, P[0], 9)).toBe(false); // a seat with no entry is nobody's teammate
  });

  it('sameTeamColor maps a colour to its seat — only when teams are on', () => {
    const w = fourSeat();
    expect(sameTeamColor(w, PLAYER_COLORS[0], PLAYER_COLORS[1])).toBe(true);
    expect(sameTeamColor(w, PLAYER_COLORS[0], PLAYER_COLORS[2])).toBe(false);
    expect(sameTeamColor(w, PLAYER_COLORS[0], 0x123456)).toBe(false); // nobody wears it
    const ffa = fourSeat([undefined, undefined, undefined, undefined]);
    expect(sameTeamColor(ffa, PLAYER_COLORS[0], PLAYER_COLORS[1])).toBe(false);
    expect(sameTeamColor(ffa, PLAYER_COLORS[0], PLAYER_COLORS[0])).toBe(true);
  });

  it('normalizeTeams: nobody shares → FFA; everyone on one team → FFA (Q2); a real split → the list', () => {
    expect(normalizeTeams([], 4)).toBeUndefined();
    expect(normalizeTeams([0, 1, 2, 3], 4)).toBeUndefined();
    expect(normalizeTeams([2, 2, 2, 2], 4)).toBeUndefined();
    expect(normalizeTeams([0, 0, 1, 1], 4)).toEqual([0, 0, 1, 1]);
    expect(normalizeTeams([0, 0, undefined, undefined], 4)).toEqual([0, 0, 4, 5]); // unpicked = alone
    expect(normalizeTeams([0, 0], 1)).toBeUndefined();
    expect(teamsPlayable([1, 1, 1], 3)).toBe(false);
    expect(teamsPlayable([1, 1, undefined], 3)).toBe(true);
  });

  it('⚠ MINE — arrangeTeamSeats puts teammates side by side, host fixed, host team on the LEFT', () => {
    // seats 0+1 vs 2+3 → host's teammate moves to BL (seat 3): TL+BL vs TR+BR
    const order = arrangeTeamSeats([0, 0, 1, 1]);
    expect(order[0]).toBe(0);
    const teamsAfter = order.map((old) => [0, 0, 1, 1][old]);
    expect(teamsAfter[0]).toBe(teamsAfter[3]);
    expect(teamsAfter[1]).toBe(teamsAfter[2]);
    // a diagonal pair (0 and 2) is never left on the diagonal
    const o2 = arrangeTeamSeats([0, 1, 0, 1]);
    const t2 = o2.map((old) => [0, 1, 0, 1][old]);
    expect(t2[0]).not.toBe(t2[2]);
    // no shared team → the identity, so a free-for-all lobby seats exactly as before
    expect(arrangeTeamSeats([undefined, undefined, undefined, undefined])).toEqual([0, 1, 2, 3]);
    expect(arrangeTeamSeats([0, 1])).toEqual([0, 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 teams — START_GAME, snapshot, title', () => {
  it('the host roster stamps world.teams; an FFA roster leaves it undefined; title clears it', () => {
    const w = fourSeat();
    expect(w.teams).toEqual([0, 0, 1, 1]);
    expect(fourSeat([undefined, undefined, undefined, undefined]).teams).toBeUndefined();
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.teams).toBeUndefined();
  });

  it('teams ride the snapshot to a joiner; an FFA snapshot carries no key', () => {
    const host = fourSeat();
    const snap = netSnapshot(host);
    expect(snap.teams).toEqual([0, 0, 1, 1]);
    const joiner = makeWorld(1);
    applyNetSnapshot(snap, joiner);
    expect(joiner.teams).toEqual([0, 0, 1, 1]);
    const ffa = netSnapshot(fourSeat([undefined, undefined, undefined, undefined]));
    expect('teams' in ffa).toBe(false);
  });

  it('⛔ a malformed snapshot teams list is dropped to the free-for-all, never trusted', () => {
    const host = fourSeat();
    const joiner = makeWorld(1);
    applyNetSnapshot({ ...netSnapshot(host), teams: [0, 'x' as unknown as number, 1, 1] }, joiner);
    expect(joiner.teams).toBeUndefined();
    applyNetSnapshot({ ...netSnapshot(host), teams: [0, 1, 2, 3] }, joiner); // nobody shares
    expect(joiner.teams).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 teams — ⭐ REACH through the real host tick: no friendly damage of any kind', () => {
  it('the fixture spot is out of every keep’s gun', () => {
    const w = fourSeat();
    for (const s of [0, 1, 2, 3]) {
      const a = castleAnchor(s, w.layout);
      expect(Math.hypot(a.x - OPEN.x, a.y - OPEN.y)).toBeGreaterThan(300);
    }
  });

  function melee(other: PlayerId): { mine: Creature; theirs: Creature; targetedEachOther: boolean; w: World } {
    const w = fourSeat();
    const mine = unit(w, P[0], OPEN);
    const theirs = unit(w, other, { x: OPEN.x + 20, y: OPEN.y });
    let targeted = false;
    ticks(w, 240, () => {
      const a = w.creatures.get(mine.id);
      const b = w.creatures.get(theirs.id);
      if (a?.targetCreatureId === theirs.id || b?.targetCreatureId === mine.id) targeted = true;
    });
    return { mine, theirs, targetedEachOther: targeted, w };
  }

  it('⛔ UNITS — two teammates side by side never target or hurt each other', () => {
    const { mine, theirs, targetedEachOther } = melee(P[1]);
    expect(targetedEachOther).toBe(false);
    expect(mine.ehp).toBe(mine.maxEhp ?? mine.ehp);
    expect(theirs.ehp).toBe(theirs.maxEhp ?? theirs.ehp);
  });

  it('CONTROL — the same two with an ENEMY instead do fight', () => {
    const fresh = fourSeat();
    const fullA = unit(fresh, P[0], OPEN).ehp;
    const { mine, theirs, targetedEachOther, w } = melee(P[2]);
    expect(targetedEachOther).toBe(true);
    const lost = (fullA - (w.creatures.get(mine.id)?.ehp ?? 0)) + (fullA - (w.creatures.get(theirs.id)?.ehp ?? 0));
    expect(lost).toBeGreaterThan(0);
  });

  function gunned(owner: PlayerId): number {
    const w = fourSeat();
    const a = castleAnchor(0, w.layout);
    const v = unit(w, owner, { x: a.x + 120, y: a.y + 60 }, 't3Warband', true);
    const full = v.ehp;
    ticks(w, 600);
    return full - (w.creatures.get(v.id)?.ehp ?? 0);
  }

  it('⛔ THE CASTLE GUN — a teammate standing at your keep is never shot', () => {
    expect(gunned(P[1])).toBe(0);
  });

  it('CONTROL — an enemy at the same spot is', () => {
    expect(gunned(P[2])).toBeGreaterThan(0);
  });

  function turretShot(owner: PlayerId): { lost: number; alive: boolean } {
    const w = fourSeat();
    const hub = addPrim(w, 0, OPEN.x, OPEN.y);
    const d = makeDefender({
      id: asDefenderId(1), kind: 'turret', ownerPlayerId: P[0], anchorPrimitiveId: hub.id,
      recipeId: 'laserTurret', pos: { ...OPEN }, registeredAtTick: w.tick,
    });
    w.defenders.set(d.id, d);
    const v = unit(w, owner, { x: OPEN.x + 150, y: OPEN.y }, 't3Warband', true);
    const full = v.ehp;
    ticks(w, 600);
    return { lost: full - (w.creatures.get(v.id)?.ehp ?? 0), alive: w.defenders.has(d.id) };
  }

  it('⛔ TOWERS — your laser turret never fires on a teammate', () => {
    expect(turretShot(P[1])).toEqual({ lost: 0, alive: true });
  });

  it('CONTROL — the same turret fires on an enemy', () => {
    const r = turretShot(P[2]);
    expect(r.alive, 'the fixture turret stood for the whole run').toBe(true);
    expect(r.lost).toBeGreaterThan(0);
  });

  it('⛔ AREA BLASTS — a blast that spares its owner spares the owner’s whole TEAM', () => {
    const w = fourSeat();
    const own = unit(w, P[0], OPEN, 't3Warband', true);
    const mate = unit(w, P[1], { x: OPEN.x + 5, y: OPEN.y }, 't3Warband', true);
    const foe = unit(w, P[2], { x: OPEN.x - 5, y: OPEN.y }, 't3Warband', true);
    const full = own.ehp;
    applyRadialDamage(w, OPEN.x, OPEN.y, 60, 10, 10, 'hazard', P[0], 'physical', 'flat');
    expect(own.ehp).toBe(full);
    expect(mate.ehp).toBe(full);
    expect(foe.ehp).toBe(full - 10);
  });

  it('⚠ MINE (Q5) — a "hurts everything" blast still hits its own seat but spares its TEAMMATES', () => {
    const w = fourSeat();
    const own = unit(w, P[0], OPEN, 't3Warband', true);
    const mate = unit(w, P[1], { x: OPEN.x + 5, y: OPEN.y }, 't3Warband', true);
    const foe = unit(w, P[2], { x: OPEN.x - 5, y: OPEN.y }, 't3Warband', true);
    const full = own.ehp;
    applyRadialDamage(w, OPEN.x, OPEN.y, 60, 10, 10, 'aura', null, 'physical', 'flat', null, P[0]); // S194 — alliesOf is the 12th arg since master's cls + falloff
    expect(own.ehp).toBe(full - 10);
    expect(mate.ehp).toBe(full);
    expect(foe.ehp).toBe(full - 10);
  });

  it('⛔ A ZOMBIE BOSS DEATH BLAST (R138) through the real host tick spares his teammates', () => {
    const w = fourSeat();
    const boss = unit(w, P[0], OPEN, 't9BossZombies' as CreatureType, true);
    const mate = unit(w, P[1], { x: OPEN.x + 30, y: OPEN.y }, 't3Warband', true);
    const foe = unit(w, P[2], { x: OPEN.x - 30, y: OPEN.y }, 't3Warband', true);
    // ONE host-tick state: the boss roster that notices his death lives in it.
    let n = 0;
    ticks(w, 4, () => { if (++n === 2) w.creatures.delete(boss.id); }); // alive for two ticks, then he dies
    expect(w.creatures.has(mate.id), 'teammate spared').toBe(true);
    expect(w.creatures.has(foe.id), 'CONTROL — the enemy is razed').toBe(false);
  });

  function scorched(victimOwner: PlayerId): number {
    const w = fourSeat();
    const demon = w.players.get(P[0])!;
    demon.raceId = 'demons';
    demon.draftPicks = ['racial'];
    const v = unit(w, victimOwner, OPEN, 't3Warband', true);
    const full = v.ehp;
    ticks(w, 900);
    return full - (w.creatures.get(v.id)?.ehp ?? 0);
  }

  it('⛔ SCORCHED GROUND — a demon teammate’s land does not burn you (supersedes T7)', () => {
    expect(scorched(P[1])).toBe(0);
  });

  it('CONTROL — an enemy in the same land burns', () => {
    expect(scorched(P[2])).toBeGreaterThan(0);
  });

  function raid(target: PlayerId): { spent: boolean; hit: boolean } {
    const w = fourSeat();
    const me = w.players.get(P[0])!;
    me.raidPoints = 3;
    const v = unit(w, target, OPEN, 't3Warband', true);
    const full = v.ehp;
    dispatch(w, { type: 'RAID_TARGET', target: { kind: 'creature', id: v.id }, playerId: P[0] });
    return { spent: me.raidPoints < 3, hit: (w.creatures.get(v.id)?.ehp ?? 0) < full };
  }

  it('⛔ RAIDS — a teammate’s unit cannot be raided, and the point is not spent', () => {
    expect(raid(P[1])).toEqual({ spent: false, hit: false });
  });

  it('CONTROL — an enemy’s unit can', () => {
    expect(raid(P[2])).toEqual({ spent: true, hit: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 teams — the wall and the win', () => {
  it('⭐ T2 — no wall between teammates; every other border stands', () => {
    const w = fourSeat();
    const shown = wallSegments(w.layout).map((s) => [s.zoneA, s.zoneB, wallSeparatesSides(w, s)]);
    expect(shown).toEqual([[0, 1, false], [1, 2, true], [3, 2, false], [0, 3, true]]);
    const ffa = fourSeat([undefined, undefined, undefined, undefined]);
    expect(wallSegments(ffa.layout).every((s) => wallSeparatesSides(ffa, s))).toBe(true);
  });

  it('⭐ Q1 — the match ends when one SIDE is left, and the lowest living seat of it names the winner', () => {
    const w = fourSeat();
    w.players.get(P[2])!.castleHp = 0;
    const extras = makeGameStateExtras();
    tickGameState(w, extras, P[0]);
    expect(w.gameState, 'one enemy keep down, its teammate still stands — play on').toBe('PLAYING');
    w.players.get(P[3])!.castleHp = 0;
    w.players.get(P[0])!.castleHp = 0; // even with the host fallen, seat 1 wins it for team A
    tickGameState(w, extras, P[0]);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P[1]);
    expect(teamOf(w, P[1])).toBe(0);
  });

  it('CONTROL — the free-for-all ends only at one seat standing', () => {
    const w = fourSeat([undefined, undefined, undefined, undefined]);
    w.players.get(P[2])!.castleHp = 0;
    w.players.get(P[3])!.castleHp = 0;
    tickGameState(w, makeGameStateExtras(), P[0]);
    expect(w.gameState).toBe('PLAYING');
  });
});
