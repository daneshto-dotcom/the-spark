/**
 * SPARK — S194 T5: the skin for the CONTAINER buttons (title, lobby, exit modal, bot setup) — the ones
 * `buttonFeedback.ts` gives a hit rect, a hover tint/scale and a press squash.
 *
 * Those plates are drawn ONCE, so the still glass goes into the plate at build time
 * (`skinStaticPlate`), and the moving part — the sheen — lives on its own small Graphics that only
 * redraws while the pointer is over the button (`attachHoverSheen`). Both are drawn strictly inside the
 * same rectangle the caller passes as `attachButtonFeedback`'s `hit` (that rect is what Pixi
 * hit-tests, since an explicit `hitArea` replaces child bounds), so nothing here moves a click target.
 *
 * Render-only; the sheen clock is the Pixi ticker's, never the sim's.
 */
import { Container, Graphics, Ticker } from 'pixi.js';
import { skinButtonFx, skinSheen, type SkinState } from './uiSkin.ts';
import type { HitRect } from './buttonFeedback.ts';

/** The still glass for a plate drawn once. Call after the plate's own fill, before its stroke. */
export function skinStaticPlate(bg: Graphics, r: HitRect, accent: number, radius: number, state: SkinState = 'rest'): void {
  skinButtonFx(bg, r.x, r.y, r.w, r.h, { accent, state, radius });
}

/** Which rect each sheen was given — read by the census REACH test, never by the game. */
const SHEEN_RECTS = new WeakMap<Container, HitRect>();
export function sheenRectOf(c: Container): HitRect | undefined {
  return SHEEN_RECTS.get(c);
}

/**
 * A sheen that sweeps across `r` while the pointer is over `c`. Adds one non-interactive Graphics to
 * `c` (above everything already in it — call after the label is added if it should glint over it,
 * before if under). Returns it so a caller can re-order it.
 */
export function attachHoverSheen(c: Container, r: HitRect, radius: number, enabled: () => boolean = () => true): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  g.label = 'sheen';
  c.addChild(g);
  SHEEN_RECTS.set(c, r);
  let t0 = 0;
  const stop = (): void => {
    Ticker.shared.remove(tick);
    g.clear();
  };
  // A button hidden under the pointer (its screen closed on the click) gets no `pointerout`; stop then.
  const shown = (): boolean => {
    for (let n: Container | null = c; n !== null; n = n.parent) if (!n.visible) return false;
    return true;
  };
  function tick(tk: Ticker): void {
    if (!shown()) {
      stop();
      return;
    }
    t0 += tk.deltaMS;
    g.clear();
    skinSheen(g, r.x, r.y, r.w, r.h, radius, t0);
  }
  c.on('pointerover', () => {
    if (!enabled()) return; // an inert chip does not advertise a click
    t0 = 0;
    Ticker.shared.remove(tick);
    Ticker.shared.add(tick);
  });
  c.on('pointerout', stop);
  c.on('destroyed', stop);
  return g;
}

/**
 * ⭐ S194 (owner: *"make sure that's implemented across the board"*) — the hover half for a chip that is
 * NOT an `attachButtonFeedback` button (its click goes through its own `pointertap`, its hit is its
 * children's bounds): the sweeping sheen inside `r`, plus a brightening tint on `plate` while hovered.
 * Changes nothing about what is clicked. `enabled` (default always) keeps a refused/inert chip from
 * advertising a click it will not take.
 */
export function attachChipHover(
  c: Container,
  plate: { tint: number } | null,
  r: HitRect,
  radius: number,
  enabled: () => boolean = () => true,
): Graphics {
  const sheen = attachHoverSheen(c, r, radius, enabled);
  c.on('pointerover', () => {
    if (enabled() && plate !== null) plate.tint = CHIP_HOVER_TINT;
  });
  c.on('pointerout', () => {
    if (plate !== null) plate.tint = 0xffffff;
  });
  return sheen;
}

/** The chip hover brightening — the same value `buttonFeedback` uses for its plates. */
export const CHIP_HOVER_TINT = 0xbfd4ff;
