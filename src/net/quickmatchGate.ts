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

import { buildLobbyRoster, reconcileLobbySeats, withSlots, withTeams } from './lobbyRoster.ts';
import type { HostPhase, RosterEntry } from './protocol.ts';
import type { NetSession } from './session.ts';
import { selfId, type NetTransport } from './transport.ts';
import type { GameState } from '../state/worldTypes.ts';
import { teamsPlayable } from '../state/teams.ts';

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
 *
 * ⭐ S191 (NETFR-1) — `gameState` is REQUIRED so no caller can forget it: the beacon now says where the
 * host IS (`hostPhaseOf`) and which match it is in (`session.matchId`), because it is sent on every peer
 * join in ANY state and a rejoining client must be able to tell a lobby from a live match whose tab is
 * hidden. The local repaint is unchanged.
 */
export function broadcastQmPresence(
  session: NetSession,
  transport: NetTransport | null,
  onPresence: (roster: readonly RosterEntry[], countdownMs?: number) => void,
  gameState: GameState,
  now: number = Date.now(),
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
  // one.
  //
  // ⛔ S163 P2 — **THE EXAMPLE THAT STOOD HERE NAMED A CAUSE THAT CANNOT HAPPEN**, and it is
  // corrected in place rather than deleted, because a wrong root cause in a docblock is what the
  // next session reasons from. It said S162 P0's `joinRoom` throw left `session.netTransport`
  // unassigned. Both halves are false, independently:
  //
  //   · THE ASSIGNMENT PRECEDES THE CONNECT. `hostHandlers.ts` sets `deps.session.netTransport =
  //     transport` ~25 lines BEFORE it calls `transport.connect(code)`; `clientHandlers.ts` does the
  //     same. A throw inside the join could not unwind an assignment that had already happened.
  //   · AND THE JOIN ITSELF CANNOT THROW OUT OF `connect()`. `transport.ts` wraps the `joinFn`
  //     call in a `try` whose `catch` calls `markStrategyFailed` — a failed strategy is a
  //     diagnostics row, not an exception. (⚠ S163 CHECK: that is the JOIN half only. `connect()`
  //     is not blanket non-throwing, and `send()` throws outright when disconnected — which is
  //     why both halves at the bottom of this function are wrapped.)
  //
  // ⭐ THE FIX ABOVE IS STILL CORRECT AND THE REPAINT IS STILL REAL; only the stated mechanism was
  // wrong. The live cause of the owner's *"it shows but it doesnt change"* was the GHOST RACE CLAIM
  // — `raceByPeer` was never pruned on departure, so a departed peer's claim locked a race while the
  // picker (built from `seatByPeer`) still drew the tile free and clickable. That is fixed by the
  // prune below, not by this guard. The genuine null-transport cases are the ordinary ones: before a
  // room is opened, and in the vs-bots setup, which has no transport at all.
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
    // ⭐ S192 — and a departed peer's TEAM pick, for the same reason.
    for (const peer of [...session.teamByPeer.keys()]) {
      if (!present.has(peer)) session.teamByPeer.delete(peer);
    }
    // ⭐ S195 (N16) — and a departed peer's board slot.
    for (const peer of [...session.slotByPeer.keys()]) {
      if (!present.has(peer)) session.slotByPeer.delete(peer);
    }
  }
  // ⭐ S161 P6 — the race claims ride the ONE presence path. `broadcastQmPresence` is documented
  // above as "The SINGLE presence-broadcast path for the host", which is precisely why the claims
  // are attached here and nowhere else: every route that tells peers about seats (join, leave,
  // readiness, and now a race pick) already funnels through this function, so there is no second
  // place a claim could be forgotten.
  // ⭐ S192 — the team picks ride the same one presence path as the race claims.
  // ⭐ S195 (N16) — and the host's board-slot arrangement, on the same one path.
  const base = withSlots(withTeams(
    buildLobbyRoster(session.lobbySeats, selfId, session.raceByPeer, session.selfRace ?? undefined),
    session.teamByPeer,
    session.selfTeam,
    selfId,
  ), session.slotByPeer, session.selfSlot, selfId);
  const roster = session.quickmatch
    ? rosterWithReady(base, session.qmReadyPeers, session.qmSelfReady, selfId)
    : base;
  /*
   * Only the WIRE half is conditional. `onPresence` is the local repaint and always runs, which is
   * what keeps the documented invariant honest: the rack is still painted from a roster and never
   * from an optimistic local guess — there is simply no wire to send it down.
   *
   * ⭐ S163 P8 — REPAINT FIRST, THEN SEND, and EACH HALF IS ISOLATED. The send used to come
   * first, which put the unconditional local repaint downstream of a network call: `transport.send`
   * genuinely throws when the transport is disconnected (`transport.ts` — and `session.netTransport`
   * stays non-null across a `disconnect()` during a reconnect cycle), so a throw there skipped the
   * repaint and reproduced the exact S162 P1 symptom this function exists to prevent (*"i click on
   * it and it shows but it doesnt change"*).
   *
   * ⛔ S163 CHECK — REORDERING ALONE WAS NOT ENOUGH, AND THE FIRST VERSION OF THIS COMMENT CLAIMED
   * IT WAS ("removes the only way the invariant could be violated"). It removed one way and created
   * its mirror: `onPresence` is the host's Pixi rack repaint, so a throw THERE would have swallowed
   * the `LOBBY_PRESENCE` broadcast for the whole room — every remote rack freezing, which is worse
   * than the local-only loss it replaced. Two independent try/catches is the shape that actually
   * makes "both halves always run" true; the ORDER then only decides which one gets the fresher
   * frame, and local-first is right because it is the half with no dependency.
   */
  // ⭐ S195 (N3) — the lock countdown rides the same beacon (ms LEFT, so no clock is shared across peers).
  const countdownMs = session.qmCountdownEndsAt !== null ? Math.max(0, session.qmCountdownEndsAt - now) : undefined;
  try {
    onPresence(roster, countdownMs);
  } catch (err) {
    console.error('[lobby] presence repaint threw — the wire broadcast still goes out', err);
  }
  if (transport !== null) {
    try {
      transport.send({
        kind: 'LOBBY_PRESENCE',
        roster,
        phase: hostPhaseOf(gameState),
        ...(session.matchId !== null ? { matchId: session.matchId } : {}),
        ...(countdownMs !== undefined ? { countdownMs } : {}),
      });
    } catch (err) {
      // Disconnected mid-cycle is the ordinary case here; the local rack is already correct.
      console.warn('[net] LOBBY_PRESENCE broadcast failed — local rack already repainted', err);
    }
  }
}

/** ⭐ S191 (NETFR-1) — a host is in its LOBBY until Begin; PLAYING, WIN and POSTGAME are all its MATCH. */
export function hostPhaseOf(gameState: GameState): HostPhase {
  return gameState === 'LOBBY' || gameState === 'TITLE' ? 'LOBBY' : 'MATCH';
}

/**
 * ⭐ S193 (audit F1/F2, teams spec Q2) — can the HOST's lobby start a match? The host's own pick plus every
 * seated peer's, through `teamsPlayable`. ONE helper, read by `main.ts`'s Begin AND auto-begin, so the two
 * cannot disagree about what "one team, no enemy" means.
 */
export function sessionTeamsPlayable(session: Pick<NetSession, 'selfTeam' | 'lobbySeats' | 'teamByPeer'>): boolean {
  const picks = [session.selfTeam ?? undefined, ...[...session.lobbySeats.keys()].map((p) => session.teamByPeer.get(p))];
  return teamsPlayable(picks, picks.length);
}

/**
 * ⭐⭐ S195 (owner N3) — **READY LOCKS YOUR TEAM, AND EVERYONE READY STARTS A 3-SECOND LOCK.**
 *
 * > *"When you click ready in a lobby, … you cannot change your team … Once you click ready, you're stuck for
 * > three seconds, everyone, before the game starts … if you wanna click unready … it takes like three seconds
 * > before you can change a team … so people can stop it in case someone's … screwing with them."*
 *
 * Both numbers are HIS ("three seconds"). Lobby-only, host-enforced; the host's clock (the lobby has no sim
 * tick and never reaches the hash).
 */
export const QM_READY_LOCK_MS = 3000;
/** ⭐ S195 (owner N3) — after un-readying, the team stays locked this long. */
export const QM_UNREADY_TEAM_COOLDOWN_MS = 3000;

/** ⭐ S195 (N3) — stop a running lock countdown (somebody un-readied, left, or the room changed). */
export function cancelQmCountdown(session: NetSession): boolean {
  if (session.qmCountdownTimer === null) return false;
  clearTimeout(session.qmCountdownTimer);
  session.qmCountdownTimer = null;
  session.qmCountdownEndsAt = null;
  return true;
}

/**
 * ⭐ S195 (N3) — record a READY toggle (`peerId` null = the host itself). An UN-ready stamps the cooldown and
 * STOPS a running countdown: *"so people can stop it"*. Returns true when a countdown was stopped.
 */
export function noteQmReady(session: NetSession, peerId: string | null, ready: boolean, now: number = Date.now()): boolean {
  const was = peerId === null ? session.qmSelfReady : session.qmReadyPeers.get(peerId) === true;
  if (peerId === null) session.qmSelfReady = ready;
  else session.qmReadyPeers.set(peerId, ready);
  if (was && !ready) {
    if (peerId === null) session.qmSelfUnreadyAt = now;
    else session.qmUnreadyAt.set(peerId, now);
  }
  return !ready ? cancelQmCountdown(session) : false;
}

/**
 * ⭐ S195 (N3) — may this player change team right now? Never while READY (quick match), never within
 * `QM_UNREADY_TEAM_COOLDOWN_MS` of un-readying. A friends lobby has no READY, so it is always free there.
 */
export function qmTeamChangeAllowed(session: NetSession, peerId: string | null, now: number = Date.now()): boolean {
  if (!session.quickmatch) return true;
  const ready = peerId === null ? session.qmSelfReady : session.qmReadyPeers.get(peerId) === true;
  if (ready) return false;
  const at = peerId === null ? session.qmSelfUnreadyAt : session.qmUnreadyAt.get(peerId);
  return at === null || at === undefined || now - at >= QM_UNREADY_TEAM_COOLDOWN_MS;
}

/**
 * Host: if a quickmatch room is fully ready, START THE 3-SECOND LOCK; when it runs out and the room is still
 * all ready, fire the (idempotent) Begin. ⭐ S195 (N3) — it was an immediate Begin. Not all ready ⇒ any running
 * countdown is cancelled. `onTick` repaints/rebroadcasts at the start and the cancel so every rack shows it.
 * Returns true when a countdown is running after the call.
 */
export function maybeQmAutoBegin(session: NetSession, onBegin: () => void, onTick?: () => void, now: number = Date.now()): boolean {
  // A one-team room never counts down (spec Q2: no enemy, no match — main.ts's Begin refuses it too).
  const allReady = session.quickmatch && isQuickmatchAllReady(session.lobbySeats, session.qmReadyPeers, session.qmSelfReady) && sessionTeamsPlayable(session);
  if (!allReady) {
    if (cancelQmCountdown(session)) onTick?.();
    return false;
  }
  if (session.qmCountdownTimer !== null) return true; // already counting — a duplicate READY never restarts it
  session.qmCountdownEndsAt = now + QM_READY_LOCK_MS;
  session.qmCountdownTimer = setTimeout(() => {
    session.qmCountdownTimer = null;
    session.qmCountdownEndsAt = null;
    if (session.quickmatch && isQuickmatchAllReady(session.lobbySeats, session.qmReadyPeers, session.qmSelfReady) && sessionTeamsPlayable(session)) onBegin();
    else onTick?.();
  }, QM_READY_LOCK_MS);
  onTick?.();
  return true;
}
