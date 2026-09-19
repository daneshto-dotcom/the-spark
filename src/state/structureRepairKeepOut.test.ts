/**
 * SPARK — S183: **THE CASTLE KEEP-OUT MUST NOT GATE FIX / SCRAP.**
 *
 * ## The defect, and why nothing caught it
 *
 * `seatStructureAt` borrowed `canBuildNow` as its eligibility gate, and its own comment named
 * exactly TWO clauses it meant to borrow: *"R19 (WHEN) + own ground (WHERE)"*. S182's placement
 * branch then made the castle keep-out the FIRST arm of `canBuildAt` — correct for PLACEMENT — and
 * it became a silent THIRD clause on reclamation.
 *
 * ⛔ **THE S182 LESSON, RECURRING EXACTLY: two branches each correct alone, wrong together.** That
 * branch's tripwire proved `canBuildAt` *contains* the keep-out. A source-text guard cannot see who
 * else *reads* a predicate, which is why this file drives the reducers instead.
 *
 * ## What a player lost
 *
 * `makeBond`'s 20 px rest-length floor pushes bonded shapes apart and nothing pushes them back out,
 * so a member can drift inside its own castle's disc. It then loses FIX/SCRAP — and FEED with them,
 * because `structureActionModel` returns null outright when the scrap plan is null. Sever that
 * member's bond and the lone shape can never be reclaimed for the rest of the match.
 *
 * ## ⭐ THE SHAPE OF THESE ASSERTIONS
 *
 * Both halves of the divergence are pinned, not just the fixed one: `canReclaimNow` and
 * `canBuildAt` must AGREE outside the disc and DISAGREE inside it. Asserting only the fix would
 * pass just as well if someone deleted the keep-out from placement altogether.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { bankCountOf, makeCastleBank } from './castleBank.ts';
import { canBuildNow } from './buildLegality.ts';
import {
  applyScrapStructure,
  canReclaimNow,
  planStructureScrap,
  seatStructureAt,
} from './structureRepair.ts';
import { CASTLE_NO_BUILD_RADIUS, isInsideCastleKeepOut, zoneOf, zoneOwner } from './zones.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import './godlyRecipes/stinkTower.ts';

const P0 = asPlayerId(0);
const STINK = 'stinkTower' as GodlyId;

/** The same far-from-quarry, comfortably-inside-seat-0 site the repair suite builds on. */
const SITE: Vec2 = { x: 300, y: 300 };

function setup(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(STINK)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  return w;
}

/**
 * A point that is BOTH inside seat 0's own ground AND inside its castle's keep-out disc.
 *
 * ⚠ DERIVED FROM THE ANCHOR, not typed in: on `PITCH_2P` the seat-0 keep sits at x≈120, and a point
 * a third of the keep-out radius to its right satisfies both. The assertions below refuse to run
 * unless it really does, so a layout or radius change fails loudly rather than making this file
 * vacuously green.
 */
function insideKeepOut(w: World): Vec2 {
  // Walk right from the left edge until a point is in seat 0's zone and inside the disc.
  for (let x = 1; x < CASTLE_NO_BUILD_RADIUS * 2; x += 1) {
    const p = { x, y: 540 };
    if (zoneOf(p, w.layout) === zoneOwner(P0, w.layout) && isInsideCastleKeepOut(p, w.layout)) return p;
  }
  throw new Error('no point is both own-ground and inside the keep-out — the premise moved');
}

describe('S183 — canReclaimNow diverges from canBuildNow in EXACTLY one place', () => {
  it('the premise holds: such a point exists, and it is the seat\'s own ground', () => {
    const w = setup();
    const p = insideKeepOut(w);
    expect(isInsideCastleKeepOut(p, w.layout)).toBe(true);
    expect(zoneOf(p, w.layout)).toBe(zoneOwner(P0, w.layout));
  });

  it('⛔ INSIDE the disc they DISAGREE — placement refuses, reclamation permits', () => {
    const w = setup();
    const p = insideKeepOut(w);
    expect(canBuildNow(w, p, P0)).toBe(false); // the S182 rule, intact
    expect(canReclaimNow(w, p, P0)).toBe(true); // …and no longer borrowed by FIX/SCRAP
  });

  it('OUTSIDE the disc they AGREE — the divergence is one clause, not a rewrite', () => {
    const w = setup();
    expect(canBuildNow(w, SITE, P0)).toBe(true);
    expect(canReclaimNow(w, SITE, P0)).toBe(true);
  });

  it('it still refuses OUTSIDE BUILD — R19 is the half that WAS meant to be shared', () => {
    const w = setup();
    w.matchPhase = 'FIGHT';
    expect(canReclaimNow(w, SITE, P0)).toBe(false);
    expect(canReclaimNow(w, insideKeepOut(w), P0)).toBe(false);
  });

  it('it still refuses on ANOTHER seat\'s ground — WHERE is the other shared half', () => {
    const w = setup();
    const enemy = { x: 1800, y: 540 };
    expect(zoneOf(enemy, w.layout)).not.toBe(zoneOwner(P0, w.layout));
    expect(canReclaimNow(w, enemy, P0)).toBe(false);
  });

  it('it fails CLOSED for a seat with no ground, exactly as canBuildAt does', () => {
    const w = setup();
    const unseated = asPlayerId(9);
    expect(zoneOwner(unseated, w.layout)).toBeNull();
    expect(canReclaimNow(w, SITE, unseated)).toBe(false);
  });
});

describe('S183 — a displaced member can still be reclaimed, end to end', () => {
  /**
   * Build legally, then move ONE member inside the disc — which is what the physics does on its
   * own: `makeBond`'s 20 px rest-length floor pushes bonded shapes apart and nothing pushes them
   * back out.
   */
  function buildThenDisplace(w: World): { moved: PrimitiveId; target: Vec2 } {
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: STINK, centre: SITE });
    const members = [...w.primitives.values()].filter((p) => p.origin?.blueprintId === STINK);
    expect(members.length).toBeGreaterThan(1); // anti-vacuity: there IS a structure
    const moved = members[0]!;
    const target = insideKeepOut(w);
    moved.pos = { ...target };
    return { moved: moved.id, target };
  }

  it('⛔ seatStructureAt still returns the component when the clicked member is in the disc', () => {
    const w = setup();
    const { moved } = buildThenDisplace(w);
    const ids = seatStructureAt(w, P0, moved);
    expect(ids).not.toBeNull();
    expect(ids!.length).toBeGreaterThan(1);
  });

  it('⛔ SCRAP plans, and the shapes actually come back to the bank', () => {
    const w = setup();
    const { moved } = buildThenDisplace(w);
    expect(planStructureScrap(w, P0, moved)).not.toBeNull();

    const before = [
      SparkType.Dot, SparkType.Line, SparkType.Triangle,
      SparkType.Square, SparkType.Circle, SparkType.Spiral,
    ].reduce((n, t) => n + bankCountOf(w.castleBanks, P0, t), 0);
    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: moved });
    const after = [
      SparkType.Dot, SparkType.Line, SparkType.Triangle,
      SparkType.Square, SparkType.Circle, SparkType.Spiral,
    ].reduce((n, t) => n + bankCountOf(w.castleBanks, P0, t), 0);

    expect(after).toBeGreaterThan(before);       // it really refunded
    expect(w.primitives.get(moved)).toBeUndefined(); // …and really tore down
  });

  it('⛔ a LONE displaced shape is reclaimable — the "never again for the rest of the match" case', () => {
    // Sever every bond, leaving the displaced member alone inside the disc. Before S183 this shape
    // could not be scrapped, could not be fixed, and had no FEED row, with nothing saying why.
    const w = setup();
    const { moved } = buildThenDisplace(w);
    // ⚠ `aId`/`bId`, not `a`/`b` — those are the PHYSICS BODIES. `componentOf` walks the id
    // fields, and severing the wrong pair leaves the component intact and this test vacuous.
    for (const [id, b] of [...w.bonds]) {
      if (b.aId === moved || b.bId === moved) w.bonds.delete(id);
    }
    const lone = w.primitives.get(moved);
    if (lone !== undefined) lone.bonds = new Set();
    const ids = seatStructureAt(w, P0, moved);
    expect(ids).toEqual([moved]);
    expect(planStructureScrap(w, P0, moved)).not.toBeNull();
  });

  it('⚠ THE REGRESSION WITNESS — the placement gate really would have refused that same member', () => {
    const w = setup();
    const { target } = buildThenDisplace(w);
    expect(canBuildNow(w, target, P0)).toBe(false);
  });
});
