/**
 * SPARK — S192 `s192/visuals` — **ONE POOLED-SPRITE LAYER.** The display half of the fx substrate.
 *
 * A layout (`sapFx.ts`, `auraFx.ts`, …) emits sprites into an `FxSink`; this is the sink that turns
 * them into Pixi sprites. Sprites are POOLED: frame N reuses frame N−1's sprites in order and hides
 * the tail, so a 120-mote siphon allocates nothing after its first frame. Nothing about a particle is
 * remembered here — only which sprite objects exist.
 *
 * ⚠ Many writers share one layer in a frame (the spawner aura AND the boss auras both write the ground
 * layer), so the reset is per FRAME, not per writer: `fxRuntime.fxBeginFrame` resets every layer once
 * before the renderer syncs, `fxEndFrame` hides what went unused.
 */

import { Container, Sprite } from 'pixi.js';
import type { FxBlend, FxSink, FxTex } from './emitter.ts';
import { FX_TEX_SIZE, softTexture } from './softTextures.ts';

/** Hard ceiling on live sprites per layer. A pathological board degrades to "fewer motes", never to a stall. */
export const FX_LAYER_MAX_SPRITES = 2400;

/*
 * ⭐ S196 render-perf (F1) — **THE POOL IS A HIGH-WATER MARK, AND THE RENDER CENSUS MUST BE ABLE TO SAY SO.**
 *
 * A pool sprite is created the first frame a layer needs that many at once and is then kept (hidden) for
 * good — it never shrinks, and `clear()` only hides. So the first big fight of a match grows the stage by a
 * few hundred display objects that stay. The S195 soak read exactly that as a leak (F1: 1778 → 2017, +239,
 * of which the three board fx layers were +216 in the S196 attribution run). It is bounded — at most
 * `FX_LAYER_MAX_SPRITES` per layer — and reused, so it is not one.
 *
 * `fxPoolOf` lets the census (`render/renderCensus.ts`) find a layer by its container while it walks the
 * stage, and report pooled sprites apart from everything else. A WeakMap: a layer that is dropped is
 * forgotten with it.
 */
const POOL_BY_CONTAINER = new WeakMap<Container, FxLayer>();

/** The pooled-sprite count of the `FxLayer` whose container this is, or `undefined` if it is not one. */
export function fxPoolOf(container: Container): number | undefined {
  return POOL_BY_CONTAINER.get(container)?.poolSize;
}

export class FxLayer implements FxSink {
  readonly container: Container;
  private readonly pool: Sprite[] = [];
  private used = 0;
  /** Sprites drawn last frame — read by the dev perf probe. */
  lastCount = 0;

  constructor(label: string) {
    this.container = new Container();
    this.container.label = label;
    this.container.eventMode = 'none';
    POOL_BY_CONTAINER.set(this.container, this);
  }

  /** ⭐ S196 (F1) — sprites this layer has ever needed at once (its high-water mark, ≤ `FX_LAYER_MAX_SPRITES`). */
  get poolSize(): number {
    return this.pool.length;
  }

  begin(): void {
    this.used = 0;
  }

  emit(tex: FxTex, x: number, y: number, w: number, h: number, rot: number, alpha: number, tint: number, blend: FxBlend): void {
    if (alpha <= 0.004 || w <= 0 || h <= 0) return;
    if (this.used >= FX_LAYER_MAX_SPRITES) return;
    let sp = this.pool[this.used];
    if (sp === undefined) {
      sp = new Sprite(softTexture(tex));
      sp.anchor.set(0.5);
      sp.eventMode = 'none';
      this.pool.push(sp);
      this.container.addChild(sp);
    } else {
      const want = softTexture(tex);
      if (sp.texture !== want) sp.texture = want;
    }
    this.used++;
    const size = FX_TEX_SIZE[tex];
    sp.visible = true;
    sp.position.set(x, y);
    sp.scale.set(w / size, h / size);
    sp.rotation = rot;
    sp.alpha = alpha > 1 ? 1 : alpha;
    sp.tint = tint;
    if (sp.blendMode !== blend) sp.blendMode = blend;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) {
      const sp = this.pool[i]!;
      if (!sp.visible) break; // everything past the first hidden one was hidden on an earlier frame
      sp.visible = false;
    }
    this.lastCount = this.used;
  }

  /** Hide everything at once (title return, match teardown). */
  clear(): void {
    this.used = 0;
    for (const sp of this.pool) sp.visible = false;
    this.lastCount = 0;
  }
}
