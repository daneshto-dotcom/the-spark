/**
 * SPARK — S182 — **THE LIGHTNING HUB'S DAMAGE RAMP IS ON SCREEN.** @visual
 *
 * ## ⛔ THE ONLY GATE THAT CAN CATCH THE DEFECT THIS PROJECT KEEPS SHIPPING
 *
 * `t3TowerAtlasBase` had 7.4 MiB of matted, guarded, disk-tested tower art and **zero production
 * callers** for two sessions. Every signal was green: the files were present, the paths resolved,
 * `check:atlas` scanned them, and the unit test that "covered" them asserted EXISTENCE rather than
 * USE. A renderer was simply never written, and nothing in the repo could tell.
 *
 * This branch ships a new atlas AND a new renderer, so it is squarely in that failure mode's path.
 * The unit suite proves the frame arithmetic, the manifest agreement and the self-destruct trigger;
 * none of that can prove a texture reached a sprite, because jsdom has no Pixi stage. This can.
 *
 * ⚠ **IT ASSERTS THE SPRITE, NOT A PIXEL** — the `tower-art.spec.ts` rule. A screenshot diff would
 * fail on every art revision and teach the next session to re-baseline without looking. "One live
 * hub, one live sprite" is true across any redraw of the art and false in exactly the way that
 * shipped.
 *
 * ⚠ **AND IT CHECKS THE ATLAS ACTUALLY LOADED**, separately from the sprite, because the renderer
 * bails silently when the manifest is null — which is the right fallback and also the perfect hiding
 * place for a 404. A wrong path would otherwise read as "no tower built".
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

/** `SparkType` on the wire. The hub's bill is 1 Dot + 5 Circles. */
const DOT = 0;
const CIRCLE = 4;
const HUB_ID = 'lightningHub';
/*
 * ⛔ THE RAMP LAYER IS READ BY IDENTITY, NOT BY INDEX, AND THE FIRST RUN OF THIS FILE IS WHY.
 *
 * It opened with `fogHiddenLayer.children[15]`, copying `tower-art.spec.ts`'s idiom — whose own
 * comment calls it *"a hardcoded index into a hand-maintained display list, which is why it keeps
 * breaking"* (four moves so far). Here it was wrong immediately: index 15 held the PRINCESS layer,
 * so a board with no hub at all reported TWO ramp sprites. `fog.spec.ts`'s roll call could not catch
 * it either — both are `_Container`, so the two are indistinguishable in a list of type names.
 *
 * `__SPARK__.structureRampLayer` is the established geometry-getter convention (S85 P4c) and cannot
 * be off by one.
 */

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

/** Seat 0's bank, set outright — the hub needs TWO shape types, unlike a race tower's single feed. */
async function seedHubBill(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(({ dot, circle }) => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, number[]>;
    };
    const tally = [0, 0, 0, 0, 0, 0];
    tally[dot] = 2; // one spare, so a mis-click cannot read as an unfunded card
    tally[circle] = 6;
    w.castleBanks.set(0, tally);
  }, { dot: DOT, circle: CIRCLE });
}

async function bandPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { footerBand?: { getUiPoints?: () => unknown } } }).__SPARK__;
    if (sp?.footerBand?.getUiPoints === undefined) throw new Error('footerBand.getUiPoints unavailable');
    // Called IN PLACE — detaching the method loses `this`.
    return sp.footerBand.getUiPoints() as {
      chips: Array<{ complexity: number; x: number; y: number; w: number; h: number; enabled: boolean }>;
      cards: Array<{ id: string; name: string; reason: string; enabled: boolean; x: number; y: number; w: number; h: number }>;
    };
  });
}

/** Live spawners, plus how many sprites the RAMP renderer is holding. */
async function rampState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      creatureSpawners: Map<number, { recipeId: string }>;
      primitives: Map<number, unknown>;
    };
    const layer = (window as { __SPARK__?: { structureRampLayer?: unknown } }).__SPARK__
      ?.structureRampLayer as { children?: unknown[] } | undefined;
    if (layer === undefined) throw new Error('__SPARK__.structureRampLayer unavailable');
    return {
      spawners: [...w.creatureSpawners.values()].map((s) => s.recipeId),
      primitives: w.primitives.size,
      rampSprites: layer.children?.length ?? -1,
    };
  });
}

async function clickCanvas(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const p = await canvasToCss(page, x, y);
  await page.mouse.click(p.x, p.y);
}

test.describe('@visual S182 — the lightning hub is DRAWN, not just built', () => {
  test('⭐ the atlas and its manifest are actually SERVED at the path the renderer asks for', async ({ page }) => {
    /*
     * ⛔ SEPARATE FROM THE SPRITE TEST ON PURPOSE. `StructureRampRenderer` swallows a failed fetch and
     * leaves the manifest absent — the correct fallback (the hub's shapes stay visible) and the
     * perfect place for a 404 to hide. Asked here directly, a wrong path is a wrong path.
     */
    await page.goto('/');
    const manifest = await page.evaluate(async () => {
      const r = await fetch('/art/lightning-hub/lightning-hub-anim.json');
      return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null };
    });
    expect(manifest.ok, `manifest 404 at /art/lightning-hub/ (status ${manifest.status})`).toBe(true);
    const m = manifest.body as { cellW: number; states: Record<string, { frames: number }> };
    expect(Object.keys(m.states).sort()).toEqual(['collapse', 'damage']);
    expect(m.states.damage.frames).toBe(12);
    expect(m.states.collapse.frames).toBe(12);

    const png = await page.evaluate(async () => {
      const r = await fetch('/art/lightning-hub/lightning-hub-atlas.png');
      return { ok: r.ok, status: r.status, bytes: r.ok ? (await r.blob()).size : 0 };
    });
    expect(png.ok, `atlas 404 (status ${png.status})`).toBe(true);
    expect(png.bytes, 'the atlas must not be an empty file').toBeGreaterThan(10_000);
  });

  test('⭐⭐ a hub stamps, ignites, and puts a SPRITE on the board', async ({ page }) => {
    await bootSolo(page);
    await seedHubBill(page);
    await page.waitForTimeout(300);

    const before = await rampState(page);
    expect(before.spawners, 'no hub before the build').toEqual([]);
    expect(before.rampSprites, 'the ramp layer must exist and start empty').toBe(0);

    // ARM: the hub is a SIX-shape recipe, so it lives under the `6` chip on the footer band.
    const { chips } = await bandPoints(page);
    const chip = chips.find((c) => c.complexity === 6);
    expect(chip, `no 6 chip; the bar has [${chips.map((c) => c.complexity).join(', ')}]`).not.toBeUndefined();
    await clickCanvas(page, chip!.x + chip!.w / 2, chip!.y + chip!.h / 2);
    await page.waitForTimeout(400);

    const { cards } = await bandPoints(page);
    const card = cards.find((c) => c.id === HUB_ID);
    expect(
      card,
      `the hub card must open above the bar — open cards: [${cards.map((c) => c.id).join(', ')}]`,
    ).not.toBeUndefined();
    expect(card!.enabled, `funded card must be clickable — ${card!.reason}`).toBe(true);
    await clickCanvas(page, card!.x + card!.w / 2, card!.y + card!.h / 2);
    await page.waitForTimeout(250);

    // PLACE: the same legal seat-0 site `click-to-build.spec.ts` and `tower-art.spec.ts` use.
    await clickCanvas(page, 420, 400);
    await page.waitForTimeout(900);

    const after = await rampState(page);
    expect(after.primitives - before.primitives, 'six shapes stamped: 1 Dot hub + 5 Circle leaves').toBe(6);
    // ⭐ It IGNITED — zero here would mean the star landed but no BOND_FORMED reached the matcher.
    expect(after.spawners, 'the hub must ignite').toContain(HUB_ID);
    /*
     * ⭐⭐⭐ THE ASSERTION THIS FILE EXISTS FOR. One live hub, one sprite. A zero here is the
     * `t3TowerAtlasBase` defect happening again: recipe fine, atlas fine, path fine, nothing drawn.
     */
    expect(after.rampSprites, 'the ramp renderer must hold exactly one sprite').toBe(1);

    await page.screenshot({ path: 'test-results/lightning-hub-on-board.png' });
  });

  test('⭐⭐ and the sprite FOLLOWS THE DAMAGE — the frame moves when the star is hurt', async ({ page }) => {
    /*
     * ⛔ THE HALF A SPRITE COUNT CANNOT SEE. A renderer that drew frame 1 forever would pass every
     * assertion above, and that is precisely the Voltkin TV's S178 defect: four twelve-frame rows
     * were each drawn as a frozen frame 0 for three sessions, because nothing ever compared two
     * frames. So this damages the hub's own bonds and reads the TEXTURE FRAME back off the sprite.
     *
     * ⚠ Damage is applied to `Bond.damageFifths` directly rather than by staging a fight: the wiring
     * from a real attacker to that field is `damage.ts`'s job and is covered under the real host tick
     * in `hubSelfDestructS182.test.ts`. What is unproven anywhere else is that the RENDERER reads it.
     */
    await bootSolo(page);
    await seedHubBill(page);
    await page.waitForTimeout(300);
    const { chips } = await bandPoints(page);
    const chip = chips.find((c) => c.complexity === 6);
    await clickCanvas(page, chip!.x + chip!.w / 2, chip!.y + chip!.h / 2);
    await page.waitForTimeout(400);
    const { cards } = await bandPoints(page);
    const card = cards.find((c) => c.id === HUB_ID);
    expect(card, 'the hub card must be open').not.toBeUndefined();
    await clickCanvas(page, card!.x + card!.w / 2, card!.y + card!.h / 2);
    await page.waitForTimeout(250);
    await clickCanvas(page, 420, 400);
    await page.waitForTimeout(900);

    const frameOf = async (): Promise<{ x: number; y: number; w: number; h: number }> =>
      page.evaluate(() => {
        const layer = (window as { __SPARK__?: { structureRampLayer?: unknown } }).__SPARK__
          ?.structureRampLayer as
          { children?: Array<{ texture?: { frame?: { x: number; y: number; width: number; height: number } } }> };
        const f = layer?.children?.[0]?.texture?.frame;
        if (f === undefined) throw new Error('no ramp sprite / no texture frame');
        return { x: f.x, y: f.y, w: f.width, h: f.height };
      });

    const pristine = await frameOf();
    expect(pristine.x, 'a pristine hub draws frame 1 — column 0 of the damage row').toBe(0);
    expect(pristine.y, 'and row 0, not the collapse row').toBe(0);

    // Bank half the star's 50-fifth pool onto its own bonds — health 0.5, which the owner's own
    // table puts at frame 12, i.e. column 11 of row 0.
    await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        creatureSpawners: Map<number, { recipeId: string; anchorPrimitiveId: number }>;
        primitives: Map<number, { bonds: Set<number> }>;
        bonds: Map<number, { damageFifths: number }>;
      };
      const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === 'lightningHub');
      if (sp === undefined) throw new Error('no hub spawner');
      const hub = w.primitives.get(sp.anchorPrimitiveId);
      if (hub === undefined) throw new Error('no hub primitive');
      let left = 25; // half of structurePoolFifths(5) = 50
      for (const id of hub.bonds) {
        const take = Math.min(left, 5);
        w.bonds.get(id)!.damageFifths += take;
        left -= take;
      }
    });
    // The cursor PLAYS THROUGH (R182-D) at 3 ticks per frame, so give it room to walk 1 -> 12.
    await page.waitForTimeout(1200);

    const hurt = await frameOf();
    expect(hurt.y, 'still the damage row — 50 % is not the collapse row').toBe(0);
    expect(hurt.x, 'half health draws frame 12, i.e. column 11').toBe(11 * pristine.w);

    await page.screenshot({ path: 'test-results/lightning-hub-damaged.png' });
  });
});
