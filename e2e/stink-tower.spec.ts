/**
 * SPARK — S141 P1/P2 E2E: the Stink Tower RENDERS, and the order queue is CLICKABLE.
 *
 * ⛔ WHY THESE HAVE TO BE RUNTIME TESTS. Both are things a unit test structurally cannot see:
 *
 *  1. **A new DefenderKind renders as NOTHING, with no compile error.** Both shipped defender
 *     renderers are exclusion filters (`if (d.kind !== 'turret') continue;`) with no registry and no
 *     exhaustiveness check, so a tower can exist in `world.defenders`, tick its FSM, deal damage and
 *     ride the wire while drawing zero pixels. tsc is happy, every unit test is green. The identical
 *     trap swallowed the S139 goblin one session ago. The only honest check is to build one in a real
 *     browser and confirm the renderer's Graphics actually emitted geometry.
 *  2. **The panel strips fit the plate.** "Does the text fit" and "is the strip inside the box" are
 *     not state assertions — S136 P0 shipped a row that visibly overflowed its own box with every
 *     assertion green, and S140 found the bank strip hanging 24 px off BOTH edges at cap 7 because
 *     `castlePanel.test.ts` had zero bank-strip coverage.
 *
 * Boots CLEAN (no `?debug=1`) for the same reason `castle-panel.spec.ts` does — see its docblock.
 */
import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

/** The two shapes the recipe is made of, mirrored from `constants.ts SparkType`. */
const SQUARE = 3;
const CIRCLE = 4;

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
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

async function clickCanvas(page: import('@playwright/test').Page, cx: number, cy: number): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
}

test.describe('S141 P1 — the Stink Tower is real, and it is VISIBLE', () => {
  test('a 1 Square + 3 Circle component builds a tower that the renderer actually DRAWS', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await bootSolo(page);

    // Build the recipe directly in the authoritative world, then let the shipped igniter find it.
    // Placing by mouse would test the drag flow, which is not what is under test here.
    const built = await page.evaluate(({ sq, ci }) => {
      const S = (window as unknown as { __SPARK__: Record<string, never> }).__SPARK__ as unknown as {
        world: never; app: { ticker: { update: (t: number) => void } };
      };
      const w = S.world as unknown as {
        primitives: Map<number, unknown>; bonds: Map<number, unknown>;
        defenders: Map<number, { kind: string; bagsRemaining: number; pos: { x: number; y: number } }>;
        nextPrimitiveId: number; nextBondId: number; tick: number;
        players: Map<number, { color: number }>; localPlayerId: number;
      };
      const color = w.players.get(w.localPlayerId)!.color;
      const mk = (type: number, x: number, y: number): { id: number; bonds: Set<number> } => {
        const id = w.nextPrimitiveId++;
        const p = {
          id, type, placerColor: color, placedBy: w.localPlayerId, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set<number>(),
          ownerColor: color, lastOwnershipChange: 0, radius: 8, hp: 1000,
        };
        w.primitives.set(id, p as never);
        return p as unknown as { id: number; bonds: Set<number> };
      };
      // Away from the quarry so free sparks cannot wander in and change the component.
      const hub = mk(sq, 520, 300);
      const leaves = [mk(ci, 560, 300), mk(ci, 480, 300), mk(ci, 520, 260)];
      for (const leaf of leaves) {
        const bid = w.nextBondId++;
        const bd = {
          id: bid, aId: hub.id, bId: leaf.id,
          a: w.primitives.get(hub.id), b: w.primitives.get(leaf.id),
          restLength: 40, stiffnessTier: 'MID', createdTick: w.tick,
        };
        w.bonds.set(bid, bd as never);
        hub.bonds.add(bid);
        leaf.bonds.add(bid);
      }
      return { hubId: hub.id, prims: w.primitives.size };
    }, { sq: SQUARE, ci: CIRCLE });
    expect(built.prims).toBeGreaterThanOrEqual(4);

    // ⛔ THE IGNITER ONLY RUNS ON A TOPOLOGY CHANGE. `runDefenderIgnition` returns immediately unless
    // `world.effects` holds a BOND_FORMED (or a player BOND_SEVERED) THIS frame — that is the shipped
    // design, not a quirk. Injecting bonds straight into the Map above therefore builds the geometry
    // without announcing it, and the first draft of this test failed for exactly that reason. Signal
    // the change the way a real placement does.
    //
    // ⚠ `world.effects` is WIPED EVERY FRAME by effectsRenderer.sync, so a single push can lose the
    // race against the wipe. Re-announce on an interval until the tower ignites; the reducer de-dups
    // per anchor, so repeating is harmless.
    await page.evaluate(() => {
      const S = (window as unknown as { __SPARK__: { world: never } }).__SPARK__;
      const w = S.world as unknown as {
        effects: Array<unknown>; tick: number;
        defenders: Map<number, { kind: string }>;
      };
      const iv = window.setInterval(() => {
        const live = [...w.defenders.values()].some((d) => d.kind === 'stinkTower');
        if (live) { window.clearInterval(iv); return; }
        w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 520, y: 300 }, bondCount: 1 });
      }, 32);
      window.setTimeout(() => window.clearInterval(iv), 12_000);
    });

    // The igniter fires on a topology change; the host poll re-validates every 30 ticks. Wait on
    // STATE, never on a tick count (the S135 lesson).
    await waitForWorld(
      page,
      (w) => (w as unknown as { defenders: Array<{ kind: string }> }).defenders
        ?.some((d) => d.kind === 'stinkTower') === true,
      'a stinkTower defender exists',
      15_000,
    ).catch(async () => {
      const dump = await page.evaluate(() => {
        const w = (window as unknown as { __SPARK__: { world: never } }).__SPARK__.world as unknown as {
          defenders: Map<number, { kind: string }>;
        };
        return [...w.defenders.values()].map((d) => d.kind);
      });
      throw new Error(`no stinkTower ignited. defenders=${JSON.stringify(dump)}`);
    });

    // ⭐ THE ACTUAL CLAIM: the renderer EMITTED GEOMETRY for it. A defender that exists but draws
    // nothing is the exact failure this file was written for, and it is invisible to state asserts.
    const drawn = await page.evaluate(() => {
      const S = (window as unknown as {
        __SPARK__: { world: never; app: { ticker: { update: (t: number) => void } }; aboveFogLayer: {
          children: Array<{ constructor: { name: string }; geometry?: { bounds?: unknown }; getBounds?: () => { width: number; height: number } }>;
        } };
      }).__SPARK__;
      // Pump real frames so every renderer's sync() runs in production order.
      const t0 = performance.now();
      for (let i = 0; i < 5; i++) S.app.ticker.update(t0 + i * 16);
      const w = S.world as unknown as {
        defenders: Map<number, { kind: string; pos: { x: number; y: number }; bagsRemaining: number }>;
      };
      const tower = [...w.defenders.values()].find((d) => d.kind === 'stinkTower')!;
      // Find any aboveFog Graphics whose painted bounds contain the tower position.
      let covering = 0;
      let widest = 0;
      for (const child of S.aboveFogLayer.children) {
        const b = child.getBounds?.();
        if (b === undefined || b.width <= 0 || b.height <= 0) continue;
        widest = Math.max(widest, b.width);
        const r = b as unknown as { x: number; y: number; width: number; height: number };
        if (tower.pos.x >= r.x && tower.pos.x <= r.x + r.width &&
            tower.pos.y >= r.y && tower.pos.y <= r.y + r.height) covering++;
      }
      return { covering, widest, bags: tower.bagsRemaining, pos: tower.pos };
    });

    // A full magazine on ignition, and at least one painted layer covering where it stands.
    expect(drawn.bags).toBeGreaterThan(0);
    expect(drawn.covering, 'a painted aboveFog layer covers the tower position').toBeGreaterThan(0);
    expect(pageErrors, 'no uncaught exception from the new renderer').toEqual([]);
  });
});

test.describe('S154 P1 (owner R80) — the order queue is reachable WITHOUT opening the castle', () => {
  /*
   * ⭐ THIS TEST IS THE PRIORITY. It was "S141 P2 — the gatherer order queue is reachable and
   * honest", and it opened the castle keep first, then read `castlePanel.getUiPoints()`
   * .paletteCenters / .chipCenters and asserted every control sat inside the PANEL plate.
   *
   * That is precisely the behaviour the owner reported three times as wrong: the palette and the
   * queue only existed while the castle was open. S153 P5a fixed the ENQUEUE path underneath (a
   * shortfall order no longer needed the panel to have been drawn once) but did not move the
   * controls, so the queue itself stayed invisible. R80: *"always be visible on the right side of
   * the footer (after tier 8)"*.
   *
   * So the test now drives `footerBand.getUiPoints()` and — the load-bearing part — NEVER CLICKS A
   * KEEP. Its final assertion is that the castle panel was closed the whole way through.
   */
  test('the footer palette queues shapes, coalesces the chip, and cancels — castle never opened', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await bootSolo(page);

    type StripPts = {
      palette: Array<{ type: number; x: number; y: number; w: number; h: number }>;
      queue: Array<{ type: number; count: number; next: boolean; x: number; y: number; w: number; h: number }>;
      chips: Array<{ complexity: number; x: number; y: number; w: number; h: number }>;
    };
    const readStrip = async (): Promise<StripPts> =>
      page.evaluate(() => {
        const s = (window as { __SPARK__?: { footerBand?: { getUiPoints?: () => unknown } } }).__SPARK__;
        return s!.footerBand!.getUiPoints!() as never;
      });
    const castleOpen = async (): Promise<boolean> =>
      page.evaluate(() => {
        const s = (window as { __SPARK__?: { castlePanel?: { getUiPoints?: () => { open: boolean } } } }).__SPARK__;
        return s!.castlePanel!.getUiPoints!().open;
      });

    // ⛔ THE WHOLE POINT: the strip is there on a freshly booted match, with no click at all.
    expect(await castleOpen(), 'no castle was opened').toBe(false);
    const pts = await readStrip();
    expect(pts.palette.length, 'one palette button per primitive, with the castle shut').toBe(6);
    expect(pts.queue.length, 'no chips before anything is queued').toBe(0);

    // Every button must be inside the footer band and RIGHT of the last tier chip (R80's wording).
    const bandTop = 1080 - 84;
    const lastChipRight = Math.max(...pts.chips.map((c) => c.x + c.w));
    for (const b of pts.palette) {
      expect(b.y, `palette ${b.type} below the band top`).toBeGreaterThanOrEqual(bandTop);
      expect(b.y + b.h, `palette ${b.type} above the canvas floor`).toBeLessThanOrEqual(1080);
      expect(b.x, `palette ${b.type} right of tier 8`).toBeGreaterThan(lastChipRight);
    }

    // Click one shape THREE times — the owner's "click x8 times" gesture, at N=3.
    const square = pts.palette.find((b) => b.type === SQUARE)!;
    for (let i = 0; i < 3; i++) await clickCanvas(page, square.x + square.w / 2, square.y + square.h / 2);

    await waitForWorld(
      page,
      (w) => ((w as unknown as { gathererOrders?: Array<{ seat: number; types: number[] }> })
        .gathererOrders ?? []).some((q) => q.seat === 0 && q.types.length === 3),
      'three Squares queued for seat 0',
      8_000,
    ).catch(async () => {
      const q = await page.evaluate(() => {
        const w = (window as unknown as { __SPARK__: { world: never } }).__SPARK__.world as unknown as {
          gathererOrders: Map<number, number[]>;
        };
        return [...w.gathererOrders.entries()];
      });
      throw new Error(`queue did not reach 3. actual=${JSON.stringify(q)}`);
    });

    // The chip coalesces to ONE entry with a count of 3 (owner ruling B4), not three chips.
    const after = await readStrip();
    expect(after.queue.length, 'three clicks coalesce into ONE chip').toBe(1);
    expect(after.queue[0].type).toBe(SQUARE);
    expect(after.queue[0].count).toBe(3);
    expect(after.queue[0].next, 'the only chip is the next one').toBe(true);
    expect(after.queue[0].y, 'the chip is in the footer band').toBeGreaterThanOrEqual(bandTop);

    // Clicking the chip cancels ONE — click/cancel is symmetric.
    await clickCanvas(page, after.queue[0].x + after.queue[0].w / 2, after.queue[0].y + after.queue[0].h / 2);
    await waitForWorld(
      page,
      (w) => ((w as unknown as { gathererOrders?: Array<{ seat: number; types: number[] }> })
        .gathererOrders ?? []).some((q) => q.seat === 0 && q.types.length === 2),
      'one order cancelled, two remain',
      8_000,
    );

    // ⛔ AND THE CASTLE WAS NEVER OPENED. Without this the test would still pass if the controls
    // had merely been duplicated into the footer while the panel kept owning them.
    expect(await castleOpen(), 'the castle panel stayed shut throughout').toBe(false);
    expect(pageErrors).toEqual([]);
  });
});
