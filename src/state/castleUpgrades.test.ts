/**
 * SPARK — the castle upgrade ladder: his table, and the two rules that are easy to get wrong later.
 *
 * ⛔ THE ONE THAT MATTERS MOST is that the HP gain is BAKED AT PURCHASE. The amount depends on the
 * wave you buy on (250 early, 650 late), so a future session that "simplifies" this to
 * `hpLevel × gainForWave(now)` would silently re-price every earlier purchase at the current band —
 * a wave-3 upgrade inflating from 250 to 650 by wave 21. The `two early purchases stay at their own
 * price` test below is what refuses that refactor.
 */

import { describe, expect, it } from 'vitest';
import {
  CASTLE_HP_GAIN_BY_BAND,
  CASTLE_STATS,
  CASTLE_UPGRADE_MAX_LEVEL,
  CASTLE_UPGRADE_PRICE,
  canBuyCastleStat,
  castleDamageAfterDefence,
  castleHpGainForWave,
  castleLevelOf,
  castleMaxHpFor,
  castleShotFifthsFor,
  castleUpgradeBand,
  emptyCastleUpgrades,
  withCastlePurchase,
  type CastleStat,
} from './castleUpgrades.ts';
import { CASTLE_ATK, CASTLE_MAX_HP, CASTLE_PEN } from '../constants.ts';
import { attackFifths } from './stats.ts';

describe('his HP table, by the wave the purchase is made on', () => {
  it('is 250 / 350 / 450 / 550 / 650 across his five bands', () => {
    expect(CASTLE_HP_GAIN_BY_BAND).toEqual([250, 350, 450, 550, 650]);
  });

  it('puts every wave in the band he named', () => {
    const at = (w: number): number => castleHpGainForWave(w);
    for (const w of [1, 2, 5]) expect(at(w), `wave ${w}`).toBe(250);
    for (const w of [6, 9, 10]) expect(at(w), `wave ${w}`).toBe(350);
    for (const w of [11, 15]) expect(at(w), `wave ${w}`).toBe(450);
    for (const w of [16, 20]) expect(at(w), `wave ${w}`).toBe(550);
    for (const w of [21, 25]) expect(at(w), `wave ${w}`).toBe(650);
  });

  it('⚠ CLAMPS past wave 25 rather than climbing — flagged as MINE, not his', () => {
    expect(castleHpGainForWave(26)).toBe(650);
    expect(castleHpGainForWave(99)).toBe(650);
    expect(castleUpgradeBand(99)).toBe(CASTLE_HP_GAIN_BY_BAND.length - 1);
  });

  it('shares its band boundaries with the win bar and the quarry — waves 1/6/11/16/21', () => {
    // Three systems, one set of boundaries. A drift here would put the castle on a different clock
    // from the points race it was added to keep up with.
    expect([1, 6, 11, 16, 21].map(castleUpgradeBand)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('⛔ the gain is BAKED AT PURCHASE, never re-derived', () => {
  it('two purchases on wave 1 stay worth 250 each, even read at wave 21', () => {
    let u = emptyCastleUpgrades();
    u = withCastlePurchase(u, 'hp', 1);
    u = withCastlePurchase(u, 'hp', 1);
    expect(u.hpLevel).toBe(2);
    expect(u.hpBonus).toBe(500);
    // The value does not depend on "now" — there is no wave argument to read it back with.
    expect(castleMaxHpFor(u)).toBe(CASTLE_MAX_HP + 500);
  });

  it('prices each purchase at ITS OWN wave, so an early and a late one differ', () => {
    let u = emptyCastleUpgrades();
    u = withCastlePurchase(u, 'hp', 3); // +250
    u = withCastlePurchase(u, 'hp', 22); // +650
    expect(u.hpLevel).toBe(2);
    expect(u.hpBonus).toBe(900);
  });

  it('raises the ceiling, which is what makes the purchase mean anything', () => {
    const u = withCastlePurchase(emptyCastleUpgrades(), 'hp', 1);
    expect(castleMaxHpFor(u)).toBeGreaterThan(CASTLE_MAX_HP);
    expect(castleMaxHpFor(emptyCastleUpgrades())).toBe(CASTLE_MAX_HP);
  });
});

describe('the cap', () => {
  it('is ten purchases per axis — his number', () => {
    expect(CASTLE_UPGRADE_MAX_LEVEL).toBe(10);
  });

  it('refuses the eleventh, and the refusal changes nothing', () => {
    let u = emptyCastleUpgrades();
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL; i++) u = withCastlePurchase(u, 'atk', 1);
    expect(u.atkLevel).toBe(10);
    expect(canBuyCastleStat(u, 'atk')).toBe(false);
    const after = withCastlePurchase(u, 'atk', 1);
    expect(after).toBe(u); // the same object: nothing was spent and nothing changed
  });

  it('caps each axis independently, so spreading is not punished', () => {
    let u = emptyCastleUpgrades();
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL; i++) u = withCastlePurchase(u, 'hp', 1);
    expect(canBuyCastleStat(u, 'hp')).toBe(false);
    for (const s of ['atk', 'def', 'pen'] as CastleStat[]) {
      expect(canBuyCastleStat(u, s), s).toBe(true);
    }
  });

  it('every stat is reachable by castleLevelOf — no axis is silently unreadable', () => {
    let u = emptyCastleUpgrades();
    for (const s of CASTLE_STATS) u = withCastlePurchase(u, s, 1);
    for (const s of CASTLE_STATS) expect(castleLevelOf(u, s), s).toBe(1);
  });
});

describe('ATK and PEN are ladder points, so the gun follows attackFifths', () => {
  it('an un-upgraded keep fires the canon number', () => {
    expect(castleShotFifthsFor(emptyCastleUpgrades())).toBe(attackFifths(CASTLE_ATK, CASTLE_PEN));
    expect(castleShotFifthsFor(emptyCastleUpgrades())).toBe(40);
  });

  it('+1 ATK and +1 PEN each move the shot by the ladder’s own step', () => {
    const atk = withCastlePurchase(emptyCastleUpgrades(), 'atk', 1);
    const pen = withCastlePurchase(emptyCastleUpgrades(), 'pen', 1);
    expect(castleShotFifthsFor(atk)).toBe(attackFifths(CASTLE_ATK + 1, CASTLE_PEN));
    expect(castleShotFifthsFor(pen)).toBe(attackFifths(CASTLE_ATK, CASTLE_PEN + 1));
    expect(castleShotFifthsFor(atk)).toBeGreaterThan(40);
    expect(castleShotFifthsFor(pen)).toBeGreaterThan(40);
  });

  it('every shot is a whole number, at every level', () => {
    let u = emptyCastleUpgrades();
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL; i++) {
      u = withCastlePurchase(u, 'atk', 1);
      u = withCastlePurchase(u, 'pen', 1);
      expect(Number.isInteger(castleShotFifthsFor(u))).toBe(true);
    }
  });
});

describe('⛔ DEF reduces damage taken, and can never make a keep immune', () => {
  it('takes the full hit at level 0', () => {
    expect(castleDamageAfterDefence(100, emptyCastleUpgrades())).toBe(100);
  });

  it('halves it at DEF 5 — the ladder’s own ratio, since (5+5)/5 is 2', () => {
    let u = emptyCastleUpgrades();
    for (let i = 0; i < 5; i++) u = withCastlePurchase(u, 'def', 1);
    expect(castleDamageAfterDefence(100, u)).toBe(50);
  });

  it('⛔ NEVER returns 0 on a real hit, at any DEF level — a keep must stay fellable', () => {
    let u = emptyCastleUpgrades();
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL; i++) u = withCastlePurchase(u, 'def', 1);
    for (const hit of [1, 2, 5, 6, 40]) {
      expect(castleDamageAfterDefence(hit, u), `hit ${hit}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is always an integer — no float ever reaches castleHp', () => {
    let u = emptyCastleUpgrades();
    for (let lvl = 0; lvl <= CASTLE_UPGRADE_MAX_LEVEL; lvl++) {
      for (let hit = 1; hit <= 200; hit++) {
        expect(Number.isInteger(castleDamageAfterDefence(hit, u))).toBe(true);
      }
      u = withCastlePurchase(u, 'def', 1);
    }
  });

  it('passes zero through as zero — a non-hit is not rounded up to 1', () => {
    const u = withCastlePurchase(emptyCastleUpgrades(), 'def', 1);
    expect(castleDamageAfterDefence(0, u)).toBe(0);
    expect(castleDamageAfterDefence(-5, u)).toBe(0);
  });

  it('is monotonic: more DEF never means MORE damage taken', () => {
    let prev = castleDamageAfterDefence(100, emptyCastleUpgrades());
    let u = emptyCastleUpgrades();
    for (let i = 0; i < CASTLE_UPGRADE_MAX_LEVEL; i++) {
      u = withCastlePurchase(u, 'def', 1);
      const now = castleDamageAfterDefence(100, u);
      expect(now).toBeLessThanOrEqual(prev);
      prev = now;
    }
  });
});

describe('the price', () => {
  it('is his hundred victory points', () => {
    expect(CASTLE_UPGRADE_PRICE).toBe(100);
  });
});
