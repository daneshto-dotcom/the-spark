// S194 T17 — LIVE two-peer test against production. MODE=code|quick
import { chromium } from 'playwright';
import { INIT, texts, clickText, waitText, T, iceInfo, fps } from './live-lib.mjs';
const URL = process.env.SPARK_URL ?? 'https://spark-online.space/';
const MODE = process.env.MODE ?? 'code';
const SECS = Number(process.env.SECS ?? 30);
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(INIT, { relay: process.env.RELAY === '1' });
  p.on('console', (m) => { const t = m.text(); if (/ice-poll/.test(t)) return; if (m.type() === 'error' || /\[net\]|mismatch|protocol/i.test(t)) console.log(`  <${name} ${m.type()}>`, t.slice(0, 220)); });
  p.on('pageerror', (e) => console.log(`  <${name} PAGEERROR>`, e.message.slice(0, 220)));
  await p.goto(URL);
  await clickText(p, /^Multiplayer$/);
  await waitText(p, /^MULTIPLAYER LOBBY$/);
  return p;
};
const vis = async (p) => (await texts(p)).list.filter((e) => e.visible).map((e) => e.text.replace(/\s+/g, ' ').slice(0, 70));
const res = { mode: MODE };
let host, join;
try {
  host = await mk('host'); join = await mk('join');
  log('both in lobby; scripts:', (await host.evaluate(() => [...document.scripts].map((s) => s.src).join(' '))));
  if (MODE === 'code') {
    await clickText(host, /^Host New Room$/);
    const codeHit = await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000);
    if (!codeHit) throw new Error('no room code appeared; host texts: ' + JSON.stringify(await vis(host)));
    const code = codeHit.text; res.code = code; log('room code', code);
    const inp = join.locator('input[type="text"][maxlength="6"]');
    await inp.click(); await inp.fill(code);
    const tJoin = Date.now();
    await inp.press('Enter');
    // Host "Begin" becomes available once a peer is in the room
    const begin = await waitText(host, /^(BEGIN|Begin|START|Start)/, 60000);
    res.joinLatencyMs = Date.now() - tJoin;
    log('host sees Begin after', res.joinLatencyMs, 'ms; host texts:', JSON.stringify(await vis(host)));
    log('joiner texts:', JSON.stringify(await vis(join)));
    if (!begin) throw new Error('Begin never appeared on host');
    const tBegin = Date.now();
    await clickText(host, /^(BEGIN|Begin|START|Start)/);
    // time to first snapshot on joiner
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) { const s = await T(join); if (s.snapRecv > 0) break; await join.waitForTimeout(100); }
    res.firstSnapshotMs = Date.now() - tBegin;
    log('first snapshot on joiner after', res.firstSnapshotMs, 'ms');
  } else {
    const tq = Date.now();
    await clickText(host, /^QUICK MATCH$/);
    await host.waitForTimeout(1500);
    await clickText(join, /^QUICK MATCH$/);
    // both need READY (quickmatch) — wait until both pages see 2 peers / a READY toggle
    const r1 = await waitText(host, /READY/i, 90000); const r2 = await waitText(join, /READY/i, 90000);
    log('host texts:', JSON.stringify(await vis(host))); log('join texts:', JSON.stringify(await vis(join)));
    // wait for peer connect: pcStates connected on both
    const tc = Date.now();
    while (Date.now() - tc < 90000) { const a = await T(host), c = await T(join); if (a.pcStates.includes('connected') && c.pcStates.includes('connected')) break; await host.waitForTimeout(200); }
    res.joinLatencyMs = Date.now() - tq;
    log('both peers connected after', res.joinLatencyMs, 'ms from first QUICK MATCH click');
    log('host texts:', JSON.stringify(await vis(host))); log('join texts:', JSON.stringify(await vis(join)));
    const tReady = Date.now();
    await clickText(host, /^READY/i); await clickText(join, /^READY/i);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) { const s = await T(join), h = await T(host); if (s.snapRecv > 0 || h.snapRecv > 0) break; await join.waitForTimeout(100); }
    res.firstSnapshotMs = Date.now() - tReady;
    log('first snapshot after both READY:', res.firstSnapshotMs, 'ms');
  }
  // ~SECS seconds of sync sampling
  const samples = [];
  for (let i = 0; i <= SECS; i += 3) {
    const [a, c] = [await T(host), await T(join)];
    samples.push({ s: i, hostTx: a.lastSentTick, hostRx: a.lastRecvTick, joinTx: c.lastSentTick, joinRx: c.lastRecvTick, hSnapTx: a.snapSent, hSnapRx: a.snapRecv, jSnapTx: c.snapSent, jSnapRx: c.snapRecv });
    await host.waitForTimeout(3000);
  }
  console.table(samples);
  res.samples = samples;
  const H = await T(host), J = await T(join);
  log('host kinds', JSON.stringify(H.kinds), 'pc', JSON.stringify(H.pcStates));
  log('join kinds', JSON.stringify(J.kinds), 'pc', JSON.stringify(J.pcStates));
  log('host texts end:', JSON.stringify(await vis(host)));
  log('join texts end:', JSON.stringify(await vis(join)));
  // ICE pair type actually used
  res.ice = { host: await iceInfo(host), join: await iceInfo(join) }; res.fps = { host: await fps(host), join: await fps(join) }; log('ice', JSON.stringify(res.ice), 'fps', JSON.stringify(res.fps));
  for (const [n, p] of [['host', host], ['join', join]]) {
    await p.screenshot({ path: `.tmp-gates/live-${MODE}-${n}.png` });
  }
  console.log('RESULT', JSON.stringify(res));
} catch (e) {
  console.log('FAIL', e.message);
  for (const [n, p] of [['host', host], ['join', join]]) if (p) { await p.screenshot({ path: `.tmp-gates/live-${MODE}-${n}-FAIL.png` }).catch(() => {}); console.log(n, JSON.stringify(await T(p).catch(() => null))); }
  await b.close(); process.exit(1);
}
await b.close();
