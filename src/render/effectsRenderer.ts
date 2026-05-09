/**
 * SPARK — visual effect renderer.
 * Drains world.effects each frame and animates short-lived overlays:
 *
 *   BOND_COMMIT  → expanding ring from the bonded primitive (~0.4s pop)
 *   SEVER_ERASE  → ghost circle that shrinks + fades at the deleted
 *                  primitive's last position (~0.5s erase)
 *
 * One Graphics for everything (clear + redraw per frame). Active list is
 * bounded by EFFECT_LIFETIME_TICKS — worst-case dozens of entries during
 * a fast build. The list is held by the renderer, not by the world, so
 * save/load doesn't need to know about it.
 *
 * Ageing uses world.tick (NOT wall-clock): if the simulation pauses
 * (POSTGAME, tab switch), effects pause too — same as the spark physics.
 */

import { Application, Graphics } from 'pixi.js';
import {
  EFFECT_LIFETIME_TICKS,
  MAX_ACTIVE_EFFECTS,
  type GameEffect,
} from '../game/effects.ts';
import type { World } from '../state/world.ts';

interface ActiveEffect {
  readonly effect: GameEffect;
  readonly bornTick: number;
}

const COMMIT_DURATION_TICKS = 24; // 0.4s @ 60Hz
const ERASE_DURATION_TICKS = 30; // 0.5s @ 60Hz

export class EffectsRenderer {
  private readonly graphics: Graphics;
  private readonly active: ActiveEffect[] = [];

  constructor(app: Application) {
    this.graphics = new Graphics();
    app.stage.addChild(this.graphics);
  }

  /** Drain world.effects, age active list, redraw. Idempotent per frame. */
  sync(world: World): void {
    // Drain new effects.
    if (world.effects.length > 0) {
      for (const e of world.effects) {
        this.active.push({ effect: e, bornTick: e.tick });
      }
      world.effects.length = 0;
    }

    // S6 P2: hard count cap. Lifetime ageing handles steady-state, but a
    // single-frame burst (spam-place + spam-sever) could exceed budget
    // before the next cull. Drop oldest first when over cap.
    if (this.active.length > MAX_ACTIVE_EFFECTS) {
      this.active.splice(0, this.active.length - MAX_ACTIVE_EFFECTS);
    }

    // Age + cull.
    const g = this.graphics;
    g.clear();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const age = world.tick - a.bornTick;
      const lifetime =
        a.effect.kind === 'BOND_COMMIT' ? COMMIT_DURATION_TICKS : ERASE_DURATION_TICKS;
      if (age < 0 || age > Math.max(lifetime, EFFECT_LIFETIME_TICKS)) {
        // Past lifetime or rewound below birth (softReset/load) — drop.
        this.active.splice(i, 1);
        continue;
      }
      const t = Math.min(1, age / lifetime);
      this.draw(a.effect, t);
    }
  }

  private draw(effect: GameEffect, t: number): void {
    const g = this.graphics;
    if (effect.kind === 'BOND_COMMIT') {
      drawBondCommit(g, effect, t);
    } else {
      // SEVER_ERASE: shrinks + fades, with a faint outward shockwave.
      const eased = t * t; // quadratic ease-in
      const ghostR = effect.radius * (1 - 0.4 * eased);
      const ghostAlpha = (1 - eased) * 0.7;
      g.circle(effect.pos.x, effect.pos.y, ghostR).fill({
        color: effect.color,
        alpha: ghostAlpha,
      });
      const shockR = effect.radius + eased * effect.radius * 3.5;
      const shockAlpha = (1 - eased) * 0.4;
      g.circle(effect.pos.x, effect.pos.y, shockR).stroke({
        width: 1,
        color: effect.color,
        alpha: shockAlpha,
      });
    }
  }

  /** For tests + stats overlay. */
  get activeCount(): number {
    return this.active.length;
  }

  destroy(): void {
    this.graphics.destroy();
    this.active.length = 0;
  }
}

/**
 * S6 P3: per-combo placeholder flair. Each magic combo gets a distinct
 * silhouette so players can tell Filament from Cable from Diamond at a
 * glance. Generic 24/36 combos use the default ring pop. Full Phase-2
 * effects (audio cues, particle systems) land later — these are
 * silhouette-only placeholders that read in 0.4s.
 *
 * All flair eases out and dies at the same lifetime as the default ring,
 * so the active-list ageing in `sync` doesn't need to know which is which.
 */
function drawBondCommit(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  t: number,
): void {
  const eased = 1 - (1 - t) * (1 - t); // quadratic ease-out
  const alpha = 1 - eased;
  const x = effect.pos.x;
  const y = effect.pos.y;

  // Inner flash — same on every combo. Anchors visual continuity.
  if (t < 0.3) {
    const flashAlpha = (0.3 - t) / 0.3;
    g.circle(x, y, effect.radius * 1.4).fill({
      color: effect.color,
      alpha: 0.45 * flashAlpha,
    });
  }

  switch (effect.visualEffectId) {
    case 'fx.filament':
      drawFilament(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.cable':
      drawCable(g, effect, eased, alpha);
      break;
    case 'fx.bracket':
      drawBracket(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.diamond':
      drawDiamond(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.wheel':
      drawWheel(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.star':
      drawStar(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.orbital':
      drawOrbital(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.lattice':
      drawLattice(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.capsule':
      drawCapsule(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.vortex':
      drawVortex(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    case 'fx.whip':
      drawWhip(g, effect, eased, alpha);
      break;
    case 'fx.warped':
      drawWarped(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
    default:
      drawDefaultRing(g, x, y, effect.radius, effect.color, eased, alpha);
      break;
  }
}

function drawDefaultRing(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  g.circle(x, y, r).stroke({
    width: 2 - eased,
    color,
    alpha: 0.85 * alpha,
  });
}

/** Filament (Dot→Line, HIGH): tight white-hot starburst — 8 radial spikes. */
function drawFilament(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const inner = radius * 0.6;
  const outer = radius + eased * radius * 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    g.moveTo(x + cosA * inner, y + sinA * inner)
      .lineTo(x + cosA * outer, y + sinA * outer)
      .stroke({ width: 1.5, color, alpha: 0.9 * alpha });
  }
  // Bright core ring.
  g.circle(x, y, radius * 1.1).stroke({
    width: 1.5, color, alpha: 0.85 * alpha,
  });
}

/** Cable (Line→Line, MID): twin parallel lines along the bond axis. */
function drawCable(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  eased: number, alpha: number,
): void {
  const ax = effect.pos.x, ay = effect.pos.y;
  const bx = effect.otherPos.x, by = effect.otherPos.y;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  // Perpendicular offset, opening outward as effect ages.
  const perp = (effect.radius * 0.6) * (1 + eased * 1.5);
  const nx = -dy / len, ny = dx / len;
  for (const sign of [-1, 1]) {
    g.moveTo(ax + nx * perp * sign, ay + ny * perp * sign)
      .lineTo(bx + nx * perp * sign, by + ny * perp * sign)
      .stroke({ width: 1.5, color: effect.color, alpha: 0.85 * alpha });
  }
}

/** Bracket (Line→Triangle, HIGH): angular triangle outline pulse. */
function drawBracket(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  // Equilateral triangle pointing up.
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (-Math.PI / 2) + (i / 3) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  g.moveTo(pts[0][0], pts[0][1])
    .lineTo(pts[1][0], pts[1][1])
    .lineTo(pts[2][0], pts[2][1])
    .lineTo(pts[0][0], pts[0][1])
    .stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
}

/** Diamond (Triangle→Triangle, HIGH): rotated square (45° diamond). */
function drawDiamond(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  g.moveTo(x, y - r)
    .lineTo(x + r, y)
    .lineTo(x, y + r)
    .lineTo(x - r, y)
    .lineTo(x, y - r)
    .stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Wheel (Triangle→Circle, MID): expanding ring with rotating spokes. */
function drawWheel(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.2;
  g.circle(x, y, r).stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
  // 4 spokes that rotate as the effect ages.
  const rotation = eased * Math.PI * 0.5;
  for (let i = 0; i < 4; i++) {
    const a = rotation + (i / 4) * Math.PI * 2;
    g.moveTo(x, y)
      .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      .stroke({ width: 1, color, alpha: 0.7 * alpha });
  }
}

/** Star (Circle→Triangle, MID): 5-point star burst. */
function drawStar(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const outer = radius + eased * radius * 2.5;
  const inner = outer * 0.45;
  // 5-point star = 10 alternating outer/inner verts.
  let first = true;
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-Math.PI / 2) + (i / 10) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Orbital (Circle→Circle, LOW): two concentric expanding rings. */
function drawOrbital(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r1 = radius + eased * radius * 2.5;
  const r2 = radius * 0.6 + eased * radius * 1.7;
  g.circle(x, y, r1).stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
  g.circle(x, y, r2).stroke({ width: 1.5, color, alpha: 0.6 * alpha });
}

/** Lattice (Square→Square, HIGH): cross-hatch grid. */
function drawLattice(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2;
  // Outer square outline.
  g.rect(x - r, y - r, r * 2, r * 2).stroke({
    width: 2 - eased, color, alpha: 0.85 * alpha,
  });
  // Cross-hatch at +/- r/2.
  g.moveTo(x - r, y).lineTo(x + r, y).stroke({ width: 1, color, alpha: 0.6 * alpha });
  g.moveTo(x, y - r).lineTo(x, y + r).stroke({ width: 1, color, alpha: 0.6 * alpha });
}

/** Capsule (Square→Circle, MID): rounded rect outline. */
function drawCapsule(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const w = (radius + eased * radius * 2) * 1.6;
  const h = radius + eased * radius * 1.5;
  g.roundRect(x - w / 2, y - h / 2, w, h, h / 2).stroke({
    width: 2 - eased, color, alpha: 0.85 * alpha,
  });
}

/** Vortex (Dot→Spiral, HIGH): outward spiral curve. */
function drawVortex(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const turns = 1.5;
  const steps = 32;
  const maxR = radius + eased * radius * 3;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = t * maxR;
    const a = t * turns * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Whip (Spiral→Line, LOW): wave squiggle along the bond. */
function drawWhip(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  eased: number, alpha: number,
): void {
  const ax = effect.pos.x, ay = effect.pos.y;
  const bx = effect.otherPos.x, by = effect.otherPos.y;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const tx = dx / len, ty = dy / len;
  const nx = -ty, ny = tx;
  const amp = effect.radius * 0.8 * (1 - eased * 0.6);
  const cycles = 3;
  const steps = 24;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dist = t * len;
    const wave = Math.sin(t * cycles * Math.PI * 2) * amp;
    const px = ax + tx * dist + nx * wave;
    const py = ay + ty * dist + ny * wave;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color: effect.color, alpha: 0.9 * alpha });
}

/** Warped (Triangle→Spiral, LOW): wobbly distorted ring. */
function drawWarped(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const baseR = radius + eased * radius * 2.5;
  const steps = 40;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // Wobble on a 3-fold pattern that grows with age.
    const r = baseR + Math.sin(a * 3 + eased * 4) * radius * 0.4;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}
