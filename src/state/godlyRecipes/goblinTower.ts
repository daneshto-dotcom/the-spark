/**
 * SPARK — S151 P3 — THE GOBLIN TOWER (owner R70; roadmap Q1 + Q9/R24).
 *
 * Owner: *"its a basic like 4 or 5 shape tower that takes one shape to feed to then spawn a goblin
 * of different kinds - we have predefined the types of goblins but not their stats."*
 *
 * ONE tower, SIX outputs. You FEED it a single shape and it makes the goblin that shape maps to.
 * That is what makes it different from every other structure in the game: the other five recipes
 * decide what they produce at BUILD time, and this one decides at FEED time, so a single tower
 * covers the whole goblin roster and the player picks per-unit.
 *
 *          C   C
 *           \ /
 *        C -- ○ -- C      (○ is the Circle hub at degree 4; each C is a Circle leaf)
 *
 * ## ⛔ Why a CIRCLE hub at degree 4 — this was measured, not chosen
 *
 * The owner asked for "4 or 5 shapes", and BOTH sizes are already taken: `stinkTower` is size 4
 * (Square hub, degree 3) and `pentagram` is size 5 (a closed ring of 5 Triangles, every node at
 * degree 2). So size alone cannot identify this tower — it needs an unoccupied (hub type, hub
 * degree) pair. Across the shipped six, the hubs are Square@3, Triangle@2, Dot@≥5, Line@6 and
 * Triangle@6, plus voltkin's 4-Square/4-Triangle split. **Circle is never a hub anywhere**, and
 * degree 4 is a free rung.
 *
 * ⚠ THAT CLAIM IS RE-DERIVED FROM THE LIVE REGISTRY BY `goblinTower.test.ts`, not trusted from this
 * comment. A recipe that silently collides with another one does not fail loudly — it produces the
 * *other* structure, or neither, and the player just sees a tower that will not build.
 *
 * ## The gate, and why leaves may bond to each other
 *
 * Modelled on `lightningHub` (itself modelled on `laserTurret`): (a) the hub is a Circle of bond
 * degree exactly `GOBLIN_TOWER_HUB_DEGREE`, (b) its component is exactly `GOBLIN_TOWER_SIZE`
 * primitives, (c) every non-hub member is a Circle. Those three force the star by pigeonhole. Leaf
 * degree is deliberately NOT constrained: dense `AUTO_BOND` can bond two adjacent leaves to each
 * other without changing the hub degree, the component size or the member types, and forbidding
 * that is the shipped cause of a frequent silent no-build (the laserTurret lesson).
 *
 * ⚠ ALL-CIRCLE IS DELIBERATE AND IT MAKES THE TOWER CHEAP. Circle is the one primitive with no
 * competing recipe role, so a player can commit five of them without giving up access to anything
 * else — which suits the roster's entry-level unit factory.
 */

import { SparkType } from '../../constants.ts';
import { isGoblinTowerComponent } from '../goblinKinds.ts';
import { registerRecipe } from './index.ts';
// Re-exported for the Codex and the tests; the map itself lives in a side-effect-free leaf so
// that `world.ts` can reach it WITHOUT transitively registering every recipe (see goblinKinds.ts).
export { GOBLIN_FEED_MAP, isGoblinTowerComponent } from '../goblinKinds.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { SpawnerGodlyRecipe, SpawnerRecipePredicate } from './types.ts';



/**
 * Every valid goblin-tower hub in the world, ascending id (deterministic seed scan). Mirrors
 * `findAllLightningHubAnchors`' contract for ignition de-dup and the lowest-anchor tie-break.
 *
 * ⚠ A star has FIVE Circles and any of them could be the hub by type, so the degree test is what
 * makes the anchor unique within a component: only the centre has degree 4.
 */
export function findAllGoblinTowerAnchors(world: World): PrimitiveId[] {
  const circleIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Circle)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  const anchors: PrimitiveId[] = [];
  for (const id of circleIds) {
    if (isGoblinTowerComponent(world, id)) anchors.push(id);
  }
  return anchors;
}

/** Owner of the tower = the player whose colour placed the hub (rainbow-safe first-player fallback). */
export function goblinTowerOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === hub.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  return owner?.id ?? null;
}

export const goblinTowerPredicate: SpawnerRecipePredicate = (world) => {
  const anchors = findAllGoblinTowerAnchors(world);
  if (anchors.length === 0) return null;
  const anchorPrimitiveId = anchors[0]!; // lowest Circle-hub id (deterministic)
  const triggererPlayerId = goblinTowerOwnerForAnchor(world, anchorPrimitiveId);
  if (triggererPlayerId === null) return null;
  return { triggererPlayerId, anchorPrimitiveId };
};

export const goblinTowerRecipe: SpawnerGodlyRecipe = {
  kind: 'spawner',
  id: 'goblinTower',
  predicate: goblinTowerPredicate,
  characterSprite: '/godly/goblin-melee/anim/goblin-melee-atlas.png',
};

registerRecipe(goblinTowerRecipe);
