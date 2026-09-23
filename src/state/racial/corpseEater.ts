/**
 * SPARK — S188 — **CORPSE EATER**, the zombie level-5 racial: the zombie tier-9 boss's THIRD skill.
 *
 * > *"the zombie level five upgrade will be a boss upgrade ... adds corpse eater skill. So he already
 * > has two skills ... we're gonna add a third ... once he reaches 20% HP, he starts eating everyone
 * > around him. And as he's eating them, he does the same damage as he would by attacking, but he has
 * > 100% life steal on his attack, so for as much as he attacks that's as much as he heals, for like
 * > eight seconds ... he shouldn't be moving a lot. He moves only in a tiny radius around him. So he
 * > eats everything that's around him, like enemy units first, obviously. But then if there's no enemy
 * > units, he eats his own units and heals."* — owner, S187
 *
 * His two existing skills are the rot aura (`bossSkills.ts`) and the death explosion (`hostTick`'s
 * roster compare). This one runs from the racial-d slot of `racialTick.ts` — inside the FIGHT gate,
 * after the boss skills, INSIDE the `pendingCreatureDeaths` deferral window, so a feed kill is removed
 * by the same sweep as every other kill this tick.
 *
 * ## What is his, and what is mine
 *
 * ⭐ HIS: the 20 % trigger, the ~8 s window (480 ticks), "the same damage as he would by attacking",
 * 100 % life steal, enemy units first and his own units only when no enemy is there, and a tiny leash.
 *
 * ⚠ MINE, each stated at its constant or its line:
 *   · the leash radius (`CORPSE_EATER_LEASH_RADIUS`);
 *   · what "around him" means — anything within leash + his own attack range of where he sat down,
 *     i.e. exactly the set he can reach without leaving the leash;
 *   · "his own units" = every creature his seat owns except a tier-9 boss;
 *   · once per boss LIFE (the stamp is never cleared, the `raRitualUntilTick` latch shape);
 *   · the window keeps running through a stun — a stun costs him bites, it does not pause the clock;
 *   · the perk is read when he crosses 20 %, so a boss already on the board when the pick was taken
 *     gains the skill too (it is a SKILL, not a birth stat like the general draft's pool buff).
 *
 * ## ⛔ WHY THE FAN-OUT SKIPS HIM WHILE HE FEEDS, AND THIS FILE DRIVES HIM INSTEAD
 *
 * The normal creature pipeline would keep him marching on structures and bite whatever its targeting
 * ladder chose — on its own cadence, with no heal — so a feed layered ON TOP of it would attack twice.
 * `hostTick`'s fan-out therefore `continue`s past a feeding boss (one line beside stun gate 3, the
 * only shape that cannot rot as arms are added) and this runner is the whole of his behaviour for the
 * window: target, movement, bite, heal. The bite itself is still the ordinary `CREATURE_ATTACK`
 * reducer — range check, initiative roll, attribution, retaliation, kill count — so "the same damage as
 * he would by attacking" is true by construction rather than by a copy of the formula.
 *
 * ⚠ THE BITE RUNS ON THE FEED CLOCK, NOT ON `ticksInState`. `(tick - start) % cadence === fireTick`
 * is derived from the synced stamp, so retaliation (which rewrites a victim's state and zeroes its
 * `ticksInState`) cannot reset his wind-up, and a change of victim cannot either. It is still exactly
 * his normal cadence: one bite per `attackCadenceTicks`, landing at `attackFireTick`.
 *
 * ⛔ AND THE LAST FEEDING TICK RELEASES HIM (SEEKING, no target). Without it the fan-out would resume
 * him mid-ATTACKING with a target that may be one of his OWN units, and the ordinary FSM would finish
 * that bite with no heal and no feed rule behind it.
 */

import { PHYSICS_HZ } from '../../constants.ts';
import type { CreatureId, Vec2 } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { dispatch } from '../world.ts';
import { liveIdsOfType } from '../bossSkills.ts';
import { T9_BOSS_TYPE, isT9BossType } from '../t9BossIds.ts';
import { playerHoldsPerk } from '../draftEvent.ts';
import { attackFifths } from '../stats.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import {
  creatureMaxEhp,
  isCorpseEaterFeeding,
  isStunned,
  isUntargetable,
  rageMultiplier,
  type Creature,
  type CreatureState,
} from '../creatures/creature.ts';

/** HIS: *"once he reaches 20% HP"*. The trigger is `ehp ≤ 20 %` of his OWN max, cross-multiplied. */
export const CORPSE_EATER_TRIGGER_PCT = 20;

/** HIS: *"for like eight seconds"* — 480 ticks, derived from the tick rate rather than typed. */
export const CORPSE_EATER_TICKS = 8 * PHYSICS_HZ;

/** HIS: *"100% life steal on his attack, so for as much as he attacks that's as much as he heals"*. */
export const CORPSE_EATER_HEAL_PCT = 100;

/**
 * ⚠ MINE, NOT THE OWNER'S — *"he moves only in a tiny radius around him"*. 60 px is a little under
 * one of his own drawn bodies (the boss sprite is ~2.56× a grunt's), so he can shuffle onto whatever
 * is at his feet but cannot walk off to chase. Overrule on sight.
 */
export const CORPSE_EATER_LEASH_RADIUS = 60;

/** Where the feed started, in ticks since the stamp. 0 on the stamp tick. */
function feedTickOf(boss: Creature, tick: number): number {
  return tick - ((boss.corpseEaterUntilTick as number) - CORPSE_EATER_TICKS);
}

function sameState(boss: Creature, s: CreatureState): void {
  if (boss.state !== s) {
    boss.state = s;
    boss.ticksInState = 0;
  }
}

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Can the boss eat `c` from where he sat down? Not himself, not something untargetable, not a corpse
 * already waiting on this tick's sweep (eating one would be a free heal off a dead body), and within
 * leash + attack range of the ANCHOR — the set he can reach without leaving the leash.
 */
function isFeedable(world: World, boss: Creature, c: Creature, reachSq: number, enemy: boolean): boolean {
  if (c.id === boss.id) return false;
  if ((c.ownerPlayerId === boss.ownerPlayerId) === enemy) return false;
  if (!enemy && isT9BossType(c.type)) return false; // MINE — his own units, never another boss
  if (isUntargetable(c, world.tick)) return false;
  if (c.ehp <= 0) return false;
  if (world.pendingCreatureDeaths?.has(c.id) === true) return false;
  return distSq(boss.corpseEaterAnchor as Vec2, c.pos) <= reachSq;
}

/** Nearest feedable of one class to the BOSS: squared distance, then the lower id. Never `Map` order. */
function nearestFeedable(world: World, boss: Creature, reachSq: number, enemy: boolean): CreatureId | null {
  let best: CreatureId | null = null;
  let bestD = Infinity;
  for (const [id, c] of world.creatures) {
    if (!isFeedable(world, boss, c, reachSq, enemy)) continue;
    const d = distSq(boss.pos, c.pos);
    if (d < bestD || (d === bestD && best !== null && (id as number) < (best as number))) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/**
 * ⭐ HIS ORDER — *"enemy units first, obviously. But then if there's no enemy units, he eats his own"*.
 *
 * STICKY while the current victim is still feedable and still the preferred class, so a crowd
 * shuffling at his feet does not flip his target every tick (the `pickNavUnit` hysteresis idea). An
 * enemy arriving always outranks an own unit he was eating.
 *
 * Exported for the test file only.
 */
export function pickFeedTarget(world: World, boss: Creature): CreatureId | null {
  const reach = CORPSE_EATER_LEASH_RADIUS + getCreatureConfig(boss.type).attackRange;
  const reachSq = reach * reach;
  const cur = boss.targetCreatureId === null ? undefined : world.creatures.get(boss.targetCreatureId);
  const enemy = nearestFeedable(world, boss, reachSq, true);
  if (enemy !== null) {
    if (cur !== undefined && isFeedable(world, boss, cur, reachSq, true)) return cur.id;
    return enemy;
  }
  if (cur !== undefined && isFeedable(world, boss, cur, reachSq, false)) return cur.id;
  return nearestFeedable(world, boss, reachSq, false);
}

/** `p` pulled onto the leash circle when it lies outside it. Pure. */
export function leashProjection(anchor: Vec2, p: Vec2, radius = CORPSE_EATER_LEASH_RADIUS): Vec2 {
  const d2 = distSq(anchor, p);
  if (d2 <= radius * radius) return { x: p.x, y: p.y };
  const k = radius / Math.sqrt(d2);
  return { x: anchor.x + (p.x - anchor.x) * k, y: anchor.y + (p.y - anchor.y) * k };
}

/**
 * The hard edge of the leash. ⛔ `prevPos` MOVES WITH `pos` (the `clampIntoPlayfield` / recall idiom):
 * clamping the position alone would manufacture a velocity of the whole correction and fling him.
 */
function clampToLeash(boss: Creature): void {
  const anchor = boss.corpseEaterAnchor as Vec2;
  const at = leashProjection(anchor, boss.pos);
  if (at.x === boss.pos.x && at.y === boss.pos.y) return;
  boss.prevPos.x += at.x - boss.pos.x;
  boss.prevPos.y += at.y - boss.pos.y;
  boss.pos.x = at.x;
  boss.pos.y = at.y;
}

/** Arm the skill: once per life, at ≤ 20 %, for a seat holding the perk, not while stunned. */
function maybeTrigger(world: World, boss: Creature): void {
  if (boss.corpseEaterUntilTick !== undefined) return; // ⛔ the once-per-life latch — never cleared
  if (!playerHoldsPerk(world, boss.ownerPlayerId, 'zombies.l5')) return;
  // R152 — sitting down to eat is an ACTION, so a stunned boss does not start. He starts on the first
  // unstunned tick he is still under the line.
  if (isStunned(boss, world.tick)) return;
  if (boss.ehp <= 0 || world.pendingCreatureDeaths?.has(boss.id) === true) return;
  // ⭐ his OWN max (`creatureMaxEhp`) — a drafted boss's 20 % is 20 % of his drafted pool.
  if (boss.ehp * 100 > creatureMaxEhp(boss) * CORPSE_EATER_TRIGGER_PCT) return;
  boss.corpseEaterUntilTick = world.tick + CORPSE_EATER_TICKS;
  boss.corpseEaterAnchor = { x: boss.pos.x, y: boss.pos.y };
  // Drop every commitment the ordinary pipeline was holding — the feed rule decides from here.
  boss.targetBondId = null;
  boss.targetPrimitiveId = null;
  boss.targetCreatureId = null;
  boss.state = 'SEEKING';
  boss.ticksInState = 0;
  boss.targetPos = { x: boss.pos.x, y: boss.pos.y };
}

/** One bite through the ordinary strike reducer, and the heal for whatever it actually took. */
function bite(world: World, boss: Creature, victimId: CreatureId): void {
  const victim = world.creatures.get(victimId);
  if (victim === undefined) return;
  const before = victim.ehp;
  dispatch(world, { type: 'CREATURE_ATTACK', creatureId: boss.id, bondId: null, targetCreatureId: victimId });
  const after = world.creatures.get(victimId);
  // Inside the deferral window a lethal bite leaves the victim in the map at ≤ 0, so the loss is the
  // whole hit, overkill included — "for as much as he attacks". A victim removed outright (outside
  // that window, i.e. only when a test calls this directly) lost the ordinary hit.
  const cfg = getCreatureConfig(boss.type);
  const lost = after === undefined ? attackFifths(cfg.atk, cfg.pen) : Math.max(0, before - after.ehp);
  if (lost <= 0) return; // the reducer refused (out of reach, lost the initiative roll) — no bite, no heal
  const heal = Math.floor((lost * CORPSE_EATER_HEAL_PCT) / 100);
  boss.ehp = Math.min(creatureMaxEhp(boss), boss.ehp + heal);
}

/** One feeding tick for one unstunned, living boss. */
function feedStep(world: World, boss: Creature): void {
  const cfg = getCreatureConfig(boss.type);
  boss.targetBondId = null;
  boss.targetPrimitiveId = null;
  const victimId = pickFeedTarget(world, boss);
  const victim = victimId === null ? undefined : world.creatures.get(victimId);
  if (victim === undefined) {
    // Nothing to eat: sit back down where he started.
    boss.targetCreatureId = null;
    sameState(boss, 'SEEKING');
    boss.ticksInState++;
    const a = boss.corpseEaterAnchor as Vec2;
    boss.targetPos = { x: a.x, y: a.y };
  } else if (distSq(boss.pos, victim.pos) <= cfg.attackRange * cfg.attackRange) {
    boss.targetCreatureId = victim.id;
    sameState(boss, 'ATTACKING');
    // His normal cadence (divided by rage, exactly as the FSM divides it), on the feed clock.
    const cadence = Math.max(1, Math.round(cfg.attackCadenceTicks / rageMultiplier(boss)));
    const fire = Math.min(cfg.attackFireTick, cadence - 1);
    const phase = feedTickOf(boss, world.tick) % cadence;
    // ⭐ ticksInState follows the feed clock so the ordinary attack row, if the eat art is missing,
    // swings in time with the bites instead of against them.
    boss.ticksInState = phase;
    if (phase === fire) bite(world, boss, victim.id);
  } else {
    // In reach of the leash but not of his arm: shuffle toward it, never past the leash.
    boss.targetCreatureId = victim.id;
    sameState(boss, 'SEEKING');
    boss.ticksInState++;
    boss.targetPos = leashProjection(boss.corpseEaterAnchor as Vec2, victim.pos);
  }
  clampToLeash(boss);
}

/** Hand him back to the ordinary pipeline cleanly — see the file docblock's last ⛔. */
function release(boss: Creature): void {
  boss.state = 'SEEKING';
  boss.ticksInState = 0;
  boss.targetCreatureId = null;
  boss.targetBondId = null;
  boss.targetPrimitiveId = null;
}

/**
 * ⭐ THE RUNNER — every zombie boss, ids sorted. Called from the racial-d slot of `racialTick.ts`.
 *
 * ⚠ STUN (R152, `stunGates.test.ts`'s rule): a stunned boss does not trigger, bite, steer or get
 * leashed — he is *"stuck on idle and cant do anything"*, and a knockback is allowed to move him.
 * The RELEASE on his last feeding tick is bookkeeping, not an action, so it runs stunned or not —
 * the same split `applyCreatureTick` makes between its end-of-life steps and its FSM.
 */
export function runCorpseEater(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  for (const id of liveIdsOfType(world, T9_BOSS_TYPE.zombies)) {
    const boss = world.creatures.get(id);
    if (boss === undefined) continue;
    maybeTrigger(world, boss);
    if (!isCorpseEaterFeeding(boss, world.tick)) continue;
    if (
      !isStunned(boss, world.tick) &&
      boss.ehp > 0 &&
      world.pendingCreatureDeaths?.has(boss.id) !== true
    ) {
      feedStep(world, boss);
    }
    if (world.tick === (boss.corpseEaterUntilTick as number) - 1) release(boss);
  }
}
