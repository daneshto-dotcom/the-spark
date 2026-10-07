/**
 * ⭐⭐ S196 (ui-5) — THE ONE POINTER → CANVAS CONVERSION. EVERY CLICK IN THE GAME GOES THROUGH HERE.
 *
 * Owner, S196 (long-standing): *"you have to click like way to the left to click on the button … on the
 * castle … when I'm trying to click on the spiral I have to click like way to the left … Especially when
 * you have the game open … on half of your screen … Or on different screens … There's a very big
 * inconsistency … across … computers, different screen sizes."*
 *
 * ⛔ THE ROOT CAUSE — TWO MAPPINGS, ONLY ONE OF THEM RIGHT.
 * The canvas is styled `max-width: 100%; max-height: 100%; object-fit: contain` (index.html) on top of
 * Pixi's `autoDensity` 1920×1080 CSS size. Whenever the window's aspect is not exactly 16:9 — half a
 * screen, ANY browser whose toolbar eats height (1920×947), a phone — the canvas' CSS box gets one axis
 * capped and the picture is drawn letterboxed INSIDE that box. Two code paths then turned a pointer into
 * a canvas point:
 *   · `Controls.updateCursor` (board, footer, character sheet) — letterbox-aware since S39 BUG-B. Right.
 *   · Pixi 8's own `EventSystem.mapPositionToPoint` (every `eventMode = 'static'` control: the castle
 *     panel's rows, shape-pull slots and build tiles, title / codex / draft / bot-setup / race-picker /
 *     exit / match-board buttons) — `x * canvas.width / rect.width`, per axis, never subtracting a bar.
 *     Wrong, by up to the bar width.
 * Measured S196 (`e2e/click-offset.spec.ts`, BEFORE table in `.claude/plans/S196_ui-5_click-offset-BEFORE.txt`):
 * in a 1920×947 window Pixi placed the pointer **+82 canvas px to the RIGHT** of the cursor over the
 * castle panel, so the player had to aim ~82 px LEFT of the spiral to pull it — the owner's report, to the
 * letter; at half-screen 960×1080 the error is vertical, −54…−249 px. At 1920×1080 (the ONLY viewport the
 * e2e harness had ever used) both formulas agree exactly, which is why no test ever saw it.
 *
 * ⭐ THE FIX IS ONE FUNCTION, AND BOTH PATHS NOW CALL IT. `installLetterboxPointerMapping` replaces the
 * Pixi event system's `mapPositionToPoint` on THIS renderer (the only Pixi entry from a DOM client point
 * to the federated `global`), and `Controls.updateCursor` calls `clientToCanvas` directly. They cannot
 * drift apart again without `src/input/pointerMapping.test.ts`'s census going red.
 *
 * DPR-INDEPENDENT BY CONSTRUCTION: the result is in the canvas' LOGICAL units (CANVAS_WIDTH ×
 * CANVAS_HEIGHT, i.e. `app.screen`), derived from the CSS rect alone. `renderer.resolution` is latched at
 * boot and goes stale when a window is dragged to a monitor with a different DPR; nothing here reads it.
 */
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { cssToCanvasCoords } from '../render/lobbyGeometry.ts';

/** The CSS rect shape both `getBoundingClientRect` and the tests provide. */
export interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * PURE — a DOM client point (`PointerEvent.clientX/Y`) → canvas-logical px, letterbox-aware under
 * `object-fit: contain`. A zero-size rect (detached / display:none canvas) maps to the origin.
 */
export function clientToCanvas(rect: ClientRectLike, clientX: number, clientY: number): { x: number; y: number } {
  return cssToCanvasCoords(rect, CANVAS_WIDTH, CANVAS_HEIGHT, clientX, clientY);
}

/** The slice of a Pixi `Application` this module touches — narrow so the unit test needs no WebGL. */
export interface PointerMappedApp {
  readonly canvas: { readonly isConnected: boolean; getBoundingClientRect(): ClientRectLike };
  readonly renderer: {
    readonly events: { mapPositionToPoint(point: { x: number; y: number }, x: number, y: number): void };
  };
}

/** Marker so a test (and a second call) can tell the renderer has been patched. */
export const LETTERBOX_MAPPING_TAG = '__sparkLetterboxMapping';

/**
 * Patch THIS app's Pixi event system so every federated pointer event's `global` is computed by
 * `clientToCanvas`. Idempotent. Call once, straight after `app.init`.
 */
export function installLetterboxPointerMapping(app: PointerMappedApp): void {
  const events = app.renderer.events as PointerMappedApp['renderer']['events'] & Record<string, unknown>;
  if (events[LETTERBOX_MAPPING_TAG] === true) return;
  const canvas = app.canvas;
  events.mapPositionToPoint = (point: { x: number; y: number }, x: number, y: number): void => {
    // Pixi's own fallback for a detached canvas is "rect = the backing size at the origin"; a detached
    // canvas gets no real pointer events, so the origin-anchored identity of the logical size is enough.
    const rect: ClientRectLike = canvas.isConnected
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const p = clientToCanvas(rect, x, y);
    point.x = p.x;
    point.y = p.y;
  };
  events[LETTERBOX_MAPPING_TAG] = true;
}
