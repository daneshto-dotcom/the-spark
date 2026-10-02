/**
 * SPARK — S194 (T8, owner C): a seat knocked out mid pants-wave. Fixtures (board, deps, toFightEdge,
 * pants, unkillable) are copied from `endgameS193.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { MONSTER_EMERGE_TICKS, PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import { makeGameStateExtras } from './gameState.ts';
import { monstersLeftToComeOut, monstersPerSeatForWave } from './endgame.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import type { Creature } from './creatures/creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(seats = 2): World {
  const world = makeWorld(0x193);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  if (seats === 2) dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  else dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1) });
  world.gameState = 'PLAYING';
  world.draft = null;
  return world;
}

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function toFightEdge(world: World, wave: number): void {
  world.waveNumber = wave;
  world.matchPhase = 'BUILD';
  world.draft = null;
  world.phaseEndsAtTick = world.tick + 1;
}

const pants = (w: World): Creature[] => [...w.creatures.values()].filter((c) => c.type === 'endgameMonster');
const unkillable = (w: World): void => { for (const p of w.players.values()) p.castleHp = 1_000_000_000; };

import { monsterLaneSeats, monstersLeftForSeat, monsterVictimSeat } from './endgame.ts';

/**
 * S194 (T8, owner C) — *"if there's still pants that are supposedly queued, then they stop coming, but the
 * existing ones just keep attacking."* A seat knocked out mid pants-wave: its un-emerged pants never come,
 * its emerged ones retarget to the survivors, and the SURVIVORS' share and pace do not move.
 *
 * Arithmetic (3 seats, wave 27 = 10 each = 30 slots on 3 fixed lanes): seat 2 falls at 4/4/4 out → seat 2
 * stops at 4 (its 6 queued are skipped), seats 0 and 1 still get 10 each. Before S194 the lanes were the
 * LIVING seats and the 12 already out counted against 10 × 2 = 20, so the survivors got 8 each.
 */
const P2 = asPlayerId(2);
function runWave(fallAt: number | null): { born: Map<number, number>; atFall: { left: number; mine: (number | null)[] } | null; retargeted: boolean | null; endedOnBuild: boolean } {
  const world = board(3);
  toFightEdge(world, 27);
  unkillable(world);
  const d = deps();
  const st = makeHostTickState(world);
  const seen = new Set<number>();
  const born = new Map<number, number>();
  let atFall: { left: number; mine: (number | null)[] } | null = null;
  let retargeted: boolean | null = null;
  let fell = false;
  for (let t = 0; t < 6000; t++) {
    runHostTick(world, d, st);
    for (const c of pants(world)) {
      const id = c.id as unknown as number;
      if (seen.has(id)) continue;
      seen.add(id);
      const s = c.monsterSeat as unknown as number;
      born.set(s, (born.get(s) ?? 0) + 1);
    }
    if (fallAt !== null && !fell && [0, 1, 2].every((s) => (born.get(s) ?? 0) >= fallAt)) {
      world.players.get(P2)!.castleHp = 0;
      fell = true;
      atFall = { left: monstersLeftToComeOut(world), mine: [P0, P1, P2].map((s) => monstersLeftForSeat(world, s)) };
      for (let k = 0; k < 2 * MONSTER_EMERGE_TICKS; k++) runHostTick(world, d, st); // past the emerge + a rescan
      const orphans = pants(world).filter((c) => c.monsterSeat === P2);
      const keep2 = castleAnchor(2, world.layout);
      retargeted = orphans.length > 0 && orphans.every((c) => {
        const v = monsterVictimSeat(world, c);
        const tp = c.targetPos;
        return v !== null && v !== P2 && (tp === null || Math.hypot(tp.x - keep2.x, tp.y - keep2.y) > 60);
      });
    }
    if (world.matchPhase !== 'FIGHT') return { born, atFall, retargeted, endedOnBuild: world.matchPhase === 'BUILD' };
  }
  throw new Error('fixture: the wave never ended');
}

describe('S194 T8 C — a seat knocked out mid pants-wave (REACH through runHostTick)', () => {
  it('⭐ its queued pants stop, its emerged pants retarget, each survivor still gets his full 10', () => {
    const r = runWave(4);
    expect(r.atFall, 'fixture: the seat fell mid-wave').not.toBeNull();
    expect(r.born.get(2)).toBe(4);
    expect(r.born.get(0)).toBe(monstersPerSeatForWave(27));
    expect(r.born.get(1)).toBe(monstersPerSeatForWave(27));
    expect(r.atFall!.left, "the countdown drops to the survivors' 6 + 6").toBe(12);
    expect(r.atFall!.mine).toEqual([6, 6, null]);
    expect(r.retargeted, 'every emerged pants of the fallen seat now goes for a survivor').toBe(true);
    expect(r.endedOnBuild, 'the hold released and the wave ended').toBe(true);
  });

  it('negative: nobody falls → 10 / 10 / 10, three lanes', () => {
    const r = runWave(null);
    expect([0, 1, 2].map((s) => r.born.get(s))).toEqual([10, 10, 10]);
  });

  it('a seat that fell BEFORE the fight is no lane at all', () => {
    const world = board(3);
    world.players.get(P2)!.castleHp = 0;
    world.players.get(P2)!.eliminatedAtTick = 5;
    world.monsterFightStartTick = 100;
    expect(monsterLaneSeats(world)).toEqual([P0, P1]);
    world.players.get(P2)!.eliminatedAtTick = 150; // fell DURING the fight → still a lane (skipped)
    expect(monsterLaneSeats(world)).toEqual([P0, P1, P2]);
  });
});
