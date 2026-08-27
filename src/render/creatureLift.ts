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

import type { CreatureType } from '../state/creatures/creature.ts';

/** Draw-time altitude per creature kind, in px. Absent ⇒ ground level. */
export const GOBLIN_LIFT: Partial<Record<CreatureType, number>> = {
  goblinBat: 34,
};

/** PURE — how far above its own position this kind's picture is drawn. 0 for anything grounded. */
export function liftOf(type: CreatureType): number {
  return GOBLIN_LIFT[type] ?? 0;
}
