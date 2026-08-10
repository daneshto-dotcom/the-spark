/**
 * SPARK — S137 P2: the rainbow castle party, VISUALLY verified (GATING lane; solo, deterministic).
 *
 * WHY THIS EXISTS. S136 P3 shipped "the rainbow makes the castle party too" (owner playtest item 6)
 * and pinned it with pure unit tests over `keepRainbowTint`. Those tests are good, and they are not
 * the same claim. `keepRainbowTint` returning a different number proves a FUNCTION cycles; it does
 * not prove the castle on screen visibly changes colour. Nothing had ever looked at it — the S136
 * handoff carried it as "VISUALLY UNVERIFIED", and the owner was going to have to spend playtest
 * time judging something a test could settle.
 *
 * That gap is this repo's most expensive recurring lesson: in S136, 28/28 runtime state assertions
 * passed while a disabled label visibly overflowed its box, because state assertions cannot see
 * layout. So this spec reads REAL COMPOSITED PIXELS off the keep, exactly as fog.spec does.
 *
 * DETERMINISM. The whole party is a pure function of (tick, rainbowSwitchTick, seat), so the spec
 * does not wait on a real rainbow pickup (which the harness cannot force). It back-dates
 * `world.rainbowSwitchTick` to `tick - age`, which makes the RENDERER believe the flyover started
 * `age` ticks ago without touching the sim clock, then drives `gathererRenderer.sync(world)` and
 * extracts. Sync + extract happen inside ONE page.evaluate so no rAF frame can interleave and
 * re-draw at a drifted age.
 */
import { test, expect } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

/** Mirrors constants.ts RAINBOW_FLYOVER_DURATION_TICKS (240 = 4 s at 60 Hz). */
const FLYOVER_TICKS = 240;

interface Sample {
  age: number;
  rgb: [number, number, number];
}

test.describe('S137 P2 — the rainbow makes the castle party (visual)', () => {
  test('the keep visibly cycles the palette during the flyover window and returns to its own colour', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    // Plain '/' — NOT '?debug=1'. The debug overlay is a fixed DOM panel that covers a column of
    // the viewport, and the S136 lesson is to observe the configuration the PLAYER actually runs.
    // These screenshots are handed to the owner, so they must look like the real game.
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');

    const result = await page.evaluate(
      ({ ages }) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const s = (window as any).__SPARK__;
        const app = s.app;
        const w = s.world;
        const gr = s.gathererRenderer;
        if (gr === undefined) throw new Error('__SPARK__.gathererRenderer unavailable — accessor missing');

        // The keep's own geometry, from the app rather than transcribed (the S137 P0c convention).
        const anchor = s.keepCenter(w.localPlayerId);
        // Sample ON the body rect's LEFT EDGE STROKE. gathererRenderer.drawKeep strokes the body at
        // alpha 0.85 but fills it at only 0.22, so the stroke is where the hue is actually legible;
        // sampling the fill would read mostly board. KEEP_W/2 = 37, and the 2px stroke straddles
        // the path, so x = anchor.x - 37 lands on it. y = anchor.y + 6 sits inside the body band and
        // clear of both the battlements (top 10px) and the black gate (bottom 18px, centre ±9px).
        const sx = Math.round(anchor.x - 37);
        const sy = Math.round(anchor.y + 6);

        const readAt = (): [number, number, number] => {
          const out = app.renderer.extract.pixels(app.stage);
          const rX = out.width / 1920;
          const rY = out.height / 1080;
          const i = (Math.round(sy * rY) * out.width + Math.round(sx * rX)) * 4;
          return [out.pixels[i], out.pixels[i + 1], out.pixels[i + 2]];
        };

        const originalSwitch = w.rainbowSwitchTick;
        const baseColor = w.players.get(w.localPlayerId).color;

        // BASELINE: no flyover in flight -> the keep wears its own colour.
        w.rainbowSwitchTick = undefined;
        gr.sync(w);
        const baseline = readAt();

        // Back-date the switch tick so the renderer sees each requested age in turn.
        const samples: Array<{ age: number; rgb: [number, number, number] }> = [];
        for (const age of ages) {
          w.rainbowSwitchTick = w.tick - age;
          gr.sync(w);
          samples.push({ age, rgb: readAt() });
        }

        w.rainbowSwitchTick = originalSwitch;
        return { baseline, samples, baseColor, sampleAt: { x: sx, y: sy } };
        /* eslint-enable @typescript-eslint/no-explicit-any */
      },
      // Inside the window `step = floor(age/10) + seat`, so 10-tick strides land on DISTINCT palette
      // steps. The last two probe the boundary: 239 is the final in-window tick, 240 is expiry.
      { ages: [0, 10, 20, 30, 40, 50, 60, 239, FLYOVER_TICKS, FLYOVER_TICKS + 60] },
    );

    const key = (s: Sample): string => s.rgb.join(',');
    const inWindow = result.samples.filter((s: Sample) => s.age < FLYOVER_TICKS);
    const afterWindow = result.samples.filter((s: Sample) => s.age >= FLYOVER_TICKS);

    // 1. THE CASTLE IS ACTUALLY DRAWN. A fully black/absent sample would make every other assertion
    //    here vacuously true — the failure mode where a "colour cycling" test passes on empty board.
    expect(
      Math.max(...result.baseline),
      `keep not visible at (${result.sampleAt.x}, ${result.sampleAt.y}) — baseline ${result.baseline.join(',')}`,
    ).toBeGreaterThan(30);

    // 2. IT VISIBLY CYCLES. Distinct composited colours during the window — the actual owner-facing
    //    claim, and the one the pure unit tests structurally cannot make.
    const distinct = new Set(inWindow.map(key));
    expect(
      distinct.size,
      `keep did not visibly cycle; samples: ${JSON.stringify(inWindow)}`,
    ).toBeGreaterThanOrEqual(3);

    // 3. IT IS A PARTY, NOT A FLICKER — at least one in-window hue differs from the resting colour.
    const baseKey = result.baseline.join(',');
    expect(inWindow.some((s: Sample) => key(s) !== baseKey)).toBe(true);

    // 4. IT ENDS. Past RAINBOW_FLYOVER_DURATION_TICKS the keep is back to its own colour — the
    //    `age >= RAINBOW_FLYOVER_DURATION_TICKS` early-out in keepRainbowTint, seen on screen.
    for (const s of afterWindow) {
      expect(key(s), `age ${s.age} should have reverted to the resting colour`).toBe(baseKey);
    }

    // 5. ARTIFACTS FOR THE OWNER. The point of this priority is that a human can LOOK at it.
    await page.evaluate(() => {
      const w = (window as unknown as { __SPARK__: { world: { rainbowSwitchTick: number; tick: number } } })
        .__SPARK__.world;
      w.rainbowSwitchTick = w.tick; // start a real party and let the live loop render it
    });
    // ⚠ page.screenshot's `clip` is in CSS pixels, NOT canvas coordinates, and the canvas is
    // letterboxed + scaled inside the viewport — so a clip built from canvas coords would crop the
    // wrong region entirely. Map both corners through the shipped canvasToCss and derive the box
    // from the results.
    const tl = await canvasToCss(page, result.sampleAt.x - 150, result.sampleAt.y - 150);
    const br = await canvasToCss(page, result.sampleAt.x + 170, result.sampleAt.y + 150);
    const keepBox = {
      x: Math.max(0, Math.round(tl.x)),
      y: Math.max(0, Math.round(tl.y)),
      width: Math.max(1, Math.round(br.x - tl.x)),
      height: Math.max(1, Math.round(br.y - tl.y)),
    };
    // Written to an explicit PATH, not only attached: `testInfo.attach` lives inside the HTML
    // report bundle, so under `--reporter=list` (and on a PASSING test) the images are discarded —
    // which defeats the entire purpose of this priority, which is that a human can look at them.
    const dir = 'test-results/s137-rainbow-castle';
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(500);
      const body = await page.screenshot({ clip: keepBox, path: `${dir}/castle-party-${i}.png` });
      await testInfo.attach(`castle-party-${i}`, { body, contentType: 'image/png' });
    }
    await testInfo.attach('castle-party-fullboard', {
      body: await page.screenshot({ path: `${dir}/castle-party-fullboard.png` }),
      contentType: 'image/png',
    });
    // The resting castle, for an honest side-by-side: "different from normal" is the actual claim.
    await page.evaluate(() => {
      (window as unknown as { __SPARK__: { world: { rainbowSwitchTick: number | undefined } } })
        .__SPARK__.world.rainbowSwitchTick = undefined;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ clip: keepBox, path: `${dir}/castle-resting.png` });

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
