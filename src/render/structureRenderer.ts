/**
 * SPARK — placed primitives + bonds + carry/connect overlay.
 * Spec § 10.7 LOCKED:
 *   - One Graphics for ALL bonds (clear/redraw on bond commit/sever — but
 *     bonds drift each substep, so we redraw per frame; cheap given <100
 *     bonds Phase 1).
 *   - Pixi v8 batches Sprites automatically — no per-primitive filter.
 *
 * Spec § VI.4 (v0.5.1): placed primitives render in their PLACER's player
 * color. Type identity is shape; ownership is color. Bond gradients now
 * blend player-colors of both endpoints (single-player Phase 1 = monochrome
 * bonds, looks identical, makes Phase 2 multi-color bonds free).
 *
 * Bonds are drawn first (under primitives), then placed-primitive sprites.
 *
 * S53 P2 — drawPreview removed (was the carry-then-aim RMB ConnectDrag
 * preview line + target highlight + spawner-zone no-build glyph). Post-
 * S52 P1 atomic LMB-up there is no Carrying state, so the ConnectDrag
 * preview had no input to render. Removed alongside the controls.ts
 * ConnectDrag state variant + handler branches.
 */

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { lookupCombo } from '../combos.ts';
import {
  POOP_FOUL_TINT,
  POOP_FOUL_TINT_STRENGTH,
  STRAIN_BREAK_BY_TIER,
  type StiffnessTier,
} from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';
import type { PrimitiveId } from '../types.ts';
import { drawBondVisual } from './bondVisualRenderer.ts';
import { makeShapeTextures, destroyShapeTextures, type ShapeTextures } from './shapes.ts';

const PLACED_PRIMITIVE_SCALE = 1.0;

export class StructureRenderer {
  private readonly bondGraphics: Graphics;
  private readonly primitiveLayer: Container;
  // S48 P5 (Sym B fix) — carryHalo REMOVED. Live S47 smoke: user reported
  // an undesired colored ring appearing around the carried spark on the
  // joiner side. drawCarryHalo iterated ALL Carrying players + drew a 2px
  // colored ring; joiner's client-prediction of PICKUP_SPARK (S46 C13)
  // diverged from host (Sym A rejects) → joiner saw the halo, host didn't.
  // User-preferred resolution per S47 directive ("i just want everything
  // to work properly"): remove halo entirely. Carry state is still
  // communicated by the spark-following-cursor motion + the avatar pulse
  // boost from S45 C10 (avatarRenderer.ts:72,114).
  //
  // S53 P2 — previewGraphics REMOVED. Was the RMB ConnectDrag preview line
  // (carry-then-aim mode); ConnectDrag is unreachable post-S52 P1 atomic
  // LMB-up, so the preview Graphics had no input to render.
  private readonly spriteByPrim: Map<PrimitiveId, Sprite> = new Map();
  private readonly textures: ShapeTextures;

  constructor(app: Application) {
    this.textures = makeShapeTextures(app);

    this.bondGraphics = new Graphics();
    this.primitiveLayer = new Container();

    app.stage.addChild(this.bondGraphics);
    app.stage.addChild(this.primitiveLayer);
  }

  // S53 P2 — sync no longer takes controls param. The drawPreview consumer
  // of controls.state was the only reason the param existed; now removed.
  sync(world: World): void {
    this.syncPrimitives(world);
    this.drawBonds(world);
    // S48 P5 (Sym B fix) — drawCarryHalo call removed; see field comment.
    // S53 P2 — drawPreview call removed; see field comment.
  }

  private syncPrimitives(world: World): void {
    const seen = new Set<PrimitiveId>();
    for (const prim of world.primitives.values()) {
      seen.add(prim.id);
      // S79 P2 — a poop-FOULED primitive renders tinted toward the splat colour so the whole
      // building reads "pooped on, earning nothing, go wipe it". world.fouledPrimitives rides
      // NetSnapshot (S77), so the joiner sees the identical tint with no extra wire state.
      const tint = foulAwareTint(prim.ownerColor, world.fouledPrimitives.has(prim.id));
      let sprite = this.spriteByPrim.get(prim.id);
      if (sprite === undefined) {
        sprite = new Sprite(this.textures[prim.type]);
        sprite.anchor.set(0.5);
        // Player color = ownership. Spec § VI.4 v0.5.1.
        sprite.tint = tint;
        sprite.scale.set(PLACED_PRIMITIVE_SCALE);
        this.primitiveLayer.addChild(sprite);
        this.spriteByPrim.set(prim.id, sprite);
      } else {
        // ownerColor mutates on Phase-2 Steal disruption (and foul state toggles on
        // splat/clean) — keep tint synced.
        if (sprite.tint !== tint) sprite.tint = tint;
      }
      sprite.x = prim.pos.x;
      sprite.y = prim.pos.y;
    }
    if (this.spriteByPrim.size > seen.size) {
      for (const [id, sprite] of this.spriteByPrim) {
        if (!seen.has(id)) {
          sprite.destroy();
          this.spriteByPrim.delete(id);
        }
      }
    }
  }

  private drawBonds(world: World): void {
    const g = this.bondGraphics;
    const tick = world.tick;
    const fouled = world.fouledPrimitives;
    g.clear();
    // S85 P4b — per-owner bond patterning (the S82 CVD carry-forward:
    // "structure-ownership non-color cue"). Bonds are same-color by the S46 P3
    // segregation invariant, so a bond belongs entirely to ONE seat; overlay a
    // seat-keyed white pattern (rungs/beads/chevrons) so ownership reads
    // without the color channel. Networked-only — solo has one owner (same
    // gate as the S82 avatar nameplates). Color→seat is rebuilt per frame
    // (≤MAX_PLAYERS entries) and stays correct through rainbow shuffles
    // because player.color and placerColor remap in lockstep.
    const patterned = world.gameMode !== 'solo';
    const colorToSeat = patterned ? new Map<number, number>() : null;
    if (colorToSeat !== null) {
      for (const [pid, p] of world.players) colorToSeat.set(p.color, pid as number);
    }
    for (const bond of world.bonds.values()) {
      // Bond gradient = blend of two endpoints' player colors. Single
      // player Phase 1 = monochrome (a→a). Phase 2 multi-player = real
      // gradient — the call site is identical. The cast is safe: bond.a /
      // bond.b are always Primitives at runtime (the PhysicsBody type is
      // a structural subset to keep the solver narrow).
      const a = bond.a as Primitive;
      const b = bond.b as Primitive;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / bond.restLength;
      const breakAt = STRAIN_BREAK_BY_TIER[bond.stiffnessTier];
      const stress = Math.max(0, Math.min(1, (ratio - 1) / (breakAt - 1)));
      // S17 P2 — Phase-2 §VI.4 / §X.2: source per-endpoint placerColor
      // (immutable contribution record per Council R1 Gemini #1 BLOCKER —
      // NOT transient ownerColor which mutates on Steal). Stress tint applied
      // per-endpoint so the bond turns red as it approaches break threshold
      // even when endpoint colors differ. Single-color bonds (P1 self-built
      // or solo) render solid via drawDefaultLine fast-path.
      // S79 P2 — a FOULED structure's bonds tint toward the splat colour first (either
      // endpoint fouled = whole component fouled by construction), then stress-red layers
      // on top so near-break feedback survives the foul.
      const isFouled = fouled.size > 0 && (fouled.has(bond.aId) || fouled.has(bond.bId));
      const baseA = foulAwareTint(a.placerColor, isFouled);
      const baseB = foulAwareTint(b.placerColor, isFouled);
      const stressedA = stress > 0.05 ? lerpTint(baseA, 0xff3030, stress * 0.85) : baseA;
      const stressedB = stress > 0.05 ? lerpTint(baseB, 0xff3030, stress * 0.85) : baseB;
      const width = stiffnessToWidth(bond.stiffnessTier) + (stress > 0.5 ? (stress - 0.5) * 2 : 0);

      // S7 P2: per-combo persistent silhouette. Direction is a→b matching the
      // PLACE_PRIMITIVE dispatch order (carried→target). The 24 functional
      // combos resolve to fx.bond.default and render as a plain line; the 12
      // magic combos render their named silhouette stretched between
      // endpoints. Stress tint + width are applied here so the silhouette
      // inherits stress feedback uniformly.
      drawBondVisual(g, {
        ax: a.pos.x,
        ay: a.pos.y,
        bx: b.pos.x,
        by: b.pos.y,
        visualEffectId: lookupCombo(a.type, b.type).visualEffectId,
        colorA: stressedA,
        colorB: stressedB,
        alpha: 0.85,
        width,
        tick,
      });

      if (stress > 0.7) {
        // Red overlay pulse on near-break stress — drawn over the silhouette
        // so it's still visible even on busy combos (lattice, vortex, star).
        const pulse = (stress - 0.7) / 0.3;
        g.moveTo(a.pos.x, a.pos.y)
          .lineTo(b.pos.x, b.pos.y)
          .stroke({
            width: 1,
            color: 0xff8080,
            alpha: 0.4 + 0.6 * pulse,
          });
      }

      // S85 P4b — ownership pattern overlay (see drawBonds header comment).
      if (colorToSeat !== null) {
        const seat = colorToSeat.get(a.placerColor);
        drawOwnershipPattern(g, a.pos.x, a.pos.y, b.pos.x, b.pos.y, seatPatternKind(seat));
      }
    }
  }

  // S53 P2 — drawPreview() DELETED. Was the RMB ConnectDrag preview line +
  // target highlight + spawner-zone no-build glyph. Post-S52 P1 atomic
  // LMB-up, the ConnectDrag ControlState variant is unreachable (no public
  // path enters player.kind='Carrying' state). Removed alongside the
  // drawNoBuildGlyph / drawTierGlyph / TIER_COLOR / isInsideSpawnerZone
  // helpers that ONLY drawPreview consumed.
  //
  // S48 P5 (Sym B fix) — private drawCarryHalo(world) DELETED earlier. See
  // field comment for rationale; carry state is communicated by other
  // visuals already (spark-cursor follow + avatar pulse boost).

  destroy(): void {
    this.bondGraphics.destroy();
    // S53 P2 — previewGraphics.destroy() removed (field removed).
    this.primitiveLayer.destroy({ children: true });
    destroyShapeTextures(this.textures);
    this.spriteByPrim.clear();
  }
}

// S53 P2 — isInsideSpawnerZone(x, y) helper REMOVED (only consumed by
// drawPreview's no-build-zone check).

function stiffnessToWidth(tier: StiffnessTier): number {
  return tier === 'HIGH' ? 3 : tier === 'MID' ? 2 : 1.5;
}

// S17 P2: mixTints (single-color mid-blend of endpoint ownerColors) removed;
// drawBondVisual now consumes per-endpoint colorA + colorB and produces the
// gradient via stroke-decomposition (Council R1 Grok #6 + Gemini #5). The
// stress-tint path still uses lerpTint below — applied to each endpoint's
// placerColor separately.

/**
 * S79 P2 — pooped-building tint. Pure + exported for unit tests: a fouled element's colour
 * lerps toward POOP_FOUL_TINT (the splat's green-brown core) by POOP_FOUL_TINT_STRENGTH;
 * an un-fouled element keeps its base colour bit-exactly.
 */
export function foulAwareTint(baseColor: number, isFouled: boolean): number {
  return isFouled ? lerpTint(baseColor, POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH) : baseColor;
}

// ===== S85 P4b — per-owner bond patterning (CVD structure-ownership cue) =====

export type BondPatternKind = 'none' | 'rungs' | 'beads' | 'chevrons';

const PATTERN_SPACING = 28;
/** Keep marks clear of the endpoint primitives' sprites. */
const PATTERN_END_CLEARANCE = 12;
const PATTERN_COLOR = 0xffffff;
const PATTERN_ALPHA = 0.45;
const RUNG_HALF = 4;
const BEAD_RADIUS = 1.7;
const CHEVRON_ARM = 4.5;

/**
 * Seat → pattern vocabulary. Seat 0 is the solid baseline (no overlay) so the
 * pattern count stays at "one cue per ADDITIONAL seat"; seats beyond 3 cycle.
 * Pure + exported for unit tests.
 */
export function seatPatternKind(seat: number | undefined): BondPatternKind {
  if (seat === undefined || seat === 0) return 'none';
  const idx = (seat - 1) % 3;
  return idx === 0 ? 'rungs' : idx === 1 ? 'beads' : 'chevrons';
}

export interface PatternMark {
  readonly x: number;
  readonly y: number;
  /** Unit vector ALONG the bond (a→b). */
  readonly ux: number;
  readonly uy: number;
}

/**
 * Evenly spaced mark anchors along the bond, clear of both endpoints. Pure +
 * exported for unit tests (spacing, clearance, unit-vector contract). Returns
 * [] for degenerate/short bonds — a bond too short for one mark stays solid.
 */
export function bondPatternMarks(ax: number, ay: number, bx: number, by: number): PatternMark[] {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const usable = dist - 2 * PATTERN_END_CLEARANCE;
  if (usable < PATTERN_SPACING * 0.5) return [];
  const ux = dx / dist;
  const uy = dy / dist;
  const count = Math.max(1, Math.floor(usable / PATTERN_SPACING));
  const step = usable / (count + 1);
  const marks: PatternMark[] = [];
  for (let i = 1; i <= count; i++) {
    const d = PATTERN_END_CLEARANCE + step * i;
    marks.push({ x: ax + ux * d, y: ay + uy * d, ux, uy });
  }
  return marks;
}

/** Stroke the seat pattern over an already-drawn bond visual. */
function drawOwnershipPattern(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  kind: BondPatternKind,
): void {
  if (kind === 'none') return;
  for (const m of bondPatternMarks(ax, ay, bx, by)) {
    const nx = -m.uy; // perpendicular
    const ny = m.ux;
    if (kind === 'rungs') {
      g.moveTo(m.x - nx * RUNG_HALF, m.y - ny * RUNG_HALF)
        .lineTo(m.x + nx * RUNG_HALF, m.y + ny * RUNG_HALF)
        .stroke({ width: 1.5, color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    } else if (kind === 'beads') {
      g.circle(m.x, m.y, BEAD_RADIUS).fill({ color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    } else {
      // chevron: a V opening along the bond direction.
      const tipX = m.x + m.ux * CHEVRON_ARM * 0.6;
      const tipY = m.y + m.uy * CHEVRON_ARM * 0.6;
      const baseX = m.x - m.ux * CHEVRON_ARM * 0.6;
      const baseY = m.y - m.uy * CHEVRON_ARM * 0.6;
      g.moveTo(baseX + nx * CHEVRON_ARM, baseY + ny * CHEVRON_ARM)
        .lineTo(tipX, tipY)
        .lineTo(baseX - nx * CHEVRON_ARM, baseY - ny * CHEVRON_ARM)
        .stroke({ width: 1.5, color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    }
  }
}

function lerpTint(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gc = Math.round(ag + (bg - ag) * t);
  const bc = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gc << 8) | bc;
}

// S53 P2 — TIER_COLOR, drawTierGlyph, drawNoBuildGlyph helpers REMOVED.
// Only consumers were drawPreview's RMB ConnectDrag aim indicator (target
// highlight + tier-glyph bars + spawner-zone slash-circle). All three
// dead alongside the rest of the ConnectDrag path.
