/**
 * SPARK — S153 A2: you can leave a match without reloading the page.
 *
 * Owner: *"i dont want to have to restart the page to go back to main menue"*. This is the S109 P0
 * trap again — RETURN_TO_TITLE was reachable only from the lobby's back button, the connection-lost
 * overlay, and a click on POSTGAME, so a live match had no exit at all.
 *
 * Both halves are asserted, because "Escape leaves the match" is equally satisfied by an Escape
 * that abandons the game on a single accidental press — which would be a worse bug than the one
 * being fixed.
 */
import { expect, test } from '@playwright/test';
import {
  CANVAS_WIDTH,
  canvasToCss,
  hostNewRoom,
  joinRoom,
  readWorldState,
  waitForWorld,
} from './helpers.ts';
import type { BrowserContext } from '@playwright/test';

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const c = await page.evaluate(() => (window as any).__SPARK__.titleScreen.getButtonCenters());
  const solo = await canvasToCss(page, c.solo.x, c.solo.y);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
}
const gs = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__SPARK__.world.gameState as string);

test.describe('S153 A2 — leaving a live match (owner)', () => {
  test('a DOUBLE Escape returns to the title without a reload', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await gs(page)).toBe('TITLE');
  });

  test('⭐ a SINGLE Escape does NOT — an accidental press must never abandon a game', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await gs(page)).toBe('PLAYING');
  });

  test('⭐ two Escapes far apart do NOT count as a double-press', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2200); // beyond TITLE_EXIT_CONFIRM_MS
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await gs(page)).toBe('PLAYING');
  });
});

/** S155 P2 — the exit button's live geometry + modal state, read from the game rather than guessed. */
async function exitPoints(page: import('@playwright/test').Page): Promise<{
  exit: { x: number; y: number };
  leave: { x: number; y: number };
  keep: { x: number; y: number };
  confirmOpen: boolean;
}> {
  return await page.evaluate(
    () =>
      (
        window as unknown as {
          __SPARK__: { exitButton: { getUiPoints: () => never } };
        }
      ).__SPARK__.exitButton.getUiPoints(),
  );
}

async function clickCanvas(
  page: import('@playwright/test').Page,
  pt: { x: number; y: number },
): Promise<void> {
  const css = await canvasToCss(page, pt.x, pt.y);
  await page.mouse.click(css.x, css.y);
}

/**
 * ⭐ S155 P2 — THE BUTTON THE OWNER ASKED FOR.
 *
 * *"back to main doesnt work from multiplayer and from some windows. needs to make it all work but
 * also back to main doesnt pop out or show thaty it is clickable like other buttons... need to make
 * it interractive and obvious."*
 *
 * The A.0 finding was that there was no button at all — only the double-Escape above, which its own
 * comment justified as needing "no new UI surface". These tests drive the real button through real
 * pointer events, because an affordance verified by reading its constructor is not verified.
 */
test.describe('S155 P2 — the BACK TO MAIN button', () => {
  test('is present in a live match and opens a confirm instead of leaving', async ({ page }) => {
    await bootSolo(page);
    const p = await exitPoints(page);
    expect(p.confirmOpen).toBe(false);
    await clickCanvas(page, p.exit);
    await page.waitForTimeout(250);
    // One click opens the dialog and NOTHING ELSE. The S153 A2 invariant holds: a single input can
    // never abandon a live match.
    expect((await exitPoints(page)).confirmOpen).toBe(true);
    expect(await gs(page)).toBe('PLAYING');
  });

  test('"Keep playing" dismisses it and the match continues', async ({ page }) => {
    await bootSolo(page);
    await clickCanvas(page, (await exitPoints(page)).exit);
    await page.waitForTimeout(200);
    await clickCanvas(page, (await exitPoints(page)).keep);
    await page.waitForTimeout(300);
    expect((await exitPoints(page)).confirmOpen).toBe(false);
    expect(await gs(page)).toBe('PLAYING');
  });

  test('"Leave match" returns to the title', async ({ page }) => {
    await bootSolo(page);
    await clickCanvas(page, (await exitPoints(page)).exit);
    await page.waitForTimeout(200);
    await clickCanvas(page, (await exitPoints(page)).leave);
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE after Leave match');
    expect(await gs(page)).toBe('TITLE');
  });

  test('⭐ a DOUBLE-CLICK on the button does NOT leave — the hazard that killed the two-step design', async ({
    page,
  }) => {
    /*
     * This is the S155 Council's strongest UX finding, kept as an executable guard. My first design
     * was a two-step confirm on the SAME hitbox ("CLICK AGAIN TO LEAVE"), and GEMINI-AUDITOR pointed
     * out that a frustrated or lagging player double-clicks — which would have ejected them from a
     * live match. A double-click is the MOST likely input from someone who just pressed a button and
     * saw the game not respond, i.e. exactly the player this whole priority is for.
     *
     * The modal's spatial separation is what makes this pass: the second click lands on the backdrop
     * (a deliberate click-swallowing no-op), never on "Leave match".
     */
    await bootSolo(page);
    const p = await exitPoints(page);
    const css = await canvasToCss(page, p.exit.x, p.exit.y);
    await page.mouse.dblclick(css.x, css.y);
    await page.waitForTimeout(500);
    expect(await gs(page)).toBe('PLAYING');
  });

  test('Escape cancels the confirm rather than leaving', async ({ page }) => {
    await bootSolo(page);
    await clickCanvas(page, (await exitPoints(page)).exit);
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect((await exitPoints(page)).confirmOpen).toBe(false);
    expect(await gs(page)).toBe('PLAYING');
  });
});

/**
 * ⭐ S155 P2 — "FROM MULTIPLAYER", which is the half of the owner's sentence a solo test cannot reach.
 *
 * Leaving a networked match is not just a state change: it must stop quickmatch discovery, dispose the
 * transport and clear the session. Before this session that sequence was hand-copied at three sites
 * and the double-Escape copy was MISSING `stopQuickmatch()` — so leaving a quickmatch match left the
 * discovery running. All four exits now share one `leaveToTitle` thunk, and this asserts the network
 * half actually happens.
 *
 * Tagged @quarantine-flaky per the standing rule for real-WebRTC specs, and additionally selected by
 * the GATING `e2e-lobby` lane (the S142 P2 grep-lane idiom).
 */
test.describe('S155 exit-from-multiplayer — leaving tears the network down @quarantine-flaky', () => {
  test('a joiner in a live networked match can leave, and the transport is disposed', async ({
    browser,
  }) => {
    const ctxs: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
    for (const c of ctxs) {
      await c.addInitScript(() => {
        (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
      });
    }
    const [hostPage, joinerPage] = await Promise.all(ctxs.map((c) => c.newPage()));
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees the joiner', 60_000);
      const begin = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(begin.x, begin.y);
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'joiner PLAYING', 30_000);

      // The joiner leaves through the button, exactly as a player would.
      await clickCanvas(joinerPage, (await exitPoints(joinerPage)).exit);
      await joinerPage.waitForTimeout(200);
      await clickCanvas(joinerPage, (await exitPoints(joinerPage)).leave);
      await waitForWorld(joinerPage, (w) => w.gameState === 'TITLE', 'joiner back at TITLE', 30_000);

      // ⭐ THE NETWORK HALF. peerCount reads 0 because teardownNet disposed the transport — this is
      // what "back to main doesnt work from multiplayer" was about, and a gameState assertion alone
      // would pass even if the socket were still open.
      const js = await readWorldState(joinerPage);
      expect(js.gameState).toBe('TITLE');
      expect(js.peerCount).toBe(0);
    } finally {
      for (const c of ctxs) await c.close();
    }
  });
});
