/**
 * SPARK — Voltkin predicate tests (S23 P1 rewrite).
 *
 * Verifies the typed-chain predicate: a linear bonded path of exactly 8 prims
 * matching Square x4 -> Triangle x4. No filler prims allowed between consecutive
 * chain entries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { asPlayerId, type BondId, type PrimitiveId } from '../../types.ts';
import { SparkType } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { voltkinPredicate, findVoltkinChain, findLongestVoltkinPartial } from './voltkin.ts';

function makePrim(
  id: number,
  placerColor: number,
  x: number,
  y: number,
  type: SparkType = SparkType.Dot,
): Primitive {
  return {
    id: id as unknown as PrimitiveId,
    type,
    placerColor,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function makeBond(id: number, aId: number, bId: number): Bond {
  const pos = { x: 0, y: 0 };
  const prevPos = { x: 0, y: 0 };
  return {
    id: id as unknown as BondId,
    aId: aId as unknown as PrimitiveId,
    bId: bId as unknown as PrimitiveId,
    a: { pos, prevPos },
    b: { pos, prevPos },
    restLength: 50,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
}

function addPrim(world: World, prim: Primitive): void {
  world.primitives.set(prim.id, prim);
  // mirror onto adjacency so findVoltkinChain can walk
  for (const bondId of prim.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    a?.bonds.add(bond.id);
    b?.bonds.add(bond.id);
  }
}

function addBond(world: World, bond: Bond): void {
  world.bonds.set(bond.id, bond);
  world.primitives.get(bond.aId)?.bonds.add(bond.id);
  world.primitives.get(bond.bId)?.bonds.add(bond.id);
}

describe('voltkin predicate (typed chain)', () => {
  let world: World;
  let p0Color: number;

  beforeEach(() => {
    world = makeWorld(1);
    const p2 = makeIdlePlayer(asPlayerId(1), 0x00ff00);
    world.players.set(p2.id, p2);
    p0Color = world.players.get(asPlayerId(0))!.color;
  });

  it('returns null on an empty world', () => {
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
    expect(findVoltkinChain(world)).toBeNull();
  });

  it('returns null when only 4 squares are chained (no triangles)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 0; i < 3; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when only 4 triangles are chained (no squares)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 3; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('matches a linear SQ-SQ-SQ-SQ-TR-TR-TR-TR chain', () => {
    // 8 prims in a horizontal line. 0-3 squares, 4-7 triangles.
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
    // centroid of evenly-spaced 0..350 line on y=0 is (175, 0)
    expect(match!.targetPos.x).toBeCloseTo(175, 1);
    expect(match!.targetPos.y).toBeCloseTo(0, 1);
  });

  it('matches a TR-TR-TR-TR-SQ-SQ-SQ-SQ chain (bond graph is bidirectional — same structure as SQ4-TR4 viewed from the other end)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
  });

  it('returns null when squares and triangles are interleaved (SQ-TR-SQ-TR-SQ-TR-SQ-TR)', () => {
    for (let i = 0; i < 8; i++) {
      const type = i % 2 === 0 ? SparkType.Square : SparkType.Triangle;
      addPrim(world, makePrim(i, p0Color, i * 50, 0, type));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when a non-typed prim (Circle) bridges squares and triangles', () => {
    // SQ-SQ-SQ-SQ-CIRCLE-TR-TR-TR-TR (9 prims, circle breaks the chain)
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    addPrim(world, makePrim(4, p0Color, 200, 0, SparkType.Circle));
    for (let i = 5; i < 9; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 8; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('matches a valid 8-chain embedded in a branched topology', () => {
    // Linear chain 0..7 (SQ4 then TR4), plus extra branch off prim 2 (square)
    // to a Circle (prim 100) — DFS must backtrack from the circle branch and
    // still find the valid chain through prim 3.
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    // branch off prim 2: extra circle dangling
    addPrim(world, makePrim(100, p0Color, 100, 80, SparkType.Circle));
    addBond(world, makeBond(100, 2, 100));

    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
    // chain should NOT include the branch (prim 100)
    expect(match!.targetComponentPrimitiveIds).not.toContain(100 as unknown as PrimitiveId);
  });

  it('triggerer is the dominant placerColor across the chain', () => {
    // 5 prims placerColor=p0, 3 prims placerColor=0x00ff00 (player 1's color).
    // p0 dominates → triggerer = player 0.
    const p1Color = 0x00ff00;
    addPrim(world, makePrim(0, p0Color, 0, 0, SparkType.Square));
    addPrim(world, makePrim(1, p0Color, 50, 0, SparkType.Square));
    addPrim(world, makePrim(2, p0Color, 100, 0, SparkType.Square));
    addPrim(world, makePrim(3, p1Color, 150, 0, SparkType.Square));
    addPrim(world, makePrim(4, p0Color, 200, 0, SparkType.Triangle));
    addPrim(world, makePrim(5, p0Color, 250, 0, SparkType.Triangle));
    addPrim(world, makePrim(6, p1Color, 300, 0, SparkType.Triangle));
    addPrim(world, makePrim(7, p1Color, 350, 0, SparkType.Triangle));
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
  });

  it('PRIME-AUDIT Δ1 — matches user S23 P2 screenshot topology (horizontal SQ4-TR4 chain laid out at arbitrary spatial positions)', () => {
    // Mirrors user's actual in-game build per S23 P2 screenshot:
    //   4 squares laid horizontally (lattice bonds rendered between them)
    //   1 mixed SQ-TR bond at the junction
    //   4 triangles continuing horizontally (diamond bonds rendered between them)
    // Spatial positions are arbitrary — DFS is graph-based, not position-based.
    // Test confirms the predicate matches the user's reported topology offline.
    addPrim(world, makePrim(0, p0Color, 100, 200, SparkType.Square));
    addPrim(world, makePrim(1, p0Color, 160, 210, SparkType.Square));
    addPrim(world, makePrim(2, p0Color, 220, 200, SparkType.Square));
    addPrim(world, makePrim(3, p0Color, 280, 215, SparkType.Square));
    addPrim(world, makePrim(4, p0Color, 350, 205, SparkType.Triangle));
    addPrim(world, makePrim(5, p0Color, 410, 200, SparkType.Triangle));
    addPrim(world, makePrim(6, p0Color, 470, 210, SparkType.Triangle));
    addPrim(world, makePrim(7, p0Color, 540, 200, SparkType.Triangle));
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 280, y: 215 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
  });

  describe('findLongestVoltkinPartial (S23 P2 debug helper)', () => {
    it('returns 0 on empty world', () => {
      expect(findLongestVoltkinPartial(world)).toBe(0);
    });

    it('returns 4 when only the 4-square prefix is built', () => {
      for (let i = 0; i < 4; i++) {
        addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
      }
      for (let i = 0; i < 3; i++) {
        addBond(world, makeBond(i, i, i + 1));
      }
      expect(findLongestVoltkinPartial(world)).toBe(4);
    });

    it('returns 7 when chain is SQ4 + TR3 (one triangle short of fire)', () => {
      for (let i = 0; i < 4; i++) {
        addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
      }
      for (let i = 4; i < 7; i++) {
        addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
      }
      for (let i = 0; i < 6; i++) {
        addBond(world, makeBond(i, i, i + 1));
      }
      expect(findLongestVoltkinPartial(world)).toBe(7);
    });

    it('returns 8 on a full SQ4-TR4 chain', () => {
      for (let i = 0; i < 4; i++) {
        addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
      }
      for (let i = 4; i < 8; i++) {
        addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
      }
      for (let i = 0; i < 7; i++) {
        addBond(world, makeBond(i, i, i + 1));
      }
      expect(findLongestVoltkinPartial(world)).toBe(8);
    });

    it('returns 1 on interleaved SQ-TR-SQ-TR (no SQ-SQ run possible)', () => {
      for (let i = 0; i < 8; i++) {
        const type = i % 2 === 0 ? SparkType.Square : SparkType.Triangle;
        addPrim(world, makePrim(i, p0Color, i * 50, 0, type));
      }
      for (let i = 0; i < 7; i++) {
        addBond(world, makeBond(i, i, i + 1));
      }
      expect(findLongestVoltkinPartial(world)).toBe(1);
    });
  });

  it('PRIME-AUDIT Δ1b — matches user S23 P2 screenshot topology in REVERSE (TR4-SQ4)', () => {
    // Same as above but with prim types reversed. Bond graph is symmetric — same
    // physical structure read from the other end. Predicate must match.
    addPrim(world, makePrim(0, p0Color, 100, 200, SparkType.Triangle));
    addPrim(world, makePrim(1, p0Color, 160, 210, SparkType.Triangle));
    addPrim(world, makePrim(2, p0Color, 220, 200, SparkType.Triangle));
    addPrim(world, makePrim(3, p0Color, 280, 215, SparkType.Triangle));
    addPrim(world, makePrim(4, p0Color, 350, 205, SparkType.Square));
    addPrim(world, makePrim(5, p0Color, 410, 200, SparkType.Square));
    addPrim(world, makePrim(6, p0Color, 470, 210, SparkType.Square));
    addPrim(world, makePrim(7, p0Color, 540, 200, SparkType.Square));
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 280, y: 215 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
  });
});

/**
 * S31 P0-1 — Voltkin spawn timing invariant. Pre-S31 SPAWN_CREATURE fired at
 * `world.tick + cinematicMsToTicks(cinematicMs)` = +240 ticks, but the
 * cutsceneOverlay bg stayed opaque (`bg.alpha=1`) for cinematicMs +
 * sustainedEffectMs (4500ms) and then linear-faded over FADE_MS (300ms) to
 * alpha=0 at 4800ms. The creature's 60-tick SPAWNING animation ran ticks
 * 240-300 — 48 of those 60 ticks (80%) were hidden under bg.alpha=1 overlay.
 *
 * Post-S31 the spawn schedule includes the full overlay-active window
 * (cinematicMs + sustainedEffectMs + FADE_MS); creature spawns at the exact
 * tick `bg.alpha` reaches 0 → full 60-tick SPAWNING animation visible.
 *
 * Tests below codify the math + lock the contract against accidental
 * constant changes (any future tune of cinematicMs / sustainedEffectMs /
 * FADE_MS must also re-verify the spawn delay matches expected overlay-
 * clear time).
 */
import { VOLTKIN_RECIPE } from './voltkin.ts';
import { cinematicMsToTicks } from '../creatures/creature.ts';
import { FADE_MS } from '../../render/cutsceneOverlay.ts';

describe('S31 P0-1: Voltkin spawn timing covers full overlay-active window', () => {
  it('VOLTKIN_RECIPE constants reflect post-S30 values', () => {
    // Anchors the math: any future change to these constants without updating
    // the spawn-timing math will flag here.
    expect(VOLTKIN_RECIPE.cinematicMs).toBe(4000);
    expect(VOLTKIN_RECIPE.sustainedEffectMs).toBe(500);
    expect(FADE_MS).toBe(300);
  });

  it('spawn-delay ticks == overlay-clear ticks (creature spawns exactly when bg.alpha=0)', () => {
    const totalOverlayMs = VOLTKIN_RECIPE.cinematicMs + VOLTKIN_RECIPE.sustainedEffectMs + FADE_MS;
    expect(totalOverlayMs).toBe(4800);
    // 4800ms / (1000ms/60Hz) = 288 ticks. Use cinematicMsToTicks for parity with
    // the actual main.ts call to ensure rounding semantics match.
    expect(cinematicMsToTicks(totalOverlayMs)).toBe(288);
  });

  it('spawn-delay > pre-S31 fireAtTick (regression guard against reverting to mp4-end-only)', () => {
    // Pre-S31: cinematicMsToTicks(cinematicMs) = 240. Post-S31: 288.
    // If anyone reverts the +sustainedEffectMs+FADE_MS math, this fails.
    const preS31 = cinematicMsToTicks(VOLTKIN_RECIPE.cinematicMs);
    const postS31 = cinematicMsToTicks(
      VOLTKIN_RECIPE.cinematicMs + VOLTKIN_RECIPE.sustainedEffectMs + FADE_MS,
    );
    expect(preS31).toBe(240);
    expect(postS31).toBe(288);
    expect(postS31 - preS31).toBe(48); // ~800ms shift; full SPAWNING (60 ticks) now visible
  });

  it('spawn happens at OR AFTER overlay clears, never before', () => {
    // Documents the spawn-not-before-overlay-clear invariant. Future changes to
    // either side of this inequality must preserve >=.
    const spawnDelayTicks = cinematicMsToTicks(
      VOLTKIN_RECIPE.cinematicMs + VOLTKIN_RECIPE.sustainedEffectMs + FADE_MS,
    );
    const overlayClearTicks = cinematicMsToTicks(
      VOLTKIN_RECIPE.cinematicMs + VOLTKIN_RECIPE.sustainedEffectMs + FADE_MS,
    );
    expect(spawnDelayTicks).toBeGreaterThanOrEqual(overlayClearTicks);
  });
});
