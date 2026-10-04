/**
 * SPARK — S195 (N9) — THE JOINER HALF OF THE LAG INSTRUMENT. NOT a gate.
 *
 *     SPARK_LAG_MEASURE=1 SPARK_LAG_OUT=.tmp-gates/lag npx vitest run src/net/lagWaveMeasure.test.ts   # 1st: records the boards
 *     npx playwright test -c scripts/lag/playwright.lag.config.ts                                         # 2nd: replays them
 *
 * The question it answers: **is the brother's lag his DOWNLOAD, or his PC?** The Node instrument weighs the
 * snapshot; this one feeds the same wave-N snapshots — byte for byte what `NetTransport.send` emits, at the
 * real 10 Hz — into a REAL joiner page and reads what that page spends:
 *   · `handle ms`  — `NetTransport.handleRawMessage`: JSON.parse + validation + `ClientSync.receive`
 *   · `frame ms`   — the DEV frame probe (`__SPARK__.frameMs`): CPU from the top of the game tick to the end
 *                    of Pixi's render, which is where the joiner applies the snapshot and interpolates
 *   · `fps`        — real requestAnimationFrame intervals (what the player sees)
 * under Chrome's CPU throttle (1× / 4× / 6× — DevTools' "mid-tier" and "low-end mobile" settings, the usual
 * weak-PC proxy) with the fx at HIGH, LOW and legacy.
 *
 * ⚠ HOW THE SNAPSHOTS GET IN. A real two-peer room is formed (real Nostr signalling, real WebRTC), the match
 * is started, then the joiner's `handleRawMessage` is wrapped: the live host's own (tiny, 2-player) snapshots
 * are dropped, and recorded ones are handed to the ORIGINAL handler with the live envelope's `matchId` and
 * `epoch` and a seq above the live one — so every gate a real snapshot passes (host-auth, match id, epoch,
 * seq) is passed by these through the same code. Only the network leg is skipped, on purpose: localhost has
 * no bandwidth limit, so the network half is computed from the measured bytes instead (see the report).
 */
import { test, type Page } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvasToCss, hostNewRoom, joinRoom, waitForWorld, CANVAS_WIDTH } from '../../e2e/helpers';

const DIR = process.env.SPARK_LAG_OUT ?? '.tmp-gates/lag';
const WAVES = (process.env.SPARK_LAG_WAVES ?? '1,5,8,10,15').split(',').map(Number);
const LABEL = process.env.SPARK_LAG_LABEL ?? 'natural';
const THROTTLES = (process.env.SPARK_LAG_THROTTLES ?? '1,4,6').split(',').map(Number);
const FX = (process.env.SPARK_LAG_FX ?? 'high,low,legacy').split(',');
const PROFILE = process.env.SPARK_LAG_PROFILE === '1';
const WARM_MS = 3000;
const MEASURE_MS = 8000;

interface Row {
  project: string; wave: number; throttle: number; fx: string; snapKiB: number; injected: number;
  handleMsMed: number; handleMsP95: number; frameMsMed: number; frameMsP95: number; fpsMed: number; fpsP5: number;
  longFrames: number; renderer: string; counts: Record<string, number>;
  /** The same board with injection STOPPED: what rendering alone costs (no parse, no apply). */
  idleFpsMed: number; idleFpsP5: number; idleFrameMsMed: number;
}

type CpuProfile = { nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }>; startTime: number; endTime: number };
/** Inclusive time per function (counted once per stack) — which RENDERER's sync owns the frame. */
function topInclusive(profile: CpuProfile, n: number, filter: RegExp): string {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const total = profile.nodes.reduce((a, x) => a + (x.hitCount ?? 0), 0);
  const usPer = (profile.endTime - profile.startTime) / Math.max(1, total);
  const key = (x: CpuProfile['nodes'][number]): string => `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()?.split('?')[0]}:${x.callFrame.lineNumber + 1}`;
  const sub = new Map<number, number>();
  const subOf = (id: number): number => {
    const c = sub.get(id); if (c !== undefined) return c;
    const x = byId.get(id)!; let t = x.hitCount ?? 0;
    for (const ch of x.children ?? []) t += subOf(ch);
    sub.set(id, t); return t;
  };
  const incl = new Map<string, number>();
  const walk = (id: number, on: Set<string>): void => {
    const x = byId.get(id)!; const k = key(x); const fresh = !on.has(k);
    if (fresh) { incl.set(k, (incl.get(k) ?? 0) + subOf(id)); on.add(k); }
    for (const ch of x.children ?? []) walk(ch, on);
    if (fresh) on.delete(k);
  };
  walk(profile.nodes[0]!.id, new Set());
  return [...incl.entries()].filter(([k]) => filter.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `    ${((100 * v) / total).toFixed(1).padStart(5)} %  ${((v * usPer) / 1000).toFixed(0).padStart(6)} ms  ${k}`).join(String.fromCharCode(10));
}

/** Top self-time functions of a CDP CPU profile — what DOMINATES the joiner's main thread, not a guess. */
function topSelf(profile: CpuProfile, n: number): string {
  const total = profile.nodes.reduce((a, x) => a + (x.hitCount ?? 0), 0);
  const usPer = (profile.endTime - profile.startTime) / Math.max(1, total);
  const self = new Map<string, number>();
  for (const x of profile.nodes) {
    const k = `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()?.split('?')[0]}:${x.callFrame.lineNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + (x.hitCount ?? 0));
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `    ${((100 * v) / total).toFixed(1).padStart(5)} %  ${((v * usPer) / 1000).toFixed(0).padStart(6)} ms  ${k}`).join(String.fromCharCode(10));
}

async function installInjector(page: Page): Promise<void> {
  await page.evaluate(() => {
    type T = { handleRawMessage: (d: string, p: string, s: string) => void };
    const g = window as unknown as { __SPARK__: { netTransport: T }; __lag: Record<string, unknown> };
    const t = g.__SPARK__.netTransport;
    const orig = t.handleRawMessage.bind(t);
    const lag = (g.__lag = { orig, live: null as null | { raw: string; peer: string; strat: string }, injecting: false, handle: [] as number[], raf: [] as number[], seqs: [] as string[], timer: 0 });
    t.handleRawMessage = (d: string, p: string, s: string): void => {
      if (d.startsWith('{"kind":"NETSNAPSHOT"')) {
        lag.live = { raw: d, peer: p, strat: s };
        if (lag.injecting) return;
      }
      orig(d, p, s);
    };
    let last = performance.now();
    const loop = (now: number): void => { lag.raf.push(now - last); last = now; if (lag.raf.length > 2000) lag.raf.shift(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}

async function loadSequence(page: Page, seqs: string[]): Promise<void> {
  await page.evaluate((s) => { (window as unknown as { __lag: { seqs: string[] } }).__lag.seqs = s; }, seqs);
}

/** Start the 10 Hz injection inside the page; returns nothing, runs until stopInjection. */
async function startInjection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lag = (window as unknown as { __lag: {
      orig: (d: string, p: string, s: string) => void; live: { raw: string; peer: string; strat: string } | null;
      injecting: boolean; handle: number[]; seqs: string[]; timer: number; } }).__lag;
    if (lag.live === null) throw new Error('no live NETSNAPSHOT captured yet');
    const env = JSON.parse(lag.live.raw) as { snapshotSeq: number; matchId?: string; epoch?: number };
    const seqs = lag.seqs.map((raw) => {
      const m = JSON.parse(raw) as Record<string, unknown>;
      if (env.matchId !== undefined) m.matchId = env.matchId; else delete m.matchId;
      if (env.epoch !== undefined) m.epoch = env.epoch; else delete m.epoch;
      return m;
    });
    // ⛔ MONOTONIC ACROSS CONFIGS. The first profile run started each injection at live+1e6; when the live seq
    // had not moved past the previous injection's last seq, EVERY injected w10 snapshot was dropped on the seq
    // gate and the page went on rendering the old board (counts read primitives 20 at "w10"). Checked below.
    const l2 = lag as unknown as { nextSeq?: number };
    let seq = Math.max(l2.nextSeq ?? 0, env.snapshotSeq + 1_000_000);
    let i = 0;
    lag.injecting = true;
    lag.handle = [];
    const { peer, strat } = lag.live;
    lag.timer = window.setInterval(() => {
      const m = seqs[i++ % seqs.length]!;
      m.snapshotSeq = seq++;
      l2.nextSeq = seq;
      const raw = JSON.stringify(m); // a fresh string each time, as the wire would deliver
      const t0 = performance.now();
      lag.orig(raw, peer, strat);
      lag.handle.push(performance.now() - t0);
    }, 100);
  });
}

async function stopInjection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lag = (window as unknown as { __lag: { injecting: boolean; timer: number } }).__lag;
    window.clearInterval(lag.timer);
    lag.injecting = false;
  });
}

const pct = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN; };

test('S195 N9 — joiner cost of a wave-N board, replayed at 10 Hz', async ({ browser }, info) => {
  test.skip(!existsSync(join(DIR, `burst-${LABEL}-w${WAVES[0]}.json`)), `run the Node instrument first (${DIR})`);
  const hostCtx = await browser.newContext();
  const joinCtx = await browser.newContext();
  for (const c of [hostCtx, joinCtx]) await c.addInitScript(() => { (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true; });
  const host = await hostCtx.newPage();
  const joiner = await joinCtx.newPage();
  const rows: Row[] = [];
  try {
    const code = await hostNewRoom(host);
    await joinRoom(joiner, code);
    await waitForWorld(host, (w) => w.peerCount >= 1, 'host sees joiner', 90_000);
    await waitForWorld(joiner, (w) => w.peerCount >= 1, 'joiner sees host', 90_000);
    const begin = await canvasToCss(host, CANVAS_WIDTH / 2, 814);
    await host.mouse.click(begin.x, begin.y);
    await waitForWorld(joiner, (w) => w.gameState === 'PLAYING', 'joiner PLAYING', 60_000);
    await installInjector(joiner);
    await joiner.waitForFunction(() => (window as unknown as { __lag: { live: unknown } }).__lag.live !== null, undefined, { timeout: 20_000 });
    const renderer = await joiner.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const cdp = await joinCtx.newCDPSession(joiner);
    await joiner.bringToFront();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    // Guard: a page Chrome treats as hidden throttles rAF/timers to ~1-4 Hz (run 1's invalid numbers).
    const vis = await joiner.evaluate(() => document.visibilityState);
    if (vis !== 'visible') throw new Error(`joiner page is ${vis} — numbers would measure background throttling`);
    for (const wave of WAVES) {
      const file = join(DIR, `burst-${LABEL}-w${wave}.json`);
      if (!existsSync(file)) { console.log(`skip w${wave}: no ${file}`); continue; }
      const seqs = JSON.parse(readFileSync(file, 'utf8')) as string[];
      const snapKiB = seqs.reduce((a, s) => a + s.length, 0) / seqs.length / 1024;
      await loadSequence(joiner, seqs);
      for (const fx of FX) {
        await joiner.evaluate((f) => {
          const lab = (window as unknown as { __SPARK__: { fx: { setLegacy(v: boolean): void; setHighQuality(v: boolean): void } } }).__SPARK__.fx;
          lab.setLegacy(f === 'legacy');
          lab.setHighQuality(f === 'high');
        }, fx);
        for (const thr of THROTTLES) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
          await startInjection(joiner);
          await joiner.waitForTimeout(WARM_MS);
          await joiner.evaluate(() => { const l = (window as unknown as { __lag: { handle: number[]; raf: number[] } }).__lag; l.handle = []; l.raf = []; });
          const f0 = await joiner.evaluate(() => (window as unknown as { __SPARK__: { frameMs: readonly number[] } }).__SPARK__.frameMs.length);
          void f0;
          if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
          await joiner.waitForTimeout(MEASURE_MS);
          if (PROFILE) {
            const { profile } = await cdp.send('Profiler.stop') as unknown as { profile: CpuProfile };
            console.log(`PROFILE ${info.project.name} w${wave} ${fx} ${thr}x:
${topSelf(profile, 30)}`);
            console.log(`INCLUSIVE (src files) ${info.project.name} w${wave} ${fx} ${thr}x:` + String.fromCharCode(10) + topInclusive(profile, 40, /\.ts:/));
          }
          const got = await joiner.evaluate(() => {
            const g = window as unknown as { __lag: { handle: number[]; raf: number[] }; __SPARK__: { frameMs: readonly number[]; world: { creatures: Map<unknown, unknown>; primitives: Map<unknown, unknown>; bonds: Map<unknown, unknown>; effects: unknown[] } } };
            const w = g.__SPARK__.world;
            return { handle: [...g.__lag.handle], raf: [...g.__lag.raf], frame: [...g.__SPARK__.frameMs].slice(-240),
              counts: { creatures: w.creatures.size, primitives: w.primitives.size, bonds: w.bonds.size } };
          });
          await stopInjection(joiner);
          // Render-only baseline: same board, no snapshots arriving, same throttle.
          await joiner.waitForTimeout(500);
          await joiner.evaluate(() => { (window as unknown as { __lag: { raf: number[] } }).__lag.raf = []; });
          await joiner.waitForTimeout(4000);
          const idle = await joiner.evaluate(() => {
            const g = window as unknown as { __lag: { raf: number[] }; __SPARK__: { frameMs: readonly number[] } };
            return { raf: [...g.__lag.raf], frame: [...g.__SPARK__.frameMs].slice(-120) };
          });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          const fps = got.raf.filter((x) => x > 0).map((x) => 1000 / x);
          const idleFps = idle.raf.filter((x) => x > 0).map((x) => 1000 / x);
          const row: Row = {
            project: info.project.name, wave, throttle: thr, fx, snapKiB: +snapKiB.toFixed(1), injected: got.handle.length,
            handleMsMed: +pct(got.handle, 0.5).toFixed(2), handleMsP95: +pct(got.handle, 0.95).toFixed(2),
            frameMsMed: +pct(got.frame, 0.5).toFixed(2), frameMsP95: +pct(got.frame, 0.95).toFixed(2),
            fpsMed: +pct(fps, 0.5).toFixed(1), fpsP5: +pct(fps, 0.05).toFixed(1),
            longFrames: got.raf.filter((x) => x > 50).length, renderer, counts: got.counts,
            idleFpsMed: +pct(idleFps, 0.5).toFixed(1), idleFpsP5: +pct(idleFps, 0.05).toFixed(1), idleFrameMsMed: +pct(idle.frame, 0.5).toFixed(2),
          };
          const want = (JSON.parse(seqs[0]!) as { snapshot: { primitives?: unknown[] } }).snapshot.primitives?.length ?? 0;
          if (Math.abs(got.counts.primitives - want) > Math.max(5, want * 0.1)) {
            throw new Error(`injected board NOT applied: page has ${got.counts.primitives} primitives, recording has ${want}`);
          }
          rows.push(row);
          console.log(`${row.project} w${wave} ${fx.padEnd(6)} ${thr}x  snap ${row.snapKiB} KiB  handle ${row.handleMsMed}/${row.handleMsP95} ms  frame ${row.frameMsMed}/${row.frameMsP95} ms  fps ${row.fpsMed} (p5 ${row.fpsP5})  long>50ms ${row.longFrames}  injected ${row.injected}  | idle fps ${row.idleFpsMed} (p5 ${row.idleFpsP5}) frame ${row.idleFrameMsMed}  ${JSON.stringify(row.counts)}`);
          writeFileSync(join(DIR, `joiner-${info.project.name}-${LABEL}.json`), JSON.stringify({ renderer, rows }, null, 1));
        }
      }
    }
  } finally {
    await hostCtx.close();
    await joinCtx.close();
  }
});
