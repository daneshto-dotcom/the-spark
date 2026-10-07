/**
 * SPARK — ⭐ S196 (ui-5) — THE CLICK-OFFSET BUG, REPRODUCED AND PINNED.
 *
 * Owner, S196 (long-standing): *"sometimes when you click on something, it's not where it's supposed to
 * … You have to click like way to the left to click on the button … on the castle … when I'm trying to
 * click on the spiral I have to click like way to the left … Especially when you have the game open … on
 * half of your screen … Or on different screens."*
 *
 * ⛔ WHY EVERY OTHER SPEC IN THIS DIRECTORY WAS BLIND TO IT. `playwright.config.ts` pins ONE viewport,
 * 1920×1080 — exactly the canvas' own size and aspect. The canvas CSS is `max-width/max-height: 100%;
 * object-fit: contain` (index.html), so only when the window aspect is NOT 16:9 does the drawn picture sit
 * inside letterbox bars within the canvas' CSS box. Pixi 8's `EventSystem.mapPositionToPoint` scales x and
 * y independently over the WHOLE box and never subtracts a bar; `Controls.updateCursor` (S39) did. Two
 * mappings, one right, one wrong, and the suite only ever ran at the one size where they agree.
 *
 * So this spec runs at the sizes a real player has: half a 1080p screen, a 1366×768 laptop, a browser
 * window with its toolbar eating height (1920×947), a 1440p monitor — at device pixel ratios 1 / 1.25 /
 * 1.5 / 2. It hovers the VISUAL centre of real targets (computed by `canvasToCss`, the letterbox-aware
 * inverse of what the player sees) and asks the target itself whether the pointer reached it.
 *
 * Two describes:
 *  · GATING (no tag): the two letterbox directions, asserting every target is reached and a near-miss is not.
 *  · MATRIX (opt-in, `CLICK_OFFSET_MATRIX=1`): the full viewport × DPR grid, printed as the before/after table.
 */
import { type Browser, type Page, expect, test } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH, canvasToCss, keepAnchor, waitForWorld } from './helpers.ts';

interface Cfg { w: number; h: number; dpr: number }

interface TargetResult {
  name: string;
  /** canvas-space point we aimed at (the target's own reported centre). */
  aim: { x: number; y: number };
  /** where Pixi's event system says the pointer is, in canvas px. */
  pixi: { x: number; y: number };
  /** where Controls says the pointer is, in canvas px. */
  controls: { x: number; y: number };
  /** did the target itself report the hover? */
  hit: boolean;
}

interface CfgResult { cfg: Cfg; titleSoloHit: boolean; targets: TargetResult[]; nearMissHovered: boolean; speedClickSpent: boolean }

type SparkWin = Window & { __SPARK__?: Record<string, unknown> };

async function readPointers(page: Page): Promise<{ pixi: { x: number; y: number }; controls: { x: number; y: number } }> {
  return page.evaluate(() => {
    const s = (window as SparkWin).__SPARK__ as {
      app: { renderer: { events: { pointer: { global: { x: number; y: number } } } } };
      controls: { cursor: { x: number; y: number } };
    };
    const g = s.app.renderer.events.pointer.global;
    return { pixi: { x: g.x, y: g.y }, controls: { x: s.controls.cursor.x, y: s.controls.cursor.y } };
  });
}

/** Move to a canvas point's VISUAL position; nudge first so `pointerover` always re-fires. */
async function hoverCanvas(page: Page, cx: number, cy: number): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.move(p.x - 30, p.y - 30);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(120); // a couple of frames: footer hover is latched in the render loop
}

async function bootSolo(page: Page): Promise<boolean> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await page.evaluate(() => {
    const s = (window as SparkWin).__SPARK__ as {
      titleScreen: { getButtonCenters: () => Record<string, { x: number; y: number }> };
    };
    return s.titleScreen.getButtonCenters().solo;
  });
  const p = await canvasToCss(page, solo.x, solo.y);
  await page.mouse.click(p.x, p.y);
  let hit = true;
  try {
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING', 4_000);
  } catch {
    hit = false;
    // Measurement only: reach PLAYING by clicking where the (buggy) non-uniform mapping expects it.
    const q = await page.evaluate(({ cx, cy, CW, CH }) => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: r.left + (cx * r.width) / CW, y: r.top + (cy * r.height) / CH };
    }, { cx: solo.x, cy: solo.y, CW: CANVAS_WIDTH, CH: CANVAS_HEIGHT });
    await page.mouse.click(q.x, q.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING (fallback)');
  }
  return hit;
}

async function probe(browser: Browser, cfg: Cfg): Promise<CfgResult> {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr });
  const page = await ctx.newPage();
  try {
    const titleSoloHit = await bootSolo(page);
    const targets: TargetResult[] = [];

    // ── castle panel (Pixi `pointerover` path): open it via a keep click, then hover each kind ──
    const keep = await keepAnchor(page, 0);
    const kp = await canvasToCss(page, keep.x, keep.y);
    await page.mouse.click(kp.x, kp.y);
    await page.waitForTimeout(150);
    const pts = await page.evaluate(() => {
      const s = (window as SparkWin).__SPARK__ as { castlePanel: { getUiPoints: () => {
        open: boolean;
        rect: { x: number; y: number; w: number; h: number } | null;
        rowCenters: { key: string; x: number; y: number }[];
        slotCenters: { index: number; x: number; y: number }[];
        structureCenters: { id: string; x: number; y: number }[];
      } } };
      return s.castlePanel.getUiPoints();
    });
    expect(pts.open, 'castle panel opened by a keep click').toBe(true);

    const castleHover = (kind: 'rows' | 'slots' | 'tiles', i: number): Promise<boolean> =>
      page.evaluate(({ kind, i }) => {
        const cp = (window as SparkWin).__SPARK__!.castlePanel as Record<string, { hover: boolean }[]>;
        return cp[kind][i]?.hover === true;
      }, { kind, i });

    const aims: Array<{ name: string; kind: 'rows' | 'slots' | 'tiles'; i: number; x: number; y: number }> = [];
    const speed = pts.rowCenters.findIndex((r) => r.key === 'upgradeSpeed');
    aims.push({ name: 'castle row SPEED', kind: 'rows', i: speed, ...pts.rowCenters[speed] });
    aims.push({ name: 'castle row (last)', kind: 'rows', i: pts.rowCenters.length - 1, ...pts.rowCenters[pts.rowCenters.length - 1] });
    // The shape-pull slots are the owner's "spiral" — slot 0 and the last one (left/right ends of the strip).
    aims.push({ name: 'castle pull slot 0', kind: 'slots', i: 0, ...pts.slotCenters[0] });
    aims.push({ name: 'castle pull slot (last)', kind: 'slots', i: pts.slotCenters.length - 1, ...pts.slotCenters[pts.slotCenters.length - 1] });
    // The BUILD grid ships OFF (`CASTLE_BUILD_GRID_ENABLED = false`) while `getUiPoints` still reports
    // `structureCenters` for it — aim at a tile only when one was actually constructed.
    const tileCount = await page.evaluate(() =>
      ((window as SparkWin).__SPARK__!.castlePanel as { tiles: unknown[] }).tiles.length);
    if (tileCount > 0) aims.push({ name: 'castle build tile 0', kind: 'tiles', i: 0, ...pts.structureCenters[0] });

    for (const a of aims) {
      await hoverCanvas(page, a.x, a.y);
      const ptr = await readPointers(page);
      targets.push({ name: a.name, aim: { x: a.x, y: a.y }, ...ptr, hit: await castleHover(a.kind, a.i) });
    }

    // Negative: 6 canvas px LEFT of the panel's own left edge must hover NO row.
    const r = pts.rect!;
    await hoverCanvas(page, r.x - 6, pts.rowCenters[speed].y);
    const nearMissHovered = await page.evaluate(() => {
      const cp = (window as SparkWin).__SPARK__!.castlePanel as Record<string, { hover: boolean }[]>;
      return cp.rows.some((x) => x.hover) || cp.slots.some((x) => x.hover) || cp.tiles.some((x) => x.hover);
    });

    // ── a REAL CLICK, not only a hover: SPEED at its visual centre must spend (pointertap reached) ──
    const scoreOf = (): Promise<number> => page.evaluate(() => {
      const w = (window as SparkWin).__SPARK__!.world as { scoreByPlayer: Map<number, number>; localPlayerId: number };
      return w.scoreByPlayer.get(w.localPlayerId) ?? 0;
    });
    const scoreBefore = await scoreOf();
    const sp = await canvasToCss(page, pts.rowCenters[speed].x, pts.rowCenters[speed].y);
    await page.mouse.move(sp.x, sp.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    let speedClickSpent = false;
    for (let i = 0; i < 40 && !speedClickSpent; i++) {
      await page.waitForTimeout(100);
      speedClickSpent = (await scoreOf()) < scoreBefore;
    }

    // ── footer tier chips (Controls path) — the comparison row ──
    const chips = await page.evaluate(() => {
      const s = (window as SparkWin).__SPARK__ as { footerBand: { getUiPoints: () => {
        chips: { complexity: number; x: number; y: number; w: number; h: number }[];
      } } };
      return s.footerBand.getUiPoints().chips;
    });
    for (const c of [chips[0], chips[chips.length - 1]].filter((c) => c !== undefined)) {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      await hoverCanvas(page, cx, cy);
      const ptr = await readPointers(page);
      const hit = await page.evaluate((k) => {
        const fb = (window as SparkWin).__SPARK__!.footerBand as { hoverChip: number | null };
        return fb.hoverChip === k;
      }, c.complexity);
      targets.push({ name: `footer tier chip ${c.complexity}`, aim: { x: cx, y: cy }, ...ptr, hit });
    }
    return { cfg, titleSoloHit, targets, nearMissHovered, speedClickSpent };
  } finally {
    await ctx.close();
  }
}

const fmt = (r: CfgResult): string =>
  r.targets
    .map((t) =>
      `${r.cfg.w}x${r.cfg.h}@${r.cfg.dpr}\t${t.name}\thit=${t.hit ? 'Y' : 'N'}` +
      `\tpixiΔ=(${(t.pixi.x - t.aim.x).toFixed(0)},${(t.pixi.y - t.aim.y).toFixed(0)})` +
      `\tcontrolsΔ=(${(t.controls.x - t.aim.x).toFixed(0)},${(t.controls.y - t.aim.y).toFixed(0)})`)
    .join('\n') + `\n${r.cfg.w}x${r.cfg.h}@${r.cfg.dpr}\ttitle SOLO click hit=${r.titleSoloHit ? 'Y' : 'N'}\tnear-miss hovered=${r.nearMissHovered ? 'Y' : 'N'}	SPEED click spent=${r.speedClickSpent ? 'Y' : 'N'}`;

/**
 * The gating subset — the two letterbox directions, nothing else (each probe boots a fresh page, ~25 s, and
 * the shared gating lane's clock is shared): the owner's half-screen (bars top/bottom → the old error was
 * vertical) and a toolbar-eaten 1080p window at 150 % (bars left/right → the old error was the +82 px
 * horizontal one, his "click way to the left"). 16:9 sizes (1366×768, 2560×1440) cannot letterbox, and the
 * unit matrix in `src/input/pointerMapping.test.ts` covers every size × DPR in arithmetic.
 */
const GATING: Cfg[] = [
  { w: 960, h: 1080, dpr: 1 },
  { w: 1920, h: 947, dpr: 1.5 },
];

test.describe('S196 click offset — every target reached at real window sizes', () => {
  for (const cfg of GATING) {
    test(`${cfg.w}x${cfg.h} @ DPR ${cfg.dpr}: visual centre hits, near-miss does not`, async ({ browser }) => {
      test.setTimeout(90_000);
      const r = await probe(browser, cfg);
      console.log(fmt(r));
      expect(r.titleSoloHit, 'title SOLO button clicked at its visual centre').toBe(true);
      for (const t of r.targets) {
        expect(t.hit, `${t.name} reached at its visual centre`).toBe(true);
        // ONE mapping: Pixi and Controls agree to within a pixel.
        expect(Math.abs(t.pixi.x - t.controls.x), `${t.name} pixi/controls x`).toBeLessThan(1.5);
        expect(Math.abs(t.pixi.y - t.controls.y), `${t.name} pixi/controls y`).toBeLessThan(1.5);
      }
      expect(r.nearMissHovered, '6 px outside the castle panel hovers nothing').toBe(false);
      expect(r.speedClickSpent, 'a real click on SPEED at its visual centre spent the score').toBe(true);
    });
  }
});

/*
 * ⚠ OPT-IN ONLY (`CLICK_OFFSET_MATRIX=1`), and deliberately NOT tagged `@perf-measure`: 20 fresh boots take
 * ~8 min locally and far longer on a SwiftShader runner, and that tag would put them on the e2e-soak lane's
 * tick-derived budget (`src/ci.e2eLanes.test.ts`). This is the measurement that produced the BEFORE/AFTER
 * tables in `.claude/plans/S196_ui-5_click-offset-*.txt`; re-run it by hand when the canvas CSS changes.
 */
test.describe('S196 click offset — viewport × DPR matrix (opt-in)', () => {
  test('matrix', async ({ browser }, info) => {
    test.skip(process.env.CLICK_OFFSET_MATRIX !== '1', 'opt-in: CLICK_OFFSET_MATRIX=1');
    test.setTimeout(20 * 60_000);
    const sizes = [
      { w: 1920, h: 1080 }, { w: 960, h: 1080 }, { w: 1366, h: 768 }, { w: 1920, h: 947 }, { w: 2560, h: 1440 },
    ];
    const out: CfgResult[] = [];
    for (const s of sizes) for (const dpr of [1, 1.25, 1.5, 2]) out.push(await probe(browser, { ...s, dpr }));
    const table = out.map(fmt).join('\n');
    console.log(table);
    await info.attach('click-offset-matrix.txt', { body: table, contentType: 'text/plain' });
    const fs = await import('node:fs');
    fs.mkdirSync('.tmp-gates', { recursive: true });
    fs.writeFileSync(`.tmp-gates/click-offset-matrix-${process.env.CLICK_OFFSET_LABEL ?? 'run'}.txt`, table, 'utf-8');
  });
});
