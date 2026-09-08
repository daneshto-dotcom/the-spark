/**
 * SPARK — S167 — **THE TIER-9 BOSS TOWER. NINE OF ONE SHAPE, ONE BOSS, THEN IT IS GONE.**
 *
 * Owner, verbatim (`RACE_ZONES_AND_BOSS_TOWERS.md` §B): *"we will build a tier 9 tower for each of
 * them !! it will take 9 of the same shape to buuild - the race shape and it will create a 'boss'
 * tower that spawns the boss. the tower would spawn 1 boss and then the tower would crumble with a
 * cool video generated … should take no [more than 8 seconds] … the bosses will have 2 unique
 * attacks and skills and will live untill they die."*
 *
 * So: **nine of the race's own feed shape, closed in a ring** — the tier-3 tower's structure at
 * three times the size, which is exactly the escalation the owner asked for. `RACE_FEED_SHAPE`
 * (`state/races.ts`, R109) is the mapping and this file adds no new one.
 *
 *            T---T
 *           /     \\        (nine of ONE shape; every node bonded to its two ring neighbours)
 *          T       T
 *          |       |
 *          T       T
 *           \\     /
 *            T---T
 *              T
 *
 * ## ⭐ THERE IS NO RECIPE COLLISION, AND IT WAS TRACED RATHER THAN HOPED
 *
 * A 9-ring and the tier-3 3-ring are **mutually exclusive by construction**, not merely
 * distinguishable, and both directions were walked through `ringMembersAt`'s actual clauses:
 *
 *   · **A 9-ring is not a 3-ring.** After three hops the walk is standing on the node three around
 *     from the anchor, so the `cur === anchorId` closure test fails. Every node of a 9-ring has
 *     exactly two same-type neighbours, so the exact-2 clause does NOT save us here — the closure
 *     test is the whole defence, which is why it must never be relaxed.
 *   · **A 3-ring is not a 9-ring.** At step 3 the walk returns to a node already in `seen` and the
 *     `seen.has(cur)` guard rejects it.
 *
 * `ringShape.test.ts` already pins the identical property for 5-vs-3 (*"a 5-ring of Triangles is NOT
 * a 3-ring, from any node"*); this file's test adds 9-vs-3 in both directions.
 *
 * **And no SHIPPED predicate matches a 9-ring either**, checked clause by clause rather than by
 * reputation: `isPentagramComponent` demands a component of exactly 5; every star recipe goes
 * through `isStarAt`, which requires a hub of degree 4 (goblinTower), 5 (lightningHub), 3
 * (stinkTower) or 6 (laserTurret / helga) — a clean ring node has same-type degree exactly 2;
 * `voltkin` needs a MIXED 4-Square/4-Triangle chain with degree-1 endpoints, which a single-type
 * cycle cannot supply.
 *
 * ## ⭐ NINE IS NO LONGER THE SUDOKU NUMBER, AND THAT WAS BOUGHT DELIBERATELY
 *
 * *"Nine of one shape"* used to summon the NONET trial. Owner R132 (S164) moved
 * `NONET_SHAPE_COUNT` to **12** precisely to free 9 for this tower. `detectNonet` skips any
 * component whose size is not EXACTLY that, so a 9-ring cannot fire it.
 *
 * ⚠ ONE RESIDUAL, PRE-EXISTING AND NOT CAUSED BY THIS FEATURE: a 9-ring with three more same-type
 * shapes bonded onto it is a 12-component of one type and DOES fire NONET. That is true of any nine
 * shapes today and is left alone rather than special-cased.
 *
 * ## ⛔ OWNER RULING R137 APPLIES HERE TOO — AN OFF-RACE PLAYER MAY NOT IGNITE ANOTHER RACE'S RING
 *
 * Predicates are RACE-BLIND: the signature is `(world, bondPos)` and carries no seat. Without the
 * gate a vampire who hand-builds nine Circles would release the ZOMBIE boss. R95 covers panel
 * visibility and buildability, not matchability, so the check lives where the seat is known — owner
 * resolution, below. The tier-3 tower took the same ruling and this is the same hole.
 *
 * ## ⚠ WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 * The RELEASE and the CRUMBLE are not here — they are in `hostTick`'s tier-9 emit arm, because they
 * are cadence and destruction rather than matching. This file answers only *"is there a tower, and
 * whose is it"*. The reason that split matters is recorded at the arm: routing a deliberate crumble
 * through the recipe-BREAK branch would hand the enemy a free `awardSpawnerKillReward`.
 */

import { ALL_RACES, RACE_FEED_SHAPE, type RaceId } from '../races.ts';
/*
 * ⛔ THE TABLES LIVE IN A SIDE-EFFECT-FREE LEAF, NOT HERE, for the S144 P1 reason `raceTowerIds.ts`
 * and `goblinKinds.ts` both document: this module calls `registerRecipe` at its tail, so
 * `blueprints.ts` importing an id from it would fire six registrations as an import side effect.
 */
import {
  T9_TOWER_IDS,
  T9_TOWER_SIZE,
  t9BossAtlasBase,
} from '../t9BossIds.ts';
export {
  T9_TOWER_IDS,
  T9_TOWER_SIZE,
  T9_BOSS_TYPE,
  T9_BOSS_NAMES,
  T9_SHORT_NAME,
  t9TowerLabel,
  t9BossAtlasBase,
  t9TowerAtlasBase,
  t9DestroyAtlasBase,
  isT9TowerId,
  raceForT9TowerId,
  isT9BossType,
  raceForT9BossType,
} from '../t9BossIds.ts';
import { findRingAnchors, ringMembersAt } from './ringShape.ts';
import { registerRecipe } from './index.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { SpawnerGodlyRecipe, SpawnerRecipePredicate } from './types.ts';

/**
 * Every valid nine-ring anchor for `race`, ascending id.
 *
 * ⛔ THE CALLER TAKES THE LOWEST. `igniteOneSpawnerRecipe` de-dups on `(anchor, owner)` and does NOT
 * compare recipeIds, so an anchor that shifted between frames would read as a second structure and
 * double-ignite — which for THIS tower means a second boss. Every node of a ring is a valid seed by
 * symmetry, so "any match will do" is actively wrong here.
 */
export function findT9TowerAnchors(world: World, race: RaceId): PrimitiveId[] {
  return findRingAnchors(world, RACE_FEED_SHAPE[race], T9_TOWER_SIZE);
}

/**
 * ⭐ S169 — THE NINE NODES OF THE RING AT `anchorId`, so a drain-all ignition claims the STRUCTURE.
 *
 * ⛔ THE STAKES HERE ARE THE HIGHEST IN THE FILE. A tier-9 ring has NINE valid anchors by symmetry,
 * so a drain-all ignition that de-dups per ANCHOR rather than per RING registers nine boss towers on
 * one nine-ring — and each releases a boss. The first draft of S169's drain did exactly that and a
 * test read back nine spawners where one was expected. `raceTower.ts`'s anchor-finder docblock had
 * already written the warning ("every node of a ring is a valid seed by symmetry"); it was true here
 * three times over.
 *
 * Returns `null` when `anchorId` is not a valid ring seed — the caller skips it.
 */
export function findT9TowerMembers(
  world: World,
  anchorId: PrimitiveId,
  race: RaceId,
): PrimitiveId[] | null {
  return ringMembersAt(world, anchorId, RACE_FEED_SHAPE[race], T9_TOWER_SIZE);
}

/**
 * The player who owns the ring at `anchorId`, **or `null` if they are not of `race` (R137)**.
 *
 * ⚠ THE RAINBOW-SAFE FALLBACK IS COPIED FROM `raceTowerOwnerForAnchor` ON PURPOSE. `placerColor`
 * can stop matching any live player after the rainbow shuffle remaps `player.color`, and the shipped
 * behaviour is to fall back to the first player rather than lose the structure. Diverging would make
 * two towers disagree about who owns a repainted shape.
 *
 * ⛔ AND THE RACE GATE APPLIES TO THE RESOLVED OWNER, FALLBACK INCLUDED. Letting the fallback skip
 * the check would make an off-race ignition reachable through exactly the path that is hardest to
 * reproduce — and the prize here is a boss, not a hound.
 */
export function t9TowerOwnerForAnchor(
  world: World,
  anchorId: PrimitiveId,
  race: RaceId,
): PlayerId | null {
  const node = world.primitives.get(anchorId);
  if (node === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === node.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  if (owner === undefined) return null;
  if (owner.raceId !== race) return null; // R137
  return owner.id;
}

/** PURE — the predicate for one race's boss tower. */
export function makeT9TowerPredicate(race: RaceId): SpawnerRecipePredicate {
  return (world) => {
    const anchors = findT9TowerAnchors(world, race);
    if (anchors.length === 0) return null;
    const anchorPrimitiveId = anchors[0]!; // lowest ring-member id (deterministic)
    const triggererPlayerId = t9TowerOwnerForAnchor(world, anchorPrimitiveId, race);
    if (triggererPlayerId === null) return null;
    return { triggererPlayerId, anchorPrimitiveId };
  };
}

/**
 * The six recipes, in `ALL_RACES` order.
 *
 * ⚠ `characterSprite` is the BOSS's atlas, not the tower's own art — the codex and the spawner
 * registration use it as the "what does this make" picture, and `goblinTower` set that precedent by
 * pointing at `goblin-melee` rather than at the tower.
 */
export const T9_TOWER_RECIPES: readonly SpawnerGodlyRecipe[] = ALL_RACES.map((race) => ({
  kind: 'spawner' as const,
  id: T9_TOWER_IDS[race],
  predicate: makeT9TowerPredicate(race),
  characterSprite: `${t9BossAtlasBase(race)}-atlas.png`,
}));

for (const recipe of T9_TOWER_RECIPES) registerRecipe(recipe);
