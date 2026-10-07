/**
 * S196 #16 — REACH: the arcade's NONET row opens the NONET home, through the REAL `ArcadeOverlay`
 * (its button handler AND its container hit-test), and every door on the home is reached through its
 * real button and the home's own hit-test. S182 rule 2: a source-text guard proves a line exists; this
 * drives the line.
 *
 * ⭐ THE FILL-COUNT RULE (S182): `attachButtonFeedback(` calls in homeScreen.ts are counted and pinned to
 * the geometry rows, so a new button without a hit-test row (or the reverse) fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Container, Rectangle, type Text } from 'pixi.js';
import { installFakeTextCanvas } from '../render/fakeTextCanvas.fixtures.ts';
import { ArcadeOverlay, arcadeRowGeoms } from '../render/arcadeOverlay.ts';
import type { RankingEntry } from '../render/arcadeScores.ts';
import { routeArcadeSelect, type NonetDoor } from './nonetModes.ts';
import { doorBlurb, mountNonetHome, NONET_HOME_DOORS, nonetHomeGeoms, nonetRankingGeoms, type NonetHome } from './homeScreen.ts';
import { dailyBoardId } from './dailySeed.ts';

installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

const TODAY = '20261007';

function home(load: (b: string) => readonly RankingEntry[] = () => []): { h: NonetHome; doors: NonetDoor[]; backs: number } {
  const stage = new Container();
  const log = { doors: [] as NonetDoor[], backs: 0 };
  const h = mountNonetHome(stage, { onDoor: (d) => log.doors.push(d), onBack: () => { log.backs++; } }, { loadHero: null, backdrop: false, loadRanking: load });
  h.show({ todayKey: TODAY, dailySolvedKey: null });
  return { h, get doors() { return log.doors; }, get backs() { return log.backs; } };
}

/** The RANKING door's index among the buttons. */
const RANKING = NONET_HOME_DOORS.findIndex((d) => d.id === 'ranking');
const buttonsOf = (h: NonetHome): Container[] => (h as unknown as { buttons: Container[] }).buttons;

describe('S196 — REACH: the arcade NONET row opens the home (never a puzzle)', () => {
  function arcade(): { menu: ArcadeOverlay; log: string[] } {
    const stage = new Container();
    const log: string[] = [];
    const menu = new ArcadeOverlay({ stage } as never, stage, (id) => routeArcadeSelect(id, {
      back: () => log.push('back'),
      openNonetHome: () => log.push('home'),
    }));
    menu.show();
    return { menu, log };
  }

  it('the NONET button\'s own tap → openNonetHome', () => {
    const { menu, log } = arcade();
    const buttons = (menu as unknown as { buttons: Container[] }).buttons;
    buttons[0]!.emit('pointertap', {} as never);
    expect(log).toEqual(['home']);
  });

  it('the container-level tap at the NONET row\'s centre (the real hitTest) → openNonetHome', () => {
    const { menu, log } = arcade();
    const r = arcadeRowGeoms().find((g) => g.id === 'nonet')!;
    expect(menu.hitTest(r.x + r.w / 2, r.y + r.h / 2)).toBe('nonet');
    const c = (menu as unknown as { container: Container }).container;
    c.emit('pointertap', { global: { x: r.x + r.w / 2, y: r.y + r.h / 2 } } as never);
    expect(log).toEqual(['home']);
  });

  it('negative: a tap just outside the row, and on BACK, do NOT open the home', () => {
    const { menu, log } = arcade();
    const r = arcadeRowGeoms().find((g) => g.id === 'nonet')!;
    const c = (menu as unknown as { container: Container }).container;
    c.emit('pointertap', { global: { x: r.x - 2, y: r.y + r.h / 2 } } as never);
    expect(log).toEqual([]);
    const back = (menu as unknown as { buttons: Container[] }).buttons.at(-1)!;
    back.emit('pointertap', {} as never);
    expect(log).toEqual(['back']);
  });
});

describe('S196 — the home: every door reached through its real button and the hit-test', () => {
  it('⭐ FILL-COUNT: attachButtonFeedback calls in homeScreen.ts = 1 (the shared addButton) and buttons = home rows + ranking BACK', () => {
    const src = readFileSync(join(__dirname, 'homeScreen.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src.match(/attachButtonFeedback\(/g)?.length).toBe(1);
    expect(src.match(/this\.addButton\(/g)?.length).toBe(3); // doors loop, home BACK, ranking BACK
    const { h } = home();
    expect(buttonsOf(h).length).toBe(nonetHomeGeoms().length + 1);
    expect(NONET_HOME_DOORS.map((d) => d.id)).toEqual(['play', 'campaign', 'daily', 'zen', 'ranking']);
  });

  it('each button\'s hit rect IS its geometry row, and the home hit-test agrees inside / outside', () => {
    const { h } = home();
    const rows = nonetHomeGeoms();
    for (const [i, r] of rows.entries()) {
      const hit = buttonsOf(h)[i]!.hitArea as Rectangle;
      expect([hit.x, hit.y, hit.width, hit.height]).toEqual([0, 0, r.w, r.h]);
      expect(h.hitTest(r.x + 2, r.y + r.h / 2)).toBe(r.id);
      expect(h.hitTest(r.x + r.w - 2, r.y + r.h / 2)).toBe(r.id);
      expect(h.hitTest(r.x - 2, r.y + r.h / 2)).not.toBe(r.id);
    }
  });

  it('PLAY / CAMPAIGN / DAILY / ZEN taps reach onDoor with their door; BACK reaches onBack', () => {
    const t = home();
    const b = buttonsOf(t.h);
    for (const i of [0, 1, 2, 3]) b[i]!.emit('pointertap', {} as never);
    expect(t.doors).toEqual(['PLAY', 'CAMPAIGN', 'DAILY', 'ZEN']);
    b[5]!.emit('pointertap', {} as never);
    expect(t.backs).toBe(1);
  });

  it('a button tap does NOT also fire the container fallback (no double launch)', () => {
    const t = home();
    const r = nonetHomeGeoms()[0]!;
    const btn = buttonsOf(t.h)[0]!;
    // A tap that targeted the button: the container handler must ignore it.
    btn.emit('pointertap', {} as never);
    t.h.container.emit('pointertap', { target: btn, global: { x: r.x + 5, y: r.y + 5 } } as never);
    expect(t.doors).toEqual(['PLAY']);
    // A tap on the bare scrim at the same point routes once.
    t.h.container.emit('pointertap', { target: t.h.container, global: { x: r.x + 5, y: r.y + 5 } } as never);
    expect(t.doors).toEqual(['PLAY', 'PLAY']);
  });

  it('negative: a closed home answers nothing and launches nothing', () => {
    const t = home();
    t.h.hide();
    const r = nonetHomeGeoms()[0]!;
    expect(t.h.hitTest(r.x + 5, r.y + 5)).toBeNull();
    buttonsOf(t.h)[0]!.emit('pointertap', {} as never);
    expect(t.doors).toEqual([]);
  });

  it('ESC: ranking → home, home → onBack', () => {
    const t = home();
    buttonsOf(t.h)[RANKING]!.emit('pointertap', {} as never);
    expect(t.h.view()).toBe('ranking');
    // In the ranking view, the door rows are NOT hit-testable — only its BACK.
    const play = nonetHomeGeoms()[0]!;
    expect(t.h.hitTest(play.x + 5, play.y + 5)).toBeNull();
    const rb = nonetRankingGeoms().back;
    expect(t.h.hitTest(rb.x + 5, rb.y + 5)).toBe('ranking-back');
    t.h.escape();
    expect(t.h.view()).toBe('home');
    expect(t.backs).toBe(0);
    t.h.escape();
    expect(t.backs).toBe(1);
  });
});

describe('S196 — RANKING keeps the R182-G reveal gate', () => {
  const texts = (c: Container): string[] => {
    const out: string[] = [];
    const walk = (n: Container): void => {
      for (const ch of n.children) {
        if ((ch as Text).text !== undefined && typeof (ch as Text).text === 'string') out.push((ch as Text).text);
        walk(ch as Container);
      }
    };
    walk(c);
    return out;
  };

  it('a board never filed to on this device reads LOCKED — no names', () => {
    const t = home(() => []);
    buttonsOf(t.h)[RANKING]!.emit('pointertap', {} as never);
    const rankingLayer = (t.h as unknown as { rankingContent: Container }).rankingContent;
    const shown = texts(rankingLayer);
    expect(shown.filter((s) => s === 'LOCKED').length).toBe(2);
  });

  it('a board this device HAS filed to shows its cached rows, best average first', () => {
    const cache: Record<string, RankingEntry[]> = {
      [dailyBoardId(TODAY)]: [{ name: 'BBB', runs: 1, totalMs: 90_000 }, { name: 'AAA', runs: 2, totalMs: 120_000 }],
    };
    const t = home((b) => cache[b] ?? []);
    buttonsOf(t.h)[RANKING]!.emit('pointertap', {} as never);
    const shown = texts((t.h as unknown as { rankingContent: Container }).rankingContent);
    expect(shown.filter((s) => s === 'LOCKED').length).toBe(1); // the timed board is still locked
    expect(shown.indexOf('AAA')).toBeGreaterThan(-1);
    expect(shown.indexOf('AAA')).toBeLessThan(shown.indexOf('BBB')); // 1:00 average beats 1:30
  });
});

describe('S196 — the DAILY blurb tells you when today is done', () => {
  it('unsolved → the date; solved today → replay untimed', () => {
    expect(doorBlurb('daily', { todayKey: TODAY, dailySolvedKey: null })).toContain('7 OCT 2026');
    expect(doorBlurb('daily', { todayKey: TODAY, dailySolvedKey: TODAY })).toContain('untimed');
    expect(doorBlurb('daily', { todayKey: TODAY, dailySolvedKey: '20261006' })).not.toContain('untimed');
  });
});
