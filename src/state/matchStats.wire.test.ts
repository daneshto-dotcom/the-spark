/**
 * SPARK — ⭐ S191: WHAT THE STAT BOARD COSTS ON THE WIRE, MEASURED (Council item, S191).
 *
 * A heavy late match: four seats, eight unit types built and killed each with five-digit damage totals, and
 * thirty waves of history. The numbers are PRINTED (so the progress file records a measurement, not a
 * guess) and BOUNDED (so a later change that bloats the block goes red instead of quietly riding 10 Hz).
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import { HISTORY_WINDOW_TICKS, recordDamage, recordKill, recordTowerBuilt, recordTowerFell, recordUnitBuilt, recordWaveSample } from './matchStats.ts';
import { netSnapshot, snapshot, wireNumberReplacer } from './save.ts';
import { makeWorld, type World } from './world.ts';

const TYPES: readonly CreatureType[] = [
  'raceUnit', 'goblinMelee', 'goblinArcher', 'goblinShield', 'chewer', 'lightningDrone', 'direwolf', 'voltkin',
];

function heavyMatch(waves = 30): World {
  const w = makeWorld(0x5191d);
  for (let i = 0; i < 4; i++) {
    const id = asPlayerId(i);
    if (!w.players.has(id)) w.players.set(id, makeIdlePlayer(id, PLAYER_COLORS[i]!));
  }
  for (let seat = 0; seat < 4; seat++) {
    const me = asPlayerId(seat);
    const foe = asPlayerId((seat + 1) % 4);
    TYPES.forEach((t, k) => {
      for (let n = 0; n < 40 + k * 17; n++) recordUnitBuilt(w, me, t);
      for (let n = 0; n < 20 + k * 9; n++) recordKill(w, me, foe, t);
    });
    for (let n = 0; n < 12; n++) recordTowerBuilt(w, me);
    for (let n = 0; n < 7; n++) recordTowerFell(w, me);
    // ⭐ S194 v2 — every target class, and every other seat as a victim (a full who-hit-whom row).
    for (let k = 1; k < 4; k++) {
      const victim = asPlayerId((seat + k) % 4);
      recordDamage(w, victim, me, 98_765, 'unit');
      recordDamage(w, victim, me, 45_678, 'structure');
      recordDamage(w, victim, me, 23_456, 'keep');
    }
  }
  for (let wave = 1; wave <= waves; wave++) {
    for (let seat = 0; seat < 4; seat++) w.scoreByPlayer.set(asPlayerId(seat), wave * 1_234 + seat);
    w.tick = wave * 8_100;
    recordWaveSample(w, wave);
  }
  return w;
}

const bytes = (v: unknown): number => JSON.stringify(v, wireNumberReplacer).length;

describe('S191 — the stat board on the wire, measured', () => {
  it('the running totals ride every snapshot cheaply; the history rides only its window', () => {
    const w = heavyMatch();
    w.tick += HISTORY_WINDOW_TICKS; // outside the window
    const totals = bytes(netSnapshot(w).matchStats);
    w.tick -= 1; // inside it
    const withHistory = bytes(netSnapshot(w).matchStats);
    const full = bytes(snapshot(w).matchStats);
    console.log(`[S191 wire] totals-only ${totals} B · in-window ${withHistory} B · full ${full} B (4 seats, 8 types, 30 waves)`);
    // ⭐ S194 v2 re-pin (measured, this test): S191 was totals 1,527 B / in-window 6,765 B; the v2 counters
    // (units lost per type, who-hit-whom, keep/structure split, four running totals per wave point as one
    // compact array) measure totals 2,503 B / in-window 11,101 B. Named per-point keys measured 13,697 B,
    // which is why the wire form packs them as `v`. In-window rides ~2 s a wave + POSTGAME only.
    expect(totals).toBeLessThan(3 * 1024);
    expect(withHistory).toBeLessThan(12 * 1024);
    expect(withHistory).toBe(full);
    expect(totals).toBeLessThan(withHistory);
  });

  it('⭐ S194 (audit LOW-2) — a 60-wave match: the history still rides only its window, and stays bounded', () => {
    const w = heavyMatch(60);
    w.tick += HISTORY_WINDOW_TICKS;
    const totals = bytes(netSnapshot(w).matchStats);
    w.tick -= 1;
    const withHistory = bytes(netSnapshot(w).matchStats);
    console.log(`[S194 wire] 60 waves: totals-only ${totals} B · in-window ${withHistory} B`);
    expect(totals).toBeLessThan(3 * 1024); // the running totals do not grow with the wave count
    expect(withHistory).toBeLessThan(22 * 1024); // measured 19,741 B (S194); ~145 B per extra wave
  });
});
