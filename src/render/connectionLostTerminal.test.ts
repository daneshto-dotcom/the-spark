/**
 * ⛔ S192 SEAM-1 (audit wf_0593f6fe-d53, MED) — the terminal CONNECTION LOST line must not tell a player to
 * "return to title to retry" while the C4 loop is still retrying for him (Return to Title ENDS the retry).
 * Driven through the real overlay factory; the plan's flags come from `planConnectionFrame` (connectionFrame.test.ts).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Container, Text, type Application } from 'pixi.js';
import { makeConnectionLostOverlay } from './connectionLostOverlay.ts';

/* Node has no canvas; Pixi measures text through one. Same stand-in as draftOverlay.test.ts. */
class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}
vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
afterAll(() => {
  vi.unstubAllGlobals();
});

function overlay() {
  const stage = new Container();
  const app = { stage } as unknown as Application;
  const h = makeConnectionLostOverlay(app, () => {});
  const texts = h.container.children.filter((c): c is Text => c instanceof Text);
  return { h, title: () => texts[0]!.text, help: () => texts[1]!.text };
}

describe('S192 SEAM-1 — the terminal overlay says what the loop is doing', () => {
  it('⛔ a client still retrying: CONNECTION LOST, "still reconnecting — or return to title"', () => {
    const o = overlay();
    o.h.setReconnecting(true, 3);
    o.h.setTerminal(true, false);
    expect(o.title()).toBe('CONNECTION LOST');
    expect(o.help()).toBe('still reconnecting — or return to title');
    expect(o.help(), 'never the instruction that ends the retry').not.toContain('to retry');
  });

  it('⛔ a host still waiting: "waiting for the other player to reconnect — or return to title"', () => {
    const o = overlay();
    o.h.setTerminal(false, true);
    expect(o.title()).toBe('CONNECTION LOST');
    expect(o.help()).toBe('waiting for the other player to reconnect — or return to title');
  });

  it('NEGATIVE — given up (or nothing retrying): the old line, which is then true', () => {
    const o = overlay();
    o.h.setTerminal(true, false);
    o.h.setTerminal(false, false);
    expect(o.help()).toBe('peer dropped — return to title to retry');
  });

  it('…and back to RECONNECTING / MIGRATING still repaints both lines', () => {
    const o = overlay();
    o.h.setTerminal(true, false);
    o.h.setReconnecting(true, 5);
    expect(o.title()).toBe('RECONNECTING…');
    expect(o.help()).toBe('connection dropped — retrying automatically (5s)');
    o.h.setTerminal(false, false);
    o.h.setMigrating(7);
    expect(o.title()).toBe('MIGRATING…');
  });
});
