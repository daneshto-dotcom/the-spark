/**
 * SPARK — Voltkin recipe predicate (S22 P4).
 *
 * Geometric heuristic: lightning-bolt-like component (elongated, ≥3 prims,
 * aspect ≥2.5) adjacent (centroid distance <200 px) to TV-frame-like
 * component (squarish, ≥4 prims, aspect 1.0-1.8). Triggerer = dominant
 * placerColor of the lightning component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { asPlayerId, type BondId, type PrimitiveId } from '../../types.ts';
import { SparkType } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { voltkinPredicate, findAllComponents } from './voltkin.ts';

function makePrim(
  id: number,
  placerColor: number,
  x: number,
  y: number,
): Primitive {
  return {
    id: id as unknown as PrimitiveId,
    type: SparkType.Dot,
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
}

function addBond(world: World, bond: Bond): void {
  world.bonds.set(bond.id, bond);
}

describe('voltkin predicate', () => {
  let world: World;

  beforeEach(() => {
    world = makeWorld(1);
    // ensure both players exist
    const p2 = makeIdlePlayer(asPlayerId(1), 0x00ff00);
    world.players.set(p2.id, p2);
    // Player 0 already created at color PLAYER_COLORS[0]; check what that is by inspecting
  });

  it('returns null on an empty world', () => {
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when only a lightning exists (no TV)', () => {
    // P0 color: get from world.players
    const p0 = world.players.get(asPlayerId(0))!;
    // 4-prim horizontal line — high aspect (lightning)
    addPrim(world, makePrim(0, p0.color, 0, 0));
    addPrim(world, makePrim(1, p0.color, 50, 0));
    addPrim(world, makePrim(2, p0.color, 100, 0));
    addPrim(world, makePrim(3, p0.color, 150, 0));
    addBond(world, makeBond(0, 0, 1));
    addBond(world, makeBond(1, 1, 2));
    addBond(world, makeBond(2, 2, 3));
    const components = findAllComponents(world);
    expect(components.length).toBe(1);
    expect(components[0].aspect).toBeGreaterThanOrEqual(2.5);
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('matches a lightning + TV pair within adjacency range', () => {
    const p0 = world.players.get(asPlayerId(0))!;
    // lightning: 4 prims, horizontal line, aspect ≈ 150
    addPrim(world, makePrim(0, p0.color, 0, 0));
    addPrim(world, makePrim(1, p0.color, 50, 0));
    addPrim(world, makePrim(2, p0.color, 100, 0));
    addPrim(world, makePrim(3, p0.color, 150, 0));
    addBond(world, makeBond(0, 0, 1));
    addBond(world, makeBond(1, 1, 2));
    addBond(world, makeBond(2, 2, 3));
    // TV: 4 prims in a roughly-square 60×60 box near the lightning
    addPrim(world, makePrim(10, 0x00ff00, 200, 0));
    addPrim(world, makePrim(11, 0x00ff00, 260, 0));
    addPrim(world, makePrim(12, 0x00ff00, 200, 60));
    addPrim(world, makePrim(13, 0x00ff00, 260, 60));
    addBond(world, makeBond(10, 10, 11));
    addBond(world, makeBond(11, 11, 13));
    addBond(world, makeBond(12, 13, 12));
    addBond(world, makeBond(13, 12, 10));
    const match = voltkinPredicate(world, { x: 100, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
    expect(match!.targetComponentPrimitiveIds.length).toBe(4);
  });

  it('skips when lightning + TV are >200 px apart', () => {
    const p0 = world.players.get(asPlayerId(0))!;
    addPrim(world, makePrim(0, p0.color, 0, 0));
    addPrim(world, makePrim(1, p0.color, 50, 0));
    addPrim(world, makePrim(2, p0.color, 100, 0));
    addPrim(world, makePrim(3, p0.color, 150, 0));
    addBond(world, makeBond(0, 0, 1));
    addBond(world, makeBond(1, 1, 2));
    addBond(world, makeBond(2, 2, 3));
    // TV far away (centroid distance ~500 px)
    addPrim(world, makePrim(10, 0x00ff00, 600, 0));
    addPrim(world, makePrim(11, 0x00ff00, 660, 0));
    addPrim(world, makePrim(12, 0x00ff00, 600, 60));
    addPrim(world, makePrim(13, 0x00ff00, 660, 60));
    addBond(world, makeBond(10, 10, 11));
    addBond(world, makeBond(11, 11, 13));
    addBond(world, makeBond(12, 13, 12));
    addBond(world, makeBond(13, 12, 10));
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('skips when shapes do not classify cleanly (low-aspect lightning candidate)', () => {
    const p0 = world.players.get(asPlayerId(0))!;
    // 3 prims in a roughly-square 60×60 arrangement — aspect ≈ 1
    addPrim(world, makePrim(0, p0.color, 0, 0));
    addPrim(world, makePrim(1, p0.color, 60, 0));
    addPrim(world, makePrim(2, p0.color, 30, 60));
    addBond(world, makeBond(0, 0, 1));
    addBond(world, makeBond(1, 1, 2));
    addBond(world, makeBond(2, 2, 0));
    // TV pair adjacent
    addPrim(world, makePrim(10, 0x00ff00, 200, 0));
    addPrim(world, makePrim(11, 0x00ff00, 260, 0));
    addPrim(world, makePrim(12, 0x00ff00, 200, 60));
    addPrim(world, makePrim(13, 0x00ff00, 260, 60));
    addBond(world, makeBond(10, 10, 11));
    addBond(world, makeBond(11, 11, 13));
    addBond(world, makeBond(12, 13, 12));
    addBond(world, makeBond(13, 12, 10));
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });
});
