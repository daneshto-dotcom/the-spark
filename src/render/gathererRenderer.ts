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
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import type { GathererId, SparkId } from '../types.ts';
import type { World } from '../state/world.ts';

/** Ticks each primitive is held before morphing to the next (~1.2 s at 60 Hz — never per-tick). */
const MORPH_TICKS = 72;
const GATHERER_RADIUS = 11;
const KEEP_W = 74;
const KEEP_H = 58;
const KEEP_BATTLEMENT_H = 10;

/**
 * The cosmetic shape a gatherer is currently wearing. PURE — same (tick, id) always yields the
 * same shape on every machine, which is what lets this stay out of world state entirely.
 */
export function gathererMorphShape(tick: number, id: GathererId): SparkType {
  const phase = Math.floor(tick / MORPH_TICKS) + (id as unknown as number);
  return (((phase % 6) + 6) % 6) as SparkType;
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
      this.drawKeep(g, seat as unknown as number, player.color);
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
        gatherer.state === 'HAULING',
        gatherer.preferredType,
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

  /** A gatherer: the owner's spark, currently wearing one of the six primitive shapes. */
  private drawGatherer(
    g: Graphics,
    x: number,
    y: number,
    color: number,
    shape: SparkType,
    hauling: boolean,
    preferred: SparkType | null,
  ): void {
    const r = GATHERER_RADIUS;
    // Soft aura so it reads as "one of your sparks" at a glance; brighter while carrying, so a
    // loaded unit is legible at a distance without any HUD.
    g.circle(x, y, r + 4).fill({ color, alpha: hauling ? 0.3 : 0.16 });
    if (hauling) g.circle(x, y, r + 7).stroke({ width: 1.5, color, alpha: 0.5 });
    // A standing order shows as a small ring: "this one is filtered". Cosmetic, render-only.
    if (preferred !== null) g.circle(x, y, r + 11).stroke({ width: 1, color: 0xffffff, alpha: 0.45 });

    const fill = { color, alpha: 0.55 } as const;
    const line = { width: 2, color, alpha: 0.95 } as const;

    switch (shape) {
      case SparkType.Dot:
        g.circle(x, y, r * 0.55).fill(fill).stroke(line);
        break;
      case SparkType.Line:
        g.moveTo(x - r, y).lineTo(x + r, y).stroke({ width: 3, color, alpha: 0.95 });
        break;
      case SparkType.Triangle:
        g.moveTo(x, y - r).lineTo(x + r * 0.9, y + r * 0.7).lineTo(x - r * 0.9, y + r * 0.7).closePath().fill(fill).stroke(line);
        break;
      case SparkType.Square:
        g.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5).fill(fill).stroke(line);
        break;
      case SparkType.Circle:
        g.circle(x, y, r * 0.85).fill(fill).stroke(line);
        break;
      case SparkType.Spiral: {
        // Two-turn spiral, sampled — cheap and unmistakably "the spiral primitive".
        const turns = 2;
        const steps = 26;
        g.moveTo(x, y);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const a = t * turns * Math.PI * 2;
          g.lineTo(x + Math.cos(a) * r * t, y + Math.sin(a) * r * t);
        }
        g.stroke({ width: 2, color, alpha: 0.95 });
        break;
      }
    }
  }

  /** Drop everything (title-return parity with the other renderers). */
  clear(): void {
    this.graphics.clear();
  }
}
