#!/usr/bin/env node
/**
 * SPARK — manual relay-health probe (Council R2 S2β: manual script, not CI).
 *
 * Quick curl-style HTTPS reachability probe for the Nostr relays + torrent
 * trackers configured in src/net/iceConfig.ts. NOT a NIP-78 functional probe
 * — that requires a signed ephemeral event write+subscribe and is deferred
 * (see RELAY_HEALTH.md "Deep probe" section).
 *
 * Usage:
 *   node scripts/probe-relays.mjs
 *   npm run probe-relays   (after wiring into package.json)
 *
 * Exit code: always 0 (informational only — does not gate any build).
 */

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
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

async function probe(wssUrl, timeoutMs = 5000) {
  const httpsUrl = wssUrl.replace(/^wss:/, 'https:');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();
  try {
    const res = await fetch(httpsUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'spark-probe/1.0' },
    });
    return { url: wssUrl, status: res.status, elapsedMs: Date.now() - startMs, ok: true };
  } catch (err) {
    return {
      url: wssUrl,
      status: 0,
      elapsedMs: Date.now() - startMs,
      ok: false,
      error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
    };
  } finally {
    clearTimeout(t);
  }
}

function fmt(r) {
  const status = r.ok ? `HTTP ${r.status}` : (r.error || 'FAIL');
  const verdict =
    r.ok && r.status >= 200 && r.status < 400
      ? 'HEALTHY'
      : r.ok && r.status >= 400
        ? 'CHECK'
        : 'DEAD';
  return `[${verdict.padEnd(7)}] ${r.url.padEnd(45)} ${status} (${r.elapsedMs}ms)`;
}

async function main() {
  console.log('--- Nostr relays ---');
  const nostrResults = await Promise.all(NOSTR_RELAYS.map((u) => probe(u)));
  for (const r of nostrResults) console.log(fmt(r));

  console.log('\n--- Torrent trackers ---');
  const torrentResults = await Promise.all(TORRENT_TRACKERS.map((u) => probe(u)));
  for (const r of torrentResults) console.log(fmt(r));

  const allHealthy = [...nostrResults, ...torrentResults].filter(
    (r) => r.ok && r.status >= 200 && r.status < 400,
  ).length;
  const total = nostrResults.length + torrentResults.length;
  console.log(`\n--- Summary: ${allHealthy}/${total} healthy ---`);
  console.log('NOTE: This is HTTP-reachability only. NIP-78 functional health requires');
  console.log('a 2-browser smoke on https://spark-online.space/?debug=1 — see RELAY_HEALTH.md.');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
