// S194 T17 — LIVE N-peer room by code (host + N-1 joiners). N=4 SECS=30 TEAMS=1 (pick teams in lobby if the UI has it)
import { chromium } from 'playwright';
import { INIT, texts, clickText, waitText, T, iceInfo } from './live-lib.mjs';
const URL = process.env.SPARK_URL ?? 'https://spark-online.space/';
const N = Number(process.env.N ?? 4), SECS = Number(process.env.SECS ?? 30);
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); p.__name = name;
  await p.addInitScript(INIT, {});
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/onJoinError: torrent/.test(t)) log(`<${name} error>`, t.slice(0, 200)); });
  p.on('pageerror', (e) => log(`<${name} PAGEERROR>`, e.message.slice(0, 200)));
  await p.goto(URL); await clickText(p, /^Multiplayer$/); await waitText(p, /^MULTIPLAYER LOBBY$/);
  return p;
};
const vis = async (p) => (await texts(p)).list.filter((e) => e.visible).map((e) => e.text.replace(/\s+/g, ' ').slice(0, 70));
const res = { N, joins: [] };
try {
  const host = await mk('host');
  await clickText(host, /^Host New Room$/);
  const code = (await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000)).text; log('code', code, 'scripts', await host.evaluate(() => [...document.scripts].map((s) => s.src.split('/').pop()).join(' ')));
  const joiners = [];
  for (let k = 1; k < N; k++) {
    const p = await mk('j' + k); joiners.push(p);
    const inp = p.locator('input[type="text"][maxlength="6"]'); await inp.click(); await inp.fill(code);
    const t = Date.now(); await inp.press('Enter');
    const ok = await waitText(host, new RegExp(`Room ${k + 1}/4`), 60000);
    res.joins.push(ok ? Date.now() - t : null); log(`joiner ${k} seated on host after`, ok ? Date.now() - t : 'TIMEOUT', 'ms');
  }
  log('host lobby:', JSON.stringify(await vis(host)));
  for (const p of joiners) log(p.__name, 'lobby:', JSON.stringify(await vis(p)));
  if (process.env.TEAMS === '1') {
    // dump clickable lobby labels so the teams UI can be driven
    log('TEAMS: host texts', JSON.stringify(await vis(host)));
  }
  await clickText(host, /^Begin Match/);
  const tb = Date.now();
  for (const p of joiners) { const t0 = Date.now(); while (Date.now() - t0 < 60000) { if ((await T(p)).snapRecv > 0) break; await p.waitForTimeout(100); } log(p.__name, 'first snapshot', Date.now() - tb, 'ms after Begin'); }
  const rows = [];
  for (let s = 0; s <= SECS; s += 5) {
    const h = await T(host); const r = { s, hostTx: h.lastSentTick };
    for (const p of joiners) r[p.__name] = (await T(p)).lastRecvTick;
    rows.push(r); await host.waitForTimeout(5000);
  }
  console.table(rows); res.rows = rows;
  log('host end:', JSON.stringify(await vis(host)));
  for (const p of joiners) log(p.__name, 'end:', JSON.stringify(await vis(p)));
  log('ice', JSON.stringify(await iceInfo(host)));
  console.log('RESULT', JSON.stringify(res));
} catch (e) { console.log('FAIL', e.message); await b.close(); process.exit(1); }
await b.close();
