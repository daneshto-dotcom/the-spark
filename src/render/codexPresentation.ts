/**
 * SPARK — S121 P4: CODEX presentation — the single source of truth for codex copy + imagery.
 *
 * WHY THIS EXISTS (owner, S121): the codex was incoherent — three towers (pentagram / laser turret /
 * lightning hub) all wore the VOLTKIN placeholder sprite, recipe hints were flat run-on strings that
 * overflowed their tiles, and display names were raw ids (LASERTURRET). This module fixes all three at
 * the root by owning presentation per entry:
 *
 *   - COPY   — displayName + a one-line POWER epigraph + a tight, epic RECIPE (each written to FIT the
 *              tile text zone by construction; codexPresentation.test.ts enforces the budgets).
 *   - IMAGE  — the coherence rule: an entry that IS a character shows its character art (Voltkin,
 *              HELGA, the NONET kami); a GEOMETRIC buildable shows its BUILD CONSTELLATION — a recipe
 *              emblem drawn from the same SHAPE_GLYPHS + SPARK_COLORS the board and the COMBOS tab
 *              use, so the codex speaks one visual language: the recipe IS the picture.
 *
 * `emblemLayout` is a pure function (no Pixi) so the emblem geometry — node counts, hub, ring bonds —
 * is unit-testable against the real recipe requirements (anti-drift: the laser turret emblem must show
 * SEVEN spirals because the recipe demands seven).
 */

import { Graphics } from 'pixi.js';
import { SPARK_COLORS, SparkType } from '../constants.ts';
import { SHAPE_GLYPHS } from './shapes.ts';

// ============================== COPY ==============================

export interface CodexCopy {
  /** Proper display name (not a raw id) — fits the tile header. */
  readonly name: string;
  /** One-line epigraph shown when unlocked — the entry's soul, ≤44 chars. */
  readonly power: string;
  /** Precise build recipe + what it does — ≤150 chars so it always fits the tile text zone. */
  readonly recipe: string;
  /** Character art (only for entries that ARE characters); geometric buildables use an emblem. */
  readonly sprite?: string;
  /** Recipe-constellation emblem (only for geometric buildables). */
  readonly emblem?: EmblemSpec;
}

/**
 * Keyed by recipe id (+ the synthetic 'nonet'). The coherence contract, enforced by tests:
 * every entry has EITHER a sprite (character) OR an emblem (geometry) — never neither, never both.
 */
export const CODEX_COPY: Readonly<Record<string, CodexCopy>> = {
  voltkin: {
    name: 'VOLTKIN',
    power: 'The storm given a body.',
    recipe:
      'Chain 4 Squares, then 4 Triangles — 8 bonded in one straight line, both ends free. The sky answers with a summons.',
    sprite: '/godly/voltkin/anim/voltkin-zap.png',
  },
  nonet: {
    name: 'NONET',
    power: 'One trial. Double or nothing.',
    recipe:
      'Bond 9 of ONE shape — nothing else. A Sudoku trial freezes the duel: solve it first and your score DOUBLES; every rival is HALVED.',
    sprite: '/art/nonet/kami.webp',
  },
  pentagram: {
    name: 'PENTAGRAM',
    power: 'A ring that births the swarm.',
    recipe:
      'Bond 5 Triangles into a closed ring — each touching exactly two. It mints chewers that gnaw through enemy bonds.',
    emblem: { kind: 'ring', nodes: 5, nodeType: SparkType.Triangle, radius: 44 },
  },
  lightningHub: {
    name: 'LIGHTNING HUB',
    power: 'It gives its life in lightning.',
    recipe:
      'Bond 5 Circles to 1 central Dot — a six-shape star. It fires 3 lightning drones at enemy connectors, then detonates in a storm.',
    emblem: { kind: 'star', hubType: SparkType.Dot, nodes: 5, nodeType: SparkType.Circle, radius: 40 },
  },
  laserTurret: {
    name: 'LASER TURRET',
    power: 'Eight shapes. One judgment beam.',
    recipe:
      'Bond 7 Spirals to 1 Line — all seven on the same rod. Its beam turns enemy chewers to ash. (Seven. Not four.)',
    emblem: { kind: 'star', hubType: SparkType.Line, nodes: 7, nodeType: SparkType.Spiral, radius: 46 },
  },
  helga: {
    name: 'HELGA',
    power: 'The princess answers in slaps.',
    recipe:
      'Bond 3 Spirals + 3 Circles to 1 Triangle hub — seven shapes. HELGA descends and slaps chewers off your walls.',
    sprite: '/godly/helga/helga.png',
  },
};

/** Copy lookup with an honest fallback (an unmapped id renders as itself, never crashes the codex). */
export function codexCopyFor(id: string): CodexCopy {
  return CODEX_COPY[id] ?? { name: id.toUpperCase(), power: '', recipe: '???' };
}

// ============================== EMBLEMS ==============================

/**
 * A recipe constellation: 'ring' = n nodes on a circle, bonded to their neighbors (the pentagram);
 * 'star' = a hub shape with n nodes bonded to it by spokes (the turret rod, the hub dot).
 */
export interface EmblemSpec {
  readonly kind: 'ring' | 'star';
  readonly hubType?: SparkType;
  readonly nodes: number;
  readonly nodeType: SparkType;
  readonly radius: number;
}

export interface EmblemLayout {
  readonly hub?: { readonly type: SparkType; readonly x: number; readonly y: number };
  readonly nodes: ReadonlyArray<{ readonly type: SparkType; readonly x: number; readonly y: number }>;
  readonly bonds: ReadonlyArray<{ readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }>;
}

/**
 * Pure layout math (no Pixi) — testable. Nodes start at 12 o'clock and go clockwise; ring bonds
 * connect neighbors, star bonds are hub→node spokes. Coordinates are centered on (0,0).
 */
export function emblemLayout(spec: EmblemSpec): EmblemLayout {
  const pts: Array<{ type: SparkType; x: number; y: number }> = [];
  for (let i = 0; i < spec.nodes; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / spec.nodes;
    pts.push({ type: spec.nodeType, x: Math.cos(a) * spec.radius, y: Math.sin(a) * spec.radius });
  }
  const bonds: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (spec.kind === 'ring') {
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      bonds.push({ x1: pts[i].x, y1: pts[i].y, x2: next.x, y2: next.y });
    }
    return { nodes: pts, bonds };
  }
  const hubType = spec.hubType ?? SparkType.Dot;
  for (const p of pts) bonds.push({ x1: 0, y1: 0, x2: p.x, y2: p.y });
  return { hub: { type: hubType, x: 0, y: 0 }, nodes: pts, bonds };
}

const EMBLEM_BOND_COLOR = 0x8890a8;
const EMBLEM_LOCKED_TINT = 0x53536a; // combos-tab locked-silhouette parity

/**
 * Draw a recipe emblem into `g`, centered on (0,0) — same glyph + colour language as the COMBOS tab.
 * The recipe geometry stays VISIBLE even when locked (S105 P2: requirements are checkable before
 * building), just dimmed — only character art gets the full brother-surprise hide.
 */
export function drawEmblem(g: Graphics, spec: EmblemSpec, discovered: boolean): void {
  const layout = emblemLayout(spec);
  const bondAlpha = discovered ? 0.75 : 0.35;
  for (const b of layout.bonds) {
    g.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2)
      .stroke({ width: 2, color: discovered ? EMBLEM_BOND_COLOR : EMBLEM_LOCKED_TINT, alpha: bondAlpha });
  }
  const drawGlyph = (type: SparkType, x: number, y: number): void => {
    const wrap = new Graphics();
    SHAPE_GLYPHS[type](wrap);
    wrap.tint = discovered ? SPARK_COLORS[type] : EMBLEM_LOCKED_TINT;
    wrap.alpha = discovered ? 1 : 0.55;
    wrap.position.set(x, y);
    g.addChild(wrap);
  };
  if (layout.hub !== undefined) drawGlyph(layout.hub.type, layout.hub.x, layout.hub.y);
  for (const n of layout.nodes) drawGlyph(n.type, n.x, n.y);
}
