/**
 * SPARK — S195 N17 — TEST-ONLY FROZEN REFERENCE: `StructureRenderer.drawBonds` exactly as it stood before S195
 * (master `dcd6af47`…`f3885952`), lifted verbatim with its private helpers.
 *
 * ⛔ Never imported by production code (the `.fixtures.ts` convention). `structureRenderer.tiers.test.ts` draws
 * the same boards through this and through the S195 HIGH path and requires the two Graphics op streams to be
 * IDENTICAL — the proof that the graphics tiers left HIGH byte-for-byte as it was. Do not "tidy" this file:
 * its value is that it does not change when the live renderer does.
 */
import type { Graphics } from 'pixi.js';
import { lookupCombo } from '../combos.ts';
import { POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH, STRAIN_BREAK_BY_TIER, type StiffnessTier } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';
import { drawBondVisual } from './bondVisualRenderer.ts';
import { isConcealed } from './concealment.ts';
import { TOWER_COVER_DRAW_EPSILON, coverAlphaForBond } from './towerCover.ts';

export function drawBondsPreS195(g: Graphics, world: World): void {
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
      /*
       * ⭐ S170 (owner) — the CONNECTORS, named explicitly in his spec: *"I shouldn't see their
       * buildings, their sparks, their spawn, their connectors."*
       *
       * ⚠ A bond is hidden unless BOTH ends are visible. The stricter test is the right one: a
       * connector drawn from a visible shape to a concealed one would trace a line straight to
       * something the player is not allowed to see, which leaks the position it exists to hide.
       */
      if (isConcealed(a.pos.x, a.pos.y, a.placedBy) || isConcealed(b.pos.x, b.pos.y, b.placedBy)) continue;
      /*
       * ⭐⭐ S175 P6 — the connector's phase-out. Fully hidden means SKIP: this bond draws into a
       * shared Graphics and an alpha-0 stroke still costs the geometry.
       */
      /*
       * ⛔⛔ S183 — **DAMAGE NO LONGER UN-HIDES A CONNECTOR.** This read
       * `bond.damageFifths > 0 ? Math.max(coverAlphaForBond(bond.id), DAMAGED_BOND_MIN_ALPHA) : …`
       * from S175 P9 until S183. See the retirement note at the top of this file for both of the
       * owner's rulings and why the damage ramp is what let the later one replace the earlier.
       */
      const coverAlpha = coverAlphaForBond(bond.id);
      if (coverAlpha <= TOWER_COVER_DRAW_EPSILON) continue;
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
      // PLACE_PRIMITIVE dispatch order (carried→target). The 22 functional
      // combos resolve to fx.bond.default and render as a plain line; the 14
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
        alpha: 0.85 * coverAlpha,
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
            alpha: (0.4 + 0.6 * pulse) * coverAlpha,
          });
      }

      // S85 P4b — ownership pattern overlay (see drawBonds header comment).
      /*
       * ⚠ THE OWNERSHIP PATTERN IS SKIPPED RATHER THAN FADED. `drawOwnershipPattern` strokes
       * straight into the shared Graphics with its own alpha, so a phased-out connector would keep
       * a fully opaque dash pattern floating where it used to be — the S175 version of the three
       * separate draw calls this bond is made of not agreeing with each other.
       */
      if (colorToSeat !== null && coverAlpha > TOWER_COVER_DRAW_EPSILON) {
        const seat = colorToSeat.get(a.placerColor);
        drawOwnershipPattern(g, a.pos.x, a.pos.y, b.pos.x, b.pos.y, seatPatternKind(seat));
      }
    }
  }
}

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
function foulAwareTint(baseColor: number, isFouled: boolean): number {
  return isFouled ? lerpTint(baseColor, POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH) : baseColor;
}

// ===== S85 P4b — per-owner bond patterning (CVD structure-ownership cue) =====

type BondPatternKind = 'none' | 'rungs' | 'beads' | 'chevrons';

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
function seatPatternKind(seat: number | undefined): BondPatternKind {
  if (seat === undefined || seat === 0) return 'none';
  const idx = (seat - 1) % 3;
  return idx === 0 ? 'rungs' : idx === 1 ? 'beads' : 'chevrons';
}

interface PatternMark {
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
function bondPatternMarks(ax: number, ay: number, bx: number, by: number): PatternMark[] {
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

