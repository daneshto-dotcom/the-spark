/**
 * SPARK — S196 (joiner-desync): THE JOINER-LAG TRACE. Owner's playtest R196-P1: Mark (P2, remote joiner) saw his
 * own buildings late or never, a stale bank for ~45 s, and could not build with shapes he had. This driver puts a
 * host and a joiner on two real Chromium pages over real WebRTC (local Nostr relay for signalling, the joiner's
 * media forced through the local UDP relay with IMPAIRMENT — delay/jitter/loss), throttles the JOINER's CPU over CDP
 * (a slower machine than the host's), and samples every second:
 *   host tick · joiner APPLIED tick (world.tick, written by applyNetSnapshot) · lag in ticks · joiner fps ·
 *   the joiner transport's snapshot-receive counters and the host's keyframe/delta counters (when the tree has them).
 *
 * Self-contained: starts its own Nostr relay, its own vite on PORT (never 5173), its own UDP relay.
 *   PORT=<own port> node scripts/live-mp/live-joiner-lag.mjs
 * Env: OBSERVE_S (default 90) · CPU (joiner CDP throttle rate, default 6; 1 = off) · DELAY_MS (one-way, default 100
 * → ~200 ms RTT) · JITTER_MS (default 50) · LOSS (default 0.01) · TRACE=<file> (json lines) · LABEL (printed).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createBlackholeRelay, FORCE_THROUGH_RELAY } from './udp-blackhole.mjs';
import { INIT, clickText, waitText } from './live-lib.mjs';

const PORT = Number(process.env.PORT ?? 0);
if (!(PORT > 0) || PORT === 5173) throw new Error('PORT=<this tree\'s own port> is required (never 5173)');
const OBSERVE_S = Number(process.env.OBSERVE_S ?? 90);
const CPU = Number(process.env.CPU ?? 6);
const IMPAIR = { delayMs: Number(process.env.DELAY_MS ?? 100), jitterMs: Number(process.env.JITTER_MS ?? 50), loss: Number(process.env.LOSS ?? 0.01) };
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${a.join(' ')}`);
const kids = [];
const cleanup = () => { for (const k of kids) { try { k.kill(); } catch { /* */ } } };
process.on('exit', cleanup);

// 1. local Nostr relay
const relayProc = spawn(process.execPath, ['scripts/live-mp/local-nostr-relay.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
kids.push(relayProc);
const wsUrl = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('nostr relay did not start')), 15000);
  relayProc.stdout.on('data', (d) => { const m = /ws:\/\/[\d.]+:\d+/.exec(String(d)); if (m) { clearTimeout(to); res(m[0]); } });
});
log('nostr relay', wsUrl);
// 2. vite on our own port
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore', env: { ...process.env, VITE_TEST_NOSTR_RELAYS: wsUrl },
});
kids.push(vite);
const origin = `http://localhost:${PORT}`;
for (let i = 0; i < 240; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
const served = await (await fetch(origin + '/src/net/transport.ts')).text();
log(`served transport.ts has the S196 receive pipeline: ${served.includes('snapRxStats') ? 'YES' : 'NO'}`);
// 3. UDP relay with impairment
const relay = createBlackholeRelay({ log: () => {} });
const ctrl = await relay.start();
relay.setImpair(IMPAIR);
log('udp relay', ctrl, 'impairment', JSON.stringify(IMPAIR), 'joiner CPU throttle', `${CPU}x`);

const FPS = () => {
  window.__FRAMES = 0;
  const f = () => { window.__FRAMES++; requestAnimationFrame(f); };
  requestAnimationFrame(f);
};
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const mk = async (name, forced) => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.routeWebSocket(/tracker|openwebtorrent|webtorrent|btorrent/i, (ws) => ws.close());
  const p = await ctx.newPage();
  await p.addInitScript(INIT, {});
  await p.addInitScript(FPS);
  if (forced) await p.addInitScript(FORCE_THROUGH_RELAY, { ctrl });
  p.on('console', (m) => { const t = m.text(); if (/snapshot frame|keyframe|PEER DROPPED|CONNECTION|starv|applyNetSnapshot rejected/i.test(t)) log(`<${name}>`, t.slice(0, 200)); });
  p.on('pageerror', (e) => log(`<${name} PAGEERROR>`, e.message.slice(0, 200)));
  await p.goto(origin + '/?debug=1');
  await clickText(p, /^Multiplayer$/);
  await waitText(p, /^MULTIPLAYER LOBBY$/);
  return p;
};
const S = (p) => p.evaluate(() => {
  const s = window.__SPARK__;
  const tr = s?.netTransport ?? null;
  return {
    tick: s?.world?.tick ?? -1, state: s?.world?.gameState ?? '?', frames: window.__FRAMES ?? 0,
    rx: typeof tr?.snapRxStats === 'function' ? tr.snapRxStats() : null,
    tx: typeof tr?.snapTxStats === 'function' ? tr.snapTxStats() : null,
    shapes: s?.world?.primitives?.size ?? -1,
  };
});

let code = 0;
const rows = [];
try {
  const host = await mk('host', false);
  const join = await mk('join', true);
  await clickText(host, /^Host New Room$/);
  const room = (await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000))?.text;
  log('room', room);
  const inp = join.locator('input[type="text"][maxlength="6"]');
  await inp.click(); await inp.fill(room); await inp.press('Enter');
  if (!(await waitText(host, /^Begin Match/, 120000))) throw new Error('joiner never reached the lobby');
  await clickText(host, /^Begin Match/);
  for (let i = 0; i < 90; i++) { const j = await S(join); if (j.state === 'PLAYING' && j.tick > 30) break; await join.waitForTimeout(1000); }
  if (relay.stats().fwdToTarget === 0) throw new Error('the joiner did NOT route through the relay — invalid run');
  if (CPU > 1) {
    const cdp = await join.context().newCDPSession(join);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  log('match running; observing', OBSERVE_S, 's');
  let prevJ = await S(join);
  for (let s = 1; s <= OBSERVE_S; s++) {
    await join.waitForTimeout(1000);
    const [h, j] = await Promise.all([S(host), S(join)]);
    const row = { s, hostTick: h.tick, joinTick: j.tick, lagTicks: h.tick - j.tick, joinFps: j.frames - prevJ.frames, rx: j.rx, tx: h.tx, relay: relay.stats() };
    prevJ = j;
    rows.push(row);
    if (s % 5 === 0 || s === 1) log(JSON.stringify({ s, hostTick: h.tick, joinTick: j.tick, lagTicks: row.lagTicks, lagS: (row.lagTicks / 60).toFixed(1), joinFps: row.joinFps, rx: j.rx, tx: h.tx }));
  }
  const tail = rows.slice(-10).map((r) => r.lagTicks).sort((a, b) => a - b);
  const result = { label: process.env.LABEL ?? '', CPU, IMPAIR, medianLagTicksLast10: tail[Math.floor(tail.length / 2)], maxLagTicks: Math.max(...rows.map((r) => r.lagTicks)), meanFps: rows.reduce((a, r) => a + r.joinFps, 0) / rows.length, endRx: rows.at(-1)?.rx, endTx: rows.at(-1)?.tx };
  console.log('RESULT', JSON.stringify(result));
  if (process.env.TRACE) writeFileSync(process.env.TRACE, rows.map((r) => JSON.stringify(r)).join('\n') + '\nRESULT ' + JSON.stringify(result) + '\n');
} catch (e) { console.error(e); code = 1; } finally { await b.close(); relay.close(); cleanup(); }
process.exit(code);
