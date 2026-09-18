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
 * ## ⭐⭐⭐ WHAT TOWER NUMBER TWO COSTS — COUNTED, FILE BY FILE
 *
 * The owner is bringing 24-frame ramps for **four** more (goblin tower, Helga, laser turret, and the
 * drone hub's own unit art), on **transparent** backgrounds. This is the number that decides whether
 * that is an afternoon or a month, so it is counted rather than estimated.
 *
 * ### PER TOWER — **17 lines of code + one ~20-line data file**
 *
 * | file | change | lines |
 * |---|---|---|
 * | `assets-source/<tower>/atlas-specs.json` | NEW — copy the hub's, edit 6 values | ~20 (data) |
 * | `src/render/structureRamp.ts` | one `RAMP_SPECS` entry | **13** |
 * | `src/render/structureRamp.ts` | its 3 size constants (`_ART_PX`, `_SUBJECT_FILL`, `_SPRITE_PX`) | **3** |
 * | `package.json` | append `public/art/<tower>` to the `check:atlas` dark-bg group | **1** |
 * | `src/render/structureRamp.test.ts` | the one-entry registry assertion | **1** (edit) |
 * | `src/render/structureRampAtlas.test.ts` | — | **0**, it is `describe.each(RAMP_SPECS)` |
 * | `src/main.ts`, the renderer, the sim | — | **0** |
 *
 * ⭐ The atlas contract test covering a new tower for **zero** lines is the part that matters: the
 * manifest/row/frame-count/cadence/foot-anchor guard is generic over the table, so tower five is as
 * guarded as tower one without anyone remembering to guard it.
 *
 * ### TWO ONE-TIME COSTS BEFORE THOSE FOUR LAND — and they are NOT per-tower
 *
 * 1. ⛔ **TRANSPARENT SOURCES NEED A MATTE MODE — ~8 lines in `build-sheet-atlas.mjs`.** Its matte
 *    keys near-BLACK connected to the border, because the hub's sheet is `(0,10,17)`. A sheet that
 *    arrives already transparent must SKIP the matte and use its own alpha; running the dark key
 *    over it would eat every dark pixel of the art. One `background: 'alpha'` branch.
 *
 * 2. ⛔⛔ **HELGA AND THE LASER TURRET ARE `kind: 'defender'`, NOT SPAWNERS — ~15 lines in
 *    `structureRampRenderer.sync`.** VERIFIED against the recipe registry: `goblinTower` and
 *    `lightningHub` are `kind: 'spawner'`, `princessHelga` and `laserTurret` are `kind: 'defender'`,
 *    so **two of his four are invisible to this renderer today** — it iterates
 *    `world.creatureSpawners` only. ⭐ The fix is small and the sim half is already free: `Defender`
 *    carries the exact two fields the loop reads (`recipeId` and `anchorPrimitiveId`), and
 *    `starHealthFrac` takes an anchor, so it works on a turret's Line hub and Helga's Triangle hub
 *    unchanged. It is the SOURCE LOOP that must widen — lift the per-structure body into a method
 *    and call it for `world.defenders` too.
 *    ⚠ NOT DONE HERE, deliberately: there is no defender ramp art yet, and this project's standing
 *    lesson is that code written ahead of the art it serves ships unreachable and untested
 *    (`t3TowerAtlasBase`, 7.4 MiB, two sessions, zero callers).
 *
 * ### SO: FOUR MORE TOWERS ≈ **23 one-time lines + 4 × 17**, i.e. an afternoon, not a month
 *
 * — provided the art arrives as one grid per tower with the frames in reading order. The expensive
 * parts of S182 were the SHEET (uneven grid, baked frame numbers, dark matte, ground-line drift) and
 * they are all now in the builder, paid once.
 *
 * `StructureRampRenderer` is generic over this table, is registered once in `main.ts`, and is
 * already wired to the fog gate, the atlas-load bail, `markTowerCover` and the death-run ghost.
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

/**
 * PURE — the frame the cursor should be WALKING TOWARD, given synced health.
 *
 * ⭐⭐⭐ **BELOW THE THRESHOLD A STRUCTURE IS DOOMED, SO IT AIMS AT THE LAST FRAME, NOT AT THE FRAME
 * ITS HEALTH NAMES.** This is what makes the collapse visible to EVERYBODY rather than only to the
 * peer that happened to be watching when it died.
 *
 * ⛔ THE DEFECT THIS CLOSES. `rampFrameForHealth` maps 30 % health to frame 17 — the FIRST frame of
 * the death run — so a doomed hub would sit on 17 and the remaining seven frames of collapse could
 * only ever be drawn by the client-local ghost that starts when the structure LEAVES the world. A
 * peer that reloaded, or a joiner who arrived a moment earlier, has no ghost record and therefore saw
 * the building vanish with no destruction at all.
 *
 * ⭐ Aiming at the last frame instead derives the whole run from `Bond.damageFifths`, which is
 * synced and hashed — so every peer, joiner included, plays the same collapse from the same data,
 * and the ghost degrades to what it should always have been: the TAIL, for the beats after the sim
 * has razed the star.
 *
 * ⚠ A structure with no self-destruct simply tracks its health, exactly as before.
 */
export function rampTargetFrame(frac: number, spec: RampSpec): number {
  if (spec.selfDestructBelow !== null && Number.isFinite(frac) && frac < spec.selfDestructBelow) {
    return spec.frames;
  }
  return rampFrameForHealth(frac, spec.frames);
}

/**
 * PURE — should a sprite whose structure was not drawn this frame start a DESTRUCTION beat?
 *
 * ⛔⛔ **"NOT DRAWN" AND "DESTROYED" ARE DIFFERENT QUESTIONS, AND CONFLATING THEM MADE LIVING
 * BUILDINGS EXPLODE.** The renderer's draw loop skips a structure for three PRESENTATION reasons
 * that are not death — it is behind the fog, its atlas has not finished loading, or its texture
 * could not be cut. The first version of the ghost sweep treated any undrawn sprite as a corpse, so
 * an enemy hub walking out of your vision played its whole collapse, and played it again every time
 * your vision dropped. A player would read that as the tower dying over and over.
 *
 * So the sweep asks THIS instead, and `present` is filled before any presentation-level skip.
 *
 * ⚠ FIGHT-ONLY, so scrapping your own tower in BUILD does not detonate it on screen — a structure
 * taken apart deliberately is not a destruction, the same distinction `destroyDefender` draws.
 * ⚠ AND IT NEEDS A LAST-KNOWN POSITION: a structure that was never drawn has nowhere to play out.
 */
export function shouldStartGhost(opts: {
  readonly drawnThisFrame: boolean;
  readonly stillInWorld: boolean;
  readonly alreadyGhosting: boolean;
  readonly hasLastPosition: boolean;
  readonly inFight: boolean;
}): boolean {
  if (opts.drawnThisFrame || opts.alreadyGhosting) return false;
  if (opts.stillInWorld) return false; // ⛔ merely undrawn — fogged, or the atlas is still loading
  if (!opts.inFight) return false;
  return opts.hasLastPosition;
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
