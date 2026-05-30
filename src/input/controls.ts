/**
 * SPARK — mouse controls (Phase 1+2, networked 1v1).
 *
 * Interaction model (post-S52 P1 atomic LMB-up + S53 P2 ConnectDrag removal):
 *   LMB-down on free spark in zone → AttractDrag (force-lerp toward cursor).
 *   LMB-up outside spawner zone (and not in enemy territory + within reach):
 *     atomic PLACE_FROM_FREE — spark commits in one transaction as a placed
 *     Primitive at cursor, auto-bonded to nearest in-range same-color
 *     primitive (or anchor if none). All preconditions validated BEFORE the
 *     commit per Council R1 C3 (S52). No Carrying intermediate state exposed
 *     to subsequent input handlers — frame-scoped atomic execution.
 *   RMB-down on a bond → SEVER_BOND (player-cause; 1v1: gated on cross-color
 *     + 1 disruptionCharge per §VIII.3, S52 P2 amendment: every hostile
 *     sever costs 1 charge regardless of cycle topology).
 *   Q key (1v1 PLAYING only) → SHRINK_TERRITORY disruption (1 charge,
 *     S49 P1 Sym F).
 *
 * S53 P2 — RMB ConnectDrag (carry-then-aim-then-place precise targeting)
 * removed. Post-S52 P1 there is no public path that puts player.kind into
 * the 'Carrying' state (atomic PLACE_FROM_FREE commits transactionally
 * within a single reducer call). The legacy RMB-down-while-Carrying ->
 * ConnectDrag -> RMB-up -> PLACE_PRIMITIVE flow was unreachable. Removed:
 * ConnectDrag ControlState variant + onDown/onMove/onUp ConnectDrag
 * branches + pickPrimitive wrapper + structureRenderer.drawPreview.
 */

import type { Application } from 'pixi.js';
import {
  ATTRACT_FOLLOW_RATE,
  AUTO_BOND_RADIUS,
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
import { isInsideEnemyTerritory } from '../state/territory.ts';

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
// S48 P2 (Sym C fix) — constant promoted to constants.ts so host
// placePrimitive can re-pick targets on remote-origin intents with
// the same radius.
// S9 P1: max distance cursor can be from spark.pos at LMB-up for the place
// to commit. Replaces S7's snap-to-cursor — without this gate the user could
// pickup a spark, flick cursor across the canvas, release, and have the
// spark teleport to wherever the cursor was. Now the spark has to physically
// catch up. 120px ≈ 2× AUTO_BOND_RADIUS — generous enough that normal play
// feels permissive, tight enough that a flick fails fast. S10 P1's position-
// lerp follow keeps spark.pos within a few px of cursor at LMB-up so this
// gate now fires only on real cursor flicks (intentional cheese-prevention).
const MAX_RELEASE_REACH = 120;

/**
 * S52 P1 (Council C4 Gemini #2 HIGH) — after LMB-up dispatches PLACE_FROM_FREE,
 * keep the spark dragLocked for this many ms so the joiner's local-cursor
 * spark position isn't clobbered by snapshot interpolation in the brief
 * window between intent send and host-snapshot arrival. Typical Trystero/Nostr
 * RTT/2 is 50-100ms; 300ms covers worst-case slow networks. After TTL, the
 * spark either no longer exists in the snapshot (host consumed it on placement
 * commit) so the lerp is a no-op anyway, or the placement was rejected and
 * the snapshot brings spark.pos back to its authoritative position — natural
 * convergence either way.
 */
const PENDING_PLACE_DRAG_LOCK_MS = 300;

export type ControlState =
  | { readonly kind: 'Idle' }
  | {
      readonly kind: 'AttractDrag';
      readonly sparkId: SparkId;
      readonly cursor: Vec2;
    };
// S53 P2 — ConnectDrag variant removed. See header docstring for rationale.

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

  /**
   * S52 P1 (Council C4) — transient dragLock state set after LMB-up dispatches
   * PLACE_FROM_FREE. Read by main.ts via getDragLockedSparkId() and passed to
   * clientSync.interpolateInto so the snapshot lerp skips this spark during
   * the in-flight window between intent and host snapshot. Self-cleared on
   * read after PENDING_PLACE_DRAG_LOCK_MS ms.
   */
  private pendingPlaceFromFree: { sparkId: SparkId; sentAt: number } | null = null;

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
    // S49 P1 (Sym F) — Q key → SHRINK_TERRITORY disruption (1v1 only).
    window.addEventListener('keydown', this.onKeyDown);
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

  /**
   * S52 P1 Council C4 — dragLock sparkId for the joiner's local-cursor spark
   * during AttractDrag AND for PENDING_PLACE_DRAG_LOCK_MS after LMB-up
   * dispatches PLACE_FROM_FREE. main.ts passes this to clientSync.interpolateInto
   * so snapshot interpolation skips the locked spark and the joiner sees their
   * own cursor-tracking spark position without snapshot clobber.
   *
   * Returns null when no spark is currently dragLocked (Idle state + no
   * pending placement, or TTL elapsed). Self-clears the pending entry on TTL.
   */
  getDragLockedSparkId(): SparkId | null {
    if (this.state.kind === 'AttractDrag') return this.state.sparkId;
    if (this.pendingPlaceFromFree !== null) {
      const elapsed = performance.now() - this.pendingPlaceFromFree.sentAt;
      if (elapsed < PENDING_PLACE_DRAG_LOCK_MS) {
        return this.pendingPlaceFromFree.sparkId;
      }
      this.pendingPlaceFromFree = null;
    }
    return null;
  }

  /** Apply attract force / cursor-lock per substep. Called from main loop. */
  applyPerSubstep(): void {
    const player = this.world.players.get(this.playerId);
    if (player === undefined) return;

    if (this.state.kind === 'AttractDrag') {
      const spark = this.world.freeSparks.get(this.state.sparkId);
      // S58 (#2) — the spark is now CLAIMED (Carried{me}) on LMB-down, so the
      // drag must keep driving a spark that is Free (pre-claim / solo / the
      // 1-frame pre-host-confirm window) OR Carried by ME. It ends cleanly
      // (state→Idle) only if the spark is gone, consumed (Bonded), or grabbed
      // by the OPPONENT (Carried by them) — the race-lost reconciliation.
      const mine =
        spark !== undefined &&
        (spark.state.kind === 'Free' ||
          (spark.state.kind === 'Carried' && spark.state.carrierId === this.playerId));
      if (!mine) {
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

    // S58 (#2) — when actively AttractDragging, the lerp above is the sole local
    // driver (preserves the S10/S56 drag feel). This hard-snap branch only runs
    // for a Carrying-without-gesture state (defensive fallback) so the carried
    // spark still tracks the cursor if a drag ever ends while still Carrying.
    if (player.kind === 'Carrying' && this.state.kind !== 'AttractDrag') {
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
          // S58 (#2) — authoritative CLAIM on grab. Transitions the spark to
          // Carried{me} (host-authoritative; predicted locally via
          // PREDICTABLE_ACTIONS). The opponent then can't also grab it — their
          // pickSpark skips non-Free sparks and their in-flight AttractDrag
          // auto-cancels (applyPerSubstep `mine` guard) — and they SEE it
          // attached in my colour (renderer.ts Carried tint + the S45
          // avatarPos→carried-spark coupling propagates its position at 10Hz).
          // The claim is GUARANTEED released on LMB-up / lost-capture (DROP
          // below), so the S52 "glued spark" stuck-state cannot recur. pos =
          // live cursor (authoritative claim point; host re-validates remote).
          this.dispatchFn({
            type: 'PICKUP_SPARK',
            sparkId: spark.id,
            playerId: this.playerId,
            pos: { x: this.cursor.x, y: this.cursor.y },
          });
        }
      }
    } else if (e.button === 2) {
      // RMB-down on a bond → SEVER_BOND (player-cause). S53 P2: simplified.
      // Pre-S53 this branch ALSO entered ConnectDrag when player.kind was
      // 'Carrying' — but post-S52 P1 atomic LMB-up, no public path reaches
      // Carrying state, so the ConnectDrag branch was unreachable. Now
      // SEVER_BOND is the sole RMB-down behavior, still gated on
      // pickBond() returning a hit (else: silent no-op).
      //
      // S17 P1 §VIII.3: player-cause runs through host auth + charge gate
      // (cross-color + 1 disruptionCharge in 1v1); physics-cause path is
      // reserved for main.ts overstretch loop.
      const bondId = this.pickBond();
      if (bondId !== null) {
        this.dispatchFn({ type: 'SEVER_BOND', bondId, playerId: this.playerId, cause: 'player' });
      }
    }
  };

  private onMove = (e: PointerEvent): void => {
    this.updateCursor(e);
    if (this.state.kind === 'AttractDrag') {
      this.state = { ...this.state, cursor: { ...this.cursor } };
    }
    // S53 P2 — ConnectDrag branch removed (unreachable state post-S52 P1).
  };

  private onUp = (e: PointerEvent): void => {
    if (this.isInputLocked()) return;
    this.updateCursor(e);
    if (e.button === 0 && this.state.kind === 'AttractDrag') {
      const spark = this.world.freeSparks.get(this.state.sparkId);
      // S58 (#2) — accept the spark whether still Free (solo / pre-host-confirm)
      // or Carried by me (the LMB-down claim landed). A spark grabbed by the
      // opponent in a race (Carried by them) fails `mine` → no place, and the
      // releasePointerCapture + state→Idle below still run.
      const mine =
        spark !== undefined &&
        (spark.state.kind === 'Free' ||
          (spark.state.kind === 'Carried' && spark.state.carrierId === this.playerId));
      if (spark !== undefined && mine) {
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
        // S55 P3 — gate composition extracted to the pure computeReleaseGates
        // (testable without a Pixi Application / DOM). The isClient bypass
        // (S45 BUG-CRITICAL-3 Sym A + S49 Sym F: a joiner trusts the host's
        // authoritative reach / spawner-zone / enemy-territory checks because
        // its snapshot-lagged world makes the local gates fire unreliably)
        // lives inside the helper. Zone + territory are probed ONLY for the
        // host here, preserving the original short-circuit — isInsideEnemyTerritory
        // is never called in client mode.
        const gates = computeReleaseGates({
          isClient,
          reachDistSq: reachDx * reachDx + reachDy * reachDy,
          maxReleaseReachSq: MAX_RELEASE_REACH * MAX_RELEASE_REACH,
          hostInZone: isClient ? false : this.isInsideSpawnerZone(spark.pos),
          hostInTerritory: isClient
            ? false
            : isInsideEnemyTerritory(spark.pos, this.playerId, this.world),
        });
        // S58 (#2) — release the LMB-down claim. DROP returns the spark to Free
        // + player to Idle, which (a) GUARANTEES every LMB-up exits the claim
        // (the S52 "glued spark" stuck-state cannot recur) and (b) restores the
        // Free/Idle preconditions the UNCHANGED atomic PLACE_FROM_FREE below
        // requires. Guarded on actually-carrying THIS spark so a race-lost claim
        // (opponent grabbed first → I'm Idle) doesn't throw CarryViolation on
        // the host's un-try/caught dispatch path.
        const carrier = this.world.players.get(this.playerId);
        if (carrier?.kind === 'Carrying' && carrier.carriedSparkId === spark.id) {
          this.dispatchFn({
            type: 'DROP_SPARK',
            playerId: this.playerId,
            pos: { x: this.cursor.x, y: this.cursor.y },
          });
        }
        if (gates.commit) {
          // S52 P1 — atomic PLACE_FROM_FREE single intent replaces the S5-era
          // PICKUP_SPARK+PLACE_PRIMITIVE burst. The burst pattern had a
          // critical defect for the joiner: when PLACE_PRIMITIVE silently
          // rejected (spawner-zone, target-missing race, territory hard
          // block), the prior PICKUP_SPARK had already mutated player.kind=
          // 'Carrying' + spark.state='Carried' — leaving the joiner stuck
          // in Carrying with no DROP path (perceived as "click and you're
          // glued to the spark; RMB to release"). PLACE_FROM_FREE validates
          // EVERYTHING first; any reject leaves spark Free + player Idle.
          // See src/state/placeFromFree.ts header for the full Council R1
          // Battle Ledger context.
          //
          // S53 P2 — the legacy RMB ConnectDrag (carry-then-aim-then-place
          // precise targeting) flow has been REMOVED — it expected
          // player.kind='Carrying' to persist between LMB-up PICKUP_SPARK
          // and RMB-up PLACE_PRIMITIVE, but no input path reaches Carrying
          // post-S52 P1. PLACE_FROM_FREE is now the sole user-driven path.
          // PICKUP_SPARK + PLACE_PRIMITIVE remain in the protocol allowlist
          // (placeFromFree.ts's internal fsmPickup + placePrimitive delegation
          // still use them within atomic execution).
          const carriedType = spark.type;
          // S45 Sym A — target picking uses targetRefPos (cursor in client
          // mode, spark.pos in host/solo) so joiner's intent reflects where
          // their cursor was at release, not their stale snapshot spark.pos.
          // For remote-origin intents, host re-picks via placeFromFree.ts's
          // pickHostTargetPrimitive (Council C2 Grok#1 BLOCKER — host ignores
          // joiner-supplied targetPrimitiveId entirely under remote-origin).
          const targetId = this.pickPrimitiveInRange(AUTO_BOND_RADIUS, targetRefPos);
          const target = targetId !== null
            ? this.world.primitives.get(targetId) ?? null
            : null;
          const tier = computeStiffnessTier(carriedType, target);
          // S9 P2 → S13 P1 — merge candidate sweep (wider radius than the
          // primary target pick). Host re-derives for remote-origin (Council
          // C2); local-origin trusts the joiner's list.
          const mergeCandidateIds = this.allPrimitivesInRange(MERGE_REACH_RADIUS, targetRefPos);
          // S14 P2.1 — redundancy bonds in the primary target's connected
          // component. Anchor placements (target === null) get none.
          const extraBondTargetIds: PrimitiveId[] = target !== null
            ? this.redundantBondTargetsInSameComponent(target, targetRefPos)
            : [];
          this.dispatchFn({
            type: 'PLACE_FROM_FREE',
            sparkId: spark.id,
            playerId: this.playerId,
            placementPos: { x: this.cursor.x, y: this.cursor.y },
            stiffnessTier: tier,
            targetPrimitiveId: target?.id ?? null,
            mergeCandidateIds,
            extraBondTargetIds,
          });
          // S52 P1 Council C4 — set pendingPlaceFromFree so the snapshot
          // interpolation skips this spark for ~300ms while the placement
          // intent travels host-ward and the placement-applied snapshot
          // travels back. Closes the 1-frame blink between cursor-pos and
          // pre-place snapshot pos that Gemini #2 HIGH flagged.
          this.pendingPlaceFromFree = {
            sparkId: spark.id,
            sentAt: performance.now(),
          };
        }
      }
      this.releasePointerCapture(e);
      this.state = { kind: 'Idle' };
    }
    // S53 P2 — onUp RMB ConnectDrag branch removed (carried-then-aim-then-
    // place flow unreachable post-S52 P1 atomic LMB-up). RMB-up is now a
    // no-op (SEVER_BOND fires on RMB-DOWN, not RMB-up).
  };

  // S5 P4: capture lost (e.g. browser stole focus, alt-tab during drag) →
  // safest action is to drop to Idle so a stuck AttractDrag doesn't linger
  // after the gesture is gone. S53 P2: ConnectDrag removed from the
  // possibility space, only AttractDrag remains as a non-Idle state.
  private onLostCapture = (): void => {
    this.capturedPointerId = null;
    // S58 (#2) — release any CLAIM on capture loss (alt-tab / focus steal mid-
    // drag) so a claimed spark never stays stuck Carried after the gesture is
    // gone. Guarded on actually-carrying (un-try/caught host dispatch path).
    const player = this.world.players.get(this.playerId);
    if (player?.kind === 'Carrying') {
      this.dispatchFn({
        type: 'DROP_SPARK',
        playerId: this.playerId,
        pos: { x: this.cursor.x, y: this.cursor.y },
      });
    }
    if (this.state.kind !== 'Idle') this.state = { kind: 'Idle' };
  };

  // S49 P1 (Sym F) — Q key → SHRINK_TERRITORY. Consumes 1 disruptionCharge;
  // halves all enemy territorial radii for 5s. 1v1 PLAYING only; guard
  // prevents charge drain in solo / LOBBY / WIN states and when typing into
  // an input field.
  private onKeyDown = (e: KeyboardEvent): void => {
    // S55 P3 — the full guard set is the pure decideKeyShrink (testable without
    // a DOM / Pixi Application). Behavior-preserving: same five guards, same
    // order, same dispatch.
    const player = this.world.players.get(this.playerId);
    if (
      !decideKeyShrink({
        key: e.key,
        focusedTag: document.activeElement?.tagName,
        gameMode: this.world.gameMode,
        gameState: this.world.gameState,
        disruptionCharges: player?.disruptionCharges,
      })
    ) {
      return;
    }
    this.dispatchFn({ type: 'SHRINK_TERRITORY', playerId: this.playerId });
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

  // S53 P2 — pickPrimitive() wrapper removed. Both call sites lived inside
  // the now-removed RMB ConnectDrag onDown / onMove branches. The
  // pickPrimitiveInRange method below remains (called by the LMB-up
  // PLACE_FROM_FREE flow with explicit radius + center).

  /**
   * S46 P3 Sym D — color-segregated bonding (Council R2 BL row, user-confirmed
   * spec deletion of LOCKED §VI.4/§X.2 multi-color bond rendering). Returns
   * the nearest primitive within radius FILTERED to primitives whose
   * placerColor matches the active player's color. Prevents cross-color
   * bonds at the selection layer; host placePrimitive.ts validates again
   * as defense in depth.
   */
  private pickPrimitiveInRange(radius: number, center?: Vec2): PrimitiveId | null {
    const cx = center?.x ?? this.cursor.x;
    const cy = center?.y ?? this.cursor.y;
    const myColor = this.world.players.get(this.playerId)?.color;
    let best: Primitive | null = null;
    let bestDistSq = radius * radius;
    for (const p of this.world.primitives.values()) {
      // S46 P3 — same-color filter. myColor undefined = test edge case (no player); accept all.
      if (myColor !== undefined && p.placerColor !== myColor) continue;
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
   *
   * S46 P3 Sym D — same-color filter applied here too (merge sweep must not
   * pull in enemy structures into your component).
   */
  private allPrimitivesInRange(radius: number, center: Vec2): PrimitiveId[] {
    const r2 = radius * radius;
    const myColor = this.world.players.get(this.playerId)?.color;
    const ids: PrimitiveId[] = [];
    for (const p of this.world.primitives.values()) {
      if (myColor !== undefined && p.placerColor !== myColor) continue;
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

// S55 P3 — exported for controls.test.ts (pure geometry; used by pickBond to
// hit-test the cursor against a bond segment). Point-to-segment distance with
// endpoint clamping.
export function distToSegment(
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
// S55 P3 — exported for controls.test.ts. Delegates to the combo table
// (combos.test.ts covers lookupCombo itself); the controls-specific branch is
// the anchor case (no target -> MID default).
export function computeStiffnessTier(
  carriedType: SparkType,
  target: Primitive | null,
): StiffnessTier {
  if (target === null) return 'MID';
  return lookupCombo(carriedType, target.type).stiffnessTier;
}

/**
 * S55 P3 — pure Q-key SHRINK_TERRITORY guard, extracted from Controls.onKeyDown
 * so the full guard set is unit-testable without a DOM + Pixi Application
 * (vitest runs in node; the live handler reads e.key + document.activeElement +
 * world state). Returns true iff a SHRINK_TERRITORY intent should be dispatched.
 * Behavior-preserving mirror of the pre-S55 inline guards (S49 P1 Sym F):
 *   - key must be 'q' / 'Q'
 *   - focus must NOT be in an INPUT/TEXTAREA (don't drain a charge while the
 *     user is typing a room code)
 *   - 1v1 PLAYING only (no charge drain in solo / LOBBY / WIN)
 *   - the acting player must hold >= 1 disruption charge
 */
export function decideKeyShrink(params: {
  key: string;
  focusedTag: string | undefined;
  gameMode: string;
  gameState: string;
  disruptionCharges: number | undefined;
}): boolean {
  if (params.key !== 'q' && params.key !== 'Q') return false;
  if (params.focusedTag === 'INPUT' || params.focusedTag === 'TEXTAREA') return false;
  if (params.gameMode !== '1v1') return false;
  if (params.gameState !== 'PLAYING') return false;
  if (params.disruptionCharges === undefined || params.disruptionCharges < 1) return false;
  return true;
}

/**
 * S55 P3 — pure LMB-up placement-gate composition, extracted from
 * Controls.onUp. Captures the asymmetric client/host gating (deliberately NOT a
 * trivial AND — the isClient branching is the load-bearing logic):
 *   - HOST/solo: commit only if the spark physically caught up to the cursor
 *     (reach gate, S9 P1 anti-flick), is OUTSIDE the spawner zone, and is NOT
 *     in enemy territory (S49 Sym F).
 *   - CLIENT (1v1 joiner): bypass ALL THREE local gates — reachable=true,
 *     inZone=false, inTerritory=false — because the joiner's snapshot-lagged
 *     world makes them fire unreliably; the host re-validates authoritatively
 *     (S45 BUG-CRITICAL-3 Sym A + S49 Sym F client-bypass).
 * The live caller probes zone/territory only for the host (short-circuit), so
 * hostInZone/hostInTerritory are already false in client mode; the isClient
 * branches here make the bypass explicit + independently testable.
 */
export function computeReleaseGates(params: {
  isClient: boolean;
  reachDistSq: number;
  maxReleaseReachSq: number;
  hostInZone: boolean;
  hostInTerritory: boolean;
}): { reachable: boolean; inZone: boolean; inTerritory: boolean; commit: boolean } {
  const reachable = params.isClient ? true : params.reachDistSq <= params.maxReleaseReachSq;
  const inZone = params.isClient ? false : params.hostInZone;
  const inTerritory = params.isClient ? false : params.hostInTerritory;
  return { reachable, inZone, inTerritory, commit: reachable && !inZone && !inTerritory };
}
