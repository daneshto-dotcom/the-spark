/**
 * SPARK — S181: **A UNIT ATTACKS THE BUILDING IN FRONT OF IT AGAIN.**
 *
 * Owner, S181, and he was right that it had already been ruled:
 *
 * > *"All the creatures are targeting the castle rather than the towers and the connectors. And the
 * > connectors, that's wrong — everything is going straight for the castle … maybe because the
 * > castle is the only thing that's left attacking? Well, not really, because there's stink towers
 * > and it's not even targeting it. That's wrong. I already told you the targeting rules so we've
 * > already defined it and it's not working. Rework it, make it correct and coherent and consistent
 * > with what we want it to be."*
 *
 * ## THE DEFECT, IN ONE LINE OF EACH OF TWO COMMITS
 *
 * S179's lone-shape rule (00e02bf) added `if (prim.bonds.size > 0) continue;` to
 * `findNearestEnemyPrimitiveFrom` — correct on its own terms and the owner's own words, *"a building
 * is killed through its connectors, not by eating its bricks"*. S139 had already forced
 * `creature.targetBondId = null` for structure-attackers, because a goblin was then defined as a
 * shape-eater that never commits to a connector.
 *
 * Together they left 21 of 24 unit types with NOTHING to aim at once the loose bricks were gone, and
 * the castle march was the only rung left in the ladder. Only Voltkin, the pencil chewer and the
 * lightning drone could touch a building at all.
 *
 * ## WHAT THESE TESTS PIN
 *
 * ⛔ The point is not that a function returns a value — it is that a goblin standing next to a
 * standing building ACTUALLY DAMAGES IT through the real host tick. Two of the cases below run the
 * shipped tick and read the structure pool afterwards, because a returned target id proves nothing
 * about whether a strike lands: S139's own note records a goblin that *"reached ATTACKING correctly
 * … closed distance, played the approach, and did literally nothing"* for 200 ticks.
 */
import { describe, expect, it } from 'vitest';
import {
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_PEN,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  phaseDurationTicks,
} from '../constants.ts';
import { structureTargets } from './creatures/creatureAI.ts';
import { attackFifths, structurePoolFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { asCreatureId, makeCreature, type Creature } from './creatures/creature.ts';
import { GOBLIN_MELEE_CONFIG } from './creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  // START_GAME is what mints the seats AND the layout the castle march reads. Same shape as
  // `castleSiege.test.ts`'s board().
  const w = makeWorld(0xb5);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

function addShape(w: World, owner: typeof P0, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square,
    placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(),
    ownerColor: PLAYER_COLORS[seat]!, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

let nextBond = 9000;
/** A REAL bond — in `world.bonds` AND on both endpoints, exactly as production builds one. */
function connect(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(nextBond++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/**
 * A STURDY building: a chain of `n + 1` shapes giving `n` connectors, so `structurePoolFifths(n)` is
 * large enough that banked damage is READABLE before anything gives way.
 *
 * ⚠ IT EXISTS BECAUSE MY FIRST MEASUREMENT WAS UNREADABLE, NOT BECAUSE THE FEATURE WAS BROKEN. A
 * two-shape structure has ONE connector and `structurePoolFifths(1)` = 6 fifths, while a melee
 * goblin swings for 12 — so it is severed by the first blow and the bond is gone from `world.bonds`
 * before any assertion can read its banked damage. A live probe through the real tick showed the
 * goblin reaching ATTACKING with the connector committed at tick 50 and the bond destroyed by tick
 * 75; the feature was working and the yardstick was wrong.
 */
function sturdyBuilding(w: World, owner: typeof P0, x: number, y: number, n: number): BondId[] {
  let prev = addShape(w, owner, x, y);
  const bonds: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = addShape(w, owner, x + 32 * i, y);
    bonds.push(connect(w, prev, next));
    prev = next;
  }
  return bonds;
}

/** A STANDING BUILDING: two bonded shapes, i.e. a shape that S179 correctly made untargetable. */
function building(w: World, owner: typeof P0, x: number, y: number): BondId {
  const a = addShape(w, owner, x, y);
  const b = addShape(w, owner, x + 32, y);
  return connect(w, a, b);
}

/**
 * ⚠ THROUGH THE REAL FACTORY, not a hand-built object literal. My first cut assembled the creature
 * by hand; the pure cases passed and the HOST-TICK case silently banked zero damage, because a
 * hand-rolled creature is missing whatever `makeCreature` initialises and the tick quietly did
 * nothing with it. Same class as the fixture note in `castleGuns.test.ts`: a fixture that is not
 * built the way production builds it passes for the wrong reason.
 */
function goblinAt(w: World, owner: typeof P0, x: number, y: number): Creature {
  const c = makeCreature(GOBLIN_MELEE_CONFIG, {
    id: asCreatureId(7000 + w.creatures.size),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: w.tick,
    sourceSpawnerId: asSpawnerId(900 + w.creatures.size),
    clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

// ⚠ COPIED FROM `castleSiege.test.ts`, NOT INVENTED. My first cut guessed the shape and every
// host-tick case failed with "cannot read properties of undefined" — a test that fails for the wrong
// reason proves nothing. `runHostTick(world, deps, state)`, and `makeHostTickState` TAKES the world.
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

/** Total damage banked across a structure's connectors — what `damageConnector` accumulates. */
function banked(w: World, bondId: BondId): number {
  return w.bonds.get(bondId)?.damageFifths ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S181 — structureTargets: the CLOSEST attackable thing, not shape-then-castle', () => {
  it('⭐⭐ HIS BUG: a standing building IS a target again, through its connector', () => {
    const w = twoSeat();
    const bond = building(w, P1, 500, 500);
    const g = goblinAt(w, P0, 480, 500);
    const st = structureTargets(w, g);
    // ⛔ Before this fix BOTH were null for exactly this board — a bonded pair is skipped by the
    // shape scan, and `targetBondId` was forced null — which is why the only rung left was the keep.
    expect(st.bondId).toBe(bond);
    expect(st.primitiveId).toBeNull();
  });

  it('a LONE shape is still the target when it is the nearer thing', () => {
    const w = twoSeat();
    building(w, P1, 900, 500);          // far
    const lone = addShape(w, P1, 505, 500); // near, unconnected
    const g = goblinAt(w, P0, 500, 500);
    const st = structureTargets(w, g);
    expect(st.primitiveId).toBe(lone.id);
    expect(st.bondId).toBeNull();
  });

  it("⛔ THE COSTUME-CHANGE GUARD: a loose brick across the map does NOT beat the tower in reach", () => {
    /*
     * This is the case a shape-FIRST ladder would get wrong, and it would have looked like a fix
     * while reproducing his complaint: a unit beside a stink tower turning round and walking away to
     * a single brick because one existed somewhere. Distance decides, which is what "the closest
     * building, whatever it is" actually means.
     */
    const w = twoSeat();
    const bond = building(w, P1, 510, 500);
    addShape(w, P1, 1500, 500); // a lone brick, far away
    const g = goblinAt(w, P0, 500, 500);
    const st = structureTargets(w, g);
    expect(st.bondId).toBe(bond);
    expect(st.primitiveId).toBeNull();
  });

  it('⛔ EXACTLY ONE of the two is ever returned', () => {
    // Setting both would put the creature into ATTACKING against a bond while navigating to a
    // shape — the "pretending to attack and not hitting anything" defect S177 P9 killed.
    const w = twoSeat();
    building(w, P1, 520, 500);
    addShape(w, P1, 540, 500);
    const st = structureTargets(w, goblinAt(w, P0, 500, 500));
    expect(st.bondId === null || st.primitiveId === null).toBe(true);
  });

  it('never targets your OWN building', () => {
    const w = twoSeat();
    building(w, P0, 510, 500); // same seat as the goblin
    const st = structureTargets(w, goblinAt(w, P0, 500, 500));
    expect(st.bondId).toBeNull();
    expect(st.primitiveId).toBeNull();
  });

  it('returns nothing on an empty board, so the castle march still happens', () => {
    const w = twoSeat();
    const st = structureTargets(w, goblinAt(w, P0, 500, 500));
    expect(st.bondId).toBeNull();
    expect(st.primitiveId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("S181 — ⛔ THE STINK TOWER HE NAMED IS REACHABLE, and nothing filters a recipe out", () => {
  /**
   * Owner: *"there's stink towers and it's not even targeting it. That's wrong."*
   *
   * ⭐ THE GENERAL GUARANTEE IS STRONGER THAN A STINK-TOWER FIXTURE, so that is what is asserted:
   * `findNearestBondTarget` filters on OWNER COLOUR ALONE. It has no recipe test, no defender test
   * and no tower test — so every structure in the game is reachable through its connectors by the
   * same code path, including the stink tower, the laser turret's host structure and a pair of
   * shapes a player welded by hand.
   *
   * ⛔ THE REGRESSION THIS GUARDS is someone "fixing" a future targeting complaint by excluding a
   * recipe here. That would silently un-target one building and reproduce his report for that one
   * thing only — the hardest version of this bug to find, because 23 of 24 cases would still work.
   *
   * ⭐ S190 P0 (C5) — RE-DERIVED, NOT LOOSENED. The scan used to be one function, and this guard
   * sliced a 4000-character window after `export function findNearestBondTarget` and looked for the
   * ownership filter inside it. S190 moved the classification into a per-tick index for performance
   * (byte-identical outputs, proven by `bondTargetIndex.differential.test.ts`): the filter now runs
   * in `buildColourBucket`, the entry point reads the classified bucket, and the per-creature passes
   * are `nearestBondIn` and `spreadEnemyTarget`. A window over the entry point alone would have gone
   * on passing over a recipe filter added to the builder — a source-text guard proving a line EXISTS
   * somewhere near, not that it is the one REACHED. So each of the four functions is now sliced
   * exactly (to its closing brace) and every one of them is held to the same rule.
   */
  it('the bond scan rejects on ownership and NOTHING else', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const src = readFileSync('src/state/creatures/creatureAI.ts', 'utf-8');
    // ⚠ NO ESCAPE IN A GENERATED STRING — a literal newline injected into a TS string literal is what
    //   broke this file's first cut. A top-level function ends at the first line that STARTS with a
    //   closing brace, which a multiline regex finds without any escaped newline.
    const fnBody = (head: string): string => {
      const start = src.indexOf(head);
      expect(start, `${head} not found in creatureAI.ts`).toBeGreaterThan(-1);
      const end = src.slice(start).search(/^\}/m);
      expect(end, `${head} has no closing brace`).toBeGreaterThan(0);
      return src.slice(start, start + end + 1);
    };
    const entry = fnBody('export function findNearestBondTarget(');
    const builder = fnBody('function buildColourBucket(');
    const spread = fnBody('function spreadEnemyTarget(');
    const scan = fnBody('function nearestBondIn(');
    // The entry point scans the CLASSIFIED bucket, so the builder's filter is the one that decides…
    expect(entry).toContain('colourBucketFor(');
    // …and the one legitimate filter is ownership.
    expect(builder).toContain('isEnemyBondWithColor');
    // ⛔ and no recipe / defender / tower exclusion has crept in beside it, anywhere in the scan.
    for (const [name, body] of [['findNearestBondTarget', entry], ['buildColourBucket', builder], ['spreadEnemyTarget', spread], ['nearestBondIn', scan]] as const) {
      for (const smell of ['recipeId', 'stinkTower', 'laserTurret', 'defenders', 'isRaceTowerId']) {
        expect(body.includes(smell), `bond scan (${name}) must not filter on ${smell}`).toBe(false);
      }
    }
  });

  it('a structure of ANY size is reachable — 1 connector through 5', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const w = twoSeat();
      sturdyBuilding(w, P1, 500, 500, n);
      const st = structureTargets(w, goblinAt(w, P0, 495, 500));
      expect(st.bondId, `${n}-connector structure must be targetable`).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S181 — ⭐⭐⭐ MEASURED THROUGH THE REAL HOST TICK, because a target id proves nothing', () => {
  it("a goblin beside a standing building DAMAGES it — the owner's whole report", () => {
    const w = twoSeat();
    // FIVE connectors: pool 50 fifths against a 12-fifth swing, so damage banks visibly.
    const bonds = sturdyBuilding(w, P1, 500, 500, 5);
    goblinAt(w, P0, 495, 500);
    const d = deps();
    const st = makeHostTickState(w);

    const total = (): number => bonds.reduce((sum, b) => sum + banked(w, b), 0);
    expect(total(), 'fixture: undamaged at t0').toBe(0);
    expect(structurePoolFifths(5)).toBe(50);

    for (let i = 0; i < 200; i++) runHostTick(w, d, st);

    /*
     * ⛔ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE WHOLE DEFECT. Before the fix a goblin on
     * this board marched to the keep and this stayed 0 forever, while every unit test in the repo
     * stayed green — the bug shipped for two sessions and the owner found it by playing.
     */
    expect(total(), 'a goblin beside a building must damage it').toBeGreaterThan(0);
    // And it hits for its OWN ladder swing, not a bespoke constant.
    expect(total() % attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN)).toBe(0);
  });

  it('⭐ a sustained push FELLS a two-shape structure, so buildings are killable again', () => {
    const w = twoSeat();
    const bond = building(w, P1, 500, 500);
    for (let i = 0; i < 4; i++) goblinAt(w, P0, 494 + i, 500 + i);
    const d = deps();
    const st = makeHostTickState(w);

    // pool(1 connector) = 1 x (1 + 5) = 6 fifths, and a melee goblin swings for 12.
    expect(structurePoolFifths(1)).toBe(6);
    for (let i = 0; i < 600; i++) runHostTick(w, d, st);
    expect(w.bonds.has(bond), 'the connector must give way under a real push').toBe(false);
  });

  it('⚠ a unit with NO building in range still marches on the keep', () => {
    // The castle rung must survive the fix: it is what a unit does when there is nothing else, and
    // deleting it would trade his bug for a worse one.
    const w = twoSeat();
    const g = goblinAt(w, P0, 500, 500);
    const d = deps();
    const st = makeHostTickState(w);
    const start = { x: g.pos.x, y: g.pos.y };
    for (let i = 0; i < 200; i++) runHostTick(w, d, st);
    const moved = Math.hypot(g.pos.x - start.x, g.pos.y - start.y);
    expect(moved, 'it must still go somewhere').toBeGreaterThan(1);
  });
});
