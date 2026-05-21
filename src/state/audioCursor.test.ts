/**
 * SPARK — audioCursor pub/sub tests (Audit Pass 2 fix 622a7c7f).
 *
 * Verifies the state-layer publisher seam that replaces the pre-Pass-2
 * state→render direct import. Tests:
 *   1. triggerReset() is a no-op when no handler is registered (test paths
 *      that bypass audioManager.ts must not crash).
 *   2. After registerResetHandler, triggerReset invokes the handler.
 *   3. Multiple registerResetHandler calls overwrite (single-slot by design).
 *   4. _clearResetHandlerForTest restores the unregistered state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerResetHandler,
  triggerReset,
  _clearResetHandlerForTest,
} from './audioCursor.ts';

describe('Audit Pass 2 622a7c7f — audioCursor pub/sub seam', () => {
  beforeEach(() => {
    _clearResetHandlerForTest();
  });

  it('triggerReset() is a no-op when no handler is registered', () => {
    expect(() => triggerReset()).not.toThrow();
  });

  it('triggerReset() invokes the registered handler exactly once per call', () => {
    const handler = vi.fn();
    registerResetHandler(handler);
    triggerReset();
    expect(handler).toHaveBeenCalledTimes(1);
    triggerReset();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('registerResetHandler is single-slot — second registration overwrites', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerResetHandler(first);
    registerResetHandler(second);
    triggerReset();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('_clearResetHandlerForTest restores unregistered no-op state', () => {
    const handler = vi.fn();
    registerResetHandler(handler);
    _clearResetHandlerForTest();
    triggerReset();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Audit Pass 2 622a7c7f — audioManager registers at module-init', () => {
  it('importing audioManager.ts installs a non-null handler', async () => {
    _clearResetHandlerForTest();
    // Dynamic import so the registration side-effect happens here in test
    // order. After import, triggerReset() should invoke audioManager's
    // resetAudioDrainCursor, which is observable via the drain-cursor's
    // public surface (drainAudioEffects accepts a prior-drained tick).
    const audio = await import('../render/audioManager.ts');
    // Advance the cursor to tick 100.
    audio.drainAudioEffects([], 100);
    const before = audio.inspectAudioChain().claveCallsTotal;
    // An effect at tick 50 (below cursor) should be silently dropped.
    audio.drainAudioEffects(
      [{ kind: 'BOND_FORMED', tick: 50, pos: { x: 0, y: 0 }, bondCount: 1 }],
      50,
    );
    expect(audio.inspectAudioChain().claveCallsTotal).toBe(before);
    // After triggerReset (which audioManager has registered for), the cursor
    // is back to -1 and the same tick-50 effect fires.
    triggerReset();
    audio.drainAudioEffects(
      [{ kind: 'BOND_FORMED', tick: 50, pos: { x: 0, y: 0 }, bondCount: 1 }],
      50,
    );
    expect(audio.inspectAudioChain().claveCallsTotal).toBe(before + 1);
  });
});
