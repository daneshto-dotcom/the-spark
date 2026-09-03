/**
 * SPARK — S161 P6: the seat label and the banner registry.
 *
 * ⭐ THIS FILE INHERITS `seatRack.test.ts`'s LABEL COVERAGE. `seatLabelText` was deleted when the
 * owner's ruling replaced the `(you)` marker with the race name; its four cases live on here against
 * `seatRaceLabel`, because relocating coverage is not the same as dropping it (the S159 P9 lesson —
 * inverting a test is not the same as deleting what it proved).
 */

import { describe, expect, it } from 'vitest';
import { RACE_BANNER_SRC, raceDisplayName, seatRaceLabel } from './raceBanners.ts';
import { racePickerPanelRect, raceTileRect } from './racePicker.ts';
import { ALL_RACES } from '../state/races.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('seatRaceLabel', () => {
  it('prints the seat number alone for a plain occupied seat with no race', () => {
    expect(seatRaceLabel(2, false, undefined)).toBe('P3');
  });

  it('adds the HOST badge', () => {
    expect(seatRaceLabel(0, true, undefined)).toBe('P1  HOST');
  });

  it('⭐ names the RACE where "(you)" used to go', () => {
    expect(seatRaceLabel(3, false, 'demons')).toBe('P4  (DEMONS)');
  });

  it('carries both badges together — the owner\'s example, verbatim', () => {
    // Owner: "it will say P1 HOST (Race name)".
    expect(seatRaceLabel(0, true, 'vampires')).toBe('P1  HOST  (VAMPIRES)');
  });

  it('⛔ never prints "(you)" again — that marker is the clickable tile now', () => {
    for (const race of ALL_RACES) {
      for (const host of [true, false]) {
        expect(seatRaceLabel(0, host, race)).not.toContain('you');
      }
    }
  });
});

describe('raceDisplayName', () => {
  it('is the id in capitals, for every race', () => {
    for (const race of ALL_RACES) expect(raceDisplayName(race)).toBe(race.toUpperCase());
  });

  it('is never empty and never leaks a lowercase id', () => {
    for (const race of ALL_RACES) {
      expect(raceDisplayName(race).length).toBeGreaterThan(0);
      expect(raceDisplayName(race)).not.toBe(race);
    }
  });
});

describe('RACE_BANNER_SRC', () => {
  it('covers every race exactly once, with no duplicate path', () => {
    expect(Object.keys(RACE_BANNER_SRC).sort()).toEqual([...ALL_RACES].sort());
    const paths = Object.values(RACE_BANNER_SRC);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('⛔ every banner actually ships — a lobby tile with a 404 behind it is a blank tile', () => {
    for (const race of ALL_RACES) {
      const onDisk = join('public', RACE_BANNER_SRC[race].replace(/^\//, ''));
      expect(existsSync(onDisk), `${race} banner at ${onDisk}`).toBe(true);
    }
  });

  it('is .jpg, which is the one deliberate exception to this project\'s PNG habit', () => {
    // See the module docblock: full-bleed art with no alpha and no matte, on the one screen a
    // player sits and waits on. 524 KiB as JPEG against 2,089 KiB as PNG.
    for (const race of ALL_RACES) expect(RACE_BANNER_SRC[race].endsWith('.jpg')).toBe(true);
  });
});

describe('racePicker geometry', () => {
  it('lays out one tile per race with no overlaps', () => {
    const rects = ALL_RACES.map((_, i) => raceTileRect(i));
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const A = rects[a]!;
        const B = rects[b]!;
        const disjoint =
          A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y;
        expect(disjoint, `tiles ${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it('keeps every tile inside the panel', () => {
    const panel = racePickerPanelRect();
    for (let i = 0; i < ALL_RACES.length; i++) {
      const r = raceTileRect(i);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(panel.w);
      expect(r.y + r.h).toBeLessThanOrEqual(panel.h);
    }
  });

  it('centres the panel on the canvas and fits it', () => {
    const p = racePickerPanelRect();
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
    expect(p.x + p.w).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(p.y + p.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(p.x * 2 + p.w).toBeCloseTo(CANVAS_WIDTH, 6);
    expect(p.y * 2 + p.h).toBeCloseTo(CANVAS_HEIGHT, 6);
  });

  it('⭐ offers MORE races than there are seats, which is what makes it a choice', () => {
    // MAX_PLAYERS is 4 and there are six races, so two are always free. If a future change made
    // these equal, the picker would degrade into a swap-with-someone puzzle.
    expect(ALL_RACES.length).toBeGreaterThan(4);
  });
});
