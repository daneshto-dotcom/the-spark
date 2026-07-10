/**
 * SPARK — S121 P4: tiny text-fit guards shared by the title screen + codex overlay.
 *
 * The owner's "text is coming out of the boxes" class of bug: a Pixi Text is laid out at a fixed
 * fontSize and nobody re-measures, so long copy silently escapes its container. These helpers make
 * overflow structurally impossible: after constructing a Text, call the guard and it steps the
 * fontSize down (never below `minSize`) until the rendered bounds fit. Copy is still WRITTEN to fit
 * at full size (enforced by codexPresentation.test.ts budgets) — the guard is the safety net, not
 * the layout mechanism, so tiles stay visually uniform unless something drifts.
 */

import type { Text } from 'pixi.js';

/** Shrink `t`'s fontSize until its width ≤ maxW (floor at minSize). No-op when it already fits. */
export function fitTextToWidth(t: Text, maxW: number, minSize = 9): void {
  let size = Number(t.style.fontSize);
  while (t.width > maxW && size > minSize) {
    size -= 1;
    t.style.fontSize = size;
  }
}

/** Shrink `t`'s fontSize until its rendered block fits maxW × maxH (floor at minSize). */
export function fitTextToBox(t: Text, maxW: number, maxH: number, minSize = 9): void {
  let size = Number(t.style.fontSize);
  while ((t.width > maxW || t.height > maxH) && size > minSize) {
    size -= 1;
    t.style.fontSize = size;
  }
}
