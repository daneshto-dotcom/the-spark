/**
 * SPARK — S195 N17 — THE GRAPHICS TIER AT RUNTIME: what each tier switches, applied LIVE.
 *
 * Owner: *"that toggle on-off should actually do something … For different tiers of machines."*
 *
 * `displayPrefs.ts` stores the viewer's choice; this module is what the renderers read and what `main.ts`
 * polls once per frame (`syncGraphicsTier`), exactly as it already polled the old fx switch and the race
 * background — so a change in Settings is on screen on the next frame, no reload.
 *
 * WHAT EACH TIER DOES (measured, `.claude/plans/S195_LAG_REPORT.md` §5):
 *   · HIGH    — nothing changes: bloom + ripples on, every renderer exactly as before. Byte-for-byte today.
 *   · LOW     — bloom + ripples off (the old LOW), and the CONNECTORS are drawn from a cache
 *               (`structureRenderer.ts`): a connector bucket is re-stroked only when something in it
 *               changed, and the animated connector silhouettes step at 10 Hz instead of every frame.
 *   · MINIMAL — LOW, plus the pre-S192 effects (`?fx=legacy`'s look: no new particles), and the connector
 *               silhouettes hold still, positions snapped to whole pixels so sub-pixel drift never redraws.
 *
 * ⛔ RENDER-ONLY. No sim read is changed, nothing reaches the wire or either hash; two peers on different
 * tiers play the identical match. No protocol bump.
 */
import { getGraphicsTier, type GraphicsTier } from './displayPrefs.ts';
import { setFxHighQualityRuntime, setFxTierLegacy } from './fx/fxRuntime.ts';

let runtimeTier: GraphicsTier = 'HIGH';
let applied = false;

/** The tier the renderers draw this frame. */
export function graphicsTier(): GraphicsTier {
  return runtimeTier;
}

/** Switch every tier-dependent system at once. Idempotent. */
export function applyGraphicsTier(tier: GraphicsTier): void {
  runtimeTier = tier;
  applied = true;
  setFxHighQualityRuntime(tier === 'HIGH');
  setFxTierLegacy(tier === 'MINIMAL');
}

/** Called once per frame by `main.ts`: re-reads the stored tier and applies a change on the spot. */
export function syncGraphicsTier(): void {
  const want = getGraphicsTier();
  if (!applied || want !== runtimeTier) applyGraphicsTier(want);
}

/**
 * The connector cache's knobs per tier. `null` = no cache (HIGH draws every connector every frame, as it
 * always has).
 *   · `posQuantum`  — positions are snapped to this many px before they are drawn AND before they are compared,
 *                     so drift smaller than it neither moves a line nor forces a redraw. ⚠ MINE.
 *   · `animStepTicks` — the animated silhouettes' clock advances in steps of this many ticks (0 = frozen). ⚠ MINE.
 *   · `motionRedrawsPerFrame` — ⭐ S196 (joiner-lag): how many buckets whose change is MOTION ONLY (positions,
 *                     stress tint/width, cover fade, foul tint) may be re-stroked in one frame; the rest wait their
 *                     turn, stalest first. A STRUCTURAL change (a connector added, severed, hidden by fog, or a
 *                     silhouette/pattern change) is never deferred. `Infinity` = no budget. ⚠ MINE.
 *
 * ⭐ S196 — WHY MINIMAL GOT A BUDGET. Measured on a joiner at wave 10 (`scripts/lag/gfxProbe.ts`): MINIMAL still
 * re-stroked **8.5 buckets / 511 Graphics instructions every frame** — 46 % of every Graphics instruction the
 * frame rebuilt — because a joiner interpolates every shape every frame, so a structure that is being hit or is
 * settling moves a pixel per frame and its buckets never stay clean. On a slow PC that is the frame. With a
 * budget of 3, a shaking structure's connectors follow it a few frames late (a pixel or two), and nothing
 * structural is ever late. HIGH has no cache at all and LOW keeps redrawing every change, as before.
 */
export interface BondCacheKnobs { readonly posQuantum: number; readonly animStepTicks: number; readonly motionRedrawsPerFrame: number }
export const BOND_CACHE_KNOBS: Readonly<Record<GraphicsTier, BondCacheKnobs | null>> = {
  HIGH: null,
  LOW: { posQuantum: 1, animStepTicks: 6, motionRedrawsPerFrame: Number.POSITIVE_INFINITY },
  MINIMAL: { posQuantum: 1, animStepTicks: 0, motionRedrawsPerFrame: 3 },
};

/** Test seam: back to a fresh process. */
export function resetGraphicsTierForTests(): void {
  runtimeTier = 'HIGH';
  applied = false;
}
