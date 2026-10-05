/**
 * SPARK — the stat board's WIRE MEASUREMENT FIXTURE, shared by `matchStats.wire.test.ts` (which bounds it)
 * and `canon.test.ts` (which pins the measured figures canon §9e prints). One fixture, so the two cannot
 * measure different matches.
 *
 * A heavy late match: four seats, eight unit types built and killed each with five-digit damage totals
 * across every target class and every other seat, and `waves` waves of history.
 */
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import { recordDamage, recordKill, recordTowerBuilt, recordTowerFell, recordUnitBuilt, recordWaveSample } from './matchStats.ts';
import { wireNumberReplacer } from './save.ts';
import { makeWorld, type World } from './world.ts';

const TYPES: readonly CreatureType[] = [
  'raceUnit', 'goblinMelee', 'goblinArcher', 'goblinShield', 'chewer', 'lightningDrone', 'direwolf', 'voltkin',
];

export function heavyMatch(waves = 30): World {
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

/** Bytes of a wire block, serialized the way the net path serializes it. */
export const wireBytes = (v: unknown): number => JSON.stringify(v, wireNumberReplacer).length;
