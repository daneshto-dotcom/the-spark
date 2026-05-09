/**
 * SPARK — mouse controls (Phase 1, P1 only).
 *
 * Interaction model:
 *   LMB-down on free spark in zone → AttractDrag (force toward cursor)
 *   LMB-up:
 *     - inside spawner zone  → release (spark stays free)
 *     - outside spawner zone → PICKUP_SPARK action (player → Carrying)
 *   While Carrying: cursor moves the carried spark directly.
 *   RMB-down while Carrying:
 *     - over an existing primitive → ConnectDrag, target highlighted
 *     - elsewhere                  → ConnectDrag, target=null (anchor place)
 *   RMB-up: PLACE_PRIMITIVE — carried spark commits as a Primitive,
 *           bonded to target (or as free-standing anchor if target=null).
 */

import type { Application } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHYSICS_HZ,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  type SparkType,
  type StiffnessTier,
} from '../constants.ts';
import { lookupCombo } from '../combos.ts';
import type { Spark } from '../game/spark.ts';
import type { Primitive } from '../game/primitive.ts';
import { dispatch } from '../state/world.ts';
import type { World } from '../state/world.ts';
import type { BondId, PlayerId, PrimitiveId, SparkId, Vec2 } from '../types.ts';

const PICK_RADIUS = 28;
const BOND_PICK_DIST = 8;
// On LMB-up outside the spawner zone, auto-bond to any primitive within
// this radius of the release point. Generous so dropping "near" a structure
// snaps cleanly. Bigger than PICK_RADIUS because PICK_RADIUS is for grabbing
// (precise) and this is for connecting (forgiving).
const AUTO_BOND_RADIUS = 60;
// S5 hot-fix: was 12_000 — paired with 20-80 initial velocity sparks already
// had momentum the player redirected; with the new 5-20 initial range attract
// must accelerate from near-rest, so bump 5×. This makes carried/attracted
// sparks track the cursor instead of crawling.
const ATTRACT_STRENGTH = 60_000;
const PHYSICS_DT = 1 / PHYSICS_HZ;

export type ControlState =
  | { readonly kind: 'Idle' }
  | {
      readonly kind: 'AttractDrag';
      readonly sparkId: SparkId;
      readonly cursor: Vec2;
    }
  | {
      readonly kind: 'ConnectDrag';
      readonly carriedSparkId: SparkId;
      readonly cursor: Vec2;
      readonly targetPrimitiveId: PrimitiveId | null;
    };

export class Controls {
  state: ControlState = { kind: 'Idle' };
  cursor: Vec2 = { x: 0, y: 0 };

  private capturedPointerId: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly world: World,
    private readonly playerId: PlayerId,
  ) {
    const canvas = app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    // S5 P4: pointerup on `window` so a release outside the canvas still
    // commits the drag. Pointer capture (set in onDown) keeps events flowing
    // back to the canvas during the gesture, but listening on window is a
    // belt-and-braces guarantee for fast drags / lost capture.
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('lostpointercapture', this.onLostCapture);
  }

  /** Apply attract force / cursor-lock per substep. Called from main loop. */
  applyPerSubstep(): void {
    const player = this.world.players.get(this.playerId);
    if (player === undefined) return;

    if (this.state.kind === 'AttractDrag') {
      const spark = this.world.freeSparks.get(this.state.sparkId);
      if (!spark || spark.state.kind !== 'Free') {
        this.state = { kind: 'Idle' };
        return;
      }
      const dx = this.state.cursor.x - spark.pos.x;
      const dy = this.state.cursor.y - spark.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      const k = ATTRACT_STRENGTH / Math.max(dist, 60); // softens at distance
      // Apply impulse via prevPos (this substep moves more than the previous).
      const subDt = PHYSICS_DT / 8;
      spark.prevPos.x -= (dx / dist) * k * subDt * subDt;
      spark.prevPos.y -= (dy / dist) * k * subDt * subDt;
    }

    if (player.kind === 'Carrying') {
      const carried = this.world.freeSparks.get(player.carriedSparkId);
      if (carried !== undefined) {
        carried.pos.x = this.cursor.x;
        carried.pos.y = this.cursor.y;
        carried.prevPos.x = this.cursor.x;
        carried.prevPos.y = this.cursor.y;
      }
    }
  }

  // === pointer handlers ===

  private onDown = (e: PointerEvent): void => {
    this.updateCursor(e);
    if (e.button === 0) {
      // LMB
      const player = this.world.players.get(this.playerId);
      if (player?.kind === 'Idle') {
        const spark = this.pickSpark();
        if (spark !== null) {
          this.state = {
            kind: 'AttractDrag',
            sparkId: spark.id,
            cursor: { ...this.cursor },
          };
          this.acquirePointerCapture(e);
        }
      }
    } else if (e.button === 2) {
      // RMB — connect (if carrying) or sever (if idle and on a bond).
      const player = this.world.players.get(this.playerId);
      if (player?.kind === 'Carrying') {
        this.state = {
          kind: 'ConnectDrag',
          carriedSparkId: player.carriedSparkId,
          cursor: { ...this.cursor },
          targetPrimitiveId: this.pickPrimitive(),
        };
        this.acquirePointerCapture(e);
      } else {
        const bondId = this.pickBond();
        if (bondId !== null) {
          dispatch(this.world, { type: 'SEVER_BOND', bondId });
        }
      }
    }
  };

  private onMove = (e: PointerEvent): void => {
    this.updateCursor(e);
    if (this.state.kind === 'AttractDrag') {
      this.state = { ...this.state, cursor: { ...this.cursor } };
    } else if (this.state.kind === 'ConnectDrag') {
      this.state = {
        ...this.state,
        cursor: { ...this.cursor },
        targetPrimitiveId: this.pickPrimitive(),
      };
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.updateCursor(e);
    if (e.button === 0 && this.state.kind === 'AttractDrag') {
      const spark = this.world.freeSparks.get(this.state.sparkId);
      if (spark !== undefined && spark.state.kind === 'Free') {
        // S7 P1: snap spark.pos to cursor BEFORE the in-zone check + dispatch.
        // Rationale: AttractDrag uses spring-with-distance-softening on prevPos
        // (see applyPerSubstep) so spark.pos lags the cursor with non-zero
        // inertia. Pre-S7, makePrimitiveFromSpark used spark.pos for placement
        // while pickPrimitiveInRange measured from cursor — the bond length was
        // dist(spark.pos→cursor) + dist(cursor→target.pos), which can span the
        // canvas when the player flicks the cursor. Snapping unifies the source
        // of truth on cursor: placement = cursor, auto-bond range = from cursor,
        // so bond length ≤ AUTO_BOND_RADIUS by construction.
        //
        // Side effect (intentional): dragging the cursor back into the zone now
        // cancels the place — spark stays Free wherever the cursor settled.
        // Aligns with the mental model "release where you point."
        spark.pos.x = this.cursor.x;
        spark.pos.y = this.cursor.y;
        spark.prevPos.x = this.cursor.x;
        spark.prevPos.y = this.cursor.y;
        const inZone = this.isInsideSpawnerZone(spark.pos);
        if (!inZone) {
          // S5 hot-fix: single-action place. PICKUP then immediately PLACE so
          // the released spark lands where the player let go (instead of
          // following the cursor in Carrying state). Auto-bonds to any
          // primitive within AUTO_BOND_RADIUS of the release point so chained
          // construction feels natural — RMB drag is still available for
          // precise targeting.
          //
          // S6 P1: capture spark.type BEFORE dispatch — defensive against any
          // future change that might transform/remove the spark inside
          // PICKUP_SPARK. Combo lookup then takes a SparkType directly,
          // eliminating the post-dispatch Map re-lookup that prompted the
          // S5-end "tier defaulted to MID" investigation.
          const carriedType = spark.type;
          dispatch(this.world, {
            type: 'PICKUP_SPARK',
            sparkId: spark.id,
            playerId: this.playerId,
          });
          const targetId = this.pickPrimitiveInRange(AUTO_BOND_RADIUS);
          const target = targetId !== null
            ? this.world.primitives.get(targetId) ?? null
            : null;
          const tier = computeStiffnessTier(carriedType, target);
          dispatch(this.world, {
            type: 'PLACE_PRIMITIVE',
            playerId: this.playerId,
            targetPrimitiveId: target?.id ?? null,
            stiffnessTier: tier,
          });
        }
      }
      this.releasePointerCapture(e);
      this.state = { kind: 'Idle' };
    } else if (e.button === 2 && this.state.kind === 'ConnectDrag') {
      const player = this.world.players.get(this.playerId);
      if (player?.kind === 'Carrying') {
        const carried = this.world.freeSparks.get(player.carriedSparkId);
        const target = this.state.targetPrimitiveId !== null
          ? this.world.primitives.get(this.state.targetPrimitiveId) ?? null
          : null;
        // Carried spark always exists at this point (FSM invariant); fall
        // through to MID only if a future code path violates that.
        const tier = carried !== undefined
          ? computeStiffnessTier(carried.type, target)
          : 'MID';
        dispatch(this.world, {
          type: 'PLACE_PRIMITIVE',
          playerId: this.playerId,
          targetPrimitiveId: target?.id ?? null,
          stiffnessTier: tier,
        });
      }
      this.releasePointerCapture(e);
      this.state = { kind: 'Idle' };
    }
  };

  // S5 P4: capture lost (e.g. browser stole focus, alt-tab during drag) →
  // safest action is to drop to Idle so a stuck AttractDrag/ConnectDrag
  // doesn't linger after the gesture is gone.
  private onLostCapture = (): void => {
    this.capturedPointerId = null;
    if (this.state.kind !== 'Idle') this.state = { kind: 'Idle' };
  };

  private acquirePointerCapture(e: PointerEvent): void {
    try {
      this.app.canvas.setPointerCapture(e.pointerId);
      this.capturedPointerId = e.pointerId;
    } catch {
      // Some browsers reject capture if the element isn't focusable; not fatal.
    }
  }

  private releasePointerCapture(e: PointerEvent): void {
    if (this.capturedPointerId !== null) {
      try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      this.capturedPointerId = null;
    }
  }

  // S5 P3: Map client-px → stage-px. The previous formula used
  // `canvas.width / rect.width`, which is `dpr × (stageW / rectW)` —
  // double-counting DPR on HiDPI displays. The right scale is purely the
  // stage-to-CSS-rect ratio: stage coord = (client - rectOrigin) × stageW/rectW.
  // This works correctly when the canvas is shown at its native CSS size
  // (then the ratio is 1) AND when external CSS scales it to a different
  // visible size (e.g. a constrained container).
  private updateCursor(e: PointerEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = CANVAS_WIDTH / rect.width;
    const sy = CANVAS_HEIGHT / rect.height;
    this.cursor.x = (e.clientX - rect.left) * sx;
    this.cursor.y = (e.clientY - rect.top) * sy;
  }

  private pickSpark(): Spark | null {
    let best: Spark | null = null;
    let bestDistSq = PICK_RADIUS * PICK_RADIUS;
    for (const s of this.world.freeSparks.values()) {
      if (s.state.kind !== 'Free') continue;
      const dx = s.pos.x - this.cursor.x;
      const dy = s.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        best = s;
        bestDistSq = d2;
      }
    }
    return best;
  }

  private pickPrimitive(): PrimitiveId | null {
    return this.pickPrimitiveInRange(PICK_RADIUS);
  }

  private pickPrimitiveInRange(radius: number): PrimitiveId | null {
    let best: Primitive | null = null;
    let bestDistSq = radius * radius;
    for (const p of this.world.primitives.values()) {
      const dx = p.pos.x - this.cursor.x;
      const dy = p.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        best = p;
        bestDistSq = d2;
      }
    }
    return best?.id ?? null;
  }

  private pickBond(): BondId | null {
    let bestId: BondId | null = null;
    let bestDist = BOND_PICK_DIST;
    for (const bond of this.world.bonds.values()) {
      const d = distToSegment(
        this.cursor.x, this.cursor.y,
        bond.a.pos.x, bond.a.pos.y,
        bond.b.pos.x, bond.b.pos.y,
      );
      if (d < bestDist) {
        bestDist = d;
        bestId = bond.id;
      }
    }
    return bestId;
  }

  private isInsideSpawnerZone(p: Vec2): boolean {
    const dx = p.x - SPAWNER_CENTER_X;
    const dy = p.y - SPAWNER_CENTER_Y;
    return dx * dx + dy * dy <= SPAWNER_RADIUS * SPAWNER_RADIUS;
  }
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Pick the stiffness tier for a new bond. If a target primitive exists, the
 * combo table decides (carried.type → target.type). If no target (anchor),
 * default MID.
 *
 * S6 P1: takes SparkType directly (was: SparkId + World re-lookup). Caller
 * captures the carried type BEFORE PICKUP_SPARK dispatch so this function
 * can't be foiled by mid-flight state mutation.
 */
function computeStiffnessTier(
  carriedType: SparkType,
  target: Primitive | null,
): StiffnessTier {
  if (target === null) return 'MID';
  return lookupCombo(carriedType, target.type).stiffnessTier;
}
