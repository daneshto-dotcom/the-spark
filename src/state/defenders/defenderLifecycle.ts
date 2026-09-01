/**
 * SPARK — S103 P2 generic DEFENDER lifecycle reducers.
 *
 * Mirrors spawnerLifecycle.ts: pure case-body helpers consumed by world.ts dispatch. THREE
 * HOST-INTERNAL actions (none is a client INTENT — defenders auto-build from geometry, are
 * host-authored + snapshot-replicated, so they ride KNOWN_GAME_ACTION_TYPES_RECORD only):
 *   REGISTER_DEFENDER — runDefenderIgnition dispatches this when a player completes a defender
 *                       recipe (laser turret / HELGA). Mints a DefenderId, seeds the cadence.
 *   REMOVE_DEFENDER   — the host re-validation poll dispatches this when the anchor is gone OR
 *                       the recipe no longer holds (a chewer ate the structure) — the defender
 *                       dies. THIS is the v1 counterplay (no direct-attack path yet, Council MF8).
 *   DEFENDER_TICK     — advances ONE defender's FSM: acquire nearest enemy creature in range →
 *                       windup → FIRE (deal damage via the unified `damageCreature`) → recover.
 *
 * Determinism: the whole FSM is a pure fn of `world.tick` (no wall-clock, no Math.random); target
 * acquisition uses `findNearestEnemyCreatureFrom` (lowest-CreatureId tie-break). Host-authoritative;
 * clients receive the result via the additive-optional `defenders[]` snapshot + never simulate.
 */

import {
  DEFENDER_FIRE_HOLD_TICKS,
  DEFENDER_REACQUIRE_TICKS,
  DEFENDER_RECOVER_TICKS,
  POOP_SLOW_MULTIPLIER,
  PRINCESS_ARRIVE_RADIUS,
  PRINCESS_HOME_EPSILON,
} from '../../constants.ts';
import {
  asDefenderId,
  type CreatureId,
  type DefenderId,
  type PlayerId,
  type PrimitiveId,
  type Vec2,
} from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
import { getDefenderRecipe } from '../godlyRecipes/index.ts';
import { findNearestEnemyCreatureFrom } from '../creatures/creatureAI.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { applyRadialDamage, damageEntity, destroyDefender } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import { stinkAggroTargets, stinkAuraTick, stinkIsDepleted, stinkLobTarget, stinkThrowBag } from './stinkTower.ts';
import type { World } from '../worldTypes.ts';
import { getDefenderConfig, makeDefender, type Defender, type DefenderConfig, type DefenderKind } from './defender.ts';
import { stepDefenderWalk, freezeDefender, distSq } from './defenderMotion.ts';

/** Action shapes — exported so world.ts can compose GameAction. */
export interface RegisterDefenderAction {
  readonly type: 'REGISTER_DEFENDER';
  readonly defenderKind: DefenderKind;
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  readonly pos: Vec2;
}
export interface RemoveDefenderAction {
  readonly type: 'REMOVE_DEFENDER';
  readonly defenderId: DefenderId;
}
export interface DefenderTickAction {
  readonly type: 'DEFENDER_TICK';
  readonly defenderId: DefenderId;
}

/**
 * Host-only: register a new defender over a freshly-completed recipe. De-dup per-anchor (you
 * can't double-register one anchor; you CAN rebuild after the prior defender was removed) — the
 * ignition gate is the primary guard, this reducer is defense-in-depth.
 */
export function applyRegisterDefender(world: World, action: RegisterDefenderAction): World {
  for (const d of world.defenders.values()) {
    if (d.anchorPrimitiveId === action.anchorPrimitiveId) return world;
  }
  const id = asDefenderId(world.nextDefenderId++);
  world.defenders.set(
    id,
    makeDefender({
      id,
      kind: action.defenderKind,
      ownerPlayerId: action.ownerPlayerId,
      anchorPrimitiveId: action.anchorPrimitiveId,
      recipeId: action.recipeId,
      pos: action.pos,
      registeredAtTick: world.tick,
    }),
  );
  return world;
}

/**
 * Host-only: remove a defender (its auto-attack stops instantly). Dispatched by the re-validation
 * poll when the structure is broken. No-op on a missing id (stale fan-out guard).
 *
 * ⚠ S141 P1 — THIS NO LONGER DELETES DIRECTLY. It routes through `destroyDefender`, which is the ONE
 * place a defender leaves the world mid-match, so per-kind death behaviour (the Stink Tower's blast)
 * fires on THIS path too. That matters more than it sounds: the S139 Council found that the poll —
 * not the damage path — is the way a tower most often actually dies, so a death effect wired only
 * into `damageEntity` would essentially never fire.
 *
 * `cause: 'recipeBreak'` is what stops this path razing the anchor. Either the anchor is already
 * gone (something destroyed it), or it is alive and the player merely reshaped the structure — and
 * razing a primitive the player is still building with would be destroying their work. The blast
 * itself is gated inside `destroyDefender` on the anchor being GONE, so reshaping never detonates.
 *
 * ⚠ Teardown does NOT come through here — `teardownDefenders` and the four inline reset sites use
 * `world.defenders.clear()`, which bypasses this function entirely. That is deliberate: a reset is
 * not a death, and blasting on match end would push effects into a world being discarded.
 */
export function applyRemoveDefender(world: World, action: RemoveDefenderAction): World {
  const d = world.defenders.get(action.defenderId);
  if (d === undefined) return world;
  destroyDefender(world, d);
  return world;
}

/**
 * S141 P1 — how each kind holds position. EXHAUSTIVE: adding a `DefenderKind` without adding a case
 * here fails `tsc` at the `never` assignment, naming the kind you forgot. See the call site for why
 * this branch specifically is the one worth a compile-time guard.
 */
function motionPostureOf(kind: DefenderKind): 'pinned' | 'mobile' {
  switch (kind) {
    case 'turret':
      return 'pinned'; // moveAccel 0 + meleeRange == attackRange ⇒ never enters WALK
    case 'stinkTower':
      return 'pinned'; // a tower does not walk
    case 'princess':
      return 'mobile'; // S110 P4 — HELGA walks to her target
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** Is the defender's current target still a valid, in-range enemy creature? */
function targetValid(world: World, d: Defender, config: DefenderConfig): boolean {
  if (d.targetCreatureId === null) return false;
  const victim = world.creatures.get(d.targetCreatureId);
  if (victim === undefined) return false;
  if (victim.ownerPlayerId === d.ownerPlayerId) return false; // (shouldn't happen — defense-in-depth)
  const dx = victim.pos.x - d.pos.x;
  const dy = victim.pos.y - d.pos.y;
  return dx * dx + dy * dy <= config.attackRange * config.attackRange;
}

/**
 * Host-only: advance ONE defender's FSM. The strike DEALS DAMAGE at FIRE entry via the unified
 * `damageCreature` path (chewer dies in 1, Voltkin in 2 → the render death-watchers pop goo /
 * lightning-cloud). The FIRE state is then held DEFENDER_FIRE_HOLD_TICKS so the 1v1 client
 * reliably observes it + renders the beam/slap (Council MF1 — state IS the event bus). All
 * transitions tick-deterministic; no wall-clock, no RNG. No-op on a missing id.
 */
export function applyDefenderTick(world: World, action: DefenderTickAction): World {
  const d = world.defenders.get(action.defenderId);
  if (d === undefined) return world;
  const config = getDefenderConfig(d.kind);
  // The defender's HOME = its (verlet-mobile) anchor primitive's current pos. If the anchor is gone,
  // hold the last pos — the host re-validation poll will REMOVE_DEFENDER on its next throttle slot.
  const anchor = world.primitives.get(d.anchorPrimitiveId);
  const homePos: Vec2 = anchor !== undefined ? { x: anchor.pos.x, y: anchor.pos.y } : { x: d.pos.x, y: d.pos.y };
  // ── MOTION POSTURE ─────────────────────────────────────────────────────────────────────────────
  //
  // A TURRET and a STINK TOWER are STATIONARY — pinned to the anchor every tick, with prevPos
  // tracking pos so the implicit Verlet velocity is always zero. A PRINCESS (S110 P4) is MOBILE: her
  // pos is managed per FSM state below (IDLE walks home / snaps when home; WALK integrates toward the
  // target; WINDUP/FIRE/RECOVER freeze her). She is NEVER pinned here.
  //
  // ⚠ S141 P1 — THIS WAS AN `if (d.kind === 'turret')` AND IS NOW AN EXHAUSTIVE SWITCH, DELIBERATELY.
  // Every kind-conditioned branch in this function is an `if` with no default, so a NEW DefenderKind
  // silently inherits "neither pinned nor frozen": its pos is never refreshed from a drifting anchor,
  // and `prevPos` is never resynced — and `prevPos` IS HASHED, so any accidental pos write injects a
  // permanent implicit velocity and diverges the state hash. That is a desync with no compile error
  // and no failing test. Making the POSTURE branch a `switch` with an exhaustive `never` check turns
  // "you forgot to decide how this kind moves" into a build failure. The other kind-branches below
  // are behavioural opt-ins where silence is a safe default; THIS one is not, which is why it is the
  // one that got the guard.
  const posture: 'pinned' | 'mobile' = motionPostureOf(d.kind);
  if (posture === 'pinned') {
    d.pos.x = homePos.x;
    d.pos.y = homePos.y;
    freezeDefender(d);
  }
  d.ticksInState++;

  // S141 P1 — a DEPLETED Stink Tower is a passive area denier: it ticks its aura on the shared DoT
  // cadence regardless of FSM state, and taunts nearby enemy creatures into coming to it. Runs before
  // the FSM so a spent tower still contributes on the tick it runs dry.
  // ⭐ S157 B9 (owner) — the aura is unconditional now; see `stinkAuraTick`. The AGGRO taunt below
  // stays depletion-only: a spent tower has nothing left but the smell, so pulling enemies onto it is
  // its last trick, whereas a loaded tower should not be dragging the fight into its own blast.
  if (d.kind === 'stinkTower') {
    stinkAuraTick(world, d, applyRadialDamage);
  }
  if (d.kind === 'stinkTower' && stinkIsDepleted(d)) {
    for (const cid of stinkAggroTargets(world, d)) {
      const c = world.creatures.get(cid as unknown as CreatureId);
      if (c === undefined) continue;
      // ⚠ TWO GATES, AND THE SECOND ONE BOUNDS WHAT THIS FEATURE ACTUALLY DOES TODAY.
      //
      // (1) Provenance: a spawner-sourced creature mid-chew is GLUED to its bond by design, and
      //     overriding that would collide with the 6-attack invariant. Only null-spawner units
      //     (Voltkin, the free goblin) re-select freely.
      // (2) `targetsStructures`: `targetPrimitiveId` is only ever READ by the structure-attack path
      //     (`creatureAttack.ts`), which is gated on this config flag. Writing it on a creature that
      //     targets BONDS — a Voltkin, a chewer — sets a field nothing will look at. So the taunt
      //     genuinely pulls GOBLINS and only goblins right now.
      //
      // That is a real limitation, not a bug, and it is stated rather than papered over: the goblin
      // is the unit every seat is granted for free, so "the tower pulls the thing most likely to be
      // walking past" holds — but a Voltkin will sail straight by, and a playtester should expect it.
      if (c.sourceSpawnerId !== null) continue;
      if (!getCreatureConfig(c.type).targetsStructures) continue;
      c.targetPrimitiveId = d.anchorPrimitiveId;
    }
  }

  // S109 P2 — a pooped TURRET stops firing until the owner cleans it ("shouldn't work until
  // cleaned"). Force it back to IDLE and hold the fire clock just ahead of now so a cleaned turret
  // resumes on cadence with no stale insta-fire (mirrors the spawner-resume posture). HELGA
  // (princess) is handled separately — she slows her slap cadence rather than fully stopping —
  // so this full-stop branch is turret-only. fouledPrimitives already round-trips → no wire bump.
  if (d.kind === 'turret' && world.fouledPrimitives.has(d.anchorPrimitiveId)) {
    d.state = 'IDLE';
    d.ticksInState = 0;
    d.targetCreatureId = null;
    d.lastStrikePos = null;
    d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
    return world;
  }

  // S109 P3 — a pooped HELGA (princess) does NOT stop like the turret — she just slaps SLOWER while
  // her anchor is fouled (#1 "same with helga"). Stretch the windup + the recover→IDLE reschedule by
  // 1/POOP_SLOW_MULTIPLIER (=2×). Pure fn of the CURRENT fouled state each tick → deterministic. For a
  // turret (returned above) or an un-fouled defender, stretch === 1 so windupTicks/fireInterval equal
  // the config integers EXACTLY (Math.round(n*1)===n) → byte-identical, no replay drift.
  const slapStretch = d.kind === 'princess' && world.fouledPrimitives.has(d.anchorPrimitiveId)
    ? 1 / POOP_SLOW_MULTIPLIER
    : 1;
  const windupTicks = Math.round(config.windupTicks * slapStretch);
  const fireInterval = Math.round(config.fireIntervalTicks * slapStretch);

  switch (d.state) {
    case 'IDLE': {
      if (world.tick >= d.nextFireTick) {
        // Acquire the nearest enemy within the LEASH measured from HOME (the hub) — so HELGA engages
        // enemies near her hub and is bounded to that area (anti-kite). A turret's homePos == d.pos
        // (pinned) so this is byte-identical to the pre-S110 d.pos acquisition for turrets.
        const target = findNearestEnemyCreatureFrom(
          world, homePos, d.ownerPlayerId, config.attackRange * config.attackRange,
        );
        if (target !== null) {
          d.targetCreatureId = target;
          const victim = world.creatures.get(target);
          // Already adjacent (turret meleeRange == attackRange → always true → never WALKs, byte-
          // identical) → strike now. Else (princess, target far) → WALK to it first.
          if (victim !== undefined && distSq(d.pos, victim.pos) <= config.meleeRange * config.meleeRange) {
            d.state = 'WINDUP';
            d.ticksInState = 0;
          } else {
            d.state = 'WALK';
            d.ticksInState = 0;
            d.walkTargetPos = victim !== undefined ? { x: victim.pos.x, y: victim.pos.y } : null;
          }
        } else if (d.kind === 'stinkTower') {
          /*
           * ⭐ S157 B9 (owner) — **A STINK TOWER DOES NOT AIM. IT LOBS.**
           *
           * Owner: *"he should not target any enemies but shoot our at random areas in a radius"*.
           *
           * Before this the tower shared the turret's acquire-or-idle rule, so with no enemy creature
           * inside `STINK_TOWER_ATTACK_RANGE` (260 px) it threw NOTHING — it just reset its timer and
           * waited. Combined with FIGHT-only dormancy, a tower nobody walked past threw zero bags for
           * an entire match. That, far more than the 8 s cadence, is why *"its not very clear what the
           * stink tower does"*.
           *
           * Now it fires blind on its own cadence, and `lastStrikePos` — the field the renderer already
           * uses to draw the lob arc — carries a scattered point instead of a victim.
           */
          d.targetCreatureId = null;
          d.lastStrikePos = stinkLobTarget(d, world.tick);
          d.state = 'WINDUP';
          d.ticksInState = 0;
        } else {
          // Nothing in range — retry shortly rather than fire into the void.
          d.targetCreatureId = null;
          d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
        }
      }
      // PRINCESS only: if still IDLE (didn't engage this tick), drift HOME and snap-pin when there so
      // she follows her hub's drift while waiting. Turret was pinned + frozen at the top already.
      if (d.kind === 'princess' && d.state === 'IDLE') {
        if (distSq(d.pos, homePos) <= PRINCESS_HOME_EPSILON * PRINCESS_HOME_EPSILON) {
          d.pos.x = homePos.x;
          d.pos.y = homePos.y;
          d.walkTargetPos = null;
          freezeDefender(d);
        } else {
          d.walkTargetPos = { x: homePos.x, y: homePos.y };
          stepDefenderWalk(d, homePos, config.moveAccel, PRINCESS_ARRIVE_RADIUS);
        }
      }
      break;
    }
    case 'WALK': {
      // PRINCESS only (a turret never enters WALK). Re-validate the target is alive, hostile, and
      // still inside the leash from HOME — else break off and head home (via IDLE). Anti-kite: the
      // leash is anchored to the hub, NOT her current pos, so she can't be walk-chased across the map.
      const victim = d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId) : undefined;
      const leashOk = victim !== undefined
        && victim.ownerPlayerId !== d.ownerPlayerId
        && distSq(victim.pos, homePos) <= config.attackRange * config.attackRange;
      if (!leashOk) {
        d.state = 'IDLE';
        d.ticksInState = 0;
        d.targetCreatureId = null;
        d.walkTargetPos = null;
        d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
        break;
      }
      d.walkTargetPos = { x: victim.pos.x, y: victim.pos.y };
      if (distSq(d.pos, victim.pos) <= config.meleeRange * config.meleeRange) {
        // Arrived → freeze in place and wind up the slap (the strike lands at FIRE, as today).
        freezeDefender(d);
        d.state = 'WINDUP';
        d.ticksInState = 0;
      } else {
        stepDefenderWalk(d, victim.pos, config.moveAccel, PRINCESS_ARRIVE_RADIUS);
      }
      break;
    }
    case 'WINDUP': {
      if (d.kind === 'princess') freezeDefender(d); // hold position through the wind-up
      /*
       * ⛔⭐ S158 P6 — **A BLIND LOB IS NOT AN INVALID TARGET, AND UNTIL NOW IT WAS.**
       *
       * S157 B9 gave the stink tower the owner's untargeted throw — *"he should not target any
       * enemies but shoot our at random areas in a radius"* — by arming WINDUP from IDLE with
       * `targetCreatureId = null` and a scattered `lastStrikePos`. The FIRE branch below was written
       * to match, and says so: *"A BLIND LOB STILL LANDS. The stink tower reaches FIRE with no
       * victim."*
       *
       * **It could not reach FIRE.** `targetValid` returns false on a null target by its first line,
       * so this guard aborted every blind lob one tick after it armed and sent the tower back to IDLE
       * with a re-acquire delay. The tower therefore STILL threw nothing unless an enemy wandered
       * inside 260 px — which is the exact behaviour B9 was written to end (*"a tower nobody walked
       * past threw zero bags for an entire match"*). The fix and the comment describing it shipped;
       * the path between them did not.
       *
       * ⚠ FOUND BY THE WORKER-DIFFERENTIAL'S SEEDING GUARD, not by a test of the feature. S158 P6
       * asserted `stinkClouds` SEEDED, the harness reported the family empty across 300 frames, and
       * the reason was that no bag is ever thrown. That is the second time in three sessions this
       * anti-vacuity assertion has surfaced a live defect (S156 P3 found a real desync the same way),
       * and it is the argument against ever leaving one of its rows merely "acknowledged".
       */
      const blindLob =
        d.kind === 'stinkTower' && d.targetCreatureId === null && d.lastStrikePos !== null;
      // Abort if the target slipped away mid-windup (died / left range) — re-acquire from IDLE.
      if (!blindLob && !targetValid(world, d, config)) {
        d.state = 'IDLE';
        d.ticksInState = 0;
        d.targetCreatureId = null;
        d.walkTargetPos = null;
        d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
        break;
      }
      if (d.ticksInState >= windupTicks) {
        // FIRE: the strike lands NOW. Capture the endpoint BEFORE the victim can vanish, then deal
        // the unified single-target hit. The FIRE state (+ lastStrikePos) is what the client renders.
        const victim = d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId) : undefined;
        /*
         * ⭐ S157 B9 — A BLIND LOB STILL LANDS. The stink tower reaches FIRE with no victim (see the
         * IDLE branch), so gating the whole strike on `victim !== undefined` would have thrown away
         * the untargeted throw the owner asked for. `lastStrikePos` was already chosen when it armed.
         */
        if (victim === undefined && d.kind === 'stinkTower' && d.lastStrikePos !== null) {
          stinkThrowBag(world, d, d.lastStrikePos, applyRadialDamage);
          d.state = 'FIRE';
          d.ticksInState = 0;
          d.nextFireTick = world.tick + fireInterval;
          break;
        }
        if (victim !== undefined) {
          d.lastStrikePos = { x: victim.pos.x, y: victim.pos.y };
          if (d.kind === 'stinkTower') {
            // S141 P1 — a STINK TOWER lobs a bag that SPLASHES at the target's position, rather than
            // dealing the shared single-target hit. It spends a bag; when the magazine is empty the
            // throw simply does not happen and the tower falls through to its depleted aura (handled
            // above, before the FSM). Note the splash is what makes it a structure-breaker: unlike the
            // turret beam it damages primitives, so it can chew an enemy build rather than only its
            // units.
            stinkThrowBag(world, d, d.lastStrikePos, applyRadialDamage);
          } else {
            // S139 P1 — through the dispatcher (identical behaviour; the creature arm delegates to
            // `damageCreature`), so the turret beam / HELGA slap now carry a `'defender'` source.
            //
            // ⭐ S148 P2 — PER-KIND DAMAGE. This line used to pass the shared `CREATURE_HIT_DAMAGE`
            // for every defender in the game, which is why HELGA needed six slaps to fell one goblin
            // and the laser turret — a "slow heavy beam" — needed six as well. One constant at one
            // call site made the whole tower roster mechanically identical.
            // ⭐ S151 P2 (owner R72) — the damage is now `atk × (1 + 0.2·pen)` FIFTHS off the shared
            // ladder, not a per-kind constant that happened to be a function of a goblin's hit
            // points. Same 6 / 3 / 1 the roster has always dealt (creature pools are five times the
            // old hit counts, so every kill count is unchanged) — but derived from nothing.
            damageEntity(
              world,
              { kind: 'creature', id: victim.id },
              attackFifths(config.atk, config.pen),
              'defender',
            );
          }
        }
        d.state = 'FIRE';
        d.ticksInState = 0;
      }
      break;
    }
    case 'FIRE': {
      if (d.kind === 'princess') freezeDefender(d); // hold position through the slap follow-through
      if (d.ticksInState >= DEFENDER_FIRE_HOLD_TICKS) {
        d.state = 'RECOVER';
        d.ticksInState = 0;
      }
      break;
    }
    case 'RECOVER': {
      if (d.kind === 'princess') freezeDefender(d); // hold position through the recovery
      if (d.ticksInState >= DEFENDER_RECOVER_TICKS) {
        d.state = 'IDLE';
        d.ticksInState = 0;
        d.targetCreatureId = null;
        d.walkTargetPos = null; // S110 P4 — stop pursuing; IDLE walks her home if she's away
        d.lastStrikePos = null; // stop riding the wire once the strike VFX window closed
        d.nextFireTick = world.tick + fireInterval;
      }
      break;
    }
  }
  return world;
}

/**
 * S103 P2 — re-validation predicate. The defender survives ONLY while its recipe still holds at
 * its anchor (a chewer eating the structure's bonds breaks the shape → REMOVE_DEFENDER → the
 * defender dies — the v1 counterplay). Delegates to the registered recipe's `stillValid`; falls
 * back to "anchor primitive exists" for a recipe with no rule (none ships without one). The host
 * poll also short-circuits on `!world.primitives.has(anchor)` as defense-in-depth.
 */
export function recipeStillSatisfied(world: World, defender: Defender): boolean {
  const recipe = getDefenderRecipe(defender.recipeId);
  if (recipe !== undefined) return recipe.stillValid(world, defender.anchorPrimitiveId);
  return world.primitives.has(defender.anchorPrimitiveId);
}

/**
 * S103 P2 (Council MF5) — re-phase every defender's `nextFireTick` relative to the loaded
 * `world.tick`. A saved `nextFireTick` is an absolute tick; after a load it is almost always in
 * the PAST, which would make every defender fire on the first post-load tick (the despawnAtTick=0
 * insta-fire bug class). Preserve each defender's relative phase within its interval instead.
 * Called by the save deserializer AFTER defenders are loaded.
 */
export function loadRephaseDefenders(world: World): void {
  for (const d of world.defenders.values()) {
    const interval = getDefenderConfig(d.kind).fireIntervalTicks;
    const delta = d.nextFireTick - world.tick;
    /*
     * ⛔ S156 P3 — LEAVE AN ALREADY-VALID PHASE ALONE. The modulo below is correct for a STALE tick
     * and wrong for a fresh one, and the boundary case is not exotic — it is the most common state a
     * defender is ever saved in.
     *
     * A just-registered defender has `nextFireTick = tick + interval` (`applyRegisterDefender`). The
     * old unconditional modulo mapped that to `interval % interval === 0`, i.e. `nextFireTick =
     * world.tick` — so a defender that should fire in a full interval fired IMMEDIATELY after any
     * load. That is the very insta-fire class this function was written to prevent, reintroduced at
     * exactly one point of its own domain.
     *
     * It is not a cosmetic off-by-one. The sim WORKER adopts the world through this same JSON save
     * path, so host and worker disagreed about the first shot of every freshly built tower — a live
     * desync, and the reason the `defenders` differential row could not be closed until now. It also
     * hit host-migration and any save/load with a new tower on the board.
     *
     * `delta` in `[0, interval]` is already a valid phase and is preserved EXACTLY. Only a value in
     * the past (the case the docblock above describes) or absurdly far ahead is folded back.
     */
    if (delta >= 0 && delta <= interval) continue;
    const rem = ((delta % interval) + interval) % interval;
    d.nextFireTick = world.tick + rem;
  }
}

/**
 * Teardown — clear all defender state. Wired into all FOUR teardown sites (world.ts WIN_TRIGGER,
 * gameMode.ts START_GAME + RETURN_TO_TITLE, godlyActions.ts applyGodlyAbort) so a defender never
 * persists onto the win screen or into the next match. `nextDefenderId` reset so a fresh match
 * mints ids from scratch.
 */
export function teardownDefenders(world: World): void {
  world.defenders.clear();
  world.nextDefenderId = 0;
}

/**
 * ⭐ S149 P2 (R4) — TOWERS STAND DOWN AT THE FIGHT→BUILD EDGE.
 *
 * *"When the walls drop, enemies fight and towers come alive doing whatever their skill is."* The
 * corollary the owner reported as broken — *"your towers can fight during build stage"* — is that
 * outside the FIGHT they must do NOTHING. `hostTick` stops fanning out `DEFENDER_TICK` in BUILD,
 * which is the dormancy itself; this function handles what dormancy alone would leave behind.
 *
 * ⛔ WHY CLEARING THE TARGET IS NOT OPTIONAL. `targetCreatureId` is a SYNCED field. A defender that
 * goes dormant mid-engagement keeps pointing at a creature id, and that creature will not survive
 * the BUILD phase it is now frozen through — it gets reaped, or its owner's structure is rebuilt
 * around it. When FIGHT resumes the defender would resume onto a dangling id. Every read of it is
 * `world.creatures.get(...)`-guarded so this is not a crash, but it IS a wrong first action:
 * the tower spends its first windup on a ghost instead of acquiring the nearest real threat.
 * Standing down means the next FIGHT starts from a clean acquisition for everybody.
 *
 * ⚠ HP IS DELIBERATELY NOT RESET (blueprint Q10). Damage persists across the cycle — that is the
 * whole reason FIX and SCRAP (R13) have anything to repair. This resets INTENT, never CONDITION.
 *
 * Idempotent: safe to call on a world with no defenders, or twice on the same edge.
 */
export function standDownDefenders(world: World): void {
  for (const d of world.defenders.values()) {
    d.targetCreatureId = null;
    d.state = 'IDLE';
    d.ticksInState = 0;
  }
}
