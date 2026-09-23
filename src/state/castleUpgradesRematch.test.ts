/**
 * SPARK — S188 — bought castle stats are PER MATCH (the audit's F1 on s188/castle, fixed by the merge
 * owner). `applyStartGame` reset `castleRegenLevel` but never the S187 `castleUpgrades`, so a seat that
 * bought ATK/DEF/HP in match 1 opened match 2 with the upgraded shot, the reduced incoming damage and a
 * ceiling above the 2500 its pool was reset to. Driven through the real reducer, twice.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld } from './world.ts';
import { applyStartGame } from './gameMode.ts';
import { castleMaxHpFor, castleShotFifthsFor, emptyCastleUpgrades } from './castleUpgrades.ts';
import { CASTLE_MAX_HP } from '../constants.ts';
import type { PlayerId } from '../types.ts';

describe('⛔ castle upgrades do not carry into a rematch', () => {
  it('a seat that bought HP, ATK, DEF and PEN in match 1 starts match 2 with none of them', () => {
    const w = makeWorld(0x188);
    applyStartGame(w, { type: 'START_GAME' } as never);
    const seat = [...w.players.keys()][0] as PlayerId;
    const pl = w.players.get(seat)!;
    pl.castleUpgrades = { hpLevel: 10, hpBonus: 4500, atkLevel: 10, defLevel: 10, penLevel: 10 };
    pl.castleHp = castleMaxHpFor(pl.castleUpgrades);
    expect(castleShotFifthsFor(pl.castleUpgrades)).toBeGreaterThan(castleShotFifthsFor(emptyCastleUpgrades()));

    applyStartGame(w, { type: 'START_GAME' } as never);

    const again = w.players.get(seat)!;
    expect(again.castleUpgrades).toEqual(emptyCastleUpgrades());
    expect(again.castleHp).toBe(CASTLE_MAX_HP);
    expect(again.castleHp).toBe(castleMaxHpFor(again.castleUpgrades));
  });
});
