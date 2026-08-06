/**
 * SPARK — S133 P1 tests for the WIDE determinism hash + the coverage contract.
 *
 * The load-bearing test in this file is
 * `'the NARROW hash is BLIND where the WIDE hash sees'`. It is the executable
 * statement of why this module exists: before S133, a creature taking damage
 * produced an IDENTICAL `hashWorldState`, so four differential harnesses that
 * assert hash equality could not see entity divergence at all. If someone later
 * reverts the widening, that test fails and says so.
 *
 * Note the DIRECTION of its narrow-hash assertion: it asserts the narrow hash is
 * UNCHANGED. That is a characterization of a deliberate limitation, not an
 * aspiration — if the narrow hash is ever widened (putting a per-entity
 * projection on the `main.ts:1706` hot path), this test SHOULD fail and force
 * that decision to be made explicitly.
 */
import { describe, expect, it } from 'vitest';
import { hashWorldState, NARROW_HASHED_FAMILIES } from './stateHash.ts';
import { FAMILY_COVERAGE, hashWorldStateFull } from './stateHashFull.ts';
import { makeWorld } from './world.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { makeSpawner } from './spawners/spawner.ts';
import { makeDefender } from './defenders/defender.ts';
import {
  asCreatureId,
  asDefenderId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type PlayerId,
} from '../types.ts';
import type { World } from './worldTypes.ts';

const P0 = asPlayerId(0) as PlayerId;

/** A world with one chewer, one spawner and one defender — i.e. entity families the narrow hash cannot see. */
function worldWithEntities(): World {
  const w = makeWorld(0);
  w.creatures.set(
    asCreatureId(1),
    makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(1),
      ownerPlayerId: P0,
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
      spawnedAtTick: 0,
      sourceSpawnerId: asSpawnerId(7),
    }),
  );
  w.creatureSpawners.set(
    asSpawnerId(7),
    makeSpawner({
      id: asSpawnerId(7),
      ownerPlayerId: P0,
      anchorPrimitiveId: asPrimitiveId(3),
      recipeId: 'voltkin',
      ignitedAtTick: 0,
      nextSpawnTick: 60,
    }),
  );
  w.defenders.set(
    asDefenderId(2),
    makeDefender({
      id: asDefenderId(2),
      kind: 'turret',
      ownerPlayerId: P0,
      anchorPrimitiveId: asPrimitiveId(4),
      recipeId: 'laserTurret',
      pos: { x: 300, y: 300 },
      registeredAtTick: 0,
    }),
  );
  return w;
}

describe('hashWorldStateFull — purity and order invariance', () => {
  it('two structurally identical worlds hash equal', () => {
    expect(hashWorldStateFull(worldWithEntities())).toBe(hashWorldStateFull(worldWithEntities()));
  });

  it('is INVARIANT to Map insertion order', () => {
    const a = worldWithEntities();
    const b = worldWithEntities();
    const c1 = a.creatures.get(asCreatureId(1))!;
    // Rebuild b's creature map with a second entry inserted BEFORE the first.
    const extra = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(9),
      ownerPlayerId: P0,
      pos: { x: 5, y: 5 },
      targetPos: { x: 6, y: 6 },
      spawnedAtTick: 0,
      sourceSpawnerId: asSpawnerId(7),
    });
    a.creatures.set(asCreatureId(9), extra);
    b.creatures.clear();
    b.creatures.set(asCreatureId(9), extra);
    b.creatures.set(asCreatureId(1), c1);
    expect([...b.creatures.keys()]).not.toEqual([...a.creatures.keys()]); // genuinely different order
    expect(hashWorldStateFull(b)).toBe(hashWorldStateFull(a)); // ...same hash
  });
});

describe('hashWorldStateFull — SENSITIVITY to the families S133 made visible', () => {
  it('the NARROW hash is BLIND where the WIDE hash sees (the reason this module exists)', () => {
    const w = worldWithEntities();
    const narrowBefore = hashWorldState(w);
    const wideBefore = hashWorldStateFull(w);

    // Exactly what `damageCreature` does: the ONE `.hp -=` in the whole tree.
    w.creatures.get(asCreatureId(1))!.hp -= 1;

    expect(hashWorldState(w)).toBe(narrowBefore); // ⚠ narrow cannot see it — characterized, not endorsed
    expect(hashWorldStateFull(w)).not.toBe(wideBefore); // wide catches it
  });

  it('chewProgress — bond damage — flips the wide hash and not the narrow one', () => {
    // chewProgress IS the bond's HP (CONNECTOR_HP = CHEW_HITS); the bond itself stores
    // no damage state, which is why excluding this field would leave bond-damage
    // desync permanently invisible.
    const w = worldWithEntities();
    const narrowBefore = hashWorldState(w);
    const wideBefore = hashWorldStateFull(w);
    w.creatures.get(asCreatureId(1))!.chewProgress = 4; // 4 of CHEW_HITS=5
    expect(hashWorldState(w)).toBe(narrowBefore);
    expect(hashWorldStateFull(w)).not.toBe(wideBefore);
  });

  it('defender hp flips the wide hash (today dead state — this is the tripwire for when it is not)', () => {
    const w = worldWithEntities();
    const before = hashWorldStateFull(w);
    w.defenders.get(asDefenderId(2))!.hp -= 1;
    expect(hashWorldStateFull(w)).not.toBe(before);
  });

  it('spawner cadence (nextSpawnTick / spawnedCount) flips the wide hash', () => {
    const w = worldWithEntities();
    const before = hashWorldStateFull(w);
    w.creatureSpawners.get(asSpawnerId(7))!.nextSpawnTick += 1;
    const afterCadence = hashWorldStateFull(w);
    expect(afterCadence).not.toBe(before);
    w.creatureSpawners.get(asSpawnerId(7))!.spawnedCount += 1;
    expect(hashWorldStateFull(w)).not.toBe(afterCadence);
  });

  it('creature state-machine transitions and positions flip the wide hash', () => {
    const w = worldWithEntities();
    const c = w.creatures.get(asCreatureId(1))!;
    const h0 = hashWorldStateFull(w);
    c.pos.x += 0.0001; // sub-pixel, matching the narrow hash's sensitivity posture
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    c.ticksInState += 1;
    expect(hashWorldStateFull(w)).not.toBe(h1);
  });

  it('set-valued families (fouledPrimitives, discoveredCombos) flip the wide hash', () => {
    const w = worldWithEntities();
    const h0 = hashWorldStateFull(w);
    w.fouledPrimitives.add(asPrimitiveId(3));
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    w.discoveredCombos.add('0->1');
    expect(hashWorldStateFull(w)).not.toBe(h1);
  });

  it('still sees everything the NARROW hash sees (wide is a superset, not a replacement)', () => {
    const w = worldWithEntities();
    const h0 = hashWorldStateFull(w);
    w.scoreByPlayer.set(P0, 42);
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    w.tick += 1;
    expect(hashWorldStateFull(w)).not.toBe(h1);
  });
});

describe('FAMILY_COVERAGE — the forcing function', () => {
  it('marks every family the NARROW hash reads as hashed (this is what stops the two drifting)', () => {
    for (const fam of NARROW_HASHED_FAMILIES) {
      expect(FAMILY_COVERAGE[fam]).toBe('hashed');
    }
  });

  it('every entry is exactly one of hashed | acknowledged', () => {
    for (const [fam, verdict] of Object.entries(FAMILY_COVERAGE)) {
      expect(verdict, `family ${fam}`).toMatch(/^(hashed|acknowledged)$/);
    }
  });

  it('the acknowledged set is the documented one — a NEW silent exclusion fails here', () => {
    // Deliberately a hard-coded expectation: adding a family and quietly marking it
    // 'acknowledged' to dodge the hash must break a test, not just pass tsc.
    const acknowledged = Object.entries(FAMILY_COVERAGE)
      .filter(([, v]) => v === 'acknowledged')
      .map(([k]) => k)
      .sort();
    expect(acknowledged).toEqual(
      ['botSeats', 'effects', 'lastDiscoveredComboNames', 'pendingCinematics', 'players'].sort(),
    );
  });
});
