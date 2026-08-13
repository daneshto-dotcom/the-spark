/**
 * SPARK — S143 P1: THE SIM-WORKER BATCH WATCHDOG.
 *
 * Before this, `failed` was set ONLY by an explicit error event (`onerror` / `INIT_FAILED`).
 * A worker that stopped responding WITHOUT throwing left `inFlight` latched true forever, so
 * `pump` early-returned on every later frame while `failed` stayed false and `isReady` stayed
 * true — main.ts kept treating the render mirror as authoritative and the game froze solid,
 * permanently, reporting nothing. The direct-sim fallback main.ts already implements could
 * never fire, because the only thing that arms it is the flag a silent hang cannot set.
 *
 * The class itself cannot be constructed under vitest (it news a real `Worker` in its
 * constructor and there is none in this environment), so the RULE is a pure exported function
 * and that is what is pinned here — the same posture the repo already uses for the HUD drain
 * helpers, whose draw path is likewise undrivable headlessly.
 */
import { describe, expect, it } from 'vitest';
import { WORKER_BATCH_DEADLINE_MS, batchDeadlineExceeded } from './simWorkerDriver.ts';

describe('S143 P1 — batchDeadlineExceeded', () => {
  it('never trips when no batch is in flight', () => {
    // An idle driver has a stale `inFlightSinceMs`, so without this guard every idle frame
    // after the first 10 s would condemn a perfectly healthy worker.
    expect(batchDeadlineExceeded(false, 0, 1_000_000)).toBe(false);
    expect(batchDeadlineExceeded(false, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('does not trip on a batch that is merely in flight', () => {
    expect(batchDeadlineExceeded(true, 1_000, 1_000)).toBe(false);
    expect(batchDeadlineExceeded(true, 1_000, 1_500)).toBe(false);
  });

  it('trips once the in-flight batch outlives the deadline', () => {
    const t0 = 5_000;
    expect(batchDeadlineExceeded(true, t0, t0 + WORKER_BATCH_DEADLINE_MS + 1)).toBe(true);
    expect(batchDeadlineExceeded(true, t0, t0 + WORKER_BATCH_DEADLINE_MS * 10)).toBe(true);
  });

  it('is strictly greater-than at the boundary', () => {
    // Exactly at the deadline is NOT a hang. Chosen so a test may pass deadlineMs = 0 and still
    // require genuine elapsed time, rather than tripping on a zero-duration frame.
    const t0 = 0;
    expect(batchDeadlineExceeded(true, t0, t0 + WORKER_BATCH_DEADLINE_MS)).toBe(false);
    expect(batchDeadlineExceeded(true, t0, t0 + WORKER_BATCH_DEADLINE_MS + 1)).toBe(true);
    expect(batchDeadlineExceeded(true, 0, 0, 0)).toBe(false);
    expect(batchDeadlineExceeded(true, 0, 1, 0)).toBe(true);
  });

  it('honours an injected deadline', () => {
    expect(batchDeadlineExceeded(true, 0, 50, 100)).toBe(false);
    expect(batchDeadlineExceeded(true, 0, 150, 100)).toBe(true);
  });

  describe('the deadline VALUE is a safety property, not a tuning knob', () => {
    it('sits orders of magnitude above any real batch cost', () => {
      // A batch is at most MAX_CARRIED_TICKS (10) fixed steps. S127 measured whole bots FRAMES
      // at ~11/s on the 2-core SwiftShader CI runner — i.e. ~91 ms per frame, worst observed
      // hardware. The deadline must stay far above that, because a watchdog that false-positives
      // is strictly worse than none: it would evict players from the worker path for being on
      // modest hardware, the exact population the worker exists to help.
      const worstObservedFrameMs = 91;
      expect(WORKER_BATCH_DEADLINE_MS).toBeGreaterThan(worstObservedFrameMs * 100);
    });

    it('a slow-but-alive runner is never condemned', () => {
      // 100 consecutive worst-case CI frames still fit inside the deadline.
      const t0 = 0;
      expect(batchDeadlineExceeded(true, t0, t0 + 91 * 100)).toBe(false);
    });

    it('a genuine permanent hang IS condemned within a bounded time', () => {
      // The property that matters for the flip: the freeze cannot be indefinite.
      const t0 = 0;
      expect(batchDeadlineExceeded(true, t0, t0 + 60_000)).toBe(true);
    });
  });
});
