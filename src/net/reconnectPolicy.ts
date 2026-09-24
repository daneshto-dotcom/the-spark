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
 * ⭐ S189 — may this peer CLAIM the host seat? Only if at least one peer OTHER than the lost host is
 * still connected: host migration exists to keep a match alive for its OTHER survivors, and a claim
 * with nobody to host for hosts an empty match while ending this peer's reconnect loop (a host does
 * not rejoin). `main.ts` already says this in words at the overlay split — *"peerCount === 0 = OUR
 * transport died — the S82 reconnect-cycle is the only path back"* — and its claim block did not
 * honour it. In a 1v1 this means the survivor never claims: it keeps reconnecting instead.
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
