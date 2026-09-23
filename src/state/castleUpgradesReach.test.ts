/**
 * SPARK — ⛔ DO THE PURCHASED CASTLE STATS ACTUALLY REACH THE GAME?
 *
 * `castleUpgrades.test.ts` proves the arithmetic. It would stay entirely green if nothing in the sim
 * ever consulted it — which is how a feature ships "done, gates green" and changes nothing. This
 * drives the REAL reducer and the REAL damage path and reads the result off the world.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch } from './world.ts';
import { damageEntity } from './damage.ts';
import { castleMaxHpFor, castleShotFifthsFor, CASTLE_UPGRADE_PRICE } from './castleUpgrades.ts';
import { CASTLE_MAX_HP } from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { World } from './world.ts';

function seatOf(w: World): PlayerId {
  return [...w.players.keys()][0] as PlayerId;
}

function fundedWorld(points: number, wave = 1): { w: World; seat: PlayerId } {
  const w = makeWorld(0x187);
  const seat = seatOf(w);
  w.waveNumber = wave;
  w.scoreByPlayer.set(seat, points);
  return { w, seat };
}

function buy(w: World, seat: PlayerId, stat: 'hp' | 'atk' | 'def' | 'pen'): void {
  dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: seat, stat } as never);
}

describe('the purchase reaches the world through the real reducer', () => {
  it('spends the points and raises the level', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE);
    buy(w, seat, 'hp');
    expect(w.players.get(seat)?.castleUpgrades.hpLevel).toBe(1);
    expect(w.scoreByPlayer.get(seat)).toBe(0);
  });

  it('⛔ refuses when the seat cannot afford it, and takes nothing', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE - 1);
    buy(w, seat, 'hp');
    expect(w.players.get(seat)?.castleUpgrades.hpLevel).toBe(0);
    expect(w.scoreByPlayer.get(seat)).toBe(CASTLE_UPGRADE_PRICE - 1);
  });

  it('⛔ reads the wave from the WORLD, so a late band cannot be bought early', () => {
    const early = fundedWorld(CASTLE_UPGRADE_PRICE, 1);
    buy(early.w, early.seat, 'hp');
    expect(early.w.players.get(early.seat)?.castleUpgrades.hpBonus).toBe(250);

    const late = fundedWorld(CASTLE_UPGRADE_PRICE, 22);
    buy(late.w, late.seat, 'hp');
    expect(late.w.players.get(late.seat)?.castleUpgrades.hpBonus).toBe(650);
  });

  it('⛔ a FALLEN seat buys nothing — R131, and its points are not taken', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE);
    const pl = w.players.get(seat);
    if (pl === undefined) throw new Error('fixture: seat missing');
    pl.castleHp = 0;
    buy(w, seat, 'hp');
    expect(pl.castleUpgrades.hpLevel).toBe(0);
    expect(w.scoreByPlayer.get(seat)).toBe(CASTLE_UPGRADE_PRICE);
  });

  it('ignores a malformed stat off the wire', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE);
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: seat, stat: 'luck' } as never);
    expect(w.scoreByPlayer.get(seat)).toBe(CASTLE_UPGRADE_PRICE);
  });
});

describe('⛔ purchased DEFENCE reaches the damage path', () => {
  it('a keep with DEF takes strictly less from the same hit', () => {
    const plain = fundedWorld(0);
    const armed = fundedWorld(CASTLE_UPGRADE_PRICE * 5);
    for (let i = 0; i < 5; i++) buy(armed.w, armed.seat, 'def');
    expect(armed.w.players.get(armed.seat)?.castleUpgrades.defLevel).toBe(5);

    damageEntity(plain.w, { kind: 'castle', seat: plain.seat } as never, 100, 'defender', null);
    damageEntity(armed.w, { kind: 'castle', seat: armed.seat } as never, 100, 'defender', null);

    const plainLost = CASTLE_MAX_HP - (plain.w.players.get(plain.seat)?.castleHp ?? 0);
    const armedLost = CASTLE_MAX_HP - (armed.w.players.get(armed.seat)?.castleHp ?? 0);
    expect(plainLost).toBe(100);
    expect(armedLost).toBe(50);
    expect(armedLost).toBeLessThan(plainLost);
  });

  it('⛔ still falls to enough damage — DEF is a reduction, never immunity', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE * 10);
    for (let i = 0; i < 10; i++) buy(w, seat, 'def');
    const pl = w.players.get(seat);
    if (pl === undefined) throw new Error('fixture: seat missing');
    for (let i = 0; i < 4000 && pl.castleHp > 0; i++) {
      damageEntity(w, { kind: 'castle', seat } as never, 40, 'defender', null);
    }
    expect(pl.castleHp).toBe(0);
  });
});

describe('purchased HP and ATK reach their own consumers', () => {
  it('raises this seat’s ceiling, not the global constant', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE, 1);
    buy(w, seat, 'hp');
    const u = w.players.get(seat)?.castleUpgrades;
    if (u === undefined) throw new Error('fixture: seat missing');
    expect(castleMaxHpFor(u)).toBe(CASTLE_MAX_HP + 250);
  });

  it('raises this seat’s shot', () => {
    const { w, seat } = fundedWorld(CASTLE_UPGRADE_PRICE * 2);
    const before = castleShotFifthsFor(
      w.players.get(seat)?.castleUpgrades ?? { hpLevel: 0, hpBonus: 0, atkLevel: 0, defLevel: 0, penLevel: 0 },
    );
    buy(w, seat, 'atk');
    buy(w, seat, 'pen');
    const after = castleShotFifthsFor(w.players.get(seat)!.castleUpgrades);
    expect(after).toBeGreaterThan(before);
  });

  it('⚠ buffs only the BUYING seat', () => {
    const w = makeWorld(0x187);
    const seats = [...w.players.keys()] as PlayerId[];
    if (seats.length < 2) return; // single-seat fixture: nothing to compare
    const [a, b] = seats as [PlayerId, PlayerId];
    w.scoreByPlayer.set(a, CASTLE_UPGRADE_PRICE);
    buy(w, a, 'hp');
    expect(castleMaxHpFor(w.players.get(a)!.castleUpgrades)).toBeGreaterThan(CASTLE_MAX_HP);
    expect(castleMaxHpFor(w.players.get(b)!.castleUpgrades)).toBe(CASTLE_MAX_HP);
  });
});
