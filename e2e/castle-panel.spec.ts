/**
 * SPARK — S136 P0 E2E: the castle context panel.
 *
 * WHY THIS FILE EXISTS. Before this session the buy/speed controls had **zero** e2e coverage —
 * deleting their exported click-guard broke no test at all. That is precisely why the owner's
 * report ("the build extra gatherer or increase speed is not even clickable") could not be
 * adjudicated from the suite, and why a control that was disabled for a legitimate reason was
 * indistinguishable from a dead one.
 *
 * ⚠ THIS SPEC BOOTS CLEAN — NO `?debug=1`. That flag mounts a `position:fixed; z-index:1001` DOM
 * panel on the right-hand column, measured at 425x972, which covered the old footer controls;
 * `elementFromPoint` there returned its <pre> and the canvas never saw pointerdown. Every other
 * spec in this directory boots `?debug=1`, so the harness was structurally incapable of catching a
 * control-click regression. S136 P0 also made that overlay's body `pointer-events:none`, so the
 * flag is no longer disqualifying — but a control spec should not depend on that fix holding.
 *
 * ⚠ ASSERT ON EVENTS/STATE, NEVER ON TICK COUNTS. The S135 haul tests failed against working code
 * because they hard-coded 420 ticks for a ~154-tick pickup. Everything here waits on world state.
 */
import { expect, test } from '@playwright/test';
import { CANVAS_WIDTH, canvasToCss, keepAnchor, readWorldState, waitForWorld } from './helpers.ts';

// ⛔ S138 P2 — seat 0's keep position is now ASKED OF THE APP (`keepAnchor` → `__SPARK__.keepCenter`
// → the shipped `castleAnchor`). It used to be a hardcoded `CANVAS_WIDTH / 2 - (125 + 150)`, i.e. a
// hand-copy of the old `SPAWNER_RADIUS + 150` ring, and moving the ring to KEEP_RING_RADIUS = 420
// made all four tests in this file click empty board. Never transcribe the formula again.

interface PanelPoints {
  open: boolean;
  rect: { x: number; y: number; w: number; h: number } | null;
  rowCenters: Array<{ key: string; x: number; y: number; enabled: boolean; reason: string }>;
  bank: { count: number; cap: number };
  slotCenters: Array<{ index: number; x: number; y: number; filled: boolean }>;
}

const readPanel = (page: import('@playwright/test').Page): Promise<PanelPoints> =>
  page.evaluate(() => {
    const s = (window as { __SPARK__?: { castlePanel?: { getUiPoints?: () => unknown } } }).__SPARK__;
    const pts = s?.castlePanel?.getUiPoints?.();
    if (pts === undefined) throw new Error('castlePanel.getUiPoints unavailable — geometry getter missing');
    return pts as never;
  });

/** Click a canvas-space point with an explicit down/up so `pointertap` resolves on one target. */
async function clickCanvas(
  page: import('@playwright/test').Page,
  cx: number,
  cy: number,
): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
}

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/'); // deliberately clean — see the file docblock
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const centers = await page.evaluate(() => {
    const s = (window as {
      __SPARK__?: { titleScreen?: { getButtonCenters?: () => Record<string, { x: number; y: number }> } };
    }).__SPARK__;
    const c = s?.titleScreen?.getButtonCenters?.();
    if (c === undefined) throw new Error('titleScreen.getButtonCenters unavailable');
    return c;
  });
  const solo = await canvasToCss(page, centers.solo.x, centers.solo.y);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

test.describe('S136 P0 — castle context panel', () => {
  test('the panel is closed until you click your castle, then opens', async ({ page }) => {
    await bootSolo(page);
    expect((await readPanel(page)).open).toBe(false);

    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);
    const open = await readPanel(page);
    expect(open.open).toBe(true);
    expect(open.rowCenters.map((r) => r.key)).toEqual(['buyGatherer', 'upgradeSpeed']);
    // On-canvas for this seat — panelOrigin flips the box when it would overflow.
    expect(open.rect!.x).toBeGreaterThanOrEqual(0);
    expect(open.rect!.x + open.rect!.w).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  test('clicking the castle again closes it; clicking the board also closes it', async ({ page }) => {
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);
    expect((await readPanel(page)).open).toBe(true);

    await clickCanvas(page, keep0.x, keep0.y);
    expect((await readPanel(page)).open).toBe(false);

    await clickCanvas(page, keep0.x, keep0.y);
    expect((await readPanel(page)).open).toBe(true);
    await clickCanvas(page, CANVAS_WIDTH / 2, 120); // empty sky, clear of the spawn disc and keeps
    expect((await readPanel(page)).open).toBe(false);
  });

  test('BUY GATHERER is disabled at the opening balance AND STATES WHY (owner item 1)', async ({ page }) => {
    // This is the whole owner report. 100 starting points against a 105 price is deliberate design,
    // but the old footer rendered it as an unexplained dim box.
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);
    const buy = (await readPanel(page)).rowCenters.find((r) => r.key === 'buyGatherer')!;
    expect(buy.enabled).toBe(false);
    expect(buy.reason).toBe('NEED 105');
  });

  test('SPEED is live at the opening balance and a click really spends and upgrades', async ({ page }) => {
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);
    const before = await readWorldState(page);
    const scoreBefore = before.scoreByPlayer.find(([id]) => id === before.localPlayerId)![1];

    const speed = (await readPanel(page)).rowCenters.find((r) => r.key === 'upgradeSpeed')!;
    expect(speed.enabled).toBe(true);
    expect(speed.reason).toBe('');

    await clickCanvas(page, speed.x, speed.y);
    // Wait on the STATE CHANGE, not on a tick budget.
    await waitForWorld(
      page,
      (w) => (w.scoreByPlayer.find(([id]) => id === w.localPlayerId)?.[1] ?? scoreBefore) < scoreBefore,
      'score debited by the SPEED purchase',
    );
    const lvl = await page.evaluate(() => {
      const w = (window as { __SPARK__: { world: { gatherers: Map<number, { speedLevel: number }> } } })
        .__SPARK__.world;
      return Array.from(w.gatherers.values()).map((g) => g.speedLevel);
    });
    expect(Math.max(...lvl)).toBeGreaterThanOrEqual(1);
  });

  test('a click on a panel row does NOT also act on the board underneath it', async ({ page }) => {
    // The raw canvas handler hit-tests world objects with no notion of UI, and Pixi's `pointertap`
    // does not suppress it — this is what `Controls.isPointerOverPanel` exists to stop.
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);
    const primsBefore = (await readWorldState(page)).primitives.length;
    const rows = (await readPanel(page)).rowCenters;
    for (const r of rows) await clickCanvas(page, r.x, r.y);
    await page.waitForTimeout(400);
    expect((await readWorldState(page)).primitives.length).toBe(primsBefore);
  });

  test('the retired footer control positions are inert (no orphaned hit areas)', async ({ page }) => {
    await bootSolo(page);
    const hits = await page.evaluate(() => {
      const app = (window as {
        __SPARK__: { controls: { app: { renderer: { events: { rootBoundary: { hitTest: (x: number, y: number) => unknown } } } } } };
      }).__SPARK__.controls.app;
      const b = app.renderer.events.rootBoundary;
      // The exact centres the V6-1.1/1.2 footer buttons occupied.
      return { speed: b.hitTest(1569, 1038) !== null, buy: b.hitTest(1776, 1038) !== null };
    });
    expect(hits.speed).toBe(false);
    expect(hits.buy).toBe(false);
  });
});

/**
 * SPARK — S140 P1 E2E: THE BANK STRIP ACTUALLY RENDERS ITS SECOND ROW.
 *
 * ⚠ WHY THIS IS A SEPARATE, GATING SPEC AND NOT A UNIT TEST. The S140 regrid is covered by eleven
 * swept invariants in `castlePanel.test.ts` — but those exercise PURE FUNCTIONS. The thing that can
 * still be wrong is the Pixi runtime: each slot box's `position` is set ONCE in the constructor from
 * `slotOrigin(i)`, and hit-testing is delegated to a Graphics child. The oracle and the scene graph
 * can therefore disagree with every unit test green, which is this repo's standing failure shape
 * ("a subsystem can be perfect, tested, and never called").
 *
 * The load-bearing assertion is the LAST-SLOT CLICK. At cap 7 the last slot lives on the second row.
 * If the strip overflowed the plate — which is exactly what the pre-S140 single-row maths did, putting
 * slot 0 at x = -24 — that click would land on the BOARD instead of the panel, and the board-click
 * handler CLOSES the panel. So "panel is still open after clicking the last slot" is a real runtime
 * proof that the second row is inside the plate and wired to the hit test.
 *
 * Untagged on purpose: `e2e:gating` excludes only @quarantine-flaky/@soak/@perf-measure, so this
 * spec genuinely reds the build.
 */
test.describe('S140 P1 — multi-row bank strip (runtime, not the oracle)', () => {
  test('the shipped cap renders every slot INSIDE the plate, across two rows', async ({ page }) => {
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);

    const p = await readPanel(page);
    expect(p.open).toBe(true);

    // The RUNNING app's cap — not a value transcribed from constants.ts into this file.
    expect(p.bank.cap).toBeGreaterThanOrEqual(1);
    expect(p.slotCenters).toHaveLength(p.bank.cap);

    // Every slot centre must sit inside the panel rect the app itself reports.
    const r = p.rect!;
    for (const s of p.slotCenters) {
      expect(s.x, `slot ${s.index} left of plate`).toBeGreaterThanOrEqual(r.x);
      expect(s.x, `slot ${s.index} right of plate`).toBeLessThanOrEqual(r.x + r.w);
      expect(s.y, `slot ${s.index} above plate`).toBeGreaterThanOrEqual(r.y);
      expect(s.y, `slot ${s.index} below plate`).toBeLessThanOrEqual(r.y + r.h);
    }

    // …and at the shipped cap of 7 the strip must genuinely WRAP: more than one distinct row y.
    const rowYs = new Set(p.slotCenters.map((s) => Math.round(s.y)));
    expect(rowYs.size, `cap ${p.bank.cap} should wrap to >1 row`).toBeGreaterThan(1);
  });

  test('clicking the LAST slot hits the panel, not the board (the overflow proof)', async ({ page }) => {
    await bootSolo(page);
    const keep0 = await keepAnchor(page, 0);
    await clickCanvas(page, keep0.x, keep0.y);

    const before = await readPanel(page);
    expect(before.open).toBe(true);
    const last = before.slotCenters[before.slotCenters.length - 1]!;
    expect(last.index).toBe(before.bank.cap - 1);

    const primsBefore = (await readWorldState(page)).primitives.length;
    await clickCanvas(page, last.x, last.y);

    // The slot is empty at boot, so the pull is a no-op — but the PANEL MUST STILL BE OPEN. An
    // off-plate slot would have delivered this click to the board, which closes the panel.
    const after = await readPanel(page);
    expect(after.open, 'panel closed => the last slot is outside the plate').toBe(true);
    // And an empty-slot click must not conjure a primitive onto the porch.
    expect((await readWorldState(page)).primitives.length).toBe(primsBefore);
  });
});
