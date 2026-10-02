/**
 * S194 T5 (audit F2) — the settings gear's click target IS `settingsGearRect()`, the rect the input
 * layer's modal cover uses: every point is either taken by the gear AND covered, or neither. And the
 * main.ts wire pins it as a fixed hitArea with no hover scale (a scale would grow Pixi's hit bounds).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rectangle } from 'pixi.js';
import { AUDIO_ICON_Y, GAUGE_X_COLUMN, settingsGearLocalHit, settingsGearRect } from './ui.ts';

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe('S194 F2 — the gear hit area equals the modal-cover rect', () => {
  it('every point around the gear agrees: gear hit ⇔ covered', () => {
    const h = settingsGearLocalHit(GAUGE_X_COLUMN, AUDIO_ICON_Y);
    const hit = new Rectangle(h.x, h.y, h.w, h.h);
    const cover = settingsGearRect();
    let inside = 0;
    for (let y = cover.y - 6; y <= cover.y + cover.h + 6; y += 0.5) {
      for (let x = cover.x - 6; x <= cover.x + cover.w + 6; x += 0.5) {
        const gear = hit.contains(x - GAUGE_X_COLUMN, y - AUDIO_ICON_Y);
        const covered = inRect(cover, x, y);
        if (gear) inside++;
        // Rectangle.contains is half-open on the far edges; the cover is closed. Ignore the far edge line.
        if (x === cover.x + cover.w || y === cover.y + cover.h) continue;
        expect(gear, `(${x},${y})`).toBe(covered);
      }
    }
    expect(inside, 'non-vacuous').toBeGreaterThan(100);
  });

  it('main.ts pins the hitArea from settingsGearLocalHit and never scales the gear', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const at = src.indexOf('settingsIcon.eventMode = ');
    const block = src.slice(at, at + 1200);
    expect(block).toContain('settingsGearLocalHit(GAUGE_X_COLUMN, AUDIO_ICON_Y)');
    expect(block).toContain('settingsIcon.hitArea = new Rectangle(');
    expect(block).not.toMatch(/settingsIcon\.scale\.set\(/);
    expect(src).toMatch(/settingsIcon\.position\.set\(GAUGE_X_COLUMN, AUDIO_ICON_Y\)/);
  });
});

describe('S194 nit — the settings overlay shows keyboard focus', () => {
  it('its scoped CSS carries a :focus-visible outline for buttons and inputs', () => {
    const src = readFileSync(new URL('./settingsOverlay.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\.spark-settings button:focus-visible,\.spark-settings input:focus-visible\{outline:2px solid/);
  });
});
