/**
 * S194 R194-32 — the screen chrome (CODEX / VS BOTS / LOBBY) and the reworked codex tower cards.
 *   · the shared backdrop loads lazily, animates only while its screen is shown, and STOPS (its ticker
 *     listener removed) when the screen hides — no ticker leak;
 *   · it is never a click target (`eventMode: 'none'`), and it sits above the scrim, below the controls;
 *   · every codex tower/structure card: the glow sits on exactly the diagram's own nodes, and every
 *     piece of new card chrome lies inside the card; the card is still not interactive.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture, Ticker } from 'pixi.js';
import { SPARK_COLORS } from '../constants.ts';
import { listRecipes } from '../state/godlyRecipes/index.ts';
import '../state/godlyRecipes/registerAll.ts';

vi.mock('./fx/softTextures.ts', async (orig) => ({
  ...(await orig<typeof import('./fx/softTextures.ts')>()),
  softTexture: () => Texture.WHITE,
}));
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

const { ACCENT_BOTS, ACCENT_CODEX, ACCENT_LOBBY, LazyScreenBackdrop, glowTitleStyle } = await import('./uiScreenChrome.ts');
const { cardGlowLayout, drawCardChrome, drawCardGlow } = await import('./codexCardFx.ts');
const { entryFromRecipe, TOWER_TILE_W, TOWER_TILE_H, ART_HALF_W, ART_HALF_H } = await import('./codexOverlay.ts');

describe('S194 R194-32 — the shared backdrop host', () => {
  it('loads on first show, animates while shown, and removes its ticker listener when hidden', async () => {
    const host = new Container();
    host.addChild(new Graphics()); // the screen's dimming plate (index 0)
    host.addChild(new Container()); // a control
    const b = new LazyScreenBackdrop(host, 1, ACCENT_CODEX.backdrop);
    const before = Ticker.shared.count;
    b.setShown(true);
    await vi.waitFor(() => expect(b.isRunning()).toBe(true), { timeout: 5000 });
    expect(host.children[1]!.label, 'above the plate, below the controls').toBe('title-backdrop');
    expect(host.children[1]!.eventMode).toBe('none');
    expect(Ticker.shared.count).toBe(before + 1);
    b.setShown(true); // idempotent (the lobby calls it every frame)
    expect(Ticker.shared.count).toBe(before + 1);
    b.setShown(false);
    expect(Ticker.shared.count, 'no ticker leak once hidden').toBe(before);
    expect(b.isRunning()).toBe(false);
    b.setShown(true);
    expect(Ticker.shared.count).toBe(before + 1);
    b.setShown(false);
  });

  it('three screens, three accents (unique), one title treatment', () => {
    const accents = [ACCENT_CODEX, ACCENT_BOTS, ACCENT_LOBBY];
    expect(new Set(accents.map((a) => a.backdrop.haloTint)).size).toBe(3);
    for (const a of accents) {
      const s = glowTitleStyle(a, 60, 8);
      expect(s.dropShadow).toBeTruthy();
      expect(Number(s.padding)).toBeGreaterThan(0);
    }
  });
});

describe('S194 R194-32 — every codex tower / structure card: glow on the diagram, chrome inside the card', () => {
  const entries = listRecipes().map((r) => entryFromRecipe(r));
  it('anti-vacuity: the codex has its towers', () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
  });
  for (const e of entries) {
    it(e.displayName, () => {
      const l = cardGlowLayout(e, TOWER_TILE_W / 2, 116, ART_HALF_W, ART_HALF_H, 0xffd60a);
      expect(l.nodes.length, 'glow per node').toBeGreaterThan(0);
      for (const n of l.nodes) {
        expect(Object.values(SPARK_COLORS)).toContain(n.color);
        // The halo (r 17) stays inside the card.
        expect(n.x - 17).toBeGreaterThanOrEqual(0);
        expect(n.x + 17).toBeLessThanOrEqual(TOWER_TILE_W);
        expect(n.y - 17).toBeGreaterThanOrEqual(0);
      }
      const g = new Graphics();
      drawCardChrome(g, TOWER_TILE_W, TOWER_TILE_H, l.accent, 0xffd60a, 54, 116, ART_HALF_H);
      drawCardGlow(g, l);
      const b = g.bounds;
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(TOWER_TILE_W);
      expect(b.maxY).toBeLessThanOrEqual(TOWER_TILE_H);
    });
  }
});
