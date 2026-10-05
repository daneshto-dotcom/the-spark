/**
 * ⭐ S195 (owner N16) — REACH for the two re-seat controls the teams tree added, by T5's rule: the click lands
 * just inside each edge of the control's rect and NOT just outside, the sheen sweeps inside it while hovered,
 * the press is the CHIP press (`attachChipHover`), and the tap REALLY moves a seat.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/botSetupOverlay.ts :: cornerBtn.
// CENSUS-REACH src/render/seatRack.ts :: moveChip.on('pointertap'
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Ticker } from 'pixi.js';
import 'pixi.js/events';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { sheenRectOf } from './uiSkinButton.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));
installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 });
vi.stubGlobal('cancelAnimationFrame', () => {});

const { BotSetupOverlay } = await import('./botSetupOverlay.ts');
const { makeSeatRack, SEAT_MOVE_CHIP_RECT } = await import('./seatRack.ts');

function sheened(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    if (sheenRectOf(n) !== undefined) out.push(n);
    for (const ch of n.children) walk(ch as Container);
  };
  walk(root);
  return out;
}
const sameRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Pixi's rule: an explicit hitArea decides alone; else any visible, interactive Graphics child containing p. */
function takes(b: Container, x: number, y: number): boolean {
  const ha = b.hitArea as { contains(x: number, y: number): boolean } | null | undefined;
  if (ha != null) return ha.contains(x, y);
  return b.children.some((c) => c instanceof Graphics && c.visible && c.eventMode !== 'none' && c.label !== 'sheen'
    && c.containsPoint({ x: x - c.position.x, y: y - c.position.y }));
}

function insideOutside(b: Container, label: string): void {
  const r = sheenRectOf(b)!;
  const i = 3;
  for (const [x, y] of [[r.x + i, r.y + r.h / 2], [r.x + r.w - i, r.y + r.h / 2], [r.x + r.w / 2, r.y + i], [r.x + r.w / 2, r.y + r.h - i]]) {
    expect(takes(b, x!, y!), `${label}: inside at (${x},${y})`).toBe(true);
  }
  for (const [x, y] of [[r.x - i, r.y + r.h / 2], [r.x + r.w + i, r.y + r.h / 2], [r.x + r.w / 2, r.y - i], [r.x + r.w / 2, r.y + r.h + i]]) {
    expect(takes(b, x!, y!), `${label}: outside at (${x},${y})`).toBe(false);
  }
}

/** Hover: how many frames the sheen drew; asserts every drawn frame stays inside the rect; clears on out. */
function sweep(b: Container): number {
  const r = sheenRectOf(b)!;
  const sheen = b.getChildByLabel('sheen') as Graphics;
  b.emit('pointerover', {} as never);
  let drew = 0;
  for (let k = 0; k < 40; k++) {
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    if (sheen.context.instructions.length === 0) continue;
    drew++;
    const s = sheen.bounds;
    expect(s.minX >= r.x && s.minY >= r.y && s.maxX <= r.x + r.w && s.maxY <= r.y + r.h, 'sheen inside its rect').toBe(true);
  }
  b.emit('pointerout', {} as never);
  expect(sheen.context.instructions.length, 'cleared on pointerout').toBe(0);
  return drew;
}

function botOverlay(): { root: Container; o: InstanceType<typeof BotSetupOverlay> } {
  const stage = new Container();
  const o = new BotSetupOverlay({ stage, screen: { width: 1920, height: 1080 } } as never, { onStart() {}, onClose() {} } as never);
  const root = (o as unknown as { container: Container }).container;
  for (let n: Container | null = root; n !== null; n = n.parent) n.visible = true;
  return { root, o };
}

const CORNER_RECT = { x: -22, y: -22, w: 44, h: 44 };

describe('S195 N16 — the bot lobby board-corner buttons', () => {
  it('every row (YOU + 3 bots): inside takes the click, outside does not, the sheen sweeps; a tap moves that seat', () => {
    const { root, o } = botOverlay();
    const corners = sheened(root).filter((b) => sameRect(sheenRectOf(b)!, CORNER_RECT));
    expect(corners.length, 'one corner button per row').toBe(4);
    for (const [i, c] of corners.entries()) {
      insideOutside(c, `corner ${i}`);
      expect(sweep(c)).toBeGreaterThan(5);
    }
    expect(o.boardCorners()).toEqual([0, 1, 2, 3]);
    corners[0]!.emit('pointertap', {} as never);
    expect(o.boardCorners(), 'the YOU row moved one corner on (NW → NE)').toEqual([1, 0, 2, 3]);
  });
});

describe('S195 N16 — the multiplayer rack MOVE chip (host only)', () => {
  const seats = [
    { index: 0, color: 0xff0000, occupied: true, isHost: true, isYou: true, movable: true },
    { index: 1, color: 0x00ff00, occupied: true, isHost: false, isYou: false, movable: true },
  ];
  it('the host chips: inside takes the click, outside does not, the sheen sweeps; a tap reports that seat', () => {
    const moved: number[] = [];
    const rack = makeSeatRack(() => {}, () => {}, (s) => moved.push(s));
    rack.update(seats as never);
    const chips = sheened(rack.container).filter((b) => sameRect(sheenRectOf(b)!, SEAT_MOVE_CHIP_RECT) && b.visible && b.eventMode === 'static');
    expect(chips.length, 'one live MOVE chip per occupied seat').toBe(2);
    insideOutside(chips[1]!, 'move chip');
    expect(sweep(chips[1]!)).toBeGreaterThan(5);
    chips[1]!.emit('pointertap', { stopPropagation() {} } as never);
    expect(moved).toEqual([1]);
  });
  it('⛔ a joiner (not movable): no live MOVE chip at all', () => {
    const rack = makeSeatRack(() => {}, () => {}, () => {});
    rack.update(seats.map((s) => ({ ...s, movable: false })) as never);
    const live = sheened(rack.container).filter((b) => sameRect(sheenRectOf(b)!, SEAT_MOVE_CHIP_RECT) && b.visible);
    expect(live.length).toBe(0);
  });
});
