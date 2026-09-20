/**
 * SPARK — S185 — the stat radar's geometry.
 *
 * ⭐ THIS IS THE PART OF A VISUAL FEATURE THAT CAN ACTUALLY BE PINNED. No renderer runs under
 * vitest, so what the chart LOOKS like is a screenshot question — but every number behind it is a
 * pure function of its arguments, and those are what would silently rot: a max typed in by hand, a
 * zero axis collapsing onto the centre, a unit drawn outside its own web.
 */

import { describe, expect, it } from 'vitest';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import {
  RADAR_FLOOR_FRAC,
  RADAR_MAX_ATK,
  RADAR_MAX_DEF,
  RADAR_MAX_HP,
  RADAR_MAX_PEN,
  radarAxesFromRows,
  radarFrac,
  radarPolygon,
  radarWeb,
  unitRadarAxes,
} from './characterSheetRadar.ts';

describe('S185 — the maxima are DERIVED from the roster, never typed in', () => {
  /**
   * ⛔ THE ONE THAT MATTERS. A hand-written max rots the day a boss is retuned — silently, with the
   * whole suite green and the chart quietly wrong. That is exactly what `UNIT_STAT_TABLE.md` has
   * been doing for three sessions. This recomputes from the same source the module reads.
   */
  it('each max equals the true maximum over every creature config', () => {
    const vals = Object.values(CREATURE_CONFIGS) as unknown as Record<string, number>[];
    const maxOf = (k: string): number => Math.max(...vals.map((v) => v[k]!).filter(Number.isFinite));
    expect(RADAR_MAX_HP).toBe(maxOf('hp'));
    expect(RADAR_MAX_DEF).toBe(maxOf('def'));
    expect(RADAR_MAX_ATK).toBe(maxOf('atk'));
    expect(RADAR_MAX_PEN).toBe(maxOf('pen'));
  });

  it('a boss reaches the rim on the axis it leads, so the scale is not slack', () => {
    const axes = unitRadarAxes(RADAR_MAX_HP, 0, 0, 0);
    expect(radarFrac(axes[2]!)).toBeCloseTo(1, 10);
  });
});

describe('S185 — the comparison he asked for actually reads', () => {
  /**
   * His own example, asserted directly: *"a level one character like a bat would have like 1,1,1,1,
   * and then you look at the freaking Vlad and it would be mega developed by compare."*
   */
  it('⭐ a 1,1,1,1 unit is dwarfed by a boss on every axis', () => {
    const weak = unitRadarAxes(1, 1, 1, 1);
    const boss = unitRadarAxes(RADAR_MAX_HP, RADAR_MAX_DEF, RADAR_MAX_ATK, RADAR_MAX_PEN);
    for (let i = 0; i < 4; i++) {
      expect(radarFrac(boss[i]!)).toBeGreaterThan(radarFrac(weak[i]!));
    }
    // and by a wide margin on the pool axis, which is the one he eyeballs first
    expect(radarFrac(boss[2]!) / radarFrac(weak[2]!)).toBeGreaterThan(5);
  });
});

describe('S185 — the floor, and the clamp', () => {
  it('a ZERO axis still sits off the centre, so it reads as armour-none not as a glitch', () => {
    const [, pen] = unitRadarAxes(1, 0, 1, 0);
    expect(radarFrac(pen!)).toBe(RADAR_FLOOR_FRAC);
    expect(radarFrac(pen!)).toBeGreaterThan(0);
  });

  /**
   * ⛔ A future unit WILL exceed a max between the moment it is added and the moment anyone re-reads
   * the module. It must not draw outside its own web.
   */
  it('a value above its max is clamped to the rim, never beyond it', () => {
    expect(radarFrac({ label: 'HP', value: RADAR_MAX_HP * 3, max: RADAR_MAX_HP })).toBe(1);
  });

  it('a zero max cannot divide by zero', () => {
    expect(radarFrac({ label: 'X', value: 5, max: 0 })).toBe(RADAR_FLOOR_FRAC);
  });
});

describe('S185 — the polygon', () => {
  it('puts the first vertex straight UP and runs clockwise', () => {
    const web = radarWeb(4, 100, 100, 50);
    expect(web[0]!.x).toBeCloseTo(100, 6);
    expect(web[0]!.y).toBeCloseTo(50, 6); // up is -y
    expect(web[1]!.x).toBeCloseTo(150, 6); // then right
    expect(web[2]!.y).toBeCloseTo(150, 6); // then down
  });

  it('every vertex of a maxed unit lands on the web, and every other one inside it', () => {
    const cx = 200, cy = 120, r = 40;
    const maxed = radarPolygon(
      unitRadarAxes(RADAR_MAX_HP, RADAR_MAX_DEF, RADAR_MAX_ATK, RADAR_MAX_PEN), cx, cy, r);
    for (const p of maxed) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(r, 6);
    }
    for (const p of radarPolygon(unitRadarAxes(2, 0, 1, 0), cx, cy, r)) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThan(r);
    }
  });

  it('is deterministic and empty-safe', () => {
    expect(radarPolygon([], 0, 0, 10)).toEqual([]);
    expect(radarPolygon(unitRadarAxes(3, 1, 2, 1), 5, 5, 20))
      .toEqual(radarPolygon(unitRadarAxes(3, 1, 2, 1), 5, 5, 20));
  });
});

describe('S185 — which cards get a radar, and on which axes', () => {
  it('a unit card gets all seven, in the order the card prints them', () => {
    const axes = radarAxesFromRows([
      { label: 'ATK', points: 4 }, { label: 'PEN', points: 2 },
      { label: 'HP', points: 8 }, { label: 'DEF', points: 3 },
      { label: 'RANGE', points: 220 }, { label: 'ATK SPD', points: 60 },
      { label: 'SPEED', points: 140 },
    ]);
    expect(axes).not.toBeNull();
    expect(axes!.map((a) => a.label))
      .toEqual(['ATK', 'PEN', 'HP', 'DEF', 'RANGE', 'ATK SPD', 'SPEED']);
  });

  /**
   * ⭐⭐ THE CASTLE GETS ONE, AND THIS TEST EXISTS BECAUSE I ARGUED IT SHOULD NOT.
   *
   * My objection was that three of its four numbers are flat constants, so its chart would draw the
   * same shape every match. The owner overruled it, and he was right: **no unit in the game is
   * upgradeable today either**, so that argument would have killed the whole feature rather than
   * just the castle. The chart's job is comparison BETWEEN things at a glance —
   * *"you'll see which one is stronger just by opening the character sheet"* — not change over time.
   */
  it('⭐ the CASTLE gets one too — he overruled me, and the reasoning is in the docblock', () => {
    const axes = radarAxesFromRows([
      { label: 'SHOT', points: 40 }, { label: 'RANGE', points: 300 },
      { label: 'RELOAD', points: 4 }, { label: 'REGEN', points: 0 },
    ]);
    expect(axes).not.toBeNull();
    // ⛔ REGEN is deliberately NOT an axis — his call: "we won't include that for now".
    expect(axes!.map((a) => a.label)).toEqual(['SHOT', 'RANGE', 'RELOAD']);
  });

  it('⛔ RELOAD is INVERTED — a fast reload must read as a STRENGTH, not a weakness', () => {
    const fast = radarAxesFromRows([
      { label: 'SHOT', points: 40 }, { label: 'RANGE', points: 300 }, { label: 'RELOAD', points: 1 },
    ])!;
    const slow = radarAxesFromRows([
      { label: 'SHOT', points: 40 }, { label: 'RANGE', points: 300 }, { label: 'RELOAD', points: 9 },
    ])!;
    expect(radarFrac(fast[2]!)).toBeGreaterThan(radarFrac(slow[2]!));
  });

  it('⛔ ATK SPD is INVERTED too — a 60-tick cadence beats a 300-tick one', () => {
    const quick = radarAxesFromRows([
      { label: 'ATK', points: 1 }, { label: 'PEN', points: 1 }, { label: 'ATK SPD', points: 60 },
    ])!;
    const slow = radarAxesFromRows([
      { label: 'ATK', points: 1 }, { label: 'PEN', points: 1 }, { label: 'ATK SPD', points: 300 },
    ])!;
    expect(radarFrac(quick[2]!)).toBeGreaterThan(radarFrac(slow[2]!));
  });

  it('fewer than three known axes gets no chart — two is a line, one is a dot', () => {
    expect(radarAxesFromRows([{ label: 'ATK', points: 4 }, { label: 'PEN', points: 2 }])).toBeNull();
    expect(radarAxesFromRows([
      { label: 'CONNECTORS', points: 5 }, { label: 'SHAPES', points: 6 },
    ])).toBeNull();
  });
});
