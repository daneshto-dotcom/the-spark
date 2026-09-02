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
 *
 * ⭐ S159 P5 — **TWO OF THE THREE WERE DEAD, WHICH IS WHY THE OWNER'S LOBBY SAID `torrent:fail`.**
 *
 * The owner pressed TEST CONNECTION on both workstations and sent the result: matchmaking
 * `[nostr:7/7 torrent:fail]`. Measured here with a REAL WebSocket handshake (not an HTTPS GET — see
 * `scripts/probe-relays.mjs`, which was giving a false verdict; details there), 2026-09-02:
 *
 *     wss://tracker.openwebtorrent.com          OPEN   ← kept
 *     wss://tracker.btorrent.xyz                ERROR  ← removed, has been dead for years
 *     wss://tracker.files.fm:7073/announce      ERROR  ← removed (non-standard port, refuses)
 *     wss://tracker.webtorrent.dev              OPEN   ← added, the replacement
 *
 * ⚠ WHY TWO DEAD ENTRIES COULD KILL THE WHOLE STRATEGY RATHER THAN DEGRADE IT: `transport.ts`
 * passes `redundancy: relayUrls.length`, so the list length IS the requirement. Three URLs asked
 * for three working trackers, and the strategy failed as a unit — the fallback that exists for
 * "uncorrelated failure domain" has therefore been contributing NOTHING since those hosts went
 * down, while reporting itself in red on the owner's diagnostic strip next to the real blocker
 * (no TURN). A dead fallback that cries wolf is worse than no fallback.
 *
 * ⚠ AND THIS LIST WILL DECAY AGAIN. That is the nature of free public infrastructure, and it is
 * why the accompanying test asserts the two known-dead hosts are ABSENT rather than asserting the
 * live ones are present: a test that pins living hosts would have to be edited every time the
 * internet moves, whereas "never re-add a host we measured as dead" stays true forever. Re-measure
 * with `npm run probe-relays` when the strip shows red.
 */
export const TORRENT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
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

/**
 * ⭐ S157 N1 — **THE TURN SERVERS WERE DEAD, AND THAT IS WHY MULTIPLAYER HANGS ON "Connecting...".**
 *
 * Owner, after trying to play with his brother in Israel: *"we still could not connect to each
 * other. not through quick match nor from hosting (one hosts a server and other inputs code). it
 * gets stuck at connecting and never connects!"*
 *
 * ## The measurement, taken in a real browser against the LIVE site
 *
 * An `RTCPeerConnection` built with the shipped `ICE_SERVERS` gathered:
 *   `host: 1, srflx: 1, relay: 0` — and every TURN url reported an error:
 *   `400 TURN allocate error` on :80 and :443/udp (the credentials are REJECTED), and
 *   `701 Failed to establish connection` on :443/tcp.
 *
 * The `openrelayproject` credentials belonged to Metered's free OpenRelay service, which has since
 * been retired; the hostname still resolves (it now fronts their paid product), so nothing looked
 * broken from the outside. **`relay: 0` means the game has been running STUN-ONLY.**
 *
 * ## Why that produces exactly the owner's symptom
 *
 * STUN alone connects two peers only when at least one side's NAT is permissive. When both sides sit
 * behind symmetric NAT or carrier-grade NAT — the norm on mobile networks, and very likely across two
 * countries — the only way through is a TURN *relay*. With no relay candidate the ICE check never
 * succeeds, Trystero never fires a peer event, and the lobby sits on "Connecting..." forever. It also
 * explains why QUICKMATCH and HOST-WITH-A-CODE fail identically: they share this one config
 * (`quickmatch.ts` and `transport.ts` both read `ICE_SERVERS`).
 *
 * And it explains the intermittency — the owner HAS connected before. `srflx: 1` proves STUN works,
 * so friendly-NAT pairs still connect. It is the hostile pairs that cannot.
 *
 * ## What this change does, and what it honestly cannot
 *
 * ⛔ **A working TURN server cannot be shipped in source.** TURN relays real game traffic, so it costs
 * real bandwidth — which is why every free one dies. Four candidates were probed live in the browser
 * (`openrelay.metered.ca`, `global.relay.metered.ca`, `freestun.net`, `freeturn.net`) and **all four
 * returned zero relay candidates.** There is no credential-free option left to hard-code.
 *
 * So: the dead entries are REMOVED (they cost gathering time and error noise on every single
 * connection attempt, including the ones that would otherwise succeed), the STUN pool is widened
 * across three independent operators, and TURN becomes **build-time configurable** so provisioning an
 * account is a credential paste and not a code change. See `TURN_SETUP.md`.
 */

/** Widened S157 — three independent operators, so one going down is not an outage. */
const STUN_ONLY: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/**
 * ⭐ S157 N1 — TURN from the build environment. Set these and rebuild; nothing else changes.
 *
 *   VITE_TURN_URLS       comma-separated, e.g. "turn:x.example:3478,turns:x.example:5349?transport=tcp"
 *   VITE_TURN_USERNAME
 *   VITE_TURN_CREDENTIAL
 *
 * Parsed defensively: a half-filled config (urls but no credential) is IGNORED rather than shipped,
 * because a malformed ICE server is another silent `400 allocate error` — the precise failure this
 * whole change exists to end.
 */
function turnFromEnv(): RTCIceServer[] {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const urls = (env.VITE_TURN_URLS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  const username = (env.VITE_TURN_USERNAME ?? '').trim();
  const credential = (env.VITE_TURN_CREDENTIAL ?? '').trim();
  if (urls.length === 0 || username === '' || credential === '') return [];
  return [{ urls, username, credential }];
}

/** True when a relay is even possible — consumed by the join preflight to explain a failure. */
export const HAS_TURN_CONFIGURED: boolean = turnFromEnv().length > 0;

export const ICE_SERVERS: RTCIceServer[] = [...STUN_ONLY, ...turnFromEnv()];

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
