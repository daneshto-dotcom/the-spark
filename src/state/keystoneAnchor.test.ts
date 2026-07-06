/**
 * SPARK — S118 P2 (B3) KEYSTONE ANCHOR symbiotic-chaining tests.
 *
 * An un-fouled Anchor (Dot↔Square) confers a PARTIAL territorial-rigidity floor (KEYSTONE_STIFFNESS_
 * FLOOR) to the MAGIC bonds directly bonded to its endpoint primitives. Asserts: a sagged magic neighbor
 * (off EITHER anchor endpoint) is lifted; a FUNCTIONAL neighbor and a magic bond with no adjacent anchor
 * are NOT; an un-sagged / already-higher (e.g. anchor-floored) neighbor is never lowered; a fouled anchor
 * confers nothing and a fouled neighbor receives nothing; and the pass is a pure, order-independent,
 * idempotent function of synced state (replay-identical, host-authoritative).
 */

import { describe, expect, it } from 'vitest';
import {
  ANCHOR_STIFFNESS_FLOOR,
  KEYSTONE_STIFFNESS_FLOOR,
  PLAYER_COLORS,
  SparkType,
  TERRITORY_ENGULF_STIFFNESS,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applyKeystoneAnchor } from './keystoneAnchor.ts';

const RED = PLAYER_COLORS[0];
const SAGGED = TERRITORY_ENGULF_STIFFNESS; // 0.3 — the enemy-territory engulf-warp value

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

function connect(w: World, id: number, a: Primitive, b: Primitive, mult?: number): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 40,
    stiffnessTier: 'MID',
    createdTick: 0,
    stiffnessMultiplier: mult,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/**
 * Anchor Dot(1)↔Square(2) (bond 10) + a sagged Capsule Square(2)↔Circle(3) magic neighbor (bond 11)
 * sharing the Square, + a sagged Filament Dot(1)↔Line(4) magic neighbor (bond 12) sharing the Dot.
 */
function anchorWithMagicNeighbors(w: World): { anchor: Bond; capsule: Bond; filament: Bond } {
  const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
  const square = addPrim(w, 2, SparkType.Square, 520, 400);
  const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
  const line = addPrim(w, 4, SparkType.Line, 440, 400);
  const anchor = connect(w, 10, dot, square); // Dot→Square = Anchor
  const capsule = connect(w, 11, square, circle, SAGGED); // Square→Circle = Capsule (magic), shares Square
  const filament = connect(w, 12, dot, line, SAGGED); // Dot→Line = Filament (magic), shares Dot
  return { anchor, capsule, filament };
}

describe('S118 P2 — Keystone Anchor symbiotic chaining', () => {
  it('sanity: the sagged engulf value is below the keystone floor (tests are non-vacuous)', () => {
    expect(SAGGED).toBeLessThan(KEYSTONE_STIFFNESS_FLOOR);
    expect(KEYSTONE_STIFFNESS_FLOOR).toBeLessThan(ANCHOR_STIFFNESS_FLOOR); // anchor stays the strongest
  });

  it('FLOORS a sagged MAGIC neighbor bonded to EITHER anchor endpoint up to KEYSTONE_STIFFNESS_FLOOR', () => {
    const w = baseWorld();
    const { capsule, filament } = anchorWithMagicNeighbors(w);
    applyKeystoneAnchor(w);
    expect(capsule.stiffnessMultiplier).toBe(KEYSTONE_STIFFNESS_FLOOR); // off the Square endpoint
    expect(filament.stiffnessMultiplier).toBe(KEYSTONE_STIFFNESS_FLOOR); // off the Dot endpoint
    expect(capsule.stiffnessMultiplier as number).toBeGreaterThan(SAGGED); // a real lift happened
  });

  it('does NOT floor a FUNCTIONAL (non-magic) neighbor of an anchor', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
    const square = addPrim(w, 2, SparkType.Square, 520, 400);
    const tri = addPrim(w, 3, SparkType.Triangle, 560, 400);
    connect(w, 10, dot, square); // Anchor
    const functional = connect(w, 11, square, tri, SAGGED); // Square→Triangle = functional placeholder
    applyKeystoneAnchor(w);
    expect(functional.stiffnessMultiplier).toBe(SAGGED); // untouched
  });

  it('does NOT floor a magic bond with NO adjacent anchor', () => {
    const w = baseWorld();
    const sq = addPrim(w, 1, SparkType.Square, 480, 400);
    const ci = addPrim(w, 2, SparkType.Circle, 520, 400);
    const lone = connect(w, 10, sq, ci, SAGGED); // Capsule (magic) but not bonded to any anchor
    applyKeystoneAnchor(w);
    expect(lone.stiffnessMultiplier).toBe(SAGGED);
  });

  it('never LOWERS a neighbor already at/above the keystone floor (idempotent max)', () => {
    const w = baseWorld();
    const { capsule, filament } = anchorWithMagicNeighbors(w);
    capsule.stiffnessMultiplier = 1.0; // un-sagged (outside enemy territory)
    filament.stiffnessMultiplier = ANCHOR_STIFFNESS_FLOOR; // e.g. it is itself anchor-floored to 0.7
    applyKeystoneAnchor(w);
    expect(capsule.stiffnessMultiplier).toBe(1.0); // not lowered to 0.5
    expect(filament.stiffnessMultiplier).toBe(ANCHOR_STIFFNESS_FLOOR); // 0.7 kept, not lowered
  });

  it('a FOULED anchor confers NOTHING (either endpoint pooped)', () => {
    const w = baseWorld();
    const { anchor, capsule } = anchorWithMagicNeighbors(w);
    w.fouledPrimitives.add(anchor.aId); // the anchor's Dot endpoint is fouled
    applyKeystoneAnchor(w);
    expect(capsule.stiffnessMultiplier).toBe(SAGGED); // no conferral
  });

  it('a FOULED magic neighbor receives NOTHING (foul-skip parity)', () => {
    const w = baseWorld();
    const { capsule } = anchorWithMagicNeighbors(w);
    w.fouledPrimitives.add(asPrimitiveId(3)); // the Capsule's Circle endpoint is fouled
    applyKeystoneAnchor(w);
    expect(capsule.stiffnessMultiplier).toBe(SAGGED);
  });

  it('does not touch the anchor bond itself (it is not its own neighbor)', () => {
    const w = baseWorld();
    const { anchor } = anchorWithMagicNeighbors(w);
    anchor.stiffnessMultiplier = SAGGED; // keystone must not floor the anchor (that is anchorStabilize's job)
    applyKeystoneAnchor(w);
    expect(anchor.stiffnessMultiplier).toBe(SAGGED);
  });

  it('is idempotent (running twice equals running once)', () => {
    const w = baseWorld();
    const { capsule } = anchorWithMagicNeighbors(w);
    applyKeystoneAnchor(w);
    applyKeystoneAnchor(w);
    expect(capsule.stiffnessMultiplier).toBe(KEYSTONE_STIFFNESS_FLOOR);
  });

  it('is deterministic + order-independent (bond Map insertion order cannot change the result)', () => {
    const build = (anchorFirst: boolean): World => {
      const w = baseWorld();
      const dot = addPrim(w, 1, SparkType.Dot, 480, 400);
      const square = addPrim(w, 2, SparkType.Square, 520, 400);
      const circle = addPrim(w, 3, SparkType.Circle, 560, 400);
      if (anchorFirst) {
        connect(w, 10, dot, square); // Anchor first
        connect(w, 11, square, circle, SAGGED); // then magic neighbor
      } else {
        connect(w, 11, square, circle, SAGGED); // magic neighbor first
        connect(w, 10, dot, square); // then Anchor
      }
      applyKeystoneAnchor(w);
      return w;
    };
    const wA = build(true);
    const wB = build(false);
    const mult = (w: World): number | undefined => w.bonds.get(asBondId(11))?.stiffnessMultiplier;
    expect(mult(wA)).toBe(KEYSTONE_STIFFNESS_FLOOR);
    expect(mult(wA)).toBe(mult(wB));
  });

  it('no Anchor on the board → total no-op', () => {
    const w = baseWorld();
    const sq = addPrim(w, 1, SparkType.Square, 480, 400);
    const ci = addPrim(w, 2, SparkType.Circle, 520, 400);
    const magic = connect(w, 10, sq, ci, SAGGED); // Capsule, but no anchor exists
    applyKeystoneAnchor(w);
    expect(magic.stiffnessMultiplier).toBe(SAGGED);
  });
});
