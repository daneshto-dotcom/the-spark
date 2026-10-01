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
 * ## ⛔ IT FALLS LIKE THE PHARAOH'S STRIKE — THE PATTERN, TIMING AND RADIUS ARE HIS, NOT COPIES
 *
 * `RA_COLUMN_COUNT` columns, one every `RA_COLUMN_TICKS`, over `RA_COLUMN_RADIUS`, landing at
 * `raColumnPos` and timed by `raColumnImpactTick` — every one imported from
 * `bossSkillsPharaohRitual.ts` / `constants.ts`. The Pharaoh centres it on himself and seeds it with
 * his id; a caster centres it on the aimed point and seeds it with the seat.
 *
 * ## ⭐⭐ S191 (owner) — BUT THE STRENGTH IS ITS OWN NOW: 35 A COLUMN, SPLIT
 *
 * > *"It destroys like a full fucking tower. Within one hit … each column that it does 30 damage it
 * > split right so if it hits a tower and an enemy at the same time then it split amongst those two …
 * > it's not like 30 to each thing in the vicinity … we can do it 35 per hit."*
 *
 * Until S191 this file said *"a retune of his ultimate retunes this one"*, and dealt his 300 to every
 * connector in the circle — so one column deleted a 5-connector tower (whole ladder 130) several times
 * over. Now a column deals `RA_PERK_STRIKE_FIFTHS` (**35**, `attackFifths(RA_PERK_COLUMN_ATK,
 * RA_PERK_COLUMN_PEN)`) **in total**, split across the targets it catches (`raSplitShares`), and a
 * STRUCTURE is ONE target however many of its connectors the circle covers (`raColumnTargets`).
 * ⭐⭐ S192 — the Pharaoh boss is no longer 300 either: his ritual lands through the same column
 * (`raColumn.ts`), and every column's number is `raColumnPoolFor` — 35, or 75 for a seat holding WRATH
 * OF RA (*"And also Pharaoh's become 75 … If the player chose that ability"*).
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
 *      inside the shared helper. ⭐ S191 — and `applyRadialDamage` is no longer called here at all:
 *      it hands ONE amount to every victim, and a split needs a share per target.
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
 * id order. ⭐ S191 — a column's targets are collected in full BEFORE any damage, then put in ONE
 * total order (squared distance to the column centre, then kind, then id — never `Map` order, never
 * `Math.hypot`), and that order alone decides who gets the remainder of the split. `world.creatures`
 * is never inserted into here, so nothing is born mid-strike (Council A5 does not apply).
 */

import { MAX_PLAYERS, RA_COLUMN_COUNT, RA_RITUAL_TICKS } from '../../constants.ts';
import type { PlayerId } from '../../types.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import type { World } from '../world.ts';
import { landRaColumn, RA_PERK_STRIKE_FIFTHS } from './raColumn.ts';
import { raAimPoint, raCastRefusal, type CastPowerOfRaAction } from './powerOfRaRules.ts';

/*
 * ⭐⭐ S192 — THE COLUMN ITSELF MOVED TO `raColumn.ts`, shared with the Pharaoh boss's ritual (one
 * implementation, one number: `raColumnPoolFor`). Re-exported here so every existing import keeps working.
 */
export { RA_PERK_STRIKE_FIFTHS, RA_WRATH_STRIKE_FIFTHS, raColumnPoolFor, raColumnTargets, raSplitShares, type RaColumnTarget } from './raColumn.ts';

/**
 * @deprecated S188's name for the column strength, kept only as a pure ALIAS of `RA_PERK_STRIKE_FIFTHS`
 * so an old import still compiles. ⛔ It is NOT a second strike, NOT a per-target number and NOT always
 * the number a column deals: a column deals `raColumnPoolFor(world, owner)` IN TOTAL, split — 35, or 75
 * for a seat holding WRATH OF RA (S192), the Pharaoh boss included. Read `raColumnPoolFor`. Safe to
 * delete once nothing imports it.
 */
export const RA_STRIKE_FIFTHS = RA_PERK_STRIKE_FIFTHS;

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
        // ⭐ S192 — the pool is the SEAT's (`raColumnPoolFor`): 35, or 75 once it holds WRATH OF RA.
        landRaColumn(world, { spare: seat, alliesOf: null, owner: seat, severCause: 'raid' }, raStrikeColumnPos(seat, k, strike, charge));
      }
    }
  }
}
