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
import { hostNewRoom, waitForWorld, canvasToCss, readSeats, CANVAS_WIDTH, CANVAS_HEIGHT } from './helpers';

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

// ─────────────────────────────────────────────────────────────────────────
// S64 P2 — lobby BEHAVIORAL surfaces not covered by P1's pure-reducer units
// nor the construction net above. Closes the S63 P3 CHECK net-extension
// carry-forward (minus the non-existent "countdown" mode and the joining/error
// modes already covered by P1 units + the protocol-mismatch smoke specs). With
// these the deferred lobby VISUAL refactor proceeds under a full behavioral net.
// ─────────────────────────────────────────────────────────────────────────
async function lobbyContainerVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const s = (
      window as unknown as { __SPARK__?: { lobbyScreen: { container: { visible: boolean } } } }
    ).__SPARK__;
    return s?.lobbyScreen.container.visible ?? false;
  });
}
async function gotoLobbySelect(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE on single page');
  // Click "1v1 (2 Player)" → LOBBY (mirror of hostNewRoom's first half).
  const oneVOne = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40 + 72 + 24);
  await page.mouse.click(oneVOne.x, oneVOne.y);
  await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY on single page');
}

test.describe('S64 - lobby behavioral surfaces (net-extension; unblocks the deferred visual refactor)', () => {
  test('pane-visibility: leaving LOBBY (Back to Title) hides the container AND the HTML input', async ({
    page,
  }) => {
    await gotoLobbySelect(page);
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toBeVisible({ timeout: 10_000 });
    expect(await lobbyContainerVisible(page)).toBe(true);
    expect(await input.evaluate((el) => (el as HTMLElement).style.display)).not.toBe('none');

    // Click "Back to Title" (canvas button bottom-left, centre ~150,1024). It
    // dispatches RETURN_TO_TITLE; the game loop's per-frame
    // `lobbyScreen.setVisible(gameState === 'LOBBY')` then hides the container,
    // and updateInputVisibility hides the absolutely-positioned HTML input.
    // (Driving via gameState — not a manual setVisible — because the loop
    // re-asserts visibility every frame.)
    const back = await canvasToCss(page, 150, 1024);
    await page.mouse.click(back.x, back.y);
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'Back to Title leaves LOBBY');
    expect(await lobbyContainerVisible(page)).toBe(false);
    await expect(input).toBeHidden({ timeout: 5_000 });
  });

  test('joinPane Pixi-tap focuses the HTML code input (S16 click-to-focus wiring)', async ({
    page,
  }) => {
    await gotoLobbySelect(page);
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(input).not.toBeFocused();
    // Click the join-pane body ABOVE the input rect (canvas y<460) and BELOW the
    // header — the pane's pointertap fires inputEl.focus() while mode==='select'.
    const tap = await canvasToCss(page, 1100, 430);
    await page.mouse.click(tap.x, tap.y);
    await expect(input).toBeFocused({ timeout: 5_000 });
  });

  test('Enter-key submits the join: mode->joining, Connecting status, input hidden', async ({
    page,
  }) => {
    await gotoLobbySelect(page);
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill('ABCDEF'); // valid [2-9A-HJ-NP-Z]{6}
    await input.press('Enter'); // S17 keydown Enter -> attemptJoin (same path as Connect)
    // attemptJoin flips state synchronously before the async transport join.
    const ds = await lobbyDebug(page);
    expect(ds.mode).toBe('joining');
    expect(await statusText(page)).toContain('Connecting');
    // joining mode hides the code input (updateInputVisibility: shown only in select).
    await expect(input).toBeHidden({ timeout: 5_000 });
  });

  test('destroy() removes the HTML code input from the DOM (teardown cleanup)', async ({
    page,
  }) => {
    await gotoLobbySelect(page);
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toHaveCount(1);
    // destroy() detaches the 4 input/window resize listeners (add/remove are
    // symmetric @ lobbyScreen 319-335 / 467-471) AND removes the absolutely-
    // positioned <input> from document.body. e2e can assert the DOM removal
    // directly; the listener detach stays inspection-verified (no leak-probe API).
    await page.evaluate(() => {
      const s = (
        window as unknown as { __SPARK__?: { lobbyScreen: { destroy: () => void } } }
      ).__SPARK__;
      s?.lobbyScreen.destroy();
    });
    await expect(input).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S70 P1 — lobby PRESENCE rack: deterministic render path (gating). The real
// host→peer broadcast over WebRTC is covered by the @quarantine-flaky 2-peer
// test in nplayer.spec.ts (Council DP1: real-peer netcode is quarantined,
// deterministic render proofs gate). This drives updatePresence() directly via
// __SPARK__ so the reducer→applyView→seatRack path is proven flake-free.
// ─────────────────────────────────────────────────────────────────────────
async function applyPresence(
  page: Page,
  roster: Array<{ seat: number; color: number; isYou: boolean }>,
): Promise<void> {
  await page.evaluate((r) => {
    const s = (
      window as unknown as {
        __SPARK__?: { lobbyScreen: { updatePresence: (r: unknown) => void } };
      }
    ).__SPARK__;
    s?.lobbyScreen.updatePresence(r);
  }, roster);
}

test.describe('S70 - lobby presence rack (deterministic render path; gating)', () => {
  test('a presence roster paints the JOINER its OWN seat + accurate drop-on-leave', async ({
    page,
  }) => {
    await gotoLobbySelect(page);
    // Enter JOINING mode — the count-based path leaves a joiner with NO own-seat,
    // so any isYou below must come from the presence roster (the P3 win).
    const input = page.locator('input[type="text"][maxlength="6"]');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill('ABCDEF');
    await input.press('Enter');
    expect((await lobbyDebug(page)).mode).toBe('joining');

    // Pre-beacon: count-based occupancy, the joiner cannot know its own seat yet.
    await simulatePeerJoin(page, 1);
    expect((await readSeats(page)).some((s) => s.isYou)).toBe(false);

    // Host broadcasts a 3-seat roster; THIS joiner is seat 2.
    await applyPresence(page, [
      { seat: 0, color: 0xff3b6b, isYou: false },
      { seat: 1, color: 0x3bd7ff, isYou: false },
      { seat: 2, color: 0xffe23b, isYou: true },
    ]);
    let seats = await readSeats(page);
    expect(seats.map((s) => s.occupied)).toEqual([true, true, true, false, false, false]);
    expect(seats[2]).toMatchObject({ occupied: true, isYou: true, color: 0xffe23b });
    expect(seats[0]).toMatchObject({ isHost: true, isYou: false });
    expect(seats.filter((s) => s.isYou)).toHaveLength(1);

    // A peer leaves → host re-broadcasts a compacted 2-seat roster; the joiner
    // compacts seat 2→1 and its own-seat glow follows accurately (drop-on-leave).
    await applyPresence(page, [
      { seat: 0, color: 0xff3b6b, isYou: false },
      { seat: 1, color: 0xffe23b, isYou: true },
    ]);
    seats = await readSeats(page);
    expect(seats.map((s) => s.occupied)).toEqual([true, true, false, false, false, false]);
    expect(seats[1].isYou).toBe(true);

    // reset() clears the presence roster → back to count-based (no own-seat).
    await resetLobby(page);
    expect((await readSeats(page)).some((s) => s.isYou)).toBe(false);
  });
});
