/**
 * SPARK — S185 — the stink tower's cover set and its click target.
 *
 * Owner: *"Connector hiding for stink tower — yes, definitely implement that. That's I think the one
 * tower you forgot [to hide] the connectors for."*
 *
 * ⛔ **THE HIT BOX IS THE HALF THAT CAN SILENTLY RUIN THE FEATURE, SO IT IS TESTED HARDEST.** Hiding
 * the shapes removes the only thing that used to be clickable, and the canon is explicit that a
 * tower you cannot click is a tower you cannot repair — *strictly worse* than the mess he asked to
 * remove. A cover fix that shipped without a working hit test would look finished and cost him a
 * tower.
 *
 * ⚠ THE BOX IS ASYMMETRIC AND THE TESTS ASSERT THAT DIRECTLY. The sheet's subject spans x 22-206 in
 * a 255-wide cell, so its centre is 13.5 px LEFT of the anchor. A symmetric box — the obvious
 * implementation, and the one a later "tidy-up" would reach for — leaves the tower's left edge dead
 * and empty ground on its right live. That is the exact defect `rampAnchorAtPoint` shipped in S183.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import {
  STINK_TOWER_HIT_DX_MAX,
  STINK_TOWER_HIT_DX_MIN,
  STINK_TOWER_HIT_DY_MAX,
  STINK_TOWER_HIT_DY_MIN,
  stinkTowerAt,
  stinkTowerMembers,
} from './stinkTowerCover.ts';

const P0 = asPlayerId(0);

function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

function prim(w: World, id: number, x: number, y: number, type = SparkType.Circle): void {
  w.primitives.set(asPrimitiveId(id), {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0], placedBy: P0, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[0],
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function bond(w: World, id: number, a: number, b: number, createdTick: number): void {
  const pa = w.primitives.get(asPrimitiveId(a))!;
  const pb = w.primitives.get(asPrimitiveId(b))!;
  w.bonds.set(asBondId(id), {
    id: asBondId(id), aId: pa.id, bId: pb.id, a: pa, b: pb,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  pa.bonds.add(asBondId(id));
  pb.bonds.add(asBondId(id));
}

/** A complete stink tower: a Square hub of degree 3 with three Circle leaves. */
function tower(w: World, hubId: number, x: number, y: number, defId = 1): void {
  prim(w, hubId, x, y, SparkType.Square);
  prim(w, hubId + 1, x - 30, y - 10);
  prim(w, hubId + 2, x + 30, y - 10);
  prim(w, hubId + 3, x, y - 34);
  bond(w, hubId * 10 + 1, hubId, hubId + 1, 5);
  bond(w, hubId * 10 + 2, hubId, hubId + 2, 9);
  bond(w, hubId * 10 + 3, hubId, hubId + 3, 7);
  w.defenders.set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defId as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: defId, kind: 'stinkTower', ownerPlayerId: P0, pos: { x, y }, anchorPrimitiveId: asPrimitiveId(hubId) } as any,
  );
}

describe('S185 — the cover set is the star: the hub, its three leaves and its three bonds', () => {
  it('walks hub + leaves + bonds, and reports the NEWEST bond tick', () => {
    const w = world();
    tower(w, 100, 400, 300);
    const m = stinkTowerMembers(w, asPrimitiveId(100))!;
    expect(m.prims.sort()).toEqual([100, 101, 102, 103].map(asPrimitiveId).sort());
    expect(m.bonds).toHaveLength(3);
    // 5, 9, 7 -> the ramp anchors on the newest, matching every other publisher
    expect(m.newestTick).toBe(9);
  });

  it('returns null for a hub that is not in the world, rather than throwing', () => {
    expect(stinkTowerMembers(world(), asPrimitiveId(999))).toBeNull();
  });
});

describe('⛔ S185 — the click target, which is what keeps the tower repairable', () => {
  it('a click on the body returns the ANCHOR primitive, which is what opens the repair sheet', () => {
    const w = world();
    tower(w, 100, 400, 300);
    // just above the feet, inside the body horizontally
    expect(stinkTowerAt(w, 400, 300 - 40)).toBe(asPrimitiveId(100));
  });

  /**
   * ⛔⛔ THE ASYMMETRY TEST. These two points are mirror images about the anchor, and exactly ONE of
   * them is on the tower. A symmetric box passes or fails them together — so this is the assertion
   * that a well-meaning "simplify the hit box" cannot survive.
   */
  it('the box is ASYMMETRIC: the art straddles its anchor rather than standing on it', () => {
    const w = world();
    tower(w, 100, 400, 300);
    const y = 300 - 40;
    // 40px LEFT of the anchor is on the tower (the subject reaches -45)...
    expect(stinkTowerAt(w, 400 - 40, y)).toBe(asPrimitiveId(100));
    // ...while 40px RIGHT of it is empty ground (the subject stops at +33).
    expect(stinkTowerAt(w, 400 + 40, y)).toBeNull();
    // and the constants themselves say so, so a symmetric rewrite fails here too
    expect(Math.abs(STINK_TOWER_HIT_DX_MIN)).not.toBe(Math.abs(STINK_TOWER_HIT_DX_MAX));
  });

  it('stands ON its anchor — the feet are at pos.y, nothing below it is clickable', () => {
    const w = world();
    tower(w, 100, 400, 300);
    expect(STINK_TOWER_HIT_DY_MAX).toBe(0);
    expect(stinkTowerAt(w, 400, 300 + 6)).toBeNull();
    expect(stinkTowerAt(w, 400, 300 + STINK_TOWER_HIT_DY_MIN + 2)).toBe(asPrimitiveId(100));
    expect(stinkTowerAt(w, 400, 300 + STINK_TOWER_HIT_DY_MIN - 6)).toBeNull();
  });

  it('CONTROL — an empty board and a far click both return null', () => {
    const w = world();
    expect(stinkTowerAt(w, 400, 300)).toBeNull();
    tower(w, 100, 400, 300);
    expect(stinkTowerAt(w, 1200, 900)).toBeNull();
  });

  /**
   * ⭐ Two overlapping towers must resolve by NEAREST-then-lowest-id, never by `Map` insertion
   * order — letting iteration order decide would make the answer depend on build order, which is a
   * bug class this project has already shipped once in the sim.
   */
  it('two overlapping towers resolve by nearest, not by insertion order', () => {
    const w = world();
    tower(w, 100, 400, 300, 1);
    tower(w, 200, 415, 300, 2); // inserted second, but nearer to the probe below
    expect(stinkTowerAt(w, 415, 300 - 40)).toBe(asPrimitiveId(200));
  });
});
