/**
 * SPARK — S180: **THE CHARACTER SHEET, as a pure model.**
 *
 * > *"Little picture of the character, like we have the little little fucking health bar, stats,
 * > done. Any skills that he has, maybe. Players can learn about the characters."* — owner, S180
 *
 * Click a thing, read what it is and how it is doing. Five elements: portrait · name · live health ·
 * four stats · (on your own building) the actions that were already there.
 *
 * ## ⛔ IT ABSORBED THE FIX/SCRAP POPOVER. IT DID NOT COMPETE WITH IT.
 *
 * Owner, S180, answering whether clicking your own tower should give the old popover or the sheet:
 *
 * > *"Click on your own tower, you can see the character sheet with the fix scrape as today … You're
 * > just adding those two options to there. Boom, done … Obviously you can't do fix scrape to enemy
 * > towers."*
 *
 * So there is ONE panel. It simply carries an action row when the subject is a building of yours.
 * That is why this module calls `structureActionModel` rather than re-deriving affordability —
 * `structurePanel.ts` states the rule in full: a button that says "FIX · 2 SHAPES" over a reducer
 * that refuses is the exact defect sharing exists to prevent.
 *
 * ## ⛔ NO SKILLS. HE RULED IT TWICE IN ONE BREATH.
 *
 * > *"No skills or abilities … the six boss skills, you shouldn't add for now. Let's keep them out
 * > of the character sheets."*
 *
 * There is also no data for them: six `bossSkills*.ts` files carry ZERO display strings. A row of
 * blank icons would read as broken, and inventing copy for thirty abilities is how a sheet spec'd as
 * "done" becomes the wall of numbers he rejected.
 *
 * ## ⛔ EVERY NUMBER COMES OFF THE ONE LADDER, AT RUNTIME
 *
 * `CLAUDE.md` is explicit that a bespoke constant on its own scale is this project's most-repeated
 * defect — a flat 167 survived nineteen sessions and became his S177 bug report. So every figure
 * here is `unitPoolFifths` / `attackFifths` / `structurePoolFifths` over a live config.
 *
 * ⛔ AND **NOT** FROM `UNIT_STAT_TABLE.md`. That document is the repo's own generated stat table and
 * it is STALE BY ROUGHLY 3× ON THE BOSSES: it lists Vlad at 90 pool, while `T9_BOSS_STATS`
 * (`constants.ts`) is hp 20 / def 8 → **260**. A sheet built from it would print a wrong number for
 * every boss in the game.
 *
 * PIXI-FREE ON PURPOSE, so the whole matrix is testable headlessly — the S130 lesson, and the same
 * reason the footer band's layout lives in free functions.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_ATTACK_RANGE,
  CASTLE_FIRE_INTERVAL_TICKS,
  CASTLE_MAX_HP,
  PHYSICS_HZ,
  RACE_TOWER_EMIT_INTERVAL_TICKS,
  ALL_SPARK_TYPES,
  SparkType,
  STINK_AURA_CADENCE_TICKS,
  STINK_AURA_UNIT_FIFTHS,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_CLOUD_LIFETIME_TICKS,
  ZOMBIE_AURA_PER_MILLE,
} from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { castleShotFifths } from '../state/castleGuns.ts';
import { componentOf } from '../game/structure.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { RACE_COLORS, type RaceId } from '../state/races.ts';
import { attackFifths, structurePoolFifths, unitPoolFifths } from '../state/stats.ts';
import { T9_BOSS_NAMES, T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { World } from '../state/worldTypes.ts';
import type { CreatureId, DefenderId, PlayerId, PrimitiveId, StinkCloudId, Vec2 } from '../types.ts';
import { codexCopyFor, type EmblemSpec } from './codexPresentation.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { RACE_TOWER_UNIT, raceForTowerId } from '../state/raceTowerIds.ts';
import { isConcealed } from './concealment.ts';
import { CASTLE_ROW_KEYS, PANEL_W, castleBlockOrigin, panelHeight } from './castlePanel.ts';
import { structureActionModel, type StructureActionView } from './structurePanel.ts';
import { towerArtForRecipe } from './towerFrames.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

/** What the sheet is pointed at. An id, NEVER an object — see the note on `characterSheetModel`. */
export type SheetTarget =
  | { readonly kind: 'creature'; readonly id: CreatureId }
  | { readonly kind: 'defender'; readonly id: DefenderId }
  | { readonly kind: 'structure'; readonly primitiveId: PrimitiveId }
  /**
   * ⭐ S180 (owner playtest) — **THE CASTLE GETS ONE TOO.** *"Even the castle, it should have the
   * same thing, the unit stats, but with the gatherer, with the speed, with everything, with the
   * castle stats. There's no nothing."* Keyed by SEAT because there is exactly one per player.
   */
  | { readonly kind: 'castle'; readonly seat: PlayerId }
  /**
   * ⭐⭐ S181 (owner) — **A LANDED STINK BAG IS CLICKABLE NOW.**
   *
   * > *"poop bags are unclickable. They should have a stat too. When you click on them, it should
   * > show how much damage they're doing per second. Anything that has an aura, damage per second,
   * > should show how much damage per second."*
   *
   * ⚠ IT IS NOT A CREATURE, A DEFENDER, A STRUCTURE OR A KEEP — it lives in its own
   * `world.stinkClouds` map, which is exactly why it was unreachable: every pick arm tested one of
   * the other four families and a bag matched none of them. The canon already says a landed bag is
   * a destructible lone shape at 1 HP / 0 DEF, so it always had a pool to show; nothing could select
   * it to show it.
   */
  | { readonly kind: 'stinkCloud'; readonly id: StinkCloudId };

/**
 * How the little picture is obtained. Owner: *"you can just take like from the generated images,
 * obviously, that we made for them, just a regular idle or whatever, zoomed in on their face … The
 * ones that don't have a tower yet, you just use the one that you used in the codex, like the shape
 * connectors, how it looks. The ones that have towers will use like how the tower looks."*
 *
 * The MODEL only names the source; resolving it to a texture is the renderer's job, because that is
 * the half that needs Pixi.
 */
export type PortraitSpec =
  /** A creature with a sprite sheet — its idle frame, cropped to the head. */
  | { readonly kind: 'creatureFrame'; readonly creatureType: CreatureType; readonly race: RaceId | null }
  /** A structure the codex knows — drawn as the recipe emblem, exactly as the codex draws it. */
  | { readonly kind: 'emblem'; readonly recipeId: string }
  /**
   * ⭐⭐ S181 (owner) — **A TOWER WITH FINISHED ART SHOWS THE ART.**
   *
   * > *"For buildings that have towers that we have generated art for, you need to use the art,
   * > right? So Vlad Tower, Bat Tower, Piranha Tower, castles, those have pictures. They have the
   * > art. You've already implemented that for all the creatures … but you did not do that for
   * > towers."*
   *
   * ⛔ `recipeId` RIDES ALONG DELIBERATELY, and it is what stops this being a regression for the
   * first frame. A tower atlas loads lazily, so `portraitTexture` answers null until the fetch
   * lands; carrying the recipe lets `drawPortrait` fall back to the SAME emblem it used to draw
   * rather than flashing an empty plate. The art is an upgrade over the emblem, never a replacement
   * for having something to show.
   */
  | { readonly kind: 'towerFrame'; readonly atlasBase: string; readonly recipeId: string }
  /**
   * ⭐⭐ S181 (owner) — **A BUILDING WITH ITS OWN ONE-OFF ATLAS**, which is every art-backed building
   * that is NOT one of the twelve race towers: the stink tower and the Voltkin TV.
   *
   * > *"Why is it showing the codex shape structure? It should show the stink tower picture because
   * > we do have a picture for it … When we have an actual tower, you don't put a codex."*
   *
   * ⛔ WHY NOT `towerFrame`. `TowerArt` requires a `RaceId` and a `tier: 3 | 9`, and
   * `voltkinTowerRenderer`'s own docblock already refused the widening: *"widening either to fit
   * would ripple into `destroyAtlasBase` and both row tables for one structure."* A named building
   * has neither a race nor a tier, so it gets a kind that carries neither.
   *
   * `recipeId` rides along for the same reason `towerFrame` carries it: the atlas loads lazily, so
   * the first frames after a card opens fall back to the codex emblem rather than an empty plate.
   */
  | { readonly kind: 'namedBuildingFrame'; readonly building: 'stinkTower' | 'voltkin'; readonly recipeId: string }
  /**
   * ⭐⭐ S181 (owner) — **A CREATURE WITH NO SHEET, PAINTED FROM ITS OWN PUPPET.**
   *
   * > *"Look at the pencil chewer. Why don't you just put the pencil chewer picture? … the electric
   * > drone, yeah, lightning drone too. It doesn't have the picture, even though there is a
   * > character."*
   *
   * ⚠ HE BELIEVES THESE HAVE ART AND THEY DO NOT — that is the one place his report is wrong, and
   * it is worth being exact about because the fix differs. The S181 audit swept every `CreatureType`:
   * the pencil chewer, the lightning drone and the locust cloud are the ONLY three with no atlas.
   * Everything the player sees of them is drawn procedurally every frame.
   *
   * ⭐ SO THEY ARE PAINTED, NOT LOOKED UP, and the result is what he asked for anyway: the portrait
   * is the real puppet at a neutral pose, so the face on the card IS the creature. `portraitSource`
   * answers null for this kind by construction — a painter channel handles it instead.
   */
  | { readonly kind: 'proceduralFrame'; readonly creature: 'chewer' | 'lightningDrone' }
  /** Helga and the like: a unit-class defender with its own art. */
  | { readonly kind: 'defenderFrame'; readonly defenderKind: string }
  /** The seat's keep, drawn in its race's castle art. */
  | { readonly kind: 'castleFrame'; readonly race: RaceId | null };

export interface SheetHealth {
  readonly cur: number;
  readonly max: number;
  /**
   * ⭐ LAST-SEEN, NOT LIVE. True when the subject is behind fog.
   *
   * GEMINI-AUDITOR, Council S180: *"the player is punished for successfully killing the unit they
   * were trying to learn about."* My first draft CLOSED the card when its subject was concealed or
   * died. The card now stays and the bar freezes — which also removes the open/close flicker GROK
   * predicted for a unit walking along a fog edge.
   *
   * ⛔ AND IT IS WHAT KEEPS S170 INTACT. A live bar on a concealed enemy would read straight through
   * the fog the owner asked for by name.
   */
  readonly frozen: boolean;
}

/**
 * One stat line. `derived` sits on the SAME ROW as the number it comes from — the owner's own
 * correction to my draft, which had put the pool down on the DEF row:
 *
 * > *"You see the 150 a swing is right where the attack row is. So the 260 pool should be where the
 * > HP row is."*
 */
export interface SheetStatRow {
  /** 'ATK' | 'PEN' | 'HP' | 'DEF' for a unit; a building and the castle add their own rows. */
  readonly label: string;
  readonly points: number;
  readonly derived: string | null;
}

/**
 * ⭐ THE OWNER DESIGNED THIS ONE HIMSELF, in the approval turn:
 *
 * > *"If it's a building that creates like one creature, kind of like Helga or Voltkin, right? The
 * > TV — you should see the health of the building and underneath the little image of the character
 * > they own and his health. And then you can either click on that or go directly click on the
 * > character they own and see his stats."*
 */
export interface SheetOwnedUnit {
  readonly target: SheetTarget;
  readonly name: string;
  readonly portrait: PortraitSpec;
  readonly health: SheetHealth;
}

export interface CharacterSheetView {
  readonly target: SheetTarget;
  readonly title: string;
  /** The one identity line under the name — "T9 · VAMPIRES", "YOUR BUILDING". Never a paragraph. */
  readonly subtitle: string;
  readonly portrait: PortraitSpec;
  readonly health: SheetHealth;
  readonly stats: readonly SheetStatRow[];
  readonly owned: SheetOwnedUnit | null;
  /** FIX / SCRAP / FEED. Non-null ONLY for a building this seat owns — his "obviously you can't". */
  readonly actions: StructureActionView | null;
  /**
   * ⭐⭐ S181 (owner) — **THE CARD WEARS ITS SUBJECT'S RACE COLOUR.**
   *
   * > *"that red outline with the red text and everything, that looks good … for the character
   * > sheet, do it like that. Every race will have his own outline. The writing, any titles or
   * > anything, will be with the race's color. It needs to be distinct."*
   *
   * ⭐ THE RED HE LIKED WAS ALREADY RACE-DERIVED AND NOBODY HAD SAID SO. He was looking at his
   * Vampires castle panel: `RACE_COLORS.vampires` is `0xff3b6b`. So this is not a new palette, it is
   * the existing seat/race identity finally reaching the card — the same table the lobby roster, the
   * palette glyphs and the zone banners already read.
   *
   * ⛔ A RESOLVED COLOUR, NOT A `RaceId`, so the renderer never needs the race table and an
   * unaligned seat is one `null` check rather than a lookup that can miss. `null` keeps the shipped
   * neutral edge.
   *
   * ⚠ IT IS THE SUBJECT'S RACE, NOT THE VIEWER'S — an enemy's card wears THEIR colour, which is what
   * makes it *"distinct"* at a glance and is the whole point of the seat colour being race identity.
   */
  readonly accent: number | null;

  /**
   * ⭐⭐ S181 (owner) — **WHAT THIS THING IS, IN THE EMPTY SPACE UNDER THE HEALTH.**
   *
   * > *"there should be a description of the tower. So maybe we have all this empty space just under
   * > the tower health, underneath it. You can just say like spawning bats every this much seconds,
   * > for example."*
   *
   * ⚠ IT IS THE CODEX'S OWN `recipe` LINE, NOT A SECOND BODY OF COPY. `CodexCopy.recipe` is already
   * *"precise build recipe + what it does"*, already ≤150 chars, already written for every entry and
   * already pinned by the codex tests. Authoring a parallel description per building is how the two
   * drift apart, and the codex would be the one that rots because nobody reads it mid-match.
   *
   * ⭐ THE CADENCE IS APPENDED, DERIVED FROM THE SHIPPED CONSTANT. His example — *"spawning bats
   * every this much seconds"* — is a NUMBER the codex line does not carry, so it is computed from
   * `RACE_TOWER_EMIT_INTERVAL_TICKS / PHYSICS_HZ` rather than written down anywhere.
   */
  readonly description: string | null;

  /**
   * ⭐⭐ S181 (owner) — **WHAT IT TAKES TO BUILD, AS A TINY GLYPH ABOVE THE HEALTH BAR.**
   *
   * > *"above the health bar, another good thing to have is how many connectors it takes to build
   * > it, the exact kind. So maybe a little picture on the right side, just like you have in the
   * > codex, in the right corner above the health bar, that shows what it takes to build it, and
   * > then to the left of it maybe like an explanation. So like three triangles built in a triangle."*
   *
   * So: the codex EMBLEM in the top-right corner, and the "explanation" to its left is the build
   * bill in words. Both come from the codex, which is exactly the *"just like you have in the
   * codex"* he asked for.
   *
   * ⚠ NULL IS A REAL CASE, NOT A HOLE. `CodexCopy.emblem` is deliberately absent when a recipe *"is
   * not expressible as a ring or a star"* — Helga's two-leaf hub, Voltkin's chain. The card then
   * shows the words alone rather than an invented shape.
   */
  readonly buildEmblem: EmblemSpec | null;
  /** The words beside that glyph — e.g. "3 TRIANGLES". Null when the recipe is not a known one. */
  readonly buildBill: string | null;

  /**
   * ⭐⭐ S181 (owner) — **THE CAPTION OVER THE FEED STRIP.**
   *
   * > *"underneath where it shows like triangle, where you build bats, and people need to know what
   * > it does. So just be like 'to build more bats' or something. Click this."*
   *
   * Null unless this card is showing a tower that can actually be fed, so the line never appears
   * over a strip that is not there.
   */
  readonly feedHint: string | null;
  /** Where the card body goes. The action row, when there is one, keeps its shipped geometry. */
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

/** Card geometry. One width for everything, so a goblin and a boss read as the same kind of object. */
export const SHEET_W = 236;
const PAD = 12;
const HEADER_H = 34;
const PORTRAIT = 76;
const BAR_H = 12;
const ROW_H = 20;
const OWNED_H = 44;
/** Keeps the card fully on-canvas when its subject is hard against an edge. */
const EDGE_MARGIN = 8;
/** How far above the subject the card floats, matching the popover it replaces. */
const LIFT = 34;

/**
 * ⭐ ONE DISPLAY NAME PER CREATURE TYPE, as an exhaustive `Record` — which is the point of it.
 * Adding a creature without deciding what a player calls it is a COMPILE error, the same forcing
 * function `CREATURE_TARGETS` uses. Raw type ids on screen are the `LASERTURRET` defect the codex
 * already had to fix once.
 *
 * ⚠ The six bosses are NOT listed here. Their names live in `T9_BOSS_NAMES` and are read from it, so
 * the open trademark question on one of them stays a one-line change in one place.
 */
const CREATURE_NAME: Readonly<Record<CreatureType, string>> = {
  goblinMelee: 'MELEE GOBLIN',
  goblinArcher: 'ARCHER GOBLIN',
  goblinShield: 'SHIELD GOBLIN',
  goblinHound: 'HOUND GOBLIN',
  goblinBat: 'BAT GOBLIN',
  goblinSuicide: 'SAPPER GOBLIN',
  chewer: 'PENCIL CHEWER',
  voltkin: 'VOLTKIN',
  lightningDrone: 'LIGHTNING DRONE',
  direwolf: 'DIREWOLF',
  locustCloud: 'LOCUST CLOUD',
  raceUnit: 'CASTLE UNIT',
  t3Hound: 'HOUND',
  t3Scarab: 'SCARAB',
  t3Piranha: 'PIRANHA',
  t3Bat: 'BAT',
  t3Warband: 'WARBAND',
  t3Souleater: 'SOULEATER',
  t9BossVampires: 'VLAD',
  t9BossNagas: 'KRAKEN',
  t9BossMummies: 'PHARAOH',
  t9BossZombies: 'WHOPPER',
  t9BossOrcs: 'WARLORD',
  t9BossDemons: 'ARCHDEMON',
};

/** The tier word under the name. Derived from the type, never stored. */
function tierOf(type: CreatureType): string {
  if (BOSS_TYPES.has(type)) return 'T9';
  if (type.startsWith('t3')) return 'T3';
  if (type === 'raceUnit') return 'CASTLE';
  if (type.startsWith('goblin')) return 'GOBLIN';
  return 'SUMMON';
}

const BOSS_TYPES: ReadonlySet<CreatureType> = new Set(Object.values(T9_BOSS_TYPE));

/** The name a player reads. Bosses go through `T9_BOSS_NAMES` so the one table stays authoritative. */
export function creatureDisplayName(type: CreatureType): string {
  for (const [race, bossType] of Object.entries(T9_BOSS_TYPE) as [RaceId, CreatureType][]) {
    if (bossType === type) return T9_BOSS_NAMES[race];
  }
  return CREATURE_NAME[type];
}

/**
 * The four stat rows, in ONE fixed order for everything on the board: offence before defence.
 * `derived` lands on the row it is derived FROM — the owner's correction (see `SheetStatRow`).
 */
export function statRowsFor(hp: number, def: number, atk: number, pen: number): SheetStatRow[] {
  return [
    { label: 'ATK', points: atk, derived: `${attackFifths(atk, pen)} a swing` },
    { label: 'PEN', points: pen, derived: null },
    { label: 'HP', points: hp, derived: `${unitPoolFifths(hp, def)} pool` },
    { label: 'DEF', points: def, derived: null },
  ];
}

/**
 * ⭐⭐ S181 (owner playtest) — **THE STAT NUMBER MUST CLEAR ITS OWN LABEL.** This is the fix for the
 * defect he screenshotted four times: the card read `CONNECT4RS`, `CONNECT3RS`, `CONNECT9RS`.
 *
 * `characterSheet.draw` printed the value at a HARD-CODED `+42px` from the label origin. At 11px
 * monospace `SHAPES` (6 chars ≈ 40px) clears 42 and `CONNECTORS` (10 chars ≈ 66px) does not — so the
 * number landed inside the word, and only on the longest label. That is exactly the pattern in his
 * screenshots, where `SHAPES 4` is clean on the same card whose `CONNECTORS` is mangled.
 *
 * ⛔ SO THE COLUMN IS DERIVED FROM THE WIDEST LABEL PRESENT, never from a constant. A future stat
 * row with a longer name (`RELOAD`, `RANGE`, anything the castle adds) cannot re-create this bug,
 * which a bumped-but-still-fixed `+72` would happily do the next time someone adds a word.
 *
 * Monospace is what makes this exact rather than a guess: every glyph is the same advance, so the
 * width of a label IS its character count. `MONO_EM_RATIO` is that advance as a fraction of the font
 * size, measured from the shipped face rather than assumed — see `characterSheetModel.test.ts`.
 */
export const MONO_EM_RATIO = 0.6;
/** Breathing room between the longest label and the value column. */
export const STAT_GAP_PX = 8;

/** PURE — the x offset (from the label origin) at which stat VALUES may print without collision. */
export function statValueColumnPx(
  labels: readonly string[],
  labelFontSize: number,
): number {
  let widest = 0;
  for (const l of labels) widest = Math.max(widest, l.length);
  return Math.ceil(widest * labelFontSize * MONO_EM_RATIO) + STAT_GAP_PX;
}

/**
 * ⭐⭐ S181 (owner) — PURE — the one-line "what is this and what does it do" under the health bar,
 * and the build recipe above it.
 *
 * > *"there should be a description of the tower … you can just say like spawning bats every this
 * > much seconds"* and *"above the health bar … a little picture on the right side, just like you
 * > have in the codex … and then to the left of it maybe like an explanation. So like three
 * > triangles built in a triangle."*
 *
 * ⚠ EVERYTHING HERE COMES FROM THE CODEX OR A SHIPPED CONSTANT. Nothing is authored twice: the prose
 * is `CodexCopy.recipe`, the glyph is `CodexCopy.emblem`, the bill is `blueprintBill`, and the
 * cadence is derived from `RACE_TOWER_EMIT_INTERVAL_TICKS`. A second body of per-building copy is how
 * the card and the codex would start disagreeing, and the codex would lose because nobody reads it
 * mid-match.
 */
/**
 * A card with nothing to say about construction: a creature, a defender, the keep. Spelled as one
 * constant so the four branches cannot drift into three different shapes of "no info".
 */
/**
 * PURE — the caption over a feedable tower's shape strip, or null.
 *
 * ⚠ THE GOBLIN TOWER GETS NONE, DELIBERATELY. Its six shapes each produce a DIFFERENT goblin
 * (`fedCreatureType`), so a single "to build more X" line would be false for five of the six. The
 * shapes teaching their own outputs is that tower's mechanic; a summary would flatten it.
 */
export function feedHintFor(recipeId: string | null): string | null {
  if (recipeId === null) return null;
  const race = raceForTowerId(recipeId as GodlyId);
  if (race === null) return null;
  return `FEED A SHAPE TO BUILD MORE ${CREATURE_NAME[RACE_TOWER_UNIT[race]]}S`;
}

const NO_BUILD_INFO = { description: null, buildEmblem: null, buildBill: null } as const;

export function buildInfoFor(recipeId: string | null): {
  description: string | null;
  buildEmblem: EmblemSpec | null;
  buildBill: string | null;
} {
  if (recipeId === null) {
    // A hand-bonded freeform structure has no recipe, so there is nothing true to say about it.
    return { description: null, buildEmblem: null, buildBill: null };
  }
  const copy = codexCopyFor(recipeId);
  let description: string | null = copy.recipe ?? null;

  /*
   * ⭐ HIS OWN EXAMPLE, and the only part the codex cannot supply: *"spawning bats every this much
   * seconds"*. A race tower's cadence is a constant, so the sentence is derived rather than written.
   */
  const race = raceForTowerId(recipeId as GodlyId);
  if (race !== null) {
    const every = Math.round(RACE_TOWER_EMIT_INTERVAL_TICKS / PHYSICS_HZ);
    const unit = CREATURE_NAME[RACE_TOWER_UNIT[race]];
    description = `Spawns a ${unit.toLowerCase()} every ${every}s.`;
  }

  let buildBill: string | null = null;
  try {
    const bill = blueprintBill(recipeId as GodlyId);
    const parts: string[] = [];
    for (const t of ALL_SPARK_TYPES) {
      const n = bill.get(t) ?? 0;
      if (n > 0) parts.push(`${n} ${SPARK_WORD[t]}${n > 1 ? 'S' : ''}`);
    }
    if (parts.length > 0) buildBill = parts.join(' + ');
  } catch {
    /*
     * ⚠ NOT EVERY RECIPE IS A BLUEPRINT. `blueprintBill` indexes `BLUEPRINTS[id]` directly and
     * throws for anything absent, which is the honest answer for a structure the player welded by
     * hand or a recipe with no stamp. Swallowed to null rather than crashing a card mid-match.
     */
  }
  return { description, buildEmblem: copy.emblem ?? null, buildBill };
}

/** Player-facing word for each shape, for the build bill. Lower case is applied at the call site. */
const SPARK_WORD: Readonly<Record<SparkType, string>> = {
  [SparkType.Dot]: 'DOT',
  [SparkType.Line]: 'BAR',
  [SparkType.Triangle]: 'TRIANGLE',
  [SparkType.Square]: 'SQUARE',
  [SparkType.Circle]: 'CIRCLE',
  [SparkType.Spiral]: 'SPIRAL',
};

/**
 * ⭐⭐ S181 — PURE — which portrait a CREATURE shows: its sprite sheet, or its own procedural puppet
 * for the three types that have never had a sheet.
 *
 * ⚠ THE LIST IS SHORT AND EXPLICIT BECAUSE IT IS A FACT ABOUT THE ART, NOT A RULE. `goblinRenderer`
 * returns null for any type it has no atlas key for, which is indistinguishable from "the atlas has
 * not loaded yet" — so the card could not tell a missing sheet from a slow fetch and drew `'…'` for
 * both. Naming the three makes the difference explicit, and the audit that produced the list swept
 * every `CreatureType` rather than the two the owner happened to notice.
 *
 * ⚠ LOCUST CLOUD IS DELIBERATELY NOT HERE. It is also procedural, but the canon records that it
 * *"cannot be targeted back"* — so no card can be opened on one and a portrait would be unreachable
 * code. Named so the omission reads as a decision.
 */
export function portraitForCreature(type: CreatureType, race: RaceId | null): PortraitSpec {
  if (type === 'chewer') return { kind: 'proceduralFrame', creature: 'chewer' };
  if (type === 'lightningDrone') return { kind: 'proceduralFrame', creature: 'lightningDrone' };
  return { kind: 'creatureFrame', creatureType: type, race };
}

/**
 * ⭐⭐ S181 (owner) — PURE — which portrait a structure shows: its finished ART when it has any, the
 * codex emblem when it does not.
 *
 * ⛔ **THE ART-LESS SET IS NOT HARD-CODED HERE, AND THAT IS THE WHOLE TRICK.** `towerArtForRecipe`
 * already answers null for exactly the recipes the owner named as having no picture — its own
 * comment reads *"the pentagram, the goblin tower and the lightning hub have no structure art"*,
 * and he independently listed *"not for pentagram, not for laser tower, not for Helga … not for the
 * goblin tower"*. So the fallback is the EXISTING lookup's null arm rather than a second list that
 * would have to be maintained beside it and would rot the first time art is packed for one of them.
 * Pack a pentagram sheet and this starts showing it with no edit here.
 *
 * ⚠ `freeform` is the hand-bonded case — shapes a player welded together with no recipe at all. It
 * has no art and no codex entry, and keeps the emblem path that already handled it.
 */
export function portraitForStructure(recipeId: string | null): PortraitSpec {
  if (recipeId === null) return { kind: 'emblem', recipeId: 'freeform' };
  /*
   * ⚠ THE PARAMETER IS A PLAIN STRING, NOT `GodlyId`, AND THAT IS ON PURPOSE. It arrives as
   * `prim.origin.blueprintId`, which is every blueprint in the game and not only the godly recipes.
   * `towerArtForRecipe` answers by comparing against `RACE_TOWER_IDS` / `T9_TOWER_IDS` by value, so
   * a non-godly blueprint simply misses both tables and returns null — the emblem arm. Narrowing the
   * signature to `GodlyId` would force a cast at every call site and buy nothing: the lookup is
   * already total over strings.
   */
  const art = towerArtForRecipe(recipeId as GodlyId);
  if (art !== null) return { kind: 'towerFrame', atlasBase: art.atlasBase, recipeId };
  /*
   * ⭐⭐ S181 (owner) — **THE NAMED BUILDINGS THAT HAVE ART BUT ARE NOT RACE TOWERS.** His report was
   * the stink tower; the S181 audit then found the Voltkin TV was worse off still, falling past the
   * emblem arm entirely to a literal `'…'` because its codex entry carries no emblem.
   *
   * ⚠ A SHORT EXPLICIT LIST, and that is deliberate rather than lazy. `towerArtForRecipe` can answer
   * for the race towers because they are generated from one table; these two are one-off sheets with
   * one-off renderers, so there is nothing to derive from. It is two entries, and a third would be
   * one line — but the moment a THIRD appears, that is the signal to give these renderers a shared
   * accessor interface instead of extending this.
   */
  if (recipeId === 'stinkTower') return { kind: 'namedBuildingFrame', building: 'stinkTower', recipeId };
  if (recipeId === 'voltkin') return { kind: 'namedBuildingFrame', building: 'voltkin', recipeId };
  return { kind: 'emblem', recipeId };
}

/**
 * PURE — the race accent for the seat that owns the subject, or null for an unaligned/absent one.
 *
 * ONE resolver for all four card branches: a creature, a defender, a structure and the keep must
 * never disagree about what colour a seat is, and four copies of `RACE_COLORS[...]` is how they
 * would start to.
 */
function accentFor(world: World, owner: PlayerId | null | undefined): number | null {
  if (owner === null || owner === undefined) return null;
  const race = world.players.get(owner)?.raceId;
  return race === undefined || race === null ? null : RACE_COLORS[race];
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * S181 — THE ACTION ROW. FIX / SCRAP / FEED, ON THE CARD.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐⭐ S181 (owner playtest) — **THE BUTTONS WERE COMPUTED AND NEVER DRAWN.**
 *
 * > *"Similarly, towers lost their scrap and fix. That's wrong. So when you click on Piranha Tower,
 * > you should see everything you see now … and underneath, it should have also scrap or fix, and
 * > how much it costs to fix."*
 *
 * And, the same turn, on what else belongs there:
 *
 * > *"if it's like a bat tower, a tier three tower, they can pay to buy more tier three soldiers.
 * > Just like it used to be last session, before you removed the scrape and the fix and the buy a
 * > character with the primitive."*
 *
 * ⛔ HE IS DESCRIBING A RENDERER GAP, NOT MISSING LOGIC. `CharacterSheetView.actions` has carried
 * the full `StructureActionView` since S180 — every button, its caption, its enabled state and the
 * `feedSpawnerId` — and `characterSheet.draw` read none of it. `heightFor` did not reserve a pixel
 * for it either, which is why nothing even looked clipped. The model was right; the card was blind.
 *
 * ⭐ SO NOTHING ABOUT COST OR AFFORDABILITY IS RE-DERIVED HERE. `structureActionModel` already
 * prices FIX at what was LOST (`COSTS n`), already says `NEED n MORE` when the seat is short,
 * already says `RETURNS n` for scrap's survivors, and already offers six FEED shapes whether or not
 * you hold them. That is his *"how much it costs to fix"* — it exists, and a second pricing path
 * here would be the bespoke-constant defect the stat ladder section of CLAUDE.md forbids.
 */
const ACT_BTN_H = 34;
const ACT_GAP = 10;
const ACT_ROW_GAP = 8;
const FEED_BTN = 32;
const FEED_GAP = 4;

/** One laid-out button: the popover's descriptor, re-placed in CARD-LOCAL space. */
export interface SheetActionSlot {
  readonly kind: string;
  readonly sparkType?: number;
  readonly label: string;
  readonly caption: string;
  readonly enabled: boolean;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * PURE — how tall the action block is for this button set, and therefore what `heightFor` must add.
 *
 * ⚠ ZERO WHEN THERE ARE NO BUTTONS, so an enemy building's card is exactly the height it is today.
 * `actions` is already null for anything you do not own (his *"obviously you can't do fix scrape to
 * enemy towers"*), and this keeps that costing nothing.
 */
export function actionBlockHeight(buttons: readonly { kind: string }[]): number {
  if (buttons.length === 0) return 0;
  const hasWide = buttons.some((b) => b.kind !== 'FEED');
  const hasFeed = buttons.some((b) => b.kind === 'FEED');
  let h = ACT_ROW_GAP;
  if (hasWide) h += ACT_BTN_H;
  if (hasFeed) h += (hasWide ? ACT_ROW_GAP : 0) + FEED_BTN;
  return h;
}

/**
 * PURE — the popover's buttons re-laid-out inside the card, in ABSOLUTE canvas coordinates.
 *
 * ⛔ **THE INCOMING x/y ARE DISCARDED ON PURPOSE.** `structureActionModel` positions its buttons for
 * a free-floating popover anchored to the structure on the board. Re-using those coordinates inside
 * the card would scatter the buttons across the screen — they are the right BUTTONS with the wrong
 * geometry. Everything else on the descriptor (kind, label, caption, enabled, sparkType) is taken
 * verbatim, because that is the part the reducer and the pricing logic own.
 *
 * ⚠ FEED GETS ITS OWN ROW BENEATH. Six shape chips and two wide buttons do not share a line at
 * 236px, and the wide row is the one he named first.
 */
export function layoutSheetActions(
  buttons: readonly SheetActionSlot[],
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): SheetActionSlot[] {
  if (buttons.length === 0) return [];
  const inner = rect.w - PAD * 2;
  const wide = buttons.filter((b) => b.kind !== 'FEED');
  const feed = buttons.filter((b) => b.kind === 'FEED');
  const out: SheetActionSlot[] = [];

  let y = rect.y + rect.h - PAD - actionBlockHeight(buttons) + ACT_ROW_GAP;

  if (wide.length > 0) {
    const w = (inner - ACT_GAP * (wide.length - 1)) / wide.length;
    wide.forEach((b, i) => {
      out.push({ ...b, x: rect.x + PAD + i * (w + ACT_GAP), y, w, h: ACT_BTN_H });
    });
    y += ACT_BTN_H + ACT_ROW_GAP;
  }

  if (feed.length > 0) {
    // Centred on its own occupancy, so a five-shape strip does not sit left-aligned with a dead gap.
    const stripW = feed.length * FEED_BTN + (feed.length - 1) * FEED_GAP;
    const left = rect.x + (rect.w - stripW) / 2;
    feed.forEach((b, i) => {
      out.push({ ...b, x: left + i * (FEED_BTN + FEED_GAP), y, w: FEED_BTN, h: FEED_BTN });
    });
  }
  return out;
}

/** Height of a card carrying these parts. Derived, so nothing has to be kept in sync by hand. */
function heightFor(
  stats: number,
  owned: boolean,
  actions: readonly { kind: string }[] = [],
  extras = 0,
): number {
  return (
    PAD + HEADER_H + PORTRAIT + 6 + BAR_H + 8 + stats * ROW_H + (owned ? OWNED_H + 6 : 0) +
    extras + actionBlockHeight(actions) + PAD
  );
}

/**
 * ⭐ S181 — height the build-recipe strip and the description need, or 0 when there is neither.
 *
 * ⚠ DERIVED, so the card cannot clip them. `heightFor` not knowing about a new block is exactly how
 * the FIX/SCRAP row came to be computed and never drawn earlier this session — nothing looked
 * clipped because no space was reserved for it in the first place.
 */
export function buildInfoHeight(info: {
  description: string | null;
  buildBill: string | null;
}): number {
  let h = 0;
  if (info.buildBill !== null) h += BUILD_ROW_H;
  if (info.description !== null) h += DESC_ROW_H;
  return h;
}

const BUILD_ROW_H = 30;
/**
 * ⚠ FIVE lines at 10px with 12px leading, plus the 4px gap the renderer adds after the block.
 *
 * ⛔ IT SAID TWO, AND THAT WAS A MEASURED MISTAKE. `CodexCopy.recipe` is capped at 150 characters
 * and the card fits ~35 per line, so two lines could hold 70 of 150 — every long description lost
 * a third to half of itself to an ellipsis. The renderer's `DESC_MAX_LINES` and this reservation
 * must agree or the card clips: they are 5 and 5 × 12 + 4.
 */
const DESC_ROW_H = 5 * 12 + 4;

/**
 * Place the card above `anchor`, clamped so it is never half off the board.
 *
 * ⭐ S181 — `w` IS A PARAMETER NOW, for exactly one caller: the keep. Its card is the header of a
 * single merged window whose body is `castlePanel`, so the two must share an edge — a 236px card
 * over a 268px panel reads as the two windows the owner asked us to stop drawing. Everything else
 * keeps `SHEET_W`, because *"one width for everything, so a goblin and a boss read as the same kind
 * of object"* is still right for the floating cards.
 */
function rectFor(anchor: Vec2, h: number, w: number = SHEET_W): CharacterSheetView['rect'] {
  const x = Math.max(EDGE_MARGIN, Math.min(CANVAS_WIDTH - w - EDGE_MARGIN, anchor.x - w / 2));
  const y = Math.max(EDGE_MARGIN, Math.min(CANVAS_HEIGHT - h - EDGE_MARGIN, anchor.y - LIFT - h));
  return { x, y, w, h };
}

/**
 * ⭐⭐ S181 — PURE — the keep's card rect: the TOP SLICE of the merged castle window, placed **BESIDE
 * the keep** rather than above it.
 *
 * ⛔ **BESIDE, NOT ABOVE, AND AN E2E TEST IS WHY — NOT TASTE.** The first attempt at the owner's one
 * window used the ordinary floating placement (above the subject, like every other card) with the
 * panel docked below. `castle-panel.spec.ts` went red on *"clicking the castle again closes it"* and
 * the arithmetic says why: card 240 + panel 292 = a 532px block, and the keep sits at y≈516, so the
 * block cannot fit above it. `rectFor`'s bottom clamp then slid it back DOWN over the keep,
 * `onDown`'s `isPointerOverPanel()` early-return swallowed the second click, and the panel became
 * impossible to close. Raising the lift could not fix it; there is no room up there.
 *
 * ⭐ SO THE MERGED WINDOW GOES WHERE THE PANEL HAS ALWAYS GONE: beside the keep, via the panel's own
 * `castleBlockOrigin` flip-and-clamp. The owner has been playing with it there since S136, the keep
 * stays clickable, and the only change is that the card is now the top of the same box.
 *
 * `castlePanel.setDock` then places the panel at `y + cardH` — verified in the live client as
 * sameLeft / sameWidth / gap 0, i.e. one window by arithmetic rather than by eye.
 */
function castleCardRect(anchor: Vec2, cardH: number): CharacterSheetView['rect'] {
  const blockH = cardH + panelHeight(CASTLE_ROW_KEYS.length);
  const o = castleBlockOrigin(anchor.x, anchor.y, blockH);
  return { x: o.x, y: o.y, w: PANEL_W, h: cardH };
}

/**
 * ⭐ PURE — everything the card shows for `target`, or `null` when there is nothing to show.
 *
 * ⛔ **THE TARGET IS AN ID AND IS RE-LOOKED-UP EVERY FRAME.** GEMINI-AUDITOR raised this in Council
 * and it is a real hazard here rather than a style note: `applySnapshotCore` CLEARS and rebuilds
 * `world.creatures`, `world.primitives` and `world.defenders` on every snapshot, so a held object
 * reference would quietly become a detached ghost that renders stale numbers forever. Holding the id
 * and re-resolving is what makes a dead subject's card fall back to its frozen last-seen state
 * instead of lying.
 */
export function characterSheetModel(
  world: World,
  seat: PlayerId,
  target: SheetTarget,
): CharacterSheetView | null {
  if (target.kind === 'creature') return creatureSheet(world, seat, target);
  if (target.kind === 'defender') return defenderSheet(world, seat, target);
  if (target.kind === 'castle') return castleSheet(world, seat, target);
  if (target.kind === 'stinkCloud') return stinkCloudSheet(world, seat, target);
  return structureSheet(world, seat, target);
}

function creatureSheet(
  world: World,
  seat: PlayerId,
  target: { readonly kind: 'creature'; readonly id: CreatureId },
): CharacterSheetView | null {
  const c = world.creatures.get(target.id);
  if (c === undefined) return null;
  const cfg = getCreatureConfig(c.type);
  const max = unitPoolFifths(cfg.hp, cfg.def);
  const race = world.players.get(c.ownerPlayerId)?.raceId ?? null;
  const frozen = isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId);
  const stats = statRowsFor(cfg.hp, cfg.def, cfg.atk, cfg.pen);
  /*
   * ⭐⭐ S181 (owner) — **THE ZOMBIE BOSS SHOWS ITS ROT.** *"Anything that has an aura, damage per
   * second, should show how much damage per second. So the zombie boss, the stink tower."*
   *
   * ⚠ A PERCENTAGE, NOT A NUMBER, and `zombieAuraPercentPerSecond` records why in full: the rot is a
   * per-mille drain, so its fifths-per-second is a constant FRACTION of whatever it is eating. Any
   * flat figure would be right for exactly one target and wrong for every other.
   */
  if (c.type === T9_BOSS_TYPE.zombies) {
    stats.push({ label: 'ROT', points: zombieAuraPercentPerSecond(), derived: '% of pool a second' });
  }
  const h = heightFor(stats.length, false);
  return {
    target,
    title: creatureDisplayName(c.type),
    subtitle: `${tierOf(c.type)} · ${(race ?? 'unaligned').toUpperCase()}` + (c.ownerPlayerId === seat ? '' : ' · ENEMY'),
    portrait: portraitForCreature(c.type, race),
    health: { cur: Math.max(0, c.ehp), max, frozen },
    stats,
    owned: null,
    actions: null,
    accent: accentFor(world, c.ownerPlayerId),
    ...NO_BUILD_INFO,
    feedHint: null,
    rect: rectFor(c.pos, h),
  };
}

function defenderSheet(
  world: World,
  seat: PlayerId,
  target: { readonly kind: 'defender'; readonly id: DefenderId },
): CharacterSheetView | null {
  const d = world.defenders.get(target.id);
  if (d === undefined) return null;
  // ⛔ A TOWER CARRIES `ehp === null` — it has no pool of its own and dies by recipe-break (R75).
  // Only a unit-class defender (Helga) has a sheet of this shape; a tower is reached through its
  // STRUCTURE instead, which is where its connector health actually lives.
  if (d.ehp === null) return null;
  const cfg = defenderStatsOf(world, d.id);
  if (cfg === null) return null;
  const max = unitPoolFifths(cfg.hp, cfg.def);
  const frozen = isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId);
  const stats = statRowsFor(cfg.hp, cfg.def, cfg.atk, cfg.pen);
  const h = heightFor(stats.length, false);
  return {
    target,
    title: d.kind.toUpperCase(),
    subtitle: d.ownerPlayerId === seat ? 'YOUR UNIT' : 'ENEMY UNIT',
    portrait: { kind: 'defenderFrame', defenderKind: d.kind },
    health: { cur: Math.max(0, d.ehp), max, frozen },
    stats,
    owned: null,
    actions: null,
    accent: accentFor(world, d.ownerPlayerId),
    ...NO_BUILD_INFO,
    feedHint: null,
    rect: rectFor(d.pos, h),
  };
}

function structureSheet(
  world: World,
  seat: PlayerId,
  target: { readonly kind: 'structure'; readonly primitiveId: PrimitiveId },
): CharacterSheetView | null {
  const prim = world.primitives.get(target.primitiveId);
  if (prim === undefined) return null;
  const comp = componentOf(prim, world.primitives, world.bonds);

  /*
   * ⭐ A BUILDING'S HEALTH IS ITS CONNECTORS' — owner R173-B, and the reason the sheet can show one
   * at all. `structurePoolFifths(n)` is what the NEXT connector costs, and `damageConnector` banks
   * damage STRUCTURE-WIDE, so "what is left of this building" is the pool minus everything standing
   * on it. That is the same arithmetic the sim subtracts; there is no second scale here.
   */
  const pool = structurePoolFifths(comp.bondIds.size);
  let banked = 0;
  for (const id of comp.bondIds) banked += world.bonds.get(id)?.damageFifths ?? 0;

  const owner = prim.placedBy;
  const mine = owner === seat;
  const frozen = isConcealed(prim.pos.x, prim.pos.y, owner);
  const recipeId = recipeIdOf(world, target.primitiveId);
  const owned = ownedUnitRow(world, comp.primitiveIds);

  // ⛔ ACTIONS ONLY ON YOUR OWN — his *"obviously you can't do fix scrape to enemy towers"*. The
  // planner is the reducer's own, never a lookalike: see this module's docblock.
  const actions = mine ? structureActionModel(world, seat, target.primitiveId) : null;

  /*
   * ⛔ S180 (owner playtest) — **THIS ARRAY WAS EMPTY AND THAT WAS THE BUG HE REPORTED.** *"I don't
   * see the tower stats … there's no nothing."* A building's card was a name, a portrait and a bar.
   *
   * What a building HAS, on the one ladder: its connector count is both its HP and its DEF, so
   * CONNECTORS is the honest first row and the pool beside it is the same arithmetic the sim
   * subtracts. A tower that also SHOOTS carries its emplacement's own attack rows, read from the
   * shipped config rather than restated.
   */
  const stats: SheetStatRow[] = [
    { label: 'CONNECTORS', points: comp.bondIds.size, derived: `${pool} pool` },
    { label: 'SHAPES', points: comp.primitiveIds.size, derived: null },
  ];
  /*
   * ⭐⭐ S181 (owner) — **ANYTHING WITH AN AURA SHOWS ITS DAMAGE PER SECOND.**
   *
   * > *"Anything that has an aura, damage per second, should show how much damage per second. So the
   * > zombie boss, the stink tower … you can put it under range, for example."*
   *
   * ⚠ DERIVED FROM THE CADENCE, and it must not print `STINK_AURA_DAMAGE`: that constant is 20, it
   * looks like the answer, and it has been retired and unread since S157 B9. The S181 audit named it
   * as a trap. The real aura is `STINK_AURA_UNIT_FIFTHS` once per `STINK_AURA_CADENCE_TICKS`.
   */
  if (auraOwnerIn(world, comp.primitiveIds)) {
    stats.push({
      label: 'AURA',
      points: (STINK_AURA_UNIT_FIFTHS * PHYSICS_HZ) / STINK_AURA_CADENCE_TICKS,
      derived: 'a second',
    });
  }
  const emplacement = towerStatsIn(world, comp.primitiveIds);
  if (emplacement !== null) {
    stats.push({ label: 'ATK', points: emplacement.atk, derived: `${attackFifths(emplacement.atk, emplacement.pen)} a shot` });
    stats.push({ label: 'PEN', points: emplacement.pen, derived: null });
    stats.push({ label: 'RANGE', points: emplacement.range, derived: 'px' });
  }
  const info = buildInfoFor(recipeId);
  const h = heightFor(
    stats.length, owned !== null, actions?.buttons ?? [], buildInfoHeight(info),
  );
  return {
    target,
    title: recipeId === null ? 'STRUCTURE' : codexCopyFor(recipeId).name,
    subtitle: mine ? 'YOUR BUILDING' : 'ENEMY BUILDING',
    portrait: portraitForStructure(recipeId),
    health: { cur: Math.max(0, pool - banked), max: pool, frozen },
    stats,
    owned,
    actions,
    accent: accentFor(world, owner),
    ...info,
    /*
     * ⭐ S181 — DERIVED FROM THE TOWER'S OWN UNIT TABLE, so a bat tower says bat and a piranha
     * tower says piranha with no second table in the renderer. Null for the goblin tower, whose
     * six shapes each make a DIFFERENT goblin — one caption cannot state that truthfully, and a
     * wrong-but-tidy label is worse than none.
     */
    feedHint: feedHintFor(recipeId),
    rect: rectFor(prim.pos, h),
  };
}

/**
 * ⭐ S180 — THE CASTLE'S OWN CARD: its health on the same bar as everything else, and the stats it
 * actually has. `CASTLE_MAX_HP` is the ONE deliberate exception to the ladder (see `SPARK_CANON.md`),
 * so the pool is printed as the flat number it is rather than dressed up as `hp × def`.
 */
function castleSheet(
  world: World,
  seat: PlayerId,
  target: { readonly kind: 'castle'; readonly seat: PlayerId },
): CharacterSheetView | null {
  const p = world.players.get(target.seat);
  if (p === undefined) return null;
  const mine = target.seat === seat;
  const anchor = castleAnchor(target.seat as unknown as number, world.layout);
  const stats: SheetStatRow[] = [
    { label: 'SHOT', points: castleShotFifths(), derived: 'a shot' },
    { label: 'RANGE', points: CASTLE_ATTACK_RANGE, derived: 'px' },
    { label: 'RELOAD', points: Math.round(CASTLE_FIRE_INTERVAL_TICKS / PHYSICS_HZ), derived: 'seconds' },
    { label: 'REGEN', points: p.castleRegenLevel, derived: p.castleRegenLevel === 0 ? 'not bought' : 'level' },
  ];
  return {
    target,
    title: 'CASTLE',
    subtitle: `${mine ? 'YOURS' : 'ENEMY'} · ${(p.raceId ?? 'unaligned').toUpperCase()}`,
    portrait: { kind: 'castleFrame', race: p.raceId ?? null },
    health: {
      cur: Math.max(0, p.castleHp),
      max: CASTLE_MAX_HP,
      frozen: isConcealed(anchor.x, anchor.y, target.seat),
    },
    stats,
    owned: null,
    actions: null,
    accent: accentFor(world, target.seat),
    ...NO_BUILD_INFO,
    feedHint: null,
    /*
     * ⭐ S181 — the keep's card is `PANEL_W` wide, not `SHEET_W`. It is the HEADER of the one merged
     * castle window; `castlePanel` docks flush beneath it and the shared edge is what makes the two
     * read as a single panel rather than the *"two windows"* he asked us to stop drawing.
     */
    // ⭐⭐ S181 — beside the keep, as the top slice of the one merged window. See `castleCardRect`.
    rect: castleCardRect(anchor, heightFor(stats.length, false)),
  };
}

/**
 * PURE — does this component contain a stink tower, i.e. does the building carry an aura?
 *
 * ⚠ BY DEFENDER KIND, not by recipe id. The aura is attached to the DEFENDER the recipe spawns, and
 * `stinkAuraTick` iterates defenders — so asking the same question the sim asks keeps the readout
 * and the damage from drifting apart.
 */
function auraOwnerIn(world: World, members: ReadonlySet<PrimitiveId>): boolean {
  for (const d of world.defenders.values()) {
    if (d.kind !== 'stinkTower') continue;
    if (members.has(d.anchorPrimitiveId)) return true;
  }
  return false;
}

/**
 * ⭐⭐ S181 (owner) — the ZOMBIE BOSS's rot aura, as a share of the victim's pool per second.
 *
 * > *"Anything that has an aura, damage per second, should show how much damage per second. So the
 * > zombie boss, the stink tower."*
 *
 * ⛔ IT CANNOT BE A FLAT NUMBER, AND THAT IS THE INTERESTING PART. The rot is a PER-MILLE DRAIN:
 * `dotIntervalTicks(pool, perMille)` spaces single-fifth ticks so that the interval shrinks as the
 * victim's pool grows. Work it through and the fifths-per-second is `pool × perMille / 1000` — i.e.
 * a constant FRACTION of whatever it is eating, 2.5% per second at the shipped 25‰, identical for a
 * chewer and for Vlad. So the honest readout is the percentage, not a number that would be wrong for
 * every target but one.
 */
function zombieAuraPercentPerSecond(): number {
  return ZOMBIE_AURA_PER_MILLE / 10; // per-mille -> percent
}

/**
 * ⭐⭐ S181 (owner) — **THE LANDED BAG'S CARD, with the damage-per-second he asked for.**
 *
 * > *"When you click on them, it should show how much damage they're doing per second. Anything that
 * > has an aura, damage per second, should show how much damage per second."*
 *
 * ⛔ THE DPS IS DERIVED FROM THE SHIPPED CADENCE, NOT WRITTEN DOWN. `STINK_AURA_UNIT_FIFTHS` per
 * `STINK_AURA_CADENCE_TICKS` against `PHYSICS_HZ` is the whole calculation, so retuning the aura
 * retunes the readout and the card cannot go stale.
 *
 * ⚠ AND IT MUST NOT PRINT `STINK_AURA_DAMAGE`. That constant is 20, it LOOKS like the answer, and it
 * has been retired and unread by production since S157 B9 — the S181 audit flagged it by name as a
 * trap. Printing it would be a bespoke number on its own scale, which is the defect the stat-ladder
 * section of CLAUDE.md exists to prevent.
 */
function stinkCloudSheet(
  world: World,
  seat: PlayerId,
  target: { readonly kind: 'stinkCloud'; readonly id: StinkCloudId },
): CharacterSheetView | null {
  const bag = world.stinkClouds.get(target.id);
  if (bag === undefined) return null;
  const mine = bag.ownerPlayerId === seat;

  const perSecond = (STINK_AURA_UNIT_FIFTHS * PHYSICS_HZ) / STINK_AURA_CADENCE_TICKS;
  const stats: SheetStatRow[] = [
    { label: 'AURA', points: perSecond, derived: 'a second' },
    { label: 'RANGE', points: bag.radius, derived: 'px' },
    { label: 'LASTS', points: Math.round(STINK_CLOUD_LIFETIME_TICKS / PHYSICS_HZ), derived: 'seconds' },
  ];
  const h = heightFor(stats.length, false);
  return {
    target,
    title: 'STINK BAG',
    subtitle: mine ? 'YOURS · AURA' : 'ENEMY · AURA',
    // A bag has its own art in the stink-tower sheet's family; until that is wired it keeps a plate.
    portrait: { kind: 'emblem', recipeId: 'stinkTower' },
    health: {
      cur: Math.max(0, bag.ehp),
      max: unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF),
      frozen: isConcealed(bag.pos.x, bag.pos.y, bag.ownerPlayerId),
    },
    stats,
    owned: null,
    actions: null,
    accent: accentFor(world, bag.ownerPlayerId),
    ...NO_BUILD_INFO,
    feedHint: null,
    rect: rectFor(bag.pos, h),
  };
}

/** The shooting emplacement inside a structure, if it has one — a turret's or a stink tower's. */
function towerStatsIn(
  world: World,
  members: ReadonlySet<PrimitiveId>,
): { atk: number; pen: number; range: number } | null {
  for (const d of world.defenders.values()) {
    if (!members.has(d.anchorPrimitiveId)) continue;
    const cfg = getDefenderConfig(d.kind as Parameters<typeof getDefenderConfig>[0]);
    if (cfg === undefined) continue;
    return { atk: cfg.atk, pen: cfg.pen, range: cfg.attackRange };
  }
  return null;
}

/**
 * The one creature a building fields, if it fields one — Helga's hub and the Voltkin TV are the two
 * shipped cases, and the owner named both. Matched through `Defender.anchorPrimitiveId`, which is
 * the existing link from a defender back to the structure that holds it.
 */
function ownedUnitRow(
  world: World,
  members: ReadonlySet<PrimitiveId>,
): SheetOwnedUnit | null {
  for (const d of world.defenders.values()) {
    if (!members.has(d.anchorPrimitiveId)) continue;
    if (d.ehp === null) continue; // a turret/stink tower fields nobody — nothing to show
    const cfg = defenderStatsOf(world, d.id);
    if (cfg === null) continue;
    return {
      target: { kind: 'defender', id: d.id },
      name: d.kind.toUpperCase(),
      portrait: { kind: 'defenderFrame', defenderKind: d.kind },
      health: {
        cur: Math.max(0, d.ehp),
        max: unitPoolFifths(cfg.hp, cfg.def),
        frozen: isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId),
      },
    };
  }
  return null;
}

/**
 * The recipe this component was stamped from, or null for shapes a player bonded together by hand.
 *
 * ⚠ IT IS ON `origin`, NOT ON THE SHAPE. `Primitive.origin` is S152's blueprint provenance — set
 * only for a shape a stamp minted — and it is the field the FIX button already reads to know what
 * a damaged tower should be restored TO. Freeform rubble has none, and reads as 'STRUCTURE'.
 */
function recipeIdOf(world: World, primitiveId: PrimitiveId): string | null {
  const prim = world.primitives.get(primitiveId);
  return prim?.origin?.blueprintId ?? null;
}

/** A unit-class defender's four stats, by id. Null for anything without a pool (every tower). */
function defenderStatsOf(
  world: World,
  id: DefenderId,
): { hp: number; def: number; atk: number; pen: number } | null {
  const d = world.defenders.get(id);
  if (d === undefined) return null;
  return defenderStatsOfKind(d.kind);
}

/** A unit-class defender's four stats, off the shipped config table. Null for anything with no pool. */
function defenderStatsOfKind(kind: string): { hp: number; def: number; atk: number; pen: number } | null {
  const cfg = getDefenderConfig(kind as Parameters<typeof getDefenderConfig>[0]);
  if (cfg === undefined || cfg.unitStats === null) return null;
  return { hp: cfg.unitStats.hp, def: cfg.unitStats.def, atk: cfg.atk, pen: cfg.pen };
}
