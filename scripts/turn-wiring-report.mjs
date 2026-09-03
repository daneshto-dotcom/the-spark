// SPARK — S158 P1: does THIS build actually have a TURN relay?
//
// ⭐ WHY THIS RUNS IN CI AT ALL. S157 diagnosed the multiplayer outage (the shipped TURN servers were
// dead, so the game ran STUN-only and any pair behind strict NAT hung on "Connecting…" forever) and
// left the owner one action: provision an account and supply three values. The failure mode of THAT
// action is silent — a misspelled secret name, or a secret added to the wrong repository, produces a
// perfectly green deploy that still ships no relay. There would be nothing to look at.
//
// So the deploy log says it out loud, in booleans. Never the values: `VITE_TURN_CREDENTIAL` is a
// password, and although a browser-side TURN credential is public by construction once it is inlined
// into the bundle (see TURN_SETUP.md § "Is it safe to put this in the game?"), printing it into a
// build log that outlives the deployment is a gratuitously worse exposure than the one we cannot
// avoid.
//
// ⚠ THIS NEVER FAILS THE BUILD. An unset relay is a supported state — `parseTurnConfig()` in
// src/net/iceConfig.ts refuses a half-filled config and ships STUN-only, exactly as today. Exiting
// non-zero here would turn "the owner has not signed up yet" into a broken deploy.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ S162 P0 — **THIS REPORT PRINTED `✅ RELAY WILL BE SHIPPED` FOR A BUILD WHOSE ICE CONFIG THREW.**
//
// The owner pasted all three values straight off metered.ca's dashboard, which hands you a
// JavaScript snippet, so each arrived wrapped: `urls: "turn:global.relay.metered.ca:80"`. The old
// check here was `typeof v === 'string' && v.trim() !== ''` — the SAME insufficient test as the code
// it was watching. Three trues, a green tick, and a game in which `new RTCPeerConnection` threw at
// construction for every player on every network, same-LAN included.
//
// ⛔ THE LESSON, AND IT IS THE POINT OF THIS FILE: A WATCHDOG THAT SHARES THE WATCHED CODE'S BLIND
// SPOT IS NOT A WATCHDOG. "Is it set" was never the question. "Is it USABLE" is. So this now runs
// the same shape rules `iceConfig.ts` runs, and `src/ci.deployGate.test.ts` pins the two in step so
// they cannot drift apart again.
//
// ⚠ Still non-fatal, and now for a BETTER reason than before: `parseTurnConfig` repairs the wrapped
// form rather than rejecting it, so a dashboard paste is a cosmetic complaint and not a broken
// deploy. What this must never do again is stay QUIET about it.

/** The three names `src/net/iceConfig.ts` reads. Kept in step by src/ci.deployGate.test.ts. */
const NAMES = ['VITE_TURN_URLS', 'VITE_TURN_USERNAME', 'VITE_TURN_CREDENTIAL'];

/** ⚠ MUST MATCH `ICE_URL_RE` in src/net/iceConfig.ts — pinned by src/ci.deployGate.test.ts. */
const ICE_URL_RE = /^(?:stun|stuns|turn|turns):[^\s"'`,{}]+$/i;

/** ⚠ MUST MATCH `unwrapPastedSecret` in src/net/iceConfig.ts. */
const unwrapPastedSecret = (raw, key) => {
  let s = raw.trim();
  const labelled = new RegExp(`^${key}\\s*:\\s*`, 'i');
  if (labelled.test(s)) s = s.replace(labelled, '').trim();
  s = s.replace(/,+$/, '').trim();
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(s);
  if (quoted !== null) s = quoted[2].trim();
  return s;
};

/** ⚠ MUST MATCH `cleanUrlToken` in src/net/iceConfig.ts. */
const cleanUrlToken = (tok) =>
  tok
    .trim()
    .replace(/^[[\s"'`]+/, '')
    .replace(/[\]\s"'`,]+$/, '')
    .trim();

const raw = (name) => {
  const v = process.env[name];
  return typeof v === 'string' ? v : '';
};
const isSet = (name) => raw(name).trim() !== '';

for (const name of NAMES) console.log(`[turn] ${name} set: ${isSet(name)}`);

// ── shape, not just presence ────────────────────────────────────────────────────────────────────
const KEY_OF = {
  VITE_TURN_URLS: 'urls',
  VITE_TURN_USERNAME: 'username',
  VITE_TURN_CREDENTIAL: 'credential',
};

const wrapped = NAMES.filter((n) => isSet(n) && unwrapPastedSecret(raw(n), KEY_OF[n]) !== raw(n).trim());

const urlField = unwrapPastedSecret(raw('VITE_TURN_URLS'), 'urls');
const tokens = urlField.split(',').map(cleanUrlToken).filter(Boolean);
const goodUrls = tokens.filter((u) => ICE_URL_RE.test(u));
const badUrls = tokens.filter((u) => !ICE_URL_RE.test(u));

const username = unwrapPastedSecret(raw('VITE_TURN_USERNAME'), 'username');
const credential = unwrapPastedSecret(raw('VITE_TURN_CREDENTIAL'), 'credential');

console.log(`[turn] usable TURN urls: ${goodUrls.length}${badUrls.length > 0 ? ` (rejected ${badUrls.length})` : ''}`);

if (wrapped.length > 0) {
  console.log(
    `[turn] ⛔ ${wrapped.length} secret(s) look PASTED FROM A DASHBOARD SNIPPET — they carry a ` +
      `\`key: "value"\` wrapper: ${wrapped.join(', ')}.`,
  );
  console.log(
    '[turn]    The game repairs this at runtime so multiplayer still works, but fix the secrets so ' +
      'the intent is explicit: paste ONLY the bare value, with no key name, no quotes and no comma.',
  );
  console.log('[turn]    e.g. VITE_TURN_URLS = turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:443?transport=tcp');
}

if (badUrls.length > 0) {
  console.log(
    `[turn] ⛔ ${badUrls.length} value(s) in VITE_TURN_URLS are not valid ICE urls and were ignored. ` +
      'Each entry must begin with stun:, stuns:, turn: or turns:.',
  );
}

const relayShipped = goodUrls.length > 0 && username !== '' && credential !== '';

if (relayShipped) {
  console.log('[turn] ✅ RELAY WILL BE SHIPPED in this build — multiplayer can cross strict networks.');
} else if (NAMES.every(isSet)) {
  // ⛔ The case S162 had to exist for: all three present, none of them usable.
  console.log(
    '[turn] ⛔ ALL THREE SECRETS ARE SET BUT NO RELAY WILL BE SHIPPED — the values are not usable. ' +
      'This build is STUN-only. See TURN_SETUP.md § "The shape of the values".',
  );
} else {
  console.log(
    '[turn] ⚠ no relay in this build — STUN-only. Players behind strict/mobile NAT will hang on ' +
      '"Connecting…". Add the three repository secrets and redeploy; see TURN_SETUP.md.',
  );
}
