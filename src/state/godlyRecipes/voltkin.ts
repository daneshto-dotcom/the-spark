/**
 * SPARK — Voltkin recipe (S22 P4).
 *
 * Detects: a `lightning-bolt-like` structure (elongated convex hull, ≥3 prims,
 * aspect ratio ≥2.5) adjacent (<200 px centroid distance) to a `tv-frame-like`
 * structure (squarish hull, ≥4 prims, aspect ratio in [1.0, 1.8]). Triggerer
 * is the player whose placerColor dominates the lightning component.
 *
 * v1 detection is geometric heuristic (PRIME-AUDIT Δ1 Plan B fallback —
 * silhouettes/shared.ts is bond-rendering only with no pattern-match API).
 * S24+ "Voltkin polish v1.1" may refine via explicit primitive tagging.
 *
 * Side-effect: registers VOLTKIN_RECIPE in the godlyRecipes registry on module
 * import. main.ts imports this module to wire it up.
 */

import type { World } from '../world.ts';
import type { GodlyRecipe, RecipePredicate } from './types.ts';
import type { PrimitiveId } from '../../types.ts';
import { registerRecipe } from './index.ts';

const LIGHTNING_MIN_PRIMS = 3;
const LIGHTNING_MIN_ASPECT = 2.5;
const TV_MIN_PRIMS = 4;
const TV_MIN_ASPECT = 1.0;
const TV_MAX_ASPECT = 1.8;
const ADJACENCY_RADIUS_PX = 200;

interface ComponentInfo {
  readonly primitiveIds: ReadonlyArray<PrimitiveId>;
  readonly centroid: { readonly x: number; readonly y: number };
  readonly aspect: number;
  readonly size: number;
  /** Most-common placerColor across the component's prims (Voltkin triggerer derivation). */
  readonly ownerColor: number;
}

/**
 * Walk all primitives + bonds, return connected components with hull
 * + centroid + dominant placerColor. Pure — does not mutate world.
 * Exported for vitest pixel-shape regression coverage.
 */
export function findAllComponents(world: World): ComponentInfo[] {
  const parent = new Map<PrimitiveId, PrimitiveId>();
  for (const id of world.primitives.keys()) parent.set(id, id);
  const find = (id: PrimitiveId): PrimitiveId => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r) as PrimitiveId;
    // path compression
    let cur = id;
    while (parent.get(cur) !== r) {
      const next = parent.get(cur) as PrimitiveId;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: PrimitiveId, b: PrimitiveId): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const bond of world.bonds.values()) union(bond.aId, bond.bId);

  const groups = new Map<PrimitiveId, PrimitiveId[]>();
  for (const id of world.primitives.keys()) {
    const root = find(id);
    let g = groups.get(root);
    if (g === undefined) {
      g = [];
      groups.set(root, g);
    }
    g.push(id);
  }

  const components: ComponentInfo[] = [];
  for (const g of groups.values()) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    const colorCounts = new Map<number, number>();
    for (const id of g) {
      const p = world.primitives.get(id);
      if (p === undefined) continue;
      if (p.pos.x < minX) minX = p.pos.x;
      if (p.pos.x > maxX) maxX = p.pos.x;
      if (p.pos.y < minY) minY = p.pos.y;
      if (p.pos.y > maxY) maxY = p.pos.y;
      sumX += p.pos.x;
      sumY += p.pos.y;
      colorCounts.set(p.placerColor, (colorCounts.get(p.placerColor) ?? 0) + 1);
    }
    if (g.length === 0) continue;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const aspect = Math.max(w, h) / Math.min(w, h);
    let topColor = 0;
    let topCount = 0;
    for (const [c, n] of colorCounts) {
      if (n > topCount) {
        topColor = c;
        topCount = n;
      }
    }
    components.push({
      primitiveIds: g,
      centroid: { x: sumX / g.length, y: sumY / g.length },
      aspect,
      size: g.length,
      ownerColor: topColor,
    });
  }
  return components;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const voltkinPredicate: RecipePredicate = (world) => {
  const components = findAllComponents(world);
  const lightnings = components.filter(
    (c) => c.size >= LIGHTNING_MIN_PRIMS && c.aspect >= LIGHTNING_MIN_ASPECT,
  );
  const tvs = components.filter(
    (c) =>
      c.size >= TV_MIN_PRIMS &&
      c.aspect >= TV_MIN_ASPECT &&
      c.aspect <= TV_MAX_ASPECT,
  );
  for (const ltn of lightnings) {
    for (const tv of tvs) {
      if (ltn === tv) continue;
      if (distance(ltn.centroid, tv.centroid) > ADJACENCY_RADIUS_PX) continue;
      const triggerer = Array.from(world.players.values()).find(
        (p) => p.color === ltn.ownerColor,
      );
      if (triggerer === undefined) continue;
      return {
        triggererPlayerId: triggerer.id,
        targetComponentPrimitiveIds: tv.primitiveIds,
        targetPos: tv.centroid,
      };
    }
  }
  return null;
};

export const VOLTKIN_RECIPE: GodlyRecipe = {
  id: 'voltkin',
  predicate: voltkinPredicate,
  cinematicAsset: '/godly/voltkin/cinematic/voltkin-intro.mp4',
  voiceAsset: '/godly/voltkin/audio/voltkin-voice.ogg',
  characterSprite: '/godly/voltkin/sprites/voltkin-zap.png',
  cinematicMs: 4000,
  sustainedEffectMs: 8000,
  voiceOffsetMs: 3500,
  lumaKey: { enabled: true, threshold: 0.88 },
};

registerRecipe(VOLTKIN_RECIPE);
