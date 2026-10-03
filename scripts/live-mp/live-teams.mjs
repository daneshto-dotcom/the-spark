// S194 T17 — teams lobby, 2 peers on different teams (host T1, joiner T2), then Begin + sync.
import { chromium } from 'playwright';
import { INIT, texts, clickText, waitText, T, toCss } from './live-lib.mjs';
const URL = process.env.SPARK_URL ?? 'https://spark-online.space/';
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage(); p.__name = name; await p.addInitScript(INIT, {});
  p.on('console', (m) => { const t = m.text(); if (/CLAIM_TEAM|team/i.test(t) || (m.type() === 'error' && !/onJoinError: torrent/.test(t))) log(`<${name} ${m.type()}>`, t.slice(0, 200)); });
  p.on('pageerror', (e) => log(`<${name} PAGEERROR>`, e.message.slice(0, 200)));
  await p.goto(URL); await clickText(p, /^Multiplayer$/); await waitText(p, /^MULTIPLAYER LOBBY$/); return p;
};
const vis = async (p) => (await texts(p)).list.filter((e) => e.visible).map((e) => e.text.replace(/\s+/g, ' ').slice(0, 70));
const chipNear = async (p, labelRe) => {
  const L = (await texts(p)).list.filter((e) => e.visible);
  const lab = L.find((e) => labelRe.test(e.text)); if (!lab) throw new Error('no seat label ' + labelRe);
  const chips = L.filter((e) => /^(—|T[1-4])$/.test(e.text)).sort((a, c) => Math.hypot(a.x - lab.x, a.y - lab.y) - Math.hypot(c.x - lab.x, c.y - lab.y));
  return chips[0];
};
const clickChip = async (p, labelRe) => { const c = await chipNear(p, labelRe); const xy = await toCss(p, c.x, c.y); await p.mouse.click(xy.x, xy.y); return c.text; };
const beginAlpha = (p) => p.evaluate(() => { let a = null; const w = (n) => { if (typeof n.text === 'string' && /^Begin Match/.test(n.text)) { let q = n, al = 1; while (q) { al *= q.alpha ?? 1; q = q.parent; } a = al; } for (const c of n.children ?? []) w(c); }; w(window.__app.stage); return a; });
try {
  const host = await mk('host'), join = await mk('join');
  log('scripts', await host.evaluate(() => [...document.scripts].map((s) => s.src.split('/').pop()).join(' ')));
  await clickText(host, /^Host New Room$/);
  const code = (await waitText(host, /^[2-9A-HJ-NP-Z]{6}$/, 20000)).text;
  const inp = join.locator('input[type="text"][maxlength="6"]'); await inp.click(); await inp.fill(code); await inp.press('Enter');
  await waitText(host, /^Begin Match/, 60000);
  log('host lobby', JSON.stringify(await vis(host)));
  // NEGATIVE: both on T1 -> Begin must be dimmed with the hint
  await clickChip(host, /^P1\s+HOST/); await host.waitForTimeout(2500);
  await clickChip(join, /^P2\s/); await join.waitForTimeout(3500);
  log('both T1? host:', JSON.stringify(await vis(host)), 'beginAlpha', await beginAlpha(host));
  log('join:', JSON.stringify(await vis(join)));
  // joiner -> T2
  await clickChip(join, /^P2\s/); await join.waitForTimeout(3500);
  const hv = await vis(host), jv = await vis(join);
  log('T1 vs T2? host:', JSON.stringify(hv), 'beginAlpha', await beginAlpha(host)); log('join:', JSON.stringify(jv));
  const ok = hv.includes('T1') && hv.includes('T2') && jv.includes('T1') && jv.includes('T2');
  log('chips agree on both pages:', ok);
  await clickText(host, /^Begin Match/); const tb = Date.now();
  while (Date.now() - tb < 60000) { if ((await T(join)).snapRecv > 0) break; await join.waitForTimeout(100); }
  log('first snapshot', Date.now() - tb, 'ms after Begin');
  const st = (await T(join)).start ?? ''; const ro = st.match(/"roster":\[[^\]]*\]/); log('joiner START roster:', ro ? ro[0].replace(/"(pubkey|sig|peerId)":"[^"]*"/g, '"$1":"…"').slice(0, 600) : st.slice(0, 300));
  const rows = []; for (let s = 0; s <= 21; s += 7) { rows.push({ s, hostTx: (await T(host)).lastSentTick, joinRx: (await T(join)).lastRecvTick }); await host.waitForTimeout(7000); }
  console.table(rows);
  log('host end', JSON.stringify(await vis(host))); log('join end', JSON.stringify(await vis(join)));
  await host.screenshot({ path: '.tmp-gates/teams-host.png' }); await join.screenshot({ path: '.tmp-gates/teams-join.png' });
  console.log('RESULT', JSON.stringify({ chipsAgree: ok, rows }));
} catch (e) { console.log('FAIL', e.message); await b.close(); process.exit(1); }
await b.close();
