/**
 * SPARK — S103 P3 (#9) laser-turret recipe tests.
 *
 * Covers the strict 1-Line + 6-Spiral-leaf star predicate (reject 5 / 7 leaves, a non-Spiral leaf,
 * a leaf bonded elsewhere, an extra attached shape), the buildable-anchor scan (skips already-live
 * defenders + ascending-id determinism), and that the predicate yields the Line as the anchor/pos.
 *
 * ⚠ S140 P1 — THE LEAF COUNT MOVED 7 → 6 (owner retune, so the recipe fits CASTLE_BANK_CAP 7). The
 * counts below are bound to the recipe's exported TURRET_HUB_DEGREE wherever the number is the thing
 * under test, so a future retune does not require rewriting this file — which is exactly the drift
 * that made the S140 retune expensive.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { PLAYER_COLORS, SparkType, PRIMITIVE_MAX_HP } from '../../constants.ts';
import {
  asBondId,
  asCreatureId,
  asDefenderId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type PrimitiveId,
} from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import {
  isLaserTurretComponent,
  laserTurretPredicate,
  TURRET_HUB_DEGREE,
  TURRET_SIZE,
} from './laserTurret.ts';
import { HELGA_SIZE } from './princessHelga.ts';
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
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bond(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

/** Build a Line hub (id=lineId) with `leaves` leaf primitives of `leafType` bonded to it. */
function buildTurret(w: World, lineId: number, leaves: number, leafType: SparkType = SparkType.Spiral): PrimitiveId {
  const hub = addPrim(w, lineId, SparkType.Line, 200, 200);
  for (let i = 0; i < leaves; i++) {
    const leaf = addPrim(w, lineId + 100 + i, leafType, 200 + 30 * Math.cos(i), 200 + 30 * Math.sin(i));
    bond(w, lineId * 10 + i, hub, leaf);
  }
  return hub.id;
}

describe('isLaserTurretComponent — strict 1-Line + 6-Spiral-leaf star', () => {
  it('accepts exactly 1 Line + TURRET_HUB_DEGREE Spiral leaves', () => {
    const w = setup();
    const line = buildTurret(w, 1, TURRET_HUB_DEGREE);
    expect(isLaserTurretComponent(w, line)).toBe(true);
  });

  it('rejects one leaf FEWER and one leaf MORE than the gate (no tolerance either side)', () => {
    const wLow = setup();
    expect(isLaserTurretComponent(wLow, buildTurret(wLow, 1, TURRET_HUB_DEGREE - 1))).toBe(false);
    const wHigh = setup();
    expect(isLaserTurretComponent(wHigh, buildTurret(wHigh, 1, TURRET_HUB_DEGREE + 1))).toBe(false);
  });

  it('⛔ THE S140 TRAP: a SEVENTH spiral — what the old copy told players to build — is REJECTED', () => {
    // This is the regression witness for "builds at six, dies at seven". Before S140 this was the
    // accept case. It is now the reject case, and the gate has no upper tolerance, so a player
    // following stale copy would watch the host tear the turret down within 0.5 s. Any codex text
    // still saying seven is a trap — codexPresentation.test.ts asserts none survives.
    const w = setup();
    expect(isLaserTurretComponent(w, buildTurret(w, 1, 7))).toBe(false);
  });

  it('does NOT collide with HELGA, which now shares its size AND hub degree', () => {
    // S140 P1 compressed the ladder: laserTurret and princessHelga are both 7 prims with a degree-6
    // hub. Hub TYPE is the whole separation now, so pin it from both directions.
    expect(TURRET_SIZE).toBe(HELGA_SIZE);
    const w = setup();
    const tri = addPrim(w, 1, SparkType.Triangle, 200, 200);
    for (let i = 0; i < 3; i++) bond(w, 100 + i, tri, addPrim(w, 200 + i, SparkType.Spiral, 230, 200 + i));
    for (let i = 0; i < 3; i++) bond(w, 110 + i, tri, addPrim(w, 210 + i, SparkType.Circle, 170, 200 + i));
    expect(isLaserTurretComponent(w, tri.id)).toBe(false); // a Helga is never a turret
  });

  it('rejects when a leaf is the wrong type (a Circle instead of a Spiral)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Line, 200, 200);
    for (let i = 0; i < 5; i++) bond(w, 100 + i, hub, addPrim(w, 200 + i, SparkType.Spiral, 230, 200 + i));
    bond(w, 199, hub, addPrim(w, 299, SparkType.Circle, 170, 200)); // 6th leaf is a Circle
    expect(isLaserTurretComponent(w, hub.id)).toBe(false);
  });

  it('rejects an EXTRA attached shape (a leaf bonded to an external prim grows the component past 7)', () => {
    const w = setup();
    const line = buildTurret(w, 1, TURRET_HUB_DEGREE);
    // Attach an external Dot to one leaf → the component grows past TURRET_SIZE → reject.
    const leaf = w.primitives.get(asPrimitiveId(101))!;
    bond(w, 9999, leaf, addPrim(w, 5000, SparkType.Dot, 260, 260));
    expect(isLaserTurretComponent(w, line)).toBe(false);
  });

  it('TOLERATES inter-leaf auto-bonds (Council CHECK — fixes the dense-7-leaf silent no-build)', () => {
    const w = setup();
    const line = buildTurret(w, 1, TURRET_HUB_DEGREE);
    // AUTO_BOND can bond two adjacent Spiral leaves together → a leaf of degree 2, but still
    // TURRET_SIZE prims / hub at TURRET_HUB_DEGREE / all Spirals → it IS a valid turret.
    const a = w.primitives.get(asPrimitiveId(101))!;
    const b = w.primitives.get(asPrimitiveId(102))!;
    bond(w, 8888, a, b);
    expect(isLaserTurretComponent(w, line)).toBe(true);
  });

  it('returns false when the anchor is not a Line', () => {
    const w = setup();
    addPrim(w, 1, SparkType.Triangle, 200, 200);
    expect(isLaserTurretComponent(w, asPrimitiveId(1))).toBe(false);
  });
});

describe('laserTurretPredicate', () => {
  it('yields the Line as the anchor + its pos', () => {
    const w = setup();
    buildTurret(w, 1, TURRET_HUB_DEGREE);
    const match = laserTurretPredicate(w, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.anchorPrimitiveId).toBe(asPrimitiveId(1));
    expect(match!.triggererPlayerId).toBe(P0);
    expect(match!.pos).toEqual({ x: 200, y: 200 });
  });

  it('skips an anchor that is already a live defender (no double-build; rebuild after removal)', () => {
    const w = setup();
    buildTurret(w, 1, TURRET_HUB_DEGREE);
    // Mark the Line as already a live defender → predicate must skip it (returns null, no 2nd turret).
    w.defenders.set(asDefenderId(0), {
      id: asDefenderId(0), kind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'laserTurret', pos: { x: 200, y: 200 }, prevPos: { x: 200, y: 200 }, walkTargetPos: null,
      state: 'IDLE', ticksInState: 0, bagsRemaining: 0, // S141 P1 — no magazine on a turret
      nextFireTick: 0, targetCreatureId: null, lastStrikePos: null, ehp: null, // S158 P7 — a TOWER carries no pool
    });
    expect(laserTurretPredicate(w, { x: 0, y: 0 })).toBeNull();
  });

  it('end-to-end: geometry → findDefenderMatches → REGISTER_DEFENDER → the turret FIRES + kills a chewer', () => {
    const w = setup();
    buildTurret(w, 1, TURRET_HUB_DEGREE);
    w.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(70), ownerPlayerId: asPlayerId(1),
      pos: { x: 260, y: 200 }, targetPos: { x: 260, y: 200 }, spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    w.creatures.set(chewer.id, chewer);

    // The laserTurret.ts import registered the recipe → the ignition matcher finds it.
    const m = findDefenderMatches(w, { x: 0, y: 0 }).find((x) => x.recipe.id === 'laserTurret');
    expect(m).toBeDefined();
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER', defenderKind: m!.recipe.defenderKind,
      ownerPlayerId: m!.match.triggererPlayerId, anchorPrimitiveId: m!.match.anchorPrimitiveId,
      recipeId: m!.recipe.id, pos: m!.match.pos,
    });
    const d = [...w.defenders.values()][0];
    expect(d.kind).toBe('turret');
    d.nextFireTick = w.tick; // fire ASAP (skip the 30s charge for the test)

    for (let i = 0; i < getDefenderConfig('turret').windupTicks + 4; i++) {
      applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: d.id });
      w.tick++;
    }
    expect(w.creatures.has(asCreatureId(70))).toBe(false); // the beam killed the chewer (hp 1)
  });
});
