/**
 * SPARK — S188 — THE HORDE GROWS (orcs L5).
 *
 * > *"the goblin towers allow 20 instead of 10. And also your castle generates the base unit twice
 * > as fast."* — owner, S187 (canon §3d)
 *
 * Two numbers, both his, read at the two places that already own them:
 *
 *  · **The goblin ceiling, 10 → 20, for that seat's goblin towers.** `underGoblinCaps`
 *    (`creatures/creatureLifecycle.ts`) is the ONE gate a goblin passes — both the feed reducer's
 *    pre-debit check and `applySpawnCreature`'s authoritative re-check call it — so the cap is
 *    resolved there, per spawner, through `goblinCapPerSpawner` below. ⚠ The ceiling is RAISED,
 *    never removed: canon §3d records it as load-bearing (goblins are `persistent`, they never age
 *    out), and the shared `GOBLIN_MAX_GLOBAL` backstop is untouched.
 *  · **The castle's own unit, twice as fast.** `raceUnitEmit.ts` asks `castleEmitIntervalTicks`
 *    for its seat's interval; the cadence stays a pure function of `(seat, tick)` and stays
 *    phase-spread by seat. Half of 30 s is 15 s, and every 30-s emission tick is also a 15-s one,
 *    so a seat that takes the perk mid-match keeps its phase and simply gains the ticks in between.
 *
 * ⚠ MINE: "goblin towers" means spawners whose recipe is `'goblinTower'` — the tier-3 race towers are
 * already limitless (R158/R159) and a tier-9 tower emits one boss, so neither is touched.
 *
 * No new field, no wire change, no hash change: the perk is read from `Player.draftPicks`, which is
 * serialized and hashed, and both numbers are derived from it on every peer.
 */

import { GOBLIN_MAX_PER_SPAWNER, RACE_UNIT_EMIT_INTERVAL_TICKS } from '../../constants.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import type { World } from '../worldTypes.ts';
import type { SpawnerId } from '../../types.ts';

/** ⭐ OWNER, S187 — THE HORDE GROWS: *"the goblin towers allow 20 instead of 10"*. */
export const HORDE_GOBLIN_MAX_PER_SPAWNER = 20;

/** ⭐ OWNER, S187 — *"your castle generates the base unit twice as fast"*. */
export const HORDE_CASTLE_EMIT_SPEEDUP = 2;

type Seat = { readonly raceId: RaceId; readonly draftPicks: readonly DraftPick[] } | undefined;

/** The live-goblin ceiling for one spawner: 20 for a holding seat's goblin tower, 10 otherwise. */
export function goblinCapPerSpawner(world: World, sourceSpawnerId: SpawnerId): number {
  const sp = world.creatureSpawners.get(sourceSpawnerId);
  if (sp === undefined || sp.recipeId !== 'goblinTower') return GOBLIN_MAX_PER_SPAWNER;
  const owner = world.players.get(sp.ownerPlayerId);
  return owner !== undefined && seatHoldsPerk(owner, 'orcs.l5')
    ? HORDE_GOBLIN_MAX_PER_SPAWNER
    : GOBLIN_MAX_PER_SPAWNER;
}

/** The castle's race-unit interval for this seat: 30 s, or 15 s with THE HORDE GROWS. */
export function castleEmitIntervalTicks(player: Seat): number {
  return player !== undefined && seatHoldsPerk(player, 'orcs.l5')
    ? RACE_UNIT_EMIT_INTERVAL_TICKS / HORDE_CASTLE_EMIT_SPEEDUP
    : RACE_UNIT_EMIT_INTERVAL_TICKS;
}
