/**
 * SPARK — S155 P2: the shared button grammar.
 *
 * The owner has reported "I cannot tell whether my click registered" twice, about two different
 * screens (S152 A5 title, S155 back-to-main). The second report happened because the first fix was
 * left inline in `titleScreen.ts` instead of shared, so a whole other screen never got it. Extracting
 * it is only half the answer — the other half is a test, so the next screen cannot quietly ship
 * without the feel, and so a future tune moves every button together.
 *
 * Driven against a stub rather than Pixi: `attachButtonFeedback` takes a narrow structural interface
 * precisely so the grammar is verifiable with no WebGL, the same reason `lobbyStateMachine.ts` is a
 * pure reducer.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  attachButtonFeedback,
  BUTTON_HOVER_SCALE,
  BUTTON_HOVER_TINT,
  BUTTON_PRESS_SCALE,
  BUTTON_REST_SCALE,
  BUTTON_REST_TINT,
} from './buttonFeedback.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}) }));

/** A representative button rect. Origin is non-zero on purpose — it must be honoured verbatim. */
const HIT = { hit: { x: -12, y: -5, w: 200, h: 48 } } as const;

/** A fake Container: records handlers so a test can fire them, and the last scale set. */
function stub() {
  const handlers = new Map<string, () => void>();
  const target = {
    eventMode: undefined as string | undefined,
    cursor: undefined as string | null | undefined,
    hitArea: undefined as unknown,
    scaleValue: BUTTON_REST_SCALE,
    scale: {
      set(v: number) {
        target.scaleValue = v;
      },
    },
    on(ev: string, fn: () => void) {
      handlers.set(ev, fn);
      return target;
    },
  };
  const bg = { tint: BUTTON_REST_TINT };
  const fire = (ev: string): void => {
    const h = handlers.get(ev);
    if (h === undefined) throw new Error(`no handler registered for ${ev}`);
    h();
  };
  return { target, bg, fire, handlers };
}

describe('S155 P2 — attachButtonFeedback makes a button answer', () => {
  it('makes the target interactive at all (the bare minimum the old lobby buttons had)', () => {
    const { target, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    expect(target.eventMode).toBe('static');
    expect(target.cursor).toBe('pointer');
  });

  it('HOVER pops AND highlights — the brighten alone was measured invisible in S152', () => {
    const { target, bg, fire } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    fire('pointerover');
    expect(target.scaleValue).toBe(BUTTON_HOVER_SCALE);
    expect(bg.tint).toBe(BUTTON_HOVER_TINT);
    expect(BUTTON_HOVER_SCALE).toBeGreaterThan(BUTTON_REST_SCALE); // it POPS OUT, not just brightens
    fire('pointerout');
    expect(target.scaleValue).toBe(BUTTON_REST_SCALE);
    expect(bg.tint).toBe(BUTTON_REST_TINT);
  });

  it('⭐ PRESS sinks BELOW rest — the half that answers "did my click register"', () => {
    const { target, bg, fire } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    fire('pointerdown');
    expect(target.scaleValue).toBe(BUTTON_PRESS_SCALE);
    expect(BUTTON_PRESS_SCALE).toBeLessThan(BUTTON_REST_SCALE);
  });

  it('release while still hovered returns to HOVER, not flat — the gesture stays continuous', () => {
    const { target, fire, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    fire('pointerover');
    fire('pointerdown');
    fire('pointerup');
    expect(target.scaleValue).toBe(BUTTON_HOVER_SCALE);
  });

  it('release after leaving returns to REST', () => {
    const { target, fire, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    fire('pointerover');
    fire('pointerdown');
    fire('pointerout');
    fire('pointerup');
    expect(target.scaleValue).toBe(BUTTON_REST_SCALE);
  });

  it('⚠ pointerupoutside resets the scale — a button stuck depressed is worse than no press state', () => {
    // Carried over verbatim from the S152 warning, because it is the one non-obvious handler and the
    // one whose absence leaves a permanent visual lie on screen.
    const { target, fire, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    fire('pointerover');
    fire('pointerdown');
    fire('pointerupoutside');
    expect(target.scaleValue).toBe(BUTTON_REST_SCALE);
  });

  it('registers the tap itself, so a call site cannot forget the click sound', () => {
    const { target, bg, fire, handlers } = stub();
    const onClick = vi.fn();
    attachButtonFeedback(target, bg, onClick, HIT);
    expect(handlers.has('pointertap')).toBe(true);
    fire('pointertap');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('silent:true suppresses only the sound, never the click', () => {
    const { target, bg, fire } = stub();
    const onClick = vi.fn();
    attachButtonFeedback(target, bg, onClick, { ...HIT, silent: true });
    fire('pointertap');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('CANARY: the grammar constants are pinned', () => {
    // These four numbers ARE the feel. Pinned so a tune is a deliberate, reviewed edit rather than
    // something that drifts one screen at a time — which is how S155 came to exist.
    expect(BUTTON_REST_SCALE).toBe(1);
    expect(BUTTON_HOVER_SCALE).toBe(1.04);
    expect(BUTTON_PRESS_SCALE).toBe(0.97);
    expect(BUTTON_HOVER_TINT).toBe(0xbfd4ff);
  });

  it('⭐ S155 N4 — sets an explicit hitArea so the WHOLE button is clickable', () => {
    /*
     * Owner: *"not the whole of them was clickable"* / *"not on side of the button clickable and 40%
     * or the right part of it is not"*.
     *
     * ⛔ THE CAUSE: a Pixi container with eventMode 'static' and NO hitArea is hit-tested by walking
     * its CHILDREN. So the clickable region was the union of the plate and the TEXT — not the plate,
     * not stable, and it moved whenever the hover grammar scaled the container to 1.04. An explicit
     * hitArea replaces child-bounds testing outright.
     */
    const { target, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    const ha = target.hitArea as { x: number; y: number; width: number; height: number };
    expect(ha, 'a button with no hitArea is the bug').not.toBeUndefined();
    expect(ha.x).toBe(HIT.hit.x);
    expect(ha.y).toBe(HIT.hit.y);
    expect(ha.width).toBe(HIT.hit.w);
    expect(ha.height).toBe(HIT.hit.h);
  });

  it('the hitArea covers the FULL rect — every corner is inside, just outside is not', () => {
    // The property the owner actually cares about, asserted on the shape rather than on its fields.
    const { target, bg } = stub();
    attachButtonFeedback(target, bg, () => {}, HIT);
    const ha = target.hitArea as { contains(x: number, y: number): boolean };
    const { x, y, w, h } = HIT.hit;
    for (const [px, py] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1],
                            [x + w / 2, y + h / 2]] as const) {
      expect(ha.contains(px, py), `(${px},${py}) must be clickable`).toBe(true);
    }
    expect(ha.contains(x - 2, y + h / 2), 'left of the plate must NOT be clickable').toBe(false);
    expect(ha.contains(x + w + 2, y + h / 2), 'right of the plate must NOT be clickable').toBe(false);
  });

  it('⛔ CANARY: every attachButtonFeedback call in src/render passes a hit rect', () => {
    /*
     * The structural half. A required parameter already makes tsc reject an omission, but this also
     * catches the subtler regression — a call site that satisfies the type with a rect it does not
     * actually mean (e.g. copy-pasted from a differently-sized button). Any NEW button shows up here.
     */
    const files = ['exitButton.ts', 'lobbyScreen.ts', 'titleScreen.ts'];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      const calls = src.split('attachButtonFeedback(').length - 1;
      const hits = src.split('hit: {').length - 1;
      expect(hits, `${f}: ${calls} attachButtonFeedback call(s) but ${hits} hit rect(s)`).toBe(calls);
    }
  });
});
