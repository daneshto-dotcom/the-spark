/**
 * SPARK — S165: the two owner toggles, asserted where they actually live.
 *
 * > Owner, 2026-09-07: *"on the top right on the settings button i want to add race
 * > background/cosmos black background toggle so players can turn on the original black background
 * > instead of their races if they wish."* … *"i want each race to have his own race music which
 * > will be a cover of the original one. and they will be also able to toggle off their race music
 * > and have the original one."*
 *
 * ⛔ WHY THIS IS AN E2E SPEC AND NOT A UNIT TEST. Neither toggle is unit-testable end to end: the
 * settings panel is real DOM, and the unit suite runs in plain node with no `window`, no
 * `localStorage` and no `AudioContext` — `audioManager.test.ts` states that in its own header. So
 * `setMusicTrack`, `playMusic` and every gain call take their null-guard early return in a unit
 * test, and the most a unit test can say is "did not throw". The pure half of the decision IS
 * unit-tested, in `raceMusic.test.ts`; this is the other half.
 *
 * ⭐ AND THE BACKGROUND CASE ASSERTS AN ABSENCE, which is the strongest claim available here:
 * `ZoneBackgroundRenderer.sync` early-returns on `!enabled` BEFORE `ensureTexture`, so a player on
 * the black board should fetch NO backdrop at all. "Zero requests" cannot be satisfied by accident
 * the way a pixel threshold can.
 */
import { expect, test } from '@playwright/test';

import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

/** The gear glyph's canvas position — `HUD_RIGHT_X - 20`, `AUDIO_ICON_Y`. Its own handler also
 * unlocks the AudioContext, which is why opening the panel is enough to make the music paths live. */
/*
 * ⛔ S169 — 1888 -> 1896, AND THIS SPEC IS HOW THE REGRESSION WAS FOUND.
 *
 * The owner had the sound glyph removed ("Everyone tries to click on it to turn off the sound") and
 * the gear re-anchored CENTRED on the right-hand HUD column (`GAUGE_X_COLUMN` = CANVAS_WIDTH - 24)
 * instead of right-anchored at `HUD_RIGHT_X - 20`. This constant still pointed at the old slot, so
 * the click landed on empty canvas, the panel never opened, and the failure surfaced as
 * "#race-music-toggle must default to ON" — a message about a toggle, caused by a mouse coordinate.
 *
 * ⚠ IT IS STILL A LITERAL rather than derived, because this file drives the page from the OUTSIDE and
 * cannot import from src/. That makes it exactly the duplicated-geometry hazard `hudSurfaces()` exists
 * to catch, so it is written down: if the gear moves again, THIS is the line that has to move with it.
 */
const GEAR = { x: 1896, y: 38 };

/** Element ids built by `createToggleRow(label, idPrefix)` as `${idPrefix}-toggle`. */
const RACE_MUSIC_ID = 'race-music-toggle';
const ZONE_BG_ID = 'zone-bg-toggle';

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  const gear = await canvasToCss(page, GEAR.x, GEAR.y);
  await page.mouse.click(gear.x, gear.y);
  await page.waitForSelector(`#${ZONE_BG_ID}`, { state: 'attached', timeout: 10_000 });
}

async function setToggle(
  page: import('@playwright/test').Page, id: string, on: boolean,
): Promise<void> {
  await page.evaluate(([elId, value]) => {
    const el = document.getElementById(elId as string) as HTMLInputElement | null;
    if (el === null) throw new Error(`no #${elId as string}`);
    el.checked = value as boolean;
    // A programmatic `.checked` write fires no event, and the listener is what persists it.
    el.dispatchEvent(new Event('change'));
  }, [id, on] as [string, boolean]);
}

test.describe('@races S165 — the settings panel carries both owner toggles', () => {
  test('both rows exist, default ON, and survive a reopen', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    await openSettings(page);

    const initial = await page.evaluate(([a, b]) => [a, b].map((id) => {
      const el = document.getElementById(id as string) as HTMLInputElement | null;
      return { id, present: el !== null, checked: el?.checked ?? null };
    }), [RACE_MUSIC_ID, ZONE_BG_ID] as [string, string]);

    for (const row of initial) {
      expect(row.present, `#${row.id} is missing from the settings panel`).toBe(true);
      // Both default ON: the owner's framing is that the race flavour is the normal state and the
      // original black board / original track are what you turn back on.
      expect(row.checked, `#${row.id} must default to ON`).toBe(true);
    }

    /*
     * ⛔ THE REOPEN IS THE POINT OF THIS CASE. `refresh()` re-reads both stores on every `show()`,
     * and forgetting to add a new control there is a SILENT failure — the panel opens showing a
     * stale checkbox with nothing anywhere failing.
     */
    await setToggle(page, ZONE_BG_ID, false);
    await page.keyboard.press('Escape');
    await openSettings(page);
    const reopened = await page.evaluate((id) => {
      const el = document.getElementById(id as string) as HTMLInputElement | null;
      return el?.checked ?? null;
    }, ZONE_BG_ID);
    expect(reopened, 'the reopened panel must show the stored value, not the default').toBe(false);
  });

  test('⛔ race background OFF fetches NO backdrop at all', async ({ page }) => {
    const zoneArt: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/art/race-zones/')) zoneArt.push(r.url());
    });

    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    await openSettings(page);
    await setToggle(page, ZONE_BG_ID, false);
    await page.keyboard.press('Escape');

    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');

    /*
     * Well past `ZONE_BG_HOLD_TICKS` (180), so the enabled path would certainly have loaded by now
     * — `zone-backdrop.spec.ts` proves that on the same budget. Tick-budgeted rather than
     * wall-clocked, because a 2-core software-GL runner does not deliver 60 fps.
     */
    const from = (await page.evaluate(
      () => (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world?.tick ?? 0,
    )) as number;
    await page.waitForFunction(
      ([f, budget]) => {
        const w = (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__?.world;
        return w !== undefined && w.tick - f >= budget;
      },
      // 2x ZONE_BG_HOLD_TICKS (180). Trimmed from 600: the enabled path loads on the first frame
      // past the hold, and an over-generous budget here is what timed out the whole gating lane.
      [from, 360] as [number, number],
      { timeout: 90_000 },
    );

    expect(
      zoneArt,
      'with the toggle off the renderer must not even ASK for a backdrop — sync early-returns '
        + 'before ensureTexture, which is what makes the black board a bandwidth saving too',
    ).toEqual([]);
  });

  test('a match fetches the local race track, and the toggle sends it back to the original', async ({ page }) => {
    test.setTimeout(150_000);
    const music: string[] = [];
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/audio/races/') || u.includes('blue-steppe-orbit')) {
        music.push(`${r.status()} ${u.split('/').pop() ?? u}`);
      }
    });

    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    // Opening the panel is also what unlocks the AudioContext (the gear's own handler calls
    // initAudio), so the music paths below are live rather than silently null-guarded.
    await openSettings(page);
    await page.keyboard.press('Escape');

    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(2500);

    // Seat 0 is vampires by `defaultRaceForSeat`, so a solo match plays that cover.
    expect(
      music.some((m) => m.startsWith('200 ') && m.includes('.ogg') && !m.includes('blue-steppe')),
      `no race track was fetched. Saw: ${JSON.stringify(music)}`,
    ).toBe(true);

    /*
     * ⭐ THE TOGGLE HAS TO BITE ON THE CLICK, not at the next match — that is what the owner asked
     * for. `main.ts` re-resolves the track every PLAYING frame precisely so this works, because the
     * settings checkbox only PERSISTS the preference (audioManager must not read `world`).
     */
    await openSettings(page);
    await setToggle(page, RACE_MUSIC_ID, false);
    // Wall-clocked deliberately, unlike the tick budgets above: this waits on a NETWORK fetch and
    // a decode, which do not advance with the sim clock.
    await page.waitForTimeout(2500);

    expect(
      music.some((m) => m.includes('blue-steppe-orbit')),
      `turning race music off did not fall back to the original track. Saw: ${JSON.stringify(music)}`,
    ).toBe(true);
  });
});
