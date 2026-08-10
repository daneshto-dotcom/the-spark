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
 */
import { describe, expect, it } from 'vitest';
import {
  GATHERER_DEPOSIT_OFFSET_Y,
  KEEP_H,
  KEEP_RING_SEATS,
  KEEP_W,
} from '../../constants.ts';
import { castleAnchor, isPointInKeep } from './gatherer.ts';

describe('S136 P0 — isPointInKeep', () => {
  it('the anchor itself is inside every seat\'s keep', () => {
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      expect(isPointInKeep(a.x, a.y, seat), `seat ${seat}`).toBe(true);
    }
  });

  it('accepts the four corners and rejects one pixel beyond each edge', () => {
    const seat = 0;
    const a = castleAnchor(seat);
    const hw = KEEP_W / 2;
    const hh = KEEP_H / 2;
    for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]] as const) {
      expect(isPointInKeep(a.x + dx, a.y + dy, seat), `corner ${dx},${dy}`).toBe(true);
    }
    expect(isPointInKeep(a.x - hw - 1, a.y, seat)).toBe(false);
    expect(isPointInKeep(a.x + hw + 1, a.y, seat)).toBe(false);
    expect(isPointInKeep(a.x, a.y - hh - 1, seat)).toBe(false);
    expect(isPointInKeep(a.x, a.y + hh + 1, seat)).toBe(false);
  });

  it('a point in seat 0\'s keep is NOT in any other seat\'s keep (no overlapping ring)', () => {
    // This is the assertion that would have caught the S135 castleAnchor bug where dividing by
    // MAX_PLAYERS (6) instead of KEEP_RING_SEATS (7) made seat 6's keep land exactly on seat 0's.
    const a = castleAnchor(0);
    for (let seat = 1; seat < KEEP_RING_SEATS; seat++) {
      expect(isPointInKeep(a.x, a.y, seat), `seat ${seat} must not contain seat 0's anchor`).toBe(
        false,
      );
    }
  });

  it('does NOT contain the spawn/deposit offset below the keep — so the castle click and the '
    + 'gatherer-preference click cannot fight over one pixel', () => {
    // controls.ts tests the castle BEFORE pickGatherer. A bought gatherer appears at
    // anchor.y + GATHERER_DEPOSIT_OFFSET_Y; if that were inside the box, clicking your unit would
    // open the panel instead of cycling its preference.
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      expect(
        isPointInKeep(a.x, a.y + GATHERER_DEPOSIT_OFFSET_Y, seat),
        `seat ${seat} unit spawn must sit outside the keep box`,
      ).toBe(false);
    }
    expect(GATHERER_DEPOSIT_OFFSET_Y).toBeGreaterThan(KEEP_H / 2); // the reason it holds
  });
});
