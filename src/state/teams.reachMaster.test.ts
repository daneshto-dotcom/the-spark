/**
 * ⭐⭐ S193 (owner R192-T1) — **THE ALLY EXEMPTION ON EVERY PREDICATE MASTER ADDED WHILE TEAMS WAS OPEN.**
 *
 * *"you also don't get damage … your towers don't attack each other, even though you're different colors,
 * different races."* — R192-T1. Master's S191–S192 work (212 commits) added five seat decisions after the
 * teams branch's base, and `git merge master` brought them in still asking "is this the SAME SEAT?":
 *
 *   1. `raColumnTargets` (`racial/raColumn.ts`) — the POWER OF RA / WRATH OF RA column;
 *   2. the PHARAOH BOSS's column, which "spares nobody" — ⚠ MINE: his own seat still burns, his TEAMMATES
 *      do not (the zombie boss's R138 posture, spec Q5);
 *   3. `planHubBlast` (`potatoLifecycle.ts`) — the lightning hub's 120-fifth split blast;
 *   4. `damageStinkCloud`'s R2-C second spare — a bag the hub pops bursts without hitting the hub owner;
 *   5. `botScorchTarget` (`bots/botScorchedEarth.ts`) — the bot would aim its once-a-FIGHT scorch at a
 *      teammate's zone.
 * (`isScorchImmune` is pinned in `racial/scorchedEarthResistance.test.ts`; CARRY-1 in `severWithCarry` stays
 * on the struck bond's OWNER — narrower than a team, so it cannot reach an ally; classified in the census.)
 *
 * Every REACH case has its CONTROL: the same setup in a FREE-FOR-ALL (or with an enemy), which MUST take the
 * hit — a no-friendly-fire assertion with no control is green on a board where nothing hurts anything.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { PLAYER_COLORS, STRUCTURE_SELFDESTRUCT_RADIUS } from '../constants.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId, type StinkCloudId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import { generalPickForWave } from './draft.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import { raColumnImpactTick, raColumnPos } from './bossSkillsPharaohRitual.ts';
import { raColumnTargets, raSplitShares, raStrikeColumnPos, RA_PERK_STRIKE_FIFTHS } from './racial/powerOfRa.ts';
import { landRaColumn } from './racial/raColumn.ts';
import { planHubBlast } from './potatoLifecycle.ts';
import { damageStinkCloud } from './damage.ts';
import { makeStinkCloud } from './defenders/stinkCloud.ts';
import { botScorchTarget } from '../bots/botScorchedEarth.ts';

const P = [0, 1, 2, 3].map((s) => asPlayerId(s));
const FFA: (number | undefined)[] = [undefined, undefined, undefined, undefined];

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** Four seats, seat 0 MUMMIES holding POWER OF RA; teams as given (default 0+1 vs 2+3); FIGHT; empty board. */
function fourSeat(teams: (number | undefined)[] = [0, 0, 1, 1]): World {
  const w = makeWorld(0x5193);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({
      seat: s, color: PLAYER_COLORS[s]!, raceId: s === 0 ? 'mummies' : 'orcs',
      ...(teams[s] !== undefined ? { team: teams[s] } : {}),
    })),
    botSeats: [1, 2, 3],
  } as never);
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P[0]!, pick: 'racial' });
  for (const s of [1, 2, 3]) dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P[s]!, pick: generalPickForWave(1) });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.draft = null;
  return w;
}

let sentinel = 9800;
/** A held (stunned) victim with a deep pool, so a share shows as an exact ehp loss. */
function victim(w: World, owner: PlayerId, at: { x: number; y: number }): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: owner,
    pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: asSpawnerId(sentinel++),
  });
  const id = [...w.creatures.keys()].at(-1)!;
  const c = w.creatures.get(id)!;
  c.ehp = 10_000;
  c.maxEhp = 10_000;
  c.stunnedUntilTick = w.tick + 1_000_000;
  return id;
}
const lost = (w: World, id: CreatureId): number => 10_000 - (w.creatures.get(id)?.ehp ?? 0);

function tickTo(w: World, d: HostTickDeps, s: HostTickState, target: number): void {
  let guard = 0;
  while (w.tick < target) {
    runHostTick(w, d, s);
    if (++guard > 100_000) throw new Error('tickTo ran away');
  }
}

const AIM = { x: 960, y: 260 };

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — 1 · the POWER OF RA column (raColumnTargets) through the REAL host tick', () => {
  function column0(teams: (number | undefined)[]): { mate: CreatureId; foe: CreatureId; w: World } {
    const w = fourSeat(teams);
    const d = deps();
    const s = makeHostTickState(w);
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P[0]!, x: AIM.x, y: AIM.y });
    const strike = w.players.get(P[0]!)!.raStrikes[0];
    expect(strike, 'anti-vacuity: the cast was accepted').toBeDefined();
    const spot = raStrikeColumnPos(P[0]!, 0, strike!);
    tickTo(w, d, s, raColumnImpactTick(strike!.untilTick, 0) - 1);
    const mate = victim(w, P[1]!, spot);
    const foe = victim(w, P[2]!, { x: spot.x, y: spot.y + 10 });
    runHostTick(w, d, s);
    return { mate, foe, w };
  }

  it('⛔ a TEAMMATE under the column takes nothing AND is not counted — the enemy takes the whole 35', () => {
    const { mate, foe, w } = column0([0, 0, 1, 1]);
    expect(lost(w, mate), 'R192-T1: the column spares the caster’s team').toBe(0);
    expect(lost(w, foe), 'one target → the whole pool').toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('CONTROL — the same two in a free-for-all split it 18 / 17', () => {
    const { mate, foe, w } = column0(FFA);
    const [a, b] = raSplitShares(RA_PERK_STRIKE_FIFTHS, 2);
    expect(lost(w, mate), 'seat 1 is an enemy now — nearer, so the remainder').toBe(a);
    expect(lost(w, foe)).toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — 2 · ⚠ MINE — the PHARAOH BOSS column "spares nobody" … except his seat’s TEAMMATES', () => {
  function ritualColumn0(teams: (number | undefined)[]): { own: CreatureId; mate: CreatureId; foe: CreatureId; w: World } {
    const w = fourSeat(teams);
    const d = deps();
    const s = makeHostTickState(w);
    const at = { x: 600, y: 330 };
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 't9BossMummies' as never, ownerPlayerId: P[0]!,
      pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: asSpawnerId(sentinel++),
    });
    const boss = [...w.creatures.keys()].at(-1)!;
    damageCreature(w, boss, 100_000); // the killing blow starts the ritual
    const until = w.creatures.get(boss)!.raRitualUntilTick;
    expect(until, 'anti-vacuity: the ritual started').toBeDefined();
    // Placed ONE tick before the column, so nothing else on the board (his seat's other attackers) has
    // time to touch them — the shares then read as exact numbers (the S191 split test's discipline).
    // The circle is centred on where he stands AT LANDING (he drifts while channelling).
    tickTo(w, d, s, raColumnImpactTick(until!, 0) - 1);
    const b = w.creatures.get(boss)!;
    const spot = raColumnPos(boss as unknown as number, 0, b.pos.x, b.pos.y);
    const own = victim(w, P[0]!, spot);
    const mate = victim(w, P[1]!, { x: spot.x + 6, y: spot.y });
    const foe = victim(w, P[2]!, { x: spot.x - 6, y: spot.y });
    runHostTick(w, d, s);
    return { own, mate, foe, w };
  }

  it('⛔ his own seat still burns (R171 "kills everything"), his TEAMMATE does not (R192-T1), the enemy does', () => {
    const { own, mate, foe, w } = ritualColumn0([0, 0, 1, 1]);
    expect(lost(w, mate), 'teammates never damage each other').toBe(0);
    expect(lost(w, own), 'his own side is not spared').toBeGreaterThan(0);
    expect(lost(w, foe)).toBeGreaterThan(0);
    expect(lost(w, own) + lost(w, foe), 'two targets share the one column (the teammate is not counted)').toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('CONTROL — in a free-for-all all three take a share (byte-identical to master: spare nobody)', () => {
    const { own, mate, foe, w } = ritualColumn0(FFA);
    for (const id of [own, mate, foe]) expect(lost(w, id)).toBeGreaterThan(0);
    expect(lost(w, own) + lost(w, mate) + lost(w, foe)).toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('the pure planner: `alliesOf` drops ONLY the teammate; `null` is master’s "spare nobody"', () => {
    const w = fourSeat([0, 0, 1, 1]);
    const at = { x: 600, y: 330 };
    const own = victim(w, P[0]!, at);
    const mate = victim(w, P[1]!, { x: at.x + 4, y: at.y });
    const foe = victim(w, P[2]!, { x: at.x - 8, y: at.y });
    const ids = (alliesOf: PlayerId | null): number[] => raColumnTargets(w, null, at, alliesOf).map((t) => t.id);
    expect(ids(P[0]!)).toEqual([own, foe].map(Number));
    expect(ids(null)).toEqual([own, mate, foe].map(Number));
    // and the perk's `spare` spares the caster's whole team
    expect(raColumnTargets(w, P[0]!, at).map((t) => t.id)).toEqual([foe].map(Number));
    // landRaColumn REQUIRES the field (tsc) and threads it: the boss source on this board
    expect(landRaColumn(w, { spare: null, alliesOf: P[0]!, owner: P[0]!, severCause: 'unit' }, at)).toBe(RA_PERK_STRIKE_FIFTHS);
    expect(lost(w, mate)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — 3 · the LIGHTNING HUB blast (planHubBlast) spares the owner’s TEAM', () => {
  function hubBlast(teams: (number | undefined)[]): { mate: CreatureId; foe: CreatureId; w: World } {
    const w = fourSeat(teams);
    const at = { x: 600, y: 330 };
    const mate = victim(w, P[1]!, { x: at.x + 20, y: at.y });
    const foe = victim(w, P[2]!, { x: at.x - 20, y: at.y });
    dispatch(w, { type: 'STRUCTURE_SELFDESTRUCT', blast: 'ladder', pos: at, radius: STRUCTURE_SELFDESTRUCT_RADIUS, ownerPlayerId: P[0]! });
    return { mate, foe, w };
  }

  it('⛔ through the reducer: the teammate takes nothing; the enemy takes the whole 120 alone', () => {
    const { mate, foe, w } = hubBlast([0, 0, 1, 1]);
    expect(lost(w, mate)).toBe(0);
    expect(lost(w, foe)).toBe(120);
  });

  it('CONTROL — free-for-all: both are enemies of the hub owner and split it', () => {
    const { mate, foe, w } = hubBlast(FFA);
    expect(lost(w, mate) + lost(w, foe)).toBe(120);
    expect(lost(w, mate)).toBeGreaterThan(0);
  });

  it('the planner never lists a teammate’s unit (pure)', () => {
    const w = fourSeat([0, 0, 1, 1]);
    const at = { x: 600, y: 330 };
    const mate = victim(w, P[1]!, at);
    expect(planHubBlast(w, at.x, at.y, 240, P[0]!).map((t) => t.id)).not.toContain(mate as unknown as number);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — 4 · a bag the hub POPS (R2-C `burstAlsoSpares`) spares the hub owner’s TEAM too', () => {
  function pop(teams: (number | undefined)[]): { mate: CreatureId; other: CreatureId; w: World } {
    const w = fourSeat(teams);
    const at = { x: 600, y: 330 };
    const id = 4242 as unknown as StinkCloudId;
    w.stinkClouds.set(id, makeStinkCloud({ id, pos: at, ownerPlayerId: P[2]!, landedAtTick: w.tick, radius: 90 }));
    const mate = victim(w, P[1]!, { x: at.x + 10, y: at.y });
    const other = victim(w, P[3]!, { x: at.x - 10, y: at.y });
    expect(damageStinkCloud(w, id, 10_000, null, P[0]!), 'anti-vacuity: the bag burst').toBe(true);
    return { mate, other, w };
  }

  it('⛔ teams [0,0,1,2] — the hub owner’s teammate (seat 1) is spared; seat 3 (nobody’s friend) is hit', () => {
    const { mate, other, w } = pop([0, 0, 1, 2]);
    expect(lost(w, mate)).toBe(0);
    expect(lost(w, other)).toBeGreaterThan(0);
  });

  it('CONTROL — free-for-all: seat 1 is just another seat, and the burst hits it', () => {
    const { mate, w } = pop(FFA);
    expect(lost(w, mate)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — 5 · a BOT never aims its SCORCHED EARTH at a teammate’s zone', () => {
  function pick(teams: (number | undefined)[]): PlayerId | null {
    const w = fourSeat(teams);
    w.scoreByPlayer.set(P[1]!, 900); // the teammate leads the table
    w.scoreByPlayer.set(P[2]!, 300);
    w.scoreByPlayer.set(P[3]!, 100);
    return botScorchTarget(w, P[0]!);
  }

  it('⛔ with the leader on its own team it picks the best ENEMY', () => {
    expect(pick([0, 0, 1, 1])).toBe(P[2]);
  });

  it('CONTROL — free-for-all: the leader IS an enemy, and it is picked', () => {
    expect(pick(FFA)).toBe(P[1]);
  });
});
