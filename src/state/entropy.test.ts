/**
 * ⭐⭐ S194 (owner, R194-18) — THE ENTROPY TAX. Arithmetic, REACH through the real host tick, the
 * negatives, the toast, determinism (replay + host vs ?worker=1 wide hash), and the source guards.
 * Every expected number is DERIVED from the constants, so a re-tune moves the test with it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS, GOBLIN_ATTACK_CADENCE_TICKS, GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN,
  PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType,
} from '../constants.ts';
import type { GameEffect } from '../game/effects.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Primitive } from '../game/primitive.ts';
import { componentOf } from '../game/structure.ts';
import type { Controls } from '../input/controls.ts';
import { captureSeverToast, severToastCopy } from '../render/severToastRenderer.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../types.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import {
  ENTROPY_CAP, ENTROPY_FREE_CONNECTORS, ENTROPY_RATE_PER_CONNECTOR, ENTROPY_SCALE,
  applyEntropyTax, entropyChance, entropyRoll, planEntropy,
} from './entropy.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { snapshot } from './save.ts';
import { tickSudoku } from './sudokuEvent.ts';
import { severActor } from './severBond.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { attackFifths, structurePoolFifths } from './stats.ts';
import { applyTickBatch, makeWorkerSim } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function match(seed: number): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

/** A freeform lattice of `shapes` shapes (Square/Triangle alternating) with exactly `connectors` nearest-first bonds, seat 0, ONE component. */
function lattice(w: World, shapes: number, connectors: number, ox: number, oy: number): BondId[] {
  const cols = Math.ceil(Math.sqrt(shapes));
  const ps: Primitive[] = [];
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = ox + c * 40 + (r % 2) * 20, y = oy + r * 35;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    // mixed types: a same-type ≥ 12-connector blob would open the NONET trial (sudokuEvent.ts)
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: w.tick,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[0]!,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
    w.primitives.set(id, p);
    ps.push(p);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i]!.pos.x - ps[j]!.pos.x, dy = ps[i]!.pos.y - ps[j]!.pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  const out: BondId[] = [];
  const add = (i: number, j: number) => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    const id = asBondId(w.nextBondId++);
    const a = ps[i]!, b = ps[j]!;
    const rest = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: rest, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick } as never);
    a.bonds.add(id); b.bonds.add(id);
    out.push(id);
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (out.length >= connectors) break; add(i, j); }
  expect(out.length, 'fixture: exact connector count').toBe(connectors);
  expect(componentOf(ps[0]!, w.primitives, w.bonds).bondIds.size, 'fixture: one component').toBe(connectors);
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(spawner: Spawner): HostTickDeps {
  return {
    spawner, controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const entropySevers = (effects: readonly GameEffect[]) =>
  effects.filter((e) => e.kind === 'BOND_SEVERED' && e.cause === 'entropy').length;

/** Cross ONE phase edge through the real host tick; returns that tick's effects. */
function crossEdge(w: World, d: HostTickDeps, st: ReturnType<typeof makeHostTickState>): GameEffect[] {
  w.effects.length = 0;
  w.phaseEndsAtTick = w.tick;
  runHostTick(w, d, st);
  const fx = [...w.effects];
  w.creatures.clear(); // keep the fight to the tax alone
  return fx;
}

/* ─────────────────────────────── ARITHMETIC ─────────────────────────────── */

describe('⭐ S194 R194-18 — the entropy arithmetic', () => {
  it('the ruled constants: free 10, +0.1 % per connector past it, cap 50 %', () => {
    expect(ENTROPY_SCALE).toBe(10_000);
    expect(ENTROPY_FREE_CONNECTORS).toBe(10);
    expect((ENTROPY_RATE_PER_CONNECTOR * 100) / ENTROPY_SCALE, 'R194-18 "mean +0.1%"').toBe(0.1);
    expect((ENTROPY_CAP * 100) / ENTROPY_SCALE, 'R194-18 "capped at 50"').toBe(50);
  });

  it('his two examples, and the edges — every expectation derived from the constants', () => {
    const at = (n: number) => Math.min(ENTROPY_CAP, ENTROPY_RATE_PER_CONNECTOR * (n - ENTROPY_FREE_CONNECTORS));
    for (const n of [0, 1, 5, 9, ENTROPY_FREE_CONNECTORS]) expect(entropyChance(n), `n=${n} is free`).toBe(0);
    expect(entropyChance(ENTROPY_FREE_CONNECTORS + 1)).toBe(ENTROPY_RATE_PER_CONNECTOR);
    expect(entropyChance(54)).toBe(at(54));
    expect(entropyChance(145)).toBe(at(145));
    // the ruled value, in words: 54c → 4.4 % per connector, 145c → 13.5 %
    expect(entropyChance(54) / 100).toBe(4.4);
    expect(entropyChance(145) / 100).toBe(13.5);
    // the cap: reached at FREE + CAP/RATE connectors (510), never exceeded
    const capN = ENTROPY_FREE_CONNECTORS + ENTROPY_CAP / ENTROPY_RATE_PER_CONNECTOR;
    expect(entropyChance(capN)).toBe(ENTROPY_CAP);
    expect(entropyChance(capN - 1)).toBeLessThan(ENTROPY_CAP);
    expect(entropyChance(capN * 10)).toBe(ENTROPY_CAP);
  });

  it('the roll is a stateless integer in [0, SCALE), the same inputs give the same roll, the wave changes it', () => {
    let sameAcrossWaves = 0;
    for (let b = 1; b < 500; b++) {
      const r = entropyRoll(0xabc, 3, asBondId(b));
      expect(Number.isInteger(r) && r >= 0 && r < ENTROPY_SCALE).toBe(true);
      expect(entropyRoll(0xabc, 3, asBondId(b))).toBe(r);
      if (entropyRoll(0xabc, 4, asBondId(b)) === r) sameAcrossWaves++;
    }
    expect(sameAcrossWaves).toBeLessThan(5);
  });

  it('WHY it exists (measured): the 145c blob costs 21 750 a connector and 20 goblins fell none in a fight; 54c costs 3 186', () => {
    expect(structurePoolFifths(145)).toBe(21_750);
    expect(structurePoolFifths(54)).toBe(3_186);
    const w = match(0x194e1);
    const bonds = lattice(w, 65, 145, 300, 220);
    const swings = 20 * Math.floor(FIGHT_PHASE_TICKS / GOBLIN_ATTACK_CADENCE_TICKS);
    const hit = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
    let felled = 0;
    for (let k = 0; k < swings; k++) {
      if (damageConnector(w, bonds[0]!, hit, null, 'physical')) {
        felled += severWithCarry(w, bonds[0]!, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P1, cause: 'unit' }));
      }
    }
    expect(swings * hit).toBeLessThan(structurePoolFifths(145));
    expect(felled).toBe(0);
  });
});

/* ─────────────────────────────── REACH — the real host tick ─────────────────────────────── */

describe('⭐ S194 R194-18 — REACH: the tax fires at the FIGHT whistle through runHostTick', () => {
  function campaign(seed: number, waves: number) {
    const w = match(seed);
    const big = lattice(w, 65, 145, 260, 200);
    const mid = lattice(w, 24, 54, 760, 220);
    const tower = lattice(w, 7, ENTROPY_FREE_CONNECTORS, 600, 560); // a 10-connector structure: free
    const d = deps(new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)));
    const st = makeHostTickState(w);
    const perWave: Array<{ big: number; mid: number; tower: number; fx: number; toast: string | null }> = [];
    const left = (ids: BondId[]) => ids.filter((b) => w.bonds.has(b)).length;
    for (let k = 0; k < waves; k++) {
      const before = { big: left(big), mid: left(mid), tower: left(tower) };
      const fx = crossEdge(w, d, st); // BUILD → FIGHT: the tax
      expect(w.matchPhase).toBe('FIGHT');
      perWave.push({
        big: before.big - left(big), mid: before.mid - left(mid), tower: before.tower - left(tower),
        fx: entropySevers(fx), toast: captureSeverToast(fx, P0, new Set()).text,
      });
      const back = crossEdge(w, d, st); // FIGHT → BUILD: never taxes
      expect(w.matchPhase).toBe('BUILD');
      expect(entropySevers(back), 'the BUILD edge never taxes').toBe(0);
    }
    return perWave;
  }

  it('145c and 54c lose connectors in the expected range; a 10-connector structure never loses one', () => {
    const perWave = campaign(0x194e2, 8);
    const first = perWave[0]!;
    // first wave against the expected value n × chance (145 × 13.5 % ≈ 19.6; 54 × 4.4 % ≈ 2.4)
    const mean = (n: number) => (n * entropyChance(n)) / ENTROPY_SCALE;
    expect(first.big).toBeGreaterThanOrEqual(Math.floor(mean(145) / 2));
    expect(first.big).toBeLessThanOrEqual(Math.ceil(mean(145) * 2));
    const bigTotal = perWave.reduce((a, p) => a + p.big, 0);
    const midTotal = perWave.reduce((a, p) => a + p.mid, 0);
    expect(bigTotal, '145c keeps eroding after the first wave').toBeGreaterThan(first.big);
    expect(midTotal, '54c loses some').toBeGreaterThan(0);
    expect(midTotal, '54c is not wiped').toBeLessThan(54);
    expect(perWave.every((p) => p.tower === 0), 'a 10-connector structure is never taxed').toBe(true);
    // every 'entropy' sever is one of these two structures' connectors
    for (const p of perWave) expect(p.fx).toBeLessThanOrEqual(p.big + p.mid);
    // the owner of the structure reads the toast, with the count
    expect(first.fx).toBeGreaterThan(0);
    expect(first.toast).toBe(severToastCopy('entropy', null, first.fx));
    expect(first.toast).toMatch(/^ENTROPY: \d+ CONNECTORS? SNAPPED$/);
  });

  it('negative — a board of free structures (≤ 10 connectors) loses nothing at any whistle', () => {
    const w = match(0x194e3);
    const a = lattice(w, 7, 10, 300, 300);
    const b = lattice(w, 6, 9, 700, 300);
    const d = deps(new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)));
    const st = makeHostTickState(w);
    for (let k = 0; k < 20; k++) {
      expect(entropySevers(crossEdge(w, d, st))).toBe(0);
      crossEdge(w, d, st);
    }
    expect([...a, ...b].every((id) => w.bonds.has(id))).toBe(true);
  });

  it('the plan is ascending and read off a snapshot; every planned connector goes, and a split can take a chunk with it', () => {
    const w = match(0x194e4);
    const all = lattice(w, 65, 145, 260, 200);
    const plan = planEntropy(w);
    expect(plan.length).toBeGreaterThan(0);
    expect([...plan].sort((x, y) => Number(x) - Number(y))).toEqual(plan);
    const snapped = applyEntropyTax(w);
    expect(plan.every((id) => !w.bonds.has(id)), 'every planned connector is gone').toBe(true);
    // a planned bond already deleted by an earlier snap's split (its shape went with the smaller side)
    // is skipped, so the count is at most the plan; the board can lose MORE than the plan (the chunk).
    expect(snapped).toBeLessThanOrEqual(plan.length);
    expect(all.length - all.filter((id) => w.bonds.has(id)).length).toBeGreaterThanOrEqual(snapped);
  });
});

/* ─────────────────────────────── DETERMINISM ─────────────────────────────── */

describe('⭐ S194 R194-18 — determinism', () => {
  it('two runs, same seed → identical wide hash; a different seed → a different set (anti-vacuity)', () => {
    const run = (seed: number) => {
      const w = match(seed);
      lattice(w, 65, 145, 260, 200);
      return { plan: planEntropy(w).map(Number), w };
    };
    const a = run(0x194e5), b = run(0x194e5);
    applyEntropyTax(a.w);
    applyEntropyTax(b.w);
    expect(hashWorldStateFull(a.w)).toBe(hashWorldStateFull(b.w));
    expect(run(0x194e6).plan).not.toEqual(a.plan);
  });

  it('⛔ host vs ?worker=1 — the FIGHT-whistle tax stays byte-identical (wide hash, every tick)', () => {
    const a = match(0x194e7);
    lattice(a, 65, 145, 260, 200);
    lattice(a, 24, 54, 760, 220);
    a.phaseEndsAtTick = a.tick + 3; // both sides cross the BUILD → FIGHT edge on their own (after any NONET freeze)
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));
    const sim = makeWorkerSim({
      type: 'INIT', saveJson: JSON.stringify(snapshot(a, { spawnerState: spawner.getState() })), hostSeats: [], localPlayerId: 0,
    });
    const d = deps(spawner);
    const st = makeHostTickState(a);
    expect(hashWorldStateFull(sim.world), 'INIT is exact').toBe(hashWorldStateFull(a));
    let taxed = 0;
    for (let t = 0; t < 400 && (t < 12 || a.matchPhase === 'BUILD'); t++) {
      // the main thread's NONET freeze, verbatim with the worker's drain loop (a puzzle opens at match start)
      if (a.gameState === 'PLAYING' && a.sudoku !== null) { a.tick++; tickSudoku(a); } else runHostTick(a, d, st);
      taxed += entropySevers(a.effects);
      a.effects.length = 0;
      a.razedNotKilled.length = 0;
      a.connectorBreakHits.length = 0;
      a.creatureKillHits.length = 0;
      a.structureKillHits.length = 0;
      applyTickBatch(sim, {
        type: 'TICK_BATCH', batchSeq: t + 1, ticks: 1, control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
        alivePeerIds: null, intents: [], nowMs: t * 16,
      });
      expect(hashWorldStateFull(sim.world), `tick ${a.tick}`).toBe(hashWorldStateFull(a));
    }
    expect(taxed, 'anti-vacuity: the whistle taxed something').toBeGreaterThan(0);
  });
});

/* ─────────────────────────────── EVERY CONSUMER OF THE CAUSE ─────────────────────────────── */

describe('⭐ S194 R194-18 — the new cause reached every consumer (CLAUDE.md §7: tolerant defaults too)', () => {
  it('no actor, its own toast (never the tolerant "BROKE YOUR BOND")', () => {
    expect(severActor({ type: 'SEVER_BOND', bondId: asBondId(1), playerId: P0, cause: 'entropy' })).toBeUndefined();
    expect(severToastCopy('entropy', null, 1)).toBe('ENTROPY: 1 CONNECTOR SNAPPED');
    expect(severToastCopy('entropy', null, 7)).toBe('ENTROPY: 7 CONNECTORS SNAPPED');
    expect(severToastCopy('entropy', 'P2', 3)).not.toContain('BROKE');
  });

  it('source guards (each paired with a REACH test above): the hook in the FIGHT arm, the gate bypass, the silent audio arm', () => {
    const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const host = src('./hostTick.ts');
    expect(host.split('applyEntropyTax(world)').length - 1, 'ONE production call site').toBe(1);
    const call = host.indexOf('applyEntropyTax(world);');
    const arm = host.lastIndexOf("if (world.matchPhase === 'FIGHT') {", call);
    const other = host.lastIndexOf("if (world.matchPhase === 'BUILD')", call);
    expect(arm, 'inside the FIGHT edge arm').toBeGreaterThan(other);
    expect(host.lastIndexOf('if (flipped) {', call), 'inside the flipped guard').toBeGreaterThan(0);
    expect(src('./disruptionManager.ts')).toContain("action.cause === 'entropy'");
    expect(src('../render/audioManager.ts')).toContain("effect.cause === 'entropy'");
  });
});
