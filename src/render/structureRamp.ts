/**
 * SPARK — S182 — **THE DAMAGE RAMP. The reusable path, proven once on the lightning hub.**
 *
 * The owner is holding art back until he has seen this work: *"I already have art for goblins and
 * for pencil chewers and pentagram and for laser tower, for everything else, but I first want to see
 * you implement this before I give you all the rest."* So the deliverable is the SEAM, not the hub.
 *
 * ⭐⭐ **S183 — HE PRESENTED THE NEXT FOUR AND THEY ARE IN.** The S182 rule was *"We're gonna do
 * this one at a time … Currently you're just gonna focus on the lightning hub. I will present them
 * one after another."* He then played the pilot — *"you can see the tower actively get more and
 * more destroyed until it gets completely destroyed. So very well done with the lightning hub"* —
 * and sent sheets for the goblin tower, the laser turret, the pentagram and HELGA's hall.
 * `RAMP_SPECS` therefore holds FIVE, and the eight remaining towers are still his call, not a
 * tidy-up. ⛔ The self-destruct did NOT come with them; see the registry.
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
 *    ✅ **DONE S183**, the session the art arrived, and it cost the ~15 lines this said it would:
 *    `StructureRampRenderer.drawStructure` plus a second loop. That it waited for the art rather
 *    than being written in S182 is the `t3TowerAtlasBase` lesson honoured (7.4 MiB of guarded art,
 *    two sessions, zero production callers, every gate green the whole time).
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
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { componentOf } from '../game/structure.ts';
import { structurePoolFifths } from '../state/stats.ts';
import { STAR_SELFDESTRUCT_BELOW_FRAC } from '../state/structureStarHealth.ts';

/** One row of a ramp sheet: a manifest state name and how many frames it holds. */
export interface RampRow {
  readonly state: string;
  readonly count: number;
}

/**
 * ⭐ S183 — **HOW THE RENDERER FINDS THE SHAPES THE BUILDING STANDS ON.** Two answers, because the
 * five towers with ramp art are not all one topology.
 *
 * · `'star'` — a hub and the leaves ITS OWN bonds reach. The lightning hub, the goblin tower, the
 *   laser turret and HELGA's hall. The walk is `anchor.bonds`, which is exactly what `isStarAt`
 *   asserted to build the thing, and exactly what `starHealthFrac` sums (R182-B).
 * · `'ring'` — a closed cycle with NO hub. **The pentagram, and it is the reason this field
 *   exists.** Every node of a pentagram has degree 2 (`pentagram.ts`: *"a connected graph in which
 *   every vertex has degree exactly 2 is necessarily a single cycle"*), so its anchor is an
 *   arbitrary ring node holding TWO of the five connectors. Walking `anchor.bonds` would have
 *   covered two shapes of five, priced its health against a 2-connector pool of 14 instead of the
 *   real 50, and ignored every point of damage landing on the other three arms. The walk is the
 *   anchor's connected COMPONENT — which for a live pentagram is the ring and nothing else, because
 *   the predicate rejects the shape outright the moment anything is welded to it.
 */
export type RampShape = 'star' | 'ring';

/** Everything the generic renderer needs to draw one tower's damage ramp. */
export interface RampSpec {
  readonly recipeId: GodlyId;
  /** How the renderer walks from the anchor to the shapes the building stands on. */
  readonly shape: RampShape;
  /**
   * ⭐ S183 — **HOW MANY CONNECTORS THIS STRUCTURE HAS WHEN IT IS WHOLE**, which is both its
   * health denominator and its crumble test.
   *
   * ⛔ **AND THE CRUMBLE TEST IS WHY IT IS ON THE SPEC RATHER THAN READ LIVE.** `starHealthFrac`
   * reads `hub.bonds.size` live, which is right for the hub because a hub self-destructs before it
   * can ever lose an arm. None of the four towers added in S183 self-destructs, so all four DO
   * reach the moment a connector snaps — and at that moment `damageConnector` SPENDS the pool it
   * just filled, draining every survivor. Priced against the live count, a 4-connector goblin tower
   * would go 36/36 banked (frame 24, rubble) and then, in the same tick, 0 banked over a
   * 3-connector pool — **frame 1, pristine** — and sit there looking brand new for the 0-30 ticks
   * before the re-validation poll removes it. Reading the INTACT count instead makes "fewer
   * connectors than the recipe has" mean what it plainly means: this structure is coming down.
   *
   * ⚠ Asserted against `blueprintFor(recipeId).bonds.length` in `structureRamp.test.ts` rather than
   * imported, so a recipe retune turns a test red instead of silently re-pricing the art.
   */
  readonly connectors: number;
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
  /**
   * ⭐⭐ S183 (owner) — **WHERE THIS BUILDING'S WEAPON ACTUALLY FIRES FROM**, as multiples of
   * `artPx` from the structure's centroid (`+dx` right, `+dy` down). `null` for a building with no
   * weapon of its own.
   *
   * He found this in the first minute of play, with a screenshot and an arrow drawn on it:
   *
   * > *"The laser tower doesn't look like he's shooting from the gun itself. It looks like it's
   * > shooting from the middle of the tower, because it still has the old loading red colour … if
   * > we can move it to the right to show it's shooting from the head of the laser beam gun, that'd
   * > be perfect — then I might not even need to generate cutouts of him actually loading."*
   *
   * ⛔ **THE PROCEDURAL RIG AND THE BUILDING ART DISAGREED ABOUT WHERE THE GUN IS, AND THE ART WON.**
   * `turretRenderer` has always drawn its charge lens and wind-up rings at `d.pos` — the structure's
   * centroid — which was right when the turret WAS that rig and the shapes were visible around it.
   * Now the art is the turret, its barrel points up and to the right, and a charge blooming at the
   * centroid reads as the building glowing from its own belly.
   *
   * ⚠ **MEASURED OFF THE SHIPPED ATLAS, NOT EYEBALLED.** Frame 1 of `laser-turret-atlas.png`: the
   * lens cluster (opaque, blue-minus-green > 60) spans x 134–230, y 56–115 inside a subject bbox of
   * x 33–234, y 29–253. The muzzle sits at 98 % across and 25 % down that subject, and the art
   * straddles the centroid vertically, so `dx = 0.897 × (0.980 − 0.5) = 0.431` and
   * `dy = 0.250 − 0.5 = −0.250`. At `LASER_TURRET_ART_PX` that is +40 px right, −24 px up.
   *
   * ⛔ **AND IT MUST BE OFFSET FROM THE RAMP'S CENTROID, NOT FROM `Defender.pos`.** Those are two
   * different points: `pos` is frozen at placement (`applyPlaceDefender`), while the sprite is drawn
   * at the live member centroid. Offsetting from the wrong one puts the charge near the muzzle and
   * moving relative to it — which is worse than the bug it replaces, because it looks intermittent
   * rather than simply wrong. `rampMuzzleAt` reads the same walk the renderer draws with.
   */
  readonly muzzle: { readonly dx: number; readonly dy: number } | null;
}

/**
 * ⭐ HOW FAST THE CURSOR WALKS, IN TICKS PER FRAME.
 *
 * ⚠ DERIVED FROM THE ONE MEASURABLE THING THE OWNER SAID, not chosen: *"if he destroys a whole
 * structure in one hit, within like one second it looks like a whole structure got destroyed."* A
 * one-shot kill is the longest possible run — all 24 frames — so the whole sheet has to fit in about
 * a second.
 *
 * ⭐⭐ **S185 — HE PLAYED IT AND CALLED IT CHOPPY, SO THIS WENT 3 → 2.** *"When a tower is destroyed
 * within like a shot, or really quickly, you need to run through those frames quicker… it needs to
 * be a lot quicker because it looks too choppy. Sure, you can take like a millisecond of delay, but
 * then run through those frames really quick, like a movie."*
 *
 * 24 × 2 = 48 ticks = **0.8 s** at 60 Hz, each frame on screen for 33 ms = **30 fps**.
 *
 * ⛔ **AND THE SENTENCE THAT USED TO SIT HERE ARGUING AGAINST 2 WAS SIMPLY WRONG, WHICH IS WHY IT IS
 * GONE RATHER THAN SOFTENED.** It claimed 33 ms per frame is *"below what reads as a sequence rather
 * than a flicker"*. Film runs at 24 fps — **42 ms** per frame. 33 ms is FASTER than cinema, not
 * below the threshold of motion, and "like a movie" is the exact phrase he reached for. The old
 * reasoning had the physiology backwards and it cost two sessions of him looking at a choppy ramp.
 *
 * ⚠ **2 IS MINE, NOT HIS** — he gave a direction and a feel, never a number. The dial is one
 * character wide and every consumer derives from it, so if 0.8 s still reads slow, 1 gives 0.4 s at
 * 60 fps. What he ruled is the DIRECTION; this is my reading of "like a movie".
 *
 * ⭐ AND ONE RATE, NOT TWO. A separate, slower rate for the death run would make a big hit and a
 * lethal hit play at visibly different speeds through the SAME frames, which is the opposite of
 * *"it makes it look like a video"*.
 *
 * ⚠ TEN DATA FILES CARRY THIS NUMBER TOO — five shipped manifests under `public/art/<tower>/` and
 * five `assets-source/<tower>/atlas-specs.json`. `structureRampAtlas.test.ts:64-66` asserts the
 * shipped manifest against this constant for every `RAMP_SPECS` row, so changing the constant alone
 * turns that test red rather than shipping a mismatch. Change all eleven together.
 */
export const HUB_RAMP_TICKS_PER_FRAME = 2;

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
 * ⭐⭐ S183 — **THE OWNER'S FOUR NEW RAMPS.** Same three constants per tower as the hub, derived the
 * same way, and every one of them MEASURED rather than guessed.
 *
 * ### The fills are the BUILDER'S own measurements
 *
 * `subjectFill` is written into each `<name>-anim.json` at pack time by
 * `scripts/build-alpha-sheet-atlas.mjs`, and `structureRampAtlas.test.ts` asserts each constant
 * below against the shipped file. That loop — measure at pack time, pin at test time — is what the
 * Voltkin TV never had when it shipped drawing at 61 px.
 *
 * ### The sizes ride the SAME footprint ladder the hub does
 *
 * Every size here is `footprint × 1.2 × subjectFill`, which is the relationship `T3_TOWER_SPRITE_PX`
 * (84 on a 68 px ring) and `T9_TOWER_SPRITE_PX` (150 on a 128 px ring) already encode — *"these
 * track the ring diameters they sit on."* The footprints come out of `blueprints.ts` and are not
 * all equal:
 *
 * | tower | blueprint | footprint | box | drawn art |
 * |---|---|---|---|---|
 * | goblin tower | star, `STAR_R` 44 | 88 px | 106 | **99** |
 * | laser turret | star, `STAR_R` 44 | 88 px | 106 | **94** |
 * | HELGA's hall | star, `STAR_R` 44 | 88 px | 106 | **99** |
 * | pentagram | ring, `RING_R` 40 | **80 px** | 96 | **90** |
 *
 * ⛔ **THE PENTAGRAM IS SMALLER AND THAT IS NOT A ROUNDING WOBBLE.** Its ring circumradius is 40,
 * not the stars' 44, so its footprint is genuinely 8 px narrower and its building should be too —
 * the same `TRI_RING_R` / `RING_R` / `NINE_RING_R` lesson `blueprints.ts` spends three docblocks on
 * (*"the S166 B12 defect is one radius reused at a different n"*). `structureRamp.test.ts`
 * re-derives all four from `blueprintRadius` so a recipe retune cannot leave them behind.
 *
 * ⚠ **MINE, NOT THE OWNER'S**, exactly as `HUB_ART_PX` is. The S147 lesson is that a sprite size
 * can only really be judged from a captured frame; these are derived to match the footprint ladder
 * and are the first thing to change once he has looked at them on the board.
 */
export const GOBLIN_TOWER_SUBJECT_FILL = 0.9367;
export const GOBLIN_TOWER_ART_PX = 99;
export const GOBLIN_TOWER_SPRITE_PX = Math.round(GOBLIN_TOWER_ART_PX / GOBLIN_TOWER_SUBJECT_FILL);

export const LASER_TURRET_SUBJECT_FILL = 0.8896;
export const LASER_TURRET_ART_PX = 94;
export const LASER_TURRET_SPRITE_PX = Math.round(LASER_TURRET_ART_PX / LASER_TURRET_SUBJECT_FILL);

/**
 * ⭐⭐ S183 (owner) — **WHERE THE LASER TURRET'S BARREL ENDS**, in multiples of `LASER_TURRET_ART_PX`
 * from the structure's centroid. See `RampSpec.muzzle` for his words and for why the offset is from
 * the ramp centroid rather than from `Defender.pos`.
 *
 * ⚠ **MEASURED OFF THE SHIPPED ATLAS.** Frame 1 of `laser-turret-atlas.png`, selecting opaque pixels
 * whose blue exceeds green by 60 (the lens rings are the only violet thing on the sheet): the
 * cluster spans x 134–230, y 56–115 within a subject bbox of x 33–234, y 29–253. So the barrel's
 * outer end sits at 0.980 across and 0.250 down the subject.
 *
 * The art is centred horizontally on the centroid and STRADDLES it vertically, and its aspect is
 * `201/224 = 0.897` of its height, so:
 *   dx = 0.897 × (0.980 − 0.500) = **+0.431**   → +40 px at 94 px of art
 *   dy =         (0.250 − 0.500) = **−0.250**   → −24 px
 *
 * ⛔ **RE-MEASURE THIS IF THE SHEET IS EVER RE-PACKED.** It is a fact about the drawing, not a taste
 * call, and nothing in the build can notice it going stale — `structureRamp.test.ts` pins the value
 * but no test can know the artist moved the barrel. That is the one weakness of this constant and it
 * is stated rather than hidden.
 */
export const LASER_TURRET_MUZZLE = { dx: 0.431, dy: -0.25 } as const;

export const PENTAGRAM_SUBJECT_FILL = 0.9328;
export const PENTAGRAM_ART_PX = 90;
export const PENTAGRAM_SPRITE_PX = Math.round(PENTAGRAM_ART_PX / PENTAGRAM_SUBJECT_FILL);

export const HELGA_TOWER_SUBJECT_FILL = 0.9331;
export const HELGA_TOWER_ART_PX = 99;
export const HELGA_TOWER_SPRITE_PX = Math.round(HELGA_TOWER_ART_PX / HELGA_TOWER_SUBJECT_FILL);

/**
 * Every ramp sheet the owner has sent is 8×3 read in reading order and ships as the 12-per-row
 * shape the rest of the pipeline is built around. Each tower's `assets-source/…/atlas-specs.json`
 * is where those two numberings meet, and `structureRampAtlas.test.ts` pins this against the
 * manifest on disk.
 */
const RAMP_ROWS_24: readonly RampRow[] = [
  { state: 'damage', count: 12 },
  { state: 'collapse', count: 12 },
];

/**
 * ⭐⭐ THE REGISTRY. **FIVE ENTRIES AS OF S183 — THE OWNER SENT THE OTHER FOUR AND RULED THEM IN.**
 *
 * It held ONE from S182 to S183, and that single entry was an owner ruling, not an accident:
 * *"We're gonna do this one at a time … Currently you're just gonna focus on the lightning hub. I
 * will present them one after another."* He then played the pilot and presented them:
 *
 * > *"A low creature attacks, you can see the tower actively get more and more destroyed until it
 * > gets completely destroyed. So very well done with the lightning hub. Keep it like that for now."*
 *
 * ⛔ **AND THE SELF-DESTRUCT DID NOT COME WITH THEM.** R182-A is the hub's alone — *"From thirty
 * two percent it will just get self destroyed, but it is a suicide drone building, so it makes
 * sense. **We won't do it for every building.**"* The other four carry `selfDestructBelow: null`,
 * so frames 17–24 are simply their death run: they die when their recipe breaks, like any
 * structure. `structureRamp.test.ts` asserts that exactly one entry opts in, because a generalised
 * ramp quietly generalising a BALANCE threshold is precisely how that ruling would leak.
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
    shape: 'star',
    connectors: 5, // LIGHTNING_HUB_DEGREE — the Dot hub's exact bond-degree
    atlasBase: '/art/lightning-hub/lightning-hub',
    frames: 24,
    rows: RAMP_ROWS_24,
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: HUB_SPRITE_PX,
    artPx: HUB_ART_PX,
    selfDestructBelow: STAR_SELFDESTRUCT_BELOW_FRAC,
    muzzle: null,
  },
  {
    recipeId: 'goblinTower' as GodlyId,
    shape: 'star',
    connectors: 4, // GOBLIN_TOWER_HUB_DEGREE — the Circle hub at degree 4
    atlasBase: '/art/goblin-tower/goblin-tower',
    frames: 24,
    rows: RAMP_ROWS_24,
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: GOBLIN_TOWER_SPRITE_PX,
    artPx: GOBLIN_TOWER_ART_PX,
    selfDestructBelow: null,
    muzzle: null,
  },
  {
    recipeId: 'laserTurret' as GodlyId,
    shape: 'star',
    connectors: 6, // TURRET_HUB_DEGREE — the Line hub at degree 6
    atlasBase: '/art/laser-turret/laser-turret',
    frames: 24,
    rows: RAMP_ROWS_24,
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: LASER_TURRET_SPRITE_PX,
    artPx: LASER_TURRET_ART_PX,
    selfDestructBelow: null,
    muzzle: LASER_TURRET_MUZZLE,
  },
  {
    recipeId: 'pentagram' as GodlyId,
    // ⛔ THE ONLY RING IN THE TABLE. See `RampShape` — its anchor holds 2 of its 5 connectors, so
    // the star walk would have covered two shapes of five and priced it against a pool of 14.
    shape: 'ring',
    connectors: 5, // PENTAGRAM_SIZE — a closed 5-cycle, so nodes and connectors are both 5
    atlasBase: '/art/pentagram/pentagram',
    frames: 24,
    rows: RAMP_ROWS_24,
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: PENTAGRAM_SPRITE_PX,
    artPx: PENTAGRAM_ART_PX,
    selfDestructBelow: null,
    muzzle: null,
  },
  {
    recipeId: 'helga' as GodlyId,
    shape: 'star',
    connectors: 6, // HELGA_SIZE − 1 — the Triangle hub at degree 6 (3 Spiral + 3 Circle leaves)
    // ⚠ `helga-tower`, not `helga`: `public/godly/helga/` is her CHARACTER atlas and
    // `princessRenderer` still draws it. This sheet is the hall she stands on.
    atlasBase: '/art/helga-tower/helga-tower',
    frames: 24,
    rows: RAMP_ROWS_24,
    ticksPerFrame: HUB_RAMP_TICKS_PER_FRAME,
    spritePx: HELGA_TOWER_SPRITE_PX,
    artPx: HELGA_TOWER_ART_PX,
    selfDestructBelow: null,
    muzzle: null,
  },
];

/** What a ramp building actually stands on, resolved from the world. */
export interface RampMembers {
  readonly members: readonly PrimitiveId[];
  readonly bonds: readonly BondId[];
  /** Centroid of the members — where the sprite's foot goes, and the centre of its hit box. */
  readonly cx: number;
  readonly cy: number;
  /** Newest `Bond.createdTick` among them — the cover ramp's joiner anchor. */
  readonly newestTick: number;
  /** Total `damageFifths` standing on those bonds. */
  readonly bankedFifths: number;
}

/**
 * PURE — the shapes and connectors a ramp building stands on, or `null` if its anchor is gone.
 *
 * ⛔ **ONE WALK, TWO CALLERS, AND THAT IS THE POINT.** `StructureRampRenderer` uses it to place the
 * sprite and publish the cover; `rampAnchorAtPoint` uses it to hit-test the same sprite. A second
 * copy of this arithmetic would let the building be drawn in one place and clicked in another —
 * and with the shapes underneath now invisible, a hit box that disagrees with the art is a tower
 * the player cannot repair.
 *
 * ⚠ `'ring'` uses the anchor's connected COMPONENT, which for a LIVE pentagram is exactly its five
 * nodes: its predicate demands every component node be degree 2 and the component be size 5, so a
 * pentagram with anything welded on is not a pentagram and has no spawner to draw.
 */
/**
 * PURE — where this building's weapon fires from, in world coordinates, or `null`.
 *
 * ⭐⭐ S183 (owner) — *"it needs to look like it's shooting from its head."* `turretRenderer` drew its
 * charge lens, its wind-up rings and its beam origin at `Defender.pos` — the structure's centroid —
 * which was correct while the procedural rig WAS the turret and the shapes were visible around it.
 * With the building art in place, a charge blooming at the centroid reads as the tower glowing from
 * its own belly, and he spotted it in the first minute of play.
 *
 * ⛔ **IT READS `rampMembersAt`, THE SAME WALK THE SPRITE IS DRAWN WITH, AND THAT IS THE POINT.**
 * `Defender.pos` is frozen at placement while the sprite follows the live member centroid, so the
 * two drift apart as the structure settles. Offsetting from `pos` would put the charge NEAR the
 * muzzle and moving relative to it — a worse failure than the one it replaces, because intermittent
 * misalignment reads as a bug in the effect rather than as a fixed offset someone can correct.
 *
 * ⚠ Returns `null` for a building with no `muzzle` (every tower but the laser turret today) and for
 * one whose walk does not resolve, so the caller keeps its old behaviour rather than drawing at an
 * invented point.
 */
export function rampMuzzleAt(
  world: World,
  anchorId: PrimitiveId,
  spec: RampSpec,
): { readonly x: number; readonly y: number } | null {
  if (spec.muzzle === null) return null;
  const at = rampMembersAt(world, anchorId, spec);
  if (at === null) return null;
  return {
    x: at.cx + spec.muzzle.dx * spec.artPx,
    y: at.cy + spec.muzzle.dy * spec.artPx,
  };
}

export function rampMembersAt(world: World, anchorId: PrimitiveId, spec: RampSpec): RampMembers | null {
  const anchor = world.primitives.get(anchorId);
  if (anchor === undefined) return null;
  const members: PrimitiveId[] = [];
  const bonds: BondId[] = [];
  let cx = 0;
  let cy = 0;
  let n = 0;
  let newestTick = 0;
  let bankedFifths = 0;
  const addPrim = (id: PrimitiveId): void => {
    const p = world.primitives.get(id);
    if (p === undefined) return;
    members.push(id);
    cx += p.pos.x;
    cy += p.pos.y;
    n++;
  };
  const addBond = (id: BondId): void => {
    const bond = world.bonds.get(id);
    if (bond === undefined) return;
    bonds.push(id);
    bankedFifths += bond.damageFifths;
    if (bond.createdTick > newestTick) newestTick = bond.createdTick;
  };
  if (spec.shape === 'star') {
    addPrim(anchorId);
    for (const bondId of anchor.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      addBond(bondId);
      addPrim(bond.aId === anchorId ? bond.bId : bond.aId);
    }
  } else {
    const comp = componentOf(anchor, world.primitives, world.bonds);
    for (const pid of comp.primitiveIds) addPrim(pid);
    for (const bid of comp.bondIds) addBond(bid);
  }
  if (n === 0) return null;
  return { members, bonds, cx: cx / n, cy: cy / n, newestTick, bankedFifths };
}

/**
 * PURE — the anchor of the ramp building whose SPRITE BOX contains `(x, y)`, or `null`.
 *
 * ⛔⛔ **S183 — WITHOUT THIS, EVERY TOWER THIS BRANCH HID BECOMES UNREPAIRABLE.**
 *
 * FIX and SCRAP are reached by clicking a structure (`controls.ts`, S152/S181). That click tries
 * `towerAnchorAtPoint` first — the art box — and falls back to a scan of each member shape's own
 * ~10 px radius. `towerAnchorAtPoint` covers the TWELVE RACE TOWERS only; its own line reads
 * *"pentagram / goblin tower / lightning hub draw no building"*, and it iterates
 * `world.creatureSpawners`, so it can never see a defender either. That was fine while those five
 * had no art: the shape scan worked because the shapes were VISIBLE.
 *
 * They are not visible any more. So the fallback became "click an invisible 10 px dot to repair
 * your tower", which is not a fallback. This is the box for the sprite that is actually on screen.
 *
 * ⚠ **SMALLEST BOX WINS, THEN LOWEST ANCHOR ID** — a total order, copied from
 * `towerAnchorAtPoint` for the same reason it has one: two overlapping buildings must resolve the
 * same way on every machine, and `Map` iteration order is not that.
 */
export function rampAnchorAtPoint(world: World, x: number, y: number): PrimitiveId | null {
  let bestAnchor: PrimitiveId | null = null;
  let bestSize = Infinity;
  let bestId = Infinity;
  const consider = (anchorId: PrimitiveId, recipeId: GodlyId): void => {
    const spec = rampSpecFor(recipeId);
    if (spec === null) return;
    const at = rampMembersAt(world, anchorId, spec);
    if (at === null) return;
    /*
     * ⚠ THE BOX IS THE ART, NOT THE SPRITE BOX. `spritePx` is the Pixi box; the drawing inside it
     * is `artPx` tall. Hit-testing the whole `spritePx` square would claim empty ground around the
     * tower — and on these sheets that is where the NEXT structure's shapes are.
     *
     * ⛔⛔ S183 MERGE OWNER — **THE ART STRADDLES THE CENTROID. IT DOES NOT STAND ON IT.** This read
     * `y > cy + half*0.35 || y < cy - artPx`, derived from a sentence ("the building occupies
     * roughly `artPx` above `cy`") rather than from `place()`. `place()` is
     * `sprite.y = cy + artPx*0.5 + (1 - footY)*spritePx` against `TOWER_SPRITE_ANCHOR.y = 1`, so the
     * art's GROUND LINE lands at `cy + 0.5*artPx` and its top at `cy - 0.5*artPx` — half above the
     * centroid, half below, exactly as `voltkinTowerRenderer` documents.
     *
     * The old window accepted `[cy - artPx, cy + 0.175*artPx]`: it MISSED the bottom `0.325*artPx`
     * of every tower (goblin/Helga 32 px, laser 31, pentagram 29, hub 27) — the widest, most
     * natural part to click — and accepted `0.5*artPx` of empty sky above it. Clicking a tower's
     * base fell through to the member scan, which cannot hit either because the shapes are HIDDEN,
     * and the card closed. That is precisely the "invisible tower is an unrepairable tower" outcome
     * this function exists to prevent, so the function defeated its own purpose.
     *
     * ⚠ AND THE BRANCH'S OWN TESTS WERE GREEN OVER IT, because they asserted a hit at
     * `-0.6*artPx` — 10 px ABOVE the top of the drawn art — and a miss far below, never touching
     * the `+0.2…+0.5` band that was broken. A mechanical test aimed at geometry taken from prose.
     * The symmetric box is what `towerAnchorAtPoint` already does for the race towers.
     */
    const half = spec.artPx * 0.5;
    if (Math.abs(x - at.cx) > half) return;
    if (Math.abs(y - at.cy) > half) return;
    const id = anchorId as unknown as number;
    if (spec.artPx > bestSize || (spec.artPx === bestSize && id >= bestId)) return;
    bestSize = spec.artPx;
    bestId = id;
    bestAnchor = anchorId;
  };
  for (const sp of world.creatureSpawners.values()) consider(sp.anchorPrimitiveId, sp.recipeId);
  for (const def of world.defenders.values()) consider(def.anchorPrimitiveId, def.recipeId);
  return bestAnchor;
}

/**
 * PURE — the health fraction the ramp draws from, 0..1, given the connectors the renderer actually
 * walked and the damage standing on them.
 *
 * ⭐⭐ **ONE FUNCTION FOR BOTH SHAPES, AND FOR A STAR IT IS `starHealthFrac` EXACTLY.** The hub's
 * sim-side fuse and this both read `structurePoolFifths` over the same bonds, and
 * `structureRamp.test.ts` asserts the two agree at every integer fifth of a real hub's pool rather
 * than trusting this sentence. R182-B still governs what "its own bonds" means: the star's arms,
 * never its connected component, so a hub welded into a lattice is still judged on what the player
 * built.
 *
 * ⛔⛔ **AND A STRUCTURE MISSING A CONNECTOR READS ZERO — THIS IS THE CRUMBLE RULE.**
 *
 * Owner, S183, correcting the S175 behaviour: *"It does not come back when the building starts
 * dying so you can still repair it. No — because you can see the tower is damaged. You can just
 * click the tower and repair it. You don't have to see the connectors. The connectors come back
 * when the tower is being destroyed, like when it hits zero health and you can see it crumble and
 * fall."*
 *
 * Zero health and the first snapped connector are the SAME EVENT — `damageConnector` breaks an arm
 * at the exact moment banked damage reaches the pool — so "hits zero health" and "starts to
 * crumble" are one boundary, and the ramp must hold frame 24 across it rather than flicking back to
 * pristine on the drain. See `RampSpec.connectors` for the arithmetic that makes that flick real.
 *
 * ⚠ NaN IS NOT SILENTLY HEALTHY. A non-finite banked total resolves to 0 (rubble), the same
 * loud-side choice `rampFrameForHealth` and `towerStateForHp` make.
 */
export function rampHealthFrac(liveConnectors: number, bankedFifths: number, spec: RampSpec): number {
  if (liveConnectors < spec.connectors) return 0;
  if (!Number.isFinite(bankedFifths)) return 0;
  const pool = structurePoolFifths(spec.connectors);
  if (pool <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - bankedFifths / pool));
}

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
