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
 */
export const HOST_SEQ_REGRESSION_SLACK = 50;
/**
 * ⭐ S189 fix round (audit NET-1) — after a rejoin, the host said LOBBY_PRESENCE and not one snapshot has
 * been accepted for this long: it is in a lobby, not our match. ⚠ MINE: a live host feeds a rejoiner
 * snapshots within a frame or two (10 Hz); 5 s is margin for a host lagging under load.
 */
export const HOST_LOBBY_CONFIRM_MS = 5_000;

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
}
export interface MigrationClaimStep {
  readonly lossObservedAtMs: number;
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
 */
export function stepMigrationClaim(i: MigrationClaimInput): MigrationClaimStep {
  const hostPresent = i.hostPeerId !== null && i.alivePeerIds.has(i.hostPeerId);
  const hostLost = i.hostPeerId !== null && !hostPresent;
  const since = hostPresent ? Math.max(i.lastAcceptedAtMs, i.hostPresentSinceMs) : i.lastAcceptedAtMs;
  const starved = isSnapshotStarved(i.nowMs, since, i.starvationMs);
  if (!(hostLost || starved)) return { lossObservedAtMs: 0, claim: false };
  const obs = i.lossObservedAtMs === 0 ? i.nowMs : i.lossObservedAtMs;
  if (i.ladderDelayMs === null || i.nowMs - obs < i.graceMs + i.ladderDelayMs) {
    return { lossObservedAtMs: obs, claim: false };
  }
  if (hostLost && !hasSurvivorToHostFor(i.alivePeerIds, i.hostPeerId)) {
    return { lossObservedAtMs: obs, claim: false };
  }
  return { lossObservedAtMs: obs, claim: true };
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
  | { readonly kind: 'terminal'; readonly cause: TerminalLossCause };

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
      overlay: { kind: 'terminal', cause: 'zombieDeposed' },
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
  const migrationDeadlineMs = reconnectUntilMs + i.migrationExtraMs;
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
    };
  }
  return { reconnectUntilMs, nextRetryMs, retry, overlay };
}

/**
 * ⛔ S189 fix round (audit NET-1) — A REJOIN MUST PROVE IT REACHED THE SAME MATCH.
 *
 * The loop retries past the grace, and a host's room code is fixed per PAGE LOAD, so a client left on
 * the terminal overlay could rejoin the host's NEXT lobby or match: a ghost seat there, and a frozen old
 * board here with the overlay cleared. Two local signals, no wire change:
 *   · 'new-match' — a snapshot whose sequence restarted (see `HOST_SEQ_REGRESSION_SLACK`);
 *   · 'lobby-presence' — LOBBY_PRESENCE from the host while we are in a match. ⚠ NOT a verdict alone:
 *     the host broadcasts it on every peer join in ANY state, including our own legitimate rejoin to a
 *     live match — `hostMovedOn` confirms it by the silence that follows.
 * `clientHandlers.ts` classifies (it sees the message); `main.ts` stamps and decides once per frame.
 */
export type HostSignal = 'lobby-presence' | 'new-match';

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
}

export function classifyHostMessage(i: HostMessageInput): HostSignal | null {
  if (!i.inMatch || !i.fromFollowedHost) return null;
  if (i.kind === 'LOBBY_PRESENCE') return 'lobby-presence';
  if (
    i.kind === 'NETSNAPSHOT' &&
    i.snapshotSeq !== undefined &&
    (i.epoch ?? 0) === i.currentEpoch &&
    i.lastSeq > 0 &&
    i.snapshotSeq + HOST_SEQ_REGRESSION_SLACK < i.lastSeq
  ) {
    return 'new-match';
  }
  return null;
}

export interface HostMovedOnInput {
  readonly nowMs: number;
  /** When the loop last started a reconnect attempt (0 = none this match). */
  readonly lastRejoinAttemptAtMs: number;
  /** ClientSync's last accepted snapshot (0 = none). */
  readonly lastAcceptedAtMs: number;
  /** When the followed host last sent each signal (0 = never). */
  readonly lobbyPresenceAtMs: number;
  readonly newMatchAtMs: number;
}

/**
 * Did the rejoin land in the host's NEXT lobby or match? Only while a rejoin is PENDING — an attempt has
 * fired and no snapshot has been accepted since. That one condition is what keeps the rest safe:
 *   · a live-match rejoin accepts the host's next snapshot and is no longer pending;
 *   · a host that is merely frozen while still connected (the S124 D4 case) never starts an attempt —
 *     the loop only retries on transport loss — so this can never pre-empt D4's takeover;
 *   · a signal from before the attempt (a mid-match LOBBY_PRESENCE on another peer's join) is ignored.
 */
export function hostMovedOn(i: HostMovedOnInput): 'new-match' | 'lobby' | null {
  if (i.lastRejoinAttemptAtMs === 0 || i.lastAcceptedAtMs >= i.lastRejoinAttemptAtMs) return null;
  if (i.newMatchAtMs > i.lastRejoinAttemptAtMs) return 'new-match';
  if (i.lobbyPresenceAtMs > i.lastRejoinAttemptAtMs && i.nowMs - i.lobbyPresenceAtMs >= HOST_LOBBY_CONFIRM_MS) {
    return 'lobby';
  }
  return null;
}
