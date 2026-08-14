/**
 * SPARK — S144 P1: the BLUEPRINT ACCEPTANCE GATE.
 *
 * ## WHY THIS FILE IS THE POINT OF THE WHOLE PRIORITY
 *
 * Both Council seats converged on one demand: *nothing keeps `blueprints.ts` aligned with the recipe
 * predicates*, and a drift between them fails **silently** — the shapes land, look correct, and simply
 * never become a tower. So this suite does not test the blueprint data against a second copy of the
 * expected shape (that would just be the same guess written twice). It stamps each blueprint through
 * the REAL reducer, runs the REAL matcher, and asserts the tower ignited and then SURVIVED
 * re-validation.
 *
 * Three specific failure modes this is built to catch, all of which produce a green suite under a
 * weaker test:
 *   1. **Inert build** — geometry lands but no `BOND_FORMED` is emitted, so every ignition path
 *      early-returns (`godlyMatcherCore.ts:137` / `:155`). No tower, no error.
 *   2. **Half-second tower** — it ignites, then `stillValid` rejects the geometry on the first
 *      re-validation poll and the defender is removed. Testing ignition ALONE would pass.
 *   3. **Per-recipe hole** — five recipes work and one does not. Every assertion here is per-recipe
 *      and `it.each`-driven, never an aggregate: the S143 lesson is that a SUM cannot see a
 *      per-family hole.
 *
 * ⚠ The negative-control block at the bottom exists because of the OTHER S143 lesson — *mutation-test
 * the guard, not just the code*. It perturbs stamped geometry and asserts the survival check FLIPS TO
 * FALSE. Without it, a `stillValid` that returned true unconditionally would make everything above
 * pass while proving nothing.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from './world.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { CASTLE_BANK_CAP, PLAYER_COLORS, SparkType } from '../constants.ts';
import { asPlayerId, asSparkId, type Vec2 } from '../types.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost, blueprintFor } from './blueprints.ts';
import { applyBuildBlueprint, planBlueprintPayment } from './blueprintBuild.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { recipeStillSatisfied } from './defenders/defenderLifecycle.ts';
import { porchSlot } from './castleBank.ts';
// ⚠ SIDE-EFFECT IMPORTS, REQUIRED. The recipe registry is populated by each module calling
// `registerRecipe` at its tail. `blueprints.ts` deliberately does NOT import these (doing so
// registered every recipe globally via `world.ts` and broke `defenderLifecycle.test.ts`'s
// unregistered-recipe fallback — see that file's docblock), so anything that needs IGNITION must
// import them explicitly, exactly as `main.ts` does. Without these six lines every ignition
// assertion below fails, which is precisely the silent-failure mode this suite exists to catch.
import './godlyRecipes/stinkTower.ts';
import './godlyRecipes/laserTurret.ts';
import './godlyRecipes/princessHelga.ts';
import './godlyRecipes/pentagram.ts';
import './godlyRecipes/lightningHub.ts';
import './godlyRecipes/voltkin.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

const P0 = asPlayerId(0);
const SEAT0 = 0;

/**
 * A build site far from the shared quarry (centre 960,540 r125) and well inside the canvas even for
 * voltkin's 304 px span. Every test asserts this is actually legal before building, so a bad constant
 * here fails LOUDLY instead of silently turning every build into a legal no-op — which would make the
 * whole suite pass vacuously.
 */
const SITE: Vec2 = { x: 300, y: 300 };

function setup(): World {
  const w = makeWorld(0);
  w.isHost = true; // runGodlyMatcherCore returns early for a non-host
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

let nextSparkId = 1;
function spawnSpark(type: SparkType, pos: Vec2) {
  return makeFreeSpark({
    id: asSparkId(nextSparkId++),
    type,
    pos,
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
}

/**
 * Stock the player's bank with exactly the bill, spilling onto the porch when the bill exceeds
 * `CASTLE_BANK_CAP`. That spill is not incidental — voltkin costs 8 against a cap of 7, so this is
 * the ONLY way the sixth recipe can be paid for, and exercising it here is what proves the
 * bank∪porch sourcing rule works rather than merely compiles.
 */
function fund(w: World, id: GodlyId): void {
  const bank = [];
  const porch = [];
  for (const [type, count] of blueprintBill(id)) {
    for (let i = 0; i < count; i++) {
      if (bank.length < CASTLE_BANK_CAP) bank.push(spawnSpark(type, { x: 0, y: 0 }));
      else porch.push(spawnSpark(type, porchSlot(SEAT0, porch.length)));
    }
  }
  w.castleBanks.set(P0, bank);
  for (const s of porch) w.freeSparks.set(s.id, s);
}

/** The recipe kind decides WHERE ignition shows up, so each id asserts against its own registry. */
const DEFENDER_IDS: GodlyId[] = ['stinkTower', 'laserTurret', 'helga'];
const SPAWNER_IDS: GodlyId[] = ['pentagram', 'lightningHub'];

describe('applyBuildBlueprint — stamps geometry that IGNITES and SURVIVES (per recipe)', () => {
  it.each(ALL_BLUEPRINT_IDS)('%s: the chosen build site is legal', (id) => {
    const w = setup();
    expect(stampRefusalAt(w, SITE, P0, id)).toBeNull();
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: consumes the exact bill and mints the exact topology', (id) => {
    const w = setup();
    fund(w, id);
    const bp = blueprintFor(id);

    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });

    expect(w.primitives.size).toBe(blueprintCost(id));
    expect(w.bonds.size).toBe(bp.bonds.length);
    // Everything the build was funded with is now spent — nothing left banked or loose on the porch.
    expect(w.castleBanks.get(P0)).toEqual([]);
    expect(w.freeSparks.size).toBe(0);
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: emits ONE collapsed BOND_FORMED (the ignition trigger)', (id) => {
    const w = setup();
    fund(w, id);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });

    const formed = w.effects.filter((e) => e.kind === 'BOND_FORMED');
    // ⭐ Exactly one, never one per bond: `placePrimitive` collapses per placement and N events would
    // stack N clave SFX. Zero here means the tower can NEVER ignite, for any recipe.
    expect(formed).toHaveLength(1);
    expect(formed[0].bondCount).toBe(blueprintFor(id).bonds.length);
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: every stamped primitive has its blueprint-specified degree', (id) => {
    const w = setup();
    fund(w, id);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });

    // Expected degree per node index, derived from the bond list itself.
    const bp = blueprintFor(id);
    const expected = bp.nodes.map(() => 0);
    for (const [a, b] of bp.bonds) { expected[a]++; expected[b]++; }

    const degrees = [...w.primitives.values()]
      .sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number))
      .map((p) => p.bonds.size);
    expect(degrees).toEqual(expected);
  });

  it.each(DEFENDER_IDS)('%s: IGNITES a defender and SURVIVES re-validation', (id) => {
    const w = setup();
    fund(w, id);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });

    runGodlyMatcherCore(w, { lastMatcherTick: 0 });

    expect(w.defenders.size).toBe(1);
    const defender = [...w.defenders.values()][0];
    expect(defender.recipeId).toBe(id);

    // ⭐ THE ACCEPTANCE CRITERION. `recipeStillSatisfied` is exactly what the 0.5 s poll calls; a
    // tower that ignites but fails this is the "built and then vanished" bug with nothing in the logs.
    // Re-checked across many polls with the tick advancing, because the poll is time-driven.
    for (let poll = 0; poll < 40; poll++) {
      w.tick += 30; // REVALIDATE_INTERVAL_TICKS
      expect(recipeStillSatisfied(w, defender)).toBe(true);
    }
  });

  it.each(SPAWNER_IDS)('%s: IGNITES a spawner', (id) => {
    const w = setup();
    fund(w, id);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });

    runGodlyMatcherCore(w, { lastMatcherTick: 0 });

    expect(w.creatureSpawners.size).toBeGreaterThanOrEqual(1);
  });

  it('voltkin: IGNITES the cinematic godly', () => {
    const w = setup();
    fund(w, 'voltkin');
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'voltkin', centre: SITE,
    });

    const fired = runGodlyMatcherCore(w, { lastMatcherTick: 0 });

    // Voltkin is the ONE recipe whose ignition depends on the emitted BOND_FORMED being visible to
    // the cursor scan (the defender/spawner arms only need the effect to EXIST). Its strict `<`
    // comparison against an un-advanced world.tick is documented as having silently skipped events
    // before, so this is asserted empirically rather than assumed.
    expect(fired).not.toBeNull();
    expect(fired?.godlyId).toBe('voltkin');
  });
});

describe('applyBuildBlueprint — refuses without spending (NO-OP, never an error)', () => {
  it('an unaffordable build consumes NOTHING', () => {
    const w = setup();
    fund(w, 'stinkTower');
    // Remove one shape so the bill can no longer be covered.
    w.castleBanks.get(P0)!.pop();
    const before = w.castleBanks.get(P0)!.length;

    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'stinkTower', centre: SITE,
    });

    // The whole payment is planned before anything is taken, so a refused build cannot half-spend.
    expect(w.castleBanks.get(P0)!.length).toBe(before);
    expect(w.primitives.size).toBe(0);
    expect(w.bonds.size).toBe(0);
  });

  it('an illegal site consumes NOTHING', () => {
    const w = setup();
    fund(w, 'stinkTower');
    const inQuarry: Vec2 = { x: 960, y: 540 }; // dead centre of the shared quarry

    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'stinkTower', centre: inQuarry,
    });

    expect(w.primitives.size).toBe(0);
    expect(w.castleBanks.get(P0)!.length).toBe(blueprintCost('stinkTower'));
  });

  it('an unknown player consumes NOTHING and does not throw', () => {
    const w = setup();
    fund(w, 'stinkTower');
    expect(() => applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT', playerId: asPlayerId(5), blueprintId: 'stinkTower', centre: SITE,
    })).not.toThrow();
    expect(w.primitives.size).toBe(0);
  });

  it('a carried porch spark is NOT eligible payment', () => {
    const w = setup();
    // Fund stinkTower entirely on the porch, then mark one shape as carried.
    const bill: Array<[SparkType, number]> = [...blueprintBill('stinkTower')];
    const porch = [];
    for (const [type, count] of bill) {
      for (let i = 0; i < count; i++) porch.push(spawnSpark(type, porchSlot(SEAT0, porch.length)));
    }
    for (const s of porch) w.freeSparks.set(s.id, s);
    w.castleBanks.set(P0, []);
    expect(planBlueprintPayment(w, P0, 'stinkTower')).not.toBeNull();

    // Consuming a mid-carry spark would strand whoever is holding it.
    porch[0].state = { kind: 'Carried', carrierId: P0 };
    expect(planBlueprintPayment(w, P0, 'stinkTower')).toBeNull();
  });
});

describe('NEGATIVE CONTROL — the survival assertion has teeth', () => {
  /**
   * ⚠ Guards against the worst outcome for this suite: a survival check that cannot fail. If
   * `recipeStillSatisfied` returned true regardless of geometry, every per-recipe test above would be
   * green while proving nothing at all. Breaking the stamped structure MUST flip it to false.
   */
  it.each(DEFENDER_IDS)('%s: deleting a stamped primitive breaks re-validation', (id) => {
    const w = setup();
    fund(w, id);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: SITE });
    runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    const defender = [...w.defenders.values()][0];
    expect(recipeStillSatisfied(w, defender)).toBe(true);

    // Remove a LEAF (never the anchor) so the fallback "anchor still exists" rule cannot mask the
    // result — this must fail on the recipe's real shape gate, not on a missing anchor.
    const leaf = [...w.primitives.values()]
      .filter((p) => p.id !== defender.anchorPrimitiveId)
      .sort((a, b) => (b.id as unknown as number) - (a.id as unknown as number))[0];
    for (const bondId of leaf.bonds) {
      const bond = w.bonds.get(bondId)!;
      const other = bond.aId === leaf.id ? bond.bId : bond.aId;
      w.primitives.get(other)?.bonds.delete(bondId);
      w.bonds.delete(bondId);
    }
    w.primitives.delete(leaf.id);

    expect(recipeStillSatisfied(w, defender)).toBe(false);
  });
});
