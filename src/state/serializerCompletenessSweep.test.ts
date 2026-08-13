/**
 * SPARK — S142 P1: THE SERIALIZER-COMPLETENESS DEFECT CLASS.
 *
 * THE METHOD (worth more than either bug it caught).
 * For each entity family, compare the MUTABLE fields on its interface against the fields its
 * `serialize*` function actually emits. Any mutable field absent from the payload can never
 * round-trip — and NOTHING complains: `tsc` is silent because the serialized type simply does
 * not declare the field, every unit test that constructs the entity directly still passes, and
 * the runtime hash oracle cannot see it (`NARROW_HASHED_FAMILIES` covers only primitives,
 * bonds, freeSparks and scoreByPlayer). The failure is the ABSENCE of a field, which is exactly
 * the shape that survives a green suite.
 *
 * TWO INSTANCES FOUND IN S142, BOTH LIVE GAMEPLAY STATE:
 *
 *  1. `CreatureSpawner` cadence — `nextSpawnTick` / `lastValidatedTick` / `spawnedCount` /
 *     `ignitedAtTick` were unserialized, so `deserializeSpawner` re-seeded them. `spawnedCount`
 *     is a self-destruct CAP, so a migration-promoted host that adopted the sim worker
 *     mid-match silently granted its structure spawners a fresh lifetime. Owned by
 *     `spawners/spawnerCadenceRoundTrip.test.ts` (round-trip) and `save.replay.test.ts`
 *     (the anti-cheat wire strip that must accompany it).
 *
 *  2. `Creature.poopyUntilTick` — guarded here. The field existed and was READ every physics
 *     tick (`creatureVerlet` halves a poop-slowed creature's steering accel while
 *     `tick < poopyUntilTick`), but `SerializedCreature` never declared it. Meanwhile
 *     `SerializedSpark` has round-tripped the SAME field since S77 P3 — so the two halves of
 *     one debuff disagreed for 65 sessions, and a poop-slowed creature sped back up on every
 *     save/load, host migration and worker INIT.
 *
 * ⚠ KNOWN-AND-DELIBERATE OMISSIONS, do not "fix" them from this file's example:
 * `prevPos` on Creature / Potato / Seagull / Poop, and `targetPos` / `spawnedAtTick` on
 * Creature, are documented as host-derived and re-derived next tick. `prevPos` IS Verlet
 * velocity, so restoring it is a physics decision with its own consequences (the known
 * "poop loses velocity across host migration" carry-forward), NOT a completeness bug.
 */
import { describe, expect, it } from 'vitest';
import { restore, snapshot } from './save.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { makeWorld } from './world.ts';
import { asCreatureId, asPlayerId, asSpawnerId } from '../types.ts';

const P0 = asPlayerId(0);

function worldWithPoopedCreature(poopyUntilTick: number | undefined) {
  const w = makeWorld(1);
  w.tick = 4_000;
  const c = makeCreature(CHEWER_CONFIG, {
    id: asCreatureId(1),
    ownerPlayerId: P0,
    pos: { x: 100, y: 100 },
    targetPos: { x: 200, y: 200 },
    spawnedAtTick: 0,
    sourceSpawnerId: asSpawnerId(7),
  });
  c.poopyUntilTick = poopyUntilTick;
  w.creatures.set(c.id, c);
  return w;
}

describe('S142 P1 — a poop-slowed CREATURE keeps its debuff across a round-trip', () => {
  it('round-trips poopyUntilTick through snapshot -> restore', () => {
    const src = worldWithPoopedCreature(4_300);
    const dst = makeWorld(1);
    restore(snapshot(src), dst);
    const c = dst.creatures.get(asCreatureId(1));
    expect(c).toBeDefined();
    // Before S142 this rehydrated `undefined` — the creature silently sped back up.
    expect(c!.poopyUntilTick).toBe(4_300);
  });

  it('an UN-poopy creature stays byte-identical (the field is emit-on-defined)', () => {
    // The conditional emit is what keeps every pre-S142 save and every ordinary snapshot
    // unchanged. If this ever becomes unconditional, the byte-identity property that the
    // whole save/replay suite is built around breaks for every creature in normal play.
    const src = worldWithPoopedCreature(undefined);
    const wire = JSON.stringify(snapshot(src).creatures);
    expect(wire).not.toContain('poopyUntilTick');

    const dst = makeWorld(1);
    restore(snapshot(src), dst);
    expect(dst.creatures.get(asCreatureId(1))!.poopyUntilTick).toBeUndefined();
  });

  it('the debuff is still expressible after the round-trip (not merely stored)', () => {
    // Guards the reader contract rather than the field: every consumer gates on
    // `!== undefined && tick < poopyUntilTick`, so a restored creature must still be able to
    // report itself slowed at a tick before expiry and not slowed after it.
    const src = worldWithPoopedCreature(4_300);
    const dst = makeWorld(1);
    restore(snapshot(src), dst);
    const c = dst.creatures.get(asCreatureId(1))!;
    const slowedAt = (tick: number) => c.poopyUntilTick !== undefined && tick < c.poopyUntilTick;
    expect(slowedAt(4_299)).toBe(true);
    expect(slowedAt(4_300)).toBe(false);
  });
});
