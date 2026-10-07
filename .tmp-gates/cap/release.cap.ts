import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.env.CAP_OUT ?? 'C:/Users/onesh/OneDrive/Desktop/SPARK_S196_BossRelease/raw';
const MODE = process.env.CAP_MODE ?? 'after'; // 'after' | 'before'
const RACES = (process.env.CAP_RACES ?? 'demons,mummies,nagas,orcs,vampires,zombies').split(',');
const AT = { x: 430, y: 430 };

async function boot(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__SPARK__?.world?.gameState === 'TITLE', null, { timeout: 60_000 });
  const c = await page.evaluate(() => (window as any).__SPARK__.titleScreen.getButtonCenters());
  const p = await css(page, c.solo.x, c.solo.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => (window as any).__SPARK__?.world?.gameState === 'PLAYING', null, { timeout: 60_000 });
  await page.mouse.move(5, 5);
}
async function css(page: Page, cx: number, cy: number) {
  return page.evaluate(({ cx, cy }) => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    const s = Math.min(r.width / 1920, r.height / 1080);
    return { x: r.left + (r.width - 1920 * s) / 2 + cx * s, y: r.top + (r.height - 1080 * s) / 2 + cy * s, s };
  }, { cx, cy });
}

test('boss release capture', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await boot(page);
  await page.evaluate(async (mode) => {
    const m = await import('/src/render/fx/bossReleaseTrack.ts');
    m.BOSS_RELEASE_DEV.off = mode === 'before';
  }, MODE);
  const meta: Record<string, unknown> = {};
  for (const race of RACES) {
    const ok = await page.evaluate(async ({ race, at }) => {
      const S = (window as any).__SPARK__;
      const w = S.world;
      const { T9_TOWER_IDS } = await import('/src/state/t9BossIds.ts');
      const { blueprintBill } = await import('/src/state/blueprints.ts');
      const { makeCastleBank } = await import('/src/state/castleBank.ts');
      const { applyBuildBlueprint } = await import('/src/state/blueprintBuild.ts');
      for (const c of [...w.creatures.keys()]) w.creatures.delete(c);
      w.players.get(w.localPlayerId).raceId = race;
      const id = T9_TOWER_IDS[race];
      const bank = makeCastleBank();
      for (const [type, count] of blueprintBill(id)) bank[type] = (bank[type] ?? 0) + count;
      w.castleBanks.set(w.localPlayerId, bank);
      const before = w.primitives.size;
      applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: w.localPlayerId, blueprintId: id, centre: at });
      return w.primitives.size - before;
    }, { race, at: AT });
    if (ok !== 9) throw new Error(`${race}: stamped ${ok} shapes`);
    // let it ignite + the atlas load, in natural time
    await page.clock.runFor(4000);
    const sp = await page.evaluate((race) => {
      const w = (window as any).__SPARK__.world;
      const s = [...w.creatureSpawners.values()].find((x: any) => String(x.recipeId).toLowerCase().endsWith(race));
      return s ? { id: s.id } : null;
    }, race);
    if (sp === null) throw new Error(`${race}: tower did not ignite`);
    const box = await css(page, AT.x - 400, AT.y - 470);
    const clip = { x: box.x, y: box.y, width: 800 * box.s, height: 800 * box.s };
    await page.screenshot({ path: `${OUT}/${MODE}-${race}-00-standing.png`, clip });
    // RELEASE: the real tier-9 arm, made due now (spawners only emit in FIGHT)
    const phase = await page.evaluate((sid) => {
      const w = (window as any).__SPARK__.world;
      const prev = w.matchPhase;
      w.matchPhase = 'FIGHT';
      w.creatureSpawners.get(sid).nextSpawnTick = w.tick;
      return prev;
    }, sp.id);
    const t0 = await page.evaluate(() => (window as any).__SPARK__.world.tick);
    for (let f = 1; f <= 16; f++) {
      await page.clock.runFor(f === 1 ? 20 : 60);
      if (f === 1) await page.evaluate((p) => { (window as any).__SPARK__.world.matchPhase = p; }, phase);
      const st = await page.evaluate(() => { const w = (window as any).__SPARK__.world; return { tick: w.tick, spawners: w.creatureSpawners.size }; });
      await page.screenshot({ path: `${OUT}/${MODE}-${race}-${String(f).padStart(2, '0')}.png`, clip });
      if (f === 2 || f === 5) await page.screenshot({ path: `${OUT}/${MODE}-${race}-full-${f}.png` });
      meta[`${race}-${f}`] = { age: st.tick - t0, spawners: st.spawners };
    }
    await page.clock.runFor(1500);
  }
  writeFileSync(`${OUT}/${MODE}-meta.json`, JSON.stringify(meta, null, 1));
});
