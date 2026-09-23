/**
 * SPARK — `damageEntity`: the ONE way anything in the world takes damage.
 *
 * ## Why this file exists (S138 P1)
 *
 * Before S138, `damageCreature` was the **only** damage function in `src/` and creatures were the
 * only damageable thing in the game. Primitives had no `hp`; `DEFENDER_HP` was a `1e9` sentinel
 * ("defenders die by recipe-break, not damage (v1)"); and `CONNECTOR_HP` is not hp at all — it is
 * the *attacker's* `chewProgress` commit counter. That is why the offence starter units ("walk
 * toward the nearest enemy structure") and the Stink Tower's individually-destructible bags were
 * blocked: they had nothing they could actually hurt.
 *
 * This dispatcher is the substrate they build on. `damageCreature` is kept as the single
 * creature-death path and is *delegated to* rather than duplicated, so "chewer dies in 1 / Voltkin
 * in 2" stays one coherent rule and every existing caller keeps working unchanged.
 *
 * ## Contract
 *
 * - **Host-only.** Callers are host-authoritative reducers, exactly as `damageCreature` documents.
 *   Never call this from a renderer: on a client it would mutate a mirrored world the host is
 *   about to overwrite, and the two seats would disagree until the next snapshot.
 * - **Integer damage only.** Enforced. ⛔ S178: this said `PRIMITIVE_MAX_HP = 1000` *"is chosen so
 *   every percentage in use lands on an integer"*. It is **70** — owner R173/S177 P1 put shapes on
 *   the ×5 ladder (14 HP × 0 DEF × 5), and this header had gone on teaching the retired scale at the
 *   top of the one file every damage path enters. Integrality now comes from the ladder itself: the
 *   ×5 is precisely what makes every stat a whole number. Integer arithmetic cannot drift, so the
 *   host and the `?worker=1` mirror cannot diverge by a rounding ulp. A fractional `amount` is a bug at the
 *   *authoring* site — it means someone wrote a per-engine-tick value instead of a total.
 * - **Tick-domain, no RNG, no wall-clock.** Nothing here reads `Math.random` or a clock.
 * - **Pushes no bespoke effect kind.** A razed primitive reuses the existing `SEVER_ERASE`
 *   (already emitted by the potato blast for exactly this), so death is visible without putting a
 *   NEW serialized effect literal on the wire — which is the class of change that forces a
 *   `PROTOCOL_VERSION` bump.
 *
 * ## Returns
 *
 * `true` iff the target died, so a caller can award a reward / retarget.
 */

import { PRIMITIVE_MAX_HP, STINK_BAG_ATK, STINK_BAG_PEN } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { attackFifths, structurePoolFifths } from './stats.ts';
import { LONE_PRIMITIVE_POOL_FIFTHS } from '../constants.ts';
import type { BondId, CreatureId, DefenderId, PlayerId, PrimitiveId, StinkCloudId } from '../types.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import { recordCreatureRetaliation, recordDefenderRetaliation } from './creatures/retaliation.ts';
import type { Defender } from './defenders/defender.ts';
import { stinkDeathBlast } from './defenders/stinkTower.ts';
import { razePrimitives } from './razePrimitives.ts';
import type { World } from './worldTypes.ts';
import { castleDamageAfterDefence } from './castleUpgrades.ts';
import { accrueDynastyLoss } from './racial/endlessDynasty.ts'; // ⭐ S188 — mummies.l5
// ⭐ S188 — BLOOD DEBT / CRIMSON TIDE. Called below each arm's early returns, i.e. only where damage
// actually LANDED, so a tower swing or a blow into a channelling Pharaoh heals nothing.
import { applyLifesteal } from './racial/lifesteal.ts';

/** What is being damaged. Discriminated so a caller cannot pass a bare number id to the wrong family. */
export type DamageTarget =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'primitive'; readonly id: PrimitiveId }
  /**
   * ⭐ S154 AMENDMENT C (owner A4 / R89) — THE CASTLE, keyed by seat because there is exactly one per
   * player and `castleAnchor(seat, layout)` is where it stands.
   *
   * ⚠ IT HONOURS THIS FUNCTION'S CONTRACT ONLY PARTLY, AND THAT IS DELIBERATE. `damageEntity`
   * returns "true iff the target DIED **and this function removed it**". A castle is never removed —
   * a seat with a fallen castle keeps its avatar, its gatherers and its shapes, it has simply LOST.
   * So the castle arm returns true on reaching zero and removes nothing, and the caller
   * (`tickGameState`) is what turns that into an outcome. Recorded rather than quietly diverged from,
   * because the `'defender'` arm was deleted for failing this same contract.
   */
  | { readonly kind: 'castle'; readonly seat: PlayerId }
  /**
   * ⭐ S158 P7 (CF-S157-c) — A UNIT-CLASS DEFENDER, i.e. HELGA. Owner: she should stay out *"until
   * she is destroyed herself"*, which nothing could do because the whole defender damage substrate
   * was removed at S151 P2 under a reading of R75 that R77 later corrected (R75 is about TOWERS).
   *
   * ⚠ THE TOWER QUESTION IS NOT REOPENED. This arm subtracts from `Defender.ehp`, which is `null`
   * for every kind without `config.unitStats` — so a turret or a stink tower handed to this function
   * takes NOTHING and returns false, exactly as it does today. Towers still die by recipe-break.
   *
   * It honours the contract in full, unlike the castle arm above: a defender that reaches zero IS
   * removed here, so `true` means what it means everywhere else.
   */
  | { readonly kind: 'defender'; readonly id: DefenderId }
  /**
   * ⭐ S158 A2 (owner R77) — A LANDED STINK BAG. *"destructible stink bags as entities with aggro
   * and on-destroy damage"*. It honours the contract in full: a bag that reaches zero is removed
   * here, and it BURSTS on the way out for `STINK_BAG_ATK`/`PEN` — the owner's *"1atk 1pierce when
   * destroyed"*.
   */
  | { readonly kind: 'stinkCloud'; readonly id: StinkCloudId };
/*
 * ⛔ S151 P2 (owner R75) — THE `'defender'` ARM IS GONE. A tower has no hit points of its own, so
 * there is nothing here to subtract from. Its durability is its connectors' — damage a tower by
 * damaging the bonds that hold its recipe together (`damageConnector` below), and it dies the way it
 * always primarily died: recipe-break.
 *
 * ⛔ AND CONNECTORS ARE DELIBERATELY *NOT* A `DamageTarget` KIND. `damageEntity`'s contract is
 * "returns true iff the target DIED — and this function removed it". A bond cannot honour that:
 * severing must go through the single `SEVER_BOND` path (topology split, SEVER_ERASE ordering,
 * charge accounting), which is a DISPATCH and cannot happen inside this reducer-level helper.
 * Folding bonds in here would give one function two different meanings for `true`, and the second
 * one would silently depend on every caller remembering to finish the job. See `damageConnector`.
 */

/**
 * Who dealt it. Carried for attribution + future reward/threat rules; it deliberately does NOT
 * change the arithmetic today, so adding a source can never alter existing balance.
 *
 * ⛔ S183 — **THIS IS A CATEGORY, NOT AN IDENTITY, AND THAT IS WHY `DamageAttacker` EXISTS.** It
 * says a creature hit you. It has never said WHICH creature, and a reading of this file that
 * assumes otherwise is the specific mistake retaliation was nearly built on top of.
 */
export type DamageSource = 'creature' | 'defender' | 'player' | 'hazard' | 'aura';

/**
 * ⭐⭐ S183 (owner R183-A…D) — **WHICH ENTITY DEALT IT.** The identity `DamageSource` deliberately
 * does not carry, threaded so a victim can turn on its attacker (`creatures/retaliation.ts`).
 *
 * ⛔⛔ **REQUIRED, NEVER OPTIONAL, AND THE REQUIREMENT IS THE WHOLE POINT.** An optional parameter
 * would leave every existing call compiling and every path that forgot it silently un-retaliating:
 * a tolerant default, green tests, dead feature — verbatim the S182 defect the project doc records
 * (*"a new value propagated through every consumer with an exhaustive switch … the one consumer
 * with a tolerant `default` stayed silent"*). Making it required means `tsc` ENUMERATES the call
 * sites and a future damage path cannot be added without someone deciding what it means.
 *
 * `null` is a real, deliberate answer and the honest one for area damage, a hazard, the castle gun
 * and a player raid: there is no single entity to turn on. `src/state/damage.callSites.test.ts`
 * counts both populations mechanically, so a new site shifts a pinned number rather than slipping
 * in as one more `null`.
 */
export type DamageAttacker =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'defender'; readonly id: DefenderId }
  | null;

export function damageEntity(
  world: World,
  target: DamageTarget,
  amount: number,
  source: DamageSource,
  attacker: DamageAttacker,
): boolean {
  void source; // attribution only for now — see DamageSource
  /*
   * ⛔ S164 P3 — **THE VALIDATION MOVED ABOVE THE CASTLE ARM, WHICH WAS A HOLE.** This guard used to
   * sit BELOW the `castle` branch, and the castle branch returns — so the one target that could not
   * be validated was the one whose HP ENDS THE MATCH. `damageEntity(world, {kind:'castle'}, -300)`
   * computed `Math.max(0, hp - (-300))` = hp + 300: an unvalidated, unclamped, undocumented HEAL
   * vector reachable from any caller, with no upper bound.
   *
   * That is not theoretical harm. `save.ts` emits `castleHp` only when it is BELOW max and
   * rehydrates an absent value as `CASTLE_MAX_HP`, so any over-max value a heal produced would be
   * emitted as NOTHING and read by every peer as 1500 — a silent divergence on the match-ending
   * number, invisible to both hash oracles. ⛔ S179 — THE REASON GIVEN HERE WAS FALSE: this said
   * *"because `stateHashFull` marks `players:'acknowledged'`"*, and it does not — it marks them
   * `'hashed'` and projects six sim-authoritative fields. Same pre-S165 drift as `player.ts`.
   *
   * Healing has a real path now (`castleRegen.ts`, owner R128) and it is clamped at both ends. This
   * function stays what its name says: damage only, non-negative, integer.
   */
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      `damageEntity: amount must be a non-negative INTEGER, got ${amount}. Author damage as a ` +
        `total over seconds (a % of max hp on the 0.5s cadence), not a per-engine-tick fraction.`,
    );
  }
  if (target.kind === 'castle') {
    // ⭐ S154 AMENDMENT C — the castle arm. Clamped at zero: HP is read by the win gate and by the
    // HUD, and a negative value would make both lie about how close the match is.
    /*
     * ⚠⚠ S183 — **THIS ARM IS THE ONE DOWNWARD ARM THAT DOES NOT RECORD ITS KILLING SWING**, and
     * that is a KNOWN GAP, not an oversight to be read past. The other three push to
     * `world.structureKillHits` before the overkill is discarded — shapes below, landed bags, and
     * Helga — so a fatal hit prints the swing. A fatal KEEP hit prints the REMAINDER: the clamp
     * two lines down throws the overkill away, and `damageNumbers`' castle watch diffs
     * `castleHp` frame to frame, so 300 into 40 left prints "40".
     *
     * ⛔ CLOSING IT NEEDS `damageNumbers.ts` AS WELL AS THIS LINE, which is why it is documented
     * here rather than half-landed. The castle is tracked with `deathOnVanish: false` — a castle is
     * never removed — so it never reaches the vanish sweep that is the only consumer of
     * `structureKillHits`. A `c:${seat}` record pushed from here would be written and never read.
     * The renderer's DIFF path has to consult `killBlow` too, and that file is owned by another
     * branch this session. Recorded for the merge owner.
     */
    const seat = world.players.get(target.seat);
    if (seat === undefined) return false;
    if (seat.castleHp <= 0) return false; // already fallen — idempotent, never double-fires the win
    if (amount === 0) return false;
    /*
     * ⭐ S187 — PURCHASED DEFENCE, APPLIED HERE AND NOWHERE ELSE. This is the single site the castle
     * takes damage, so a seat's DEF level belongs here rather than at each of the many things that
     * can hit a keep. `castleDamageAfterDefence` floors the reduction and never returns 0 on a real
     * hit, so a high DEF cannot make a keep immune to small attackers.
     */
    const taken = castleDamageAfterDefence(amount, seat.castleUpgrades);
    const hpBefore = seat.castleHp;
    seat.castleHp = Math.max(0, seat.castleHp - taken);
    // ⭐ S188 — ENDLESS DYNASTY counts what the keep ACTUALLY lost: after DEF, and after the clamp, so
    // a killing blow's overkill is not a loss. A no-op for every seat without `mummies.l5`.
    accrueDynastyLoss(world, target.seat, hpBefore - seat.castleHp);
    applyLifesteal(world, attacker, amount); // S188 — of the swing, before the keep's DEF
    return seat.castleHp === 0;
  }
  if (amount === 0) return false;

  switch (target.kind) {
    case 'creature': {
      // Delegate — `damageCreature` stays THE creature-death path (S102 unified hp model).
      // ⭐ S155 N1 — pass the host tick's one-tick deferral set THROUGH, so a mutual melee exchange
      // resolves simultaneously instead of being decided by `creatures` iteration order. `null`
      // outside that batch ⇒ immediate deletion, exactly as before, for every other damage source.
      // ⭐ S188 — `damageCreature` returns only "died", so whether the blow LANDED is read off the
      // pool: a missing victim, a corpse already awaiting the sweep, and a channelling Pharaoh
      // (damage passes straight through him) all leave it unchanged and heal nothing (BLOOD DEBT).
      // ⭐ S188 — and the killer's id rides along, read only at the death decision (THE RISEN).
      const victim = world.creatures.get(target.id);
      const before = victim?.ehp ?? 0;
      const died = damageCreature(
        world, target.id, amount, world.pendingCreatureDeaths ?? undefined,
        attacker !== null && attacker.kind === 'creature' ? attacker.id : null,
      );
      if (victim !== undefined && before > 0 && victim.ehp !== before) {
        applyLifesteal(world, attacker, amount);
      }
      /*
       * ⭐⭐ S183 (owner R183-A…D) — **THE VICTIM TURNS ON ITS ATTACKER.** One call, at the one
       * funnel every creature hit passes through, so no strike path can implement the ruling
       * differently or forget it. The rule itself — the pencil-chewer exception, the splash gate
       * and the lowest-id total order — lives in `creatures/retaliation.ts`.
       *
       * ⚠ AFTER THE BLOW AND ONLY WHEN IT SURVIVED, WHICH IS THE S155 N1 DEFERRAL SPEAKING. Under
       * `pendingCreatureDeaths` a lethally-struck creature stays in the map until the end-of-tick
       * sweep precisely so *"its committed blow still lands"*. Retargeting a corpse-in-waiting
       * would redirect that last blow onto somebody it was never aiming at, which is the guarantee
       * the deferral exists to give.
       */
      if (!died && attacker !== null && attacker.kind === 'creature') {
        recordCreatureRetaliation(world, target.id, attacker.id);
      }
      return died;
    }

    case 'primitive': {
      const prim = world.primitives.get(target.id);
      if (prim === undefined) return false;
      /*
       * ⭐⭐⭐ S179 (owner) — **A SHAPE WITH NO CONNECTORS IS WORTH FIVE.** See
       * `LONE_PRIMITIVE_POOL_FIFTHS`. Gated on the LIVE connector count, so a shape inside any
       * structure never reaches it and `PRIMITIVE_MAX_HP` still governs those.
       */
      if (prim.bonds.size === 0) prim.hp = Math.min(prim.hp, LONE_PRIMITIVE_POOL_FIFTHS);
      prim.hp -= amount;
      applyLifesteal(world, attacker, amount); // S188
      if (prim.hp > 0) return false;
      // ⭐⭐ S182 — THE SWING THAT KILLED IT, recorded before the remainder is lost. The renderer's
      // vanish sweep can only see what the shape had LEFT; the overkill is discarded on the line
      // above, so this is the last place that still knows the real number. See `structureKillHits`.
      world.structureKillHits.push({ key: `p:${prim.id}`, amount });
      // Visible death, reusing the kind the potato blast already emits for an erased primitive.
      world.effects.push({
        kind: 'SEVER_ERASE',
        tick: world.tick,
        pos: { x: prim.pos.x, y: prim.pos.y },
        color: prim.placerColor,
        radius: prim.radius,
      });
      // The shared four-step contract: incident bonds off both endpoints, bonds gone, prim gone,
      // then the Verlet + fouled-set fixups. Never hand-roll this.
      // ⭐ S157 B2 — killing one half of a two-shape structure must not leave the other half
      // standing as unkillable clutter. Same rule as the sever path; review caught that fixing only
      // the sever site would miss this door.
      razePrimitives(world, [target.id], undefined, true, /* killedByDamage */ true);
      return true;
    }

    case 'stinkCloud': {
      /*
       * ⭐ S158 A2 — shoot the bag, wear the burst.
       *
       * ⚠ THE BURST SPARES THE BAG'S OWNER, NOT THE KILLER. Every area effect in this game spares
       * the side that created it, and a bag is no different just because someone else set it off —
       * otherwise a player could clear their own minefield by shooting it and be hurt for it. The
       * unit that popped it eats the blast precisely because it is standing there.
       *
       * ⛔ REMOVED BEFORE THE BURST, which is the opposite of the suicide goblin's order and is
       * deliberate: `applyRadialDamage` walks `world.stinkClouds`? It does not — but a burst that
       * killed a NEIGHBOURING bag would re-enter this arm while this one is still in the map, and
       * removing first makes that chain terminate. A bag cannot detonate itself twice.
       */
      const cloud = world.stinkClouds.get(target.id);
      if (cloud === undefined) return false;
      cloud.ehp -= amount;
      applyLifesteal(world, attacker, amount); // S188 — before the burst, at the moment the blow lands
      if (cloud.ehp > 0) return false;
      // ⭐ S182 — the killing blow on a landed bag, same reason as the shape arm above.
      world.structureKillHits.push({ key: `s:${cloud.id}`, amount });
      const at = { x: cloud.pos.x, y: cloud.pos.y };
      const owner = cloud.ownerPlayerId;
      const radius = cloud.radius;
      world.stinkClouds.delete(target.id);
      world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: at, radius });
      applyRadialDamage(
        world, at.x, at.y, radius,
        attackFifths(STINK_BAG_ATK, STINK_BAG_PEN), // ⭐ S177 P1 — ONE LADDER: the shape arm is the unit arm.
        attackFifths(STINK_BAG_ATK, STINK_BAG_PEN),
        'hazard', owner,
      );
      return true;
    }

    case 'defender': {
      /*
       * ⭐ S158 P7 (CF-S157-c) — THE DEFENDER ARM, BACK AND SCOPED.
       *
       * `ehp === null` means a TOWER: no pool, nothing to subtract, immune — exactly as S151 P2
       * left it, and exactly what R75 asks for. Only a defender the config gave `unitStats` (Helga,
       * per R77) has a pool to lose. That scoping is the whole reason this can come back without
       * re-litigating the tower ruling.
       *
       * The amount is in FIFTHS, like every unit hit in the game, because `ehp` is a fifths pool.
       */
      const d = world.defenders.get(target.id);
      if (d === undefined || d.ehp === null) return false;
      d.ehp -= amount;
      applyLifesteal(world, attacker, amount); // S188 — Helga has a pool; a tower returned above
      if (d.ehp > 0) {
        /*
         * ⭐ S183 (owner R183-C) — **HELGA RETARGETS WHOEVER IS TARGETING HER**, and only while she
         * is still standing. `ehp === null` above already means a TOWER took nothing, so this arm
         * is reached by the one defender kind with a pool. She cannot be aimed at a tower by this:
         * the only field it writes is `Defender.targetCreatureId`, a `CreatureId`.
         */
        if (attacker !== null && attacker.kind === 'creature') {
          recordDefenderRetaliation(world, target.id, attacker.id);
        }
        return false;
      }
      // ⭐ S182 — the killing blow on Helga (the one defender kind with a pool), same reason again.
      world.structureKillHits.push({ key: `d:${d.id}`, amount });
      // She is gone. Same visible death the erased primitive gets, so a client with no idea WHY
      // she vanished still sees something happen where she stood.
      world.effects.push({
        kind: 'SEVER_ERASE',
        tick: world.tick,
        pos: { x: d.pos.x, y: d.pos.y },
        color: world.players.get(d.ownerPlayerId)?.color ?? 0xffffff,
        radius: 24,
      });
      /*
       * ⚠ REMOVED HERE, WHICH IS WHAT LETS THIS ARM HONOUR THE CONTRACT the castle arm cannot.
       * `removeDefenderAndRazeAnchor` is deliberately NOT used: that path exists so a blast that
       * kills a TOWER also takes its anchor, because a defender deleted while its recipe still
       * matches is re-ignited on the next topology change and becomes immortal. Helga's recipe is
       * hers to rebuild — the owner's ruling is that she *"only comes back next turn"* — and razing
       * the player's own shapes because their princess died would be a second, unasked-for
       * punishment. The re-ignition risk does not apply: ignition only runs on a topology change,
       * and killing her changes no topology.
       */
      world.defenders.delete(target.id);
      return true;
    }

  }
}

/**
 * ⭐ S177 P1 (owner R173-B) — DAMAGE ONE CONNECTOR. The tower-durability path.
 *
 * ⛔⛔ THE RULE BELOW IS THE SHIPPED ONE. Until S178 this docblock opened by stating R76's
 * `count + 4` per-bond capacity as current — thirty lines above a body that has computed
 * `structurePoolFifths(comp.bondIds.size)` since S177 P1. The correction was present but buried
 * INSIDE the function at the pool read, and a reader hits the docblock first. R76 is SUPERSEDED;
 * `connectorCapacityFifths` survives only as an unread arithmetic helper.
 *
 * THE SHIPPED RULE — owner R173-B, S177: the pool is **STRUCTURE-WIDE**, not per-bond.
 * `structurePoolFifths(n)` = `n × (5 + n)` fifths for a component of `n` connectors — 5→50, 4→36,
 * 3→24, 2→14, 1→6 — and ALL damage standing anywhere on the structure counts toward the next
 * connector, wherever it landed. It is **derived live, never stored** (the count is re-read every
 * hit, which is what makes the collapse accelerate); only the accumulated damage is state
 * (`Bond.damageFifths`).
 *
 * The R76 ruling it replaced, kept for provenance only:
 * *"if there are three shapes connected in a row so with only two connectors … each of those two
 * connectors are 1.2. now if those three shapes are connected in a triangle form making 3 connectors
 * … each of those connectors will be 1.4."*
 *
 * ⚠ **RETURNS "SHOULD SEVER", AND THE CALLER MUST ACTUALLY SEVER.** This function deliberately does
 * NOT remove the bond. Severance has to run through the one `SEVER_BOND` path — it splits topology,
 * emits `SEVER_ERASE` BEFORE the mutation (the effects read live primitives) and `BOND_SEVERED`
 * after, and settles charges. That is a dispatch, and dispatching from inside a damage helper is the
 * re-entrancy the codebase has kept out of reducers on purpose. Callers: `creatureAttack.ts`.
 *
 * ⚠ **THE DAMAGE PERSISTS ACROSS ATTACKERS, AND THAT IS A REAL BEHAVIOUR CHANGE.** Before S151 the
 * progress counter lived on the ATTACKER (`Creature.chewProgress`), so two chewers gnawing the same
 * bond each had to do the whole job and neither saw the other's work. Pooling it on the connector
 * means they now cooperate — and it is what lets a laser and a chewer damage the same bond at all.
 *
 * ⚠ **A SHRINKING STRUCTURE CAN SNAP AN ALREADY-DAMAGED CONNECTOR WITHOUT A NEW HIT.** Capacity
 * falls as connectors are lost, so damage banked when the structure was large may already exceed the
 * smaller structure's capacity. That is the owner's intended cascade — *"if you manage to damage its
 * connectors then it also scales down in defense and will be easier to keep beating down"* — and it
 * is surfaced on the NEXT hit rather than swept: this function re-reads capacity every call.
 *
 * ⭐ S188 — **`attacker` IS REQUIRED, FOR THE REASON `damageEntity`'s IS.** BLOOD DEBT heals a unit
 * for every hit it lands, and chewing a tower is what most units spend a match doing — so a
 * lifesteal wired only into `damageEntity` would heal nothing for the commonest hit in the game.
 * Required rather than optional so `tsc` enumerated all four call sites and each had to answer;
 * `damageConnector.callSites.test.ts` pins the answers.
 *
 * @returns `true` when accumulated damage has reached capacity and the caller must dispatch
 *          `SEVER_BOND`; `false` while the connector still holds (or the bond is already gone).
 */
export function damageConnector(
  world: World,
  bondId: BondId,
  amountFifths: number,
  attacker: DamageAttacker,
): boolean {
  if (!Number.isInteger(amountFifths) || amountFifths < 0) {
    throw new Error(
      `damageConnector: amount must be a non-negative INTEGER number of FIFTHS, got ${amountFifths}. ` +
        `Use stats.attackFifths(atk, pen) — the whole point of fifths is that nothing is fractional.`,
    );
  }
  const bond = world.bonds.get(bondId);
  if (bond === undefined) return false;
  if (amountFifths === 0) return false;

  bond.damageFifths += amountFifths;
  // ⭐ S188 — the hit has landed on a building; the attacker heals (BLOOD DEBT / CRIMSON TIDE).
  applyLifesteal(world, attacker, amountFifths);

  // The pool is a function of the component this bond is CURRENTLY part of, so it is read fresh on
  // every hit rather than cached. `componentOf` is the established on-demand BFS here (the structure
  // renderer runs it every frame), so this is not a new cost pattern.
  const anchor = world.primitives.get(bond.aId) ?? world.primitives.get(bond.bId);
  if (anchor === undefined) return true; // orphaned bond — nothing holds it up
  const comp = componentOf(anchor, world.primitives, world.bonds);
  const pool = structurePoolFifths(comp.bondIds.size);

  /*
   * ⭐⭐⭐ S177 P1 (owner R173-B) — **THE POOL IS STRUCTURE-WIDE, NOT PER-BOND.**
   *
   * Owner, S177: *"you take five HP, then you times it times two ... and then you times it times
   * five. So that is fifty HP to destroy the tower ... which also is defined by the first connection
   * that is destroyed. And there's still four other connectors, and you need to destroy all of them
   * to completely destroy the building."*
   *
   * So ALL the damage standing on a structure counts toward the next connector, wherever it landed.
   * Before this, damage banked on ONE bond and that bond alone had to reach `n + 4` — 9 fifths for a
   * 5-connector hub, against his 50. A chewer took the first connector off a lightning hub on its
   * SECOND bite; under his ruling it needs eight.
   *
   * ⚠ NO NEW FIELD AND NO PROTOCOL BUMP. `Bond.damageFifths` is already serialized and hashed;
   * summing it across the component is a READ, so the wire shape is untouched.
   */
  let banked = 0;
  for (const id of comp.bondIds) banked += world.bonds.get(id)?.damageFifths ?? 0;
  if (banked < pool) return false;

  /*
   * ⛔ SPEND THE POOL, DO NOT ZERO IT — overkill carries into the next connector, which is what makes
   * the accelerating collapse he describes continuous rather than lossy.
   *
   * ⚠ TOTAL ORDER, NEVER `Map` ORDER. The bond the attacker TARGETED is drained first (R173-C: *"the
   * damage lands on whatever bond the attacker targeted ... the first connector to be targeted is the
   * one to fall first"*), then the survivors in ascending id. `Map` iteration is insertion order and
   * letting it decide which bond keeps the remainder is exactly the class of divergence this codebase
   * spends most of its comments on.
   *
   * ⚠ AND DRAINING RATHER THAN ZEROING KEEPS TWO LIVE CONSUMERS HONEST: `structureRenderer` pins a
   * connector visible while `damageFifths > 0`, and `structureRepair` gates its FIX button on the
   * same test. Zeroing survivors would phase a mid-collapse tower's connectors back out and report
   * "nothing to fix" on a structure one hit from falling.
   */
  /*
   * ⭐⭐⭐ S179 (owner) — **THE BREAKING HIT MUST STILL SHOW ITS NUMBER.**
   *
   * *"Make sure that a hit on a connector and a hit on a unit shows the same number."*
   *
   * Everything below SPENDS the pool, so every bond's `damageFifths` drops. `DamageNumbers` infers a
   * connector's number by diffing that counter upward, so a drop prints nothing — and the swing that
   * actually broke a connector was invisible. Measured: 12, nothing, 12, nothing. Recorded here, at
   * the only place that knows both the hit and that it landed the finishing blow.
   */
  world.connectorBreakHits.push({ bondId, amount: amountFifths });

  let toSpend = pool;
  const drain = (b: { damageFifths: number } | undefined): void => {
    if (b === undefined || toSpend <= 0) return;
    const take = Math.min(b.damageFifths, toSpend);
    b.damageFifths -= take;
    toSpend -= take;
  };
  drain(bond);
  const survivors = [...comp.bondIds]
    .filter((id) => id !== bondId)
    .sort((x, y) => Number(x) - Number(y));
  for (const id of survivors) drain(world.bonds.get(id));
  return true;
}

/*
 * ⛔ S151 P2 (owner R75) — `DefenderDeathCause` IS DELETED, along with `destroyDefender`'s `cause`
 * parameter. It discriminated 'damage' from 'recipeBreak', and after R75 removed a tower's hit
 * points NOTHING CAN PRODUCE 'damage' — there is no arm left that kills a defender by subtraction.
 *
 * A one-valued discriminator is worse than none: it reads like a live mechanism, so the next author
 * plans around a death path that cannot occur. This codebase has been bitten by exactly that before
 * (`CONNECTOR_HP` was documentation shorthand for a mechanism that did not exist, and `DEFENDER_HP`
 * was a sentinel whose docblock stayed false for two sessions).
 *
 * ⚠ AND THE IMMORTAL-DEFENDER HAZARD THE 'damage' BRANCH GUARDED CANNOT ARISE ON THE SURVIVING PATH.
 * That branch razed the anchor because deleting a defender whose recipe still MATCHES lets
 * `runDefenderIgnition` re-mint it on the next topology change anywhere on the board. Under R75/R76 a
 * tower dies only when its CONNECTORS break — at which point the recipe no longer matches and there
 * is nothing to re-mint. A player who repairs those bonds SHOULD get the tower back; that is what
 * FIX is for.
 */

/**
 * S141 P1 — THE ONE PLACE A DEFENDER LEAVES THE WORLD MID-MATCH.
 *
 * Before this existed there were TWO removal paths sharing no code — the damage arm above, and
 * `applyRemoveDefender` driven by the host's recipe-revalidation poll — and any per-kind death
 * behaviour bolted onto one of them would simply not happen on the other. The S139 Council found
 * this the decisive way round: the poll path (`REMOVE_DEFENDER`, fired when the anchor dies) is the
 * MOST LIKELY way a tower actually dies, so a death effect wired only into `damageEntity` would
 * essentially never fire.
 *
 * ⚠ NOT CALLED FROM TEARDOWN, DELIBERATELY. `teardownDefenders` uses `world.defenders.clear()`, and
 * so do four inline sites (match start, return-to-title, the win trigger, the godly abort cascade).
 * Those must stay silent: firing death blasts into a world that is being torn down would push
 * effects onto the win screen and damage primitives that are about to be discarded. "A reset is not
 * a death" is the rule; `.clear()` bypassing this function is how it is enforced.
 *
 * ⚠ REMOVAL HAPPENS FIRST, WHICH MAKES THIS STRUCTURALLY IDEMPOTENT. A second call for the same
 * defender cannot find it in the map, so it cannot double-fire — no `dying` flag needed, and
 * therefore no new serialized+hashed field. It also means the tower stops firing on the very tick
 * it died rather than surviving until the next poll slot.
 *
 * ⚠ RE-ENTRANCY IS SAFE BY CONSTRUCTION. The blast damages primitives, which can break OTHER
 * defenders' recipes while `runHostTick` is mid-iteration. That is fine: the poll iterates a
 * SNAPSHOT (`[...world.defenders]`), and both `applyDefenderTick` and `applyRemoveDefender` no-op on
 * an id that has since vanished. A defender whose anchor this blast razed simply falls out on its
 * own poll slot.
 */
export function destroyDefender(world: World, d: Defender): void {
  /*
   * ⭐⭐ S182 — **A DESTROYED HELGA WAS PRINTING A PHANTOM 156.** This path runs on a recipe or
   * ANCHOR break, not on damage: nothing subtracted from `ehp`, so the vanish sweep saw her full
   * pool disappear and printed it as a hit. The damage path has its own record (pushed inside
   * `damageEntity`); this one is a REMOVAL and must print nothing. `amount: null` says so.
   */
  if (d.ehp !== null) world.structureKillHits.push({ key: `d:${d.id}`, amount: null });
  // 1. Out of the map first (idempotence + stop it acting on its death tick).
  world.defenders.delete(d.id);

  // 2. ⭐ VERIFIED HAZARD — on the DAMAGE path the anchor MUST be razed, and this is not optional.
  //
  // `runDefenderIgnition` (godlyMatcherCore.ts, `runDefenderIgnition`) fires on ANY topology change
  // (`BOND_FORMED`, or a player-caused `BOND_SEVERED`) and re-registers every recipe match whose
  // anchor has no live defender. So deleting a defender while its recipe geometry is still intact
  // does NOT kill it — it returns for free the next time any bond forms anywhere on the board. That
  // is an IMMORTAL defender.
  //
  // Razing the ANCHOR is what actually kills it: the recipe stops matching, so the igniter can never
  // re-mint it. Fiction: kill the tower and its keystone shatters.
  //
  // On the recipeBreak path we must NOT raze. Either the anchor is already gone (something destroyed
  // it — nothing to do), or the anchor is alive and the player simply changed the shape, in which
  // case razing would destroy a primitive they still own and are still building with.

  // 3. ⭐ THE DESTROYED-vs-DECONSTRUCTED DISCRIMINATOR, and it is the load-bearing line in this file.
  //
  // A death effect must fire when the tower is DESTROYED and must NOT fire when it is merely
  // DECONSTRUCTED. The world itself answers that without a parameter anyone could pass wrongly: if
  // the anchor is GONE, something killed it (damage razed it just above, or an enemy razed it and
  // the poll noticed). If the anchor is STILL STANDING, the recipe stopped matching because the
  // player added, moved or removed a shape — that is building, not dying.
  //
  // ⚠ WHY THIS MATTERS MORE THAN IT LOOKS, and it is specific to the Stink Tower. Its recipe is the
  // easiest in the game to satisfy by accident (a Square dropped among three loose Circles), and the
  // component-size gate is exact, so an accidental tower REMOVES ITSELF the moment the player bonds
  // a fourth shape on. Without this discriminator, continuing your own build would detonate a stink
  // blast in the middle of your own structure. Deriving the answer from the anchor — rather than
  // trusting the call site — is what makes that unrepresentable.
  if (!world.primitives.has(d.anchorPrimitiveId)) {
    onDefenderDestroyed(world, d);
  }
}

/** Per-kind death behaviour. Kinds with nothing to do are silent — no default branch to forget. */
function onDefenderDestroyed(world: World, d: Defender): void {
  if (d.kind === 'stinkTower') stinkDeathBlast(world, d, applyRadialDamage);
}

export interface RadialDamageResult {
  readonly primitivesHit: number;
  readonly creaturesHit: number;
  readonly defendersHit: number;
}

/**
 * S141 P1 — the radial-collect → per-target `damageEntity` bridge.
 *
 * ## Why this is NOT `applyRadialClear`
 *
 * `applyRadialClear` (potatoLifecycle.ts) looks like the AoE helper and is a TRAP for anything that
 * wants to HURT rather than ERASE. Three reasons, each read off its body:
 *
 *  1. **It DELETES primitives, it does not damage them** — it collects everything in radius and
 *     hands the whole list to `razePrimitives`, with no hp subtraction anywhere. A stink bag routed
 *     through it would one-shot a full-health 1000-hp shape, making `Primitive.hp` — the entire
 *     point of the S138 damage substrate — invisible to the newest damage source in the game.
 *  2. **Its predicate filters CREATURES ONLY.** The `creatureKill` callback gates the creature loop;
 *     the primitive loop takes no predicate at all, which is why the lightningHub self-destruct
 *     passes `() => true` and razes friendly shapes by design. A bag that flattens the thrower's own
 *     tower is not a mechanic, it is a bug.
 *  3. **It never consults `world.defenders`.** A blast that cannot hurt a tower cannot be counterplay
 *     to towers.
 *
 * What IS worth copying from it, and is copied here, is its ITERATION DISCIPLINE: collect victims
 * into an array, sort by numeric id, and only then mutate. Map iteration order is insertion order,
 * which differs between a host that built its world by play and a client that rebuilt it from a
 * snapshot — sorting is what makes the damage order identical on both, which is what keeps the state
 * hash agreeing. Copy the discipline, never the body.
 *
 * ⚠ NO FALLOFF, deliberately. Falloff needs a rounding rule, and a rounded fraction at the rim is
 * exactly how a host and a `?worker=1` mirror end up disagreeing by one hp. Flat integers cannot
 * drift, and `damageEntity` throws on a fraction anyway.
 *
 * `sparePlayerId` is the OWNER FILTER: pass the blast owner's seat and nothing they own is touched.
 * ⚠ Ownership is a DIFFERENT FIELD per family and they are not interchangeable. Creatures and
 * defenders carry `ownerPlayerId`; a primitive does not — it carries `placedBy`. `placerColor` is
 * deliberately NOT used: the rainbow hazard REMAPS colours mid-match, so a colour comparison would
 * silently start sparing the wrong player's shapes the moment a rainbow fires.
 */
/*
 * ⭐ S151 P2 — TWO AMOUNTS, BECAUSE THERE ARE TWO SCALES AND THERE ALWAYS WERE.
 *
 * ⛔ THE PRE-EXISTING DEFECT THIS CLOSES, found by probe during the S151 A.0 and NOT previously
 * recorded anywhere. This function used to broadcast ONE `amount` to creatures, defenders AND
 * primitives in the same call. Those families never shared a scale, so one number meant three
 * different things: `STINK_AURA_DAMAGE = 20` was 2% of a primitive (1000), 0.67% of a turret (3000)
 * — and instant obliteration of a Voltkin (8). The stink tower is documented as the AREA weapon
 * whose single-target punch is deliberately the weakest in the game, and it was in fact one-shotting
 * every unit in its radius.
 *
 * ⛔⛔ S178 — `primitiveAmount` IS FIFTHS, like every other number in the game. This line said it
 * *"stays on the 1000-per-shape scale"* — the single most load-bearing stale comment left after
 * S177 P1, because it sits on the ONE real implementation every radial hazard calls, and S178 found
 * the stink tower's death blast still obeying it (100–400 against a 70-fifth shape). All seven
 * production radial sites now pass a ladder number to BOTH arms.
 *
 * The superseded wording: `primitiveAmount` stayed on the 1000-per-shape scale (where the owner-ruled DoT percentages land on
 * integers). `unitAmountFifths` is on the stat ladder. Neither can be read as the other.
 */
export function applyRadialDamage(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  primitiveAmount: number,
  unitAmountFifths: number,
  source: DamageSource,
  sparePlayerId: PlayerId | null,
): RadialDamageResult {
  const r2 = radius * radius;
  const inRange = (x: number, y: number): boolean => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r2;
  };

  // ── collect first, mutate second (see the iteration-discipline note above) ──
  const creatureVictims: CreatureId[] = [];
  for (const [cid, c] of world.creatures) {
    if (sparePlayerId !== null && c.ownerPlayerId === sparePlayerId) continue;
    if (inRange(c.pos.x, c.pos.y)) creatureVictims.push(cid);
  }
  creatureVictims.sort((a, b) => (a as number) - (b as number));

  const defenderVictims: DefenderId[] = [];
  for (const [did, dd] of world.defenders) {
    if (sparePlayerId !== null && dd.ownerPlayerId === sparePlayerId) continue;
    if (inRange(dd.pos.x, dd.pos.y)) defenderVictims.push(did);
  }
  defenderVictims.sort((a, b) => (a as number) - (b as number));

  const primVictims: PrimitiveId[] = [];
  for (const [pid, p] of world.primitives) {
    if (sparePlayerId !== null && p.placedBy === sparePlayerId) continue;
    if (inRange(p.pos.x, p.pos.y)) primVictims.push(pid);
  }
  primVictims.sort((a, b) => (a as number) - (b as number));

  // ── apply ──
  // ⛔ S151 P2 (owner R75) — THE DEFENDER ARM OF THIS BLAST IS GONE, and AoE deliberately does NOT
  // gain a connector arm in its place. A tower has no hit points to subtract, and making area damage
  // sever bonds directly would be a large new behaviour nobody asked for — one potato could shred a
  // fortress. Structures still take blast damage the way they always have: through their SHAPES.
  // Razing a primitive removes its incident bonds via `razePrimitives`, so a blast that destroys
  // shapes still takes the structure apart — it just does it by removing shapes rather than by
  // cutting connectors. Single-target attacks are what damage connectors (`damageConnector`).
  //
  // `defenderVictims` is still COLLECTED, because `defendersHit` is part of this function's reported
  // result and callers (the stink death blast) count it. It is simply no longer damaged here.
  /*
   * ⭐ S183 — **AREA DAMAGE NAMES NO ATTACKER, AND THAT IS A DECISION RATHER THAN AN OMISSION.**
   * `damageEntity`'s attacker parameter is REQUIRED so every site has to answer; the honest answer
   * for a blast is `null`. A splash is not somebody targeting you — there is no single entity to
   * turn on — and routing the blast owner through here would have a suicide bomber's detonation,
   * a stink burst and a hub self-destruct all yank every survivor's target at once. Deliberate,
   * counted by `damage.callSites.test.ts`, and the same answer for all three arms below.
   */
  for (const cid of creatureVictims) {
    damageEntity(world, { kind: 'creature', id: cid }, unitAmountFifths, source, null);
  }
  /*
   * ⭐ S158 P7 (CF-S157-c) — AND THE UNIT-CLASS DEFENDERS, on the UNIT scale.
   *
   * The note above says the defender arm of this blast is gone because a tower has no hit points
   * to subtract. That is still true and still enforced — `damageEntity` returns false for any
   * defender whose `ehp` is null, which is every tower. What changes is that HELGA is not a tower:
   * she is a unit standing in a field of fire, and a potato going off at her feet doing nothing
   * was never the ruling, it was the collateral of a removal that was too broad.
   *
   * `unitAmountFifths`, not `primitiveAmount` — the two scales are adjacent parameters of this
   * function and swapping them typechecks, which is why the signature documents them at length.
   */
  for (const did of defenderVictims) {
    damageEntity(world, { kind: 'defender', id: did }, unitAmountFifths, source, null);
  }
  for (const pid of primVictims) {
    damageEntity(world, { kind: 'primitive', id: pid }, primitiveAmount, source, null);
  }

  return {
    creaturesHit: creatureVictims.length,
    defendersHit: defenderVictims.length,
    primitivesHit: primVictims.length,
  };
}

/** Full health for a freshly-placed primitive. Re-exported so callers need one import, not two. */
export { PRIMITIVE_MAX_HP };
