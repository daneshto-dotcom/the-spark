import { describe, expect, it } from 'vitest';
import { formatPhaseBanner } from './ui.ts';
import { PHASE_DURATION_TICKS, PHYSICS_HZ } from '../constants.ts';


/*
 * ⭐ S169 (owner) — THE `progressBarFractions` SUITE IS GONE BECAUSE THE BAR IS GONE.
 *
 * Owner: *"the victory bar. We don't need that because on the top left of the screen, there's
 * already, like, the victory score with all the players, that's enough to know who's winning."*
 *
 * He is right that it was a duplicate readout, so the rail and its pure fraction helper were both
 * removed and their tests with them — assertions about a bar nobody draws cannot fail, and keeping
 * them would be green decoration. `formatPhaseBanner` is unrelated and its tests continue below.
 *
 * ⚠ WHAT THE REMOVAL COST, recorded so it is a decision and not an accident: the rail carried two
 * things the top-left score text does not — a ghost tick for the LEADER's position, and a red flash
 * when your own score DROPPED (a NONET halving). If either is missed in play, they belong on the
 * scoreboard rather than on a second bar.
 */


/**
 * S147 P1 — the MATCH CLOCK readout. Pure formatter, so the arithmetic is tested here rather than
 * through a Pixi canvas (the Browser pane cannot be driven headlessly — a hidden pane pauses
 * requestAnimationFrame, so the ticker never advances; same reason `formatTierBanner` is pure).
 */
describe('S147 P1 — formatPhaseBanner', () => {
  it('renders a full fresh phase as the round number of seconds, not one short', () => {
    // CEIL, not floor: a brand-new 5400-tick phase must read 1:30, and only the final tick reads 0:00.
    expect(formatPhaseBanner('BUILD', PHASE_DURATION_TICKS)).toBe('BUILD  1:30');
    expect(formatPhaseBanner('FIGHT', PHASE_DURATION_TICKS)).toBe('FIGHT  1:30');
  });

  it('zero-pads the seconds so the readout never jitters in width', () => {
    expect(formatPhaseBanner('FIGHT', 7 * PHYSICS_HZ)).toBe('FIGHT  0:07');
    expect(formatPhaseBanner('FIGHT', 65 * PHYSICS_HZ)).toBe('FIGHT  1:05');
  });

  it('reaches 0:00 only at the boundary itself', () => {
    expect(formatPhaseBanner('BUILD', 1)).toBe('BUILD  0:01'); // part of a second still remains
    expect(formatPhaseBanner('BUILD', 0)).toBe('BUILD  0:00');
  });

  /**
   * ⛔ THE CLAMP MATTERS AND IS NOT THEORETICAL. `ticksRemaining` can legitimately go NEGATIVE:
   * a joiner advances `world.tick` locally at 60 Hz between 10 Hz snapshots, so it can pass the
   * deadline before the host's flip arrives; and on the host the NONET freeze advances the tick while
   * skipping the flip entirely. Rendering "-0:03" would read as a broken clock, so it floors at 0:00
   * and waits for the authoritative flip.
   */
  it('clamps at 0:00 rather than showing negative time', () => {
    expect(formatPhaseBanner('FIGHT', -1)).toBe('FIGHT  0:00');
    expect(formatPhaseBanner('FIGHT', -PHASE_DURATION_TICKS * 3)).toBe('FIGHT  0:00');
  });

  it('names the phase verbatim, so the label is the sim value and cannot drift from it', () => {
    expect(formatPhaseBanner('BUILD', 0)).toContain('BUILD');
    expect(formatPhaseBanner('FIGHT', 0)).toContain('FIGHT');
  });
});
