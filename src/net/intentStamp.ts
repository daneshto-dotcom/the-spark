/**
 * SPARK — host-side intent stamping (S62 N-player).
 *
 * Pure helper extracted from hostHandlers.ts so it is unit-testable WITHOUT a
 * live Trystero transport (the handlers import the WebRTC transport; this does
 * not). #test-via-pure-helper-export pattern.
 */

import type { GameAction } from '../state/world.ts';
import type { PlayerId } from '../types.ts';

/**
 * Return `action` with its playerId overridden to the SENDER's assigned seat
 * (host-side anti-spoof / anti-collision). The host looks up which seat a
 * peerId was assigned at Begin and stamps every incoming INTENT with it, so a
 * client can only ever act as its OWN seat — two clients can't both drive seat
 * 1, and no client can move another player's avatar/structures.
 *
 * Actions without a playerId field pass through unchanged (same reference). The
 * cast is safe: only the value of an existing PlayerId field is replaced, so the
 * discriminated-union shape is preserved.
 */
export function stampSenderSeat(action: GameAction, seat: PlayerId): GameAction {
  return 'playerId' in action ? ({ ...action, playerId: seat } as GameAction) : action;
}

/**
 * S124 P1 (host-migration D4) — FAIL-CLOSED stamping: an INTENT from a peer with no seat
 * assignment returns null (caller drops + counts raceRejects). Replaces the S62 "unknown peer →
 * apply as-is" leniency on BOTH host paths (original + migrated successor): that fallthrough
 * honored a wire-claimed playerId, letting any swarm-joiner spoof an arbitrary seat mid-match
 * (S124 Council R1 GEMINI "identity theft", provenance corrected to pre-existing). Safe to
 * close: every legitimate sender is in the roster-derived seat map from Begin, and an in-page
 * reconnect keeps its Trystero selfId, so the frozen map re-binds it — there is no honest
 * unknown-peer INTENT flow.
 */
export function stampOrReject(action: GameAction, seat: PlayerId | undefined): GameAction | null {
  return seat === undefined ? null : stampSenderSeat(action, seat);
}
