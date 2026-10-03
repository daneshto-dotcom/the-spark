/**
 * ⭐ S194 (teams × S193 personality — the S193 audit's merge seam) — **FOUR CHIPS ON ONE BOT ROW, AND NONE
 * OF THEM TOUCH.** The teams branch put a TEAM chip at x −120 and master's personality work moved the RACE
 * chip to −70 (±92): merged as-is they overlapped by 80 px. The row is now laid out right to left —
 * difficulty · personality · race · team — and this test reads the overlay's OWN exported geometry, so a
 * re-layout that makes two chips touch, or pushes one off the panel, or squeezes the tagline below
 * `BOT_TAGLINE_MAX_CHARS`, goes red here.
 */
import { describe, expect, it } from 'vitest';
import { BOT_ROW_LAYOUT } from './botSetupOverlay.ts';
import { BOT_TAGLINE_MAX_CHARS } from '../bots/botTypes.ts';

const GLYPH_PX = 0.6 * 12; // 12 px monospace, ≤ 0.6 em a glyph (the S193 LOW-2 arithmetic)
const GAP = 8;

describe('S194 — the bot lobby row holds four chips', () => {
  const chips = [...BOT_ROW_LAYOUT.chips].sort((a, b) => a.cx - b.cx);

  it('there are four, and the TEAM chip is one of them', () => {
    expect(chips.map((c) => c.name).sort()).toEqual(['difficulty', 'personality', 'race', 'team']);
  });

  it('⛔ no two chips overlap (each pair at least 8 px apart)', () => {
    for (let i = 1; i < chips.length; i++) {
      const left = chips[i - 1]!;
      const right = chips[i]!;
      expect(right.cx - right.halfW - (left.cx + left.halfW), `${left.name} | ${right.name}`).toBeGreaterThanOrEqual(GAP);
    }
  });

  it('every chip sits inside the panel', () => {
    for (const c of chips) {
      expect(c.cx - c.halfW, c.name).toBeGreaterThanOrEqual(-BOT_ROW_LAYOUT.panelW / 2);
      expect(c.cx + c.halfW, c.name).toBeLessThanOrEqual(BOT_ROW_LAYOUT.panelW / 2);
    }
  });

  it('the tagline keeps room for BOT_TAGLINE_MAX_CHARS left of the leftmost chip (arithmetic: 226 px → 31)', () => {
    const leftmost = chips[0]!;
    const free = leftmost.cx - leftmost.halfW - BOT_ROW_LAYOUT.taglineLeft - GAP;
    expect(free).toBe(226);
    expect(Math.floor(free / GLYPH_PX)).toBeGreaterThanOrEqual(BOT_TAGLINE_MAX_CHARS);
  });

  it('NEGATIVE — the pre-S194 positions (team −120, race −70 on 860) DID overlap', () => {
    const team = { cx: -120, halfW: 36 };
    const race = { cx: 860 / 2 - 500, halfW: 92 };
    expect(race.cx - race.halfW - (team.cx + team.halfW)).toBeLessThan(0);
  });
});
