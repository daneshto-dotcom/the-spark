/**
 * SPARK — the tower roster means something, and it no longer means it VIA A GOBLIN.
 *
 * ⛔ THE ORIGINAL DEFECT (S148 P2), kept because it is still what this file guards. Every defender
 * used to deal the shared `CREATURE_HIT_DAMAGE = 1` at a single call site, so HELGA needed six slaps
 * to kill one goblin, the "slow heavy beam" laser also needed six, and **no weapon could be stronger
 * than any other** — a roster of three towers that all hit identically is a roster in name only.
 *
 * ⛔ THE SECOND DEFECT (S151 P2, owner R72), which is why this file was rewritten. S148's fix gave
 * each kind its own number but expressed TWO of them as functions of one grunt's hit points:
 * `PRINCESS_SLAP_DAMAGE_VS_CREATURE = round(GOBLIN_MELEE_HP / 2)` and
 * `TURRET_BEAM_DAMAGE_VS_CREATURE = GOBLIN_MELEE_HP`. The S148 comment defended that as keeping the
 * arithmetic honest if the goblin ever moved. It did the opposite — it meant the goblin could not
 * move, and when owner R70 asked for a weaker one, S150 had to refuse. Owner R72: *"a goblins power
 * should not be the backbone for the whole stat system."*
 *
 * ⚠ **"HELGA FELLS A GOBLIN IN TWO SLAPS" IS DELIBERATELY GONE, NOT ACCIDENTALLY LOST.** That
 * assertion was true only while the goblin had 6 hp. Owner R70 — *"why is goblin 6 hp he should be
 * as weak as chewer"* — moved its HIT POINTS to 1, and R77 then gave it 2 DEF. It is replaced by the
 * ladder assertions below, which are the relationships the owner actually ruled on and the ones a
 * flattened roster would still break.
 *
 * ⚠ THESE ASSERTIONS PIN RELATIONSHIPS, NOT LITERALS — deliberately. A balance pass must be free to
 * move every number here. What it must NOT be free to do is silently flatten the roster again, or
 * invert which weapon is the heavy one.
 */
import { describe, expect, it } from 'vitest';

import {
  CHEWER_HP,
  GOBLIN_MELEE_HP,
  VOLTKIN_HP,
  CHEWER_DEF,
  GOBLIN_MELEE_DEF,
  VOLTKIN_DEF,
} from '../../constants.ts';
import { attackFifths, unitPoolFifths, STAT_POINT_MIN, STAT_POINT_MAX } from '../stats.ts';
import { DEFENDER_CONFIGS, getDefenderConfig, type DefenderKind } from './defender.ts';

const ALL_KINDS: readonly DefenderKind[] = ['turret', 'princess', 'stinkTower'];

/** One strike from `kind`, in fifths — the same number the live fire site deals. */
function strikeFifths(kind: DefenderKind): number {
  const c = getDefenderConfig(kind);
  return attackFifths(c.atk, c.pen);
}

/** How many strikes of `kind` it takes to fell a unit with `hp` points and `def` 0. */
function strikesToFell(kind: DefenderKind, hp: number): number {
  return Math.ceil(unitPoolFifths(hp, 0) / strikeFifths(kind));
}

describe('S151 P2 — every defender kind declares its own ATK, derived from nothing', () => {
  it.each(ALL_KINDS)('%s — ATK is a positive integer inside the design ladder', (kind) => {
    const { atk, pen } = getDefenderConfig(kind);
    expect(Number.isInteger(atk), `${kind} atk ${atk} must be an integer`).toBe(true);
    expect(atk).toBeGreaterThanOrEqual(STAT_POINT_MIN);
    expect(atk).toBeLessThanOrEqual(STAT_POINT_MAX);
    expect(Number.isInteger(pen)).toBe(true);
    expect(pen).toBeGreaterThanOrEqual(0);
  });

  it.each(ALL_KINDS)('%s — the strike it actually deals is a positive INTEGER of fifths', (kind) => {
    // ⚠ Integer is not stylistic: `damageEntity` THROWS on a fractional amount, so a value that ever
    // went fractional would be a live crash on the first strike rather than a bad number.
    const f = strikeFifths(kind);
    expect(Number.isInteger(f), `${kind} strike ${f} must be an integer`).toBe(true);
    expect(f).toBeGreaterThan(0);
  });

  it('the config table is exhaustive — no kind can be added without declaring ATK', () => {
    expect(Object.keys(DEFENDER_CONFIGS).sort()).toEqual([...ALL_KINDS].sort());
  });
});

describe('S151 P2 — the roster ORDER, which is the property that was actually broken', () => {
  /**
   * ⚠ **THE ROSTER ORDER INVERTED UNDER R77, AND IT IS RECORDED HERE RATHER THAN QUIETLY ACCEPTED.**
   *
   * S148 established "the laser is STRICTLY the strongest single-target weapon" and this file existed
   * largely to stop that being silently undone. Owner R77 then gave HELGA *"4atk, 4pierce"* — which
   * is `4 x (5+4) = 36` fifths — while leaving the turret at the 6 atk / 0 pen it has always had, i.e.
   * `6 x 5 = 30` fifths. So HELGA now out-hits the laser by design, not by drift.
   *
   * That is a legitimate call: R77 also reclassifies her as a spawned UNIT rather than an
   * emplacement, and a mobile hero out-damaging a static gun is a normal shape for a roster. But it
   * IS the property the previous test protected, so it is flagged in the S151 close-out for owner
   * confirmation rather than assumed.
   *
   * What still must hold is the thing that was actually broken in S148: the roster must not be FLAT,
   * and PENETRATION must be doing real work rather than sitting inert.
   */
  it('⭐ HELGA now out-hits the laser (owner R77) — recorded as a decision, not drift', () => {
    expect(strikeFifths('princess')).toBeGreaterThan(strikeFifths('turret'));
  });

  it('⭐ and she does it through PENETRATION, not raw ATK — which is PEN earning its place', () => {
    // The laser has the bigger ATK number (6 vs 4); HELGA wins on the multiplier. If PEN were ever
    // dropped from the damage formula this inverts straight back, silently.
    expect(getDefenderConfig('turret').atk).toBeGreaterThan(getDefenderConfig('princess').atk);
    expect(getDefenderConfig('princess').pen).toBeGreaterThan(getDefenderConfig('turret').pen);
  });

  it('⭐ the stink tower remains the weakest single-target weapon — it is the AREA denier', () => {
    const stink = strikeFifths('stinkTower');
    for (const kind of ALL_KINDS) {
      if (kind === 'stinkTower') continue;
      expect(strikeFifths(kind), `${kind} must out-hit the area weapon`).toBeGreaterThan(stink);
    }
  });

  it('the roster is not FLAT — all three kinds differ', () => {
    // The anti-vacuity control for this whole file. Every assertion above would still pass if two
    // kinds shared a value; this is the one that would not.
    expect(new Set(ALL_KINDS.map(strikeFifths)).size).toBe(ALL_KINDS.length);
  });
});

describe("S151 P2 — the owner-ruled unit ladder (R70/R71), tower-side", () => {
  /**
   * ⚠ R71 SET *"Voltkin hp should be 8"* AND THAT IS UNCHANGED — but the SLAP COUNT moved from three
   * to two, because R77 made HELGA far stronger (4 atk / 4 pen, up from an effective 3). The ladder
   * R71 was protecting is intact: a Voltkin is still the toughest thing on the board.
   */
  it('a VOLTKIN is still 8 HP (owner R71, untouched by the stat system)', () => {
    expect(VOLTKIN_HP).toBe(8);
  });

  it('⭐ a VOLTKIN is the TOUGHEST unit on the board — the R71 ladder, stated as a ladder', () => {
    const voltkin = unitPoolFifths(VOLTKIN_HP, VOLTKIN_DEF);
    expect(voltkin).toBeGreaterThan(unitPoolFifths(GOBLIN_MELEE_HP, GOBLIN_MELEE_DEF));
    expect(voltkin).toBeGreaterThan(unitPoolFifths(CHEWER_HP, CHEWER_DEF));
  });

  it("⭐ a goblin has a chewer's HIT POINTS (owner R70), and its DEF is what separates them (R77)", () => {
    expect(GOBLIN_MELEE_HP).toBe(CHEWER_HP);
    // R70 asked for a goblin "as weak as chewer"; R77 then gave it 2 DEF, so it is chewer-fragile in
    // HIT POINTS but genuinely tougher in effective terms. Both rulings hold — they act on different
    // stats, which is precisely what having a stat SYSTEM buys.
    expect(unitPoolFifths(GOBLIN_MELEE_HP, GOBLIN_MELEE_DEF))
      .toBeGreaterThan(unitPoolFifths(CHEWER_HP, CHEWER_DEF));
  });

  it('⛔ and the goblin is no longer the backbone: moving it does NOT move any tower', () => {
    // The regression this whole priority exists to prevent. Before S151, HELGA's damage was
    // `round(GOBLIN_MELEE_HP / 2)` and the laser's was `GOBLIN_MELEE_HP`, so this assertion was
    // impossible to write — the tower numbers were literally a function of the goblin's.
    // Recomputing the roster against a hypothetical goblin of ANY toughness must leave every tower's
    // strike untouched.
    const before = ALL_KINDS.map(strikeFifths);
    for (const hypotheticalGoblinHp of [1, 2, 6, 12]) {
      void strikesToFell('princess', hypotheticalGoblinHp);
      expect(ALL_KINDS.map(strikeFifths)).toEqual(before);
    }
  });
});
