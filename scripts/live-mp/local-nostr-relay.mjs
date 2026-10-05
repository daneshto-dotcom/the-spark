/**
 * SPARK — S195 T20: a MINIMAL local Nostr relay (NIP-01 subset) so the real-WebRTC e2e specs can run on a
 * box whose egress proxy cannot carry a WebSocket upgrade (the Claude Code cloud container: every public
 * relay answers "non-101 status code", `npm run probe-relays` 2026-10-05 → 0/6).
 *
 * It is NOT a replacement for the public relays and ships nowhere: Trystero's nostr strategy only needs
 *   · ["EVENT", ev]            → ["OK", id, true, ""] and fan-out to every matching subscription,
 *   · ["REQ", subId, filter…]  → remember the filter, ["EOSE", subId],
 *   · ["CLOSE", subId]         → forget it.
 * A filter matches on `kinds`, `#x` tags and `since` (`@trystero-p2p/nostr/dist/index.mjs` `subscribe` /
 * `flushBatch`). Events are ephemeral — nothing is stored, nothing is verified (signatures are the
 * sender's business; this relay only ever sees two pages of the same test).
 *
 * Usage (the dev server reads the url through `src/net/devRelayOverride.ts`, DEV builds only):
 *   node scripts/live-mp/local-nostr-relay.mjs            # prints `ws://127.0.0.1:<port>`
 *   VITE_TEST_NOSTR_RELAYS=ws://127.0.0.1:<port> npx playwright test e2e/reconnect-hard-blip.spec.ts
 * PORT=<n> fixes the port (default 0 = ephemeral).
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT ?? 0);
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('spark local nostr relay\n');
});
const wss = new WebSocketServer({ server });

/** @type {Set<{ socket: import('ws').WebSocket, subs: Map<string, object[]> }>} */
const clients = new Set();
let events = 0;
let clientSeq = 0;
const T0 = Date.now();
/** RELAY_TRACE=<file> appends one line per REQ / CLOSE / EVENT / delivery — the signalling timeline. */
const trace = process.env.RELAY_TRACE
  ? (line) => appendFileSync(process.env.RELAY_TRACE, `[${((Date.now() - T0) / 1000).toFixed(3)}] ${line}\n`)
  : () => {};
const brief = (ev) => {
  const x = (ev.tags ?? []).find((t) => t[0] === 'x')?.[1] ?? '?';
  let kind = 'announce';
  try {
    const c = JSON.parse(ev.content);
    kind = c.offer ? 'offer' : c.answer ? 'answer' : c.candidate ? 'candidate' : 'announce';
    return `${kind} peer=${String(c.peerId).slice(0, 6)} offerId=${c.offerId ?? '-'} topic=${x.slice(0, 10)}`;
  } catch {
    return `raw topic=${x.slice(0, 10)}`;
  }
};

function matches(filter, ev) {
  if (!filter || typeof filter !== 'object') return false;
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(ev.kind)) return false;
  if (typeof filter.since === 'number' && typeof ev.created_at === 'number' && ev.created_at < filter.since) return false;
  for (const [k, v] of Object.entries(filter)) {
    if (!k.startsWith('#') || !Array.isArray(v)) continue;
    const tagName = k.slice(1);
    const have = (ev.tags ?? []).filter((t) => t[0] === tagName).map((t) => t[1]);
    if (!have.some((x) => v.includes(x))) return false;
  }
  return true;
}

wss.on('connection', (socket) => {
  const client = { socket, subs: new Map(), id: ++clientSeq };
  clients.add(client);
  trace(`c${client.id} connected`);
  socket.on('close', () => {
    clients.delete(client);
    trace(`c${client.id} closed`);
  });
  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!Array.isArray(msg)) return;
    const [type, a, ...rest] = msg;
    if (type === 'EVENT' && a && typeof a === 'object') {
      events++;
      socket.send(JSON.stringify(['OK', a.id ?? '', true, '']));
      const to = [];
      for (const c of clients) {
        if (c.socket.readyState !== 1) continue;
        for (const [subId, filters] of c.subs) {
          if (filters.some((f) => matches(f, a))) {
            c.socket.send(JSON.stringify(['EVENT', subId, a]));
            to.push(`c${c.id}`);
          }
        }
      }
      trace(`c${client.id} EVENT ${brief(a)} -> [${to.join(',')}]`);
    } else if (type === 'REQ' && typeof a === 'string') {
      client.subs.set(a, rest);
      socket.send(JSON.stringify(['EOSE', a]));
      trace(`c${client.id} REQ ${a.slice(0, 6)} topics=${rest.flatMap((f) => f?.['#x'] ?? []).map((t) => String(t).slice(0, 10)).join(',')}`);
    } else if (type === 'CLOSE' && typeof a === 'string') {
      client.subs.delete(a);
      trace(`c${client.id} CLOSE ${a.slice(0, 6)}`);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`ws://127.0.0.1:${port}`);
  if (process.env.RELAY_STATS) setInterval(() => console.log(`[relay] clients=${clients.size} events=${events}`), 5000);
});
