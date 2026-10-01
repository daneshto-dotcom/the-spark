/**
 * SPARK — S189 (C4): the CLIENT's auto-reconnect schedule and the lone-survivor claim gate, as pure
 * decisions. `main.ts` owns the loop (it runs once per frame) and calls these; keeping the decisions
 * here is what lets them be tested without booting the game.
 *
 * Owner, S189: *"connection was lost at like wave five … Need to make sure connection is established
 * and always on"*.
 *
 * ⛔ WHAT WAS WRONG — reproduced end-to-end over real WebRTC (`e2e/reconnect-hard-blip.spec.ts`): the
 * joiner's peer connection was killed mid-match (a hard blip — what a network drop, a relay loss or a
 * sleeping laptop does), the reconnect loop fired at 1.45 / 5.5 / 9.5 / 13.7 s, and the match NEVER
 * came back. Three independent faults, each enough to lose a recoverable match:
 *
 *   1. A RETRY KILLED THE JOIN IT WAS WAITING FOR. Every 4 s the loop tore the in-flight transport down
 *      and started again — but a FRESH join (signalling, ICE, DTLS, SCTP) takes ~6.3 s (measured S189,
 *      same LAN). A join can only land if it is left alone for longer than it takes.
 *   2. AND THE NEW JOIN OFTEN BOUND TO THE ROOM IT HAD JUST LEFT — fixed in `transport.ts`
 *      (`connect()` waits for a same-room leave in flight; see `pendingLeaves` there).
 *   3. AT 15 s THE LONE CLIENT CLAIMED THE HOST SEAT. With nobody else connected the claim hosts an
 *      empty match — and a host does not reconnect, so the loop stopped for good. The joiner in the
 *      reproduction ended `isHost: true` with no peers; both sides sat on the terminal overlay.
 *
 * And the loop gave up at the grace: a network that came back at 16 s never rejoined.
 */
import { JOIN_STALL_WARN_MS } from './joinDiagnosis.ts';
import { isSnapshotStarved } from './succession.ts';
import type { HostPhase } from './protocol.ts';

/** The RECONNECTING window before the terminal overlay (unchanged, S82). Also the migration grace. */
export const RECONNECT_GRACE_MS = 15_000;
/** The first retry comes quickly: a sub-second blip that already healed rejoins in ~0.2 s (S189). */
export const RECONNECT_FIRST_RETRY_DELAY_MS = 1_000;
/**
 * ⭐ S189 — a retry may only replace an attempt that has had the repo's own budget for a HEALTHY join:
 * `JOIN_STALL_WARN_MS` (8 s), the point at which the lobby first calls a join slow. Was 4 s, below a
 * measured fresh join (~6.3 s), so every attempt but the last was torn down before it could land.
 */
export const RECONNECT_RETRY_MS = JOIN_STALL_WARN_MS;
/**
 * ⭐ S189 fix round (audit NET-1) — the BACKSTOP: the loop stops retrying this long after the loss
 * began; the terminal overlay stays (Return to Title). ⚠ MINE, not the owner's: 3 minutes is long past
 * any blip, sleep or relay hiccup the loop exists for, and short of a host that has plainly moved on.
 */
export const RECONNECT_GIVE_UP_MS = 180_000;
/**
 * ⭐ S189 fix round (audit NET-1) — a snapshot from the followed host whose sequence is more than this
 * far BELOW what we already accepted, at the same epoch, came from a NEW `HostSync` (a new match; one is
 * created per hosted room). ⚠ MINE: 50 is ~5 s of snapshots, far past any reorder. Only acted on after
 * a rejoin (see `hostMovedOn`), so a delayed copy on a second strategy's channel mid-match cannot fire it.
 * ⭐ S191 — now only the FALLBACK when a side carries no match id (`classifyHostMessage`).
 */
export const HOST_SEQ_REGRESSION_SLACK = 50;

export interface ReconnectRetryInput {
  readonly nowMs: number;
  /** When the next attempt is allowed (the loop advances it by `RECONNECT_RETRY_MS` on each attempt). */
  readonly nextRetryMs: number;
  /** A host keeps its transport and waits for its clients; only a client re-joins. */
  readonly isHost: boolean;
  readonly hasRoomCode: boolean;
  /** The host is gone but other survivors are still connected: never tear that mesh down. */
  readonly migrationCase: boolean;
}

/**
 * Is a reconnect attempt due now? ⭐ S189 — deliberately NOT gated on the grace: past the grace the
 * terminal overlay is shown (unchanged), but the loop keeps trying behind it, and the overlay clears
 * itself the moment a peer is back (`main.ts`'s existing `!peersGone` branch). A player who wants to
 * stop presses Return to Title, which tears the session down and ends the loop.
 */
export function reconnectRetryDue(i: ReconnectRetryInput): boolean {
  return !i.isHost && i.hasRoomCode && !i.migrationCase && i.nowMs >= i.nextRetryMs;
}

/**
 * ⭐ S189 — is anyone OTHER than the lost host still connected? Consulted by `stepMigrationClaim` ONLY
 * when the host has left our TRANSPORT: host migration exists to keep a match alive for its other
 * survivors, and a claim with nobody to host for hosts an empty match while ending this peer's
 * reconnect loop (a host does not rejoin). `main.ts` says this in words at the overlay split —
 * *"peerCount === 0 = OUR transport died — the S82 reconnect-cycle is the only path back"*.
 * ⚠ NOT consulted for a host that is still connected but silent (frozen / backgrounded): that is the
 * S124 D4 takeover, which stays exactly as it was (S189 fix round, audit NET-4).
 */
export function hasSurvivorToHostFor(
  alivePeerIds: ReadonlySet<string>,
  lostHostPeerId: string | null,
): boolean {
  for (const p of alivePeerIds) if (p !== lostHostPeerId) return true;
  return false;
}

/**
 * ⛔ S191 WIRE-3 (audit) — WHO COUNTS AS A SURVIVOR: an entry of the frozen Begin roster
 * (`session.lastRoster`) that is not us, not the lost host, and is on our transport now. Any transport peer
 * used to count, so a non-seated peer on the room (a late joiner, a viewer who typed the code) made a 1v1
 * client claim the host seat for nobody — and, through `migrationCase`, stopped it retrying a host that
 * was reachable. main.ts feeds this to BOTH sites: `stepMigrationClaim`'s gate and `migrationCase`.
 */
export function seatedSurvivors(
  roster: readonly { readonly peerId: string }[] | null,
  transportPeerIds: Iterable<string>,
  selfPeerId: string,
  lostHostPeerId: string | null,
): Set<string> {
  const onTransport = new Set(transportPeerIds);
  const out = new Set<string>();
  for (const e of roster ?? []) {
    if (e.peerId !== selfPeerId && e.peerId !== lostHostPeerId && onTransport.has(e.peerId)) out.add(e.peerId);
  }
  return out;
}

/**
 * ⭐ S192 ROUND-2 (audit wf_de15cae4-4a8) — the MIGRATION case, extracted from main.ts so a test can reach it:
 * a warranted client whose followed host is lost while someone it should wait with is still connected —
 * the loop then never tears its transport down (that would drop the coming MIGRATION_CLAIM).
 *   · with a Begin roster: a SEATED survivor (S191 WIRE-3 — a stray on the room is nobody to wait with);
 *   · with NO roster: any transport peer (the S125 v2 rule). Every deposed original host that rejoined as a
 *     client is such a seat — `lastRoster` is written only from a START_GAME_SIGNAL received in LOBBY — and
 *     WIRE-3 made it tear its live mesh down every 8 s when its successor was lost, instead of waiting for
 *     the next claim. It cannot claim itself (the claim block needs a roster), so this changes only the wait.
 */
export function isMigrationCase(i: {
  readonly isHost: boolean;
  readonly hasWarrant: boolean;
  readonly roster: readonly { readonly peerId: string }[] | null;
  /** null = no transport. */
  readonly transportPeerIds: readonly string[] | null;
  readonly selfPeerId: string;
  readonly hostPeerId: string | null;
}): boolean {
  if (i.isHost || !i.hasWarrant || i.transportPeerIds === null) return false;
  if (i.roster === null) return i.transportPeerIds.length > 0;
  return seatedSurvivors(i.roster, i.transportPeerIds, i.selfPeerId, i.hostPeerId).size > 0;
}

/** ⭐ S189 (C4, hunt E3) — why the overlay went TERMINAL, for the one `[net] CONNECTION LOST (terminal)` line. */
export type TerminalLossCause = 'zombieDeposed' | 'migrationDeadline' | 'hostLost' | 'peerCount0';

export function terminalLossCause(i: {
  readonly zombieDeposed: boolean;
  readonly migrationCase: boolean;
  readonly peerCount: number;
}): TerminalLossCause {
  if (i.zombieDeposed) return 'zombieDeposed';
  if (i.migrationCase) return 'migrationDeadline';
  return i.peerCount === 0 ? 'peerCount0' : 'hostLost';
}

/**
 * The per-frame MIGRATION-CLAIM decision, extracted from `main.ts` so it can be tested (audit NET-5/6).
 * `main.ts` owns the side effects (signing, broadcasting, adopting authority); this owns WHEN.
 */
export interface MigrationClaimInput {
  readonly nowMs: number;
  /** The host this client follows (latched at HELLO), or null. */
  readonly hostPeerId: string | null;
  /** Peers our transport currently sees. */
  readonly alivePeerIds: ReadonlySet<string>;
  /** ⭐ S191 WIRE-3 — the SEATED survivors (`seatedSurvivors`): the only peers the transport-loss gate counts. */
  readonly seatedSurvivorIds: ReadonlySet<string>;
  /** When the last snapshot was accepted (0 = never). */
  readonly lastAcceptedAtMs: number;
  /** When the host last (re)appeared on our transport (see `stepHostPresence`). */
  readonly hostPresentSinceMs: number;
  readonly starvationMs: number;
  readonly graceMs: number;
  /** This seat's claim-ladder delay, or null if it may never claim (not warranted-alive). */
  readonly ladderDelayMs: number | null;
  /** When the current loss episode was first observed (0 = none). */
  readonly lossObservedAtMs: number;
  /**
   * ⭐ S192 ROUND-1 — did the running clock START on a frame where the host was already gone from our
   * transport (a host death seen with our own transport up)? Carried by main.ts beside `lossObservedAtMs`;
   * false when no clock runs. Only such a clock survives a frame with no seated survivor.
   */
  readonly clockStartedHostAbsent: boolean;
}
export interface MigrationClaimStep {
  readonly lossObservedAtMs: number;
  readonly clockStartedHostAbsent: boolean;
  readonly claim: boolean;
}

/**
 * ⛔ S189 fix round (audit NET-4) — TWO LOSSES, TWO RULES, and the first cut merged them:
 *   · the host is GONE from our transport (peerCount 0 / hostLost) → claim only with a survivor to host
 *     for (`hasSurvivorToHostFor`); in a 1v1 there is none, so the client keeps RECONNECTING — the C4 fix;
 *   · the host is still CONNECTED but silent (frozen, backgrounded tab) → the S124 D4 takeover, exactly
 *     as before: starvation (`HOST_STARVATION_MS`) + the grace + this seat's ladder rung, and the thawed
 *     host rejoins as a client (S125 v2). The first cut gated this path too, and a 1v1 client sat on a
 *     frozen board forever — an unapproved change to an existing mechanic.
 * Starvation is counted from the LATER of the last accepted snapshot and the host's (re)appearance on
 * our transport (`hostPresentSinceMs`): a reconnect that lands after a transport loss must not be read as
 * a starved host in the instant before its first snapshot arrives.
 *
 * ⛔ S191 (audit NETFR-3) — AND ON TRANSPORT LOSS THE CLOCK STARTS ONLY ONCE A SURVIVOR IS VISIBLE. The
 * S189 cut banked `lossObservedAtMs` from the first frame of OUR OWN transport loss (nobody visible) and
 * checked the survivor only at claim time. A reconnect that landed another client's leg before the host's
 * (Trystero holds a same-selfId answer ~23.3 s) then found the banked clock already past grace + rung and
 * claimed on that very frame — a claim that client rejects (it sees a healthy host) and the host refuses
 * (no partition evidence), leaving this seat a lone host that stops reconnecting. Now "host gone, nobody
 * else here" is no episode at all: the grace is counted from the first frame a survivor is visible without
 * the host. (`planConnectionFrame` anchors its MIGRATING window on the same clock — `claimClockSinceMs`.)
 * ⚠ It narrows the window, it does not close it — see the RESIDUAL test in `reconnectPolicy.test.ts`.
 *
 * ⛔ S192 ROUND-1 (audit wf_de15cae4-4a8) — WHICH running clock survives a frame with no seated survivor.
 * Resetting every one (NETFR-3 as first built) cost a real 3+-seat host death a whole fresh grace + rung per
 * survivor blink (S191 FIX-3). KEEPING every one (6004e8d, reverted) re-opened NETFR-3 in the usual order of
 * a real drop: snapshots stop, starvation starts the clock with the host STILL on our transport, Trystero
 * then removes both legs, and the reconnect lands B first — on a clock already past grace + rung. So the
 * clock remembers how it began (`clockStartedHostAbsent`, set on its first frame only): a clock that began
 * with the host gone and a survivor visible is kept through the blink; one that began as starvation is
 * dropped the moment our transport has nobody to host for, and restarts when a survivor is visible.
 */
export function stepMigrationClaim(i: MigrationClaimInput): MigrationClaimStep {
  const hostPresent = i.hostPeerId !== null && i.alivePeerIds.has(i.hostPeerId);
  const hostLost = i.hostPeerId !== null && !hostPresent;
  const since = hostPresent ? Math.max(i.lastAcceptedAtMs, i.hostPresentSinceMs) : i.lastAcceptedAtMs;
  const starved = isSnapshotStarved(i.nowMs, since, i.starvationMs);
  if (!(hostLost || starved)) return { lossObservedAtMs: 0, clockStartedHostAbsent: false, claim: false };
  if (hostLost && !hasSurvivorToHostFor(i.seatedSurvivorIds, i.hostPeerId)) {
    // S192 ROUND-1 — never START a clock here; KEEP one only if it began with the host already absent.
    return i.lossObservedAtMs !== 0 && i.clockStartedHostAbsent
      ? { lossObservedAtMs: i.lossObservedAtMs, clockStartedHostAbsent: true, claim: false }
      : { lossObservedAtMs: 0, clockStartedHostAbsent: false, claim: false };
  }
  const starting = i.lossObservedAtMs === 0;
  const obs = starting ? i.nowMs : i.lossObservedAtMs;
  const clockStartedHostAbsent = starting ? hostLost : i.clockStartedHostAbsent;
  if (i.ladderDelayMs === null || i.nowMs - obs < i.graceMs + i.ladderDelayMs) {
    return { lossObservedAtMs: obs, clockStartedHostAbsent, claim: false };
  }
  return { lossObservedAtMs: obs, clockStartedHostAbsent, claim: true };
}

/** When did the followed host last (re)appear on our transport? Pure; `main.ts` keeps the state. */
export interface HostPresence {
  readonly hostPeerId: string | null;
  readonly present: boolean;
  readonly presentSinceMs: number;
}
export function stepHostPresence(prev: HostPresence, hostPeerId: string | null, present: boolean, nowMs: number): HostPresence {
  const wasPresent = prev.hostPeerId === hostPeerId && prev.present;
  return {
    hostPeerId,
    present,
    presentSinceMs: present && !wasPresent ? nowMs : prev.hostPeerId === hostPeerId ? prev.presentSinceMs : 0,
  };
}

/**
 * ⭐ S189 fix round (audit NET-5/NET-6) — the per-frame CONNECTION decision `main.ts` used to make inline:
 * the RECONNECTING / MIGRATING / TERMINAL overlay, and whether this frame starts a reconnect attempt.
 * `main.ts` applies the plan (overlay calls, the attempt itself); this decides it, and
 * `connectionFrame.test.ts` drives it frame by frame. Behaviour is the S189 C4 loop exactly:
 *   · a loss opens the grace (`RECONNECT_GRACE_MS`) and schedules the first attempt
 *     (`RECONNECT_FIRST_RETRY_DELAY_MS`); a client retries every `RECONNECT_RETRY_MS`, past the grace too;
 *   · the MIGRATION case (host lost, other survivors connected) never retries — tearing the transport
 *     would drop the claim — and shows MIGRATING until the ladder's worst case (`migrationExtraMs`);
 *   · a host never retries; peers coming back hide the overlay and end the episode.
 */
export type ConnectionOverlay =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'reconnecting'; readonly secondsLeft: number }
  | { readonly kind: 'migrating'; readonly secondsLeft: number }
  | {
      readonly kind: 'terminal';
      readonly cause: TerminalLossCause;
      /**
       * ⭐ S192 SEAM-1 — a CLIENT whose loop is still retrying behind the overlay (until `RECONNECT_GIVE_UP_MS`).
       * The help line must not say "return to title to retry": Return to Title ENDS the retry.
       */
      readonly retrying: boolean;
      /** ⭐ S192 SEAM-1 — a HOST still inside the give-up window: its clients may still be retrying back to it. */
      readonly waitingForPeers: boolean;
    };

export interface ConnectionFrameInput {
  readonly nowMs: number;
  readonly zombieDeposed: boolean;
  /** Networked, PLAYING, with a transport, and (no peers, or the followed host gone from it). */
  readonly peersGone: boolean;
  readonly isHost: boolean;
  readonly hasRoomCode: boolean;
  /** Host lost but other survivors still connected (a warranted client): the migration's own window. */
  readonly migrationCase: boolean;
  readonly peerCount: number;
  /** Episode state, carried by main.ts: the grace deadline (0 = no episode) and the next attempt time. */
  readonly reconnectUntilMs: number;
  readonly nextRetryMs: number;
  /** How far past the grace the MIGRATING window runs (CLAIM_LADDER_MS × MAX_PLAYERS + 5000). */
  readonly migrationExtraMs: number;
  /**
   * ⭐ S191 (NETFR-3) — when `stepMigrationClaim`'s claim clock started (its `lossObservedAtMs`; 0 = not
   * running). After our own transport loss it starts only when a survivor is visible without the host, so
   * it can be LATER than the loss; the MIGRATING window then runs from it instead (never shorter).
   */
  readonly claimClockSinceMs: number;
}
export interface ConnectionFramePlan {
  readonly reconnectUntilMs: number;
  readonly nextRetryMs: number;
  /** Start a reconnect attempt this frame (disconnect, then join the same room again). */
  readonly retry: boolean;
  readonly overlay: ConnectionOverlay;
}

export function planConnectionFrame(i: ConnectionFrameInput): ConnectionFramePlan {
  if (i.zombieDeposed) {
    return {
      reconnectUntilMs: i.reconnectUntilMs,
      nextRetryMs: i.nextRetryMs,
      retry: false,
      overlay: { kind: 'terminal', cause: 'zombieDeposed', retrying: false, waitingForPeers: false },
    };
  }
  if (!i.peersGone) {
    return { reconnectUntilMs: 0, nextRetryMs: i.nextRetryMs, retry: false, overlay: { kind: 'hidden' } };
  }
  let reconnectUntilMs = i.reconnectUntilMs;
  let nextRetryMs = i.nextRetryMs;
  if (reconnectUntilMs === 0) {
    reconnectUntilMs = i.nowMs + RECONNECT_GRACE_MS;
    nextRetryMs = i.nowMs + RECONNECT_FIRST_RETRY_DELAY_MS;
  }
  // S189 NET-1 backstop: the episode began a grace before its deadline.
  const gaveUp = i.nowMs - (reconnectUntilMs - RECONNECT_GRACE_MS) >= RECONNECT_GIVE_UP_MS;
  const retry = !gaveUp && reconnectRetryDue({
    nowMs: i.nowMs,
    nextRetryMs,
    isHost: i.isHost,
    hasRoomCode: i.hasRoomCode,
    migrationCase: i.migrationCase,
  });
  if (retry) nextRetryMs = i.nowMs + RECONNECT_RETRY_MS;
  // S191 NETFR-3 — the window covers the claim ladder counted from the claim clock, if that began later.
  const anchorMs = i.claimClockSinceMs > 0 ? Math.max(reconnectUntilMs, i.claimClockSinceMs + RECONNECT_GRACE_MS) : reconnectUntilMs;
  const migrationDeadlineMs = anchorMs + i.migrationExtraMs;
  let overlay: ConnectionOverlay;
  if (i.nowMs < reconnectUntilMs) {
    overlay = i.migrationCase
      ? { kind: 'migrating', secondsLeft: (migrationDeadlineMs - i.nowMs) / 1000 }
      : { kind: 'reconnecting', secondsLeft: (reconnectUntilMs - i.nowMs) / 1000 };
  } else if (i.migrationCase && i.nowMs < migrationDeadlineMs) {
    overlay = { kind: 'migrating', secondsLeft: (migrationDeadlineMs - i.nowMs) / 1000 };
  } else {
    overlay = {
      kind: 'terminal',
      cause: terminalLossCause({ zombieDeposed: false, migrationCase: i.migrationCase, peerCount: i.peerCount }),
      // S192 SEAM-1 — the same predicate `reconnectRetryDue` gates on, minus the per-attempt time.
      retrying: !gaveUp && !i.isHost && i.hasRoomCode && !i.migrationCase,
      waitingForPeers: !gaveUp && i.isHost,
    };
  }
  return { reconnectUntilMs, nextRetryMs, retry, overlay };
}

/**
 * ⭐ S189 fix round (audit NET-5) — which edge of the terminal overlay this frame is, for the E3 log lines.
 * The overlay also hides when the player LEAVES (Return to Title tears the session down, so nothing is
 * "gone" any more); that is a dismissal, and the first cut logged it as `CONNECTION RESTORED`.
 * `stillInMatch` = networked, PLAYING, with a transport.
 */
export type ConnectionEdge = 'lost' | 'restored' | 'dismissed';
export function connectionEdge(i: {
  readonly wasLost: boolean;
  readonly isLost: boolean;
  readonly stillInMatch: boolean;
}): ConnectionEdge | null {
  if (i.isLost && !i.wasLost) return 'lost';
  if (!i.isLost && i.wasLost) return i.stillInMatch ? 'restored' : 'dismissed';
  return null;
}

/**
 * ⛔ S189 fix round (audit NET-1) — A REJOIN MUST PROVE IT REACHED THE SAME MATCH.
 *
 * The loop retries past the grace, and a host's room code is fixed per PAGE LOAD, so a client left on
 * the terminal overlay could rejoin the host's NEXT lobby or match: a ghost seat there, and a frozen old
 * board here with the overlay cleared.
 *
 * ⛔ S191 (audit NETFR-1/2) — AND THE PROOF MUST BE POSITIVE. S189 inferred both verdicts from absence,
 * and each inference had a reachable counter-case:
 *   · "LOBBY_PRESENCE, then no snapshot for 5 s" = a lobby. But a host whose tab is HIDDEN pauses its
 *     snapshots (they are sent from rAF) while Trystero's event-driven signalling still answers our join
 *     with presence — so a live match was read as a lobby and the player sent to title (NETFR-1);
 *   · "the seq restarted" = a new match. But a host's next match whose seq has already passed our old
 *     watermark sailed through, and we rendered a stranger's match from our old seat (NETFR-2).
 * Now the host mints a per-match id at Begin (`mintMatchId`) and says it on START_GAME_SIGNAL, on
 * LOBBY_PRESENCE together with its phase (`HostPhase`, from its `world.gameState`), and on NETSNAPSHOT:
 *   · 'lobby'     — LOBBY_PRESENCE in phase LOBBY: the host is in a lobby, at once;
 *   · 'new-match' — an id that is not ours (presence in phase MATCH, or — while a rejoin is PENDING — a
 *                   snapshot); the snapshot is not applied. Fallback when either side has no id: the S189
 *                   seq-regression test (`HOST_SEQ_REGRESSION_SLACK`);
 *   · nothing     — our id, or no phase/id at all: an absent field is never a lobby verdict (a frozen or
 *                   hidden host is left to D4's takeover or to its own thaw).
 * `clientHandlers.ts` classifies (it sees the message); `main.ts` stamps and decides once per frame.
 */
export type HostSignal = 'lobby' | 'new-match';

export interface HostMessageInput {
  /** A client, PLAYING. */
  readonly inMatch: boolean;
  /** Sent by the host this client follows (`session.hostPeerId`). */
  readonly fromFollowedHost: boolean;
  readonly kind: string;
  readonly snapshotSeq?: number;
  readonly epoch?: number;
  /** ClientSync's watermark (0 = nothing accepted, or reset by an epoch advance). */
  readonly lastSeq: number;
  readonly currentEpoch: number;
  /** ⭐ S191 — `isRejoinPending`: only then must a snapshot prove its match before it is applied. */
  readonly rejoinPending: boolean;
  /** ⭐ S191 — the match id this client holds (`NetSession.matchId`), or null. */
  readonly ourMatchId: string | null;
  /** ⭐ S191 — the message's `matchId` (NETSNAPSHOT / LOBBY_PRESENCE), if it carries one. */
  readonly matchId?: string;
  /** ⭐ S191 — LOBBY_PRESENCE's `phase`, if it carries one. */
  readonly hostPhase?: HostPhase;
}

/** A classified snapshot of 'new-match' is NOT applied (`clientHandlers.ts` returns before `receive`). */
export function classifyHostMessage(i: HostMessageInput): HostSignal | null {
  if (!i.inMatch || !i.fromFollowedHost) return null;
  const otherMatch = i.matchId !== undefined && i.ourMatchId !== null && i.matchId !== i.ourMatchId;
  if (i.kind === 'LOBBY_PRESENCE') {
    if (i.hostPhase === 'LOBBY') return 'lobby';
    return i.hostPhase === 'MATCH' && otherMatch ? 'new-match' : null;
  }
  if (i.kind !== 'NETSNAPSHOT' || i.snapshotSeq === undefined) return null;
  // The HOLD: while a rejoin is pending, an id on both sides decides — and only ours is released.
  if (i.rejoinPending && i.matchId !== undefined && i.ourMatchId !== null) return otherMatch ? 'new-match' : null;
  if (
    (i.epoch ?? 0) === i.currentEpoch &&
    i.lastSeq > 0 &&
    i.snapshotSeq + HOST_SEQ_REGRESSION_SLACK < i.lastSeq
  ) {
    return 'new-match';
  }
  return null;
}

/** A rejoin is PENDING from the moment the loop fires an attempt until a snapshot is accepted. */
export function isRejoinPending(lastRejoinAttemptAtMs: number, lastAcceptedAtMs: number): boolean {
  return lastRejoinAttemptAtMs !== 0 && lastAcceptedAtMs < lastRejoinAttemptAtMs;
}

export interface HostMovedOnInput {
  /** When the loop last started a reconnect attempt (0 = none this match). */
  readonly lastRejoinAttemptAtMs: number;
  /** ClientSync's last accepted snapshot (0 = none). */
  readonly lastAcceptedAtMs: number;
  /** When the followed host last sent each signal (0 = never). */
  readonly lobbyAtMs: number;
  readonly newMatchAtMs: number;
}

/**
 * Did the rejoin land in the host's NEXT lobby or match? Only while a rejoin is PENDING, and only on a
 * signal received after the attempt fired (a mid-match presence on another peer's join is older).
 * ⛔ S191 — the S189 docblock here said a frozen-but-connected host "never starts an attempt … so this
 * can never pre-empt D4's takeover". FALSE after a transport loss + rejoin: the rejoin can land on a host
 * that is hidden or frozen — D4's own case, with a rejoin pending. What keeps D4 whole now is that such a
 * host proves nothing either way: its presence says MATCH with our id (or carries no phase at all), so no
 * signal is raised, the snapshots it does not send are simply awaited, and D4 (starvation counted from
 * the host's reappearance, `stepMigrationClaim`) or its thaw decides — never a verdict from silence.
 */
export function hostMovedOn(i: HostMovedOnInput): 'new-match' | 'lobby' | null {
  if (!isRejoinPending(i.lastRejoinAttemptAtMs, i.lastAcceptedAtMs)) return null;
  if (i.newMatchAtMs > i.lastRejoinAttemptAtMs) return 'new-match';
  if (i.lobbyAtMs > i.lastRejoinAttemptAtMs) return 'lobby';
  return null;
}
