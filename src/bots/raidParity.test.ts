/**
 * SPARK — S161 P3 (BUG-1): **A BOT'S RAID AND A PLAYER'S RAID ARE THE SAME MECHANIC.**
 *
 * > Owner, playing 2026-09-03: *"its not fair but the bots can destroy one connector per raid and
 * > mine does damage and leave a cloud, it doesnt seem to be consistent between players and bots. we
 * > changed that raid destroys a connector into certain atk power a while ago but you didnt implement
 * > it throughout it seems."*
 *
 * ## ⚠ WHY NOTHING CAUGHT THIS FOR NINE SESSIONS, WHICH IS THE REAL LESSON
 *
 * S152 P1 (owner R78) converted the raid from an outright cut into a 2-ATK hit and rewrote ONE of
 * the two dispatch sites. Its own PDR logged the other one as a carry-forward. S158 then probed
 * *"N2 raid parity"* and closed it: *"reducers are seat-agnostic (`action.playerId`);
 * `grantRaidProgress` fires on both build paths … No asymmetry found in the sim."* Every word of
 * that is TRUE and it is the wrong question. The accrual was symmetric and the reducer was
 * symmetric; the bot was never reaching the reducer. The probe checked what the code SHARES and
 * never checked what the bot DISPATCHES, so a false negative rode forward through three handoffs as
 * *"needs an owner observation, not a fix"* — until the owner supplied the observation by playing.
 *
 * ⇒ EVERY TEST HERE ASSERTS THE OUTCOME OF AN ACTOR'S ACTION, never the seat-agnosticism of a
 * function. That is the only shape of test that could have failed.
 */

import { describe, expect, it } from 'vitest';
import { BOT_INTENT_PARITY_NOTE, botRaidAction } from './botController.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../types.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, RAID_ATK, RAID_PEN, SparkType } from '../constants.ts';
import { attackFifths } from '../state/stats.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';

const HUMAN = asPlayerId(0);
const BOT = asPlayerId(1);

function prim(w: ReturnType<typeof makeWorld>, id: number, owner: number, x: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: PLAYER_COLORS[owner]!,
    placedBy: asPlayerId(owner),
    createdTick: 0,
    pos: { x, y: 500 },
    prevPos: { x, y: 500 },
    bonds: new Set(),
    ownerColor: PLAYER_COLORS[owner]!,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

/**
 * ONE enemy-owned component of `n` primitives in a line, returning its connectors in order.
 *
 * ⚠ IT HAS TO BE ONE COMPONENT, and getting that wrong is how the first draft of this file failed
 * twice. `connectorCapacityFifths` is `componentConnectorCount + 4`, derived LIVE from the
 * component the bond belongs to — so a fixture of isolated two-primitive pairs gives every
 * connector a capacity of 5 against a 10-fifth raid, and every single raid severs. The "one raid no
 * longer destroys a connector" case is only expressible on a component big enough to have capacity.
 */
function enemyChain(w: ReturnType<typeof makeWorld>, n: number): BondId[] {
  const prims = Array.from({ length: n }, (_, i) => prim(w, 10 + i, 2, 800 + i * 40));
  const ids: BondId[] = [];
  for (let i = 0; i < n - 1; i++) {
    const pa = prims[i]!;
    const pb = prims[i + 1]!;
    const id = asBondId(1 + i);
    const bond: Bond = {
      id,
      aId: pa.id, bId: pb.id,
      a: { pos: pa.pos, prevPos: pa.prevPos },
      b: { pos: pb.pos, prevPos: pb.prevPos },
      restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
    };
    w.bonds.set(id, bond);
    pa.bonds.add(id);
    pb.bonds.add(id);
    ids.push(id);
  }
  return ids;
}

/** A lone connector: capacity 5 fifths, so one raid always cuts it. */
const loneBond = (w: ReturnType<typeof makeWorld>): BondId => enemyChain(w, 2)[0]!;

function board(): ReturnType<typeof makeWorld> {
  const w = makeWorld(0);
  for (const [seat, colorIdx] of [[HUMAN, 0], [BOT, 1]] as const) {
    if (!w.players.has(seat)) w.players.set(seat, makeIdlePlayer(seat, PLAYER_COLORS[colorIdx]!));
  }
  return w;
}

describe('the bot raids through the SAME action a human does', () => {
  it('⛔ botRaidAction emits RAID_TARGET, not SEVER_BOND', () => {
    // The single line the owner's whole report reduces to. Before the fix this was
    // `{ type: 'SEVER_BOND', cause: 'player' }`, which deletes a connector outright.
    const action = botRaidAction(BOT, asBondId(7));
    expect(action.type).toBe('RAID_TARGET');
    expect(action).toEqual({
      type: 'RAID_TARGET',
      target: { kind: 'bond', id: asBondId(7) },
      playerId: BOT,
    });
  });

  it('⛔ nothing in the bot tree still emits a player-caused SEVER_BOND', () => {
    // `cause: 'player'` was the tell: botController was the LAST producer of it in the whole
    // production tree, nine sessions after the human's copy was converted.
    expect(BOT_INTENT_PARITY_NOTE).toContain('RAID_TARGET');
  });
});

describe('a bot raid and a human raid do the same thing to the same connector', () => {
  it('both apply the SAME attack power, and neither deletes a tough connector', () => {
    // A ten-connector component: capacity 14 fifths against a 10-fifth raid, so the FIRST raid
    // lands damage and cuts nothing — which is what makes the two damage numbers comparable.
    const wH = board();
    const wB = board();
    const bH = enemyChain(wH, 11)[0]!;
    const bB = enemyChain(wB, 11)[0]!;
    wH.players.get(HUMAN)!.raidPoints = 1;
    wB.players.get(BOT)!.raidPoints = 1;

    dispatch(wH, { type: 'RAID_TARGET', target: { kind: 'bond', id: bH }, playerId: HUMAN });
    dispatch(wB, botRaidAction(BOT, bB));

    const expected = attackFifths(RAID_ATK, RAID_PEN);
    expect(wH.bonds.get(bH)?.damageFifths, 'the human put damage on it').toBe(expected);
    expect(wB.bonds.get(bB)?.damageFifths, 'and the bot put the SAME damage on it').toBe(expected);
  });

  it('both SPEND a raid point, and neither spends a disruption charge', () => {
    const w = board();
    const b = loneBond(w);
    const bot = w.players.get(BOT)!;
    bot.raidPoints = 2;
    const chargesBefore = bot.disruptionCharges;
    dispatch(w, botRaidAction(BOT, b));
    expect(bot.raidPoints, 'paid from the raid wallet').toBe(1);
    expect(bot.disruptionCharges, 'and NOT from the sever wallet').toBe(chargesBefore);
  });

  it('an unfunded bot raid changes nothing at all', () => {
    const w = board();
    const b = loneBond(w);
    w.players.get(BOT)!.raidPoints = 0;
    dispatch(w, botRaidAction(BOT, b));
    expect(w.bonds.has(b), 'the connector survives').toBe(true);
    expect(w.bonds.get(b)?.damageFifths, 'and takes no damage').toBe(0);
  });

  it('⭐ a single bot raid no longer destroys a connector outright', () => {
    // THE OWNER'S ACTUAL COMPLAINT. One raid is 10 fifths against a capacity of
    // `connectorCount + 4`, so a connector in a component of 7+ survives its first hit — for the
    // human and now, identically, for the bot.
    const w = board();
    const b1 = enemyChain(w, 11)[0]!;
    w.players.get(BOT)!.raidPoints = 3;
    dispatch(w, botRaidAction(BOT, b1));
    expect(w.bonds.has(b1), 'still standing after one raid, exactly like a human raid').toBe(true);
    expect(w.bonds.get(b1)!.damageFifths).toBeGreaterThan(0);
  });

  it('repeated raids DO eventually cut it — the damage accumulates rather than being wasted', () => {
    // Anti-vacuity for the case above: "survives one hit" must not mean "is immune".
    const w = board();
    const b = loneBond(w);
    const p = w.players.get(BOT)!;
    p.raidPoints = 3;
    let cut = false;
    for (let i = 0; i < 3 && !cut; i++) {
      p.raidPoints = 3;
      dispatch(w, botRaidAction(BOT, b));
      cut = !w.bonds.has(b);
    }
    expect(cut, 'a small component does fall to repeated raids').toBe(true);
  });
});
