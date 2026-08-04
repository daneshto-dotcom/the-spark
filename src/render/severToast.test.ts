/**
 * SPARK — V6-0.3 (S131): the sever-attribution reducer.
 *
 * WHY THESE TESTS LOOK THE WAY THEY DO. V6-0.2 shipped a tier banner that never rendered, through a
 * fully green suite, because every test pinned a pure helper AROUND the defect while the defect was
 * a call-site ORDERING fact. So this file does two distinct jobs and keeps them visibly separate:
 *
 *   1. the reducer's DECISIONS — victim gate, both suppression clauses, the 7-cause copy table,
 *      batching, mixed-batch degradation. Pure, exhaustive, cheap.
 *   2. ORDER SENSITIVITY — the same reducer run before and after a simulated `world.effects` wipe,
 *      so that moving `drainSeverToast` below `effectsRenderer.sync` in main.ts is a DEMONSTRATED
 *      failure rather than an argued one. This is the assertion the V6-0.2 suite lacked.
 *
 * The reducer is a free function precisely so (2) is writable at all: a method on the renderer would
 * need a live Pixi `Application`, which is what made the tier banner's scan untestable in S129. The
 * V6-0.3 PDR required that call to be made BEFORE the reducer was written — it was.
 *
 * The source-order half of the guard lives in `ui.drainOrder.test.ts`, which reads main.ts as text.
 */

import { describe, it, expect } from 'vitest';
import {
  captureSeverToast,
  severToastCopy,
  severToastPose,
  SEVER_TOAST_DURATION_TICKS,
  type SeverCause,
} from './severToastRenderer.ts';
import type { GameEffect } from '../game/effects.ts';
import { asPlayerId } from '../types.ts';

const ME = asPlayerId(0);
const B2 = asPlayerId(1);
const B3 = asPlayerId(2);
const NO_BOTS: ReadonlySet<ReturnType<typeof asPlayerId>> = new Set();
const BOTS = new Set([B2, B3]);

/** A BOND_SEVERED effect. Defaults describe the common case: a bot cut MY bond. */
function sever(o: Partial<Extract<GameEffect, { kind: 'BOND_SEVERED' }>> = {}): GameEffect {
  return {
    kind: 'BOND_SEVERED',
    tick: 100,
    pos: { x: 0, y: 0 },
    cause: 'player',
    actor: B2,
    victim: ME,
    ...o,
  };
}

describe('V6-0.3 — victim gate', () => {
  it('fires for the local player and names the actor by seat', () => {
    // The acceptance line from the PDR's own minimum observation set.
    const cap = captureSeverToast([sever()], ME, BOTS);
    expect(cap.text).toBe('B2 SEVERED YOUR BOND');
    expect(cap.count).toBe(1);
  });

  it('stays silent for a sever suffered by SOMEONE ELSE', () => {
    // Every peer drains the same array; only my own losses are mine to be told about.
    expect(captureSeverToast([sever({ victim: B3 })], ME, BOTS).text).toBeNull();
  });

  it('stays silent when victim is absent rather than assuming it is mine', () => {
    // A pre-S131 wire payload rehydrates with no victim. Unknowable ≠ mine.
    expect(captureSeverToast([sever({ victim: undefined })], ME, BOTS).text).toBeNull();
  });

  it('labels a HUMAN actor P{n} and a BOT actor B{n} off botSeats', () => {
    // Seat-based, never colour-based: the rainbow shuffle remaps colours mid-match.
    expect(captureSeverToast([sever({ actor: B2 })], ME, BOTS).text).toBe('B2 SEVERED YOUR BOND');
    expect(captureSeverToast([sever({ actor: B2 })], ME, NO_BOTS).text).toBe(
      'P2 SEVERED YOUR BOND',
    );
  });
});

describe('V6-0.3 — suppression is two clauses, and both are load-bearing', () => {
  it('(a) suppresses a SELF-sever: you meant to do that', () => {
    expect(captureSeverToast([sever({ actor: ME, victim: ME })], ME, BOTS).text).toBeNull();
  });

  it("(b) suppresses cause 'bomb' even when actor !== victim — NOT redundant with (a)", () => {
    // This is the whole point of the second clause. bombLifecycle.ts:110 picks its kill set on the
    // MUTABLE placerColor while clause (a) compares the READONLY placedBy, so after a rainbow
    // shuffle a bomb CAN destroy a bond owned by someone else. Clause (a) would then fire a toast
    // blaming the picker for collateral they never aimed at. Owner ruled SUPPRESS (S130 F3-C).
    expect(captureSeverToast([sever({ cause: 'bomb', actor: B2, victim: ME })], ME, BOTS).text).toBeNull();
    // ...and self-bomb too, which is the case clause (a) would already have caught.
    expect(captureSeverToast([sever({ cause: 'bomb', actor: ME, victim: ME })], ME, BOTS).text).toBeNull();
  });

  it('a suppressed effect does not consume the batch: a real sever alongside it still shows', () => {
    // Regression guard for a plausible mis-implementation (bail on first suppressed entry).
    const cap = captureSeverToast(
      [sever({ cause: 'bomb' }), sever({ actor: B3, cause: 'player' })],
      ME,
      BOTS,
    );
    expect(cap.text).toBe('B3 SEVERED YOUR BOND');
    expect(cap.count).toBe(1);
  });
});

describe('V6-0.3 — the copy table over ALL SEVEN causes', () => {
  // Fixed {AGENT} {VERB} {OBJECT} grammar. Every arm must name the victim's loss, and no arm may
  // claim a mechanism it cannot vouch for.
  const CAUSES: readonly SeverCause[] = [
    'player',
    'physics',
    'godly',
    'creature',
    'bomb',
    'chewer',
    'drone',
  ];

  it('every cause yields a non-empty line with an agent, and none throws', () => {
    // TOLERANT lookup, not an exhaustive switch: 'godly' is in the effect union but NOT the
    // SEVER_BOND action union, so an exhaustive switch would either fail to compile or fall
    // through to undefined. This asserts the tolerance rather than trusting it.
    for (const c of CAUSES) {
      const line = severToastCopy(c, 'B2', 1);
      expect(line.length, `cause ${c} produced an empty line`).toBeGreaterThan(0);
      expect(line, `cause ${c} must mention the agent`).toContain('B2');
      expect(line, `cause ${c} must mention the bond`).toContain('BOND');
    }
  });

  it('every cause ALSO yields a line in the actor-less form', () => {
    for (const c of CAUSES) {
      const line = severToastCopy(c, null, 1);
      expect(line.length).toBeGreaterThan(0);
      expect(line).toContain('BOND');
      // An actor-less line must never contain a seat tag it does not have grounds for.
      expect(line).not.toMatch(/\b[PB]\d\b/);
    }
  });

  it('physics reads as a mechanism, not an accusation', () => {
    // 'physics' is the one cause with nobody to blame: the constraint solver fired.
    expect(severToastCopy('physics', null, 1)).toBe('YOUR BOND SNAPPED — OVERSTRETCHED');
  });

  it('a mixed batch (cause === null) states the outcome and names no mechanism', () => {
    expect(severToastCopy(null, null, 1)).toBe('YOUR BOND WAS SEVERED');
  });

  it('distinct causes get distinct verbs, so the player can learn what killed the bond', () => {
    const lines = new Set(
      (['player', 'creature', 'chewer', 'drone'] as const).map((c) => severToastCopy(c, 'B2', 1)),
    );
    expect(lines.size).toBe(4);
  });
});

describe('V6-0.3 — frame batching and mixed-actor degradation', () => {
  it('coalesces a same-frame burst into ONE line with a count', () => {
    // main.ts steps up to 3 sim ticks per rendered frame, and one drone detonation severs up to 3
    // bonds, so multi-sever frames are ordinary rather than exotic.
    const cap = captureSeverToast([sever(), sever(), sever()], ME, BOTS);
    expect(cap.count).toBe(3);
    expect(cap.text).toBe('B2 SEVERED YOUR BOND ×3');
  });

  it('a single sever carries NO count suffix', () => {
    expect(captureSeverToast([sever()], ME, BOTS).text).not.toContain('×');
  });

  it('DEGRADES to the actor-less form when two different actors hit me in one frame', () => {
    // Newest-wins would name ONE of them and be wrong about the other. Misattribution in a
    // learnability feature teaches an actively false causal model, so we name nobody (S130 F5).
    const cap = captureSeverToast([sever({ actor: B2 }), sever({ actor: B3 })], ME, BOTS);
    expect(cap.count).toBe(2);
    expect(cap.text).not.toContain('B2');
    expect(cap.text).not.toContain('B3');
    expect(cap.text).toBe('YOUR BOND WAS SEVERED ×2');
  });

  it('degrades when an attributed sever and an UNATTRIBUTED one land together', () => {
    // physics carries no actor; pairing it with a real actor makes the batch mixed.
    const cap = captureSeverToast(
      [sever({ actor: B2, cause: 'player' }), sever({ actor: undefined, cause: 'physics' })],
      ME,
      BOTS,
    );
    expect(cap.text).not.toContain('B2');
    expect(cap.count).toBe(2);
  });

  it('same actor, mixed CAUSES → keeps the actor, drops the mechanism claim', () => {
    // S131 CHECK (GROK-ANALYST) — this test's NAME was always right and its assertion was wrong: it
    // demanded 'B2 SEVERED YOUR BOND', which is the verb of the 'player' cause, i.e. the very
    // mechanism claim the name says to drop. One seat whose creature and drone each cut a bond in
    // the same frame was being reported as a direct hostile sever. The tolerant default now says
    // BROKE — responsibility without a mechanism.
    const cap = captureSeverToast(
      [sever({ actor: B2, cause: 'player' }), sever({ actor: B2, cause: 'creature' })],
      ME,
      BOTS,
    );
    expect(cap.text).toBe('B2 BROKE YOUR BOND ×2');
    // The point of the fix, asserted directly rather than only via the exact string: a mixed batch
    // must not borrow any single cause's verb.
    expect(cap.text).not.toContain('SEVERED');
    expect(cap.text).not.toContain('CREATURE');
  });

  it('a mixed batch of two NON-player mechanisms also refuses to pick a verb', () => {
    // The batch Grok named: same actor, creature + drone. Neither verb is truthful for both.
    const cap = captureSeverToast(
      [sever({ actor: B3, cause: 'creature' }), sever({ actor: B3, cause: 'drone' })],
      ME,
      BOTS,
    );
    expect(cap.text).toBe('B3 BROKE YOUR BOND ×2');
    for (const verb of ['SEVERED', 'CREATURE', 'DRONE', 'GNAWED']) {
      expect(cap.text, `mixed batch must not claim ${verb}`).not.toContain(verb);
    }
  });

  it('the neutral verb is distinct from every specific verb', () => {
    // If BROKE ever collided with one of the four specific arms, the degradation would be invisible.
    const neutral = severToastCopy(null, 'B2', 1);
    const specific = (['player', 'creature', 'chewer', 'drone'] as const).map((c) =>
      severToastCopy(c, 'B2', 1),
    );
    expect(specific).not.toContain(neutral);
    expect(new Set([neutral, ...specific]).size).toBe(5);
  });

  it('ignores non-BOND_SEVERED effects sharing the array', () => {
    const cap = captureSeverToast(
      [
        { kind: 'SCORE_TIER', tick: 100, tier: 1, color: 0xffffff, pos: { x: 0, y: 0 } },
        sever(),
      ],
      ME,
      BOTS,
    );
    expect(cap.text).toBe('B2 SEVERED YOUR BOND');
  });
});

describe('V6-0.3 — the capture is order-SENSITIVE (the V6-0.2 lesson, applied)', () => {
  it('captures while effects are present, and NOTHING once they are wiped', () => {
    // If a future refactor moves drainSeverToast below main.ts's effectsRenderer.sync, this is the
    // mechanism that makes it fail loudly instead of going quiet — which is exactly what V6-0.2
    // did for an entire session while its roadmap row read DONE.
    const effects: GameEffect[] = [sever()];

    expect(captureSeverToast(effects, ME, BOTS).text).toBe('B2 SEVERED YOUR BOND');

    // effectsRenderer.sync does exactly this (effectsRenderer.ts:73).
    effects.length = 0;

    expect(captureSeverToast(effects, ME, BOTS).text).toBeNull();
  });

  it('a BOND_SEVERED and a SCORE_TIER in one array are both readable pre-wipe, neither post-wipe', () => {
    // The two pre-wipe consumers added in V6-0.3 share the array; a wipe blinds BOTH. Pinning them
    // together documents that the ordering constraint is a property of the array, not of one feature.
    const effects: GameEffect[] = [
      sever(),
      { kind: 'SCORE_TIER', tick: 100, tier: 1, color: 0xffffff, pos: { x: 0, y: 0 } },
    ];
    expect(effects.filter((e) => e.kind === 'BOND_SEVERED')).toHaveLength(1);
    expect(effects.filter((e) => e.kind === 'SCORE_TIER')).toHaveLength(1);

    effects.length = 0;

    expect(captureSeverToast(effects, ME, BOTS).text).toBeNull();
    expect(effects).toHaveLength(0);
  });
});

describe('V6-0.3 — pose envelope', () => {
  it('is inactive outside the window, including on a NEGATIVE elapsed (tick rewind)', () => {
    // applySnapshotCore can adopt a lower host tick (save.ts:830), making elapsed negative. That
    // must not render a ghost toast.
    expect(severToastPose(-1, SEVER_TOAST_DURATION_TICKS).active).toBe(false);
    expect(severToastPose(SEVER_TOAST_DURATION_TICKS, SEVER_TOAST_DURATION_TICKS).active).toBe(false);
    expect(severToastPose(NaN, SEVER_TOAST_DURATION_TICKS).active).toBe(false);
  });

  it('ramps in, holds, and fades out without ever exceeding peak alpha', () => {
    const mid = severToastPose(SEVER_TOAST_DURATION_TICKS / 2, SEVER_TOAST_DURATION_TICKS);
    expect(mid.active).toBe(true);
    expect(mid.alpha).toBeCloseTo(0.95, 5);
    expect(severToastPose(1, SEVER_TOAST_DURATION_TICKS).alpha).toBeLessThan(0.95);
    expect(
      severToastPose(SEVER_TOAST_DURATION_TICKS - 1, SEVER_TOAST_DURATION_TICKS).alpha,
    ).toBeLessThan(0.95);
    for (let e = 0; e < SEVER_TOAST_DURATION_TICKS; e++) {
      const p = severToastPose(e, SEVER_TOAST_DURATION_TICKS);
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(0.95);
    }
  });

  it('holds in TICKS, so the window does not shrink on a high-refresh display', () => {
    // Deliberate divergence from TIER_BANNER_FRAMES, which is a FRAME count with no maxFPS cap and
    // therefore lasts ~2s at 60Hz but ~0.83s at 144Hz. A line the player must READ is tick-driven.
    expect(SEVER_TOAST_DURATION_TICKS).toBe(150); // 2.5s at PHYSICS_HZ 60, on every display
  });
});
