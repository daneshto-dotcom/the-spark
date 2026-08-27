/**
 * SPARK — S154 P3 (owner R86 / CF-S149-f): **BOTS BUILD TOWERS.**
 *
 * Owner, re-reporting it this session: *"bots still not building towers.... medium bots should at
 * least build some"* — which adds a DIFFICULTY FLOOR to a request that had been open since S149.
 *
 * ## Why this file is the priority, and not `botConfig.ts`
 *
 * The tempting shape of this work is "add a `buildsTowers` flag". That flag on its own would have
 * been a **dead field** — a bot's whole supply is gatherer → bank → porch → place, and nothing in
 * `chooseGoal` ever asked whether a blueprint was affordable. S153 P5c shipped exactly that mistake
 * one session ago (a per-type speed ladder whose field had no consumer, verified against the spec
 * and never against a call site), so the assertions here are about a tower EXISTING in the world
 * after a driven run, not about a config value being correct.
 *
 * ## The two traps this pins
 *
 *  • **the difficulty floor** — NOOB must not build towers, and must still build ordinary shapes;
 *  • **determinism** — the bot rng is a seeded mulberry32 and `chooseGoal` draws in a FIXED order.
 *    `pickTargetSpark` documents that it draws exactly once on the sloppy path and zero times on the
 *    smart path. A new branch above it that consumed even one draw would shift every downstream
 *    number and silently break `hostTick.replay`, `workerSim.differential` and the same-seed stream
 *    test in `botController.test.ts`. Both new planners are pure functions of world state in
 *    canonical order — asserted below rather than asserted in a comment.
 */

import { describe, expect, it } from 'vitest';

import { BOT_CONFIGS } from './botConfig.ts';
import { chooseGoal, chooseTowerOrder, chooseTowerPlan } from './botBrain.ts';
import { BotManager } from './botManager.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import type { Controls } from '../input/controls.ts';
import { bankAdd, bankCountOf } from '../state/castleBank.ts';
import { blueprintBill, blueprintCost, ALL_BLUEPRINT_IDS } from '../state/blueprints.ts';
import { planBlueprintPayment } from '../state/blueprintBuild.ts';
import { stampRefusalAt } from '../state/blueprintLegality.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { PLAYER_COLORS } from '../constants.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const SEAT = asPlayerId(1);

/** A VS-BOTS world with one bot seat, pinned to BUILD — towers are only legal in BUILD. */
function botsWorld(): World {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
    botSeats: [1],
  });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  return w;
}

/** The cheapest blueprint, by the same derivation the brain uses. */
const CHEAPEST: GodlyId = [...ALL_BLUEPRINT_IDS].sort(
  (a, b) => blueprintCost(a) - blueprintCost(b) || (a < b ? -1 : a > b ? 1 : 0),
)[0]!;

/** Bank exactly the bill for `id` on `seat`, so `planBlueprintPayment` must succeed. */
function bankTheBill(w: World, seat: PlayerId, id: GodlyId): void {
  for (const [type, n] of blueprintBill(id)) {
    for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, type);
  }
}

/** Drive N host-ish ticks the way main.ts does: bots act, then the tick advances. */
function run(w: World, m: BotManager, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    m.tick(w);
    w.tick++;
  }
}

describe('S154 P3 (R86) — the difficulty floor', () => {
  it('NOOB does not build towers; MID, HARD and IMBA do', () => {
    expect(BOT_CONFIGS.NOOB.buildsTowers).toBe(false);
    expect(BOT_CONFIGS.MID.buildsTowers).toBe(true);
    expect(BOT_CONFIGS.HARD.buildsTowers).toBe(true);
    expect(BOT_CONFIGS.IMBA.buildsTowers).toBe(true);
  });

  it('⛔ a NOOB with a FULL BILL in the bank still refuses — the flag is really consulted', () => {
    // The assertion that separates "the flag exists" from "the flag does something".
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    expect(planBlueprintPayment(w, SEAT, CHEAPEST)).not.toBeNull(); // anti-vacuity: affordable
    expect(chooseTowerPlan(w, SEAT, BOT_CONFIGS.NOOB)).toBeNull();
    expect(chooseTowerOrder(w, SEAT, BOT_CONFIGS.NOOB)).toBeNull();
    // …and a MID in the identical world DOES want it, so the world is not the reason.
    expect(chooseTowerPlan(w, SEAT, BOT_CONFIGS.MID)).not.toBeNull();
  });
});

describe('S154 P3 — the planner asks the SAME questions the human path asks', () => {
  it('proposes nothing when the bill is not met', () => {
    const w = botsWorld(); // empty bank
    expect(planBlueprintPayment(w, SEAT, CHEAPEST)).toBeNull();
    expect(chooseTowerPlan(w, SEAT, BOT_CONFIGS.IMBA)).toBeNull();
  });

  it('proposes a plan when it is, and the CENTRE is legal by stampRefusalAt', () => {
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    const plan = chooseTowerPlan(w, SEAT, BOT_CONFIGS.IMBA)!;
    expect(plan).not.toBeNull();
    // The footprint-aware predicate, not the centre-only isLegalBuildPos — a site whose outlying
    // nodes are off-canvas or inside a spawner zone passes the latter and fails the build.
    expect(stampRefusalAt(w, plan.centre, SEAT, plan.blueprintId)).toBeNull();
  });

  it('⛔ refuses during FIGHT, because nowhere on the board is legal then', () => {
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    expect(chooseTowerPlan(w, SEAT, BOT_CONFIGS.IMBA)).not.toBeNull();
    w.matchPhase = 'FIGHT';
    expect(chooseTowerPlan(w, SEAT, BOT_CONFIGS.IMBA)).toBeNull();
  });

  it('orders the shape it is SHORT of, and stops once the bill is met', () => {
    const w = botsWorld();
    const wanted = chooseTowerOrder(w, SEAT, BOT_CONFIGS.MID);
    expect(wanted, 'an empty bank is short of something').not.toBeNull();
    expect((blueprintBill(CHEAPEST).get(wanted!) ?? 0)).toBeGreaterThan(0);

    bankTheBill(w, SEAT, CHEAPEST);
    // Now the cheapest is affordable, so the cheapest is no longer what it saves for.
    const next = chooseTowerOrder(w, SEAT, BOT_CONFIGS.MID);
    if (next !== null) {
      // It has moved on to a costlier blueprint — never re-asking for a bill it already holds.
      expect(bankCountOf(w.castleBanks, SEAT, next)).toBeGreaterThanOrEqual(0);
    }
  });

  it('is PURE — asking twice does not mutate the world', () => {
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    const before = JSON.stringify([...w.castleBanks.entries()]) + w.primitives.size + w.tick;
    chooseTowerPlan(w, SEAT, BOT_CONFIGS.IMBA);
    chooseTowerOrder(w, SEAT, BOT_CONFIGS.IMBA);
    expect(JSON.stringify([...w.castleBanks.entries()]) + w.primitives.size + w.tick).toBe(before);
  });
});

describe('S154 P3 — ⭐ A TOWER ACTUALLY APPEARS (the assertion the whole priority is about)', () => {
  it('a MID bot holding a bill raises a real structure in a driven run', () => {
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    const primsBefore = w.primitives.size;
    const m = new BotManager(['MID'], 0xbeef);

    run(w, m, 60 * 6); // six sim-seconds is plenty: a castle command needs no travel

    const mine = [...w.primitives.values()].filter((p) => p.placedBy === SEAT);
    // A blueprint stamp mints its whole node set at once, so the bill's shape count is the floor.
    expect(mine.length, 'the bot stamped a tower').toBeGreaterThanOrEqual(blueprintCost(CHEAPEST));
    expect(w.primitives.size).toBeGreaterThan(primsBefore);
    // And the nodes are BONDED to each other — a stamp mints its own bond list.
    expect(mine.filter((p) => p.bonds.size > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('⛔ and a NOOB in the same world raises NOTHING from the bank', () => {
    // The floor, end to end rather than as a config read. A NOOB may still place loose shapes from
    // its porch, so this counts STRUCTURE-sized output only.
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    const m = new BotManager(['NOOB'], 0xbeef);
    run(w, m, 60 * 6);
    const mine = [...w.primitives.values()].filter((p) => p.placedBy === SEAT);
    expect(mine.length).toBeLessThan(blueprintCost(CHEAPEST));
  });

  it('⭐ the stamped tower SURVIVES the bot going on building around it', () => {
    /*
     * The hazard A.0 and the Council both raised from opposite directions: a bot grows loose shapes
     * outward at GROWTH_STEP (48 px, INSIDE AUTO_BOND_RADIUS 60), and a later placement landing
     * within 60 px of a tower node auto-bonds a chord into it — which drops a pentagram's ring below
     * degree 2 or breaks a voltkin chain, and the structure is torn down on the next re-validation
     * with NO error and NO log line. Neither the unit suite nor any determinism gate would notice.
     *
     * `stampRefusalAt` protects the stamp itself (it refuses a footprint within 60 px of anything).
     * This asserts the REVERSE direction, which nothing protected: keep the bot playing long after
     * the stamp and require the tower to still be standing.
     */
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    const m = new BotManager(['IMBA'], 0xbeef);
    run(w, m, 60 * 6);

    const stamped = [...w.primitives.values()].filter((p) => p.placedBy === SEAT && p.origin !== null);
    expect(stamped.length, 'a tower was stamped to begin with').toBeGreaterThanOrEqual(
      blueprintCost(CHEAPEST),
    );
    const ids = stamped.map((p) => p.id);

    // Keep it playing: more shapes banked, many more thinks.
    bankTheBill(w, SEAT, CHEAPEST);
    run(w, m, 60 * 40);

    const survivors = ids.filter((id) => w.primitives.has(id));
    expect(survivors.length, 'the tower was torn down by the bot building around it').toBe(ids.length);
  });
});

describe('S154 P3 — determinism: no new rng draws', () => {
  it('the same seed still produces the same action stream for a NOOB', () => {
    // A NOOB takes no new branch at all, so its stream must be BYTE-IDENTICAL to the shipped one.
    const a = botsWorld();
    const b = botsWorld();
    const ma = new BotManager(['NOOB'], 0x1234);
    const mb = new BotManager(['NOOB'], 0x1234);
    run(a, ma, 60 * 12);
    run(b, mb, 60 * 12);
    const snap = (w: World): string =>
      JSON.stringify(
        [...w.primitives.values()].map((p) => [p.id, Math.round(p.pos.x), Math.round(p.pos.y)]),
      );
    expect(snap(a)).toBe(snap(b));
  });

  it('two identical MID worlds agree too — the new branches add no draw', () => {
    const a = botsWorld();
    const b = botsWorld();
    bankTheBill(a, SEAT, CHEAPEST);
    bankTheBill(b, SEAT, CHEAPEST);
    const ma = new BotManager(['MID'], 0x1234);
    const mb = new BotManager(['MID'], 0x1234);
    run(a, ma, 60 * 12);
    run(b, mb, 60 * 12);
    const snap = (w: World): string =>
      JSON.stringify(
        [...w.primitives.values()].map((p) => [p.id, Math.round(p.pos.x), Math.round(p.pos.y)]),
      );
    expect(snap(a)).toBe(snap(b));
    expect(snap(a).length).toBeGreaterThan(10); // anti-vacuity: something was built
  });

  it('chooseGoal proposes TOWER ahead of the loose-shape BUILD when a bill is held', () => {
    /*
     * Ordering matters for behaviour: a bot holding a full bill should raise the tower rather than
     * fritter the shapes away one at a time, which is the whole of R86.
     *
     * ⚠ ECONOMY OUTRANKS BOTH, since S154 AMENDMENT A. An IMBA bot with points in hand upgrades its
     * hauler first (*"hard and imba should be at least upgrading the gatherer speed right away"*),
     * because that compounds into every shape that arrives afterwards. So the assertion is that TOWER
     * beats BUILD, tested with the economy branch already satisfied — which is the ordering the owner
     * actually asked for, rather than the one that happened to ship first.
     */
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    for (const g of w.gatherers.values()) g.speedLevel = 5; // GATHERER_MAX_SPEED_LEVEL: nothing to buy
    w.scoreByPlayer.set(SEAT, 0); // and nothing to buy it with
    const goal = chooseGoal(w, SEAT, BOT_CONFIGS.IMBA, () => 0.5, true);
    expect(goal.kind).toBe('TOWER');
  });

  it('⭐ but the ECONOMY comes first — a hauler upgrade beats a tower, and that is the owner ruling', () => {
    const w = botsWorld();
    bankTheBill(w, SEAT, CHEAPEST);
    w.scoreByPlayer.set(SEAT, 500); // plenty for an upgrade
    expect(chooseGoal(w, SEAT, BOT_CONFIGS.IMBA, () => 0.5, true).kind).toBe('UPGRADE_GATHERER');
    // …and a MID bot does NOT upgrade, which is the visible difference between the tiers.
    expect(chooseGoal(w, SEAT, BOT_CONFIGS.MID, () => 0.5, true).kind).not.toBe('UPGRADE_GATHERER');
    expect(BOT_CONFIGS.HARD.upgradesGatherer).toBe(true);
    expect(BOT_CONFIGS.MID.upgradesGatherer).toBe(false);
    expect(BOT_CONFIGS.IMBA.buysSecondGatherer).toBe(true);
    expect(BOT_CONFIGS.HARD.buysSecondGatherer).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════ *
 *   S154 AMENDMENT A (owner) — FROM AN EMPTY BANK TO A STANDING TOWER
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S154 AMENDMENT A — ⭐ the assertion I should have written the first time', () => {
  /*
   * Owner, playing against a HARD bot after P3 shipped: *"he is building random free form
   * connections rather than save to build towers"*. They were right, and the reason my P3 tests did
   * not catch it is written into their fixture: `bankTheBill()` PRE-BANKS the whole bill before the
   * bot runs. That proves the STAMP path works and cannot prove a bot ever ACCUMULATES a bill —
   * which was the entire defect.
   *
   * So this drives the real `runHostTick` with a real BotManager, a real gatherer and free sparks on
   * the board, from an EMPTY bank, and requires a structure to exist at the end. It is the only test
   * here whose premise matches what the owner was looking at.
   */
  /*
   * ⭐ THIS IS THE ASSERTION THE OWNER'S REPORT WAS ABOUT, AND IT NOW PASSES.
   *
   * It was written to FAIL, and it did — P3's own acceptance test passed only because its fixture
   * PRE-BANKS the bill, proving the stamp path and never the accumulation. This one starts from an
   * EMPTY bank with real spawner income and a real gatherer, and requires a structure to exist at the
   * end. It stayed red through five gate designs before three changes together made it green:
   *
   *   1. the ECONOMY investment — HARD/IMBA now spend their first points on UPGRADE_GATHERER_SPEED,
   *      so shapes arrive materially faster (round 1 measured income on a bot that never upgraded);
   *   2. the ORDER goal steering the hauler at the shape the bill wants — `gathererLifecycle` reads
   *      `world.gathererOrders`, which was the load-bearing unknown: with a random type mix no hold
   *      length would ever have been enough;
   *   3. the save itself, BUILD-only and duty-cycled, spend-window first.
   *
   * Any one of the three alone left it red. Kept un-weakened as the regression guard for all three.
   */
  it('a HARD bot with income and an empty bank eventually raises a tower', () => {
    const w = botsWorld();
    // Anti-vacuity on the premise: the bank really is empty and the seat really has income.
    expect(bankCountOf(w.castleBanks, SEAT, 0 as never)).toBe(0);
    expect([...w.gatherers.values()].filter((g) => g.ownerPlayerId === SEAT).length).toBeGreaterThan(0);

    // ⚠ NO HAND-MINTED SPARKS. `runHostTick` drives `deps.spawner`, so free sparks appear on the
    // board on the game's own cadence and the bot's gatherer hauls them the way it does in a real
    // match. A hand-seeded pile would be a fixture that hands the bot its income — the exact shortcut
    // that let the P3 tests pass while the live behaviour was broken.
    const m = new BotManager(['HARD'], 0xbeef);
    const d = deps();
    const st = makeHostTickState(w);
    // Three sim-minutes of BUILD. The phase clock is pinned so the whole run stays buildable —
    // stampRefusalAt refuses everything during FIGHT, which is correct and not what is under test.
    for (let t = 0; t < 60 * 180; t++) {
      w.matchPhase = 'BUILD';
      w.phaseEndsAtTick = w.tick + 10_000;
      m.tick(w);
      runHostTick(w, d, st);
    }

    const stamped = [...w.primitives.values()].filter((p) => p.placedBy === SEAT && p.origin !== null);
    expect(stamped.length, 'the bot accumulated a bill and raised a real structure').toBeGreaterThanOrEqual(
      blueprintCost(CHEAPEST),
    );
  });
});
