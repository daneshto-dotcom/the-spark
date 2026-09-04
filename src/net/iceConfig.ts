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
 *
 * ⛔ S160 P1 — THE READS ARE DOTTED (`import.meta.env.VITE_TURN_URLS`) AND THAT IS LOAD-BEARING.
 * DO NOT alias `import.meta.env` into a local object and read keys off it.
 *
 * `vite.config.ts` defines the three DOTTED keys — `define: { 'import.meta.env.VITE_TURN_URLS': … }`
 * — so a dotted read is replaced by the explicit define and nothing else has to be true. The
 * previous form (`const env = import.meta.env; env.VITE_TURN_URLS`) had no textual match for that
 * define and worked only because Vite ALSO merges user `import.meta.env.*` defines into its
 * whole-object env replacement. That is Vite-internal behaviour, not a documented contract.
 *
 * S160 P1 measured the emitted bundle to prove it worked (`dist/assets/index-BwUxSBIv.js` carried
 * `{VITE_TURN_CREDENTIAL:"",VITE_TURN_URLS:"",VITE_TURN_USERNAME:""}` with no `.env` on disk, so the
 * define was the only possible carrier) — and that is exactly the problem: it was true by
 * measurement, not by construction. Had a Vite major dropped that merge, this would emit `{}`,
 * every build would ship STUN-only, and the deploy would stay green with nothing red anywhere.
 * `ci.deployGate.test.ts` now pins the dotted form against `vite.config.ts`'s define keys.
 */
/**
 * ⭐ S162 P0 — **THE "DEFENSIVE PARSE" ABOVE WAS NOT DEFENSIVE ENOUGH, AND IT TOOK MULTIPLAYER DOWN
 * COMPLETELY — INCLUDING TWO MACHINES ON THE SAME LAN.**
 *
 * Owner: *"me and my friend cant connect to eachother and neither can my other workstation on the
 * same network!"*, with a screenshot of the lobby reading
 * `SyntaxError: Failed to construct 'RTCPeerConnection': 'urls: "turn:global.relay.metered.ca:80"'
 * is not a valid stun or turn URL`.
 *
 * ## What had happened
 *
 * The three secrets had been set that morning (`gh secret list` → 2026-09-03T06:10Z) by pasting
 * lines straight off **metered.ca's dashboard, which hands you a JavaScript snippet**. Each value
 * therefore arrived carrying its own object-literal wrapper. Measured in the LIVE bundle
 * `index-8UqrIHaf.js`, all three:
 *
 *     VITE_TURN_URLS        'urls: "turn:global.relay.metered.ca:80"'
 *     VITE_TURN_USERNAME    'username: "…"'
 *     VITE_TURN_CREDENTIAL  ' credential: "…"'
 *
 * The old parse trimmed and dropped empties and nothing else, so all three passed the non-empty
 * test, `HAS_TURN_CONFIGURED` went **true**, and the garbage URL was handed to the browser.
 *
 * ⛔ **A BAD ICE URL DOES NOT DEGRADE — IT THROWS.** `new RTCPeerConnection` rejects the entire
 * config synchronously, before gathering a single candidate. That is why even the same-LAN pair
 * failed, where plain `host` candidates connect with no STUN and no TURN at all: the failure was at
 * CONSTRUCTION, upstream of every route. **A dead TURN server costs you the hostile-NAT pairs; a
 * malformed one costs you everybody.** That asymmetry is the whole reason this code exists.
 *
 * ## The rule this encodes
 *
 * Each value is unwrapped (the dashboard-paste shape is recognised and stripped), each URL must
 * match a real ICE scheme, and anything failing is DROPPED with a warning rather than shipped.
 * `urls` empty after validation ⇒ no TURN entry, which is exactly the pre-S157 STUN-only behaviour.
 *
 * ⚠ THE UNWRAP REPAIRS A KNOWN-BAD PASTE RATHER THAN MERELY REJECTING IT, because rejecting it
 * leaves the owner with a green deploy and a dead lobby — the outcome this family of bugs keeps
 * producing. `TURN_CONFIG_NOTE` records what was repaired so the lobby can say so out loud instead
 * of blaming the browser, which is what S162 found it doing (`main.ts` — "disabled by an extension
 * or a policy" was printed for a fault that was entirely ours).
 *
 * ⚠ AND `parseTurnConfig` IS PURE, taking the three raw strings, so the matrix of bad pastes is
 * unit-testable without a WebRTC stack or an `import.meta.env` shim. Only `turnFromEnv` reads env.
 */

/**
 * Every scheme `RTCPeerConnection` accepts, plus a host portion that cannot contain the punctuation
 * a pasted snippet leaves behind. Deliberately permissive about the rest (ports, `?transport=tcp`,
 * bracketed IPv6) and strict about quotes / commas / braces / whitespace, which is what actually
 * distinguishes a URL from a fragment of code.
 */
/**
 * ⛔ S162 POST-AUDIT (C) — THIS WAS A PUNCTUATION FILTER, NOT A URL VALIDATOR, AND THE INVARIANT
 * TEST COULD NOT SEE IT because the test's oracle was a byte-identical copy of this regex.
 *
 * The old form accepted anything after the scheme that carried no whitespace, quote, comma or brace.
 * Measured as PASSING, each of them a libwebrtc parse failure and therefore a CONSTRUCTION THROW —
 * the total-outage class this whole priority exists to end:
 *
 *     turn::3478            turn:?transport=tcp      (empty host)
 *     turn:host:99999       turn:host:abc            (port out of range / non-numeric)
 *     turn:host?transport=quic                       (transport must be udp or tcp)
 *
 * So it now validates shape properly: a bracketed IPv6 literal OR a hostname, an OPTIONAL port
 * constrained to 1-65535, and an OPTIONAL `?transport=udp|tcp`. Deliberately still permissive about
 * hostname characters — rejecting a host a provider actually issued would be its own outage.
 *
 * ⚠ MUST STAY BYTE-IDENTICAL to the copy in `scripts/turn-wiring-report.mjs`; `ci.deployGate.test.ts`
 * pins the two literals against each other.
 */
const ICE_URL_RE = /^(?:stuns?|turns?):(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._~%+-]+)(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\?transport=(?:udp|tcp))?$/i;

/**
 * Strip a `key: "value"` wrapper off a secret pasted from a provider dashboard's JS snippet, plus a
 * trailing comma and matched surrounding quotes. Idempotent, and a NO-OP on a clean value.
 */
export function unwrapPastedSecret(raw: string, key: string): string {
  let s = raw.trim();
  // ⛔ S162 POST-AUDIT (A) — THE BACKSLASH MUST BE DOUBLED HERE. Inside a TEMPLATE LITERAL `\s` is
  // not a regex escape, it is the plain letter `s`, so the first cut of this line compiled to the
  // runtime source `^urlss*:s*` — no whitespace class at all. It matched the owner's actual paste by
  // luck (`urls:` needs no whitespace before the colon) and would have missed `urls : "…"`.
  //
  // ⚠ AND THE WATCHDOG DID NOT SHARE THE TYPO. `scripts/turn-wiring-report.mjs` had the correct
  // `\\s` throughout, so CI would have unwrapped a spaced paste, printed
  // "✅ RELAY WILL BE SHIPPED", and production would have shipped STUN-only — a green watchdog over a
  // silently relay-less game, which is precisely the failure S162 P0 was written to abolish.
  const labelled = new RegExp(`^${key}\\s*:\\s*`, 'i');
  if (labelled.test(s)) s = s.replace(labelled, '').trim();
  s = s.replace(/,+$/, '').trim();
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(s);
  if (quoted !== null) s = quoted[2]!.trim();
  return s;
}

/**
 * Strip array brackets, quotes and stray commas off ONE url token out of a pasted list.
 *
 * ⛔ S162 POST-AUDIT (B) — IT USED TO BREAK A VALID IPv6 URL AND HAND BACK ONE THAT THROWS.
 * `turn:[2001:db8::1]` is legal and portless; the old unconditional trailing-`]` strip turned it
 * into `turn:[2001:db8::1`, which then PASSED the url check and would have been handed to
 * `RTCPeerConnection` — a total outage produced by GOOD input, which is worse than the bad-input
 * case this file was written for. A closing bracket is now only stripped when it is unbalanced.
 */
function cleanUrlToken(tok: string): string {
  // ⭐ A URL ALWAYS BEGINS WITH ITS SCHEME, so a LEADING `[` is always an array bracket and never a
  // bracketed IPv6 host — that one can only appear after `scheme:`. Only a TRAILING `]` is ambiguous,
  // and only when it is unbalanced.
  //
  // ⚠ Stripped to a FIXED POINT rather than in one pass: an array element arrives as `"turn:x"]`,
  // where the quote hides behind the bracket and the bracket behind the quote, so a single pass peels
  // one and leaves the other.
  let s = tok.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^[[\s"'`]+/, '').replace(/[\s"'`,]+$/, '');
    const opens = (s.match(/\[/g) ?? []).length;
    const closes = (s.match(/\]/g) ?? []).length;
    if (closes > opens) s = s.replace(/\]+$/, '');
    s = s.trim();
  }
  return s;
}

export interface TurnParse {
  readonly servers: RTCIceServer[];
  /** What had to be repaired or dropped; `null` when the config was already clean (or absent). */
  readonly note: string | null;
}

/**
 * PURE. Given the three raw env values, produce the TURN `RTCIceServer` list actually safe to hand
 * to a browser, plus a note describing any repair. Never throws, and never returns a server whose
 * urls could throw.
 */
export function parseTurnConfig(
  rawUrls: string,
  rawUsername: string,
  rawCredential: string,
): TurnParse {
  const urlsField = unwrapPastedSecret(rawUrls, 'urls');
  const username = unwrapPastedSecret(rawUsername, 'username');
  const credential = unwrapPastedSecret(rawCredential, 'credential');

  const tokens = urlsField.split(',').map(cleanUrlToken).filter(Boolean);
  const urls = tokens.filter((u) => ICE_URL_RE.test(u));
  const rejected = tokens.filter((u) => !ICE_URL_RE.test(u));

  const wasWrapped =
    urlsField !== rawUrls.trim() ||
    username !== rawUsername.trim() ||
    credential !== rawCredential.trim();

  const problems: string[] = [];
  if (wasWrapped) {
    problems.push(
      'the TURN settings looked pasted from a provider dashboard (a `key: "value"` snippet rather ' +
        'than the bare value) and were unwrapped automatically',
    );
  }
  if (rejected.length > 0) {
    problems.push(`${rejected.length} TURN url(s) were not valid ICE urls and were ignored`);
  }
  if (urls.length === 0 && rawUrls.trim() !== '') {
    problems.push('no usable TURN url survived, so the game is running STUN-only');
  }
  if (urls.length > 0 && (username === '' || credential === '')) {
    problems.push('a TURN url was set but its username or credential was empty, so TURN was ignored');
  }
  const note = problems.length > 0 ? problems.join('; ') : null;

  if (urls.length === 0 || username === '' || credential === '') return { servers: [], note };
  return { servers: [{ urls, username, credential }], note };
}

function turnFromEnv(): TurnParse {
  return parseTurnConfig(
    String(import.meta.env.VITE_TURN_URLS ?? ''),
    String(import.meta.env.VITE_TURN_USERNAME ?? ''),
    String(import.meta.env.VITE_TURN_CREDENTIAL ?? ''),
  );
}

/**
 * Evaluated ONCE. Three consumers read this (`HAS_TURN_CONFIGURED`, `ICE_SERVERS`, and the lobby's
 * diagnosis); a per-call parse printed the same warning at every read.
 */
const TURN_PARSE: TurnParse = turnFromEnv();

/**
 * Non-null when the operator's TURN settings were repaired or partly rejected. The lobby reports it
 * verbatim, so a bad paste is visible rather than silently patched over.
 */
export const TURN_CONFIG_NOTE: string | null = TURN_PARSE.note;

/** True when a relay is even possible — consumed by the join preflight to explain a failure. */
export const HAS_TURN_CONFIGURED: boolean = TURN_PARSE.servers.length > 0;

export const ICE_SERVERS: RTCIceServer[] = [...STUN_ONLY, ...TURN_PARSE.servers];

if (TURN_CONFIG_NOTE !== null) console.warn(`[net] TURN configuration: ${TURN_CONFIG_NOTE}`);

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
