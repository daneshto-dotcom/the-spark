/**
 * SPARK — S191 (owner item 2) — WHAT TOWER STOCK COSTS: a real four-seat bots match to WAVE 15.
 *
 * The Council asked for the numbers before and after tower units became STOCK (chewers and drones no
 * longer ageing out across a BUILD): chewers / drones alive per seat, the snapshot's size, and the host
 * tick's mean and p95 — because with the chewer caps OFF (S157 B8b) persistent chewers can only grow,
 * and whether that growth is acceptable is the OWNER's question, not a cap this branch sets.
 *
 * ⛔ OPT-IN, NOT A GATE (135 000 ticks of a real bots match):
 *
 *     SPARK_S191_STOCK=1 npx vitest run src/state/s191StockMeasure.test.ts
 *
 * Two passes: NATURAL (the bots build what they build) and SEEDED (every bot seat is handed one
 * pentagram and one lightning hub at the start of wave 1, so the stock rule is exercised whatever the
 * bots choose). It prints a table and asserts only anti-vacuity. ⚠ Application-level JSON bytes
 * (`wireNumberReplacer` applied, `prevPos` stripped as the transport does) — framing is on top.
 */
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';

import { runHostTick } from './hostTick.ts';
import { PHASE_DURATION_TICKS } from '../constants.ts';
import { startC5Match, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';
import { netSnapshot, wireNumberReplacer } from './save.ts';
import { winScoreForWave } from '../constants.ts';
import { castleMaxHpFor } from './castleUpgrades.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import type { World } from './world.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

const MEASURE = process.env.SPARK_S191_STOCK === '1';
const WAVES = 15;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}
const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

function seedTower(w: World, seat: PlayerId, id: GodlyId): boolean {
  const bank = w.castleBanks.get(seat) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(seat, bank);
  const home = castleAnchor(seat as unknown as number, w.layout);
  for (let r = 150; r <= 330; r += 30) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const at = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (stampRefusalAt(w, at, seat, id) === null) {
        applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: id, centre: at } as never);
        return true;
      }
    }
  }
  return false;
}

interface Row {
  wave: number;
  /** Chewers / drones per seat on the FIRST tick of this FIGHT — the stock that crossed the BUILD. */
  stockChewers: number[];
  stockDrones: number[];
  /** The most chewers / drones / creatures alive at once during this FIGHT. */
  peakChewers: number;
  peakDrones: number;
  peakCreatures: number;
  /** The largest snapshot sampled (every 60 ticks) during this FIGHT. */
  maxBytes: number;
  hostMean: number;
  hostP95: number;
}

function perSeat(w: World, type: string): number[] {
  const out = [0, 0, 0, 0];
  for (const c of w.creatures.values()) {
    if (c.type !== type) continue;
    const s = c.ownerPlayerId as unknown as number;
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}
const count = (w: World, type: string): number => perSeat(w, type).reduce((a, n) => a + n, 0);

function snapshotBytes(w: World): number {
  const snap = netSnapshot(w) as unknown as { primitives?: Array<Record<string, unknown>> };
  const wire = { ...snap, primitives: (snap.primitives ?? []).map(({ prevPos: _p, ...rest }) => rest) };
  return JSON.stringify(wire, wireNumberReplacer).length;
}

async function runPass(seeded: boolean, holdOpen = false): Promise<{ rows: Row[]; reached: number; seededOk: number }> {
  const { world: w, bots: m, deps: d, state: st } = startC5Match(false);
  let seededOk = 0;
  if (seeded) {
    for (const s of [1, 2, 3]) {
      if (seedTower(w, asPlayerId(s), 'pentagram')) seededOk++;
      if (seedTower(w, asPlayerId(s), 'lightningHub')) seededOk++;
    }
    runSpawnerIgnition(w);
  }
  const rows: Row[] = [];
  let cur: Row | null = null;
  let host: number[] = [];
  const endTick = WAVES * WAVE_TICKS;
  while (w.tick < endTick && (w.gameState as string) === 'PLAYING') {
    if (w.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
    const wasFight = w.matchPhase === 'FIGHT';
    if (holdOpen) {
      // The stress case, applied BEFORE the tick so no win can be decided inside it: nobody reaches
      // the bar, every keep is topped up, and each bot seat keeps a pentagram and a hub standing
      // (re-stamped at the start of every BUILD if the enemy razed them) — the growth case.
      // `tickGameState` wins on `world.scoreProgress`; the per-seat scores feed it. Both, with margin.
      const bar = winScoreForWave(w.waveNumber) - 100;
      for (const [seat, sc] of w.scoreByPlayer) if (sc > bar) w.scoreByPlayer.set(seat, bar);
      if (w.scoreProgress > bar) w.scoreProgress = bar;
      for (const p of w.players.values()) p.castleHp = castleMaxHpFor(p.castleUpgrades);
      if (w.matchPhase === 'BUILD' && w.tick === (w.waveNumber - 1) * WAVE_TICKS + 1) {
        for (const s of [1, 2, 3]) {
          const seat = asPlayerId(s);
          const has = (id: GodlyId) => [...w.creatureSpawners.values()].some((sp) => sp.ownerPlayerId === seat && sp.recipeId === id);
          if (!has('pentagram')) seedTower(w, seat, 'pentagram');
          if (!has('lightningHub')) seedTower(w, seat, 'lightningHub');
        }
        runSpawnerIgnition(w);
      }
    }
    m.tick(w);
    const t1 = performance.now();
    runHostTick(w, d, st);
    const t2 = performance.now();
    w.effects.length = 0;
    if (w.matchPhase === 'FIGHT' && !wasFight) {
      cur = {
        wave: w.waveNumber, stockChewers: perSeat(w, 'chewer'), stockDrones: perSeat(w, 'lightningDrone'),
        peakChewers: 0, peakDrones: 0, peakCreatures: 0, maxBytes: 0, hostMean: 0, hostP95: 0,
      };
      rows.push(cur);
      host = [];
    }
    if (w.matchPhase === 'FIGHT' && cur !== null) {
      host.push(t2 - t1);
      cur.peakChewers = Math.max(cur.peakChewers, count(w, 'chewer'));
      cur.peakDrones = Math.max(cur.peakDrones, count(w, 'lightningDrone'));
      cur.peakCreatures = Math.max(cur.peakCreatures, w.creatures.size);
      if (w.tick % 60 === 0) cur.maxBytes = Math.max(cur.maxBytes, snapshotBytes(w));
      cur.hostMean = mean(host);
      cur.hostP95 = pct(host, 0.95);
    }
  }
  return { rows, reached: w.waveNumber, seededOk };
}

function print(label: string, r: { rows: Row[]; reached: number; seededOk: number }): void {
  console.log(`
  ${label} — reached wave ${r.reached}${r.seededOk > 0 ? `, seeded towers placed: ${r.seededOk}/6` : ''}`);
  console.log('  wave | stock chewers s0..s3 @FIGHT start | stock drones | peak chew/drone/all | max snap KiB | host ms mean / p95');
  for (const row of r.rows) {
    console.log(
      `  ${String(row.wave).padStart(4)} | ${row.stockChewers.map((n) => String(n).padStart(3)).join(' ')} | ${row.stockDrones.map((n) => String(n).padStart(2)).join(' ')} | ${String(row.peakChewers).padStart(4)} / ${String(row.peakDrones).padStart(2)} / ${String(row.peakCreatures).padStart(4)} | ${(row.maxBytes / 1024).toFixed(1).padStart(8)} | ${row.hostMean.toFixed(2)} / ${row.hostP95.toFixed(2)}`,
    );
  }
}

describe.skipIf(!MEASURE)('S191 — tower stock, measured to wave 15 (opt-in)', () => {
  it('NATURAL: the bots build what they build', { timeout: 1_800_000 }, async () => {
    const r = await runPass(false);
    print('NATURAL', r);
    expect(r.rows.length, 'anti-vacuity: FIGHTs were sampled').toBeGreaterThan(0);
  });
  it('SEEDED: every bot seat also holds a pentagram and a lightning hub from wave 1', { timeout: 1_800_000 }, async () => {
    const r = await runPass(true);
    print('SEEDED', r);
    expect(r.seededOk, 'anti-vacuity: the seeded towers were placed').toBeGreaterThan(0);
    expect(r.rows.length).toBeGreaterThan(0);
    void PHASE_DURATION_TICKS;
  });
  it('STRESS: towers kept standing, the match held open to wave 15 (no win, no keep falls)', { timeout: 3_600_000 }, async () => {
    const r = await runPass(true, true);
    print('STRESS (held open)', r);
    expect(r.reached).toBeGreaterThanOrEqual(WAVES);
  });
});
