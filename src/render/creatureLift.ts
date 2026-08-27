/**
 * SPARK — per-kind draw-time ALTITUDE for creatures, in canvas pixels.
 *
 * ⭐ S152 P3 — the atlas path had no notion of height. Every sprite is foot-anchored
 * (`footAnchor.y` ≈ 0.995, forced by the builder) and drawn at the creature's own `pos.y`, so
 * without this the BAT RIDER's mount stands on the ground like an infantryman. Owner R77 calls him
 * the *"flying goblin"*, and a flyer that walks is simply wrong.
 *
 * ⛔ AND BAKING THE GAP INTO THE ART CANNOT WORK — checked before adding a dial. The builder
 * measures ONE union bounding box over every frame and pastes each crop BOTTOM-CENTRE into its cell
 * (`build-sprite-atlas.mjs`), so empty headroom drawn above the character is cropped away by
 * construction. The offset has to live at draw time.
 *
 * ⚠ RENDER-ONLY. The creature's actual `pos` is untouched, so targeting, range, collision and the
 * `?worker=1` mirror all see the same numbers they always did. This lifts the PICTURE, nothing else
 * — which also means a flyer is still hit by ground attacks exactly as the sim intends.
 *
 * ## ⚠ S154 P2 — WHY THIS IS ITS OWN MODULE NOW
 *
 * It lived in `goblinRenderer.ts`, module-private. The harpoon needs it too: a projectile that
 * launches from the creature's `pos` emanates from empty air 34 px BELOW the bat rider's picture,
 * which reads as a bug rather than a throw. But `goblinRenderer` already imports the projectile
 * module, so importing the lift back out of it would close an import cycle. One shared leaf module
 * is the cheapest honest fix, and it keeps a single source of truth for the altitude — the
 * alternative (a second copy of `34` in the projectile file) is exactly the duplicated-geometry
 * drift this repo has paid for before.
 */

import type { Graphics } from 'pixi.js';
import type { CreatureType } from '../state/creatures/creature.ts';
import type { PlayerId } from '../types.ts';

/** Draw-time altitude per creature kind, in px. Absent ⇒ ground level. */
export const GOBLIN_LIFT: Partial<Record<CreatureType, number>> = {
  goblinBat: 34,
};

/** PURE — how far above its own position this kind's picture is drawn. 0 for anything grounded. */
export function liftOf(type: CreatureType): number {
  return GOBLIN_LIFT[type] ?? 0;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  ⭐ S154 AMENDMENT B (owner) — THE PLAYER-COLOURED GROUND MARKER, ON EVERY SPAWNED CREATURE
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Owner, on seeing the bat rider's marker drawn in their own red: *"i think it makes sense to have
 * shadows in the color of the player that created them (i am red player so its red for me blue
 * players would have blue shadows for their spawn). that way when there are a lot of soldiers on the
 * map you can tell who they belong too. but then it has to be consistent across ALL spawned
 * creatures."*
 *
 * ## Why the inconsistency existed, and what the black shadows actually are
 *
 * S154 P2 added a ground marker for LIFTED kinds only — the bat rider — because a flyer needs the
 * gap between itself and the ground to read as flight. The owner then reasonably asked why the other
 * goblins have BLACK shadows. They do not, in code: on the atlas path the only drawn ground ellipse
 * was that one, and all six goblin kinds are atlas-backed now (`drawGoblin`'s black ellipse belongs
 * to the procedural puppet, which is a load-failure fallback). **The black shadows are painted into
 * the veo sprite art.** They stay there — this marker is drawn UNDER the sprite, so the baked
 * shading remains part of the character and the coloured disc reads as the ownership cue beneath it.
 *
 * ## And it is a TINT, not a black shadow, for a measured reason
 *
 * P2's first cut drew `0x000000` at alpha 0.22 and a pixel sample of the running game showed the
 * board background is **pure black (0,0,0)** — black over black composites to black, so the feature
 * was provably invisible. The owner's proposal and that measurement point the same way.
 *
 * ⚠ ONE definition, called from all three creature renderers (goblin, Voltkin/drone, chewer), so
 * "consistent across ALL spawned creatures" is enforced by there being nothing else to call.
 */

/** Ground-marker radii, px. Wider than tall so it reads as lying flat on the board. */
export const GROUND_RX = 11;
export const GROUND_RY = 4;

/**
 * PURE — the seat colour to mark this creature's ground with. Reads the owner's LIVE `player.color`
 * (so it stays correct after a rainbow colour-shuffle remaps seats) and falls back to the static
 * palette only when the owner is somehow absent — the same resolution order `isEnemyBond` uses.
 */
export function ownerTint(
  players: ReadonlyMap<PlayerId, { readonly color: number }>,
  ownerPlayerId: PlayerId,
  palette: readonly number[],
): number {
  const live = players.get(ownerPlayerId)?.color;
  return live ?? palette[ownerPlayerId as unknown as number] ?? palette[0]!;
}

/**
 * Draw one creature's ground marker at its REAL position — which is also where its hitbox, its
 * targeting and every range check are. For a flyer that is deliberately NOT where its picture is, so
 * the marker doubles as "this is where the thing you can actually hit is standing".
 */
export function drawGroundMarker(
  g: Graphics,
  x: number,
  y: number,
  tint: number,
  alpha: number,
): void {
  g.ellipse(x, y, GROUND_RX, GROUND_RY).fill({ color: tint, alpha: 0.3 * alpha });
}
