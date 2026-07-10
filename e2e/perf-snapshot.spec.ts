/**
 * SPARK — S120 P1: snapshot build-vs-send cost measurement (WORKER_SIM_FOUNDATION.md
 * phase (b) MEASURE-first mandate).
 *
 * NOT a gate. This spec is an instrument: it forms a REAL 2-peer Trystero duel,
 * builds up a mid-game world (structures + accrued hazards + spark churn), then
 * reads the S119 P2 __SPARK__.snapshotProbe aggregate (host side) across three
 * windows:
 *   W1 light  — early PLAYING, few entities, no throttle
 *   W2 heavy  — after the build phase, no throttle
 *   W3 heavy+6x — same world, host page under CDP Emulation.setCPUThrottlingRate(6)
 *                 (Grok S120 Council #1/#4: measure the weak-host case directly
 *                 instead of hand-waving an analytic multiplier)
 *
 * GO rule (PDR S120): GO if W2 buildMsAvg >= 0.25ms OR buildMsMax >= 2ms
 * (dev machine, unthrottled), OR W3 buildMsAvg >= 1.5ms OR buildMsMax >= 12ms
 * (throttled = weak-host proxy, thresholds pre-multiplied).
 *
 * Opt-in only: `SPARK_PERF=1 npx playwright test e2e/perf-snapshot.spec.ts`
 * — skipped otherwise so normal e2e runs never pay the ~5min wall-clock.
 * Results are transcribed into WORKER_SIM_FOUNDATION.md (phase-b results table).
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  canvasToCss,
  hostNewRoom,
  joinRoom,
  lobbyUiPoints,
  placeFreeSparkAndConfirm,
  waitForWorld,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './helpers';

interface ProbeShape {
  count: number;
  buildMsTotal: number;
  buildMsMax: number;
  sendMsTotal: number;
  sendMsMax: number;
}

interface WindowResult extends ProbeShape {
  label: string;
  seconds: number;
  buildMsAvg: number;
  sendMsAvg: number;
  world: { sparks: number; prims: number; bonds: number; creatures: number; hazards: number; effects: number };
  snapshotJsonBytes: number;
}

/** Read + optionally reset the host-side probe. */
async function readProbe(page: Page, reset: boolean): Promise<ProbeShape> {
  return await page.evaluate((doReset) => {
    const spark = (window as {
      __SPARK__?: { snapshotProbe?: ProbeShape & { reset?: () => void } };
    }).__SPARK__;
    const p = spark?.snapshotProbe;
    if (!p) throw new Error('__SPARK__.snapshotProbe unavailable — DEV build required');
    const out = {
      count: p.count,
      buildMsTotal: p.buildMsTotal,
      buildMsMax: p.buildMsMax,
      sendMsTotal: p.sendMsTotal,
      sendMsMax: p.sendMsMax,
    };
    if (doReset) p.reset?.();
    return out;
  }, reset);
}

/** World composition + a one-off snapshot JSON byte size (off-cadence single build). */
async function readComposition(page: Page): Promise<WindowResult['world'] & { snapshotJsonBytes: number }> {
  return await page.evaluate(() => {
    const spark = (window as {
      __SPARK__?: {
        world: {
          freeSparks: Map<number, unknown>; primitives: Map<number, unknown>;
          bonds: Map<number, unknown>; creatures: Map<number, unknown>;
          bombs: Map<number, unknown>; hunters: Map<number, unknown>;
          potatoes: Map<number, unknown>; rainbows: Map<number, unknown>;
          seagulls: Map<number, unknown>; poops: Map<number, unknown>;
          effects: unknown[];
        };
        hostSync?: { buildSnapshotMessage: (w: unknown, epoch: number) => unknown } | null;
        session?: { hostSync: { buildSnapshotMessage: (w: unknown, epoch: number) => unknown } | null; currentEpoch: number } | null;
      };
    }).__SPARK__;
    if (!spark) throw new Error('__SPARK__ unavailable');
    const w = spark.world;
    // hostSync may be exposed directly or via session; degrade to -1 bytes if neither.
    const hs = spark.hostSync ?? spark.session?.hostSync ?? null;
    const epoch = spark.session?.currentEpoch ?? 0;
    let bytes = -1;
    if (hs) {
      try {
        bytes = JSON.stringify(hs.buildSnapshotMessage(w, epoch)).length;
      } catch { /* informational only */ }
    }
    return {
      sparks: w.freeSparks.size,
      prims: w.primitives.size,
      bonds: w.bonds.size,
      creatures: w.creatures.size,
      hazards: w.bombs.size + w.hunters.size + w.potatoes.size + w.rainbows.size + w.seagulls.size + w.poops.size,
      effects: w.effects.length,
      snapshotJsonBytes: bytes,
    };
  });
}

/** Measure one window: reset probe, wait, read aggregate. */
async function measureWindow(page: Page, label: string, seconds: number): Promise<WindowResult> {
  await readProbe(page, true); // reset
  await page.waitForTimeout(seconds * 1000);
  const p = await readProbe(page, false);
  const comp = await readComposition(page);
  const { snapshotJsonBytes, ...world } = comp;
  return {
    label,
    seconds,
    ...p,
    buildMsAvg: p.count > 0 ? p.buildMsTotal / p.count : 0,
    sendMsAvg: p.count > 0 ? p.sendMsTotal / p.count : 0,
    world,
    snapshotJsonBytes,
  };
}

function fmt(r: WindowResult): string {
  return [
    `| ${r.label} | ${r.seconds}s | ${r.count} | ${r.buildMsAvg.toFixed(3)} | ${r.buildMsMax.toFixed(3)} | ${r.sendMsAvg.toFixed(3)} | ${r.sendMsMax.toFixed(3)} | ` +
    `${r.world.sparks}/${r.world.prims}/${r.world.bonds}/${r.world.creatures}/${r.world.hazards}/${r.world.effects} | ${r.snapshotJsonBytes} |`,
  ].join('');
}

test.describe('S120 P1 — snapshot build-vs-send measurement @perf-measure', () => {
  test.skip(process.env.SPARK_PERF !== '1', 'opt-in measurement (SPARK_PERF=1)');

  test('2-peer duel: probe windows light / heavy / heavy+6x-throttle', async ({ browser }) => {
    test.setTimeout(420_000); // connect + build phase + 3 windows

    const mk = async (): Promise<BrowserContext> => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
      });
      // Elevated spawn keeps the free-spark pool at cap → realistic churn + drag supply.
      await ctx.addInitScript(() => {
        (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number }).__TEST_SPAWN_RATE_PER_SECOND__ = 3;
      });
      return ctx;
    };
    const hostCtx = await mk();
    const joinCtx = await mk();
    try {
      const hostPage = await hostCtx.newPage();
      const joinPage = await joinCtx.newPage();

      // ── Form the duel ────────────────────────────────────────────────
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees joiner', 60_000);
      const pts = await lobbyUiPoints(hostPage);
      const begin = await canvasToCss(hostPage, pts.beginButton.x, pts.beginButton.y);
      await hostPage.mouse.click(begin.x, begin.y);
      for (const [i, p] of [hostPage, joinPage].entries()) {
        await waitForWorld(p, (w) => w.gameState === 'PLAYING', `peer ${i} PLAYING`, 30_000);
      }

      // ── W1: light window (early PLAYING) ─────────────────────────────
      const w1 = await measureWindow(hostPage, 'W1 light', 45);

      // ── Build phase: both peers place structures (interleaved) ───────
      // Host builds left territory, joiner right; near-placements form bonds.
      const spots: Array<[number, number]> = [];
      for (let i = 0; i < 8; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        spots.push([320 + col * 90, CANVAS_HEIGHT / 2 - 140 + row * 90]);
      }
      for (const [x, y] of spots) {
        await placeFreeSparkAndConfirm(hostPage, x, y).catch(() => null);
        await placeFreeSparkAndConfirm(joinPage, CANVAS_WIDTH - x, y).catch(() => null);
      }

      // ── W2: heavy window (post-build, hazards accrued) ───────────────
      const w2 = await measureWindow(hostPage, 'W2 heavy', 60);

      // ── W3: heavy + 6x CPU throttle on the HOST page (weak-host proxy) ─
      const cdp = await hostCtx.newCDPSession(hostPage);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      const w3 = await measureWindow(hostPage, 'W3 heavy+6x', 60);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

      // ── Report ────────────────────────────────────────────────────────
      const header =
        '| window | dur | sends | buildAvg ms | buildMax ms | sendAvg ms | sendMax ms | sparks/prims/bonds/creat/haz/fx | snapBytes |';
      const sep = '|---|---|---|---|---|---|---|---|---|';
      const lines = [header, sep, fmt(w1), fmt(w2), fmt(w3)];
      const go =
        w2.buildMsAvg >= 0.25 || w2.buildMsMax >= 2 || w3.buildMsAvg >= 1.5 || w3.buildMsMax >= 12;
      lines.push('');
      lines.push(
        `VERDICT: ${go ? 'GO' : 'NO-GO'} (rule: W2 avg>=0.25|max>=2  OR  W3 avg>=1.5|max>=12)`,
      );
      // eslint-disable-next-line no-console
      console.log('\n[S120-P1 MEASUREMENT]\n' + lines.join('\n') + '\n');

      // Validity floor only — this spec measures, it does not gate.
      test.expect(w2.count).toBeGreaterThanOrEqual(100);
    } finally {
      await hostCtx.close();
      await joinCtx.close();
    }
  });
});
