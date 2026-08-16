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
 * projection on the `main.ts's `hashWorldState(world)` call site` hot path), this test SHOULD fail and force
 * that decision to be made explicitly.
 */
import { describe, expect, it } from 'vitest';
import { makeCastleBank } from './castleBank.ts';
import { hashWorldState, NARROW_HASHED_FAMILIES } from './stateHash.ts';
import { determinismParts, FIELD_COVERAGE, hashWorldStateFull } from './stateHashFull.ts';
import { makeHunter } from './hunters/hunter.ts';
import { makePotato } from './potato.ts';
import { makeRainbow } from './rainbow.ts';
import { makePoop, makeSeagull } from './seagulls/seagull.ts';
import { makeWorld } from './world.ts';
import { makeCreature } from './creatures/creature.ts';
import { CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { makeSpawner } from './spawners/spawner.ts';
import { makeDefender } from './defenders/defender.ts';
import { makeGatherer } from './gatherers/gatherer.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { SparkType, PRIMITIVE_MAX_HP } from '../constants.ts';
import {
  asBombId,
  asBondId,
  asCreatureId,
  asDefenderId,
  asGathererId,
  asHunterId,
  asPlayerId,
  asPoopId,
  asPotatoId,
  asPrimitiveId,
  asRainbowId,
  asSeagullId,
  asSparkId,
  asSpawnerId,
  type PlayerId,
} from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from './worldTypes.ts';

const P0 = asPlayerId(0) as PlayerId;

/**
 * Hashed fields that are NOT per-entity collection families, so they carry no
 * `prefix<id>:` part and are excluded from the prefix table below. Listed explicitly so
 * that adding a new hashed FAMILY forces it into the prefix table rather than silently
 * passing as "some scalar".
 */
const HASHED_NON_FAMILY: ReadonlySet<string> = new Set([
  'tick', 'scoreProgress', 'scoreByPlayer', 'rngSeed', 'gameState', 'lastWinnerId',
  'hunterSpawned', 'rainbowSwitchTick', 'sudokuFiredThisMatch', 'activeCinematicPlayerId',
  'nextPrimitiveId', 'nextBondId', 'nextCreatureId', 'nextSpawnerId', 'nextDefenderId',
  'nextBombId', 'nextHunterId', 'nextPotatoId', 'nextRainbowId', 'nextSeagullId',
  'nextPoopId', 'sudoku', 'pendingCreatureSpawn',
  // V6-1.1 — the gatherer allocator cursor (a scalar, like every other nextXId above).
  'nextGathererId',
  // S146 P2 — the descending NEGATIVE allocator for reducer-minted pulls. Also a scalar.
  'nextPulledSparkId',
]);

/** Adds one primitive, one bond between two primitives, and one free spark. */
function addPrimBondSpark(w: World): void {
  const mk = (id: number, x: number): Primitive => ({
    id: asPrimitiveId(id), type: SparkType.Dot, placerColor: 0xffffff, placedBy: P0,
    createdTick: 0, pos: { x, y: 0 }, prevPos: { x, y: 0 }, bonds: new Set(),
    ownerColor: 0xffffff, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
  });
  const a = mk(101, 10);
  const b = mk(102, 40);
  w.primitives.set(a.id, a);
  w.primitives.set(b.id, b);
  const bondId = asBondId(201);
  w.bonds.set(bondId, {
    id: bondId, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0,
  });
  a.bonds.add(bondId);
  b.bonds.add(bondId);
  w.freeSparks.set(
    asSparkId(301),
    makeFreeSpark({
      id: asSparkId(301), type: SparkType.Dot, pos: { x: 70, y: 0 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    }),
  );
}

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

describe('FIELD_COVERAGE — the forcing function', () => {
  it('marks every family the NARROW hash reads as hashed (this is what stops the two drifting)', () => {
    for (const fam of NARROW_HASHED_FAMILIES) {
      expect(FIELD_COVERAGE[fam]).toBe('hashed');
    }
  });

  it('every entry is exactly one of hashed | acknowledged', () => {
    for (const [fam, verdict] of Object.entries(FIELD_COVERAGE)) {
      expect(verdict, `field ${fam}`).toMatch(/^(hashed|acknowledged)$/);
    }
  });

  it('the acknowledged set is the documented one — a NEW silent exclusion fails here', () => {
    // Deliberately a hard-coded expectation: adding a field and quietly marking it
    // 'acknowledged' to dodge the hash must break a test, not just pass tsc.
    const acknowledged = Object.entries(FIELD_COVERAGE)
      .filter(([, v]) => v === 'acknowledged')
      .map(([k]) => k)
      .sort();
    expect(acknowledged).toEqual(
      [
        'botSeats',
        'cinematicsEnabled',
        'comboToastTick',
        'currentCinematicEvent',
        'diagnostics',
        'effects',
        'gameMode',
        'isHost',
        'lastDiscoveredComboNames',
        'localPlayerId',
        'pendingCinematics',
        'players',
      ].sort(),
    );
  });

  /**
   * CHECK finding F4 — the bridge from the LABEL to the RUNTIME. Before this test,
   * `'hashed'` was a hand-written string with no executable link to the hash body:
   * RALPH:PATROL deleted the entire hunters projection loop and tsc stayed at 0 with
   * every test green. Seven of the families had no sensitivity coverage at all.
   *
   * Each anchored regex is unambiguous even where prefixes nest, because a prefix is
   * always followed by digits: /^p\d+:/ cannot match `po1:` or `pp1:`.
   */
  it('EVERY family marked hashed actually CONTRIBUTES a part (deleting a loop must fail)', () => {
    const w = worldWithEntities();
    // Populate the families the shared fixture does not cover.
    w.bombs.set(asBombId(1), {
      id: asBombId(1),
      pos: { x: 10, y: 10 },
      radius: 40,
      spawnedAtTick: 1,
      dissipateAtTick: 90,
    });
    w.hunters.set(
      asHunterId(1),
      makeHunter({ id: asHunterId(1), targetPlayerId: P0, pos: { x: 20, y: 20 }, spawnedAtTick: 1 }),
    );
    w.potatoes.set(asPotatoId(1), makePotato({ id: asPotatoId(1), pos: { x: 30, y: 30 }, spawnedAtTick: 1 }));
    w.rainbows.set(asRainbowId(1), makeRainbow({ id: asRainbowId(1), pos: { x: 40, y: 40 }, spawnedAtTick: 1 }));
    w.seagulls.set(
      asSeagullId(1),
      makeSeagull({ id: asSeagullId(1), pos: { x: 50, y: 50 }, vx: 2, spawnedAtTick: 1 }),
    );
    w.poops.set(asPoopId(1), makePoop({ id: asPoopId(1), pos: { x: 60, y: 60 }, spawnedAtTick: 1 }));
    // V6-1.1 — a bought gatherer, so the new family contributes a part here too.
    w.gatherers.set(
      asGathererId(1),
      makeGatherer({ id: asGathererId(1), ownerPlayerId: P0, pos: { x: 70, y: 70 }, spawnedAtTick: 1 }),
    );
    // S146 P2 — a shape held in a castle INVENTORY, so the family contributes a part here too.
    // The inventory is a per-type TALLY, not a list of out-of-world entities.
    const invBank = makeCastleBank();
    invBank[SparkType.Triangle as number] = 1;
    w.castleBanks.set(P0, invBank);
    // S141 P2 — a queued order, so the new family contributes a part here too.
    w.gathererOrders.set(P0, [SparkType.Square, SparkType.Circle, SparkType.Square]);
    w.fouledPrimitives.add(asPrimitiveId(3));
    w.discoveredCombos.add('0->1');
    w.godlyFiredThisMatch.add('voltkin');
    addPrimBondSpark(w);

    const parts = determinismParts(w);
    const EXPECTED: ReadonlyArray<readonly [string, RegExp]> = [
      ['primitives', /^p\d+:/],
      ['bonds', /^b\d+:/],
      ['freeSparks', /^s\d+:/],
      ['creatures', /^c\d+:/],
      ['creatureSpawners', /^cs\d+:/],
      ['defenders', /^d\d+:/],
      ['gatherers', /^ga\d+:/],
      ['castleBanks', /^cb\d+:/],
      ['gathererOrders', /^go\d+:/],
      ['bombs', /^bo\d+:/],
      ['hunters', /^h\d+:/],
      ['potatoes', /^po\d+:/],
      ['rainbows', /^ra\d+:/],
      ['seagulls', /^sg\d+:/],
      ['poops', /^pp\d+:/],
      ['fouledPrimitives', /^fo:\d/],
      ['discoveredCombos', /^dc:./],
      ['godlyFiredThisMatch', /^gf:./],
    ];
    for (const [family, re] of EXPECTED) {
      expect(FIELD_COVERAGE[family as keyof typeof FIELD_COVERAGE], `${family} must be hashed`).toBe(
        'hashed',
      );
      expect(
        parts.some((p) => re.test(p)),
        `family '${family}' is marked 'hashed' but contributed NO part matching ${re} — its projection loop is missing`,
      ).toBe(true);
    }
    // And every hashed collection family is represented above, so a NEW hashed family
    // cannot be added without extending this list.
    const hashedFamilies = Object.entries(FIELD_COVERAGE)
      .filter(([k, v]) => v === 'hashed' && !HASHED_NON_FAMILY.has(k))
      .map(([k]) => k)
      .sort();
    expect(hashedFamilies).toEqual(EXPECTED.map(([f]) => f).sort());
  });

  it('world SCALARS marked hashed are sensitive — rngSeed above all (CHECK F8)', () => {
    const w = worldWithEntities();
    const h0 = hashWorldStateFull(w);
    w.rngSeed = (w.rngSeed ^ 0x5eed) >>> 0;
    expect(hashWorldStateFull(w)).not.toBe(h0); // the canonical desync root, now visible
    const h1 = hashWorldStateFull(w);
    w.nextPrimitiveId = (w.nextPrimitiveId + 1) as typeof w.nextPrimitiveId;
    expect(hashWorldStateFull(w)).not.toBe(h1); // allocator cursor divergence
    const h2 = hashWorldStateFull(w);
    w.gameState = 'WIN';
    expect(hashWorldStateFull(w)).not.toBe(h2);
  });
});
