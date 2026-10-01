/**
 * ⭐⭐ S191 (owner) — **OVERKILL CARRIES: ONE HIT FELLS AS MANY CONNECTORS AS IT COVERS.**
 *
 * > *"I do want the overkill to carry forward because there's only a few like enemies that can
 * > actually do that … one boss should be able to sever like one connection or a few connections from
 * > … a regular … tier three tower. Yeah, one hit, boom, done. For now, it destroys … however many
 * > connectors the hit does … If it looks too OP, then later we will change that."* — owner, S191
 *
 * Canon §2 (R173-A/B): the full pool is the cost of ONE connector, the survivors re-form at the lower
 * count, and the pool is SPENT on a sever so the overkill carries. The tree never did the carry: the
 * breaking hit's remainder sat on the struck bond and the sever deleted it with the bond. Now the
 * struck connector falls first (R173-C) and what is left walks on — 50 → 36 → 24 → 14 → 6 — while it
 * covers the next pool, and the last remainder banks on the structure.
 *
 * Every number below is off the ladder, `structurePoolFifths(n)` = n × (5 + n): 5→50 · 4→36 · 3→24 ·
 * 2→14 · 1→6, 130 for the whole tower. Driven through the real `damageConnector`, the real
 * `SEVER_BOND` reducer, the real creature strike, and the real host tick against a `?worker=1` sim.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type CreatureId, type PlayerId } from '../types.ts';
import { applyCreatureAttack } from './creatures/creatureAttack.ts';
import { creatureAttackFifths } from './creatures/creature.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { makeGameStateExtras } from './gameState.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { structurePoolFifths } from './stats.ts';
import { applyTickBatch, makeWorkerSim } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { rampFrameForHealth } from '../render/structureRamp.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x191e0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

function prim(w: World, seat: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const color = w.players.get(seat)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: Math.sqrt(dx * dx + dy * dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A fresh 5-connector star of seat 0's: a hub and five leaves at `radii` (one per leaf). */
function star(w: World, cx: number, cy: number, hubType = SparkType.Square, leafType = SparkType.Square): { hub: Primitive; bonds: BondId[] } {
  const hub = prim(w, P0, hubType, cx, cy);
  const bonds: BondId[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    bonds.push(link(w, hub, prim(w, P0, leafType, cx + Math.cos(a) * 40, cy + Math.sin(a) * 40)));
  }
  return { hub, bonds };
}

const sever = (w: World) => (bondId: BondId): void => {
  dispatch(w, { type: 'SEVER_BOND', bondId, playerId: P1, cause: 'unit' });
};
const banked = (w: World, ids: readonly BondId[]): number =>
  ids.reduce((s, id) => s + (w.bonds.get(id)?.damageFifths ?? 0), 0);

describe('⭐⭐ S191 (owner) — overkill carries through the real damageConnector + SEVER_BOND', () => {
  it('the ladder: 5→50 · 4→36 · 3→24 · 2→14 · 1→6, 130 for the whole tower', () => {
    expect([5, 4, 3, 2, 1].map(structurePoolFifths)).toEqual([50, 36, 24, 14, 6]);
    expect([5, 4, 3, 2, 1].map(structurePoolFifths).reduce((a, b) => a + b, 0)).toBe(130);
  });

  it('⭐ canon §2: a 150 on a fresh 5-connector tower fells ALL FIVE — 50, 36, 24, 14, 6 — and the last 20 has nothing to land on', () => {
    const w = board();
    const { bonds } = star(w, 500, 400);
    expect(damageConnector(w, bonds[0]!, 150, null)).toBe(true);
    expect(severWithCarry(w, bonds[0]!, sever(w)), 'connectors felled').toBe(5);
    expect(bonds.filter((b) => w.bonds.has(b))).toEqual([]);
    // Each felling hit, as `connectorBreakHits` records it: the 150, then what is left after each pool.
    expect(w.connectorBreakHits.map((h) => h.amount)).toEqual([150, 100, 64, 40, 26]);
  });

  it('⭐ a 100 fells TWO (50, 36) and banks the remaining 14 on the three survivors', () => {
    const w = board();
    const { bonds } = star(w, 500, 400);
    expect(damageConnector(w, bonds[0]!, 100, null)).toBe(true);
    expect(severWithCarry(w, bonds[0]!, sever(w))).toBe(2);
    const standing = bonds.filter((b) => w.bonds.has(b));
    expect(standing).toHaveLength(3);
    expect(banked(w, standing), 'the remainder banks on the structure').toBe(14);
    expect(structurePoolFifths(3), 'and it does not cover the next pool').toBeGreaterThan(14);
  });

  it('a hit EXACTLY one pool fells one and carries nothing', () => {
    const w = board();
    const { bonds } = star(w, 500, 400);
    expect(damageConnector(w, bonds[0]!, 50, null)).toBe(true);
    expect(severWithCarry(w, bonds[0]!, sever(w))).toBe(1);
    const standing = bonds.filter((b) => w.bonds.has(b));
    expect(standing).toHaveLength(4);
    expect(banked(w, standing)).toBe(0);
  });

  it('negative — a small hit fells nothing and carries nothing extra: it simply banks', () => {
    const w = board();
    const { bonds } = star(w, 500, 400);
    expect(damageConnector(w, bonds[0]!, 12, null)).toBe(false);
    expect(bonds.every((b) => w.bonds.has(b))).toBe(true);
    expect(banked(w, bonds)).toBe(12);
  });

  it('⚠ MINE — the next to fall is the survivor NEAREST the struck bond\'s midpoint (squared), then the lowest id', () => {
    const w = board();
    const hub = prim(w, P0, SparkType.Square, 500, 400);
    // Leaves along +x at growing distances, plus one tied pair on ±y.
    const struck = link(w, hub, prim(w, P0, SparkType.Square, 540, 400));
    const far = link(w, hub, prim(w, P0, SparkType.Square, 400, 400));
    const tieHigh = link(w, hub, prim(w, P0, SparkType.Square, 500, 440));
    const tieLow = link(w, hub, prim(w, P0, SparkType.Square, 500, 360));
    const next = link(w, hub, prim(w, P0, SparkType.Square, 540, 420));
    const order: BondId[] = [];
    damageConnector(w, struck, 150, null);
    severWithCarry(w, struck, (id) => { order.push(id); sever(w)(id); });
    // struck mid (520, 400): next (520, 410) d²=100; tieHigh (500, 420) and tieLow (500, 380) d²=800
    // each — the lower id first; far (450, 400) d²=4900.
    expect(order).toEqual([struck, next, tieHigh < tieLow ? tieHigh : tieLow, tieHigh < tieLow ? tieLow : tieHigh, far]);
  });

  it('a sever the reducer REFUSES stops the carry — nothing is felled past a connector that stood', () => {
    const w = board();
    const { bonds } = star(w, 500, 400);
    damageConnector(w, bonds[0]!, 150, null);
    expect(severWithCarry(w, bonds[0]!, () => { /* refused: nothing happens */ })).toBe(0);
    expect(bonds.every((b) => w.bonds.has(b))).toBe(true);
  });
});

/* ───────────────────────── REACH — the real creature strike, the real host tick ───────────────────────── */

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(spawner: Spawner): HostTickDeps {
  return {
    spawner, controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function spawnSwarm(w: World, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 't3BatSwarm', ownerPlayerId: P1,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: 9191 as never,
  });
  return [...w.creatures.values()].find((c) => c.type === 't3BatSwarm')!.id;
}

describe('⭐ S191 — REACH: one swarm bite (132) fells a whole lightning hub, and its recipe breaks', () => {
  it('the real creature strike fells all five of a REAL hub\'s connectors; the next poll tears the hub down; the ramp\'s target is its last frame', () => {
    const w = makeWorld(0x191e1);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    const { hub, bonds } = star(w, 600, 400, SparkType.Dot, SparkType.Circle);
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 600, y: 400 }, bondCount: 5 });
    const d = deps(new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)));
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    for (let t = 0; t < 2; t++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); }
    expect(w.creatureSpawners.size, 'fixture: the hub ignited').toBe(1);
    for (const sp of w.creatureSpawners.values()) sp.nextSpawnTick = 1_000_000_000; // no drones

    const swarm = spawnSwarm(w, 640, 410);
    const c = w.creatures.get(swarm)!;
    expect(creatureAttackFifths(c), 'the swarm\'s bite').toBe(132);
    c.state = 'ATTACKING';
    const target = bonds[0]!;
    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: swarm, bondId: target });
    expect(bonds.filter((b) => w.bonds.has(b)), 'one bite: all five connectors (132 ≥ 130)').toEqual([]);
    expect(w.creatures.get(swarm)!.killCount).toBeGreaterThan(0);
    expect(rampFrameForHealth(0, 24), 'R182-D: the ramp plays through to its last frame').toBe(24);

    for (let t = 0; t < 40 && w.creatureSpawners.size > 0; t++) runHostTick(w, d, st);
    expect(w.creatureSpawners.size, 'the recipe is broken: the poll tore the hub down').toBe(0);
    void hub;
  });

  it('⛔ host vs ?worker=1 — a swarm felling a tower through the real host tick stays byte-identical (wide hash, every tick)', () => {
    const a = makeWorld(0x191e2);
    dispatch(a, { type: 'START_GAME', mode: '1v1', isHost: true });
    a.gameState = 'PLAYING';
    a.matchPhase = 'FIGHT';
    a.phaseEndsAtTick = a.tick + 1_000_000;
    a.creatures.clear();
    const { bonds } = star(a, 700, 300); // Squares: no recipe, so no ignition to mirror
    spawnSwarm(a, 760, 300);
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));
    const sim = makeWorkerSim({
      type: 'INIT', saveJson: JSON.stringify(snapshot(a, { spawnerState: spawner.getState() })), hostSeats: [], localPlayerId: 0,
    });
    const d = deps(spawner);
    const st = makeHostTickState(a);
    const cursor = { lastMatcherTick: -1 };
    expect(hashWorldStateFull(sim.world), 'INIT is exact').toBe(hashWorldStateFull(a));
    let felledAtOnce = 0;
    for (let t = 0; t < 400; t++) {
      const before = bonds.filter((b) => a.bonds.has(b)).length;
      runHostTick(a, d, st);
      runGodlyMatcherCore(a, cursor);
      a.effects.length = 0;
      a.razedNotKilled.length = 0;
      a.connectorBreakHits.length = 0;
      a.creatureKillHits.length = 0;
      a.structureKillHits.length = 0;
      applyTickBatch(sim, {
        type: 'TICK_BATCH', batchSeq: t + 1, ticks: 1, control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
        alivePeerIds: null, intents: [], nowMs: t * 16,
      });
      const after = bonds.filter((b) => a.bonds.has(b)).length;
      if (before - after > 1) felledAtOnce = Math.max(felledAtOnce, before - after);
      expect(hashWorldStateFull(sim.world), `tick ${a.tick}`).toBe(hashWorldStateFull(a));
    }
    expect(felledAtOnce, 'anti-vacuity: one tick felled several connectors (the carry fired)').toBeGreaterThan(1);
  });
});
