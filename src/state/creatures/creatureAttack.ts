/**
 * SPARK — creature attack reducer (S27 P0). Handles the discrete CREATURE_ATTACK
 * action dispatched from `main.ts` post-CREATURE_TICK fan-out when a creature
 * reaches `ticksInState === VOLTKIN_ATTACK_FIRE_TICK` (tick 30 of the 60-tick
 * ATTACKING state) with a valid `targetBondId`.
 *
 * Council R1 RESOLUTIONS (this module):
 *   - Q1 UNANIMOUS B (extend SEVER_BOND.cause to 'player'|'physics'|'creature'):
 *     applyCreatureAttack dispatches SEVER_BOND{cause:'creature'} rather than
 *     inlining the severance orchestration. The same code path handles all
 *     severance (player, physics, creature) — single source of truth, replaces
 *     the GODLY_TRIGGER inline cascade which is DELETED in this session.
 *     `canSeverBond` already bypasses auth for 'creature' (disruptionManager.ts:62).
 *   - Q4 2/3 A SILENT audio: BOND_SEVERED{cause:'creature'} emits as an audio
 *     event but audioManager has no SFX case for 'creature' in S27 (S28 ships
 *     procedural Web Audio zap synth — Δ6 explicit carry-forward).
 *
 * PRIME-AUDIT Δ3: multi-creature target conflict (blueprint Q10 known v1
 * limitation). Two creatures may simultaneously dispatch CREATURE_ATTACK on
 * the same bond. The first reducer call severs; the second hits the
 * `world.bonds.get(bondId) === undefined` early return and no-ops cleanly.
 * The "loser" creature's ARC_FLASH is NOT emitted (defense-in-depth: emit only
 * after severance confirms). User-visible glitch: one creature emits ARC_FLASH
 * to the now-empty bond position (rare; chain centroid stub-target diversity
 * mitigates per S26 Δ5 ownerPlayerId·π offset). Revisit in S28 polish if user
 * reports.
 *
 * Re-dispatch from reducer: applyCreatureAttack → dispatch(SEVER_BOND). This is
 * the FIRST place in the codebase where a reducer dispatches another action.
 * The pattern is justified by Council Q1 B centralization win + post-S27
 * elimination of all duplicate severance orchestration code (GODLY_TRIGGER
 * cascade DELETED). JavaScript is single-threaded so synchronous re-dispatch
 * is safe (no re-entrancy state corruption). Alternative inline-severance
 * pattern (Council Q1 A — REJECTED) would have duplicated the SEVER_BOND case
 * body verbatim.
 */

import type { World } from '../world.ts';
import { dispatch } from '../world.ts';
import type { BondId, CreatureId, Vec2 } from '../../types.ts';
import { bondMidpoint, distSq } from './creatureAI.ts';
import { getCreatureConfig } from './voltkin-config.ts';
import { damageConnector, damageEntity } from '../damage.ts';
import { GOBLIN_DAMAGE_VS_PRIMITIVE } from '../../constants.ts';
import { attackFifths } from '../stats.ts';

/**
 * Action shape — exported for `world.ts` GameAction union composition.
 *
 * S103 #8 — a CREATURE_ATTACK now resolves to ONE of two targets (Council "touch
 * applyCreatureAttack once"): a BOND (sever — the chewer chew + Voltkin's zap on a structure)
 * or, when `targetCreatureId` is set, an enemy CREATURE (a Voltkin zapping a chewer that
 * wandered into range → the single `damageCreature` death path). `bondId` is nullable so the
 * creature-zap case needn't fabricate one; the main.ts fan-out fills exactly one.
 */
export interface CreatureAttackAction {
  readonly type: 'CREATURE_ATTACK';
  readonly creatureId: CreatureId;
  readonly bondId: BondId | null;
  /** S103 #8 — when set, this attack zaps a CREATURE (damageCreature) instead of severing a bond. */
  readonly targetCreatureId?: CreatureId | null;
}

/**
 * Apply a single creature attack at the target bond. Defense-in-depth guards
 * (top-down):
 *   1. Creature exists in world.creatures
 *   2. Creature is in ATTACKING state (main.ts orchestration invariant —
 *      double-check protects against state mutation between dispatch and reducer)
 *   3. Target bond exists in world.bonds (race condition — bond may have been
 *      severed by another creature OR by physics-overstretch between target
 *      selection and attack-fire tick)
 *   4. Both endpoint primitives exist (handles zombie-bond degenerate state)
 *
 * On success:
 *   - Captures arc visual endpoints (start = creature.pos, end = bond midpoint)
 *     BEFORE dispatching SEVER_BOND so the snapshot is pre-mutation
 *   - Dispatches SEVER_BOND{cause:'creature'} which triggers the canonical
 *     severance path (canSeverBond bypass + severSplit + computeSeverEraseEffects
 *     + applySeverTopology + BOND_SEVERED{cause:'creature'} emit)
 *   - AFTER SEVER_BOND returns, emits ARC_FLASH effect with the captured
 *     endpoints. Conditional on bond actually being severed (defense-in-depth
 *     against future canSeverBond changes) — checks `world.bonds.has(bondId)`
 *     post-dispatch.
 *
 * On any guard fail: no-op (returns world unchanged). The FSM lifecycle in
 * applyCreatureTick handles the cleanup (clears targetBondId + transitions
 * back to SEEKING per Δ4).
 */
export function applyCreatureAttack(world: World, action: CreatureAttackAction): World {
  const creature = world.creatures.get(action.creatureId);
  if (creature === undefined) return world;
  if (creature.state !== 'ATTACKING') return world;

  // S103 #8 — CREATURE-target branch (a Voltkin zapping an enemy chewer in range). The SINGLE
  // creature-death path (`damageCreature`); a chewer (hp 1) dies in one zap, a Voltkin (hp 2) in
  // two → discombobulate (the render death-watcher splats goo / a lightning-cloud on the vanished
  // creature, so NO effect/wire surface here). The Voltkin keeps its lightning arc: emit ARC_FLASH
  // from the attacker to the victim, then deal the damage. Defense-in-depth: victim must still exist.
  if (action.targetCreatureId !== undefined && action.targetCreatureId !== null) {
    const victim = world.creatures.get(action.targetCreatureId);
    if (victim === undefined) return world;
    const arcStart: Vec2 = { x: creature.pos.x, y: creature.pos.y };
    const arcEnd: Vec2 = { x: victim.pos.x, y: victim.pos.y };
    // S139 P1 — routed through the `damageEntity` dispatcher rather than calling `damageCreature`
    // directly. Behaviour is identical (the dispatcher delegates the creature arm straight to
    // `damageCreature`), but the call now passes through the integer guard and carries attribution.
    // ⭐ S151 P2 — the attacker's own ATK off the shared ladder, in fifths, instead of the shared
    // CREATURE_HIT_DAMAGE every creature used to deal. Every shipped unit is atk 1 / pen 0, so this
    // is 5 fifths against pools that are five times the old hit counts — identical kill counts, and
    // now a per-unit lever exists where there was one global constant.
    const died = damageEntity(
      world,
      { kind: 'creature', id: action.targetCreatureId },
      attackFifths(getCreatureConfig(creature.type).atk, getCreatureConfig(creature.type).pen),
      'creature',
    );
    if (died) creature.killCount += 1;
    /*
     * ⛔ S154 P2 — THE COMMENT THAT USED TO BE HERE HAD GONE FALSE, AND IT WAS DRAWING LIGHTNING OUT
     * OF EVERY GOBLIN.
     *
     * It read: *"A chewer never zaps a creature (it only chews bonds); this branch is
     * Voltkin/lightning only, so always emit ARC_FLASH"* — and that was true when it was written.
     * S153 P1 (owner R83, units-first targeting) then gave every GOBLIN a `targetCreatureId`, so
     * goblins started arriving here too and each one has been firing the Voltkin's signature
     * lightning arc at whatever it punches. Nobody noticed because a lightning bolt on a hit is not
     * obviously wrong until you know it belongs to a different unit.
     *
     * It becomes unmissable in this priority: the archer would draw an ARROW **and** a lightning
     * arc for one shot, and the bat rider a HARPOON and a lightning arc. So the emit is now gated on
     * the unit that actually owns the effect.
     *
     * ⚠ KEYED ON THE TYPE, DELIBERATELY, and not on `!config.targetsStructures`. That predicate
     * would give the right answer today purely by coincidence — it means "attacks shapes", not "has
     * a lightning arc" — and this file's own docblock warns at length against riding one overloaded
     * flag to mean a second thing. The arc IS Voltkin's signature; naming it says so.
     */
    if (creature.type === 'voltkin') {
      world.effects.push({
        kind: 'ARC_FLASH',
        tick: world.tick,
        start: arcStart,
        end: arcEnd,
        creatureId: creature.id,
      });
    }
    return world;
  }

  // ── S139 P2 — STRUCTURE strike (goblin) ──────────────────────────────────────────────────
  // Reached when the hostTick fan-out fired with `bondId: null` and no creature target, which for a
  // structure-attacker means "hit the shape you are committed to". Ordered AFTER the creature branch
  // above so a goblin under attack defends itself rather than ignoring an attacker to keep hitting a
  // wall — that ordering is the whole reason the fan-out checks `targetCreatureId` first.
  //
  // NO NEW EFFECT KIND IS PUSHED, deliberately. A new `GameEffect` member costs four separate
  // exhaustive switches (serializeEffect, deserializeEffect, effectLifetime, effectsRenderer.draw),
  // and a one-shot effect is an unreliable client channel anyway: the 10 Hz snapshot samples
  // `world.effects` while the renderer wipes it every frame, so it is lost ~5/6 of the time. The
  // strike is already legible from SYNCED HELD STATE (ATTACKING + ticksInState + targetPos), and a
  // LETHAL hit emits SEVER_ERASE from inside `damageEntity`. That is the shipped "state IS the event
  // bus" ruling, and it keeps this feature at zero new wire surface.
  const attackerConfig = getCreatureConfig(creature.type);
  if (attackerConfig.targetsStructures && creature.targetPrimitiveId !== null) {
    const prim = world.primitives.get(creature.targetPrimitiveId);
    // The shape died between target selection and this fire tick (another goblin, a potato, a
    // sever cascade). Release the commit; the FSM re-seeks next tick.
    if (prim === undefined) {
      creature.targetPrimitiveId = null;
      return world;
    }
    // Range re-check at STRIKE time, not just at engage time: the goblin may have been pushed off
    // by the physics solver during its windup, and a hit landing from out of range would read as a
    // shape taking damage from nothing.
    const reach = attackerConfig.attackRange * attackerConfig.attackRange;
    if (distSq(creature.pos, prim.pos) > reach) return world;

    // GOBLIN_DAMAGE_VS_PRIMITIVE is an INTEGER chosen so six strikes fell a full-hp shape
    // (6 × 167 = 1002 ≥ PRIMITIVE_MAX_HP 1000) — the owner's "6 attacks". `damageEntity` throws on a
    // fractional amount, so authoring this as PRIMITIVE_MAX_HP/6 would be a runtime crash.
    const died = damageEntity(
      world,
      { kind: 'primitive', id: creature.targetPrimitiveId },
      GOBLIN_DAMAGE_VS_PRIMITIVE,
      'creature',
    );
    if (died) {
      creature.killCount += 1;
      creature.targetPrimitiveId = null; // commit released — re-seek next tick
    }
    return world;
  }

  if (action.bondId === null) return world;
  const bond = world.bonds.get(action.bondId);
  if (bond === undefined) return world;

  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return world;

  // Capture arc endpoints pre-mutation. bondMidpoint reads bond.a.pos/bond.b.pos
  // which alias world.primitives.get(aId/bId).pos — must snapshot BEFORE
  // applySeverTopology runs (inside SEVER_BOND case) and deletes the primitives.
  const arcStart: Vec2 = { x: creature.pos.x, y: creature.pos.y };
  const arcEnd: Vec2 = bondMidpoint(bond);

  const isChewer = creature.type === 'chewer';

  // ⭐ S151 P2 (owner R76) — THE STRIKE NO LONGER SEVERS UNCONDITIONALLY. It lands DAMAGE on the
  // connector, and the connector decides whether it gives way.
  //
  // ⛔ WHAT THIS REPLACES. Every creature strike on a bond used to sever it outright, and the
  // "toughness" of a connector was the attacker's `chewHits` — a flat 5 bites for every bond in the
  // game, whether it was half of a loose pair or one strut of a forty-connector fortress. Owner R76
  // moves durability onto the connector, where a structure's complexity can defend it:
  // `connectorCapacityFifths(count)` = `count + 4` fifths.
  //
  // Damage POOLS on the bond, so several attackers now cooperate on one connector instead of each
  // starting from scratch — and a laser and a chewer can work on the same strut.
  const attacker = getCreatureConfig(creature.type);
  const broke = damageConnector(world, action.bondId, attackFifths(attacker.atk, attacker.pen));
  if (!broke) {
    // The connector held. A chewer already emits its own CHEW_BITE from the FSM, so there is nothing
    // to show here — and deliberately no new effect kind (a new GameEffect member costs four
    // exhaustive switches and rides the wire).
    return world;
  }

  // Council R1 Q1 UNANIMOUS B: re-dispatch through SEVER_BOND with a creature cause.
  // disruptionManager.canSeverBond bypasses auth for creature-class causes;
  // computeBaseCharge returns 0 for non-'player'. SEVER_ERASE + BOND_SEVERED{cause} emit through
  // the canonical path — which is exactly why `damageConnector` reports "should sever" instead of
  // severing itself: topology splitting has ONE entry point and it is a dispatch.
  //
  // S102 #2 — split the chewer cause off Voltkin's: a pencil chewer's final bite uses
  // cause:'chewer' (the audio drain plays a beaver GNAW, NOT lightning-crackle); a
  // Voltkin keeps cause:'creature' (its lightning zap). `creature.type` is the discriminant.
  dispatch(world, {
    type: 'SEVER_BOND',
    bondId: action.bondId,
    playerId: creature.ownerPlayerId,
    cause: isChewer ? 'chewer' : 'creature',
  });

  // Emit ARC_FLASH only if the bond actually severed.
  if (!world.bonds.has(action.bondId)) {
    // S36 P3 — increment kill counter. Drives the DESPAWNING victory/hurt frame
    // branch (`voltkinFrames.currentFrameKey`). Tick-deterministic — same
    // success guard as the visual emission so the two stay in lockstep.
    creature.killCount += 1;
    // S102 #2 — a chewer's bite is a GNAW, not a lightning zap: emit NO ARC_FLASH for
    // a chewer. This also suppresses the creature-attack screen-shake (main.ts gates the
    // shake on an ARC_FLASH emission this tick), so a chewer chewing through a connector
    // is quiet + un-flashy — just the gnaw. Voltkin keeps its lightning arc + shake.
    if (!isChewer) {
      world.effects.push({
        kind: 'ARC_FLASH',
        tick: world.tick,
        start: arcStart,
        end: arcEnd,
        // S33 P1-11 — emitter ID so simultaneous same-tick attacks from
        // multiple creatures at int-truncated-equal positions don't render
        // identical jitter (latent at S33, breaks at Anvil multi-creature).
        creatureId: creature.id,
      });
    }
  }

  return world;
}
