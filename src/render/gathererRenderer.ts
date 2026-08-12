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

import { Application, Container, Graphics } from 'pixi.js';
import {
  CASTLE_BANK_CAP,
  KEEP_H,
  KEEP_W,
  PLAYER_COLORS,
  RAINBOW_FLYOVER_DURATION_TICKS,
  SparkType,
} from '../constants.ts';
import { bankOf } from '../state/castleBank.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';
import type { GathererId, SparkId } from '../types.ts';
import type { World } from '../state/world.ts';

/** Ticks each primitive is held before morphing to the next (~1.2 s at 60 Hz — never per-tick). */
const MORPH_TICKS = 72;
const GATHERER_RADIUS = 11;
// S136 P0 — KEEP_W / KEEP_H were promoted to constants.ts so the click target (isPointInKeep) and
// this drawing read the same numbers. Only the battlement height stays local: nothing outside this
// renderer has any use for it.
const KEEP_BATTLEMENT_H = 10;
/**
 * S140 P1 — how many stored-shape glyphs fit ONE row across the keep face before wrapping.
 *
 * 5 is the value the pitch was implicitly tuned to when the bank cap was 5 (radius 4.56 px against
 * `drawSparkGlyph`'s constant 2 px stroke). Pinning the ROW LENGTH rather than the cap means the
 * glyph size is now independent of `CASTLE_BANK_CAP` — raising the cap adds a row instead of
 * shrinking every glyph toward illegibility.
 */
const KEEP_STORED_GLYPHS_PER_ROW = 5;

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

const seatColor = (seat: number): number => PLAYER_COLORS[seat % PLAYER_COLORS.length]!;

export class GathererRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw the keeps and every gatherer. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    if (world.gameState !== 'PLAYING') return;

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
      this.drawKeep(g, seat as unknown as number, keepColor);
      // S136 P1 — the shapes HELD INSIDE this castle, drawn in its doorway. Owner item 4 asked for
      // storage to live in the castle rather than on the ground beside it; without a mark on the
      // keep itself, "stored" would be invisible until the panel is opened, and a full bank (which
      // stalls your haulers) has to be readable at a glance from the board.
      this.drawStoredShapes(g, seat as unknown as number, keepColor, bankOf(world.castleBanks, seat));
    }
    for (const gatherer of world.gatherers.values()) {
      const owner = world.players.get(gatherer.ownerPlayerId);
      const color = owner?.color ?? seatColor(gatherer.ownerPlayerId as unknown as number);
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
      );
    }
  }

  /** The real type of the shape this gatherer is carrying, or null when its hands are empty. */
  private carriedShape(world: World, gatherer: { carriedSparkId: SparkId | null }): SparkType | null {
    if (gatherer.carriedSparkId === null) return null;
    return world.freeSparks.get(gatherer.carriedSparkId)?.type ?? null;
  }

  /** The placeholder keep: a battlemented box at the seat's fixed anchor, tinted to the seat. */
  private drawKeep(g: Graphics, seat: number, color: number): void {
    const { x, y } = castleAnchor(seat);
    const left = x - KEEP_W / 2;
    const top = y - KEEP_H / 2;

    g.rect(left, top + KEEP_BATTLEMENT_H, KEEP_W, KEEP_H - KEEP_BATTLEMENT_H)
      .fill({ color, alpha: 0.22 })
      .stroke({ width: 2, color, alpha: 0.85 });
    // Battlements — four merlons along the top edge, so the box reads as a keep, not a crate.
    for (let i = 0; i < 4; i++) {
      const w = KEEP_W / 7;
      g.rect(left + i * (KEEP_W / 4) + w * 0.5, top, w, KEEP_BATTLEMENT_H)
        .fill({ color, alpha: 0.35 })
        .stroke({ width: 1.5, color, alpha: 0.85 });
    }
    // Gate.
    g.rect(x - 9, top + KEEP_H - 18, 18, 18).fill({ color: 0x000000, alpha: 0.45 });
  }

  /**
   * S136 P1 — the castle's stored shapes, as a compact row of real glyphs across the keep's face.
   *
   * Drawn INSIDE the keep box (not below it) so the reading is "the castle holds these", which is the
   * whole point of owner item 4. Capped by CASTLE_BANK_CAP, so the row cannot outgrow the box — the
   * pitch is derived from the cap rather than hardcoded, so raising the cap re-spaces itself instead
   * of silently overflowing the art.
   */
  private drawStoredShapes(
    g: Graphics,
    seat: number,
    color: number,
    stored: readonly { type: SparkType }[],
  ): void {
    if (stored.length === 0) return;
    const { x, y } = castleAnchor(seat);
    // S140 P1 — WRAP INSTEAD OF SHRINKING. The pitch was `(KEEP_W - 14) / CASTLE_BANK_CAP`, so the
    // glyph radius fell with the cap: 4.56 px at 5, 3.26 px at 7, 2.85 px at 8. `drawSparkGlyph` uses
    // a CONSTANT 2 px stroke, so past ~3.5 px the Dot, Circle and Spiral stop being distinguishable —
    // and because the pull is index-addressed off this very readout, an illegible keep face attacks
    // the exact mechanic the cap raise exists to serve. Capping the row length and wrapping keeps the
    // pitch (and therefore the radius) at its cap-5 value no matter how high the cap goes.
    const perRow = Math.min(CASTLE_BANK_CAP, KEEP_STORED_GLYPHS_PER_ROW);
    const pitch = (KEEP_W - 14) / Math.max(1, perRow);
    const r = Math.min(5.5, pitch * 0.38);
    const rows = Math.max(1, Math.ceil(stored.length / perRow));
    const rowPitch = r * 2 + 1;
    // Keep the block vertically centred on the old single-row baseline so cap 5 is unchanged.
    const top = y + KEEP_BATTLEMENT_H / 2 - 2 - ((rows - 1) * rowPitch) / 2;
    for (let i = 0; i < stored.length; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inThisRow = Math.min(perRow, stored.length - row * perRow);
      const left = x - ((inThisRow - 1) * pitch) / 2;
      drawSparkGlyph(g, left + col * pitch, top + row * rowPitch, r, stored[i]!.type, color);
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

    // S136 P1 — the shape switch moved to render/sparkGlyph.ts so the castle panel can draw the
    // SAME marks for the shapes held in its bank. A stored triangle that did not look like a board
    // triangle would make the bank unreadable.
    drawSparkGlyph(g, x, y, r, shape, color);
  }

  /** Drop everything (title-return parity with the other renderers). */
  clear(): void {
    this.graphics.clear();
  }
}
