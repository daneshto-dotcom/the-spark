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
  ALL_SPARK_TYPES,
  AUTO_BOND_RADIUS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MERGE_REACH_RADIUS,
  POTATO_RADIUS,
  RAINBOW_RADIUS,
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
import { dispatch, isNetworked } from '../state/world.ts';
import { canStampAt } from '../state/blueprintLegality.ts';
import type { World } from '../state/world.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import { isUntargetable } from '../state/creatures/creature.ts';
import type { DefenderId, BombId, BondId, CreatureId, GathererId, PlayerId, PotatoId, PrimitiveId, RainbowId, SparkId, SpawnerId, StinkCloudId, Vec2 } from '../types.ts';
import { pickRedundantBondTargets } from './redundantBondTargets.ts';
import { canBuildNow } from '../state/buildLegality.ts';

/**
 * S15 P2 — dispatcher injection. Solo / host mode passes a fn that calls
 * dispatch(world, action) locally. Client mode passes a fn that wraps the
 * action as an Intent envelope and sends over the network transport (host
 * applies authoritatively, snapshot returns ~RTT/2 later). controls.ts has
 * no direct net dependency; main.ts decides the wiring.
 */
// S122 P1 — moved to controlsCore.ts (DOM/Pixi-free); re-exported for existing consumers.
export type { ControlsDispatchFn, ControlState, ControlsLike } from './controlsCore.ts';
export { applyControlsPerSubstep, stepAttractLerp } from './controlsCore.ts';
import { isPointInKeep } from '../state/gatherers/gatherer.ts';
// S152 A5 — UI click cues. ⚠ SAFE FOR THIS FILE: audioManager imports only constants + types, no
// Pixi, so the standing rule that controls.ts must not pull Pixi into the input layer still holds.
import { playUiClickSFX, playUiRefusedSFX } from '../render/audioManager.ts';
import { creatureDrawnSizeRatio, towerAnchorAtPoint } from '../render/towerFrames.ts';
import { rampAnchorAtPoint } from '../render/structureRamp.ts';
import { stinkTowerAt } from '../render/stinkTowerCover.ts';
// ⭐ S188 P6 — POWER OF RA. The rules leaf is Pixi-free and so is the aim context, so the standing
// rule that this layer must not import Pixi still holds.
import { raAimPoint, raCastRefusal } from '../state/racial/powerOfRaRules.ts';
import { raAimPreview, setRaAimPreview } from '../render/raAimPreview.ts';

/**
 * S136 P0 — the narrow view of `CastlePanel` that the input layer needs.
 *
 * Declared as an interface rather than importing the class so `controls.ts` keeps no dependency on
 * the panel's rendering (and so a unit test can drive the castle-click path with a 4-line stub). The
 * panel is constructed AFTER Controls in main.ts, so it arrives via `setCastlePanel`, and every call
 * site tolerates it being absent.
 */
/**
 * S149 P4 — the footer band (R36), structurally typed for the same reason `CastlePanelLike` is:
 * `controls.ts` must not import Pixi. Optional at every call site, so a harness without a band
 * behaves exactly as before.
 */
export interface FooterBandLike {
  /**
   * ⭐ S187 — the collapse tab. Optional for the same reason every other member of this interface
   * is structurally typed: a test harness that does not model the tab behaves exactly as before.
   */
  isOverCollapseTab?(x: number, y: number): boolean;
  toggleCollapsed?(): boolean;
  /** ⭐ S188 P6 — the POWER OF RA skill button. Optional for the same reason as the tab above. */
  isOverRaButton?(x: number, y: number): boolean;
  isOverChip(x: number, y: number): boolean;
  /** S182 — `isOverChip` OR any opaque readout the band draws. See `isPointerOverFooterSurface`. */
  isOverBandSurface(x: number, y: number): boolean;
  chipAt(x: number, y: number): number | null;
  select(complexity: number | null): number | null;
  /** S149 P5 — the tower card under a point, or null. */
  cardAt(x: number, y: number): GodlyId | null;
  /** S149 P6 — is that card affordable? Decides ARM vs ORDER-THE-SHAPES at the click site. */
  cardEnabled(id: GodlyId): boolean;
  /** S149 P5 — mirror the armed tower so the open card can light up. */
  setArmed(id: GodlyId | null): void;
  /** S153 P4 (R81) — the pointer moved; light whatever is under it. */
  setHover(x: number, y: number): void;
  /** S153 P4 (R81) — the pointer is down; sink whatever is under it. */
  setPressed(down: boolean): void;
  /**
   * ⭐ S154 P1 (R80) — press the shape strip: queue a shape, or cancel one. True when consumed.
   * Hit-test and action are one call so a guard and an action cannot disagree about a pixel.
   */
  pressShapeStrip(x: number, y: number): boolean;
}

/**
 * S152 — the FIX / SCRAP / FEED popover, structurally typed for exactly the reason
 * `FooterBandLike` is: `controls.ts` must not import Pixi. Optional at every call site, so a
 * harness without a popover behaves precisely as it did before.
 *
 * ⚠ THE UNIONS ARE SPELLED OUT INLINE RATHER THAN IMPORTED FROM `structurePanel.ts`, and that is
 * the whole discipline of this interface: importing the type would pull a Pixi module into the
 * input layer. The cost is that these literals must be kept in step with the panel by hand — tsc
 * catches it, because the panel is passed to `setStructurePanel` and would stop being assignable.
 *
 * ⭐ S152 P2 — `buttonAt` now answers with an ACTION, not a bare kind. A FEED click has to carry
 * WHICH SHAPE, and a string kind cannot. This widening is what forced `main.ts` to be updated in
 * the same edit instead of silently dropping the payload.
 */
/**
 * ⭐ S180 — the CHARACTER SHEET, as the input layer sees it. Spelled out here rather than imported
 * for the reason the note above gives for `StructurePanelLike`: a structural type keeps this layer
 * free of the renderer, and `tsc` still catches a drift at `setCharacterSheet`.
 */
/** Everything the card can be pointed at. Kept structural so this layer stays free of the renderer. */
export type SheetSelectable =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'structure'; readonly primitiveId: PrimitiveId }
  | { readonly kind: 'defender'; readonly id: DefenderId }
  | { readonly kind: 'castle'; readonly seat: PlayerId }
  // ⭐⭐ S181 (owner) — *"poop bags are unclickable. They should have a stat too."* A landed bag lives
  // in its own `world.stinkClouds` map, which is why every pick arm missed it.
  | { readonly kind: 'stinkCloud'; readonly id: StinkCloudId };

export interface CharacterSheetLike {
  select(target: SheetSelectable | null): void;
  selection(): unknown;
  ownedRowAt(x: number, y: number): SheetSelectable | null;
  isOver(x: number, y: number): boolean;
  /**
   * S181 — the card's own FIX / SCRAP / FEED. Structurally typed for the same reason
   * `StructurePanelLike` is: this layer must not import the renderer, and the e2e seam substitutes
   * a plain object.
   */
  actionAt(
    x: number,
    y: number,
  ): { readonly kind: string; readonly sparkType?: number } | null;
  /** Includes DISABLED buttons, so a refusal can be told apart from a miss (the S152 contract). */
  isOverAnyAction(x: number, y: number): boolean;
  actionPrimitiveId(): PrimitiveId | null;
  actionFeedSpawnerId(): SpawnerId | null;
  /** S181 — the pointer moved; light the control under it (owner: "slightly changes hue"). */
  setHover(x: number, y: number): void;
}

/*
 * ⛔⛔ S181 — `StructurePanelLike` IS RETIRED IN PLACE, UNREAD. The FIX/SCRAP/FEED popover it typed
 * is gone: the character sheet carries all three controls now, and keeping a second live surface is
 * what produced the owner's S181 report — two sets of buttons, only the hidden set wired.
 *
 * ⚠ `render/structurePanel.ts` ITSELF STAYS, and deleting it would be a mistake: it exports
 * `structureActionModel`, the PURE planner that prices FIX, refunds SCRAP and enumerates the FEED
 * shapes. The card imports exactly that and nothing else. What is retired is the RENDERER class and
 * this input seam, not the logic — the same split the project made for `GOBLIN_DAMAGE_VS_CASTLE`.
 */

export interface CastlePanelLike {
  isOpen(): boolean;
  toggle(seat: number): void;
  close(): void;
  isOverPanel(x: number, y: number): boolean;
  /** S144 P3 — the tower the player picked from the build grid, or null. */
  armedBlueprint(): GodlyId | null;
  /** S144 P3 — put a held tower back without building it. */
  disarm(): void;
  /** S149 P5 — arm a tower chosen from the footer band (the grid moved out of the castle). */
  armExternal(id: GodlyId | null): void;
  /** S149 P6 — queue the shapes an unaffordable tower still needs (the castle SHORT-tile path). */
  requestShapesFor(world: World, id: GodlyId): void;
}

/**
 * ⭐⭐ S188 (audit F1) — THE UPGRADE DRAFT PANEL, as the input layer sees it. Structural for the
 * reason every surface above is: this layer must not import the renderer.
 *
 * Two questions, the S182 split: `isOver` is the SURFACE (everything the panel draws — the commit
 * gates ask it) and `isOverChoosable` is the CONTROL (a tile a click would pick — the cursor asks
 * it). The pick itself never comes through here: it is the panel's own Pixi `pointertap`.
 */
export interface DraftPanelLike {
  isOver(x: number, y: number): boolean;
  isOverChoosable(x: number, y: number): boolean;
}

/**
 * V6-1.2 — PURE: the next value in a gatherer's preference cycle (Any → the six primitives → Any).
 * Extracted as a free function so the cycle is unit-testable without a Pixi Application / DOM —
 * the ui.ts `captureTierBanner` precedent, and the reason V6-0.2's untestable scan shipped broken.
 */
export function nextPreference(current: SparkType | null): SparkType | null {
  if (current === null) return ALL_SPARK_TYPES[0]!;
  const i = ALL_SPARK_TYPES.indexOf(current);
  if (i < 0 || i === ALL_SPARK_TYPES.length - 1) return null;
  return ALL_SPARK_TYPES[i + 1]!;
}

/** V6-1.2 — is this position inside the (now half-size) spawn disc? Shared by the pickup gate. */
function isInsideSpawnZone(p: { x: number; y: number }): boolean {
  const dx = p.x - SPAWNER_CENTER_X;
  const dy = p.y - SPAWNER_CENTER_Y;
  return dx * dx + dy * dy <= SPAWNER_RADIUS * SPAWNER_RADIUS;
}
import {
  applyControlsPerSubstep,
  type ControlsDispatchFn,
  type ControlState,
} from './controlsCore.ts';

/** Default dispatcher: solo path. Equivalent to pre-S15 controls behavior. */
function makeLocalDispatcher(world: World): ControlsDispatchFn {
  return (action) => { dispatch(world, action); };
}

const PICK_RADIUS = 28;
const BOND_PICK_DIST = 8;
// S102 #1 — cursor→creature hit radius for a right-click RAID (≈ 2× the chewer body so a
// click "on" a hopping chewer reliably pops it). Bigger than BOND_PICK_DIST (a creature is a
// fat blob; a bond is a thin segment).
const CREATURE_PICK_DIST = 34;
/**
 * S181 — a landed bag's clickable radius.
 *
 * ⚠ NOT `bag.radius`, DELIBERATELY. That is the AURA's reach (120px) — clicking anywhere in the
 * cloud would swallow clicks on everything standing in it. This is the drawn bag, which is a small
 * object, plus the same forgiveness every other pick here uses.
 */
const BAG_PICK_R = 26;

/**
 * ⭐ S168 P1 — one raid candidate and HOW DELIBERATE the click on it was.
 *
 * `ratio` is `distance / that family's own pick radius`, so the three families are comparable even
 * though their radii differ by more than 4x (34 px for a creature, 8 for a bond). 0 is dead centre,
 * 1 is the edge of the hit area.
 */
export interface PickHit<T> {
  readonly id: T;
  readonly ratio: number;
}

/**
 * ⭐ S168 P1 — which raid candidate the player actually aimed at. PURE, and exported so
 * `controls.raidPick.test.ts` can pin the behaviour without a DOM, a canvas or a world.
 *
 * Lowest `ratio` wins. Ties keep ARRAY ORDER, and callers pass `[creature, defender, bond]` — the
 * historical R78 precedence — so an exact tie resolves exactly as it always did.
 *
 * @returns the winning index, or `null` when nothing was in range.
 */
export function bestPickIndex(hits: readonly (PickHit<unknown> | null)[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (hit === undefined || hit === null) continue;
    if (best === null || hit.ratio < hits[best]!.ratio) best = i;
  }
  return best;
}
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

export class Controls {
  state: ControlState = { kind: 'Idle' };
  cursor: Vec2 = { x: 0, y: 0 };
  /** S144 P3 — injected BUILD_BLUEPRINT dispatcher; absent until main.ts wires it. */
  private onBuildBlueprint: ((id: GodlyId, centre: Vec2) => void) | null = null;
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
    // S152 A5 — kept so `updateHoverCursor` can set the CSS cursor for hand-hit-tested UI.
    this.canvasEl = canvas;
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

  /**
   * Apply attract force / cursor-lock per substep. Called from main loop.
   *
   * S122 P1 — body extracted VERBATIM to applyControlsPerSubstep (module fn above) so the
   * worker-sim facade drives the byte-identical path. Full S86/S58/S10/S77 rationale comments
   * live at the extraction site. This delegation preserves the exact pre-S122 semantics: the
   * only mutation the class layer adds back is `this.state` adoption of the returned FSM state.
   */
  applyPerSubstep(): void {
    this.state = applyControlsPerSubstep(
      this.world,
      this.playerId,
      this.state,
      this.cursor,
      this.dispatchFn,
    );
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
    // S93 — the NONET trial freezes the duel for everyone; the Sudoku overlay owns input.
    if (this.world.sudoku !== null) return true;
    /*
     * ⛔⛔ S175 P4b — **THE CINEMATIC INPUT LOCK IS DELETED, AND IT WAS HALF OF WHAT HE MEANT.**
     *
     * Owner: *"there is the cutscene … and it stops the whole game — we'll remove that."* The SIM
     * was never stopped: `activeCinematicPlayerId` appears in zero of `hostTick.ts`, `physics/*.ts`
     * and `simWorker.ts`, so the world ticked throughout. What actually stopped for him was a
     * full-canvas opaque rectangle and THIS LINE, which froze the summoner — and only the
     * summoner — out of his own board while it played.
     *
     * The rectangle is gone (`godlyOrchestration` now always takes the silent path), so this lock
     * would freeze a player for 0.9 s behind nothing at all. The Voltkin emerges from his TV
     * in-game now; the game keeps running underneath, which is the whole ruling.
     *
     * ⚠ The OTHER locks stay. NONET genuinely owns input for everyone, and a benched player is
     * benched. Only the cinematic clause goes.
     */
    // S72 P2 — a benched player (eaten by the Pac-Man hunter) is fully input-locked
    // until benchedUntilTick. Tick compare self-heals if the clear is missed (R5).
    const me = this.world.players.get(this.playerId);
    if (me !== undefined && isBenched(me.benchedUntilTick, this.world.tick)) return true;
    return false;
  }

  /** V6-1.2 — one gatherer under the cursor, if any (click = cycle its shape preference). */
  private pickGatherer(): GathererId | null {
    let bestId: GathererId | null = null;
    let bestDistSq = 26 * 26;
    for (const g of this.world.gatherers.values()) {
      if (g.ownerPlayerId !== this.playerId) continue; // only re-task your OWN units
      const dx = g.pos.x - this.cursor.x;
      const dy = g.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestId = g.id;
        bestDistSq = d2;
      }
    }
    return bestId;
  }

  /**
   * S136 P0 — main.ts injects the castle panel after construction (it is built after Controls).
   */
  /** S144 P3 — main.ts injects the BUILD_BLUEPRINT dispatch for the local seat. */
  setBuildBlueprintHandler(fn: (id: GodlyId, centre: Vec2) => void): void {
    this.onBuildBlueprint = fn;
  }

  setFooterBand(band: FooterBandLike): void {
    this.footerBand = band;
  }

  setCastlePanel(panel: CastlePanelLike): void {
    this.castlePanel = panel;
  }

  /** S152 — main.ts injects the FIX / SCRAP popover (built after Controls, like the other two). */
  setCharacterSheet(sheet: CharacterSheetLike): void {
    this.characterSheet = sheet;
  }

  /** ⭐ S188 (audit F1) — main.ts injects the draft panel, like the three surfaces above. */
  setDraftPanel(panel: DraftPanelLike): void {
    this.draftPanel = panel;
  }

  /**
   * S181 — `main.ts` injects the card's FIX / SCRAP / FEED dispatch, exactly as it already does for
   * the popover's. Same `dispatchFn` seam, so the three network paths (wire intent / postIntent /
   * direct) keep working with no second code path.
   */
  setSheetActionHandler(
    fn: (action: { readonly kind: string; readonly sparkType?: number }, primitiveId: PrimitiveId) => void,
  ): void {
    this.onSheetAction = fn;
  }


  /**
   * S152 — main.ts injects the REPAIR_STRUCTURE / SCRAP_STRUCTURE / FEED_TOWER dispatch for the
   * local seat. The action is passed through whole, payload included, so this layer never has to
   * know that FEED means a shape and the other two do not.
   */

  private castlePanel: CastlePanelLike | null = null;
  private footerBand: FooterBandLike | null = null;
  private characterSheet: CharacterSheetLike | null = null;
  private draftPanel: DraftPanelLike | null = null;
  private onSheetAction:
    | ((action: { readonly kind: string; readonly sparkType?: number }, primitiveId: PrimitiveId) => void)
    | null = null;

  /**
   * S136 P0 — is the cursor over the open castle panel? Replaces `isPointerOverFooter`.
   *
   * `this.cursor` is already mapped to 1920x1080 logical canvas space by `updateCursor`
   * (letterbox/object-fit-contain aware) and the panel lives in that same space, so this is a plain
   * rect test with no extra coordinate math. Scoped to PLAYING because the panel only exists there.
   *
   * WHY IT IS STILL NEEDED after the buttons moved: this raw canvas handler hit-tests WORLD objects
   * with no notion of UI, and Pixi's `pointertap` on a panel row does NOT suppress it — both fire
   * for one physical click. Without the guard, pressing BUY GATHERER would ALSO grab a spark /
   * sever a bond / pop a creature underneath the panel.
   */
  /**
   * S149 P4 — is the cursor over a footer CHIP?
   *
   * ⚠ CHIPS, NOT THE BAND. The original footer was deleted partly because it was a 1920-wide plate
   * whose empty region swallowed clicks, making every world object in the bottom 7.8% of the board
   * inert. `isOverChip` hit-tests only the chip rectangles, so the rest of the band stays board.
   */
  /**
   * S149 P4 — a click on a footer chip selects that complexity. Returns true when consumed.
   *
   * Selection is RENDER-ONLY state on the band — it never enters `world`, so it needs no
   * serialization, no hash entry and no protocol bump, exactly as R36 specifies ("purely
   * presentational").
   */
  private handleFooterChipClick(): boolean {
    if (!this.isPointerOverFooterChip() || this.footerBand === null) return false;

    /*
     * ⭐⭐ S187 — THE COLLAPSE TAB IS TESTED FIRST. Collapsed, the tab is the ONLY control left —
     * reading chips first would make the menu impossible to bring back.
     *
     * ⛔ S188 (owner) — BUT IT IS NOT ON TOP OF AN OPEN MENU, and this comment used to claim it was
     * ("whatever floats ABOVE the others must be read before them"). The expanded tab sits UNDER the
     * tower cards: every tier's menu is drawn over it, and pressing the Lightning Hub card collapsed
     * the footer instead of arming the hub. `footerBand.isOverCollapseTab` now answers false wherever
     * an open card covers the tab, so a press there falls through to `cardAt` below — decided in that
     * one predicate so this router, the cursor and the placement gates agree. See its docblock.
     */
    if (this.footerBand.isOverCollapseTab?.(this.cursor.x, this.cursor.y) === true) {
      void playUiClickSFX();
      this.footerBand.toggleCollapsed?.();
      return true;
    }

    // ⭐ S188 P6 — THE POWER OF RA BUTTON: press to aim, press again to put it away. Beside the tab
    // in the collapsed state and beside the chips otherwise; neither overlaps anything, so the
    // position in this chain is readability, not a tie-break.
    if (this.footerBand.isOverRaButton?.(this.cursor.x, this.cursor.y) === true) {
      this.toggleRaAim();
      return true;
    }

    // ⭐ S149 P5 — A TOWER CARD IS CHECKED FIRST. The open menu floats ABOVE the chips, so testing
    // chips first would let a card click fall through to the bar behind it and merely toggle the
    // menu shut — precisely the "it isnt clickable" the owner reported.
    const card = this.footerBand.cardAt(this.cursor.x, this.cursor.y);
    if (card !== null) {
      // ⭐ S149 P6 — AFFORDABLE ⇒ ARM IT. NOT AFFORDABLE ⇒ ORDER THE SHAPES.
      //
      // The castle's shipped two-mode tile behaviour, carried over rather than reinvented. Owner:
      // "before when it was in castle you could click on the towers you want built and it already
      // give the priority shapes to the gatherer and shows them in castle but now it is gone. those
      // mechanics should persist — we literally just move the tower purchase section to where
      // classical tower defence footbars are."
      // R81 — the footer had no audible response at all; the popover got one in S152 A5 and the
      // chips did not. Accept and refuse now sound different here too.
      void (this.footerBand.cardEnabled(card) ? playUiClickSFX() : playUiRefusedSFX());
      if (this.footerBand.cardEnabled(card)) {
        setRaAimPreview(null); // S188 P6 — one gesture in hand at a time: picking a tower drops the aim
        this.castlePanel?.armExternal(card);
        this.footerBand.setArmed(this.castlePanel?.armedBlueprint() ?? null);
      } else {
        // S153 P5a (R91) — pass the world: the panel derives the shortfall on demand now rather
        // than reading a draw-time latch, so this works whether or not the castle was ever opened.
        this.castlePanel?.requestShapesFor(this.world, card);
      }
      return true;
    }

    /*
     * ⭐ S154 P1 (owner R80) — THE SHAPE STRIP. A palette press queues one of that shape; a queue
     * chip press cancels one. Both dispatch through the band's injected handlers, which are the
     * SAME ENQUEUE/CANCEL_GATHERER_ORDER dispatches the castle panel used to own.
     *
     * Checked after the cards (which float above the band) and before the chips (which sit to the
     * strip's left) — neither can overlap it, so this is ordering for readability, not a tie-break.
     * R81: accept clicks here sound like every other accepted click.
     */
    if (this.footerBand.pressShapeStrip(this.cursor.x, this.cursor.y)) {
      void playUiClickSFX();
      return true;
    }

    const complexity = this.footerBand.chipAt(this.cursor.x, this.cursor.y);
    if (complexity === null) return false;
    this.footerBand.select(complexity);
    return true;
  }

  /**
   * ⭐⭐ S188 P6 (owner, `mummies.l0`) — **THE POWER OF RA GESTURE.**
   *
   * > *"you click on it and then you have to click on the area of the map where you want it to land"*
   *
   * Press the button → AIMING (the five circles follow the cursor, `bossAuras.ts`). The next board
   * click CASTS there; RMB or Escape puts it away; pressing the button again puts it away. While
   * aiming, the aim owns the next board click exactly as a held tower does, so nothing else under
   * the cursor (a spark, a gatherer, a card) also acts.
   *
   * ⛔ EVERY DECISION HERE ASKS THE REDUCER'S OWN PREDICATES — `raCastRefusal` for "may I", and
   * `raAimPoint` for "is that a place" — so the client can never send what the host would refuse
   * for a reason the client could have seen. The host re-checks all of it regardless.
   */
  private toggleRaAim(): void {
    if (raAimPreview() !== null) {
      setRaAimPreview(null);
      void playUiClickSFX();
      return;
    }
    if (raCastRefusal(this.world, this.playerId) !== null) {
      void playUiRefusedSFX(); // a refused control says so — the button's caption names why
      return;
    }
    // One gesture in hand at a time: a held tower is put back, so the next click cannot stamp it.
    if (this.castlePanel?.armedBlueprint() != null) this.castlePanel.disarm();
    setRaAimPreview({ seat: this.playerId, x: this.cursor.x, y: this.cursor.y });
    void playUiClickSFX();
  }

  /** ⭐ S188 P6 — while aiming, the board click is the cast. Returns true when it consumed the click. */
  private handleRaAimClick(button: number): boolean {
    if (raAimPreview() === null) return false;
    if (button === 2) {
      setRaAimPreview(null);
      return true;
    }
    if (button !== 0) return false;
    // Ground the player cannot see is not ground they aimed at: swallow and keep aiming, the
    // held-tower rule for the same two surfaces.
    if (this.isPointerOverCard() || this.isPointerOverFooterSurface()) return true;
    if (raCastRefusal(this.world, this.playerId) !== null) {
      setRaAimPreview(null);
      void playUiRefusedSFX();
      return true;
    }
    const aim = raAimPoint(this.cursor.x, this.cursor.y);
    if (aim === null) return true; // off the board: keep aiming
    this.dispatchFn({ type: 'CAST_POWER_OF_RA', playerId: this.playerId, x: aim.x, y: aim.y });
    setRaAimPreview(null);
    void playUiClickSFX();
    return true;
  }

  /**
   * Is the pointer over a footer CONTROL — a tier chip, an open tower card, or a shape-strip
   * button? Narrow on purpose: this is what `handleFooterChipClick` consumes and what the hover
   * cursor promises, so it may only be true where a click actually does something.
   */
  private isPointerOverFooterChip(): boolean {
    return (
      this.world.gameState === 'PLAYING' &&
      this.footerBand !== null &&
      this.footerBand.isOverChip(this.cursor.x, this.cursor.y)
    );
  }

  /**
   * ⭐⭐ S182 — **IS THE POINTER OVER ANYTHING THE BAND DRAWS OPAQUELY?** Wider than
   * `isPointerOverFooterChip`, and the difference is load-bearing: a COMMIT gate must refuse
   * wherever the player cannot see the board, while the CURSOR may only promise `pointer` where a
   * click does something. Those are different questions, and the carry readout is the case that
   * separates them — an opaque plate that swallows a click without being a control.
   *
   * ⛔ THE FIRST FIX FOR THAT DEFECT CONFLATED THEM, by widening `isOverChip` itself, and it failed
   * twice over: `handleFooterChipClick` gates on `isOverChip` but only RETURNS TRUE when a chip or
   * strip control was really pressed — so over the plate it fell through to the stamp arm with the
   * bug intact — and the hover cursor began advertising a readout as clickable, the exact lie
   * `s182UiSurfaceGuards.test.ts` exists to catch. Two predicates, each asked by the sites that
   * mean it.
   *
   * ⭐ THE CARD IS THE PRECEDENT: `isPointerOverCard()` (the WHOLE card) guards the commit gates
   * while the cursor asks only `isOverAnyAction` / `ownedRowAt` (its CONTROLS).
   */
  private isPointerOverFooterSurface(): boolean {
    return (
      this.world.gameState === 'PLAYING' &&
      this.footerBand !== null &&
      this.footerBand.isOverBandSurface(this.cursor.x, this.cursor.y)
    );
  }

  /**
   * S152 — a click on FIX or SCRAP. Returns true when consumed.
   *
   * The intent names the SELECTED primitive, not the one under the cursor: the cursor is over a
   * button floating above the board, and whatever world object happens to lie beneath that button
   * has nothing to do with the structure being acted on.
   *
   * ⚠ THE CARD IS NOT DISMISSED ON FIX. A repair usually leaves the tower standing and often still
   * short of something, so keeping it selected lets the player see the caption change and act again.
   * SCRAP dismisses implicitly — ⭐ S181: that is now `characterSheet.sync`'s job, which drops a
   * selection whose model returns null. The note here used to name `StructurePanel.sync`, a method
   * that no longer exists; the BEHAVIOUR was always preserved, only the cited owner was stale.
   */
  /**
   * ⭐⭐ S181 — **IS THE POINTER OVER THE CHARACTER CARD?** Used by the PLACE commit gates below.
   *
   * ⛔ IT EXISTS BECAUSE THE CARD BECAME A UI SURFACE AND WAS NOT REGISTERED AS ONE. Three separate
   * guards in this file enumerate UI surfaces BY HAND — the two PLACE commit gates and
   * `updateHoverCursor` — and S181 added a large new always-on-top panel without adding it to the
   * first two. So opening a card and then releasing a spark drag over it PLACED A SHAPE underneath
   * the card, on ground the player could not see. The castle panel is excluded there with the stated
   * reason *"it would be hidden beneath it"*, which applies to the card word for word.
   *
   * ⚠ The card is drawn above every surface except the zIndex-900 draft panel (`main.ts` calls
   * `characterSheet.bringToFront()`), so this is not a theoretical overlap — it is the most-covered
   * rectangle on the screen.
   */
  private isPointerOverCard(): boolean {
    return this.characterSheet?.isOver(this.cursor.x, this.cursor.y) ?? false;
  }

  private handleSheetActionClick(): boolean {
    if (this.characterSheet === null || this.world.gameState !== 'PLAYING') return false;
    const action = this.characterSheet.actionAt(this.cursor.x, this.cursor.y);
    if (action === null) {
      /*
       * ⭐ S152 A5, CARRIED — A REFUSED CLICK SOUNDS DIFFERENT FROM A MISSED ONE.
       *
       * Owner: *"so we know when we have clicked something and it simply didnt work"*. `actionAt`
       * ignores disabled buttons by design (they explain, they do not act), so the DISABLED case is
       * detected separately and given its own cue — and the click is still CONSUMED, because the
       * player did hit a control and the board underneath must not also act.
       */
      if (this.characterSheet.isOverAnyAction(this.cursor.x, this.cursor.y)) {
        void playUiRefusedSFX();
        return true;
      }
      return false;
    }
    const primitiveId = this.characterSheet.actionPrimitiveId();
    if (primitiveId === null) return false;
    void playUiClickSFX();
    this.onSheetAction?.(action, primitiveId);
    return true;
  }

  /**
   * S152 — clicking one of YOUR OWN placed shapes aims the FIX / SCRAP popover at its structure.
   *
   * ⚠ ORDERED BELOW `pickSpark`, DELIBERATELY. A free spark can be sitting on top of a tower, and
   * the grab is the older, more frequent gesture; stealing it would be a regression for a feature
   * nobody asked for. So this only runs when nothing else claimed the click.
   *
   * Gated on `canBuildNow` so the popover can only be aimed when it could actually be used — R19
   * makes both actions BUILD-stage only, and a popover that appears mid-FIGHT with two dead buttons
   * would read as broken. Clicking empty ground dismisses an open popover and returns false so the
   * same click still acts on the board: the RTS convention the castle panel already follows.
   */
  /**
   * ⭐ S180 — open a card on whatever is under the cursor, whoever owns it.
   *
   * ⚠ IT READS SIM POSITIONS, NEVER SPRITE BOUNDS. GEMINI-AUDITOR raised the alternative in Council:
   * a pick off interpolated Pixi bounds is coupled to the renderer and cannot be driven headlessly.
   * `pickOwnPrimitive` already picks off `prim.pos` + radius, and this follows it, so the whole
   * gesture is testable without a canvas.
   */
  private handleSheetSelect(): boolean {
    if (this.characterSheet === null || this.world.gameState !== 'PLAYING') return false;
    // A click on the card itself re-aims it at the unit a building fields, and never falls through
    // to the board underneath.
    const owned = this.characterSheet.ownedRowAt(this.cursor.x, this.cursor.y);
    if (owned !== null) {
      this.characterSheet.select(owned);
      return true;
    }
    /*
     * ⛔⛔ S181 — **THE ACTION-CLICK ARM THAT STOOD HERE IS REMOVED, BECAUSE IT WAS A SECOND COPY
     * THAT COULD NEVER RUN.** Found by the adversarial verification pass and confirmed by trace.
     *
     * `handleSheetActionClick` is tested at the TOP of `onDown`, in the slot the retired popover's
     * buttons held. It consumes every click over any slot — through its dispatch arm for an enabled
     * button, and through its refusal arm for a disabled one — so this branch was unreachable for
     * every input that could have reached it:
     *   · `StructureActionView.primitiveId` is REQUIRED and non-nullable, and `this.slots` is
     *     non-empty only when `view.actions` is non-null, so the top-of-onDown test never falls
     *     through on a slot hit;
     *   · this function is LMB-only, so RMB could not arrive here either.
     *
     * ⚠ AND THAT IS EXACTLY THE DIVERGENCE TRAP THIS PROJECT KEEPS PAYING FOR — two copies of one
     * rule, one of them never executed, waiting for someone to edit the dead one and conclude the
     * feature is broken. Deleted rather than commented out; the live ordering is pinned by
     * `characterSheet.wired.test.ts`.
     */
    if (this.characterSheet.isOver(this.cursor.x, this.cursor.y)) return true;

    /*
     * ⭐ S180 — AN ENEMY KEEP IS CLICKABLE TOO. `handleCastleClick` above only ever tests YOUR seat,
     * because the castle panel is yours alone; the card has no such limit — reading an opponent's
     * castle health is the point of it.
     */
    for (const id of this.world.players.keys()) {
      const seatN = id as unknown as number;
      if (isPointInKeep(this.cursor.x, this.cursor.y, seatN, this.world.layout)) {
        this.characterSheet.select({ kind: 'castle', seat: id });
        return true;
      }
    }

    /*
     * ⭐⭐ S181 (owner) — **THE PICK SCALES WITH HOW BIG THE THING DRAWS.** His report: *"Like Vlad,
     * I had to click on his knees to open his character sheet. That's stupid. You should be able to
     * open it anywhere on him."*
     *
     * `CREATURE_PICK_DIST` is 34 px and was flat for EVERY creature. It is tuned for a grunt, whose
     * sprite is ≈60 px — so a 34 px circle about the sim position covers a goblin. Vlad draws
     * `creatureDrawnSizeRatio` = 2.56x that, ≈152 px, while keeping the same 34 px circle: the
     * clickable zone was a small disc around his feet-anchored centre, i.e. THE KNEES. Exactly what
     * he described, and the arithmetic says so rather than my taste.
     *
     * ⛔ ONLY THIS PICK CHANGES. The chewer picks below keep the flat radius on purpose — they are
     * gameplay gestures with their own tuning and a `ratio` return that feeds aim assist, and
     * widening those would be a balance change he did not ask for.
     *
     * ⚠ AND IT STILL READS SIM POSITIONS, NEVER SPRITE BOUNDS — the constraint this function's own
     * docblock sets out, so the whole gesture stays drivable headlessly. The SIZE is derived from
     * the art's authored geometry, not measured off a live Pixi object.
     *
     * ⭐ NEAREST-BY-RATIO, NOT NEAREST-BY-PIXELS. With unequal radii a raw distance compare would
     * hand a click inside Vlad to a goblin standing 40 px away, because 40 < 87. Comparing the
     * FRACTION of each creature's own radius keeps "I clicked on him" meaning the thing the cursor
     * is actually inside, and ties break on id so two stacked creatures resolve identically on
     * every machine.
     */
    /*
     * ⭐⭐ S181 (owner) — **A LANDED BAG IS PICKABLE**, tried ahead of the creature scan because a bag
     * is a small static object that units stand on top of: after the creature arm a bag would be
     * unreachable whenever anything was fighting over it, which is most of the time one is on the
     * board.
     *
     * ⚠ SAME SIM-POSITION RULE as every other arm here — `bag.pos` and `bag.radius`, never sprite
     * bounds, so the gesture stays drivable headlessly.
     */
    for (const bag of this.world.stinkClouds.values()) {
      const r = BAG_PICK_R;
      const dx = bag.pos.x - this.cursor.x;
      const dy = bag.pos.y - this.cursor.y;
      if (dx * dx + dy * dy > r * r) continue;
      this.characterSheet.select({ kind: 'stinkCloud', id: bag.id });
      return true;
    }

    let bestCreature: CreatureId | null = null;
    let bestScore = Infinity;
    for (const c of this.world.creatures.values()) {
      const r = CREATURE_PICK_DIST * creatureDrawnSizeRatio(c.type);
      const score = Math.hypot(this.cursor.x - c.pos.x, this.cursor.y - c.pos.y) / r;
      if (score >= 1) continue; // outside its OWN radius is a miss, whatever its size
      if (bestCreature !== null) {
        if (score > bestScore) continue;
        // An exact tie falls to the lower id, so two stacked creatures resolve the same way twice.
        if (score === bestScore && (c.id as unknown as number) >= (bestCreature as unknown as number)) {
          continue;
        }
      }
      bestScore = score;
      bestCreature = c.id;
    }
    if (bestCreature !== null) {
      this.characterSheet.select({ kind: 'creature', id: bestCreature });
      return true;
    }

    /*
     * ⭐⭐ S181 (owner) — **A TOWER IS CLICKABLE ANYWHERE ON ITS ART**, the building half of his
     * *"characters and towers aren't clickable everywhere"*.
     *
     * The per-shape scan below only ever hit a MEMBER SHAPE's own little radius. A tier-9 tower is a
     * 150 px sprite standing on a ring of small shapes, so the cursor was inside the building the
     * player can see while being outside every shape — clicking the middle of Vlad's tower did
     * nothing at all. `towerAnchorAtPoint` is the sprite's box and already existed for the FEED
     * gesture; the card simply never asked it.
     *
     * ⭐ IT IS TRIED FIRST, and the shape scan stays as the fallback. That ordering is what keeps a
     * hand-bonded freeform structure (which draws no sprite, so the art box cannot match)
     * clickable exactly as it is today.
     *
     * ⛔⛔ **S183 — AND THE SECOND BOX IS NOT OPTIONAL, IT IS WHAT KEEPS THOSE TOWERS REPAIRABLE.**
     * The line above used to end *"and the three art-less recipes — the pentagram, the goblin
     * tower, the lightning hub — clickable exactly as they are today"*, because the shape scan
     * below worked for them: their member shapes were VISIBLE. S182 gave the hub damage art and
     * S183 gave the goblin tower, the pentagram, the laser turret and HELGA's hall theirs — and
     * with art comes `towerCover`, which fades those member shapes to nothing. The fallback would
     * then be "click an invisible 10 px dot to repair your tower".
     *
     * `towerAnchorAtPoint` cannot cover them: it is keyed on `towerArtForRecipe` (the race towers
     * only) and iterates `world.creatureSpawners` (so no defender can ever be in it).
     * `rampAnchorAtPoint` is the same box test over `RAMP_SPECS`, across both collections, sharing
     * the member walk with the renderer that draws them.
     */
    /*
     * S185 — the stink tower joins the chain, and it HAD to: this session gave it cover, so its
     * shapes are now faded to nothing and the 10px-dot fallback the comment above warns about is
     * exactly what a player would have been left clicking. A tower you cannot click is a tower you
     * cannot repair. Its box is measured from all twelve idle cells and is ASYMMETRIC, because the
     * art straddles its anchor rather than standing on it.
     */
    const towerHit = towerAnchorAtPoint(this.world, this.cursor.x, this.cursor.y)
      ?? rampAnchorAtPoint(this.world, this.cursor.x, this.cursor.y)
      ?? stinkTowerAt(this.world, this.cursor.x, this.cursor.y);
    if (towerHit !== null) {
      this.characterSheet.select({ kind: 'structure', primitiveId: towerHit });
      return true;
    }

    let bestPrim: PrimitiveId | null = null;
    let bestPrimD2 = Infinity;
    for (const prim of this.world.primitives.values()) {
      const dx = prim.pos.x - this.cursor.x;
      const dy = prim.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      const r = prim.radius + 6; // the same forgiveness every other pick radius here uses
      if (d2 > r * r || d2 >= bestPrimD2) continue;
      bestPrimD2 = d2;
      bestPrim = prim.id;
    }
    if (bestPrim !== null) {
      this.characterSheet.select({ kind: 'structure', primitiveId: bestPrim });
      return true;
    }

    // Clicking empty ground dismisses the card and returns false, so the same click still acts on
    // the board — the RTS convention the popover already follows.
    this.characterSheet.select(null);
    return false;
  }

  /*
   * ⛔⛔ S181 — `handleStructureSelect` IS RETIRED, and its removal is the other half of his report.
   *
   * It aimed the FIX/SCRAP popover at one of your own shapes and opened the card on the same click.
   * With the popover gone there is nothing to aim, and the card is opened by `handleSheetSelect`
   * below — which is seat-agnostic (an enemy's card is a feature) and reaches a tower through its
   * whole ART BOX rather than a member shape's small radius, so it is strictly MORE generous than
   * the `pickOwnPrimitive` this used.
   *
   * ⚠ ITS PRECEDENCE MATTERED AND IS PRESERVED: it sat ABOVE the spark grab for own structures.
   * That is now irrelevant, because the only thing it did above the grab was aim a popover that no
   * longer exists; opening a card is explicitly ordered LAST so it can never steal a spark, a
   * hazard or a build click. See `handleSheetSelect`'s docblock.
   */

  /*
   * ⛔ S181 — `pickOwnPrimitive` IS RETIRED WITH ITS ONLY CALLER. It was the own-shapes-only pick
   * that aimed the FIX/SCRAP popover, and `handleStructureSelect` above was the only thing that
   * called it. The card's own pick supersedes it and is more generous (a tower's whole art box).
   *
   * ⚠ FOUR COMMENTS ELSEWHERE STILL CITE IT AS THE PRECEDENT FOR "pick off `prim.pos` + radius,
   * never sprite bounds" — `handleSheetSelect` here, `towerFrames.ts:365`, and two notes in
   * `feed-tower.spec.ts`. Those references are to the RULE, which still holds and is still
   * implemented by the card's pick; they are left standing deliberately rather than scrubbed, since
   * the reasoning they record is what keeps the gesture headlessly drivable.
   */

  private isPointerOverPanel(): boolean {
    return (
      this.world.gameState === 'PLAYING' &&
      this.castlePanel !== null &&
      this.castlePanel.isOverPanel(this.cursor.x, this.cursor.y)
    );
  }

  /**
   * ⛔⛔ S188 (audit F1) — **IS THE POINTER UNDER THE UPGRADE DRAFT PANEL?** The SURFACE question,
   * asked by the `onDown` early return and both `onUp` commit gates.
   *
   * The S181 defect in a sixth place: the panel (zIndex 900, opaque, ~559×270 over the quarry, its
   * side margins over buildable ground, plus the hover-detail plate below it) was registered in none
   * of this file's gates. Pixi's `pointertap` makes the pick and does not stop the native event, so
   * one click on a tile ALSO stamped an armed tower, re-tasked a gatherer, raided on a right-click or
   * opened a card under the panel — and the draft is open during BUILD by design, with the board
   * live underneath (`draftEvent.ts`), from the first tick of every match.
   */
  private isPointerOverDraftPanel(): boolean {
    return (
      this.world.gameState === 'PLAYING' &&
      this.draftPanel !== null &&
      this.draftPanel.isOver(this.cursor.x, this.cursor.y)
    );
  }

  /** ⭐ S188 (audit F1) — the CONTROL half, for the cursor: a tile a click would pick. */
  private isPointerOverDraftChoice(): boolean {
    return (
      this.world.gameState === 'PLAYING' &&
      this.draftPanel !== null &&
      this.draftPanel.isOverChoosable(this.cursor.x, this.cursor.y)
    );
  }

  /**
   * S136 P0 — OWN-CASTLE CLICK (owner playtest item 2). Opens the context panel; clicking the same
   * castle again closes it. Returns true when the click was consumed.
   *
   * Deliberately your OWN keep only: there is nothing to upgrade on an opponent's castle, and
   * opening a panel of controls you cannot use would read as a bug. Tested BEFORE the gatherer
   * preference cycle and the world hit-tests, so the castle box always wins its own footprint —
   * the two do not overlap today (a gatherer spawns at anchor.y + GATHERER_DEPOSIT_OFFSET_Y = +74,
   * outside the KEEP_H/2 = 29 box), but ordering it explicitly keeps that a fact rather than a
   * coincidence that a future keep resize could silently invert.
   */
  private handleCastleClick(): boolean {
    if (this.castlePanel === null || this.world.gameState !== 'PLAYING') return false;
    if (
      isPointInKeep(
        this.cursor.x,
        this.cursor.y,
        this.playerId as unknown as number,
        this.world.layout,
      )
    ) {
      this.castlePanel.toggle(this.playerId as unknown as number);
      /*
       * ⭐ S180 (owner playtest) — *"even the castle, it should have the same thing … with the castle
       * stats. There's no nothing."* The panel keeps every function it already has; the card adds
       * the health and the stats it never showed.
       *
       * ⭐⭐ S181 — **AND THE TWO NOW OPEN AND CLOSE AS ONE THING**, because they are drawn as one
       * thing. Found by testing the LIVE build rather than by a test: clicking the keep a second
       * time collapsed the docked panel and left the card header floating, so half of the merged
       * window vanished and the other half stayed. That is incoherent with the whole point of the
       * merge — *"I don't need two windows. It's confusing this way. So we just need one that covers
       * both."* A window that closes halfway is a third confusing state, not a fix.
       *
       * ⚠ THE PANEL IS THE SOURCE OF TRUTH for which way the toggle went, read AFTER `toggle` so
       * there is no second opinion about it. When it closed, the card closes with it; when it
       * opened, the card aims at the keep.
       */
      if (this.castlePanel.isOpen()) {
        this.characterSheet?.select({ kind: 'castle', seat: this.playerId });
      } else {
        this.characterSheet?.select(null);
      }
      return true;
    }
    /*
     * A click anywhere else dismisses an open panel, then falls through so the same click still acts
     * on the board — the RTS convention, and it keeps the game from feeling like it ate an input.
     *
     * ⭐⭐ S181 — and it takes the KEEP's card with it, for the same one-window reason as above. Only
     * the keep's: a click that dismisses the castle panel must not close a card the player opened on
     * a goblin, which is a different object and a different gesture.
     */
    if (this.castlePanel.isOpen()) {
      this.castlePanel.close();
      const sel = this.characterSheet?.selection();
      if (sel !== null && sel !== undefined && (sel as { kind?: string }).kind === 'castle') {
        this.characterSheet?.select(null);
      }
    }
    return false;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.isInputLocked()) return;
    this.updateCursor(e);
    // R81 — a pressed control must LOOK pressed. Set before any handler runs, so the frame that
    // acts on the click is the frame that shows it being taken.
    this.footerBand?.setPressed(true);
    // S136 P0 — CASTLE PANEL GUARD, and it is not optional. This raw canvas handler hit-tests WORLD
    // objects (bombs, rainbows, potatoes, sparks, bonds, creatures) with no notion of UI elements,
    // and Pixi's `pointertap` on a panel row does NOT suppress it — both fire for one physical
    // click. Without this early-return, clicking BUY GATHERER would ALSO grab a spark / sever a bond
    // / pop a creature under the cursor. Mirrored in `onUp` so a placement cannot commit onto it.
    if (this.isPointerOverPanel()) return;
    /*
     * ⛔⛔ S188 (audit F1) — THE DRAFT PANEL, SAME RULE, AND IT MUST SIT HERE: above the footer, the
     * Ra aim, the card's buttons, the castle click, the armed stamp and every world pick. It is drawn
     * above all of them (zIndex 900 sorts it over the band and the character card, which are
     * zIndex 0), so nothing hidden under it may act — a card button included. ONE return covers LMB
     * and RMB: the stamp, the gatherer / bomb / rainbow / potato / spark picks, the sheet, the raid and
     * a Ra cast (which keeps aiming, the held-tower rule). The pick itself is the panel's own Pixi
     * `pointertap`, which this does not touch. Mirrored in both `onUp` commit gates.
     */
    if (this.isPointerOverDraftPanel()) {
      /*
       * ⛔ S190 (audit IL-2) — BUT A RIGHT-CLICK STILL PUTS BACK WHAT IS IN HAND. RMB is this game's
       * put-it-back gesture — the Ra aim (`handleRaAimClick`) and a held tower (the armed arm below)
       * — and it acts on the HAND, not on the ground under the plate, so the plate has no reason to
       * eat it. The RAID stays swallowed: that one does act on the board. The aim is tested first,
       * the order `onDown` itself keeps; one gesture is in hand at a time, so at most one is set. The
       * panel's own `pointertap` ignores every button but the primary, so RMB makes no pick either.
       */
      if (e.button === 2) {
        if (raAimPreview() !== null) setRaAimPreview(null);
        else if (this.castlePanel?.armedBlueprint() != null) this.castlePanel.disarm();
      }
      return;
    }
    // ⭐ S149 P4 (R36) — THE FOOTER BAND. Same rule and the same reason as the panel guard
    // above: this handler hit-tests world objects with no notion of UI, so a chip press would
    // otherwise ALSO grab a spark or sever a bond underneath it. Only CHIPS consume the click —
    // the empty stretches of the band stay live board, which is the lesson that got the
    // original 1920-wide footer plate deleted in S136 P0.
    if (e.button === 0 && this.handleFooterChipClick()) return;
    /*
     * ⭐⭐⭐ S181 (owner) — **THE CARD'S FIX / SCRAP / FEED TAKES THE POPOVER'S SLOT.** This single
     * line is the whole of his bug report, and it is a PRECEDENCE bug, not a drawing one:
     *
     * > *"I'm trying to click on the soul to build more soul eaters within the soul eater tower but
     * > it's not wired — only the buttons behind. So the scrape, the fix and the soul underneath,
     * > behind the actual current tower sheet, is the one that's wired. You need to rewire it and
     * > remove the old ones."*
     *
     * S181's earlier commit drew the buttons on the card and routed their clicks inside
     * `handleSheetSelect` — which sits near the BOTTOM of this handler, below every world pick.
     * `handleStructureActionClick` (the popover) sat HERE, at the top. So the popover won every
     * click and the card's buttons were decoration. Both surfaces existed, only one was live, and
     * the live one was the one he could see behind the other.
     *
     * ⛔ IT MUST STAY IN THIS SLOT, ABOVE THE WORLD HIT-TESTS, for the reason the popover's own
     * comment gave: this handler tests world objects with no notion of UI, so pressing SCRAP would
     * otherwise ALSO grab a spark or sever a bond underneath the button. Buttons only — the rest of
     * the board around the card stays live.
     */
    if (e.button === 0 && this.handleSheetActionClick()) return;
    // ⭐ S188 P6 — an aimed Ra owns the next BOARD click. ⛔ S188 audit F4: BELOW the card's own
    // FIX / SCRAP / FEED (the line above), exactly as a held tower is, or aiming swallowed them. ABOVE
    // the castle click on purpose: striking the enemy at your own keep is a legitimate aim.
    if (this.handleRaAimClick(e.button)) return;
    // S136 P0 — then the castle itself: clicking your own keep opens/closes its control panel.
    if (e.button === 0 && this.handleCastleClick()) return;
    // S144 P3 — A HELD TOWER OWNS THE NEXT CLICK. This must sit above every world hit-test: without
    // it, placing a tower would ALSO grab the spark under the cursor / sever a bond / pop a creature,
    // which is the identical failure the castle-panel guard above exists to prevent. RMB (or Escape,
    // in onKeyDown) puts it back instead.
    const armed = this.castlePanel?.armedBlueprint() ?? null;
    if (armed !== null) {
      if (e.button === 2) {
        this.castlePanel?.disarm();
        return;
      }
      if (e.button === 0) {
        /*
         * ⛔⛔ S182 — **NEVER STAMP A TOWER ON GROUND THE CARD IS COVERING.** This is the S181
         * defect in a FOURTH place, found by enumerating the UI-surface guards rather than by a
         * new report.
         *
         * `isPointerOverCard` was added in S181 to the two PLACE commit gates in `onUp` — and this
         * arm is neither of them. The castle panel is guarded at the top of `onDown` and a footer
         * chip/strip press is consumed by `handleFooterChipClick` above, but the CARD's body is not
         * consumed until `handleSheetSelect`, which sits BELOW here. So arming a tower and clicking
         * anywhere on an open character card that is not one of its buttons stamped a structure on
         * board the player could not see — word for word what S181's own docblock says the
         * predicate exists to prevent.
         *
         * ⚠ SWALLOWED, NOT FALLEN THROUGH, and deliberately: *"A HELD TOWER OWNS THE NEXT CLICK"*
         * is the rule three lines above, and the tower stays in hand, which is fully reversible —
         * the same reasoning `onUp`'s potato guard states for staying carried. The card's own
         * FIX / SCRAP / FEED buttons still work, because `handleSheetActionClick` runs ABOVE this.
         */
        if (this.isPointerOverCard()) return;
        /*
         * ⛔⛔ S182 — **AND NOT OVER ANYTHING THE FOOTER BAND DRAWS OPAQUELY.** THIS is the gate
         * that refuses the placement, and two earlier attempts at the same defect both missed it.
         *
         * The band is guarded everywhere else by CONSUMPTION — `handleFooterChipClick` runs above
         * and returns, so a chip or strip press never reaches here. But it returns TRUE only when a
         * control was actually pressed. The carry readout's plate is not a control: it is an opaque
         * `0x0b0f16` rectangle drawn above the board AND above the blueprint ghost, and it exists
         * only while a tower is armed — i.e. only during the exact gesture it corrupts. So the
         * click fell through, and `canStampAt` said YES, because item 1 had just made the band's
         * own y legal for a flat recipe (voltkin's nodes are all `dy = 0`, so its box is ±12 px
         * tall and clears `CANVAS_HEIGHT − EDGE_PAD` with room to spare). A voltkin planted under
         * its own cost readout — invisible before the click and after it.
         *
         * ⚠ WIDENING `isOverChip` DOES NOT FIX THIS, and that was the first attempt: it makes
         * `isPointerOverFooterChip()` true over the plate without making `handleFooterChipClick`
         * RETURN true, so nothing changes here — while the hover cursor starts advertising a
         * readout as clickable. The guard has to be asked AT THE GATE, and it has to be the
         * SURFACE question. Same swallow-don't-strand contract as the card guard above: the tower
         * stays in hand, fully reversible.
         */
        if (this.isPointerOverFooterSurface()) return;
        const centre = { x: this.cursor.x, y: this.cursor.y };
        // ⚠ THE LOCAL GATE DECIDES WHETHER TO *KEEP HOLDING*, NOT WHETHER THE BUILD IS LEGAL.
        //
        // The host is still the authority — it re-runs `stampRefusalAt` against its own world and a
        // refusal is a documented no-op. But clicking a spot the ghost is already showing as RED must
        // not silently cost the player their selection: they would have to reopen the panel and pick
        // the tower again, with nothing explaining why. So an illegal click keeps the tower in hand and
        // sends nothing (the ghost is already naming the blocker), and only a legal click commits.
        // Same `gateLocally` shape `dragPreview.ts` uses for single-primitive placement.
        if (!canStampAt(this.world, centre, this.playerId, armed)) return;
        this.onBuildBlueprint?.(armed, centre);
        // One pick = one tower. Staying armed would let a single pick spam structures across the map
        // on every subsequent click.
        this.castlePanel?.disarm();
        return;
      }
    }
    if (e.button === 0) {
      // LMB
      const player = this.world.players.get(this.playerId);
      if (player?.kind === 'Idle' && player.carriedPotatoId === undefined) {
        // S71 P1 — bomb hazard takes pickup priority within its radius: grabbing
        // it is an INSTANT host-authoritative detonation (TRIGGER_BOMB), NOT a
        // carry. No client prediction / pointer capture — the host applies and the
        // severed bonds arrive in the next snapshot (~RTT/2). Rushing players who
        // misclick the orb pay the price.
        // V6-1.2 — CLICK YOUR OWN GATHERER to cycle what it prefers to fetch:
        // Any → Dot → Line → Triangle → Square → Circle → Spiral → Any. This is the owner's
        // "selection of his preferences" in its minimal usable form; the full picker + the ordered
        // build queue are V6-1.4. Priority is ABOVE spark pickup so a gatherer standing over a
        // banked shape is still clickable, and below the bomb hazard.
        const gathererId = this.pickGatherer();
        if (gathererId !== null) {
          const g = this.world.gatherers.get(gathererId)!;
          this.dispatchFn({
            type: 'SET_GATHERER_PREFERENCE',
            playerId: this.playerId,
            gathererId,
            preferredType: nextPreference(g.preferredType),
          });
          return;
        }
        const bombId = this.pickBomb();
        if (bombId !== null) {
          this.dispatchFn({ type: 'TRIGGER_BOMB', bombId, playerId: this.playerId });
          return;
        }
        // S75 P3 — rainbow pickup priority (instant global colour-shuffle; below the bomb
        // hazard, above the potato carry). Clicking it fires TRIGGER_RAINBOW — host-authoritative,
        // no carry, no pointer capture; the recoloured world arrives in the next snapshot.
        const rainbowId = this.pickRainbow();
        if (rainbowId !== null) {
          this.dispatchFn({ type: 'TRIGGER_RAINBOW', rainbowId, playerId: this.playerId });
          return;
        }
        // S72 P3 — potato pickup priority (above sparks, below the bomb hazard). Grabbing
        // a FREE potato starts a host-authoritative carry that follows you until you PLACE
        // (LMB-up) or DROP it. Capture the pointer so the up fires on the canvas.
        const potatoId = this.pickPotato();
        if (potatoId !== null) {
          this.acquirePointerCapture(e);
          this.dispatchFn({ type: 'PICKUP_POTATO', potatoId, playerId: this.playerId });
          return;
        }
        const spark = this.pickSpark();
        if (spark !== null) {
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
          // S86 P3 — enter the drag gesture ONLY if the claim LANDED. The
          // dispatch above is synchronous into the local world on host/solo
          // AND on the joiner (PICKUP_SPARK is in main.ts PREDICTABLE_ACTIONS,
          // and every reducer gate — pooped arrival, bench, not-Free race —
          // is a pure fn of synced fields), so "did it land" is simply "is
          // the spark Carried by me now". Pre-S86 the gesture was entered
          // unconditionally BEFORE the dispatch, so a gate-REJECTED claim
          // left an AttractDrag driving a still-Free spark at full cursor
          // speed forever — the round-6 "pooped player still collects at
          // normal speed" exploit. Rejected claim → no gesture, no capture,
          // spark untouched.
          const claimed = this.world.freeSparks.get(spark.id);
          if (
            claimed !== undefined &&
            claimed.state.kind === 'Carried' &&
            claimed.state.carrierId === this.playerId
          ) {
            this.state = {
              kind: 'AttractDrag',
              sparkId: spark.id,
              cursor: { ...this.cursor },
            };
            this.acquirePointerCapture(e);
          }
          return;
        }

      }

      /*
       * ⭐ S180 (owner) — **THE CHARACTER SHEET, ORDERED LAST OF ALL.**
       *
       * Placed below every existing gesture on purpose: a click that wanted a spark, a hazard, or
       * the FIX/SCRAP popover has already returned, so opening a card can never steal one of them.
       * That ordering is the whole risk mitigation for touching this file, and the reason the
       * precedence is pinned by a test rather than left to reading.
       *
       * ⚠ SEAT-AGNOSTIC, unlike every other LMB pick here — an ENEMY's card is the feature
       * (owner S180: an enemy sheet shows LIVE health), so there is deliberately no owner filter.
       *
       * ⛔⛔ S182 (owner: *"sometimes player two can't click and see the stat sheets, either of his
       * own characters or of the enemies"*) — **AND IT IS OUTSIDE THE IDLE GATE, WHICH IS WHY THE
       * BRACE ABOVE MOVED.** S180 nested this inside
       * `player?.kind === 'Idle' && player.carriedPotatoId === undefined`, so a player who was
       * carrying a potato, mid-spark-drag, or in any non-Idle state could not open ANY card — not
       * an enemy's, not their own.
       *
       * ⭐ THE EXEMPTION IS PRINCIPLED, NOT A LOOSENING: every other pick in that block MUTATES the
       * world (`SET_GATHERER_PREFERENCE`, `TRIGGER_BOMB`, `TRIGGER_RAINBOW`, `PICKUP_POTATO`,
       * `PICKUP_SPARK`), and the Idle gate exists so a busy avatar cannot start a second gesture.
       * **Opening a card mutates nothing** — `handleSheetSelect` is render-only selection, dispatches
       * no action and captures no pointer — so there is no second gesture to guard against. It stays
       * LAST, so a click that wanted one of those gestures still wins; it simply no longer needs the
       * avatar to be free in order to be READ.
       */
      if (this.handleSheetSelect()) return;
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
      // S102 #1 — RAID: the right-click "raid" can now also pop an enemy SPAWN. Pick a
      // creature FIRST (a chewer hopping on top of a bond should be the target, not the bond
      // under it); if one is under the cursor, raid it (host charge-gates + enemy-checks).
      // Otherwise fall back to the connector sever (the original raid).
      // ⭐ S152 P1 (owner R78) — BOTH ARMS ARE NOW RAIDS, AND THE PRECEDENCE IS UNCHANGED.
      // Creature first, bond second, for the reason S102 already wrote down: a chewer hopping on
      // top of a bond should be the target, not the bond under it. R78 asked for exactly this
      // order and it was already shipped, so nothing about the ordering moves.
      //
      // ⚠ WHAT CHANGED: the bond arm used to dispatch SEVER_BOND directly — a guaranteed cut
      // for 2 disruption charges. Under R78 a right-click IS a 2-ATK hit, so the bond arm raids too
      // and the sever becomes a CONSEQUENCE of damage reaching the connector's capacity (the
      // reducer re-dispatches SEVER_BOND itself). A player can no longer buy a guaranteed cut, and
      // against a component of 7+ connectors a raid cannot sever at all.
      /*
       * ⭐⭐ S168 P1 — **THE CLICK IS RESOLVED BY HOW DELIBERATE IT WAS, NOT BY FAMILY RANK.**
       *
       * Owner: *"not fair that they can destroy my tower with one raid action and when i attack its
       * just a cloud and some atk damage as it should be"*. Both halves of that sentence were true,
       * and the second half is THIS code.
       *
       * ⛔ THE ASYMMETRY. This used to be an unconditional precedence — creature, then defender,
       * then bond — and the radii are wildly unequal: `CREATURE_PICK_DIST` is 34 px,
       * `BOND_PICK_DIST` is 8. So ANY enemy unit within 34 px swallowed the right-click. During
       * FIGHT an enemy tower is surrounded by the units it just spawned, which is exactly when a
       * player wants to raid it — so his raid reliably landed on a unit and read as *"just a cloud
       * and some atk damage"*. The BOT has no picker at all: `botRaidAction` always emits
       * `{kind:'bond'}`, and `nearestEnemySpawnerBond` deliberately hunts connectors INTERNAL to a
       * spawner's component. The bot could always aim where the player never could.
       *
       * ⭐ THE FIX PRESERVES R78's "UNITS FIRST" WHERE IT WAS ACTUALLY MEANT. Each candidate is
       * scored as `distance / its own pick radius`, and the smallest ratio wins. A chewer hopping ON
       * the bond (3 px => 0.09) still beats the bond under it (5 px => 0.63) — the case S102 wrote
       * the precedence for. But a connector under the cursor (2 px => 0.25) now beats a unit 20 px
       * away (0.59), which is the case the precedence was silently stealing.
       *
       * ⚠ TIES KEEP ARRAY ORDER, and the array is in the old precedence order — so an exact tie
       * still resolves creature -> defender -> bond, exactly as R78 asked.
       */
      const creatureHit = this.pickCreature();
      const defenderHit = this.pickRaidableDefender();
      const bondHit = this.pickBond();
      switch (bestPickIndex([creatureHit, defenderHit, bondHit])) {
        case 0:
          this.dispatchFn({
            type: 'RAID_TARGET',
            target: { kind: 'creature', id: creatureHit!.id },
            playerId: this.playerId,
          });
          return;
        case 1:
          this.dispatchFn({
            type: 'RAID_TARGET',
            target: { kind: 'defender', id: defenderHit!.id },
            playerId: this.playerId,
          });
          return;
        case 2:
          this.dispatchFn({
            type: 'RAID_TARGET',
            target: { kind: 'bond', id: bondHit!.id },
            playerId: this.playerId,
          });
          return;
        default:
          return;
      }
    }
  };

  private onMove = (e: PointerEvent): void => {
    this.updateCursor(e);
    if (this.state.kind === 'AttractDrag') {
      this.state = { ...this.state, cursor: { ...this.cursor } };
    }
    // S53 P2 — ConnectDrag branch removed (unreachable state post-S52 P1).
    // ⭐ S188 P6 — the Ra aim follows the cursor.
    const aiming = raAimPreview();
    if (aiming !== null) setRaAimPreview({ seat: aiming.seat, x: this.cursor.x, y: this.cursor.y });
    this.updateHoverCursor();
  };

  /*
   * ⭐ S152 A5 (owner playtest) — THE CANVAS CURSOR ANSWERS "IS THIS CLICKABLE?".
   *
   * Owner: *"everything that is clickable doesnt show that it is clickable ... we also know
   * inherently what is clickable and what is not"*.
   *
   * The title buttons are real Pixi containers and get `cursor: 'pointer'` for free. Every IN-GAME
   * surface — the footer tower chips, the castle panel, the FIX/SCRAP/FEED popover — is drawn onto
   * a raw canvas and hit-tested by hand, so the browser has no idea any of it is interactive and the
   * cursor never changed anywhere on the board.
   *
   * ⭐ THIS COSTS NOTHING NEW TO KNOW. The same `isOver*` predicates the CLICK path already consults
   * are asked here on move, so the cursor can never disagree with what a click would actually hit —
   * which is the failure mode a second, parallel hover hit-test would have introduced.
   */
  private updateHoverCursor(): void {
    /*
     * ⛔ S190 (audit IL-1 / IL-B2) — UNDER THE DRAFT PLATE, ONLY THE DRAFT'S OWN TILES ARE CONTROLS.
     * The panel is drawn above the band and the card (zIndex 900) and `onDown` swallows every click
     * on it, so a card button, an owned-unit row, a footer chip or a castle row hidden UNDER it must
     * not earn a pointer or light up — that promised a click the guard then ate. The draft SURFACE
     * question may only SUPPRESS a pointer here, never grant one: under the plate the answer is the
     * CONTROL question's (`isPointerOverDraftChoice`), and off it the draft has nothing to say, since
     * every choosable tile lies inside the plate.
     */
    const underDraft = this.isPointerOverDraftPanel();
    const overUi = underDraft
      ? this.isPointerOverDraftChoice()
      : this.isPointerOverFooterChip() ||
      // ⭐⭐ S181 — the CARD's buttons, replacing the retired popover's. Includes DISABLED ones on
      // purpose: the pointer should say "this is a control" even when the control is refusing, which
      // is what makes a greyed FIX read as deliberate rather than as dead plate.
      (this.characterSheet?.isOverAnyAction(this.cursor.x, this.cursor.y) ?? false) ||
      // ⭐ S181 — the OWNED-UNIT ROW is clickable too (it re-aims the card at the unit a building
      // fields — his *"you can either click on that"*), and it had no cursor and no highlight. It
      // is on the same card as the buttons, so a player learns the card lies about what is live.
      (this.characterSheet?.ownedRowAt(this.cursor.x, this.cursor.y) ?? null) !== null ||
      (this.castlePanel?.isOpen() === true &&
        this.castlePanel.isOverPanel(this.cursor.x, this.cursor.y));
    /*
     * S153 P4 (owner R81) — *"everything clickable should pop out, be highlighted and/or make a
     * sound"*. The cursor already answered "is this clickable?"; this makes the CONTROL itself
     * answer it, which is what the owner asked for — a cursor change is easy to miss on a dark
     * board full of moving parts.
     *
     * ⚠ FED FROM THE VERY PREDICATES EVALUATED DIRECTLY ABOVE, never a parallel hit test. A
     * highlight that can disagree with the click path is worse than none.
     */
    // ⛔ S190 (IL-1) — under the draft plate nothing hidden lifts either: the highlights are fed an
    // off-canvas point, so they agree with the cursor above and with the click `onDown` swallows.
    const lift = underDraft ? { x: -1, y: -1 } : this.cursor;
    this.footerBand?.setHover(lift.x, lift.y);
    // ⭐⭐ S181 (owner) — *"any button that's clickable should, when you mouse over it, slightly
    // change hue. So it looks like it's popping out."* Fed from the SAME predicate evaluated three
    // lines above, never a parallel hit test — see this function's own docblock.
    this.characterSheet?.setHover(lift.x, lift.y);
    // ⭐ S188 P6 — a crosshair over the board while aiming Ra: the next click lands the strike.
    const want = overUi ? 'pointer' : raAimPreview() !== null ? 'crosshair' : '';
    // Write only on CHANGE: assigning style.cursor every pointermove is a layout-thrash source on
    // a canvas that already moves the cursor every frame.
    if (this.lastCursorStyle !== want) {
      this.canvasEl.style.cursor = want;
      this.lastCursorStyle = want;
    }
  }

  private lastCursorStyle = '';
  private readonly canvasEl: HTMLCanvasElement;

  private onUp = (e: PointerEvent): void => {
    if (this.isInputLocked()) return;
    this.updateCursor(e);
    // ⚠ RELEASED WHEREVER IT HAPPENS. `onUp` is bound to WINDOW, not the canvas, precisely so a
    // release off the board still arrives — otherwise dragging off a pressed chip would leave it
    // stuck depressed forever, the trap the title-screen buttons documented in S152 A5.
    this.footerBand?.setPressed(false);
    // S72 P3 — place a carried potato on LMB-up (the carry is world state, not an
    // AttractDrag). Plant it ARMED at the cursor + release the gesture capture.
    if (e.button === 0) {
      const meNow = this.world.players.get(this.playerId);
      // S136 P0 — do not PLANT a potato under the castle panel (it would be hidden beneath it).
      // The potato simply stays carried, which is fully reversible — unlike onDown, blocking here
      // cannot strand state.
      // S181 — `&& !this.isPointerOverCard()` for the reason that predicate records: the card is
      // drawn above every surface except the zIndex-900 draft panel, so a release over it would drop
      // a potato on unseen ground.
      /*
       * ⛔⛔ S182 — **THE FOOTER GUARD** WAS MISSING HERE, AND THE CODEBASE SAID IT
       * WAS PRESENT. `footerBand.isOverShapeStrip`'s own docblock enumerates the four places
       * `controls.ts` consults this predicate and names *"the potato plant"* as one of them. It was
       * not one of them. Reachable in one gesture: carry a potato, press a tier chip or a palette
       * button — `onDown` consumes the press, then this `onUp` PLANTS THE POTATO under the band.
       *
       * Found S182 by enumerating every UI-surface guard rather than by a report, which is the
       * point: a surface registered in SOME guards and not others is this file's signature defect
       * (S181 shipped exactly it for the character card), and the docblock claiming otherwise is
       * what makes it survive review.
       *
       * ⭐ S182, SECOND PASS — it now asks `isPointerOverFooterSurface`, not the narrower control
       * test: the band also draws an OPAQUE carry readout, and a potato dropped under that is the
       * same defect as one dropped under a chip. See that predicate for why the two questions are
       * deliberately separate.
       */
      if (
        meNow !== undefined &&
        meNow.carriedPotatoId !== undefined &&
        !this.isPointerOverPanel() &&
        !this.isPointerOverFooterSurface() &&
        !this.isPointerOverCard() &&
        // ⛔ S188 (audit F1) — nor under the draft panel: a potato released there stays carried.
        !this.isPointerOverDraftPanel()
      ) {
        this.dispatchFn({
          type: 'PLACE_POTATO',
          playerId: this.playerId,
          pos: { x: this.cursor.x, y: this.cursor.y },
        });
        this.releasePointerCapture(e);
        return;
      }
    }
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
        const isClient = isNetworked(this.world) && !this.world.isHost;
        const targetRefPos = isClient ? this.cursor : spark.pos;
        const reachDx = this.cursor.x - spark.pos.x;
        const reachDy = this.cursor.y - spark.pos.y;
        // S55 P3 — gate composition extracted to the pure computeReleaseGates
        // (testable without a Pixi Application / DOM). The isClient bypass
        // (S45 BUG-CRITICAL-3 Sym A + S49 Sym F: a joiner trusts the host's
        // authoritative reach / spawner-zone / enemy-territory checks because
        // its snapshot-lagged world makes the local gates fire unreliably)
        // lives inside the helper. Zone + territory are probed ONLY for the
        // host here, preserving the original short-circuit — canBuildAt
        // is never called in client mode.
        const gates = computeReleaseGates({
          isClient,
          reachDistSq: reachDx * reachDx + reachDy * reachDy,
          maxReleaseReachSq: MAX_RELEASE_REACH * MAX_RELEASE_REACH,
          hostInZone: isClient ? false : this.isInsideSpawnerZone(spark.pos),
          hostInTerritory: isClient
            ? false
            : // ⭐ S149 P1 — zone partition, not influence bubble (see placePrimitive.ts). Note the
              // NEGATION: the gate field is named `hostInTerritory` and means "refuse", whereas
              // `canBuildAt` means "allow", so this arm must invert where the old call did not.
              !canBuildNow(this.world, spark.pos, this.playerId),
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
        // S136 P0 — releasing over the castle panel is a REJECTED placement, not a blocked event: the
        // DROP_SPARK above has already released the claim, so the spark stays Free where physics
        // put it and the player is Idle. Routing through the existing reject path (rather than an
        // early return) is what guarantees no stuck "glued spark" state — the S52/S58 lesson.
        if (
          gates.commit &&
          !this.isPointerOverPanel() &&
          !this.isPointerOverFooterSurface() &&
          // S181 — and not over the character card, which is drawn above every surface except the
          // zIndex-900 draft panel.
          !this.isPointerOverCard() &&
          // ⛔ S188 (audit F1) — nor under the draft panel. A spark dragged off the board and released
          // over its side margins placed on ground the plate hides; now it is a rejected placement
          // (the DROP above has released the claim, so nothing is stranded).
          !this.isPointerOverDraftPanel()
        ) {
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
    } else if (player !== undefined && player.carriedPotatoId !== undefined) {
      // S72 P3 — drop a carried potato on capture loss (alt-tab / focus steal) so it's
      // never stuck in-hand; it lands ARMED at its last pos + keeps its from-SPAWN fuse.
      this.dispatchFn({ type: 'DROP_POTATO', playerId: this.playerId });
    }
    if (this.state.kind !== 'Idle') this.state = { kind: 'Idle' };
  };

  // S49 P1 (Sym F) — Q key → SHRINK_TERRITORY. Consumes 1 disruptionCharge;
  // halves all enemy territorial radii for 5s. 1v1 PLAYING only; guard
  // prevents charge drain in solo / LOBBY / WIN states and when typing into
  // an input field.
  private onKeyDown = (e: KeyboardEvent): void => {
    // ⭐ S188 P6 — Escape puts the Ra aim away, like a held tower.
    if (e.key === 'Escape' && raAimPreview() !== null) {
      setRaAimPreview(null);
      return;
    }
    // S144 P3 — Escape puts a held tower down. Checked BEFORE the sudoku guard's sibling checks so
    // there is always a keyboard way out of a picked-up state, even if the pointer path is confused.
    if (e.key === 'Escape' && this.castlePanel?.armedBlueprint() != null) {
      this.castlePanel.disarm();
      return;
    }
    // S93 — the NONET overlay owns the keyboard during a trial (digits 1–6).
    if (this.world.sudoku !== null) return;
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
      // ⭐ V6-1.2 (owner instruction 2026-08-09) — THE GRAB MOVED, IT DID NOT DISAPPEAR. Harvesting
      // the spawn zone is now the gatherers' job; the player builds from what is parked at their
      // keep. So a spark INSIDE the spawn disc is not player-pickable, while a banked (or in-flight)
      // shape outside it is grabbed through this same, unchanged path. `CarryingPlayer` therefore
      // stays fully functional — B6 additive-only is honoured; only the SOURCE narrows.
      if (isInsideSpawnZone(s.pos) && s.escrow === undefined) continue;
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

  /**
   * S71 P1 — nearest bomb whose body is under the cursor (within its own radius).
   * Used by onDown to give the bomb pickup priority over sparks (it's a hazard you
   * "accidentally grab in the rush"). Returns null if the cursor is on no bomb.
   */
  private pickBomb(): BombId | null {
    let bestId: BombId | null = null;
    let bestDistSq = Infinity;
    for (const b of this.world.bombs.values()) {
      const dx = b.pos.x - this.cursor.x;
      const dy = b.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= b.radius * b.radius && d2 < bestDistSq) {
        bestId = b.id;
        bestDistSq = d2;
      }
    }
    return bestId;
  }

  /**
   * S72 P3 — nearest grabbable potato whose body is under the cursor (within POTATO_RADIUS).
   * S75 P1 — a placed (ARMED) potato is now RE-GRABBABLE (true hot-potato: pass it around
   * until it blows). Only a CARRIED potato (already in someone's hand) is un-grabbable.
   * Mirrors pickBomb; grabbing starts a host-authoritative carry (PICKUP_POTATO).
   */
  private pickPotato(): PotatoId | null {
    let bestId: PotatoId | null = null;
    let bestDistSq = Infinity;
    for (const p of this.world.potatoes.values()) {
      if (p.state === 'CARRIED') continue;
      const dx = p.pos.x - this.cursor.x;
      const dy = p.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= POTATO_RADIUS * POTATO_RADIUS && d2 < bestDistSq) {
        bestId = p.id;
        bestDistSq = d2;
      }
    }
    return bestId;
  }

  /**
   * S75 P3 — nearest rainbow whose body is under the cursor (within RAINBOW_RADIUS). Used by
   * onDown to give the rainbow instant-trigger priority (below the bomb hazard, above the potato
   * carry). Mirrors pickBomb; clicking fires TRIGGER_RAINBOW (host-authoritative colour-shuffle).
   */
  private pickRainbow(): RainbowId | null {
    let bestId: RainbowId | null = null;
    let bestDistSq = Infinity;
    for (const r of this.world.rainbows.values()) {
      const dx = r.pos.x - this.cursor.x;
      const dy = r.pos.y - this.cursor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= RAINBOW_RADIUS * RAINBOW_RADIUS && d2 < bestDistSq) {
        bestId = r.id;
        bestDistSq = d2;
      }
    }
    return bestId;
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

  private pickBond(): PickHit<BondId> | null {
    let bestId: BondId | null = null;
    let bestDist = BOND_PICK_DIST;
    for (const bond of this.world.bonds.values()) {
      /*
       * ⛔⛔ S168 POST-AUDIT — **ENEMY-ONLY, AND ITS ABSENCE WAS A REGRESSION THIS SESSION CAUSED.**
       *
       * `pickCreature` and `pickRaidableDefender` have always filtered enemy-only; `pickBond` never
       * did, and it did not matter while the RMB handler was a strict creature-first PRECEDENCE — an
       * own bond could only win when nothing else was in range at all.
       *
       * Scoring by ratio changed that. One of YOUR bonds 2 px under the cursor (0.25) now beats an
       * enemy chewer 20 px away (0.59), and the reducer then refuses it in silence — `world.ts`
       * returns early on `aOwner === action.playerId`, so no point is spent, no cloud is drawn and
       * nothing is said. Right-clicking an enemy unit standing on your own structure — i.e. most of
       * a FIGHT — would do visibly nothing, which is the SAME complaint the picker fix was written
       * to end, inverted.
       *
       * Ownership is read off the joined primitives exactly as the reducer reads it, so the picker
       * and the gate can never disagree about whose bond it is.
       */
      const aOwner = this.world.primitives.get(bond.aId)?.placedBy;
      const bOwner = this.world.primitives.get(bond.bId)?.placedBy;
      if (aOwner === this.playerId || bOwner === this.playerId) continue;
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
    return bestId === null ? null : { id: bestId, ratio: bestDist / BOND_PICK_DIST };
  }

  /**
   * S102 #1 — nearest ENEMY pencil-chewer (sourceSpawnerId !== null) within CREATURE_PICK_DIST
   * of the cursor, for a right-click RAID. Enemy-only (skips the player's own creatures) and
   * chewer-only this session (Voltkin-raid + its lightning-cloud discombobulate ship next
   * session). The host re-checks ownership/charge authoritatively in the RAID_CREATURE reducer;
   * this is just the cursor hit-test (mirrors pickBond).
   */
  private pickCreature(): PickHit<CreatureId> | null {
    let bestId: CreatureId | null = null;
    let bestDist = CREATURE_PICK_DIST;
    for (const c of this.world.creatures.values()) {
      /*
       * ⭐ S158 A3 (owner) — **THE CHEWERS-ONLY LINE IS GONE FROM THE PICKER TOO.**
       *
       * Owner: *"a raid should hit anything, it holds a certain attack strenght and stats of its
       * own — again ive already explained it when we worked the unit and tower stats."*
       *
       * ⛔ S152 P1 removed `sourceSpawnerId !== null` from the REDUCER, recording that *"R78 says
       * units"* — and left it standing HERE. So the rule was widened where it is enforced and not
       * where it is aimed: a Voltkin or a free goblin could be damaged by a raid the input layer
       * would never let you aim at. The published R78 kill table lists voltkin at 7 raids; nobody
       * could ever have spent the first one.
       *
       * A half-widened rule is worse than an un-widened one, because the record says it shipped.
       */
      if (c.ownerPlayerId === this.playerId) continue; // enemy-only
      /*
       * ⭐ S171 (owner R142/R171-A) — the cursor cannot AIM at what cannot be targeted.
       *
       * ⚠ THIS IS THE COSMETIC HALF AND IT IS DELIBERATELY NOT THE GATE. The authoritative refusal
       * is in the `RAID_TARGET` reducer (`state/world.ts`), which is what actually spends the point;
       * a replayed or hand-built action never passes through here at all. This exists so the cursor
       * does not promise a raid the host will refuse.
       */
      if (isUntargetable(c, this.world.tick)) continue;
      const d = Math.hypot(this.cursor.x - c.pos.x, this.cursor.y - c.pos.y);
      if (d < bestDist) {
        bestDist = d;
        bestId = c.id;
      }
    }
    return bestId === null ? null : { id: bestId, ratio: bestDist / CREATURE_PICK_DIST };
  }

  /**
   * ⭐ S158 A3 — the nearest ENEMY defender under the cursor that a raid can actually hurt.
   *
   * `ehp !== null` is the filter, and it is the same discriminator the damage arm uses rather than
   * a proxy for it: a TOWER carries `null` (R75 — its durability is its connectors'), so it is
   * unaimable here and unhurtable there, and the two can never drift apart.
   */
  private pickRaidableDefender(): PickHit<DefenderId> | null {
    let bestId: DefenderId | null = null;
    let bestDist = CREATURE_PICK_DIST;
    for (const d of this.world.defenders.values()) {
      if (d.ehp === null) continue; // a tower — nothing to spend a raid point on
      if (d.ownerPlayerId === this.playerId) continue; // enemy-only
      const dist = Math.hypot(this.cursor.x - d.pos.x, this.cursor.y - d.pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = d.id;
      }
    }
    return bestId === null ? null : { id: bestId, ratio: bestDist / CREATURE_PICK_DIST };
  }

  private isInsideSpawnerZone(p: Vec2): boolean {
    const dx = p.x - SPAWNER_CENTER_X;
    const dy = p.y - SPAWNER_CENTER_Y;
    return dx * dx + dy * dy <= SPAWNER_RADIUS * SPAWNER_RADIUS;
  }
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
  if (params.gameMode === 'solo') return false; // S62 — networked-only (any non-solo)
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
