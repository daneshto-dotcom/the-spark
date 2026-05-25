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
 * Bonds are drawn first (under primitives). Connect-drag preview line goes
 * on top. The carried spark uses the free-spark renderer (colorless shape)
 * with a player-color halo overlay drawn here.
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
} from 'pixi.js';
import { lookupCombo } from '../combos.ts';
import {
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  STRAIN_BREAK_BY_TIER,
  type StiffnessTier,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';
import type { ControlState } from '../input/controls.ts';
import type { PrimitiveId } from '../types.ts';
import { drawBondVisual } from './bondVisualRenderer.ts';
import { makeShapeTextures, destroyShapeTextures, type ShapeTextures } from './shapes.ts';

const PLACED_PRIMITIVE_SCALE = 1.0;

export class StructureRenderer {
  private readonly bondGraphics: Graphics;
  private readonly previewGraphics: Graphics;
  private readonly primitiveLayer: Container;
  // S48 P5 (Sym B fix) — carryHalo REMOVED. Live S47 smoke: user reported
  // an undesired colored ring appearing around the carried spark on the
  // joiner side ("for every primitive player two chooses, [there's a
  // circle around it]"). drawCarryHalo iterated ALL Carrying players + drew
  // a 2px colored ring at carried.pos + 8 radius, no isLocal gate. Visible
  // asymmetry vs host arose because joiner's client-prediction of
  // PICKUP_SPARK (S46 C13) puts joiner-local state in Carrying while host
  // sometimes rejected the pickup (Sym A) — joiner saw the halo, host
  // didn't. User-preferred resolution per S47 directive ("i just want
  // everything to work properly"): remove halo entirely. Carry state is
  // still communicated by the spark-following-cursor motion + the avatar
  // pulse boost from S45 C10 (avatarRenderer.ts:72,114).
  private readonly spriteByPrim: Map<PrimitiveId, Sprite> = new Map();
  private readonly textures: ShapeTextures;

  constructor(app: Application) {
    this.textures = makeShapeTextures(app);

    this.bondGraphics = new Graphics();
    this.primitiveLayer = new Container();
    this.previewGraphics = new Graphics();

    app.stage.addChild(this.bondGraphics);
    app.stage.addChild(this.primitiveLayer);
    app.stage.addChild(this.previewGraphics);
  }

  sync(world: World, controls: ControlState): void {
    this.syncPrimitives(world);
    this.drawBonds(world.bonds, world.tick);
    this.drawPreview(world, controls);
    // S48 P5 (Sym B fix) — drawCarryHalo call removed; see field comment.
  }

  private syncPrimitives(world: World): void {
    const seen = new Set<PrimitiveId>();
    for (const prim of world.primitives.values()) {
      seen.add(prim.id);
      let sprite = this.spriteByPrim.get(prim.id);
      if (sprite === undefined) {
        sprite = new Sprite(this.textures[prim.type]);
        sprite.anchor.set(0.5);
        // Player color = ownership. Spec § VI.4 v0.5.1.
        sprite.tint = prim.ownerColor;
        sprite.scale.set(PLACED_PRIMITIVE_SCALE);
        this.primitiveLayer.addChild(sprite);
        this.spriteByPrim.set(prim.id, sprite);
      } else {
        // ownerColor mutates on Phase-2 Steal disruption — keep tint synced.
        if (sprite.tint !== prim.ownerColor) sprite.tint = prim.ownerColor;
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

  private drawBonds(bonds: ReadonlyMap<unknown, Bond>, tick: number): void {
    const g = this.bondGraphics;
    g.clear();
    for (const bond of bonds.values()) {
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
      const stressedA = stress > 0.05 ? lerpTint(a.placerColor, 0xff3030, stress * 0.85) : a.placerColor;
      const stressedB = stress > 0.05 ? lerpTint(b.placerColor, 0xff3030, stress * 0.85) : b.placerColor;
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
    }
  }

  private drawPreview(world: World, controls: ControlState): void {
    const g = this.previewGraphics;
    g.clear();
    if (controls.kind !== 'ConnectDrag') return;
    const carried = world.freeSparks.get(controls.carriedSparkId);
    if (carried === undefined) return;
    const target = controls.targetPrimitiveId !== null
      ? world.primitives.get(controls.targetPrimitiveId)
      : undefined;
    const tx = target?.pos.x ?? controls.cursor.x;
    const ty = target?.pos.y ?? controls.cursor.y;
    const valid = target !== undefined;

    // No-build-zone check: cursor inside spawner radius means PLACE will
    // be rejected. Show RED preview so the player understands.
    const inZone = isInsideSpawnerZone(controls.cursor.x, controls.cursor.y);

    let lineColor = 0x666666;
    let lineAlpha = 0.4;
    let lineWidth = 2;

    if (inZone) {
      lineColor = 0xff3030;
      lineAlpha = 0.85;
      lineWidth = 2.5;
    } else if (valid) {
      const combo = lookupCombo(carried.type, target!.type);
      lineColor = TIER_COLOR[combo.stiffnessTier];
      lineAlpha = 0.9;
      lineWidth = combo.stiffnessTier === 'HIGH' ? 3.5 : combo.stiffnessTier === 'MID' ? 2.5 : 1.5;
    }

    g.moveTo(carried.pos.x, carried.pos.y)
      .lineTo(tx, ty)
      .stroke({ width: lineWidth, color: lineColor, alpha: lineAlpha });

    if (inZone) {
      // "No build" indicator: red circle-with-slash near the cursor.
      drawNoBuildGlyph(g, controls.cursor.x, controls.cursor.y);
    } else if (valid) {
      g.circle(tx, ty, target!.radius + 6).stroke({ width: 2, color: lineColor, alpha: 0.7 });
      drawTierGlyph(g, tx, ty, target!.radius + 14, lookupCombo(carried.type, target!.type).stiffnessTier);
    }
  }

  // S48 P5 (Sym B fix) — private drawCarryHalo(world) DELETED. See field
  // comment for rationale; carry state is communicated by other visuals
  // already (spark-cursor follow + avatar pulse boost).

  destroy(): void {
    this.bondGraphics.destroy();
    this.previewGraphics.destroy();
    this.primitiveLayer.destroy({ children: true });
    destroyShapeTextures(this.textures);
    this.spriteByPrim.clear();
  }
}

function isInsideSpawnerZone(x: number, y: number): boolean {
  const dx = x - SPAWNER_CENTER_X;
  const dy = y - SPAWNER_CENTER_Y;
  return dx * dx + dy * dy < SPAWNER_RADIUS * SPAWNER_RADIUS;
}

function stiffnessToWidth(tier: StiffnessTier): number {
  return tier === 'HIGH' ? 3 : tier === 'MID' ? 2 : 1.5;
}

// S17 P2: mixTints (single-color mid-blend of endpoint ownerColors) removed;
// drawBondVisual now consumes per-endpoint colorA + colorB and produces the
// gradient via stroke-decomposition (Council R1 Grok #6 + Gemini #5). The
// stress-tint path still uses lerpTint below — applied to each endpoint's
// placerColor separately.

function lerpTint(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gc = Math.round(ag + (bg - ag) * t);
  const bc = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gc << 8) | bc;
}

const TIER_COLOR: Record<StiffnessTier, number> = {
  LOW: 0xff8a3b,
  MID: 0xffe066,
  HIGH: 0x6affb4,
};

function drawTierGlyph(g: Graphics, x: number, y: number, offset: number, tier: StiffnessTier): void {
  const filled = tier === 'HIGH' ? 3 : tier === 'MID' ? 2 : 1;
  const color = TIER_COLOR[tier];
  for (let i = 0; i < 3; i++) {
    const bx = x + offset + i * 5;
    const h = 4 + i * 3;
    const fillCol = i < filled ? color : 0x333333;
    const alpha = i < filled ? 0.95 : 0.6;
    g.rect(bx, y - h / 2, 3, h).fill({ color: fillCol, alpha });
  }
}

/** Red circle-with-slash near cursor — "you can't build here." */
function drawNoBuildGlyph(g: Graphics, x: number, y: number): void {
  const r = 12;
  g.circle(x, y, r).stroke({ width: 2, color: 0xff3030, alpha: 0.85 });
  // Diagonal slash (top-left to bottom-right).
  const d = r * 0.7;
  g.moveTo(x - d, y - d).lineTo(x + d, y + d)
    .stroke({ width: 2, color: 0xff3030, alpha: 0.85 });
}
