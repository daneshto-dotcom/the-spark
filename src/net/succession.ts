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

/**
 * S124 P1 (host-migration D4) — the CLAIM LADDER rung width. D3's binary "am I THE successor?"
 * check deadlocks when the lowest warranted-alive seat is transport-alive but wedged (throttled
 * tab, hung JS): survivors wait forever. D4 replaces it with a deterministic ladder — the rank-k
 * warranted-alive seat fires its claim at grace + k·CLAIM_LADDER_MS — so a stuck rank-0 is
 * overtaken by rank-1 one rung later. Rung width must exceed claim propagation + async ECDSA
 * verify + grace-start skew between survivors (Council S124: p95 verify+propagation ≈ 940 ms on
 * low-end hardware → 800 too tight; 2 000 costs deep ranks seconds of recovery — 1 500 splits it).
 * Correctness does NOT depend on the rung: simultaneous claims at one epoch converge via
 * lowest-seat-wins demotion (main.ts / clientHandlers). Seam-overridable for e2e.
 */
export const CLAIM_LADDER_MS = 1500;

/**
 * The ladder delay for THIS peer: rank·ladderMs where rank = index of selfSeat in the ascending
 * warranted ∩ transport-alive seat list. Returns null when selfSeat is not a warranted-alive seat
 * (an unwarranted peer can never claim — its signature would not verify anyway). Rank 0 (the
 * computeSuccessorSeat winner) fires at delay 0 — byte-identical timing to the D3 behavior the
 * existing kill-host e2e locks. Pure: every survivor computes the same ladder from the same
 * (warrant, aliveSeats), so ranks are globally consistent up to alive-view skew, which the
 * lowest-seat-wins reconciliation absorbs.
 */
export function computeClaimDelayMs(
  warrant: SuccessionWarrant,
  aliveSeats: ReadonlySet<number>,
  selfSeat: number,
  ladderMs: number,
): number | null {
  const ladder: number[] = [];
  for (const s of warrant.seats) {
    if (aliveSeats.has(s.seat)) ladder.push(s.seat);
  }
  ladder.sort((a, b) => a - b);
  const rank = ladder.indexOf(selfSeat);
  return rank === -1 ? null : rank * ladderMs;
}

/** The three survivor-side outcomes for an incoming MIGRATION_CLAIM (see claimAcceptDecision). */
export type ClaimDecision = 'advance' | 'relatch-down' | 'reject';

/**
 * S124 P1 (host-migration D4) — the PURE acceptance decision for a MIGRATION_CLAIM, shared by
 * the pre-verify gate and the post-verify apply-time re-check (clientHandlers.ts). Rules:
 *   • epoch > current  → 'advance', but ONLY while this peer itself observes host loss
 *     (hostGone) — a claim arriving while the current-term host is healthy is replay/grief and
 *     is rejected (the S122 Council L3 rule, epoch-generalized). Monotonic-forward (not strict
 *     +1) so a rejoiner that slept through N migrations still converges on the current term.
 *   • epoch === current with a seat LOWER than the latched claimant → 'relatch-down' — the
 *     lowest-seat-wins reconciliation of ladder races. Needs NO host-loss observation: it is
 *     pure reconciliation inside an already-migrated term, and sender-binding means only the
 *     genuinely warranted lower seat can produce it. Never re-latches upward.
 *   • anything else → 'reject' (older terms, same-term higher/equal seats).
 * latchedClaimSeat === null at the same epoch is treated as accept-down (defensive: we hold no
 * better claimant to defend; unreachable in practice — every path that advances the epoch also
 * records the claim seat).
 */
export function claimAcceptDecision(
  msgEpoch: number,
  msgSeat: number,
  currentEpoch: number,
  latchedClaimSeat: number | null,
  hostGone: boolean,
): ClaimDecision {
  if (msgEpoch > currentEpoch) return hostGone ? 'advance' : 'reject';
  if (
    msgEpoch === currentEpoch &&
    (latchedClaimSeat === null || msgSeat < latchedClaimSeat)
  ) {
    return 'relatch-down';
  }
  return 'reject';
}
