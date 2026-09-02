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

// ⭐ W1-A (S160) — `PLAYER_COLORS` is GONE from this file, exactly as the spec predicted: every
// colour here now derives from a race. `noUnusedLocals` is on, so tsc enforces that.
import { MAX_PLAYERS } from '../constants.ts';
import type { RosterEntry } from './protocol.ts';
import { RACE_COLORS, defaultRaceForSeat, type RaceId } from '../state/races.ts';

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
 * ⭐ W1-A (S160) — the ONE place a `RosterEntry`'s identity is assembled, so the two builders cannot
 * drift apart on how colour is derived. `color` is `RACE_COLORS[raceId]` and nothing else: race is
 * primary, colour is derived (`SPARK_RACES_SPEC.md` §4).
 *
 * ⛔ `raceId` IS EMITTED ONLY WHEN A RACE WAS ACTUALLY CLAIMED, and the rule is deliberately NOT
 * "omit when it equals the seat default". Getting this wrong breaks one of the two contracts, and
 * S160 broke it the first way before the existing suite caught it:
 *
 *   · **Always emit** → an all-default lobby beacon grows a key it never had, so the pre-W1-A
 *     byte-identity §15.6 promises is gone. (This is what five `lobbyRoster.test.ts` cases caught.)
 *   · **Omit when equal to the default** → looks tidier and is WRONG, because it is the *receiver*
 *     that re-derives the default — from the **dense** seat. A peer who claimed vampires (seat 0's
 *     default) and is then compacted to dense seat 2 would have the key omitted and be re-derived as
 *     mummies. That is B6 exactly, reintroduced by an optimisation.
 *   · **Omit only when unclaimed** → both hold. An unclaimed seat is byte-identical to pre-W1-A
 *     (`RACE_COLORS[defaultRaceForSeat(seat)]` IS `PLAYER_COLORS[seat]`, pinned in `races.test.ts`),
 *     and a claimed race is always transmitted, so compaction can never re-derive it away.
 */
function rosterEntryFor(peerId: string, seat: number, claimed: RaceId | undefined): RosterEntry {
  const raceId = claimed ?? defaultRaceForSeat(seat);
  const base = { seat, peerId, color: RACE_COLORS[raceId] };
  return claimed === undefined ? base : { ...base, raceId: claimed };
}

/**
 * S73 P1 — STABLE lobby-preview projection of the seat-map. seat 0 = host (selfId),
 * plus one entry per seated peer ORDERED BY SEAT ascending. Seats may be
 * NON-CONTIGUOUS (a HOLE left by a departed peer); the client rack renders a missing
 * seat as an empty cell (lobbyView's `bySeat.get(i)`). Colour tracks the stable seat
 * (`RACE_COLORS[raceId]`, whose default is the seat's) so a survivor keeps its colour across other
 * peers' departures. ⚠ W1-A (S160) corrected this line: it said colour tracks the stable SEAT via
 * `PLAYER_COLORS[seat]`, which is now only the DEFAULT — race is primary and colour is derived.
 * Drives LOBBY_PRESENCE + the host's own rack.
 */
/**
 * ⭐ W1-A (S160) — `raceByPeer` / `selfRace` are DEFAULTED, and an EMPTY MAP REPRODUCES THE PRE-W1-A
 * ROSTER BYTE FOR BYTE (`lobbyRoster.test.ts` asserts exactly that). `RACE_COLORS[defaultRaceForSeat(
 * seat)]` IS `PLAYER_COLORS[seat]` by construction — `races.test.ts` pins the two palettes as equal
 * — so the colour a seat gets does not move until a peer actually claims a race.
 */
export function buildLobbyRoster(
  seatByPeer: ReadonlyMap<string, number>,
  selfId: string,
  raceByPeer: ReadonlyMap<string, RaceId> = new Map(),
  selfRace?: RaceId,
): RosterEntry[] {
  const remotes = [...seatByPeer.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([peerId, seat]) => rosterEntryFor(peerId, seat, raceByPeer.get(peerId)));
  return [rosterEntryFor(selfId, 0, selfRace), ...remotes];
}

/**
 * S73 P1 — DENSE authoritative-match projection. Compacts the stable seat-map to
 * CONTIGUOUS seats 0..N-1 (host = seat 0; remotes re-densified in ASCENDING
 * stable-seat order) so the in-game radialSpawnPos(seat, total=N) — which assumes
 * contiguous seats — places N players without overlap, and the N-player determinism
 * contract holds. ⚠ W1-A (S160): colour no longer tracks the DENSE seat — it is
 * `RACE_COLORS[raceId]`, and only an UNCLAIMED seat falls back to the dense seat's default (that
 * distinction is B6, and it is the whole point of the note below). peerId is
 * carried for the host's hostSeats freeze (anti-spoof intent stamping) + each client's
 * self-identification (peerId === selfId). Drives START_GAME_SIGNAL.
 *
 * With NO holes (no mid-lobby departure) the dense seats EQUAL the stable seats, so a
 * joiner's previewed seat == its Begin seat (the S70 invariant). With an unfilled hole
 * the compaction shifts higher seats down one — the documented one-time match-start
 * colour shift (PDR §3 accepted tradeoff).
 */
/**
 * ⛔ W1-A (S160) — **THE RACE FOLLOWS THE PEER, NOT THE DENSE SEAT.** This is the spec's B6, and it is
 * the whole reason this function needed touching rather than inheriting the new field for free.
 *
 * The docblock above accepts *"the documented one-time match-start colour shift"* when an unfilled
 * hole compacts the seats. That is harmless while colour is just a seat's paint. **With races the
 * same shift is a RACE change** — a player who locked vampires in the lobby would begin the match as
 * nagas. So a CLAIMED race is looked up by `peerId` and survives compaction untouched; only an
 * UNCLAIMED seat falls back to `defaultRaceForSeat(denseSeat)`, which is the pre-W1-A behaviour
 * exactly.
 *
 * ⚠ AND THE FAILURE MODE IF THIS WERE LEFT ALONE IS SILENT. Adding `raceId` to `RosterEntry` while
 * leaving this function building `color: PLAYER_COLORS[denseSeat]` means the field is simply NEVER
 * POPULATED on the authoritative Begin roster — **and every lobby-side test still passes**, because
 * the lobby rack is built by the OTHER function. That is why the test for this one asserts a claimed
 * race survives dense compaction, rather than asserting the field merely exists.
 */
export function buildMatchRoster(
  seatByPeer: ReadonlyMap<string, number>,
  selfId: string,
  raceByPeer: ReadonlyMap<string, RaceId> = new Map(),
  selfRace?: RaceId,
): RosterEntry[] {
  const orderedRemotes = [...seatByPeer.entries()].sort((a, b) => a[1] - b[1]);
  const roster: RosterEntry[] = [rosterEntryFor(selfId, 0, selfRace)];
  orderedRemotes.forEach(([peerId], i) => {
    // ⛔ `raceByPeer` is keyed on peerId; the dense seat is read ONLY by the fallback.
    roster.push(rosterEntryFor(peerId, i + 1, raceByPeer.get(peerId)));
  });
  return roster;
}
