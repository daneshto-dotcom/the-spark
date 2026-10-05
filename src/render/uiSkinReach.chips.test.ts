/**
 * S194 — REACH for every button the census round skinned (owner: *"the plus and minus button … doesn't
 * have any graphic implemented … make sure that's implemented across the board"*). For every button in
 * the real VS-BOTS setup, race picker, seat rack and CONNECTION LOST screens that carries a sheen:
 *   · Pixi's own hit rule (explicit hitArea, else the Graphics children — what `EventBoundary` asks) takes
 *     the click on that button just inside each edge of its rect, and NOT just outside — the skin moved no target;
 *   · the sheen sweeps only inside that rect, and clears on pointerout.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/botSetupOverlay.ts :: raceBtn.
// CENSUS-REACH src/render/botSetupOverlay.ts :: personaBtn.
// CENSUS-REACH src/render/botSetupOverlay.ts :: diffBtn.
// CENSUS-REACH src/render/botSetupOverlay.ts :: attachButtonFeedback(c, bg, onClick, { hit: { x: -24
// CENSUS-REACH src/render/botSetupOverlay.ts :: attachButtonFeedback(c, bg, onClick, { hit: { x: -180
// CENSUS-REACH src/render/racePicker.ts :: root.
// CENSUS-REACH src/render/connectionLostOverlay.ts :: returnBtn.
// CENSUS-REACH src/render/seatRack.ts :: cell.on('pointertap'
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Ticker } from 'pixi.js';
// The FederatedEvent container mixin (isInteractive, …) that a real app installs at init.
import 'pixi.js/events';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { sheenRectOf } from './uiSkinButton.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));
installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 });
vi.stubGlobal('cancelAnimationFrame', () => {});

const { BotSetupOverlay } = await import('./botSetupOverlay.ts');
const { makeRacePicker } = await import('./racePicker.ts');
const { makeSeatRack, SEAT_TEAM_CHIP_RECT } = await import('./seatRack.ts');
const { makeConnectionLostOverlay } = await import('./connectionLostOverlay.ts');

function sheenButtons(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    if (sheenRectOf(n) !== undefined) out.push(n);
    for (const ch of n.children) walk(ch as Container);
  };
  walk(root);
  return out;
}


/**
 * Pixi's own rule for "does this button take a click at local point p" (what `EventBoundary` asks):
 * an explicit `hitArea` decides alone; otherwise any visible Graphics child that contains the point
 * (in that child's space). Evaluated in the button's LOCAL space, so no render pass is needed.
 */
function takes(b: Container, x: number, y: number): boolean {
  const ha = b.hitArea as { contains(x: number, y: number): boolean } | null | undefined;
  if (ha != null) return ha.contains(x, y);
  return b.children.some((c) => c instanceof Graphics && c.visible && c.eventMode !== 'none' && c.label !== 'sheen'
    && c.containsPoint({ x: x - c.position.x, y: y - c.position.y }));
}

function checkButtons(stage: Container, label: string, minButtons: number): void {
  // Only buttons actually ON SCREEN (a closed sub-picker's tiles are checked by their own case).
  const shown = (b: Container): boolean => {
    for (let n: Container | null = b; n !== null; n = n.parent) if (!n.visible) return false;
    return true;
  };
  const buttons = sheenButtons(stage).filter((b) => b.eventMode === 'static' && shown(b));
  expect(buttons.length, `${label}: sheened buttons found`).toBeGreaterThanOrEqual(minButtons);
  for (const b of buttons) {
    const r = sheenRectOf(b)!;
    // A feedback button's hit IS a rectangle; its sheen must be handed exactly that rectangle.
    const ha = b.hitArea as { x: number; y: number; width: number; height: number } | null;
    if (ha != null) expect([r.x, r.y, r.w, r.h], `${label}: sheen rect = hit rect`).toEqual([ha.x, ha.y, ha.width, ha.height]);
    const inset = 3;
    for (const [x, y] of [[r.x + inset, r.y + r.h / 2], [r.x + r.w - inset, r.y + r.h / 2], [r.x + r.w / 2, r.y + inset], [r.x + r.w / 2, r.y + r.h - inset]]) {
      expect(takes(b, x!, y!), `${label}: inside ${JSON.stringify(r)} at (${x},${y})`).toBe(true);
    }
    const out = 3;
    for (const [x, y] of [[r.x - out, r.y + r.h / 2], [r.x + r.w + out, r.y + r.h / 2], [r.x + r.w / 2, r.y - out], [r.x + r.w / 2, r.y + r.h + out]]) {
      expect(takes(b, x!, y!), `${label}: outside ${JSON.stringify(r)} at (${x},${y})`).toBe(false);
    }
    // The sheen: only while hovered, only inside the rect.
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
}

describe('S194 census round — every newly-skinned button keeps its exact click target', () => {
  it('VS BOTS setup: −, +, ✕, START, and every race / personality / difficulty chip', () => {
    const stage = new Container();
    const o = new BotSetupOverlay({ stage, screen: { width: 1920, height: 1080 } } as never, {
      onStart() {}, onClose() {},
    } as never);
    const root = (o as unknown as { container: Container }).container;
    for (let n: Container | null = root; n !== null; n = n.parent) n.visible = true;
    // 3 small (− + ✕), START, and at least one row's three chips.
    checkButtons(stage, 'bot setup', 7);
  });

  it('race picker: every choosable race tile', () => {
    const stage = new Container();
    const p = makeRacePicker(() => {});
    stage.addChild(p.container);
    p.open(new Set(), undefined);
    checkButtons(stage, 'race picker', 6);
  });

  it('a taken race tile does NOT light (it is inert)', () => {
    const stage = new Container();
    const p = makeRacePicker(() => {});
    stage.addChild(p.container);
    p.open(new Set(['orcs'] as never), undefined);
    const taken = sheenButtons(stage).filter((b) => b.eventMode !== 'static');
    expect(taken.length).toBe(1);
    const sheen = taken[0]!.getChildByLabel('sheen') as Graphics;
    taken[0]!.emit('pointerover', {} as never);
    Ticker.shared.update(Ticker.shared.lastTime + 400);
    expect(sheen.context.instructions.length).toBe(0);
  });

  it('CONNECTION LOST: Return to Title', () => {
    const stage = new Container();
    const h = makeConnectionLostOverlay({ stage } as never, () => {});
    h.setVisible(true);
    checkButtons(stage, 'connection lost', 1);
  });

  /**
   * ⭐ S195 (audit) — the seat rack, DRIVEN: after a real `update` YOUR seat (and its TEAM chip) are the clickable
   * cells; `checkButtons` then proves inside/outside by Pixi's children-bounds rule and the sheen sweep inside the
   * rect. Another seat's cell is inert and never lights.
   */
  it('seat rack: YOUR seat cell takes a click inside its rect and not outside, sheen sweeps inside; another seat is inert', () => {
    const rack = makeSeatRack(() => {}, () => {});
    rack.update([
      { index: 0, color: 0xff0000, occupied: true, isHost: true, isYou: true, team: 0 },
      { index: 1, color: 0x00ff00, occupied: true, isHost: false, isYou: false, team: 1 },
    ] as never);
    const all = sheenButtons(rack.container);
    const cells = all.filter((c) => sheenRectOf(c)!.w !== SEAT_TEAM_CHIP_RECT.w);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const c of cells) expect([sheenRectOf(c)!.x, sheenRectOf(c)!.y]).toEqual([0, 0]);
    expect(cells.filter((c) => c.eventMode === 'static').length, 'exactly one clickable cell — yours').toBe(1);
    checkButtons(rack.container, 'seat rack (your cell + your team chip)', 2);
    const theirs = cells.find((c) => c.eventMode !== 'static' && c.visible)!;
    const sheen = theirs.getChildByLabel('sheen') as Graphics;
    theirs.emit('pointerover', {} as never);
    Ticker.shared.update(Ticker.shared.lastTime + 400);
    expect(sheen.context.instructions.length, 'another seat does not light').toBe(0);
  });
});
