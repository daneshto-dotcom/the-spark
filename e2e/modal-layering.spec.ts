/**
 * SPARK — S152 A4 — A MODAL OVERLAY MUST HIDE THE TITLE SCREEN.
 *
 * ## ⛔ THE BUG, AND WHY IT LOOKED LIKE SOMETHING ELSE ENTIRELY
 *
 * Owner, on the live build: *"you broke the starting screen only singleplayer and multiplayer works.
 * when i click bots it takes me to muiltiplayer - it is all broken!"*
 *
 * The VS-Bots click was routing CORRECTLY the whole time — verified against the deployed site, the
 * right overlay opens. The defect was LAYERING: nothing hid `titleScreen`, so the entire menu kept
 * drawing underneath the overlay with its buttons still `eventMode: 'static'`. A screenshot of the
 * live site showed "1 Player / Multiplayer / VS Bots / CODEX" ghosting through the bot rows. So a
 * click aimed at what still looked like a live menu really did start Multiplayer.
 *
 * ⚠ AND THE OBVIOUS FIX WOULD NOT HAVE WORKED. Hiding the title at the overlay's open site is
 * undone on the very next frame: `main.ts`'s visibility reconciler runs every frame and keyed only
 * on `gameState`, which a modal does not change. The modal state had to become part of the
 * predicate itself.
 *
 * This spec asserts the property that was missing rather than the symptom: while a modal is up, the
 * title screen is not interactive. It is deliberately geometric — it clicks where a title button
 * WOULD be and proves nothing happens — because that is exactly what the owner did.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

test.describe('S152 A4 — modal overlays make the title screen inert', () => {
  test('with the VS-Bots overlay up, clicking where "Multiplayer" sits does NOT start a match', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');

    // Capture the Multiplayer button's centre BEFORE opening the modal — once the title is hidden
    // the geometry getter stops describing a rendered surface, which is the point.
    const mp = await titleButtonCss(page, 'oneVOne');

    const bots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(bots.x, bots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );

    // ⭐ THE ASSERTION THAT WAS MISSING: the title is no longer visible, so its buttons cannot be hit.
    const titleVisible = await page.evaluate(() => {
      const s = (window as unknown as { __SPARK__: { titleScreen: { isVisible: () => boolean } } }).__SPARK__;
      return s.titleScreen.isVisible();
    });
    expect(titleVisible, 'the title screen must be hidden while a modal overlay is up').toBe(false);

    // And prove it behaviourally: a click at the old Multiplayer coordinates must NOT start a match.
    await page.mouse.click(mp.x, mp.y);
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __SPARK__: { world: { gameState: string } } }).__SPARK__;
      return s.world.gameState;
    });
    expect(state, 'clicking through a modal must not change the game state').toBe('TITLE');
  });

  test('closing the overlay brings the title back', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const bots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(bots.x, bots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    // ⚠ THE OTHER HALF, AND THE ONE A NAIVE FIX BREAKS: hiding the title on open is easy; getting it
    // BACK on close is what a hardcoded `setVisible(false)` would have got wrong.
    const close = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { close?: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().close ?? null;
    });
    if (close !== null) {
      const css = await canvasToCss(page, close.x, close.y);
      await page.mouse.click(css.x, css.y);
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(800);
    const titleVisible = await page.evaluate(() => {
      const s = (window as unknown as { __SPARK__: { titleScreen: { isVisible: () => boolean } } }).__SPARK__;
      return s.titleScreen.isVisible();
    });
    expect(titleVisible, 'the title screen must return once the modal closes').toBe(true);
  });
});
