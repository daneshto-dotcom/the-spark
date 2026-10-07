/**
 * S196 render-perf (F1) — the census separates fx-pool high-water marks from real growth, and counts LIVE
 * textures (Pixi nulls a released one in place; `.length` never falls).
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('./fx/softTextures.ts', async (orig) => ({
  ...(await orig<typeof import('./fx/softTextures.ts')>()),
  softTexture: () => Texture.WHITE,
}));
import { FX_LAYER_MAX_SPRITES, FxLayer } from './fx/fxLayer.ts';
import { renderCensus } from './renderCensus.ts';

function burst(layer: FxLayer, n: number): void {
  layer.begin();
  for (let i = 0; i < n; i++) layer.emit('soft', i, i, 4, 4, 0, 1, 0xffffff, 'normal');
  layer.end();
}

describe('S196 F1 — renderCensus', () => {
  it('⭐ a pool reaching a high-water mark is POOLED, not growth; a quiet frame after it changes nothing', () => {
    const stage = new Container();
    const a = new FxLayer('a');
    const b = new FxLayer('b');
    stage.addChild(a.container, b.container);
    const before = renderCensus(stage, { managedTextures: [] });
    expect(before).toMatchObject({ displayObjects: 3, pooled: 0, poolCap: 2 * FX_LAYER_MAX_SPRITES });
    burst(a, 150);
    burst(b, 40);
    burst(a, 3); // a quiet frame: the 147 unused sprites stay, hidden
    const after = renderCensus(stage, { managedTextures: [] });
    expect(after.displayObjects - before.displayObjects).toBe(190);
    expect(after.pooled).toBe(190);
    // arithmetic: the leak-relevant residual did not move
    expect(after.displayObjects - after.pooled).toBe(before.displayObjects - before.pooled);
  });

  it('⛔ NEGATIVE — a sprite added OUTSIDE any pool (a missed destroy) shows in the residual', () => {
    const stage = new Container();
    const a = new FxLayer('a');
    stage.addChild(a.container);
    burst(a, 20);
    const s0 = renderCensus(stage, undefined);
    for (let i = 0; i < 7; i++) stage.addChild(new Sprite());
    const s1 = renderCensus(stage, undefined);
    expect((s1.displayObjects - s1.pooled) - (s0.displayObjects - s0.pooled)).toBe(7);
  });

  it('a pool never exceeds its cap however many are asked for', () => {
    const stage = new Container();
    const a = new FxLayer('a');
    stage.addChild(a.container);
    burst(a, FX_LAYER_MAX_SPRITES + 500);
    const c = renderCensus(stage, undefined);
    expect(c.pooled).toBe(FX_LAYER_MAX_SPRITES);
    expect(c.pooled).toBeLessThanOrEqual(c.poolCap);
  });

  it('⭐ textures counts LIVE entries; textureSlots keeps Pixi\'s ever-uploaded length (nulls included)', () => {
    const stage = new Container();
    const c = renderCensus(stage, { managedTextures: [{}, null, {}, null, null, {}] });
    expect(c.textures).toBe(3);
    expect(c.textureSlots).toBe(6);
    expect(renderCensus(stage, undefined).textures).toBe(-1); // probe missing → invalid, loudly
  });
});
