/**
 * SPARK — S98 P3 drag-preview resolution tests.
 *
 * computePreviewBonds must return EXACTLY the bonds a drop at refPos would form.
 * It is built on the SAME host-authoritative pickers the placement reducer uses
 * (pickHostTargetPrimitive / collectHostMergeCandidates / pickRedundantBondTargets)
 * + a mirror of the placePrimitive merge-sweep dedup, so these assertions are the
 * anti-drift guard the Council required (preview == release, by construction +
 * verified behaviour here). Pure / Pixi-free.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_BOND_RADIUS,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeWorld, type World } from '../state/world.ts';
import { computePreviewBonds } from './dragPreview.ts';

const P0: PlayerId = asPlayerId(0);
const MINE: number = PLAYER_COLORS[0];
const THEIRS: number = PLAYER_COLORS[1];
// Far from the spawner zone (centre 960,540 r250) so the zone gate doesn't fire.
const FAR_X = 300;
const FAR_Y = 300;

let nextId = 0;
function addPrim(world: World, type: SparkType, x: number, y: number, color: number = MINE): Primitive {
  const id = asPrimitiveId(nextId++);
  const prim: Primitive = {
    id, type, placerColor: color, placedBy: P0, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: color, lastOwnershipChange: 0, radius: 8,
  };
  world.primitives.set(id, prim);
  return prim;
}
function connect(world: World, a: Primitive, b: Primitive): void {
  const id = asBondId(nextId++);
  world.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
  a.bonds.add(id); b.bonds.add(id);
}
const preview = (w: World, x: number, y: number, gate = true) =>
  computePreviewBonds(w, { x, y }, P0, MINE, gate);

describe('S98 P3 — computePreviewBonds', () => {
  it('picks the nearest same-colour primitive within AUTO_BOND_RADIUS as primary', () => {
    nextId = 0;
    const w = makeWorld(0);
    const near = addPrim(w, SparkType.Line, FAR_X + 20, FAR_Y); // 20px → in range
    addPrim(w, SparkType.Line, FAR_X + 55, FAR_Y); // 55px → farther, same component-less
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.primaryId).toBe(near.id);
  });

  it('returns no primary when the nearest is beyond AUTO_BOND_RADIUS', () => {
    nextId = 0;
    const w = makeWorld(0);
    addPrim(w, SparkType.Line, FAR_X + AUTO_BOND_RADIUS + 10, FAR_Y); // out of primary range
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.primaryId).toBeNull();
  });

  it('ignores a different-colour primitive (same-colour filter, matches commit)', () => {
    nextId = 0;
    const w = makeWorld(0);
    addPrim(w, SparkType.Line, FAR_X + 15, FAR_Y, THEIRS); // enemy colour in range → ignored
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.primaryId).toBeNull();
    expect(r.mergeIds).toHaveLength(0);
  });

  it('forms one merge bond per DISTINCT other component within MERGE_REACH_RADIUS', () => {
    nextId = 0;
    const w = makeWorld(0);
    // Primary component (one prim, in primary range).
    addPrim(w, SparkType.Line, FAR_X + 20, FAR_Y);
    // Two SEPARATE components beyond primary range but within merge range (≤100, >60).
    addPrim(w, SparkType.Square, FAR_X + 80, FAR_Y);
    addPrim(w, SparkType.Circle, FAR_X, FAR_Y + 80);
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.mergeIds).toHaveLength(2); // one per distinct other component
  });

  it('dedupes a multi-primitive component to ONE nearest merge bond', () => {
    nextId = 0;
    const w = makeWorld(0);
    addPrim(w, SparkType.Line, FAR_X + 20, FAR_Y); // primary
    // One component of TWO bonded prims, both within merge range → exactly ONE merge bond.
    const c1 = addPrim(w, SparkType.Square, FAR_X + 80, FAR_Y);
    const c2 = addPrim(w, SparkType.Square, FAR_X + 85, FAR_Y + 10);
    connect(w, c1, c2);
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.mergeIds).toHaveLength(1);
    expect(r.mergeIds[0]).toBe(c1.id); // the nearer of the two
  });

  it("excludes the primary's own component from the merge set (no double bond)", () => {
    nextId = 0;
    const w = makeWorld(0);
    const p1 = addPrim(w, SparkType.Line, FAR_X + 20, FAR_Y); // primary
    const p2 = addPrim(w, SparkType.Line, FAR_X + 30, FAR_Y + 10); // same component as primary
    connect(w, p1, p2);
    const r = preview(w, FAR_X, FAR_Y);
    expect(r.primaryId).toBe(p1.id);
    expect(r.mergeIds).toHaveLength(0); // primary's component is not re-merged
  });

  it('returns EMPTY inside the spawner zone when gating (host/solo), but NOT when not gating (client)', () => {
    nextId = 0;
    const w = makeWorld(0);
    addPrim(w, SparkType.Line, SPAWNER_CENTER_X + 15, SPAWNER_CENTER_Y); // a target right there
    const gated = computePreviewBonds(w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, P0, MINE, true);
    expect(gated.primaryId).toBeNull();
    expect(gated.mergeIds).toHaveLength(0);
    const ungated = computePreviewBonds(w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, P0, MINE, false);
    expect(ungated.primaryId).not.toBeNull(); // client path does not locally gate on zone
  });

  it('an empty board yields no bonds (but is not "rejected")', () => {
    nextId = 0;
    const w = makeWorld(0);
    const r = preview(w, FAR_X, FAR_Y);
    expect(r).toEqual({ primaryId: null, redundancyIds: [], mergeIds: [] });
  });
});
