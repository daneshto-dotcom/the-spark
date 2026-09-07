/**
 * SPARK — S166 — **THE TIER-3 RACE TOWER. ONE PATTERN, SIX INSTANCES** (owner R108/R119/R134/R137).
 *
 * Owner R119, verbatim: *"each race's tower will be built of his own shapes… three circles
 * interconnected in a triangle, and it will build the zombie hound tower."*
 *
 * So: **three of the race's own feed shape, closed in a ring.** The tower is visibly made of what it
 * eats, which is a genuinely good piece of design — the player never has to memorise a mapping,
 * because the structure shows it. `RACE_FEED_SHAPE` (`state/races.ts`, R109) is that mapping and it
 * already shipped; this file adds no new one.
 *
 *          T
 *         / \\        (three of ONE shape, every node bonded to the other two)
 *        T---T
 *
 * ## ⭐ A NEW TIER BELOW THE FLOOR, AND THE FOOTER GROWS ITS CHIP FOR FREE
 *
 * R108: *"we don't have tier three. we start from tier four."* The footer runs 4·5·6·7·8 today and
 * is derived from `blueprintCost` (`render/footerBandModel.ts`), so a 3-shape recipe makes the `3`
 * chip appear with **no hardcoded list to edit**. That is the existing design paying off.
 *
 * ⚠ AND IT MOVES THE OPENING ECONOMY, which is worth saying before it surprises someone.
 * `zoneEconomy.test.ts` measures a full 5400-tick BUILD at 8–9 shapes banked, and the cheapest tower
 * before this was the 4-shape stink tower. **Three shapes is cheaper than anything that has ever
 * existed in this game**, so every race will open with it. That is probably what the owner wants —
 * immediate race identity — but it makes the race tower the new tutorial build.
 *
 * ## ONE FACTORY, SIX RECIPES — and why not one recipe with a race parameter
 *
 * Each of the six is a **separate serialized `GodlyId`**, because a `GodlyId` is what
 * `Spawner.recipeId` carries on the wire and what `BLUEPRINTS`, `ALL_BLUEPRINT_IDS` and `CODEX_COPY`
 * are keyed by — and R95 makes a race tower visible and buildable only by its owner, which is a
 * per-id filter. What is shared is the CODE: one predicate factory over `RACE_FEED_SHAPE`, so the
 * six behave identically by construction instead of by six copies agreeing.
 *
 * ## ⭐ THERE IS NO RECIPE COLLISION, AND THAT WAS MEASURED RATHER THAN HOPED
 *
 * `SPARK_RACES_SPEC.md` R119 points at §7 for *"the one recipe collision this creates"*, and §7's
 * first line correctly denies there is one. §7 is right and the pointer is wrong. Verified against
 * every shipped predicate: a bare closed 3-ring of each of the six shapes matches NONE of them.
 *
 * The pentagram is the near-miss and it is **mutually exclusive by construction**, not merely
 * distinguishable: `isPentagramComponent` demands a component of exactly 5 with every node at degree
 * exactly 2, and a 3-cycle already consumes both of a degree-2 node's bonds, so no graph can satisfy
 * both. The dangerous case is a CHORDED pentagon, whose 1-2-3 cycle *is* a closed Triangle 3-ring —
 * and `isRingAt`'s "exactly two SAME-TYPE neighbours" clause is the only thing that refuses it.
 * `ringShape.test.ts` builds that lattice and asserts both predicates decline.
 *
 * The other five rings are unambiguous for a reason worth recording: mummies ring a **Line** (the
 * laser turret is a Line HUB), nagas a **Square** (the stink tower is a Square HUB, and voltkin is a
 * CHAIN), orcs a **Dot** (the lightning hub is a Dot HUB), zombies a **Circle** (goblin and stink
 * towers are HUB stars), demons a **Spiral** (no Spiral-hub recipe exists at all).
 *
 * ## ⛔ OWNER RULING R137 — AN OFF-RACE PLAYER MAY NOT IGNITE ANOTHER RACE'S RING
 *
 * Predicates are RACE-BLIND: the signature is `(world, bondPos)` and carries no seat, so a vampire
 * who hand-builds three Circles would otherwise ignite a ZOMBIE tower and field zombie hounds. R95
 * covers panel visibility and buildability, not matchability, so the check has to live in the one
 * place that knows the seat — owner resolution, below. The owner was shown the consequence and
 * refused it: race choice would otherwise be mostly cosmetic, since any player could field any
 * race's units.
 */

import { ALL_RACES, RACE_FEED_SHAPE, type RaceId } from '../races.ts';
/*
 * ⛔ THE TABLES LIVE IN A SIDE-EFFECT-FREE LEAF, NOT HERE, and re-exported below. This module calls
 * `registerRecipe` at its tail, so `blueprints.ts` importing an id from it would fire six
 * registrations as a side effect — the S144 P1 bug that file documents in its own docblock.
 * `goblinTower.ts` parks `GOBLIN_FEED_MAP` in `goblinKinds.ts` for exactly this reason.
 */
import { RACE_TOWER_IDS, RACE_TOWER_SIZE, t3UnitAtlasBase } from '../raceTowerIds.ts';
export {
  RACE_TOWER_IDS,
  RACE_TOWER_SIZE,
  RACE_TOWER_LABELS,
  RACE_TOWER_UNIT,
  T3_ART_SLUG,
  t3UnitAtlasBase,
  t3TowerAtlasBase,
  isRaceTowerId,
  raceForTowerId,
} from '../raceTowerIds.ts';
import { findRingAnchors } from './ringShape.ts';
import { registerRecipe } from './index.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { SpawnerGodlyRecipe, SpawnerRecipePredicate } from './types.ts';

/**
 * Every valid ring anchor for `race`, ascending id.
 *
 * ⛔ THE CALLER TAKES THE LOWEST. `igniteOneSpawnerRecipe` de-dups on `(anchor, owner)` and does NOT
 * compare recipeIds, so an anchor that shifted between frames would read as a second structure and
 * double-ignite. Every node of a ring is a valid seed by symmetry, which makes this the one recipe
 * family where "any match will do" is actively wrong — `findAllGoblinTowerAnchors` gets away with it
 * only because a star has exactly one hub.
 */
export function findRaceTowerAnchors(world: World, race: RaceId): PrimitiveId[] {
  return findRingAnchors(world, RACE_FEED_SHAPE[race], RACE_TOWER_SIZE);
}

/**
 * The player who owns the ring at `anchorId`, **or `null` if they are not of `race` (R137)**.
 *
 * ⚠ THE RAINBOW-SAFE FALLBACK IS COPIED FROM `goblinTowerOwnerForAnchor` ON PURPOSE. `placerColor`
 * can stop matching any live player after the rainbow shuffle remaps `player.color`, and the shipped
 * behaviour there is to fall back to the first player rather than lose the structure. Diverging would
 * make two towers disagree about who owns a repainted shape.
 *
 * ⛔ BUT THE RACE GATE APPLIES TO THE RESOLVED OWNER, FALLBACK INCLUDED. Letting the fallback skip
 * the check would make an off-race ignition reachable through exactly the path that is hardest to
 * reproduce.
 */
export function raceTowerOwnerForAnchor(
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

/** PURE — the predicate for one race's tower. */
export function makeRaceTowerPredicate(race: RaceId): SpawnerRecipePredicate {
  return (world) => {
    const anchors = findRaceTowerAnchors(world, race);
    if (anchors.length === 0) return null;
    const anchorPrimitiveId = anchors[0]!; // lowest ring-member id (deterministic)
    const triggererPlayerId = raceTowerOwnerForAnchor(world, anchorPrimitiveId, race);
    if (triggererPlayerId === null) return null;
    return { triggererPlayerId, anchorPrimitiveId };
  };
}

/**
 * The six recipes, in `ALL_RACES` order.
 *
 * ⚠ `characterSprite` is the tier-3 UNIT atlas, not the tower's own art. It is what the codex and
 * the spawner registration use as the "what does this make" picture, and `goblinTower` sets the
 * precedent by pointing at `goblin-melee` rather than at the tower.
 */
export const RACE_TOWER_RECIPES: readonly SpawnerGodlyRecipe[] = ALL_RACES.map((race) => ({
  kind: 'spawner' as const,
  id: RACE_TOWER_IDS[race],
  predicate: makeRaceTowerPredicate(race),
  characterSprite: `${t3UnitAtlasBase(race)}-atlas.png`,
}));

for (const recipe of RACE_TOWER_RECIPES) registerRecipe(recipe);
