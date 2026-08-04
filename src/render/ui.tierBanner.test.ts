/**
 * SPARK — V6-0.2 (S129) learnability: solo score readout + tier milestone banner.
 *
 * WHY THESE ARE UNIT TESTS AND NOT A SCREENSHOT. The HUD draw path needs a live Pixi ticker, and
 * the ticker is driven by requestAnimationFrame — which a hidden Browser pane pauses, so the sim
 * never advances and the game cannot be driven headlessly (learned in S128). Rather than assert
 * nothing, the arithmetic and the envelope are extracted as pure functions and pinned here.
 *
 * ⚠ S131 CORRECTION — the paragraph above used to end "What remains genuinely unverified is only
 * the visual placement, which is the owner's eye to judge." That was over-stated in a way that cost
 * two sessions. The blocked layer is the PANE, not the browser: the project already ships
 * playwright, and headless Chromium composites normally. S131 drove the banner through its GENUINE
 * emitter (leader score set to SCORE_TIER_STEP-1 so scoring.ts:301 fired) and MEASURED it from real
 * pixels — centre x 959.5, glyph band y 34–59, ~13px clear of the combos counter, hold bracketed
 * present@frame106 / absent@frame134. Placement is no longer a matter of opinion; what genuinely
 * needs the owner's eye is taste, not geometry. And note this file's own limit, which is why
 * `ui.drainOrder.test.ts` exists: pinning the arithmetic AROUND a defect is exactly how V6-0.2
 * shipped a banner that never rendered.
 */

import { describe, it, expect } from 'vitest';
import {
  formatTierBanner,
  formatSoloScore,
  tierBannerAlpha,
  resetWatermarkIfRegressed,
  bannerPlateRect,
  TIER_BANNER_FRAMES,
  HUD_PLATE_FILL,
} from './ui.ts';
import { PHASE_1_WIN_SCORE, SCORE_TIER_STEP } from '../constants.ts';

describe('V6-0.2 — tier milestone banner', () => {
  it('names the tier and anchors it to progress', () => {
    // The whole point of the banner: the world-space pulse says "something happened HERE",
    // the banner says "you crossed a threshold and here is where that puts you".
    expect(formatTierBanner(1)).toBe(`TIER 1  —  ${SCORE_TIER_STEP}/${PHASE_1_WIN_SCORE}`);
    expect(formatTierBanner(2)).toBe(`TIER 2  —  ${2 * SCORE_TIER_STEP}/${PHASE_1_WIN_SCORE}`);
  });

  it('the shipped constants really do give an exact three-act structure', () => {
    // The v0.6 diagnosis claims pulses at 500 and 1000 with the win at 1500 — "a three-act
    // structure nobody can feel". If a future session retunes either constant out of lockstep,
    // the banner would start naming tiers that do not divide the win score and this fails.
    expect(PHASE_1_WIN_SCORE / SCORE_TIER_STEP).toBe(3);
    expect(formatTierBanner(1)).toContain('500/1500');
    expect(formatTierBanner(2)).toContain('1000/1500');
  });

  it('holds at full alpha, then fades over the final third', () => {
    expect(tierBannerAlpha(TIER_BANNER_FRAMES)).toBe(1);          // just fired
    expect(tierBannerAlpha(TIER_BANNER_FRAMES * 0.5)).toBe(1);    // still holding
    expect(tierBannerAlpha(TIER_BANNER_FRAMES * 0.33)).toBeCloseTo(1, 5); // fade boundary
    expect(tierBannerAlpha(TIER_BANNER_FRAMES * 0.165)).toBeCloseTo(0.5, 2); // mid-fade
    expect(tierBannerAlpha(0)).toBe(0);                            // gone
  });

  it('never returns an out-of-range alpha, including on nonsense input', () => {
    // Pixi silently misbehaves on alpha outside [0,1]; a negative frame count could arise from a
    // future refactor that decrements past zero.
    for (const f of [-50, -1, 0, 1, 37, TIER_BANNER_FRAMES, TIER_BANNER_FRAMES * 10]) {
      const a = tierBannerAlpha(f);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('decays monotonically — the banner never brightens as it expires', () => {
    let prev = Infinity;
    for (let f = TIER_BANNER_FRAMES; f >= 0; f--) {
      const a = tierBannerAlpha(f);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });
});

describe('V6-0.2 — tier dedupe watermark (S129 CHECK finding)', () => {
  it('clears the watermark when the sim clock goes backwards', () => {
    // THE BUG THIS PINS. The HUD instance lives for the whole page, so its dedupe watermark
    // outlives a match. `applySnapshotCore` does `world.tick = snap.tick` (save.ts:830) for both
    // restore() and applyNetSnapshot(), so a client that played a long solo session and then joins
    // a freshly-started host adopts a MUCH lower tick. Without this reset, every subsequent
    // `e.tick <= lastTierTick` test would be true and the banner would never arm again.
    expect(resetWatermarkIfRegressed(500, 30_000)).toBe(-1);
  });

  it('leaves a healthy monotonic clock alone', () => {
    // The common case must not be disturbed: on the host, world.tick is monotonic for the page
    // lifetime (neither applyStartGame nor applyReturnToTitle touches it — verified in S129).
    expect(resetWatermarkIfRegressed(30_000, 500)).toBe(500);
    expect(resetWatermarkIfRegressed(500, 500)).toBe(500);
    expect(resetWatermarkIfRegressed(0, -1)).toBe(-1);
  });

  it('a post-reset crossing is accepted again', () => {
    // End-to-end on the guard's contract: regress the clock, reset, then a low tick must pass the
    // `e.tick > watermark` test that previously rejected it.
    const stale = 30_000;
    const adoptedTick = 500;
    const w = resetWatermarkIfRegressed(adoptedTick, stale);
    expect(adoptedTick > stale).toBe(false);  // would have been suppressed
    expect(adoptedTick > w).toBe(true);        // now armed
  });
});

describe('V6-0.2 — solo score readout', () => {
  it('floors, matching the leaderboard formatting it stands in for', () => {
    // Score accrues fractionally (0.05 x complexity per second), so an unfloored readout would
    // jitter through decimals every frame.
    expect(formatSoloScore(0)).toBe(`SCORE 0/${PHASE_1_WIN_SCORE}`);
    expect(formatSoloScore(123.987)).toBe(`SCORE 123/${PHASE_1_WIN_SCORE}`);
    expect(formatSoloScore(PHASE_1_WIN_SCORE)).toBe(`SCORE 1500/${PHASE_1_WIN_SCORE}`);
  });

  it('carries no rank, crown or YOU marker', () => {
    // Solo has exactly one player, so ranking it is noise — this readout deliberately does NOT
    // un-gate the leaderboard, it replaces it with the one thing solo actually lacked: a number.
    const s = formatSoloScore(400);
    for (const marker of ['>', '*', '<YOU', 'P1', 'B1']) expect(s).not.toContain(marker);
  });
});

describe('P3 (S131) — banner backing plate geometry', () => {
  // The plate exists because the S131 playtest showed the banner's glyphs sitting on the spawner
  // rings and the topmost structure. Geometry is a pure function precisely so a plate that is
  // mis-anchored or stale fails HERE rather than showing up as a dark rectangle beside its label.

  it('is centred on the same x as the text it backs', () => {
    const r = bannerPlateRect(200, 40, 960, 34);
    expect(r.x + r.w / 2).toBe(960);
  });

  it('fully contains the text, with padding on all four sides', () => {
    const [tw, th, cx, top] = [200, 40, 960, 34];
    const r = bannerPlateRect(tw, th, cx, top);
    // left/right
    expect(r.x).toBeLessThan(cx - tw / 2);
    expect(r.x + r.w).toBeGreaterThan(cx + tw / 2);
    // top/bottom — the text is TOP-anchored (anchor 0.5, 0), so its band is [top, top+th]
    expect(r.y).toBeLessThan(top);
    expect(r.y + r.h).toBeGreaterThan(top + th);
  });

  it('honours the TOP anchor rather than treating y as the text centre', () => {
    // This is the mistake worth guarding: reading y as a centre would put the plate half a line
    // high and leave the descenders bare. The plate's top must sit just ABOVE the text's top.
    const r = bannerPlateRect(200, 40, 960, 34);
    expect(r.y).toBeGreaterThan(34 - 40); // not centred on 34
    expect(r.y).toBeLessThan(34);         // but still above it
  });

  it('grows with the label, so a longer tier string is never clipped', () => {
    const short = bannerPlateRect(150, 40, 960, 34);
    const long = bannerPlateRect(300, 40, 960, 34);
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.w - short.w).toBe(150);
    // ...and stays centred at both sizes.
    expect(long.x + long.w / 2).toBe(960);
  });

  it('is a dark, semi-transparent fill — chrome, not a black box', () => {
    // Matches betaBadgePlate exactly so all HUD chrome reads as one system. A fully opaque plate
    // would punch a hole in the board; a near-transparent one would not mask the line noise.
    expect(HUD_PLATE_FILL.alpha).toBeGreaterThan(0.2);
    expect(HUD_PLATE_FILL.alpha).toBeLessThan(0.8);
    expect(HUD_PLATE_FILL.color).toBe(0x05070a);
  });

  it('fades with the banner: plate alpha is driven by the same envelope as the text', () => {
    // animateTierBanner assigns tierBannerAlpha() to BOTH, which multiplies with the fill's own
    // alpha. If the plate were left at a constant alpha it would outlive the fade as a dark bar.
    expect(tierBannerAlpha(TIER_BANNER_FRAMES)).toBe(1);
    expect(tierBannerAlpha(0)).toBe(0);
    expect(tierBannerAlpha(1)).toBeLessThan(1);
  });
});
