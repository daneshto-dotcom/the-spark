/**
 * SPARK — S192 `s192/visuals` — **THE FX SWITCHBOARD, AND NOTHING ELSE.**
 *
 * Split out of `fxRuntime.ts` so a renderer (and its unit test) can ask "are the new effects on?" and
 * get a sink without importing Pixi's filter classes. Under vitest nothing is ever installed, so
 * `fxActive()` is false and every renderer draws its pre-S192 legacy path — which keeps the existing
 * Graphics-recording tests meaningful.
 */

import { NULL_SHOCK, NULL_SINK, type FxShockSink, type FxSink } from './emitter.ts';

export interface FxHooks {
  readonly top: FxSink;
  /** Smoke and soot: normal blend, never bloomed, drawn under `top`. */
  readonly shade: FxSink;
  readonly ground: FxSink;
  readonly shock: FxShockSink;
}

let hooks: FxHooks | null = null;
let legacy = false;

/** `fxRuntime.installFx` registers the live layers here. */
export function setFxHooks(h: FxHooks | null): void { hooks = h; }

/** Rebuilt effects draw iff this is true: installed (a real game, not a test) and not in legacy mode. */
export function fxActive(): boolean { return hooks !== null && !legacy; }
export function fxLegacy(): boolean { return legacy; }
export function setFxLegacyFlag(v: boolean): void { legacy = v; }

/** The layer over every unit and building (bloom on HIGH). A no-op sink when inactive. */
export function fxTop(): FxSink { return hooks !== null && !legacy ? hooks.top : NULL_SINK; }
/** The non-bloomed shade layer over units (smoke darkens; S192 audit V-2). A no-op sink when inactive. */
export function fxTopShade(): FxSink { return hooks !== null && !legacy ? hooks.shade : NULL_SINK; }
/** The layer on the ground, under buildings and units. A no-op sink when inactive. */
export function fxGround(): FxSink { return hooks !== null && !legacy ? hooks.ground : NULL_SINK; }
/** Ground ripples (HIGH only). A no-op sink when inactive. */
export function fxShock(): FxShockSink { return hooks !== null && !legacy ? hooks.shock : NULL_SHOCK; }
