/**
 * SPARK — S190 (s188/draft-atk) — triage DA-10: what `Creature.atkFifths` costs ON THE WIRE.
 *
 * After the third draft (wave 11) nearly every creature a seat owns carries the field, and the S182
 * per-entity budget in `netWireSize.test.ts` measures an UNDRAFTED boss, so it cannot see it. This
 * sibling measures the marginal wire chars per creature on a drafted board, through the exact
 * transport form (`stripWirePrevPos` + `wireNumberReplacer`), and PINS the cost so a change to it is
 * a red test rather than a surprise in the C5 lag numbers. A sibling file, not an edit to
 * `netWireSize.test.ts`, because the `s189/net` branch owns that file's wire-budget work.
 *
 * The number for the C5 work: a race unit's `,"atkFifths":8` is 14 chars (a boss's 3-digit value,
 * 16). At the S182 wire table's 120 creatures that is 120 × 14 = 1680 chars ≈ 1.6 KiB per snapshot,
 * ≈ 2 % of the 84.0 KiB baseline — the same order as S187's `maxEhp` (11 chars) beside it.
 */
import { describe, expect, it } from 'vitest';
import { netSnapshot, stripWirePrevPos, wireNumberReplacer } from './save.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import type { DraftPick } from './draft.ts';
import type { CreatureType } from './creatures/creature.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { asPlayerId, asSpawnerId } from '../types.ts';

const SEAT = asPlayerId(0); // `makeWorld` seats player 0 (the save.replay.test.ts convention)
const N = 20;

function wireJson(world: World): string {
  const msg = { kind: 'NETSNAPSHOT' as const, snapshotSeq: 1, snapshot: netSnapshot(world) };
  return JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer);
}

/**
 * `n` creatures of `type` for a seat holding `picks`, on an otherwise empty board. A race unit is
 * spawner-sourced (its own population cap, not the one-live-per-(owner, type) latch a null spawner
 * answers to); a boss is null-sourced (the latch exempts bosses; a spawner would cap it at 10).
 */
function board(type: CreatureType, picks: DraftPick[], n: number): World {
  const w = makeWorld(0x5190d);
  w.players.get(SEAT)!.draftPicks = [...picks];
  for (let i = 0; i < n; i++) {
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: SEAT,
      pos: { x: 400 + i * 7.3333333, y: 600.5555555 }, targetPos: { x: 500.111111, y: 700.222222 },
      sourceSpawnerId: type === 'raceUnit' ? asSpawnerId(40) : null,
    } as never);
  }
  expect(w.creatures.size).toBe(n);
  return w;
}

/**
 * Wire chars ONE creature costs for a seat holding `picks`, measured against the same seat with no
 * creatures — so the seat's own `draftPicks` list (it rides the wire too) cancels out.
 */
const creatureCost = (type: CreatureType, picks: DraftPick[]) =>
  (wireJson(board(type, picks, N)).length - wireJson(board(type, picks, 0)).length) / N;

/** What `picks` adds to one creature's wire form over an undrafted seat's creature. */
const perCreature = (type: CreatureType, picks: DraftPick[]) => creatureCost(type, picks) - creatureCost(type, []);

describe('DA-10 — the wire cost of a drafted board, per creature', () => {
  it('a race unit: the S187 pool field is 11 chars, and the S190 strike field adds exactly 14 more', () => {
    const poolOnly = perCreature('raceUnit', ['hp', 'def']); // `,"maxEhp":8`
    const both = perCreature('raceUnit', ['hp', 'def', 'atk', 'pen']); // + `,"atkFifths":8`
    const strikeOnly = perCreature('raceUnit', ['atk', 'pen']);
    expect(poolOnly).toBe(',"maxEhp":8'.length);
    expect(strikeOnly).toBe(',"atkFifths":8'.length);
    expect(both - poolOnly).toBe(14);
  });

  it('a tier-9 boss: a 3-digit strike costs 16 chars', () => {
    expect(perCreature(T9_BOSS_TYPE.vampires, ['atk'])).toBe(',"atkFifths":165'.length);
  });

  it('negative: an undrafted or pool-only board carries no strike field at all', () => {
    expect(wireJson(board('raceUnit', [], N))).not.toContain('atkFifths');
    expect(wireJson(board('raceUnit', ['hp', 'def'], N))).not.toContain('atkFifths');
  });
});
