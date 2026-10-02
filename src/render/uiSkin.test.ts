/**
 * S194 T5 — the skin's CONTRACT, proven geometrically: nothing it draws leaves the rect it was handed,
 * nothing it fills is opaque, and the same input draws the same thing (no hidden randomness).
 *
 * This is what lets every surface keep its own fill-count pin unchanged: the skin is decoration INSIDE
 * an already-hit-tested plate, never a surface of its own. If a future tweak pushes a glow outside the
 * plate, the player would see a lit pixel that does not take the click — this file goes red first.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SKIN_SHEEN_MS, shade, skinBase, skinButtonFx, skinIcon, skinPanelFx,
  type SkinGraphics, type SkinIconKind, type SkinState,
} from './uiSkin.ts';

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Op { kind: 'fill' | 'stroke'; alpha: number; width: number; boxes: Box[] }

/** Records each shape's bounding box, and which fill/stroke consumed it. */
function recorder(): SkinGraphics & { ops: Op[]; calls: string[] } {
  let pending: Box[] = [];
  let pen: [number, number] | null = null;
  const ops: Op[] = [];
  const calls: string[] = [];
  const add = (b: Box): void => { pending.push(b); };
  const g: SkinGraphics & { ops: Op[]; calls: string[] } = {
    ops,
    calls,
    roundRect(x, y, w, h) { calls.push(`rr${x},${y},${w},${h}`); add({ x0: x, y0: y, x1: x + w, y1: y + h }); return g; },
    rect(x, y, w, h) { calls.push(`r${x},${y},${w},${h}`); add({ x0: x, y0: y, x1: x + w, y1: y + h }); return g; },
    circle(x, y, r) { calls.push(`c${x},${y},${r}`); add({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }); return g; },
    poly(p) {
      calls.push(`p${p.join(',')}`);
      const xs = p.filter((_, i) => i % 2 === 0);
      const ys = p.filter((_, i) => i % 2 === 1);
      add({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
      return g;
    },
    moveTo(x, y) { calls.push(`m${x},${y}`); pen = [x, y]; add({ x0: x, y0: y, x1: x, y1: y }); return g; },
    lineTo(x, y) {
      calls.push(`l${x},${y}`);
      const [px, py] = pen ?? [x, y];
      add({ x0: Math.min(px, x), y0: Math.min(py, y), x1: Math.max(px, x), y1: Math.max(py, y) });
      pen = [x, y];
      return g;
    },
    fill(s) { calls.push(`F${s.color},${s.alpha}`); ops.push({ kind: 'fill', alpha: s.alpha ?? 1, width: 0, boxes: pending }); pending = []; return g; },
    stroke(s) { calls.push(`S${s.color},${s.alpha},${s.width}`); ops.push({ kind: 'stroke', alpha: s.alpha ?? 1, width: s.width ?? 1, boxes: pending }); pending = []; pen = null; return g; },
  };
  return g;
}

function assertInside(g: ReturnType<typeof recorder>, x: number, y: number, w: number, h: number, label: string): void {
  const EPS = 1e-6;
  for (const op of g.ops) {
    const half = op.kind === 'stroke' ? op.width / 2 : 0;
    for (const b of op.boxes) {
      expect(b.x0 - half, `${label}: left edge`).toBeGreaterThanOrEqual(x - EPS);
      expect(b.y0 - half, `${label}: top edge`).toBeGreaterThanOrEqual(y - EPS);
      expect(b.x1 + half, `${label}: right edge`).toBeLessThanOrEqual(x + w + EPS);
      expect(b.y1 + half, `${label}: bottom edge`).toBeLessThanOrEqual(y + h + EPS);
    }
  }
}

const STATES: SkinState[] = ['rest', 'hover', 'press', 'disabled', 'active'];
const RECTS: Array<[number, number, number, number, number]> = [
  // x, y, w, h, radius — the real sizes the sites use (footer chip, Ra square, castle row, title button, card action)
  [701, 1015, 62, 46, 8],
  [100, 200, 44, 44, 4],
  [12, 300, 248, 44, 6],
  [-215, -36, 430, 72, 12],
  [0, 0, 30, 30, 6],
  [5, 5, 8, 8, 6],
];

describe('S194 uiSkin — the button overlay stays inside its plate', () => {
  for (const [x, y, w, h, r] of RECTS) {
    for (const state of STATES) {
      for (const t of [undefined, 0, 400, 800, 1200, 1599, 123456]) {
        it(`${w}x${h} r${r} ${state} t=${t}`, () => {
          const g = recorder();
          skinButtonFx(g, x, y, w, h, { accent: 0x44aaff, state, radius: r, t });
          assertInside(g, x, y, w, h, `${w}x${h} ${state}`);
          for (const op of g.ops) if (op.kind === 'fill') expect(op.alpha, 'skin fills are translucent').toBeLessThan(1);
        });
      }
    }
  }

  it('the sheen actually draws while hovered (non-vacuous), and not at rest', () => {
    const hov = recorder();
    skinButtonFx(hov, 0, 0, 248, 44, { accent: 0x44aaff, state: 'hover', radius: 6, t: SKIN_SHEEN_MS / 2 });
    expect(hov.calls.some((c) => c.startsWith('p'))).toBe(true);
    const rest = recorder();
    skinButtonFx(rest, 0, 0, 248, 44, { accent: 0x44aaff, state: 'rest', radius: 6, t: SKIN_SHEEN_MS / 2 });
    expect(rest.calls.some((c) => c.startsWith('p'))).toBe(false);
  });

  it('press SINKS: the bottom lip is drawn at rest and not when pressed', () => {
    const lip = (s: SkinState): boolean => {
      const g = recorder();
      skinButtonFx(g, 0, 0, 100, 40, { accent: 0x44aaff, state: s, radius: 6 });
      return g.calls.some((c) => c.startsWith('r6,36,'));
    };
    expect(lip('rest')).toBe(true);
    expect(lip('press')).toBe(false);
  });

  it('disabled DESATURATES: no gloss, no studs, no accent glow', () => {
    const g = recorder();
    skinButtonFx(g, 0, 0, 100, 40, { accent: 0x44aaff, state: 'disabled', radius: 6 });
    expect(g.calls.some((c) => c.startsWith(`S${0x44aaff}`))).toBe(false);
    expect(g.calls.some((c) => c.startsWith('c'))).toBe(false);
  });

  it('is deterministic: the same inputs draw the same calls', () => {
    const a = recorder();
    const b = recorder();
    skinButtonFx(a, 3, 4, 120, 40, { accent: 0x123456, state: 'hover', radius: 8, t: 777 });
    skinButtonFx(b, 3, 4, 120, 40, { accent: 0x123456, state: 'hover', radius: 8, t: 777 });
    expect(a.calls).toEqual(b.calls);
  });
});

describe('S194 uiSkin — the panel overlay and icons stay inside their boxes', () => {
  for (const [x, y, w, h] of [[0, 0, 268, 600], [600, 380, 559, 270], [10, 10, 30, 30], [0, 0, 420, 300]] as const) {
    for (const header of [0, 28, 40]) {
      it(`panel ${w}x${h} header ${header}`, () => {
        const g = recorder();
        skinPanelFx(g, x, y, w, h, 0xff4466, header, 8);
        assertInside(g, x, y, w, h, 'panel');
        for (const op of g.ops) if (op.kind === 'fill') expect(op.alpha).toBeLessThan(1);
      });
    }
  }

  const KINDS: SkinIconKind[] = [
    'hp', 'atk', 'def', 'pen', 'mres', 'regen', 'speed', 'gatherer', 'fix', 'scrap',
    'feed', 'exit', 'play', 'bots', 'globe', 'book', 'star', 'check', 'back',
  ];
  for (const kind of KINDS) {
    for (const size of [12, 16, 22, 34]) {
      it(`icon ${kind} @${size} stays in its box and is strokes only`, () => {
        const g = recorder();
        skinIcon(g, kind, 50, 50, size, 0xffffff);
        expect(g.ops.length, 'drew something').toBeGreaterThan(0);
        assertInside(g, 50 - size / 2, 50 - size / 2, size, size, `${kind}@${size}`);
        expect(g.ops.every((o) => o.kind === 'stroke'), 'an icon is never a filled surface').toBe(true);
      });
    }
  }
});

describe('S194 uiSkin — palette helpers', () => {
  it('shade moves toward white / black and clamps', () => {
    expect(shade(0x000000, 1)).toBe(0xffffff);
    expect(shade(0xffffff, -1)).toBe(0x000000);
    expect(shade(0x808080, 0)).toBe(0x808080);
    expect(shade(0x000000, 5)).toBe(0xffffff);
  });
  it('skinBase distinguishes every state, and primary from plain', () => {
    const plain = STATES.map((s) => skinBase(s));
    expect(new Set([plain[0], plain[1], plain[2], plain[3]]).size).toBe(4);
    expect(skinBase('rest', true)).not.toBe(skinBase('rest'));
  });
  it('⛔ no Math.random and no Date in the skin (render clock comes from the caller)', () => {
    const src = readFileSync(new URL('./uiSkin.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
