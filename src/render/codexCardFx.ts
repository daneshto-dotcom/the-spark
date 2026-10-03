/**
 * SPARK — S194 R194-32: THE CODEX TOWER & STRUCTURE CARDS, REWORKED.
 *
 * Owner, S194: *"why not all the combos and tower structures have been reworked to look better? … the
 * combos did … pretty good, but the tower structures didn't. They look the same as they did before."*
 *
 * Every tower card (Souleater, Scarab, Piranha, Warband, Bat, Hound, Stink, Goblin, Pentagram, Lightning
 * Hub, Helga, Laser Turret, the tier-9s, Voltkin …) now gets:
 *   · a glass card with a race-tinted title band and a gold frame with corner brackets (`skinPanelFx`);
 *   · a lit pedestal under the recipe diagram, and the DIAGRAM ITSELF GLOWING — a soft halo round every
 *     node and a wide glow under every bond, in that shape's own colour (the fx look, drawn as layered
 *     low-alpha Graphics so it needs no canvas texture and no per-card filter pass).
 *
 * ⭐ THE GLOW IS DERIVED FROM THE SAME LAYOUT THE DIAGRAM DRAWS FROM (`emblemLayout` / `blueprintFor`),
 * so the glow and the crisp glyph above it can never disagree about where a node is.
 *
 * Pure layout + draw; render-only; cards are not clickable (no hit-test exists to move).
 */
import type { Graphics } from 'pixi.js';
import { SPARK_COLORS, type SparkType } from '../constants.ts';
import { blueprintFor } from '../state/blueprints.ts';
import { raceColorForShape } from '../state/races.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { emblemLayout, type EmblemSpec } from './codexPresentation.ts';
import { blueprintFitScaleBox } from './blueprintGlyph.ts';
import { skinPanelFx } from './uiSkin.ts';

export interface GlowNode { readonly x: number; readonly y: number; readonly color: number }
export interface GlowBond { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly color: number }
export interface CardGlowLayout { readonly nodes: readonly GlowNode[]; readonly bonds: readonly GlowBond[]; readonly accent: number }

/** The card's accent: the race that owns its most common shape, else the codex gold. */
function accentFor(types: readonly SparkType[], fallback: number): number {
  const count = new Map<SparkType, number>();
  for (const t of types) count.set(t, (count.get(t) ?? 0) + 1);
  let best: SparkType | null = null;
  let n = 0;
  // Total order: highest count, then lowest shape id — deterministic whatever the node order.
  for (const [t, c] of count) if (c > n || (c === n && best !== null && (t as number) < (best as number))) { best = t; n = c; }
  return best === null ? fallback : raceColorForShape(best) ?? SPARK_COLORS[best] ?? fallback;
}

/**
 * PURE — where the diagram's nodes and bonds are, in card-local px, for an entry centred at (cx, cy).
 * Mirrors `makeSpriteTile`: an emblem when the entry has one, else the blueprint at its fit scale.
 */
export function cardGlowLayout(
  entry: { readonly id: GodlyId; readonly emblem?: EmblemSpec },
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  fallback: number,
): CardGlowLayout {
  if (entry.emblem !== undefined) {
    const l = emblemLayout(entry.emblem);
    const nodes: GlowNode[] = l.nodes.map((p) => ({ x: cx + p.x, y: cy + p.y, color: SPARK_COLORS[p.type] }));
    if (l.hub !== undefined) nodes.push({ x: cx + l.hub.x, y: cy + l.hub.y, color: SPARK_COLORS[l.hub.type] });
    const accent = accentFor([...l.nodes.map((p) => p.type), ...(l.hub ? [l.hub.type] : [])], fallback);
    return { nodes, bonds: l.bonds.map((b) => ({ x1: cx + b.x1, y1: cy + b.y1, x2: cx + b.x2, y2: cy + b.y2, color: accent })), accent };
  }
  const bp = blueprintFor(entry.id);
  const s = blueprintFitScaleBox(entry.id, halfW, halfH);
  const at = (i: number): { x: number; y: number } => ({ x: cx + bp.nodes[i]!.dx * s, y: cy + bp.nodes[i]!.dy * s });
  const nodes = bp.nodes.map((n, i) => ({ ...at(i), color: SPARK_COLORS[n.type] }));
  const accent = accentFor(bp.nodes.map((n) => n.type), fallback);
  const bonds = bp.bonds.map(([a, b]) => ({ x1: at(a).x, y1: at(a).y, x2: at(b).x, y2: at(b).y, color: accent }));
  return { nodes, bonds, accent };
}

/** The glow UNDER the diagram: wide soft bonds, then a three-ring halo per node. */
export function drawCardGlow(g: Graphics, l: CardGlowLayout): void {
  for (const [w, a] of [[11, 0.08], [6, 0.16]] as const) {
    for (const b of l.bonds) g.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: w, color: b.color, alpha: a, cap: 'round' });
  }
  for (const n of l.nodes) {
    g.circle(n.x, n.y, 17).fill({ color: n.color, alpha: 0.07 });
    g.circle(n.x, n.y, 11).fill({ color: n.color, alpha: 0.12 });
    g.circle(n.x, n.y, 6).fill({ color: 0xffffff, alpha: 0.10 });
  }
}

/**
 * The card's chrome: glass depth + a title band + corner brackets in its accent (via the shared panel
 * skin), a lit pedestal under the diagram, and a gold hairline under the title. Draw the card's own
 * opaque plate first; everything here lies inside (0, 0, w, h).
 */
export function drawCardChrome(g: Graphics, w: number, h: number, accent: number, gold: number, titleBand: number, artCy: number, artHalfH: number): void {
  skinPanelFx(g, 0, 0, w, h, accent, titleBand, 12);
  // A lit pedestal: stacked translucent ellipses under the diagram, brightest in the middle.
  const py = Math.min(h - 8, artCy + artHalfH * 0.85);
  for (const [rx, ry, a] of [[w * 0.36, 16, 0.06], [w * 0.26, 11, 0.09], [w * 0.15, 6, 0.12]] as const) {
    g.ellipse(w / 2, py, rx, ry).fill({ color: accent, alpha: a });
  }
  g.moveTo(24, titleBand + 1.5).lineTo(w - 24, titleBand + 1.5).stroke({ width: 1, color: gold, alpha: 0.55 });
}
