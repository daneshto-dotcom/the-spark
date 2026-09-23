/**
 * SPARK — ⛔ DOES THE DRAFTED BUFF ACTUALLY REACH A UNIT THE GAME SPAWNS?
 *
 * The arithmetic is proven in `draft.test.ts` and the wire in `draftRoundTrip.test.ts`. Neither
 * proves the thing the player cares about: that a seat which drafted `hp` gets tougher creatures.
 * Those two would both stay green if `applySpawnCreature` simply never passed the picks along —
 * which is exactly how a feature ships "done, gates green" and does nothing.
 *
 * So this drives the REAL spawn reducer through `dispatch`, the same path every creature in the
 * game is born through, and reads the pool off the creature that comes out.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch } from './world.ts';
import { creatureMaxEhp } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { unitPoolFifths } from './stats.ts';
import { raceUnitPoolAfterPicks, type DraftPick } from './draft.ts';
import { RACE_UNIT_DEF, RACE_UNIT_HP } from '../constants.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import type { World } from './world.ts';

const AT = { x: 400, y: 400 };

function spawn(world: World, seat: PlayerId, creatureType: 'raceUnit' | 'chewer'): void {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType,
    ownerPlayerId: seat,
    pos: { ...AT },
    targetPos: { ...AT },
  } as never);
}

function withPicks(picks: DraftPick[]): { w: World; seat: PlayerId } {
  const w = makeWorld(0x187);
  const seat = [...w.players.keys()][0] as PlayerId;
  const pl = w.players.get(seat);
  if (pl === undefined) throw new Error('fixture: seat 0 missing');
  pl.draftPicks = [...picks];
  return { w, seat };
}

describe('the buff reaches a unit the game actually spawns', () => {
  it('⛔ a seat that drafted HEALTH spawns a race unit with the buffed pool — 6 becomes 7', () => {
    const { w, seat } = withPicks(['hp']);
    spawn(w, seat, 'raceUnit');
    const c = [...w.creatures.values()].find((x) => x.type === 'raceUnit');
    if (c === undefined) throw new Error('fixture: the race unit did not spawn');

    expect(unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)).toBe(6);
    expect(creatureMaxEhp(c)).toBe(raceUnitPoolAfterPicks(1));
    expect(creatureMaxEhp(c)).toBe(7);
    expect(c.ehp).toBe(7); // born at full health, at the BUFFED full
  });

  it('a seat that drafted NOTHING spawns the unbuffed unit, and carries no extra field', () => {
    const { w, seat } = withPicks([]);
    spawn(w, seat, 'raceUnit');
    const c = [...w.creatures.values()].find((x) => x.type === 'raceUnit');
    if (c === undefined) throw new Error('fixture: the race unit did not spawn');
    expect(creatureMaxEhp(c)).toBe(6);
    expect(c.maxEhp).toBeUndefined();
  });

  it('compounds across drafts — two health picks give 8', () => {
    const { w, seat } = withPicks(['hp', 'hp']);
    spawn(w, seat, 'raceUnit');
    const c = [...w.creatures.values()].find((x) => x.type === 'raceUnit');
    if (c === undefined) throw new Error('fixture: the race unit did not spawn');
    expect(creatureMaxEhp(c)).toBe(8);
  });

  it('⛔ a DAMAGE pick does not touch the pool — the two tracks stay separate', () => {
    const { w, seat } = withPicks(['atk', 'pen']);
    spawn(w, seat, 'raceUnit');
    const c = [...w.creatures.values()].find((x) => x.type === 'raceUnit');
    if (c === undefined) throw new Error('fixture: the race unit did not spawn');
    expect(creatureMaxEhp(c)).toBe(6);
  });

  it('reaches a TOWER-spawned creature too, not only the castle’s own unit', () => {
    // The chewer comes from a pentagram rather than the castle, through the same reducer. "Every
    // unit you spawn" is the owner's wording and it does not carve out the tower-made ones.
    const { w, seat } = withPicks(['hp']);
    const base = unitPoolFifths(getCreatureConfig('chewer').hp, getCreatureConfig('chewer').def);
    spawn(w, seat, 'chewer');
    const c = [...w.creatures.values()].find((x) => x.type === 'chewer');
    if (c === undefined) throw new Error('fixture: the chewer did not spawn');
    expect(creatureMaxEhp(c)).toBeGreaterThan(base);
  });

  it('⚠ buffs only the DRAFTING seat — a second seat is untouched', () => {
    const { w, seat } = withPicks(['hp', 'hp', 'hp']);
    const other = asPlayerId(1);
    if (!w.players.has(other)) return; // single-seat fixture: nothing to compare
    spawn(w, seat, 'raceUnit');
    spawn(w, other, 'raceUnit');
    const mine = [...w.creatures.values()].find((x) => x.ownerPlayerId === seat);
    const theirs = [...w.creatures.values()].find((x) => x.ownerPlayerId === other);
    if (mine === undefined || theirs === undefined) throw new Error('fixture: both seats must spawn');
    expect(creatureMaxEhp(mine)).toBeGreaterThan(creatureMaxEhp(theirs));
    expect(creatureMaxEhp(theirs)).toBe(6);
  });
});
