/**
 * S16 P1 — unit tests for the lobby JOIN input pure helpers.
 *
 * Tests cover the HTML-input behavior contract WITHOUT spinning up Pixi
 * Application or a DOM environment: the sanitize / validate / position
 * helpers are extracted as pure functions per S10 #test-via-pure-helper-export
 * pattern. Mobile-keyboard viewport recalc + Pixi click-to-focus integration
 * are covered by manual smoke in `npm run dev` and the cross-network playtest
 * (Council R1 Grok #3 — jsdom limitation acknowledged).
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_PLAYERS } from '../constants.ts';
import { getSeatRect } from './lobbyGeometry.ts';
import {
  cssToCanvasCoords,
  getConnectButtonCanvasBounds,
  getHostButtonCanvasBounds,
  getHostCodeTextCanvasPos,
  getHostPaneOrigin,
  getJoinPaneOrigin,
  isValidRoomCode,
  JOIN_INPUT_RECT,
  mapCanvasRectToPage,
  sanitizeRoomCodeValue,
} from './lobbyScreen.ts';

describe('S16 P1 — sanitizeRoomCodeValue', () => {
  it('uppercases lowercase chars', () => {
    expect(sanitizeRoomCodeValue('abcdef')).toBe('ABCDEF');
  });

  it('strips protocol-excluded chars (0, O, 1, I) silently', () => {
    expect(sanitizeRoomCodeValue('0OII1')).toBe('');
    expect(sanitizeRoomCodeValue('A0B1C')).toBe('ABC');
    expect(sanitizeRoomCodeValue('OABCIO')).toBe('ABC');
  });

  it('strips non-alphanumeric chars', () => {
    expect(sanitizeRoomCodeValue('A-B-C-D-E-F')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('A B C D E F')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('!@#$%^&*()')).toBe('');
  });

  it('truncates to 6 chars (rejects overflow without throwing)', () => {
    expect(sanitizeRoomCodeValue('ABCDEFGH')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('a2b3c4d5e6')).toBe('A2B3C4');
  });

  it('handles paste-style mixed input (lowercase + invalid + valid)', () => {
    // Simulates someone pasting "abc-def-ghi-jkl" — the kind of code you'd
    // see in a chat message with separators or leftover whitespace.
    expect(sanitizeRoomCodeValue('  abc-DEF jkl  ')).toBe('ABCDEF');
  });

  it('returns empty string on empty input', () => {
    expect(sanitizeRoomCodeValue('')).toBe('');
  });
});

describe('S16 P1 — isValidRoomCode', () => {
  it('accepts valid 6-char codes from the protocol charset', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
    expect(isValidRoomCode('A2B3C4')).toBe(true);
    expect(isValidRoomCode('HJKLNP')).toBe(true);
  });

  it('rejects codes with protocol-excluded chars (0, O, 1, I)', () => {
    expect(isValidRoomCode('ABCDE0')).toBe(false);
    expect(isValidRoomCode('OABCDE')).toBe(false);
    expect(isValidRoomCode('1BCDEF')).toBe(false);
    expect(isValidRoomCode('IABCDE')).toBe(false);
  });

  it('rejects codes with wrong length', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
  });

  it('rejects lowercase (sanitize must run first)', () => {
    expect(isValidRoomCode('abcdef')).toBe(false);
  });

  it('rejects whitespace / punctuation', () => {
    expect(isValidRoomCode('A B C D')).toBe(false);
    expect(isValidRoomCode('A-B-CD')).toBe(false);
  });
});

describe('S16 P1 — mapCanvasRectToPage', () => {
  it('identity case: canvas fills page at 1:1 scale', () => {
    const rect = { left: 0, top: 0, width: 1920, height: 1080 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(100);
    expect(out.top).toBe(200);
    expect(out.width).toBe(400);
    expect(out.height).toBe(80);
  });

  it('half-scale canvas: zone coords scale by 0.5', () => {
    const rect = { left: 0, top: 0, width: 960, height: 540 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(50);
    expect(out.top).toBe(100);
    expect(out.width).toBe(200);
    expect(out.height).toBe(40);
  });

  it('offset canvas: zone offsets by canvas rect.left/top', () => {
    const rect = { left: 200, top: 100, width: 1920, height: 1080 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(300);  // 200 + 100*1
    expect(out.top).toBe(300);   // 100 + 200*1
    expect(out.width).toBe(400);
    expect(out.height).toBe(80);
  });

  it('S39 P2 — letterboxed canvas uses UNIFORM scale (box narrower than canvas aspect)', () => {
    // Canvas 1920x1080 (aspect 1.778) rendered into CSS 800x600 (aspect 1.333).
    // Under object-fit:contain the canvas fits to the box's WIDTH (800) and
    // letterboxes top+bottom: fittedH = 800/1.778 = 450, letterbox bars = 75px.
    // Pre-S39 (buggy) used non-uniform sx=0.4167, sy=0.5556. Post-S39 uses
    // uniform scale=0.4167 with 75px Y offset.
    const rect = { left: 10, top: 20, width: 800, height: 600 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 40, 100, 200, 60);
    const scale = 800 / 1920; // ≈ 0.4167 (uniform)
    const letterboxY = (600 - 800 / (1920 / 1080)) / 2; // = (600 - 450)/2 = 75
    expect(out.left).toBeCloseTo(10 + 0 + 40 * scale, 4);          // 26.67
    expect(out.top).toBeCloseTo(20 + letterboxY + 100 * scale, 4); // 136.67 (was 75.56 pre-fix)
    expect(out.width).toBeCloseTo(200 * scale, 4);                 // 83.33
    expect(out.height).toBeCloseTo(60 * scale, 4);                 // 25.0   (was 33.33 pre-fix)
  });

  it('S39 P2 — letterboxed canvas (box wider than canvas aspect) uses uniform scale', () => {
    // Canvas 1920x1080 (aspect 1.778) into CSS 2000x800 (aspect 2.500).
    // Box wider → fits to HEIGHT (800), letterboxes left+right. fittedW = 800*1.778=1422,
    // letterbox bars X = (2000-1422)/2 = 289. Uniform scale = 800/1080 ≈ 0.741.
    const rect = { left: 0, top: 0, width: 2000, height: 800 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 100, 200, 60);
    const scale = 800 / 1080;
    const letterboxX = (2000 - 800 * (1920 / 1080)) / 2;
    expect(out.left).toBeCloseTo(letterboxX + 100 * scale, 3);
    expect(out.top).toBeCloseTo(100 * scale, 3);
    expect(out.width).toBeCloseTo(200 * scale, 3);
    expect(out.height).toBeCloseTo(60 * scale, 3);
  });
});

describe('S39 P2 — cssToCanvasCoords (BUG-B fix: avatar↔cursor alignment at edges)', () => {
  it('identity case (CSS box matches canvas size 1:1)', () => {
    const rect = { left: 0, top: 0, width: 1920, height: 1080 };
    expect(cssToCanvasCoords(rect, 1920, 1080, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(cssToCanvasCoords(rect, 1920, 1080, 960, 540)).toEqual({ x: 960, y: 540 });
    expect(cssToCanvasCoords(rect, 1920, 1080, 1920, 1080)).toEqual({ x: 1920, y: 1080 });
  });

  it('uniform aspect match (CSS smaller, same ratio): scales linearly without letterbox', () => {
    // 1280x720 CSS box, 1920x1080 canvas — aspect identical. No letterbox bars.
    const rect = { left: 0, top: 0, width: 1280, height: 720 };
    const center = cssToCanvasCoords(rect, 1920, 1080, 640, 360);
    expect(center.x).toBeCloseTo(960, 4);
    expect(center.y).toBeCloseTo(540, 4);
    const corner = cssToCanvasCoords(rect, 1920, 1080, 1280, 720);
    expect(corner.x).toBeCloseTo(1920, 4);
    expect(corner.y).toBeCloseTo(1080, 4);
  });

  it('letterboxed (taller box): cursor at visible canvas top maps to canvas y=0; visible bottom maps to canvas y=canvasH', () => {
    // The user-reported repro shape: 1280x900 viewport, 1920x1080 canvas.
    // Visible canvas content sits at CSS y=[90, 810] (90px letterbox bars top+bottom).
    const rect = { left: 0, top: 0, width: 1280, height: 900 };
    // Top edge of visible canvas content:
    const topEdge = cssToCanvasCoords(rect, 1920, 1080, 640, 90);
    expect(topEdge.x).toBeCloseTo(960, 3); // horizontal center
    expect(topEdge.y).toBeCloseTo(0, 3);   // top of canvas content
    // Bottom edge of visible canvas content:
    const botEdge = cssToCanvasCoords(rect, 1920, 1080, 640, 810);
    expect(botEdge.x).toBeCloseTo(960, 3);
    expect(botEdge.y).toBeCloseTo(1080, 3); // bottom of canvas content (was ~972 pre-fix — the bug)
    // Visual center maps to canvas center under BOTH old and new formulas
    // (the bug is invisible at center, max at the visible canvas edges).
    const center = cssToCanvasCoords(rect, 1920, 1080, 640, 450);
    expect(center.x).toBeCloseTo(960, 3);
    expect(center.y).toBeCloseTo(540, 3);
  });

  it('letterboxed (wider box): cursor at visible canvas left maps to canvas x=0; right maps to canvas x=canvasW', () => {
    // Reverse letterbox: 2000x800 box, 1920x1080 canvas. fittedW = 800 * 1920/1080 ≈ 1422.22,
    // letterbox bars X ≈ 288.89 each side. Use the precise value to avoid integer-pixel rounding.
    const rect = { left: 0, top: 0, width: 2000, height: 800 };
    const letterboxX = (2000 - 800 * (1920 / 1080)) / 2;
    const leftEdge = cssToCanvasCoords(rect, 1920, 1080, letterboxX, 400);
    expect(leftEdge.x).toBeCloseTo(0, 4);
    expect(leftEdge.y).toBeCloseTo(540, 4);
    const rightEdge = cssToCanvasCoords(rect, 1920, 1080, 2000 - letterboxX, 400);
    expect(rightEdge.x).toBeCloseTo(1920, 4);
    expect(rightEdge.y).toBeCloseTo(540, 4);
  });

  it('roundtrip: mapCanvasRectToPage ∘ cssToCanvasCoords ≈ identity on canvas-space points', () => {
    // Map a canvas-space point to CSS-space, then map back — must return the original
    // canvas point under any aspect (matched OR letterboxed).
    const cases: Array<{ rect: { left: number; top: number; width: number; height: number }; pts: [number, number][] }> = [
      { rect: { left: 0, top: 0, width: 1280, height: 720 }, pts: [[0, 0], [960, 540], [1920, 1080], [100, 1000]] },     // matched aspect
      { rect: { left: 50, top: 30, width: 800, height: 600 }, pts: [[0, 0], [960, 540], [1920, 1080], [100, 1000]] },   // letterbox top/bot
      { rect: { left: 0, top: 0, width: 2000, height: 800 }, pts: [[0, 0], [960, 540], [1920, 1080], [100, 1000]] },     // letterbox left/right
    ];
    for (const { rect, pts } of cases) {
      for (const [cx, cy] of pts) {
        const css = mapCanvasRectToPage(rect, 1920, 1080, cx, cy, 0, 0);
        const back = cssToCanvasCoords(rect, 1920, 1080, css.left, css.top);
        expect(back.x).toBeCloseTo(cx, 3);
        expect(back.y).toBeCloseTo(cy, 3);
      }
    }
  });

  it('subtracts canvas rect offset (left/top) from CSS coords', () => {
    const rect = { left: 100, top: 50, width: 1920, height: 1080 };
    const out = cssToCanvasCoords(rect, 1920, 1080, 100, 50); // top-left of canvas content
    expect(out.x).toBeCloseTo(0, 4);
    expect(out.y).toBeCloseTo(0, 4);
  });

  it('degenerate input: zero-width rect returns origin (no NaN)', () => {
    const rect = { left: 0, top: 0, width: 0, height: 0 };
    const out = cssToCanvasCoords(rect, 1920, 1080, 50, 50);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('S16 P1 — JOIN_INPUT_RECT canvas-space coords', () => {
  it('matches the original Pixi joinInputBg rect coords (left edge of JOIN pane code area)', () => {
    // Sanity check that the exported constant is still wired to the same
    // canvas-space rectangle the Pixi joinInputBg was drawn at.
    expect(JOIN_INPUT_RECT.w).toBeGreaterThan(0);
    expect(JOIN_INPUT_RECT.h).toBe(60);
    expect(JOIN_INPUT_RECT.x).toBeGreaterThan(0);
    expect(JOIN_INPUT_RECT.y).toBeGreaterThan(0);
  });
});

describe('S17 P0\' — button positioning regression (Connect off-screen bug)', () => {
  // S16 P1 shipped with a double-offset positioning bug: the Connect
  // button + Host button + host code-text had position.set() called with
  // ABSOLUTE canvas coords but were children of relative-positioned pane
  // Containers. Effective stage position = pane.position + child.position
  // → Connect at (2090, 940), 170px past the canvas right edge. User
  // typed the code, then had no visible button to click. These tests
  // regression-guard the fix (pane-relative coords for all three).

  it('Connect button stays fully inside canvas bounds', () => {
    const join = getJoinPaneOrigin();
    const b = getConnectButtonCanvasBounds(join.x, join.y);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(b.y + b.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('Connect button regression: did NOT regress to off-screen (2090,940) position', () => {
    // Witness against the original bug: prior buggy code computed
    // effective stage x = joinPaneX*2 + PANE_WIDTH/2 - BUTTON_WIDTH/2 = 2090.
    // Post-fix the helper returns ~1110 (inside canvas).
    const join = getJoinPaneOrigin();
    const b = getConnectButtonCanvasBounds(join.x, join.y);
    expect(b.x).toBeLessThan(2000);     // strictly inside canvas right edge
    expect(b.x + b.w).toBeLessThan(CANVAS_WIDTH);
  });

  it('Host button stays fully inside canvas bounds', () => {
    const host = getHostPaneOrigin();
    const b = getHostButtonCanvasBounds(host.x, host.y);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(b.y + b.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('Host code-text stays inside canvas bounds', () => {
    const host = getHostPaneOrigin();
    const pos = getHostCodeTextCanvasPos(host.x, host.y);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(CANVAS_WIDTH);
    expect(pos.y).toBeLessThan(CANVAS_HEIGHT);
  });

  it('Host + Join buttons positioned symmetrically on opposite sides of canvas center', () => {
    const host = getHostPaneOrigin();
    const join = getJoinPaneOrigin();
    const hostBtn = getHostButtonCanvasBounds(host.x, host.y);
    const joinBtn = getConnectButtonCanvasBounds(join.x, join.y);
    // Buttons share the same y (paneY + 220).
    expect(hostBtn.y).toBe(joinBtn.y);
    // Host button center-x sits left of canvas center; Join button center-x sits right.
    const hostCenterX = hostBtn.x + hostBtn.w / 2;
    const joinCenterX = joinBtn.x + joinBtn.w / 2;
    expect(hostCenterX).toBeLessThan(CANVAS_WIDTH / 2);
    expect(joinCenterX).toBeGreaterThan(CANVAS_WIDTH / 2);
    // Distance from center identical (symmetry).
    expect(Math.abs(CANVAS_WIDTH / 2 - hostCenterX))
      .toBeCloseTo(Math.abs(joinCenterX - CANVAS_WIDTH / 2), 6);
  });
});

describe('S69 P2 — getSeatRect (6-seat 2x3 rack layout)', () => {
  const rects = Array.from({ length: MAX_PLAYERS }, (_, i) => getSeatRect(i));

  it('produces MAX_PLAYERS in-bounds rects', () => {
    expect(rects).toHaveLength(MAX_PLAYERS);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('no two seats overlap', () => {
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const ra = rects[a];
        const rb = rects[b];
        const disjoint =
          ra.x + ra.w <= rb.x ||
          rb.x + rb.w <= ra.x ||
          ra.y + ra.h <= rb.y ||
          rb.y + rb.h <= ra.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  it('lays out row-major 2x3: seats 0-2 top row, 3-5 bottom row', () => {
    expect(rects[0].y).toBe(rects[1].y);
    expect(rects[1].y).toBe(rects[2].y);
    expect(rects[3].y).toBe(rects[4].y);
    expect(rects[4].y).toBe(rects[5].y);
    expect(rects[3].y).toBeGreaterThan(rects[0].y);
    expect(rects[0].x).toBeLessThan(rects[1].x);
    expect(rects[1].x).toBeLessThan(rects[2].x);
    expect(rects[0].x).toBe(rects[3].x); // same column across rows shares x
  });

  it('all seats share identical dimensions', () => {
    for (const r of rects) {
      expect(r.w).toBe(rects[0].w);
      expect(r.h).toBe(rects[0].h);
    }
  });
});
