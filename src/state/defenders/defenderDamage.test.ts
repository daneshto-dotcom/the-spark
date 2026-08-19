/**
 * SPARK — S148 P2: THE TOWER ROSTER MEANS SOMETHING AGAIN.
 *
 * ⛔ THE DEFECT THIS FILE EXISTS TO PREVENT RECURRING. Every defender used to deal the shared
 * `CREATURE_HIT_DAMAGE = 1` at a single call site in `defenderLifecycle`. Creature hp is a hit COUNT
 * (chewer 1, Voltkin 2, goblin 6), so:
 *
 *   · HELGA needed SIX slaps to kill one goblin — the owner counted five in a playtest and it lived;
 *   · the laser turret, whose own comment calls it *"a slow heavy beam"*, also needed six;
 *   · **no weapon could be stronger than any other**, which is not a balance problem but a design
 *     one: a roster of three towers that all hit identically is a roster in name only.
 *
 * ⚠ THESE ASSERTIONS PIN RELATIONSHIPS, NOT LITERALS — deliberately. A balance pass (R30 says one is
 * coming) must be free to move every number here. What it must NOT be free to do is silently flatten
 * the roster again, or invert which weapon is the heavy one. So the tests below say "the laser is the
 * strongest single-target weapon" and "HELGA fells a goblin in two", never "the laser deals 6".
 */
import { describe, expect, it } from 'vitest';

import { CREATURE_HIT_DAMAGE, GOBLIN_MELEE_HP } from '../../constants.ts';
import { DEFENDER_CONFIGS, getDefenderConfig, type DefenderKind } from './defender.ts';

const ALL_KINDS: readonly DefenderKind[] = ['turret', 'princess', 'stinkTower'];

/** How many strikes of `kind` it takes to fell a full-hp goblin. */
function strikesToFellGoblin(kind: DefenderKind): number {
  return Math.ceil(GOBLIN_MELEE_HP / getDefenderConfig(kind).damageVsCreature);
}

describe('S148 P2 — every defender kind declares its own damage', () => {
  it.each(ALL_KINDS)('%s — has a positive INTEGER damage', (kind) => {
    const d = getDefenderConfig(kind).damageVsCreature;
    // ⚠ Integer is not stylistic: `damageEntity` throws on a fractional amount, so a derived value
    // that ever went fractional would be a live crash on the first strike rather than a bad number.
    expect(Number.isInteger(d), `${kind} damage ${d} must be an integer`).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it('the config table is exhaustive — no kind can be added without declaring damage', () => {
    // `DEFENDER_CONFIGS` is a Readonly<Record<DefenderKind, …>>, so tsc already forces a new kind to
    // appear here. This asserts the runtime shape agrees, which is what `getDefenderConfig` (a bare
    // Record index with no default) depends on.
    expect(Object.keys(DEFENDER_CONFIGS).sort()).toEqual([...ALL_KINDS].sort());
  });
});

describe('S148 P2 — the owner-visible rules from the playtest', () => {
  it('⭐ HELGA fells a goblin in TWO slaps — not six', () => {
    expect(strikesToFellGoblin('princess')).toBe(2);
  });

  it('⭐ the laser turret fells a goblin in ONE beam — it is the heavy weapon', () => {
    expect(strikesToFellGoblin('turret')).toBe(1);
  });

  it('⭐ the laser is STRICTLY the strongest single-target weapon', () => {
    // The property that was actually broken. If a future retune makes something else hit harder,
    // that is a design decision and this test is where it gets made on purpose.
    const laser = getDefenderConfig('turret').damageVsCreature;
    for (const kind of ALL_KINDS) {
      if (kind === 'turret') continue;
      expect(
        getDefenderConfig(kind).damageVsCreature,
        `${kind} must not out-hit the laser on a single target`,
      ).toBeLessThan(laser);
    }
  });

  it('the roster is not FLAT — at least two kinds differ', () => {
    // The anti-vacuity control for this whole file. Every assertion above would still pass if all
    // three kinds shared one value and that value happened to be 6; this is the one that would not.
    const damages = ALL_KINDS.map((k) => getDefenderConfig(k).damageVsCreature);
    expect(new Set(damages).size).toBeGreaterThan(1);
  });

  it('the stink tower stays at the shared single-hit value — it is the AREA weapon', () => {
    // Its damage comes from splashing several targets at once and from chewing primitives, which
    // neither other kind does. Single-target punch on top would make it strictly better than both.
    expect(getDefenderConfig('stinkTower').damageVsCreature).toBe(CREATURE_HIT_DAMAGE);
  });
});
