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
import type { CreatureId, DefenderId, PrimitiveId } from '../types.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
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
      // ⭐ VERIFIED HAZARD — do not "simplify" this to `world.defenders.delete(id)`.
      //
      // `runDefenderIgnition` (godlyMatcherCore.ts:156-168) fires on ANY topology change
      // (`BOND_FORMED`, or a player-caused `BOND_SEVERED`) and re-registers every recipe match
      // whose anchor has no live defender. So deleting the defender while its recipe geometry is
      // still intact does NOT kill it — it comes back for free the next time any bond forms
      // anywhere on the board, which is an IMMORTAL defender.
      //
      // Razing the ANCHOR primitive is what actually kills it: the recipe stops matching, so the
      // igniter can never re-mint it, and the shipped REMOVE_DEFENDER recipe-break path does the
      // removal itself on the next poll — the same counterplay a chewer already triggers. Zero new
      // world state, zero new wire surface. Fiction: kill the defender and its keystone shatters.
      const anchor = world.primitives.get(defender.anchorPrimitiveId);
      if (anchor !== undefined) {
        world.effects.push({
          kind: 'SEVER_ERASE',
          tick: world.tick,
          pos: { x: anchor.pos.x, y: anchor.pos.y },
          color: anchor.placerColor,
          radius: anchor.radius,
        });
        razePrimitives(world, [defender.anchorPrimitiveId]);
      }
      // Remove it here too rather than waiting for the poll, so it stops firing on the very tick
      // it died. The recipe-break path is now a belt-and-braces backstop, not the sole mechanism.
      world.defenders.delete(target.id);
      return true;
    }
  }
}

/** Full health for a freshly-placed primitive. Re-exported so callers need one import, not two. */
export { PRIMITIVE_MAX_HP };
