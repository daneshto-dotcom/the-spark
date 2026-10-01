/**
 * PITCH MASTERS (arcade) — its row on SPARK's arcade menu. Owner: "the list shows NONET, and right
 * under it PITCH MASTERS"; clicking it opens the game's own page.
 */

import { describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT } from '../../constants.ts';
import {
  ARCADE_GAMES, LAUNCH_GUARD_MS, arcadeBackGeom, arcadeHref, arcadeRowGeoms, launchAllowed,
} from '../../render/arcadeOverlay.ts';

describe('PITCH MASTERS on the arcade menu', () => {
  it('sits directly under NONET', () => {
    const ids = ARCADE_GAMES.map((g) => g.id);
    expect(ids.indexOf('pitch-masters')).toBe(ids.indexOf('nonet') + 1);
    expect(ARCADE_GAMES.find((g) => g.id === 'pitch-masters')?.name).toBe('PITCH MASTERS');
  });

  it('launches its own page; NONET still launches inside SPARK', () => {
    expect(arcadeHref('pitch-masters')).toBe('/pitch-masters/');
    expect(arcadeHref('nonet')).toBeNull();
    expect(arcadeHref('back')).toBeNull();
  });

  it('one tap opens ONE tab: the double onSelect (button click + board pointertap) is ignored', () => {
    // PM-S3 live audit: one tap opened two game tabs (two engine boots at once on a small laptop)
    let last = -Infinity;
    let opened = 0;
    const tap = (now: number) => {
      if (launchAllowed(last, now)) {
        last = now;
        opened += 1;
      }
    };
    tap(1000);
    tap(1000.4); // the same tap's second onSelect
    expect(opened).toBe(1);
    tap(1000 + LAUNCH_GUARD_MS + 1); // a real second tap later still works
    expect(opened).toBe(2);
  });

  it('the row and BACK still fit on the board', () => {
    const rows = arcadeRowGeoms();
    const pm = rows.find((r) => r.id === 'pitch-masters')!;
    expect(pm.y).toBeGreaterThan(rows.find((r) => r.id === 'nonet')!.y);
    const back = arcadeBackGeom();
    expect(back.y + back.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });
});
