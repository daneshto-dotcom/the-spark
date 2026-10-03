/**
 * SPARK — S194 R194-32: THE SCREEN CHROME every menu screen shares with the home page — a glowing
 * gradient title and the living backdrop — in that screen's OWN accent.
 *
 * Owner, S194, after seeing the home and arcade pages live: *"the Codex, the versus Bots lobby and the
 * Multiplayer lobby still has the shitty black background. Doesn't have a new title that glows … make
 * Codex, versus Bots and Multiplayer Lobby also look unique and different. But with the same obviously
 * background like Sparks flying around … in a circle around the title."*
 *
 * ⭐ REUSED, NOT COPIED: the backdrop is `titleBackdrop.ts` (the lazy chunk the home and arcade pages
 * already load); this module only hosts it. ⛔ IT PAUSES WHEN ITS SCREEN IS HIDDEN — `setShown(false)`
 * removes its ticker listener, so a closed screen costs nothing per frame (the S194 brief: no ticker leak).
 *
 * Render-only; `eventMode: 'none'` throughout, so no hit-test anywhere moves.
 */
import { Container, FillGradient, TextStyle, type TextStyleOptions } from 'pixi.js';
import type { TitleBackdrop, TitleBackdropOpts } from './titleBackdrop.ts';

/** Each screen's accent — matching its home-screen button colour (R194-32). */
export interface ScreenAccent {
  /** Title gradient, top → bottom. */
  readonly stops: readonly [number, number, number];
  /** The title's glow and the dark rim under it. */
  readonly glow: number;
  readonly rim: number;
  /** The backdrop's halo, ring and ember palette. */
  readonly backdrop: TitleBackdropOpts;
}

export const ACCENT_CODEX: ScreenAccent = {
  stops: [0xfff3d0, 0xf3d27a, 0xc8901e],
  glow: 0xffb020,
  rim: 0x1e1400,
  backdrop: { haloTint: 0xc8901e, ringTint: 0xffe2a0, emberColors: [0xffd60a, 0xf3e2b8, 0xffb020, 0xfff3d0] },
};
export const ACCENT_BOTS: ScreenAccent = {
  stops: [0xf2f5fa, 0xa9b7c9, 0xff4a4a],
  glow: 0xff3030,
  rim: 0x14080a,
  backdrop: { haloTint: 0xa02020, ringTint: 0x9fb0c4, emberColors: [0xff4a4a, 0xc8d2e0, 0xff8a5a, 0x8fa2c4] },
};
export const ACCENT_LOBBY: ScreenAccent = {
  stops: [0xe8fbff, 0x3bd7ff, 0xff3b6b],
  glow: 0x3bd7ff,
  rim: 0x081420,
  backdrop: { haloTint: 0x1f7fbf, ringTint: 0xff3b6b, emberColors: [0x3bd7ff, 0xff3b6b, 0xbff2ff, 0xff9ab4] },
};

/**
 * The glowing gradient title style (SPARK / ARCADE treatment) in `a`'s colours. Headless (vitest) has
 * no canvas to build a gradient, so it falls back to the middle stop.
 */
export function glowTitleStyle(a: ScreenAccent, fontSize: number, letterSpacing: number): TextStyle {
  const fill: TextStyleOptions['fill'] = typeof document === 'undefined'
    ? a.stops[1]
    : new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
      colorStops: [{ offset: 0, color: a.stops[0] }, { offset: 0.55, color: a.stops[1] }, { offset: 1, color: a.stops[2] }],
    });
  return new TextStyle({
    fontFamily: 'monospace',
    fontSize,
    fontWeight: 'bold',
    letterSpacing,
    fill,
    stroke: { color: a.rim, width: Math.max(3, Math.round(fontSize / 12)) },
    dropShadow: { color: a.glow, alpha: 0.8, blur: Math.round(fontSize / 3), distance: 0, angle: 0 },
    padding: Math.round(fontSize * 0.6),
  });
}

/**
 * Hosts the shared backdrop inside a screen's container at `index` (above its dimming plate, below
 * every control). Loaded lazily on the first `setShown(true)`; animates only while shown.
 */
export class LazyScreenBackdrop {
  private backdrop: TitleBackdrop | null = null;
  private loading = false;
  private shown = false;

  constructor(
    private readonly host: Container,
    private readonly index: number,
    private readonly opts: TitleBackdropOpts,
  ) {}

  /** Idempotent — safe to call every frame (the lobby's `setVisible` is). */
  setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.backdrop?.setRunning(on);
    if (on && this.backdrop === null && !this.loading) this.load();
  }

  isRunning(): boolean {
    return this.shown && this.backdrop !== null;
  }

  private load(): void {
    this.loading = true;
    import('./titleBackdrop.ts')
      .then((m) => {
        this.backdrop = new m.TitleBackdrop(this.opts);
        this.host.addChildAt(this.backdrop.container, Math.min(this.index, this.host.children.length));
        this.backdrop.setRunning(this.shown);
      })
      // A failed chunk is NOT retried (no per-frame import storm); the plain screen is complete without it.
      .catch(() => {});
  }
}
