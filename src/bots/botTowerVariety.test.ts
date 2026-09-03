/**
 * SPARK — S161 P3 (BUG-3): **A BOT BUILDS MORE THAN ONE KIND OF TOWER, AND SAVES FOR THE NEXT ONE.**
 *
 * > Owner, playing 2026-09-03: *"bots (even on imba) only build stink towers... not very imba if you
 * > ask me, other than that they just always build loose structures... thats not what we said. they
 * > need to actually play the game and build all types of towers and save more."*
 *
 * ## ⚠ WHY botTowers.test.ts WAS GREEN THROUGHOUT
 *
 * That file pins *"a tower EXISTS in the world after a driven run"* and the difficulty floor. Both
 * were true the whole time — the bot really was building a tower, the same tower, forever. A test
 * that asks "did a tower appear?" cannot see "is it always the same one?", and a test that hands the
 * bot exactly one bill (`bankTheBill(CHEAPEST)`) cannot see that it never accumulates past it.
 *
 * ⇒ Every assertion here is about the SET of blueprints a seat pursues, or about what it does when
 * it can afford the cheap thing and wants the dear one. Those are the two questions the owner asked.
 */

import { describe, expect, it } from 'vitest';

import { BOT_CONFIGS } from './botConfig.ts';
import { chooseTargetBlueprint, chooseTowerOrder, chooseTowerPlan, ownedBlueprintIds } from './botBrain.ts';
import { bankAdd } from '../state/castleBank.ts';
import { blueprintBill, blueprintCost, ALL_BLUEPRINT_IDS } from '../state/blueprints.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';

const BOT = asPlayerId(1);

const BY_COST: readonly GodlyId[] = [...ALL_BLUEPRINT_IDS].sort(
  (a, b) => blueprintCost(a) - blueprintCost(b) || (a < b ? -1 : a > b ? 1 : 0),
);

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

function bankTheBill(w: World, seat: PlayerId, id: GodlyId): void {
  for (const [type, n] of blueprintBill(id)) {
    for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, type);
  }
}

/** Pretend `seat` already raised `id` — one stamped primitive is all `origin` needs. */
let nextPrimId = 9000;
function markOwned(w: World, seat: PlayerId, id: GodlyId): void {
  const pid = asPrimitiveId(nextPrimId++);
  const p: Primitive = {
    id: pid,
    type: SparkType.Dot,
    placerColor: PLAYER_COLORS[seat as unknown as number]!,
    placedBy: seat,
    createdTick: 0,
    pos: { x: 400, y: 400 },
    prevPos: { x: 400, y: 400 },
    bonds: new Set(),
    ownerColor: PLAYER_COLORS[seat as unknown as number]!,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: { blueprintId: id, nodeIndex: 0 },
  };
  w.primitives.set(pid, p);
}

describe('chooseTargetBlueprint — the bot climbs instead of looping', () => {
  it('opens on the cheapest rung', () => {
    const w = botsWorld();
    expect(chooseTargetBlueprint(w, BOT, BOT_CONFIGS.IMBA)).toBe(BY_COST[0]);
  });

  it('⭐ moves on once a rung is raised, and keeps moving — the whole complaint', () => {
    const w = botsWorld();
    const cfg = BOT_CONFIGS.IMBA;
    const seen: GodlyId[] = [];
    for (let i = 0; i < cfg.towerTiers; i++) {
      const target = chooseTargetBlueprint(w, BOT, cfg)!;
      seen.push(target);
      markOwned(w, BOT, target);
    }
    // Before the fix this array was [stinkTower, stinkTower, stinkTower, …] forever.
    expect(new Set(seen).size, `pursued ${seen.join(' → ')}`).toBe(cfg.towerTiers);
    expect(seen).toEqual([...BY_COST.slice(0, cfg.towerTiers)]);
  });

  it('once every rung in its tier is raised, it repeats the BEST one, not the cheapest', () => {
    const w = botsWorld();
    const cfg = BOT_CONFIGS.IMBA;
    for (const id of BY_COST.slice(0, cfg.towerTiers)) markOwned(w, BOT, id);
    expect(chooseTargetBlueprint(w, BOT, cfg)).toBe(BY_COST[cfg.towerTiers - 1]);
  });

  it('respects the difficulty ladder — a tier never targets above its rungs', () => {
    for (const name of ['MID', 'HARD', 'IMBA'] as const) {
      const cfg = BOT_CONFIGS[name];
      const w = botsWorld();
      const allowed = new Set(BY_COST.slice(0, cfg.towerTiers));
      for (let i = 0; i < cfg.towerTiers + 3; i++) {
        const t = chooseTargetBlueprint(w, BOT, cfg)!;
        expect(allowed.has(t), `${name} targeted ${t}, outside its ${cfg.towerTiers} rungs`).toBe(true);
        markOwned(w, BOT, t);
      }
    }
  });

  it('a tier that builds no towers targets nothing', () => {
    const w = botsWorld();
    expect(chooseTargetBlueprint(w, BOT, BOT_CONFIGS.NOOB)).toBeNull();
  });
});

describe('the bot SAVES for its target instead of spending on the cheap thing', () => {
  it('⭐ with a stink tower standing and only a stink tower affordable, it builds NOTHING', () => {
    /*
     * THE "save more" HALF. Before the fix this returned a second stink tower every time, forever:
     * cheapest-first over the affordable set, and the orderer had stopped hauling because the
     * cheapest rung was affordable. Now the seat is aiming one rung up and holds its shapes.
     */
    const w = botsWorld();
    markOwned(w, BOT, BY_COST[0]!);
    bankTheBill(w, BOT, BY_COST[0]!);
    expect(chooseTowerPlan(w, BOT, BOT_CONFIGS.IMBA)).toBeNull();
  });

  it('…and it is still ORDERING, so the saving actually goes somewhere', () => {
    // Anti-vacuity for the case above: "builds nothing" must mean saving, not idling.
    const w = botsWorld();
    markOwned(w, BOT, BY_COST[0]!);
    bankTheBill(w, BOT, BY_COST[0]!);
    expect(chooseTowerOrder(w, BOT, BOT_CONFIGS.IMBA)).not.toBeNull();
  });

  it('it builds the moment the TARGET becomes affordable', () => {
    const w = botsWorld();
    markOwned(w, BOT, BY_COST[0]!);
    bankTheBill(w, BOT, BY_COST[1]!);
    const plan = chooseTowerPlan(w, BOT, BOT_CONFIGS.IMBA);
    expect(plan).not.toBeNull();
    expect(plan!.blueprintId).toBe(BY_COST[1]);
  });

  it('⚠ ESCAPE 1 — a seat with NOTHING standing still takes what it can get', () => {
    // An opening bot must not spend the first minutes empty-handed saving for rung two.
    const w = botsWorld();
    bankTheBill(w, BOT, BY_COST[0]!);
    const plan = chooseTowerPlan(w, BOT, BOT_CONFIGS.IMBA);
    expect(plan).not.toBeNull();
    expect(plan!.blueprintId).toBe(BY_COST[0]);
  });

  it('the orderer and the builder always agree on the target', () => {
    // The failure this pairing prevents: hauling type X while trying to stamp a blueprint needing Y.
    const w = botsWorld();
    markOwned(w, BOT, BY_COST[0]!);
    const target = chooseTargetBlueprint(w, BOT, BOT_CONFIGS.IMBA)!;
    const wanted = chooseTowerOrder(w, BOT, BOT_CONFIGS.IMBA);
    expect(wanted).not.toBeNull();
    expect([...blueprintBill(target).keys()]).toContain(wanted);
  });
});

describe('ownedBlueprintIds', () => {
  it('reads the stamp, and only this seat\'s', () => {
    const w = botsWorld();
    markOwned(w, BOT, BY_COST[2]!);
    markOwned(w, asPlayerId(0), BY_COST[3]!);
    const mine = ownedBlueprintIds(w, BOT);
    expect(mine.has(BY_COST[2]!)).toBe(true);
    expect(mine.has(BY_COST[3]!), 'the other seat\'s tower is not mine').toBe(false);
  });

  it('ignores loose shapes — only a stamped structure counts as a tower', () => {
    const w = botsWorld();
    expect(ownedBlueprintIds(w, BOT).size).toBe(0);
  });
});
