/**
 * S196 render-perf — F1 ATTRIBUTION DIAGNOSTIC (scratch; not a gate). Breaks the render census down by
 * stage path and the managed textures by source, sampled across a long VS-BOTS run, a title return, a
 * second match and a second title return.
 */
import { test, type Page } from '@playwright/test';
import { canvasToCss, waitForWorld, titleButtonCss } from './helpers';
import * as fs from 'node:fs';

test.use({
  launchOptions: {
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  },
});

const OUT = process.env.DIAG_OUT ?? '.tmp-gates/census-diag.jsonl';

async function breakdown(page: Page, tag: string): Promise<void> {
  const s = await page.evaluate(() => {
    const sp = (window as any).__SPARK__;
    let node = sp.fogRenderer.container;
    while (node.parent) node = node.parent;
    const stage = node;
    const name = (c: any, i: number) => `${i}:${c.label || c.constructor?.name || '?'}`;
    const buckets: Record<string, { n: number; hidden: number }> = {};
    let total = 0;
    const walk = (c: any, key: string, depth: number, hiddenAnc: boolean) => {
      total++;
      const h = hiddenAnc || c.visible === false;
      const b = (buckets[key] ??= { n: 0, hidden: 0 });
      b.n++;
      if (h) b.hidden++;
      const kids = c.children ?? [];
      for (let i = 0; i < kids.length; i++) {
        const k = depth < 3 ? `${key}/${name(kids[i], i)}` : key;
        walk(kids[i], k, depth + 1, h);
      }
    };
    walk(stage, 'stage', 0, false);
    const texSys = sp.fogRenderer && (stage as any);
    void texSys;
    const tex: Record<string, number> = {};
    // managed textures, via any renderer reachable from a sprite's texture system — read from the app renderer
    const r = (window as any).__SPARK_DIAG_RENDERER__;
    let texN = -1;
    if (r && r.texture && r.texture.managedTextures) {
      texN = r.texture.managedTextures.length;
      for (const src of r.texture.managedTextures) {
        if (src === null) { tex['<null: removed, still counted by .length>'] = (tex['<null: removed, still counted by .length>'] ?? 0) + 1; continue; }
        const res = src.resource;
        let k = src.label || '';
        if (res && typeof res.src === 'string') k = 'img:' + res.src.split('/').slice(-2).join('/');
        else if (res && res.constructor) k = (k ? k + '|' : '') + res.constructor.name;
        k += ` ${src.width}x${src.height}`;
        tex[k] = (tex[k] ?? 0) + 1;
      }
    }
    return {
      tick: sp.world.tick,
      gameState: sp.world.gameState,
      total,
      census: sp.renderCensus,
      creatures: sp.world.creatures.size,
      prims: sp.world.primitives.size,
      bonds: sp.world.bonds.size,
      buckets,
      tex,
      pools: sp.fx?.pools?.() ?? null,
      texN,
    };
  });
  fs.appendFileSync(OUT, JSON.stringify({ tag, ...s }) + '\n');
  console.log(`[diag ${tag}] tick=${s.tick} state=${s.gameState} objects=${s.census.displayObjects} textures=${s.census.textures} creatures=${s.creatures}`);
}

async function tick(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__SPARK__.world.tick as number);
}
async function runTicks(page: Page, n: number, capMs: number): Promise<void> {
  const t0 = await tick(page);
  const start = Date.now();
  while ((await tick(page)) < t0 + n && Date.now() - start < capMs) await page.waitForTimeout(3000);
}

async function startBots(page: Page): Promise<void> {
  const vsBots = await titleButtonCss(page, 'vsBots');
  await page.mouse.click(vsBots.x, vsBots.y);
  await page.waitForFunction(() => {
    const s = (window as any).__SPARK__;
    return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
  }, { timeout: 20_000 });
  const startPt = await page.evaluate(() => (window as any).__SPARK__.botSetupOverlay.getUiPoints().start);
  const startCss = await canvasToCss(page, startPt.x, startPt.y);
  await page.mouse.click(startCss.x, startCss.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.players.length === 4, 'bots PLAYING', 20_000);
}

async function toTitle(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 20_000);
  await page.waitForTimeout(1500);
}

test('S196 F1 census attribution @diag', async ({ page }) => {
  test.setTimeout(40 * 60_000);
  fs.writeFileSync(OUT, '');
  await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
  // the renderer is not exposed; grab it from the global Pixi devtools hook if present
  await page.evaluate(() => {
    const w = window as any;
    w.__SPARK_DIAG_RENDERER__ = w.__SPARK__.fogRenderer.renderer ?? null;
  });
  await page.waitForTimeout(4000);
  await breakdown(page, 'title0');
  for (let m = 1; m <= Number(process.env.DIAG_MATCHES ?? 3); m++) {
    await startBots(page);
    await runTicks(page, Number(process.env.DIAG_TICKS ?? 6000), 600_000);
    await breakdown(page, `m${m}-end`);
    await toTitle(page);
    await page.waitForTimeout(3000);
    await breakdown(page, `title${m}`);
  }
});
