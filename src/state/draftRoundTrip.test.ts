/**
 * SPARK — ⛔ THE DRAFT BUFF MUST SURVIVE THE WIRE. THIS IS THE TEST THAT CATCHES IT WHEN IT DOES NOT.
 *
 * ## The bug this exists for, which was real and shipped-adjacent
 *
 * `serializeCreature` emits `ehp` ONLY when the creature is damaged — historically
 * `c.ehp < unitPoolFifths(cfg.hp, cfg.def)` — so an undamaged creature costs no bytes and the
 * receiving peer rebuilds its pool from ITS OWN compiled `hp`/`def`. `save.ts` calls that coupling
 * *"the R71 SHARED-CONSTANT HAZARD, KNOWINGLY RETAINED"*.
 *
 * A buffed race unit sits at **7** against a config pool of **6**. `7 < 6` is false. So the buffed
 * creature wrote NOTHING, and the peer rebuilt it at 6. The buff worked on the host's screen and did
 * not exist on the joiner's — a divergence with no error, no warning and no failing test, because
 * every existing round-trip test uses unbuffed creatures where the old condition happens to be right.
 *
 * ⚠ **THE FIRST ASSERTION BELOW IS THE ONE THAT MATTERS**, and it is written against a creature at
 * FULL health deliberately. A damaged buffed creature always round-tripped correctly, because being
 * damaged is exactly the case the old emit condition covered. Testing the damaged one would have
 * been green over the bug.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld } from './world.ts';
import { snapshot, restore } from './save.ts';
import { makeCreature, creatureMaxEhp } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { asCreatureId } from '../types.ts';
import { unitPoolFifths } from './stats.ts';
import { raceUnitPoolAfterPicks, type DraftPick } from './draft.ts';
import { RACE_UNIT_DEF, RACE_UNIT_HP } from '../constants.ts';
import type { PlayerId } from '../types.ts';

const CHEWER = 'chewer' as const;

function worldWithBuffedCreature(picks: DraftPick[]): {
  w: ReturnType<typeof makeWorld>;
  id: ReturnType<typeof asCreatureId>;
} {
  const w = makeWorld(0x187);
  const seat = [...w.players.keys()][0] as PlayerId;
  const pl = w.players.get(seat);
  if (pl === undefined) throw new Error('seat 0 missing');
  pl.draftPicks = [...picks];

  const cfg = getCreatureConfig(CHEWER);
  const id = asCreatureId(9001);
  const c = makeCreature(cfg, {
    id,
    ownerPlayerId: seat,
    pos: { x: 100, y: 100 },
    targetPos: { x: 100, y: 100 },
    spawnedAtTick: 0,
    draftPicks: pl.draftPicks,
  });
  w.creatures.set(id, c);
  return { w, id };
}

describe('a drafted buff survives save/load', () => {
  it('⛔ keeps the buffed pool for a creature at FULL health — the case the old emit dropped', () => {
    const { w, id } = worldWithBuffedCreature(['hp']);
    const before = w.creatures.get(id);
    if (before === undefined) throw new Error('creature missing');

    const cfg = getCreatureConfig(CHEWER);
    const configPool = unitPoolFifths(cfg.hp, cfg.def);
    expect(before.ehp).toBeGreaterThan(configPool); // it is genuinely above the old threshold
    expect(before.ehp).toBe(creatureMaxEhp(before));

    const fresh = makeWorld(0x187);
    restore(snapshot(w), fresh);

    const after = fresh.creatures.get(id);
    if (after === undefined) throw new Error('creature lost in round-trip');
    expect(after.ehp).toBe(before.ehp);
    expect(creatureMaxEhp(after)).toBe(creatureMaxEhp(before));
  });

  it('keeps BOTH the current and the max for a DAMAGED buffed creature', () => {
    const { w, id } = worldWithBuffedCreature(['hp', 'hp']);
    const c = w.creatures.get(id);
    if (c === undefined) throw new Error('creature missing');
    const max = creatureMaxEhp(c);
    c.ehp = max - 3;

    const fresh = makeWorld(0x187);
    restore(snapshot(w), fresh);
    const after = fresh.creatures.get(id);
    if (after === undefined) throw new Error('creature lost');
    expect(after.ehp).toBe(max - 3);
    expect(creatureMaxEhp(after)).toBe(max);
  });

  it('leaves an UNBUFFED creature byte-identical — no maxEhp field at all', () => {
    // This is what keeps every prior save loading and every replay-equivalence guard passing.
    const { w, id } = worldWithBuffedCreature([]);
    const c = w.creatures.get(id);
    if (c === undefined) throw new Error('creature missing');
    expect(c.maxEhp).toBeUndefined();

    const snap = JSON.parse(JSON.stringify(snapshot(w))) as {
      creatures: Record<string, unknown>[];
    };
    const ser = snap.creatures.find((x) => x['id'] === (id as unknown as number));
    expect(ser).toBeDefined();
    expect(ser).not.toHaveProperty('maxEhp');
    expect(ser).not.toHaveProperty('ehp'); // undamaged and unbuffed: still costs no bytes
  });

  it('round-trips the seat’s pick list, in order', () => {
    const { w } = worldWithBuffedCreature(['hp', 'def', 'atk']);
    const seat = [...w.players.keys()][0] as PlayerId;
    const fresh = makeWorld(0x187);
    restore(snapshot(w), fresh);
    expect(fresh.players.get(seat)?.draftPicks).toEqual(['hp', 'def', 'atk']);
  });

  it('defaults a pre-S187 save to "drafted nothing" rather than throwing', () => {
    const w = makeWorld(0x187);
    const seat = [...w.players.keys()][0] as PlayerId;
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as {
      players: Record<string, unknown>[];
    };
    for (const p of snap.players) delete p['draftPicks'];
    const fresh = makeWorld(0x187);
    restore(snap as never, fresh);
    expect(fresh.players.get(seat)?.draftPicks).toEqual([]);
  });

  it('matches the owner’s worked example end to end: a 1/1/1/1 unit goes 6 → 7', () => {
    expect(unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)).toBe(6);
    expect(raceUnitPoolAfterPicks(1)).toBe(7);
  });
});
