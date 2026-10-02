/**
 * SPARK — S194 T5: **ONE SKIN FOR EVERY CLICKABLE SURFACE ("FORGED GLASS").**
 *
 * Owner, S193: *"let's upgrade all the buttons too … make it like pop out more, make it … little
 * graphics … more interesting, more awesome looking."* S194: *"Just build it."*
 *
 * ⭐ THE S155 RULE, APPLIED TO LOOKS. `buttonFeedback.ts` made every button FEEL the same so a tuning
 * moved them all together. This module does the same for how they LOOK: every surface calls these
 * three functions, so one edit here restyles the footer, the castle panel, the card, the draft, the
 * exit modal, the title and the lobby at once — and a fourth hand-rolled look cannot drift in.
 *
 * ⛔ THE CONTRACT THAT KEEPS THE HIT-TESTS HONEST (S182: *"a source-text guard proves a line EXISTS"*).
 *   1. Every surface keeps its OWN opaque base fill at its own site. That fill is what the per-module
 *      fill-count pins (`footerBand.test.ts`, `castleStatButtons.test.ts`, `draftOverlay.test.ts`)
 *      count and pair with a hit-test, so the pins keep counting REAL surfaces.
 *   2. Everything drawn HERE is decoration laid INSIDE the rectangle the caller hands in — the
 *      rectangle that caller already hit-tests. `uiSkin.test.ts` records every shape through a stub
 *      Graphics and fails if any point (stroke half-width included) leaves the rect. So the skin can
 *      never widen a surface, never create a new one, and never make a dead pixel look clickable.
 *   3. Skin fills are translucent (alpha < 1): they tint the plate, they never replace it.
 *
 * Render-only. No `Math.random` (the sheen phase comes from the caller's clock and an integer
 * hash), never on the wire, never read by the sim.
 */

/** The narrow slice of Pixi's `Graphics` this module draws through (so tests can record it). */
export interface SkinGraphics {
  roundRect(x: number, y: number, w: number, h: number, r?: number): SkinGraphics;
  rect(x: number, y: number, w: number, h: number): SkinGraphics;
  circle(x: number, y: number, r: number): SkinGraphics;
  poly(points: number[], close?: boolean): SkinGraphics;
  moveTo(x: number, y: number): SkinGraphics;
  lineTo(x: number, y: number): SkinGraphics;
  fill(style: { color: number; alpha?: number }): SkinGraphics;
  stroke(style: { width?: number; color?: number; alpha?: number; cap?: 'round' | 'butt' | 'square'; join?: 'round' | 'miter' | 'bevel' }): SkinGraphics;
}

export type SkinState = 'rest' | 'hover' | 'press' | 'disabled' | 'active';

export interface SkinOpts {
  /** The surface's accent — the seat/race colour where the surface belongs to a seat. */
  readonly accent: number;
  readonly state: SkinState;
  /** Corner radius of the plate this skins (so the gloss follows the same corners). */
  readonly radius?: number;
  /** Render clock in ms, for the hover/active sheen. Omit for a still surface. */
  readonly t?: number;
  /** Corner studs ("rivets"). Default: on when the plate is at least 30×24. */
  readonly studs?: boolean;
}

/** The palette every surface shares. Bases are what each site fills its OWN plate with. */
export const SKIN = {
  /** Panel body (castle panel, card, modals). */
  panel: 0x0b1320,
  /** Button bodies by state. */
  base: 0x111a2a,
  baseHover: 0x18263c,
  basePress: 0x0c1422,
  baseDisabled: 0x141a22,
  /** A "go" button (affordable buy, primary action). */
  primary: 0x1a4a86,
  primaryHover: 0x2260a8,
  primaryPress: 0x153c6e,
  /** Text. */
  ink: 0xf2f6ff,
  inkDim: 0x6b7a88,
  /** Gold, for titles and the draft. */
  gold: 0xffd27a,
} as const;

/** Sheen sweep period, ms. Slow enough to read as a glint, not a flicker. */
export const SKIN_SHEEN_MS = 1600;

/** A colour lerped toward white (t>0) or black (t<0). Pure integer channel math. */
export function shade(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const to = t >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(t));
  const m = (c: number): number => Math.round(c + (to - c) * k);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/** The base fill a site should use for a plain button in `state` (so sites cannot drift). */
export function skinBase(state: SkinState, primary = false): number {
  if (state === 'disabled') return SKIN.baseDisabled;
  if (primary) return state === 'press' ? SKIN.primaryPress : state === 'hover' || state === 'active' ? SKIN.primaryHover : SKIN.primary;
  return state === 'press' ? SKIN.basePress : state === 'hover' || state === 'active' ? SKIN.baseHover : SKIN.base;
}

/**
 * The button overlay. Draw the plate's own opaque fill FIRST at the call site, then this, then the
 * site's own outline stroke and text. Everything here lies inside (x, y, w, h).
 */
export function skinButtonFx(g: SkinGraphics, x: number, y: number, w: number, h: number, o: SkinOpts): void {
  if (w < 6 || h < 6) return;
  const r = Math.max(0, Math.min(o.radius ?? 6, w / 2, h / 2));
  const ri = Math.max(0, r - 2);
  const s = o.state;

  if (s === 'disabled') {
    // Desaturate: a cool grey wash and a faint hatch. No gloss — a disabled key does not shine.
    g.roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1)).fill({ color: 0x8a94a3, alpha: 0.07 });
    const step = 9;
    for (let d = step; d < w + h; d += step) {
      // A 45° line clipped to the inset box [x+3, x+w-3] × [y+3, y+h-3].
      const x0 = x + 3, y0 = y + 3, x1 = x + w - 3, y1 = y + h - 3;
      const ax = Math.max(x0, x0 + d - (y1 - y0)), ay = Math.min(y1, y0 + d);
      const bx = Math.min(x1, x0 + d), by = Math.max(y0, y0 + d - (x1 - x0));
      if (ax >= bx) continue;
      g.moveTo(ax, ay).lineTo(bx, by);
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.035 });
    return;
  }

  const pressed = s === 'press';
  const lit = s === 'hover' || s === 'active';

  // Accent wash from the bottom: the plate picks up its seat's colour like lit glass.
  g.roundRect(x + 2, y + h * 0.45, w - 4, h * 0.55 - 2, ri).fill({ color: o.accent, alpha: lit ? 0.16 : pressed ? 0.06 : 0.09 });
  // Top gloss: a pale band over the upper ~45 %.
  if (!pressed) g.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.45 - 2), ri).fill({ color: 0xffffff, alpha: lit ? 0.11 : 0.06 });
  else g.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.3), ri).fill({ color: 0x000000, alpha: 0.18 });
  // Inner top bevel — the one-pixel highlight that makes a flat plate read as a raised key.
  if (!pressed && w > r * 2 + 4) g.moveTo(x + r + 1, y + 2.5).lineTo(x + w - r - 1, y + 2.5).stroke({ width: 1, color: 0xffffff, alpha: lit ? 0.4 : 0.22 });
  // Bottom lip shadow — gone when pressed, which is what makes the press read as a sink.
  if (!pressed && w > r * 2 + 4) g.rect(x + r, y + h - 4, w - r * 2, 2).fill({ color: 0x000000, alpha: 0.32 });
  // Accent inner glow, brighter on hover / armed.
  g.roundRect(x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 3)).stroke({ width: 2, color: o.accent, alpha: lit ? 0.42 : 0.16 });

  // Corner studs — the "little graphics" on any plate big enough to carry them.
  const studs = o.studs ?? (w >= 30 && h >= 24);
  if (studs) {
    const inset = Math.max(5, r * 0.6 + 3);
    for (const [cx, cy] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]] as const) {
      g.circle(cx, cy, 1.4).fill({ color: lit ? shade(o.accent, 0.5) : o.accent, alpha: lit ? 0.9 : 0.55 });
    }
  }

  // The SHEEN — a slanted glint sweeping across while hovered or armed.
  if (lit && o.t !== undefined) skinSheen(g, x, y, w, h, r, o.t);
}

/** A slanted highlight band at the clock's phase, clamped inside the plate's straight span. */
export function skinSheen(g: SkinGraphics, x: number, y: number, w: number, h: number, r: number, t: number): void {
  const left = x + Math.max(2, r * 0.7);
  const right = x + w - Math.max(2, r * 0.7);
  if (right - left < 8) return;
  const bw = Math.max(6, Math.min(26, w * 0.16));
  const slant = Math.min(h * 0.5, 14);
  const span = right - left + bw + slant;
  const phase = (((t % SKIN_SHEEN_MS) + SKIN_SHEEN_MS) % SKIN_SHEEN_MS) / SKIN_SHEEN_MS;
  const p = left - bw - slant + span * phase;
  const cl = (v: number): number => Math.min(right, Math.max(left, v));
  const top = y + 2, bot = y + h - 2;
  const pts = [cl(p + slant), top, cl(p + slant + bw), top, cl(p + bw), bot, cl(p), bot];
  if (pts[2]! - pts[0]! < 0.5 && pts[4]! - pts[6]! < 0.5) return;
  g.poly(pts).fill({ color: 0xffffff, alpha: 0.13 });
}

/**
 * The panel overlay: a header gloss band, a hairline inner frame and accent corner brackets. Draw the
 * panel's own opaque plate first. `header` is the header band's height (0 = none).
 */
export function skinPanelFx(g: SkinGraphics, x: number, y: number, w: number, h: number, accent: number, header = 0, radius = 8): void {
  if (w < 24 || h < 24) return;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  // Vertical depth: lighter top, accent-tinted floor.
  g.roundRect(x + 2, y + 2, w - 4, Math.min(h - 4, Math.max(18, h * 0.22)), Math.max(0, r - 2)).fill({ color: 0xffffff, alpha: 0.035 });
  // Three stacked washes, so the floor tint ramps up instead of starting at a visible seam.
  for (const k of [0.4, 0.6, 0.8]) g.roundRect(x + 2, y + h * k, w - 4, h * (1 - k) - 2, Math.max(0, r - 2)).fill({ color: accent, alpha: 0.022 });
  if (header > 0 && header < h - 8) {
    g.roundRect(x + 3, y + 3, w - 6, header - 3, Math.max(0, r - 3)).fill({ color: accent, alpha: 0.14 });
    g.moveTo(x + 10, y + header + 0.5).lineTo(x + w - 10, y + header + 0.5).stroke({ width: 1, color: accent, alpha: 0.5 });
  }
  // Hairline inner frame.
  g.roundRect(x + 4.5, y + 4.5, w - 9, h - 9, Math.max(0, r - 4)).stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
  // Accent corner brackets.
  const L = Math.min(16, w / 4, h / 4);
  const i = 3.5;
  g.moveTo(x + i, y + i + L).lineTo(x + i, y + i).lineTo(x + i + L, y + i);
  g.moveTo(x + w - i - L, y + i).lineTo(x + w - i, y + i).lineTo(x + w - i, y + i + L);
  g.moveTo(x + i, y + h - i - L).lineTo(x + i, y + h - i).lineTo(x + i + L, y + h - i);
  g.moveTo(x + w - i - L, y + h - i).lineTo(x + w - i, y + h - i).lineTo(x + w - i, y + h - i - L);
  g.stroke({ width: 2, color: shade(accent, 0.25), alpha: 0.9, cap: 'square', join: 'miter' });
}

export type SkinIconKind =
  | 'hp' | 'atk' | 'def' | 'pen' | 'mres' | 'regen' | 'speed' | 'gatherer' | 'fix' | 'scrap'
  | 'feed' | 'exit' | 'play' | 'bots' | 'globe' | 'book' | 'star' | 'check' | 'back';

/**
 * A procedural stroked glyph centred on (cx, cy), inside a box of side `size`. Strokes only (no
 * opaque fill), so an icon never becomes a surface of its own.
 */
export function skinIcon(g: SkinGraphics, kind: SkinIconKind, cx: number, cy: number, size: number, color: number, alpha = 0.95): void {
  const s = size / 2 - 1.5; // half-extent, leaving the stroke's half-width inside the box
  const st = { width: Math.max(1.25, size / 11), color, alpha, cap: 'round' as const, join: 'round' as const };
  const P = (u: number, v: number): [number, number] => [cx + u * s, cy + v * s];
  const path = (pts: ReadonlyArray<[number, number]>, close = false): void => {
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k]![0], pts[k]![1]);
    if (close) g.lineTo(pts[0]![0], pts[0]![1]);
  };
  switch (kind) {
    case 'hp': // a bold plus inside a shield-less diamond — "vitality", never a heart (owner, S188)
      path([P(-0.75, 0), P(0, -0.75), P(0.75, 0), P(0, 0.75)], true);
      path([P(-0.38, 0), P(0.38, 0)]);
      path([P(0, -0.38), P(0, 0.38)]);
      break;
    case 'atk': // a sword
      path([P(-0.7, 0.7), P(0.6, -0.6)]);
      path([P(0.6, -0.6), P(0.8, -0.8)]);
      path([P(-0.62, 0.22), P(-0.22, 0.62)]);
      path([P(-0.85, 0.85), P(-0.62, 0.62)]);
      break;
    case 'def': // a shield
      path([P(0, -0.85), P(0.7, -0.55), P(0.6, 0.2), P(0, 0.85), P(-0.6, 0.2), P(-0.7, -0.55)], true);
      path([P(0, -0.5), P(0, 0.5)]);
      break;
    case 'pen': // an arrowhead through a bar
      path([P(-0.85, 0), P(0.75, 0)]);
      path([P(0.25, -0.5), P(0.8, 0), P(0.25, 0.5)]);
      path([P(-0.15, -0.8), P(-0.15, 0.8)]);
      break;
    case 'mres': // a rune star in a ring
      path([P(0, -0.85), P(0.25, -0.25), P(0.85, 0), P(0.25, 0.25), P(0, 0.85), P(-0.25, 0.25), P(-0.85, 0), P(-0.25, -0.25)], true);
      break;
    case 'regen': // two chasing arcs (drawn as polylines)
      path([P(0.7, -0.15), P(0.55, -0.55), P(0.15, -0.8), P(-0.35, -0.7), P(-0.7, -0.35)]);
      path([P(0.7, -0.15), P(0.85, -0.5)]);
      path([P(0.7, -0.15), P(0.35, -0.2)]);
      path([P(-0.7, 0.15), P(-0.55, 0.55), P(-0.15, 0.8), P(0.35, 0.7), P(0.7, 0.35)]);
      path([P(-0.7, 0.15), P(-0.85, 0.5)]);
      path([P(-0.7, 0.15), P(-0.35, 0.2)]);
      break;
    case 'speed': // double chevrons
      path([P(-0.75, -0.6), P(-0.15, 0), P(-0.75, 0.6)]);
      path([P(0.05, -0.6), P(0.65, 0), P(0.05, 0.6)]);
      break;
    case 'gatherer': // a pick
      path([P(-0.75, 0.75), P(0.35, -0.35)]);
      path([P(-0.2, -0.75), P(0.3, -0.45), P(0.55, -0.15), P(0.8, 0.35)]);
      break;
    case 'fix': // a wrench
      path([P(-0.75, 0.75), P(0.15, -0.15)]);
      path([P(0.05, -0.5), P(0.3, -0.8), P(0.7, -0.75), P(0.45, -0.45), P(0.5, -0.3), P(0.75, -0.45), P(0.8, -0.1), P(0.5, 0.05), P(0.15, -0.15)]);
      break;
    case 'scrap': // a cross in a box
      path([P(-0.7, -0.7), P(0.7, -0.7), P(0.7, 0.7), P(-0.7, 0.7)], true);
      path([P(-0.38, -0.38), P(0.38, 0.38)]);
      path([P(0.38, -0.38), P(-0.38, 0.38)]);
      break;
    case 'feed': // a plus over a dot-row
      path([P(-0.6, 0), P(0.6, 0)]);
      path([P(0, -0.6), P(0, 0.6)]);
      break;
    case 'exit': // a door with an arrow out
      path([P(0.1, -0.85), P(-0.7, -0.85), P(-0.7, 0.85), P(0.1, 0.85)]);
      path([P(-0.25, 0), P(0.85, 0)]);
      path([P(0.5, -0.35), P(0.85, 0), P(0.5, 0.35)]);
      break;
    case 'play': // a triangle
      path([P(-0.5, -0.8), P(0.8, 0), P(-0.5, 0.8)], true);
      break;
    case 'bots': // a robot head
      path([P(-0.7, -0.35), P(0.7, -0.35), P(0.7, 0.75), P(-0.7, 0.75)], true);
      path([P(0, -0.35), P(0, -0.85)]);
      path([P(-0.35, 0.15), P(-0.2, 0.15)]);
      path([P(0.2, 0.15), P(0.35, 0.15)]);
      path([P(-0.3, 0.48), P(0.3, 0.48)]);
      break;
    case 'globe': // two linked nodes (multiplayer)
      path([P(-0.6, 0.3), P(0, -0.5), P(0.6, 0.3)]);
      path([P(-0.6, 0.3), P(0.6, 0.3)]);
      path([P(-0.8, 0.1), P(-0.4, 0.1), P(-0.4, 0.5), P(-0.8, 0.5)], true);
      path([P(0.4, 0.1), P(0.8, 0.1), P(0.8, 0.5), P(0.4, 0.5)], true);
      path([P(-0.2, -0.7), P(0.2, -0.7), P(0.2, -0.3), P(-0.2, -0.3)], true);
      break;
    case 'book': // an open book
      path([P(0, -0.55), P(-0.8, -0.75), P(-0.8, 0.6), P(0, 0.8), P(0.8, 0.6), P(0.8, -0.75)], true);
      path([P(0, -0.55), P(0, 0.8)]);
      break;
    case 'star': // a five-point star
      {
        const pts: Array<[number, number]> = [];
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 === 0 ? 0.85 : 0.38;
          pts.push(P(Math.cos(a) * rr, Math.sin(a) * rr));
        }
        path(pts, true);
      }
      break;
    case 'check':
      path([P(-0.7, 0), P(-0.2, 0.55), P(0.75, -0.55)]);
      break;
    case 'back':
      path([P(0.8, 0), P(-0.7, 0)]);
      path([P(-0.25, -0.5), P(-0.75, 0), P(-0.25, 0.5)]);
      break;
  }
  g.stroke(st);
}
