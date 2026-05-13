/**
 * SPARK — net-layer configuration (extracted from transport.ts at S22 P1
 * per §XV anti-bloat). Pure constants + one classifier function. Imported
 * by transport.ts so the transport module focuses on the NetTransport class.
 *
 * Sources of these values (preserved for archival context):
 *   - NOSTR_RELAYS: S19 P4 deterministic pinned set replacing Trystero 0.24's
 *     "5 random of 55" default (sub-sampling stall risk on dead relays).
 *   - ICE_SERVERS: S20 P0 — Google STUN x2 (fast direct-NAT) + openrelay
 *     free TURN x3 (UDP/80, TCP/443, UDP/443) for symmetric-NAT users.
 *   - HANDSHAKE_TIMEOUT_MS: S20 P0 joinRoom 3rd-arg, surfaces signaling-stuck
 *     handshakes as onJoinError after 30 s.
 *   - ICE_POLL_*: S20 P0 1Hz observability poll capped at 30 s = max 30 log
 *     lines via room.getPeers() while peerSet empty.
 *   - classifyJoinError: S20 P0 / Council R1 Gemini #4 — maps raw error
 *     strings to user-friendly UX hints.
 */

export const APP_ID = 'spark-game-v1';

export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=udp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export const HANDSHAKE_TIMEOUT_MS = 30000;
export const ICE_POLL_INTERVAL_MS = 1000;
export const ICE_POLL_MAX_DURATION_MS = 30000;

/**
 * S20 P0 — classify a `details.error` string from Trystero's onJoinError into
 * a user-friendly UX hint. Substring-matched (case-insensitive). Falls back
 * to the raw error if no pattern matches (Council R1 Gemini #4).
 */
export function classifyJoinError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (lower.includes('timeout')) {
    return `Signaling timeout — try again (${rawError})`;
  }
  if (lower.includes('rejected') || lower.includes('invalid') || lower.includes('denied')) {
    return `Connection rejected — check the room code (${rawError})`;
  }
  return `Signaling: ${rawError}`;
}
