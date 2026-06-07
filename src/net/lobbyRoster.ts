/**
 * SPARK — S70 P1 / S73 P1: lobby + match seat-roster authority.
 *
 * The host is the seat authority: seat 0 = host (selfId), seats 1..MAX_PLAYERS-1 =
 * connected remote peers. S73 P1 makes lobby seats STABLE (non-compacting): instead
 * of deriving the seat from a peer's INDEX in transport.peerIds() (a JS Set that
 * COMPACTS on leave — so a mid-roster departure shifted every later peer's seat AND
 * colour), the host holds a persistent peerId→seat map (session.lobbySeats) that is
 * the SINGLE SOURCE OF TRUTH, reconciled on each peer join/leave and projected two
 * ways:
 *
 *   - buildLobbyRoster  — STABLE projection (seats may be NON-CONTIGUOUS: a departed
 *     peer leaves a HOLE the rack renders as an empty cell). Drives the live
 *     LOBBY_PRESENCE broadcast + the host's own rack. Survivors keep seat+colour.
 *   - buildMatchRoster  — DENSE projection (compacts to CONTIGUOUS seats 0..N-1).
 *     Drives the authoritative START_GAME_SIGNAL + hostSeats freeze, because the
 *     in-game radialSpawnPos(seat, total=N) assumes contiguous seats (a hole would
 *     overlap two avatars: seat 3 with total 3 → angle == seat 0).
 *
 * Why one map projected twice (Council S73, Option 1b) instead of "stable lobby +
 * positional Begin": a back-filled hole (a new peer takes a freed LOWER seat) is
 * assigned differently than peerSet insertion order, so a positional Begin would
 * disagree with the stable lobby preview → a lobby↔game colour swap. S70 deliberately
 * UNIFIED preview & Begin via one builder to prevent exactly that drift; S73 preserves
 * the invariant by projecting BOTH from the one map. (Accepted tradeoff: an UNFILLED
 * hole persisting to Begin shifts players above the gap down one dense seat — a
 * one-time colour change at match start, far milder than the per-leave lobby reshuffle
 * this fixes. The fully shift-free variant — sparse in-game seats — is deferred to the
 * netcode-infra backlog.)
 *
 * All three functions are PURE (no transport, no Pixi), so the stateful host loop is
 * exhaustively testable by FOLDING reconcileLobbySeats over a join/leave event
 * sequence — the #test-via-pure-helper-export pattern (strategySummary.ts, lobbyReduce).
 * Lobby seating is real-time presence and is NOT part of save.replay determinism.
 */

import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';
import type { RosterEntry } from './protocol.ts';

// Host is always seat 0; remote peers occupy seats 1..MAX_PLAYERS-1.
const FIRST_REMOTE_SEAT = 1;

/**
 * S73 P1 — reconcile the STABLE lobby seat-map against the live peer set. Pure:
 * given the prior peerId→seat map and the currently-connected peerIds, return the
 * NEXT map:
 *   1. Present peers KEEP their existing seat (the non-compacting fix). Peers absent
 *      from `peerIds` are dropped → their seat becomes a free HOLE.
 *   2. Each genuinely-NEW peer takes the LOWEST FREE seat in [1, MAX_PLAYERS-1]
 *      (fills holes first, so the rack stays visually compact while incumbents never
 *      move). A new peer with NO free seat (room already full) is left UNSEATED — the
 *      host-authoritative cap, identical to the cap Begin applies.
 *
 * Multiple new peers are assigned in `peerIds` (arrival / Set-insertion) order:
 * deterministic GIVEN the join/leave event sequence. In practice onPeerChange fires
 * once per peerId so at most one peer is new per call; the loop handles N defensively.
 */
export function reconcileLobbySeats(
  prev: ReadonlyMap<string, number>,
  peerIds: readonly string[],
): Map<string, number> {
  const next = new Map<string, number>();
  const taken = new Set<number>();
  // 1) Keep present peers at their existing seat (departed peers fall away).
  for (const pid of peerIds) {
    const seat = prev.get(pid);
    if (seat !== undefined) {
      next.set(pid, seat);
      taken.add(seat);
    }
  }
  // 2) Assign each new peer the lowest free remote seat; none free → unseated.
  for (const pid of peerIds) {
    if (next.has(pid)) continue;
    let assigned = -1;
    for (let s = FIRST_REMOTE_SEAT; s < MAX_PLAYERS; s++) {
      if (!taken.has(s)) {
        assigned = s;
        break;
      }
    }
    if (assigned === -1) continue; // room full — peer left unseated (dropped at Begin)
    next.set(pid, assigned);
    taken.add(assigned);
  }
  return next;
}

/**
 * S73 P1 — STABLE lobby-preview projection of the seat-map. seat 0 = host (selfId),
 * plus one entry per seated peer ORDERED BY SEAT ascending. Seats may be
 * NON-CONTIGUOUS (a HOLE left by a departed peer); the client rack renders a missing
 * seat as an empty cell (lobbyView's `bySeat.get(i)`). Colour tracks the stable seat
 * (PLAYER_COLORS[seat]) so a survivor keeps its colour across other peers' departures.
 * Drives LOBBY_PRESENCE + the host's own rack.
 */
export function buildLobbyRoster(
  seatByPeer: ReadonlyMap<string, number>,
  selfId: string,
): RosterEntry[] {
  const remotes = [...seatByPeer.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([peerId, seat]) => ({ seat, peerId, color: PLAYER_COLORS[seat] }));
  return [{ seat: 0, peerId: selfId, color: PLAYER_COLORS[0] }, ...remotes];
}

/**
 * S73 P1 — DENSE authoritative-match projection. Compacts the stable seat-map to
 * CONTIGUOUS seats 0..N-1 (host = seat 0; remotes re-densified in ASCENDING
 * stable-seat order) so the in-game radialSpawnPos(seat, total=N) — which assumes
 * contiguous seats — places N players without overlap, and the N-player determinism
 * contract holds. Colour tracks the DENSE seat (PLAYER_COLORS[denseSeat]); peerId is
 * carried for the host's hostSeats freeze (anti-spoof intent stamping) + each client's
 * self-identification (peerId === selfId). Drives START_GAME_SIGNAL.
 *
 * With NO holes (no mid-lobby departure) the dense seats EQUAL the stable seats, so a
 * joiner's previewed seat == its Begin seat (the S70 invariant). With an unfilled hole
 * the compaction shifts higher seats down one — the documented one-time match-start
 * colour shift (PDR §3 accepted tradeoff).
 */
export function buildMatchRoster(
  seatByPeer: ReadonlyMap<string, number>,
  selfId: string,
): RosterEntry[] {
  const orderedRemotes = [...seatByPeer.entries()].sort((a, b) => a[1] - b[1]);
  const roster: RosterEntry[] = [{ seat: 0, peerId: selfId, color: PLAYER_COLORS[0] }];
  orderedRemotes.forEach(([peerId], i) => {
    const denseSeat = i + 1;
    roster.push({ seat: denseSeat, peerId, color: PLAYER_COLORS[denseSeat] });
  });
  return roster;
}
