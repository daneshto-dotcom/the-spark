/**
 * SPARK — S193 `s193/visuals-board` (V24) — **BAKE THE GROUND STAINS, ONCE, AT RUNTIME.**
 *
 * One small canvas per (race, variant), filled texel by texel from the pure `groundStainTexel`. No
 * downloaded asset, so no licence and no bytes of PNG. Built lazily on the first frame a race's stain
 * is drawn (~8k texels, a few ms) and cached for the session.
 *
 * ⚠ BROWSER-ONLY (canvas + Pixi). Never imported by a unit test; the texel function is what is tested.
 */

import { Texture } from 'pixi.js';
import type { RaceId } from '../state/races.ts';
import { GROUND_STAIN_TEX_H, GROUND_STAIN_TEX_W, groundStainTexel } from './fx/groundStainFx.ts';

const cache = new Map<string, Texture>();

export function groundStainTexture(race: RaceId, variant: number): Texture {
  const key = `${race}:${variant}`;
  let t = cache.get(key);
  if (t !== undefined) return t;
  const c = document.createElement('canvas');
  c.width = GROUND_STAIN_TEX_W;
  c.height = GROUND_STAIN_TEX_H;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('groundStain: 2d canvas unavailable');
  const img = ctx.createImageData(GROUND_STAIN_TEX_W, GROUND_STAIN_TEX_H);
  const d = img.data;
  for (let y = 0; y < GROUND_STAIN_TEX_H; y++) {
    const v = ((y + 0.5) / GROUND_STAIN_TEX_H) * 2 - 1;
    for (let x = 0; x < GROUND_STAIN_TEX_W; x++) {
      const u = ((x + 0.5) / GROUND_STAIN_TEX_W) * 2 - 1;
      const s = groundStainTexel(race, variant, u, v);
      const o = (y * GROUND_STAIN_TEX_W + x) * 4;
      d[o] = (s.color >> 16) & 0xff;
      d[o + 1] = (s.color >> 8) & 0xff;
      d[o + 2] = s.color & 0xff;
      d[o + 3] = Math.round(s.alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  t = Texture.from(c);
  cache.set(key, t);
  return t;
}
