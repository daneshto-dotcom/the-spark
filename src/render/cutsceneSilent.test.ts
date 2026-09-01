/**
 * SPARK — S158 P5: **the silent cinematic still COMPLETES, which is the whole hazard.**
 *
 * S157 deferred "the Voltkin cutscene once per game" with a warning worth quoting, because this file
 * exists to hold exactly the line it drew:
 *
 *   the cutscene overlay's own `onComplete` is the SOLE driver of `GODLY_COMPLETE` and of
 *   `pendingCinematics` advancement, so simply not playing the overlay for a repeat would leave
 *   `activeCinematicPlayerId` latched forever and every subsequent Voltkin queued behind it —
 *   strictly worse than the bug being fixed.
 *
 * So a repeat takes a SILENT path through the same method rather than being skipped. The assertion
 * that matters is not "it drew nothing" — it is **"it still finished, on the same schedule"**. A test
 * that only checked the silence would pass against the latch.
 *
 * ⚠ WHY `Object.create` RATHER THAN A REAL OVERLAY. The constructor builds Pixi display objects and
 * wants an `Application`; the silent path deliberately returns before touching any of them, so the
 * two fields it does use are supplied directly. That is a real limitation and it is stated rather
 * than hidden: this pins the SCHEDULE and the SILENCE, and the visible path's rendering is out of
 * its reach.
 */

import { describe, expect, it, vi } from 'vitest';
import { CutsceneOverlay, FADE_MS, type CutsceneContext } from './cutsceneOverlay.ts';
import type { CinematicGodlyRecipe } from '../state/godlyRecipes/types.ts';

const RECIPE = {
  kind: 'cinematic',
  id: 'voltkin',
  cinematicMs: 4000,
  sustainedEffectMs: 500,
  cinematicAsset: 'nope.mp4',
  voiceAsset: 'nope.ogg',
} as unknown as CinematicGodlyRecipe;

/** The silent path uses only `active` and `timers`; nothing Pixi is reachable from it. */
function silentOnlyOverlay(): CutsceneOverlay {
  const o = Object.create(CutsceneOverlay.prototype) as CutsceneOverlay;
  (o as unknown as { active: boolean }).active = false;
  (o as unknown as { timers: unknown[] }).timers = [];
  return o;
}

function ctx(over: Partial<CutsceneContext> = {}): CutsceneContext {
  return {
    targetPos: { x: 0, y: 0 },
    onComplete: () => {},
    playVoice: () => {},
    ...over,
  } as CutsceneContext;
}

describe('S158 P5 — a silent cinematic', () => {
  it('⭐ STILL calls onComplete — without this, activeCinematicPlayerId latches forever', () => {
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      void silentOnlyOverlay().play(RECIPE, ctx({ silent: true, onComplete }));
      expect(onComplete, 'nothing should fire early').not.toHaveBeenCalled();
      vi.advanceTimersByTime(RECIPE.cinematicMs + RECIPE.sustainedEffectMs + FADE_MS);
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('⭐ on the SAME schedule as a visible one — the creature spawn is timed against it', () => {
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      void silentOnlyOverlay().play(RECIPE, ctx({ silent: true, onComplete }));
      // One millisecond short: `pendingCreatureSpawn.fireAtTick` is computed from this same
      // duration, so a silent run that finished early or late would show the Voltkin appearing
      // before or after its own cinematic ended.
      vi.advanceTimersByTime(RECIPE.cinematicMs + RECIPE.sustainedEffectMs + FADE_MS - 1);
      expect(onComplete).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays no voice clip', () => {
    vi.useFakeTimers();
    try {
      const playVoice = vi.fn();
      void silentOnlyOverlay().play(RECIPE, ctx({ silent: true, playVoice }));
      vi.advanceTimersByTime(60_000);
      expect(playVoice).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('⭐ needs no DOM AT ALL — which is the proof it builds no video element', () => {
    // These tests run in vitest's default `node` environment, where `document` does not exist. The
    // visible path's very next statement after the silent branch is `document.createElement('video')`,
    // so a silent run finishing here is direct evidence that no video element, no decode and no
    // texture upload happen on a repeat.
    expect(typeof document, 'the premise of this test').toBe('undefined');
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      void silentOnlyOverlay().play(RECIPE, ctx({ silent: true, onComplete }));
      vi.advanceTimersByTime(RECIPE.cinematicMs + RECIPE.sustainedEffectMs + FADE_MS);
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases its active latch when it completes, so the next cinematic is not "concurrent"', () => {
    vi.useFakeTimers();
    try {
      const o = silentOnlyOverlay();
      void o.play(RECIPE, ctx({ silent: true }));
      expect(o.isActive()).toBe(true);
      vi.advanceTimersByTime(RECIPE.cinematicMs + RECIPE.sustainedEffectMs + FADE_MS);
      expect(o.isActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CONTROL — `silent: false` does NOT take this path (it reaches Pixi/DOM and rejects)', async () => {
    // The control that keeps every assertion above honest: if the silent branch were unreachable —
    // a stale flag name, an inverted condition — these tests would pass by taking the visible path
    // and proving nothing. On this bare prototype the visible path touches `this.container`, so it
    // rejects, and that rejection IS the evidence that the branch above is the one being exercised.
    // (`play` is async, so the failure surfaces as a rejected promise, not a synchronous throw.)
    await expect(silentOnlyOverlay().play(RECIPE, ctx({ silent: false }))).rejects.toThrow();
  });
});
