/**
 * SPARK — S188 (scope amendment, `s188/swarm`) — **THE SWARM**, the vampires level-10 racial: the bat
 * tower emits the BAT SWARM from now on.
 *
 * > *"it upgrades the regular tier three bat tower at level 10, if we choose it, to become bat swarm,
 * > to generate and create bat swarms … this will be the level 10 vampire racial upgrade."* and, on
 * > the stats, *"whatever we did for the piranha … this has to be double that … Whatever we did for
 * > the piranha, we double that."* — owner, S187
 *
 * The stat line lives with the other configs (`T3_BAT_SWARM_STATS` / `THE_SWARM_STAT_MUL` in
 * `voltkin-config.ts`); the size with the other sprite multipliers (`creatureSpriteScaleMul` in
 * `render/towerFrames.ts`). This leaf is only the PAIR the rule promotes and the perk that gates it.
 *
 * ## ⛔ NOT A SECOND PROMOTION PATH
 *
 * APEX PREDATOR already routes BOTH of a tier-3 tower's emit sites (the free trickle in `hostTick` and
 * the fed unit in `applyFeedTower`) through ONE function, `towerUnitForSeat` in `apexPredator.ts`, for
 * the reason that file gives: a promotion wired into only one site is green in every test that
 * exercises the other. THE SWARM is a second ARM of that same function, not a copy of it — so the two
 * emit sites needed no edit at all, and cannot disagree about a bat.
 *
 * ⚠ "FROM NOW ON" IS FREE for the same reason as the piranha: the promotion is decided at the EMIT, so
 * bats already on the board when the pick is taken stay bats.
 *
 * ⚠ THE RACE CHECK IS THE PERK'S: `seatHoldsPerk` requires the SEAT to be vampires AND its wave-11
 * pick (draft index 2) to be `'racial'`. A vampire seat that took the general at wave 11 — or any seat
 * of another race — never promotes.
 *
 * Pure leaf: type imports only.
 */

import type { CreatureType } from '../creatures/creature.ts';
import type { RacialPerkId } from '../racialPerks.ts';

/** The unit the perk promotes, what it promotes it to, and the perk that does it. */
export const THE_SWARM_FROM: CreatureType = 't3Bat';
export const THE_SWARM_TO: CreatureType = 't3BatSwarm';
export const THE_SWARM_PERK: RacialPerkId = 'vampires.l10';
