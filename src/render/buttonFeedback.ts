/**
 * SPARK — S155 P2: **ONE BUTTON GRAMMAR, USED EVERYWHERE.**
 *
 * ## The owner has now reported this twice, about two different screens
 *
 * S152 A5, about the title screen: *"it all need to either pop out, be highlighted, make a sound or
 * all at once so we know when we have clicked something and it simply didnt work"*. That was fixed —
 * in `titleScreen.ts`, inline.
 *
 * S155, about leaving a match: *"back to main doesnt pop out or show thaty it is clickable like other
 * buttons... need to make it interractive and obvious."*
 *
 * ⭐ READ THOSE TWO TOGETHER AND THE SECOND REPORT IS NOT A NEW REQUEST — it is the FIRST fix never
 * having been generalised. *"like other buttons"* is the owner comparing surfaces: the title buttons
 * pop, and nothing else does. A grep settles it — `pointerover` appears in `titleScreen.ts`,
 * `botSetupOverlay.ts` (a bare ~13% tint, the pre-S152 "effectively invisible" kind) and
 * `castlePanel.ts`, and **`lobbyScreen.makeButton` has no hover, no press and no sound at all**. So
 * every Host / Join / Begin / **Back** button in the lobby — including the very back-out the owner is
 * complaining about — is still pre-S152.
 *
 * ⛔ SO THE FIX IS NOT A NEW BUTTON WITH ITS OWN FEEL. Adding a third hand-rolled variant is how a
 * repo ends up with three grammars and a fourth report. The S152 A5 behaviour is lifted here VERBATIM
 * — same scales, same tint, same sound, same `pointerupoutside` guard — and its call sites now share
 * it. Any future tuning moves every button together, by construction.
 *
 * ## The grammar, and why each part exists
 *
 *   · HOVER — brighten AND scale up 4%. The brighten alone was measured insufficient in S152: a ~13%
 *     lightening of a near-black plate is invisible. "Pop out" is the scale.
 *   · PRESS — scale DOWN below rest on `pointerdown`. ⭐ This is the half that answers *"did my click
 *     register"*, and the half that did not exist before S152.
 *   · SOUND — an accept blip on tap, so the answer does not depend on looking at the right pixels.
 *
 * ⚠ `pointerupoutside` MUST reset the scale, or dragging off a pressed button leaves it stuck
 * depressed forever — a button that looks permanently held is worse than no press state at all. That
 * warning is carried over verbatim from S152 because it is the one non-obvious handler.
 *
 * Pure wiring against a NARROW structural interface (not `Container`), so the whole grammar is
 * unit-testable with a stub and no WebGL — the same reason `lobbyStateMachine.ts` is a pure reducer.
 */

import { playUiClickSFX } from './audioManager.ts';

/** Rest / hover / press scales. Exported so tests and callers cannot drift from each other. */
export const BUTTON_REST_SCALE = 1;
export const BUTTON_HOVER_SCALE = 1.04;
export const BUTTON_PRESS_SCALE = 0.97;
/** Hover plate tint, and the neutral it returns to. */
export const BUTTON_HOVER_TINT = 0xbfd4ff;
export const BUTTON_REST_TINT = 0xffffff;

/**
 * The minimum an object must offer to receive the grammar. Pixi's `Container` satisfies it.
 *
 * ⚠ `eventMode` and `cursor` are declared OPTIONAL and widened DELIBERATELY, and not out of
 * laziness — tsc walked me through two versions before this one. Pixi declares them as OPTIONAL
 * properties (`eventMode?: EventMode`, `cursor?: string | null`), so `eventMode: string` fails with
 * *"Type 'string | undefined' is not assignable to type 'string'"* and `eventMode: string | undefined`
 * then fails with *"Property 'eventMode' is optional in type 'Container' but required in type
 * 'FeedbackTarget'"*. Optionality has to match. Widening the READ side costs nothing: this module only
 * ever WRITES these two, and the values it writes are still narrow literals.
 */
export interface FeedbackTarget {
  eventMode?: string | undefined;
  cursor?: string | null | undefined;
  scale: { set(v: number): void };
  on(event: string, fn: () => void): unknown;
}

/** The minimum a background plate must offer — just something to tint. */
export interface TintTarget {
  tint: number;
}

export interface ButtonFeedbackOpts {
  /**
   * Suppress the click blip. For buttons that already make their own noise, or whose action
   * immediately plays something louder. Default false — silence is opt-in, never accidental.
   */
  readonly silent?: boolean;
}

/**
 * Give `c` the standard SPARK button feel and wire `onClick` to its tap.
 *
 * Registers the tap itself (rather than leaving it to the caller) precisely so the sound cannot be
 * forgotten at one call site — the S152 lesson was that the *feedback* is the feature, so it must not
 * be optional-by-omission.
 */
export function attachButtonFeedback(
  c: FeedbackTarget,
  bg: TintTarget,
  onClick: () => void,
  opts: ButtonFeedbackOpts = {},
): void {
  let hovered = false;
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', () => {
    if (opts.silent !== true) void playUiClickSFX();
    onClick();
  });
  c.on('pointerover', () => {
    hovered = true;
    bg.tint = BUTTON_HOVER_TINT;
    c.scale.set(BUTTON_HOVER_SCALE);
  });
  c.on('pointerout', () => {
    hovered = false;
    bg.tint = BUTTON_REST_TINT;
    c.scale.set(BUTTON_REST_SCALE);
  });
  c.on('pointerdown', () => {
    c.scale.set(BUTTON_PRESS_SCALE);
  });
  // Returning to HOVER (not REST) when the pointer is still over the button is what makes a
  // click-and-hold-and-release feel continuous rather than snapping flat mid-gesture.
  c.on('pointerup', () => {
    c.scale.set(hovered ? BUTTON_HOVER_SCALE : BUTTON_REST_SCALE);
  });
  c.on('pointerupoutside', () => {
    c.scale.set(BUTTON_REST_SCALE);
  });
}
