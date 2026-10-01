/**
 * SPARK — S192 `s192/visuals` — **THE SOFT PARTICLE TEXTURES, GENERATED AT RUNTIME.**
 *
 * ⭐ No downloaded asset, so no licence to track and zero bytes of PNG: five small white canvases
 * (radial gradients) built once on first use and tinted per sprite. The audit's finding was that the
 * effects look cheap because every one is a FLAT shape — a hard-edged disc with no falloff. A gaussian
 * falloff drawn additively is most of the difference between "a dot" and "a mote of light".
 *
 * ⚠ BROWSER-ONLY. Never imported by a unit test: the pure layouts (`*Fx.ts`) emit texture KEYS
 * (`FxTex`) and `fxLayer.ts` resolves them here, so the suite exercises everything except the canvas.
 *
 * The smoke puff's lumpiness uses `fxHash`, not `Math.random`, so the texture itself is identical
 * on every screen (the same rule `fogRenderer.ts`' brush follows).
 */

import { Texture } from 'pixi.js';
import { fxHash, type FxTex } from './emitter.ts';

/** Edge length in px of each generated texture. Small: they are drawn scaled and they are soft. */
export const FX_TEX_SIZE: Readonly<Record<FxTex, number>> = {
  soft: 64,
  core: 64,
  ring: 128,
  smoke: 64,
  bubble: 64,
};

const cache = new Map<FxTex, Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('fx: 2d canvas unavailable');
  return [c, ctx];
}

function radial(ctx: CanvasRenderingContext2D, size: number, stops: ReadonlyArray<[number, number]>): void {
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function build(key: FxTex): HTMLCanvasElement {
  const size = FX_TEX_SIZE[key];
  const [c, ctx] = canvas(size);
  switch (key) {
    case 'soft':
      // A near-gaussian falloff: the workhorse mote, glow and pool.
      radial(ctx, size, [[0, 1], [0.18, 0.85], [0.42, 0.4], [0.7, 0.1], [1, 0]]);
      break;
    case 'core':
      // A hot pin-point with a short halo: sparks and flash centres.
      radial(ctx, size, [[0, 1], [0.08, 1], [0.22, 0.55], [0.5, 0.12], [1, 0]]);
      break;
    case 'ring': {
      // A soft annulus peaking at 80 % of the radius: shock rings and burst fronts.
      radial(ctx, size, [[0, 0], [0.55, 0], [0.74, 0.55], [0.82, 1], [0.9, 0.5], [1, 0]]);
      break;
    }
    case 'smoke': {
      // A lumpy puff: eight overlapping soft blobs at hashed offsets, fixed for every screen.
      const r = size / 2;
      for (let i = 0; i < 8; i++) {
        const a = fxHash(0x5e0e, i) * Math.PI * 2;
        const d = fxHash(0x5e0e, i, 1) * r * 0.32;
        const br = r * (0.42 + fxHash(0x5e0e, i, 2) * 0.22);
        const x = r + Math.cos(a) * d;
        const y = r + Math.sin(a) * d;
        const g = ctx.createRadialGradient(x, y, 0, x, y, br);
        g.addColorStop(0, 'rgba(255,255,255,0.42)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      break;
    }
    case 'bubble': {
      // A boil bubble: a faint body, a brighter rim and a small specular highlight up-left.
      radial(ctx, size, [[0, 0.25], [0.62, 0.32], [0.8, 0.85], [0.92, 0.35], [1, 0]]);
      const r = size / 2;
      const hx = r * 0.66;
      const hy = r * 0.62;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.24);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    default: {
      const unhandled: never = key;
      void unhandled;
    }
  }
  return c;
}

/** The shared texture for a key, built on first use. */
export function softTexture(key: FxTex): Texture {
  let t = cache.get(key);
  if (t === undefined) {
    t = Texture.from(build(key));
    cache.set(key, t);
  }
  return t;
}
