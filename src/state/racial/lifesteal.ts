/**
 * SPARK — S188 — BLOOD DEBT (vampires L0) and CRIMSON TIDE (vampires L5): LIFESTEAL.
 *
 * > *"all spawn have lifesteal. So every spawned unit will get lifesteal. They will heal 20% of each
 * > damage output. So let's say if a spawn has 20 a hit, then they would be healed by 4 HP every time
 * > they hit someone."* — owner, S187 (BLOOD DEBT)
 * >
 * > *"50% life steal for vampires at level five for all units it might be op but we'll see"*
 * > — owner, S187 (CRIMSON TIDE)
 *
 * ## ⭐ ONE CALL, AT THE TWO FUNNELS, SO NO STRIKE PATH CAN FORGET IT
 *
 * Every hit on an entity with a pool goes through `damageEntity`, and every hit on a building goes
 * through `damageConnector` (`state/damage.ts`). `applyLifesteal` is called from inside both, at the
 * point each arm's damage has actually LANDED — the retaliation precedent (`creatures/retaliation.ts`
 * is called from `damageEntity` and nowhere else, for the same reason). A tower swing (`ehp === null`),
 * an already-fallen castle, a zero amount, a missing target and a channelling Pharaoh all deal
 * nothing and therefore heal nothing: the call sits below each arm's early returns.
 *
 * ## THE ARITHMETIC — integer, floored, never below one (his standing floor-at-one rule)
 *
 *     heal = max(1, floor(amount × pct / 100))      capped at the attacker's own full pool
 *
 * > *"anything that doesn't ship as at least a whole number you just give him the lowest amount
 * > possible, which is one."* — owner, S187 (canon §3d)
 *
 * His example is exact on the ladder: a 20-fifth hit heals 4. A goblin's 12 heals 2 (2.4 floored),
 * the race unit's 6 heals 1 (1.2 floored), a 1-fifth hit heals 1 (0.2 → the floor-at-one).
 *
 * ## ⚠ THE CALLS THAT ARE MINE, NOT HIS
 *
 * - **"The hit's amount" is the amount SWUNG, not the amount absorbed** — overkill included. It is
 *   the number the damage floater prints for the same hit (`creatureKillHits`, `connectorBreakHits`
 *   and `structureKillHits` all record the requested amount), so the heal is 20 % of the number he
 *   reads. For the castle it is the amount before castle DEF, for the same reason.
 * - **Every creature the seat owns** — goblins, chewers, the Voltkin, the bosses, the castle's own
 *   unit. His words are *"every spawned unit"*. Helga is a DEFENDER, not a creature, and is not
 *   covered; neither is a turret beam, the castle gun, a player raid or any area blast (those pass a
 *   `null` or a defender attacker, and nobody is there to heal).
 * - **Capped at the attacker's own full pool** (`creatureMaxEhp`, the S187 draft-aware max). Never an
 *   overheal: `save.ts` emits `ehp` only while it is BELOW that max, so an over-max value would be
 *   written as nothing and rebuilt as the max on every peer — a silent divergence on a hashed field.
 * - **A dead attacker heals nothing.** Under the S155 N1 deferral a lethally-struck creature still
 *   lands its committed blow; it stays dead (`ehp <= 0`) and is swept at the end of the tick.
 *
 * ⛔⛔ S188 FIX ROUND F1 — **INSIDE THE STRIKE BATCH A HEAL IS SUMMED, NOT APPLIED.** Healing at the
 * moment a blow landed made a melee depend on `world.creatures` iteration order (the S155 N1 class):
 * the vampire reached first was topped up before the incoming blow and lived, the identical one a
 * slot later died. While `world.pendingLifestealFifths` is open (the host tick's batch) the heal is
 * accumulated there, and `applyPendingLifesteal` lands every sum — id order, capped, skipping the
 * dead and the pending-dead — just before the deferred sweep. Outside the batch it heals at once.
 *
 * ⛔ **L5 REPLACES L0, IT DOES NOT ADD.** *"50% life steal"* is the rate, so a seat holding both is at
 * 50, not 70 — and a seat holding L5 without L0 is at 50 too.
 *
 * No new field, no new wire, no new hash surface: it writes `Creature.ehp`, which is already
 * serialized and hashed, and the green heal number is the existing `damageNumbers.ts` rising-`ehp`
 * watch. The rule change itself is covered by the substrate's PROTOCOL 49 → 50.
 */

import { seatHoldsPerk } from '../racialPerks.ts';
import { creatureMaxEhp } from '../creatures/creature.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import type { World } from '../worldTypes.ts';
import type { CreatureId, DefenderId } from '../../types.ts';

/** ⭐ OWNER, S187 — BLOOD DEBT: *"They will heal 20% of each damage output."* */
export const BLOOD_DEBT_LIFESTEAL_PCT = 20;

/** ⭐ OWNER, S187 — CRIMSON TIDE: *"50% life steal for vampires at level five for all units"*. */
export const CRIMSON_TIDE_LIFESTEAL_PCT = 50;

/** The same shape `damage.ts`'s `DamageAttacker` has — restated so this leaf imports no reducer. */
type Attacker =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'defender'; readonly id: DefenderId }
  | null;

/**
 * The lifesteal percentage a seat's creatures carry: 50 with CRIMSON TIDE (it REPLACES BLOOD DEBT's
 * 20), 20 with BLOOD DEBT alone, 0 otherwise — including every seat of another race that took ITS
 * racial pick, which `seatHoldsPerk` answers by checking the race.
 */
export function lifestealPctFor(
  player: { readonly raceId: RaceId; readonly draftPicks: readonly DraftPick[] } | undefined,
): number {
  if (player === undefined) return 0;
  if (seatHoldsPerk(player, 'vampires.l5')) return CRIMSON_TIDE_LIFESTEAL_PCT;
  if (seatHoldsPerk(player, 'vampires.l0')) return BLOOD_DEBT_LIFESTEAL_PCT;
  return 0;
}

/**
 * PURE — the fifths a hit of `amountFifths` heals at `pct`. Integer by construction: floored, and
 * never below one on a real hit (the owner's floor-at-one rule). Zero for no hit or no perk.
 */
export function lifestealFifths(amountFifths: number, pct: number): number {
  if (amountFifths <= 0 || pct <= 0) return 0;
  return Math.max(1, Math.floor((amountFifths * pct) / 100));
}

/**
 * Heal the ATTACKER of a hit that has just LANDED. Called only from `damageEntity`'s arms and from
 * `damageConnector`, after the subtraction — never from a strike path directly.
 *
 * No-op for: a `null` or defender attacker, an attacker that is gone or already dead, a seat without
 * the perk, and an attacker already at its full pool.
 */
export function applyLifesteal(world: World, attacker: Attacker, amountFifths: number): void {
  if (attacker === null || attacker.kind !== 'creature') return;
  const a = world.creatures.get(attacker.id);
  if (a === undefined || a.ehp <= 0) return; // a dead attacker heals nothing
  const pct = lifestealPctFor(world.players.get(a.ownerPlayerId));
  if (pct === 0) return;
  const heal = lifestealFifths(amountFifths, pct);
  const pending = world.pendingLifestealFifths;
  if (pending !== null) {
    // S188 F1 — the batch is open: SUM it. No cap here — a unit at full pool that is struck later in
    // the same batch must get the same heal whichever order the two happened in.
    pending.set(a.id, (pending.get(a.id) ?? 0) + heal);
    return;
  }
  const max = creatureMaxEhp(a);
  if (a.ehp >= max) return; // never an overheal, and never LOWERS a pool that is somehow above it
  a.ehp = Math.min(max, a.ehp + heal);
}

/**
 * ⭐ S188 F1 — land the strike batch's accumulated heals. Called by `runHostTick` immediately BEFORE
 * `sweepDeferredDeaths`, so every blow of the tick has already landed.
 *
 * TOTAL ORDER by creature id (never `Map` order). Each sum is capped at the creature's own
 * `creatureMaxEhp`. A creature that is gone, at `ehp <= 0`, or in `pendingCreatureDeaths` is NOT
 * healed: it died this tick, and a heal must not raise it back over the line it was killed across.
 */
export function applyPendingLifesteal(world: World): void {
  const pending = world.pendingLifestealFifths;
  if (pending === null || pending.size === 0) return;
  const dying = world.pendingCreatureDeaths;
  const ids = [...pending.keys()].sort((x, y) => (x as number) - (y as number));
  for (const id of ids) {
    const c = world.creatures.get(id);
    if (c === undefined || c.ehp <= 0 || dying?.has(id) === true) continue;
    const max = creatureMaxEhp(c);
    if (c.ehp >= max) continue;
    c.ehp = Math.min(max, c.ehp + (pending.get(id) ?? 0));
  }
  pending.clear();
}
