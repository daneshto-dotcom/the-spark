// S194 T17 — LIVE blip scenarios. SCEN=joinDark|hostDark|joinHard|hostHard  DARK_MS=8000
import { chromium } from 'playwright';
import { INIT, texts, clickText, waitText, T } from './live-lib.mjs';
const URL = process.env.SPARK_URL ?? 'https://spark-online.space/';
const SCEN = process.env.SCEN ?? 'joinHard';
const DARK_MS = Number(process.env.DARK_MS ?? 8000);
const T0 = Date.now(); let BLIP = 0;
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s${BLIP ? ` blip+${((Date.now() - BLIP) / 1000).toFixed(1)}` : ''}]`, ...a);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(INIT, {});
  p.on('console', (m) => { const t = m.text(); if (/ice-poll|relay sockets|onPeerHandshake/.test(t)) return; if (BLIP && /\[net\]/.test(t)) log(`<${name}>`, t.slice(0, 200)); });
  await p.goto(URL); await clickText(p, /^Multiplayer$/); await waitText(p, /^MULTIPLAYER LOBBY$/);
  return p;
};
const vis = async (p) => (await texts(p)).list.filter((e) => e.visible).map((e) => e.text.replace(/\s+/g, ' ').slice(0, 70));
const host = await mk('host'), join = await mk('join');
await clickText(host, /^Host New Room$/);
const code = (await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000)).text;
const inp = join.locator('input[type="text"][maxlength="6"]'); await inp.click(); await inp.fill(code); await inp.press('Enter');
await waitText(host, /^Begin Match/, 60000); await clickText(host, /^Begin Match/);
await join.waitForTimeout(8000);
const target = SCEN.startsWith('host') ? host : join;
log('pre-blip', JSON.stringify({ h: (await T(host)).lastSentTick, j: (await T(join)).lastRecvTick }));
BLIP = Date.now();
if (SCEN.endsWith('Dark')) await target.evaluate((ms) => { window.__blackoutUntil = performance.now() + ms; }, DARK_MS);
else log('closed pcs', await target.evaluate(() => { let n = 0; for (const pc of window.__PCS ?? []) { if (pc.connectionState !== 'closed') { pc.close(); n++; } } return n; }));
let lastJ = (await T(join)).lastRecvTick, recoveredAt = null, sawLost = false, sawOverlay = new Set();
for (let i = 0; i < 70; i++) {
  await join.waitForTimeout(1000);
  const [hv, jv] = [await vis(host), await vis(join)];
  for (const [n, v] of [['host', hv], ['join', jv]]) for (const t of v) if (/CONNECTION LOST|RECONNECT|MIGRAT|still reconnecting|waiting for the other/i.test(t)) { if (!sawOverlay.has(n + t)) { sawOverlay.add(n + t); log(`${n} overlay:`, t); } if (/CONNECTION LOST/.test(t)) sawLost = true; }
  const h = await T(host), j = await T(join);
  if (i % 3 === 0) log('ticks', JSON.stringify({ hostTx: h.lastSentTick, joinRx: j.lastRecvTick, joinTx: j.lastSentTick, hostRx: h.lastRecvTick, hpc: h.pcStates.slice(-3), jpc: j.pcStates.slice(-3) }));
  const overlayUp = [...hv, ...jv].some((t) => /CONNECTION LOST|RECONNECTING|MIGRATING/i.test(t));
  if (recoveredAt === null && Date.now() - BLIP > DARK_MS * (SCEN.endsWith('Dark') ? 1 : 0) + 1000 && j.lastRecvTick > lastJ + 5 && !overlayUp) { recoveredAt = (Date.now() - BLIP) / 1000; log('RECOVERED (joiner receiving fresh ticks, no overlay on either side)'); }
  if (recoveredAt !== null && i > recoveredAt + 6) break;
  lastJ = recoveredAt === null && Date.now() - BLIP < DARK_MS ? j.lastRecvTick : lastJ;
}
log('END host:', JSON.stringify(await vis(host))); log('END join:', JSON.stringify(await vis(join)));
console.log('RESULT', JSON.stringify({ SCEN, DARK_MS, recoveredAtS: recoveredAt, sawLost }));
await b.close();
