/**
 * SPARK — S188 — BLOOD FRENZY (orcs L0): WHEN YOUR WARLORD RAGES, YOUR ORCS RAGE WITH HIM.
 *
 * > *"Every time your orc warlord does rage … all your orc creatures, so any orc spawn on the screen
 * > that is currently playing also goes into rage … they move two times faster and they attack two
 * > times faster."* — owner, S187
 * >
 * > ⛔ *"Goblins do not enrage, right? We said enraging works only on orc units, any racial units.
 * > Goblins are not — goblins can be built by anyone … they don't change their colour and enrage like
 * > the orcs would."* — owner, S187 (canon §3d)
 *
 * ## ⭐ NO NEW FIELD — RAGE ALREADY IS ONE
 *
 * Rage is `Creature.enraged` read through `rageMultiplier` (move accel in `creatureVerlet.ts`, attack
 * cadence in `creatureLifecycle.ts`, the sprite tint and swing speed in `goblinRenderer.ts` — gated on
 * `enraged` ALONE, never on type). `enraged` is serialized and hashed for every creature, so writing
 * it on a race unit reaches every one of those consumers, on both peers, with nothing new on the wire.
 * The red tint FOLLOWS THE PREDICATE by construction: a goblin is never written, so it never tints.
 *
 * ## ⛔ THE PREDICATE IS OWNERSHIP **AND** TYPE
 *
 * Filtering by owner alone would enrage the seat's goblins, because they pass the ownership test —
 * canon §3d names this as *"the obvious implementation … the wrong one"*. The type test is the three
 * ORC RACIAL creatures: the castle's own unit (`raceUnit` of an orc seat), the orc tier-3 unit
 * (`RACE_TOWER_UNIT.orcs`), and the seat's other Warlords (`T9_BOSS_TYPE.orcs`).
 * ⚠ MINE: the Warlord's DIREWOLVES are not orcs and are not included; neither are goblins, chewers,
 * drones or the Voltkin.
 *
 * ## ⛔ A WARLORD'S OWN RAGE LATCH IS NEVER TOUCHED BY THE FRENZY — and there are TWO ways to break it
 *
 * `runWarlordRage` latches a Warlord's own rage on his health (R149/R151/S179). The frenzy shares the
 * `enraged` bit with it, so:
 *
 *  1. **The frenzy NEVER CLEARS a Warlord.** It may SET one (a healthy second Warlord rages with the
 *     first), but when the frenzy ends only `runWarlordRage` calms him — which it does on its own on
 *     the next tick if he is above the line. A frenzy clear that swept every orc racial type would
 *     have calmed a Warlord whose OWN latch holds him furious.
 *  2. **A frenzy-raged Warlord is never a SOURCE of the frenzy**, or two Warlords would keep each other
 *     raging forever once the real one died. So a source is read off his HEALTH, not off the shared
 *     bit alone: `enraged` AND strictly below `WARLORD_RAGE_TRIGGER_PCT` of his own max. ⚠ That equals
 *     his own latch because an orc Warlord's pool never rises — nothing an orc seat owns heals him
 *     (BLOOD DEBT is the vampires' perk, and R137 race-gates the tier-9 tower, so a vampire seat
 *     never owns a Warlord). If an orc healer is ever added, this line is the one to revisit,
 *     beside the note `constants.ts` already carries at `WARLORD_RAGE_TRIGGER_PCT`.
 *
 * ⚠ ORDER: this runs in `racial/racialTick.ts`'s FIGHT slot, AFTER `runWarlordRage` in the same tick,
 * so the latch has already spoken for this tick's health when the frenzy reads it; units it enrages
 * act on it from the next tick's strike batch. A Warlord killed this tick (`ehp <= 0`, awaiting the
 * sweep) is not a source. Each creature's write depends only on its own seat's source set, so `Map`
 * order decides nothing.
 */

import { WARLORD_RAGE_TRIGGER_PCT } from '../../constants.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { RACE_TOWER_UNIT } from '../raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { creatureMaxEhp, type Creature, type CreatureType } from '../creatures/creature.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId } from '../../types.ts';

/** ⛔ The ORC RACIAL creature types. A goblin is NOT one — any race can build a goblin tower. */
export function isOrcRacialCreatureType(type: CreatureType): boolean {
  return type === 'raceUnit' || type === RACE_TOWER_UNIT.orcs || type === T9_BOSS_TYPE.orcs;
}

/**
 * Is this Warlord raging BY HIS OWN LATCH — i.e. can he start the frenzy? See the module docblock,
 * point 2: the shared bit alone would let a frenzy-raged Warlord sustain the frenzy.
 */
export function isFrenzySource(c: Creature): boolean {
  if (c.type !== T9_BOSS_TYPE.orcs) return false;
  if (c.ehp <= 0 || c.enraged !== true) return false;
  return c.ehp * 100 < creatureMaxEhp(c) * WARLORD_RAGE_TRIGGER_PCT;
}

/** One FIGHT tick of BLOOD FRENZY, for every orc seat that holds it. */
export function runBloodFrenzy(world: World): void {
  const holders = new Set<PlayerId>();
  for (const [id, pl] of world.players) if (seatHoldsPerk(pl, 'orcs.l0')) holders.add(id);
  if (holders.size === 0) return;

  const raging = new Set<PlayerId>();
  for (const c of world.creatures.values()) {
    if (holders.has(c.ownerPlayerId) && isFrenzySource(c)) raging.add(c.ownerPlayerId);
  }

  for (const c of world.creatures.values()) {
    if (!holders.has(c.ownerPlayerId)) continue; // ownership …
    if (!isOrcRacialCreatureType(c.type)) continue; // … AND type — a goblin stops here
    const on = raging.has(c.ownerPlayerId);
    if (c.type === T9_BOSS_TYPE.orcs) {
      if (on) c.enraged = true; // point 1: SET only — his own latch is the only thing that calms him
      continue;
    }
    if (on) c.enraged = true;
    else if (c.enraged === true) c.enraged = false;
  }
}
