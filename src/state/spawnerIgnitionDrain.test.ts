/**
 * SPARK — S169 (owner playtest) — A SECOND TOWER OF THE SAME RACE STAYED AS SHAPES.
 *
 * Owner, verbatim: *"I did the Piranha, and it didn't produce at all. And then I build another
 * Piranha tower, and it just stayed as shaped. It didn't even show, like, the picture of the tower.
 * And then all of a sudden, the first tower produced two piranhas at once."*
 *
 * And separately, on a different race: *"i build a tier 3 warband (orcs) tower and he didnt turn
 * into the building right away... took some time. sometimes it takes a whole turn... why?"*
 *
 * ## ⛔ ONE IGNITION PER RECIPE PER TOPOLOGY CHANGE
 *
 * `igniteOneSpawnerRecipe` registers the lowest un-registered anchor and `return true`s — its name
 * says so. The ignition chain calls it ONCE per recipe id, so a seat holding TWO finished rings of
 * the SAME race gets one spawner and one inert pile of primitives.
 *
 * The inert one is not retried on a timer, because ignition is not a structural scan: both
 * `runSpawnerIgnition` and `runDefenderIgnition` open with a sweep of `world.effects` and
 * `if (!hasTopologyChange) return;`. So the second ring waits for the next `BOND_FORMED` or
 * player-caused `BOND_SEVERED` **anywhere on the board** — which, if the player has finished
 * placing, may not arrive for the rest of the turn. `blueprintBuild.ts`'s docblock already warns
 * about this exact dependency in the singular: *"Without an emitted `BOND_FORMED`, a
 * perfectly-formed stamped structure sits inert forever: no tower, no error, no log line."*
 *
 * That is every symptom he described, in order: no tower picture (no spawner ⇒ nothing to draw), no
 * production (no spawner ⇒ no emit), and then both towers producing together once a later bond
 * finally ignited the second one and the S169 fight-edge pin put them on the same grid.
 *
 * ## ⭐ WHY DRAINING ALL ANCHORS IS SAFE HERE, AND IS *NOT* A CHANGE TO THE PENTAGRAM
 *
 * The one-per-frame cap is a real design constraint for the pentagram and the lightning hub: those
 * two lines keep their early `return`, so a pentagram ignition still ends the sweep. What was never
 * intentional is that a player who builds two of the SAME tier-3 tower gets one. The existing
 * comment in the chain already names the durable fix — make ignition drain ALL matches, *"as
 * `runDefenderIgnition` already is"* — and that is what the tower recipes now do.
 *
 * `t3TowerX`/`t9TowerX` rings are pairwise disjoint per seat by race (R110), and the two tiers
 * cannot share an anchor (a 9-ring fails the 3-walk's closure test and vice versa), so draining
 * cannot cross-register. The goblin tower drains for the same reason.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { RACE_TOWER_IDS } from './raceTowerIds.ts';
import { T9_TOWER_IDS } from './t9BossIds.ts';
import './godlyRecipes/t9BossTower.ts';
import { makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import type { RaceId } from './races.ts';
import './godlyRecipes/raceTower.ts';

const P0 = asPlayerId(0);
const RACE: RaceId = 'vampires'; // seat 0's default race, so R137's owner check passes

function seatWorld(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  return w;
}

/**
 * Stamp one race-tower ring at `centre`, paying from a bank topped up for exactly this bill.
 *
 * ⚠ `applyBuildBlueprint` emits the ONE `BOND_FORMED` that ignition's topology gate needs. That
 * emit is the thing under test's precondition, not the thing under test — see the docblock.
 */
function buildTower(w: World, centre: { x: number; y: number }): void {
  const id = RACE_TOWER_IDS[RACE];
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, {
    type: 'BUILD_BLUEPRINT',
    playerId: P0,
    blueprintId: id,
    centre,
  });
}

function spawnersFor(w: World): number {
  return [...w.creatureSpawners.values()].filter(
    (s) => s.recipeId === RACE_TOWER_IDS[RACE],
  ).length;
}

describe('S169 — spawner ignition drains EVERY finished ring, not one per topology change', () => {
  it('CONTROL — one tower still ignites from one sweep (the case that always worked)', () => {
    const w = seatWorld();
    buildTower(w, { x: 420, y: 400 });
    runSpawnerIgnition(w);
    expect(spawnersFor(w)).toBe(1);
  });

  it('⭐⭐ TWO towers of the same race BOTH ignite from ONE sweep — the owner report', () => {
    const w = seatWorld();
    buildTower(w, { x: 300, y: 300 });
    buildTower(w, { x: 800, y: 300 });
    // One sweep is all the player gets: `applyBuildBlueprint` emitted BOND_FORMED, the host tick
    // runs ignition once, and if the player now stops placing there is no further topology change.
    runSpawnerIgnition(w);
    expect(spawnersFor(w), 'both rings are live spawners').toBe(2);
  });

  it('⭐ THREE towers too — draining must not be a one-extra special case', () => {
    const w = seatWorld();
    buildTower(w, { x: 300, y: 300 });
    buildTower(w, { x: 800, y: 300 });
    buildTower(w, { x: 300, y: 800 });
    runSpawnerIgnition(w);
    expect(spawnersFor(w)).toBe(3);
  });

  it('⭐ the second tower is a DISTINCT spawner on its own anchor, not a double-register', () => {
    const w = seatWorld();
    buildTower(w, { x: 300, y: 300 });
    buildTower(w, { x: 800, y: 300 });
    runSpawnerIgnition(w);
    const live = [...w.creatureSpawners.values()].filter(
      (s) => s.recipeId === RACE_TOWER_IDS[RACE],
    );
    expect(new Set(live.map((s) => s.id)).size, 'distinct spawner ids').toBe(2);
    expect(new Set(live.map((s) => s.anchorPrimitiveId)).size, 'distinct anchors').toBe(2);
  });

  /*
   * ⛔⛔ THE GUARD AGAINST THE REGRESSION THIS FIX ALMOST SHIPPED, and it is worse than the bug.
   *
   * `findRingAnchors` returns EVERY node of a ring, because every node is a valid seed by symmetry.
   * The one-shot helper survived that by taking the lowest and returning. The first draft of the
   * drain de-duped on `(anchor, owner)` only, so it registered a spawner PER NODE: three per tier-3
   * ring — and **NINE per tier-9 ring, i.e. nine bosses out of one pyramid.**
   *
   * `raceTower.ts`'s anchor-finder docblock had already written the warning ("every node of a ring is
   * a valid seed by symmetry, which makes this the one recipe family where 'any match will do' is
   * actively wrong"). These two assertions are that prose turned into a gate.
   */
  it('⛔ ONE tier-3 ring is ONE spawner — three nodes must not mean three towers', () => {
    const w = seatWorld();
    buildTower(w, { x: 420, y: 400 });
    runSpawnerIgnition(w);
    // The ring has RACE_TOWER_SIZE (3) valid anchors; exactly one may become a spawner.
    expect(spawnersFor(w), 'one ring, one tower').toBe(1);
  });

  it('⛔⛔ ONE tier-9 ring is ONE boss tower — NINE nodes must not mean nine bosses', () => {
    const w = seatWorld();
    const id = T9_TOWER_IDS[RACE];
    const bank = w.castleBanks.get(P0) ?? makeCastleBank();
    for (const [type, count] of blueprintBill(id)) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: id,
      centre: { x: 420, y: 400 },
    });
    runSpawnerIgnition(w);
    const live = [...w.creatureSpawners.values()].filter((s) => s.recipeId === id);
    expect(live.length, 'one nine-ring, one boss tower').toBe(1);
  });

  it('⭐ IDEMPOTENT — a second sweep with no new rings registers nothing further', () => {
    // The de-dup is per (anchor, owner) against the live map. Draining must not re-register.
    const w = seatWorld();
    buildTower(w, { x: 300, y: 300 });
    buildTower(w, { x: 800, y: 300 });
    runSpawnerIgnition(w);
    expect(spawnersFor(w)).toBe(2);
    runSpawnerIgnition(w);
    expect(spawnersFor(w), 'still two — no duplicates').toBe(2);
  });
});
