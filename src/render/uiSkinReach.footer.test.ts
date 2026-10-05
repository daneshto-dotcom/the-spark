/**
 * S194 T5 — REACH: every rectangle the FOOTER skins (through a real `FooterBand.sync`) is exactly a
 * rectangle a hit-test claims — clicked just inside, it is that control; clicked just outside, it is
 * not. A source guard proves the skin call EXISTS; this proves the drawn glass and the click target
 * are the same pixels, on the real band.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';

const drawn: Array<{ x: number; y: number; w: number; h: number; state: string }> = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      drawn.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
  };
});

const { FooterBand } = await import('./footerBand.ts');

const P0 = asPlayerId(0);

function world(): World {
  const w = makeWorld(0x194);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' as const },
      { seat: 1, color: PLAYER_COLORS[1]! },
    ],
    botSeats: [1],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.gathererOrders.set(P0, [SparkType.Triangle, SparkType.Triangle, SparkType.Square]);
  return w;
}

type Band = InstanceType<typeof FooterBand>;
function claim(b: Band, x: number, y: number): string | null {
  if (b.isOverRaButton(x, y)) return 'ra';
  if (b.isOverScorchedEarthButton(x, y)) return 'se';
  const chip = b.chipAt(x, y);
  if (chip !== null) return `chip:${chip}`;
  const card = b.cardAt(x, y);
  if (card !== null) return `card:${card}`;
  const pal = b.paletteAt(x, y);
  if (pal !== null) return `pal:${pal}`;
  const q = b.queueChipAt(x, y);
  if (q !== null) return `q:${q}`;
  if (b.isOverCarryBill(x, y)) return 'carry';
  if (b.isOverCollapseTab(x, y)) return 'tab';
  return null;
}

function checkAll(b: Band, minKinds: string[]): void {
  expect(drawn.length, 'the real sync skinned something (anti-vacuity)').toBeGreaterThan(0);
  const kinds = new Set<string>();
  for (const r of drawn) {
    const id = claim(b, r.x + r.w / 2, r.y + r.h / 2);
    expect(id, `skinned rect ${JSON.stringify(r)} is claimed by a hit-test at its centre`).not.toBeNull();
    kinds.add(id!.split(':')[0]!);
    const e = 1.5;
    for (const [px, py] of [[r.x + e, r.y + e], [r.x + r.w - e, r.y + e], [r.x + e, r.y + r.h - e], [r.x + r.w - e, r.y + r.h - e]]) {
      expect(claim(b, px!, py!), `inside ${JSON.stringify(r)} at (${px},${py})`).toBe(id);
    }
    for (const [px, py] of [[r.x - e, r.y + r.h / 2], [r.x + r.w + e, r.y + r.h / 2], [r.x + r.w / 2, r.y - e], [r.x + r.w / 2, r.y + r.h + e]]) {
      expect(claim(b, px!, py!), `just outside ${JSON.stringify(r)} at (${px},${py}) is not the same control`).not.toBe(id);
    }
  }
  for (const k of minKinds) expect(kinds.has(k), `the sweep reached a ${k}`).toBe(true);
}

describe('S194 T5 — the footer skin is drawn exactly on its hit rects (real FooterBand.sync)', () => {
  it('expanded band: tier chips, palette, queue chips, collapse tab, the Ra skill square', () => {
    drawn.length = 0;
    const stage = new Container();
    const b = new FooterBand({ stage } as never, stage);
    b.sync(world());
    checkAll(b, ['chip', 'pal', 'q', 'tab', 'ra']);
  });

  it('collapsed band: the tab and the compact Ra square, nothing else', () => {
    drawn.length = 0;
    const stage = new Container();
    const b = new FooterBand({ stage } as never, stage);
    b.toggleCollapsed();
    b.sync(world());
    checkAll(b, ['tab', 'ra']);
    expect(drawn.length).toBe(2);
  });

  /**
   * ⚠ S195 T18 #3 (R81 HOVER_GROW, MINE — owner said LOOK): a HOVERED control's drawn rect lies INSIDE the
   * rect its hit-test claims, for every kind the band draws. With the old grow of 2 px the plate's four
   * corners sat outside the hit rect and this fails; with the −1 press sink they sit inside, and pass.
   */
  it('⛔ R81 — while HOVERED (and while HELD), every skinned rect stays inside the rect its hit-test claims', () => {
    const stage = new Container();
    const b = new FooterBand({ stage } as never, stage);
    const w = world();
    b.sync(w);
    // One target per kind, found from the REST draw's own centres.
    drawn.length = 0;
    b.sync(w);
    const rest = [...drawn];
    // Every control the rest draw produced (a DISABLED chip keeps its hover geometry too — R81 — so it is checked).
    const targets = new Map<string, { x: number; y: number; disabled: boolean }>();
    for (const r of rest) {
      const id = claim(b, r.x + r.w / 2, r.y + r.h / 2);
      if (id !== null && !targets.has(id)) targets.set(id, { x: r.x + r.w / 2, y: r.y + r.h / 2, disabled: r.state === 'disabled' });
    }
    for (const k of ['chip', 'pal', 'q', 'ra']) expect([...targets.keys()].some((id) => id.startsWith(k)), `a ${k} to hover`).toBe(true);
    expect([...targets.values()].some((t) => !t.disabled), 'at least one ENABLED control (anti-vacuity for the state check)').toBe(true);
    for (const [id, p] of targets) {
      if (id === 'carry' || id === 'tab') continue; // readout / tab: no hover state of their own
      for (const held of [false, true]) {
        b.setHover(p.x, p.y);
        b.setPressed(held);
        drawn.length = 0;
        b.sync(w);
        const mine = drawn.filter((d) => claim(b, d.x + d.w / 2, d.y + d.h / 2) === id);
        expect(mine.length, `${id} hovered${held ? '+held' : ''}: drawn`).toBeGreaterThan(0);
        for (const r of mine) {
          if (!p.disabled) expect(r.state, `${id}: hover/press state reached`).toBe(held ? 'press' : 'hover');
          const e = 0.25;
          for (const [px, py] of [[r.x + e, r.y + e], [r.x + r.w - e, r.y + e], [r.x + e, r.y + r.h - e], [r.x + r.w - e, r.y + r.h - e]]) {
            expect(claim(b, px!, py!), `${id} hovered${held ? '+held' : ''}: corner (${px},${py}) of the drawn rect is inside its hit rect`).toBe(id);
          }
        }
        b.setPressed(false);
      }
    }
  });

  it('a hovered-and-held chip skins in the PRESS state, a hovered one in HOVER', () => {
    const stage = new Container();
    const b = new FooterBand({ stage } as never, stage);
    const w = world();
    b.sync(w);
    const pts = b.getUiPoints();
    const c = pts.chips[0]!;
    b.setHover(c.x + c.w / 2, c.y + c.h / 2);
    drawn.length = 0;
    b.sync(w);
    const first = drawn.find((d) => claim(b, d.x + d.w / 2, d.y + d.h / 2) === `chip:${c.complexity}`)!;
    expect(['hover', 'disabled']).toContain(first.state === 'disabled' ? 'disabled' : first.state);
    b.setPressed(true);
    drawn.length = 0;
    b.sync(w);
    const pressed = drawn.find((d) => claim(b, d.x + d.w / 2, d.y + d.h / 2) === `chip:${c.complexity}`)!;
    expect(pressed.state === 'press' || pressed.state === 'disabled').toBe(true);
  });
});

/**
 * The tower CARDS cannot be synced under vitest (their sub-label measures text, which needs a DOM), so
 * their half is the mechanical pairing below, which covers EVERY site: each `skinButtonFx(` in the file
 * is handed the SAME four rect expressions as the plate `roundRect(` drawn immediately before it.
 */
describe('S194 T5 — every footer skin call is paired with the plate it decorates (source pairing)', () => {
  const src = readFileSync(new URL('./footerBand.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const norm = (s: string): string => s.replace(/\s+/g, '');
  const sites = [...src.matchAll(/skinButtonFx\(\s*\w+,\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),/g)];
  it('there are exactly the 8 enumerated skin sites (chip, palette, queue, carry readout, card, collapse tab, Ra, Scorched Earth)', () => {
    expect(sites.length).toBe(8);
  });
  it('each one repeats its plate rect, verbatim', () => {
    for (const m of sites) {
      const before = src.slice(0, m.index);
      const plate = [...before.matchAll(/roundRect\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),/g)].pop()!;
      expect([1, 2, 3, 4].map((k) => norm(m[k]!)), `skin site at offset ${m.index}`).toEqual([1, 2, 3, 4].map((k) => norm(plate[k]!)));
    }
  });
});
