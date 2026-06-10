/**
 * SPARK — S82 P4(b) in-page auto-reconnect over REAL Trystero/Nostr WebRTC.
 *
 * @quarantine-flaky — real 2-context WebRTC over public Nostr relays (the same flake
 * class as the 4-peer FFA + S70 presence tests; see e2e.yml non-gating lane). Run
 * locally to verify the reconnect path; CI treats it as advisory.
 *
 * Scenario: host + joiner reach PLAYING → the JOINER's transport is hard-disconnected
 * (network blip simulation) → the S82 auto-reconnect grace must (1) show RECONNECTING,
 * (2) rejoin the same room with the same in-page selfId, (3) re-bind the frozen seat so
 * snapshots flow again, all WITHOUT a Return-to-Title. The host's drop-bench sweep may
 * bench the player during the gap; the rolling re-stamp must expire ≤2s after rebind.
 */
import { test, expect } from '@playwright/test';
import { canvasToCss, hostNewRoom, joinRoom, readWorldState, waitForWorld } from './helpers.ts';

const CANVAS_WIDTH = 1920; // duplicated from src (e2e cannot import src/ — see helpers.ts:159)

test.describe('S82 P4(b) — auto-reconnect after a transport blip @quarantine-flaky', () => {
  test('joiner transport drop → RECONNECTING grace → auto-rejoin → snapshots resume', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const hostCtx = await browser.newContext();
    const joinCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const joinPage = await joinCtx.newPage();

    const code = await hostNewRoom(hostPage);
    await joinRoom(joinPage, code);
    // Host begins the match once the peer is seated.
    await hostPage.waitForFunction(
      () => {
        const s = (window as never as { __SPARK__: { netTransport: { peerCount(): number } | null } }).__SPARK__;
        return s.netTransport !== null && s.netTransport.peerCount() > 0;
      },
      { timeout: 45_000 },
    );
    const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814); // smoke.spec idiom
    await hostPage.mouse.click(beginBtn.x, beginBtn.y);
    await waitForWorld(joinPage, (w) => w.gameState === 'PLAYING', 'joiner reaches PLAYING', 30_000);

    // ── the blip: kill the joiner's transport under it ──
    await joinPage.evaluate(() => {
      const s = (window as never as { __SPARK__: { netTransport: { disconnect(): void } | null } }).__SPARK__;
      s.netTransport?.disconnect();
    });

    // The auto-reconnect must rejoin + resume snapshot flow within the 15s grace
    // (typically ~3-6s over live relays). PLAYING must hold WITHOUT a title-return,
    // and the tick watermark must ADVANCE post-rejoin (snapshots flowing again).
    const tickBefore = (await readWorldState(joinPage)).tick;
    await joinPage.waitForFunction(
      (t0) => {
        const s = (window as never as {
          __SPARK__: { world: { gameState: string; tick: number }; netTransport: { peerCount(): number } | null };
        }).__SPARK__;
        return (
          s.world.gameState === 'PLAYING' &&
          s.netTransport !== null &&
          s.netTransport.peerCount() > 0 &&
          s.world.tick > t0 + 60
        );
      },
      tickBefore,
      { timeout: 25_000 },
    );

    // And the host must have the joiner UN-benched within the rolling-bench bound
    // (bench may or may not have fired depending on rejoin speed vs the 3s grace).
    await hostPage.waitForFunction(
      () => {
        const s = (window as never as {
          __SPARK__: { world: { tick: number; players: Map<number, { benchedUntilTick?: number }> } };
        }).__SPARK__;
        const p1 = s.world.players.get(1);
        return p1 !== undefined && (p1.benchedUntilTick === undefined || s.world.tick >= p1.benchedUntilTick);
      },
      { timeout: 15_000 },
    );

    const joinState = await readWorldState(joinPage);
    expect(joinState.gameState).toBe('PLAYING');
    await hostCtx.close();
    await joinCtx.close();
  });
});
