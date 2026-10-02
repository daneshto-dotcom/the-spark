/**
 * S194 T5 — the home backdrop is render-only decoration: deterministic in its frame index, never
 * clickable, and it draws the six orbiting shapes and live embers (non-vacuous).
 */
import { describe, expect, it, vi } from 'vitest';
import { Texture, type Graphics } from 'pixi.js';

// The soft textures are canvas-built; node has none. A white texture stands in (nothing here reads pixels).
vi.mock('./fx/softTextures.ts', async (orig) => ({
  ...(await orig<typeof import('./fx/softTextures.ts')>()),
  softTexture: () => Texture.WHITE,
}));
import { TitleBackdrop } from './titleBackdrop.ts';

function snapshot(b: TitleBackdrop): string {
  const orbit = b.container.children[3] as Graphics;
  const embers = b.container.children[2]!;
  const sprites = embers.children.filter((s) => s.visible).map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.alpha.toFixed(4)}`);
  return JSON.stringify({ orbit: orbit.context.instructions.length, bounds: orbit.bounds.minX.toFixed(3), sprites });
}

describe('S194 T5 — TitleBackdrop', () => {
  it('the same frame draws the same picture (no hidden randomness, nothing stored between frames)', () => {
    const a = new TitleBackdrop();
    const b = new TitleBackdrop();
    a.draw(1234);
    b.draw(7);
    b.draw(1234);
    expect(snapshot(b)).toBe(snapshot(a));
  });

  it('draws embers and the six orbiting shapes', () => {
    const a = new TitleBackdrop();
    a.draw(900);
    expect(a.container.children[2]!.children.filter((s) => s.visible).length).toBeGreaterThan(50);
    expect((a.container.children[3] as Graphics).context.instructions.length).toBeGreaterThanOrEqual(6);
  });

  it('is never a click target', () => {
    const a = new TitleBackdrop();
    expect(a.container.eventMode).toBe('none');
    for (const c of a.container.children) expect(c.eventMode).toBe('none');
  });
});
