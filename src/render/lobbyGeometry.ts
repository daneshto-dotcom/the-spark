/**
 * SPARK — lobby geometry + room-code validation (S60 P4 — extracted from
 * lobbyScreen.ts to bring that file back under the §XV size charter).
 *
 * PURE helpers (no Pixi, no class state): room-code sanitize/validate, the
 * object-fit:contain canvas↔CSS coordinate mappings (used by both the HTML
 * input-overlay positioning and controls.updateCursor), and the pane/button
 * layout constants + bounds getters used by the LobbyScreen render code and
 * its vitest regression coverage. lobbyScreen.ts imports what its class needs
 * and re-exports the public helpers, so external callers + tests are
 * unaffected by the move.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';

export const PANE_WIDTH = 480;
export const PANE_HEIGHT = 360;
export const PANE_GAP = 40;
export const BUTTON_WIDTH = 220;
export const BUTTON_HEIGHT = 48;

// S69 P2 — 6-seat lobby rack (2 rows x 3 cols, centered horizontally). Seat i ->
// PLAYER_COLORS[i]. Pure layout; getSeatRect below derives per-seat canvas rects.
// Only SEAT_W/SEAT_H are exported (seatRack.ts renders within those bounds); the
// rest are module-private (consumed only by getSeatRect) to keep knip at zero.
const SEAT_COLS = 3;
export const SEAT_W = 380;
export const SEAT_H = 150;
const SEAT_GAP = 40;
const SEAT_RACK_W = SEAT_COLS * SEAT_W + (SEAT_COLS - 1) * SEAT_GAP;
const SEAT_RACK_X = (CANVAS_WIDTH - SEAT_RACK_W) / 2;
const SEAT_RACK_Y = 340;

// JOIN pane code-input rectangle in canvas-space (matches the Pixi rect at
// joinInputBg position: joinPaneX+40, paneY+100, PANE_WIDTH-80, 60).
export const JOIN_PANE_X = CANVAS_WIDTH / 2 + PANE_GAP / 2;
export const JOIN_PANE_Y = CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2;
export const INPUT_CANVAS_X = JOIN_PANE_X + 40;
export const INPUT_CANVAS_Y = JOIN_PANE_Y + 100;
export const INPUT_CANVAS_W = PANE_WIDTH - 80;
export const INPUT_CANVAS_H = 60;

export const ROOM_CODE_PATTERN = '[2-9A-HJ-NP-Z]{6}';
const ROOM_CODE_CHAR_REGEX = /[^2-9A-HJ-NP-Z]/g;
const ROOM_CODE_FULL_REGEX = new RegExp(`^${ROOM_CODE_PATTERN}$`);

/**
 * Pure helper: sanitize a raw input value into a room-code-safe string.
 * Uppercases, strips invalid chars (0, O, 1, I — the protocol charset),
 * truncates to 6. Exported for tests.
 */
export function sanitizeRoomCodeValue(raw: string): string {
  return raw.toUpperCase().replace(ROOM_CODE_CHAR_REGEX, '').slice(0, 6);
}

/** Pure helper: full-pattern validity (length 6 + valid chars). Exported for tests. */
export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_FULL_REGEX.test(value);
}

/**
 * S39 P2 — shared object-fit:contain geometry. Returns the visible canvas
 * sub-rect inside the CSS box (centered, letterboxed on whichever axis
 * doesn't match the canvas aspect) and a uniform scale factor (CSS-px per
 * canvas-unit). At matched aspect, the fitted rect equals the CSS box and
 * offsets are zero — i.e. the original non-letterbox call sites still work.
 *
 * Used by both mapCanvasRectToPage (canvas→CSS for HTML input positioning)
 * and cssToCanvasCoords (CSS→canvas for cursor input). The canvas element's
 * computed style is `object-fit: contain` (Pixi's default), so all coordinate
 * mappings between the two spaces MUST account for letterbox bars on the
 * non-matching axis.
 */
function fitCanvasIntoRect(
  boxW: number,
  boxH: number,
  canvasW: number,
  canvasH: number,
): { fittedW: number; fittedH: number; offsetX: number; offsetY: number; scale: number } {
  const canvasAspect = canvasW / canvasH;
  const boxAspect = boxH > 0 ? boxW / boxH : canvasAspect;
  // Box wider than canvas → letterbox bars on left+right (canvas height fills box).
  // Box taller than canvas → letterbox bars on top+bottom (canvas width fills box).
  const fittedW = boxAspect > canvasAspect ? boxH * canvasAspect : boxW;
  const fittedH = boxAspect > canvasAspect ? boxH : boxW / canvasAspect;
  return {
    fittedW,
    fittedH,
    offsetX: (boxW - fittedW) / 2,
    offsetY: (boxH - fittedH) / 2,
    scale: canvasW > 0 ? fittedW / canvasW : 1, // === fittedH / canvasH (uniform)
  };
}

/**
 * Pure helper: map a canvas-space rect to page-space pixels for absolute
 * HTML overlay positioning. canvasRect must come from
 * `canvas.getBoundingClientRect()`. Exported for tests.
 *
 * S39 P2 — letterbox-aware. Pre-S39 used non-uniform `sx = rect.width/canvasW`,
 * `sy = rect.height/canvasH` which is correct only when CSS box aspect ==
 * canvas aspect. Under object-fit:contain at any other aspect, the canvas
 * content occupies only a sub-rect of the CSS box (with letterbox bars) and
 * the buggy non-uniform mapping placed HTML overlays at the wrong page
 * coordinates by up to the letterbox-bar size. Post-S39 uses uniform scale
 * via fitCanvasIntoRect.
 */
export function mapCanvasRectToPage(
  canvasRect: { left: number; top: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
  zoneX: number,
  zoneY: number,
  zoneW: number,
  zoneH: number,
): { left: number; top: number; width: number; height: number } {
  const { offsetX, offsetY, scale } = fitCanvasIntoRect(
    canvasRect.width,
    canvasRect.height,
    canvasW,
    canvasH,
  );
  return {
    left: canvasRect.left + offsetX + zoneX * scale,
    top: canvasRect.top + offsetY + zoneY * scale,
    width: zoneW * scale,
    height: zoneH * scale,
  };
}

/**
 * S39 P2 — pure helper inverting mapCanvasRectToPage. Maps a CSS-space pointer
 * position (typically `clientX`, `clientY` from a PointerEvent) into canvas-
 * space coords under object-fit:contain. Used by controls.updateCursor() so
 * the avatar (rendered at controls.cursor) is visually coincident with the
 * OS cursor across all viewport aspect ratios.
 *
 * BUG-B (S39): pre-S39 controls.updateCursor used non-uniform `sx`/`sy`
 * directly, which gave correct mapping ONLY when the CSS box matched the
 * canvas aspect. At any other aspect the avatar appeared offset from the OS
 * cursor by up to the letterbox-bar size, with the gap maximal at the visible
 * canvas edges and zero at the visual center (where both formulas agree).
 *
 * Lives in lobbyGeometry.ts (S60 P4 — was lobbyScreen.ts pre-extraction; the
 * S39 "follow-up refactor can extract to a coords module" note is now done).
 */
export function cssToCanvasCoords(
  canvasRect: { left: number; top: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
  cssX: number,
  cssY: number,
): { x: number; y: number } {
  const { offsetX, offsetY, scale } = fitCanvasIntoRect(
    canvasRect.width,
    canvasRect.height,
    canvasW,
    canvasH,
  );
  if (scale === 0) return { x: 0, y: 0 };
  return {
    x: (cssX - canvasRect.left - offsetX) / scale,
    y: (cssY - canvasRect.top - offsetY) / scale,
  };
}

/** Exposed canvas-space coords of the JOIN code input rect — used by overlay positioning. */
export const JOIN_INPUT_RECT = {
  x: INPUT_CANVAS_X,
  y: INPUT_CANVAS_Y,
  w: INPUT_CANVAS_W,
  h: INPUT_CANVAS_H,
} as const;

/** S17 P0' — pure helpers exposing pane-relative button/code bounds for vitest regression coverage of the double-offset bug fix. */
export function getConnectButtonCanvasBounds(
  joinPaneX: number,
  paneY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: joinPaneX + (PANE_WIDTH / 2 - BUTTON_WIDTH / 2),
    y: paneY + 220,
    w: BUTTON_WIDTH,
    h: BUTTON_HEIGHT,
  };
}

export function getHostButtonCanvasBounds(
  hostPaneX: number,
  paneY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: hostPaneX + (PANE_WIDTH / 2 - BUTTON_WIDTH / 2),
    y: paneY + 220,
    w: BUTTON_WIDTH,
    h: BUTTON_HEIGHT,
  };
}

export function getHostCodeTextCanvasPos(
  hostPaneX: number,
  paneY: number,
): { x: number; y: number } {
  return {
    x: hostPaneX + PANE_WIDTH / 2,
    y: paneY + 130,
  };
}

/** Exposed canvas-space pane origins for tests. */
export function getHostPaneOrigin(): { x: number; y: number } {
  return {
    x: CANVAS_WIDTH / 2 - PANE_WIDTH - PANE_GAP / 2,
    y: CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2,
  };
}
export function getJoinPaneOrigin(): { x: number; y: number } {
  return {
    x: CANVAS_WIDTH / 2 + PANE_GAP / 2,
    y: CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2,
  };
}

/**
 * S69 P2 — canvas-space rect of seat `i` in the 2x3 rack (i in 0..MAX_PLAYERS-1).
 * Pure; exported for seatRack.ts rendering AND vitest bounds/non-overlap coverage.
 * Row-major: seats 0,1,2 on the top row; 3,4,5 on the bottom row.
 */
export function getSeatRect(i: number): { x: number; y: number; w: number; h: number } {
  const col = i % SEAT_COLS;
  const row = Math.floor(i / SEAT_COLS);
  return {
    x: SEAT_RACK_X + col * (SEAT_W + SEAT_GAP),
    y: SEAT_RACK_Y + row * (SEAT_H + SEAT_GAP),
    w: SEAT_W,
    h: SEAT_H,
  };
}
