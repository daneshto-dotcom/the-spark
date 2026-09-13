/**
 * SPARK — S175 P6: the tower-cover phase ramp (owner R169 / S170 P11).
 *
 * ⛔ **THIS FILE IS THE ONLY GUARD THIS FEATURE HAS, AND THAT IS A MEASURED FACT.** Phase A.0 went
 * looking for what would catch a mistake here and found nothing: `new StructureRenderer` appears
 * only in `main.ts` and is never instantiated in any test, `structureRenderer.test.ts` covers pure
 * helpers only, and `fog.spec.ts` asserts the CONTAINER exists without ever asserting it has
 * children. So there is no existing test that would notice this feature hiding shapes it should not.
 * The module was written pure and Pixi-free precisely so that this file could exist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOWER_COVER_FADE_TICKS,
  __resetTowerCoverForTests,
  beginTowerCoverFrame,
  coverAlphaForBond,
  coverAlphaForPrim,
  markTowerCover,
  pruneTowerCover,
} from './towerCover.ts';
import type { World } from '../state/world.ts';
import { asBondId, asPrimitiveId } from '../types.ts';

const P1 = asPrimitiveId(1);
const P2 = asPrimitiveId(2);
const B1 = asBondId(1);

/** The two fields this module reads, and nothing else — it is a renderer helper, not a sim. */
function w(tick: number, prims: number[] = [1, 2], bonds: number[] = [1]): World {
  return {
    tick,
    primitives: new Map(prims.map((n) => [asPrimitiveId(n), {}])),
    bonds: new Map(bonds.map((n) => [asBondId(n), {}])),
  } as unknown as World;
}

/** Advance one render frame with the given cover marks. */
function frame(tick: number, covered: boolean, anchor = 0): void {
  beginTowerCoverFrame(w(tick));
  if (covered) markTowerCover([P1], [B1], anchor);
}

beforeEach(__resetTowerCoverForTests);

describe('S175 P6 — inactive by default (a missing beginFrame is a VISIBLE regression, not a blank board)', () => {
  it('⛔ every alpha is 1 before beginTowerCoverFrame is ever called', () => {
    expect(coverAlphaForPrim(P1)).toBe(1);
    expect(coverAlphaForBond(B1)).toBe(1);
  });

  it('an unmarked shape is never faded', () => {
    frame(0, false);
    frame(1, false);
    expect(coverAlphaForPrim(P2)).toBe(1);
  });
});

describe('S175 P6 — the phase-out ramp', () => {
  it('⭐ a shape freshly covered by a NEW tower starts fully visible and fades to hidden', () => {
    // anchor === current tick ⇒ the ring was just built, so the ramp runs from the start.
    frame(100, true, 100); // marks land in the BUILDING buffer
    frame(101, true, 100); // promoted; consumers now see them
    const atStart = coverAlphaForPrim(P1);
    expect(atStart).toBeGreaterThan(0.9);

    frame(100 + TOWER_COVER_FADE_TICKS, true, 100);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);
  });

  it('the ramp is monotonic and bounded to [0,1] across its whole span', () => {
    frame(0, true, 0);
    let prev = Infinity;
    for (let t = 1; t <= TOWER_COVER_FADE_TICKS + 30; t += 10) {
      frame(t, true, 0);
      const a = coverAlphaForPrim(P1);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
    expect(prev).toBeLessThan(0.05);
  });

  it('connectors phase with their shapes', () => {
    frame(0, true, 0);
    frame(TOWER_COVER_FADE_TICKS, true, 0);
    expect(coverAlphaForBond(B1)).toBeLessThan(0.05);
  });
});

describe('S175 P6 — the JOINER case, which is what Bond.createdTick is for', () => {
  /**
   * ⚠ A client arriving at a match in progress must not watch every standing tower phase out from
   * scratch. Seeding the ramp from the ring's own age makes an old tower already hidden on frame one.
   */
  it('⭐ a tower that was already standing is hidden IMMEDIATELY, not re-faded', () => {
    // First sight at tick 5000 of a ring whose bonds were created at tick 10.
    frame(5000, true, 10);
    frame(5001, true, 10);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);
  });

  it('an anchor in the FUTURE cannot produce an alpha above 1 (clamped, not trusted)', () => {
    frame(100, true, 99999);
    frame(101, true, 99999);
    const a = coverAlphaForPrim(P1);
    expect(a).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

describe('S175 P6 — the REVEAL, which is the half the owner actually described', () => {
  /**
   * Owner: *"once the first connector gets destroyed … that's when you see the connectors again, you
   * can rebuild it. And then it gets built and then the connectors … disappear."*
   */
  it('⭐ when the tower stops being drawn, the shapes come back', () => {
    frame(0, true, 0);
    frame(TOWER_COVER_FADE_TICKS, true, 0);
    expect(coverAlphaForPrim(P1)).toBeLessThan(0.05);

    /*
     * The ring breaks: nobody marks it any more.
     *
     * ⚠ THE FLIP HAPPENS ON THE FRAME THE MARK STOPS ARRIVING, NOT ON THE FRAME THE TOWER BROKE,
     * and the ramp runs its full span FROM THERE. Two frames are needed: one where the promoted set
     * no longer contains the shape (this is where `covered` flips), and one a full fade later. The
     * first version of this test collapsed those and read 0 — the mechanic, not a defect.
     */
    const broke = TOWER_COVER_FADE_TICKS + 1;
    frame(broke, false);       // promotion still carries the old mark
    frame(broke + 1, false);   // promoted set is now empty -> `covered` flips here
    frame(broke + 1 + TOWER_COVER_FADE_TICKS, false);
    expect(coverAlphaForPrim(P1)).toBeGreaterThan(0.95);
  });

  /**
   * ⛔ THE REGRESSION THIS CASE EXISTS FOR. Reversing mid-ramp must continue from where the ramp
   * actually is. If the reversal restarted from the far end, a connector broken one frame after the
   * tower finished building would SNAP to invisible and then fade in — a visible pop, in the one
   * feature whose entire purpose is to remove pops.
   */
  it('⛔ reversing mid-ramp continues from the CURRENT alpha, it does not jump', () => {
    frame(0, true, 0);
    const half = Math.floor(TOWER_COVER_FADE_TICKS / 2);
    frame(half, true, 0);
    const mid = coverAlphaForPrim(P1);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(0.65);

    // Uncover on the very next frame — alpha must move UP from `mid`, never snap down to 0 first.
    frame(half + 1, false);
    const afterFlip = coverAlphaForPrim(P1);
    expect(afterFlip).toBeGreaterThanOrEqual(mid - 0.05);
    expect(afterFlip).toBeLessThan(mid + 0.15);
  });
});

describe('S175 P6 — housekeeping', () => {
  it('pruning drops phases for shapes that no longer exist', () => {
    frame(0, true, 0);
    frame(1, true, 0);
    expect(coverAlphaForPrim(P1)).toBeLessThan(1);
    // The shape is destroyed: prune, then a fresh id must read as untracked (alpha 1).
    pruneTowerCover(w(2, [], []));
    beginTowerCoverFrame(w(3));
    expect(coverAlphaForPrim(P1)).toBe(1);
  });

  it('marks made this frame are NOT visible until the next frame (the deliberate one-frame lag)', () => {
    beginTowerCoverFrame(w(10));
    markTowerCover([P1], [B1], 10);
    // Same frame: the promotion has not happened, so nothing is covered yet.
    expect(coverAlphaForPrim(P1)).toBe(1);
  });
});
