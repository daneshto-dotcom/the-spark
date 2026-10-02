/**
 * ⛔ S193 (audit CF-1) — A STRUCK WELD CARRIES NOTHING.
 *
 * `severWithCarry` reads the carry owner off the struck bond's `aId`. On a MIXED weld that end is an
 * accident of placement order, so a seat-0 Voltkin's bolt on a weld whose `aId` was seat 0's carried
 * the overkill into seat 0's OWN connectors — the S162 chain CARRY-1 closed only for strictly-enemy
 * bonds. Measured before the fix on this board: the Voltkin felled its own C–D.
 *
 * Board: seat 1 A–B · WELD C–B (aId = C, seat 0) · seat 0 C–D, D–E. Four connectors → pool 36.
 * The weld is pre-banked 40; the bolt's first link (jump 1) adds 16 → 56, the pool takes 36 and leaves
 * 20 on the weld. After the sever, seat 0's C–D–E is a 2-connector structure (pool 14), so a carry of
 * 20 WOULD fell C–D. Driven through the real `applyVoltkinChain` (the CF-1 attacker) and the real
 * `SEVER_BOND` dispatch.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asCreatureId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../types.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { chainJumpFifths, applyVoltkinChain } from './creatures/voltkinChain.ts';
import { creatureAttackFifths, makeVoltkinCreature } from './creatures/creature.ts';
import { structurePoolFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x193cf1);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

function prim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const color = w.players.get(seat)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type: SparkType.Square, placerColor: color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y),
    stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** seat 1 A–B · weld C–B with aId = C (seat 0) · seat 0 C–D, D–E. */
function weldBoard(w: World) {
  const A = prim(w, P1, 500, 400);
  const B = prim(w, P1, 540, 400);
  const C = prim(w, P0, 580, 400);
  const D = prim(w, P0, 620, 400);
  const E = prim(w, P0, 660, 400);
  const ab = link(w, A, B);
  const cb = link(w, C, B); // ⚠ aId = C — the striker's own seat
  const cd = link(w, C, D);
  const de = link(w, D, E);
  return { ab, cb, cd, de };
}

describe('⛔ S193 CF-1 — a Voltkin bolt on a weld whose aId is his own seat', () => {
  it('fells the weld, and the overkill never lands on his OWN connectors', () => {
    const w = board();
    const b = weldBoard(w);
    const volt = makeVoltkinCreature({
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0,
      pos: { x: 560, y: 380 }, targetPos: { x: 560, y: 380 }, spawnedAtTick: w.tick,
    });
    w.creatures.set(volt.id, volt);
    // Arithmetic, from the constants: pool(4) = 36; the first link is jump 1.
    expect(structurePoolFifths(4)).toBe(36);
    const hit = chainJumpFifths(creatureAttackFifths(volt), 1);
    expect(hit).toBe(16);
    w.bonds.get(b.cb)!.damageFifths = 40; // 40 + 16 − 36 = 20 left on the weld ≥ pool(2) = 14
    expect(structurePoolFifths(2)).toBe(14);

    // Seed at the weld's own midpoint; A–B is the seed (excluded from the links), so the only enemy
    // bond in hop range is the weld itself (seat 0's C–D and D–E are not enemy bonds to him).
    const links = applyVoltkinChain(w, volt, { kind: 'bond', id: b.ab, pos: { x: 560, y: 400 } });
    expect(links, 'fixture: the bolt reached exactly the weld').toBe(1);
    expect(w.bonds.has(b.cb), 'the weld falls').toBe(false);
    expect(w.bonds.has(b.cd), 'his OWN C–D stands — no carry through a weld').toBe(true);
    expect(w.bonds.has(b.de), 'his OWN D–E stands').toBe(true);
  });
});

describe('S193 CF-1 — severWithCarry on a struck weld', () => {
  it('a weld fells only itself whichever seat its aId is — its aId seat keeps its own tower', () => {
    for (const aSeat of [P0, P1]) {
      const w = board();
      const other = aSeat === P0 ? P1 : P0;
      // The aId seat owns the BIG side (3 connectors), so a carry keyed on aId would have landed there.
      const X = prim(w, aSeat, 580, 400);
      const own = [link(w, X, prim(w, aSeat, 620, 400))];
      own.push(link(w, X, prim(w, aSeat, 580, 440)), link(w, X, prim(w, aSeat, 580, 360)));
      const Y = prim(w, other, 540, 400);
      link(w, Y, prim(w, other, 500, 400));
      const weld = link(w, X, Y); // aId = X
      expect(damageConnector(w, weld, 150, null, 'physical')).toBe(true);
      const felled = severWithCarry(w, weld, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P0, cause: 'unit' }));
      expect(felled, `aId seat ${aSeat}`).toBe(1);
      for (const id of own) expect(w.bonds.has(id), `aId seat ${aSeat}: its own connector ${id} stands`).toBe(true);
    }
  });

  it('negative (the positive half of CARRY-1 is untouched): a same-owner struck bond still carries', () => {
    const w = board();
    const A = prim(w, P1, 500, 400);
    const B = prim(w, P1, 540, 400);
    const G = prim(w, P1, 540, 440);
    const ab = link(w, A, B);
    const bg = link(w, B, G);
    expect(damageConnector(w, ab, 150, null, 'physical')).toBe(true);
    expect(severWithCarry(w, ab, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P0, cause: 'unit' }))).toBe(2);
    expect(w.bonds.has(bg)).toBe(false);
  });
});
