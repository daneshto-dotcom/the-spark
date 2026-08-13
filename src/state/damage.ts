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
import type { CreatureId, DefenderId, PlayerId, PrimitiveId } from '../types.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import type { Defender } from './defenders/defender.ts';
import { stinkDeathBlast } from './defenders/stinkTower.ts';
import { razePrimitives } from './razePrimitives.ts';
import type { World } from './worldTypes.ts';

/** What is being damaged. Discriminated so a caller cannot pass a bare number id to the wrong family. */
export type DamageTarget =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'primitive'; readonly id: PrimitiveId }
  | { readonly kind: 'defender'; readonly id: DefenderId };

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

    case 'defender': {
      const defender = world.defenders.get(target.id);
      if (defender === undefined) return false;
      defender.hp -= amount;
      if (defender.hp > 0) return false;
      destroyDefender(world, defender, 'damage');
      return true;
    }
  }
}

/** Why a defender is leaving the world. Selects whether its anchor is razed — see `destroyDefender`. */
export type DefenderDeathCause = 'damage' | 'recipeBreak';

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
export function destroyDefender(world: World, d: Defender, cause: DefenderDeathCause): void {
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
  if (cause === 'damage') {
    const anchor = world.primitives.get(d.anchorPrimitiveId);
    if (anchor !== undefined) {
      world.effects.push({
        kind: 'SEVER_ERASE',
        tick: world.tick,
        pos: { x: anchor.pos.x, y: anchor.pos.y },
        color: anchor.placerColor,
        radius: anchor.radius,
      });
      razePrimitives(world, [d.anchorPrimitiveId]);
    }
  }

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
export function applyRadialDamage(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
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
  // Defenders before primitives: killing a defender RAZES ITS ANCHOR, so doing it first means the
  // primitive loop never damages a shape that is about to be razed anyway. `damageEntity` no-ops on
  // a missing id either way, so this is legibility rather than correctness — but it keeps "what did
  // this blast do" a question with exactly one answer.
  for (const cid of creatureVictims) damageEntity(world, { kind: 'creature', id: cid }, amount, source);
  for (const did of defenderVictims) damageEntity(world, { kind: 'defender', id: did }, amount, source);
  for (const pid of primVictims) damageEntity(world, { kind: 'primitive', id: pid }, amount, source);

  return {
    creaturesHit: creatureVictims.length,
    defendersHit: defenderVictims.length,
    primitivesHit: primVictims.length,
  };
}

/** Full health for a freshly-placed primitive. Re-exported so callers need one import, not two. */
export { PRIMITIVE_MAX_HP };
