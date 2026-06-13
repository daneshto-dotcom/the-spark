/**
 * SPARK — S87 P4: QUICK MATCH ready-gate + presence helpers (EAGER-safe).
 *
 * Split out of quickmatch.ts on purpose: hostHandlers.ts (wired at boot for the
 * friends lobby) consumes these, so they must NOT pull in the Trystero-importing
 * discovery code. This module imports only the cheap lobby-roster pure helpers +
 * transport's re-exported `selfId` (both already in the eager chunk), so the
 * heavy QuickmatchDiscovery stays in the lazy quickmatch.ts.
 *
 * All functions here are pure or thin orchestration (no Trystero, no timers).
 * Unit-tested in quickmatch.test.ts.
 */

import { buildLobbyRoster, reconcileLobbySeats } from './lobbyRoster.ts';
import type { RosterEntry } from './protocol.ts';
import type { NetSession } from './session.ts';
import { selfId, type NetTransport } from './transport.ts';

/**
 * Host-side START GATE. True iff worth auto-beginning: ≥2 players present, the
 * host (self) is ready, AND every CURRENTLY-SEATED peer is ready. Intersecting
 * with `seatByPeer` (the live seat-map) is what makes a departed peer's stale
 * ready bit unable to wedge OR falsely satisfy the gate (Council F4 #5).
 */
export function isQuickmatchAllReady(
  seatByPeer: ReadonlyMap<string, number>,
  readyPeers: ReadonlyMap<string, boolean>,
  selfReady: boolean,
): boolean {
  const total = seatByPeer.size + 1; // + the host
  if (total < 2) return false;
  if (!selfReady) return false;
  for (const peerId of seatByPeer.keys()) {
    if (readyPeers.get(peerId) !== true) return false;
  }
  return true;
}

/**
 * Attach ready flags to a lobby roster for the LOBBY_PRESENCE broadcast. Seat 0
 * (the host) gets `selfReady`; each remote seat gets its recorded flag (default
 * false). Friends-lobby callers never invoke this, so their roster stays
 * byte-identical (the additive `ready` field is simply absent).
 */
export function rosterWithReady(
  roster: readonly RosterEntry[],
  readyPeers: ReadonlyMap<string, boolean>,
  selfReady: boolean,
  hostSelfId: string,
): RosterEntry[] {
  return roster.map((e) => ({
    ...e,
    ready: e.peerId === hostSelfId ? selfReady : readyPeers.get(e.peerId) === true,
  }));
}

/** {ready, total} from a roster's ready flags — for the "ready k/n" UI line. */
export function qmReadyCount(roster: readonly RosterEntry[]): { ready: number; total: number } {
  let ready = 0;
  for (const e of roster) if (e.ready === true) ready++;
  return { ready, total: roster.length };
}

/**
 * Rebuild + broadcast the host's lobby presence, attaching ready flags in a
 * quickmatch room. The SINGLE presence-broadcast path for the host: in a
 * friends lobby (session.quickmatch=false) it produces the exact base roster
 * the pre-S87 onPeerChange did (byte-identical), so only quickmatch rooms
 * carry the `ready` field.
 */
export function broadcastQmPresence(
  session: NetSession,
  transport: NetTransport,
  onPresence: (roster: readonly RosterEntry[]) => void,
): void {
  session.lobbySeats = reconcileLobbySeats(session.lobbySeats, transport.peerIds());
  const base = buildLobbyRoster(session.lobbySeats, selfId);
  const roster = session.quickmatch
    ? rosterWithReady(base, session.qmReadyPeers, session.qmSelfReady, selfId)
    : base;
  transport.send({ kind: 'LOBBY_PRESENCE', roster });
  onPresence(roster);
}

/** Host: if a quickmatch room is fully ready, fire the (idempotent) Begin. */
export function maybeQmAutoBegin(session: NetSession, onBegin: () => void): void {
  if (
    session.quickmatch &&
    isQuickmatchAllReady(session.lobbySeats, session.qmReadyPeers, session.qmSelfReady)
  ) {
    onBegin();
  }
}
