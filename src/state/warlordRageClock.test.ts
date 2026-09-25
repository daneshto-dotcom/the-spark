/**
 * SPARK — S191 (owner) — THE WARLORD'S RAGE LASTS 25 SECONDS, THEN "COOLDOWN FIRST".
 *
 * > *"let's do it like 25 seconds"* (S190, recorded for S191) — and, asked what happens when the 25 s
 * > end with him still under half: **"cooldown first"** (S191; no length given → 25 s, ⚠ MINE).
 *
 * The rule: strictly below `WARLORD_RAGE_TRIGGER_PCT` of his own max, his OWN latch fires and stamps
 * `Creature.rageStartTick`; he rages for `WARLORD_RAGE_TICKS` REGARDLESS OF HEALING; then he is calm for
 * `WARLORD_RAGE_COOLDOWN_TICKS` whatever his health; then, below the line, he fires again at once.
 * BLOOD FRENZY follows HIS clock (a source is a Warlord inside his own window), goblins never rage.
 *
 * Everything here goes through the real `runHostTick` except the pure window arithmetic, and the last
 * block compares the host against the `?worker=1` mirror adopted MID-RAGE — the one place a stamp
 * missing from the save would show.
 */
import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  PLAYER_COLORS,
  WARLORD_RAGE_COOLDOWN_TICKS,
  WARLORD_RAGE_TICKS,
  phaseDurationTicks,
} from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  asCreatureId,
  creatureMaxEhp,
  isOwnRageActive,
  isRageCoolingDown,
  makeCreature,
  type Creature,
  type CreatureType,
} from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { hashWorldState } from './stateHash.ts';
import { netSnapshot, restore, snapshot } from './save.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from './workerSim.ts';
import { BotManager } from '../bots/botManager.ts';
import type { Controls } from '../input/controls.ts';
import type { DraftPick } from './draft.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const WARLORD: CreatureType = 't9BossOrcs';

function board(picks: DraftPick[] = ['hp']): World {
  const w = makeWorld(0x191a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: 'orcs' }, { seat: 1, color: PLAYER_COLORS[1], raceId: 'nagas' }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  // Long enough for rage + cooldown + a re-trigger inside ONE fight — this measures the clock, not the whistle.
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.draft = null;
  w.players.get(P0)!.raceId = 'orcs';
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.draftPicks = ['hp'];
  return w;
}

function unit(w: World, type: CreatureType, owner: PlayerId, x: number, y: number, born = w.tick): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: born, sourceSpawnerId: asSpawnerId(1900 + w.creatures.size), clock: w,
  });
  // Frozen in place: a stun stops what a creature DOES, never the rage latch (R152) nor the frenzy's write.
  c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
  return c;
}

const pctPool = (c: Creature, pct: number): number => Math.floor((creatureMaxEhp(c) * pct) / 100);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
interface Rig { w: World; d: HostTickDeps; st: HostTickState }
function rig(w: World): Rig {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  return { w, d, st: makeHostTickState(w) };
}
/** One real host tick; returns the tick the latch just ran on (the tick advances at the top). */
function step(r: Rig): number {
  runHostTick(r.w, r.d, r.st);
  return r.w.tick;
}
/** Run until `world.tick === until`, calling `each` after every tick. */
function runTo(r: Rig, until: number, each?: (tick: number) => void): void {
  while (r.w.tick < until) {
    const t = step(r);
    each?.(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — the numbers: 25 s of rage, then a 25 s cooldown (⚠ MINE), both off ONE stamp', () => {
  it('25 s at 60 Hz, derived; the cooldown mirrors it', () => {
    expect(WARLORD_RAGE_TICKS).toBe(25 * PHYSICS_HZ);
    expect(WARLORD_RAGE_TICKS).toBe(1500);
    expect(WARLORD_RAGE_COOLDOWN_TICKS, '⚠ MINE — "cooldown first", no length given; 25 s mirrors the rage').toBe(WARLORD_RAGE_TICKS);
  });

  it('the two windows are back to back, strictly `<`, and a stamp in the future is neither', () => {
    const c = { rageStartTick: 100 };
    expect(isOwnRageActive(c, 100), 'the stamping tick rages').toBe(true);
    expect(isOwnRageActive(c, 100 + WARLORD_RAGE_TICKS - 1), 'the last raging tick').toBe(true);
    expect(isOwnRageActive(c, 100 + WARLORD_RAGE_TICKS), '25 s on the dot').toBe(false);
    expect(isRageCoolingDown(c, 100 + WARLORD_RAGE_TICKS - 1)).toBe(false);
    expect(isRageCoolingDown(c, 100 + WARLORD_RAGE_TICKS), 'the cooldown starts the tick the rage ends').toBe(true);
    expect(isRageCoolingDown(c, 100 + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS - 1)).toBe(true);
    expect(isRageCoolingDown(c, 100 + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS), 'free again').toBe(false);
    expect(isOwnRageActive(c, 99), 'a stamp in the future').toBe(false);
    expect(isRageCoolingDown(c, 99)).toBe(false);
    expect(isOwnRageActive({}, 100), 'never raged').toBe(false);
    expect(isRageCoolingDown({}, 100)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — ⭐ REACH through the real host tick', () => {
  it('⭐⭐ pushed under 50 % then HEALED above it: he rages for EXACTLY 25 s and calms on the tick after', () => {
    const r = rig(board());
    const boss = unit(r.w, WARLORD, P0, 250, 250);
    runTo(r, r.w.tick + 5);
    expect(boss.enraged, 'a healthy Warlord is calm').toBe(false);
    expect(boss.rageStartTick, 'and has no clock').toBeUndefined();

    boss.ehp = pctPool(boss, 40);
    const T = step(r);
    expect(boss.enraged, 'strictly below half: his latch fires').toBe(true);
    expect(boss.rageStartTick).toBe(T);

    boss.ehp = creatureMaxEhp(boss); // healed to FULL — R151 would have calmed him here
    let raged = 1; // tick T
    let lastRaged = T;
    let firstCalm = -1;
    runTo(r, T + WARLORD_RAGE_TICKS + 100, (t) => {
      if (boss.enraged === true) {
        raged++;
        lastRaged = t;
        expect(firstCalm, `raging again at ${t} after calming — healthy, so nothing should re-fire`).toBe(-1);
      } else if (firstCalm < 0) firstCalm = t;
    });
    expect(raged, 'exactly 25 s of rage, healing or not').toBe(WARLORD_RAGE_TICKS);
    expect(lastRaged).toBe(T + WARLORD_RAGE_TICKS - 1);
    expect(firstCalm).toBe(T + WARLORD_RAGE_TICKS);
    expect(boss.rageStartTick, 'the stamp is his own; nothing re-stamped it').toBe(T);
  });

  it('⭐⭐ "COOLDOWN FIRST": still under half at 25 s → calm for EXACTLY 25 s → rages again at once', () => {
    const r = rig(board());
    const boss = unit(r.w, WARLORD, P0, 250, 250);
    boss.ehp = pctPool(boss, 40);
    const T = step(r);
    expect(boss.rageStartTick).toBe(T);
    const seen: boolean[] = [true]; // index 0 = tick T
    runTo(r, T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS + 60, () => seen.push(boss.enraged === true));
    const R = WARLORD_RAGE_TICKS;
    const C = WARLORD_RAGE_COOLDOWN_TICKS;
    expect(seen.slice(0, R).every(Boolean), 'raging for his whole 25 s').toBe(true);
    expect(seen.slice(R, R + C).some(Boolean), 'NOT raging anywhere in the cooldown, though still under half').toBe(false);
    expect(seen.slice(R + C).every(Boolean), 'the cooldown ends → below half → he rages again at once').toBe(true);
    expect(boss.rageStartTick, 'a NEW clock, stamped the tick the cooldown ended').toBe(T + R + C);
  });

  it('⛔ healed above half DURING the cooldown → no rage when it ends; he fires again only once he drops below', () => {
    const r = rig(board());
    const boss = unit(r.w, WARLORD, P0, 250, 250);
    boss.ehp = pctPool(boss, 40);
    const T = step(r);
    runTo(r, T + WARLORD_RAGE_TICKS + 100); // 100 ticks into the cooldown
    expect(boss.enraged).toBe(false);
    boss.ehp = creatureMaxEhp(boss); // healed inside the cooldown
    runTo(r, T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS + 300, () => {
      expect(boss.enraged, 'healthy after the cooldown: nothing fires').toBe(false);
    });
    expect(boss.rageStartTick, 'the old stamp, never refreshed').toBe(T);
    boss.ehp = pctPool(boss, 40);
    const U = step(r);
    expect(boss.enraged, 'below the line with the cooldown long over → at once').toBe(true);
    expect(boss.rageStartTick).toBe(U);
  });

  it('⛔ dropped below half INSIDE the cooldown (he was healed through his rage) → still waits it out', () => {
    const r = rig(board());
    const boss = unit(r.w, WARLORD, P0, 250, 250);
    boss.ehp = pctPool(boss, 40);
    const T = step(r);
    boss.ehp = creatureMaxEhp(boss);
    runTo(r, T + WARLORD_RAGE_TICKS + 10);
    boss.ehp = pctPool(boss, 30); // hurt again, 10 ticks into the cooldown
    runTo(r, T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS - 1, () => {
      expect(boss.enraged, 'the cooldown holds whatever his health').toBe(false);
    });
    const E = step(r);
    expect(E).toBe(T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS);
    expect(boss.enraged, 'the first tick after the cooldown').toBe(true);
    expect(boss.rageStartTick).toBe(E);
  });

  it('⭐⭐ BLOOD FRENZY follows HIS clock through the whole cycle — healed, cooled, re-fired — and a goblin never rages', () => {
    const r = rig(board(['racial'])); // orcs.l0 — BLOOD FRENZY
    const boss = unit(r.w, WARLORD, P0, 250, 250);
    const soldier = unit(r.w, 'raceUnit', P0, 300, 800);
    const raider = unit(r.w, 't3Warband', P0, 340, 800);
    const goblin = unit(r.w, 'goblinMelee', P0, 380, 800);
    for (const c of [soldier, raider, goblin]) c.ehp = 1_000_000; // kept alive; this measures the bit
    boss.ehp = pctPool(boss, 40);
    const T = step(r);
    expect(soldier.enraged, 'the frenzy runs after his latch in the same tick').toBe(true);
    let raisedAgain = false;
    runTo(r, T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS + 200, (t) => {
      if (t === T + 100) boss.ehp = creatureMaxEhp(boss); // healed inside his window
      if (t === T + WARLORD_RAGE_TICKS + 50) boss.ehp = pctPool(boss, 40); // hurt again in the cooldown
      const his = isOwnRageActive(boss, t);
      expect(boss.enraged, `tick ${t}: the Warlord's bit is his own clock`).toBe(his);
      expect(soldier.enraged === true, `tick ${t}: the race unit follows him`).toBe(his);
      expect(raider.enraged === true, `tick ${t}: the tier-3 orc follows him`).toBe(his);
      expect(goblin.enraged ?? false, `tick ${t}: ⛔ GOBLINS NEVER RAGE (canon §3e)`).toBe(false);
      if (t >= T + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS && his) raisedAgain = true;
    });
    expect(raisedAgain, 'anti-vacuity: the re-fired rage raised the orcs again').toBe(true);
  });

  it('⛔ NEGATIVE: only the Warlord has a clock — another boss below half is never stamped nor raged', () => {
    const r = rig(board());
    const kraken = unit(r.w, 't9BossNagas', P0, 250, 250);
    kraken.ehp = pctPool(kraken, 10);
    runTo(r, r.w.tick + 30);
    expect(kraken.enraged ?? false).toBe(false);
    expect(kraken.rageStartTick).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — `rageStartTick` is a four-sites field', () => {
  function stamped(): { w: World; boss: Creature } {
    const w = board();
    const boss = unit(w, WARLORD, P0, 250, 250);
    return { w, boss };
  }

  it('HASH (the per-field contribution test): the stamp moves the wide hash, and its VALUE matters', () => {
    const { w, boss } = stamped();
    const none = hashWorldStateFull(w);
    boss.rageStartTick = 400;
    const at400 = hashWorldStateFull(w);
    expect(at400).not.toBe(none);
    boss.rageStartTick = 401;
    expect(hashWorldStateFull(w)).not.toBe(at400);
  });

  it('SAVE + WIRE: survives snapshot → restore and rides the net snapshot; absent when never stamped', () => {
    const { w, boss } = stamped();
    boss.rageStartTick = 777;
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    expect(dst.creatures.get(boss.id)!.rageStartTick).toBe(777);
    const wire = JSON.parse(JSON.stringify(netSnapshot(w))) as { creatures: { id: number; rageStartTick?: number }[] };
    expect(wire.creatures.find((c) => c.id === (boss.id as number))?.rageStartTick, 'a promoted successor keeps his clock').toBe(777);

    const { w: w2 } = stamped();
    expect(JSON.stringify(snapshot(w2)).includes('rageStartTick'), 'an unraged board carries no field').toBe(false);
  });

  it('⛔ RESTORE validates, never trusts: a non-integer or negative stamp is dropped', () => {
    for (const bad of [-5, 1.5, '12', null]) {
      const { w, boss } = stamped();
      boss.rageStartTick = 10;
      const snap = JSON.parse(JSON.stringify(snapshot(w))) as { creatures: { id: number; rageStartTick?: unknown }[] };
      snap.creatures.find((c) => c.id === (boss.id as number))!.rageStartTick = bad;
      const dst = makeWorld(1);
      restore(snap as never, dst);
      expect(dst.creatures.get(boss.id)!.rageStartTick, String(bad)).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — host vs ?worker=1, adopted MID-RAGE, across rage end → cooldown → re-fire', () => {
  const RATE = 3;
  const newSpawner = () =>
    new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: RATE }, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));

  /** A real FIGHT, a Warlord 10 s into his rage and still under half, and a frenzied soldier. */
  function midRage(): { w: World; boss: Creature; soldier: Creature } {
    const w = board(['racial']);
    w.tick += 20_000; // a mid-match tick, so "10 s ago" is a real (non-negative) tick
    w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
    // ⚠ `spawnedAtTick` is HOST-ONLY and rehydrates 0 on restore (save.ts, the documented posture), so a
    // creature adopted mid-match is born at 0 on the mirror. Modelled (`born = 0`) so the INIT check
    // measures THIS field and not that known, unrelated one.
    const boss = unit(w, WARLORD, P0, 250, 250, 0);
    boss.ehp = pctPool(boss, 40);
    boss.rageStartTick = w.tick - 10 * PHYSICS_HZ;
    boss.enraged = true;
    const soldier = unit(w, 'raceUnit', P0, 300, 800, 0);
    // Kept alive as a LEGAL creature (a pool above the type's must be a `maxEhp`, or the save — which
    // writes `ehp` only below the max — would rebuild it at the type's pool and the fixture would lie).
    soldier.maxEhp = 1_000_000;
    soldier.ehp = 1_000_000;
    soldier.enraged = true;
    return { w, boss, soldier };
  }

  type Frame = (b: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>) => { json: string; hash: number };
  function reference(world: World): Frame {
    const spawner = newSpawner();
    const controls = new WorkerControls(world, P0);
    const gameStateExtras = makeGameStateExtras();
    const state = makeHostTickState(world);
    const cursor = { lastMatcherTick: -1 };
    const cinematics = makeWorkerCinematicState();
    return (b) => {
      controls.setFrame(b.control);
      const deps: HostTickDeps = { spawner, controls, botManager: null, gameStateExtras, alivePeerIds: null, hostSeats: new Map() };
      for (let i = 0; i < b.ticks; i++) runHostTick(world, deps, state);
      if (world.gameState === 'PLAYING') runGodlyMatcherCore(world, cursor);
      tickWorkerCinematics(world, cinematics);
      const json = JSON.stringify(netSnapshot(world));
      const hash = hashWorldState(world);
      world.effects.length = 0;
      return { json, hash };
    };
  }
  function batch(saveJson: string): { world: World; frame: Frame } {
    const sim = makeWorkerSim(
      { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, ratePerSecond: RATE },
      (d, s) => new BotManager(d, s),
    );
    let seq = 0;
    return {
      world: sim.world,
      frame: (b) => {
        const r = applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...b }, { forceSnapshot: true });
        return { json: JSON.stringify(r.snapshot), hash: r.hash! };
      },
    };
  }
  const input = (f: number) => ({
    ticks: 1 + (f % 3),
    control: { state: { kind: 'Idle' } as const, cursor: { x: 960, y: 540 } },
    alivePeerIds: null,
    intents: [],
    nowMs: f * 16,
  });

  it('⭐ is byte-identical every frame (wire, narrow AND wide hash), and the whole cycle happened inside the window', () => {
    const { w, boss, soldier } = midRage();
    const start0 = boss.rageStartTick!;
    const saveJson = JSON.stringify(snapshot(w, { spawnerState: newSpawner().getState() }));
    const ref = reference(w);
    const b = batch(saveJson);
    expect(hashWorldStateFull(b.world), 'INIT adoption is bit-exact — the stamp arrived').toBe(hashWorldStateFull(w));

    const bossSeq: boolean[] = [];
    const soldierSeq: boolean[] = [];
    const endAt = start0 + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS + 120;
    let frames = 0;
    for (let f = 0; w.tick < endAt; f++) {
      const a = ref(input(f));
      const c = b.frame(input(f));
      if (a.json !== c.json || a.hash !== c.hash) throw new Error(`DIVERGED at frame ${f} (tick ${w.tick})`);
      if (hashWorldStateFull(w) !== hashWorldStateFull(b.world)) throw new Error(`WIDE divergence at frame ${f} (tick ${w.tick})`);
      frames++;
      const e = w.creatures.get(boss.id)!.enraged === true;
      if (bossSeq.at(-1) !== e) bossSeq.push(e);
      const s = w.creatures.get(soldier.id)!.enraged === true;
      if (soldierSeq.at(-1) !== s) soldierSeq.push(s);
    }
    expect(frames).toBeGreaterThan(500);
    expect(w.matchPhase, 'fixture: one FIGHT holds the whole cycle').toBe('FIGHT');
    // ⛔ ANTI-VACUITY — a green differential over a run where the clock never moved proves nothing.
    expect(bossSeq, 'raging → cooldown → raging again').toEqual([true, false, true]);
    expect(soldierSeq, 'the frenzied soldier followed him').toEqual([true, false, true]);
    expect(w.creatures.get(boss.id)!.rageStartTick, 'a fresh clock on the re-fire').toBe(start0 + WARLORD_RAGE_TICKS + WARLORD_RAGE_COOLDOWN_TICKS);
  }, 60_000);

  it('⛔ NEGATIVE — a save WITHOUT the stamp makes the mirror disagree: the field is load-bearing', () => {
    const { w, boss } = midRage();
    const snap = JSON.parse(JSON.stringify(snapshot(w, { spawnerState: newSpawner().getState() }))) as {
      creatures: { id: number; rageStartTick?: number }[];
    };
    delete snap.creatures.find((c) => c.id === (boss.id as number))!.rageStartTick;
    const start0 = boss.rageStartTick!;
    const ref = reference(w);
    const b = batch(JSON.stringify(snap));
    // Not the hash (it sees the missing field at frame 0, trivially): the BEHAVIOUR. The first tick the
    // two sims disagree about whether he is raging.
    let diverged = -1;
    for (let f = 0; f < 1500 && diverged < 0; f++) {
      ref(input(f));
      b.frame(input(f));
      const host = w.creatures.get(boss.id)!.enraged === true;
      const mirror = b.world.creatures.get(boss.id)!.enraged === true;
      if (host !== mirror) {
        diverged = w.tick;
        expect(host, 'the host has calmed on his 25 s').toBe(false);
        expect(mirror, 'the stamp-less mirror re-fired a fresh 25 s at INIT and still rages').toBe(true);
      }
    }
    expect(diverged, 'the sims part ways at the host\'s rage end').toBeGreaterThanOrEqual(start0 + WARLORD_RAGE_TICKS);
    expect(diverged).toBeLessThan(start0 + WARLORD_RAGE_TICKS + 3);
  }, 60_000);
});
