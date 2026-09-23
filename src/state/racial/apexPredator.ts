/**
 * SPARK — S188 — **APEX PREDATOR**, the nagas level-5 racial: the piranha tower emits the ELITE
 * piranha from now on.
 *
 * > *"upgrade the tier three piranha into a big one ... the stats will be like three times stronger
 * > than a regular piranha unit. So all the stats you take and you just triple them"* and
 * > *"two times bigger than the current piranha"* — owner
 *
 * The stat line lives with the other configs (`T3_PIRANHA_ELITE_STATS` in `voltkin-config.ts`); the
 * size lives with the other sprite multipliers (`creatureSpriteScaleMul` in `render/towerFrames.ts`).
 * This leaf is only the RULE: which creature a tier-3 tower emits for which seat.
 *
 * ## ⛔ THE TOWER HAS TWO EMIT SITES, AND BOTH ASK THIS ONE FUNCTION
 *
 * The free trickle (`hostTick`'s race-tower arm, S168) and the fed unit (`applyFeedTower`, S166)
 * both used to read `RACE_TOWER_UNIT[race]` directly. A promotion wired into only one of them would
 * give a naga seat elites from the trickle and ordinary piranhas for every shape it fed — green in
 * every test that exercised the other path. So both call `towerUnitForSeat`, and the test file pins
 * both through their real entry points.
 *
 * ⚠ "FROM NOW ON" IS FREE: the promotion is decided at the EMIT, so piranhas already on the board
 * when the perk is taken are untouched — the draft's own rule, with nothing to write for it.
 *
 * ⚠ THE RACE CHECK IS THE PERK'S, NOT THE TOWER'S. `seatHoldsPerk` requires the SEAT to be nagas, so
 * a seat of another race that picked its own racial never promotes, whatever tower it stands on.
 *
 * Pure leaf over `World` reads: no recipe import (the S144 side-effect trap `raceTowerIds.ts` states).
 */

import type { CreatureType } from '../creatures/creature.ts';
import type { PlayerId } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { playerHoldsPerk } from '../draftEvent.ts';
// ⭐ S188 THE SWARM (vampires level 10) — the second arm of this same rule; see `theSwarm.ts`.
import { THE_SWARM_FROM, THE_SWARM_PERK, THE_SWARM_TO } from './theSwarm.ts';

/** The unit the perk promotes, and what it promotes it to. */
export const APEX_PREDATOR_FROM: CreatureType = 't3Piranha';
export const APEX_PREDATOR_TO: CreatureType = 't3PiranhaElite';

/**
 * ⭐ THE ONE RULE: what a tier-3 tower owned by `owner` emits when its race's unit is `base`.
 * The piranha (APEX PREDATOR, `nagas.l5`) and the bat (THE SWARM, `vampires.l10`) are promoted when
 * the seat holds their perk; every other type passes through unchanged. The two arms cannot overlap:
 * each base belongs to one race, and each perk requires that race.
 */
export function towerUnitForSeat(world: World, owner: PlayerId, base: CreatureType): CreatureType {
  if (base === APEX_PREDATOR_FROM) {
    return playerHoldsPerk(world, owner, 'nagas.l5') ? APEX_PREDATOR_TO : base;
  }
  if (base === THE_SWARM_FROM) {
    return playerHoldsPerk(world, owner, THE_SWARM_PERK) ? THE_SWARM_TO : base;
  }
  return base;
}
