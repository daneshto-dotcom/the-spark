/**
 * SPARK — ⭐ S193 audit fix round on `s192/endgame`. One describe per finding, each through the real
 * host tick / reducer, each with its negative.
 *   1 MED  — the live-pants cap (`MONSTER_MAX_LIVE_TOTAL`, S194 measured; was 30 a seat): peak live count and snapshot bounded.
 *   2 LOW  — `?worker=1`: the held fight no longer forces a full snapshot every batch.
 *   3 LOW  — his "I have 66 left" is MY seat's count.
 *   4 LOW  — a pants strikes only ITS victim's keep.
 *   5 LOW  — no spawner bounty on a pants wave.
 */
import { describe, expect, it } from 'vitest';
import {
  MONSTER_MAX_LIVE_TOTAL,
  MONSTER_MAX_RELEASES_PER_TICK,
  MONSTER_HOLD_LEAD_TICKS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPAWNER_KILL_REWARD,
  SparkType,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId } from '../types.ts';
import { makeGameStateExtras } from './gameState.ts';
import { isMonsterFightHeld, monstersLeftForSeat, monstersLeftToComeOut, pantsWindowTicks } from './endgame.ts';
import { netSnapshot, wireNumberReplacer } from './save.ts';
import { structuralSignature } from './workerSim.ts';
import { formatEndgameCue } from '../render/ui.ts';
import { monsterMaxLivePerSeat } from './endgameMonsters.ts';
import { enemyCastleInReach } from './creatures/creatureAI.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { awardSpawnerKillReward } from './gameMode.ts';
import type { Creature } from './creatures/creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(seats: number): World {
  const w = makeWorld(0x193a);
  w.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  if (seats === 2) dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  else dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1) });
  w.gameState = 'PLAYING';
  w.draft = null;
  return w;
}
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function toFightEdge(w: World, wave: number): void {
  w.waveNumber = wave;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1;
}
const pants = (w: World): Creature[] => [...w.creatures.values()].filter((c) => c.type === 'endgameMonster');
const wireBytes = (w: World): number => JSON.stringify(netSnapshot(w), wireNumberReplacer).length;

/* ══════════════════════════════════ 1 · MED — THE LIVE CAP ═══════════════════════════════════ */

describe('S193 audit 1 → ⭐ S194 R194-27 — the MEASURED live cap: MONSTER_MAX_LIVE_TOTAL split over the living seats', () => {
  it('the arithmetic: 360 total (2 → 180 · 3 → 120 · 4 → 90 · 6 → 60), ~162 B each → ≤ ~57 KiB of pants, inside ~84 KiB with a ~20 KiB board', () => {
    expect(MONSTER_MAX_LIVE_TOTAL).toBe(360);
    expect([1, 2, 3, 4, 6].map(monsterMaxLivePerSeat)).toEqual([360, 180, 120, 90, 60]);
    expect(monsterMaxLivePerSeat(0)).toBe(0);
    expect(MONSTER_MAX_RELEASES_PER_TICK).toBe(1);
    expect(MONSTER_MAX_LIVE_TOTAL * 162 + 20 * 1024).toBeLessThan(84 * 1024);
    // negative: the owner's "no cap" worst case (4 × 250 live) is ~160 KiB — about twice the budget
    expect(4 * 250 * 162).toBeGreaterThan(84 * 1024);
  });

  it('REACH — 4 seats, wave 31, keeps holding: peak live = 4 × 90 = 360, never two born on a tick, snapshot bounded; the countdown keeps counting', () => {
    const w = board(4);
    toFightEdge(w, 31);
    for (const p of w.players.values()) p.castleHp = 1e9;
    const d = deps();
    const st = makeHostTickState(w);
    let peak = 0;
    let maxBytes = 0;
    let lastSpawned = 0;
    let maxPerTick = 0;
    for (let t = 0; t < 4000; t++) {
      runHostTick(w, d, st);
      maxPerTick = Math.max(maxPerTick, w.monsterWaveSpawned - lastSpawned);
      lastSpawned = w.monsterWaveSpawned;
      const live = pants(w);
      peak = Math.max(peak, live.length);
      for (const seat of [0, 1, 2, 3]) {
        expect(live.filter((c) => (c.monsterSeat as unknown as number) === seat).length).toBeLessThanOrEqual(monsterMaxLivePerSeat(4));
      }
      if (t % 250 === 0) maxBytes = Math.max(maxBytes, wireBytes(w));
    }
    expect(peak).toBe(4 * monsterMaxLivePerSeat(4));
    expect(maxPerTick).toBeLessThanOrEqual(1);
    // ⭐ S194 R194-27 — at the cap: 360 × ~162 B + this (bare) board; the uncapped audit probe was 176 KB. Budget ~84 KiB.
    expect(maxBytes).toBeLessThan(84 * 1024);
    expect(maxBytes).toBeGreaterThan(50 * 1024); // anti-vacuity: the cap really was reached on the wire
    // the countdown still counts what is left to come out — the lanes are waiting, not done
    const left = monstersLeftToComeOut(w);
    expect(left).toBe(250 * 4 - w.monsterWaveSpawned);
    expect(left).toBeGreaterThan(0);
    // a pants dies → that lane's next one comes out (the next tick or so), never a chunk
    const before = w.monsterWaveSpawned;
    for (const c of pants(w).slice(0, 8)) dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: c.id });
    for (let t = 0; t < 20; t++) runHostTick(w, d, st);
    expect(w.monsterWaveSpawned).toBeGreaterThan(before);
    expect(w.monsterWaveSpawned - before).toBeLessThanOrEqual(8);
  });

  it('NEGATIVE — with a defence that keeps up, the cap never binds and his pace is unchanged', () => {
    const w = board(2);
    toFightEdge(w, 30);
    for (const p of w.players.values()) p.castleHp = 1e9;
    const d = deps();
    const st = makeHostTickState(w);
    const n = 20;
    // ⭐ S194 R194-17 — his window: release 19 of 200 over 90 s is due floor(19 × 5400 / 199) = 515 ticks
    // in (was ceil(19 × 45 / 2) = 428); + 1 for the tick that crosses into FIGHT. Exactly n by then, not n + 1.
    for (let t = 0; t < Math.floor(((n - 1) * pantsWindowTicks(30)) / (2 * 100 - 1)) + 1; t++) {
      runHostTick(w, d, st);
      for (const c of pants(w)) dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: c.id });
    }
    expect(w.monsterWaveSpawned).toBe(n);
  });
});

/* ═════════════════════════════ 2 · LOW — THE WORKER'S STRUCTURAL SIGNATURE ════════════════════════════ */

describe('S193 audit 2 — a held fight does not change the structural signature every tick', () => {
  it('held: two consecutive host ticks with nothing structural → the same signature, though the deadline moved', () => {
    const w = board(2);
    toFightEdge(w, 31);
    for (const p of w.players.values()) p.castleHp = 1e9;
    const d = deps();
    const st = makeHostTickState(w);
    runHostTick(w, d, st);
    w.monsterWaveSpawned = 500; // every pants out: nothing is born, so only the held deadline moves
    for (const c of pants(w)) dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: c.id });
    w.phaseEndsAtTick = w.tick + 1;
    runHostTick(w, d, st);
    expect(isMonsterFightHeld(w)).toBe(true);
    const a = structuralSignature(w);
    const pe = w.phaseEndsAtTick;
    runHostTick(w, d, st);
    expect(w.phaseEndsAtTick).not.toBe(pe); // the hold rewrote it
    expect(structuralSignature(w)).toBe(a);
  });

  it('NEGATIVE — an unheld fight still carries its deadline: moving it changes the signature', () => {
    const w = board(2);
    w.matchPhase = 'FIGHT';
    w.waveNumber = 20;
    const a = structuralSignature(w);
    w.phaseEndsAtTick += 60;
    expect(isMonsterFightHeld(w)).toBe(false);
    expect(structuralSignature(w)).not.toBe(a);
  });
});

/* ═══════════════════════════════════ 3 · LOW — MY SEAT'S COUNT ═══════════════════════════════════ */

describe('S193 audit 3 — "I have 66 left" is MY seat\'s count', () => {
  it('REACH — after the first release (seat 0\'s lane) seat 0 has 9 left, seat 1 has 10; the HUD shows mine first', () => {
    const w = board(2);
    toFightEdge(w, 27);
    runHostTick(w, deps(), makeHostTickState(w));
    expect(w.monsterWaveSpawned).toBe(1);
    expect(monstersLeftForSeat(w, P0)).toBe(9);
    expect(monstersLeftForSeat(w, P1)).toBe(10);
    expect(monstersLeftToComeOut(w)).toBe(19);
    expect(formatEndgameCue(w.matchPhase, w.waveNumber, monstersLeftToComeOut(w), monstersLeftForSeat(w, w.localPlayerId)))
      .toBe('YOUR PANTS LEFT: 9  (all 19)');
  });

  it('the per-seat counts always sum to the total, at every point of a 3-seat wave', () => {
    const w = board(3);
    w.matchPhase = 'FIGHT';
    w.waveNumber = 30;
    for (let s = 0; s <= 300; s += 7) {
      w.monsterWaveSpawned = s;
      const sum = [0, 1, 2].reduce((a, i) => a + (monstersLeftForSeat(w, asPlayerId(i)) ?? 0), 0);
      expect(sum, `spawned ${s}`).toBe(monstersLeftToComeOut(w));
    }
  });

  it('NEGATIVE — a fallen seat, and any non-pants fight, has no count of its own', () => {
    const w = board(2);
    w.matchPhase = 'FIGHT';
    w.waveNumber = 28;
    w.players.get(P1)!.castleHp = 0;
    expect(monstersLeftForSeat(w, P1)).toBe(null);
    expect(formatEndgameCue('FIGHT', 28, 12, null)).toBe('PANTS LEFT TO COME OUT: 12');
    w.waveNumber = 26;
    expect(monstersLeftForSeat(w, P0)).toBe(null);
  });
});

/* ═══════════════════════════════ 4 · LOW — ONLY ITS VICTIM'S KEEP ═══════════════════════════════ */

describe('S193 audit 4 — a pants strikes only ITS victim\'s keep', () => {
  it('standing on seat 0\'s keep, a pants sent at seat 1 sees no keep in reach; on seat 1\'s it sees seat 1', () => {
    const w = board(2);
    toFightEdge(w, 27);
    runHostTick(w, deps(), makeHostTickState(w));
    const m = pants(w)[0]!;
    m.monsterSeat = P1;
    const k0 = castleAnchor(0, w.layout);
    const k1 = castleAnchor(1, w.layout);
    m.pos.x = k0.x; m.pos.y = k0.y;
    expect(enemyCastleInReach(w, m, 200)).toBe(null);
    m.pos.x = k1.x; m.pos.y = k1.y;
    expect(enemyCastleInReach(w, m, 200)).toBe(P1);
  });

  it('REACH — walking past seat 0\'s keep on its way to seat 1, it never strikes seat 0', () => {
    const w = board(2);
    toFightEdge(w, 27);
    const d = deps();
    const st = makeHostTickState(w);
    // ⭐ S194 R194-17 — lane 1's first pants is due floor(1800 / 19) = 94 ticks in (was 22): wait for it
    for (let t = 0; t < 40 + Math.floor(pantsWindowTicks(27) / 19); t++) runHostTick(w, d, st);
    const m = pants(w).find((c) => c.monsterSeat === P1)!;
    for (const c of pants(w)) if (c.id !== m.id) dispatch(w, { type: 'DESPAWN_CREATURE', creatureId: c.id });
    w.monsterWaveSpawned = 20; // no more births
    const k0 = castleAnchor(0, w.layout);
    m.pos.x = k0.x; m.pos.y = k0.y; m.prevPos.x = k0.x; m.prevPos.y = k0.y;
    const hp0 = w.players.get(P0)!.castleHp;
    for (let t = 0; t < 240; t++) runHostTick(w, d, st);
    expect(w.players.get(P0)!.castleHp).toBe(hp0);
  });

  it('NEGATIVE — an ordinary unit still strikes the lowest enemy keep in reach (unchanged)', () => {
    const w = board(2);
    toFightEdge(w, 27);
    runHostTick(w, deps(), makeHostTickState(w));
    const m = pants(w)[0]!;
    const k1 = castleAnchor(1, w.layout);
    const goblin = { ...m, type: 'goblinMelee', ownerPlayerId: P0, pos: { x: k1.x, y: k1.y } } as Creature;
    expect(enemyCastleInReach(w, goblin, 200)).toBe(P1);
  });
});

/* ═══════════════════════════════ 5 · LOW — NO BOUNTY ON A PANTS WAVE ═══════════════════════════════ */

describe('S193 audit 5 — "no points": no spawner bounty on a pants wave', () => {
  function withDeadTower(wave: number): World {
    const w = board(2);
    w.waveNumber = wave;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.monsterWaveSpawned = 1_000; // no pants born, so the poll is the only thing that happens
    const anchor: Primitive = {
      id: asPrimitiveId(9_000), type: SparkType.Circle, placerColor: PLAYER_COLORS[0]!, placedBy: P0,
      createdTick: 0, pos: { x: 300, y: 300 }, prevPos: { x: 300, y: 300 }, bonds: new Set(),
      ownerColor: PLAYER_COLORS[0]!, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    void anchor; // the anchor is GONE: the poll finds a destroyed tower
    w.creatureSpawners.set(asSpawnerId(91), {
      id: asSpawnerId(91), ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(9_000), recipeId: 'goblinTower',
      nextSpawnTick: 1e9, lastValidatedTick: -1e9, spawnedCount: 0, ignitedAtTick: 0,
    } as never);
    return w;
  }

  for (const [wave, paid] of [[28, false], [26, true]] as const) {
    it(`REACH — a tower razed in the FIGHT of wave ${wave}: the enemy is ${paid ? '' : 'NOT '}paid the bounty`, () => {
      const w = withDeadTower(wave);
      const before = w.scoreByPlayer.get(P1) ?? 0;
      const d = deps();
      const st = makeHostTickState(w);
      for (let t = 0; t < 120 && w.creatureSpawners.has(asSpawnerId(91)); t++) runHostTick(w, d, st);
      expect(w.creatureSpawners.has(asSpawnerId(91)), 'the poll removed the dead tower').toBe(false);
      const gained = (w.scoreByPlayer.get(P1) ?? 0) - before;
      if (paid) expect(gained).toBeGreaterThanOrEqual(SPAWNER_KILL_REWARD);
      else expect(gained).toBeLessThan(SPAWNER_KILL_REWARD);
    });
  }

  it('the gate itself, every pants wave', () => {
    for (const wave of [27, 28, 29, 30, 31]) {
      const w = withDeadTower(wave);
      const before = w.scoreByPlayer.get(P1) ?? 0;
      awardSpawnerKillReward(w, w.creatureSpawners.get(asSpawnerId(91))!);
      expect((w.scoreByPlayer.get(P1) ?? 0) - before, `wave ${wave}`).toBe(0);
    }
    for (const wave of [25, 26, 32]) { // NEGATIVE — outside the pants waves the bounty is paid
      const w = withDeadTower(wave);
      const before = w.scoreByPlayer.get(P1) ?? 0;
      awardSpawnerKillReward(w, w.creatureSpawners.get(asSpawnerId(91))!);
      expect((w.scoreByPlayer.get(P1) ?? 0) - before, `wave ${wave}`).toBe(SPAWNER_KILL_REWARD);
    }
  });
});

void MONSTER_HOLD_LEAD_TICKS;

describe('S193 merge — the pants obey master\'s S192 T13 liveness rule', () => {
  it('a corpse-in-waiting (pool spent) of its victim seat is not acquired; a live one is', async () => {
    const { runEndgameMonsterTargeting } = await import('./endgameMonsters.ts');
    const w = board(2);
    toFightEdge(w, 27);
    runHostTick(w, deps(), makeHostTickState(w));
    const m = pants(w)[0]!;
    m.monsterSeat = P1;
    m.state = 'SEEKING';
    const victim = { ...m, id: (9_999 as unknown) as Creature['id'], type: 'goblinMelee', ownerPlayerId: P1,
      pos: { x: m.pos.x + 20, y: m.pos.y }, prevPos: { x: m.pos.x + 20, y: m.pos.y }, monsterSeat: undefined } as Creature;
    w.creatures.set(victim.id, victim);
    victim.ehp = 0;
    runEndgameMonsterTargeting(w, m);
    expect(m.targetCreatureId).toBe(null);
    victim.ehp = 50;
    runEndgameMonsterTargeting(w, m);
    expect(m.targetCreatureId).toBe(victim.id);
  });
});
