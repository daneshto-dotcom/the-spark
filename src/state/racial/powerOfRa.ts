/**
 * SPARK — S188 P6 — **POWER OF RA (`mummies.l0`): THE CAST, AND THE FIVE COLUMNS.**
 *
 * > *"It gives you a skill to call Ra that hits like the lightning beams from the sky, kind of like
 * > Pharaoh has. But you get to choose where it lands … it will, you know, hit and damage buildings
 * > or creatures in that area."* — owner, S187
 *
 * The rules (who may cast, what a legal aim is) live in the leaf `powerOfRaRules.ts`, because the
 * footer button and the aiming telegraph read them too. This file is the two halves that MUTATE:
 *
 *   `applyCastPowerOfRa`  the host reducer for the `CAST_POWER_OF_RA` client intent — appends to
 *                         `Player.raStrikes` and nothing else;
 *   `runPowerOfRa`        the `racialTick` slot — lands whichever column is due this tick.
 *
 * ## ⛔ IT IS THE PHARAOH'S STRIKE, RE-CENTRED — THE FUNCTIONS AND CONSTANTS ARE HIS, NOT COPIES
 *
 * `RA_COLUMN_COUNT` columns, one every `RA_COLUMN_TICKS`, each `attackFifths(RA_COLUMN_ATK,
 * RA_COLUMN_PEN)` over `RA_COLUMN_RADIUS`, landing at `raColumnPos` and timed by
 * `raColumnImpactTick` — every one imported from `bossSkillsPharaohRitual.ts` / `constants.ts`. The
 * Pharaoh centres it on himself and seeds it with his id; a caster centres it on the aimed point and
 * seeds it with the seat. A retune of his ultimate retunes this one, which is what *"kind of like
 * Pharaoh has"* asks for.
 *
 * ## ⚠ TWO DELIBERATE DIFFERENCES FROM HIS, AND BOTH ARE MINE
 *
 *   1. **IT SPARES THE CASTER.** His columns pass `sparePlayerId: null` — *"kills everything in that
 *      circle"*, a god does not check banners. A player's skill that could wipe their own towers
 *      would be a trap, and every area effect a player owns in this game spares its owner (the stink
 *      bag, the suicide goblin, the S157 hub precedent). So enemy creatures, enemy Helga, enemy
 *      shapes and enemy CONNECTORS take it; the caster's own take nothing.
 *   2. **IT ALSO CUTS CONNECTORS.** *"hit and damage buildings"* — and a building in this game dies
 *      through its connectors (canon §4). `applyRadialDamage` deliberately has no connector arm
 *      (*"one potato could shred a fortress"*); that reasoning is about area damage in GENERAL and
 *      does not stand against a ruling about THIS skill — the suicide goblin's exact precedent
 *      (`suicideBlast.ts`), whose connector arm lives beside its one owner-named mechanic rather than
 *      inside the shared helper.
 *
 * ## ⚠ IT LANDS ONLY DURING FIGHT
 *
 * `runPowerOfRa` sits in the FIGHT-gated `runRacialPerksFight`, so a column whose impact tick falls
 * after the FIGHT→BUILD edge simply never lands (a strike called in the last seconds of a fight is
 * cut short by the sunset). The renderer draws under the SAME gate, so no telegraph promises a column
 * that will not come. ⚠ MINE: the alternative — columns landing into BUILD — would attack buildings
 * in the one phase whose premise is that nothing can be attacked.
 *
 * ## Determinism
 *
 * No RNG, no clock, no accumulator. The strike is one synced record (`RaStrike`); which column is due
 * is `raColumnImpactTick(untilTick, k) === world.tick`, recomputed every tick. Seats are visited in
 * id order, connector victims are collected then sorted by id before any damage, and the creature /
 * shape arm is `applyRadialDamage`, which sorts its own victims. `world.creatures` is never inserted
 * into here, so nothing is born mid-strike (Council A5 does not apply).
 */

import { MAX_PLAYERS, RA_COLUMN_ATK, RA_COLUMN_COUNT, RA_COLUMN_PEN, RA_COLUMN_RADIUS, RA_RITUAL_TICKS } from '../../constants.ts';
import type { BondId, PlayerId } from '../../types.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import { applyRadialDamage, damageConnector } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import type { World } from '../world.ts';
import { applySeverBond } from '../severBond.ts';
import { raAimPoint, raCastRefusal, type CastPowerOfRaAction } from './powerOfRaRules.ts';

/** What one column deals — to a creature, a shape and a connector alike. ONE LADDER (S177 P1). */
export const RA_STRIKE_FIFTHS = attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN);

/**
 * ⭐ WHERE COLUMN `k` OF A SEAT'S STRIKE LANDS — the Pharaoh's `raColumnPos`, re-centred on the aim
 * and seeded by the seat (see `powerOfRaRules.ts` for why the seat and not the cast tick). The sim
 * damages through this and the renderer draws through this; there is no second copy.
 *
 * ⭐ S188 P11 — `charge` is the strike's index among this fight's casts (0 for POWER OF RA's only
 * one), folded into the seed as `seat + MAX_PLAYERS × charge` so WRATH OF RA's three strikes fall in
 * three different patterns while charge 0 keeps exactly the S188 P6 pattern. The index is known to
 * the aiming client before the click — ⚠ S190 W-4: exactly only once its previous cast has synced,
 * so the client adds the casts it has sent and not yet seen (`raCastsInWaveLocal`, render-side). ⚠ MINE.
 */
export function raStrikeColumnPos(
  seat: PlayerId,
  k: number,
  aim: { readonly x: number; readonly y: number },
  charge = 0,
): { x: number; y: number } {
  return raColumnPos((seat as unknown as number) + MAX_PLAYERS * charge, k, aim.x, aim.y);
}

/**
 * ⭐⭐ THE REDUCER. Host-authoritative, NO-OP-NEVER-THROW: every refusal returns the world untouched.
 *
 *   · the seat must hold `mummies.l0`, be alive, unbenched, in a PLAYING match, in FIGHT, and have a
 *     charge left this wave (1, or 3 with WRATH OF RA) — all of it one predicate, `raCastRefusal`,
 *     the one the button reads;
 *   · the aim must be a finite point on the canvas — `raAimPoint`, the one the telegraph reads —
 *     and what is STORED is its rounded, clamped integer form (Council A1).
 *
 * The strike starts NOW: `untilTick` is the Pharaoh's deadline shape (start + `RA_RITUAL_TICKS`), so
 * column `k` lands at `raColumnImpactTick(untilTick, k)` — two seconds after the cast, then every two.
 */
export function applyCastPowerOfRa(world: World, action: CastPowerOfRaAction): World {
  if (raCastRefusal(world, action.playerId) !== null) return world;
  const aim = raAimPoint(action.x, action.y);
  if (aim === null) return world;
  const caster = world.players.get(action.playerId);
  if (caster === undefined) return world; // unreachable past raCastRefusal; kept so tsc can see it
  /*
   * ⭐ S188 P11 — APPEND, after dropping every earlier-wave strike (all long finished: five columns
   * take 10 s and a wave's FIGHT is far longer, and a column due after the fight never lands). So the
   * list is always one wave's casts in cast order, never more than the seat's charges, and an entry's
   * index is its charge number. ⚠ MINE: the three strikes may overlap — a player who spends all
   * three in one second gets three strikes at once. Refusing a cast while one was still falling
   * would read as a broken button, and he asked for three uses, not three in a queue.
   */
  const kept = caster.raStrikes.filter((s) => s.wave === world.waveNumber);
  kept.push({ wave: world.waveNumber, x: aim.x, y: aim.y, untilTick: world.tick + RA_RITUAL_TICKS });
  caster.raStrikes = kept;
  return world;
}

/**
 * ⭐⭐ THE `racialTick` SLOT. Lands every column whose impact tick is THIS tick, for every seat.
 *
 * ⚠ NO PERK RE-CHECK AT LANDING, deliberately. A strike can only exist if the reducer accepted it,
 * picks are append-only, and a caster whose castle falls mid-strike still has the columns it already
 * called come down — the Pharaoh's ultimate finishes after his death for the same reason. ⚠ MINE.
 */
export function runPowerOfRa(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  const seats = [...world.players.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [seat, p] of seats) {
    // Seat, then charge, then column — a total order, so two overlapping WRATH strikes whose columns
    // land on one tick resolve identically on every peer.
    for (const [charge, strike] of p.raStrikes.entries()) {
      for (let k = 0; k < RA_COLUMN_COUNT; k++) {
        if (raColumnImpactTick(strike.untilTick, k) !== world.tick) continue;
        landRaColumn(world, seat, raStrikeColumnPos(seat, k, strike, charge));
      }
    }
  }
}

/**
 * One column of Ra's light at `at`, on behalf of `caster`.
 *
 * ⛔ CONNECTORS FIRST, THEN THE PHARAOH'S OWN RADIAL CALL — and the order is not cosmetic.
 * `applyRadialDamage` hits SHAPES too (`PRIMITIVE_MAX_HP` 70 governs area damage, canon §2), and a
 * razed shape takes its bonds with it. Run it first and every connector in the circle would be gone
 * before the connector arm looked — the building would still fall, but no connector would ever TAKE
 * the hit, and the S179 break-number (`connectorBreakHits`) would never print. Connectors first means
 * the structure takes the column the way a building in this game is meant to: through its connectors,
 * each one priced against the intact structure it belongs to.
 */
function landRaColumn(world: World, caster: PlayerId, at: { x: number; y: number }): void {
  /*
   * Enemy-only by the same rule the suicide goblin and the raid use: a bond has no owner field, so
   * ownership is read off the primitives it joins, and a bond touching ANY of the caster's shapes is
   * spared. Collected before mutating, then sorted, so the sever order is a total order.
   */
  const r2 = RA_COLUMN_RADIUS * RA_COLUMN_RADIUS;
  const hit: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    const aOwner = world.primitives.get(bond.aId)?.placedBy;
    const bOwner = world.primitives.get(bond.bId)?.placedBy;
    if (aOwner === caster || bOwner === caster) continue;
    const mx = (bond.a.pos.x + bond.b.pos.x) / 2;
    const my = (bond.a.pos.y + bond.b.pos.y) / 2;
    const dx = mx - at.x;
    const dy = my - at.y;
    if (dx * dx + dy * dy <= r2) hit.push(bondId);
  }
  hit.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  for (const bondId of hit) {
    if (!world.bonds.has(bondId)) continue; // a sibling sever already took it
    // S188 merge — `null` attacker: a sky strike has no creature to heal (BLOOD DEBT), the same answer
    // the raid and the suicide blast give (`damageConnector.callSites.test.ts`).
    if (damageConnector(world, bondId, RA_STRIKE_FIFTHS, null)) {
      /*
       * ⚠ `cause: 'raid'` — the one existing cause that honestly means "a PLAYER's attack reached
       * this connector's capacity": it bypasses the disruption-charge gate (the cast was the price),
       * attributes the sever to the caster (`severActor`), and the victim's toast reads
       * "<SEAT> BROKE YOUR BOND". A new cause would be a new discriminant on a serialized action —
       * a protocol change this branch may not make. ⚠ MINE, and one side effect is the owner's to
       * judge: 'raid' plays the player-sever SFX (`audioManager`), so a column that cuts three
       * connectors plays it three times.
       *
       * ⛔ S188 audit F1 — **THE SEVER IS RESOLVED INLINE, NOT DISPATCHED.** `dispatch` runs the
       * bench and elimination gates on any action carrying a `playerId`, and SEVER_BOND is `'deny'`
       * in both — policies written for a player's INTENTS. A caster eaten by the hunter (or whose
       * castle fell) between the cast and a column therefore had every connector the column broke
       * REFUSED: the pool drained, the connector stood, the overkill banked. This sever is not the
       * caster acting now; it is the CONSEQUENCE of damage that has already landed, the same thing
       * the column's creature arm does to units with no gate at all. So it goes straight to the one
       * sever reducer, `applySeverBond`, which still runs `canSeverBond` (a `'raid'` sever passes it,
       * by its own rule) and still does the topology split and the effects in order.
       */
      applySeverBond(world, { type: 'SEVER_BOND', bondId, playerId: caster, cause: 'raid' });
    }
  }

  /*
   * THE PHARAOH'S COLUMN, VERBATIM EXCEPT FOR THE SPARE. Same radius, same ladder number to both
   * arms, same `'aura'` source, and `null` for the attacker inside the helper (a column of light is
   * not somebody a unit can turn on). `sparePlayerId: caster` is the one change — see the file header.
   */
  applyRadialDamage(world, at.x, at.y, RA_COLUMN_RADIUS, RA_STRIKE_FIFTHS, RA_STRIKE_FIFTHS, 'aura', caster);
}
