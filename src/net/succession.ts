/**
 * SPARK — S118 P1 (host-migration D2): PURE successor computation + snapshot-starvation predicate.
 *
 * D2 is the INSTRUMENT-ONLY detection layer of HOST_MIGRATION_DESIGN.md §9: the client learns to
 * NOTICE that the host has gone silent and to COMPUTE who would take over — but it does NOT yet take
 * over (that is D3's MIGRATION_CLAIM). Everything here is a pure function of already-synced state, so
 * it is trivially unit-testable and adds zero wire/save bytes.
 *
 *   • computeSuccessorSeat — given the host's SuccessionWarrant (net/successionWarrant.ts) and the set
 *     of currently-alive seats, the deterministic successor is the LOWEST seat that is BOTH warranted
 *     AND alive. Every survivor computes the SAME successor from the SAME warrant + alive set, so D3's
 *     claim is uncontested by construction (no election). null = no warranted survivor (match ends).
 *   • isSnapshotStarved — the client has accepted no NETSNAPSHOT for ≥ HOST_STARVATION_MS. Pure over
 *     (now, lastAcceptedAtMs); the caller gates on a real prior acceptance so boot (last=0) never trips.
 *
 * DETERMINISM: both are pure (no Math.random / Date.now / iteration-order dependence — the successor
 * is a min over an explicit numeric set). MIXED-BUILD tolerance (Council GEMINI FIX 2): seats the host
 * could not warrant (a peer that never proved a pubkey) are simply ABSENT from the warrant, so they are
 * never chosen as successor — strictly less harm than excluding them from the match.
 *
 * ┌─ FUTURE WORKER-SIM BOUNDARY (S118 Council GEMINI Q1 fix — B2 forward-map, doc-only) ────────────┐
 * │ When the sim moves behind a Web Worker (B2 / WORKER_SIM_FOUNDATION.md), this detection logic     │
 * │ straddles the main/worker thread split cleanly IF kept as PURE functions over plain data:        │
 * │   • the WORKER owns the authoritative snapshot cadence → posts `Worker→Main: {type:'SNAPSHOT'}`   │
 * │     which the MAIN thread timestamps (isSnapshotStarved stays main-thread, over postMessage rx).  │
 * │   • successor calc is pure over (warrant, aliveSeats) → callable on EITHER thread; keep it here   │
 * │     free of DOM/transport refs so B2 can `Main→Worker: {type:'COMPUTE_SUCCESSOR'}` without port.  │
 * │ No behavior today; this note keeps B1 from baking in a main-thread-only assumption B2 must undo.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { SuccessionWarrant } from './successionWarrant.ts';

/**
 * How long (ms) a networked client waits with NO accepted NETSNAPSHOT before it considers the host
 * snapshot-starved. Snapshots flow at NET_SNAPSHOT_HZ (10Hz = 100ms), so 6000ms = ~60 missed frames —
 * comfortably past transient jitter / a brief tab-throttle, well before a human gives up on a frozen duel.
 */
export const HOST_STARVATION_MS = 6000;

/**
 * The deterministic successor seat: the LOWEST seat that is BOTH named in the warrant AND currently
 * alive. Returns null when no warranted seat survives (nobody can legitimately take over → the match
 * genuinely ends). Pure — every survivor computes the identical result from the identical inputs.
 */
export function computeSuccessorSeat(
  warrant: SuccessionWarrant,
  aliveSeats: ReadonlySet<number>,
): number | null {
  let best: number | null = null;
  for (const s of warrant.seats) {
    if (!aliveSeats.has(s.seat)) continue;
    if (best === null || s.seat < best) best = s.seat;
  }
  return best;
}

/**
 * True iff the client has gone ≥ ms without an accepted snapshot. Pure over the timestamps; the caller
 * MUST gate on a real prior acceptance (lastAcceptedAtMs > 0) so a fresh client (last = 0) is not
 * reported as instantly starved. `now`/`last` are performance.now()-domain milliseconds.
 */
export function isSnapshotStarved(now: number, lastAcceptedAtMs: number, ms: number): boolean {
  return now - lastAcceptedAtMs >= ms;
}
