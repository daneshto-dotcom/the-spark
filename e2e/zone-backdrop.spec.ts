/**
 * SPARK — S165: THE ZONE BACKDROP ACTUALLY LOADS.
 *
 * ⛔ WHY THIS FILE EXISTS, AND IT IS THE OWNER'S OWN COMPLAINT TWICE OVER: *"i dont see the race
 * backgrounds"*. Both times the code was shipped, the deploy was verified, and the PNGs were live
 * on the CDN — and the feature still could not be shown to be working, because every check
 * available was a check of the wrong thing:
 *
 *   · `npm run verify-deploy` proves the BUNDLE landed. It cannot know whether a renderer ran.
 *   · `curl` proves the PNG is SERVABLE. It cannot know whether anything asked for it.
 *   · the unit suite never opens a texture.
 *   · a screenshot from the in-app browser pane is worthless for this, and `zones-visual.spec.ts`
 *     says why in its own header: an undisplayed pane does not composite, so rAF is paused and the
 *     Pixi ticker never advances. A tick-GATED feature is exactly what that hides.
 *
 * ⭐ SO THIS ASSERTS THE ONE OBSERVATION THAT WAS MISSING: the browser FETCHED a zone backdrop.
 * That single fact transitively proves the whole chain — the renderer was constructed, `sync` is
 * called from the render loop, the TITLE gate opened, the hold expired, the seat resolved to a
 * race, and the URL it built is one the server will actually serve. Nothing else in the suite
 * covers any link in that chain.
 *
 * ⚠ A REQUEST, NOT A PIXEL, AND THAT IS DELIBERATE. Asserting on pixels would mean asserting on a
 * dark, low-contrast image drawn at 0.55 alpha behind every sprite on the board — a threshold that
 * would be re-tuned every time the art is regenerated, i.e. a flake generator. The load is the
 * behaviour; the look is the artist's business.
 *
 * GATING on purpose (no `@visual` tag): this is a behavioural claim about a shipped feature, not a
 * capture.
 */
import { expect, test } from '@playwright/test';
import { titleButtonCss, waitForWorld } from './helpers.ts';

/**
 * `ZONE_BG_HOLD_TICKS` in `render/zoneBackgroundRenderer.ts` is 3 * 60 — the backdrop load is held
 * until the match has been running a moment, so it can never compete with the opening frames.
 *
 * ⚠ WAITED IN SIM TICKS, NOT MILLISECONDS. A 2-core software-GL CI runner does not deliver 60 fps,
 * so a wall-clock wait long enough locally is a coin flip there — the exact defect class that had
 * this suite red earlier in this same session (a 15 s budget on a wait the sim could not finish).
 * A generous tick budget is both faster locally and honest on a slow runner.
 */
const HOLD_TICKS = 3 * 60;
const BUDGET_TICKS = HOLD_TICKS * 6;

test.describe('S165 — the per-race zone backdrop reaches the board', () => {
  test('a solo match FETCHES its seat\'s zone art after the hold', async ({ page }) => {
    /*
     * Recorded from the first navigation, because the request we care about can fire at any point
     * after the hold and a listener attached later would race it.
     */
    const zoneArt: string[] = [];
    page.on('response', (res) => {
      const u = res.url();
      if (u.includes('/art/race-zones/') && u.endsWith('.png')) {
        // ⚠ Status recorded WITH the url. A 404 would satisfy "a request happened" while proving
        // the opposite of what this test claims — the renderer built a path nothing serves.
        zoneArt.push(`${res.status()} ${u}`);
      }
    });

    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');

    // ⛔ NOTHING ON THE TITLE SCREEN. Seat 0 exists before a match starts, and the renderer
    // deliberately refuses to draw there — a half-painted valley behind the main menu was a real
    // defect, caught by looking at the running app. Pinned here so it cannot come back.
    expect(zoneArt, 'the TITLE screen must not load a backdrop').toEqual([]);

    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');

    const startTick = (await page.evaluate(
      () => (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world?.tick ?? 0,
    )) as number;

    /*
     * Poll on the SIM CLOCK. `waitForFunction` re-evaluates in the page, so the budget is spent in
     * ticks the sim actually advanced rather than in seconds the runner may or may not have used
     * productively.
     */
    await page.waitForFunction(
      ([from, budget]) => {
        const w = (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world;
        return w !== undefined && w.tick - from >= budget;
      },
      [startTick, BUDGET_TICKS] as [number, number],
      { timeout: 120_000 },
    );

    // The claim.
    expect(
      zoneArt.length,
      `no /art/race-zones/*.png was requested in ${BUDGET_TICKS} ticks of PLAYING. `
        + `The backdrop renderer is not reaching the board — check that main.ts still calls `
        + `zoneBackgroundRenderer.sync(world) unconditionally in the render loop, and that the `
        + `TITLE gate and the ${HOLD_TICKS}-tick hold both opened.`,
    ).toBeGreaterThan(0);

    // ...and that what it asked for is what the server has.
    for (const entry of zoneArt) {
      expect(entry, `the renderer built a URL the server does not serve: ${entry}`)
        .toMatch(/^200 /);
    }
  });
});
