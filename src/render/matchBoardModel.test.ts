/**
 * SPARK — ⭐ S191: the end-of-match stat board's MODEL.
 *
 * ⛔ THE REACH TEST FIRST. S182's recon named the trap: `WIN_TRIGGER` tears down defenders, gatherers, banks
 * and spawners before the first WIN frame, so a board built against a PLAYING world is green in every test
 * and EMPTY in the real game. The first case below therefore plays a real match through the real host tick,
 * ends it through the real `tickGameState` (win edge AND the 2 s dwell into POSTGAME), and only then asks
 * the model — on the host and on a peer that received the snapshot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { MONSTER_OWNER_SEAT, PHYSICS_HZ, phaseDurationTicks, winScoreForWave } from '../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId } from '../types.ts';
import { makeGameStateExtras, tickGameState } from '../state/gameState.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { recordDamage, recordKill, recordUnitBuilt } from '../state/matchStats.ts';
import { mulberry32 } from '../state/rng.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { MONSTER_COLOR, groupThousands, matchBoardModel, placeLabel } from './matchBoardModel.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(): World {
  const w = makeWorld(0x5191b);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

/** Plays a short real match to POSTGAME: a castle-gun kill, a tower, a wave edge, a score win, the dwell. */
function playedToPostgame(): World {
  const w = fightWorld();
  const anchor = castleAnchor(0, w.layout);
  const pos = { x: anchor.x + 10, y: anchor.y };
  dispatch(w, { type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P1, pos, targetPos: pos, sourceSpawnerId: asSpawnerId(1) });
  dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(0), recipeId: 'pentagram' });
  const deps = hostDeps();
  const st = makeHostTickState(w);
  for (let i = 0; i < 600 && w.creatures.size > 0; i++) runHostTick(w, deps, st);
  w.phaseEndsAtTick = w.tick + 1; // one real wave edge
  for (let i = 0; i < 3; i++) runHostTick(w, deps, st);
  const bar = winScoreForWave(w.waveNumber);
  w.scoreByPlayer.set(P0, bar + 5);
  w.scoreProgress = bar + 5;
  const extras = makeGameStateExtras();
  tickGameState(w, extras, P0); // PLAYING → WIN, and the teardown
  for (let i = 0; i <= PHYSICS_HZ * 2 && w.gameState === 'WIN'; i++) {
    w.tick += 1;
    tickGameState(w, extras, P0);
  }
  return w;
}

describe('S191 matchBoardModel — REACH: non-empty after a REAL win', () => {
  it('the host sees a full board in POSTGAME, towers included although the teardown cleared them', () => {
    const w = playedToPostgame();
    expect(w.gameState).toBe('POSTGAME');
    expect(w.creatureSpawners.size, 'the WIN teardown really ran').toBe(0);
    const m = matchBoardModel(w)!;
    expect(m).not.toBeNull();
    expect(m.noStats).toBe(false);
    expect(m.headline).toBe('PLAYER 1 WINS');
    expect(m.rows.map((r) => r.seat)).toEqual([P0, P1]);
    const [r0, r1] = m.rows;
    expect(r0!.isWinner).toBe(true);
    expect(r0!.kills).toBeGreaterThanOrEqual(1);
    expect(r0!.killsByType.find((k) => k.type === 'chewer')?.count).toBeGreaterThanOrEqual(1);
    expect(r0!.dealt).toBeGreaterThan(0);
    expect(r0!.towersBuilt).toBe(1);
    expect(r1!.units).toBeGreaterThanOrEqual(1);
    expect(r1!.taken).toBeGreaterThan(0);
    for (const g of Object.values(m.graphs)) {
      expect(g.waves.length, `${g.title} has the edge point and the win point`).toBeGreaterThanOrEqual(2);
      expect(g.series).toHaveLength(2);
    }
    expect(m.graphs.score.series[0]!.values.at(-1)).toBe(Math.floor(w.scoreByPlayer.get(P0)!));
  });

  it('a PEER that only received the POSTGAME snapshot builds the SAME board', () => {
    const w = playedToPostgame();
    const peer = makeWorld(0x5191b);
    dispatch(peer, { type: 'START_GAME', mode: '1v1', isHost: false });
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), peer);
    const host = matchBoardModel(w)!;
    const seen = matchBoardModel(peer)!;
    const strip = (m: typeof host) => ({ ...m, rows: m.rows.map((r) => ({ ...r, isLocal: false })) });
    expect(strip(seen)).toEqual(strip(host));
  });
});

describe('S191 matchBoardModel — the rules a player reads', () => {
  it('shows only in POSTGAME — the WIN banner lands on its own first', () => {
    const w = fightWorld();
    expect(matchBoardModel(w)).toBeNull();
    w.gameState = 'WIN';
    expect(matchBoardModel(w)).toBeNull();
    w.gameState = 'POSTGAME';
    expect(matchBoardModel(w)).not.toBeNull();
  });

  it('labels by SEAT (BOT for a bot), marks the local row, and says OUT with the wave for a fallen seat', () => {
    const w = fightWorld();
    w.botSeats.add(P1);
    w.localPlayerId = P0;
    w.lastWinnerId = P0;
    w.players.get(P1)!.eliminatedAtTick = w.tick;
    w.matchStats.seats.set(P1, {
      built: new Map(), kills: new Map(), towersBuilt: 0, towersFell: 0, dealtFifths: 0, takenFifths: 0, fellOnWave: 7,
      lost: new Map(), dealtTo: new Map(), takenUnattributed: 0, dealtKeep: 0, dealtStruct: 0, takenKeep: 0, takenStruct: 0,
      lostToEntropy: 0, // ⭐ S195 T22 — the one fixture line this tree touched outside its boundary (the field is required)
      entropyWave: undefined, entropySnapped: 0, entropyLost: 0, // ⭐ S195 N18 (d), same reason (s195/net-delta)
    });
    w.gameState = 'POSTGAME';
    const m = matchBoardModel(w)!;
    expect(m.headline).toBe('PLAYER 1 WINS');
    expect(m.rows.map((r) => [r.label, r.placeLabel, r.isLocal, r.out, r.outOnWave])).toEqual([
      ['P1', '1st', true, false, null],
      ['BOT 2', '2nd', false, true, 7],
    ]);
  });

  it('per-type lines are highest-first, then by name; totals are their sums', () => {
    const w = fightWorld();
    for (let i = 0; i < 3; i++) recordUnitBuilt(w, P0, 'goblinMelee');
    for (let i = 0; i < 5; i++) recordUnitBuilt(w, P0, 'raceUnit');
    recordUnitBuilt(w, P0, 'chewer');
    recordKill(w, P0, P1, 'chewer');
    w.gameState = 'POSTGAME';
    const r = matchBoardModel(w)!.rows.find((x) => x.seat === P0)!;
    expect(r.unitsByType.map((u) => [u.type, u.count])).toEqual([['raceUnit', 5], ['goblinMelee', 3], ['chewer', 1]]);
    expect(r.units).toBe(9);
    expect(r.kills).toBe(1);
  });

  it('an older host that sent no counters is flagged, never drawn as a wall of zeros', () => {
    const w = fightWorld();
    w.gameState = 'POSTGAME';
    expect(matchBoardModel(w)!.noStats).toBe(true);
  });

  it('numbers are grouped, never abbreviated or converted', () => {
    expect([groupThousands(0), groupThousands(999), groupThousands(1500), groupThousands(1234567)])
      .toEqual(['0', '999', '1,500', '1,234,567']);
    expect([placeLabel(1), placeLabel(2), placeLabel(3), placeLabel(4)]).toEqual(['1st', '2nd', '3rd', '4th']);
  });

  it('⛔ the model never reads a family the WIN teardown empties (source-text tripwire)', () => {
    // A source-text guard proves a line is ABSENT; the REACH case above is what proves the board fills.
    const src = readFileSync('src/render/matchBoardModel.ts', 'utf8');
    for (const family of ['world.defenders', 'world.gatherers', 'world.castleBanks', 'world.creatureSpawners']) {
      expect(src.includes(family), `${family} is empty at WIN — read the recorder instead`).toBe(false);
    }
  });
});

describe('⭐ S194 (audit T10 MED-1) — endgame MONSTERS, and a grid that adds up', () => {
  /** Two players, the monsters (seat 255), a self-hit and an unattributed hit. */
  function withMonsters(): World {
    const w = fightWorld();
    const M = asPlayerId(MONSTER_OWNER_SEAT);
    recordDamage(w, P1, P0, 100, 'unit');
    recordDamage(w, M, P0, 300, 'unit'); // P0's towers shooting monsters
    recordDamage(w, P0, M, 250, 'keep'); // the monsters chewing P0's keep
    recordDamage(w, P1, M, 40, 'structure');
    recordDamage(w, P0, P0, 9, 'unit'); // P0's own blast
    recordDamage(w, P1, null, 6, 'unit'); // no seat to name
    recordKill(w, P0, M, 'raceUnit');
    w.lastWinnerId = P0;
    w.gameState = 'POSTGAME';
    return w;
  }

  it('⛔ "P256" never appears anywhere on the board; the monsters are labelled MONSTERS in a neutral colour', () => {
    const m = matchBoardModel(withMonsters())!;
    const json = JSON.stringify(m);
    expect(json).not.toContain('P256');
    expect(json).not.toContain('BOT 256');
    expect(m.rows.map((r) => r.seat)).toEqual([P0, P1]); // monsters are never a ROW of the table
    const col = m.matrix.cols.find((c) => c.label === 'MONSTERS')!;
    expect(col.color).toBe(MONSTER_COLOR);
    expect(m.rows[0]!.dealtTo.map((a) => a.label)).toEqual(['MONSTERS', 'P2']);
    expect(m.rows[0]!.takenFrom.map((a) => a.label)).toEqual(['MONSTERS', 'ITSELF']);
    // ⭐ re-audit — the TAKEN FROM list sums to TAKEN, self-hits and NO SOURCE included.
    for (const r of m.rows) expect(r.takenFrom.reduce((t, a) => t + a.amount, 0), `${r.label} TAKEN FROM`).toBe(r.taken);
    expect(m.rows[1]!.takenFrom.map((a) => a.label)).toEqual(['P1', 'MONSTERS', 'NO SOURCE']);
  });

  it('⛔ every player ROW (minus its self-hit diagonal) sums to its DEALT; every COLUMN to its TAKEN', () => {
    const m = matchBoardModel(withMonsters())!;
    const { rows: R, cols: C, cells } = m.matrix;
    expect(C.map((c) => c.label)).toEqual(['P1', 'P2', 'MONSTERS']);
    expect(R.map((r) => r.label)).toEqual(['P1', 'P2', 'MONSTERS', 'NO SOURCE']);
    for (const row of m.rows) {
      const i = R.findIndex((r) => r.seat === row.seat);
      const sum = cells[i]!.reduce((t, n, j) => t + (C[j]!.seat === row.seat ? 0 : n), 0);
      expect(sum, `${row.label} row`).toBe(row.dealt);
      const j = C.findIndex((c) => c.seat === row.seat);
      const col = cells.reduce((t, r) => t + r[j]!, 0);
      expect(col, `${row.label} column`).toBe(row.taken);
    }
    expect(m.rows[0]!.dealt).toBe(400); // the audit's probe: 400 DEALT against a row that summed to 100
  });

  it('with no monsters and no unattributed damage the grid is just the seats', () => {
    const w = fightWorld();
    recordDamage(w, P1, P0, 5, 'unit');
    w.gameState = 'POSTGAME';
    const m = matchBoardModel(w)!;
    expect(m.matrix.cols.map((c) => c.label)).toEqual(['P1', 'P2']);
    expect(m.matrix.rows.map((c) => c.label)).toEqual(['P1', 'P2']);
  });
});
