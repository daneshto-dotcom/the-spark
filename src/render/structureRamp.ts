/**
 * SPARK — S182 — **THE DAMAGE RAMP. The reusable path, proven once on the lightning hub.**
 *
 * The owner is holding art back until he has seen this work: *"I already have art for goblins and
 * for pencil chewers and pentagram and for laser tower, for everything else, but I first want to see
 * you implement this before I give you all the rest."* So the deliverable is the SEAM, not the hub.
 *
 * ⛔ **AND THE OTHER TWELVE TOWERS ARE DELIBERATELY NOT MIGRATED.** *"We're gonna do this one at a
 * time. We're not gonna do all of them because it's not gonna work, you're gonna get confused,
 * you're gonna get things wrong. Currently you're just gonna focus on the lightning hub. I will
 * present them one after another."* `RAMP_SPECS` has exactly one entry and adding the second is his
 * call, not a tidy-up.
 *
 * ## ⭐ WHAT A SECOND TOWER COSTS: ONE SPEC HERE, ONE JSON, ONE WORD IN `check:atlas`
 *
 *   1. `assets-source/<tower>/atlas-specs.json` — data, built by `scripts/build-sheet-atlas.mjs`.
 *   2. ONE entry in `RAMP_SPECS` below.
 *   3. `public/art/<tower>` appended to the `check:atlas` structures group in `package.json`.
 *
 * `StructureRampRenderer` is generic over this table, is registered once in `main.ts`, and is
 * already wired to the fog gate, the atlas-load bail and `markTowerCover`. Nothing else moves.
 *
 * ## ⭐⭐⭐ R182-D (owner) — THE RAMP PLAYS THROUGH. IT NEVER SNAPS.
 *
 * > *"It runs through a loop. You just make like a video from seventy six to fifty two, however many
 * > cutouts that is, in a shot. You don't skip them, you just run them through. It makes it look like
 * > a video. The more damage is done, the more it looks like a whole video loop. If he destroys a
 * > whole structure in one hit, within like one second it looks like a whole structure got destroyed."*
 *
 * The health fraction gives a TARGET frame; the cursor walks to it one frame at a time, playing
 * every frame between. A chip of damage plays a short run; a one-shot kill plays all 24. That is the
 * whole mechanism, and `HUB_RAMP_TICKS_PER_FRAME` is the only dial.
 *
 * ⛔ **THE CURSOR IS CLIENT-LOCAL PRESENTATION STATE. NEVER SIM STATE, NEVER ON THE WIRE.** Two
 * machines a beat apart on an animation must not be a divergence, and nothing reads it but the
 * sprite. This is the same reasoning `voltkinTowerRenderer`'s `destroyedAt` / `dying` maps record,
 * and it is why this module exports the arithmetic and holds none of the state.
 *
 * ⚠ Nothing here imports Pixi, so all of it runs in vitest — the split `towerFrames.ts` and
 * `castleFrames.ts` already use, and for the same reason.
 */
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { STAR_SELFDESTRUCT_BELOW_FRAC } from '../state/structureStarHealth.ts';

/** One row of a ramp sheet: a manifest state name and how many frames it holds. */
export interface RampRow {
  readonly state: string;
  readonly count: number;
}

/** Everything the generic renderer needs to draw one tower's damage ramp. */
export interface RampSpec {
  readonly recipeId: GodlyId;
  /** `<base>-atlas.png` + `<base>-anim.json`, as every other atlas in this project is named. */
  readonly atlasBase: string;
  /** Total frames in the ramp, frame 1 pristine to frame `frames` destroyed. */
  readonly frames: number;
  /** How the ramp is laid out across atlas rows, in frame order. */
  readonly rows: readonly RampRow[];
  /** Ticks the cursor spends on each frame while it is catching up to its target. */
  readonly ticksPerFrame: number;
  /** On-screen size of the sprite BOX, px. See `HUB_SPRITE_PX` for why a box is not the art. */
  readonly spritePx: number;
  /**
   * How tall the ART inside that box actually READS, px.
   *
   * ⛔ **BOTH NUMBERS ARE ON THE SPEC BECAUSE THE RENDERER NEEDS BOTH AND MUST NOT KNOW WHICH TOWER
   * IT IS DRAWING.** The box is what Pixi is told to scale to; the art is the fraction of that box
   * the drawing occupies, and it is the art that has to straddle the structure's centroid. The first
   * draft of the renderer reached for `HUB_ART_PX` directly — which is correct for exactly one entry
   * in this table and silently mis-places every tower the owner sends next. That is the same
   * box-versus-art confusion that shipped the Voltkin TV at 61 px, one level up.
   */
  readonly artPx: number;
  /**
   * Health fraction below which this structure destroys itself, or `null` for one that simply sits
   * at its last frame. ⛔ Opting in is a per-tower OWNER ruling, never an inherited default.
   */
  readonly selfDestructBelow: number | null;
}

/**
 * ⭐ HOW FAST THE CURSOR WALKS, IN TICKS PER FRAME.
 *
 * ⚠ DERIVED FROM THE ONE MEASURABLE THING THE OWNER SAID, not chosen: *"if he destroys a whole
 * structure in one hit, within like one second it looks like a whole structure got destroyed."* A
 * one-shot kill is the longest possible run — all 24 frames — so the whole sheet has to fit in about
 * a second. 24 × 3 = 72 ticks = **1.2 s** at 60 Hz. At 2 it would be 0.8 s and each frame would be
 * on screen for 33 ms, which is below what reads as a sequence rather than a flicker.
 *
 * ⭐ AND ONE RATE, NOT TWO. A separate, slower rate for the death run would make a big hit and a
 * lethal hit play at visibly different speeds through the SAME frames, which is the opposite of
 * *"it makes it look like a video"*.
 */
export const HUB_RAMP_TICKS_PER_FRAME = 3;

/**
 * ⚠ MEASURED, NOT ESTIMATED — and measured by the BUILDER rather than by hand. `subjectFill` in
 * `lightning-hub-anim.json` is the pristine frame's height as a fraction of its cell, written at
 * pack time; `structureRampAtlas.test.ts` asserts this constant against the shipped file, so
 * rebuilding the sheet at a different framing turns a test red instead of silently resizing the
 * building. That loop is what the Voltkin TV never had when it shipped drawing at 61 px.
 */
export const HUB_SUBJECT_FILL = 0.7987;

/**
 * ⭐⭐ HOW TALL THE HUB'S ART SHOULD READ ON THE BOARD, px.
 *
 * ⚠ **THIS IS THE NUMBER THE `voltkinTowerRenderer` LESSON EXISTS FOR: A SPRITE BOX IS NOT THE ART.**
 * S178 set the TV's box to `T9_TOWER_SPRITE_PX` = 150 "for tier-9 parity" and made it the tallest
 * thing on the board, because 150 is a BOX whose art fills 68–91 % of it. So this is stated as art
 * first and converted to a box second.
 *
 * ⚠ **AND IT IS DERIVED FROM THE FOOTPRINT, THE WAY `T3_TOWER_SPRITE_PX` / `T9_TOWER_SPRITE_PX`
 * ALREADY ARE** — *"These track the ring diameters they sit on."* A hub star is `STAR_R` 44, so it
 * spans **88 px**, against a tier-3 ring's 68 (`TRI_RING_R` 34) and a tier-9 ring's 128
 * (`NINE_RING_R` 64). Those two draw at a box of 84 and 150, i.e. ~1.2× their footprint. 88 × 1.2 ≈
 * 106 of box, which at the measured fill is **84 px of drawn tower** — between a three-shape tier-3
 * building and a nine-shape tier-9 one, which is exactly what a six-shape building should be.
 *
 * ⚠ **MINE, NOT THE OWNER'S.** The S147 lesson is that a sprite size can only really be judged from
 * a captured frame; this one is derived to match the footprint ladder and is the first thing to
 * change once he has looked at it on the board.
 */
export const HUB_ART_PX = 84;
export const HUB_SPRITE_PX = Math.round(HUB_ART_PX / HUB_SUBJECT_FILL);

/**
 * ⭐ THE REGISTRY. **ONE ENTRY, BY OWNER RULING.** See the file docblock.
 *
 * ⚠ A `readonly RampSpec[]` rather than a `Partial<Record<GodlyId, …>>`, deliberately: this project
 * has already lost a session to a partial art map returning `undefined` for an unlisted type and
 * falling through to the green procedural puppet (`ART_PIPELINE.md`, *"this silly goblin warrior"*).
 * A list cannot be silently sparse — `rampSpecFor` returns `null` and the caller draws nothing,
 * which degrades to exactly the board as it looks today.
 */
export const RAMP_SPECS: readonly RampSpec[] = [
  {
    recipeId: 'lightningHub' as GodlyId,
    atlasBase: '/art/lightning-hub/lightning-hub',
    frames: 24,
    // The owner's sheet is 8×3 read in reading order; the atlas ships it as the 12-per-row shape the
    // rest of the pipeline is built around. `assets-source/lightning-hub/atlas-specs.json` is where
    // those two numberings meet, and `structureRampAtlas.test.ts` pins this against the manifest.
    rows: [
      { state: 'damage', count: 12 },
      { state: 'collapse', count: 12 },
    ],
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: HUB_SPRITE_PX,
    artPx: HUB_ART_PX,
    selfDestructBelow: STAR_SELFDESTRUCT_BELOW_FRAC,
  },
];

/** PURE — the ramp spec for a recipe, or `null` for the twelve towers that do not have one. */
export function rampSpecFor(recipeId: GodlyId): RampSpec | null {
  for (const spec of RAMP_SPECS) if (spec.recipeId === recipeId) return spec;
  return null;
}

/**
 * PURE — which frame (1-based) a structure at this health fraction should be showing.
 *
 * ⭐⭐ **THE SHEET IS `frames` EQUAL BANDS OF HEALTH AND THE ANSWER IS THE BAND YOU ARE IN.** Band
 * k covers health in `((frames−k)/frames, (frames−k+1)/frames]`, so full health is band 1 and zero
 * is band `frames`. On the hub's 24 that reproduces every row of the owner's own table:
 *
 *     100 % → 1 (pristine) · 50 % → 12 (the "damaged" plate) · 34 % → 16 (barely standing) · 0 % → 24
 *
 * ⛔ **AND IT MAKES THE THRESHOLD AND THE ART ONE TEST RATHER THAN TWO NUMBERS.** 8 of 24 frames is
 * exactly a third, so `frame ≥ 17` ⟺ `frac < 1/3` ⟺ the hub detonates. Nothing has to be kept in
 * step because there is only one boundary; `structureRamp.test.ts` asserts the equivalence at every
 * integer fifth of the pool rather than at the four rows of the table.
 *
 * ⚠ NaN AND UNDER-ZERO BOTH RESOLVE TO THE LAST FRAME, copied from `towerStateForHp` on purpose: a
 * structure that renders as rubble because something upstream broke is a louder bug than one that
 * renders pristine.
 */
export function rampFrameForHealth(frac: number, frames: number): number {
  if (frames <= 0) return 1;
  if (!Number.isFinite(frac)) return frames;
  const band = Math.ceil((1 - frac) * frames);
  return Math.max(1, Math.min(frames, band));
}

/**
 * PURE — the first frame of the death run: the lowest frame that is only reachable BELOW the
 * self-destruct threshold. `null` for a structure that does not self-destruct.
 *
 * ⚠ DERIVED FROM `rampFrameForHealth`, never written down as 17. At exactly the threshold the band
 * is still a survivable one (the ruling is *below* a third, not at it), so the run starts one past it.
 */
export function rampDeathFirstFrame(spec: RampSpec): number | null {
  if (spec.selfDestructBelow === null) return null;
  return Math.min(spec.frames, rampFrameForHealth(spec.selfDestructBelow, spec.frames) + 1);
}

/** PURE — how long a death run takes to play out from its first frame, in ticks. */
export function rampDeathRunTicks(spec: RampSpec): number {
  const first = rampDeathFirstFrame(spec);
  if (first === null) return 0;
  return (spec.frames - first + 1) * spec.ticksPerFrame;
}

/** Which atlas row and column a 1-based ramp frame lives at. */
export interface RampCell {
  readonly state: string;
  readonly col: number;
}

/**
 * PURE — the atlas cell for a 1-based ramp frame. Clamped at both ends, so a caller that has drifted
 * one past the end draws the last frame rather than reading a texture that does not exist.
 */
export function rampCell(frame: number, spec: RampSpec): RampCell {
  let remaining = Math.max(1, Math.min(spec.frames, Math.floor(frame))) - 1;
  for (const row of spec.rows) {
    if (remaining < row.count) return { state: row.state, col: remaining };
    remaining -= row.count;
  }
  const last = spec.rows[spec.rows.length - 1]!;
  return { state: last.state, col: last.count - 1 };
}

/** Where a structure's play-through has got to on THIS peer. Client-local; see the file docblock. */
export interface RampCursor {
  /** The 1-based frame currently drawn. */
  readonly frame: number;
  /** The tick this cursor last stepped — the cadence anchor, never "now". */
  readonly sinceTick: number;
}

/**
 * PURE — walk `cursor` toward `target` at the spec's rate, as of `tick`.
 *
 * ⭐ **ADVANCES BY `+=`, NOT BY `= tick`**, so a frame that is observed late does not shorten the
 * next one. That is the same anti-drift idiom the spawner cadence in `hostTick` uses, and here it is
 * what keeps a 24-frame run actually 72 ticks long rather than 72-ish.
 *
 * ⚠ **A DECREASE SNAPS, IT DOES NOT PLAY BACKWARDS.** The only way health goes UP is FIX, which is
 * BUILD-only, instantaneous and total — a repaired tower is whole, so it should look whole on the
 * next frame rather than winding back through its own destruction. The owner's play-through ruling
 * is about taking damage; he has not asked for a repair animation, and running the sheet in reverse
 * would read as the wreck un-burning. Overrule on sight if it looks better.
 */
export function advanceRampCursor(cursor: RampCursor, target: number, tick: number, spec: RampSpec): RampCursor {
  const clamped = Math.max(1, Math.min(spec.frames, Math.floor(target)));
  if (clamped <= cursor.frame) return { frame: clamped, sinceTick: tick };
  const per = Math.max(1, spec.ticksPerFrame);
  const steps = Math.floor(Math.max(0, tick - cursor.sinceTick) / per);
  if (steps <= 0) return cursor;
  const next = Math.min(clamped, cursor.frame + steps);
  return { frame: next, sinceTick: cursor.sinceTick + (next - cursor.frame) * per };
}
