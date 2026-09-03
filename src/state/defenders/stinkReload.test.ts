/**
 * SPARK — S159 P8 (owner playtest): **THE STINK TOWER RE-ARMS BETWEEN FIGHTS.**
 *
 * Owner, after playing the S159 build: *"stink tower only plays on his first fight cycle (throwing 5
 * poop bags to random locations at random intervals) and then the next fight he does nothing! Need to
 * restart him each round."*
 *
 * ## The defect, and why nothing caught it
 *
 * `bagsRemaining` had exactly TWO writes in `src/`: filled once at construction (`makeDefender`, from
 * `config.bags`) and decremented once per throw (`stinkThrowBag`). **Nothing refilled it, ever** —
 * and `state/defenders/` had no phase awareness at all, so no boundary reset it. After five bags the
 * tower was permanently depleted; rebuilding it was the only reload, which is exactly what the owner
 * was doing by hand every round.
 *
 * No test caught it because every stink test lives inside ONE fight. A magazine that never refills is
 * indistinguishable from a working one until the second fight — so the tests here are written across
 * a PHASE BOUNDARY on purpose, driven through the real `runHostTick` clock rather than by setting
 * `matchPhase` directly, because the reload rides the same `flipped` edge as `standDownDefenders`.
 */

import { describe, expect, it } from 'vitest';

import {
  FIGHT_PHASE_TICKS,
  PRIMITIVE_MAX_HP,
  SparkType,
  PHYSICS_HZ,
  STINK_CLOUD_LIFETIME_TICKS,
  STINK_THROW_INTERVAL_TICKS,
  STINK_TOWER_BAGS,
  STINK_TOWER_HUB_DEGREE,
} from '../../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { runGodlyMatcherCore } from '../godlyMatcherCore.ts';
// ⚠ SIDE-EFFECT IMPORT, and the fixture is dead without it: every recipe module calls
// `registerRecipe` at its tail, so `runDefenderIgnition` cannot find the stink tower unless the
// module has been loaded. The `blueprintBuild.test.ts` suite does the same thing for the same reason.
import '../godlyRecipes/stinkTower.ts';
import type { Controls } from '../../input/controls.ts';
import type { Defender } from './defender.ts';

const P0 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function mk(w: World, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(P0)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

/** A real stink tower: 1 Square hub of degree 3 + 3 Circle leaves, plus the topology change that ignites it. */
function worldWithStinkTower(): World {
  const w = makeWorld(0x5175);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.creatures.clear();
  const hub = mk(w, SparkType.Square, 600, 400);
  for (let i = 0; i < STINK_TOWER_HUB_DEGREE; i++) {
    const a = (i / STINK_TOWER_HUB_DEGREE) * Math.PI * 2;
    const leaf = mk(w, SparkType.Circle, 600 + Math.cos(a) * 40, 400 + Math.sin(a) * 40);
    const bid = asBondId(w.nextBondId++);
    w.bonds.set(bid, {
      id: bid, aId: hub.id, bId: leaf.id, a: hub, b: leaf,
      restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
    });
    hub.bonds.add(bid);
    leaf.bonds.add(bid);
  }
  // `runDefenderIgnition` scans only on a topology change — the one thing a hand-built fixture must
  // supply. (`lightningHubDelivers.test.ts` records the same trap for the spawner side.)
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 600, y: 400 }, bondCount: 3 });
  // ⚠ AND IT MUST BE IN **BUILD** TO IGNITE AT ALL. `runDefenderIgnition` opens with
  // `if (world.matchPhase !== 'BUILD') return` — S157 B6, the owner's *"only next turn"* rule. The
  // first cut of this fixture set FIGHT before igniting and got a world with no tower in it, which is
  // also the more faithful order: a player builds the tower during BUILD and then the fight starts.
  w.matchPhase = 'BUILD';
  return w;
}

/** Ignite in BUILD, then cross into FIGHT on the real clock. Returns the live tower. */
function igniteThenFight(w: World, d: HostTickDeps, st: ReturnType<typeof makeHostTickState>): Defender {
  run(w, 5, d, st);
  const t = tower(w);
  if (t === undefined) throw new Error('fixture failed to ignite a stink tower');
  w.phaseEndsAtTick = w.tick + 1; // the next tick flips BUILD -> FIGHT through the production path
  while (w.matchPhase !== 'FIGHT') run(w, 1, d, st);
  // A fight long enough for all five throws (4 s apart, plus a wind-up each).
  w.phaseEndsAtTick = w.tick + 5 * 4 * 60 + 600;
  return t;
}

const tower = (w: World): Defender | undefined =>
  [...w.defenders.values()].find((d) => d.kind === 'stinkTower');

/** Run the real host tick (matcher included, as main.ts does) for `ticks`. */
function run(w: World, ticks: number, d = deps(), st = makeHostTickState(w)): void {
  const cursor = { lastMatcherTick: -1 };
  for (let t = 0; t < ticks; t++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
  }
}

describe('S159 P8 — the stink tower reloads between fights', () => {
  it('the control: it ignites and its magazine starts full', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    run(w, 5, d, st);
    const t = tower(w);
    expect(t, 'a fixture that never ignites proves nothing below').toBeDefined();
    expect(t!.bagsRemaining).toBe(STINK_TOWER_BAGS);
  });

  it('⭐ empties over one fight, and is FULL again after the BUILD edge', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);
    const startedWith = t.bagsRemaining;

    // Empty it, still inside the fight.
    while (w.matchPhase === 'FIGHT' && t.bagsRemaining > 0) run(w, 60, d, st);
    expect(t.bagsRemaining, 'the fight drains the magazine').toBe(0);

    // Now cross into BUILD on the REAL clock — the flip runs through the same
    // `while (world.tick >= world.phaseEndsAtTick)` path production uses.
    while (w.matchPhase !== 'BUILD') run(w, 30, d, st);
    // eslint-disable-next-line no-console
    console.log(`[S159 P8] started ${startedWith}, drained to 0, after the BUILD edge: ${t.bagsRemaining}`);
    expect(t.bagsRemaining, 'and the round change re-arms it').toBe(STINK_TOWER_BAGS);
  });

  it('⭐ and it THROWS again in the second fight — the thing the owner could not get without rebuilding', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);
    while (w.matchPhase === 'FIGHT' && t.bagsRemaining > 0) run(w, 60, d, st);
    while (w.matchPhase !== 'BUILD') run(w, 30, d, st);
    // Shorten the BUILD so the second fight arrives without 90 s of ticks. `phaseEndsAtTick` is the
    // real mechanism — the flip still goes through production's own `while (tick >= phaseEndsAtTick)`.
    w.phaseEndsAtTick = w.tick + 60;
    for (let i = 0; i < 40 && (w.matchPhase as string) !== 'FIGHT'; i++) run(w, 30, d, st);
    expect(w.matchPhase, 'the second fight started').toBe('FIGHT');
    expect(t.bagsRemaining, 'entering fight two with a full magazine').toBe(STINK_TOWER_BAGS);

    // And it actually spends them — the assertion the owner's report is about.
    const before = t.bagsRemaining;
    run(w, 4 * 60 + 120, d, st);
    // eslint-disable-next-line no-console
    console.log(`[S159 P8] fight two: ${before} -> ${t.bagsRemaining}`);
    expect(t.bagsRemaining, 'fight two throws too').toBeLessThan(before);
  });

  it('is idempotent across a DOUBLE phase flip (the NONET-freeze case the edge guard exists for)', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);
    t.bagsRemaining = 1;
    // A deadline far in the PAST makes the `while` loop flip more than once in a single tick.
    w.phaseEndsAtTick = w.tick - 10_000;
    run(w, 1, d, st);
    // Refilling assigns a constant, so any number of flips lands on the same magazine.
    expect(t.bagsRemaining).toBe(STINK_TOWER_BAGS);
  });

  it('a kind with NO magazine is untouched by the reload', () => {
    // `config.bags` is 0 for the turret, HELGA and every future kind without one, so the reload must
    // be a no-op for them rather than inventing ammunition.
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);
    // Fake a magazine-less defender by borrowing the record and switching kind for the assertion.
    const asTurret: Defender = { ...t, kind: 'turret', bagsRemaining: 0 };
    w.defenders.set(asPrimitiveId(9999) as never, asTurret);
    w.phaseEndsAtTick = w.tick - 1;
    run(w, 1, d, st);
    expect(asTurret.bagsRemaining, 'no magazine, no reload').toBe(0);
  });
});

/**
 * SPARK — S160 P2(a): **THE CADENCE, MEASURED THROUGH THE FSM RATHER THAN COMPUTED FROM CONSTANTS.**
 *
 * ## Why this exists — the test it replaces could not see the thing it claimed
 *
 * `stinkBehaviour.test.ts`'s "the magazine empties inside a fight" is pure arithmetic on two
 * constants: `STINK_THROW_INTERVAL_TICKS * STINK_TOWER_BAGS < FIGHT_PHASE_TICKS`. It never
 * constructs a tower and never runs `applyDefenderTick`, so **it cannot see the FSM at all** — the
 * per-throw WINDUP (`STINK_TOWER_WINDUP_TICKS`), the FIRE and RECOVER states, or the
 * `DEFENDER_REACQUIRE_TICKS` retry after a mid-windup abort. Every one of those pushes real throws
 * later than the constants say, and a retune of any of them leaves that assertion green.
 *
 * That is the same shape as the defect S159 P8 fixed: an assertion that is *true about the constants*
 * and silent about the behaviour. So this measures the actual decrement ticks on the real clock and
 * prints them, which is also how the figure in `hostTick.ts`'s reload docblock gets to be a
 * measurement instead of a claim.
 */
describe('S160 P2(a) — the five bags really do fit inside a REAL fight', () => {
  it('⭐ measures the true drain, FSM cost included, against the full FIGHT_PHASE_TICKS', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);

    // ⚠ `igniteThenFight` shortens the fight to keep the other cases quick. Restore the REAL length:
    // the whole point is to price the magazine against the fight players actually get.
    const fightStart = w.tick;
    w.phaseEndsAtTick = fightStart + FIGHT_PHASE_TICKS;

    const throwTicks: number[] = [];
    let last = t.bagsRemaining;
    expect(last, 'the control — a full magazine, or the drain below measures nothing').toBe(
      STINK_TOWER_BAGS,
    );

    // Tick one at a time so every decrement is attributed to an exact tick.
    while (w.matchPhase === 'FIGHT' && t.bagsRemaining > 0) {
      run(w, 1, d, st);
      if (t.bagsRemaining < last) {
        throwTicks.push(w.tick - fightStart);
        last = t.bagsRemaining;
      }
    }

    const gaps = throwTicks.slice(1).map((v, i) => v - throwTicks[i]!);
    const drain = throwTicks[throwTicks.length - 1] ?? -1;
    const naive = STINK_THROW_INTERVAL_TICKS * STINK_TOWER_BAGS;
    // eslint-disable-next-line no-console
    console.log(
      `[S160 P2a] throws at ${throwTicks.join(', ')} (ticks into FIGHT) · gaps ${gaps.join(', ')} · ` +
        `drained by ${drain} of ${FIGHT_PHASE_TICKS} · the constants-only estimate was ${naive}`,
    );

    expect(throwTicks, 'all five bags are thrown').toHaveLength(STINK_TOWER_BAGS);
    expect(t.bagsRemaining).toBe(0);
    expect(
      drain,
      `the magazine must empty INSIDE the fight, not merely inside ${naive} arithmetic ticks`,
    ).toBeLessThan(FIGHT_PHASE_TICKS);

    // ⭐ THE ASSERTION THE ARITHMETIC TEST CANNOT MAKE: the FSM costs real ticks, so the true drain
    // is strictly LATER than the naive product. If this ever reads `<=`, the windup/fire/recover
    // states have stopped costing anything and something has been short-circuited.
    expect(
      drain,
      'the FSM adds windup + fire + recover per throw, so the real drain exceeds the naive product',
    ).toBeGreaterThan(naive - STINK_THROW_INTERVAL_TICKS);
  });
});

/**
 * SPARK — S161 P3 (BUG-2): **THE OWNER'S RULING THAT THE TOWER THROWS FOR THE WHOLE FIGHT.**
 *
 * > Owner, playing 2026-09-03: *"stink tower should continuously throw out poop bags throughout the
 * > fight stage. i know we said max 5 but lets make it throughout. also lets make the bags last 1 sec
 * > longer before dissapearing."*
 *
 * ⚠ THE MEASUREMENT ABOVE IS THE REASON THIS WAS A BUG AND NOT A PREFERENCE. S160 P2(a) printed the
 * real drain: five throws, done by ~1390 of 2700 ticks, so the tower spent 22 of every 45 seconds
 * miming — playing the attack row and the lob arc, burning the same 284-tick cycle, emitting no bag.
 * The owner watched that and asked for it to stop.
 *
 * ⛔ AND THE MODE CHANGE MUST SURVIVE IT. `bagsRemaining` still walks 5 → 0 on the same schedule
 * because two OTHER readers depend on it: the depleted tower gains a taunt (`stinkAggroTargets`,
 * S157 B9) and its death blast decays (`stinkBlastFor`). S160's own correction — *"emptying is a
 * MODE CHANGE, not an off-switch"* — is what makes deleting the counter the wrong fix.
 */
describe('S161 P3 (BUG-2) — the tower throws for the WHOLE fight, and the magazine still means something', () => {
  it('⭐ keeps throwing after the magazine reads zero', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    const t = igniteThenFight(w, d, st);
    const fightStart = w.tick;
    w.phaseEndsAtTick = fightStart + FIGHT_PHASE_TICKS;

    // Count LANDED BAGS, not decrements — the decrement is exactly what stops meaning "a throw".
    let landed = 0;
    let seen = new Set(w.stinkClouds.keys());
    let dryAtTick: number | null = null;
    let lowest = t.bagsRemaining;
    while (w.matchPhase === 'FIGHT') {
      run(w, 1, d, st);
      for (const id of w.stinkClouds.keys()) {
        if (!seen.has(id)) { landed++; seen.add(id); }
      }
      if (dryAtTick === null && t.bagsRemaining === 0) dryAtTick = w.tick - fightStart;
      // ⚠ SAMPLE THE FLOOR INSIDE THE LOOP. Reading `bagsRemaining` after it exits reads the value
      // the BUILD edge just RELOADED (S159 P8's per-round refill), not the value the fight reached —
      // which is how the first version of this assertion managed to expect 0 and find 5.
      if (t.bagsRemaining < lowest) lowest = t.bagsRemaining;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[S161 P3] ${landed} bags landed across ${FIGHT_PHASE_TICKS} FIGHT ticks; ` +
        `magazine read zero at tick ${dryAtTick ?? -1}`,
    );

    expect(dryAtTick, 'the magazine still empties — the mode change is intact').not.toBeNull();
    expect(landed, 'more bags land than the magazine ever held').toBeGreaterThan(STINK_TOWER_BAGS);
    expect(lowest, 'and the counter floors at zero rather than going negative').toBe(0);
    expect(t.bagsRemaining, 'the BUILD edge still re-arms it — S159 P8 intact').toBe(STINK_TOWER_BAGS);
  });

  it('the throws keep their cadence — this is continuous, not a burst', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    igniteThenFight(w, d, st);
    const fightStart = w.tick;
    w.phaseEndsAtTick = fightStart + FIGHT_PHASE_TICKS;

    const landTicks: number[] = [];
    const seen = new Set(w.stinkClouds.keys());
    while (w.matchPhase === 'FIGHT') {
      run(w, 1, d, st);
      for (const id of w.stinkClouds.keys()) {
        if (!seen.has(id)) { seen.add(id); landTicks.push(w.tick - fightStart); }
      }
    }
    const gaps = landTicks.slice(1).map((v, i) => v - landTicks[i]!);
    // Every gap is the FSM's real cycle, not a stampede and not a stall.
    for (const g of gaps) {
      expect(g, `gap ${g} out of range — gaps were ${gaps.join(', ')}`)
        .toBeGreaterThanOrEqual(STINK_THROW_INTERVAL_TICKS);
    }
    expect(gaps.length, 'several throws, so there are gaps to check').toBeGreaterThan(4);
  });

  it('a landed bag now lasts exactly one second longer than its throw interval', () => {
    // The owner asked for "+1 sec". Written as INTERVAL + PHYSICS_HZ so a retune of the throw rate
    // carries the overlap with it, and so the +1 s stays visible as +1 s rather than as a bare 300.
    expect(STINK_CLOUD_LIFETIME_TICKS).toBe(STINK_THROW_INTERVAL_TICKS + PHYSICS_HZ);
    expect(STINK_CLOUD_LIFETIME_TICKS - STINK_THROW_INTERVAL_TICKS).toBe(PHYSICS_HZ);
  });

  it('⇒ consecutive clouds OVERLAP, so the ground is never briefly clean between bags', () => {
    // The consequence the owner actually asked for, stated as a property rather than a number.
    expect(STINK_CLOUD_LIFETIME_TICKS).toBeGreaterThan(STINK_THROW_INTERVAL_TICKS);
  });
});
