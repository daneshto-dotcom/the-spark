/**
 * ⭐ S195 T18 #2 — REACH for the CODEX (census rows: tabs + CLOSE via `attachButtonFeedback`, combo tiles via
 * `attachChipHover`), through a real `CodexOverlay`: each tab / CLOSE button's sheen is handed exactly its
 * `hitArea` and sweeps inside it; a click just inside each edge of a combo tile is that tile by Pixi's own
 * children-bounds rule and just outside is not; the tile's sheen sweeps inside the tile. The tile skin is
 * a STILL plate (`skinStaticPlate`) laid inside the same rect.
 */
// CENSUS-REACH src/render/codexOverlay.ts :: attachButtonFeedback(
// CENSUS-REACH src/render/codexOverlay.ts :: tile.
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Ticker } from 'pixi.js';
import 'pixi.js/events';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { sheenRectOf } from './uiSkinButton.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));
installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

const { CodexOverlay } = await import('./codexOverlay.ts');

function sheened(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    if (sheenRectOf(n) !== undefined) out.push(n);
    for (const ch of n.children) walk(ch as Container);
  };
  walk(root);
  return out;
}

/** Pixi's rule: an explicit hitArea decides alone; else any visible, interactive Graphics child containing the point. */
function takes(b: Container, x: number, y: number): boolean {
  const ha = b.hitArea as { contains(x: number, y: number): boolean } | null | undefined;
  if (ha != null) return ha.contains(x, y);
  return b.children.some((c) => c instanceof Graphics && c.visible && c.eventMode !== 'none' && c.label !== 'sheen' && c.label !== 'press'
    && c.containsPoint({ x: x - c.position.x, y: y - c.position.y }));
}

function sweep(b: Container, label: string): void {
  const r = sheenRectOf(b)!;
  const sheen = b.getChildByLabel('sheen') as Graphics;
  b.emit('pointerover', {} as never);
  let drew = 0;
  for (let k = 0; k < 40; k++) {
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    if (sheen.context.instructions.length === 0) continue;
    drew++;
    const s = sheen.bounds;
    expect(s.minX >= r.x && s.minY >= r.y && s.maxX <= r.x + r.w && s.maxY <= r.y + r.h, `${label}: sheen inside`).toBe(true);
  }
  expect(drew, `${label}: the sheen swept`).toBeGreaterThan(5);
  b.emit('pointerout', {} as never);
  expect(sheen.context.instructions.length).toBe(0);
}

function codex(): InstanceType<typeof CodexOverlay> {
  const stage = new Container();
  const app = { stage, canvas: { addEventListener() {}, removeEventListener() {} }, ticker: { add() {}, remove() {} } };
  const c = new CodexOverlay(app as never, { towers: [] }, () => {});
  c.container.visible = true; // the sheen stops itself on a hidden surface — open it, as `open()` would on stage
  return c;
}

describe('S195 — codex: tabs + CLOSE (grammar buttons) and combo tiles (chips) are skinned on their click targets', () => {
  it('TOWERS / COMBOS tabs and CLOSE: sheen rect = hitArea; a click inside is taken and outside is not; the sheen sweeps inside', () => {
    const c = codex();
    const grammar = sheened(c.container).filter((b) => b.hitArea != null);
    expect(grammar.length, 'two tabs + CLOSE').toBe(3);
    for (const b of grammar) {
      const r = sheenRectOf(b)!;
      const ha = b.hitArea as unknown as { x: number; y: number; width: number; height: number };
      expect([r.x, r.y, r.w, r.h]).toEqual([ha.x, ha.y, ha.width, ha.height]);
      const e = 1.5;
      for (const [x, y] of [[r.x + e, r.y + r.h / 2], [r.x + r.w - e, r.y + r.h / 2], [r.x + r.w / 2, r.y + e], [r.x + r.w / 2, r.y + r.h - e]]) expect(takes(b, x!, y!)).toBe(true);
      for (const [x, y] of [[r.x - e, r.y + r.h / 2], [r.x + r.w + e, r.y + r.h / 2], [r.x + r.w / 2, r.y - e], [r.x + r.w / 2, r.y + r.h + e]]) expect(takes(b, x!, y!)).toBe(false);
      sweep(b, 'codex button');
    }
  });

  it('every combo tile on the COMBOS tab: Pixi\'s children-bounds hit takes the click inside the tile rect and refuses it outside; the sheen sweeps inside', () => {
    const c = codex();
    (c as unknown as { switchTab(t: string): void }).switchTab('combos');
    const tiles = sheened(c.container).filter((b) => b.hitArea == null);
    expect(tiles.length, 'the combo tiles (anti-vacuity)').toBeGreaterThan(5);
    for (const t of tiles) {
      const r = sheenRectOf(t)!;
      expect([r.x, r.y]).toEqual([0, 0]);
      const e = 2;
      for (const [x, y] of [[r.x + e, r.y + r.h / 2], [r.x + r.w - e, r.y + r.h / 2], [r.x + r.w / 2, r.y + e], [r.x + r.w / 2, r.y + r.h - e]]) expect(takes(t, x!, y!), `tile inside (${x},${y})`).toBe(true);
      for (const [x, y] of [[r.x - 3, r.y + r.h / 2], [r.x + r.w + 3, r.y + r.h / 2], [r.x + r.w / 2, r.y - 3], [r.x + r.w / 2, r.y + r.h + 3]]) expect(takes(t, x!, y!), `tile outside (${x},${y})`).toBe(false);
      sweep(t, 'combo tile');
    }
  });
});
