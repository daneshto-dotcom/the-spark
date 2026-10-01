/**
 * S191 C-2 (WRATH-F5) — the arithmetic of `pendingRecordAnchor`. The REACH test (real Controls, real
 * footer, real aim preview, real snapshot apply) is `input/controls.raPendingTickBack.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { pendingRecordAnchor } from './pendingRecordClock.ts';
import { RA_PENDING_TIMEOUT_TICKS } from './raAimPreview.ts';

const W = RA_PENDING_TIMEOUT_TICKS;

describe('S191 C-2 — pendingRecordAnchor', () => {
  it('forward: the send tick is kept through the whole window, inclusive, then the record expires', () => {
    expect(pendingRecordAnchor(1000, 1000, W)).toBe(1000);
    expect(pendingRecordAnchor(1000 + W, 1000, W)).toBe(1000);
    expect(pendingRecordAnchor(1000 + W + 1, 1000, W)).toBeNull();
  });

  it('⛔ backward: a clock below the send tick RE-ANCHORS at the adopted tick — never null', () => {
    expect(pendingRecordAnchor(998, 1000, W)).toBe(998);
    expect(pendingRecordAnchor(1, 1000, W)).toBe(1);
    // …and the window then restarts there: one full window more, then expiry.
    expect(pendingRecordAnchor(998 + W, 998, W)).toBe(998);
    expect(pendingRecordAnchor(998 + W + 1, 998, W)).toBeNull();
  });

  it('the rule is the window it is given — a zero window keeps only the send tick itself', () => {
    expect(pendingRecordAnchor(50, 50, 0)).toBe(50);
    expect(pendingRecordAnchor(51, 50, 0)).toBeNull();
    expect(pendingRecordAnchor(49, 50, 0)).toBe(49);
  });
});
