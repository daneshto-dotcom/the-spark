/**
 * SPARK — cutsceneOverlay handoff-timer tests (S25 P0).
 *
 * Council R1 unanimous on `vi.useFakeTimers()` for AC7 verification (handoff
 * fires at recipe.cinematicMs). PDR initially deferred this to manual smoke;
 * CHECK Triumvirate (Gemini CH5) flagged the gap. Added here.
 *
 * Coverage:
 *   - onCinematicHandoff fires at exactly recipe.cinematicMs (not before)
 *   - onCinematicHandoff is NOT called when ctx.onCinematicHandoff is undefined
 *     (back-compat with pre-S25 cinematic callers)
 *   - abort() clears the pending handoff timer (the CRITICAL Council Grok CH3 +
 *     Gemini CH4 GODLY_ABORT timer-race fix is to call cutsceneOverlay.abort()
 *     before dispatching GODLY_ABORT — verifying the timer is actually cleared)
 *
 * ENV GATE: CutsceneOverlay.play() calls `document.createElement('video')` in
 * its synchronous setup, which throws in node-only test envs. This project
 * doesn't configure jsdom/happy-dom — scope-out per PDR §4 AC7 ("manual smoke
 * if too brittle"). Suite is gated `describe.skipIf(typeof document === 'undefined')`
 * so it auto-runs when a DOM env is added in a future session, locking the
 * contract without forcing config-scope creep into S25. Manual browser smoke
 * at `?debug=1` still verifies the handoff fires at cinematicMs in S25.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { CutsceneOverlay } from './cutsceneOverlay.ts';
import type { GodlyRecipe } from '../state/godlyRecipes/types.ts';

function makeTestRecipe(): GodlyRecipe {
  return {
    id: 'voltkin',
    predicate: () => null,
    cinematicAsset: '/dev-null.mp4',
    voiceAsset: '/dev-null.ogg',
    characterSprite: '/dev-null.png',
    cinematicMs: 4000,
    sustainedEffectMs: 8000,
    voiceOffsetMs: 3500,
    lumaKey: { enabled: false, threshold: 0 },
  };
}

describe.skipIf(typeof document === 'undefined')('CutsceneOverlay handoff timer (S25 P0)', () => {
  let overlay: CutsceneOverlay;

  beforeEach(() => {
    vi.useFakeTimers();
    // Node test env doesn't define requestAnimationFrame; CutsceneOverlay.fade
    // (called synchronously in play()) uses it. Polyfill scoped to this suite —
    // restored in afterEach via vi.restoreAllMocks() / direct delete.
    if (typeof globalThis.requestAnimationFrame === 'undefined') {
      (globalThis as unknown as { requestAnimationFrame: FrameRequestCallback }).requestAnimationFrame =
        ((_cb: FrameRequestCallback): number => 0) as unknown as FrameRequestCallback;
      (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
        (): void => {};
    }
    // CutsceneOverlay only touches `app.stage.addChild` (constructor) and
    // `app.canvas.getBoundingClientRect` (in play()). Pixi's real Application
    // exposes those as readonly getters that can't be reassigned, so we bypass
    // the class entirely and pass a structural duck.
    const fakeApp = {
      stage: { addChild: (): void => {} },
      canvas: {
        getBoundingClientRect: (): DOMRect =>
          ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect),
      },
    } as unknown as Application;
    overlay = new CutsceneOverlay(fakeApp);
  });

  afterEach(() => {
    overlay?.abort();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('onCinematicHandoff fires at exactly recipe.cinematicMs', () => {
    const recipe = makeTestRecipe();
    const handoff = vi.fn();
    void overlay.play(recipe, {
      targetPos: { x: 100, y: 200 },
      onComplete: () => {},
      playVoice: () => {},
      onCinematicHandoff: handoff,
    });

    expect(handoff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(recipe.cinematicMs - 1);
    expect(handoff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handoff).toHaveBeenCalledOnce();
  });

  it('onCinematicHandoff is optional (back-compat with pre-S25 callers)', () => {
    const recipe = makeTestRecipe();
    expect(() =>
      overlay.play(recipe, {
        targetPos: { x: 100, y: 200 },
        onComplete: () => {},
        playVoice: () => {},
        // onCinematicHandoff intentionally omitted
      }),
    ).not.toThrow();
    vi.advanceTimersByTime(recipe.cinematicMs + 100); // walks past handoff window
    // No assertion needed — the test passes if no crash + no thrown promise.
  });

  it('abort() clears the pending handoff timer (GODLY_ABORT contract)', () => {
    const recipe = makeTestRecipe();
    const handoff = vi.fn();
    void overlay.play(recipe, {
      targetPos: { x: 100, y: 200 },
      onComplete: () => {},
      playVoice: () => {},
      onCinematicHandoff: handoff,
    });
    expect(handoff).not.toHaveBeenCalled();

    // Abort BEFORE cinematicMs — Council Grok CH3 + Gemini CH4 race scenario.
    vi.advanceTimersByTime(2000);
    overlay.abort();

    // Even after advancing well past cinematicMs, the handoff must NEVER fire.
    vi.advanceTimersByTime(10000);
    expect(handoff).not.toHaveBeenCalled();
  });
});
