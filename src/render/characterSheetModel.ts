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
} from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { castleShotFifths } from '../state/castleGuns.ts';
import { componentOf } from '../game/structure.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import type { RaceId } from '../state/races.ts';
import { attackFifths, structurePoolFifths, unitPoolFifths } from '../state/stats.ts';
import { T9_BOSS_NAMES, T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { World } from '../state/worldTypes.ts';
import type { CreatureId, DefenderId, PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import { codexCopyFor } from './codexPresentation.ts';
import { isConcealed } from './concealment.ts';
import { structureActionModel, type StructureActionView } from './structurePanel.ts';

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
  | { readonly kind: 'castle'; readonly seat: PlayerId };

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

/** Height of a card carrying these parts. Derived, so nothing has to be kept in sync by hand. */
function heightFor(stats: number, owned: boolean): number {
  return (
    PAD + HEADER_H + PORTRAIT + 6 + BAR_H + 8 + stats * ROW_H + (owned ? OWNED_H + 6 : 0) + PAD
  );
}

/** Place the card above `anchor`, clamped so it is never half off the board. */
function rectFor(anchor: Vec2, h: number): CharacterSheetView['rect'] {
  const x = Math.max(EDGE_MARGIN, Math.min(CANVAS_WIDTH - SHEET_W - EDGE_MARGIN, anchor.x - SHEET_W / 2));
  const y = Math.max(EDGE_MARGIN, Math.min(CANVAS_HEIGHT - h - EDGE_MARGIN, anchor.y - LIFT - h));
  return { x, y, w: SHEET_W, h };
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
  const h = heightFor(stats.length, false);
  return {
    target,
    title: creatureDisplayName(c.type),
    subtitle: `${tierOf(c.type)} · ${(race ?? 'unaligned').toUpperCase()}` + (c.ownerPlayerId === seat ? '' : ' · ENEMY'),
    portrait: { kind: 'creatureFrame', creatureType: c.type, race },
    health: { cur: Math.max(0, c.ehp), max, frozen },
    stats,
    owned: null,
    actions: null,
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
  const emplacement = towerStatsIn(world, comp.primitiveIds);
  if (emplacement !== null) {
    stats.push({ label: 'ATK', points: emplacement.atk, derived: `${attackFifths(emplacement.atk, emplacement.pen)} a shot` });
    stats.push({ label: 'PEN', points: emplacement.pen, derived: null });
    stats.push({ label: 'RANGE', points: emplacement.range, derived: 'px' });
  }
  const h = heightFor(stats.length, owned !== null);
  return {
    target,
    title: recipeId === null ? 'STRUCTURE' : codexCopyFor(recipeId).name,
    subtitle: mine ? 'YOUR BUILDING' : 'ENEMY BUILDING',
    portrait: recipeId === null
      ? { kind: 'emblem', recipeId: 'freeform' }
      : { kind: 'emblem', recipeId },
    health: { cur: Math.max(0, pool - banked), max: pool, frozen },
    stats,
    owned,
    actions,
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
    rect: rectFor(anchor, heightFor(stats.length, false)),
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
