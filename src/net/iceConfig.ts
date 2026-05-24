/**
 * SPARK — net-layer configuration (extracted from transport.ts at S22 P1
 * per §XV anti-bloat). Pure constants + classifier function. Imported by
 * transport.ts so the transport module focuses on the NetTransport class.
 *
 * S44 (2026-05-24) — Council R1+R2 synthesis (Full tier):
 *   - NOSTR_RELAYS rotated. S43 dual-NetTransport probe confirmed decay:
 *       damus.io (rate-limited), nostr.wine (paid), relay.nostr.band
 *       (unreachable), eden.nostr.land (paid). KEPT nos.lol, mostr.pub,
 *       purplerelay.com (curl-200 OK). ADDED nostr.mom, offchain.pub,
 *       nostr-pub.wellorder.net, relay.primal.net (curl-200 OK).
 *   - TORRENT_TRACKERS — Council Option C multi-strategy fallback;
 *       BitTorrent WSS trackers under @trystero-p2p/torrent@0.25.0.
 *   - STRATEGY_FLAGS — Council S1δ: MQTT default-OFF (operator lever);
 *       nostr + torrent default-ON. Dynamic-import in transport.ts so
 *       OFF strategies contribute zero bytes to the initial bundle.
 *   - getRelaySockets / classifyJoinError preserved (same API 0.24→0.25).
 *
 * Prior provenance:
 *   - NOSTR_RELAYS (S19 P4): deterministic pinned set replacing Trystero
 *     0.24 default of "5 random of 55" (sub-sampling stall risk).
 *   - ICE_SERVERS (S20 P0): Google STUN x2 + openrelay TURN x3 for
 *     symmetric-NAT users.
 *   - HANDSHAKE_TIMEOUT_MS / ICE_POLL_* (S20 P0): signaling-stuck handshake
 *     surfacing + 1Hz observability poll.
 *   - classifyJoinError (S20 P0 / Council R1 Gemini #4): substring classifier
 *     mapping raw errors to user-friendly UX hints.
 */

export const APP_ID = 'spark-game-v1';

/**
 * S44 rotation (2026-05-24). Empirically verified curl HTTP 200/302 at probe
 * time; NIP-78 functional health surfaces via per-relay telemetry once
 * users connect. See RELAY_HEALTH.md for re-verification runbook.
 */
export const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.primal.net',
];

/**
 * S44 — BitTorrent WSS trackers for @trystero-p2p/torrent@0.25.0 fallback
 * strategy. Public WebTorrent trackers; same decay vector as Nostr relays
 * but uncorrelated failure domain (different operators, different protocol
 * — Council Gemini R1 diversity argument). Defaults sourced from upstream
 * package's `defaultRelayUrls` export; deterministically pinned here so we
 * own the rotation cycle rather than inheriting upstream changes silently.
 */
export const TORRENT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

/**
 * S44 — Council R2 S1δ: MQTT default-OFF (operator lever, not default path
 * — public MQTT brokers face the same economic decay as Nostr; redundancy
 * value diminished). Dynamic-import gated in transport.ts so OFF strategies
 * are tree-shaken from the initial bundle. Flip mqtt to true and rebuild
 * to enable. Nostr stays always-on (primary); torrent default-on (Council
 * Option C diversity); mqtt opt-in.
 */
export const STRATEGY_FLAGS = {
  nostr: true,
  torrent: true,
  mqtt: false,
} as const;

export type StrategyName = keyof typeof STRATEGY_FLAGS;

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
