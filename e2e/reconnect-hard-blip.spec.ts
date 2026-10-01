/**
 * SPARK — S189 (C4): the auto-reconnect against a HARD blip, over REAL WebRTC.
 *
 * Owner, S189: "connection was lost at like wave five … Need to make sure connection is established
 * and always on" — and a screenshot of the terminal CONNECTION LOST overlay.
 *
 * reconnect.spec.ts drops the joiner with `netTransport.disconnect()`. That is a CLEAN leave, and it
 * measures almost nothing: Trystero keeps ONE RTCPeerConnection per remote peer and shares it across
 * rooms, so the rejoin re-binds the still-open connection in ~0.2 s (measured S189). A real blip —
 * a network drop, a relay loss, a sleeping laptop — kills that connection, and the rejoin has to
 * build a FRESH one: signalling round-trips, ICE, DTLS, SCTP. Measured S189 on this machine, same
 * LAN: a fresh join takes ~6.3 s.
 *
 * This spec forces exactly that by closing the joiner's peer connections, then asks the question the
 * owner asked: does the match come back inside the RECONNECTING grace, before the terminal overlay?
 *
 * Tagged quarantine-flaky like reconnect.spec.ts: real 2-context WebRTC over public relays.
 */
import { test, expect } from '@playwright/test';
import { canvasToCss, hostNewRoom, joinRoom, readWorldState, waitForWorld } from './helpers.ts';

const CANVAS_WIDTH = 1920; // duplicated from src (e2e cannot import src/ — see helpers.ts:159)
/** main.ts RECONNECT_GRACE_MS — the RECONNECTING window before the terminal overlay. */
const GRACE_MS = 15_000;

test.describe('S189 C4 — auto-reconnect after a HARD blip (fresh peer connection) @quarantine-flaky', () => {
  test('joiner peer connection dies → the rejoin completes inside the grace', async ({ browser }) => {
    test.setTimeout(150_000);
    const hostCtx = await browser.newContext();
    const joinCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const joinPage = await joinCtx.newPage();

    const code = await hostNewRoom(hostPage);
    await joinRoom(joinPage, code);
    await hostPage.waitForFunction(
      () => {
        const s = (window as never as { __SPARK__: { netTransport: { peerCount(): number } | null } }).__SPARK__;
        return s.netTransport !== null && s.netTransport.peerCount() > 0;
      },
      { timeout: 60_000 },
    );
    const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814); // smoke.spec idiom
    await hostPage.mouse.click(beginBtn.x, beginBtn.y);
    await waitForWorld(joinPage, (w) => w.gameState === 'PLAYING', 'joiner reaches PLAYING', 30_000);

    let blipAt = 0;
    const attemptsAt: number[] = [];
    joinPage.on('console', (m) => {
      if (blipAt > 0 && m.text().includes('reconnect attempt')) attemptsAt.push(Date.now() - blipAt);
    });

    // ── the HARD blip: close every peer connection the joiner's transport holds ──
    const tickBefore = (await readWorldState(joinPage)).tick;
    blipAt = Date.now();
    const closed = await joinPage.evaluate(() => {
      const s = (window as never as {
        __SPARK__: { netTransport: { strategies: Map<string, { room: { getPeers?: () => Record<string, RTCPeerConnection> } | null }> } | null };
      }).__SPARK__;
      let n = 0;
      for (const h of s.netTransport?.strategies.values() ?? []) {
        for (const pc of Object.values(h.room?.getPeers?.() ?? {})) {
          pc.close();
          n++;
        }
      }
      return n;
    });
    expect(closed, 'the blip must actually close a live peer connection').toBeGreaterThan(0);

    let recoveredMs = -1;
    try {
      await joinPage.waitForFunction(
        (tb) => {
          const s = (window as never as {
            __SPARK__: { world: { gameState: string; tick: number }; netTransport: { peerCount(): number } | null };
          }).__SPARK__;
          return s.world.gameState === 'PLAYING' && s.netTransport !== null && s.netTransport.peerCount() > 0 && s.world.tick > tb + 30;
        },
        tickBefore,
        { timeout: 45_000 },
      );
      recoveredMs = Date.now() - blipAt;
    } catch {
      recoveredMs = -1;
    }
    console.log(
      `[S189 C4 hard blip] closed ${closed} peer connection(s); reconnect attempts at ${attemptsAt.join(', ')} ms; ` +
        `recovered at ${recoveredMs} ms (-1 = not within 45 s); grace ${GRACE_MS} ms`,
    );
    expect(recoveredMs, 'the match did not come back at all').toBeGreaterThan(0);
    expect(recoveredMs, 'it came back only AFTER the grace — the player saw the terminal CONNECTION LOST').toBeLessThan(GRACE_MS);
    await hostCtx.close();
    await joinCtx.close();
  });
});
