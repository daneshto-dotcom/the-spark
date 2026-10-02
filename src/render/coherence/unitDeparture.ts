/**
 * SPARK — S194 T9 COHERENCE · **ONE ANSWER TO "DID THAT UNIT DIE?", SHARED BY EVERY RENDERER THAT ASKS.**
 *
 * Owner, S194: *"you … should have everything more … consistent and … cohesive and mindful of each other
 * and coherent."*
 *
 * A creature leaves `world.creatures` on the tick its pool empties, so no renderer ever SEES a death — it
 * sees an id go missing and has to decide what that meant. Before this file four renderers each decided on
 * their own, and they disagreed:
 *
 * | consumer | expiry (last seen DESPAWNING) | mass clear (match reset) | inside the fog |
 * |---|---|---|---|
 * | `creatureRenderer` Voltkin zap | quiet ✓ | quiet (PLAYING guard) ✓ | quiet ✓ |
 * | `chewerRenderer` goo splat | quiet ✓ | quiet ✓ | quiet ✓ |
 * | `damageNumbers` killing-blow number | ⛔ **printed a red number** | ⛔ **printed one per unit** | ⛔ **printed through the fog** |
 * | the new death beat (`unitDeathFx`) | — | — | — |
 *
 * Measured on master `18560cd8` before this file: a Voltkin whose lifetime ran out printed a red **"40"**
 * as if something had killed it, and a match reset with five goblins on the board printed five "30"s.
 * The structure path of the same file had been fixed for exactly the mass-clear case in S182
 * (`structureWatchEpoch`); the creature path beside it had not — two siblings in one file, one fixed.
 *
 * ⭐ THE RULE, IN ONE PLACE. A departure is a **kill** only when all four hold:
 *   1. the creature was last seen in a live state — `DESPAWNING` is the lifecycle's own fade-out, and a
 *      unit that ran it out did not die, it left (S104 P1's discriminator, now shared, not copied);
 *   2. the match is being played (`gameState === 'PLAYING'`) — a title return is not a massacre;
 *   3. no mass clear happened since it was last seen (`world.structureWatchEpoch`, which every
 *      `world.creatures.clear()` site that is not a snapshot rebuild already bumps — S182);
 *   4. the local player is entitled to see the spot (`isConcealed`, owner S170: *"You shouldn't see
 *      anything in their zone"*) — the rule `healthBar`, `effectsRenderer` and both death watchers apply.
 *
 * ⛔ `src/render/coherence/unitDeath.census.test.ts` counts the production call sites of
 * `classifyCreatureDeparture` and pins them, and it fails if a render file grows its own
 * private DESPAWNING vanish test instead of calling this one. The one T2-owned renderer that still
 * carries a private copy (`chewerRenderer`) is allow-listed BY NAME there, so routing it to this helper is a
 * one-line change the merge owner can make and the census will notice. (`goblinRenderer`'s corpse has no
 * departure test at all — it plays its `die` row on any removal; routed, not allow-listed.)
 *
 * ⭐ S194 T9 AUDIT — THREE MORE WAYS TO LEAVE THAT ARE NOT DEATHS, each named by the synced state that
 * proves it (the audit's F1-F3):
 *   · `'swept'`     — the endgame pants removed at the FIGHT→BUILD edge (`removeEndgameMonsters`, owner S193:
 *                     *"they vanish when this wave ends"*). Proof: a pants type, and `matchPhase` is BUILD.
 *   · `'detonated'` — a `selfExplode` unit (lightning drone, sapper goblin) deleted itself in its own blast.
 *                     The blast draws the event; a beat and a number equal to its own pool would be a kill
 *                     nobody made. See `DETONATION_KILL_MATCH_PX` for the one ambiguity.
 *   · `'expired'`   — now only once the lifetime has actually run out (`despawnAtTick`, synced since S134),
 *                     so a unit KILLED during its 60-tick fade-out is still a kill.
 *
 * RENDER-ONLY. Every input is synced state every peer already holds; nothing is written. No bump.
 */

import type { CreatureState, CreatureType } from '../../state/creatures/creature.ts';
import { getCreatureConfig } from '../../state/creatures/voltkin-config.ts';
import { isPantsType } from '../../state/endgameMonsters.ts';
import type { World } from '../../state/world.ts';
import { NET_SNAPSHOT_HZ, PHYSICS_HZ } from '../../constants.ts';
import type { PlayerId } from '../../types.ts';
import { isConcealed } from '../concealment.ts';

/** What a vanished creature's departure was. Only `'killed'` earns a death beat or a killing-blow number. */
export type CreatureDeparture = 'killed' | 'expired' | 'swept' | 'detonated' | 'offstage' | 'concealed';

/**
 * One snapshot interval in ticks (6 at 60 Hz / 10 Hz) — the slack on the expiry test. A joiner sees the
 * removal on the first snapshot at or after `despawnAtTick`, the host on that tick exactly; a kill landing
 * inside the last interval before the lifetime ends is therefore read as an expiry. ⚠ Accepted: 0.1 s.
 */
export const DEPARTURE_EXPIRY_SLACK_TICKS = Math.max(1, Math.round(PHYSICS_HZ / NET_SNAPSHOT_HZ));

/**
 * ⚠ THE DETONATION AMBIGUITY, stated at its constant. A `selfExplode` unit leaves the map the same way
 * whether it blew itself up or was shot down: it is simply gone. The HOST can tell them apart — a lethal
 * blow writes a `world.creatureKillHits` record at the victim (same owner, within this radius, the
 * `damageNumbers` match radius) — so a shot-down sapper there is still `'killed'`. A JOINER has no record
 * (host-local, never on the wire), so on a peer a shot-down sapper or drone reads as `'detonated'`: no beat,
 * no killing-blow number. Closing that needs a wire field, which a cosmetic does not earn.
 */
export const DETONATION_KILL_MATCH_PX = 40;

/** The last observation a watcher kept of a creature before it vanished. */
export interface CreatureLastSeen {
  readonly state: CreatureState;
  /** ⭐ S194 T9 audit — the type (pants sweep, selfExplode) and the synced lifetime end (expiry). */
  readonly type: CreatureType;
  readonly despawnAtTick: number;
  readonly x: number;
  readonly y: number;
  readonly owner: PlayerId;
}

/**
 * Classify a creature that was in `world.creatures` last frame and is not now.
 *
 * ⚠ The mass-clear case (rule 3) is not decided here, because it needs the watcher's own memory of the
 * epoch: a watcher drops its whole map when `world.structureWatchEpoch` moves (see `CreatureWatchEpoch`),
 * so a cleared creature never reaches this function at all.
 */
export function classifyCreatureDeparture(world: World, last: CreatureLastSeen): CreatureDeparture {
  if (last.state === 'DESPAWNING' && world.tick >= last.despawnAtTick - DEPARTURE_EXPIRY_SLACK_TICKS) return 'expired';
  if (world.gameState !== 'PLAYING') return 'offstage';
  if (isPantsType(last.type) && world.matchPhase === 'BUILD') return 'swept';
  if (getCreatureConfig(last.type).selfExplode && !hostKillRecordNear(world, last)) return 'detonated';
  if (isConcealed(last.x, last.y, last.owner)) return 'concealed';
  return 'killed';
}

function hostKillRecordNear(world: World, last: CreatureLastSeen): boolean {
  const r2 = DETONATION_KILL_MATCH_PX * DETONATION_KILL_MATCH_PX;
  for (const h of world.creatureKillHits) {
    if (h.owner !== last.owner) continue;
    const dx = h.pos.x - last.x;
    const dy = h.pos.y - last.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/**
 * ⭐ S194 T9 audit — the ids in `watched` that are no longer `live`, ASCENDING: every watcher judges a frame's
 * departures in one total order (never Map insertion order), so which beats survive a cap is the same on every
 * screen. Filters first and sorts only the departures — a frame usually has none, so the per-frame cost is one
 * pass over the watch, not a sort of it.
 */
export function departedInIdOrder<K, V>(watched: ReadonlyMap<K, V>, isLive: (id: K) => boolean): K[] {
  const out: K[] = [];
  for (const id of watched.keys()) if (!isLive(id)) out.push(id);
  if (out.length > 1) out.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  return out;
}

/**
 * Rule 3 as a tiny latch every creature watcher owns one of. `moved(world)` is true exactly once per mass
 * clear, and the watcher answers it by dropping its map WITHOUT emitting anything.
 */
export class CreatureWatchEpoch {
  private seen: number | null = null;

  moved(world: World): boolean {
    const now = world.structureWatchEpoch;
    if (this.seen === null) {
      this.seen = now;
      return false;
    }
    if (now === this.seen) return false;
    this.seen = now;
    return true;
  }
}
