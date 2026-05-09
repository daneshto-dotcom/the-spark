/**
 * SPARK — shape texture factory.
 * Spec § IV LOCKED: 6 distinct shape geometries (Dot, Line, Triangle,
 * Square, Circle, Spiral). Both free-spark and placed-primitive renderers
 * consume the same texture set so a Triangle in the spawner zone reads as
 * the same Triangle once placed in a structure.
 *
 * Textures are drawn white at full intensity; tinting happens at the
 * sprite level (free = colorless white-ish, placed = player color).
 */

import { Application, Graphics, type Texture } from 'pixi.js';
import { SparkType } from '../constants.ts';

const TEXTURE_RESOLUTION = 2;

export type ShapeTextures = Record<SparkType, Texture>;

export function makeShapeTextures(app: Application): ShapeTextures {
  const textures = {
    [SparkType.Dot]: makeShapeTexture(app, drawDot),
    [SparkType.Line]: makeShapeTexture(app, drawLine),
    [SparkType.Triangle]: makeShapeTexture(app, drawTriangle),
    [SparkType.Square]: makeShapeTexture(app, drawSquare),
    [SparkType.Circle]: makeShapeTexture(app, drawCircle),
    [SparkType.Spiral]: makeShapeTexture(app, drawSpiral),
  } satisfies ShapeTextures;
  return textures;
}

export function destroyShapeTextures(textures: ShapeTextures): void {
  for (const t of Object.values(textures)) t.destroy(true);
}

// Each draw function targets a 32×32 logical canvas, centered at (0,0).
// The renderer.generateTexture call captures bounds automatically.

function drawDot(g: Graphics): void {
  // 4 px radius solid disc — the high-mobility lightweight connector.
  g.circle(0, 0, 4).fill(0xffffff);
}

function drawLine(g: Graphics): void {
  // 24 px × 3 px rod — directional.
  g.rect(-12, -1.5, 24, 3).fill(0xffffff);
  // Rounded ends so it reads as a glow rod, not a brick.
  g.circle(-12, 0, 1.5).fill(0xffffff);
  g.circle(12, 0, 1.5).fill(0xffffff);
}

function drawTriangle(g: Graphics): void {
  // Equilateral, 16 px side, point-up.
  const s = 16;
  const h = (s * Math.sqrt(3)) / 2; // ≈ 13.86
  g.moveTo(0, -h * (2 / 3))
    .lineTo(-s / 2, h / 3)
    .lineTo(s / 2, h / 3)
    .closePath()
    .fill(0xffffff);
}

function drawSquare(g: Graphics): void {
  // Filled square, 14 px side.
  g.rect(-7, -7, 14, 14).fill(0xffffff);
}

function drawCircle(g: Graphics): void {
  // Hollow ring, 18 px diameter (9 px radius), 2 px stroke.
  g.circle(0, 0, 9).stroke({ width: 2, color: 0xffffff });
}

function drawSpiral(g: Graphics): void {
  // Archimedean spiral, 1.5 turns, 10 px max radius. Drawn as a polyline.
  const steps = 64;
  const turns = 1.5;
  const maxR = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = t * maxR;
    const a = t * turns * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) {
      g.moveTo(x, y);
    } else {
      g.lineTo(x, y);
    }
  }
  g.stroke({ width: 2, color: 0xffffff });
}

function makeShapeTexture(
  app: Application,
  draw: (g: Graphics) => void,
): Texture {
  const g = new Graphics();
  draw(g);
  const tex = app.renderer.generateTexture({
    target: g,
    resolution: TEXTURE_RESOLUTION,
  });
  g.destroy();
  return tex;
}
