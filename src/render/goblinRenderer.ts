/**
 * SPARK — GOBLIN renderer (S139 P2). Procedural, no atlas.
 *
 * ## Why this file is mandatory rather than polish
 *
 * Both shipped creature renderers are EXCLUSION filters — `creatureRenderer` draws only Voltkin and
 * drones (`if (!isVoltkin && !isDrone) continue`), `chewerRenderer` only chewers
 * (`if (c.type !== 'chewer') continue`) — and there is no renderer registry to register into. There
 * is also no `switch` anywhere over `CreatureType`, so a new member produces NO compile error. The
 * consequence, measured in the S139 A.0 sweep: a new creature type simulates, walks, strikes, kills
 * and dies with **nothing drawn**. That is the same class of defect as S139 P1's dead dispatcher —
 * present, correct, and invisible — so the renderer lands in the same priority as the behaviour, not
 * after it.
 *
 * ## Why procedural and not a veo atlas
 *
 * A.0 measured the atlas path as ~326 LOC of near-duplicate renderer per character, with the loader
 * (`ensureAtlas`, 40 LOC) having ZERO test coverage, against only 28.6 KiB of quiet entry-bundle
 * headroom before the charter's WARN band. `turretRenderer.ts` is a complete procedural defender in
 * 153 LOC with no texture, no manifest, no async load and no fallback branch. Atlas art for the
 * goblins is a later, art-focused session; this is a real, legible unit in the meantime.
 *
 * ## The animation channel
 *
 * Everything animated here is derived from state that RIDES THE WIRE — `state`, `ticksInState`, `hp`,
 * `pos` — never from `performance.now()` for anything mechanical. That matters because a one-shot
 * `world.effects` push is lost ~5/6 of the time (the 10 Hz snapshot samples effects while the
 * renderer wipes them every frame), so the swing has to be readable from held state alone. Wall-clock
 * is used ONLY for cosmetic idle bob, which is allowed to differ per peer.
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { CreatureId } from '../types.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { syncCreatureProjectiles } from './creatureProjectile.ts';
import { GOBLIN_LIFT, GROUND_RX, GROUND_RY, drawGroundMarker } from './creatureLift.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
// S169 R152 — the STUN read, for the idle-pose override and the derived "seeing stars".
import { isStunned } from '../state/creatures/creature.ts';
import { GOBLIN_SPRITE_BASE_SCALE, PLAYER_COLORS } from '../constants.ts';
import { creatureSpriteScaleMul } from './towerFrames.ts';
import { drawStunStars } from './stunStars.ts';
import { drawBossAuras } from './bossAuras.ts';
import { drawLocustClouds } from './locustCloud.ts';
import { drawHealthBars } from './healthBar.ts';
import { isConcealed } from './concealment.ts';
import { defaultRaceForSeat, isRaceId, type RaceId } from '../state/races.ts';
// S166 — tier-3 atlas paths, from the side-effect-free leaf.
import { RACE_TOWER_UNIT, t3UnitAtlasBase } from '../state/raceTowerIds.ts';
// S167 — the tier-9 leaf, same side-effect-free contract.
import { T9_BOSS_TYPE, t9BossAtlasBase } from '../state/t9BossIds.ts';

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  ⭐ S151 P3 — THE veo ATLAS PATH. The owner's words about the procedural rig below: *"not like
 *  the shitty goblin that we have now"*, and *"bring them to life ... just like helga"*.
 * ────────────────────────────────────────────────────────────────────────────────────────────── *
 *
 * Each animated goblin kind owns an atlas built by `scripts/build-sprite-atlas.mjs` from veo clips
 * seeded IMAGE-TO-VIDEO off the owner's own character art, so idle, walk and attack are the same
 * character rather than three drawings of one. The manifest format is Helga's exactly
 * (`public/godly/helga/anim/helga-anim.json`), which is why this renderer can mirror
 * `princessRenderer` instead of inventing a second scheme.
 *
 * ⚠ ONLY THE KINDS WITH ART APPEAR HERE. A kind absent from this map falls through to the
 * procedural puppet, so it is still VISIBLE and playable — which matters, because the S139 sweep
 * found that an unrendered creature simulates, walks, strikes, kills and dies with nothing drawn.
 *
 * ⭐ S152 P3 — three more, on the owner's scoping: *"now we need this session shield goblin,
 * terrorist goblin, and bat rider goblin, all in the same art style"*. Only `goblinHound` is left
 * on the puppet.
 *
 * ⭐ S153 P7 — AND NOW NONE ARE. `goblinHound` shipped, so all six FEED outputs have atlas art
 * and `drawGoblin`'s procedural puppet is a LOAD-FAILURE FALLBACK ONLY rather than the shipped
 * look of any unit. It is deliberately kept: an atlas that fails to fetch on some peer must
 * still draw something rather than nothing.
 */
/*
 * ⚠ S169 — EXPORTED so `goblinRendererLazyAtlas.test.ts` can assert every key is reachable by some
 * load path. That is the S168 direwolf lesson applied before it bites: `GOBLIN_KINDS` warned in
 * writing for two sessions that a missing type "draws NOTHING AT ALL" while being module-PRIVATE, so
 * no test COULD import it, and the direwolf duly shipped invisible. A table whose correctness is
 * described in a comment and checkable by nobody is a prophecy, not a guard.
 */
export const ATLASES: Partial<Record<CreatureType, string>> = {
  goblinMelee: '/godly/goblin-melee/anim/goblin-melee',
  goblinArcher: '/godly/goblin-archer/anim/goblin-archer',
  goblinShield: '/godly/goblin-shield/anim/goblin-shield',
  // ⚠ THE ASSET IS NAMED `goblin-sapper`, NOT `goblin-suicide`, AND THE MISMATCH IS DELIBERATE.
  // veo refuses prompts that read as a suicide bomber, so the owner's "terrorist goblin" was framed
  // as a comedic sapper hugging an oversized cartoon bomb and the asset name follows the ART. The
  // FEED button captions him SAPPER too (structurePanel.GOBLIN_SHORT_NAME), so the player-facing
  // name and the file name agree; only the CreatureType literal predates both.
  goblinSuicide: '/godly/goblin-sapper/anim/goblin-sapper',
  goblinBat: '/godly/goblin-batrider/anim/goblin-batrider',
  // ⭐ S153 P7 — THE LAST ONE OFF THE PUPPET. goblinHound was the only FEED output still
  // falling through to drawGoblin, which draws in green — the owner's "gay green circle".
  // Every one of the six shapes now hands back real art.
  goblinHound: '/godly/goblin-hound/anim/goblin-hound',
  /*
   * ⭐ S166 — THE SIX TIER-3 UNITS, and unlike `raceUnit` they belong in THIS table.
   *
   * `raceUnit` is one type for six races, so its atlas has to be resolved at draw time from
   * `player.raceId` (`RACE_UNIT_ATLAS_BASE`, below). Each tier-3 type IS a single race's creature,
   * so the type alone determines the art and the plain static map does the job — no race lookup,
   * no per-frame branch.
   *
   * ⛔ THIS TABLE IS `Partial<>`, SO A MISSING ENTRY IS SILENT: the creature falls through to
   * `drawGoblin`'s procedural puppet, which draws in green. That is the owner's *"gay green circle"*
   * from S153 P7, and it is what a forgotten tier-3 entry would look like — not a crash, not a red
   * test, just the wrong art.
   *
   * ⚠ PATHS ARE DERIVED VIA `t3UnitAtlasBase`, not typed out, because the filenames carry BOTH the
   * race and the creature (`t3-vampires-bat`) and a hand-typed path that 404s is silent too.
   */
  t3Bat: t3UnitAtlasBase('vampires'),
  t3Piranha: t3UnitAtlasBase('nagas'),
  t3Scarab: t3UnitAtlasBase('mummies'),
  t3Hound: t3UnitAtlasBase('zombies'),
  t3Warband: t3UnitAtlasBase('orcs'),
  t3Souleater: t3UnitAtlasBase('demons'),
  /*
   * ⭐ S167 — THE SIX TIER-9 BOSSES. Same reasoning as the tier-3 block above: each boss type IS a
   * single race's creature, so the type alone determines the art and no race lookup is needed.
   *
   * ⚠ PATHS ARE DERIVED VIA `t9BossAtlasBase`, never typed out. `loadAtlas`'s bare `catch {}` below
   * swallows a 404 with no console error and no failing test, so a hand-typed path that is wrong
   * looks EXACTLY like a missing entry — the green procedural puppet, on the most expensive unit in
   * the game. `t9BossTower.test.ts` asserts every path this builds exists on disk.
   */
  t9BossVampires: t9BossAtlasBase('vampires'),
  t9BossNagas: t9BossAtlasBase('nagas'),
  t9BossMummies: t9BossAtlasBase('mummies'),
  t9BossZombies: t9BossAtlasBase('zombies'),
  t9BossOrcs: t9BossAtlasBase('orcs'),
  t9BossDemons: t9BossAtlasBase('demons'),
};

/**
 * ⭐ S152 P3 — PER-KIND ALTITUDE moved to `creatureLift.ts` in S154 P2, because the HARPOON needs
 * the same number: a projectile launched from a flyer's `pos` emanates from empty air below its
 * picture. `goblinRenderer` already imports the projectile module, so the lift had to move to a
 * shared leaf rather than be imported back out of here. See that file for why baking the gap into
 * the art cannot work.
 */

/**
 * Minimum opacity for a creature that has not started materialising. See the long note at the
 * `alpha` computation: without a floor, a goblin fed during BUILD is drawn at alpha 0 — invisible.
 * Low enough to read as "not active yet", high enough to be unmistakably THERE.
 */
const SPAWN_ALPHA_FLOOR = 0.35;

/**
 * S154 P4 (owner A3) — opacity of an army standing down between fights: *"like halfway
 * transparent"*. Taken literally.
 */
const DORMANT_ALPHA = 0.5;

/**
 * How far the owner colour is lifted towards white before it is used as a MULTIPLY tint.
 * 0 = the raw player colour (what S151 shipped, which crushed the art to near-black); 1 = pure
 * white, i.e. no tint at all. 0.8 keeps the seat legible and the artwork intact.
 */
const TINT_WASH = 0.8;

/** Lift `color` towards white by `t` (0..1), per channel. Pure — no allocation, no Pixi types. */
function washTowardsWhite(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c: number): number => Math.round(c + (255 - c) * t) & 0xff;
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Every goblin kind this renderer is responsible for, atlas-backed or procedural. */
/**
 * Every kind this renderer is responsible for, atlas-backed or procedural.
 *
 * ⭐ S165 W1-C — `raceUnit` JOINS THIS RENDERER RATHER THAN GETTING ITS OWN, and that is deliberate.
 * `creatureLift.ts` enforces the owner-tinted ground marker by there being nothing else to call
 * (*"ONE definition, called from all three creature renderers"*), so a FOURTH renderer would have
 * silently shipped the one creature on the board WITHOUT the seat cue the owner asked to be
 * universal. It also inherits the HP pips, the facing dead-zone and the tick-derived frame index
 * for free — all three of which are things a new renderer gets subtly wrong.
 */
/**
 * ⭐ S168 — **EXPORTED, AND THAT IS THE FIX RATHER THAN A CONVENIENCE.**
 *
 * The two docblocks below have warned since S166 and S167 that a `CreatureType` missing from this
 * Set is *"simulated, serialized, hashed and INVISIBLE"*, and both end with the same admission:
 * *"no test file in the tree imports it"*. It was module-private, so no test COULD.
 *
 * The direwolf became the first type to fall into that hole — it walked, struck for 24 fifths,
 * killed and died with zero pixels on screen. Exporting the Set is what lets
 * `goblinRenderer.coverage.test.ts` assert that EVERY `CreatureType` is drawn by SOME renderer, so
 * the warning is now a gate instead of a prophecy.
 */
export const GOBLIN_KINDS: ReadonlySet<CreatureType> = new Set<CreatureType>([
  'goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'goblinBat', 'goblinSuicide',
  'raceUnit',
  /*
   * ⛔ S166 — THE SIX TIER-3 UNITS, AND THIS SET IS THE GATE. It is hand-maintained and it decides
   * whether this renderer takes responsibility for a type at all — a `CreatureType` absent from here
   * is simulated, serialized, hashed and INVISIBLE. Nothing in `tsc` or the suite catches that: the
   * unit fights, the HP pips never appear, and the board looks like the tower is broken.
   *
   * ⚠ THEY JOIN THIS RENDERER RATHER THAN GETTING THEIR OWN, on the same reasoning `raceUnit` did:
   * `creatureLift.ts` enforces the owner-tinted ground marker by there being nothing else to call,
   * so a separate renderer would silently ship six units without the seat cue the owner asked to be
   * universal — and they inherit the HP pips, the facing dead-zone and the tick-derived frame index,
   * all three of which a new renderer gets subtly wrong.
   */
  't3Bat', 't3Piranha', 't3Scarab', 't3Hound', 't3Warband', 't3Souleater',
  /*
   * ⛔ S167 — THE SIX BOSSES, AND THIS SET FAILS DIFFERENTLY FROM `ATLASES` ABOVE. A type missing
   * from `ATLASES` draws the green puppet; a type missing from HERE draws NOTHING AT ALL — the boss
   * fights, takes damage, kills a castle and is never on screen. Neither is caught by anything: this
   * Set is hand-maintained and no test file in the tree imports it.
   */
  't9BossVampires', 't9BossNagas', 't9BossMummies', 't9BossZombies', 't9BossOrcs', 't9BossDemons',
  /*
   * ⛔⛔ S168 — THE ORC WARLORD'S DIREWOLF (owner R149), AND IT IS THE TYPE THE WARNING ABOVE WAS
   * WRITTEN FOR. It shipped without this line and was therefore completely invisible: it summoned in
   * threes, walked, struck at 24 fifths a swing, killed and died, and never drew a pixel. Nothing
   * failed — not tsc, not the suite, not `check:atlas`.
   *
   * ⚠ It has NO ATLAS yet, deliberately: the owner is generating the sprite himself. That is the
   * GRACEFUL half — a type in this Set but absent from `ATLASES` falls through to `drawGoblin`'s
   * procedural puppet, so the wolf is visible and readable until the art lands.
   */
  'direwolf',
]);

/** Where a race's unit atlas pair lives, WITHOUT the `-atlas.png` / `-anim.json` suffix. */
const RACE_UNIT_ATLAS_BASE = (race: RaceId): string => `/art/race-units/unit-${race}`;

/**
 * ⭐⭐ S169 — WHICH SHEETS LOAD ON FIRST SYNC. Everything else in `ATLASES` is race-keyed and is
 * fetched by `preloadRaceKit` (at match start, for the seated races only) or by `ensureTypeAtlas`.
 *
 * ⛔ THE SIX GOBLINS STAY EAGER BECAUSE THEY ARE NOT RACE-KEYED. Any seat can field any of them by
 * feeding the goblin tower one shape, so there is no smaller set to predict — and at 8.18 MiB they
 * are a sixth of what this loop used to fetch.
 *
 * ⚠ A TYPE ADDED TO `ATLASES` BUT TO NEITHER THIS SET NOR A PRELOAD PATH still draws, via
 * `ensureTypeAtlas` in the draw loop — one puppet-green frame or two, not a permanent puppet.
 * `goblinRendererLazyAtlas.test.ts` pins that every `ATLASES` key is reachable by some path.
 */
/*
 * ⭐ S170 P5 — the "seeing stars" dial and its drawing MOVED to `render/stunStars.ts`, because the
 * Kraken's sonar stuns units this renderer does not own (voltkin, chewer, lightningDrone) and they
 * were freezing with no stars at all. The dial went with it so there is ONE set of numbers rather
 * than three that drift. This renderer now passes `creatureSpriteScaleMul(type)`, which is the fix
 * for the bosses: the lift was flat and sat inside a scaled-up sprite.
 */

export const EAGER_ATLAS_TYPES: ReadonlySet<CreatureType> = new Set<CreatureType>([
  'goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'goblinBat', 'goblinSuicide',
]);

interface AtlasState { row: number; frames: number; ticksPerFrame: number; }
interface AtlasManifest {
  cellW: number; cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<string, AtlasState>;
}
interface LoadedAtlas { cells: Record<string, Texture[]>; manifest: AtlasManifest; }

/**
 * ⭐ S167 — HOW LONG A CORPSE LIES THERE, in RENDER FRAMES, and how fast its 12 `die` frames play.
 *
 * 90 frames is ~1.5 s at 60 Hz: long enough to read as a death rather than a flicker, short enough
 * that a big melee does not carpet the board in bodies. The 12-frame row plays over the first ~72
 * frames and holds its last frame while the fade finishes.
 *
 * ⚠ FRAMES, NOT TICKS. The creature is GONE from the sim before any of this runs, so there is no
 * `ticksInState` left to drive it — and nothing reads it, so a client-local clock cannot desync
 * anything. Same argument, same shape, as `TOWER_CRUMBLE_FRAMES` in `towerFrames.ts`.
 *
 * ⚠ MINE, NOT THE OWNER'S. A duration like this can only really be judged by watching a fight.
 */
const CORPSE_FRAMES = 90;
const CORPSE_TICKS_PER_FRAME = 6;

const OUTLINE = 0x2b2b2b;
const SKIN = 0x7fae4e;
const SKIN_SHADE = 0x5f8c37;
const EYE = 0xfff3c4;
const BLADE = 0xd8dde3;
const BLADE_EDGE = 0xf2f6fa;
const LOIN = 0x8a5a34;

const BODY_R = 7.5;

export class GoblinRenderer {
  private readonly graphics: Graphics;
  /** Previous position per goblin — the facing source (movement direction, not target direction). */
  private readonly lastSeenPos: Map<CreatureId, { x: number; y: number }> = new Map();
  private readonly facing: Map<CreatureId, 1 | -1> = new Map();

  /** veo sprites live ABOVE the procedural layer so a fallback frame can never overdraw one. */
  private readonly spriteLayer: Container;
  /**
   * S153 P2 (owner R84) — arrows in flight. Its OWN Graphics, above the sprite layer, so an
   * arrow is never painted under the goblin that loosed it and never has to share a clear()
   * with the body art.
   */
  private readonly arrowLayer: Graphics;
  private readonly sprites: Map<CreatureId, Sprite> = new Map();
  /**
   * The atlas key each live creature is drawing from, so a CORPSE can find its own `die` row after
   * the creature is gone from `world.creatures` and its type is no longer knowable.
   *
   * ⛔ WITHOUT THIS THE DEATH ANIMATION CANNOT BE LOOKED UP AT ALL. By the frame the renderer
   * notices a unit died, `world.creatures.get(id)` is already `undefined` — there is no type, no
   * owner and no race left to resolve an atlas from. Same reason `towerRenderer` caches `lastSeen`.
   */
  private readonly spriteAtlas: Map<CreatureId, LoadedAtlas> = new Map();
  /** Corpses mid-fall: a sprite handed over after its creature left the world. */
  private readonly dying: Array<{ sprite: Sprite; frames: readonly Texture[]; elapsed: number }> = [];
  /**
   * ⚠ KEYED BY STRING, NOT BY `CreatureType`. A goblin's art is chosen by its TYPE; a race unit's is
   * chosen by its OWNER'S RACE, and one `raceUnit` type covers all six. Keys are the CreatureType
   * for goblins and `raceUnit:<race>` for race units — see `atlasKeyFor`.
   */
  private readonly atlases: Map<string, LoadedAtlas> = new Map();
  private atlasLoadStarted = false;
  /** Races whose atlas load has been kicked off — see `ensureRaceAtlas`. */
  private readonly raceLoadStarted: Set<RaceId> = new Set();
  /** S169 — per-TYPE lazy-load latch, the type-keyed twin of `raceLoadStarted`. */
  private readonly typeLoadStarted: Set<CreatureType> = new Set();

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.spriteLayer = new Container();
    parent.addChild(this.spriteLayer);
    this.arrowLayer = new Graphics();
    parent.addChild(this.arrowLayer);
    void app;
  }

  /**
   * One-time lazy load of every kind's atlas + manifest. Until a load resolves — and permanently if
   * it fails on some peer — that kind renders through the procedural puppet, so a goblin is never
   * invisible. Mirrors `princessRenderer.ensureAtlas`.
   */
  private ensureAtlases(): void {
    if (this.atlasLoadStarted) return;
    this.atlasLoadStarted = true;
    for (const [type, base] of Object.entries(ATLASES) as [CreatureType, string][]) {
      /*
       * ⭐⭐ S169 (owner playtest) — **ONLY THE GOBLINS ARE EAGER NOW, AND THAT IS 50 MiB OF FETCH
       * OFF THE FIRST SYNC.**
       *
       * Owner, on seeing green procedural puppets on the board: *"why is this silly goblin warrior
       * being generated from the castle all of a sudden? you screwed something up. we have changed
       * that a while ago"* and *"why is the castle generating the race spawn + this goblin we had
       * from like 15 sessions ago or more.... before we even generated the normal goblins."*
       *
       * ⛔ HE WAS LOOKING AT `drawGoblin`'S LOAD-FALLBACK, NOT AT A SPAWN BUG. Nothing emits a
       * legacy goblin near a castle: the castle emits `raceUnit` only (`raceUnitEmit.ts`) and the
       * tier-3 tower emits `RACE_TOWER_UNIT[race]`. But a type whose sheet has not RESOLVED YET
       * draws through the green procedural puppet — the pre-veo look, which is exactly "the goblin we
       * had before we even generated the normal goblins". The fallback is deliberate and stays
       * (visible-and-wrong beats invisible, per `goblinRenderer.coverage.test.ts`); what was wrong
       * was how long the window lasted.
       *
       * ⛔ MEASURED: this loop fetched **50.53 MiB across 18 sheets** on first sync — 8.18 MiB of
       * goblins, 10.34 MiB of tier-3 units and **32.02 MiB of tier-9 bosses**. A seat has ONE race
       * (R110), so at most one tier-3 sheet and one boss sheet can ever be drawn, and the one the
       * player actually needs was queued behind up to sixteen it never will. Every unit emitted
       * inside that window is a green puppet.
       *
       * ⭐ THIS IS THE PRECEDENT ALREADY IN THIS FILE, APPLIED TO THE TWO TABLES THAT MISSED IT.
       * `ensureRaceAtlas` went lazy-per-race in S165 for this exact arithmetic ("loading all six
       * eagerly would spend ~31 MB of texture memory on races nobody is playing"). The tier-3 and
       * tier-9 sheets are the same shape of asset and were left in the eager table.
       *
       * Race-keyed sheets now load two ways instead: `preloadRaceKit` warms the races actually
       * seated, at match start, during the 90 s BUILD — the `ensureNonetOverlay()` idiom, which
       * exists so a lazy chunk is never fetched at the moment it is needed — and `ensureTypeAtlas`
       * in the draw loop is the safety net for anything that appears unannounced.
       */
      if (!EAGER_ATLAS_TYPES.has(type)) continue;
      // ⚠ S169 CORRECTION — LATCH THE EAGER ONES TOO. Without this, `ensureTypeAtlas` (called per
      // drawn creature in `sync`) finds `typeLoadStarted` empty for a goblin type and loads the sheet
      // a SECOND time: a duplicate manifest fetch and a second construction of every frame Texture
      // for all six. The PNG came from Pixi's cache so nothing failed and nothing grew — which is
      // exactly why it needed finding rather than waiting to be noticed.
      this.typeLoadStarted.add(type);
      this.loadAtlas(type, base);
    }
  }

  /**
   * ⭐ S169 — load ONE type's sheet on demand. Idempotent; cheap enough for the draw loop (a Set
   * probe). The safety net behind `preloadRaceKit`, and the reason a race-keyed sheet going lazy
   * cannot make a unit permanently green.
   */
  private ensureTypeAtlas(type: CreatureType): void {
    if (this.typeLoadStarted.has(type)) return;
    const base = ATLASES[type];
    if (base === undefined) return; // genuinely puppet-backed — nothing to fetch
    this.typeLoadStarted.add(type);
    this.loadAtlas(type, base);
  }

  /**
   * ⭐⭐ S169 — WARM EVERY SHEET ONE SEATED RACE CAN PRODUCE, BEFORE IT PRODUCES ANYTHING.
   *
   * Called at match start for each seat's race, so the fetch happens during BUILD rather than at the
   * instant the first unit, tier-3 unit or boss appears. That is the whole fix for the owner's green
   * puppets: the sheets are already resolved by the time anything is drawn.
   *
   * ⚠ THE THREE SHEETS ARE THE COMPLETE PER-RACE SET, and naming them here rather than deriving them
   * is deliberate — `raceUnit` is keyed `raceUnit:<race>` while the other two are keyed by TYPE, so
   * there is no single table to loop. If a fourth race-keyed atlas family is ever added, it must be
   * added here or it inherits the puppet window this method exists to close.
   */
  preloadRaceKit(race: RaceId): void {
    this.ensureRaceAtlas(race);
    this.ensureTypeAtlas(RACE_TOWER_UNIT[race]);
    this.ensureTypeAtlas(T9_BOSS_TYPE[race]);
  }

  /**
   * ⭐ S165 W1-C — LAZY, AND PER RACE. Deliberately NOT folded into `ensureAtlases`.
   *
   * `ensureAtlases` loads every entry in `ATLASES` unconditionally on first sync. The six race-unit
   * sheets are 8.55 MiB on disk and roughly 46.9 MB decoded, and a 1v1 match needs TWO of them — so
   * loading all six eagerly would spend ~31 MB of texture memory on races nobody is playing, a
   * quarter of it on a `die` row nothing plays yet. `gathererRenderer` already refused exactly this
   * and went lazy per race; this follows that precedent rather than re-litigating it.
   *
   * Called on demand from `sync` the first time a unit of that race is actually on the board.
   */
  private ensureRaceAtlas(race: RaceId): void {
    if (this.raceLoadStarted.has(race)) return;
    this.raceLoadStarted.add(race);
    this.loadAtlas(`raceUnit:${race}`, RACE_UNIT_ATLAS_BASE(race));
  }

  /**
   * Fetch one atlas pair and slice it into per-state texture rows under `key`.
   *
   * ⚠ THE FAILURE ARM IS SILENT ON PURPOSE, and that is a real trade rather than sloppiness: a peer
   * whose fetch fails keeps the creature VISIBLE through the procedural puppet instead of blanking
   * it. The cost is that a genuinely broken atlas also ships invisibly, which is why
   * `raceUnitFrames.test.ts` exists to catch that on disk before it ever reaches a browser.
   */
  private loadAtlas(key: string, base: string): void {
    void (async () => {
      try {
        const manifest = (await (await fetch(`${base}-anim.json`)).json()) as AtlasManifest;
        const tex = (await Assets.load(`${base}-atlas.png`)) as Texture;
        const cells: Record<string, Texture[]> = {};
        for (const [name, st] of Object.entries(manifest.states)) {
          const arr: Texture[] = [];
          for (let i = 0; i < st.frames; i++) {
            arr.push(new Texture({
              source: tex.source,
              frame: new Rectangle(
                i * manifest.cellW, st.row * manifest.cellH, manifest.cellW, manifest.cellH,
              ),
            }));
          }
          cells[name] = arr;
        }
        this.atlases.set(key, { cells, manifest });
      } catch {
        // Deliberately silent: the procedural puppet keeps this kind visible and playable.
      }
    })();
  }

  /**
   * Which atlas a creature draws from.
   *
   * ⭐ A goblin is keyed by its TYPE; a race unit by its OWNER'S RACE. One `raceUnit` CreatureType
   * covers all six races (R94/R117 make them stat-identical, so the race is purely cosmetic), and
   * `player.raceId` has been on the wire since PROTOCOL 39 — so this needs no new synced field.
   *
   * ⚠ Falls back to the seat's default race when the player record or the id is missing, which is
   * the same rule `save.ts` applies when rehydrating a roster. A mirror that is briefly missing a
   * player must draw SOMETHING rather than drop the unit.
   */
  private atlasKeyFor(world: World, type: CreatureType, ownerSeat: number): string {
    if (type !== 'raceUnit') return type;
    const owner = world.players.get(ownerSeat as never);
    const raw = owner?.raceId;
    const race: RaceId = isRaceId(raw) ? raw : defaultRaceForSeat(ownerSeat);
    this.ensureRaceAtlas(race);
    return `raceUnit:${race}`;
  }

  /**
   * Place + frame one goblin's veo sprite from SYNCED state only.
   *
   * ⚠ THE FRAME INDEX MUST COME FROM `ticksInState`, NEVER FROM WALL-CLOCK. Two peers watching the
   * same goblin have the same synced state and tick, so they show the same frame; a
   * `performance.now()` index would drift them apart and make the swing land at visibly different
   * moments on each screen. (Cosmetic idle bob in the puppet path is allowed to differ — it drives
   * nothing.)
   */
  private syncSprite(
    id: CreatureId, type: CreatureType, atlas: LoadedAtlas, state: string, ticksInState: number,
    x: number, y: number, face: 1 | -1, alpha: number, tint: number,
  ): void {
    // FSM state → animation row. SEEKING is the only state a goblin actually travels in, so it is
    // the walk; SPAWNING and DESPAWNING read as idle rather than getting their own art.
    const name = state === 'ATTACKING' ? 'attack' : state === 'SEEKING' ? 'walk' : 'idle';
    const row = atlas.cells[name] ?? atlas.cells.idle;
    if (row === undefined || row.length === 0) return;
    const st = atlas.manifest.states[name] ?? atlas.manifest.states.idle;
    const per = Math.max(1, st?.ticksPerFrame ?? 6);
    // Attack plays ONCE through and holds its last frame; idle and walk loop. A looping attack
    // would re-swing during the recovery half of the cadence and read as two hits for one strike.
    const raw = Math.floor(ticksInState / per);
    const i = name === 'attack' ? Math.min(row.length - 1, raw) : raw % row.length;

    let sp = this.sprites.get(id);
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(atlas.manifest.footAnchor.x, atlas.manifest.footAnchor.y);
      this.spriteLayer.addChild(sp);
      this.sprites.set(id, sp);
    }
    this.spriteAtlas.set(id, atlas);
    sp.texture = row[i]!;
    sp.position.set(x, y);
    // Negative X scale mirrors the sprite for facing — the source clips all walk to the right.
    /*
     * ⭐ S167 — the per-type multiplier. `1` for every unit shipped before the bosses, so this line
     * is byte-identical in behaviour for all sixteen of them; see `creatureSpriteScaleMul`.
     */
    const mul = creatureSpriteScaleMul(type);
    sp.scale.set(face * GOBLIN_SPRITE_BASE_SCALE * mul, GOBLIN_SPRITE_BASE_SCALE * mul);
    sp.alpha = alpha;
    /*
     * ⛔ S152 P3 — THE OWNER TINT WAS DESTROYING THE ART, AND IT SHIPPED THAT WAY IN S151.
     *
     * This line used to read `sp.tint = tint` with a comment promising a "faint" flag that was
     * "kept subtle". A Pixi tint is a MULTIPLY, and PLAYER_COLORS are fully saturated — so an
     * olive-green, brown-leather goblin multiplied by seat 0's crimson came out very nearly BLACK.
     * Photographed in a live match: the shield goblin and the sapper were unreadable dark-red
     * smudges. The comment described the intent; the code did the opposite.
     *
     * ⭐ SO THE COLOUR IS LIFTED TOWARDS WHITE BEFORE IT MULTIPLIES. A near-white wash barely
     * darkens anything, which is what a "flag" was always supposed to be: seat 0's goblin reads
     * faintly warm and seat 2's faintly cool, while both stay the character the owner drew.
     *
     * ⚠ THIS ALSO REPAIRS THE TWO SHIPPED GOBLINS (melee, archer) — they were tinted by the same
     * line, so they have looked like this since S151.
     */
    sp.tint = washTowardsWhite(tint, TINT_WASH);
  }

  /**
   * The `die` row for the atlas a now-dead creature was using, or `null` if it has none.
   *
   * ⚠ `null` IS A NORMAL ANSWER, NOT A FAILURE. The six goblins were authored before the `die` row
   * existed, so they have no fourth row and simply vanish as they always did. Demanding one from
   * every atlas would mean re-generating art that is otherwise fine.
   */
  private dyingRowFor(id: CreatureId): readonly Texture[] | null {
    const atlas = this.spriteAtlas.get(id);
    this.spriteAtlas.delete(id);
    if (atlas === undefined) return null;
    const row = atlas.cells['die'];
    return row !== undefined && row.length > 0 ? row : null;
  }

  /**
   * ⭐⭐ S169 (owner R152) — **"SEEING STARS", DERIVED PER FRAME FROM SYNCED STATE.**
   *
   * Owner: *"maybe there is like a cool stunned 'seeing stars' effect above the stunned creatures
   * heads? it has to be consistent and coherent obviously."*
   *
   * ⛔ DERIVED, NOT PUSHED, AND THAT IS THE ONE DECISION THAT MATTERED HERE. The obvious build is a
   * `GameEffect` pushed when the stun lands — and it would be invisible ~5/6 of the time, because
   * `world.effects` is sampled into snapshots at 10 Hz while the renderer wipes the array every
   * frame at 60. This codebase has that failure written down in three places. Because
   * `stunnedUntilTick` is synced state, the renderer can instead ask *"is this creature stunned right
   * now"* on every frame and draw — so the stars appear for the whole stun, on BOTH peers, and cost
   * no new `GameEffect` kind (which would have meant four exhaustive switches and a protocol bump).
   *
   * ⚠ ORBIT PHASE COMES FROM `world.tick` AND THE CREATURE ID — never `performance.now()`. Not for
   * determinism (this is pure decoration and drives nothing) but for COHERENCE, which is his word:
   * two players watching the same stunned unit see the stars in the same place, and a crowd of
   * stunned units does not pulse in lockstep because the id offsets them.
   */
  /** Release a sprite when a kind falls back to the puppet, so the two can never both draw. */
  private dropSprite(id: CreatureId): void {
    const sp = this.sprites.get(id);
    if (sp !== undefined) { sp.destroy(); this.sprites.delete(id); }
    // S167 — and its atlas note, or the map grows for the life of the match.
    this.spriteAtlas.delete(id);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    /*
     * ⭐⭐ S170 P5 — BOSS GROUND AURAS FIRST, so they sit UNDER every unit drawn below. Owner:
     * *"I didn't see that they have, like, cool generated videos or effects."*
     *
     * Drawn into THIS renderer's existing Graphics rather than a new display object, deliberately: a
     * new child of `fogHiddenLayer` would shift its indices and break `tower-art.spec.ts`'s two
     * hardcoded probes, which have already moved three times this session. Order inside one Graphics
     * is call order, so drawing here puts the auras beneath the puppets, and the atlas `spriteLayer`
     * is a separate container above this one — so they land under the real sprites too.
     *
     * ⚠ It walks `world.creatures` itself instead of riding the loop below, because that loop is
     * gated on `GOBLIN_KINDS` and on an atlas being READY. An aura that waited for its boss's sheet
     * to decode would flicker on for the first seconds of every fight.
     */
    drawBossAuras(g, world);
    /*
     * ⭐ S171 (owner R142/R171-I) — the Pharaoh's locust clouds, into this SAME Graphics for the same
     * reason as the auras above: a new child of `fogHiddenLayer` shifts its indices. Drawn after the
     * auras so a swarm passing over a rot aura sits on top of it, and still beneath the sprite layer.
     */
    drawLocustClouds(g, world);
    // R84 — derived from synced FSM state every frame, never from a one-shot effect push
    // (which the 10 Hz snapshot drops ~5/6 of the time). See creatureProjectile.ts (renamed from archerArrow.ts in S154 P2, when the bat rider gained a harpoon).
    syncCreatureProjectiles(this.arrowLayer, world);
    /*
     * ⭐ S171 (owner R171-E) — health bars, into the ARROW LAYER and strictly AFTER the projectile
     * sync. Two reasons, both load-bearing:
     *   · `syncCreatureProjectiles` opens with `g.clear()`, so anything drawn before it is erased;
     *   · `arrowLayer` sits ABOVE the sprite layer, which is where a bar has to be — the Graphics
     *     used by the auras below is UNDER the sprites, so a bar drawn there would vanish behind
     *     every boss it is most needed on.
     * No new display object either way, so `fogHiddenLayer`'s child indices are untouched.
     */
    drawHealthBars(this.arrowLayer, world);
    this.ensureAtlases();
    const nowSec = performance.now() / 1000;
    const live = new Set<CreatureId>();

    for (const c of world.creatures.values()) {
      if (!GOBLIN_KINDS.has(c.type)) continue;
      // ⭐ S170 — FOG: an enemy's is simply NOT DRAWN unless it is in live vision. The C&C model;
      // see render/concealment.ts. Own entities are never concealed.
      if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) { this.dropSprite(c.id); continue; }
      live.add(c.id);

      // Facing from actual movement, with a dead-zone so a jittering idle unit does not flip-flop.
      const prev = this.lastSeenPos.get(c.id);
      let face = this.facing.get(c.id) ?? 1;
      if (prev !== undefined) {
        const dx = c.pos.x - prev.x;
        if (dx > 0.25) face = 1;
        else if (dx < -0.25) face = -1;
      }
      this.facing.set(c.id, face);
      this.lastSeenPos.set(c.id, { x: c.pos.x, y: c.pos.y });

      const owner = world.players.get(c.ownerPlayerId);
      const tint =
        owner?.color ?? PLAYER_COLORS[c.ownerPlayerId as unknown as number] ?? PLAYER_COLORS[0]!;

      /*
       * SPAWNING materialize: fade in over the config window so a granted goblin does not pop.
       *
       * ⛔ S152 P3 — THE FLOOR IS NOT COSMETIC. IT FIXED AN INVISIBLE UNIT.
       *
       * `hostTick` gates the ENTIRE creature loop on `matchPhase === 'FIGHT'` (hostTick.ts:447), so
       * a creature born during BUILD never ticks and `ticksInState` stays 0 — which made this
       * expression exactly 0, i.e. FULLY TRANSPARENT. And FEED_TOWER is only reachable during
       * BUILD, because the structure popover that carries the button is BUILD-only by R19. So the
       * ONLY way to use the goblin tower spent a shape from the bank and appeared to produce
       * nothing at all, for up to a minute and a half.
       *
       * ⚠ FOUND BY LOOKING, NOT BY TESTING. Every unit test passed, the e2e feed spec passed (it
       * asserts the creature EXISTS and the bank was debited — both true), and the creature was in
       * `world.creatures` the whole time. It took a screenshot with nothing on it. This is the S139
       * finding again: an unrendered creature simulates, walks, strikes, kills and dies with
       * nothing drawn.
       *
       * The floor states the truth rather than hiding it: a fed goblin is VISIBLE but ghosted while
       * it is still inert, and solidifies as it materialises once FIGHT begins.
       *
       * ⚠ WHETHER FEEDING DURING BUILD SHOULD QUEUE UNITS AT ALL IS AN OWNER QUESTION, flagged
       * rather than decided here. This makes the current behaviour legible; it does not rule on it.
       */
      const cfg = getCreatureConfig(c.type);
      /*
       * ⭐ S154 P4 (owner A3) — DORMANT ARMIES ARE DRAWN HALF-TRANSPARENT: *"stay near their tower as
       * if they were just built (like halfway transparent)"*.
       *
       * DERIVED, not sent. `matchPhase` already rides the wire (the HUD clock reads it), so both
       * peers reach the same answer with no new field, no hashed state and no protocol bump — the
       * same derive-don't-send channel `creatureProjectile` and `chewerRenderer` use, and chosen for
       * the same reason.
       *
       * ⚠ IT IS ALSO HONEST RATHER THAN DECORATIVE. Creatures are genuinely inert during BUILD (the
       * whole fan-out is gated on FIGHT), so "not active yet" is exactly what the picture should say
       * — the same meaning `SPAWN_ALPHA_FLOOR` carries for a unit that has not finished
       * materialising.
       *
       * ⚠ AND IT IS A HELD VALUE, NOT A REUSED SPAWN RAMP. The tempting shortcut is to push
       * retreating units back into SPAWNING and let the existing lerp do the work; GEMINI flagged
       * the trap and it is right — that ramp climbs 0→1 over `spawnTicks`, so they would fade IN to
       * fully opaque within half a second instead of staying half-there.
       */
      const dormant = world.matchPhase !== 'FIGHT';
      const alpha =
        c.state === 'SPAWNING'
          ? SPAWN_ALPHA_FLOOR +
            (1 - SPAWN_ALPHA_FLOOR) * Math.min(1, c.ticksInState / Math.max(1, cfg.spawnTicks))
          : dormant
            ? DORMANT_ALPHA
            : 1;

      // S169 — safety net for a race-keyed sheet that appeared without a preload (a joiner whose
      // roster arrived late, a race added mid-match by the rainbow shuffle). Idempotent Set probe.
      this.ensureTypeAtlas(c.type);
      const atlas = this.atlases.get(
        this.atlasKeyFor(world, c.type, c.ownerPlayerId as unknown as number),
      );
      if (atlas !== undefined) {
        // S152 P3 — the flyer's picture rides above its position; see GOBLIN_LIFT.
        const lift = GOBLIN_LIFT[c.type] ?? 0;
        /*
         * ⭐ S154 P2 (owner R92) — A GROUND MARKER UNDER A FLYER, so the altitude reads as FLIGHT.
         *
         * S152 P3 lifted the bat rider's picture 34 px and left it at that, which is ambiguous: an
         * unanchored sprite hovering above the board reads just as easily as a drawing offset — a
         * character mounted slightly too high — as it does as a flyer. What tells a viewer something
         * is IN THE AIR is the gap between it and a mark on the ground beneath it.
         *
         * It sits at the creature's REAL `pos`, which is also where its hitbox, its targeting and
         * every range check are — so it does double duty: it tells the player where the unit
         * actually IS, which now matters, because the bat fights from 150 px and the thing you see
         * is 34 px from the thing you can hit.
         *
         * ⛔ AND IT IS A TINTED RING, NOT A BLACK SHADOW — because a black shadow here was a
         * MEASURED NO-OP. The first cut drew `0x000000` at alpha 0.22, the obvious thing. A pixel
         * sample of the running game then showed the board background is **pure black (0,0,0)**:
         * black over black composites to black, so those pixels were provably identical with and
         * without the feature. That is the same class of defect as S153 P5c's speed ladder — a
         * change that cannot possibly have an effect, shipped and reported as done — and the only
         * reason it did not ship again is that the altitude was checked with `extract.canvas` rather
         * than by looking at the code. Drawn in the OWNER TINT instead: visible on black, still
         * subtle over a lit structure, and it doubles as a seat cue.
         *
         * Drawn only for LIFTED kinds. A grounded goblin stands on its own mark; the procedural
         * puppet has always drawn its own ellipse (see `drawGoblin`).
         */
        // ⭐ S154 AMENDMENT B — EVERY goblin gets one, not just the flyer. The owner asked for the
        // marker in the OWNER'S colour on all spawned creatures so a crowded board reads at a glance.
        // A lifted kind additionally gets the ring, because for a flyer the marker is also the only
        // thing saying where the hittable unit actually is, 34 px below its picture.
        drawGroundMarker(g, c.pos.x, c.pos.y, tint, alpha);
        if (lift > 0) {
          g.ellipse(c.pos.x, c.pos.y, GROUND_RX, GROUND_RY).stroke({
            width: 1,
            color: tint,
            alpha: 0.55 * alpha,
          });
        }
        /*
         * ⭐⭐ S169 (owner R152) — **STUCK ON IDLE, AND IT COSTS ONE ARGUMENT.**
         *
         * Owner: *"STUN where the player is stuck on idle and cant do anything"*.
         *
         * ⭐ `syncSprite`'s mapping is `ATTACKING -> attack : SEEKING -> walk : else idle`, so
         * handing it ANY state that is neither of those already yields the idle row. Passing a
         * sentinel is therefore the whole change — no new row, no new mapping arm, and no fifth
         * `CreatureState` (which R152 forbids, because that is a serialized wire discriminant).
         *
         * ⚠ AND IT IS NOT MERELY COSMETIC: without this a creature stunned mid-SEEKING would keep
         * playing the WALK cycle on the spot — marching in place while frozen, which reads as a
         * rendering bug rather than as a stun. The frame index also holds still on its own, because
         * the FSM gate stops `ticksInState` advancing.
         */
        const stunnedNow = isStunned(c, world.tick);
        this.syncSprite(c.id, c.type, atlas, stunnedNow ? 'STUNNED' : c.state, c.ticksInState, c.pos.x, c.pos.y - lift, face, alpha, tint);
        // ⭐ S170 P5 — scaled by the sprite multiplier, or the ring sits inside a boss.
        if (stunnedNow) drawStunStars(g, c.pos.x, c.pos.y - lift, world.tick, Number(c.id), alpha, creatureSpriteScaleMul(c.type));
      } else {
        // Procedural puppet — the instant first-paint and atlas-load-fail fallback (the Helga and
        // Voltkin precedent).
        // ⚠ S165 — this line used to end "and still the only art for the four kinds landing next
        // session". Those four landed in S153 P7; ALL SIX goblin kinds are atlas-backed today, and
        // so is the race unit. The puppet is now purely a load-failure fallback.
        this.dropSprite(c.id);
        this.drawGoblin(g, c.pos.x, c.pos.y, face, alpha, tint, this.swing(c.state, c.ticksInState), nowSec, c.id);
        // S169 R152 — the puppet fallback gets the stars too. A stunned unit whose atlas failed to
        // load must still READ as stunned, or the condition looks broken on exactly the peer that
        // is already having a bad time.
        // The puppet is drawn unscaled, so the stars are too — scaleMul defaults to 1.
        if (isStunned(c, world.tick)) drawStunStars(g, c.pos.x, c.pos.y, world.tick, Number(c.id), alpha);
      }
      // ⭐ S171 (owner R171-E) — the per-HP pips that used to draw here are GONE, replaced by
      // `render/healthBar.ts`, which draws for EVERY creature (these pips reached 20 of 23
      // types), stays visible at FULL health (they hid, which was his actual complaint) and
      // scales to the sprite (they were goblin-tuned, so on a boss they sat inside its chest).
    }

    // Sprites for goblins that died this frame must go with them, or they freeze mid-swing forever.
    /*
     * ⭐⭐ S167 — **A UNIT THAT DIES NOW FALLS DOWN**, instead of blinking out of existence.
     *
     * ## ⛔ THE ART THIS UNLOCKS HAD BEEN UNREACHABLE BY CONSTRUCTION
     *
     * Every atlas in this game carries a fourth row — `die`, twelve frames, generated for the six
     * tier-3 units in S165 and the six bosses in S167. **No code path could ever request it.**
     * `syncSprite` maps the FSM to `attack | walk | idle` and nothing else, so row 3 was baked,
     * matted, size-checked and never once drawn. Twenty-four death animations, invisible.
     *
     * ## ⛔ AND THE SIM CANNOT BE THE ONE TO FIX IT
     *
     * The tempting fix is to route death through the existing `DESPAWNING` state and delete after
     * `despawningTicks`. That is a SIM change on the death path, and it is genuinely dangerous:
     * `damageCreature` deletes immediately (or defers to a same-tick sweep) precisely so that
     * *"nothing reads a 0-ehp creature in between"*. A corpse left in `world.creatures` is a corpse
     * that occupies population caps, that acquisition scans can still target, and that every
     * determinism gate must now agree about. The whole point of the instant delete is that it has
     * no half-state.
     *
     * ## ⭐ SO THE CORPSE IS A RENDERER OBJECT, EXACTLY LIKE THE TOWER CRUMBLE
     *
     * When a creature leaves `world.creatures`, its sprite is not destroyed — it is handed to a
     * short client-local death animation at the position it fell, playing the `die` row once and
     * fading. Both peers see the removal (it is synced state) so both play it; they may start one
     * snapshot apart, which is invisible and cannot desync anything **because nothing reads it**.
     * No new field, no protocol bump, no sim risk, and the same mechanism `towerRenderer` already
     * ships for the boss tower's collapse.
     *
     * ⚠ FRAMES, NOT TICKS — the creature is gone from the sim, so there is no `ticksInState` left to
     * drive it. A renderer-local clock is the established idiom here for exactly this case.
     *
     * ⚠ A UNIT WITH NO `die` ROW SIMPLY VANISHES, as it always did. The goblins were authored before
     * the row existed; this adds a death for whoever has one rather than demanding one from everyone.
     */
    for (const [id, sp] of [...this.sprites]) {
      if (live.has(id)) continue;
      this.sprites.delete(id);
      const dieRow = this.dyingRowFor(id);
      if (dieRow === null) { sp.destroy(); continue; }
      sp.texture = dieRow[0]!;
      this.dying.push({ sprite: sp, frames: dieRow, elapsed: 0 });
    }

    // Advance every corpse by one render frame, then retire it.
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]!;
      d.elapsed++;
      // Plays ONCE and holds the last frame — a looping death would have the unit die repeatedly.
      const idx = Math.min(d.frames.length - 1, Math.floor(d.elapsed / CORPSE_TICKS_PER_FRAME));
      d.sprite.texture = d.frames[idx]!;
      d.sprite.alpha = d.elapsed < CORPSE_FRAMES * 0.7
        ? 1
        : Math.max(0, 1 - (d.elapsed - CORPSE_FRAMES * 0.7) / (CORPSE_FRAMES * 0.3));
      if (d.elapsed >= CORPSE_FRAMES) {
        d.sprite.destroy();
        this.dying.splice(i, 1);
      }
    }

    // Drop bookkeeping for goblins that died, so the Maps cannot grow without bound across a match.
    for (const id of [...this.lastSeenPos.keys()]) {
      if (!live.has(id)) {
        this.lastSeenPos.delete(id);
        this.facing.delete(id);
      }
    }
  }

  /**
   * Arm angle in radians, driven entirely by the SYNCED FSM. Reads as: wind the cleaver back through
   * the first half of the cycle, snap it through the target at the fire tick, then drift back to rest.
   * `attackFireTick` is read from config rather than hardcoded so retuning the cadence cannot desync
   * the animation from the actual hit.
   */
  private swing(state: string, ticksInState: number): number {
    if (state !== 'ATTACKING') return -0.35; // rest, cleaver low
    const fire = getCreatureConfig('goblinMelee').attackFireTick;
    if (ticksInState <= fire) {
      const t = ticksInState / Math.max(1, fire); // 0 → 1 windup
      return -0.35 - t * 1.5; // rotate back and up
    }
    const t = Math.min(1, (ticksInState - fire) / Math.max(1, fire)); // 0 → 1 recovery
    return 1.5 - t * 1.85; // snapped through, easing back to rest
  }

  private drawGoblin(
    g: Graphics,
    x: number,
    y: number,
    face: 1 | -1,
    alpha: number,
    tint: number,
    swing: number,
    nowSec: number,
    id: CreatureId,
  ): void {
    // Cosmetic-only idle bob. Phase-offset per id so a cluster of goblins does not pulse in lockstep.
    const bob = Math.sin(nowSec * 4 + (id as unknown as number)) * 0.6;
    const cy = y + bob;

    g.ellipse(x, y + BODY_R + 3, BODY_R * 0.85, 2.6).fill({ color: 0x000000, alpha: 0.18 * alpha });

    // Legs
    g.moveTo(x - 2.5, cy + BODY_R - 1).lineTo(x - 3.5, cy + BODY_R + 3.5)
      .stroke({ color: OUTLINE, width: 1.8, alpha });
    g.moveTo(x + 2.5, cy + BODY_R - 1).lineTo(x + 3.5, cy + BODY_R + 3.5)
      .stroke({ color: OUTLINE, width: 1.8, alpha });

    // Body + owner sash (the only tinted element — whose goblin this is must be readable at a glance)
    g.circle(x, cy, BODY_R).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1.6, alpha });
    g.circle(x + face * 1.6, cy + 1.6, BODY_R * 0.55).fill({ color: SKIN_SHADE, alpha: 0.5 * alpha });
    g.moveTo(x - BODY_R * 0.8, cy + 1).lineTo(x + BODY_R * 0.8, cy + 3)
      .stroke({ color: tint, width: 2.2, alpha });
    g.ellipse(x, cy + BODY_R * 0.75, 2.6, 1.8).fill({ color: LOIN, alpha: 0.9 * alpha });

    // Head: pointed ears + one big eye, offset toward the facing direction
    const hx = x + face * 1.2;
    const hy = cy - BODY_R * 0.9;
    g.circle(hx, hy, BODY_R * 0.62).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1.4, alpha });
    for (const s of [-1, 1] as const) {
      g.poly([
        hx + s * 3.2, hy - 0.6,
        hx + s * 7.0, hy - 3.4,
        hx + s * 3.4, hy + 1.8,
      ]).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1, alpha });
    }
    g.circle(hx + face * 1.5, hy - 0.3, 1.5).fill({ color: EYE, alpha });
    g.circle(hx + face * 1.9, hy - 0.3, 0.7).fill({ color: OUTLINE, alpha });

    // Arm + cleaver, rotated by the swing. Kept as one rigid unit: the S137 art spike found veo
    // repeatedly detaching the blade mid-swing, and the owner ruling is that a melee unit never
    // releases its weapon — trivially guaranteed here because the blade is drawn FROM the hand.
    const shoulderX = x + face * 2.2;
    const shoulderY = cy - 1.5;
    const a = swing * face;
    const handX = shoulderX + Math.cos(a) * face * 7.5;
    const handY = shoulderY + Math.sin(a) * 7.5;
    g.moveTo(shoulderX, shoulderY).lineTo(handX, handY)
      .stroke({ color: SKIN_SHADE, width: 2.4, alpha });
    const tipX = handX + Math.cos(a - face * 0.5) * face * 8.5;
    const tipY = handY + Math.sin(a - face * 0.5) * 8.5;
    g.moveTo(handX, handY).lineTo(tipX, tipY).stroke({ color: BLADE, width: 3.4, alpha });
    g.moveTo(handX, handY).lineTo(tipX, tipY)
      .stroke({ color: BLADE_EDGE, width: 1.2, alpha: 0.9 * alpha });
  }

  /**
   * Match teardown / title return.
   *
   * ⛔ S167 — THE SPRITES AND THE CORPSES ARE DESTROYED HERE NOW, AND OMITTING THEM WOULD HAVE
   * SHIPPED A FIELD OF DYING GOBLINS ACROSS THE MAIN MENU.
   *
   * This used to clear only the Graphics, the arrow layer and two bookkeeping Maps. That was
   * survivable while a leftover atlas sprite simply waited to be retired on the next `sync` (where
   * `live` is empty, so every sprite is dropped). With client-local corpses that same path now hands
   * each one to a 1.5 s death animation instead — so returning to the title would play out an entire
   * army's deaths over the title screen.
   *
   * ⚠ THE SAME CLASS `towerRenderer.clear` GUARDS AGAINST, found the same way: any renderer that
   * gained a "keep it alive after the entity is gone" behaviour has to be re-checked against
   * teardown, because teardown is exactly when everything is gone at once.
   */
  clear(): void {
    this.graphics.clear();
    this.arrowLayer.clear();
    this.lastSeenPos.clear();
    this.facing.clear();
    for (const sp of this.sprites.values()) sp.destroy();
    this.sprites.clear();
    this.spriteAtlas.clear();
    for (const d of this.dying) d.sprite.destroy();
    this.dying.length = 0;
  }
}
