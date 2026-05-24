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
  REDUNDANT_BOND_ANGLE_EPSILON,
  REDUNDANT_BOND_K,
  REDUNDANT_BOND_MAX_CANDIDATES,
  REDUNDANT_BOND_MIN_ANGLE_RAD,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  type SparkType,
  type StiffnessTier,
} from '../constants.ts';
import { lookupCombo } from '../combos.ts';
import type { Spark } from '../game/spark.ts';
import type { Primitive } from '../game/primitive.ts';
import { componentOf } from '../game/structure.ts';
import { cssToCanvasCoords } from '../render/lobbyScreen.ts';
import { dispatch } from '../state/world.ts';
import type { GameAction, World } from '../state/world.ts';
import type { BondId, PlayerId, PrimitiveId, SparkId, Vec2 } from '../types.ts';
import { pickRedundantBondTargets } from './redundantBondTargets.ts';

/**
 * S15 P2 — dispatcher injection. Solo / host mode passes a fn that calls
 * dispatch(world, action) locally. Client mode passes a fn that wraps the
 * action as an Intent envelope and sends over the network transport (host
 * applies authoritatively, snapshot returns ~RTT/2 later). controls.ts has
 * no direct net dependency; main.ts decides the wiring.
 */
export type ControlsDispatchFn = (action: GameAction) => void;

/** Default dispatcher: solo path. Equivalent to pre-S15 controls behavior. */
export function makeLocalDispatcher(world: World): ControlsDispatchFn {
  return (action) => { dispatch(world, action); };
}

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
  /**
   * S15 P2 — mutable (was readonly). Solo / host stays at playerId 0; joiner
   * client is set to playerId 1 by main.ts after lobby completes.
   */
  private playerId: PlayerId;
  private readonly dispatchFn: ControlsDispatchFn;

  private capturedPointerId: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly world: World,
    playerId: PlayerId,
    dispatchFn?: ControlsDispatchFn,
  ) {
    this.playerId = playerId;
    this.dispatchFn = dispatchFn ?? makeLocalDispatcher(world);
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
    // S42 — Space-key → END_TURN handler DELETED. The 1v1 mode was
    // incorrectly shipped as turn-based hotseat (S15 P2). Real-time
    // gameplay per blueprint requires no turn-flip input.
  }

  /**
   * S15 P2 — set the local player's id (used when client joins as P2).
   * Has no effect on FSM state; only changes future action attribution.
   */
  setPlayerId(id: PlayerId): void {
    this.playerId = id;
  }

  getPlayerId(): PlayerId {
    return this.playerId;
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

  /**
   * S22 P3 D6 — asymmetric input-lock guard. During a godly cinematic, the
   * triggering player's input is gated (they're watching the cinematic);
   * the OPPONENT remains free to build counter-structures. Solo mode locks
   * the only player. Returns true if input is currently locked for this
   * Controls instance's playerId.
   */
  private isInputLocked(): boolean {
    return this.world.activeCinematicPlayerId === this.playerId;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.isInputLocked()) return;
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
          // S17 P1 Phase-2 §VIII.3 row 1: player-cause cause runs through
          // host auth + charge gate; physics-cause path is reserved for
          // main.ts overstretch loop.
          this.dispatchFn({ type: 'SEVER_BOND', bondId, playerId: this.playerId, cause: 'player' });
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
    if (this.isInputLocked()) return;
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
        //
        // S45 BUG-CRITICAL-3 Sym A — client-mode (joiner) bypasses both
        // gates and uses cursor as placement reference. Joiner's spark.pos
        // is host-authoritative + constantly snapshot-overwritten, so the
        // local reach + zone gates fire unreliably (Council R2 C1 root
        // cause). Host validates intents authoritatively: PICKUP_SPARK
        // checks spark.state==='Free'; PLACE_PRIMITIVE checks player.kind
        // ==='Carrying' + spawner-zone gate via spark.pos (which the prior
        // PICKUP_SPARK reducer has already snapped to carrier's avatarPos).
        // Host's own non-1v1 / host-mode controls keep the gates — joiner
        // bypass is the narrowest scope necessary to fix the regression.
        const isClient = this.world.gameMode === '1v1' && !this.world.isHost;
        const targetRefPos = isClient ? this.cursor : spark.pos;
        const reachDx = this.cursor.x - spark.pos.x;
        const reachDy = this.cursor.y - spark.pos.y;
        const reachable = isClient
          ? true
          : reachDx * reachDx + reachDy * reachDy <=
            MAX_RELEASE_REACH * MAX_RELEASE_REACH;
        const inZone = isClient ? false : this.isInsideSpawnerZone(spark.pos);
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
          this.dispatchFn({
            type: 'PICKUP_SPARK',
            sparkId: spark.id,
            playerId: this.playerId,
          });
          // S45 Sym A — target picking uses targetRefPos (cursor in client
          // mode, spark.pos in host/solo) so joiner's intent reflects where
          // their cursor was at release, not their stale snapshot spark.pos.
          const targetId = this.pickPrimitiveInRange(AUTO_BOND_RADIUS, targetRefPos);
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
          const mergeCandidateIds = this.allPrimitivesInRange(MERGE_REACH_RADIUS, targetRefPos);
          // S14 P2.1: if we have a primary target, also look for up to K-1
          // additional bond targets in the same connected component within
          // AUTO_BOND_RADIUS — the "redundancy bonds" that make a placement
          // form a small triangulated cell instead of a single edge.
          // Anchor placements (target === null) get no redundancy bonds —
          // there is no primary component to triangulate within.
          const extraBondTargetIds: PrimitiveId[] = target !== null
            ? this.redundantBondTargetsInSameComponent(target, targetRefPos)
            : [];
          this.dispatchFn({
            type: 'PLACE_PRIMITIVE',
            playerId: this.playerId,
            targetPrimitiveId: target?.id ?? null,
            stiffnessTier: tier,
            mergeCandidateIds,
            extraBondTargetIds,
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
        this.dispatchFn({
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

  // S42 — onKeyDown SPACE → END_TURN handler DELETED. See constructor
  // comment. Real-time 1v1 has no turn-flip input.

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

  // S5 P3: Map client-px → stage-px. Previously used non-uniform
  // `CANVAS_WIDTH/rect.width` for X and `CANVAS_HEIGHT/rect.height` for Y.
  //
  // S39 P2 (BUG-B fix): the canvas is rendered with `object-fit: contain`
  // (Pixi default). At any viewport aspect that doesn't match the canvas
  // aspect, the canvas content is letterboxed inside the CSS box — the
  // visible canvas content occupies only a SUB-RECT of getBoundingClientRect.
  // The pre-S39 non-uniform formula gave correct mapping ONLY at matched
  // aspect; at any other aspect the cursor mapping diverged from the actual
  // visual canvas content by up to the letterbox-bar size, with maximum drift
  // at the visible canvas edges (the user-reported "cursor and avatar aren't
  // aligned, especially around the edges"). cssToCanvasCoords (lobbyScreen.ts)
  // computes the letterbox-aware uniform scale so the cursor is visually
  // coincident with the OS cursor at every viewport aspect.
  private updateCursor(e: PointerEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const { x, y } = cssToCanvasCoords(
      rect,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      e.clientX,
      e.clientY,
    );
    this.cursor.x = x;
    this.cursor.y = y;
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

  /**
   * S14 P2.1 — pick up to K-1 additional bond targets in `primary`'s
   * connected component. Thin wrapper that computes the component set
   * + delegates the geometric algorithm to the exported pure function
   * `pickRedundantBondTargets` (testable without a Pixi Application).
   * S10 #test-via-pure-helper-export pattern.
   */
  private redundantBondTargetsInSameComponent(
    primary: Primitive,
    newPrimPos: Vec2,
  ): PrimitiveId[] {
    if (REDUNDANT_BOND_K <= 1) return [];
    const comp = componentOf(primary, this.world.primitives, this.world.bonds);
    if (comp.primitiveIds.size <= 1) return [];
    return pickRedundantBondTargets({
      primary: { id: primary.id, pos: primary.pos },
      componentIds: comp.primitiveIds,
      primitives: this.world.primitives,
      newPrimPos,
      radius: AUTO_BOND_RADIUS,
      k: REDUNDANT_BOND_K,
      minAngleRad: REDUNDANT_BOND_MIN_ANGLE_RAD,
      angleEpsilon: REDUNDANT_BOND_ANGLE_EPSILON,
      maxCandidates: REDUNDANT_BOND_MAX_CANDIDATES,
    });
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
