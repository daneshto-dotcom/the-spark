/**
 * SPARK — S150 P1: THE HUD DOES NOT OVERLAP ITSELF.
 *
 * ## Why this file exists
 *
 * Owner, verbatim: *"the game screen itself has non coherent parts (text/the shapes on the top
 * left) and other stuff that is placed on top of itself and just not coherent... we need to make it
 * all look cleaner and more logical/coherent/consistent"*.
 *
 * Every defect behind that sentence was the same shape: two independently-CORRECT components drawn
 * through each other, because nothing in the repo related their rectangles. The shape legend knew
 * it was at (16,16). The leaderboard knew it was at (12,12). The tier banner knew it was at y=34;
 * the match clock knew it was at y=30. The mute glyph knew it ended at x=1908; the connection dot
 * knew it started at x=1889. Each of those pairs was drawn straight through the other, in every
 * frame of every match, for tens of sessions — and the unit suite was green the entire time,
 * because a unit suite has no opinion about where two objects are relative to each other.
 *
 * A screenshot finds this class of defect. Only a test PREVENTS the next one. So the geometry is
 * extracted as `hudSurfaces()` — pure, exported, no Pixi — exactly the way this repo already
 * extracts `layoutChips` (footerBand.ts) and `progressBarFractions` (ui.ts), and this file walks
 * EVERY PAIR and fails on any intersection.
 *
 * ## What this can and cannot prove
 *
 * It proves the layout RULE. It cannot prove the running game obeys it (a font fallback that
 * renders the leaderboard 40 % wider than monospace would break the screen while this stays green).
 * That half is `e2e/zones-visual.spec.ts`, which reads the same function through
 * `__SPARK__.hud.getUiPoints()` with REAL Pixi text metrics — and then photographs it, because the
 * lesson of this session is that a green suite is not evidence for render work.
 */

import { describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';
import { hudSurfaces, rectsOverlap, type HudMetrics, type HudSurface } from './ui.ts';

/**
 * Monospace advance widths, in px per char per font size. Pixi cannot measure text in a headless
 * vitest run, so the widest realistic label is reconstructed arithmetically. 0.6 em is the standard
 * monospace advance and it MATCHES the live stage dump taken this session: `>*P1 100/1500 <YOU`
 * (18 chars, 16 px) measured w=158, i.e. 8.8 px/char — this uses 9.6, so every rect below is
 * deliberately WIDER than the real one and the assertions are conservative.
 */
const ADVANCE = 0.6;
const mono = (chars: number, size: number): number => Math.ceil(chars * size * ADVANCE);

/**
 * The widest leaderboard row the game can produce:
 * `>` + `*` + `B7` + ` ` + `1500/1500` + ` <YOU` = 19 chars of 16 px.
 * (`drawMultiplayerHUD` builds exactly that string; the score cannot exceed PHASE_1_WIN_SCORE.)
 */
const WIDEST_ROW = mono(19, 16);

/** `TIER 2  —  1000/1500` at 26 px — the longest milestone label `formatTierBanner` can emit. */
const WIDEST_TIER = mono(20, 26);

function metrics(rows: number, opts?: { pulsed?: boolean; tier?: boolean }): HudMetrics {
  // The clock SWELLS to PHASE_EDGE_PULSE_SCALE (1.6) on every BUILD↔FIGHT transition, and Pixi's
  // `.width` folds scale in — so the pulsed frame is the one that actually decides clearance.
  const pulse = opts?.pulsed === true ? 1.6 : 1;
  return {
    rows,
    rowWidth: WIDEST_ROW,
    comboWidth: mono(12, 14), // "Combos 14/14"
    comboHeight: 15,
    clockWidth: mono(11, 20) * pulse, // "BUILD  1:30"
    clockHeight: 22 * pulse,
    tierWidth: opts?.tier === true ? WIDEST_TIER : 0,
    tierHeight: opts?.tier === true ? 30 : 0,
    badgeWidth: 170, // measured live off the running game
    badgeHeight: 13,
    helpWidth: 581, // measured live off the running game
  };
}

/** Every (a, b) pair, once. Returns the offending pair names so a failure NAMES the collision. */
function collisions(surfaces: HudSurface[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const a = surfaces[i];
      const b = surfaces[j];
      if (rectsOverlap(a.rect, b.rect)) {
        hits.push(
          `${a.name} [${a.rect.x},${a.rect.y} ${a.rect.w}x${a.rect.h}] ` +
            `∩ ${b.name} [${b.rect.x},${b.rect.y} ${b.rect.w}x${b.rect.h}]`,
        );
      }
    }
  }
  return hits;
}

function find(surfaces: HudSurface[], name: string): HudSurface {
  const s = surfaces.find((x) => x.name === name);
  if (s === undefined) throw new Error(`no HUD surface named "${name}" — the layout changed shape`);
  return s;
}

describe('S150 P1 — no two HUD surfaces are drawn on top of each other', () => {
  // 1 = solo (the single SCORE line), 4 = the default VS-BOTS table, PLAYER_COLORS.length = the
  // most rows the pool can ever show. The tall case matters: rows step 22 px, so the column grows
  // downward into whatever the layout put underneath it.
  const seatCounts = [1, 4, PLAYER_COLORS.length];

  for (const rows of seatCounts) {
    for (const pulsed of [false, true]) {
      for (const tier of [false, true]) {
        it(`${rows} row(s), clock ${pulsed ? 'pulsing' : 'at rest'}, tier banner ${tier ? 'up' : 'down'}`, () => {
          expect(collisions(hudSurfaces(metrics(rows, { pulsed, tier })))).toEqual([]);
        });
      }
    }
  }
});

describe('S150 P1 — the specific collisions the owner saw, pinned individually', () => {
  // Each of these WOULD HAVE FAILED before this priority. Pinned by name as well as by the
  // exhaustive sweep above, so a regression report says which defect came back rather than just
  // "some pair overlaps".

  it('the tier banner clears the match clock — even while the clock is mid-pulse', () => {
    const s = hudSurfaces(metrics(4, { pulsed: true, tier: true }));
    const plate = find(s, 'top-centre-plate').rect;
    const banner = find(s, 'tier-banner').rect;
    // MEASURED before the fix (spark-s150-hud-tier-vs-clock.png): the banner plate spanned y 29–71
    // and the clock text y 30–52, so `TIER 2 — 1000/1500` printed over `BUILD 1:26`.
    expect(rectsOverlap(plate, banner)).toBe(false);
    expect(banner.y).toBeGreaterThan(plate.y + plate.h);
  });

  it('the ♪/⚙ glyph pair clears the connection dot', () => {
    const s = hudSurfaces(metrics(4));
    // MEASURED before the fix: ♪ at x 1900–1908 / y 30–45, dot at x 1889–1903 / y 41–55.
    expect(rectsOverlap(find(s, 'audio-glyphs').rect, find(s, 'connection-dot').rect)).toBe(false);
  });

  it('the BETA build stamp clears the glyphs below it', () => {
    const s = hudSurfaces(metrics(4));
    expect(rectsOverlap(find(s, 'beta-badge').rect, find(s, 'audio-glyphs').rect)).toBe(false);
  });

  it('the two right-edge rails are a matched pair, side by side, never intersecting', () => {
    const s = hudSurfaces(metrics(4));
    const energy = find(s, 'energy-gauge').rect;
    const progress = find(s, 'progress-rail').rect;
    expect(rectsOverlap(energy, progress)).toBe(false);
    // Same top and same bottom — that is what makes them read as one instrument set rather than as
    // two unrelated bars. The score rail used to be a HORIZONTAL bar in the opposite corner.
    expect(progress.y).toBe(energy.y);
    expect(progress.y + progress.h).toBe(energy.y + energy.h);
    expect(progress.x).toBeLessThan(energy.x); // progress inboard, energy on the edge
  });

  it('the score rail has LEFT the bottom-left corner, where QUADRANTS_4P parks a castle', () => {
    const s = hudSurfaces(metrics(4));
    const progress = find(s, 'progress-rail').rect;
    // The seat-3 keep in QUADRANTS_4P starts at x≈93, y≈900 (measured on
    // spark-s150-hud-BUILD-quadrants.png). The old bar was x 12–93 / y 918–962: one pixel of
    // clearance from a castle the layout puts there BY CONSTRUCTION.
    const bottomLeftKeep = { x: 80, y: 890, w: 100, h: 110 };
    expect(rectsOverlap(progress, bottomLeftKeep)).toBe(false);
  });

  it('the "Q=ZONE" hint sits on the score column\'s own rhythm, not 4 px above it', () => {
    const s = hudSurfaces(metrics(4));
    const row0 = find(s, 'score-row-0').rect;
    const hint = find(s, 'q-hint').rect;
    // Optically centred on row 0 rather than floating above the whole column.
    expect(hint.y).toBeGreaterThanOrEqual(row0.y);
    expect(hint.y + hint.h).toBeLessThanOrEqual(row0.y + row0.h + 2);
  });
});

describe('S150 P1 — nothing is drawn off the edge of the canvas', () => {
  it.each([1, 4, PLAYER_COLORS.length])('%i row(s)', (rows) => {
    for (const s of hudSurfaces(metrics(rows, { pulsed: true, tier: true }))) {
      expect(s.rect.x, `${s.name} left`).toBeGreaterThanOrEqual(0);
      expect(s.rect.y, `${s.name} top`).toBeGreaterThanOrEqual(0);
      expect(s.rect.x + s.rect.w, `${s.name} right`).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(s.rect.y + s.rect.h, `${s.name} bottom`).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });
});
