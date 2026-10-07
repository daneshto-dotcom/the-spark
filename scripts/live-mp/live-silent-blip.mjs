/**
 * SPARK — S196 (net-blip): the SILENT hard blip, reproduced on a desktop with no firewall rule.
 *
 * The joiner's ICE is forced through `udp-blackhole.mjs`; mid-match the relay goes DARK for DARK_MS (every
 * packet dropped, nothing closed, no SCTP abort), then comes back. We record, per side, the RTCPeerConnection
 * state timeline, the transport's `[net]` lines (onPeerLeave / PEER DROPPED / reconnect attempt / onPeerJoin),
 * the signalling trace of the local Nostr relay (were the rejoiner's announces answered?), and the verdict:
 * RECOVERED at +N s, or still split / CONNECTION LOST at the cap.
 *
 * Needs a DEV server of THIS tree started with the local relay's url, e.g.
 *   node scripts/live-mp/local-nostr-relay.mjs                       # (the driver starts its own if RELAY unset)
 *   VITE_TEST_NOSTR_RELAYS=ws://127.0.0.1:<rp> npm run dev -- --port <own port> --strictPort
 *   SPARK_URL=http://localhost:<own port>/ RELAY=ws://127.0.0.1:<rp> DARK_MS=8000 node scripts/live-mp/live-silent-blip.mjs
 * Env: DARK_MS (default 8000) · OBSERVE_S (default 200 — past RECONNECT_GIVE_UP_MS) · BLOCK_TORRENT=1 (close the
 * public tracker sockets so nostr is the only strategy) · TRACE=<dir> (writes timeline json) · LIGHT_ON_FIRST_DROP=1
 * (stay dark until the FIRST side's Trystero close fires, then light at once — aims at the asymmetric window where one
 * side has dropped the peer and the other has not; DARK_MS is then only the upper bound).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { createBlackholeRelay, FORCE_THROUGH_RELAY } from './udp-blackhole.mjs';
import { INIT, texts, clickText, waitText } from './live-lib.mjs';

const URL_ = process.env.SPARK_URL;
if (!URL_) throw new Error('SPARK_URL (this tree\'s own dev server) is required');
const DARK_MS = Number(process.env.DARK_MS ?? 8000);
const OBSERVE_S = Number(process.env.OBSERVE_S ?? 200);
const T0 = Date.now();
let BLIP = 0;
const rel = () => (BLIP ? (Date.now() - BLIP) / 1000 : -(BLIP - Date.now()) / 1000);
const timeline = [];
const log = (...a) => {
  const line = `[${((Date.now() - T0) / 1000).toFixed(1)}s${BLIP ? ` blip${rel() >= 0 ? '+' : ''}${rel().toFixed(1)}` : ''}] ${a.join(' ')}`;
  timeline.push(line);
  console.log(line);
};

const relay = createBlackholeRelay({ log });
const ctrl = await relay.start();
log('udp blackhole relay control at', ctrl);

const TRACER = () => {
  const P = RTCPeerConnection.prototype;
  const origSRD = P.setRemoteDescription;
  let n = 0;
  P.setRemoteDescription = function (...a) {
    if (!this.__traced) {
      this.__traced = ++n;
      const id = this.__traced;
      const say = (what) => console.log(`[trace] pc#${id} ${what} conn=${this.connectionState} ice=${this.iceConnectionState}`);
      this.addEventListener('connectionstatechange', () => say('connectionstatechange'));
      this.addEventListener('iceconnectionstatechange', () => say('iceconnectionstatechange'));
      this.addEventListener('datachannel', (e) => {
        e.channel.addEventListener('close', () => console.log(`[trace] pc#${id} datachannel close`));
      });
      say('created');
    }
    return origSRD.apply(this, a);
  };
};

const b = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const mk = async (name, forced) => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  if (process.env.BLOCK_TORRENT === '1') {
    await ctx.routeWebSocket(/tracker|openwebtorrent|webtorrent|btorrent/i, (ws) => ws.close());
  }
  const p = await ctx.newPage();
  await p.addInitScript(INIT, {});
  await p.addInitScript(TRACER);
  if (forced) await p.addInitScript(FORCE_THROUGH_RELAY, { ctrl });
  p.on('console', (m) => {
    const t = m.text();
    if (/ice-poll|relay sockets attached|getRelaySockets/.test(t)) return;
    if (process.env.LIGHT_ON_FIRST_DROP === '1' && relay.isDark() && /PEER DROPPED/.test(t)) {
      relay.setDark(false);
      log(`LIGHT — on ${name}'s first PEER DROPPED (LIGHT_ON_FIRST_DROP: the other side's 5 s close has not fired yet)`);
    }
    if (/\[trace\]|onPeerLeave|onPeerJoin|PEER DROPPED|reconnect attempt|disconnect strategy|onJoinError|connect: roomCode|duplicate join|CONNECTION|overlay|JOIN STALL|starv/i.test(t)) {
      log(`<${name}>`, t.slice(0, 240));
    }
  });
  await p.goto(URL_);
  await clickText(p, /^Multiplayer$/);
  await waitText(p, /^MULTIPLAYER LOBBY$/);
  return p;
};
const S = (p) =>
  p.evaluate(() => {
    const s = window.__SPARK__;
    const tr = s?.netTransport ?? null;
    const pcs = [];
    for (const h of tr?.strategies?.values?.() ?? []) {
      for (const [id, pc] of Object.entries(h.room?.getPeers?.() ?? {})) pcs.push(`${h.name}:${id.slice(0, 6)}:${pc.connectionState}/${pc.iceConnectionState}`);
    }
    return { tick: s?.world?.tick ?? -1, state: s?.world?.gameState ?? '?', peers: tr?.peerCount?.() ?? -1, pcs, relayed: window.__RELAYED ?? null };
  });
const vis = async (p) => ((await texts(p))?.list ?? []).filter((e) => e.visible).map((e) => e.text.replace(/\s+/g, ' ').slice(0, 70));

const host = await mk('host', false);
const join = await mk('join', true);
await clickText(host, /^Host New Room$/);
const code = (await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000))?.text;
log('room', code);
const inp = join.locator('input[type="text"][maxlength="6"]');
await inp.click();
await inp.fill(code);
await inp.press('Enter');
const begin = await waitText(host, /^Begin Match/, 120000);
if (!begin) throw new Error('joiner never reached the host lobby (Begin Match never shown)');
await clickText(host, /^Begin Match/);
for (let i = 0; i < 60; i++) {
  const j = await S(join);
  if (j.state === 'PLAYING' && j.tick > 60) break;
  await join.waitForTimeout(1000);
}
const pre = { host: await S(host), join: await S(join), relay: relay.stats() };
log('pre-blip', JSON.stringify(pre));
if (relay.stats().fwdToTarget === 0) throw new Error('the joiner did NOT route through the relay — the reproduction is invalid');

BLIP = Date.now();
relay.setDark(true);
log(`DARK for ${DARK_MS} ms (every joiner<->host UDP packet dropped; nothing closed)`);
const lightAt = setTimeout(() => { if (relay.isDark()) { relay.setDark(false); log('LIGHT — packets flow again'); } }, DARK_MS);

let recoveredAt = null;
let sawLost = false;
const seen = new Set();
let lastJoinTick = pre.join.tick;
let stallSince = null;
// ⛔ the SPLIT signature: one side still holds the peer while the other has none (and is not mid-handshake).
let asymSince = null;
let asymMaxS = 0;
for (let i = 0; i < OBSERVE_S; i++) {
  await join.waitForTimeout(1000);
  const [hv, jv] = [await vis(host), await vis(join)];
  for (const [n, v] of [['host', hv], ['join', jv]]) {
    for (const t of v) {
      if (/CONNECTION LOST|RECONNECT|MIGRAT|waiting for/i.test(t) && !seen.has(n + t)) { seen.add(n + t); log(`${n} overlay:`, t); }
      if (/CONNECTION LOST/.test(t)) sawLost = true;
    }
  }
  const h = await S(host), j = await S(join);
  if (i % 5 === 0) log('state', JSON.stringify({ h: { peers: h.peers, tick: h.tick, pcs: h.pcs }, j: { peers: j.peers, tick: j.tick, st: j.state, pcs: j.pcs }, relay: relay.stats() }));
  const advancing = j.tick > lastJoinTick + 5;
  lastJoinTick = Math.max(lastJoinTick, j.tick);
  const overlayUp = [...hv, ...jv].some((t) => /CONNECTION LOST|RECONNECTING|MIGRATING/i.test(t));
  if (recoveredAt === null && !relay.isDark() && advancing && h.peers > 0 && j.peers > 0 && !overlayUp) {
    recoveredAt = (Date.now() - BLIP) / 1000;
    log('RECOVERED — joiner ticks advancing, both sides see a peer, no overlay');
  }
  if (!advancing) stallSince ??= Date.now(); else stallSince = null;
  if (!relay.isDark() && (h.peers > 0) !== (j.peers > 0)) {
    asymSince ??= Date.now();
    asymMaxS = Math.max(asymMaxS, (Date.now() - asymSince) / 1000);
  } else asymSince = null;
  if (recoveredAt !== null && (Date.now() - BLIP) / 1000 > recoveredAt + 8) break;
}
clearTimeout(lightAt);
const end = { host: await S(host), join: await S(join), relay: relay.stats() };
log('END', JSON.stringify(end));
log('END host:', JSON.stringify(await vis(host)));
log('END join:', JSON.stringify(await vis(join)));
const result = { DARK_MS, recoveredAtS: recoveredAt, sawLost, splitForS: Math.round(asymMaxS), split: asymMaxS >= 30, joinFrozenForS: stallSince ? (Date.now() - stallSince) / 1000 : 0, end };
console.log('RESULT', JSON.stringify(result));
if (process.env.TRACE) writeFileSync(`${process.env.TRACE}/silent-blip-${DARK_MS}-${T0}.log`, timeline.join('\n') + '\nRESULT ' + JSON.stringify(result) + '\n');
await b.close();
relay.close();
