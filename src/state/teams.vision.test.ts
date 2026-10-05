/**
 * SPARK — ⭐⭐ S195 (owner N1 / R195-F1 / B-27) — **TEAMMATES SHARE VISION DURING BUILD.**
 *
 * > *"same team should be visible. No fog of war during build phase for your same team. This is in 2v2s
 * > or in team fights"* — owner, S195 N1
 * > *"during fight, there's no fog of war anywhere … I said no fog during build"* — owner, R195-F1
 *
 * Three render-side sites read the one predicate (`sameTeam`), and a free-for-all keeps every one of them
 * at plain seat equality:
 *   · `computeVisionSourcesForSeat` — a teammate's primitives and creatures are your beacons;
 *   · `isConcealed` — a teammate's things are never culled;
 *   · `teamZones` → `fogRenderer` — every teammate quarter is lit edge to edge like your own;
 *   · `updateGhostMemory` — a teammate's structure is never remembered as a fogged ghost.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dispatch, makeWorld, type World } from './world.ts';
import { computeVisionSourcesForSeat, fogActive, isPointVisible } from './vision.ts';
import { teamZones } from './teams.ts';
import { updateGhostMemory, type GhostMemory } from './exploredMemory.ts';
import { beginConcealmentFrame, isConcealed, resetConcealmentForTest } from '../render/concealment.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, R_BEACON, SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

function fourSeatBuild(teams: (number | undefined)[] | undefined, local = 0): World {
  const w = makeWorld(0x5195);
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]!, ...(teams?.[s] !== undefined ? { team: teams[s] } : {}) })),
    botSeats: [1, 2, 3],
  });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.localPlayerId = asPlayerId(local);
  w.creatures.clear();
  w.primitives.clear();
  return w;
}

function prim(w: World, seat: number, x: number, y: number): Primitive {
  const p = w.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const pr: Primitive = {
    id, type: SparkType.Square, placerColor: p.color, placedBy: p.id, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: p.color, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, pr);
  return pr;
}

const P = (n: number): PlayerId => asPlayerId(n);
// Deep in the bottom-left quarter (zone 3 = seat 3's ground), far from the quarry and the cursor.
const SW_DEEP = { x: 300, y: 800 };
const CURSOR = { x: 1500, y: 300 };

beforeEach(() => resetConcealmentForTest());

describe('S195 N1 — teammates share vision in BUILD', () => {
  it('the fixture is fog-up (networked, PLAYING, BUILD) and 2v2 is stamped west = {0,3}', () => {
    const w = fourSeatBuild([0, 1, 1, 0]);
    expect(fogActive(w)).toBe(true);
    expect(w.teams).toEqual([0, 1, 1, 0]);
  });

  it('⭐ a TEAMMATE primitive is a vision beacon for me; an ENEMY one is not', () => {
    const w = fourSeatBuild([0, 1, 1, 0]);
    prim(w, 3, SW_DEEP.x, SW_DEEP.y); // teammate
    prim(w, 1, 1700, 200); // enemy
    const src = computeVisionSourcesForSeat(w, P(0), CURSOR);
    const beacons = src.filter((s) => s.radius === R_BEACON);
    expect(beacons).toEqual([{ x: SW_DEEP.x, y: SW_DEEP.y, radius: R_BEACON }]);
  });

  it('⛔ NEGATIVE — FFA: the same board gives me no beacon from seat 3 (pre-S195 behaviour)', () => {
    const w = fourSeatBuild(undefined);
    expect(w.teams).toBeUndefined();
    prim(w, 3, SW_DEEP.x, SW_DEEP.y);
    const src = computeVisionSourcesForSeat(w, P(0), CURSOR);
    expect(src.filter((s) => s.radius === R_BEACON)).toEqual([]);
    expect(isPointVisible(src, SW_DEEP.x, SW_DEEP.y)).toBe(false);
  });

  it('⭐ REACH through the frame protocol: a teammate thing in the dark is NOT concealed, an enemy one is', () => {
    const w = fourSeatBuild([0, 1, 1, 0]);
    beginConcealmentFrame(w, CURSOR);
    expect(isConcealed(SW_DEEP.x, SW_DEEP.y, P(3))).toBe(false); // teammate
    expect(isConcealed(SW_DEEP.x, SW_DEEP.y, P(2))).toBe(true); // enemy, same dark spot
    // FFA: seat 3 is an enemy like any other
    const f = fourSeatBuild(undefined);
    beginConcealmentFrame(f, CURSOR);
    expect(isConcealed(SW_DEEP.x, SW_DEEP.y, P(3))).toBe(true);
    expect(isConcealed(SW_DEEP.x, SW_DEEP.y, P(0))).toBe(false); // own, unchanged
  });

  it('⭐ teamZones — the team lights its whole side; FFA lights only the own quarter; a spectator none', () => {
    expect(teamZones(fourSeatBuild([0, 1, 1, 0]), 0)).toEqual([0, 3]);
    expect(teamZones(fourSeatBuild([0, 1, 1, 0]), 2)).toEqual([1, 2]);
    expect(teamZones(fourSeatBuild(undefined), 2)).toEqual([2]);
    expect(teamZones(fourSeatBuild([0, 1, 1, 0]), 7)).toEqual([]);
  });

  it('⭐ a teammate structure is never remembered as a fog ghost; an enemy one is', () => {
    const w = fourSeatBuild([0, 1, 1, 0]);
    const mate = prim(w, 3, 400, 400);
    const foe = prim(w, 1, 410, 410);
    const mem: GhostMemory = new Map();
    const sees = [{ x: 400, y: 400, radius: 200 }];
    updateGhostMemory(mem, w.primitives, sees, P(0), 1, w.teams);
    expect(mem.has(mate.id)).toBe(false);
    expect(mem.has(foe.id)).toBe(true);
    // FFA (no teams passed) — seat 3 is remembered like any enemy
    const mem2: GhostMemory = new Map();
    updateGhostMemory(mem2, w.primitives, sees, P(0), 1);
    expect(mem2.has(mate.id)).toBe(true);
  });

  it('REACH (source) — fogRenderer lights the teamZones rects and hands them to the mist', () => {
    const src = readFileSync(new URL('../render/fogRenderer.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/teamZones\(world, world\.localPlayerId as unknown as number\)/);
    expect(src).toMatch(/updateGhostMemory\(this\.memory, world\.primitives, sources, world\.localPlayerId, world\.tick, world\.teams\)/);
  });
});
