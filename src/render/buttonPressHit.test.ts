/**
 * SPARK — S194 (T8): a PRESSED button's click target is still the whole plate at rest.
 *
 * Arithmetic: the press scales the container to 0.97 about its pivot. BACK TO MAIN is 168 px wide and
 * drawn from its top-left, so at 0.97 its unscaled hit rect spans 162.96 px on screen and a release at
 * 165 (3 px inside the right edge) misses — `pointerupoutside`, no tap (deploy #22's flake, and a dead
 * ≈5 px strip for a person). `hitRectAtScale` divides the rect by the scale about the pivot so the
 * on-screen target is exactly the rest plate.
 *
 * REACH: a real Pixi `Container`, wired by the real `attachButtonFeedback`, pressed through its own
 * `pointerdown` handler; the release point is mapped through the container's own transform and tested
 * against its own `hitArea` — the same two steps Pixi's EventBoundary takes. The browser half is
 * `e2e/button-press-edge.spec.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Point, type Rectangle } from 'pixi.js';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}) }));

import { attachButtonFeedback, BUTTON_HOVER_SCALE, BUTTON_PRESS_SCALE, hitRectAtScale } from './buttonFeedback.ts';
import { EXIT_BTN_H, EXIT_BTN_W, EXIT_BTN_X, EXIT_BTN_Y } from './exitButton.ts';

/** Does a SCREEN point hit the container, the way Pixi decides it (transform⁻¹, then hitArea)? */
function hits(c: Container, x: number, y: number): boolean {
  c.updateLocalTransform();
  const local = c.localTransform.applyInverse(new Point(x, y));
  return (c.hitArea as Rectangle).contains(local.x, local.y);
}

function exitLike(): Container {
  const c = new Container();
  c.position.set(EXIT_BTN_X, EXIT_BTN_Y);
  attachButtonFeedback(c, new Graphics(), () => {}, { hit: { x: 0, y: 0, w: EXIT_BTN_W, h: EXIT_BTN_H } });
  return c;
}

const midY = EXIT_BTN_Y + EXIT_BTN_H / 2;
const rightInside = EXIT_BTN_X + EXIT_BTN_W - 3;
const rightOutside = EXIT_BTN_X + EXIT_BTN_W + 3;

describe('S194 T8 — hitRectAtScale (arithmetic)', () => {
  it('at or above rest it is the plate rect unchanged (hover grows with the picture)', () => {
    const hit = { x: 0, y: 0, w: 168, h: 34 };
    expect(hitRectAtScale(hit, 1)).toBe(hit);
    expect(hitRectAtScale(hit, BUTTON_HOVER_SCALE)).toBe(hit);
  });

  it('below rest, × scale lands exactly on the rest footprint — top-left origin and centred pivot', () => {
    const s = BUTTON_PRESS_SCALE;
    const r = hitRectAtScale({ x: 0, y: 0, w: 168, h: 34 }, s);
    expect(r.w * s).toBeCloseTo(168, 9);
    expect(r.h * s).toBeCloseTo(34, 9);
    // codexOverlay's close button: pivot (50, 18), rect 0..100 × 0..36 — about the pivot.
    const p = { x: 50, y: 18 };
    const c = hitRectAtScale({ x: 0, y: 0, w: 100, h: 36 }, s, p);
    expect(p.x + (c.x - p.x) * s).toBeCloseTo(0, 9);
    expect(p.x + (c.x + c.w - p.x) * s).toBeCloseTo(100, 9);
    expect(p.y + (c.y - p.y) * s).toBeCloseTo(0, 9);
    expect(p.y + (c.y + c.h - p.y) * s).toBeCloseTo(36, 9);
  });
});

describe('S194 T8 — REACH: a real Container pressed through its own handler', () => {
  it('⭐ a release 3 px inside the right edge of a PRESSED exit button still hits it', () => {
    const c = exitLike();
    c.emit('pointerover', undefined as never);
    c.emit('pointerdown', undefined as never);
    expect(c.scale.x, 'fixture: the press scale is applied').toBe(BUTTON_PRESS_SCALE);
    expect(hits(c, rightInside, midY)).toBe(true);
    expect(hits(c, EXIT_BTN_X + 3, midY), 'and the left edge').toBe(true);
  });

  it('negative: 3 px OUTSIDE the right edge does not hit, pressed or at rest', () => {
    const c = exitLike();
    expect(hits(c, rightOutside, midY)).toBe(false);
    c.emit('pointerdown', undefined as never);
    expect(hits(c, rightOutside, midY)).toBe(false);
  });

  it('released: back at rest the target is the plate rect again', () => {
    const c = exitLike();
    c.emit('pointerdown', undefined as never);
    c.emit('pointerupoutside', undefined as never);
    const r = c.hitArea as Rectangle;
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, EXIT_BTN_W, EXIT_BTN_H]);
  });
});
