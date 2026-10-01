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
 * (`RACE_TOWER_UNIT.orcs`), and the seat's Warlords (`T9_BOSS_TYPE.orcs`) — ⚠ S191: the Warlord is an orc
 * racial TYPE (a source), but the frenzy RAISES only the other two; see point 1 below.
 * ⚠ MINE: the Warlord's DIREWOLVES are not orcs and are not included; neither are goblins, chewers,
 * drones or the Voltkin.
 *
 * ## ⛔ A WARLORD'S OWN RAGE LATCH IS NEVER TOUCHED BY THE FRENZY — and there are TWO ways to break it
 *
 * `runWarlordRage` latches a Warlord's own rage (R149/R151/S179 fired it on his health and cleared it on a
 * heal; ⛔ S191 SUPERSEDED that exit — he fires below half and his rage ends on a 25 s CLOCK,
 * `WARLORD_RAGE_TICKS`, not on a heal). The frenzy shares the `enraged` bit with it, so:
 *
 *  1. **The frenzy NEVER TOUCHES a Warlord.** ⭐⭐ S191 (owner): *"I don't think each warlord should be
 *     able to enrage the other warlord. Yes, the warlord enrages all the orc units, but still rage for
 *     himself is … warlord specific."* Until S191 it could SET one (a healthy second Warlord raged with
 *     the first); now a Warlord rages only by his own 25 s clock, and when a second Warlord enters his
 *     own rage he frenzies the orc units, not the first Warlord. It never CLEARS one either: a frenzy
 *     clear that swept every orc racial type would have calmed a Warlord his OWN latch holds furious.
 *  2. **A frenzy-raged Warlord is never a SOURCE of the frenzy**, or two Warlords would keep each other
 *     raging forever once the real one died. ⭐ S191: so a source is read off HIS OWN 25-SECOND CLOCK
 *     (`Creature.rageStartTick`, stamped only by his latch), not off the shared bit alone. Until S191
 *     it was read off his health (`enraged` AND below `WARLORD_RAGE_TRIGGER_PCT`), which equalled his
 *     latch only while nothing could heal him; the clock makes the rage outlast a heal, so the health
 *     reading would have dropped his orcs while he still raged.
 *
 * ⚠ ORDER: this runs in `racial/racialTick.ts`'s FIGHT slot, AFTER `runWarlordRage` in the same tick,
 * so the latch has already spoken for this tick's health when the frenzy reads it; units it enrages
 * act on it from the next tick's strike batch. A Warlord killed this tick (`ehp <= 0`, awaiting the
 * sweep) is not a source. Each creature's write depends only on its own seat's source set, so `Map`
 * order decides nothing.
 */

import { seatHoldsPerk } from '../racialPerks.ts';
import { RACE_TOWER_UNIT } from '../raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { isOwnRageActive, type Creature, type CreatureType } from '../creatures/creature.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId } from '../../types.ts';

/** ⛔ The ORC RACIAL creature types. A goblin is NOT one — any race can build a goblin tower. */
export function isOrcRacialCreatureType(type: CreatureType): boolean {
  return type === 'raceUnit' || type === RACE_TOWER_UNIT.orcs || type === T9_BOSS_TYPE.orcs;
}

/**
 * Is this Warlord raging BY HIS OWN LATCH — i.e. can he start the frenzy? See the module docblock,
 * point 2: the shared bit alone would let a frenzy-raged Warlord sustain the frenzy.
 *
 * ⭐⭐ S191 (owner) — READ OFF HIS OWN 25-SECOND CLOCK, NOT OFF HIS HEALTH. The rage now lasts 25 s
 * *regardless of healing*, so a Warlord healed back over the line mid-rage is still raging by his own
 * latch — and his orcs must rage with him. `Creature.rageStartTick` is stamped ONLY by
 * `runWarlordRage`, never by the frenzy, so point 2 holds by construction: a frenzy-raged Warlord has
 * no live window of his own and is not a source. (Pre-S191 this read `ehp < 50 %`, which was equal to
 * his own latch only while no heal could move him.) ⛔ Council (S191 ledger, accepted): it means "his
 * own 25 s window is open" and NOTHING else — not the HP test, and not the bare `enraged` bit, which the
 * frenzy itself writes.
 */
export function isFrenzySource(c: Creature, tick: number): boolean {
  if (c.type !== T9_BOSS_TYPE.orcs) return false;
  if (c.ehp <= 0) return false;
  return isOwnRageActive(c, tick);
}

/** One FIGHT tick of BLOOD FRENZY, for every orc seat that holds it. */
export function runBloodFrenzy(world: World): void {
  const holders = new Set<PlayerId>();
  for (const [id, pl] of world.players) if (seatHoldsPerk(pl, 'orcs.l0')) holders.add(id);
  if (holders.size === 0) return;

  const raging = new Set<PlayerId>();
  for (const c of world.creatures.values()) {
    if (holders.has(c.ownerPlayerId) && isFrenzySource(c, world.tick)) raging.add(c.ownerPlayerId);
  }

  for (const c of world.creatures.values()) {
    if (!holders.has(c.ownerPlayerId)) continue; // ownership …
    if (!isOrcRacialCreatureType(c.type)) continue; // … AND type — a goblin stops here
    const on = raging.has(c.ownerPlayerId);
    // ⭐⭐ S191 (owner) — A WARLORD IS NEVER RAISED BY THE FRENZY: *"I don't think each warlord should be
    // able to enrage the other warlord … rage for himself is … warlord specific."* His bit is his own
    // latch's alone (`runWarlordRage`), so the frenzy does not touch it at all — neither sets nor clears.
    if (c.type === T9_BOSS_TYPE.orcs) continue;
    if (on) c.enraged = true;
    else if (c.enraged === true) c.enraged = false;
  }
}
