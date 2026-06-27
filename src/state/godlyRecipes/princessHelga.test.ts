/**
 * SPARK — S103 P4 (#10) HELGA recipe tests.
 *
 * Covers the strict Triangle-hub + 3-Spiral(Warped Anchor) + 3-Circle(Star) component predicate
 * (reject wrong leaf mix / wrong leaf type / extra shape / leaf bonded elsewhere), the
 * direction-AGNOSTIC Star detection (a Triangle↔Circle bond matches regardless of build order —
 * OC3), the buildable-anchor skip-live scan, and an end-to-end ignition→slap→kill.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { PLAYER_COLORS, SparkType } from '../../constants.ts';
import { asBondId, asCreatureId, asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, type PrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { isHelgaComponent, helgaPredicate } from './princessHelga.ts';
import { findDefenderMatches } from './index.ts';
import { applyDefenderTick, applyRegisterDefender } from '../defenders/defenderLifecycle.ts';
import { getDefenderConfig } from '../defenders/defender.ts';
import { makeCreature } from '../creatures/creature.ts';
import { CHEWER_CONFIG } from '../creatures/voltkin-config.ts';

const P0 = asPlayerId(0);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0], placedBy: P0,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bond(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

/** Triangle hub (id=hubId) + `spirals` Spiral leaves + `circles` Circle leaves bonded to it.
 *  `circleAsAId` puts the Circle as the bond's aId (hub as bId) to prove direction-agnostic Star. */
function buildHelga(w: World, hubId: number, spirals: number, circles: number, circleAsAId = false): PrimitiveId {
  const hub = addPrim(w, hubId, SparkType.Triangle, 300, 300);
  let bid = hubId * 10;
  for (let i = 0; i < spirals; i++) {
    bond(w, bid++, hub, addPrim(w, hubId + 100 + i, SparkType.Spiral, 330 + i, 300));
  }
  for (let i = 0; i < circles; i++) {
    const circle = addPrim(w, hubId + 200 + i, SparkType.Circle, 270 - i, 300);
    if (circleAsAId) bond(w, bid++, circle, hub); // Circle is aId → {Triangle,Circle} set still matches
    else bond(w, bid++, hub, circle);
  }
  return hub.id;
}

describe('isHelgaComponent — strict Triangle hub + 3 Warped Anchor + 3 Star', () => {
  it('accepts a Triangle hub(deg6) + 3 Spiral + 3 Circle leaves', () => {
    const w = setup();
    expect(isHelgaComponent(w, buildHelga(w, 1, 3, 3))).toBe(true);
  });

  it('is direction-AGNOSTIC for the Star (Circle as aId or bId both match — OC3 type-set)', () => {
    const w = setup();
    expect(isHelgaComponent(w, buildHelga(w, 1, 3, 3, /*circleAsAId*/ true))).toBe(true);
  });

  it('TOLERATES inter-leaf auto-bonds (Council CHECK — a leaf bonded to a sibling still ignites)', () => {
    const w = setup();
    const hub = buildHelga(w, 1, 3, 3);
    // AUTO_BOND bonds two leaves together → still 7 prims / hub deg 6 / 3 Spiral + 3 Circle → valid.
    const a = w.primitives.get(asPrimitiveId(101))!; // a spiral leaf
    const b = w.primitives.get(asPrimitiveId(201))!; // a circle leaf
    bond(w, 7777, a, b);
    expect(isHelgaComponent(w, hub)).toBe(true);
  });

  it('rejects the wrong leaf mix (2 Spiral + 4 Circle, 4 Spiral + 2 Circle)', () => {
    const wA = setup();
    expect(isHelgaComponent(wA, buildHelga(wA, 1, 2, 4))).toBe(false);
    const wB = setup();
    expect(isHelgaComponent(wB, buildHelga(wB, 1, 4, 2))).toBe(false);
  });

  it('rejects a wrong leaf TYPE (a Square in place of a Circle)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Triangle, 300, 300);
    let bid = 10;
    for (let i = 0; i < 3; i++) bond(w, bid++, hub, addPrim(w, 100 + i, SparkType.Spiral, 330, 300 + i));
    for (let i = 0; i < 2; i++) bond(w, bid++, hub, addPrim(w, 200 + i, SparkType.Circle, 270, 300 + i));
    bond(w, bid++, hub, addPrim(w, 299, SparkType.Square, 300, 270)); // 6th leaf is a Square
    expect(isHelgaComponent(w, hub.id)).toBe(false);
  });

  it('rejects an extra attached shape (component size 8, not 7)', () => {
    const w = setup();
    const hub = buildHelga(w, 1, 3, 3);
    const aLeaf = w.primitives.get(asPrimitiveId(101))!; // a spiral leaf
    bond(w, 9999, aLeaf, addPrim(w, 5000, SparkType.Dot, 350, 350)); // hang an extra prim off a leaf
    expect(isHelgaComponent(w, hub)).toBe(false);
  });

  it('rejects a non-Triangle anchor', () => {
    const w = setup();
    addPrim(w, 1, SparkType.Circle, 300, 300);
    expect(isHelgaComponent(w, asPrimitiveId(1))).toBe(false);
  });
});

describe('helgaPredicate + end-to-end slap', () => {
  it('yields the Triangle hub as the anchor + its pos', () => {
    const w = setup();
    buildHelga(w, 1, 3, 3);
    const m = helgaPredicate(w, { x: 0, y: 0 });
    expect(m).not.toBeNull();
    expect(m!.anchorPrimitiveId).toBe(asPrimitiveId(1));
    expect(m!.pos).toEqual({ x: 300, y: 300 });
  });

  it('skips an anchor that is already a live defender', () => {
    const w = setup();
    buildHelga(w, 1, 3, 3);
    w.defenders.set(asDefenderId(0), {
      id: asDefenderId(0), kind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'helga', pos: { x: 300, y: 300 }, prevPos: { x: 300, y: 300 }, walkTargetPos: null,
      state: 'IDLE', ticksInState: 0, hp: 1,
      nextFireTick: 0, targetCreatureId: null, lastStrikePos: null,
    });
    expect(helgaPredicate(w, { x: 0, y: 0 })).toBeNull();
  });

  it('end-to-end: geometry → ignition → REGISTER_DEFENDER → HELGA slaps + kills a chewer', () => {
    const w = setup();
    buildHelga(w, 1, 3, 3);
    w.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(70), ownerPlayerId: asPlayerId(1),
      pos: { x: 340, y: 300 }, targetPos: { x: 340, y: 300 }, spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    w.creatures.set(chewer.id, chewer);
    const m = findDefenderMatches(w, { x: 0, y: 0 }).find((x) => x.recipe.id === 'helga');
    expect(m).toBeDefined();
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER', defenderKind: m!.recipe.defenderKind,
      ownerPlayerId: m!.match.triggererPlayerId, anchorPrimitiveId: m!.match.anchorPrimitiveId,
      recipeId: m!.recipe.id, pos: m!.match.pos,
    });
    const d = [...w.defenders.values()][0];
    expect(d.kind).toBe('princess');
    d.nextFireTick = w.tick; // slap ASAP
    for (let i = 0; i < getDefenderConfig('princess').windupTicks + 4; i++) {
      applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: d.id });
      w.tick++;
    }
    expect(w.creatures.has(asCreatureId(70))).toBe(false); // slapped dead
  });
});
