/**
 * SPARK — S136 P0: the keep CLICK TARGET.
 *
 * `isPointInKeep` is what turns the castle into a button (owner playtest item 2 — the automation
 * controls open on a castle click instead of living in a permanent footer). It is pinned here
 * because it is the one piece of the new interaction that is pure: the panel's Pixi rows cannot be
 * driven in vitest, but "does this pixel open the panel" can be, exactly.
 *
 * The load-bearing assertion is the LAST one: the click target must agree with the drawn box for
 * every seat. KEEP_W/KEEP_H were promoted from gathererRenderer.ts to constants.ts in this change so
 * the hit test and the renderer read the same two numbers — this test is what keeps that true.
 *
 * ⭐ S148 P1 — RE-PINNED AGAINST THE ZONE PARTITION, NOT RE-LITERALLED. Every loop used to run to
 * `KEEP_RING_SEATS` (a pinned 7) because the keeps sat on a polar ring. The ring is gone, so the
 * bound now comes from `zoneCount(layout)` and every case runs against BOTH boards. That is the
 * S147 lesson applied: when a constant that a test hardcoded stops existing, derive the replacement
 * from the new source of truth rather than typing in whatever number happens to be right today.
 */
import { describe, expect, it } from 'vitest';
import {
  GATHERER_DEPOSIT_OFFSET_Y,
  KEEP_H,
  KEEP_W,
} from '../../constants.ts';
import { zoneCount, type ZoneLayout } from '../zones.ts';
import { castleAnchor, isPointInKeep } from './gatherer.ts';

const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

describe('S136 P0 — isPointInKeep', () => {
  it.each(LAYOUTS)('%s — the anchor itself is inside every seat\'s keep', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      const a = castleAnchor(seat, layout);
      expect(isPointInKeep(a.x, a.y, seat, layout), `seat ${seat}`).toBe(true);
    }
  });

  it.each(LAYOUTS)('%s — accepts the four corners and rejects one pixel beyond each edge', (layout) => {
    const seat = 0;
    const a = castleAnchor(seat, layout);
    const hw = KEEP_W / 2;
    const hh = KEEP_H / 2;
    for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]] as const) {
      expect(isPointInKeep(a.x + dx, a.y + dy, seat, layout), `corner ${dx},${dy}`).toBe(true);
    }
    expect(isPointInKeep(a.x - hw - 1, a.y, seat, layout)).toBe(false);
    expect(isPointInKeep(a.x + hw + 1, a.y, seat, layout)).toBe(false);
    expect(isPointInKeep(a.x, a.y - hh - 1, seat, layout)).toBe(false);
    expect(isPointInKeep(a.x, a.y + hh + 1, seat, layout)).toBe(false);
  });

  it.each(LAYOUTS)('%s — no two seats\' keeps overlap', (layout) => {
    // The assertion that would have caught the S135 `castleAnchor` bug, where dividing by
    // MAX_PLAYERS instead of the ring size made the last seat's keep land exactly on seat 0's.
    // Under the zone partition the same failure would mean two anchors mapping to one zone, so this
    // is still the right question — it is just asked of a table instead of a trig expression.
    for (let a0 = 0; a0 < zoneCount(layout); a0++) {
      const a = castleAnchor(a0, layout);
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        if (seat === a0) continue;
        expect(
          isPointInKeep(a.x, a.y, seat, layout),
          `seat ${seat} must not contain seat ${a0}'s anchor`,
        ).toBe(false);
      }
    }
  });

  it.each(LAYOUTS)(
    '%s — does NOT contain the spawn/deposit offset below the keep, so the castle click and the '
      + 'gatherer-preference click cannot fight over one pixel',
    (layout) => {
      // controls.ts tests the castle BEFORE pickGatherer. A bought gatherer appears at
      // anchor.y + GATHERER_DEPOSIT_OFFSET_Y; if that were inside the box, clicking your unit would
      // open the panel instead of cycling its preference.
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = castleAnchor(seat, layout);
        expect(
          isPointInKeep(a.x, a.y + GATHERER_DEPOSIT_OFFSET_Y, seat, layout),
          `seat ${seat} unit spawn must sit outside the keep box`,
        ).toBe(false);
      }
      expect(GATHERER_DEPOSIT_OFFSET_Y).toBeGreaterThan(KEEP_H / 2); // the reason it holds
    },
  );
});
