/**
 * SPARK — ⭐ S194 R194-27: the two pants-targeting perf fixes change the COST, never the VERDICT.
 *
 *   1. `victimUnit` reads a per-tick index of each seat's creatures (`ownedBy`, invalidated by tick and by
 *      `nextCreatureId`; a creature that died mid-tick is skipped at use) instead of scanning the map.
 *   2. `monsterVictimSeat` answers "my seat is alive" without building the living-seat list.
 *
 * DIFFERENTIAL through the real host tick: the same 4-seat wave-31 board — pants walking into each seat's
 * soldiers, soldiers dying, new pants born mid-tick — run twice, memo ON vs memo OFF (rebuilt every call,
 * i.e. the old scan's candidate set). The wide hash must agree on every sampled tick.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { monsterVictimSeat } from './endgame.ts';
import { __ownedIndexMemo, MONSTER_OWNER_ID, runEndgameMonsterTargeting } from './endgameMonsters.ts';
import { livingSeats } from './elimination.ts';
import { makeGameStateExtras } from './gameState.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { castleSpawnerId } from './raceUnitEmit.ts';
import { mulberry32 } from './rng.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { dispatch, makeWorld } from './world.ts';

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function run(memo: boolean): { hashes: number[]; engaged: number } {
  __ownedIndexMemo.enabled = memo;
  try {
    const w = makeWorld(0x194f);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1, 2, 3],
    });
    w.gameState = 'PLAYING';
    w.draft = null;
    w.waveNumber = 31;
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1;
    for (const p of w.players.values()) p.castleHp = 1e9;
    const d = deps();
    const st = makeHostTickState(w);
    const hashes: number[] = [];
    let engaged = 0;
    for (let t = 0; t < 900; t++) {
      // a trickle of soldiers on the pants' road, every seat, so units are acquired, fought and lost
      if (t % 45 === 0) {
        for (let s = 0; s < 4; s++) {
          const a = castleAnchor(s, w.layout);
          const at = { x: a.x + (960 - a.x) * 0.25, y: a.y + (540 - a.y) * 0.25 };
          dispatch(w, {
            type: 'SPAWN_CREATURE', creatureType: 'raceUnit', ownerPlayerId: asPlayerId(s),
            pos: at, targetPos: at, sourceSpawnerId: castleSpawnerId(s),
          });
        }
      }
      runHostTick(w, d, st);
      for (const c of w.creatures.values()) if (c.type === 'endgameMonster' && c.targetCreatureId !== null) engaged++;
      if (t % 15 === 0) hashes.push(hashWorldStateFull(w));
      w.effects.length = 0;
    }
    return { hashes, engaged };
  } finally {
    __ownedIndexMemo.enabled = true;
  }
}

describe('⭐ S194 R194-27 — the perf fixes are verdict-identical', () => {
  it('DIFFERENTIAL: memo ON and memo OFF produce the same world, hash for hash, over 900 ticks', () => {
    const on = run(true);
    const off = run(false);
    expect(on.engaged, 'anti-vacuity: pants really acquired soldiers').toBeGreaterThan(100);
    expect(on.hashes).toEqual(off.hashes);
    expect(on.engaged).toBe(off.engaged);
  });

  it('monsterVictimSeat: the fast path agrees with the living-list rule, seat alive or fallen', () => {
    const w = makeWorld(1);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1, 2],
    });
    const rule = (seat: PlayerId | undefined, id: number): PlayerId | null => {
      const living = livingSeats(w);
      if (living.length === 0) return null;
      if (seat !== undefined && living.includes(seat)) return seat;
      return monsterVictimSeat(w, { id: id as never, monsterSeat: undefined });
    };
    for (const fallen of [[], [1], [0, 2], [0, 1, 2]] as const) {
      for (const p of w.players.values()) p.castleHp = 100;
      for (const f of fallen) w.players.get(asPlayerId(f))!.castleHp = 0;
      for (const seat of [undefined, 0, 1, 2, 7]) {
        for (let id = 0; id < 20; id++) {
          const s = seat === undefined ? undefined : asPlayerId(seat);
          expect(monsterVictimSeat(w, { id: id as never, monsterSeat: s }), `fallen ${fallen} seat ${seat} id ${id}`).toBe(rule(s, id));
        }
      }
    }
  });
});

describe('⭐ S194 R194-27 — the owned-unit index is invalidated by a mid-tick birth and skips a mid-tick death', () => {
  it('same tick: a soldier born after the index was built is still acquired; one that died is not', () => {
    const w = makeWorld(7);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1],
    });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.waveNumber = 31;
    const a = castleAnchor(0, w.layout);
    const at = { x: a.x + 200, y: a.y + 100 };
    const pantsId = w.nextCreatureId as unknown as number;
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'endgameMonster', ownerPlayerId: MONSTER_OWNER_ID,
      pos: { ...at }, targetPos: { ...a }, sourceSpawnerId: null, monsterSeat: asPlayerId(0),
    });
    const pants = w.creatures.get(pantsId as never)!;
    runEndgameMonsterTargeting(w, pants); // builds the index: seat 0 owns nothing yet
    expect(pants.targetCreatureId).toBeNull();
    const soldierId = w.nextCreatureId as unknown as number;
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'raceUnit', ownerPlayerId: asPlayerId(0),
      pos: { x: at.x + 10, y: at.y }, targetPos: { x: at.x + 10, y: at.y }, sourceSpawnerId: castleSpawnerId(0),
    });
    runEndgameMonsterTargeting(w, pants); // SAME tick: the birth must be seen
    expect(pants.targetCreatureId as unknown as number).toBe(soldierId);
    dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: soldierId as never });
    pants.targetCreatureId = null;
    runEndgameMonsterTargeting(w, pants); // SAME tick: the death must be seen
    expect(pants.targetCreatureId).toBeNull();
  });
});
