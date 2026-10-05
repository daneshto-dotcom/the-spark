/**
 * SPARK — ⭐⭐ S195 N14 (s195/info-ui): the stat board's POLISH — every text fits its box, LOST TO ENTROPY on the
 * local seat's page only (B-17), and the press latch (N5) at the three clickable sites.
 *
 * Owner: a text *"ran out of its box at the top of a board"*; *"more coherent and definitely prettier"*; badges /
 * death counts / charts STAY (B-20..23 RULED keep).
 *
 * THE FIT RULE IS PINNED TWO WAYS (S182 rule 2 — a source guard proves a line EXISTS, not that it is REACHED):
 *   · MECHANICALLY in the source: every `this.texts.take(` whose words come from the model (a template, a
 *     model field, a grouped number) is followed by a `this.fit(` before the next `take` — a new dynamic label
 *     without a fit fails here until someone boxes it;
 *   · BY MEASUREMENT through the real board: the WIDEST fixtures the model can produce (4 seats, every label
 *     the longest it can be, 7- and 9-digit numbers) are rendered on EVERY page, and every fitted text's drawn
 *     width (`width × scale`) is ≤ its box. The fixture must also make at least one text actually shrink, or the
 *     test is not exercising the rule.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MONSTER_OWNER_SEAT, PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { recordDamage, recordEntropyLoss, recordKill, recordUnitBuilt, recordWaveSample } from '../state/matchStats.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { CONTINUE_RECT, overviewLayout, tabRects } from './matchBoardLayout.ts';
import { groupThousands } from './matchBoardModel.ts';

installFakeTextCanvas();

const skinned: Array<{ x: number; y: number; w: number; h: number; state: string }> = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
  };
});
const { MatchBoard, estWidth, textWidth } = await import('./matchBoard.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** The WIDEST four-seat POSTGAME the model can produce: winner star, "BOT n", the longest race word, YOU, huge numbers. */
function widest(): World {
  const w = makeWorld(0x5195);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  for (let i = 2; i < 4; i++) w.players.set(asPlayerId(i), makeIdlePlayer(asPlayerId(i), PLAYER_COLORS[i]!));
  for (let i = 0; i < 4; i++) {
    const id = asPlayerId(i);
    w.botSeats.add(id); // "BOT n" is wider than "Pn"
    w.players.get(id)!.raceId = 'vampires'; // the longest race word
    recordUnitBuilt(w, id, 'goblinMelee');
    recordUnitBuilt(w, id, 'lightningDrone');
    recordUnitBuilt(w, id, 't3PiranhaElite');
    recordKill(w, id, asPlayerId((i + 1) % 4), 'goblinArcher');
    recordDamage(w, id, asPlayerId((i + 1) % 4), 123_456_789, 'unit');
    recordDamage(w, id, asPlayerId((i + 2) % 4), 98_765_432, 'structure');
    recordDamage(w, id, asPlayerId((i + 3) % 4), 87_654_321, 'keep');
    w.scoreByPlayer.set(id, 1_234_567);
    const s = w.matchStats.seats.get(id)!;
    s.built.set('goblinMelee', 9_999_999);
    s.kills.set('goblinArcher', 8_888_888);
    s.lost.set('lightningDrone', 7_777_777);
    s.towersBuilt = 99_999;
    s.towersFell = 99_999;
  }
  recordDamage(w, MONSTER_OWNER_SEAT as never, P0, 55_555_555, 'unit');
  recordEntropyLoss(w, P0, 1_234_567);
  recordEntropyLoss(w, P1, 42);
  for (let wave = 1; wave <= 12; wave++) {
    w.tick += 10;
    recordWaveSample(w, wave);
  }
  w.localPlayerId = P0;
  w.lastWinnerId = P0;
  w.gameState = 'POSTGAME';
  return w;
}

const visibleTexts = (b: InstanceType<typeof MatchBoard>): string[] => {
  const out: string[] = [];
  const walk = (c: { children: unknown[] }): void => {
    for (const ch of c.children as Array<{ visible: boolean; text?: unknown; children?: unknown[] }>) {
      if (!ch.visible) continue;
      if (typeof ch.text === 'string') out.push(ch.text);
      else if (Array.isArray(ch.children)) walk(ch as { children: unknown[] });
    }
  };
  walk(b.container);
  return out;
};

const down = (b: InstanceType<typeof MatchBoard>, x: number, y: number, button = 0): void => {
  b.container.emit('pointerdown', { global: { x, y }, button } as never);
};
const up = (b: InstanceType<typeof MatchBoard>, outside = false): void => {
  b.container.emit(outside ? 'pointerupoutside' : 'pointerup', {} as never);
};
const move = (b: InstanceType<typeof MatchBoard>, x: number, y: number): void => {
  b.container.emit('pointermove', { global: { x, y } } as never);
};
const mid = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

beforeAll(() => {
  vi.stubGlobal('document', undefined); // no glow sprite; the unit suite has no canvas texture
});

describe('⭐⭐ N14 — every fitted text fits its box, on every page, with the widest fixtures', () => {
  const w = widest();
  const b = new MatchBoard(() => {});
  b.render(w, 1000);
  const pages = 2 + 4;

  it('anti-vacuity: four seats, the model really is wide', () => {
    expect(w.matchStats.seats.size, 'four seats (+ the MONSTERS seat the unattributed hit opened)').toBeGreaterThanOrEqual(4);
    expect(visibleTexts(b).some((t) => t.includes('BOT 1  VAMPIRES   YOU'))).toBe(true);
  });

  for (let page = 0; page < pages; page++) {
    it(`page ${page}: width × scale ≤ box for every fitted text, and the overview name / tab labels are among them`, () => {
      b.render(w, 1000);
      while (JSON.stringify(b.currentTab()) !== JSON.stringify(page === 0 ? { kind: 'overview' } : page === 1 ? { kind: 'graphs' } : { kind: 'player', index: page - 2 })) {
        b.handleKey('ArrowRight');
      }
      b.render(w, 1000 + page);
      const fits = b.fitsDrawn();
      expect(fits.length, 'texts were fitted on this page').toBeGreaterThan(10);
      const over = fits.filter((f) => f.width * f.scale > f.max + 0.01);
      expect(over.map((f) => `"${f.text}" ${Math.round(f.width * f.scale)} > ${f.max}`)).toEqual([]);
      expect(fits.every((f) => f.scale > 0 && f.scale <= 1), 'never scaled UP').toBe(true);
      expect(fits.every((f) => f.measured), 'the measured path (a canvas exists here)').toBe(true);
      // The tab strip is on every page: every seat tab label is fitted.
      const tabs = tabRects(4);
      expect(fits.filter((f) => f.text.includes('VAMPIRES') && f.size <= 18).length, 'four seat tabs').toBeGreaterThanOrEqual(4);
      expect(fits.some((f) => f.text.includes('WINS')), 'the headline').toBe(true);
      expect(tabs.length).toBe(6);
      if (page === 0) {
        expect(fits.some((f) => f.text === '★ BOT 1  VAMPIRES   YOU'), 'the overview name cell').toBe(true);
        expect(fits.some((f) => /^\d{1,3}(,\d{3}){2,}$/.test(f.text) && f.size === 23), 'a 7+-digit overview cell').toBe(true);
      }
      if (page >= 2) {
        expect(fits.some((f) => f.text === groupThousands(1_234_567) && f.size === 32), 'the SCORE tile value').toBe(true);
      }
    });
  }

  it('the widest fixture really makes something SHRINK (else the rule is not exercised)', () => {
    b.render(w, 1000);
    b.handleKey('ArrowRight'); // graphs: 9-digit y labels against a 62 px gutter
    b.render(w, 1001);
    const shrunk = b.fitsDrawn().filter((f) => f.scale < 1);
    expect(shrunk.length).toBeGreaterThan(0);
    for (const f of shrunk) expect(f.width * f.scale).toBeLessThanOrEqual(f.max + 0.01);
  });

  it('⛔ the measured width is what fits, and the estimate is the fallback — never NaN, never 0', () => {
    const w2 = widest();
    const b2 = new MatchBoard(() => {});
    b2.render(w2, 1000);
    const any = b2.fitsDrawn()[0]!;
    expect(Number.isFinite(any.width) && any.width > 0).toBe(true);
    expect(estWidth('ABC', 10)).toBe(Math.ceil(3 * 10 * 0.62));
    const t = { text: 'HELLO', style: { fontSize: 10 }, scale: { x: 1 }, get width(): number { throw new Error('no canvas'); } };
    expect(textWidth(t as never)).toEqual({ width: estWidth('HELLO', 10), measured: false });
  });
});

describe('⛔ N14 — MECHANICAL: every dynamic `take` is followed by a `fit` (parsed from the source)', () => {
  const src = readFileSync(new URL('./matchBoard.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const DYNAMIC = /\$\{|row\.|groupThousands\(|\bm\.(headline|subline)|\bl\.name|\ba\.label|\bs\.label|col\.label|rowAxis\.label|\btitle\b|\bcaption\b|\blabel\b|\bvalue\b|\bnote\b/;

  it('each `this.texts.take(` with model words has a `this.fit(` before the next take', () => {
    const parts = src.split('this.texts.take(');
    const unfitted: string[] = [];
    let dynamic = 0;
    for (let i = 1; i < parts.length; i++) {
      const firstArg = parts[i]!.split(',')[0]!;
      if (!DYNAMIC.test(firstArg)) continue;
      dynamic += 1;
      if (!parts[i]!.includes('this.fit(')) unfitted.push(firstArg.trim());
    }
    expect(dynamic, 'anti-vacuity: the board has many dynamic labels').toBeGreaterThan(20);
    expect(unfitted, 'a label whose words come from the model has no fit').toEqual([]);
  });

  it('the tooltip pool sizes its own plate from its texts and is not part of the rule', () => {
    expect(src).toContain('this.tipTexts.take(');
    expect(src.split('this.tipTexts.take(').length - 1).toBe(1);
  });
});

describe('⭐ N12 / B-17 — LOST TO ENTROPY on the LOCAL seat\'s page only', () => {
  it('P0 (local) page prints it with P0\'s count; P1\'s page prints nothing of the kind, though P1 lost connectors too', () => {
    const w = widest();
    const b = new MatchBoard(() => {});
    b.render(w, 1000);
    b.handleKey('ArrowRight');
    b.handleKey('ArrowRight'); // P0's page (the winner sits first)
    b.render(w, 1001);
    expect(b.currentTab()).toEqual({ kind: 'player', index: 0 });
    let texts = visibleTexts(b);
    expect(texts).toContain('LOST TO ENTROPY');
    expect(texts).toContain(`${groupThousands(1_234_567)} connectors`);
    b.handleKey('ArrowRight'); // the next seat's page
    b.render(w, 1002);
    expect(b.currentTab()).toEqual({ kind: 'player', index: 1 });
    texts = visibleTexts(b);
    expect(texts, 'negative: not on another seat\'s page').not.toContain('LOST TO ENTROPY');
    expect(texts.some((t) => t.endsWith(' connectors') || t.endsWith(' connector'))).toBe(false);
  });

  it('a local seat that lost exactly one reads the singular; one that lost none reads 0 connectors', () => {
    const w = widest();
    w.matchStats.seats.get(P0)!.lostToEntropy = 1;
    const b = new MatchBoard(() => {});
    b.render(w, 1000);
    b.handleKey('ArrowRight');
    b.handleKey('ArrowRight');
    b.render(w, 1001);
    expect(visibleTexts(b)).toContain('1 connector');
    w.matchStats.seats.get(P0)!.lostToEntropy = 0;
    b.render(w, 1002);
    expect(visibleTexts(b)).toContain('0 connectors');
  });
});

describe('⭐ N5 — the board\'s press latch at its three sites (REACH through the real Pixi events)', () => {
  const stateAt = (r: { x: number; y: number; w: number; h: number }): string | undefined =>
    skinned.find((s) => Math.abs(s.x - r.x) < 0.01 && Math.abs(s.y - r.y) < 0.01 && Math.abs(s.w - r.w) < 0.01 && Math.abs(s.h - r.h) < 0.01)?.state;

  it('CONTINUE: hover → hover, down → press, up → hover, upoutside → lifts; a right-button down never sinks', () => {
    const w = widest();
    const b = new MatchBoard(() => {});
    const now = 5000;
    b.render(w, now);
    const armedAt = now + 5000;
    const [cx, cy] = mid(CONTINUE_RECT);
    move(b, cx, cy);
    skinned.length = 0; b.render(w, armedAt);
    expect(stateAt(CONTINUE_RECT)).toBe('hover');
    down(b, cx, cy);
    expect(b.isPressed()).toBe(true);
    skinned.length = 0; b.render(w, armedAt + 1);
    expect(stateAt(CONTINUE_RECT)).toBe('press');
    up(b);
    skinned.length = 0; b.render(w, armedAt + 2);
    expect(stateAt(CONTINUE_RECT)).toBe('hover');
    down(b, cx, cy);
    up(b, true);
    expect(b.isPressed(), 'released off the board lifts too').toBe(false);
    down(b, cx, cy, 2);
    expect(b.isPressed(), 'right button is the put-back gesture, not a press').toBe(false);
  });

  it('a page tab and an overview row sink while pressed; the tab under the pointer is the one that sinks', () => {
    const w = widest();
    const b = new MatchBoard(() => {});
    b.render(w, 1000);
    const tabs = tabRects(4);
    const graphsTab = tabs[1]!;
    down(b, ...mid(graphsTab));
    skinned.length = 0; b.render(w, 1001);
    expect(stateAt(graphsTab)).toBe('press');
    expect(stateAt(tabs[0]!), 'the current page tab stays active').toBe('active');
    expect(stateAt(tabs[2]!), 'an un-hovered tab rests').toBe('rest');
    up(b);
    const row = overviewLayout(4).rows[2]!;
    down(b, ...mid(row));
    skinned.length = 0; b.render(w, 1002);
    expect(stateAt(row)).toBe('press');
    up(b);
    skinned.length = 0; b.render(w, 1003);
    expect(stateAt(row)).toBe('hover');
  });
});
