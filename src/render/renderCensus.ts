/**
 * SPARK — S196 `s196/render-perf` (F1) — **THE RENDER CENSUS, THAT CAN TELL A FULL POOL FROM A LEAK.**
 *
 * The S124 census (`__SPARK__.renderCensus`, read by `e2e/render-heap.spec.ts`) was two numbers: every display
 * object under the stage, and `renderer.texture.managedTextures.length`. S196 found both misleading:
 *
 *  1. ⛔ **`managedTextures.length` NEVER GOES DOWN.** Pixi 8 builds it as `Object.values(items)` of a
 *     `GCManagedHash`, and a texture that is destroyed or GC-unloaded is set to `null` there, not deleted (the
 *     hash is compacted only once it holds 10 000 nulls). So it counted every texture EVER uploaded: a released
 *     backdrop still counted, a transient canvas still counted. `textures` now counts the LIVE (non-null)
 *     entries; `textureSlots` keeps the old number so the two can be compared.
 *  2. ⛔ **A POOL HIGH-WATER MARK READ AS GROWTH.** Every `FxLayer` keeps the sprites it has ever needed at once
 *     (hidden when unused). The first big fight of a match therefore adds a few hundred objects that stay — the
 *     S195 F1 report (+239) was that, +216 of it on the three board fx layers. `pooled` is the sum of every fx
 *     pool on the stage and `poolCap` their combined ceiling, so the soak can assert `displayObjects − pooled`
 *     (what a missed destroy() inflates) separately from `pooled ≤ poolCap` (what a pool may legitimately do).
 *
 * DEV / e2e only (reached through `__SPARK__`, which production strips).
 */
import type { Container } from 'pixi.js';
import { FX_LAYER_MAX_SPRITES, fxPoolOf } from './fx/fxLayer.ts';

export interface RenderCensus {
  /** Every display object under the stage, the stage included (the S124 number, unchanged). */
  displayObjects: number;
  /** Sprites held by `FxLayer` pools on the stage (in use or hidden) — included in `displayObjects`. */
  pooled: number;
  /** The fx pools' combined ceiling: `FX_LAYER_MAX_SPRITES` × the number of fx layers on the stage. */
  poolCap: number;
  /** LIVE GPU-managed textures (non-null entries). −1 = the Pixi internals moved (census invalid). */
  textures: number;
  /** `managedTextures.length` as Pixi reports it — live + released slots (the pre-S196 `textures`). */
  textureSlots: number;
}

interface TextureSystemLike { managedTextures?: ArrayLike<unknown | null> }

export function renderCensus(stage: Container, textureSystem: TextureSystemLike | undefined): RenderCensus {
  let displayObjects = 0;
  let pooled = 0;
  let layers = 0;
  const walk = (c: Container): void => {
    displayObjects++;
    const pool = fxPoolOf(c);
    if (pool !== undefined) {
      pooled += pool;
      layers++;
    }
    const kids = c.children;
    if (kids !== undefined) for (const ch of kids) walk(ch as Container);
  };
  walk(stage);
  const managed = textureSystem?.managedTextures;
  let textures = -1;
  let textureSlots = -1;
  if (managed !== undefined) {
    textureSlots = managed.length;
    textures = 0;
    for (let i = 0; i < managed.length; i++) if (managed[i] !== null && managed[i] !== undefined) textures++;
  }
  return { displayObjects, pooled, poolCap: layers * FX_LAYER_MAX_SPRITES, textures, textureSlots };
}
