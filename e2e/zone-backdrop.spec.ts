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
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

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
/*
 * S165 - TRIMMED FROM 6x THE HOLD TO 2x, AND THE 6x IS WHAT TIMED OUT THE GATING LANE.
 *
 * The lane carries a 720 s global Playwright budget (PW_GLOBAL_TIMEOUT_MIN) and my two new specs
 * pushed it past that on CI - which does not read as a test failure, it reads as
 * `Timed out waiting 720s for the test suite to run`, i.e. the whole lane. Generous budgets are
 * not free when a 2-core software-GL runner spends them at a fraction of 60 fps.
 *
 * 2x the hold is still ample: the load is issued on the first frame past the hold, so any budget
 * above 180 that leaves room for a fetch is enough. What the budget must NOT be is wall-clocked -
 * that part was right and is unchanged.
 */
const BUDGET_TICKS = HOLD_TICKS * 2;

test.describe('@races S165 — the per-race zone backdrop reaches the board', () => {
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

/**
 * S165 - AND THE SAME MISSING OBSERVATION FOR THE CASTLE'S OWN UNIT.
 *
 * Sweep Lane 1: there is no browser-level check anywhere that a race-unit atlas is ever fetched or
 * drawn. `raceUnitFrames.test.ts` is a node-side `existsSync`/`readFileSync` pass and says so in its
 * own header - it proves the FILES are on disk, which is a different claim from the game asking for
 * one. And `goblinRenderer.loadAtlas` swallows every failure in a bare `catch {}`, deliberately, so
 * a wrong URL is silent by design.
 *
 * THIS PROJECT HAS ALREADY SHIPPED AN INVISIBLE UNIT PAST A GREEN SUITE - the S152 P3 block in
 * `goblinRenderer.ts` documents it. So this is the backdrop guard's twin: assert the BROWSER asked
 * for `/art/race-units/unit-<race>-atlas.png` and got a 200, which transitively proves the emitter
 * ran, a race unit reached the renderer, `atlasKeyFor` built a key, and `ensureRaceAtlas` resolved a
 * URL the server actually serves.
 *
 * ⚠ VS-BOTS, NOT SOLO, and that is load-bearing: the emitter is gated on a seat having a castle
 * with HP, and a bots match seats four races so the manifest AND the sheet are both exercised.
 * The wait is TICK-BUDGETED past RACE_UNIT_EMIT_INTERVAL_TICKS for the same reason as the backdrop
 * spec - a wall-clock wait that is generous locally is a coin flip on a 2-core software-GL runner.
 */
test.describe('@races S165 - the castle-spawned race unit reaches the renderer', () => {
  test('a bots match FETCHES a race-unit atlas after the first emit', async ({ page }) => {
    test.setTimeout(120_000);
    const atlas: string[] = [];
    page.on('response', (res) => {
      const u = res.url();
      if (u.includes('/art/race-units/') && u.endsWith('-atlas.png')) atlas.push(`${res.status()} ${u}`);
    });

    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vs = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vs.x, vs.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const start = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const sc = await canvasToCss(page, start.x, start.y);
    await page.mouse.click(sc.x, sc.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'bots PLAYING');

    /*
     * The emitter fires on `(tick - seat) % RACE_UNIT_EMIT_INTERVAL_TICKS === 0`, so one full
     * interval plus a margin guarantees every seated race has produced at least once.
     */
    /*
     * S165 - ONE FULL EMIT INTERVAL PLUS A MARGIN, AND IT CANNOT BE SMALLER. MEASURED.
     *
     * I trimmed this to 240 on the arithmetic: the cadence is `(tick - seat) % 1800 === 0`, so
     * seat 0's slot is tick 0 and seats 1-3 are ticks 1, 2 and 3. The trim FAILED, and a probe
     * said why - race-unit count is still ZERO at tick 1408. `raceUnitEmitTick` is gated on
     * `gameState === 'PLAYING'`, and the transition happens a few ticks INTO the match, so all
     * four seats miss their opening slot and the first real emit is at tick 1800.
     *
     * So this spec inherently costs ~30 s of sim time and there is no honest way to shorten it.
     * That is why this file moved OUT of the shared gating lane and into its own CI job - see the
     * `@races` tag on both describes below.
     */
    const EMIT_BUDGET = 2040;
    const from = (await page.evaluate(
      () => (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world?.tick ?? 0,
    )) as number;
    await page.waitForFunction(
      ([f, budget]) => {
        const w = (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world;
        return w !== undefined && w.tick - f >= budget;
      },
      [from, EMIT_BUDGET] as [number, number],
      { timeout: 90_000 },
    );

    expect(
      atlas.length,
      `no /art/race-units/*-atlas.png was requested in ${EMIT_BUDGET} ticks of a bots `
        + `match. Either the castle emitter produced nothing, or the renderer never asked for the `
        + `sheet - and loadAtlas swallows load failures by design, so nothing else would say so.`,
    ).toBeGreaterThan(0);

    for (const entry of atlas) {
      expect(entry, `the renderer built an atlas URL the server does not serve: ${entry}`)
        .toMatch(/^200 /);
    }
  });
});
