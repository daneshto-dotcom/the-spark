/**
 * SPARK — S137 P3: what is the castle bank actually costing us? (@perf-measure — soak lane, NOT gating)
 *
 * WHY. S136 B3 opened the faucet ×6 and drove gatherer idling from chronic to 1.2% — but the
 * bottleneck did not disappear, it MOVED: with one gatherer and nobody spending, the 5-slot bank
 * fills in ~10 s and the hauler then stands WAITING (measured 247 of 338 samples). The owner's open
 * question is "is cap 5 still right now that it is the binding constraint?".
 *
 * ⭐ THIS SPEC DELIBERATELY DOES NOT TUNE ANYTHING. `CASTLE_BANK_CAP` and the recipe-size table it
 * sits beside in constants.ts are ONE decision (the table exists precisely so nobody picks a cap
 * that cannot hold a recipe outright), and the ruling is the owner's. This produces the NUMBERS the
 * ruling needs, in a real browser running real physics — because no unit test in this repo runs the
 * physics loop, which is the standing lesson of S136.
 *
 * THE EXPERIMENT, with a falsifiable prediction stated up front so a null result is still a result:
 *   H1 — time-to-full scales with the cap (a bigger bucket takes longer to fill).
 *   H2 — the steady-state WAITING fraction does NOT improve with the cap, because with no consumer
 *        every cap saturates and then stalls identically. If H2 holds, the honest answer to the
 *        owner is that the cap is NOT the real constraint — CONSUMPTION is — and raising 5→8 buys
 *        a few seconds of buffer, not throughput.
 *   H3 — under periodic consumption the stall would disappear at every cap, confirming the cap is
 *        only a burst buffer. NOT MEASURED HERE, and said plainly rather than implied: driving a
 *        realistic consumer needs a dispatch seam __SPARK__ does not expose, and adding one was not
 *        worth it for a secondary hypothesis. Carried forward.
 */
import { test, expect } from '@playwright/test';
import { titleButtonCss, waitForWorld } from './helpers.ts';

const CAPS = [5, 6, 8];
/**
 * ⚠ THIS WINDOW IS LOAD-BEARING AND THE FIRST CUT GOT IT WRONG. At 22 s the cap-5 bank did not
 * reach full until 20.2 s, so the run ended before any stall could accumulate and the table
 * proudly reported "WAITING 0.0%" at every cap — i.e. "there is no bottleneck", which is the exact
 * opposite of what S136 observed and would have sent the owner a confidently wrong answer. The
 * quantity of interest only exists AFTER the bank saturates, so the window must comfortably outlast
 * time-to-full at the LARGEST cap under test.
 */
const OBSERVE_MS = 60_000;
const SAMPLE_MS = 250;

interface Run {
  cap: number;
  samples: number;
  waiting: number;
  hauling: number;
  seeking: number;
  ssSamples: number;
  ssWaiting: number;
  msToFull: number | null;
  banked: number;
  finalBank: number;
}

async function measure(
  page: import('@playwright/test').Page,
  cap: number,
): Promise<Run> {
  await page.addInitScript({ content: `window.__TEST_CASTLE_BANK_CAP__ = ${cap};` });
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await titleButtonCss(page, 'solo');
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');

  // Guard the premise: if the seam did not take, every number below is about cap 5 and the whole
  // comparison is silently meaningless. Fail loud instead.
  const liveCap = await page.evaluate(
    () => (window as unknown as { __SPARK__: { castlePanel: { getUiPoints: () => { bank: { cap: number } } } } })
      .__SPARK__.castlePanel.getUiPoints().bank.cap,
  );
  expect(liveCap, `__TEST_CASTLE_BANK_CAP__=${cap} did not reach the running game`).toBe(cap);

  const start = Date.now();
  let samples = 0;
  let waiting = 0;
  let hauling = 0;
  let seeking = 0;
  // STEADY STATE = samples taken after the bank first reached cap. This is the split that matters:
  // stall before saturation is meaningless, and averaging the two together dilutes the very signal
  // the owner is asking about.
  let ssSamples = 0;
  let ssWaiting = 0;
  let msToFull: number | null = null;
  let banked = 0;
  let lastBank = 0;

  while (Date.now() - start < OBSERVE_MS) {
    const s = await page.evaluate(() => {
      const w = (window as unknown as {
        __SPARK__: {
          world: {
            localPlayerId: number;
            gatherers: Map<number, { state: string; ownerPlayerId: number }>;
            castleBanks: Map<number, unknown[]>;
          };
        };
      }).__SPARK__.world;
      const mine = Array.from(w.gatherers.values()).filter((g) => g.ownerPlayerId === w.localPlayerId);
      return { states: mine.map((g) => g.state), bank: w.castleBanks.get(w.localPlayerId)?.length ?? 0 };
    });
    for (const st of s.states) {
      samples++;
      if (st === 'WAITING') waiting++;
      else if (st === 'HAULING') hauling++;
      else seeking++;
      if (msToFull !== null) {
        ssSamples++;
        if (st === 'WAITING') ssWaiting++;
      }
    }
    // Bank RISES only on a deposit, so a rise counts a banked shape. Deltas rather than final
    // length, so the count stays valid if anything ever drains the bank mid-run.
    if (s.bank > lastBank) banked += s.bank - lastBank;
    lastBank = s.bank;
    if (msToFull === null && s.bank >= cap) msToFull = Date.now() - start;

    await page.waitForTimeout(SAMPLE_MS);
  }

  const finalBank = await page.evaluate(
    () => {
      const w = (window as unknown as {
        __SPARK__: { world: { localPlayerId: number; castleBanks: Map<number, unknown[]> } };
      }).__SPARK__.world;
      return w.castleBanks.get(w.localPlayerId)?.length ?? 0;
    },
  );
  return { cap, samples, waiting, hauling, seeking, ssSamples, ssWaiting, msToFull, banked, finalBank };
}

test.describe('S137 P3 — castle bank throughput @perf-measure', () => {
  test('@perf-measure measures haul throughput and hauler stall across CASTLE_BANK_CAP 5/6/8', async ({
    page,
  }) => {
    test.setTimeout(CAPS.length * 2 * (OBSERVE_MS + 20_000));

    const runs: Run[] = [];
    for (const cap of CAPS) runs.push(await measure(page, cap));

    const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);
    const lines = [
      '',
      '=== S137 P3 — CASTLE BANK THROUGHPUT (solo, 1 gatherer, NO consumer) ===',
      `observation window ${OBSERVE_MS / 1000}s per cap, sampled every ${SAMPLE_MS}ms`,
      '',
      'cap | banked | shapes/min | time-to-full | WAITING(all) | WAITING(steady) | HAULING | SEEKING',
      '----+--------+------------+--------------+--------------+-----------------+---------+--------',
      ...runs.map(
        (r) =>
          `${String(r.cap).padStart(3)} | ${String(r.banked).padStart(6)} | ` +
          `${((r.banked / (OBSERVE_MS / 60000))).toFixed(1).padStart(10)} | ` +
          `${(r.msToFull === null ? 'never' : `${(r.msToFull / 1000).toFixed(1)}s`).padStart(12)} | ` +
          `${pct(r.waiting, r.samples).padStart(12)} | ` +
          `${(r.ssSamples === 0 ? 'never full' : pct(r.ssWaiting, r.ssSamples)).padStart(15)} | ` +
          `${pct(r.hauling, r.samples).padStart(7)} | ${pct(r.seeking, r.samples).padStart(7)}`,
      ),
      '',
    ];
    console.log(lines.join('\n'));

    // The measurement must be REAL before any conclusion is drawn from it: a run where the gatherer
    // never hauled anything would print a beautiful table of zeros and prove nothing.
    for (const r of runs) {
      expect(r.samples, `cap ${r.cap}: no gatherer samples at all`).toBeGreaterThan(20);
      expect(r.banked, `cap ${r.cap}: nothing was ever banked — the economy did not run`).toBeGreaterThan(0);
    }

    // H1 — a bigger bucket takes longer to fill. Reported rather than hard-asserted: this is a
    // measurement spec, and a wall-clock ordering on a loaded CI runner is not a correctness claim.
    const filled = runs.filter((r) => r.msToFull !== null);
    console.log(
      `[H1] time-to-full by cap: ${filled.map((r) => `${r.cap}=${((r.msToFull ?? 0) / 1000).toFixed(1)}s`).join('  ')}`,
    );
    // H2 — the load-bearing finding. If stall does not improve as the cap grows, the cap is not the
    // constraint; consumption is, and raising it buys buffer rather than throughput.
    console.log(
      `[H2] STEADY-STATE WAITING by cap: ${runs
        .map((r) => `${r.cap}=${r.ssSamples === 0 ? 'never-full' : pct(r.ssWaiting, r.ssSamples)}`)
        .join('  ')}`,
    );
    // Guard the METHOD, not just the result: if the window ends before the bank saturates there is
    // no steady state to report, and a 0% stall would be an artefact of stopping too early rather
    // than a finding. That is exactly how the 22s first cut produced "no bottleneck at any cap".
    const neverFull = runs.filter((r) => r.msToFull === null).map((r) => r.cap);
    expect(
      neverFull,
      `caps ${neverFull.join(',')} never saturated in ${OBSERVE_MS / 1000}s — window too short to ` +
        `measure steady-state stall; raise OBSERVE_MS rather than reporting these numbers`,
    ).toEqual([]);
  });
});
