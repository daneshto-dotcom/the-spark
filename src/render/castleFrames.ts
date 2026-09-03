/**
 * SPARK — S161 W1-B: **THE CASTLE BECOMES ITS RACE.** The pure half.
 *
 * `SPARK_RACES_SPEC.md` §6 W1-B: *"You can tell whose castle it is from across the board."* This
 * module owns every DECISION the castle art makes — which race's atlas, which of the three damage
 * states, and where the sprite sits relative to the keep box. The Pixi half lives in
 * `gathererRenderer.ts`; nothing here imports Pixi, so all of it is driven directly in vitest.
 *
 * ⛔ THAT SPLIT IS NOT TIDINESS, IT IS THE ONLY WAY THIS GETS TESTED. S130 recorded the finding
 * that a draw path cannot be exercised under vitest, and `keepRainbowTint` was extracted from this
 * very renderer for that reason. The state threshold below is a game rule — "when does my castle
 * *look* like it is dying" — and a game rule that lives inside a `Graphics` call is a game rule
 * with no test.
 *
 * ## The three states, and why they are cut where they are
 *
 * `castleHp` counts down from `CASTLE_MAX_HP` and the HP BAR ALREADY EXISTS: `drawKeep` shows it
 * only once `hpFrac < 1`, and it recolours at 0.5 and 0.25 (green / amber / red). The art states
 * are cut to the SAME 0.5 boundary the bar already uses, so the sprite and the bar never disagree
 * about whether this castle is in trouble — one visual language, two channels.
 *
 *   intact     hpFrac >  0.5   — pristine
 *   damaged    0 <  hpFrac ≤ 0.5   — the bar has gone amber; the building is visibly wounded
 *   destroyed  hpFrac ≤ 0        — the seat has fallen
 *
 * ⚠ `destroyed` IS DRIVEN BY THE SAME PREDICATE THE SIM USES TO CALL A SEAT DEAD. `castleGuns.ts`
 * gates on `castleHp <= 0` and so does the win check, so a castle that is rubble on screen is
 * exactly the set of castles the simulation treats as gone. A cosmetic threshold that drifted from
 * the mechanical one would be the worst kind of lie — the board would say "still standing" about a
 * seat that can no longer shoot.
 *
 * ## Why there is no `raceId` in the atlas PATH beyond the file name
 *
 * Six atlases, one per race, keyed by `RaceId` through an exhaustive `Record`. `races.ts` §"Record
 * everywhere, never an array literal of ids" is the rule and this obeys it: adding a seventh race
 * fails `tsc` here until its art is named, rather than falling through to a silent default.
 */

import type { RaceId } from '../state/races.ts';

/** The three conditions a castle can be drawn in. Atlas ROW ORDER — see `CASTLE_STATE_ROWS`. */
export type CastleState = 'intact' | 'damaged' | 'destroyed';

/**
 * ⭐ The damage threshold, and it is deliberately the HP bar's own amber boundary.
 * See the file docblock. Changing this changes when the art turns, and `drawKeep`'s bar colour
 * stops at the same number — `castleFrames.test.ts` pins the pair so they cannot drift apart.
 */
export const CASTLE_DAMAGED_BELOW = 0.5;

/**
 * Which art state a castle with this health fraction is drawn in. PURE.
 *
 * ⚠ NaN AND UNDER-ZERO BOTH RESOLVE TO `destroyed`, not to `intact`. `hpFrac` arrives as
 * `player.castleHp / CASTLE_MAX_HP` and over-damage drives it negative; the ordering of the
 * comparisons below is what makes a negative fraction the ruin rather than falling through. A NaN
 * fails every comparison, so it lands on the final `return` — and a castle that renders as rubble
 * because something upstream is broken is a louder bug than one that renders pristine.
 */
export function castleStateForHp(hpFrac: number): CastleState {
  if (hpFrac > CASTLE_DAMAGED_BELOW) return 'intact';
  if (hpFrac > 0) return 'damaged';
  return 'destroyed';
}

/**
 * Row index of each state inside every castle atlas. Authored by `assets-source/race-castles/
 * atlas-specs.json`, whose `states` object is written in this order — `build-sprite-atlas.mjs`
 * assigns rows by `enumerate(states)`, so the two files are a contract and this is its statement
 * on the TypeScript side. `castleFrames.test.ts` reads the shipped manifests and asserts equality,
 * which is what turns the contract into something that can actually break loudly.
 */
export const CASTLE_STATE_ROWS: Readonly<Record<CastleState, number>> = {
  intact: 0,
  damaged: 1,
  destroyed: 2,
};

/**
 * Where a race's atlas pair lives, WITHOUT the `-atlas.png` / `-anim.json` suffix — the same
 * base-path shape every other atlas renderer in this codebase uses (`STINK_ATLAS_BASE`,
 * the goblin renderer's per-kind bases).
 *
 * ⛔ `public/art/castles/`, NOT `public/godly/`. Every existing atlas sits under `/godly/` because
 * every existing atlas IS a godly combo's art. A castle is not a godly — it is the board furniture
 * every seat has from tick zero — and filing it under `/godly/` would make the one directory that
 * currently means "a combo shipped this" stop meaning that.
 */
export const CASTLE_ATLAS_BASE: Readonly<Record<RaceId, string>> = {
  vampires: '/art/castles/castle-vampires',
  nagas: '/art/castles/castle-nagas',
  mummies: '/art/castles/castle-mummies',
  zombies: '/art/castles/castle-zombies',
  demons: '/art/castles/castle-demons',
  orcs: '/art/castles/castle-orcs',
};

/**
 * ⭐ HOW BIG THE SPRITE IS RELATIVE TO THE KEEP BOX IT REPLACES, and this number is MINE, not the
 * owner's.
 *
 * The keep's click target is `KEEP_W x KEEP_H` = 74 x 58 and it does not move — `isPointInKeep`
 * reads those constants and so does the bank-glyph pitch. The sprite therefore cannot simply be
 * "as big as looks nice": it has to sit ON that box so the thing you click is the thing you see.
 *
 * The atlas cell is a 256 square (`fit: 'box'` in `atlas-specs.json`, so a tall spire fills the
 * cell's height and a wide reef fort fills its width). Drawing that cell at 96 px puts the widest
 * castle at 96 px against the box's 74 — a 30 % overhang, which reads as "the building is bigger
 * than its footprint" rather than as a misalignment, and matches how the placeholder's battlements
 * already overhang nothing. Taller races then stand up to 96 px above the ground line versus the
 * box's 58, which is the point: a spire should look like a spire.
 *
 * ⚠ MEASURED BY LOOKING AT A CAPTURED FRAME, which is the only method that works here — the S147
 * lesson is in this project's CLAUDE.md because a FIGHT banner shipped permanently oversized and no
 * test in the repo could have seen it. If this needs retuning, retune it the same way.
 */
export const CASTLE_SPRITE_PX = 96;

/**
 * The sprite's anchor point, in cell fractions. `x: 0.5` centres it on the castle anchor;
 * `y: 1` puts the BOTTOM of the cell on the ground line.
 *
 * ⚠ THE GROUND LINE IS THE BOTTOM OF THE KEEP BOX, NOT THE ANCHOR. `castleAnchor(seat, layout)`
 * returns the box's CENTRE and `drawKeep` derives `top = y - KEEP_H / 2`, so the box's foot is
 * `anchor.y + KEEP_H / 2`. Anchoring the sprite to the anchor itself would bury the lower half of
 * every castle in the ground — which is exactly what it did on the first capture.
 */
export const CASTLE_SPRITE_ANCHOR = { x: 0.5, y: 1 } as const;

/** The manifest `build-sprite-atlas.mjs` writes beside each atlas. Shared with the other loaders. */
export interface CastleAtlasManifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<string, { row: number; frames: number; ticksPerFrame: number }>;
}
