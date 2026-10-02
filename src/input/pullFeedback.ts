/**
 * ⭐ S193 P3-1 audit L1 — **A PULL YOUR OWN TOWER BLOCKS SAYS SO.**
 *
 * Since S193 the castle keep-out is one uniform 61 px disc (owner: *"a short radius … immediately
 * around it"*), so a player may build over his own porch, and a pull skips any slot a built shape
 * stands within `CASTLE_PORCH_KEEP_OUT_RADIUS` of. With every free slot covered that way the pull is a
 * silent no-op — the shape stays banked, nothing is lost, but the click did nothing. ⚠ MINE: the
 * existing refused-UI thud (`playUiRefusedSFX`, the cue every refused control already plays), not a new
 * effect. Client-side feedback only: the intent is still sent unchanged, the host stays authoritative,
 * and nothing here is simulated or hashed — so it owes no protocol bump of its own.
 */
import type { SparkType } from '../constants.ts';
import { bankCountOf, firstFreePorchSlot } from '../state/castleBank.ts';
import type { World } from '../state/worldTypes.ts';
import type { PlayerId } from '../types.ts';

/**
 * PURE — would `PULL_FROM_BANK` for `seat` / `sparkType` be a no-op BECAUSE built shapes cover the
 * porch? True only when the seat holds the shape, the porch WOULD have a free slot ignoring built
 * shapes, and has none counting them — the same `firstFreePorchSlot` the reducer reads, asked twice.
 * A porch merely full of already-pulled shapes is the old, unchanged no-op and is NOT this.
 */
export function pullBlockedByBuilt(world: World, seat: PlayerId, sparkType: SparkType): boolean {
  if (bankCountOf(world.castleBanks, seat, sparkType) <= 0) return false;
  const s = seat as unknown as number;
  const occupied = [...world.freeSparks.values()].map((sp) => sp.pos);
  if (firstFreePorchSlot(s, occupied, world.layout) === null) return false;
  const built = [...world.primitives.values()].map((p) => p.pos);
  return firstFreePorchSlot(s, occupied, world.layout, built) === null;
}

/**
 * The castle panel's pull click: send the intent as always, and play `refused` when the local world
 * says the porch is walled by built shapes. `refused` is injected so the cue is testable without audio.
 */
export function requestPull(
  world: World,
  sparkType: SparkType,
  send: (a: { type: 'PULL_FROM_BANK'; playerId: PlayerId; sparkType: SparkType }) => void,
  refused: () => void,
): void {
  if (pullBlockedByBuilt(world, world.localPlayerId, sparkType)) refused();
  send({ type: 'PULL_FROM_BANK', playerId: world.localPlayerId, sparkType });
}
