/**
 * S194 — a client SEVER_BOND is ALWAYS a player sever. Drives the real host stamp
 * (`stampOrReject`) and then the real gate (`canSeverBond`) — the path an INTENT takes.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { canSeverBond } from '../state/disruptionManager.ts';
import { makeWorld, type GameAction, type World } from '../state/world.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { stampOrReject, stampSenderSeat } from './intentStamp.ts';

const ATTACKER = asPlayerId(0);
const VICTIM = asPlayerId(1);

function prim(id: number, x: number): Primitive {
  return {
    id: asPrimitiveId(id), type: SparkType.Dot, placerColor: PLAYER_COLORS[1], placedBy: VICTIM,
    createdTick: 0, pos: { x, y: 100 }, prevPos: { x, y: 100 }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[1], lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
}

/** An ENEMY bond (both ends the victim's colour) and an attacker with ZERO disruption charges. */
type SeverBondAction = Extract<GameAction, { type: 'SEVER_BOND' }>;

function gate(world: World, action: GameAction): boolean {
  const b = world.bonds.get(asBondId(1))!;
  return canSeverBond(world, action as SeverBondAction, world.primitives.get(b.aId)!, world.primitives.get(b.bId)!);
}

function enemyBondWorld(): World {
  const world = makeWorld(0);
  world.gameMode = '1v1';
  world.players.clear();
  const a = makeIdlePlayer(ATTACKER, PLAYER_COLORS[0]);
  a.disruptionCharges = 0;
  world.players.set(ATTACKER, a);
  world.players.set(VICTIM, makeIdlePlayer(VICTIM, PLAYER_COLORS[1]));
  const pa = prim(1, 100);
  const pb = prim(2, 132);
  const bond: Bond = { id: asBondId(1), aId: pa.id, bId: pb.id, a: pa, b: pb, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 };
  world.primitives.set(pa.id, pa);
  world.primitives.set(pb.id, pb);
  world.bonds.set(bond.id, bond);
  pa.bonds.add(bond.id);
  pb.bonds.add(bond.id);
  return world;
}

const SPOOFED = ['unit', 'raid', 'creature', 'chewer', 'drone', 'bomb', 'physics', 'entropy', 'garbage', undefined];

describe('S194 — a client SEVER_BOND cannot choose its cause', () => {
  for (const cause of SPOOFED) {
    it(`a wire cause of ${String(cause)} is stamped to 'player' and a 0-charge attacker is REFUSED`, () => {
      const world = enemyBondWorld();
      const wire = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: VICTIM, cause } as unknown as GameAction;
      const stamped = stampOrReject(wire, ATTACKER);
      expect(stamped).not.toBeNull();
      expect(stamped).toMatchObject({ type: 'SEVER_BOND', playerId: ATTACKER, cause: 'player' });
      expect(gate(world, stamped!)).toBe(false);
    });
  }

  it('negative — the honest player sever with a charge is still allowed', () => {
    const world = enemyBondWorld();
    world.players.get(ATTACKER)!.disruptionCharges = 1;
    const stamped = stampSenderSeat({ type: 'SEVER_BOND', bondId: asBondId(1), playerId: ATTACKER, cause: 'player' }, ATTACKER);
    expect(gate(world, stamped)).toBe(true);
  });

  it('other actions are untouched (same reference when there is no playerId)', () => {
    const a = { type: 'TOGGLE_PAUSE' } as unknown as GameAction;
    expect(stampSenderSeat(a, ATTACKER)).toBe(a);
  });
});
