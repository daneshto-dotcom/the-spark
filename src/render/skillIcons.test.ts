/**
 * SPARK — S190 (audit W-5) — **EVERY SKILL ICON IS CUT FROM ITS OWN CARD, WITH ITS OWN WINDOW.**
 *
 * The WRATH OF RA icon used to be cut at runtime from the whole level-10 card using the level-0
 * card's proportions; on the l10 composition that window sliced the three eyes of Ra down to the
 * middle beam — the "times three" the picture exists to show. The fix is a pre-cut icon per card,
 * made by `scripts/cut-skill-icon.py --preset <name>` from the `CUTS` table there. This file pins that
 * table against the footer's `SKILL_ICON` and against the cards themselves, so a window cannot drift
 * back to "one size fits every card" without a test going red.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_ICON } from './footerBand.ts';

const ROOT = join(__dirname, '..', '..');

/** The `CUTS` table, read out of the script: name -> { src, top, side }. */
function cuts(): Map<string, { src: string; top: number; side: number }> {
  const py = readFileSync(join(ROOT, 'scripts', 'cut-skill-icon.py'), 'utf8');
  const out = new Map<string, { src: string; top: number; side: number }>();
  for (const m of py.matchAll(/"([a-z-]+)": \("([^"]+)", (\d+), (\d+)\)/g)) {
    out.set(m[1]!, { src: m[2]!, top: Number(m[3]), side: Number(m[4]) });
  }
  return out;
}

/** Width x height of a PNG, from its IHDR chunk. */
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.toString('ascii', 1, 4)).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Width x height of a WebP (lossy `VP8 `, lossless `VP8L` or extended `VP8X`). */
function webpSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
  }
  return null;
}

const nameOf = (url: string): string => url.slice(url.lastIndexOf('/') + 1).replace(/\.webp$/, '');

describe('S190 W-5 — one window per card, pinned', () => {
  it('⭐ each skill names its own pre-cut icon, and the cutter has a window for each', () => {
    const table = cuts();
    expect(table.size, 'anti-vacuity: the CUTS table parsed').toBeGreaterThanOrEqual(2);
    for (const icon of Object.values(SKILL_ICON)) {
      expect(icon.url.startsWith('/art/skills/'), `${icon.url} is a pre-cut icon, not a whole card`).toBe(true);
      expect(table.has(nameOf(icon.url)), `${icon.url} has a CUTS entry`).toBe(true);
    }
  });

  it('⭐ POWER is cut from the level-0 card and WRATH from the level-10 card — never the same window', () => {
    const table = cuts();
    const power = table.get(nameOf(SKILL_ICON.power.url))!;
    const wrath = table.get(nameOf(SKILL_ICON.wrath.url))!;
    expect(power).toEqual({ src: 'assets-source/upgrade-cards/l0-mummies.png', top: 310, side: 700 });
    expect(wrath).toEqual({ src: 'assets-source/upgrade-cards/l10-mummies.png', top: 96, side: 752 });
    expect(SKILL_ICON.wrath.url).not.toBe(SKILL_ICON.power.url);
  });

  it('⛔ every window fits inside its own card, below the top edge', () => {
    for (const [name, c] of cuts()) {
      const card = pngSize(readFileSync(join(ROOT, c.src)));
      expect(c.top, `${name}: starts below the top edge`).toBeGreaterThan(0);
      expect(c.side, `${name}: no wider than its card`).toBeLessThanOrEqual(card.w);
      expect(c.top + c.side, `${name}: ends inside its card`).toBeLessThanOrEqual(card.h);
    }
  });

  it('⭐ every icon is shipped: a 128 px square WebP under public/', () => {
    for (const icon of Object.values(SKILL_ICON)) {
      const path = join(ROOT, 'public', icon.url);
      expect(existsSync(path), `${icon.url} is missing — run python scripts/cut-skill-icon.py --preset ${nameOf(icon.url)}`).toBe(true);
      expect(webpSize(readFileSync(path)), `${icon.url} is a readable 128 px WebP`).toEqual({ w: 128, h: 128 });
    }
  });
});
