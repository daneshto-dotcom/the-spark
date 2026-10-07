import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUT = process.env.BENCH_OUT ?? '../bench.json';
const RACE = process.env.BENCH_RACE ?? 'orcs';
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? '6');
const AT = { x: 430, y: 430 };

async function css(page: Page, cx: number, cy: number) {
  return page.evaluate(({ cx, cy }) => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    const s = Math.min(r.width / 1920, r.height / 1080);
    return { x: r.left + (r.width - 1920 * s) / 2 + cx * s, y: r.top + (r.height - 1080 * s) / 2 + cy * s };
  }, { cx, cy });
}
const stat = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return { n: a.length, mean: a.reduce((p, c) => p + c, 0) / Math.max(1, a.length), p95: s[Math.floor(s.length * 0.95)] ?? 0 };
};

test('boss release bench', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__SPARK__?.world?.gameState === 'TITLE', null, { timeout: 60_000 });
  const c = await page.evaluate(() => (window as any).__SPARK__.titleScreen.getButtonCenters());
  const p = await css(page, c.solo.x, c.solo.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => (window as any).__SPARK__?.world?.gameState === 'PLAYING', null, { timeout: 60_000 });
  await page.mouse.move(5, 5);
  await page.evaluate(async ({ race, at }) => {
    const w = (window as any).__SPARK__.world;
    const { T9_TOWER_IDS } = await import('/src/state/t9BossIds.ts');
    const { blueprintBill } = await import('/src/state/blueprints.ts');
    const { makeCastleBank } = await import('/src/state/castleBank.ts');
    const { applyBuildBlueprint } = await import('/src/state/blueprintBuild.ts');
    w.players.get(w.localPlayerId).raceId = race;
    const id = T9_TOWER_IDS[race];
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill(id)) bank[type] = (bank[type] ?? 0) + count;
    w.castleBanks.set(w.localPlayerId, bank);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: w.localPlayerId, blueprintId: id, centre: at });
  }, { race: RACE, at: AT });
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    const m = await import('/src/render/fx/bossReleaseTrack.ts');
    m.BOSS_RELEASE_DEV.loop = true; // keep the release moment alive for the measurement
    const w = (window as any).__SPARK__.world;
    const sp = [...w.creatureSpawners.values()].find((s: any) => String(s.recipeId).startsWith('t9Tower'));
    if (!sp) throw new Error('no t9 tower');
    const prev = w.matchPhase;
    w.matchPhase = 'FIGHT';
    sp.nextSpawnTick = w.tick;
    await new Promise((r) => setTimeout(r, 100));
    w.matchPhase = prev;
  });
  const result: Record<string, unknown> = { race: RACE, rounds: ROUNDS };
  for (const tier of ['HIGH', 'LOW', 'MINIMAL'] as const) {
    await page.evaluate((tier) => {
      const fx = (window as any).__SPARK__.fx;
      fx.setLegacy(tier === 'MINIMAL');
      fx.setHighQuality(tier === 'HIGH');
    }, tier);
    const on: number[] = [], off: number[] = [];
    const sprites: Record<string, number[]> = { on: [], off: [] };
    for (let r = 0; r < ROUNDS; r++) {
      for (const mode of (r % 2 === 0 ? ['on', 'off'] : ['off', 'on']) as Array<'on' | 'off'>) {
        await page.evaluate(async (off) => { (await import('/src/render/fx/bossReleaseTrack.ts')).BOSS_RELEASE_DEV.off = off; }, mode === 'off');
        await page.waitForTimeout(300);
        const n0 = await page.evaluate(() => (window as any).__SPARK__.frameMs.length);
        await page.waitForTimeout(2500);
        const got = await page.evaluate(() => { const S = (window as any).__SPARK__; const st = S.fx.stats(); return { ms: [...S.frameMs], sprites: st.ground + st.top }; });
        const slice = got.ms.slice(-Math.min(got.ms.length, 140));
        (mode === 'on' ? on : off).push(...slice);
        sprites[mode]!.push(got.sprites);
        void n0;
      }
    }
    result[tier] = { on: stat(on), off: stat(off), deltaMean: stat(on).mean - stat(off).mean, sprites };
  }
  await page.evaluate(async () => { const m = await import('/src/render/fx/bossReleaseTrack.ts'); m.BOSS_RELEASE_DEV.off = false; m.BOSS_RELEASE_DEV.loop = false; });
  writeFileSync(OUT, JSON.stringify(result, null, 1));
});
