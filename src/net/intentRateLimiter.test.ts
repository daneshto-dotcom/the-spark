/**
 * SPARK — S125 P2 (F9): per-peer INTENT token-bucket unit tests.
 *
 * Pins the bucket arithmetic (burst, continuous refill, cap), per-peer isolation, lifecycle
 * (forget/reset), the non-monotonic-clock guard, and the two load claims the PDR rests on:
 *   • a legit-paced stream at ≤ refill rate passes indefinitely (no false throttle), and
 *   • a flood is dropped after the initial burst, then held to the refill rate;
 *   • the SHIPPED 90/40 sizing absorbs a worst-case tab-unfreeze burst without starving actions.
 */

import { describe, expect, it } from 'vitest';
import { IntentRateLimiter } from './intentRateLimiter.ts';
import { INTENT_BUCKET_CAPACITY, INTENT_BUCKET_REFILL_PER_SEC } from '../constants.ts';

describe('S125 P2 (F9) — IntentRateLimiter bucket arithmetic', () => {
  it('a never-seen peer starts FULL: the first `capacity` intents pass, the next is dropped', () => {
    const rl = new IntentRateLimiter(5, 10);
    for (let i = 0; i < 5; i++) expect(rl.tryConsume('p', 1000)).toBe(true); // no time advance
    expect(rl.tryConsume('p', 1000)).toBe(false); // bucket empty at t=1000
  });

  it('refills continuously at refillPerSec (10/s → 1 token per 100ms)', () => {
    const rl = new IntentRateLimiter(5, 10);
    for (let i = 0; i < 5; i++) rl.tryConsume('p', 0); // drain
    expect(rl.tryConsume('p', 0)).toBe(false);
    expect(rl.tryConsume('p', 99)).toBe(false); // <100ms → still <1 token
    expect(rl.tryConsume('p', 100)).toBe(true); // exactly 1 token refilled
    expect(rl.tryConsume('p', 100)).toBe(false); // spent it
    expect(rl.tryConsume('p', 350)).toBe(true); // +250ms → 2.5 tokens, spend 1
  });

  it('refill is capped at capacity (a long idle does not over-fill)', () => {
    const rl = new IntentRateLimiter(5, 10);
    rl.tryConsume('p', 0); // seed the bucket (starts full=5, now 4)
    // Idle 100s → would be +1000 tokens uncapped; must cap at 5.
    for (let i = 0; i < 5; i++) expect(rl.tryConsume('p', 100_000)).toBe(true);
    expect(rl.tryConsume('p', 100_000)).toBe(false); // only 5, not 6+
  });

  it('is per-peer isolated: draining one peer does not affect another', () => {
    const rl = new IntentRateLimiter(3, 10);
    for (let i = 0; i < 3; i++) rl.tryConsume('a', 0);
    expect(rl.tryConsume('a', 0)).toBe(false); // a drained
    expect(rl.tryConsume('b', 0)).toBe(true); // b untouched, starts full
  });

  it('a non-monotonic (backwards) clock never refills or throws', () => {
    const rl = new IntentRateLimiter(2, 10);
    expect(rl.tryConsume('p', 1000)).toBe(true);
    expect(rl.tryConsume('p', 1000)).toBe(true); // now empty
    expect(rl.tryConsume('p', 500)).toBe(false); // clock went backwards → no phantom refill
  });
});

describe('S125 P2 (F9) — lifecycle: forget / reset', () => {
  it('forget(peer) drops the bucket so a re-add starts full again', () => {
    const rl = new IntentRateLimiter(2, 1);
    rl.tryConsume('p', 0);
    rl.tryConsume('p', 0);
    expect(rl.tryConsume('p', 0)).toBe(false); // drained
    rl.forget('p');
    expect(rl.size()).toBe(0);
    expect(rl.tryConsume('p', 0)).toBe(true); // fresh full bucket
  });

  it('reset() wipes every peer bucket', () => {
    const rl = new IntentRateLimiter(1, 1);
    rl.tryConsume('a', 0);
    rl.tryConsume('b', 0);
    expect(rl.size()).toBe(2);
    rl.reset();
    expect(rl.size()).toBe(0);
    expect(rl.tryConsume('a', 0)).toBe(true); // full again
  });
});

describe('S125 P2 (F9) — load behavior (the PDR claims)', () => {
  it('a legit-paced stream at the refill rate passes indefinitely (no false throttle)', () => {
    const rl = new IntentRateLimiter(90, 40); // shipped sizing
    // 40 intents/sec = one every 25ms, sustained for 5s (200 intents): all pass.
    let passed = 0;
    for (let i = 0; i < 200; i++) {
      if (rl.tryConsume('legit', i * 25)) passed++;
    }
    expect(passed).toBe(200);
  });

  it('a flood is dropped after the burst, then held to ~refillPerSec', () => {
    const rl = new IntentRateLimiter(90, 40);
    // A modified client fires 1000 intents in a 1s window (every 1ms).
    let passed = 0;
    for (let i = 0; i < 1000; i++) {
      if (rl.tryConsume('flood', i)) passed++; // nowMs = i ms
    }
    // Burst 90 + ~1s of refill at 40/s ≈ 90 + 40 = ~130, far below 1000 → most dropped.
    expect(passed).toBeGreaterThanOrEqual(90);
    expect(passed).toBeLessThanOrEqual(140);
  });

  it('shipped 90/40 absorbs a worst-case tab-unfreeze burst without starving actions', () => {
    // Avatar-pos is 10Hz SENDER-throttled: a 3s freeze buffers ~30 pos + say 8 real actions = 38
    // intents delivered in one tick. Capacity 90 must pass ALL of them (no dropped placement).
    const rl = new IntentRateLimiter(INTENT_BUCKET_CAPACITY, INTENT_BUCKET_REFILL_PER_SEC);
    let passed = 0;
    for (let i = 0; i < 38; i++) {
      if (rl.tryConsume('unfroze', 5000)) passed++; // all at the same post-thaw instant
    }
    expect(passed).toBe(38);
  });
});
