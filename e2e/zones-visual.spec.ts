/**
 * SPARK — S148 P1: LOOK AT THE BOARD.
 *
 * ⚠ A GREEN SUITE IS NOT EVIDENCE FOR RENDER WORK. This session moved every castle on screen, and
 * the unit tests only prove the NUMBERS are right — they cannot see a keep drawn half off-canvas, a
 * panel opening over the quarry, or a bank glyph landing on top of the score bar. S147 shipped a
 * phase-banner pulse bug that every test passed through and only a real frame exposed.
 *
 * So this captures both boards under the real host loop and writes them to the owner's desktop.
 * Playwright, not the in-app browser pane: an undisplayed pane does not composite, so rAF is paused
 * and the Pixi ticker never advances — a screenshot from it would show a dead first frame.
 *
 * Tagged `@visual` so it stays out of the gating lane; it is a capture with a couple of sanity
 * assertions, not a behavioural test.
 */
import { expect, test } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

/**
 * ⚠ The ONE canonical desktop on this machine is the OneDrive-redirected shell folder. Writing to
 * `%USERPROFILE%\Desktop` drops files into a stale folder the owner does not see on screen.
 */
const DESKTOP = 'C:/Users/onesh/OneDrive/Desktop';

async function readLayout(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as { __SPARK__?: { world?: { layout?: string } } }).__SPARK__?.world?.layout,
  );
}

test.describe('@visual S148 P1 — the zone partition on screen', () => {
  test('PITCH_2P: a solo match draws its keep in the goalmouth', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    // Let the host loop actually run, so gatherers have left the keep and this is not a first frame.
    await page.waitForTimeout(5000);

    expect(await readLayout(page)).toBe('PITCH_2P');
    await page.screenshot({ path: `${DESKTOP}/spark-s148-zones-PITCH_2P.png` });
  });

  test('QUADRANTS_4P: a bots match draws four corner keeps', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    // START MATCH on the overlay defaults (3 bots + the human = the full 4-seat table).
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(5000);

    expect(await readLayout(page)).toBe('QUADRANTS_4P');
    await page.screenshot({ path: `${DESKTOP}/spark-s148-zones-QUADRANTS_4P.png` });
  });

  test('S148 P2 — the opening board is EMPTY: no free bot structures, no starter goblins', async ({ page }) => {
    // The owner's playtest complaint, asserted in a real browser rather than only in unit tests:
    // "why are bots starting with the pencil chewers and the drones from the start .... not fair.
    //  everyone should start with nothing but the castle and one gatherer."
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');

    const opening = await page.evaluate(() => {
      const w = (window as unknown as {
        __SPARK__: {
          world: {
            creatures: Map<unknown, unknown>;
            creatureSpawners: Map<unknown, unknown>;
            defenders: Map<unknown, unknown>;
            primitives: Map<unknown, unknown>;
            gatherers: Map<unknown, unknown>;
            players: Map<unknown, unknown>;
          };
        };
      }).__SPARK__.world;
      return {
        creatures: w.creatures.size,
        spawners: w.creatureSpawners.size,
        defenders: w.defenders.size,
        primitives: w.primitives.size,
        gatherers: w.gatherers.size,
        players: w.players.size,
      };
    });

    // POSITIVE CONTROL first — a real 4-seat bots match actually started, so the zeroes below mean
    // "nothing was seeded" rather than "nothing happened".
    expect(opening.players).toBe(4);
    expect(opening.gatherers).toBe(4); // one each, human and bot alike — the symmetry is the point

    expect(opening.creatures, 'no starter goblins (R49)').toBe(0);
    expect(opening.spawners, 'no free bot pentagrams (R50)').toBe(0);
    expect(opening.defenders, 'nobody opens with a tower').toBe(0);
    expect(opening.primitives, 'no free bot structures on the board').toBe(0);

    await page.screenshot({ path: `${DESKTOP}/spark-s148-empty-opening.png` });
  });
});

/**
 * S149 P3 — THE BORDER WALLS, ON SCREEN.
 *
 * ⚠ THIS IS THE HALF THE UNIT SUITE CANNOT REACH. `walls.test.ts` proves the segment geometry and
 * the movement clamp; neither can tell you whether a wall was actually DRAWN, drawn in the right
 * colour, or drawn at all after the phase flipped. The owner's report was literally *"there are no
 * walls it seems"* — a render-layer complaint — so a render-layer proof is the one that answers it.
 *
 * The phase is forced through `__SPARK__` rather than waited out: a real BUILD lasts 5400 ticks
 * (90 s), and the renderer reads `world.matchPhase` fresh every frame, so setting it is exactly
 * what the player would see one second after the clock turned over.
 */
test.describe('@visual S149 P3 — the border walls on screen', () => {
  test('PITCH_2P: walls stand during BUILD and are GONE during FIGHT', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000); // let the host loop actually run some frames

    // BUILD — the walls are up.
    expect(await readPhase(page)).toBe('BUILD');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-BUILD-pitch.png` });

    // Flip to FIGHT and let a few frames render.
    await forcePhase(page, 'FIGHT');
    await page.waitForTimeout(1200);
    expect(await readPhase(page)).toBe('FIGHT');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-FIGHT-pitch.png` });
  });

  test('QUADRANTS_4P: four coloured arms during BUILD', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    // VS-BOTS opens a setup overlay first — clicking the title button alone never reaches PLAYING.
    // Same flow the S148 capture above uses; START MATCH on the overlay defaults gives the full
    // 4-seat table, which is what puts four coloured arms on the board.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000);

    expect(await readLayout(page)).toBe('QUADRANTS_4P');
    expect(await readPhase(page)).toBe('BUILD');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-BUILD-quadrants.png` });
  });
});

async function readPhase(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as { __SPARK__?: { world?: { matchPhase?: string } } }).__SPARK__?.world?.matchPhase,
  );
}

/** Render-only nudge: the wall renderer reads `matchPhase` fresh each frame. */
async function forcePhase(page: import('@playwright/test').Page, phase: string): Promise<void> {
  await page.evaluate((ph) => {
    const w = (window as { __SPARK__?: { world?: { matchPhase?: string } } }).__SPARK__?.world;
    if (w !== undefined) w.matchPhase = ph;
  }, phase);
}

/**
 * S149 P4 — THE FOOTER BAND, ON SCREEN (R36).
 *
 * ⚠ A UNIT TEST CANNOT SEE A UI SURFACE. `footerBand.test.ts` proves the numbers are derived from
 * the registry and that no chip overlaps a porch; it cannot tell you whether the bar is legible,
 * whether it collides with the HUD, or whether it renders at all. This surface was DELETED once
 * already (S136 P0) for exactly the kind of problem only a real frame shows.
 */
test.describe('@visual S149 P4 — the footer band on screen', () => {
  test('QUADRANTS_4P: the bar of connector counts sits clear of both bottom porches', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000);

    // ⭐ ASSERT THE BAR, DO NOT JUST PHOTOGRAPH IT. A screenshot at 1280x720 downscales the
    // 1920x1080 canvas by 2/3, and at that size a chip is 41px wide — small enough that I
    // miscounted them by eye on the first pass. Reading the live geometry is the only honest check
    // that every complexity in the registry actually reached the screen.
    const band = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { footerBand: { getUiPoints: () => { chips: Array<{ complexity: number; x: number; w: number }> } } };
      }).__SPARK__;
      return s.footerBand.getUiPoints();
    });
    // The five distinct connector counts in the shipped registry: stink 4, pentagram 5,
    // lightningHub 6, laserTurret/helga 7, voltkin 8. Derived, so adding a recipe updates the bar
    // and this assertion together.
    expect(band.chips.map((c) => c.complexity)).toEqual([4, 5, 6, 7, 8]);
    // And they clear both bottom-corner porches (x=130 and x=1790) by a wide margin.
    expect(Math.min(...band.chips.map((c) => c.x))).toBeGreaterThan(400);
    expect(Math.max(...band.chips.map((c) => c.x + c.w))).toBeLessThan(1520);

    await page.screenshot({ path: `${DESKTOP}/spark-s149-footer-band.png` });

    // ⭐ S149 P5 — CLICK A TIER AND THE TOWER MENU MUST OPEN. The owner's report on P4 was "it isnt
    // clickable": the chip toggled a selection and opened nothing, so it read as a dead control.
    const chip4 = band.chips.find((c) => c.complexity === 4)!;
    const chipCss = await canvasToCss(page, chip4.x + chip4.w / 2, chip4.y + 23);
    await page.mouse.click(chipCss.x, chipCss.y);
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { footerBand: { getUiPoints: () => { selected: number | null; cards: Array<{ id: string }> } } };
      }).__SPARK__;
      return s.footerBand.getUiPoints();
    });
    expect(opened.selected).toBe(4);
    expect(opened.cards.length).toBeGreaterThan(0); // the menu actually opened
    await page.screenshot({ path: `${DESKTOP}/spark-s149-footer-menu-open.png` });
  });
});

/**
 * S149 P5 — ARCADE, ON SCREEN.
 *
 * A title button and a full-screen modal are precisely what a headless suite cannot check: that
 * the fifth row fits under CODEX, that the menu renders, and that NONET actually launches.
 */
test.describe('@visual S149 P5 — arcade mode on screen', () => {
  test('ARCADE sits below CODEX and opens a menu that launches NONET', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');

    // The button exists and is BELOW the codex — the owner asked for it there specifically.
    const codex = await titleButtonCss(page, 'codex');
    const arcade = await titleButtonCss(page, 'arcade');
    expect(arcade.y).toBeGreaterThan(codex.y);
    await page.screenshot({ path: `${DESKTOP}/spark-s149-arcade-title.png` });

    // Open the menu.
    await page.mouse.click(arcade.x, arcade.y);
    await page.waitForTimeout(600);
    const menu = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { arcadeOverlay: { getUiPoints: () => { open: boolean; rows: Array<{ id: string; x: number; y: number; w: number; h: number }> } } };
      }).__SPARK__;
      return s.arcadeOverlay.getUiPoints();
    });
    expect(menu.open).toBe(true);
    expect(menu.rows.map((r) => r.id)).toContain('nonet');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-arcade-menu.png` });

    // Launch NONET and prove the puzzle came up WITHOUT touching sim state.
    const row = menu.rows.find((r) => r.id === 'nonet')!;
    const rowCss = await canvasToCss(page, row.x + row.w / 2, row.y + row.h / 2);
    await page.mouse.click(rowCss.x, rowCss.y);
    await page.waitForTimeout(1500);

    // ⭐ THE ASSERTION THAT MATTERS: the board is up, and `world.sudoku` is still null.
    const after = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { world: { sudoku: unknown; gameState: string }; arcadeOverlay: { getUiPoints: () => { open: boolean } } };
      }).__SPARK__;
      return { sudoku: s.world.sudoku, gameState: s.world.gameState, menuOpen: s.arcadeOverlay.getUiPoints().open };
    });
    expect(after.sudoku).toBeNull(); // a title-screen puzzle never enters the simulation
    expect(after.gameState).toBe('TITLE');
    expect(after.menuOpen).toBe(false);
    await page.screenshot({ path: `${DESKTOP}/spark-s149-arcade-nonet.png` });
  });
});

/**
 * S150 P1 — THE HUD, PHOTOGRAPHED. (owner: *"the game screen itself has non coherent parts
 * (text/the shapes on the top left) and other stuff that is placed on top of itself and just not
 * coherent ... we need to make it all look cleaner and more logical/coherent/consistent"*.)
 *
 * ⛔ THIS IS THE ONE CLASS OF DEFECT THE UNIT SUITE STRUCTURALLY CANNOT SEE. Every HUD surface in
 * this game is an independently-positioned Pixi child; nothing in the type system, and nothing in
 * `vitest`, relates the legend sprite at (16,16) to the score text at (12,12). Two correct
 * components can be individually green and still be drawn straight through each other. Earlier this
 * session the border walls drew across the TITLE screen and the entire suite passed.
 *
 * Playwright, never the in-app browser pane: an undisplayed pane does not composite, so rAF pauses
 * and the Pixi ticker never advances — you get a dead first frame instead of a game.
 *
 * BOTH BOARDS × BOTH PHASES, because the HUD is phase-dependent (the match clock recolours, the
 * walls come and go) and board-dependent (solo shows a single score line; QUADRANTS shows four rows
 * plus four keeps plus two porches inside the footer band).
 */
async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await titleButtonCss(page, 'solo');
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
  await page.waitForTimeout(4000); // real host-loop frames, not a first frame
}

async function bootBots(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const vsBots = await titleButtonCss(page, 'vsBots');
  await page.mouse.click(vsBots.x, vsBots.y);
  await page.waitForFunction(
    () => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
      }).__SPARK__;
      return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
    },
    { timeout: 20_000 },
  );
  const startPt = await page.evaluate(() => {
    const s = (window as unknown as {
      __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
    }).__SPARK__;
    return s.botSetupOverlay.getUiPoints().start;
  });
  const startCss = await canvasToCss(page, startPt.x, startPt.y);
  await page.mouse.click(startCss.x, startCss.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
  await page.waitForTimeout(4000);
}

/**
 * ⭐ THE ASSERTION HALF. `hudLayout.test.ts` proves the layout RULE with reconstructed metrics;
 * this proves the RUNNING GAME obeys it with real Pixi text metrics, through the same exported
 * `hudSurfaces()` reached via the S85 P4c geometry getter. A font fallback that renders the
 * leaderboard 40 % wider than monospace breaks this and leaves the unit test green.
 */
async function expectNoHudOverlaps(page: import('@playwright/test').Page): Promise<void> {
  const surfaces = await page.evaluate(() => {
    const s = (window as unknown as {
      __SPARK__: {
        hud: {
          getUiPoints: () => {
            surfaces: Array<{ name: string; rect: { x: number; y: number; w: number; h: number } }>;
          };
        };
      };
    }).__SPARK__;
    return s.hud.getUiPoints().surfaces;
  });
  expect(surfaces.length).toBeGreaterThan(6); // positive control: the getter actually reported a HUD
  const hits: string[] = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const a = surfaces[i].rect;
      const b = surfaces[j].rect;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        hits.push(`${surfaces[i].name} ∩ ${surfaces[j].name}`);
      }
    }
  }
  expect(hits, 'HUD surfaces drawn on top of each other, measured in a real browser').toEqual([]);
}

test.describe('@visual S150 P1 — the HUD audit', () => {
  test('TITLE: no gameplay instrument survives onto the main menu', async ({ page }) => {
    // ⛔ THE SAME DEFECT CLASS AS THE BORDER WALLS THAT BLED ONTO TITLE EARLIER THIS SESSION. A
    // stage dump of the menu measured FOUR live gameplay elements on it: the energy gauge
    // (x 1896, y 80–989), the score bar (x 11, y 918–962), the controls help line (y 1058) and the
    // local avatar's glow at (−11, −11). None of them is actionable on a menu; all four read as
    // rendering artefacts. Asserted through the stage rather than by eye, then photographed.
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    await page.waitForTimeout(2000);
    const stray = await page.evaluate(() => {
      const stage = (window as unknown as {
        __SPARK__: { app: { stage: { children: Array<Record<string, unknown>> } } };
      }).__SPARK__.app.stage;
      return stage.children
        .map((c) => {
          const o = c as unknown as {
            visible: boolean;
            getBounds: () => { x: number; y: number; width: number; height: number };
            text?: string;
            label?: string;
            constructor: { name: string };
          };
          let b = { x: 0, y: 0, width: 0, height: 0 };
          try { b = o.getBounds(); } catch { /* an empty Graphics has no bounds */ }
          return {
            label:
              `${o.constructor.name}` +
              `${typeof o.label === 'string' && o.label !== '' ? `#${o.label}` : ''}` +
              `${o.text !== undefined ? ` "${String(o.text).slice(0, 30)}"` : ''}`,
            x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
            vis: o.visible,
          };
        })
        .filter((r) => r.vis && r.w > 0);
    });
    // Everything that legitimately shows on the menu: the title pane itself, the BETA stamp and its
    // plate, and the ♪/⚙ chrome (audio and settings DO work on the menu). Anything else drawing
    // here is a gameplay instrument that forgot to ask `isOverlayScreen`.
    const allowed = /Container|BETA|betaBadgePlate|♪|⚙/;
    const leaked = stray.filter((r) => !allowed.test(r.label));
    expect(leaked, `gameplay HUD drawn on the TITLE screen: ${JSON.stringify(leaked)}`).toEqual([]);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-TITLE.png` });
  });

  test('PITCH_2P: the whole HUD in BUILD and in FIGHT', async ({ page }) => {
    await bootSolo(page);
    expect(await readLayout(page)).toBe('PITCH_2P');
    await expectNoHudOverlaps(page);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-BUILD-pitch.png` });
    await forcePhase(page, 'FIGHT');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-FIGHT-pitch.png` });
  });

  test('QUADRANTS_4P: four leaderboard rows, four keeps, the footer band', async ({ page }) => {
    await bootBots(page);
    expect(await readLayout(page)).toBe('QUADRANTS_4P');
    await expectNoHudOverlaps(page);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-BUILD-quadrants.png` });
    await forcePhase(page, 'FIGHT');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-FIGHT-quadrants.png` });
  });

  /**
   * The TIER banner and the MATCH CLOCK share the top-centre axis. The clock is permanent; the tier
   * banner fires for ~2 s on a 500/1000 score crossing — so the collision is real but rare, which is
   * exactly why nobody has ever seen it in a normal capture. Push a SCORE_TIER effect into
   * `world.effects` and the next frame's `drainTierBanner` arms the banner for real.
   */
  test('the tier banner and the match clock, on screen together', async ({ page }) => {
    await bootSolo(page);
    await page.evaluate(() => {
      const w = (window as unknown as {
        __SPARK__: { world: { effects: unknown[]; tick: number } };
      }).__SPARK__.world;
      w.effects.push({ kind: 'SCORE_TIER', tick: w.tick + 1, tier: 2, color: 0x3bd7ff, pos: { x: 960, y: 540 } });
    });
    await page.waitForTimeout(400);
    // The banner is UP in this frame, so the sweep now includes it against the live clock.
    await expectNoHudOverlaps(page);
    await page.screenshot({ path: `${DESKTOP}/spark-s150-hud-tier-vs-clock.png` });
  });
});
