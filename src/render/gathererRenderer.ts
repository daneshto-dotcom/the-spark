/**
 * SPARK — V6-1.1 keep + gatherer renderer.
 *
 * ONE shared Graphics, cleared + redrawn each frame (mirrors HunterRenderer / BombRenderer).
 * Draws two things, both purely presentational:
 *
 *  1. THE PLACEHOLDER KEEP — a simple tinted box at each seated player's fixed castle anchor.
 *     It is deliberately NOT a world entity: no World field, no serializer, no hash surface, no
 *     wire cost. It exists so the buy affordance has a home on the board. The real castle (built
 *     from trophies carried over between matches, assembled in its own screen) is a separate,
 *     already-designed feature — see SPARK_v0.6_DESIGN.md §5. Every player's placeholder is
 *     identical apart from the seat tint (owner ruling 2026-08-09).
 *
 *  2. THE GATHERERS — each drawn as a SHAPESHIFTING SPARK in its owner's colour, continuously
 *     morphing through the six primitives. ⭐ The morph is a PURE FUNCTION of (tick, gathererId)
 *     evaluated HERE, at render time (owner ruling S134): it is purely cosmetic, so it must never
 *     become world state — no serialized field, no wire cost, and therefore it cannot desync.
 *     The cycle is deliberately SLOW (a shape every MORPH_TICKS ticks, ~1.2 s) — morphing at 60 Hz
 *     would strobe. The per-gatherer id offset keeps a cluster from pulsing in unison.
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  ALL_SPARK_TYPES,
  CASTLE_ATTACK_RANGE,
  KEEP_H,
  KEEP_W,
  PLAYER_COLORS,
  RAINBOW_FLYOVER_DURATION_TICKS,
  SparkType,
  CASTLE_MAX_HP,
} from '../constants.ts';
import { bankOf } from '../state/castleBank.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { ticksSinceCastleShot } from '../state/castleGuns.ts';
import { findNearestEnemyCreatureFrom } from '../state/creatures/creatureAI.ts';
import { defaultRaceForSeat, type RaceId } from '../state/races.ts';
import type { ZoneLayout } from '../state/zones.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import {
  CASTLE_ATLAS_BASE,
  CASTLE_SPRITE_ANCHOR,
  CASTLE_SPRITE_PX,
  CASTLE_STATE_ROWS,
  castleStateForHp,
  type CastleAtlasManifest,
  type CastleState,
} from './castleFrames.ts';
import {
  CASTLE_SHOT_VFX_TICKS,
  drawCastleShotVfx,
  drawRaceGathererMark,
  drawRaceKeepFallback,
} from './raceMotifs.ts';
import type { GathererId, PlayerId, SparkId } from '../types.ts';
import type { World } from '../state/world.ts';

/** Ticks each primitive is held before morphing to the next (~1.2 s at 60 Hz — never per-tick). */
const MORPH_TICKS = 72;
const GATHERER_RADIUS = 11;
// S136 P0 — KEEP_W / KEEP_H were promoted to constants.ts so the click target (isPointInKeep) and
// this drawing read the same numbers. Only the battlement height stays local: nothing outside this
// renderer has any use for it.
const KEEP_BATTLEMENT_H = 10;

/**
 * The cosmetic shape a gatherer is currently wearing. PURE — same (tick, id) always yields the
 * same shape on every machine, which is what lets this stay out of world state entirely.
 */
export function gathererMorphShape(tick: number, id: GathererId): SparkType {
  const phase = Math.floor(tick / MORPH_TICKS) + (id as unknown as number);
  return (((phase % 6) + 6) % 6) as SparkType;
}

/**
 * S136 P3 — THE RAINBOW MAKES THE CASTLE PARTY TOO (owner playtest item 6: "when there is the
 * rainbow it should change the castle color too!").
 *
 * ⚠ FINDING FIRST, so nobody re-fixes this later: the castle's HUE ALREADY FOLLOWED THE RAINBOW
 * before this change. `applyTriggerRainbow` remaps `player.color` through a derangement, and `sync`
 * tints the keep from the LIVE player value (the S135 audit made sure of that) — so the box genuinely
 * changed colour on every switch. What was MISSING is that the castle never PARTICIPATED in the
 * celebration: the flyover, the background wash and the yell all fired while the keep just quietly
 * became a different flat colour, which is easy to miss entirely.
 *
 * So this adds the celebration, not the recolour: for the flyover window the keep cycles the palette
 * and then settles on its new colour.
 *
 * ⚠ THE PER-SEAT OFFSET IS LOAD-BEARING, not decoration. Without it every keep on the board shows the
 * SAME hue on the same tick, so for four seconds you cannot tell your castle from an enemy's — the
 * exact ownership-legibility failure the S135 audit fixed in this file's `sync`. Offsetting by seat
 * keeps all seats distinct at every instant while still reading as a rainbow.
 *
 * PURE, and exported for tests: keyed only off (tick, switchTick, seat) — the shipped
 * rainbowFlyoverRenderer pattern. No RNG, no wall-clock, identical on host and on a 10 Hz client,
 * and never world state, so it costs nothing on the wire and cannot desync. Extracted rather than
 * left inline because a draw path cannot be driven in vitest (the S130 lesson).
 */
export function keepRainbowTint(
  tick: number,
  switchTick: number | undefined,
  seat: number,
  ownColor: number,
): number {
  if (switchTick === undefined) return ownColor;
  const age = tick - switchTick;
  if (age < 0 || age >= RAINBOW_FLYOVER_DURATION_TICKS) return ownColor;
  // ~6 palette steps/second: fast enough to read as "rainbow", slow enough not to strobe.
  const step = Math.floor(age / 10) + seat;
  return PLAYER_COLORS[((step % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;
}

/**
 * ⭐ S161 — THE RAINBOW TINT FOR A SPRITE, WHICH NEEDS A THIRD ANSWER `keepRainbowTint` CANNOT GIVE.
 *
 * `keepRainbowTint` returns the seat's OWN colour outside the celebration window, which is exactly
 * right for a procedural keep drawn in that colour. A castle SPRITE is different: outside the window
 * it must not be tinted AT ALL (the art is already painted in the race's colour — see
 * `syncCastleSprite`), so "no tint" and "your colour" are different instructions and the caller has
 * to be able to tell them apart. Returning `null` says "leave the art alone".
 *
 * ⚠ DERIVED FROM `keepRainbowTint`, NOT REIMPLEMENTED. Re-deriving the window boundary would give
 * two places for the eight seconds to be defined and one of them would eventually be wrong. The
 * sentinel below is safe because `keepRainbowTint` is documented to return `ownColor` unchanged
 * outside the window, and no palette entry can equal the sentinel.
 */
export function keepRainbowSpriteTint(
  tick: number,
  switchTick: number | undefined,
  seat: number,
): number | null {
  const SENTINEL = -1;
  const tinted = keepRainbowTint(tick, switchTick, seat, SENTINEL);
  return tinted === SENTINEL ? null : tinted;
}

const seatColor = (seat: number): number => PLAYER_COLORS[seat % PLAYER_COLORS.length]!;

/** One race's loaded atlas: exactly three textures, one per state, sliced out of the sheet. */
type CastleAtlas = Readonly<Record<CastleState, Texture>>;

export class GathererRenderer {
  private readonly graphics: Graphics;

  /*
   * ⭐ S161 W1-B — THE CASTLE SPRITE LAYER, and it is a SECOND child of the same parent rather than
   * something drawn into `graphics`.
   *
   * Pixi cannot put a `Sprite` inside a `Graphics`, so the keep art has to be its own display
   * object. This follows `StinkTowerRenderer` exactly — one `Graphics` plus one `Container`, both
   * parented to the layer the renderer was given — because that is the shipped shape for "procedural
   * rig with an atlas over it" in this codebase, and copying it means the two renderers can be read
   * against each other.
   *
   * ⚠ THE LAYER IS ADDED AFTER `graphics`, WHICH IS WHY THE HP BAR STILL SHOWS. Pixi draws children
   * in insertion order, so the sprite would paint OVER a bar drawn into `graphics`. It does not,
   * because the bar sits at `top - 7` — seven pixels ABOVE the keep box — and the sprite is anchored
   * to the box's FOOT and grows upward from there. They overlap only for a castle tall enough to
   * reach 7 px above its own box, which every race's art does. So the bar is drawn into a SECOND
   * Graphics on top of the sprite layer; see `overlay`.
   */
  private readonly spriteLayer: Container;
  /** Drawn ON TOP of the castle sprites: the HP bar, the bank glyphs, and the shot VFX. */
  private readonly overlay: Graphics;
  private readonly castleSprites: Map<number, Sprite> = new Map();
  /** Per-race atlas cache. A key present with `null` means "tried, failed — use the fallback". */
  private readonly atlases: Map<RaceId, CastleAtlas | null> = new Map();
  private readonly atlasLoadStarted: Set<RaceId> = new Set();

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.spriteLayer = new Container();
    parent.addChild(this.spriteLayer);
    this.overlay = new Graphics();
    parent.addChild(this.overlay);
  }

  /**
   * One-time lazy load per RACE, started only when a seat on the board actually wears it.
   *
   * ⛔ LAZY AND PER-RACE, NOT SIX EAGER LOADS. A 1v1 match uses two of the six atlases; loading all
   * six would pull ~1.4 MB of PNG for ~0.5 MB of use, on the frame the match starts. The
   * `atlasLoadStarted` guard is what keeps this from re-firing every frame — `sync` runs at 60 Hz
   * and the load is async, so without it a single match would queue hundreds of fetches before the
   * first one resolved. Same guard, same reason, as `StinkTowerRenderer.ensureAtlas`.
   *
   * On failure the entry is set to `null` and the race-shaped procedural keep keeps drawing. An
   * emplacement that draws nothing is worse than one that draws a placeholder.
   */
  private ensureCastleAtlas(raceId: RaceId): void {
    if (this.atlasLoadStarted.has(raceId)) return;
    this.atlasLoadStarted.add(raceId);
    const base = CASTLE_ATLAS_BASE[raceId];
    void (async () => {
      try {
        const manifest = (await (await fetch(`${base}-anim.json`)).json()) as CastleAtlasManifest;
        const sheet = (await Assets.load(`${base}-atlas.png`)) as Texture;
        const cut = (state: CastleState): Texture => {
          // The manifest is the authority on the row; CASTLE_STATE_ROWS is the fallback and the
          // contract. They are asserted equal in castleFrames.test.ts against the shipped files.
          const row = manifest.states[state]?.row ?? CASTLE_STATE_ROWS[state];
          return new Texture({
            source: sheet.source,
            frame: new Rectangle(0, row * manifest.cellH, manifest.cellW, manifest.cellH),
          });
        };
        this.atlases.set(raceId, {
          intact: cut('intact'),
          damaged: cut('damaged'),
          destroyed: cut('destroyed'),
        });
      } catch {
        this.atlases.set(raceId, null); // procedural race keep keeps the castle visible
      }
    })();
  }

  /**
   * Position, scale and frame one seat's castle sprite. Returns false when the atlas is not (yet)
   * available, which is the caller's signal to draw the procedural keep instead.
   *
   * ⛔ THE SPRITE IS **NOT** TINTED IN NORMAL PLAY, AND THE FIRST VERSION OF THIS FUNCTION WAS.
   *
   * S161 P1 generated the castles in neutral grey and multiplied them by the live `player.color`,
   * reasoning that the race would be the silhouette and the seat would be the tint. The owner played
   * it and rejected it — *"this looks like we took each castle and just completely filled them with
   * their one color - pretty lazy work"* — and that is arithmetically what it was. `Sprite.tint` is a
   * MULTIPLY: grey art has R=G=B=v, so the product is (v·r, v·g, v·b) and THE HUE IS CONSTANT ON
   * EVERY PIXEL. Only the value varied. No amount of detail in the source art could have survived it;
   * the flatness lived here, not in the prompt.
   *
   * The art is now drawn in each race's own colour with real materials, and this passes it through
   * untinted. Ownership still reads, because `Player.color` is DERIVED from `raceId` at construction
   * (W1-A) and `races.test.ts` pins `RACE_COLORS === PLAYER_COLORS` — race → colour is a bijection,
   * so a castle painted in its race's colour is painted in its owner's colour by construction.
   *
   * ⭐ THE ONE SURVIVING TINT IS THE RAINBOW, and it is deliberate. For those eight seconds
   * `keepRainbowSpriteTint` returns a cycling palette entry and the castle IS distorted — that is
   * the celebration (S136 P3, owner item 6), not an ownership signal, and a castle that sat the
   * party out was the original complaint that feature was written to fix.
   */
  private syncCastleSprite(
    seat: number,
    raceId: RaceId,
    layout: ZoneLayout,
    hpFrac: number,
    rainbowTint: number | null,
  ): boolean {
    this.ensureCastleAtlas(raceId);
    const atlas = this.atlases.get(raceId);
    if (atlas === undefined || atlas === null) return false;

    let sp = this.castleSprites.get(seat);
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(CASTLE_SPRITE_ANCHOR.x, CASTLE_SPRITE_ANCHOR.y);
      this.spriteLayer.addChild(sp);
      this.castleSprites.set(seat, sp);
    }
    sp.texture = atlas[castleStateForHp(hpFrac)];
    const { x, y } = castleAnchor(seat, layout);
    sp.x = x;
    // ⚠ The FOOT of the keep box, not its centre — see CASTLE_SPRITE_ANCHOR's docblock.
    sp.y = y + KEEP_H / 2;
    sp.width = CASTLE_SPRITE_PX;
    sp.height = CASTLE_SPRITE_PX;
    // ⛔ WHITE means "show the art as painted" — see the docblock. Only the rainbow tints.
    sp.tint = rainbowTint ?? 0xffffff;
    sp.visible = true;
    return true;
  }

  /** Clear + redraw the keeps and every gatherer. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    this.overlay.clear();
    if (world.gameState !== 'PLAYING') {
      // ⚠ SPRITES ARE RETAINED, NOT DESTROYED, and hidden instead. `graphics.clear()` is enough for
      // immediate-mode drawing but a Sprite persists until something says otherwise, so returning
      // early without this would leave six castles floating over the title screen — the exact class
      // of leak that made every other atlas renderer in this codebase carry a `clear()`.
      this.spriteLayer.visible = false;
      return;
    }
    this.spriteLayer.visible = true;
    /** Seats drawn this frame — anything left over is a seat that has gone (host migration, load). */
    const liveSeats = new Set<number>();

    // ⚠ TINT FROM THE LIVE PLAYER, NOT THE STATIC PALETTE. `applyTriggerRainbow` remaps every
    // player's `color` through a DERANGEMENT mid-match, so a seat-indexed lookup would draw your
    // keep and your units in a hue that now belongs to an opponent — they would read as enemy
    // property. Every other ownership surface (avatarRenderer) reads the live value for exactly
    // this reason. Caught by the S135 end-of-session audit.
    for (const [seat, player] of world.players) {
      // S136 P3 — during the rainbow window the keep cycles the palette instead of showing its flat
      // colour, so the castle joins the celebration (owner item 6). Its hue already followed the
      // derangement; see keepTint for why that was not enough.
      const keepColor = keepRainbowTint(
        world.tick,
        world.rainbowSwitchTick,
        seat as unknown as number,
        player.color,
      );
      // S154 AMENDMENT C — pass the castle's health so the keep can show its damage.
      // ⭐ S161 W1-B — and the RACE, so it can show whose castle it is.
      const seatN = seat as unknown as number;
      const hpFrac = player.castleHp / CASTLE_MAX_HP;
      liveSeats.add(seatN);
      const hasSprite = this.syncCastleSprite(
        seatN,
        player.raceId,
        world.layout,
        hpFrac,
        keepRainbowSpriteTint(world.tick, world.rainbowSwitchTick, seatN),
      );
      this.drawKeep(g, seatN, keepColor, world.layout, hpFrac, player.raceId, hasSprite);
      this.drawCastleShot(world, seat, player.raceId, keepColor);
      // S136 P1 — the shapes HELD INSIDE this castle, drawn in its doorway. Owner item 4 asked for
      // storage to live in the castle rather than on the ground beside it; without a mark on the
      // keep itself, "stored" would be invisible until the panel is opened, and a full bank (which
      // stalls your haulers) has to be readable at a glance from the board.
      // ⚠ ON THE OVERLAY, NOT `g` — the bank glyphs are drawn IN THE KEEP'S DOORWAY, and the castle
      // sprite now covers that doorway. Left on `g` they would be painted over and the castle's
      // inventory would silently stop being readable from the board.
      this.drawStoredShapes(
        this.overlay,
        seat as unknown as number,
        keepColor,
        bankOf(world.castleBanks, seat),
        world.layout,
      );
    }
    // A seat that is no longer in `world.players` (host migration, a load into a smaller match)
    // must not leave its castle standing. Hidden rather than destroyed: the same seat usually comes
    // straight back, and re-creating the Sprite would re-upload the texture binding for nothing.
    for (const [seat, sp] of this.castleSprites) {
      if (!liveSeats.has(seat)) sp.visible = false;
    }
    for (const gatherer of world.gatherers.values()) {
      const owner = world.players.get(gatherer.ownerPlayerId);
      const color = owner?.color ?? seatColor(gatherer.ownerPlayerId as unknown as number);
      // ⚠ FALL BACK TO THE SEAT'S DEFAULT RACE, never to a fixed one. A gatherer can outlive the
      // lookup for a frame during a host migration, and `defaultRaceForSeat` is the same derivation
      // `makeIdlePlayer` uses, so the mark it draws is the one that seat will have when the player
      // reappears — not a flicker to somebody else's race.
      const raceId =
        owner?.raceId ?? defaultRaceForSeat(gatherer.ownerPlayerId as unknown as number);
      this.drawGatherer(
        g,
        gatherer.pos.x,
        gatherer.pos.y,
        color,
        // While HAULING it wears its CARGO's real shape (you can see what is being brought home);
        // while seeking it cycles cosmetically. Both are render-time reads — never world state.
        this.carriedShape(world, gatherer) ?? gathererMorphShape(world.tick, gatherer.id),
        // S136 P1 — a WAITING unit is LOADED too (bank full, standing at the keep still holding its
        // shape), so it must wear the carrying look. Testing `!== 'SEEKING'` rather than adding
        // WAITING to a list means a future state is loaded-by-default, which is the safer direction:
        // a new carrying state that forgot to opt in would silently render as empty-handed.
        gatherer.state !== 'SEEKING',
        gatherer.preferredType,
        gatherer.state === 'WAITING',
        raceId,
      );
    }
  }

  /**
   * ⭐ S161 W1-B work item 4 — THE CASTLE'S SHOT, RE-DERIVED RATHER THAN RECEIVED.
   *
   * `castleGuns.ts` deliberately pushes nothing to `world.effects`: a one-shot effect is lost ~5/6
   * of the time because effects are sampled at 10 Hz and the renderer wipes them at 60. So the shot
   * is reconstructed here from state both peers already hold — the tick, the seat, and the same
   * total-ordered target acquisition the gun itself uses.
   *
   * ⛔ EVERY GATE BELOW MIRRORS ONE IN `castleGunsTick`, and that is the point: FIGHT-only, a fallen
   * castle does not shoot, and the target is `findNearestEnemyCreatureFrom` with the SAME range.
   * Drawing a shot the gun did not fire would be a cosmetic that lies about a mechanic.
   *
   * ⚠ THE TARGET IS RESOLVED AT RENDER TIME, SO IT IS THE *CURRENT* NEAREST ENEMY, NOT THE ONE THAT
   * WAS HIT. Over a 24-tick flight the real target may die or be overtaken, and the bolt will then
   * bend toward whoever is nearest now. That is accepted rather than fixed: pinning the original
   * target would mean storing it, which is the wire field this whole approach exists to avoid, and
   * the visual claim being made — "that castle is shooting into that crowd" — stays true either way.
   */
  private drawCastleShot(world: World, playerId: PlayerId, raceId: RaceId, color: number): void {
    if (world.matchPhase !== 'FIGHT') return;
    const player = world.players.get(playerId);
    if (player === undefined || player.castleHp <= 0) return;
    const seat = playerId as unknown as number;
    const age = ticksSinceCastleShot(seat, world.tick);
    if (age >= CASTLE_SHOT_VFX_TICKS) return;

    const from = castleAnchor(seat, world.layout);
    const targetId = findNearestEnemyCreatureFrom(
      world,
      from,
      playerId,
      CASTLE_ATTACK_RANGE * CASTLE_ATTACK_RANGE,
    );
    if (targetId === null) return;
    const target = world.creatures.get(targetId);
    if (target === undefined) return;

    drawCastleShotVfx(
      this.overlay,
      from.x,
      // Leaves from the top of the keep rather than its centre, so the bolt clears its own art.
      from.y - KEEP_H / 2,
      target.pos.x,
      target.pos.y,
      age / CASTLE_SHOT_VFX_TICKS,
      color,
      raceId,
    );
  }

  /** The real type of the shape this gatherer is carrying, or null when its hands are empty. */
  private carriedShape(world: World, gatherer: { carriedSparkId: SparkId | null }): SparkType | null {
    if (gatherer.carriedSparkId === null) return null;
    return world.freeSparks.get(gatherer.carriedSparkId)?.type ?? null;
  }

  /**
   * The keep's HP bar, plus — only when its race atlas has not loaded — a race-shaped procedural
   * castle at the seat's fixed anchor, tinted to the seat.
   *
   * ⭐ S161 W1-B — `hasSprite` SPLITS THIS IN TWO, and the split is why the bar is unconditional.
   * The bar is the DAMAGE MECHANIC'S legibility (S154 AMENDMENT C) and it has to be there whether
   * the castle is real art or a placeholder; the box beneath it is the placeholder itself, and
   * drawing it under the sprite would put a battlemented outline around every castle in the game.
   */
  private drawKeep(
    g: Graphics,
    seat: number,
    color: number,
    layout: ZoneLayout,
    hpFrac = 1,
    raceId: RaceId = defaultRaceForSeat(seat),
    hasSprite = false,
  ): void {
    const { x, y } = castleAnchor(seat, layout);
    const left = x - KEEP_W / 2;
    const top = y - KEEP_H / 2;

    /*
     * ⭐ S154 AMENDMENT C (owner A4 / R89) — THE CASTLE'S DAMAGE, ON THE CASTLE.
     *
     * The HP itself is simulation state and the win gate reads it, but a castle that can be destroyed
     * and shows no sign of it is an invisible feature — which is the failure mode this whole session
     * has been fixing. So the keep carries a bar: full width at CASTLE_MAX_HP, shrinking as it takes
     * damage, and it only appears ONCE DAMAGED so an untouched board looks exactly as it did.
     *
     * ⚠ RENDER-ONLY and derived from `player.castleHp`, which already rides the wire — no new field,
     * and both peers draw the same bar from the same number.
     *
     * The owner's race work will replace this with real per-race damaged/destroyed art (see the
     * CASTLE_BUILD_SPACE_DESIGN addendum). This is the placeholder that makes the mechanic legible in
     * the meantime, matching the keep box it sits on — which is itself described as a placeholder.
     */
    if (hpFrac < 1) {
      // ⚠ ON THE OVERLAY. A castle sprite stands up to CASTLE_SPRITE_PX above its own foot, which is
      // far higher than this bar sits, so a bar drawn into `g` would be hidden behind the very
      // castle whose health it reports.
      const bar = this.overlay;
      const barY = top - 7;
      bar.rect(left, barY, KEEP_W, 4).fill({ color: 0x000000, alpha: 0.55 });
      bar.rect(left, barY, KEEP_W * Math.max(0, hpFrac), 4).fill({
        // Green while healthy, amber past half, red in the last quarter — the reading a player needs
        // at a glance is "is that one nearly down?".
        // ⚠ THE 0.5 BOUNDARY IS SHARED WITH THE ART. `castleStateForHp` turns the castle to its
        // damaged sprite at exactly this number — see CASTLE_DAMAGED_BELOW, and the test that pins
        // the pair. Retuning one without the other makes the bar and the building disagree.
        color: hpFrac > 0.5 ? 0x6ee07a : hpFrac > 0.25 ? 0xffc14d : 0xff4d4d,
        alpha: 0.95,
      });
    }

    // ⭐ S161 W1-B — the real castle is a sprite now. Everything below is the load-failure rig.
    if (hasSprite) return;
    drawRaceKeepFallback(g, left, top, KEEP_W, KEEP_H, KEEP_BATTLEMENT_H, color, raceId);
  }

  /**
   * S136 P1 / S146 P2 — WHICH SHAPES this castle is holding, as a compact row of glyphs on the keep.
   *
   * ⭐ ONE GLYPH PER TYPE HELD, NOT ONE PER SHAPE. The inventory is limitless now, so a glyph-per-
   * shape row would grow without bound and overrun the art the moment a gatherer economy got going —
   * the old row was safe only because `CASTLE_BANK_CAP` bounded it at 7. At most six glyphs can ever
   * be drawn here, which is a constant, so the keep face can no longer overflow by construction.
   *
   * EXACT COUNTS DELIBERATELY LIVE IN THE PANEL, NOT HERE. This is a `Graphics` pass with no text
   * object, and the owner asked for the numbers in the castle inventory readout
   * (*"spiral x 6, square x 2"*). So the board answers "what have I got?" at a glance and the panel
   * answers "how many?" — the split the owner described, rather than cramming digits into 5 px.
   */
  private drawStoredShapes(
    g: Graphics,
    seat: number,
    color: number,
    counts: readonly number[],
    layout: ZoneLayout,
  ): void {
    const held: SparkType[] = [];
    for (const t of ALL_SPARK_TYPES) {
      if ((counts[t as number] ?? 0) > 0) held.push(t);
    }
    if (held.length === 0) return;
    const { x, y } = castleAnchor(seat, layout);
    // Pitch is derived from the widest possible row (all six types), so the glyph radius is a
    // constant and never shrinks as the player diversifies — the legibility problem S140 hit when
    // the pitch tracked a growing cap cannot recur.
    const pitch = (KEEP_W - 14) / ALL_SPARK_TYPES.length;
    const r = Math.min(5.5, pitch * 0.38);
    const top = y + KEEP_BATTLEMENT_H / 2 - 2;
    const left = x - ((held.length - 1) * pitch) / 2;
    for (let i = 0; i < held.length; i++) {
      drawSparkGlyph(g, left + i * pitch, top, r, held[i]!, color);
    }
  }

  /** A gatherer: the owner's spark, currently wearing one of the six primitive shapes. */
  private drawGatherer(
    g: Graphics,
    x: number,
    y: number,
    color: number,
    shape: SparkType,
    hauling: boolean,
    preferred: SparkType | null,
    waiting = false,
    raceId: RaceId = 'vampires',
  ): void {
    const r = GATHERER_RADIUS;
    // Soft aura so it reads as "one of your sparks" at a glance; brighter while carrying, so a
    // loaded unit is legible at a distance without any HUD.
    g.circle(x, y, r + 4).fill({ color, alpha: hauling ? 0.3 : 0.16 });
    if (hauling) g.circle(x, y, r + 7).stroke({ width: 1.5, color, alpha: 0.5 });
    // S136 P1 — STALLED: bank full, holding a shape it cannot deposit. Drawn as a warm dashed-look
    // double ring so "my haulers have stopped earning" is visible ON THE BOARD, not just as a number
    // in a panel. The cap is only strategic pressure if the player can SEE it biting.
    if (waiting) {
      g.circle(x, y, r + 10).stroke({ width: 2, color: 0xffb03b, alpha: 0.85 });
      g.circle(x, y, r + 14).stroke({ width: 1, color: 0xffb03b, alpha: 0.4 });
    }
    // A standing order shows as a small ring: "this one is filtered". Cosmetic, render-only.
    if (preferred !== null) g.circle(x, y, r + 11).stroke({ width: 1, color: 0xffffff, alpha: 0.45 });

    // ⭐ S161 W1-B item 3 — THE RACE SILHOUETTE, drawn BEFORE the glyph so the glyph stays on top.
    // The mark is the unit's outline; the morphing primitive is still the thing you read first.
    // See raceMotifs.ts for why this is procedural rather than an 11 px sprite.
    drawRaceGathererMark(g, x, y, r, color, raceId);

    // S136 P1 — the shape switch moved to render/sparkGlyph.ts so the castle panel can draw the
    // SAME marks for the shapes held in its bank. A stored triangle that did not look like a board
    // triangle would make the bank unreadable.
    drawSparkGlyph(g, x, y, r, shape, color);
  }

  /** Drop everything (title-return parity with the other renderers). */
  clear(): void {
    this.graphics.clear();
    this.overlay.clear();
    // ⚠ THE SPRITES TOO. `clear()` is the title-return path, and a Sprite is not immediate-mode —
    // clearing only the Graphics would return to the title with six castles still on screen.
    this.spriteLayer.visible = false;
    for (const sp of this.castleSprites.values()) sp.visible = false;
  }
}
