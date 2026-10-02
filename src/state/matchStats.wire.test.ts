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

function heavyMatch(): World {
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
    recordDamage(w, foe, me, 98_765, 'unit');
  }
  for (let wave = 1; wave <= 30; wave++) {
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
    expect(totals).toBeLessThan(2 * 1024);
    expect(withHistory).toBeLessThan(8 * 1024);
    expect(withHistory).toBe(full);
    expect(totals).toBeLessThan(withHistory);
  });
});
