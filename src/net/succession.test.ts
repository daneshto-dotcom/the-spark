/**
 * SPARK — S118 P1 (host-migration D2): pure successor computation + snapshot-starvation predicate tests.
 *
 * computeSuccessorSeat is the deterministic "who takes over" rule (lowest warranted AND alive seat),
 * incl. the MIXED-BUILD case (GEMINI FIX 2 — an alive seat absent from the warrant is never chosen) and
 * the no-survivor case (null → match genuinely ends). isSnapshotStarved is the host-silence predicate.
 * Both are pure — no crypto, no wall clock; the caller supplies the timestamps + alive set.
 */

import { describe, expect, it } from 'vitest';
import { computeSuccessorSeat, isSnapshotStarved, HOST_STARVATION_MS } from './succession.ts';
import type { SuccessionWarrant } from './successionWarrant.ts';

// computeSuccessorSeat only reads warrant.seats[].seat — a literal warrant (no real signature) suffices.
const warrant = (seats: number[]): SuccessionWarrant => ({
  epoch: 0,
  seats: seats.map((seat) => ({ seat, spkiB64: `pk-${seat}` })),
  sigB64: 'unused-by-successor-calc',
});

describe('S118 P1 — host-migration D2: computeSuccessorSeat', () => {
  it('picks the LOWEST warranted seat that is alive', () => {
    expect(computeSuccessorSeat(warrant([1, 2, 3]), new Set([2, 3]))).toBe(2);
    expect(computeSuccessorSeat(warrant([1, 2, 3]), new Set([1, 2, 3]))).toBe(1);
    expect(computeSuccessorSeat(warrant([3, 1, 2]), new Set([2, 3]))).toBe(2); // warrant order irrelevant
  });

  it('is deterministic + order-independent (warrant seat order cannot change the result)', () => {
    const a = computeSuccessorSeat(warrant([1, 2, 3, 4]), new Set([3, 4]));
    const b = computeSuccessorSeat(warrant([4, 3, 2, 1]), new Set([4, 3]));
    expect(a).toBe(3);
    expect(b).toBe(3);
  });

  it('MIXED-BUILD (GEMINI FIX 2): an alive seat NOT in the warrant is never chosen', () => {
    // Seat 1 is alive but was never warranted (its peer never proved a pubkey) → seat 2 succeeds.
    expect(computeSuccessorSeat(warrant([2, 3]), new Set([1, 2, 3]))).toBe(2);
    // Only the un-warranted seat is alive → no legitimate successor.
    expect(computeSuccessorSeat(warrant([2, 3]), new Set([1]))).toBeNull();
  });

  it('returns null when NO warranted seat survives (match genuinely ends)', () => {
    expect(computeSuccessorSeat(warrant([1, 2]), new Set([]))).toBeNull();
    expect(computeSuccessorSeat(warrant([1, 2]), new Set([5, 6]))).toBeNull();
    expect(computeSuccessorSeat(warrant([]), new Set([1, 2]))).toBeNull(); // empty warrant
  });
});

describe('S118 P1 — host-migration D2: isSnapshotStarved', () => {
  it('true only once the gap reaches the threshold (>=, inclusive boundary)', () => {
    expect(isSnapshotStarved(10_000, 3_000, HOST_STARVATION_MS)).toBe(true); // 7000 >= 6000
    expect(isSnapshotStarved(9_000, 3_000, HOST_STARVATION_MS)).toBe(true); // 6000 >= 6000 (inclusive)
    expect(isSnapshotStarved(8_999, 3_000, HOST_STARVATION_MS)).toBe(false); // 5999 < 6000
    expect(isSnapshotStarved(9_000, 3_000, 6_000)).toBe(true); // explicit boundary
    expect(isSnapshotStarved(8_999, 3_000, 6_000)).toBe(false);
  });

  it('a fresh gap (now ≈ last) is never starved', () => {
    expect(isSnapshotStarved(5_000, 5_000, HOST_STARVATION_MS)).toBe(false);
    expect(isSnapshotStarved(5_100, 5_000, HOST_STARVATION_MS)).toBe(false);
  });

  it('HOST_STARVATION_MS is a sane multi-second window (well past 100ms snapshot jitter)', () => {
    expect(HOST_STARVATION_MS).toBeGreaterThanOrEqual(3_000);
  });
});
