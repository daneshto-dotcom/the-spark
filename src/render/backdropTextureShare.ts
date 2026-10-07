/**
 * SPARK — S196 `s196/render-perf` (team-art audit L1) — **WHICH BACKDROP TEXTURES THE LOBBY STILL HOLDS.**
 *
 * `Assets.load(url)` hands every caller the SAME `Texture` object for one url. The lobby backdrop
 * (`lobbyBackdrop.ts`) keeps its race art in a module cache and re-shows it on every lobby visit; the board
 * backdrop (`zoneBackgroundRenderer.ts`) asks for the very same `zone-<race>-<2p|4p>.png` urls and now
 * RELEASES what no quadrant uses. `Assets.unload` destroys the shared object — `texture.source` goes null —
 * and a lobby sprite still holding it would dereference null on its next render.
 *
 * So the board asks here first and never unloads a texture the lobby holds. That set is bounded by the race
 * art (6 races × 2 boards = 12 images, 480×270 / 480×540), which is the lobby's own pre-warm, not a leak.
 * A separate module (not an export of either renderer) because `lobbyBackdrop` already imports
 * `zoneBackgroundRenderer`, and the reverse import would close a cycle.
 */
import type { Texture } from 'pixi.js';

const lobbyHeld = new Set<Texture>();

/** The lobby cached `tex` and may show it again. */
export function holdForLobby(tex: Texture): void {
  lobbyHeld.add(tex);
}

/** True when the lobby holds `tex`: the board must not unload it. */
export function lobbyHoldsTexture(tex: Texture): boolean {
  return lobbyHeld.has(tex);
}
