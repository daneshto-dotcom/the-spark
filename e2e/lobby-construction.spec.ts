/**
 * SPARK — S63 P3: lobby-construction e2e coverage.
 *
 * lobbyScreen.ts (~548 LOC) has its pure helpers unit-tested but its Pixi/DOM
 * CONSTRUCTOR + state machine (mode transitions, room-code, Begin-Match gating,
 * reset) have ZERO coverage. A prior (S61) Council UNANIMOUSLY deferred the
 * structural refactor until a Playwright net existed asserting exactly these
 * surfaces. THIS spec is that net — single-page, deterministic, no real peers:
 * it drives the lobby TITLE→LOBBY→hosting and asserts the constructed surfaces
 * via the DEV __SPARK__.lobbyScreen accessors. With this in place the deferred
 * refactor (and the pure-LobbyStateMachine extraction) can proceed under a net.
 *
 * Begin-Match gating is exercised by calling updatePeerStatus() directly through
 * __SPARK__ (a peer "joining" without real WebRTC) — deterministic and flake-free;
 * the real multi-peer Begin flow is covered by smoke.spec.ts (3-peer) +
 * nplayer.spec.ts (4-peer). main.ts's per-frame updatePeerStatus(0) is a no-op in
 * 'hosting' mode (peerCount>0 is false), so the simulated reveal persists.
 */
import { test, expect, type Page } from '@playwright/test';
import { hostNewRoom, waitForWorld, canvasToCss, CANVAS_WIDTH, CANVAS_HEIGHT } from './helpers';

type LobbyDebug = { mode: string; hostConnected: boolean; beginButtonVisible: boolean };

async function lobbyDebug(page: Page): Promise<LobbyDebug> {
  return await page.evaluate(() => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { getDebugState: () => LobbyDebug } } }
    ).__SPARK__;
    if (!s) throw new Error('__SPARK__ not exposed');
    return s.lobbyScreen.getDebugState();
  });
}
async function roomCode(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { getRoomCode: () => string } } }
    ).__SPARK__;
    return s?.lobbyScreen.getRoomCode() ?? '';
  });
}
async function statusText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { getStatusText: () => string } } }
    ).__SPARK__;
    return s?.lobbyScreen.getStatusText() ?? '';
  });
}
async function simulatePeerJoin(page: Page, peerCount: number): Promise<void> {
  await page.evaluate((n) => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { updatePeerStatus: (n: number) => void } } }
    ).__SPARK__;
    s?.lobbyScreen.updatePeerStatus(n);
  }, peerCount);
}
async function resetLobby(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { reset: () => void } } }
    ).__SPARK__;
    s?.lobbyScreen.reset();
  });
}

test.describe('S63 - lobby construction coverage (unblocks the deferred 548-LOC refactor)', () => {
  test('LOBBY constructs the DOM code-input + wires the sanitiser (select mode)', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE on single page');
    // Click "1v1 (2 Player)" → LOBBY (mirror of hostNewRoom's first half).
    const oneVOne = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40 + 72 + 24);
    await page.mouse.click(oneVOne.x, oneVOne.y);
    await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY on single page');

    // The DOM input overlay is constructed + visible in select mode.
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toBeVisible({ timeout: 10_000 });

    // The input HANDLER is wired: a typed lowercase code is uppercased in the
    // VALUE (not just CSS text-transform) — proves sanitizeRoomCodeValue runs.
    await input.click();
    await input.fill('abcde2');
    expect(await input.inputValue()).toBe('ABCDE2');

    // Lobby constructed in its default 'select' mode with Begin hidden.
    const ds = await lobbyDebug(page);
    expect(ds.mode).toBe('select');
    expect(ds.beginButtonVisible).toBe(false);

    // The lobby scene graph was actually populated (panes + buttons + text added
    // to the root container) — catches a constructor that builds an empty/no-op
    // lobby. NOTE (S63 CHECK / Grok #4 + Gemini panes): explicit per-pane
    // visibility-switching, the joining/error/countdown modes, input
    // focus/paste lifecycle, and reset()-detaches-listeners remain UNCOVERED —
    // logged as the refactor session's net-extension carry-forward.
    const childCount = await page.evaluate(() => {
      const s = (
        window as unknown as { __SPARK__?: { lobbyScreen: { container: { children: unknown[] } } } }
      ).__SPARK__;
      return s?.lobbyScreen.container.children.length ?? 0;
    });
    expect(childCount).toBeGreaterThan(0);
  });

  test('HOST builds a room code; Begin-Match gates on peer count; reset() clears the surface', async ({
    page,
  }) => {
    const code = await hostNewRoom(page); // TITLE→1v1→LOBBY→HOST; returns the room code
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

    // After HOST: hosting mode, code shown, Begin hidden (no peers connected yet).
    let ds = await lobbyDebug(page);
    expect(ds.mode).toBe('hosting');
    expect(ds.beginButtonVisible).toBe(false);
    expect(await roomCode(page)).toBe(code);

    // A peer connects (simulated — no real WebRTC) → Begin reveals + live count.
    await simulatePeerJoin(page, 1);
    ds = await lobbyDebug(page);
    expect(ds.hostConnected).toBe(true);
    expect(ds.beginButtonVisible).toBe(true);
    expect(await statusText(page)).toContain('players connected');

    // reset() returns the whole lobby surface to its constructed default.
    await resetLobby(page);
    ds = await lobbyDebug(page);
    expect(ds.mode).toBe('select');
    expect(ds.beginButtonVisible).toBe(false);
    expect(await roomCode(page)).toBe('');
  });
});
