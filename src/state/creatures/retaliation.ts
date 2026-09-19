/**
 * SPARK — **RETALIATION (S183, owner R183-A…D). A UNIT THAT IS ATTACKED TURNS ON ITS ATTACKER.**
 *
 * > *"When a unit is attacked — let's say it's targeting a building, and then it is attacked, and
 * > it switches target to the targeted attack system. It makes sense. Most units, that is, unless
 * > it's like a pencil chewer, which only attacks buildings."*
 *
 * ## The four rulings, and where each one lives
 *
 * - **R183-A — IT DOES NOT GO BACK.** *"No. It won't go back to what it was attacking before. It
 *   goes back to the next target. So the closest target, you know, with its own like racial or
 *   character preferences. Remember, they all have slightly different preferences."*
 *   ⭐ **NOTHING IS SAVED AND NOTHING IS RESTORED, WHICH IS WHY THIS FILE HAS NO MEMORY.** The one
 *   thing retaliation writes is `Creature.targetCreatureId`, the field the AI already re-derives
 *   every SEEKING tick. When the attacker dies or breaks the leash, `pickNavUnit`'s existing hold
 *   branch fails and it re-acquires through `findNearestEnemyCreatureFrom` — the creature's own
 *   normal preference ladder, unchanged. A `previousTarget` field would have been the literal
 *   opposite of the ruling AND four new sites (factory + serialize + hash + worker).
 *
 * - **R183-B — THE PENCIL CHEWER NEVER RETALIATES.** *"Who never retaliates, pencil chewers,
 *   because they only attack buildings."* See `NEVER_RETALIATES`.
 *
 * - **R183-C — HELGA RETALIATES, INSIDE HER CONSTRAINT.** *"Helga, for example, if she's targeting
 *   pencil chewers or stuff like that that are attacking buildings around her, she will retarget
 *   whoever's targeting her. She has preferences. Helga only affects creatures — she doesn't attack
 *   towers, she's a defensive building — and she has preferences on who's attacking her."*
 *   ⭐ **THE CONSTRAINT IS ENFORCED BY THE TYPE, NOT BY A CHECK THAT COULD BE FORGOTTEN.**
 *   `Defender.targetCreatureId` is a `CreatureId | null`. A tower is a `DefenderId`, a connector is
 *   a `BondId` — neither is representable in the one field retaliation writes, so no retaliation
 *   path can ever aim her at a tower. `stats.DEFENDER_TARGETS.princess` is `UNITS_ONLY` and this is
 *   the structural half of the same statement.
 *
 * - **R183-D — THE SUICIDE BOMBER DOES RETALIATE.** *"Suicide bomber retaliates. I mean, it's like
 *   one or two shots. Yeah, of course he retaliates, but it'll probably blow up before you can
 *   change a target. But whatever, yeah, he retaliates."*
 *
 * ⛔⛔ **THE RULE IS NOT "BUILDINGS-ONLY ATTACKERS DO NOT RETALIATE."** That generalisation was put
 * to the owner and he OVERRULED it: `goblinSuicide` is `targetsStructures` and retaliates anyway.
 * **The pencil chewer is a NAMED EXCEPTION, not an instance of a category** — which is exactly why
 * `NEVER_RETALIATES` below is a one-member set with his quote on it and not a predicate over
 * `CREATURE_TARGETS`. A predicate would silently recruit the next buildings-first unit into an
 * exception he refused to grant.
 *
 * ## ⛔ DETERMINISM — WHY THE WINNER IS A SCAN AND NOT THE INCOMING ATTACKER
 *
 * Two creatures can strike the same victim on the same tick. If the victim simply kept whichever
 * blow arrived last, the answer would be decided by `world.creatures` INSERTION ORDER — which is
 * verbatim S155 N1, the defect that *"handed one seat every melee exchange for a whole match"*.
 *
 * So the incoming attacker is the TRIGGER and never the ANSWER. The answer is
 * `nearestCreatureAggressorOf` / `nearestDefenderAggressorOf`: a scan of every enemy creature that
 * is ACTUALLY STRIKING this victim, resolved nearest-first with an explicit id compare on a tie.
 *
 * ⛔⛔ **AN AGGRESSOR IS A STRIKE COMMITMENT, NEVER A NAVIGATION LOCK — AND THE FIRST CUT OF THIS
 * FILE GOT THAT WRONG.** `isStrikingCreature` demands ATTACKING **and** `targetCreatureId` **and**
 * the attacker's own `attackRange`. The first version demanded only the field, and
 * `hostTick.ts:1594-1602` writes that field for EVERY structure-attacker in SEEKING with an enemy
 * inside `GOBLIN_UNIT_ACQUIRE_RADIUS` (220 px). So a unit merely WALKING toward you counted as your
 * aggressor: punched at 20 px by a high id, the victim broke its wind-up and set off on a 250 px
 * walk to a low id that had never touched it, while the real attacker kept hitting it. That is the
 * owner's ruling inverted, and the three predicates above are what make the set mean what its name
 * says. `nearestDefenderAggressorOf` had them from the start — the creature half now matches it.
 *
 * ⚠ **NEAREST-THEN-ID, NOT LOWEST ID OUTRIGHT, AND THE EARLIER JUSTIFICATION HERE WAS BACKWARDS.**
 * It cited `enemyStinkCloudInReach`, whose own docblock says the OPPOSITE about this use:
 * *"that is exactly why NAVIGATION cannot reuse this function — walking to the lowest-id bag when a
 * nearer one is at your feet would look broken."* Retaliation DOES drive navigation. Squared
 * distance then an explicit id compare is equally a total order (the idiom of
 * `findNearestEnemyCreatureFrom` and every other scan in `creatureAI`), and it costs nothing.
 *
 * ⚠ **WHAT ORDER-INDEPENDENCE THIS DOES AND DOES NOT BUY — STATED HONESTLY, BECAUSE THE FIRST
 * VERSION OVERCLAIMED IT.** It said *"applying the same set of claims in any order yields the same
 * field"*. That is FALSE in general and an audit measured it: this function writes
 * `targetCreatureId`, which the scan also reads, so with TWO victims struck in one tick the second
 * scan can see the first victim's fresh commitment. What is now true:
 *   · for ONE victim struck by any number of attackers in a tick — the case the ruling is about —
 *     the answer is order-independent, because no claim mutates any claimant;
 *   · the chained case is narrowed but not closed. A nav lock could flip mid-tick from anywhere
 *     inside 220 px; an ATTACKING, in-reach strike commitment is a far smaller and far more local
 *     surface, and a victim that retaliates out of reach is dropped to SEEKING and leaves the set
 *     entirely.
 * ⛔ It is NOT a desync in either case — host, worker and replay share one iteration order. It is
 * spawn-order-sensitive GAMEPLAY, and closing it completely needs a per-tick claim buffer, which
 * means a new `World` field (`worldTypes` + `world` + the three sweeps + the hash) and is a bigger
 * change than this branch was given.
 *
 * ⚠ **AND A SPLASH CANNOT MAKE YOU TURN ROUND.** A claim is only accepted from an attacker that is
 * itself striking this victim — for Helga, through the same `killableDefenderInReach` the strike
 * arm uses. That is the owner's own wording — *"she will retarget whoever's TARGETING her"* — and
 * it is also what keeps the zombie rot aura from resetting every creature in its radius every tick,
 * and a Voltkin chain-lightning hop from retargeting five bystanders. Those paths pass a real
 * attacker id and are refused here, by one rule rather than by a list of exemptions.
 *
 * ## ⚠ WHAT IS NOT BUILT, SAID PLAINLY
 *
 * A creature cannot retaliate against a DEFENDER (a slapping Helga, a turret beam, the castle gun).
 * `Creature` has no `targetDefenderId`: `killableDefenderInReach` is derived at strike time from
 * POSITION, exactly like the castle. So a unit already standing next to Helga fights her, and one
 * shot from 380 px away cannot turn round. Fixing that means a genuinely new hashed creature field
 * — factory + serialize + hash + worker, and a protocol question — which is a bigger change than
 * the ruling asked for. Recorded here rather than left to be rediscovered.
 */

import type { CreatureId, DefenderId } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import type { Creature, CreatureType } from './creature.ts';
import { isUntargetable } from './creature.ts';
import { distSq, isWithinAttackRangeOfCreature, killableDefenderInReach } from './creatureAI.ts';
import { getCreatureConfig } from './voltkin-config.ts';

/**
 * ⭐ **R183-B — THE ONE NAMED EXCEPTION.** *"Who never retaliates, pencil chewers, because they
 * only attack buildings."*
 *
 * ⛔ A SET OF NAMES, NOT A RULE OVER A CATEGORY, AND THE DIFFERENCE IS THE OWNER'S OWN RULING.
 * `goblinSuicide` is also a buildings-first attacker and he ruled it DOES retaliate (R183-D), so
 * any predicate of the form "buildings-only attackers do not retaliate" is a generalisation he has
 * already refused. `retaliation.test.ts` pins this set at exactly one member and asserts every
 * other shipped `CreatureType` retaliates, so adding a second exception is a deliberate act that
 * turns a test red rather than a quiet edit.
 */
export const NEVER_RETALIATES: ReadonlySet<CreatureType> = new Set<CreatureType>(['chewer']);

/** R183-B. `true` for every unit the owner did not name. */
export function creatureRetaliates(type: CreatureType): boolean {
  return !NEVER_RETALIATES.has(type);
}

/**
 * ⛔⛔ **A HOMING MISSILE CANNOT HOLD A UNIT TARGET, AND THIS IS A CAPABILITY STATEMENT RATHER
 * THAN A SECOND EXCEPTION TO THE RULING.** R183-B named ONE unit; this is not another.
 *
 * `selfExplode && !targetsStructures` is the LIGHTNING DRONE and only the lightning drone — it is
 * `hostTick`'s own drone-branch predicate, read rather than re-derived, and `retaliation.test.ts`
 * pins that it selects exactly that one type. That branch is the only arm of the target fan-out
 * that never writes `targetCreatureId`, so nothing in the shipped game has ever put a creature
 * target on a drone.
 *
 * ⚠ **WHAT HAPPENS IF IT DOES — FOUND BY AUDITING THIS BRANCH, NOT BY A FAILING TEST.** A drone
 * holding a creature target inside its `engageRange` enters ATTACKING, and in ATTACKING the fan-out
 * skips BOTH the bond re-selection AND the Step 1.5 detonation check, while `computeSteeringAccel`
 * returns ZERO_ACCEL. So a drone that took one survivable hit would stop flying, stop homing, stop
 * being able to explode on arrival, and trade blows instead — against its own config, which states
 * in as many words that `attackCadenceTicks` is *"unused (the drone explodes, it never ATTACKS)"*
 * and that *"a suicide drone never trades blows: it detonates on arrival"*.
 *
 * ⭐ AND THE GOBLIN SUICIDE BOMBER IS NOT CAUGHT BY THIS, WHICH IS THE POINT. It is
 * `selfExplode` AND `targetsStructures`, so it takes the structure-attacker branch, holds a unit
 * target like any goblin, and its Step 1.5 has an `atUnit` arm — it retaliates by DETONATING on
 * its attacker, which is exactly R183-D. Retaliation for a bomber already has somewhere to go; for
 * the drone it does not, and inventing one would be a behaviour nobody asked for.
 */
function isHomingMissile(type: CreatureType): boolean {
  const cfg = getCreatureConfig(type);
  return cfg.selfExplode && !cfg.targetsStructures;
}

/**
 * Can this creature make a retaliation CLAIM at all? Live, hostile and selectable.
 *
 * ⚠ `isUntargetable` is re-checked here and not only at acquisition, for the reason S179 recorded
 * at `pickNavUnit`'s hold branch: a Pharaoh between realities that every victim turned to face
 * would freeze an army solid.
 */
function canBeRetaliatedAgainst(world: World, c: Creature, victimOwner: Creature['ownerPlayerId']): boolean {
  if (c.ownerPlayerId === victimOwner) return false;
  if (isUntargetable(c, world.tick)) return false;
  /*
   * ⛔ AND IT MUST NOT BE A CORPSE-IN-WAITING — the S155 N1 deferral's other edge. A creature that
   * took a lethal blow earlier in this same batch is still in `world.creatures` until the
   * end-of-tick sweep, so without these two lines a victim could commit to something that is
   * already dead, drop out of its wind-up with `ticksInState = 0`, and re-pick next tick having
   * lost a cadence to a ghost. `ehp <= 0` covers the immediate arm, `pendingCreatureDeaths` the
   * deferred one; both are needed because only one of them is live at a time.
   */
  if (c.ehp <= 0) return false;
  if (world.pendingCreatureDeaths?.has(c.id) === true) return false;
  return true;
}

/**
 * ⛔ **IS `c` ACTUALLY STRIKING `victimId` RIGHT NOW?** All three conditions, because any two of
 * them admit a unit that is not hitting anybody:
 *
 *  1. `ATTACKING` — `applyCreatureAttack` refuses on any other state;
 *  2. the commitment field the creature arm is dispatched from;
 *  3. **its own `attackRange`** — the missing one. `targetCreatureId` is ALSO the structure
 *     attacker's NAVIGATION lock, written by `pickNavUnit` for anything inside 220 px, so without
 *     the reach test a unit walking toward you is indistinguishable from one hitting you.
 *
 * `isWithinAttackRangeOfCreature` is the SAME predicate the strike arm and the FSM's wind-up gate
 * use — not a re-implementation, which is the rule S177 P9 exists to enforce.
 */
function isStrikingCreature(world: World, c: Creature, victimId: CreatureId): boolean {
  if (c.state !== 'ATTACKING') return false;
  if (c.targetCreatureId !== victimId) return false;
  return isWithinAttackRangeOfCreature(world, c, victimId);
}

/**
 * ⭐ THE TOTAL ORDER FOR A CREATURE VICTIM — of every enemy creature ACTUALLY STRIKING `victim`,
 * the NEAREST, ties broken by the lower id. Pure: reads world, mutates nothing, no `Math.random`,
 * no wall clock. Squared distances, never a sqrt, and never `Map` order.
 */
export function nearestCreatureAggressorOf(world: World, victim: Creature): CreatureId | null {
  let best: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (const [id, c] of world.creatures) {
    if (id === victim.id) continue;
    if (!canBeRetaliatedAgainst(world, c, victim.ownerPlayerId)) continue;
    if (!isStrikingCreature(world, c, victim.id)) continue;
    const dSq = distSq(c.pos, victim.pos);
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (best === null || (id as unknown as number) < (best as unknown as number)))
    ) {
      bestDistSq = dSq;
      best = id;
    }
  }
  return best;
}

/**
 * ⭐ THE SAME TOTAL ORDER FOR HELGA. "Striking this defender" is read off the SAME three conditions
 * `applyCreatureAttack` uses to reach its defender arm — ATTACKING, a null creature target (the
 * creature arm short-circuits above it) and `killableDefenderInReach` naming her, which carries the
 * reach test. Re-implementing any of them would be the "two predicates that disagree" defect
 * `creatureAI` was written to end.
 *
 * ⚠ NEAREST-THEN-ID here too, for the reason in the header: this drives where she WALKS.
 */
export function nearestDefenderAggressorOf(
  world: World,
  defenderId: DefenderId,
  defenderOwner: Creature['ownerPlayerId'],
  defenderPos: Creature['pos'],
): CreatureId | null {
  let best: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (const [id, c] of world.creatures) {
    if (!canBeRetaliatedAgainst(world, c, defenderOwner)) continue;
    if (c.state !== 'ATTACKING') continue;
    if (c.targetCreatureId !== null) continue; // the creature arm wins first — it is not hitting her
    if (killableDefenderInReach(world, c, getCreatureConfig(c.type).attackRange) !== defenderId) continue;
    const dSq = distSq(c.pos, defenderPos);
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (best === null || (id as unknown as number) < (best as unknown as number)))
    ) {
      bestDistSq = dSq;
      best = id;
    }
  }
  return best;
}

/**
 * **R183-A/B/D — a CREATURE has just been hit by `attackerId`. Turn it on its attacker.**
 *
 * Called from `damageEntity`'s creature arm and nowhere else, so every present and future damage
 * path gets this decision made for it exactly once. No-op unless the blow was a deliberate,
 * single-target strike by a live enemy creature (see the splash note in the file header).
 */
export function recordCreatureRetaliation(
  world: World,
  victimId: CreatureId,
  attackerId: CreatureId,
): void {
  const victim = world.creatures.get(victimId);
  if (victim === undefined) return;
  if (!creatureRetaliates(victim.type)) return; // R183-B
  if (isHomingMissile(victim.type)) return; // see `isHomingMissile` — a capability, not an exception
  // A creature already playing out its death animation has no AI left to redirect — the FSM cleared
  // both target fields on the way in and re-setting one would resurrect a commitment it cannot act on.
  if (victim.state === 'DESPAWNING') return;

  const attacker = world.creatures.get(attackerId);
  if (attacker === undefined) return;
  if (!canBeRetaliatedAgainst(world, attacker, victim.ownerPlayerId)) return;
  // ⛔ THE SPLASH GATE, and it is the same predicate the scan uses. Chain-lightning hops and the
  // rot aura reach here with a real attacker id and are refused.
  if (!isStrikingCreature(world, attacker, victimId)) return;

  const chosen = nearestCreatureAggressorOf(world, victim);
  if (chosen === null) return; // unreachable while `attacker` qualifies — defence in depth
  if (chosen === victim.targetCreatureId) return; // already fighting it; no state churn

  /*
   * ⛔⛔ **A UNIT THAT CANNOT HOLD AN OUT-OF-REACH TARGET MUST NOT BE GIVEN ONE. THE WRITE ITSELF
   * IS GATED, NOT MERELY THE STATE DROP BELOW — AND GETTING THAT WRONG WAS A MEASURED DEFECT.**
   *
   * The first cut gated only the `state = 'SEEKING'` drop on `targetsStructures`, and let the write
   * land unconditionally. For a VOLTKIN that is worse than doing nothing: the write lands, then
   * `creatureLifecycle.ts`'s S103 #8 ATTACKING re-validation finds the new target outside its
   * 180 px, NULLS it and bounces the creature out of ATTACKING. Measured: a Voltkin mid-zap on a
   * chewer at 100 px, shot by an archer at 210 px, ends the tick with `targetCreatureId = null`,
   * `state = SEEKING`, `ticksInState = 0` — it loses the chewer it was killing, loses its wind-up,
   * and retaliates against nobody. One archer halves its output; two starve it. That is exactly the
   * *"pretending to attack and not hitting anything"* failure the paragraph below claims to avoid.
   *
   * A structure-attacker is the exception because `pickNavUnit` can HOLD an out-of-reach quarry
   * inside the 300 px leash and walk to it. Nothing else in the roster can, so for everything else
   * an out-of-reach aggressor is simply not a target — and its own every-tick nearest-in-range
   * opportunism already covers the attackers it CAN answer.
   */
  const victimCfg = getCreatureConfig(victim.type);
  const chosenInReach = isWithinAttackRangeOfCreature(world, victim, chosen);
  if (!victimCfg.targetsStructures && !chosenInReach) return;

  victim.targetCreatureId = chosen;

  /*
   * ⛔ **AND THE COMMITMENT HAS TO BREAK, OR THE OWNER'S OWN EXAMPLE DOES NOT WORK.** His case is a
   * unit *"targeting a building, and then it is attacked"*. That unit is in ATTACKING, and an
   * ATTACKING creature never re-selects — `hostTick`'s fan-out only re-targets in SEEKING, and
   * `applyCreatureTick`'s ATTACKING arm CLEARS a creature target that is outside `attackRange`
   * (the S103 #8 re-validation). So a retaliation target further away than the victim's own arm
   * would be wiped one tick later and the unit would keep hitting the wall.
   *
   * Dropping to SEEKING hands it to `pickNavUnit`, which holds the new quarry inside
   * `GOBLIN_UNIT_LEASH_RADIUS` (300 — wider than the longest creature `attackRange`, 220, so every
   * attacker is reachable) and walks the unit to it. When the quarry dies the same hold branch
   * fails and re-acquires from scratch: R183-A, for free, with no stored history.
   *
   * ⚠ ONLY WHEN THE TARGET ACTUALLY CHANGED (guarded above) AND ONLY WHEN IT IS OUT OF REACH. A
   * victim whose attacker is already inside its own arm keeps its wind-up and simply hits back on
   * its next fire tick — resetting `ticksInState` on every blow would let a swarm hold a unit in a
   * wind-up it can never finish, which is S177 P9's *"pretending to attack and not hitting
   * anything"* rebuilt from the other side.
   */
  /*
   * ⚠ **AND ONLY FOR A STRUCTURE-ATTACKER, WHICH IS THE ONE FAMILY WHOSE SELECTOR CAN HOLD THE
   * NEW TARGET.** `targetsStructures` picks `hostTick`'s structure branch, and that branch is the
   * only one that feeds `targetCreatureId` back into `pickNavUnit` as a LEASHED hold. The VOLTKIN
   * takes the other arm, which overwrites the field every SEEKING tick with
   * `findNearestEnemyCreature` (range-gated to its own 180 px).
   *
   * ⛔ SO DROPPING A VOLTKIN TO SEEKING WOULD BE A LOCKOUT, NOT A RETALIATION — found by auditing
   * this branch rather than by a red test. The write is wiped on the very next SEEKING tick, so
   * the next blow sees a CHANGED target again, forces SEEKING again and resets `ticksInState`
   * again. Two ranged attackers on a 60-tick cadence against a 60-tick cadence is a Voltkin that
   * never completes a wind-up and never fires — S177 P9's *"pretending to attack and not hitting
   * anything"*, rebuilt from the other side.
   *
   * ⭐ A VOLTKIN STILL RETALIATES, INSIDE ITS REACH, AND THAT IS ITS OWN SHIPPED RULE. The write
   * lands; if the attacker is within its `attackRange` the ATTACKING re-validation keeps it and
   * the strike arm zaps the attacker instead of severing. Out of reach the FSM drops it on the
   * next tick, which is exactly what its every-tick nearest-in-range opportunism already meant.
   */
  if (victim.state === 'ATTACKING' && victimCfg.targetsStructures && !chosenInReach) {
    victim.state = 'SEEKING';
    victim.ticksInState = 0;
    victim.targetBondId = null;
    victim.targetPrimitiveId = null;
  }
}

/**
 * **R183-C — HELGA has just been hit by `attackerId`.** *"She will retarget whoever's targeting her."*
 *
 * ⚠ **WALK ONLY, AND THE NARROWNESS IS THE SAFE READING RATHER THAN A SHORTCUT.** Her FSM is
 * IDLE → WALK → WINDUP → FIRE → RECOVER, and each of the other four states refuses the swap for a
 * reason that is hers, not mine:
 *
 *  · **IDLE** re-acquires on her own `nextFireTick` through `findNearestEnemyCreatureFrom`. Writing
 *    a target here would be overwritten a tick later anyway, and forcing her out of IDLE early
 *    would let a unit that punches her slap FASTER than her cadence allows — a balance change
 *    nobody asked for.
 *  · **WINDUP** is a committed slap. `PRINCESS_MELEE_RANGE` is small while her `attackRange` is
 *    380, so swapping the victim mid-wind-up would let her land a slap on something she has not
 *    walked to — the exact *"hitting what it has not reached"* half of S177 P9.
 *  · **FIRE / RECOVER** are the follow-through; the blow has already landed.
 *
 * WALK is the state the ruling is actually about: she is crossing the field toward the unit she
 * picked while a different one hits her. The WALK arm re-reads `targetCreatureId` every tick for
 * both its leash test and its `walkTargetPos`, so writing the field is the whole change — her
 * anti-kite home leash still applies unmodified.
 */
export function recordDefenderRetaliation(
  world: World,
  defenderId: DefenderId,
  attackerId: CreatureId,
): void {
  const d = world.defenders.get(defenderId);
  if (d === undefined) return;
  // `ehp === null` is a TOWER and is the same discriminator the damage arm uses — a turret or a
  // stink tower takes no damage at all, so it can never be a victim here. Not a proxy for the kind.
  if (d.ehp === null) return;
  if (d.state !== 'WALK') return;

  const attacker = world.creatures.get(attackerId);
  if (attacker === undefined) return;
  if (!canBeRetaliatedAgainst(world, attacker, d.ownerPlayerId)) return;
  // The same three conditions the scan below uses, so the TRIGGER and the ANSWER cannot disagree
  // about who counts as hitting her. (The creature case needs no state test: `targetCreatureId`
  // is a commitment field, while "is striking a defender" is derived from POSITION and would
  // otherwise sweep in every bystander standing near her with nothing else to hit.)
  if (attacker.state !== 'ATTACKING') return;
  if (attacker.targetCreatureId !== null) return;
  if (killableDefenderInReach(world, attacker, getCreatureConfig(attacker.type).attackRange) !== defenderId) {
    return;
  }

  const chosen = nearestDefenderAggressorOf(world, defenderId, d.ownerPlayerId, d.pos);
  if (chosen === null) return;
  if (chosen === d.targetCreatureId) return;
  d.targetCreatureId = chosen;
}
