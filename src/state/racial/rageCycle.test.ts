/**
 * SPARK — S188 fix round F3 — ⛔ A RAGE CHANGE MID-SWING TAKES EFFECT NEXT CYCLE: ONE BLOW PER CYCLE.
 *
 * Cadence and fire tick were re-derived from the LIVE `enraged` bit every tick. With BLOOD FRENZY
 * switching whole armies in and out of rage, a change in the middle of a swing broke the cycle:
 *   · rage → calm after the raged fire tick (15): the calm fire tick (30) fired a SECOND blow;
 *   · calm → rage after tick 15: both fire ticks were missed and the cycle ended with NO blow.
 * The FSM now latches the cycle's rage on its first tick (`Creature.attackCycleRaged`).
 *
 * Measured through the real `runHostTick`: a warband chewing a 20-connector building (pool 500, so no
 * connector breaks and every 18-fifth strike stays readable), rage flipped at cycle tick 20.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, type Creature } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { restore, snapshot } from '../save.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const SWING = 18; // t3Warband: attackFifths(3, 1)

function board(): World {
  const w = makeWorld(0x1883);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.draft = null;
  // No perk anywhere, so nothing but this test writes `enraged`.
  for (const pl of w.players.values()) pl.draftPicks = ['hp', 'def'];
  return w;
}

function shape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[seat]!,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

function building(w: World, n: number): BondId[] {
  let prev = shape(w, P1, 500, 300);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = shape(w, P1, 500 + 32 * i, 300);
    const id = asBondId(18300 + i);
    w.bonds.set(id, {
      id, aId: prev.id, bId: next.id, a: prev, b: next,
      restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
    } as never);
    prev.bonds.add(id);
    next.bonds.add(id);
    out.push(id);
    prev = next;
  }
  return out;
}

function attacker(w: World): Creature {
  const c = makeCreature(getCreatureConfig('t3Warband'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0, pos: { x: 495, y: 300 },
    targetPos: { x: 495, y: 300 }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(901), clock: w,
  });
  c.ehp = 10_000; // it is not what is being measured
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
} as unknown as HostTickDeps);

interface Cycle { strikes: number; length: number }

/**
 * Run three attack cycles starting raged or calm; in the SECOND, flip `enraged` at cycle tick 20.
 * Returns that cycle and the one after it: blows landed and ticks spent in ATTACKING.
 */
function measure(startRaged: boolean): { flipped: Cycle; after: Cycle } {
  const w = board();
  const bonds = building(w, 20);
  const a = attacker(w);
  a.enraged = startRaged;
  const d = deps();
  const st = makeHostTickState(w);
  const banked = (): number => bonds.reduce((s, b) => s + (w.bonds.get(b)?.damageFifths ?? 0), 0);

  const cycles: Cycle[] = [];
  let open: Cycle | null = null;
  let last = banked();
  for (let t = 0; t < 600 && cycles.length < 3; t++) {
    runHostTick(w, d, st);
    const c = w.creatures.get(a.id)!;
    const now = banked();
    if (c.state === 'ATTACKING' && c.ticksInState === 1) open = { strikes: 0, length: 0 };
    if (open !== null) {
      if (now > last) open.strikes += (now - last) / SWING;
      if (c.state === 'ATTACKING') {
        open.length = c.ticksInState + 1;
        if (cycles.length === 1 && c.ticksInState === 20) c.enraged = !startRaged; // the mid-swing flip
      } else {
        cycles.push(open);
        open = null;
      }
    }
    last = now;
  }
  expect(bonds.every((b) => w.bonds.has(b)), 'fixture: nothing broke, so nothing was drained').toBe(true);
  expect(cycles.length, 'fixture: three full cycles').toBe(3);
  return { flipped: cycles[1]!, after: cycles[2]! };
}

describe('S188 F3 — a mid-swing rage change waits for the next cycle', () => {
  it('⛔ RAGE → CALM after the raged blow: still ONE blow, and the raged 30-tick cycle ends on time', () => {
    const r = measure(true);
    expect(r.flipped).toEqual({ strikes: 1, length: 30 });
    expect(r.after, 'the next cycle is calm').toEqual({ strikes: 1, length: 60 });
  });

  it('⛔ CALM → RAGE after tick 15: still ONE blow (not zero), and the calm 60-tick cycle runs out', () => {
    const r = measure(false);
    expect(r.flipped).toEqual({ strikes: 1, length: 60 });
    expect(r.after, 'the next cycle is raged').toEqual({ strikes: 1, length: 30 });
  });
});

describe('S188 F3 — `attackCycleRaged` is a four-sites field', () => {
  function withUnit(): { w: World; c: Creature } {
    const w = board();
    return { w, c: attacker(w) };
  }

  it('HASH: the latch moves the wide hash', () => {
    const { w, c } = withUnit();
    const before = hashWorldStateFull(w);
    c.attackCycleRaged = true;
    expect(hashWorldStateFull(w)).not.toBe(before);
  });

  it('SAVE: survives snapshot → restore (worker INIT, host migration); absent when not set', () => {
    const { w, c } = withUnit();
    c.attackCycleRaged = true;
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    expect(dst.creatures.get(c.id)!.attackCycleRaged).toBe(true);

    const { w: w2, c: c2 } = withUnit();
    const snap = JSON.stringify(snapshot(w2));
    expect(snap.includes('attackCycleRaged'), 'an unraged board carries no field').toBe(false);
    const dst2 = makeWorld(1);
    restore(JSON.parse(snap), dst2);
    expect(dst2.creatures.get(c2.id)!.attackCycleRaged).toBeUndefined();
  });
});
