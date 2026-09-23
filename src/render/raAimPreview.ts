/**
 * SPARK — S188 P6 — **POWER OF RA: THE AIM THAT IS FOLLOWING THE CURSOR, if any.**
 *
 * > *"you click on it and then you have to click on the area of the map where you want it to land"*
 *
 * Between the two clicks the local player is AIMING, and that is one player's view state, exactly
 * like the footer's `selected` chip or the armed tower: it must not reach the wire, it is not
 * hashed, and two peers disagreeing about it is not a divergence.
 *
 * ## ⛔ WHY A MODULE-LEVEL CONTEXT, and not a field threaded through the renderers
 *
 * It is WRITTEN by the input layer (`controls.ts`, on the button press, every pointer move, the
 * cast and the cancel) and READ by two renderers (`bossAuras.ts` draws the five circles under the
 * cursor; `footerBand.ts` lights the button). The alternative — plumbing it through `main.ts` into
 * `goblinRenderer.sync` and on into `drawBossAuras` — is the shape `concealment.ts`' docblock
 * rejects for the same reason: every signature in the chain would have to carry it, and the one
 * that silently did not would keep drawing nothing. Its default, `null`, is "not aiming", which is
 * the pre-existing behaviour, so a caller that never writes it changes nothing.
 *
 * Pixi-free on purpose: `controls.ts` must not import Pixi.
 */

import type { PlayerId } from '../types.ts';

export interface RaAimPreview {
  /** The seat aiming — it seeds the column pattern, exactly as it will seed the real strike. */
  readonly seat: PlayerId;
  /** The raw cursor, canvas space. The renderer normalises it with the reducer's own `raAimPoint`. */
  readonly x: number;
  readonly y: number;
}

let preview: RaAimPreview | null = null;

/** `null` = not aiming. Written only by the input layer. */
export function setRaAimPreview(p: RaAimPreview | null): void {
  preview = p;
}

export function raAimPreview(): RaAimPreview | null {
  return preview;
}
