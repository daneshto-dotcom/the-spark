/**
 * SPARK — ⭐ S194 R194-27 MEASUREMENT INSTRUMENT: what N live pants cost the host, on the CPU and on the
 * wire. Owner: *"I would like them to just come one after another nonstop, because the players will be
 * killing them as they come out … if you think the cap is needed … then sure … or think of better ways to
 * … have the game run smoother."*
 *
 * ⛔ OPT-IN, NOT A GATE (minutes of CPU): `SPARK_PANTS_MEASURE=1 npx vitest run src/net/pantsLoadMeasure.test.ts`
 *
 * Method: a real 4-seat board in the final fight (wave 31), keeps unkillable, the pants count TOPPED UP to
 * N before every measured tick (outside the timer) so the castle guns' kills do not drain it — the worst
 * case of nobody keeping up. Warm-up 300 ticks (the pants walk out and reach the keeps), then 300 timed
 * `runHostTick`s. Wire: the real NETSNAPSHOT message (`stripWirePrevPos` + `wireNumberReplacer`, as sent).
 * `?worker=1`: the per-frame positions buffer (`buildPositions`) and the main-thread mirror cost of
 * applying one 10 Hz snapshot (`applyNetSnapshot`) — the same function a joiner runs.
 */
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';

import { PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { MONSTER_OWNER_ID, monsterBirthPos } from '../state/endgameMonsters.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { applyNetSnapshot, netSnapshot, stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import { buildPositions } from '../state/workerSim.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';

const MEASURE = process.env.SPARK_PANTS_MEASURE === '1';

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function wireOf(world: World): string {
  const msg = { kind: 'NETSNAPSHOT' as const, snapshotSeq: 1, snapshot: netSnapshot(world) };
  return JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer);
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

function finalFight(): World {
  const w = makeWorld(0x194);
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
  return w;
}

function topUp(w: World, n: number): void {
  let live = 0;
  for (const c of w.creatures.values()) if (c.type === 'endgameMonster') live++;
  for (let k = 0; live < n; k++, live++) {
    const seat = asPlayerId(k % 4);
    const a = castleAnchor(k % 4, w.layout);
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'endgameMonster', ownerPlayerId: MONSTER_OWNER_ID,
      pos: monsterBirthPos(w, seat), targetPos: { x: a.x, y: a.y }, sourceSpawnerId: null, monsterSeat: seat,
    });
  }
}

describe.skipIf(!MEASURE)('⭐ S194 R194-27 — the pants load, measured', () => {
  it('host ms/tick, NETSNAPSHOT bytes and the worker mirror at 0 / 120 / 250 / 500 / 1000 live pants', () => {
    const rows: string[] = [];
    for (const n of [0, 120, 250, 500, 1000]) {
      const w = finalFight();
      const d = deps();
      const st = makeHostTickState(w);
      runHostTick(w, d, st);
      w.monsterWaveSpawned = 1e6; // the real spawner stands down: this instrument owns the count
      for (const c of [...w.creatures.values()]) if (c.type === 'endgameMonster') dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: c.id });
      for (let t = 0; t < 300; t++) { topUp(w, n); runHostTick(w, d, st); w.effects.length = 0; }
      const ms: number[] = [];
      for (let t = 0; t < 300; t++) {
        topUp(w, n);
        const t0 = performance.now();
        runHostTick(w, d, st);
        ms.push(performance.now() - t0);
        w.effects.length = 0;
      }
      topUp(w, n);
      let live = 0;
      for (const c of w.creatures.values()) if (c.type === 'endgameMonster') live++;
      const json = wireOf(w);
      const pos = buildPositions(w);
      const client = makeWorld(1);
      client.isHost = false;
      const parsed = JSON.parse(json) as { snapshot: Parameters<typeof applyNetSnapshot>[0] };
      const am: number[] = [];
      for (let k = 0; k < 20; k++) {
        const t0 = performance.now();
        applyNetSnapshot(JSON.parse(JSON.stringify(parsed.snapshot)), client);
        am.push(performance.now() - t0);
      }
      rows.push(
        `| ${n} | ${live} | ${pct(ms, 0.5).toFixed(2)} | ${pct(ms, 0.95).toFixed(2)} | ${(json.length / 1024).toFixed(1)} | ${(pos.byteLength / 1024).toFixed(1)} | ${pct(am, 0.5).toFixed(2)} |`,
      );
      expect(live).toBe(n);
    }
    console.log(['| target | live | host ms p50 | host ms p95 | NETSNAPSHOT KiB | worker positions KiB/frame | mirror apply ms p50 |', ...rows].join('\n'));
  }, 900_000);
});
