/**
 * S194 T5 — REACH for the CONTAINER buttons (exit button + its confirm modal, and every other
 * `attachButtonFeedback` site that gains `attachHoverSheen`): the hover sheen is drawn only while the
 * pointer is over the button, lies inside the button's hit rect (the rest-size plate), stops when the
 * pointer leaves, and stops by itself if the button is hidden under the pointer.
 *
 * ⚠ T8 (S194) owns the scale/hit-rect seam in `buttonFeedback.ts`; this file never asserts on scale,
 * only on the rest-size rectangle the button was given.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Rectangle, Ticker } from 'pixi.js';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { attachHoverSheen } from './uiSkinButton.ts';
import { makeExitButton } from './exitButton.ts';
import { TitleScreen } from './titleScreen.ts';

installFakeTextCanvas();
// The shared ticker auto-starts on its first listener; node has no animation frame, so give it a no-op one.
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

function sheenOf(c: Container): Graphics {
  const g = c.getChildByLabel('sheen');
  if (g === null) throw new Error('no sheen child');
  return g as Graphics;
}

/** Every hovered button: sweep the sheen through a whole period and check it never leaves the hit rect. */
function sweepInside(c: Container): void {
  const hit = c.hitArea as Rectangle;
  expect(hit, 'the button has an explicit hit rect').toBeInstanceOf(Rectangle);
  c.emit('pointerover', {} as never);
  let drew = 0;
  for (let k = 0; k < 40; k++) {
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    const g = sheenOf(c);
    if (g.context.instructions.length === 0) continue;
    drew++;
    const b = g.bounds;
    expect(b.minX).toBeGreaterThanOrEqual(hit.x);
    expect(b.minY).toBeGreaterThanOrEqual(hit.y);
    expect(b.maxX).toBeLessThanOrEqual(hit.x + hit.width);
    expect(b.maxY).toBeLessThanOrEqual(hit.y + hit.height);
  }
  expect(drew, 'the sheen actually swept while hovered').toBeGreaterThan(5);
  c.emit('pointerout', {} as never);
  expect(sheenOf(c).context.instructions.length, 'cleared on pointerout').toBe(0);
}

/** Every button container under `root` that carries a sheen. */
function sheenButtons(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    if (n.getChildByLabel('sheen') !== null) out.push(n);
    for (const ch of n.children) walk(ch as Container);
  };
  walk(root);
  return out;
}

describe('S194 T5 — container-button hover sheen', () => {
  it('attachHoverSheen: draws only while hovered, inside the rect; nothing at rest', () => {
    const c = new Container();
    c.hitArea = new Rectangle(0, 0, 240, 52);
    attachHoverSheen(c, { x: 0, y: 0, w: 240, h: 52 }, 10);
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    expect(sheenOf(c).context.instructions.length, 'no sheen at rest').toBe(0);
    sweepInside(c);
  });

  it('a button hidden under the pointer stops its own sheen (no orphaned ticker work)', () => {
    const parent = new Container();
    const c = new Container();
    parent.addChild(c);
    c.hitArea = new Rectangle(0, 0, 100, 40);
    attachHoverSheen(c, { x: 0, y: 0, w: 100, h: 40 }, 8);
    c.emit('pointerover', {} as never);
    Ticker.shared.update(Ticker.shared.lastTime + 400);
    parent.visible = false;
    const before = Ticker.shared.count;
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    expect(Ticker.shared.count).toBe(before - 1);
    expect(sheenOf(c).context.instructions.length).toBe(0);
  });

  it('the exit button, LEAVE and KEEP PLAYING: each sheen stays inside its own hit rect', () => {
    const stage = new Container();
    makeExitButton({ stage } as never, () => {});
    const buttons = sheenButtons(stage);
    expect(buttons.length, 'exit + leave + keep').toBe(3);
    for (const b of buttons) {
      // The modal (and the hidden root) must be on screen for a hover to mean anything.
      for (let n: Container | null = b; n !== null; n = n.parent) n.visible = true;
      sweepInside(b);
    }
  });

  it('the five TITLE buttons: each sheen stays inside its own (centred) hit rect', () => {
    const stage = new Container();
    const t = new TitleScreen({ stage } as never, {
      onSoloSelected() {}, on1v1Selected() {}, onVsBotsSelected() {}, onCodexSelected() {}, onArcadeSelected() {},
    });
    t.container.visible = true;
    const buttons = sheenButtons(t.container);
    expect(buttons.length).toBe(5);
    for (const b of buttons) {
      const hit = b.hitArea as Rectangle;
      expect([hit.x, hit.y], 'centred origin, as the factory draws').toEqual([-hit.width / 2, -hit.height / 2]);
      sweepInside(b);
    }
  });
});
