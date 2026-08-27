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
 * - **Integer damage only.** Enforced. The owner-ruled DoT model authors effects as a PERCENTAGE
 *   of max hp, and `PRIMITIVE_MAX_HP = 1000` is chosen so every percentage in use lands on an
 *   integer (1% = 10, 2.5% = 25, 5% = 50). Integer arithmetic cannot drift, so the host and the
 *   `?worker=1` mirror cannot diverge by a rounding ulp. A fractional `amount` is a bug at the
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

import { PRIMITIVE_MAX_HP } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { connectorCapacityFifths } from './stats.ts';
import type { BondId, CreatureId, DefenderId, PlayerId, PrimitiveId } from '../types.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import type { Defender } from './defenders/defender.ts';
import { stinkDeathBlast } from './defenders/stinkTower.ts';
import { razePrimitives } from './razePrimitives.ts';
import type { World } from './worldTypes.ts';

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
  | { readonly kind: 'castle'; readonly seat: PlayerId };
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
 */
export type DamageSource = 'creature' | 'defender' | 'player' | 'hazard' | 'aura';

export function damageEntity(
  world: World,
  target: DamageTarget,
  amount: number,
  source: DamageSource,
): boolean {
  void source; // attribution only for now — see DamageSource
  if (target.kind === 'castle') {
    // ⭐ S154 AMENDMENT C — the castle arm. Clamped at zero: HP is read by the win gate and by the
    // HUD, and a negative value would make both lie about how close the match is.
    const seat = world.players.get(target.seat);
    if (seat === undefined) return false;
    if (seat.castleHp <= 0) return false; // already fallen — idempotent, never double-fires the win
    seat.castleHp = Math.max(0, seat.castleHp - amount);
    return seat.castleHp === 0;
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      `damageEntity: amount must be a non-negative INTEGER, got ${amount}. Author damage as a ` +
        `total over seconds (a % of max hp on the 0.5s cadence), not a per-engine-tick fraction.`,
    );
  }
  if (amount === 0) return false;

  switch (target.kind) {
    case 'creature':
      // Delegate — `damageCreature` stays THE creature-death path (S102 unified hp model).
      return damageCreature(world, target.id, amount);

    case 'primitive': {
      const prim = world.primitives.get(target.id);
      if (prim === undefined) return false;
      prim.hp -= amount;
      if (prim.hp > 0) return false;
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
      razePrimitives(world, [target.id]);
      return true;
    }

  }
}

/**
 * ⭐ S151 P2 (owner R76) — DAMAGE ONE CONNECTOR. The tower-durability path.
 *
 * Owner R76 fixes a connector's durability by its structure's complexity:
 * *"if there are three shapes connected in a row so with only two connectors … each of those two
 * connectors are 1.2. now if those three shapes are connected in a triangle form making 3 connectors
 * … each of those connectors will be 1.4."*
 *
 * So capacity is `connectorCapacityFifths(componentConnectorCount)` = `count + 4` fifths, and it is
 * **derived live, never stored** — which is what makes the collapse accelerate. Only the accumulated
 * damage is state (`Bond.damageFifths`).
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
 * @returns `true` when accumulated damage has reached capacity and the caller must dispatch
 *          `SEVER_BOND`; `false` while the connector still holds (or the bond is already gone).
 */
export function damageConnector(world: World, bondId: BondId, amountFifths: number): boolean {
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

  // Capacity is a function of the component this bond is CURRENTLY part of, so it is read fresh on
  // every hit rather than cached. `componentOf` is the established on-demand BFS here (the structure
  // renderer runs it every frame), so this is not a new cost pattern.
  const anchor = world.primitives.get(bond.aId) ?? world.primitives.get(bond.bId);
  if (anchor === undefined) return true; // orphaned bond — nothing holds it up
  const connectorCount = componentOf(anchor, world.primitives, world.bonds).bondIds.size;
  return bond.damageFifths >= connectorCapacityFifths(connectorCount);
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
 * `primitiveAmount` stays on the 1000-per-shape scale (where the owner-ruled DoT percentages land on
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
  for (const cid of creatureVictims) {
    damageEntity(world, { kind: 'creature', id: cid }, unitAmountFifths, source);
  }
  for (const pid of primVictims) {
    damageEntity(world, { kind: 'primitive', id: pid }, primitiveAmount, source);
  }

  return {
    creaturesHit: creatureVictims.length,
    defendersHit: defenderVictims.length,
    primitivesHit: primVictims.length,
  };
}

/** Full health for a freshly-placed primitive. Re-exported so callers need one import, not two. */
export { PRIMITIVE_MAX_HP };
