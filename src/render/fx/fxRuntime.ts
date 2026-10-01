/**
 * SPARK — S192 `s192/visuals` — **THE FX RUNTIME: TWO LAYERS, ONE BLOOM, A SHOCKWAVE POOL, TWO SWITCHES.**
 *
 * `main.ts` installs it once (`installFx`) and brackets the renderer syncs with `fxBeginFrame` /
 * `fxEndFrame`. Every rebuilt effect asks `fxActive()` first:
 *   · **false** under vitest (nothing installed), with `?fx=legacy`, or after `__SPARK__.fx.setLegacy(true)`
 *     — the renderer draws exactly what it drew before S192 (that is what keeps every existing
 *     Graphics-recording test meaningful, and it is the owner's side-by-side switch);
 *   · **true** in the game — the renderer writes sprites to `fxGround()` / `fxTop()` instead.
 *
 * ## The two layers, and why each sits where it does (`e2e/fog.spec.ts` roll-calls both)
 *   · GROUND — inside `SpawnerZoneRenderer`'s root (fogHiddenLayer index 5): under the tower buildings
 *     and every unit, over the shapes and connectors. Light pools, stains, boiling bubbles, scorch.
 *   · TOP — the LAST child of `fogHiddenLayer` (index 20): over every unit and building, still under
 *     the fog. Motes, sparks, flashes, embers. It carries the one `AdvancedBloomFilter` on HIGH.
 *   Both are under the fog, so an effect is concealed exactly when its owner renderer culls it.
 *
 * ## Quality
 *   HIGH (default) — bloom on the top layer + `ShockwaveFilter` ripples on the ground art.
 *   LOW — additive soft particles only; no filter pass at all. The Settings panel's
 *   "High-quality effects" row (`displayPrefs.ts`). A display preference: never on the wire.
 *
 * ⛔ RENDER-ONLY. Nothing here reads or writes sim state; the layouts read synced fields and ticks.
 */

import { Container, DisplacementFilter, Sprite, Texture, type Rectangle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import type { FxDisplaceSink, FxShockSink } from './emitter.ts';
import { fxLegacy, setFxDisplaceHook, setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { FxLayer } from './fxLayer.ts';

/** Ticks per second of the sim clock every layout ages against. */
const TICK_HZ = 60;
/** At most this many ground ripples at once; the rest are simply not distorted (their particles still draw). */
export const FX_MAX_SHOCKWAVES = 3;

interface ShockReq { x: number; y: number; age: number; radius: number; amplitude: number }
/** S193 (V10) — at most this many directional ripples at once (two Krakens firing on one frame). */
export const FX_MAX_DISPLACE = 2;
interface DisplaceReq { x: number; y: number; radius: number; rot: number; strength: number }
interface DisplaceSlot { sprite: Sprite; filter: DisplacementFilter }

interface Installed {
  ground: FxLayer;
  top: FxLayer;
  shade: FxLayer;
  groundArt: Container;
  screen: Rectangle;
  bloom: AdvancedBloomFilter;
  shockPool: ShockwaveFilter[];
  shockReqs: ShockReq[];
  shockApplied: number;
  /** S193 (V10) — the directional ripples: this frame's requests, the pooled filters, the applied list's shape. */
  displaceReqs: DisplaceReq[];
  displacePool: DisplaceSlot[];
  groundFilterKey: number;
}

let installed: Installed | null = null;
let highQuality = true;

function readLegacyFromUrl(): boolean {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fx') === 'legacy';
  } catch {
    return false;
  }
}

/**
 * Create both layers. `groundParent` receives the ground layer (the spawner aura's root container);
 * `topParent` receives the top layer as its LAST child; `groundArt` is the race backdrop the ripples
 * distort; `screen` pins the ripple filter's frame (so a centre is a plain global point).
 */
export function installFx(opts: { groundParent: Container; topParent: Container; groundArt: Container; screen: Rectangle; highQuality: boolean }): void {
  const ground = new FxLayer('fxGround');
  const top = new FxLayer('fxTopLight');
  /*
   * ⛔ S192 audit V-2 — THE TOP SLOT HOLDS TWO LAYERS. `fxTop` (the one child of `fogHiddenLayer` that
   * `fog.spec.ts` roll-calls at 20) is a plain Container holding, in draw order: SHADE (smoke, soot —
   * normal blend, NO filter, so it darkens what is under it) and LIGHT (motes, fire, sparks — additive,
   * the one carrying the bloom). Smoke used to sit on the light layer, and with the bloom's additive
   * composite on HIGH it ADDED brown light instead of darkening.
   */
  const shade = new FxLayer('fxTopShade');
  const topRoot = new Container();
  topRoot.label = 'fxTop';
  topRoot.eventMode = 'none';
  topRoot.addChild(shade.container);
  topRoot.addChild(top.container);
  opts.groundParent.addChild(ground.container);
  opts.topParent.addChild(topRoot);
  const bloom = new AdvancedBloomFilter({ threshold: 0.2, bloomScale: 1.6, brightness: 1, blur: 10, quality: 5 });
  /*
   * ⛔ ADDITIVE COMPOSITE. Everything on the LIGHT layer is light (smoke lives on SHADE, above), so the filtered layer must ADD onto the
   * scene exactly as its sprites do without the filter (LOW) — a 'normal' composite would darken the
   * ground under every mote by its alpha.
   */
  bloom.blendMode = 'add';
  // ⛔ AND PADDING: the blurred glow spreads past the layer's bounds, and with no padding it was CLIPPED
  // there — a hard-edged rectangle around every bright effect. 48 px covers the blur's reach.
  bloom.padding = 48;
  installed = {
    ground, top, shade, groundArt: opts.groundArt, screen: opts.screen, bloom, shockPool: [], shockReqs: [], shockApplied: 0,
    displaceReqs: [], displacePool: [], groundFilterKey: 0,
  };
  setFxHooks({ top, shade, ground, shock: shockSink });
  setFxDisplaceHook(displaceSink);
  setFxLegacyFlag(readLegacyFromUrl());
  setFxHighQualityRuntime(opts.highQuality);
}

/** The side-by-side switch: true draws every rebuilt effect the pre-S192 way. */
export function setFxLegacy(v: boolean): void {
  setFxLegacyFlag(v);
  if (v && installed !== null) { installed.ground.clear(); installed.top.clear(); installed.shade.clear(); applyShocks(installed, true); }
}
export function fxHighQuality(): boolean { return highQuality; }

export function setFxHighQualityRuntime(v: boolean): void {
  highQuality = v;
  if (installed === null) return;
  installed.top.container.filters = v ? [installed.bloom] : null;
  if (!v) applyShocks(installed, true);
}

const shockSink: FxShockSink = {
  shock(x, y, age, radius, amplitude) {
    const inst = installed;
    if (inst === null || fxLegacy() || !highQuality) return;
    if (inst.shockReqs.length >= FX_MAX_SHOCKWAVES) return;
    inst.shockReqs.push({ x, y, age, radius, amplitude });
  },
};

export function fxBeginFrame(): void {
  const inst = installed;
  if (inst === null) return;
  inst.ground.begin();
  inst.top.begin();
  inst.shade.begin();
  inst.shockReqs.length = 0;
  inst.displaceReqs.length = 0;
}

export function fxEndFrame(): void {
  const inst = installed;
  if (inst === null) return;
  inst.ground.end();
  inst.top.end();
  inst.shade.end();
  applyShocks(inst, false);
}

/**
 * Map this frame's ripple requests onto pooled `ShockwaveFilter`s on the ground art. The filter list
 * is only reassigned when its LENGTH changes, so a steady blast costs no allocation per frame, and no
 * request means no filter at all — zero cost on a quiet board.
 */
function applyShocks(inst: Installed, forceOff: boolean): void {
  const reqs = forceOff ? [] : inst.shockReqs;
  while (inst.shockPool.length < reqs.length) {
    inst.shockPool.push(new ShockwaveFilter({ amplitude: 18, wavelength: 90, speed: 500, brightness: 1.08, radius: -1 }));
  }
  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i]!;
    const f = inst.shockPool[i]!;
    // The filter works in the art's screen frame: map the board point through the layer transform.
    const p = inst.groundArt.toGlobal({ x: r.x, y: r.y });
    const scale = inst.groundArt.worldTransform.a || 1;
    f.centerX = p.x;
    f.centerY = p.y;
    const life = r.radius * scale;
    f.radius = life;
    f.wavelength = Math.max(40, life * 0.35);
    f.speed = life * 1.6;
    f.amplitude = r.amplitude * scale;
    f.time = r.age / TICK_HZ;
  }
  // ⭐ S193 (V10) — the directional ripples share the ground art's filter list with the shockwaves.
  const dreqs = forceOff ? [] : inst.displaceReqs;
  placeDisplaceSlots(inst, dreqs);
  const key = reqs.length * (FX_MAX_DISPLACE + 1) + dreqs.length;
  if (key !== inst.groundFilterKey) {
    // ⚠ The filter frame is pinned to the SCREEN, so a ripple's centre is a plain global point
    // (without it the frame would be the art's bounds and every centre would need re-basing).
    const list = [...inst.shockPool.slice(0, reqs.length), ...inst.displacePool.slice(0, dreqs.length).map((d) => d.filter)];
    inst.groundArt.filterArea = list.length === 0 ? undefined : inst.screen;
    inst.groundArt.filters = list.length === 0 ? null : list;
    inst.groundFilterKey = key;
  }
  inst.shockApplied = reqs.length;
}

/* ── S193 `s193/visuals-boss` (V10) — THE DIRECTIONAL RIPPLE (one `DisplacementFilter` per request, HIGH only).
 *
 * The map is generated once at runtime (no asset): a 128 px canvas whose red/green channels push each
 * pixel RADIALLY, one full sine across a band at 60-100 % of its radius (crest at 80 %), only inside a
 * ±60° wedge facing +x with a soft angular edge. Its border is neutral grey (128,128 = no shove), so the
 * clamp-to-edge sampling outside the sprite moves nothing. ⚠ The wedge is the Kraken sonar's cone
 * (`KRAKEN_SONAR_COS_HALF_ANGLE` 0.5 → ±60°); a later user wanting another angle adds a map.
 * The map sprite lives in the GROUND fx layer's container (board space) and is never drawn (the filter
 * clears `renderable` itself) — only its transform is read. It is not a child of `groundLayer` or
 * `fogHiddenLayer`, so the `fog.spec.ts` roll call does not move.
 */
const DISPLACE_MAP_PX = 128;
/** Where the crest sits, as a fraction of the map's radius. */
export const FX_DISPLACE_CREST = 0.8;
let displaceMap: Texture | null = null;

function displaceMapTexture(): Texture {
  if (displaceMap !== null) return displaceMap;
  const n = DISPLACE_MAP_PX;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const r0 = n / 2;
  const half = Math.PI / 3;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const dx = (px + 0.5 - r0) / r0;
      const dy = (py + 0.5 - r0) / r0;
      const r = Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dy, dx);
      let d = 0;
      if (r > 0.6 && r < 1) {
        const u = (r - 0.6) / 0.4;
        const ang = Math.min(1, Math.max(0, (half - Math.abs(th)) / 0.3));
        d = Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI) * ang * ang;
      }
      const i = (py * n + px) * 4;
      img.data[i] = Math.round(128 + 127 * d * Math.cos(th));
      img.data[i + 1] = Math.round(128 + 127 * d * Math.sin(th));
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  displaceMap = Texture.from(c);
  return displaceMap;
}

function placeDisplaceSlots(inst: Installed, reqs: readonly DisplaceReq[]): void {
  while (inst.displacePool.length < reqs.length) {
    const sprite = new Sprite(displaceMapTexture());
    sprite.anchor.set(0.5);
    sprite.eventMode = 'none';
    inst.ground.container.addChild(sprite);
    const filter = new DisplacementFilter({ sprite, scale: 0 });
    inst.displacePool.push({ sprite, filter });
  }
  const scale = inst.groundArt.worldTransform.a || 1;
  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i]!;
    const slot = inst.displacePool[i]!;
    const size = (2 * r.radius) / FX_DISPLACE_CREST;
    slot.sprite.position.set(r.x, r.y);
    slot.sprite.width = size;
    slot.sprite.height = size;
    slot.sprite.rotation = r.rot;
    // (map − 0.5) peaks at 0.5, so the filter scale is twice the wanted shove, in screen px.
    slot.filter.scale.x = 2 * r.strength * scale;
    slot.filter.scale.y = 2 * r.strength * scale;
  }
}

const displaceSink: FxDisplaceSink = {
  ripple(x, y, radius, rot, strength) {
    const inst = installed;
    if (inst === null || fxLegacy() || !highQuality) return;
    if (radius <= 1 || strength <= 0) return;
    if (inst.displaceReqs.length >= FX_MAX_DISPLACE) return;
    inst.displaceReqs.push({ x, y, radius, rot, strength });
  },
};

/** DEV probe (S193): the directional ripples applied last frame. */
export function fxDisplaceCount(): number {
  return installed === null ? 0 : installed.groundFilterKey % (FX_MAX_DISPLACE + 1);
}

/** Hide everything (title return). */
export function fxClear(): void {
  if (installed === null) return;
  installed.ground.clear();
  installed.top.clear();
  installed.shade.clear();
  installed.shockReqs.length = 0;
  installed.displaceReqs.length = 0;
  applyShocks(installed, true);
}

/** DEV probe: sprites drawn last frame on each layer, the active ripples, and the switches. */
export function fxStats(): { ground: number; top: number; shocks: number; legacy: boolean; highQuality: boolean } {
  return {
    ground: installed?.ground.lastCount ?? 0,
    top: (installed?.top.lastCount ?? 0) + (installed?.shade.lastCount ?? 0),
    shocks: installed?.shockApplied ?? 0,
    legacy: fxLegacy(),
    highQuality,
  };
}
