/**
 * SPARK — controls input-decision coverage (S55 P3 foundation suite).
 *
 * vitest runs in node (no DOM / Pixi Application), so the Controls class itself
 * (which binds canvas + window event listeners in its constructor) cannot be
 * instantiated here. Following the codebase's S10 #test-via-pure-helper-export
 * pattern, S55 P3 extracted the input *decision* logic into pure functions —
 * decideKeyShrink (Q-key SHRINK_TERRITORY guard, post-S49 Sym F), computeReleaseGates
 * (LMB-up placement gating incl. the S45/S49 client bypass), and exported the
 * existing distToSegment (RMB bond hit-test) + computeStiffnessTier + stepAttractLerp
 * — so the decisions are verifiable without a live Pixi/DOM environment. The live
 * handlers (onKeyDown / onUp) delegate to these; the e2e Sym specs exercise the
 * wired handlers end-to-end as the integration backstop.
 */

import { describe, expect, it } from 'vitest';
import {
  decideKeyShrink,
  computeReleaseGates,
  distToSegment,
  computeStiffnessTier,
  stepAttractLerp,
} from './controls.ts';
import { ALL_SPARK_TYPES } from '../constants.ts';
import { lookupCombo } from '../combos.ts';
import type { Primitive } from '../game/primitive.ts';

describe('decideKeyShrink — Q-key SHRINK_TERRITORY guard (S49 Sym F)', () => {
  // A baseline that passes every guard; each test overrides one field.
  const ok = {
    key: 'q',
    focusedTag: undefined as string | undefined,
    gameMode: '1v1',
    gameState: 'PLAYING',
    disruptionCharges: 1 as number | undefined,
  };

  it("dispatches on 'q' when all guards pass", () => {
    expect(decideKeyShrink(ok)).toBe(true);
  });

  it("dispatches on uppercase 'Q' too", () => {
    expect(decideKeyShrink({ ...ok, key: 'Q' })).toBe(true);
  });

  it('ignores any non-Q key', () => {
    expect(decideKeyShrink({ ...ok, key: 'a' })).toBe(false);
    expect(decideKeyShrink({ ...ok, key: 'Enter' })).toBe(false);
    expect(decideKeyShrink({ ...ok, key: ' ' })).toBe(false);
  });

  it('does not fire while typing in an INPUT or TEXTAREA (lobby code field)', () => {
    expect(decideKeyShrink({ ...ok, focusedTag: 'INPUT' })).toBe(false);
    expect(decideKeyShrink({ ...ok, focusedTag: 'TEXTAREA' })).toBe(false);
  });

  it('fires when focus is elsewhere (e.g. BODY / CANVAS / no focus)', () => {
    expect(decideKeyShrink({ ...ok, focusedTag: 'BODY' })).toBe(true);
    expect(decideKeyShrink({ ...ok, focusedTag: 'CANVAS' })).toBe(true);
    expect(decideKeyShrink({ ...ok, focusedTag: undefined })).toBe(true);
  });

  it('only fires in 1v1 mode (no charge drain in solo)', () => {
    expect(decideKeyShrink({ ...ok, gameMode: 'solo' })).toBe(false);
  });

  it('only fires in PLAYING state (not LOBBY / WIN / TITLE / POSTGAME)', () => {
    expect(decideKeyShrink({ ...ok, gameState: 'LOBBY' })).toBe(false);
    expect(decideKeyShrink({ ...ok, gameState: 'WIN' })).toBe(false);
    expect(decideKeyShrink({ ...ok, gameState: 'TITLE' })).toBe(false);
    expect(decideKeyShrink({ ...ok, gameState: 'POSTGAME' })).toBe(false);
  });

  it('requires at least one disruption charge', () => {
    expect(decideKeyShrink({ ...ok, disruptionCharges: 0 })).toBe(false);
    expect(decideKeyShrink({ ...ok, disruptionCharges: 1 })).toBe(true);
    expect(decideKeyShrink({ ...ok, disruptionCharges: 2 })).toBe(true);
  });

  it('does not fire when the acting player is absent (undefined charges)', () => {
    expect(decideKeyShrink({ ...ok, disruptionCharges: undefined })).toBe(false);
  });
});

describe('computeReleaseGates — LMB-up placement gating (S45 Sym A / S49 Sym F)', () => {
  const REACH_SQ = 120 * 120; // MAX_RELEASE_REACH² (the live caller passes this)

  describe('host / solo (gates enforced)', () => {
    it('commits when reachable, outside zone, outside territory', () => {
      const g = computeReleaseGates({
        isClient: false,
        reachDistSq: 50 * 50,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: false,
        hostInTerritory: false,
      });
      expect(g).toEqual({ reachable: true, inZone: false, inTerritory: false, commit: true });
    });

    it('rejects when the spark has not caught up to the cursor (reach gate)', () => {
      const g = computeReleaseGates({
        isClient: false,
        reachDistSq: 200 * 200,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: false,
        hostInTerritory: false,
      });
      expect(g.reachable).toBe(false);
      expect(g.commit).toBe(false);
    });

    it('treats exactly-at-max-reach as reachable (<=)', () => {
      const g = computeReleaseGates({
        isClient: false,
        reachDistSq: REACH_SQ,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: false,
        hostInTerritory: false,
      });
      expect(g.reachable).toBe(true);
      expect(g.commit).toBe(true);
    });

    it('rejects a release inside the spawner zone', () => {
      const g = computeReleaseGates({
        isClient: false,
        reachDistSq: 0,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: true,
        hostInTerritory: false,
      });
      expect(g.inZone).toBe(true);
      expect(g.commit).toBe(false);
    });

    it('rejects a release inside enemy territory', () => {
      const g = computeReleaseGates({
        isClient: false,
        reachDistSq: 0,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: false,
        hostInTerritory: true,
      });
      expect(g.inTerritory).toBe(true);
      expect(g.commit).toBe(false);
    });
  });

  describe('client / joiner (S45+S49 bypass — host re-validates authoritatively)', () => {
    it('is reachable regardless of distance (bypasses the local reach gate)', () => {
      const g = computeReleaseGates({
        isClient: true,
        reachDistSq: 9_999_999,
        maxReleaseReachSq: REACH_SQ,
        hostInZone: false,
        hostInTerritory: false,
      });
      expect(g.reachable).toBe(true);
      expect(g.commit).toBe(true);
    });

    it('ignores host-side zone / territory inputs (always false in client mode)', () => {
      const g = computeReleaseGates({
        isClient: true,
        reachDistSq: 0,
        maxReleaseReachSq: REACH_SQ,
        // Even if the (irrelevant, never-probed-in-prod) host values were true,
        // the client bypass forces them false so the host's hard block decides.
        hostInZone: true,
        hostInTerritory: true,
      });
      expect(g.inZone).toBe(false);
      expect(g.inTerritory).toBe(false);
      expect(g.commit).toBe(true);
    });
  });
});

describe('distToSegment — RMB bond hit-test geometry', () => {
  it('is ~0 for a point lying on the segment', () => {
    expect(distToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('is 0 at either endpoint', () => {
    expect(distToSegment(0, 0, 0, 0, 10, 0)).toBeCloseTo(0);
    expect(distToSegment(10, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('returns the perpendicular distance for an interior projection', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('clamps to endpoint A when the projection falls before the start', () => {
    expect(distToSegment(-5, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('clamps to endpoint B when the projection falls past the end', () => {
    expect(distToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('handles a degenerate zero-length segment (point-to-point distance)', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe('computeStiffnessTier — combo-driven bond stiffness', () => {
  it('defaults to MID for an anchor placement (no target)', () => {
    expect(computeStiffnessTier(ALL_SPARK_TYPES[0], null)).toBe('MID');
  });

  it('delegates to the combo table when a target is present', () => {
    // computeStiffnessTier reads only target.type; a minimal stand-in suffices
    // (the cast is test-only — the full Primitive shape is irrelevant here).
    for (const a of ALL_SPARK_TYPES) {
      for (const b of ALL_SPARK_TYPES) {
        const target = { type: b } as unknown as Primitive;
        expect(computeStiffnessTier(a, target)).toBe(lookupCombo(a, b).stiffnessTier);
      }
    }
  });
});

describe('stepAttractLerp — AttractDrag position follow (S10 P1)', () => {
  it('lerps pos toward the cursor by rate and stores the old pos in prevPos', () => {
    const pos = { x: 0, y: 0 };
    const prevPos = { x: 9, y: 9 };
    stepAttractLerp(pos, prevPos, { x: 10, y: 20 }, 0.5);
    expect(pos).toEqual({ x: 5, y: 10 });
    expect(prevPos).toEqual({ x: 0, y: 0 }); // old pos, so residual velocity = lerp delta
  });

  it('is a no-op at rate 0 (pos unchanged; prevPos snaps to current pos)', () => {
    const pos = { x: 4, y: 7 };
    const prevPos = { x: 1, y: 1 };
    stepAttractLerp(pos, prevPos, { x: 100, y: 100 }, 0);
    expect(pos).toEqual({ x: 4, y: 7 });
    expect(prevPos).toEqual({ x: 4, y: 7 });
  });

  it('reaches the cursor exactly at rate 1', () => {
    const pos = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    stepAttractLerp(pos, prevPos, { x: 30, y: -10 }, 1);
    expect(pos).toEqual({ x: 30, y: -10 });
  });
});
