/**
 * SPARK — S122 P2 (host-migration D3) / S124 P1 (D4): kill-host takeover over REAL WebRTC.
 *
 * @quarantine-flaky — 3-context Trystero/Nostr mesh over public relays (the reconnect.spec
 * flake class; CI treats as advisory, run locally to gate).
 *
 * Scenario (HOST_MIGRATION_DESIGN.md §9): host + 2 joiners reach PLAYING (warrant signed
 * at Begin, pubkey PoP in HELLOs — the S115/S118 D1/D2 machinery) → the HOST PAGE IS KILLED
 * → the lowest warranted surviving seat (ladder rank 0 — byte-identical timing to the D3
 * exact-successor path) fires MIGRATION_CLAIM and adopts authority; the other survivor
 * verifies the claim against its stored warrant, re-latches, and resumes at epoch 1.
 *
 * S124 D4 NOTE: __TEST_MIGRATION__ is now a TIMING OVERRIDE only (starvation/grace/ladder
 * ms) — migration itself is PRODUCTION-ON under PROTOCOL_VERSION 15. Test 1 keeps the
 * compressed-window flow; test 2 runs with NO seam at all, proving the production path
 * fires under the real 15s grace (the D4 activation acceptance gate).
 *
 * Assertions: successor world.isHost flips true + its tick advances (it simulates);
 * survivor stays/returns PLAYING with tick advancing (successor snapshots flowing through
 * the +MIGRATION_SEQ_JUMP seq gate) + currentEpoch === 1 on BOTH.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { canvasToCss, hostNewRoom, joinRoom, lobbyUiPoints, waitForWorld } from './helpers';

const SEAM = { starvationMs: 1500, graceMs: 1500 };

async function readTick(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
  );
}

test.describe('S122 P2 — host-migration D3 takeover @quarantine-flaky', () => {
  test('kill host → seat-1 claims + adopts authority → survivor re-latches at epoch 1', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const mk = async (): Promise<BrowserContext> => {
      const ctx = await browser.newContext();
      await ctx.addInitScript((seam) => {
        (window as { __TEST_MIGRATION__?: typeof seam }).__TEST_MIGRATION__ = seam;
      }, SEAM);
      return ctx;
    };
    const hostCtx = await mk();
    const j1Ctx = await mk();
    const j2Ctx = await mk();
    try {
      const hostPage = await hostCtx.newPage();
      const j1 = await j1Ctx.newPage();
      const j2 = await j2Ctx.newPage();

      // ── Form the 3-peer room; joiners in join order get seats 1 and 2 ──
      const code = await hostNewRoom(hostPage);
      await joinRoom(j1, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees j1', 60_000);
      await joinRoom(j2, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 2, 'host sees j2', 60_000);

      const pts = await lobbyUiPoints(hostPage);
      const begin = await canvasToCss(hostPage, pts.beginButton.x, pts.beginButton.y);
      await hostPage.mouse.click(begin.x, begin.y);
      for (const [i, p] of [hostPage, j1, j2].entries()) {
        await waitForWorld(p, (w) => w.gameState === 'PLAYING', `peer ${i} PLAYING`, 30_000);
      }

      // Both joiners must hold the warrant before the kill (it rode START_GAME_SIGNAL and
      // verifies async) — poll the DEV probe.
      for (const p of [j1, j2]) {
        await p.waitForFunction(
          () => {
            const s = (window as unknown as {
              __SPARK__: { netTransport: { peerCount(): number } | null };
            }).__SPARK__;
            return s.netTransport !== null && s.netTransport.peerCount() >= 2;
          },
          { timeout: 30_000 },
        );
      }
      // Let a few snapshots flow so lastAcceptedAt is armed on both joiners.
      await j1.waitForTimeout(2_000);

      // Identify seats (join order is not guaranteed → read them).
      const seatOf = async (p: Page): Promise<number> =>
        await p.evaluate(
          () =>
            (window as unknown as { __SPARK__: { world: { localPlayerId: number } } }).__SPARK__
              .world.localPlayerId as number,
        );
      const j1Seat = await seatOf(j1);
      const j2Seat = await seatOf(j2);
      const successorPage = j1Seat < j2Seat ? j1 : j2;
      const survivorPage = j1Seat < j2Seat ? j2 : j1;

      // ── KILL THE HOST ──────────────────────────────────────────────────
      await hostCtx.close();

      // ── The successor adopts authority (starvation 1.5s + grace 1.5s + sign+broadcast) ──
      await successorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { world: { isHost: boolean } } }).__SPARK__.world
            .isHost === true,
        { timeout: 45_000 },
      );
      await successorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { currentEpoch: number } }).__SPARK__
            .currentEpoch === 1,
        { timeout: 10_000 },
      );

      // The successor SIMULATES: PLAYING + tick advances.
      await waitForWorld(successorPage, (w) => w.gameState === 'PLAYING', 'successor PLAYING', 10_000);
      const sT0 = await readTick(successorPage);
      await successorPage.waitForFunction(
        (prev) =>
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
          prev + 60,
        sT0,
        { timeout: 15_000 },
      );

      // ── The survivor re-latches + resumes: epoch 1 + snapshots advance its mirror ──
      await survivorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { currentEpoch: number } }).__SPARK__
            .currentEpoch === 1,
        { timeout: 45_000 },
      );
      await waitForWorld(survivorPage, (w) => w.gameState === 'PLAYING', 'survivor PLAYING', 15_000);
      const vT0 = await readTick(survivorPage);
      await survivorPage.waitForFunction(
        (prev) =>
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
          prev + 30,
        vT0,
        { timeout: 20_000 },
      );

      expect(await seatOf(successorPage)).toBe(Math.min(j1Seat, j2Seat));
    } finally {
      await j1Ctx.close();
      await j2Ctx.close();
      await hostCtx.close().catch(() => undefined);
    }
  });

  test('S124 D4 — PRODUCTION activation: migration fires with NO seam under the real 15s grace', async ({
    browser,
  }) => {
    // No __TEST_MIGRATION__ anywhere: this is the exact code path a production player runs.
    // Timeline: kill host → peer-left/starvation (≤6s) → real RECONNECT_GRACE_MS (15s) →
    // ladder rank 0 fires → adoption. Generous budget for relay overhead.
    test.setTimeout(360_000);
    const hostCtx = await browser.newContext();
    const j1Ctx = await browser.newContext();
    const j2Ctx = await browser.newContext();
    try {
      const hostPage = await hostCtx.newPage();
      const j1 = await j1Ctx.newPage();
      const j2 = await j2Ctx.newPage();

      const code = await hostNewRoom(hostPage);
      await joinRoom(j1, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees j1', 60_000);
      await joinRoom(j2, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 2, 'host sees j2', 60_000);

      const pts = await lobbyUiPoints(hostPage);
      const begin = await canvasToCss(hostPage, pts.beginButton.x, pts.beginButton.y);
      await hostPage.mouse.click(begin.x, begin.y);
      for (const [i, p] of [hostPage, j1, j2].entries()) {
        await waitForWorld(p, (w) => w.gameState === 'PLAYING', `peer ${i} PLAYING`, 30_000);
      }
      // Full mesh + a few snapshot frames so the warrant landed and lastAcceptedAt is armed.
      for (const p of [j1, j2]) {
        await p.waitForFunction(
          () => {
            const s = (window as unknown as {
              __SPARK__: { netTransport: { peerCount(): number } | null };
            }).__SPARK__;
            return s.netTransport !== null && s.netTransport.peerCount() >= 2;
          },
          { timeout: 30_000 },
        );
      }
      await j1.waitForTimeout(2_000);

      const seatOf = async (p: Page): Promise<number> =>
        await p.evaluate(
          () =>
            (window as unknown as { __SPARK__: { world: { localPlayerId: number } } }).__SPARK__
              .world.localPlayerId as number,
        );
      const j1Seat = await seatOf(j1);
      const j2Seat = await seatOf(j2);
      const successorPage = j1Seat < j2Seat ? j1 : j2;
      const survivorPage = j1Seat < j2Seat ? j2 : j1;

      // ── KILL THE HOST — production detection + the real 15s grace now run ──
      await hostCtx.close();

      await successorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { world: { isHost: boolean } } }).__SPARK__.world
            .isHost === true,
        { timeout: 120_000 },
      );
      await successorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { currentEpoch: number } }).__SPARK__
            .currentEpoch === 1,
        { timeout: 10_000 },
      );
      // It SIMULATES under the new term…
      const sT0 = await readTick(successorPage);
      await successorPage.waitForFunction(
        (prev) =>
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
          prev + 60,
        sT0,
        { timeout: 15_000 },
      );
      // …and the survivor follows it at epoch 1 with an advancing mirror.
      await survivorPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { currentEpoch: number } }).__SPARK__
            .currentEpoch === 1,
        { timeout: 60_000 },
      );
      await waitForWorld(survivorPage, (w) => w.gameState === 'PLAYING', 'survivor PLAYING', 15_000);
      const vT0 = await readTick(survivorPage);
      await survivorPage.waitForFunction(
        (prev) =>
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
          prev + 30,
        vT0,
        { timeout: 20_000 },
      );
    } finally {
      await j1Ctx.close();
      await j2Ctx.close();
      await hostCtx.close().catch(() => undefined);
    }
  });

  test('S125 P1 — host-migration v2: a FROZEN-then-THAWED original host auto-rejoins as a client', async ({
    browser,
  }) => {
    // v2 (LOCKED §13.21): unlike the kill-host tests above (host context CLOSED = gone forever),
    // here the original host is only PARTITIONED — its main thread is frozen past the grace so the
    // survivors migrate to epoch 1, then it THAWS. On thaw it carries an rAF-gap partition evidence
    // (main.ts:2153) and resumes emitting epoch-0 snapshots; the successor answers the stale epoch
    // with its signed CLAIM ECHO (main.ts:2052), which — verified against the warrant the host
    // itself signed + the fresh partition evidence — DEPOSES it. Instead of the v1 terminal overlay
    // it now nulls its ClientSync, disconnects, and re-runs connectAsClient (the S82 reconnect path)
    // to FOLLOW the successor. Assert: the ex-host ends up isHost=false, currentEpoch=1, PLAYING,
    // with its mirror tick advancing off the successor's snapshots.
    test.setTimeout(300_000);
    const mk = async (): Promise<BrowserContext> => {
      const ctx = await browser.newContext();
      await ctx.addInitScript((seam) => {
        (window as { __TEST_MIGRATION__?: typeof seam }).__TEST_MIGRATION__ = seam;
      }, SEAM);
      return ctx;
    };
    const hostCtx = await mk();
    const j1Ctx = await mk();
    const j2Ctx = await mk();
    try {
      const hostPage = await hostCtx.newPage();
      const j1 = await j1Ctx.newPage();
      const j2 = await j2Ctx.newPage();

      const code = await hostNewRoom(hostPage);
      await joinRoom(j1, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees j1', 60_000);
      await joinRoom(j2, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 2, 'host sees j2', 60_000);

      const pts = await lobbyUiPoints(hostPage);
      const begin = await canvasToCss(hostPage, pts.beginButton.x, pts.beginButton.y);
      await hostPage.mouse.click(begin.x, begin.y);
      for (const [i, p] of [hostPage, j1, j2].entries()) {
        await waitForWorld(p, (w) => w.gameState === 'PLAYING', `peer ${i} PLAYING`, 30_000);
      }
      for (const p of [j1, j2]) {
        await p.waitForFunction(
          () => {
            const s = (window as unknown as {
              __SPARK__: { netTransport: { peerCount(): number } | null };
            }).__SPARK__;
            return s.netTransport !== null && s.netTransport.peerCount() >= 2;
          },
          { timeout: 30_000 },
        );
      }
      await j1.waitForTimeout(2_000);

      // ── FREEZE the host's main thread (busy-loop) past starvation+grace so the survivors migrate
      //    while it is silent; on return it carries a ≥ starvation rAF gap = partition evidence. ──
      await hostPage.evaluate((ms) => {
        const end = Date.now() + ms;
        // Synchronous spin — blocks rAF/snapshot emission; Date.now() (wall clock) still advances.
        while (Date.now() < end) {
          /* intentionally blocking the main thread */
        }
      }, 8_000);

      // ── The THAWED original host is deposed by the successor's claim echo and rejoins as client:
      //    it stops being host, adopts the successor's epoch, and resumes PLAYING as a follower. ──
      await hostPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { world: { isHost: boolean } } }).__SPARK__.world
            .isHost === false,
        { timeout: 60_000 },
      );
      await hostPage.waitForFunction(
        () =>
          (window as unknown as { __SPARK__: { currentEpoch: number } }).__SPARK__
            .currentEpoch === 1,
        { timeout: 30_000 },
      );
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'ex-host PLAYING as client', 20_000);
      const exHostT0 = await readTick(hostPage);
      await hostPage.waitForFunction(
        (prev) =>
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
          prev + 30,
        exHostT0,
        { timeout: 25_000 },
      );
    } finally {
      await hostCtx.close().catch(() => undefined);
      await j1Ctx.close();
      await j2Ctx.close();
    }
  });
});
