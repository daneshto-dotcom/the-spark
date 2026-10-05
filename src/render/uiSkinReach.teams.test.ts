/**
 * ⭐ S194 (owner: *"the whole 2v2 lobby. Both for bots and in multiplayer … the same UI beautification … that
 * all the current buttons … have"*) — REACH for every TEAM control T1 skinned, by T5's rule
 * (`uiSkinReach.chips.test.ts`): Pixi's own hit rule takes the click just inside each edge of the chip's rect
 * and NOT just outside (the skin moved no target), the sheen sweeps only inside that rect while hovered and
 * clears on pointerout, and an inert / refused control does not light.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/botSetupOverlay.ts :: teamBtn.
// CENSUS-REACH src/render/seatRack.ts :: teamChip.on('pointertap'
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

const { BotSetupOverlay, TEAM_CHIP_RECT } = await import('./botSetupOverlay.ts');
const { makeSeatRack, SEAT_TEAM_CHIP_RECT } = await import('./seatRack.ts');

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

describe('S194 teams — the VS-BOTS team chips wear T5\'s skin and keep their exact click target', () => {
  it('every row\'s TEAM chip (YOU + 3 bots): inside takes the click, outside does not, the sheen sweeps inside', () => {
    const { root } = botOverlay();
    const chips = sheened(root).filter((b) => sameRect(sheenRectOf(b)!, TEAM_CHIP_RECT));
    expect(chips.length, 'one team chip per row (you + 3 bots)').toBe(4);
    for (const c of chips) {
      expect(c.eventMode).toBe('static');
      insideOutside(c, 'bot team chip');
      expect(sweep(c), 'the sheen swept').toBeGreaterThan(5);
    }
  });

  it('a click cycles the pick and the chip repaints in place — same rect, still skinned', () => {
    const { root } = botOverlay();
    const chip = sheened(root).find((b) => sameRect(sheenRectOf(b)!, TEAM_CHIP_RECT))!;
    chip.emit('pointertap', {} as never);
    const t = chip.children.find((ch) => (ch as { text?: string }).text !== undefined) as unknown as { text: string };
    expect(t.text).toBe('T1');
    insideOutside(chip, 'after a pick');
  });

  it('⛔ START wears the DISABLED look while every seat is on ONE team — its sheen stays dark; CONTROL: two sides light it', () => {
    const { root } = botOverlay();
    const start = sheened(root).find((b) => sameRect(sheenRectOf(b)!, { x: -180, y: -36, w: 360, h: 72 }))!;
    expect(sweep(start), 'CONTROL — free-for-all: START lights').toBeGreaterThan(5);
    for (const c of sheened(root).filter((b) => sameRect(sheenRectOf(b)!, TEAM_CHIP_RECT))) c.emit('pointertap', {} as never); // all T1
    expect(sweep(start), 'one side: START is refused and does not advertise a click').toBe(0);
  });
});

describe('S194 teams — the multiplayer seat TEAM chip (CLAIM_TEAM) wears T5\'s skin', () => {
  const seats = [
    { index: 0, color: 0xff0000, occupied: true, isHost: true, isYou: true, team: 0 },
    { index: 1, color: 0x00ff00, occupied: true, isHost: false, isYou: false, team: 1 },
  ];
  function chips(): Container[] {
    const rack = makeSeatRack(() => {}, () => {});
    rack.update(seats as never);
    return sheened(rack.container).filter((b) => sameRect(sheenRectOf(b)!, SEAT_TEAM_CHIP_RECT));
  }

  it('YOUR seat\'s chip: inside takes the click, outside does not, the sheen sweeps inside', () => {
    const mine = chips().filter((c) => c.eventMode === 'static');
    expect(mine.length, 'exactly one clickable team chip — yours').toBe(1);
    insideOutside(mine[0]!, 'seat team chip');
    expect(sweep(mine[0]!)).toBeGreaterThan(5);
  });

  it('another seat\'s chip is a label: inert, and its sheen never lights', () => {
    const theirs = chips().filter((c) => c.visible && c.eventMode !== 'static');
    expect(theirs.length).toBe(1);
    expect(sweep(theirs[0]!)).toBe(0);
  });
});
