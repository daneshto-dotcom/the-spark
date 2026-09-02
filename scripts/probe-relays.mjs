#!/usr/bin/env node
/**
 * SPARK — manual relay-health probe (Council R2 S2β: manual script, not CI).
 *
 * Reachability probe for the Nostr relays + torrent trackers configured in src/net/iceConfig.ts.
 * NOT a NIP-78 functional probe — that requires a signed ephemeral event write+subscribe and is
 * deferred (see RELAY_HEALTH.md "Deep probe" section).
 *
 * ⭐ S159 P5 — **THIS SCRIPT WAS GIVING A FALSE VERDICT, AND IT MATTERED.**
 *
 * It probed every `wss://` endpoint by rewriting it to `https://` and doing a GET, then graded the
 * HTTP status. That is not the question. A WebSocket endpoint is perfectly entitled to answer a
 * plain GET with 404 or 403 while its WebSocket upgrade works fine, and
 * `wss://tracker.openwebtorrent.com` does exactly that: **HTTP 404, WebSocket OPEN.** The old script
 * printed it as `[CHECK]` — i.e. suspect — for a tracker that was the only one of the three still
 * alive, while `wss://tracker.btorrent.xyz` (genuinely dead) and
 * `wss://tracker.files.fm:7073/announce` (refuses) were the ones to remove.
 *
 * So the probe now performs a REAL WebSocket handshake, which is the thing the game does. Node's
 * built-in `WebSocket` (Node 22+) makes this dependency-free. A relay is HEALTHY when the socket
 * OPENS — nothing weaker is evidence.
 *
 * Usage:
 *   node scripts/probe-relays.mjs
 *   npm run probe-relays
 *
 * Exit code: always 0 (informational only — does not gate any build).
 */

// ⚠ KEPT IN SYNC BY HAND with src/net/iceConfig.ts. This script is plain Node with no build step,
// so it cannot import the TypeScript source; the duplication is deliberate and the two lists are
// asserted equal by `src/net/relayLists.test.ts` so they cannot drift silently.
const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.primal.net',
];

const TORRENT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
];

/** Hosts measured DEAD and removed. Re-probed here so a future session can see they stayed dead. */
const KNOWN_DEAD = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

function probe(wssUrl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    let settled = false;
    let ws;
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
      resolve({ url: wssUrl, ok, detail, elapsedMs: Date.now() - startMs });
    };
    const timer = setTimeout(() => done(false, `TIMEOUT after ${timeoutMs}ms`), timeoutMs);
    try {
      ws = new WebSocket(wssUrl);
    } catch (err) {
      return done(false, `threw: ${err.message}`);
    }
    ws.onopen = () => done(true, 'websocket OPEN');
    ws.onerror = (ev) => done(false, ev?.message ?? 'handshake refused');
  });
}

const fmt = (r) =>
  `[${(r.ok ? 'HEALTHY' : 'DEAD').padEnd(7)}] ${r.url.padEnd(45)} ${r.detail} (${r.elapsedMs}ms)`;

async function main() {
  console.log('--- Nostr relays (WebSocket handshake) ---');
  const nostr = await Promise.all(NOSTR_RELAYS.map((u) => probe(u)));
  for (const r of nostr) console.log(fmt(r));

  console.log('\n--- Torrent trackers (WebSocket handshake) ---');
  const torrent = await Promise.all(TORRENT_TRACKERS.map((u) => probe(u)));
  for (const r of torrent) console.log(fmt(r));

  console.log('\n--- Previously removed, re-checked (expected DEAD) ---');
  const dead = await Promise.all(KNOWN_DEAD.map((u) => probe(u)));
  for (const r of dead) console.log(fmt(r));

  const live = [...nostr, ...torrent].filter((r) => r.ok).length;
  const total = nostr.length + torrent.length;
  console.log(`\n--- Summary: ${live}/${total} configured relays answered a WebSocket handshake ---`);
  const revived = dead.filter((r) => r.ok).map((r) => r.url);
  if (revived.length > 0) {
    console.log(`NOTE: a removed host is answering again: ${revived.join(', ')}`);
    console.log('      Re-adding is a judgement call — a host that died once will die again.');
  }
  if (torrent.every((r) => !r.ok)) {
    console.log('WARN: NO torrent tracker answered. `transport.ts` passes redundancy = list length,');
    console.log('      so the whole strategy will report `torrent:fail` in the lobby diagnostics.');
  }
  console.log('NOTE: an OPEN socket is reachability, not protocol health. NIP-78 functional health');
  console.log('      still needs a 2-browser smoke on https://spark-online.space/?debug=1 —');
  console.log('      see RELAY_HEALTH.md.');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
