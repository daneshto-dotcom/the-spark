/**
 * SPARK — S123 P2: networked worker-duel over REAL WebRTC (2 peers).
 *
 * @quarantine-flaky — 2-context Trystero/Nostr mesh over public relays (the established
 * relay-churn flake class; CI treats as advisory, run locally to gate).
 *
 * THE default-on de-risk spec: a real duel where the HOST's authoritative sim lives in
 * the Web Worker and the JOINER is a plain wire consumer. Covers what the solo smokes
 * (worker.spec / worker-bots.spec) cannot:
 *   • the NETWORKED-host adoption path (S122 solo-proved only);
 *   • worker-built snapshots ARE the wire snapshots — the joiner's whole world advances
 *     exclusively from HostSync.wrapSnapshot(workerResult.snapshot) sends;
 *   • the remote-INTENT worker path: a joiner placement rides INTENT → host validates +
 *     seat-stamps → simWorkerDriver.postIntent → worker dispatch → snapshot back to the
 *     wire — the full round-trip a live duel depends on;
 *   • cross-mode matrix (GEMINI S123, adopted — STRONGER merged form): the joiner boots
 *     WITH `worker=1` and must NOT adopt (clients never do; the gate requires
 *     !isClientNow). Since a client is a direct-mode consumer regardless of flag, one
 *     room proves both permutations: worker-host × direct-consumer AND flag-carrying
 *     client stays direct. The execution model provably never bleeds into the wire.
 *   • the phase-d oracle over a networked duel: 0 mirror-vs-worker hash mismatches on
 *     the host while remote intents interleave with local ones.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  hostNewRoom,
  joinRoom,
  lobbyUiPoints,
  canvasToCss,
  placeFreeSparkAndConfirm,
  readWorldState,
  waitForWorld,
} from './helpers';

async function readSimWorker(
  page: Page,
): Promise<{ ready: boolean; failed: boolean; hashMismatches: number } | null> {
  return await page.evaluate(
    () =>
      (window as unknown as {
        __SPARK__: { simWorker: { ready: boolean; failed: boolean; hashMismatches: number } | null };
      }).__SPARK__.simWorker,
  );
}

test.describe('S123 P2 — networked worker-duel @quarantine-flaky', () => {
  test('worker-host duel: joiner converges on worker-built snapshots, remote INTENT round-trips, 0 hash mismatches', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const hostCtx = await browser.newContext();
    const joinCtx = await browser.newContext();
    // Spawn-rate seam (the bomb/potato/nplayer convention): production 0.15/s is far too
    // sparse for placement waits in the 2-page e2e environment — the drain clamp caps the
    // sim at 3×fps, so wall-time spawn cadence stretches ~3× on top (probed S123: first
    // spark at ~18s without the seam). The host's rate rides the worker INIT
    // (ratePerSecond — the S122 seam plumbing this spec exercises for real).
    for (const c of [hostCtx, joinCtx]) {
      await c.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    }
    try {
      const hostPage = await hostCtx.newPage();
      const joiner = await joinCtx.newPage();
      const errors: Record<string, string[]> = { host: [], joiner: [] };
      hostPage.on('pageerror', (e) => errors.host.push(String(e)));
      joiner.on('pageerror', (e) => errors.joiner.push(String(e)));

      // ── Form the room: BOTH peers carry worker=1 (cross-mode: only the host may adopt).
      const code = await hostNewRoom(hostPage, '/?debug=1&worker=1');
      await joinRoom(joiner, code, '/?debug=1&worker=1');
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees joiner', 60_000);

      const pts = await lobbyUiPoints(hostPage);
      const begin = await canvasToCss(hostPage, pts.beginButton.x, pts.beginButton.y);
      await hostPage.mouse.click(begin.x, begin.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'host PLAYING', 30_000);
      await waitForWorld(joiner, (w) => w.gameState === 'PLAYING', 'joiner PLAYING', 30_000);

      // ── The HOST adopts the worker on the NETWORKED path.
      await hostPage.waitForFunction(
        () => {
          const s = (window as unknown as {
            __SPARK__: { simWorker: { ready: boolean; failed: boolean } | null };
          }).__SPARK__;
          return s.simWorker !== null && s.simWorker.ready && !s.simWorker.failed;
        },
        { timeout: 20_000 },
      );

      // ── Cross-mode guard: the flag-carrying JOINER must NEVER adopt (clients are
      // direct wire consumers; a client-side worker would corrupt its mirror).
      expect(await readSimWorker(joiner)).toBeNull();

      // ── The joiner's world advances EXCLUSIVELY from worker-built wire snapshots.
      const jT0 = (await readWorldState(joiner)).tick;
      await waitForWorld(
        joiner,
        (w) => w.tick > jT0 + 120,
        'joiner tick advances on worker-built snapshots',
        20_000,
      );

      // ── HOST-authored placement: local intent → worker → structural snapshot → wire.
      await placeFreeSparkAndConfirm(hostPage, 560, 400);
      const hostPrims = (await readWorldState(hostPage)).primitives.length;
      await waitForWorld(
        joiner,
        (w) => w.primitives.length >= hostPrims,
        'host-authored primitive reaches the joiner',
        20_000,
      );

      // ── Wire-cadence bound (GEMINI S123 CHECK, adopted): the joiner's accepted-message
      // rate over a 10s window must sit in a sane band around the designed ~10-12.5 Hz
      // snapshot cadence (structural floor ~100ms + the ≥80ms forward gate). Host→joiner
      // traffic is snapshot-dominated (positions never ride the wire), so this catches
      // BOTH a stalled bridge (<4 Hz) and a dropped-throttle 60 Hz flood (>30 Hz) that
      // pure liveness asserts would wave through. Band is slack for beacons/godly kinds.
      const acceptedAt = async (p: Page): Promise<number> =>
        await p.evaluate(() => {
          const nt = (window as unknown as {
            __SPARK__: { netTransport: { getDiagnostics(): { accepted: number } } | null };
          }).__SPARK__.netTransport;
          return nt === null ? -1 : nt.getDiagnostics().accepted;
        });
      const acc0 = await acceptedAt(joiner);
      expect(acc0).toBeGreaterThanOrEqual(0);
      await joiner.waitForTimeout(10_000);
      const accRate = ((await acceptedAt(joiner)) - acc0) / 10;
      expect(accRate).toBeGreaterThan(4);
      expect(accRate).toBeLessThan(30);

      // ── JOINER-authored placement: INTENT → host worker dispatch → snapshot back.
      // placeFreeSparkAndConfirm's landing wait IS the host-authoritative round-trip.
      await placeFreeSparkAndConfirm(joiner, 1360, 400);

      // ── Convergence: both worlds settle to the same primitive set size.
      const hostCount = (await readWorldState(hostPage)).primitives.length;
      await waitForWorld(
        joiner,
        (w) => w.primitives.length === hostCount,
        `joiner primitive count converges to host (${hostCount})`,
        20_000,
      );

      // ── Verdicts: oracle clean on the host, joiner still worker-less, no page errors.
      const hostWorker = await readSimWorker(hostPage);
      expect(hostWorker).not.toBeNull();
      expect(hostWorker!.failed).toBe(false);
      expect(hostWorker!.hashMismatches).toBe(0);
      expect(await readSimWorker(joiner)).toBeNull();
      expect(errors.host).toEqual([]);
      expect(errors.joiner).toEqual([]);
    } finally {
      await hostCtx.close();
      await joinCtx.close();
    }
  });
});
