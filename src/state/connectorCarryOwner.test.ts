/**
 * ⛔⛔ S192 (audit CARRY-1) — THE OVERKILL CARRY STAYS ON THE STRUCK CONNECTOR'S OWNER.
 *
 * `severWithCarry` took its carry candidates from the struck bond's whole connected component with no
 * owner filter, so the leftover walked through a weld into whatever was welded on:
 *   · a seat-0 150 strike on a strictly-enemy seat-1 bond felled seat 0's OWN connectors across the weld
 *     (the S162 "my own creature destroys my own tower" chain);
 *   · the hub blast's leftover felled the hub OWNER's connectors, which `planHubBlast` spares (S157 P0).
 * Measured pre-fix on this exact board: all four bonds fell in both cases.
 *
 * Board (the auditor's): seat 1 A–B, a WELD B–C (mixed), seat 0 C–D–E. The `withOwnTail` variant adds a
 * second seat-1 connector B–G (on B, which stays attached through the weld when A–B is cut — a tail on A
 * is razed as an orphan fragment by the sever itself), so the carry has a same-owner target to use.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../types.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { applyStructureSelfDestruct } from './potatoLifecycle.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const w = makeWorld(0x191e0);
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
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(dx, dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** seat 1 A–B · weld B–C · seat 0 C–D, D–E; optionally a second seat-1 connector B–G. */
function mixed(w: World, withOwnTail = false) {
  const A = prim(w, P1, 500, 400);
  const B = prim(w, P1, 540, 400);
  const C = prim(w, P0, 580, 400);
  const D = prim(w, P0, 620, 400);
  const E = prim(w, P0, 660, 400);
  const ab = link(w, A, B);
  const bc = link(w, B, C);
  const cd = link(w, C, D);
  const de = link(w, D, E);
  const bg = withOwnTail ? link(w, B, prim(w, P1, 540, 440)) : null;
  return { ab, bc, cd, de, bg };
}

const strike = (w: World, bondId: BondId, amount: number): number => {
  expect(damageConnector(w, bondId, amount, null, 'physical'), 'fixture: the hit breaks the struck connector').toBe(true);
  return severWithCarry(w, bondId, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P0, cause: 'unit' }));
};

const ladderBlast = (w: World): void => {
  applyStructureSelfDestruct(w, { type: 'STRUCTURE_SELFDESTRUCT', blast: 'ladder', pos: { x: 400, y: 400 }, radius: 240, ownerPlayerId: P0 });
};

describe('⛔ S192 CARRY-1 — a seat-0 150 strike on a strictly-enemy bond', () => {
  it('fells the struck seat-1 connector, and the leftover never crosses the weld into seat 0\'s own', () => {
    const w = board();
    const b = mixed(w);
    expect(strike(w, b.ab, 150)).toBe(1);
    expect(w.bonds.has(b.ab)).toBe(false);
    expect(w.bonds.has(b.bc), 'the weld is not a carry target').toBe(true);
    expect(w.bonds.has(b.cd), 'seat 0\'s OWN connector stands (S162)').toBe(true);
    expect(w.bonds.has(b.de), 'seat 0\'s OWN connector stands (S162)').toBe(true);
  });

  it('positive — the carry still fells the struck owner\'s next connector (B–G), and only that', () => {
    const w = board();
    const b = mixed(w, true);
    expect(strike(w, b.ab, 150)).toBe(2);
    expect(w.bonds.has(b.bg!), 'the same-owner survivor took the overkill').toBe(false);
    expect([b.bc, b.cd, b.de].every((id) => w.bonds.has(id))).toBe(true);
  });
});

describe('⛔ S192 CARRY-1 — the hub blast (owner seat 0)', () => {
  it('the leftover on the felled enemy connector never walks into the hub OWNER\'s connectors (S157 P0)', () => {
    const w = board();
    const b = mixed(w);
    ladderBlast(w);
    expect(w.bonds.has(b.ab), 'the enemy connector inside the blast is felled').toBe(false);
    expect(w.bonds.has(b.bc)).toBe(true);
    expect(w.bonds.has(b.cd), 'the hub owner\'s connector stands').toBe(true);
    expect(w.bonds.has(b.de), 'the hub owner\'s connector stands').toBe(true);
  });

  it('with a same-owner enemy tail too: both enemy connectors fall, the owner connectors stand', () => {
    const w = board();
    const b = mixed(w, true);
    ladderBlast(w);
    expect(w.bonds.has(b.ab)).toBe(false);
    expect(w.bonds.has(b.bg!)).toBe(false);
    expect([b.bc, b.cd, b.de].every((id) => w.bonds.has(id))).toBe(true);
  });
});
