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
