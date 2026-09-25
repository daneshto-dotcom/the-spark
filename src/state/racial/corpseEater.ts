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
 * ⭐ THE BITE RUNS ON HIS ORDINARY SWING CLOCK: `ticksInState` from 0 on engaging, the bite at
 * `attackFireTick`, repeating every `attackCadenceTicks`. That includes the ordinary consequence of
 * retaliation (an out-of-reach attacker drops him to SEEKING and restarts his wind-up — R183-A as
 * ruled in R184-A), because "the same ... as he would by attacking" is the rule, and a feed that was
 * immune to it would be a second attack model. A feed-clock variant was tried first and measured
 * worse: a unit walking through his arm between two clock slots was never bitten at all.
 *
 * ⛔ AND THE LAST FEEDING TICK RELEASES HIM (SEEKING, no target). Without it the fan-out would resume
 * him mid-ATTACKING with a target that may be one of his OWN units, and the ordinary FSM would finish
 * that bite with no heal and no feed rule behind it.
 */

import { PHYSICS_HZ, PHYSICS_SUBSTEPS, VELOCITY_DAMPING } from '../../constants.ts';
import type { CreatureId, Vec2 } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { dispatch } from '../world.ts';
import { liveIdsOfType } from '../bossSkills.ts';
import { T9_BOSS_TYPE, isT9BossType } from '../t9BossIds.ts';
import { playerHoldsPerk } from '../draftEvent.ts';
import { attackFifths } from '../stats.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import {
  attackCycleMultiplier,
  creatureMaxEhp,
  isCorpseEaterFeeding,
  isStunned,
  isUntargetable,
  noteCreatureHeal,
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

/**
 * ⭐ THE MOST HIS OWN LEGS CAN CARRY HIM IN ONE TICK — the integrator's terminal speed at his (rage-
 * scaled) accel: `substeps × a·h² / (1 − damping)`. Steering is clamped to `maxAccel`, so from rest or
 * below this speed nothing he does himself can exceed it. Measured for the zombie boss: ~1.9 px/tick.
 * Exported for the test file.
 */
export function corpseEaterOwnStepPx(boss: Creature): number {
  const a = getCreatureConfig(boss.type).maxAccel * rageMultiplier(boss);
  const h = 1 / (PHYSICS_HZ * PHYSICS_SUBSTEPS);
  return (PHYSICS_SUBSTEPS * a * h * h) / (1 - VELOCITY_DAMPING);
}

/**
 * ⛔ S188 FIX (audit F1) — **A BOSS SHOVED OUT OF HIS LEASH SITS BACK DOWN WHERE HE LANDED; HE IS NEVER
 * SNAPPED BACK.** The Kraken's sonar stuns AND shoves (a `prevPos` shove — ~26 px/substep when this
 * was written, sized since S189 C10 to `KRAKEN_SONAR_KNOCKBACK_PX` = 70 px of slide, which still
 * clears this 60 px leash), the stun gate rightly suspends the leash for the whole slide, and the first
 * unstunned feed tick used to clamp him straight back onto the circle — a one-tick teleport of up to
 * ~860 px under the old shove, on both peers.
 *
 * So, when he is found OUTSIDE the leash and it was not his own doing — he was stunned on the previous
 * tick (`stunnedUntilTick === tick` is exactly the first acting tick), or the overshoot is more than his
 * own legs can produce in a tick (`corpseEaterOwnStepPx`, the backstop for any other push) — the leash
 * is RE-ANCHORED at his feet, and the rest of the slide is spent: `prevPos = pos`. He sat down to eat
 * and *"he shouldn't be moving a lot"*; still gliding 30 px/tick after the stun would be the opposite.
 *
 * ⚠ ORDINARY OVERSHOOT STILL CLAMPS. His own shuffle toward a victim can poke a pixel or two past the
 * circle; that is corrected by `clampToLeash`, never by moving the anchor, or the leash would creep
 * outward a step at a time. Reach (`isFeedable`) is measured from the anchor, so it follows him.
 */
function reanchorIfDisplaced(world: World, boss: Creature): void {
  const anchor = boss.corpseEaterAnchor as Vec2;
  const over = Math.sqrt(distSq(anchor, boss.pos)) - CORPSE_EATER_LEASH_RADIUS;
  if (over <= 0) return;
  const justUnstunned = boss.stunnedUntilTick === world.tick;
  if (!justUnstunned && over <= corpseEaterOwnStepPx(boss)) return; // his own step — the clamp's job
  boss.corpseEaterAnchor = { x: boss.pos.x, y: boss.pos.y };
  boss.prevPos.x = boss.pos.x;
  boss.prevPos.y = boss.pos.y;
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

/**
 * One bite through the ordinary strike reducer, and the heal: **100 % of the bite's amount — the whole
 * `attackFifths(atk, pen)`, overkill included — capped at his max.** "Overkill included" is the brief's
 * reading of *"for as much as he attacks that's as much as he heals"*: a bite that fells a 28-fifth
 * scarab still heals the full swing. A bite the reducer REFUSED (out of reach, lost the initiative
 * roll) removed nothing and heals nothing.
 */
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
  const ehpBefore = boss.ehp; // S189 R190-I
  boss.ehp = Math.min(creatureMaxEhp(boss), boss.ehp + heal);
  noteCreatureHeal(boss, ehpBefore); // S189 R190-I — the green floater
}

/** One feeding tick for one unstunned, living boss. */
function feedStep(world: World, boss: Creature): void {
  const cfg = getCreatureConfig(boss.type);
  reanchorIfDisplaced(world, boss); // audit F1 — before reach is measured from the anchor
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
    /*
     * ⭐ HIS NORMAL SWING, on the FSM's own clock: entering ATTACKING (or turning to a new victim)
     * starts the wind-up at 0, the bite lands at `attackFireTick`, and the swing repeats every
     * `attackCadenceTicks` (divided by rage, exactly as the FSM divides it) while the victim stays in
     * reach. A creature that walks through his arm is bitten on the same schedule it would be by his
     * ordinary attack — no earlier, no later.
     */
    /*
     * ⭐ S189 (LOW a) — **THE SWING RUNS ON THE RAGE LATCHED WHEN IT STARTED, NOT THE LIVE BIT.**
     *
     * This read `rageMultiplier(boss)` — the LIVE `enraged` bit — every tick, which is exactly the
     * defect deploy #2's F3 closed in the FSM (`Creature.attackCycleRaged`): a flip calm → raged after
     * the calm fire tick wrapped the counter onto the raged clock and bit again half a cycle early,
     * and raged → calm right after a raged bite re-armed the calm fire tick on the very next tick — a
     * second bite in one swing. So the cycle's cadence reads the SAME latch the FSM uses, taken on the
     * cycle's first tick (`ticksInState === 0` here, where the FSM's is 1, because this clock starts at
     * 0 on engaging); movement still reads the live bit, as it does for every creature.
     *
     * ⚠ LATENT IN PRODUCTION TODAY: the only writers of `enraged` are the Warlord's own latch and BLOOD
     * FRENZY, and both are orc-typed, so no zombie boss is enraged by anything that ships. Latched
     * anyway, because the day a rage source reaches him this clock must not be the one that forgot.
     * The latch field is already serialized and hashed (F3), so this adds no wire or hash site.
     */
    const cycleCadence = (): number =>
      Math.max(1, Math.round(cfg.attackCadenceTicks / attackCycleMultiplier(boss)));
    if (boss.state !== 'ATTACKING' || boss.targetCreatureId !== victim.id) {
      boss.state = 'ATTACKING';
      boss.ticksInState = 0;
    } else {
      boss.ticksInState = (boss.ticksInState + 1) % cycleCadence(); // the ENDING cycle's own clock
    }
    if (boss.ticksInState === 0) {
      // A cycle starts: latch its rage, exactly as `creatureLifecycle` does for the FSM's swing.
      if (boss.enraged === true) boss.attackCycleRaged = true;
      else delete boss.attackCycleRaged;
    }
    const fire = Math.min(cfg.attackFireTick, cycleCadence() - 1);
    boss.targetCreatureId = victim.id;
    if (boss.ticksInState === fire) bite(world, boss, victim.id);
  } else {
    // In reach of the leash but not of his arm: shuffle toward it, never past the leash.
    boss.targetCreatureId = victim.id;
    sameState(boss, 'SEEKING');
    boss.ticksInState++;
    boss.targetPos = leashProjection(boss.corpseEaterAnchor as Vec2, victim.pos);
  }
  clampToLeash(boss);
}

/**
 * Hand him back to the ordinary pipeline cleanly — see the file docblock's last ⛔.
 *
 * ⚠ S188 (audit F5) — AND AT THE FIGHT→BUILD EDGE THIS NEVER RUNS, BY DESIGN. The runner is FIGHT-gated
 * with every other boss skill (`hostTick`'s FIGHT block → `runRacialPerksFight`), so a window that
 * straddles the whistle is simply CUT SHORT: `recallArmies` sends him home and does this release's job
 * (targets cleared, ATTACKING → SEEKING), no bite lands during BUILD, and the stamp is left to expire
 * — BUILD (`PHASE_DURATION_TICKS`, 5400) is longer than the window (480), pinned by the test file, so it
 * can never reach the next FIGHT. Nothing is paused and nothing is carried over; the once-per-life latch
 * is spent. The renderer stops drawing the feed at the edge (`showsCorpseEaterFeed`).
 */
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
