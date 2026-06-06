/**
 * SPARK — S70 P1: pure lobby/match seat-roster builder.
 *
 * The host is the seat authority: seat 0 = host (selfId), seats 1..N = the
 * connected remote peers in stable join order (transport.peerIds() = Set
 * insertion order), each mapped to PLAYER_COLORS[seat]. Capped at MAX_PLAYERS —
 * a 7th+ peer connecting before Begin is dropped (host-authoritative), the same
 * cap createBeginMatchHandler applies.
 *
 * Extracted as a PURE function (no transport, no Pixi) so it is unit-testable
 * without a live Trystero room — the hostHandlers/clientHandlers limitation,
 * resolved the same #test-via-pure-helper-export way as strategySummary.ts. Used
 * in TWO places to keep them byte-identical (Council DRY):
 *   - createBeginMatchHandler (hostHandlers.ts) — the AUTHORITATIVE roster shipped
 *     at Begin via START_GAME_SIGNAL.
 *   - the S70 P1 lobby presence broadcast — the SAME formula derived live during
 *     the lobby on each peer join/leave, so a joiner's previewed seat matches the
 *     seat it will actually be assigned at Begin (both read peerIds() in order).
 */

import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';
import type { RosterEntry } from './protocol.ts';

export function buildLobbyRoster(
  peerIds: readonly string[],
  selfId: string,
): RosterEntry[] {
  // Host = seat 0; remote peers fill seats 1..MAX_PLAYERS-1 in join order. Any
  // peer beyond MAX_PLAYERS-1 remotes is sliced off — the host drops them at Begin.
  const peers = peerIds.slice(0, MAX_PLAYERS - 1);
  return [
    { seat: 0, peerId: selfId, color: PLAYER_COLORS[0] },
    ...peers.map((pid, i) => ({ seat: i + 1, peerId: pid, color: PLAYER_COLORS[i + 1] })),
  ];
}
