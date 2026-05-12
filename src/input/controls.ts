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
  ATTRACT_FOLLOW_RATE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MERGE_REACH_RADIUS,
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
//
// S13 P1: AUTO_BOND_RADIUS now governs PRIMARY target picking only. The
// cross-structure merge sweep uses the wider MERGE_REACH_RADIUS from
// constants.ts. Split rationale: primary precision (which structure you
// "really" meant to land on) vs merge reach (which OTHER structures get
// pulled into the new connection). Closes the post-S12 playtest report
// that placing in the middle of three structures only merges with one.
const AUTO_BOND_RADIUS = 60;
// S9 P1: max distance cursor can be from spark.pos at LMB-up for the place
// to commit. Replaces S7's snap-to-cursor — without this gate the user could
// pickup a spark, flick cursor across the canvas, release, and have the
// spark teleport to wherever the cursor was. Now the spark has to physically
// catch up. 120px ≈ 2× AUTO_BOND_RADIUS — generous enough that normal play
// feels permissive, tight enough that a flick fails fast. S10 P1's position-
// lerp follow keeps spark.pos within a few px of cursor at LMB-up so this
// gate now fires only on real cursor flicks (intentional cheese-prevention).
const MAX_RELEASE_REACH = 120;

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
      // S10 P1: position-lerp follow. Replaces S5-era impulse-on-prevPos
      // (k = ATTRACT_STRENGTH / max(dist, 60), pushed against prevPos under
      // verlet damping 0.998) which produced a slow pendulum: the spark
      // built momentum toward the cursor, overshot, swung back. User read
      // this as "stupid magnet slowly swinging back and forward."
      //
      // Lerping spark.pos directly and restoring prevPos = old pos keeps
      // residual velocity = lerp delta (not impulse-accumulated), so verlet
      // still gives the spark a tiny "alive" feel during follow but cannot
      // overshoot. Snappy, no swing. Pure position math = no force/dt
      // coupling either.
      stepAttractLerp(spark.pos, spark.prevPos, this.state.cursor, ATTRACT_FOLLOW_RATE);
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
        // S9 P1: reachability gate. spark.pos lags the cursor because
        // AttractDrag uses softened impulses on prevPos in applyPerSubstep —
        // so a fast cursor flick lets the player effectively teleport the
        // spark by releasing far from where it physically is. S7 hid this by
        // snapping spark.pos = cursor on release; S9 removes the snap and
        // gates instead: if the spark hasn't caught up to within
        // MAX_RELEASE_REACH of the cursor, reject the place — spark stays
        // Free where its physics put it, player can try again. Bond length
        // is bounded by spark.pos (placement coord) → target.pos via
        // pickPrimitiveInRange measuring from spark.pos.
        const reachDx = this.cursor.x - spark.pos.x;
        const reachDy = this.cursor.y - spark.pos.y;
        const reachable =
          reachDx * reachDx + reachDy * reachDy <=
          MAX_RELEASE_REACH * MAX_RELEASE_REACH;
        const inZone = this.isInsideSpawnerZone(spark.pos);
        if (reachable && !inZone) {
          // S5 hot-fix: single-action place. PICKUP then immediately PLACE so
          // the released spark lands where it physically is. Auto-bonds to
          // any primitive within AUTO_BOND_RADIUS of spark.pos so chained
          // construction feels natural — RMB drag is still available for
          // precise targeting.
          //
          // S6 P1: capture spark.type BEFORE dispatch — defensive against any
          // future change that might transform/remove the spark inside
          // PICKUP_SPARK.
          const carriedType = spark.type;
          dispatch(this.world, {
            type: 'PICKUP_SPARK',
            sparkId: spark.id,
            playerId: this.playerId,
          });
          const targetId = this.pickPrimitiveInRange(AUTO_BOND_RADIUS, spark.pos);
          const target = targetId !== null
            ? this.world.primitives.get(targetId) ?? null
            : null;
          const tier = computeStiffnessTier(carriedType, target);
          // S9 P2 → S13 P1: collect every primitive within
          // MERGE_REACH_RADIUS (wider than AUTO_BOND_RADIUS) so
          // placePrimitive can merge adjacent structures even when the
          // primary target is the only one strictly within picking
          // distance. The primary target above remains the bond that
          // carries the caller-authored stiffness tier; dispatch dedups
          // by connected component AND picks the nearest primitive per
          // component (S13 P1) so each surrounding structure gets one
          // merge bond at the shortest reachable hop.
          const mergeCandidateIds = this.allPrimitivesInRange(MERGE_REACH_RADIUS, spark.pos);
          dispatch(this.world, {
            type: 'PLACE_PRIMITIVE',
            playerId: this.playerId,
            targetPrimitiveId: target?.id ?? null,
            stiffnessTier: tier,
            mergeCandidateIds,
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

  private pickPrimitiveInRange(radius: number, center?: Vec2): PrimitiveId | null {
    const cx = center?.x ?? this.cursor.x;
    const cy = center?.y ?? this.cursor.y;
    let best: Primitive | null = null;
    let bestDistSq = radius * radius;
    for (const p of this.world.primitives.values()) {
      const dx = p.pos.x - cx;
      const dy = p.pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        best = p;
        bestDistSq = d2;
      }
    }
    return best?.id ?? null;
  }

  /**
   * S9 P2: collect every primitive within `radius` of `center` (in any
   * order). Used by the LMB-up auto-bond path to feed placePrimitive's
   * cross-structure merge sweep. Single-target pickPrimitiveInRange returns
   * the nearest one — this returns the full set.
   */
  private allPrimitivesInRange(radius: number, center: Vec2): PrimitiveId[] {
    const r2 = radius * radius;
    const ids: PrimitiveId[] = [];
    for (const p of this.world.primitives.values()) {
      const dx = p.pos.x - center.x;
      const dy = p.pos.y - center.y;
      if (dx * dx + dy * dy <= r2) ids.push(p.id);
    }
    return ids;
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

/**
 * S10 P1: one position-lerp step for AttractDrag. Pure function, exported so
 * the controls.test.ts equivalent can validate the math without spinning up
 * a Pixi Application + DOM. Mutates `pos` and `prevPos` in place to match
 * the on-spark mutation contract used by applyPerSubstep.
 */
export function stepAttractLerp(
  pos: { x: number; y: number },
  prevPos: { x: number; y: number },
  cursor: { x: number; y: number },
  rate: number,
): void {
  const oldX = pos.x, oldY = pos.y;
  pos.x = oldX + (cursor.x - oldX) * rate;
  pos.y = oldY + (cursor.y - oldY) * rate;
  prevPos.x = oldX;
  prevPos.y = oldY;
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
