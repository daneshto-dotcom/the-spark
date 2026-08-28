/**
 * SPARK — S155 P1: **A JOIN THAT CANNOT SUCCEED MUST SAY SO.**
 *
 * ## The report this module answers
 *
 * Owner, after an evening of trying to play with a friend: *"multiplayer mdoe doesnt work, neither
 * the quick match nor the host/join the server. you see that player already in when trying to
 * connect and it keeps saying connected... but then its stuck."*
 *
 * ⛔ THE WORST PART OF THAT BUG WAS NOT THE FAILURE, IT WAS THE SILENCE. Reading the joiner's router
 * (`clientHandlers.route`) against `verifyHostAttest`, there is exactly one state that produces every
 * clause of that sentence at once — the host attestation never latching:
 *
 *   | the owner saw | the mechanism |
 *   |---|---|
 *   | "you see that player already in" | `LOBBY_PRESENCE` is BUFFERED pre-latch ⇒ `presenceRoster` stays null ⇒ the rack falls back to COUNT-based seat derivation, which is driven by transport `peerCount` and knows nothing about trust. The lobby looks populated **because the fallback is drawing it**. |
 *   | "it keeps saying connected..." | the status line is driven by `PEER_STATUS{peerCount>0}` — also transport-level, also indifferent to trust. |
 *   | "but then its stuck" | `START_GAME_SIGNAL` is buffered too ⇒ the joiner never leaves LOBBY; and `hostAuthFilter` independently drops `NETSNAPSHOT` ⇒ the S39 P1 snapshot fallback, which exists *precisely* to rescue a Begin that went missing, cannot fire either. |
 *   | (and nothing at all was reported) | attest failures were **deliberately console-only**: *"a spoofer's failed attest must not scare the user while the genuine host verifies fine."* Sound reasoning for a SINGLE failure; catastrophic as the policy for a PERMANENT one. |
 *
 * Three independent recovery paths, all gated behind one silent async predicate, with no timeout and
 * no way out of the screen.
 *
 * ## ⛔ WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 * It does **not** lower the trust bar. My first design admitted a buffered Begin when it was the only
 * host-candidate in the room, reasoning that S82's attestation exists to beat a *third* peer and with
 * one peer there is no spoofer. The S155 Council (GROK-ANALYST) killed it as a BLOCKER and was right:
 * the room code is **public** in quickmatch (it is advertised over Nostr) and room membership is racy
 * and async, so *"the only host-candidate peer"* is **attacker-controllable** — an actor who knows the
 * code can arrange to be the only visible candidate, send an unattested `START_GAME_SIGNAL`, and be
 * handed unfiltered `NETSNAPSHOT` authority. That is strictly worse than being stuck. So: nothing is
 * ever admitted without a valid attestation. What changes is that the failure becomes **legible** and
 * the player gets **agency**.
 *
 * ## The design: report the LAYER, then the WAY OUT
 *
 * A player does not care that an ECDSA signature failed. They care (a) that the game knows it is
 * stuck, so they stop waiting, and (b) what to do next. So every message below names the layer in
 * plain language and then gives the two live exits: Back (retry) or VS BOTS. Both already exist on
 * the title screen one click away, which is why this module ships guidance rather than a new lobby
 * button — a new surface for a path taken once, needing its own layout + `hudSurfaces` registration,
 * would be more code and more risk for less certainty than pointing at the button already there.
 *
 * Pure, no Pixi, no timers, no I/O — the `lobbyStateMachine.ts` pattern, and for the same reason:
 * this is the only way lobby logic in this repo ever gets real test coverage. The strings are
 * exported so a canary can pin them (mirror of `LOBBY_STATUS`).
 */

import type { AttestDiagnosis } from './hostIdentity.ts';
import { formatAttestDiagnosis } from './hostIdentity.ts';

/**
 * How long a joiner may sit with a connected peer and NO verified host before we call it stuck.
 *
 * 8 s is chosen against the two real timings this sits between, not picked for feel: a genuine
 * attest verify is a single P-256 signature check (~ms, and the identity keygen it depends on was
 * awaited at boot), while `HANDSHAKE_TIMEOUT_MS` — the transport's own patience — is 30 s. So 8 s is
 * ~1000× a healthy verification and comfortably inside the window where a human is still watching
 * the screen wondering whether to wait. Undershooting would scare people during a slow-but-fine
 * handshake; overshooting reproduces the bug being fixed.
 */
export const JOIN_STALL_WARN_MS = 8_000;

/**
 * Per-connect trust-progress facts. Lives on the NetSession (cleared by `teardownNet`, re-made on
 * every fresh connect) because the stall is a property of THIS join attempt, not of the page.
 *
 * Deliberately dumb: counters and timestamps only. All interpretation happens in the pure functions
 * below, so the interpretation is testable without a transport.
 */
export interface JoinTrustState {
  /** `performance.now()` at the first peer we ever saw this attempt. null ⇒ nobody has connected. */
  firstPeerAtMs: number | null;
  /** How many attestations we have been offered (any sender). */
  attestsSeen: number;
  /** How many of those failed verification. */
  attestFailures: number;
  /** `formatAttestDiagnosis` of the most recent failure — the log-grade detail. */
  lastFailure: string | null;
  /** Plain-language reason of the most recent failure, for the player-facing line. */
  lastReason: AttestDiagnosis['reason'] | null;
  /** Have we buffered a Begin we could not apply? (i.e. the host DID press Begin and we lost it.) */
  beginBuffered: boolean;
  /** Have we buffered a presence beacon we could not apply? */
  presenceBuffered: boolean;
  /**
   * Has the stall already been reported to the player for THIS attempt?
   *
   * ⚠ IT LIVES HERE, NOT IN THE RENDER LOOP, AND THAT IS THE WHOLE REASON. A `let` in main.ts would
   * need resetting at every entry point that starts a fresh attempt — host-start, join-attempt,
   * quickmatch's own joinCode path, Back-to-title, auto-reconnect — and missing ONE of them leaves a
   * stale "stuck" message on a healthy join, or worse, suppresses the message on the retry the player
   * was just told to make. Hanging it off the per-attempt object makes the lifetime correct by
   * construction: a new attempt makes a new JoinTrustState, which has never reported anything.
   */
  stallReported: boolean;
}

export function makeJoinTrustState(): JoinTrustState {
  return {
    firstPeerAtMs: null,
    attestsSeen: 0,
    attestFailures: 0,
    lastFailure: null,
    lastReason: null,
    beginBuffered: false,
    presenceBuffered: false,
    stallReported: false,
  };
}

/** Record a completed verification attempt onto the trust state. */
export function noteAttestResult(s: JoinTrustState, d: AttestDiagnosis): void {
  s.attestsSeen++;
  if (!d.ok) {
    s.attestFailures++;
    s.lastFailure = formatAttestDiagnosis(d);
    s.lastReason = d.reason ?? null;
  }
}

/**
 * The player-facing half of each message. Kept separate from the advice so the advice is appended
 * exactly once and can never drift between branches.
 */
export const JOIN_STALL = {
  /** The host answered, but its identity proof did not check out. The dangerous-looking one. */
  UNVERIFIED_HOST: 'Cannot verify this host',
  /** Nobody has offered an identity at all — a peer is connected but silent. */
  NO_IDENTITY: 'Connected, but this host has not identified itself',
  /** ⭐ The most damning case: the host DID press Begin, and we had to throw it away. */
  BEGIN_REJECTED: 'The host started the match, but we could not verify them',
  /** Advice, appended to every branch. Names both exits that actually exist today. */
  ADVICE: 'press Back to retry, or play VS BOTS.',
} as const;

/** Human-readable gloss per failure reason. Never shows crypto jargon to a player. */
function reasonGloss(reason: AttestDiagnosis['reason'] | null): string {
  switch (reason) {
    case 'CODE_MISMATCH':
      return 'the room code does not match this host';
    case 'SIGNATURE_INVALID':
      return 'its identity signature did not check out';
    case 'KEY_IMPORT_FAILED':
      return 'its identity key was unreadable';
    case 'MALFORMED':
      return 'its identity message was malformed';
    default:
      return 'the identity check did not complete';
  }
}

/**
 * Is this join attempt STUCK, and if so what do we tell the player?
 *
 * Returns null while there is nothing to report — which is the overwhelmingly common case, so this
 * is safe to call every frame. `verified` is `session.hostVerifiedPeerId !== null`.
 *
 * ⚠ ORDER MATTERS, most-informative first. `BEGIN_REJECTED` outranks the others because it is the
 * only branch that proves the *host did its part*: they pressed Begin, we received it, and we threw
 * it away. Telling that player merely "cannot verify host" would understate what happened, and it is
 * the exact case the owner hit.
 */
export function joinStallMessage(
  s: JoinTrustState,
  nowMs: number,
  verified: boolean,
): string | null {
  if (verified) return null; // trust established — nothing to report, ever
  if (s.firstPeerAtMs === null) return null; // nobody has connected yet; not a stall
  if (nowMs - s.firstPeerAtMs < JOIN_STALL_WARN_MS) return null; // still inside the patience window

  if (s.beginBuffered) {
    return `${JOIN_STALL.BEGIN_REJECTED} (${reasonGloss(s.lastReason)}) — ${JOIN_STALL.ADVICE}`;
  }
  if (s.attestFailures > 0) {
    return `${JOIN_STALL.UNVERIFIED_HOST}: ${reasonGloss(s.lastReason)} — ${JOIN_STALL.ADVICE}`;
  }
  return `${JOIN_STALL.NO_IDENTITY} — ${JOIN_STALL.ADVICE}`;
}
