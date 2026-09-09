/**
 * SPARK — S98 P3: drag-time connection PREVIEW overlay.
 *
 * While the player drags a primitive out of the spawner (controls.state ===
 * 'AttractDrag'), draw a pulsating, faded version of EXACTLY the bond(s) it
 * would form at the current position — so the player sees, before releasing,
 * the connect distance and how many connectors it will make. On release the
 * real bond commits (existing placePrimitive path) at full opacity in the
 * player+shape colour, and this preview clears (drag ended).
 *
 * Fidelity: the bond set comes from computePreviewBonds, which calls the SAME
 * host-authoritative pickers the placement reducer uses (so preview == release
 * on host/solo; joiner is best-effort under snapshot lag — pre-existing netcode).
 * The drawn silhouette is the SAME drawBondVisual the live board + Combo Codex
 * use, keyed by the predicted lookupCombo(draggedType, targetType).visualEffectId,
 * so the preview looks like the committed bond — just faded + breathing.
 *
 * Layer: a single Graphics on app.stage, constructed right after StructureRenderer
 * so it sits ABOVE the board (bonds/prims) but BELOW effects/avatar/fog/HUD and
 * the aboveFogLayer (NOT added to aboveFogLayer → the fog.spec children contract
 * is untouched; a personal build hint is local-only, so own-stage/fogged is
 * consistent with "visible-to-all iff can-affect-all"). Cleared + redrawn each
 * frame (drawBondVisual never clears — the caller does, like StructureRenderer).
 * Render-only: zero netcode / sim / world mutation.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { lookupCombo } from '../combos.ts';
import { computePreviewBonds } from '../input/dragPreview.ts';
import type { Controls } from '../input/controls.ts';
import { isNetworked } from '../state/world.ts';
import type { World } from '../state/worldTypes.ts';
import { drawBondVisual } from './bondVisualRenderer.ts';

// Pulse: wall-clock sine so it keeps breathing even when the sim is paused
// mid-drag (e.g. during a NONET). HZ well below the strobe range (cf. hazardRing
// 0.8Hz / nonetCelebration 0.95Hz). Alpha sweeps [BASE-AMP, BASE+AMP] = [0.17,
// 0.73] (always valid, no clamp needed) — clearly "not committed" vs the live
// bond's 0.85.
const PREVIEW_PULSE_HZ = 0.9;
const PREVIEW_ALPHA_BASE = 0.45;
const PREVIEW_ALPHA_AMP = 0.28;
const PREVIEW_BOND_WIDTH = 4;

export class DragPreviewRenderer {
  private readonly g: Graphics;

  /*
   * ⭐⭐ S170 P1 (owner) — `parent` DEFAULTS TO `app.stage`, AND THE DEFAULT IS THE OLD BUG.
   *
   * Owner, on what the fog is for: *"Fog is just what hides. You have the buildings, the enemy
   * sparks, the connectors that are being built, the unbuilt buildings, the freeform buildings, the
   * spawn."* And on how it broke: *"once we started putting towers, like, real buildings that we've
   * generated, that's when they started being visible. Like, everything else was hidden."*
   *
   * That is the whole history of this defect. A renderer that attaches itself to `app.stage` lands
   * ABOVE or BELOW the fog purely by WHEN it was constructed, so every new art renderer arrived
   * visible-through-the-fog by accident. Taking the parent as an argument is what makes concealment
   * a DECISION at the call site instead of a side effect of construction order.
   */
  constructor(app: Application, parent: Container = app.stage) {
    this.g = new Graphics();
    parent.addChild(this.g);
  }

  sync(world: World, controls: Controls): void {
    const g = this.g;
    g.clear();
    if (controls.state.kind !== 'AttractDrag') return;
    const spark = world.freeSparks.get(controls.state.sparkId);
    if (spark === undefined) return;
    const player = world.players.get(controls.getPlayerId());
    if (player === undefined) return;

    // Same reference position onUp uses: host/solo picks from the (lerp-lagged)
    // spark.pos, a joiner from the raw cursor (controls.ts targetRefPos).
    const isClient = isNetworked(world) && !world.isHost;
    const refPos = isClient ? controls.cursor : spark.pos;
    const bonds = computePreviewBonds(world, refPos, controls.getPlayerId(), player.color, !isClient);

    const tSec = performance.now() / 1000;
    const alpha = PREVIEW_ALPHA_BASE + PREVIEW_ALPHA_AMP * Math.sin(tSec * PREVIEW_PULSE_HZ * Math.PI * 2);

    const drawTo = (targetId: typeof bonds.primaryId): void => {
      if (targetId === null) return;
      const target = world.primitives.get(targetId);
      if (target === undefined) return;
      drawBondVisual(g, {
        ax: refPos.x,
        ay: refPos.y,
        bx: target.pos.x,
        by: target.pos.y,
        // Predict the combo the join WOULD make → the preview shows the real shape.
        visualEffectId: lookupCombo(spark.type, target.type).visualEffectId,
        // The committed bond takes the placing player's colour (placerColor).
        colorA: player.color,
        colorB: player.color,
        alpha,
        width: PREVIEW_BOND_WIDTH,
        tick: world.tick,
      });
    };

    drawTo(bonds.primaryId);
    for (const id of bonds.redundancyIds) drawTo(id);
    for (const id of bonds.mergeIds) drawTo(id);
  }

  destroy(): void {
    this.g.destroy();
  }
}
