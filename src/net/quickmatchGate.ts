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
  transport: NetTransport | null,
  onPresence: (roster: readonly RosterEntry[]) => void,
): void {
  // ⭐ S162 P1 — **THE TRANSPORT MAY LEGITIMATELY BE NULL, AND THE REPAINT STILL HAS TO HAPPEN.**
  //
  // Owner: *"i cant seem to change my player color(race) i click on it and it shows but it doesnt
  // change"*. `onPickRace` set `session.selfRace` and then skipped this function entirely behind a
  // `session.netTransport !== null` guard, so nothing ever called `onPresence` and the rack kept
  // painting `defaultRaceForSeat(0)` from `lobbyStateMachine`'s count-based fallback. The pick was
  // recorded and invisible — the worst of both.
  //
  // A host has no transport more often than it looks: before a room is opened, and after a failed
  // one (S162 P0 had `joinRoom` THROWING on a malformed ICE url, so `hostHandlers` never reached
  // its `session.netTransport = transport` line at all).
  //
  // ⛔ THE RECONCILE IS SKIPPED, NOT PASSED AN EMPTY LIST. `reconcileLobbySeats(prev, [])` is
  // documented as "departed peers fall away" — handing it `[]` because we happen to have no
  // transport handle would WIPE a live seat map. With no transport there are no peers to reconcile
  // against, so the previous map is already the truth.
  if (transport !== null) {
    const peerIds = transport.peerIds();
    session.lobbySeats = reconcileLobbySeats(session.lobbySeats, peerIds);
    // ⭐ S162 POST-AUDIT (F3) — PRUNE GHOST CLAIMS. `raceByPeer` had exactly one eraser in the whole
    // codebase (`resetNetSession`'s `clear()`), so a departed peer's claim went on locking its race
    // for the rest of the room — while `buildLobbyRoster` iterates `seatByPeer` only, so that peer
    // vanished from the rack and the picker drew its tile FREE and clickable. Click it and the host
    // refuses, silently: the "surface says yes, reducer says no" defect `racePicker.ts` and
    // `raceIsFree` both open by declaring must not exist.
    //
    // ⚠ KEYED ON THE TRANSPORT'S PEER LIST, NOT ON `lobbySeats`. A peer mid-join is connected but not
    // yet seated, and `raceIsFree`'s third loop exists precisely to honour a claim that arrives before
    // its seat — pruning by seat would delete the very claims that loop was written for.
    //
    // This mirrors `qmReadyPeers`, whose own docblock says a departed peer's stale flag "can never
    // wedge or trip the gate" because the auto-begin check intersects with the CURRENT lobbySeats.
    // `raceByPeer` had no such intersection; now it has an explicit one.
    const present = new Set(peerIds);
    for (const peer of [...session.raceByPeer.keys()]) {
      if (!present.has(peer)) session.raceByPeer.delete(peer);
    }
  }
  // ⭐ S161 P6 — the race claims ride the ONE presence path. `broadcastQmPresence` is documented
  // above as "The SINGLE presence-broadcast path for the host", which is precisely why the claims
  // are attached here and nowhere else: every route that tells peers about seats (join, leave,
  // readiness, and now a race pick) already funnels through this function, so there is no second
  // place a claim could be forgotten.
  const base = buildLobbyRoster(
    session.lobbySeats,
    selfId,
    session.raceByPeer,
    session.selfRace ?? undefined,
  );
  const roster = session.quickmatch
    ? rosterWithReady(base, session.qmReadyPeers, session.qmSelfReady, selfId)
    : base;
  // Only the WIRE half is conditional. `onPresence` is the local repaint and always runs, which is
  // what keeps the documented invariant honest: the rack is still painted from a roster and never
  // from an optimistic local guess — there is simply no wire to send it down.
  if (transport !== null) transport.send({ kind: 'LOBBY_PRESENCE', roster });
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
