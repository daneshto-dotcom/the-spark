/**
 * SPARK — S188 — HELLSPAWN's LOOK (`demons.l5`): *"the pencil chewers and the pentagram become
 * demonic"* (owner, S187). Render-only, DERIVED every frame from synced state, never pushed.
 *
 * · A chewer is drawn demonic when its OWNER holds `demons.l5` (`draftPicks` + `raceId`, both on the
 *   wire) or when it is a split child (`hellspawnGen`, on the wire). A child is drawn SMALLER by its
 *   generation, so the split reads on screen.
 * · That seat's pentagram sprite takes a red tint.
 *
 * ⚠ ALL OF IT IS MINE — a red/black placeholder "until he supplies art" (S188 PDR §2). The colours,
 * the tint and the two scales are cosmetic dials, and changing them touches nothing in the sim.
 *
 * ⚠ TOLERANT OF A PARTIAL PLAYER: a renderer can be handed a world whose seat record predates the
 * draft (old fixtures, a stale peer's first frame), so a missing `draftPicks` reads as "not demonic"
 * rather than throwing inside the frame loop.
 */

import { seatHoldsPerk } from '../state/racialPerks.ts';
import type { RaceId } from '../state/races.ts';
import type { DraftPick } from '../state/draft.ts';

interface SeatLike {
  readonly raceId?: RaceId;
  readonly draftPicks?: readonly DraftPick[];
}

/** Does `owner` hold HELLSPAWN? The render-side mirror of the sim's own question. */
export function isDemonicSeat(players: ReadonlyMap<unknown, SeatLike>, owner: unknown): boolean {
  const p = players.get(owner);
  if (p === undefined || p.raceId === undefined || p.draftPicks === undefined) return false;
  return seatHoldsPerk({ raceId: p.raceId, draftPicks: p.draftPicks }, 'demons.l5');
}

/** ⚠ MINE — a split child's drawn size: generation 1 at 0.8×, generation 2 at 0.62×. */
export function hellspawnScale(gen: 1 | 2 | undefined): number {
  return gen === 1 ? 0.8 : gen === 2 ? 0.62 : 1;
}

/** ⚠ MINE — the demonic chewer palette: blood-red body, near-black ink, ember eyes. */
export const DEMON_BODY = 0x6b0f12;
export const DEMON_INK = 0x140305;
export const DEMON_INK_SOFT = 0x3d070b;
export const DEMON_EYE_WHITE = 0xffc27a;
export const DEMON_PUPIL = 0xff2a12;

/** ⚠ MINE — the sprite tint laid over a HELLSPAWN seat's pentagram. `0xffffff` is "no tint". */
export const DEMON_PENTAGRAM_TINT = 0xff5a4a;
