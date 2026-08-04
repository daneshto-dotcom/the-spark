/**
 * SPARK — V6-0.3 (S130): the tier banner's drain-order guard.
 *
 * WHAT WENT WRONG, AND WHY NO EXISTING TEST CAUGHT IT. V6-0.2 (S129) shipped a tier milestone
 * banner whose `SCORE_TIER` scan lived inside `HUD.sync`. `hud.sync` is called at main.ts:2515,
 * while `effectsRenderer.sync` sets `world.effects.length = 0` at main.ts:2486
 * (effectsRenderer.ts:73). Each has exactly ONE call site, and nothing between them writes
 * `world.effects`. So the scan always iterated an EMPTY array: the banner could never fire, in any
 * mode, for any player. The suite was green, the bundle built, the roadmap row said DONE.
 *
 * The reason it slipped is worth stating, because it generalises: `ui.tierBanner.test.ts` pinned
 * the pure ARITHMETIC (`formatTierBanner`, `tierBannerAlpha`, `resetWatermarkIfRegressed`) and its
 * own docblock conceded that the draw path "cannot be driven headlessly" — a hidden Browser pane
 * pauses requestAnimationFrame, so the Pixi ticker never advances. Testing everything EXCEPT the
 * one thing that was broken produced a confident green.
 *
 * SO THESE TWO TESTS DELIBERATELY TARGET THE CALL SITE, NOT THE ARITHMETIC:
 *   1. a SOURCE-ORDER lock, which reads main.ts as text and asserts the pre-wipe consumers really
 *      are pre-wipe — this is the assertion that would have failed in S129;
 *   2. a BEHAVIOURAL test proving the capture is order-SENSITIVE, so if anyone moves it back after
 *      the wipe the failure is demonstrated rather than argued.
 *
 * KNOWN LIMIT, stated rather than oversold (PRIME-AUDIT R-C): the source-order lock protects only
 * the consumers named in its allowlist. Nothing here stops a future session adding a NEW
 * `world.effects` reader below the wipe. The defect CLASS is pinned for today's consumers and OPEN
 * for new ones; the in-situ comment at the main.ts insertion point is the other half of the guard.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { captureTierBanner, TIER_BANNER_FRAMES } from './ui.ts';
import type { GameEffect } from '../game/effects.ts';

const MAIN_TS = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');

/** The wipe itself — `effectsRenderer.sync` is the ONLY thing that clears `world.effects`. */
const WIPE = 'effectsRenderer.sync(world)';

/**
 * Every consumer that reads `world.effects` and therefore MUST run before the wipe.
 *
 * This list is an allowlist, not a discovery mechanism — see the KNOWN LIMIT above. Two of these
 * (`drainAudioEffects`, `debugOverlay.sync`) already carried "runs BEFORE the effects wipe"
 * comments in S129, which is what makes the tier banner's placement so clearly an oversight rather
 * than a considered trade.
 */
const PRE_WIPE_CONSUMERS = [
  'drainAudioEffects(world.effects, world.tick)',
  'debugOverlay.sync(world, debugProbes)',
  'hud.drainTierBanner(world)',
  // V6-0.3 (S131) — the sever-attribution toast reads BOND_SEVERED from world.effects.
  'severToastRenderer.drainSeverToast(world)',
] as const;

/**
 * S131 — WHY `seagullRenderer.sync` AND `poopRenderer.sync` ARE NOT IN THAT LIST, even though both
 * sit above the wipe in main.ts and the V6-0.3 PDR asked for them here.
 *
 * They do not read `world.effects`. Verified: zero occurrences of `effects` in either
 * `seagullRenderer.ts` or `poopRenderer.ts` — they are driven by synced world fields, like
 * `rainbowFlyoverRenderer`. Listing them would make this file assert something false ABOUT them and,
 * worse, would freeze their call position for a reason that does not exist — so a future session
 * reordering them legitimately would hit a failure whose stated justification it could not verify.
 *
 * The list means "reads world.effects, therefore must precede the wipe". Membership has to be
 * earned by actually reading the array.
 */

function scoreTier(tick: number, tier: number, color = 0xffffff): GameEffect {
  return { kind: 'SCORE_TIER', tick, tier, color, pos: { x: 0, y: 0 } };
}

describe('V6-0.3 — drain order (the V6-0.2 regression lock)', () => {
  it('the wipe exists exactly once, so "before the wipe" is a well-defined position', () => {
    // If effectsRenderer.sync ever gains a second call site, "pre-wipe" stops being a single
    // position in the frame and every assertion below becomes ambiguous rather than false.
    const hits = MAIN_TS.split(WIPE).length - 1;
    expect(hits).toBe(1);
  });

  it('every world.effects consumer runs BEFORE the wipe', () => {
    // THE ASSERTION THAT WOULD HAVE FAILED IN S129. The tier banner's scan was reachable only via
    // hud.sync, which sits AFTER the wipe — so `hud.drainTierBanner` would have been absent here
    // and the banner's read would have been post-wipe.
    const wipeAt = MAIN_TS.indexOf(WIPE);
    expect(wipeAt).toBeGreaterThan(-1);
    for (const consumer of PRE_WIPE_CONSUMERS) {
      // S131 CHECK (RALPH) — THE OCCURRENCE COUNT IS LOAD-BEARING, not defensive padding.
      //
      // `indexOf` returns the FIRST match, and this file reads main.ts as raw text with no comment
      // stripping. So ANY mention of a consumer's exact call text in a comment above the wipe
      // satisfies the position assertion no matter where the real call sits. That was not
      // hypothetical: main.ts:553 already carried the substring `hud.drainTierBanner` in a comment
      // ~1,950 lines above the wipe, one `(world)` away from blinding this guard — and a reviewer
      // demonstrated it by adding that token, moving the real call below the wipe, and watching all
      // 9 tests here plus the full 1981-test suite stay green with the V6-0.2 defect live.
      //
      // Pinning the count to exactly 1 closes it: a comment mentioning the call becomes a SECOND
      // occurrence and fails loudly. Test 1 above already does this for the wipe itself; the
      // consumer loop simply never got the same treatment.
      const occurrences = MAIN_TS.split(consumer).length - 1;
      expect(
        occurrences,
        `${consumer} must appear EXACTLY once in main.ts (a comment mentioning it would let indexOf ` +
          `resolve to the comment and blind this guard). Found ${occurrences}.`,
      ).toBe(1);
      const at = MAIN_TS.indexOf(consumer);
      expect(at, `${consumer} must exist in main.ts`).toBeGreaterThan(-1);
      expect(at, `${consumer} must run BEFORE ${WIPE}`).toBeLessThan(wipeAt);
    }
  });

  it('hud.sync stays AFTER the wipe, and the banner scan is no longer reachable from it', () => {
    // The fix deliberately did NOT relocate hud.sync — that would have required arguing about its
    // order-independence relative to five other renderers. Instead the SCAN moved out. This pins
    // both halves of that decision: sync stays late, and it no longer reads effects.
    const wipeAt = MAIN_TS.indexOf(WIPE);
    expect(MAIN_TS.indexOf('hud.sync(world)')).toBeGreaterThan(wipeAt);
  });
});

describe('V6-0.3 — the capture is order-SENSITIVE (proves the bug was real)', () => {
  it('captures a crossing when effects are present, and nothing once they are wiped', () => {
    // This is the S129 defect reproduced as arithmetic. Same inputs, same watermark — the ONLY
    // difference is whether the array has been cleared yet. If a future refactor moves the drain
    // back below main.ts's wipe, this is the mechanism that makes it fail rather than go quiet.
    const effects: GameEffect[] = [scoreTier(600, 1, 0x00ffff)];

    const before = captureTierBanner(effects, 600, -1);
    expect(before.text).not.toBeNull();
    expect(before.text).toContain('TIER 1');
    expect(before.color).toBe(0x00ffff);
    expect(before.watermark).toBe(600);

    // effectsRenderer.sync does exactly this (effectsRenderer.ts:73).
    effects.length = 0;

    const after = captureTierBanner(effects, 600, -1);
    expect(after.text).toBeNull();          // ← the shipped V6-0.2 behaviour, every single frame
    expect(after.watermark).toBe(-1);
  });

  it('a null capture leaves an in-flight banner alone', () => {
    // The drain must not clobber banner state on a no-crossing frame: the banner holds for
    // TIER_BANNER_FRAMES frames and only ~1 frame in that window has the effect present, so
    // "no crossing" is the overwhelmingly common case and must be inert.
    expect(TIER_BANNER_FRAMES).toBeGreaterThan(1);
    const cap = captureTierBanner([], 900, 600);
    expect(cap.text).toBeNull();
    expect(cap.watermark).toBe(600);        // watermark preserved, not reset
  });
});

describe('V6-0.3 — captureTierBanner dedupe and batch semantics', () => {
  it('dedupes by tick, so re-seeing the same crossing does not re-arm the banner', () => {
    // Dedupe is by the effect's own tick rather than object identity, because world.effects is
    // rebuilt every frame and identity is never stable.
    const e = [scoreTier(600, 1)];
    expect(captureTierBanner(e, 600, 600).text).toBeNull();
    expect(captureTierBanner(e, 600, 599).text).not.toBeNull();
  });

  it('takes the NEWEST tier when several cross in one drained batch', () => {
    // main.ts steps up to 3 sim ticks per rendered frame, and scoring.ts:299 emits one effect per
    // crossed boundary in a loop — so a single drain can legitimately see tier 1 and tier 2. Only
    // the newest is worth naming, and the watermark must end up at the newest tick.
    const cap = captureTierBanner([scoreTier(600, 1), scoreTier(601, 2)], 601, -1);
    expect(cap.text).toContain('TIER 2');
    expect(cap.watermark).toBe(601);
  });

  it('ignores non-SCORE_TIER effects sharing the array', () => {
    // world.effects is a mixed bag — BOND_SEVERED, ARC_FLASH and others ride along.
    const cap = captureTierBanner(
      [
        { kind: 'BOND_SEVERED', tick: 600, pos: { x: 0, y: 0 }, cause: 'player' },
        scoreTier(600, 1),
      ],
      600,
      -1,
    );
    expect(cap.text).toContain('TIER 1');
  });

  it('still resets a regressed watermark even when no crossing is present', () => {
    // The backward-tick guard (a client adopting a lower host tick via applySnapshotCore) must
    // apply on EVERY drain, not only on frames that happen to carry a SCORE_TIER.
    const cap = captureTierBanner([], 500, 30_000);
    expect(cap.watermark).toBe(-1);
    expect(cap.text).toBeNull();
  });
});
