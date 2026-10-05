/**
 * SPARK — ⭐ S191: WHAT THE STAT BOARD COSTS ON THE WIRE, MEASURED (Council item, S191).
 *
 * A heavy late match: four seats, eight unit types built and killed each with five-digit damage totals, and
 * thirty waves of history. The numbers are PRINTED (so the progress file records a measurement, not a
 * guess) and BOUNDED (so a later change that bloats the block goes red instead of quietly riding 10 Hz).
 */
import { describe, expect, it } from 'vitest';
import { HISTORY_WINDOW_TICKS } from './matchStats.ts';
// ⭐ S195 carry-forward — the fixture is SHARED with `canon.test.ts`, which pins the figures canon §9e prints.
import { heavyMatch, wireBytes as bytes } from './matchStats.wire.fixtures.ts';
import { netSnapshot, snapshot } from './save.ts';

describe('S191 — the stat board on the wire, measured', () => {
  it('the running totals ride every snapshot cheaply; the history rides only its window', () => {
    const w = heavyMatch();
    w.tick += HISTORY_WINDOW_TICKS; // outside the window
    const totals = bytes(netSnapshot(w).matchStats);
    w.tick -= 1; // inside it
    const withHistory = bytes(netSnapshot(w).matchStats);
    const full = bytes(snapshot(w).matchStats);
    console.log(`[S191 wire] totals-only ${totals} B · in-window ${withHistory} B · full ${full} B (4 seats, 8 types, 30 waves)`);
    // ⭐ S194 v2 re-pin (measured, this test): S191 was totals 1,527 B / in-window 6,765 B; the v2 counters
    // (units lost per type, who-hit-whom, keep/structure split, four running totals per wave point as one
    // compact array) measure totals 2,503 B / in-window 11,101 B. Named per-point keys measured 13,697 B,
    // which is why the wire form packs them as `v`. In-window rides ~2 s a wave + POSTGAME only.
    expect(totals).toBeLessThan(3 * 1024);
    expect(withHistory).toBeLessThan(12 * 1024);
    expect(withHistory).toBe(full);
    expect(totals).toBeLessThan(withHistory);
  });

  it('⭐ S194 (audit LOW-2) — a 60-wave match: the history still rides only its window, and stays bounded', () => {
    const w = heavyMatch(60);
    w.tick += HISTORY_WINDOW_TICKS;
    const totals = bytes(netSnapshot(w).matchStats);
    w.tick -= 1;
    const withHistory = bytes(netSnapshot(w).matchStats);
    console.log(`[S194 wire] 60 waves: totals-only ${totals} B · in-window ${withHistory} B`);
    expect(totals).toBeLessThan(3 * 1024); // the running totals do not grow with the wave count
    expect(withHistory).toBeLessThan(22 * 1024); // measured 19,741 B (S194); ~145 B per extra wave
  });
});
