/**
 * SPARK — S152: **THE CONSERVATION SUITE for FIX and SCRAP (R13 / R19 / R21).**
 *
 * ## THE HEADLINE IS ARITHMETIC, AND IT IS ASSERTED ON TOTALS, NOT ON IDS
 *
 * The session spec's exit gate is *"fix-then-scrap round-trips conserve inventory exactly, with no
 * duplication — assert on total counts, not on individual ids"*. So the spine of this file is one
 * quantity:
 *
 *     TOTAL(seat) = banked shapes + spendable porch shapes + placed primitives
 *
 * and three claims about it:
 *   • a **BUILD** leaves it unchanged (shapes move from inventory into the world),
 *   • a **FIX** leaves it unchanged (shapes move from inventory into the world),
 *   • a **SCRAP** leaves it unchanged (shapes move from the world back into inventory),
 *   • and **only DESTRUCTION lowers it** — which is the whole attrition economy in one line.
 *
 * ## ANTI-VACUITY IS DESIGNED IN, NOT HOPED FOR
 *
 * A conservation test can pass by doing nothing at all, so every round-trip here asserts BOTH
 * outcomes at once: that something was genuinely RETURNED (the bank grew) and that something was
 * genuinely LOST (the destroyed shapes did not come back). `expect(total).toBe(total)` with an
 * empty structure would satisfy conservation and prove nothing; the paired assertions cannot.
 *
 * ## MUTATION-TESTED (S143 standing lesson: mutation-test the guard, not just the code)
 *
 * Five deliberate breaks were introduced into `structureRepair.ts` and each was confirmed to turn
 * this suite RED before being reverted:
 *   1. banking each surviving member TWICE                    → 3 failures (every conservation total).
 *   2. banking the members but never razing them — the
 *      read-before-vs-after double-count                      → 4 failures.
 *   3. dropping the `canBuildNow` gate                        → 1 failure (the R19 phase case).
 *   4. forcing the rigid fit to translation-only (θ = 0)      → 1 failure (the rotated re-mint).
 *   5. R21 LAUNDERING — refunding a second shape for every
 *      member that carries provenance, i.e. paying out more
 *      than survived                                          → 3 failures.
 * Recorded here because a green suite is not evidence that the suite CAN go red.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, asPrimitiveId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { blueprintBill, blueprintFor } from './blueprints.ts';
import { applyBuildBlueprint, eligiblePorchSparks } from './blueprintBuild.ts';
import { bankCountOf, makeCastleBank } from './castleBank.ts';
import { damageEntity } from './damage.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { getDefenderConfig } from './defenders/defender.ts';
import { recipeStillSatisfied } from './defenders/defenderLifecycle.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import {
  applyRepairStructure,
  applyScrapStructure,
  blueprintGroupOf,
  planStructureRepair,
  planStructureScrap,
  seatStructureAt,
} from './structureRepair.ts';
// ⚠ SIDE-EFFECT IMPORTS, REQUIRED — the recipe registry is populated by each module's tail call to
// `registerRecipe`, and `blueprints.ts` deliberately does not import them (see its docblock). Any
// assertion about IGNITION is vacuous without these.
import './godlyRecipes/stinkTower.ts';
import './godlyRecipes/laserTurret.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** The same far-from-quarry, comfortably-inside-seat-0 site `blueprintBuild.test.ts` builds on. */
const SITE: Vec2 = { x: 300, y: 300 };

function setup(): World {
  const w = makeWorld(0);
  w.isHost = true; // runGodlyMatcherCore returns early for a non-host
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

/** Stock the seat's bank with exactly one blueprint's bill. */
function fund(w: World, id: GodlyId): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
}

/** Put `n` loose shapes of `type` into the bank. */
function stock(w: World, type: SparkType, n: number): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  bank[type as number] = (bank[type as number] ?? 0) + n;
  w.castleBanks.set(P0, bank);
}

function build(w: World, id: GodlyId, centre: Vec2 = SITE): void {
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}

/**
 * ⭐ THE CONSERVED QUANTITY. Everything a seat owns that is made of shapes, counted once:
 * banked + spendable-on-its-porch + standing in the world. FIX and SCRAP move shapes BETWEEN these
 * three, and must never change the sum.
 */
function totalShapes(w: World): number {
  let banked = 0;
  for (const t of [
    SparkType.Dot, SparkType.Line, SparkType.Triangle,
    SparkType.Square, SparkType.Circle, SparkType.Spiral,
  ]) {
    banked += bankCountOf(w.castleBanks, P0, t);
  }
  let placed = 0;
  for (const p of w.primitives.values()) if (p.placedBy === P0) placed++;
  return banked + eligiblePorchSparks(w, P0).length + placed;
}

/** Every standing member of the structure seeded at `seed`, by blueprint node index. */
function nodesOf(w: World, id: GodlyId): Map<number, PrimitiveId> {
  const out = new Map<number, PrimitiveId>();
  for (const p of w.primitives.values()) {
    if (p.origin !== null && p.origin.blueprintId === id) out.set(p.origin.nodeIndex, p.id);
  }
  return out;
}

/** Blow one blueprint node away for good, through the ONE damage path. */
function destroyNode(w: World, id: GodlyId, nodeIndex: number): void {
  const target = nodesOf(w, id).get(nodeIndex);
  expect(target).toBeDefined();
  const died = damageEntity(w, { kind: 'primitive', id: target! }, PRIMITIVE_MAX_HP, 'creature');
  expect(died).toBe(true); // a destroy that did not destroy would make every test below vacuous
}

/** Any surviving member — what the player would click. */
function anyMember(w: World, id: GodlyId): PrimitiveId {
  const first = [...nodesOf(w, id).values()][0];
  expect(first).toBeDefined();
  return first!;
}

const TURRET_SHAPES = 7; // 1 Line hub + 6 Spiral leaves

/* ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('S152 — provenance is stamped, and it is what FIX reads', () => {
  it('a blueprint build tags every shape with its blueprint AND its node index', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');

    const bp = blueprintFor('laserTurret');
    const nodes = nodesOf(w, 'laserTurret');
    expect(nodes.size).toBe(bp.nodes.length);
    // Exactly 0..n-1, each once — the property `blueprintGroupOf` relies on to detect two stamps
    // welded into one component.
    expect([...nodes.keys()].sort((a, b) => a - b)).toEqual(bp.nodes.map((_, i) => i));
    for (const [idx, primId] of nodes) {
      expect(w.primitives.get(primId)!.type).toBe(bp.nodes[idx].type);
    }
  });

  it('a hand-placed shape carries NO provenance, so FIX has nothing to restore it to', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const member = anyMember(w, 'laserTurret');
    // Strip provenance from one member — the freeform case, reachable by bonding loose shapes.
    w.primitives.get(member)!.origin = null;

    const ids = seatStructureAt(w, P0, member)!;
    expect(blueprintGroupOf(w, ids)).toBeNull();
    expect(planStructureRepair(w, P0, member)).toBeNull();
    // …but SCRAP is still offered: you can always tear down what you built.
    expect(planStructureScrap(w, P0, member)).not.toBeNull();
  });

  it('two shapes claiming the SAME node index refuse the repair rather than guess', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const nodes = nodesOf(w, 'laserTurret');
    // Two stamps welded into one component present exactly this way.
    w.primitives.get(nodes.get(2)!)!.origin = { blueprintId: 'laserTurret', nodeIndex: 1 };
    expect(planStructureRepair(w, P0, nodes.get(0)!)).toBeNull();
  });
});

describe('S152 — SCRAP returns ONLY the shapes still standing (R21)', () => {
  it('an undamaged tower round-trips its whole bill, and conserves the total', () => {
    const w = setup();
    fund(w, 'laserTurret');
    const before = totalShapes(w);
    expect(before).toBe(TURRET_SHAPES);

    build(w, 'laserTurret');
    expect(totalShapes(w)).toBe(before); // building moves shapes, it does not create or destroy

    const seed = anyMember(w, 'laserTurret');
    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: seed });

    expect(w.primitives.size).toBe(0);
    expect(totalShapes(w)).toBe(before);
    // ANTI-VACUITY: something really came back, in the right composition.
    expect(bankCountOf(w.castleBanks, P0, SparkType.Line)).toBe(1);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(6);
  });

  it('⭐ a PARTIALLY DESTROYED tower returns the survivors and NOT the dead — both, in one test', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    expect(totalShapes(w)).toBe(TURRET_SHAPES);

    // Two leaves are blown off. They are gone from the world; nothing anywhere remembers them.
    destroyNode(w, 'laserTurret', 1);
    destroyNode(w, 'laserTurret', 2);
    expect(totalShapes(w)).toBe(TURRET_SHAPES - 2); // destruction is the ONLY thing that lowers it

    const seed = anyMember(w, 'laserTurret');
    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: seed });

    // R21, asserted from both sides at once.
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(4); // RETURNED: the survivors
    expect(bankCountOf(w.castleBanks, P0, SparkType.Line)).toBe(1);
    expect(totalShapes(w)).toBe(TURRET_SHAPES - 2); // LOST: the two dead never come back
    expect(w.primitives.size).toBe(0);
  });

  it('scrapping twice cannot duplicate — the second call finds nothing and no-ops', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const seed = anyMember(w, 'laserTurret');

    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: seed });
    const afterFirst = totalShapes(w);
    const bankAfterFirst = bankCountOf(w.castleBanks, P0, SparkType.Spiral);

    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: seed });
    expect(totalShapes(w)).toBe(afterFirst);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(bankAfterFirst);
  });

  it('tearing a tower down does NOT detonate it — the stink blast is a death, not a demolition', () => {
    const w = setup();
    fund(w, 'stinkTower');
    build(w, 'stinkTower');
    runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    expect(w.defenders.size).toBe(1);

    // A bystander well outside the tower but inside any plausible blast radius.
    fund(w, 'laserTurret');
    build(w, 'laserTurret', { x: 460, y: 300 });
    const bystanders = [...w.primitives.values()].filter(
      (p) => p.origin?.blueprintId === 'laserTurret',
    );
    expect(bystanders.length).toBe(TURRET_SHAPES);

    applyScrapStructure(w, {
      type: 'SCRAP_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'stinkTower'),
    });

    expect(w.defenders.size).toBe(0);
    // Every bystander shape still standing, at FULL health. A blast would have shaved hp off them.
    expect([...w.primitives.values()].filter((p) => p.origin?.blueprintId === 'laserTurret').length)
      .toBe(TURRET_SHAPES);
    for (const p of bystanders) expect(w.primitives.get(p.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });
});

describe('S152 — FIX consumes exactly what was lost (R13)', () => {
  it('⭐ the full round trip: build → damage → FIX → SCRAP conserves EXACTLY, with no duplication', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    destroyNode(w, 'laserTurret', 3);
    destroyNode(w, 'laserTurret', 5);
    expect(totalShapes(w)).toBe(TURRET_SHAPES - 2);

    // Buy the replacements. This is the only inflow in the whole test.
    stock(w, SparkType.Spiral, 2);
    const funded = totalShapes(w);
    expect(funded).toBe(TURRET_SHAPES);

    const seed = anyMember(w, 'laserTurret');
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed });

    // FIX moved exactly two shapes from the bank into the world.
    expect(totalShapes(w)).toBe(funded);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(0);
    expect(nodesOf(w, 'laserTurret').size).toBe(TURRET_SHAPES);

    // …and the round trip closes with no shape created anywhere along the way.
    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: anyMember(w, 'laserTurret') });
    expect(totalShapes(w)).toBe(funded);
    expect(w.primitives.size).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(6);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Line)).toBe(1);
  });

  it('a repaired tower IGNITES again and survives re-validation', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    expect(w.defenders.size).toBe(1);

    // Lose a leaf: the hub drops to degree 5, so the recipe stops holding.
    destroyNode(w, 'laserTurret', 4);
    const defender = [...w.defenders.values()][0];
    expect(recipeStillSatisfied(w, defender)).toBe(false);
    w.defenders.clear(); // what the 0.5 s poll would have done

    stock(w, SparkType.Spiral, 1);
    w.tick = 10;
    applyRepairStructure(w, {
      type: 'REPAIR_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'laserTurret'),
    });

    runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    expect(w.defenders.size).toBe(1);
    expect(recipeStillSatisfied(w, [...w.defenders.values()][0])).toBe(true);
  });

  it('refuses outright when the inventory is short — no partial repair, nothing spent', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    destroyNode(w, 'laserTurret', 1);
    destroyNode(w, 'laserTurret', 2);
    stock(w, SparkType.Spiral, 1); // one short

    const before = totalShapes(w);
    applyRepairStructure(w, {
      type: 'REPAIR_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'laserTurret'),
    });

    expect(nodesOf(w, 'laserTurret').size).toBe(TURRET_SHAPES - 2); // still broken
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(1); // and nothing was spent
    expect(totalShapes(w)).toBe(before);
  });

  it('heals chip damage for free — R13 prices FIX at what was LOST, and nothing was', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const victim = nodesOf(w, 'laserTurret').get(2)!;
    damageEntity(w, { kind: 'primitive', id: victim }, 400, 'creature');
    expect(w.primitives.get(victim)!.hp).toBe(PRIMITIVE_MAX_HP - 400);

    const before = totalShapes(w);
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: victim });

    expect(w.primitives.get(victim)!.hp).toBe(PRIMITIVE_MAX_HP);
    expect(totalShapes(w)).toBe(before); // free, because nothing died
  });

  it('⭐ restores the TOWER\'s own health pool, which is a different number from its shapes\'', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    const defender = [...w.defenders.values()][0];
    const full = getDefenderConfig(defender.kind).hp;

    // Hurt the TOWER without touching a single shape — the case that reads as "nothing to fix"
    // unless the planner looks at both pools.
    damageEntity(w, { kind: 'defender', id: defender.id }, Math.floor(full / 2), 'creature');
    expect(defender.hp).toBeLessThan(full);
    for (const p of w.primitives.values()) expect(p.hp).toBe(PRIMITIVE_MAX_HP);

    const seed = anyMember(w, 'laserTurret');
    expect(planStructureRepair(w, P0, seed)!.damagedCount).toBe(1); // the button must light up
    const before = totalShapes(w);
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed });

    expect(w.defenders.get(defender.id)!.hp).toBe(full);
    expect(totalShapes(w)).toBe(before); // nothing died, so nothing is charged
  });

  it('an untouched tower refuses the repair, rather than arming the ignition sweep for free', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const effectsBefore = w.effects.length;
    const hashBefore = hashWorldStateFull(w);

    applyRepairStructure(w, {
      type: 'REPAIR_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'laserTurret'),
    });

    expect(hashWorldStateFull(w)).toBe(hashBefore);
    expect(w.effects.length).toBe(effectsBefore);
  });
});

describe('S152 — FIX puts the shape back WHERE it was (the rigid fit)', () => {
  it('an unmoved structure re-mints the lost node in its original position', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const doomed = nodesOf(w, 'laserTurret').get(4)!;
    const was = { ...w.primitives.get(doomed)!.pos };

    destroyNode(w, 'laserTurret', 4);
    stock(w, SparkType.Spiral, 1);
    applyRepairStructure(w, {
      type: 'REPAIR_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'laserTurret'),
    });

    const now = w.primitives.get(nodesOf(w, 'laserTurret').get(4)!)!.pos;
    expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeLessThan(1e-6);
  });

  it('⭐ a DRAGGED AND ROTATED structure still re-mints in the right place', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');

    // Rotate the whole tower 90° about its build centre and shove it 40 px — what dragging it and
    // letting Verlet settle actually does. A translation-only fit would put the new leaf on the
    // OPPOSITE side of the hub from where it belongs.
    const rotate = (p: Vec2): Vec2 => ({
      x: SITE.x - (p.y - SITE.y) + 40,
      y: SITE.y + (p.x - SITE.x) - 25,
    });
    const expected = new Map<number, Vec2>();
    for (const [idx, primId] of nodesOf(w, 'laserTurret')) {
      const prim = w.primitives.get(primId)!;
      const moved = rotate(prim.pos);
      expected.set(idx, moved);
      prim.pos = { ...moved };
      prim.prevPos = { ...moved };
    }

    destroyNode(w, 'laserTurret', 4);
    stock(w, SparkType.Spiral, 1);
    applyRepairStructure(w, {
      type: 'REPAIR_STRUCTURE',
      playerId: P0,
      primitiveId: anyMember(w, 'laserTurret'),
    });

    const now = w.primitives.get(nodesOf(w, 'laserTurret').get(4)!)!.pos;
    const want = expected.get(4)!;
    expect(Math.hypot(now.x - want.x, now.y - want.y)).toBeLessThan(1e-6);
  });

  it('is deterministic — two identical worlds repair to the identical hash', () => {
    const run = (): World => {
      const w = setup();
      fund(w, 'laserTurret');
      build(w, 'laserTurret');
      destroyNode(w, 'laserTurret', 1);
      destroyNode(w, 'laserTurret', 5);
      stock(w, SparkType.Spiral, 2);
      applyRepairStructure(w, {
        type: 'REPAIR_STRUCTURE',
        playerId: P0,
        primitiveId: anyMember(w, 'laserTurret'),
      });
      return w;
    };
    expect(hashWorldStateFull(run())).toBe(hashWorldStateFull(run()));
  });
});

describe('S152 — the gates (R19 + ownership + stale ids)', () => {
  it('R19: both refuse during the FIGHT stage', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    destroyNode(w, 'laserTurret', 1);
    stock(w, SparkType.Spiral, 1);
    const seed = anyMember(w, 'laserTurret');

    w.matchPhase = 'FIGHT';
    expect(planStructureRepair(w, P0, seed)).toBeNull();
    expect(planStructureScrap(w, P0, seed)).toBeNull();

    const hashBefore = hashWorldStateFull(w);
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed });
    applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: seed });
    expect(hashWorldStateFull(w)).toBe(hashBefore);

    // …and both come back the moment the walls go up again.
    w.matchPhase = 'BUILD';
    expect(planStructureRepair(w, P0, seed)).not.toBeNull();
    expect(planStructureScrap(w, P0, seed)).not.toBeNull();
  });

  it('a shape another seat placed makes the whole structure untouchable', () => {
    const w = setup();
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const nodes = nodesOf(w, 'laserTurret');
    // A single foreign member is enough — the refund would otherwise land in the wrong bank.
    (w.primitives.get(nodes.get(3)!) as { placedBy: typeof P1 }).placedBy = P1;

    const seed = nodes.get(0)!;
    expect(seatStructureAt(w, P0, seed)).toBeNull();
    expect(planStructureScrap(w, P0, seed)).toBeNull();
    expect(planStructureRepair(w, P0, seed)).toBeNull();
  });

  it('a stale primitive id from a lagged joiner is a NO-OP, never a throw', () => {
    const w = setup();
    fund(w, 'laserTurret');
    build(w, 'laserTurret');
    const ghost = asPrimitiveId(9999);
    const hashBefore = hashWorldStateFull(w);

    expect(() =>
      applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: ghost }),
    ).not.toThrow();
    expect(() =>
      applyScrapStructure(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: ghost }),
    ).not.toThrow();
    // And an unknown SEAT is equally inert.
    expect(() =>
      applyScrapStructure(w, {
        type: 'SCRAP_STRUCTURE',
        playerId: asPlayerId(7),
        primitiveId: anyMember(w, 'laserTurret'),
      }),
    ).not.toThrow();
    expect(hashWorldStateFull(w)).toBe(hashBefore);
  });
});
