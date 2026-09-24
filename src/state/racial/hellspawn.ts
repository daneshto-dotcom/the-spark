/**
 * SPARK — S188 — HELLSPAWN (`demons.l5`): the demon seat's pencil chewers split when they die.
 *
 * > *"the pencil chewers and the pentagram become demonic … when a pencil chewer dies, it spawns two
 * > more pencil chewers with half the stats in each. So 50% and 50% of the main one. And when those
 * > die, each one of those spawn two more with 25% stats each."* — owner, S187
 *
 * ## THE CHAIN, AND WHY IT ENDS (Council A2)
 *
 *   generation 0 (an ordinary chewer) dies → two generation-1 children at 50 %
 *   generation 1 dies                        → two generation-2 children at 25 %
 *   generation 2 dies                        → NOTHING
 *
 * So one chewer has at most 2 + 4 = **6 descendants**, ever. The generation lives on the creature
 * (`Creature.hellspawnGen`, serialized and hashed), which is what makes the end of the chain survive
 * a save, a host migration and the worker INIT. Every number is floor-at-one — his standing rule
 * (*"anything that doesn't ship as at least a whole number you just give him the lowest amount
 * possible, which is one"*) — so no child can ever have a zero pool or a zero hit, and a zero pool is
 * the one way a split could loop (Gemini's M1: a child born dead would die, split, and die again).
 *
 * ## THE NUMBERS — ON THE ONE LADDER
 *
 * · POOL: floor-at-one(50 % of the PARENT's own full pool, `creatureMaxEhp`) — which is exactly 25 %
 *   of the original for a grandchild, since `⌊⌊P/2⌋/2⌋ = ⌊P/4⌋`. Stored on the existing `maxEhp`.
 *   Pencil chewer: 5 → 2 → 1.
 * · STRIKE: derived from the generation AT STRIKE TIME, `hellspawnStrikeFifths` — floor-at-one of
 *   50 % / 25 % of the strike the same unit would deal at generation 0. It has to be derived: a
 *   creature's damage is rebuilt from its TYPE's config, and a split chewer is still a `'chewer'`.
 *   Pencil chewer: 7 → 3 → 1.
 *
 * ## ⚠ MINE, EACH STATED AT ITS LINE
 *
 * · "Dies" = its lethality is decided (`damageCreature`, the same branch THE RISEN listens on). A
 *   chewer that AGES OUT (it has a finite lifetime) fades, it is not killed, so it does not split; and
 *   a RAZE (`applyRadialClear` — the zombie boss's R138 blast) deletes without a death decision.
 * · The children appear at the death spot, spread by id (`HELLSPAWN_SPLIT_SPREAD`), with a fresh
 *   lifetime and in `SPAWNING`, exactly like a chewer out of a pentagram.
 * · "The pentagram's chewers" = every chewer the demon seat owns. They inherit the parent's
 *   `sourceSpawnerId`, so they ride the SPAWNER path of `applySpawnCreature` — the chewer caps
 *   (10 000 sentinels), never the one-live-per-(owner,type) latch that has eaten a summon four times.
 * · A chewer alive when the perk is taken splits too: the rule is read at its death.
 *
 * ## BORN AFTER THE SWEEP (Council A5)
 *
 * A chewer dies inside the strike batch, so its children are queued (`queueAfterStrike`) and born
 * after the death sweep. A child that somehow dies on its own birth tick queues ITS children for the
 * next tick's drain — the queue never recurses inside one drain.
 */

import { asCreatureId, type PlayerId, type SpawnerId, type Vec2 } from '../../types.ts';
import { creatureMaxEhp, type Creature } from '../creatures/creature.ts';
import { spreadTargetPos } from '../creatures/creatureAI.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { castleSpawnerId } from '../raceUnitEmit.ts';
import { dispatch } from '../world.ts';
import type { World } from '../worldTypes.ts';
import { queueAfterStrike } from './racialTick.ts';

/** ⭐ HIS NUMBER: *"it spawns two more pencil chewers"*. */
export const HELLSPAWN_CHILDREN = 2;

/** ⭐ HIS NUMBERS: a generation's share of the ORIGINAL chewer — *"50% and 50%"*, then *"25% stats each"*. */
export const HELLSPAWN_PCT_BY_GEN: Readonly<Record<0 | 1 | 2, number>> = { 0: 100, 1: 50, 2: 25 };

/** ⭐ HIS: the chain stops after the 25 % generation. */
export const HELLSPAWN_MAX_GEN = 2;

/** ⚠ MINE — how far from the death spot the two children land. Cosmetic only; half a chewer width. */
export const HELLSPAWN_SPLIT_SPREAD = 18;

/** Floor-at-one percentage of a ladder number — his rule, in one place. */
export function floorAtOnePct(baseFifths: number, pct: number): number {
  return Math.max(1, Math.floor((baseFifths * pct) / 100));
}

/**
 * The strike a creature deals, given the strike its TYPE deals. Identity for every creature that is
 * not a split chewer, so wrapping a damage site in it changes nothing for anyone else.
 */
export function hellspawnStrikeFifths(c: Pick<Creature, 'hellspawnGen'>, baseFifths: number): number {
  const g = c.hellspawnGen;
  if (g === undefined) return baseFifths;
  return floorAtOnePct(baseFifths, HELLSPAWN_PCT_BY_GEN[g]);
}

/** A child's full pool: floor-at-one of half the dying parent's own full pool. */
export function hellspawnChildPool(parentMaxFifths: number): number {
  return floorAtOnePct(parentMaxFifths, 50);
}

/** True when `owner` is a demon seat holding `demons.l5`. Also the renderer's "demonic" question. */
export function seatIsHellspawn(world: Pick<World, 'players'>, owner: PlayerId): boolean {
  const p = world.players.get(owner);
  return p !== undefined && seatHoldsPerk(p, 'demons.l5');
}

/**
 * Called once per creature death, at the moment lethality is first decided. Queues the two children
 * when the dying creature is a demon seat's chewer below the last generation.
 */
export function hellspawnOnDeath(world: World, victim: Creature): void {
  if (victim.type !== 'chewer') return;
  if (!seatIsHellspawn(world, victim.ownerPlayerId)) return;
  const gen = victim.hellspawnGen ?? 0;
  if (gen >= HELLSPAWN_MAX_GEN) return; // ⛔ A2 — a generation-2 death spawns nothing
  const childGen = (gen + 1) as 1 | 2;
  const pool = hellspawnChildPool(creatureMaxEhp(victim));
  const owner = victim.ownerPlayerId;
  const at: Vec2 = { x: victim.pos.x, y: victim.pos.y };
  // ⚠ A chewer always has a spawner in play; the castle sentinel is the fallback for one that does
  // not (a test fixture), so the children still ride the spawner path and never the null-spawner latch.
  const spawnerId: SpawnerId = victim.sourceSpawnerId ?? castleSpawnerId(owner as unknown as number);
  queueAfterStrike(world, () => {
    for (let i = 0; i < HELLSPAWN_CHILDREN; i++) spawnHellspawnChild(world, owner, at, spawnerId, childGen, pool);
  });
}

/** One child, through the real spawn reducer, then stamped with its generation and its pool. */
function spawnHellspawnChild(
  world: World, owner: PlayerId, at: Vec2, spawnerId: SpawnerId, gen: 1 | 2, pool: number,
): void {
  if (world.gameState !== 'PLAYING') return;
  const id = asCreatureId(world.nextCreatureId);
  const pos = spreadTargetPos(at, id, HELLSPAWN_SPLIT_SPREAD);
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'chewer',
    ownerPlayerId: owner,
    pos,
    targetPos: pos,
    sourceSpawnerId: spawnerId,
  });
  const child = world.creatures.get(id);
  if (child === undefined) return; // refused by the chewer caps — a sentinel, never reached in play
  child.hellspawnGen = gen;
  child.maxEhp = pool;
  child.ehp = pool;
}
