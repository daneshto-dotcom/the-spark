/**
 * SPARK — S196 `s196/render-perf` (F3) — **THE WHOLE VISUAL STACK, MEASURED TOGETHER, PER GRAPHICS TIER.**
 *
 * Opt-in only: `SPARK_PERF=1 npx playwright test e2e/render-bench.spec.ts` (on this worktree's own port).
 * Tagged `@perf-measure`, so the e2e-soak lane lists it and skips it (no SPARK_PERF on CI) — it costs CI nothing.
 *
 * Board: a VS-BOTS match (four races), every blueprint the four seats can place (stamped through the real
 * reducer, each seat's bank seeded), and the fx lab's horde topped up to ~140 creatures before every sample.
 *
 * Arms, INTERLEAVED in one session (round-robin, never one arm then the next): for each tier T,
 *   ON  = T as shipped,  OFF = T + the fx lab's legacy switch (the runtime twin of `?fx=legacy`).
 * Plus `MIN−LEG`: MINIMAL vs HIGH+legacy (= what `?fx=legacy` draws), the "MINIMAL costs ~0" check.
 *
 * Three clocks per frame — because the S196 tower-fx audit showed whole-frame time is noisy (~0.2 ms floor)
 * and counts a VARYING number of sim ticks:
 *   · pixi   — `app.renderer.render` (scene update + batching + GL submit, CPU side), patched in place;
 *   · sync   — the renderer-sync block: from the first `FxLayer.begin` in `fxBeginFrame` (the ground layer) to
 *              the last `FxLayer.end` in `fxEndFrame` (the top shade layer) — every renderer `sync`, fx layouts
 *              included, and NO sim tick (the sim runs before `fxBeginFrame`);
 *   · frame  — the game's own whole-frame probe (`__SPARK__.frameMs`), for reference only.
 * render CPU = pixi + sync.
 */
import { test, type Page } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers';
import * as fs from 'node:fs';

const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 6);
const FRAMES = Number(process.env.BENCH_FRAMES ?? 150);
const SETTLE = 15;
const HORDE = Number(process.env.BENCH_HORDE ?? 140);
const OUT = process.env.BENCH_OUT ?? '.tmp-gates/render-bench.json';

type Arm = { tier: 'HIGH' | 'LOW' | 'MINIMAL'; legacy: boolean };
const ARMS: Arm[] = [
  { tier: 'HIGH', legacy: false }, { tier: 'HIGH', legacy: true },
  { tier: 'LOW', legacy: false }, { tier: 'LOW', legacy: true },
  { tier: 'MINIMAL', legacy: false }, { tier: 'MINIMAL', legacy: true },
];
const key = (a: Arm): string => `${a.tier}${a.legacy ? '+legacy' : ''}`;

async function startBots(page: Page): Promise<void> {
  const vsBots = await titleButtonCss(page, 'vsBots');
  await page.mouse.click(vsBots.x, vsBots.y);
  await page.waitForFunction(() => {
    const s = (window as any).__SPARK__;
    return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
  }, { timeout: 20_000 });
  const startPt = await page.evaluate(() => (window as any).__SPARK__.botSetupOverlay.getUiPoints().start);
  const startCss = await canvasToCss(page, startPt.x, startPt.y);
  await page.mouse.click(startCss.x, startCss.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.players.length === 4, 'bots PLAYING', 20_000);
}

test.describe('S196 F3 — visual stack per tier, interleaved @perf-measure', () => {
  test.skip(process.env.SPARK_PERF !== '1', 'opt-in measurement (SPARK_PERF=1)');

  test('render CPU per tier, fx on vs legacy, ~140 creatures + every tower', async ({ page }) => {
    test.setTimeout(40 * 60_000);
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
    await startBots(page);
    await page.waitForTimeout(8000); // past the backdrop hold: the race art is on the board

    // ── the board: every blueprint each seat can place, through the real reducer ──────────────
    const built = await page.evaluate(async () => {
      const sp = (window as any).__SPARK__;
      const w = sp.world;
      const { ALL_BLUEPRINT_IDS, blueprintBill } = await import('/src/state/blueprints.ts' as string);
      const { applyBuildBlueprint } = await import('/src/state/blueprintBuild.ts' as string);
      const { makeCastleBank } = await import('/src/state/castleBank.ts' as string);
      const { zoneRect } = await import('/src/render/zoneBackgroundRenderer.ts' as string);
      const out: string[] = [];
      const seats = [...w.players.keys()];
      for (const [si, pid] of seats.entries()) {
        const zones = [0, 1, 2, 3].map((z) => zoneRect(z, w.layout));
        const r = zones[si] ?? zones[0];
        for (const id of ALL_BLUEPRINT_IDS) {
          let ok = false;
          for (let gy = 0.2; gy <= 0.8 && !ok; gy += 0.15) {
            for (let gx = 0.15; gx <= 0.85 && !ok; gx += 0.1) {
              const bank = makeCastleBank();
              for (const [type, count] of blueprintBill(id)) bank[type] = (bank[type] ?? 0) + count;
              w.castleBanks.set(pid, bank);
              const before = w.primitives.size;
              applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: pid, blueprintId: id, centre: { x: r.x + r.w * gx, y: r.y + r.h * gy } });
              ok = w.primitives.size > before;
            }
          }
          if (ok) out.push(`${pid}:${id}`);
        }
      }
      return out;
    });
    console.log(`[bench] built ${built.length} blueprints: ${built.join(' ')}`);
    await page.waitForTimeout(3000);

    // ── the three clocks ───────────────────────────────────────────────────────────────────────
    await page.evaluate(async () => {
      const w = window as any;
      const app = w.__SPARK__.app;
      const { FxLayer } = await import('/src/render/fx/fxLayer.ts' as string);
      const st = { pixi: [] as number[], sync: [] as number[], t0: -1, rec: false };
      w.__BENCH__ = st;
      const origRender = app.renderer.render.bind(app.renderer);
      app.renderer.render = (...a: unknown[]) => {
        const t = performance.now();
        const r = origRender(...a);
        if (st.rec) st.pixi.push(performance.now() - t);
        return r;
      };
      const ob = FxLayer.prototype.begin;
      const oe = FxLayer.prototype.end;
      FxLayer.prototype.begin = function (this: any) { if (this.container.label === 'fxGround') st.t0 = performance.now(); return ob.call(this); };
      FxLayer.prototype.end = function (this: any) {
        const r = oe.call(this);
        if (this.container.label === 'fxTopShade' && st.t0 >= 0) { if (st.rec) st.sync.push(performance.now() - st.t0); st.t0 = -1; }
        return r;
      };
    });

    const setArm = async (a: Arm): Promise<void> => {
      await page.evaluate(async (arm) => {
        const w = window as any;
        const { setGraphicsTier } = await import('/src/render/displayPrefs.ts' as string);
        setGraphicsTier(arm.tier);
        w.__SPARK__.fx.setLegacy(arm.legacy);
        w.__SPARK__.fx.horde(arm.horde);
      }, { ...a, horde: HORDE });
    };
    const sample = async (): Promise<{ pixi: number[]; sync: number[]; frame: number[]; sprites: number; creatures: number }> => {
      await page.evaluate((n) => new Promise<void>((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), SETTLE);
      await page.evaluate(() => { const b = (window as any).__BENCH__; b.pixi.length = 0; b.sync.length = 0; b.rec = true; });
      await page.evaluate((n) => new Promise<void>((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), FRAMES);
      return page.evaluate((n) => {
        const w = window as any;
        const b = w.__BENCH__;
        b.rec = false;
        const st = w.__SPARK__.fx.stats();
        return { pixi: [...b.pixi], sync: [...b.sync], frame: [...w.__SPARK__.frameMs].slice(-n), sprites: st.ground + st.top, creatures: w.__SPARK__.world.creatures.size };
      }, FRAMES);
    };

    const data: Record<string, { pixi: number[]; sync: number[]; frame: number[]; sprites: number[]; creatures: number[] }> = {};
    for (const a of ARMS) data[key(a)] = { pixi: [], sync: [], frame: [], sprites: [], creatures: [] };
    for (let r = 0; r < ROUNDS; r++) {
      const order = r % 2 === 0 ? ARMS : [...ARMS].reverse();
      for (const a of order) {
        await setArm(a);
        const s = await sample();
        const d = data[key(a)]!;
        d.pixi.push(...s.pixi); d.sync.push(...s.sync); d.frame.push(...s.frame);
        d.sprites.push(s.sprites); d.creatures.push(s.creatures);
      }
      console.log(`[bench] round ${r + 1}/${ROUNDS} done`);
    }
    const stat = (xs: number[]) => {
      const s = [...xs].sort((p, q) => p - q);
      const mean = xs.reduce((p, c) => p + c, 0) / Math.max(1, xs.length);
      const med = s[Math.floor(s.length / 2)] ?? 0;
      return { n: xs.length, mean: +mean.toFixed(3), median: +med.toFixed(3), p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(3) };
    };
    const summary: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(data)) {
      const px = stat(d.pixi);
      const sy = stat(d.sync);
      // per-frame pairing is not guaranteed (the fog renders to its RT through the same call), so sum the stats
      summary[k] = { pixi: px, sync: sy, render: { mean: +(px.mean + sy.mean).toFixed(3), median: +(px.median + sy.median).toFixed(3) }, frame: stat(d.frame),
        spritesAvg: Math.round(d.sprites.reduce((p, c) => p + c, 0) / d.sprites.length),
        creaturesAvg: Math.round(d.creatures.reduce((p, c) => p + c, 0) / d.creatures.length) };
    }
    fs.writeFileSync(OUT, JSON.stringify({ rounds: ROUNDS, frames: FRAMES, built, summary }, null, 1));
    console.log(`[bench] ${JSON.stringify(summary)}`);
  });
});
