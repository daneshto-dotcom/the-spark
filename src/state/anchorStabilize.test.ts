/**
 * SPARK — S115 P1 (G2-PROMO Phase-2) Anchor planted-joint tests.
 *
 * The Anchor (Dot→Square) magic combo resists the S49 territorial engulf-sag: its bond's per-tick
 * stiffnessMultiplier is FLOORED back up to ANCHOR_STIFFNESS_FLOOR after computeTerritorialInfluence
 * degrades it. Asserts: a sagged Anchor bond is lifted; a non-Anchor / reverse-key / fouled bond is
 * NOT; an un-sagged Anchor is never lowered; and the floor is a pure, order-independent, deterministic
 * function of synced state (replay-identical, host-authoritative).
 */

import { describe, expect, it } from 'vitest';
import {
  ANCHOR_STIFFNESS_FLOOR,
  PLAYER_COLORS,
  SparkType,
  TERRITORY_ENGULF_STIFFNESS,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applyAnchorStabilize } from './anchorStabilize.ts';

const RED = PLAYER_COLORS[0];

// The territorially-sagged multiplier the engulf-warp drives an enemy bond down to. Strictly below
// the floor (else these tests would be vacuous — assert that invariant once, below).
const SAGGED = TERRITORY_ENGULF_STIFFNESS;

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type,
    placerColor: RED,
    placedBy: asPlayerId(0),
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function connect(
  w: World,
  id: number,
  a: Primitive,
  b: Primitive,
  stiffnessMultiplier?: number,
): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 40,
    stiffnessTier: 'MID',
    createdTick: 0,
    stiffnessMultiplier,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A Dot(aId)→Square(bId) Anchor, optionally pre-sagged to `mult`. */
function addAnchor(w: World, mult?: number): Bond {
  const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
  const square = addPrim(w, 2, SparkType.Square, 520, 400);
  return connect(w, 10, dot, square, mult); // aId=Dot, bId=Square ⇒ Anchor (forward-only)
}

describe('S115 P1 — Anchor planted-joint (territorial-sag resist)', () => {
  it('sanity: the sagged engulf multiplier is strictly below the anchor floor (tests are non-vacuous)', () => {
    expect(SAGGED).toBeLessThan(ANCHOR_STIFFNESS_FLOOR);
  });

  it('FLOORS a territorially-sagged Anchor bond back up to ANCHOR_STIFFNESS_FLOOR', () => {
    const w = baseWorld();
    const bond = addAnchor(w, SAGGED); // sagged by the engulf-warp
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(ANCHOR_STIFFNESS_FLOOR);
    expect(bond.stiffnessMultiplier as number).toBeGreaterThan(SAGGED); // a real lift happened
  });

  it('does NOT lower an un-sagged Anchor (floor only lifts; 1.0 stays 1.0)', () => {
    const w = baseWorld();
    const bond = addAnchor(w, 1.0);
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(1.0);
  });

  it('leaves an undefined (never-territorially-processed) Anchor multiplier untouched (≥ floor)', () => {
    const w = baseWorld();
    const bond = addAnchor(w, undefined); // undefined ⇒ nominal 1.0 ⇒ already ≥ floor
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBeUndefined();
  });

  it('does NOT floor a NON-Anchor bond (a Diamond stays sagged)', () => {
    const w = baseWorld();
    const t1 = addPrim(w, 1, SparkType.Triangle, 480, 400);
    const t2 = addPrim(w, 2, SparkType.Triangle, 520, 400); // Tri→Tri = Diamond, not Anchor
    const bond = connect(w, 10, t1, t2, SAGGED);
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(SAGGED);
  });

  it('is ORDER-SYMMETRIC (S98): the reverse key Square→Dot is ALSO an Anchor → also floored', () => {
    // S98 mirrored the one-way magic pairs, so Square→Dot resolves to the SAME Anchor outcome as
    // Dot→Square (combos mirror loop). Consistent with the Vortex symmetry — the reverse earns the
    // behavior, not just the income. (The original S91 "forward-key only" note is superseded.)
    const w = baseWorld();
    const square = addPrim(w, 1, SparkType.Square, 480, 400);
    const dot = addPrim(w, 2, SparkType.Dot, 520, 400); // aId=Square, bId=Dot ⇒ Anchor (S98 symmetric)
    const bond = connect(w, 10, square, dot, SAGGED);
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(ANCHOR_STIFFNESS_FLOOR);
  });

  it('a FOULED Anchor (either endpoint pooped) stops planting until cleaned', () => {
    const w = baseWorld();
    const bond = addAnchor(w, SAGGED);
    w.fouledPrimitives.add(bond.aId); // the Dot endpoint is fouled
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(SAGGED); // not floored
  });

  it('no Anchor on the board → total no-op', () => {
    const w = baseWorld();
    const c1 = addPrim(w, 1, SparkType.Circle, 480, 400);
    const c2 = addPrim(w, 2, SparkType.Circle, 520, 400);
    const bond = connect(w, 10, c1, c2, SAGGED);
    applyAnchorStabilize(w);
    expect(bond.stiffnessMultiplier).toBe(SAGGED);
  });

  it('is deterministic + order-independent: floor result ignores bond Map insertion order', () => {
    // Two Anchors + one non-Anchor, all sagged. The per-bond idempotent floor must produce the SAME
    // multipliers regardless of insertion order (no cross-bond accumulation — replay/host-mirror safe).
    const build = (anchorFirst: boolean): World => {
      const w = baseWorld();
      const dotA = addPrim(w, 1, SparkType.Dot, 100, 100);
      const sqA = addPrim(w, 2, SparkType.Square, 140, 100);
      const dotB = addPrim(w, 3, SparkType.Dot, 300, 100);
      const sqB = addPrim(w, 4, SparkType.Square, 340, 100);
      if (anchorFirst) {
        connect(w, 10, dotA, sqA, SAGGED);
        connect(w, 11, dotB, sqB, SAGGED);
      } else {
        connect(w, 11, dotB, sqB, SAGGED);
        connect(w, 10, dotA, sqA, SAGGED);
      }
      applyAnchorStabilize(w);
      return w;
    };
    const wA = build(true);
    const wB = build(false);
    const mult = (w: World, id: number): number | undefined =>
      w.bonds.get(asBondId(id))?.stiffnessMultiplier;
    expect(mult(wA, 10)).toBe(ANCHOR_STIFFNESS_FLOOR);
    expect(mult(wA, 11)).toBe(ANCHOR_STIFFNESS_FLOOR);
    expect(mult(wA, 10)).toBe(mult(wB, 10));
    expect(mult(wA, 11)).toBe(mult(wB, 11));
  });
});
