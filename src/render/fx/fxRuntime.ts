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

import { Container, type Rectangle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import type { FxShockSink } from './emitter.ts';
import { fxLegacy, setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { FxLayer } from './fxLayer.ts';

/** Ticks per second of the sim clock every layout ages against. */
const TICK_HZ = 60;
/** At most this many ground ripples at once; the rest are simply not distorted (their particles still draw). */
export const FX_MAX_SHOCKWAVES = 3;

interface ShockReq { x: number; y: number; age: number; radius: number; amplitude: number }

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
  installed = { ground, top, shade, groundArt: opts.groundArt, screen: opts.screen, bloom, shockPool: [], shockReqs: [], shockApplied: 0 };
  setFxHooks({ top, shade, ground, shock: shockSink });
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
  if (reqs.length !== inst.shockApplied) {
    // ⚠ The filter frame is pinned to the SCREEN, so a ripple's centre is a plain global point
    // (without it the frame would be the art's bounds and every centre would need re-basing).
    inst.groundArt.filterArea = reqs.length === 0 ? undefined : inst.screen;
    inst.groundArt.filters = reqs.length === 0 ? null : inst.shockPool.slice(0, reqs.length);
    inst.shockApplied = reqs.length;
  }
}

/** Hide everything (title return). */
export function fxClear(): void {
  if (installed === null) return;
  installed.ground.clear();
  installed.top.clear();
  installed.shade.clear();
  installed.shockReqs.length = 0;
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
