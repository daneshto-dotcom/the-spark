/**
 * SPARK — S191 A-3 (owner, R190-G) — **AN OPAQUE PANEL SWALLOWS A RIGHT-CLICK TOO.**
 *
 * > *"Yeah, we'll keep seven as is for your recommendation"* — read as: do the recommendation, so a
 * > right-click (a RAID) on an opaque footer card, the unit card or any opaque panel does nothing to
 * > the board under it. ⚠ That reading was flagged to him; reverse on his word.
 *
 * Two halves, because S182 learned that one alone is not enough:
 *
 *  1. **REACH** — through the REAL `Controls.onDown` and the REAL `FooterBand` after a real `sync`: an
 *     enemy unit (and an enemy connector) sits under each opaque surface and a right-click there raids
 *     NOTHING; the identical target on bare board IS raided (the negative control that proves the
 *     fixture could raid at all). Every footer point is derived from the live geometry.
 *  2. **MECHANICAL** — every `button === 2` site in `controls.ts` is enumerated from the source and
 *     must carry an `R190-G:` tag saying whether it acts on the HAND (a put-back — the S190 IL-2 rule,
 *     live everywhere) or on the BOARD (then it must ask `isPointerOverAnyOpaqueSurface()` before it
 *     picks anything). A fifth right-click handler fails this file until someone classifies it.
 *     ⚠ A source-text guard proves a line EXISTS, not that it is REACHED — which is what half 1 is for.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { readFileSync } from 'node:fs';
import { Container } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId, type Vec2 } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { GameAction } from '../state/world.ts';
import { Controls, type CastlePanelLike, type CharacterSheetLike, type DraftPanelLike } from './controls.ts';
import { FooterBand, collapseTabRect } from '../render/footerBand.ts';
import { raAimPreview, setRaAimPreview } from '../render/raAimPreview.ts';

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

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
type Rect = { x: number; y: number; w: number; h: number };
const mid = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inRect = (r: Rect | null, x: number, y: number): boolean =>
  r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

interface Rig {
  w: World;
  c: Controls;
  band: FooterBand;
  castle: CastlePanelLike & { armed: GodlyId | null; panel: Rect | null };
  card: { rect: Rect | null };
  draft: { rect: Rect | null };
  sent: GameAction[];
}

function rig(): Rig {
  const w = makeWorld(0x191c);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1],
  });
  w.creatures.clear();
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0 }),
  };
  const sent: GameAction[] = [];
  // Record only — nothing is applied, so every case starts from the same board.
  const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); });
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  const castle = {
    armed: null as GodlyId | null,
    panel: null as Rect | null,
    isOpen: () => castle.panel !== null,
    toggle() {},
    close() {},
    isOverPanel: (x: number, y: number) => inRect(castle.panel, x, y),
    armedBlueprint: () => castle.armed,
    disarm() { castle.armed = null; },
    armExternal(id: GodlyId | null) { castle.armed = id; },
    requestShapesFor() {},
  };
  const card = { rect: null as Rect | null };
  const sheet: CharacterSheetLike = {
    select() {},
    selection: () => null,
    ownedRowAt: () => null,
    isOver: (x, y) => inRect(card.rect, x, y),
    actionAt: () => null,
    isOverAnyAction: () => false,
    actionPrimitiveId: () => null,
    actionFeedSpawnerId: () => null,
    setHover() {},
  };
  const draft = { rect: null as Rect | null };
  const draftPanel: DraftPanelLike = { isOver: (x, y) => inRect(draft.rect, x, y), isOverChoosable: () => false };
  c.setFooterBand(band);
  c.setCastlePanel(castle);
  c.setCharacterSheet(sheet);
  c.setDraftPanel(draftPanel);
  band.sync(w);
  return { w, c, band, castle, card, draft, sent };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: Vec2, button: number): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: Vec2, button: number): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const rightClick = (r: Rig, p: Vec2): void => {
  down(r.c, p, 2);
  up(r.c, p, 2);
};
const raids = (r: Rig): GameAction[] => r.sent.filter((a) => a.type === 'RAID_TARGET');

/** An ENEMY unit standing exactly on `p` — what `pickCreature` would raid. */
function enemyAt(r: Rig, p: Vec2): void {
  dispatch(r.w, {
    type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P1,
    pos: { x: p.x, y: p.y }, targetPos: { x: p.x, y: p.y },
  });
  const c = [...r.w.creatures.values()].at(-1)!;
  expect(c.pos, 'fixture: the unit stands on the point').toEqual(p);
}

let nextBond = 19100;
function shape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const prim = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[seat]!,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, prim);
  return prim;
}
/** An ENEMY connector running horizontally through `p` — what `pickBond` would raid. */
function enemyBondThrough(r: Rig, p: Vec2): void {
  const a = shape(r.w, P1, p.x - 14, p.y);
  const b = shape(r.w, P1, p.x + 14, p.y);
  const id = asBondId(nextBond++);
  r.w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 28, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
  a.bonds.add(id);
  b.bonds.add(id);
}

/** A bare-board point well clear of every surface, in the middle of the map. */
const BARE: Vec2 = { x: 700, y: 400 };

describe('⭐ the negative control — a right-click on BARE board still raids', () => {
  it('a unit on open ground is raided', () => {
    const r = rig();
    enemyAt(r, BARE);
    expect(r.band.isOverBandSurface(BARE.x, BARE.y)).toBe(false);
    rightClick(r, BARE);
    expect(raids(r).map((a) => (a as { target: { kind: string } }).target.kind)).toEqual(['creature']);
  });

  it('a connector on open ground is raided', () => {
    const r = rig();
    enemyBondThrough(r, BARE);
    rightClick(r, BARE);
    expect(raids(r).map((a) => (a as { target: { kind: string } }).target.kind)).toEqual(['bond']);
  });
});

describe('⛔⛔ S191 A-3 — REACH: a right-click on an opaque surface raids NOTHING under it', () => {
  /** Each surface, with a point on it derived from the live geometry (or the stub's own rectangle). */
  const SURFACES: Array<[string, (r: Rig) => Vec2]> = [
    ['a footer TIER CHIP', (r) => mid(r.band.getUiPoints().chips[0]!)],
    ['an open footer TOWER CARD', (r) => {
      const tier = r.band.getUiPoints().chips.at(-1)!.complexity;
      r.band.select(tier);
      r.band.sync(r.w);
      const card = r.band.getUiPoints().cards[0];
      expect(card, 'fixture: the tier opened a card').toBeDefined();
      return mid(card!);
    }],
    ['the footer COLLAPSE TAB (the R190-F arrow)', () => mid(collapseTabRect(false))],
    ['the CHARACTER CARD (the unit card)', (r) => {
      r.card.rect = { x: 600, y: 300, w: 320, h: 260 };
      return { x: 700, y: 400 };
    }],
    ['the CASTLE PANEL', (r) => {
      r.castle.panel = { x: 600, y: 300, w: 320, h: 260 };
      return { x: 700, y: 400 };
    }],
    ['the DRAFT PANEL', (r) => {
      r.draft.rect = { x: 600, y: 300, w: 320, h: 260 };
      return { x: 700, y: 400 };
    }],
  ];

  it.each(SURFACES)('%s swallows the raid on a UNIT under it', (_name, place) => {
    const r = rig();
    const p = place(r);
    enemyAt(r, p);
    rightClick(r, p);
    expect(raids(r), 'nothing under an opaque surface is raided').toEqual([]);
  });

  it.each(SURFACES)('%s swallows the raid on a CONNECTOR under it', (_name, place) => {
    const r = rig();
    const p = place(r);
    enemyBondThrough(r, p);
    rightClick(r, p);
    expect(raids(r)).toEqual([]);
  });

  it('⭐ the COLLAPSED band gives the ground back: where a chip was, the raid lands; on the tab it does not', () => {
    const r = rig();
    const chip = mid(r.band.getUiPoints().chips[0]!);
    r.band.toggleCollapsed();
    r.band.sync(r.w);
    expect(r.band.isOverBandSurface(chip.x, chip.y), 'fixture: nothing is drawn there now').toBe(false);
    enemyAt(r, chip);
    rightClick(r, chip);
    expect(raids(r), 'the ground S187 gave back is raidable, the same ground a left click may build on').toHaveLength(1);
    const r2 = rig();
    r2.band.toggleCollapsed();
    r2.band.sync(r2.w);
    const tab = mid(collapseTabRect(true));
    enemyAt(r2, tab);
    rightClick(r2, tab);
    expect(raids(r2), 'the collapsed tab is still opaque').toEqual([]);
  });

  it('⭐ the put-backs are the HAND, not the ground — they work over every opaque surface (the S190 IL-2 rule; not under a modal, where nothing acts)', () => {
    const r = rig();
    const chip = mid(r.band.getUiPoints().chips[0]!);
    enemyAt(r, chip);
    r.castle.armed = 't3TowerVampires' as GodlyId;
    rightClick(r, chip);
    expect(r.castle.armed, 'a right-click over the footer puts the held tower back').toBeNull();
    expect(raids(r), 'and raids nothing').toEqual([]);
  });

  /*
   * ⛔ S191 R2 (INPUT-4) — AND OVER THE OPEN CASTLE PANEL TOO. The panel guard at the top of `onDown`
   * returned for every button, so a right-click over it put back neither a held tower nor the Ra aim,
   * while this file said "everywhere". Mirrors the S190 IL-2 put-back on the draft plate: the HAND is
   * put back, the ground under the panel is never raided.
   */
  it('⛔ INPUT-4 — a right-click over the open CASTLE PANEL puts the held tower back, and raids nothing', () => {
    const r = rig();
    r.castle.panel = { x: 600, y: 300, w: 320, h: 260 };
    const p = { x: 700, y: 400 };
    enemyAt(r, p);
    r.castle.armed = 't3TowerVampires' as GodlyId;
    rightClick(r, p);
    expect(r.castle.armed, 'the held tower is put back').toBeNull();
    expect(raids(r), 'and nothing under the panel is raided').toEqual([]);
  });

  it('⛔ INPUT-4 — a right-click over the open CASTLE PANEL puts the Ra aim away (the aim first, the IL-2 order)', () => {
    const r = rig();
    r.castle.panel = { x: 600, y: 300, w: 320, h: 260 };
    const p = { x: 700, y: 400 };
    enemyAt(r, p);
    setRaAimPreview({ seat: P0, x: p.x, y: p.y });
    try {
      rightClick(r, p);
      expect(raAimPreview(), 'the aim is put away').toBeNull();
      expect(raids(r)).toEqual([]);
    } finally {
      setRaAimPreview(null);
    }
  });

  it('INPUT-4 negative — a LEFT click over the castle panel still acts on nothing under it', () => {
    const r = rig();
    r.castle.panel = { x: 600, y: 300, w: 320, h: 260 };
    const p = { x: 700, y: 400 };
    enemyAt(r, p);
    r.castle.armed = 't3TowerVampires' as GodlyId;
    down(r.c, p, 0);
    up(r.c, p, 0);
    expect(r.castle.armed, 'a left click over the panel keeps the tower in hand').toBe('t3TowerVampires');
    expect(r.sent).toEqual([]);
  });

  it('R190-F is untouched — a LEFT press on the arrow still collapses the band', () => {
    const r = rig();
    const tab = mid(collapseTabRect(false));
    down(r.c, tab, 0);
    up(r.c, tab, 0);
    expect(r.band.isCollapsed()).toBe(true);
  });
});

describe('⛔ S191 A-3 — MECHANICAL: every right-click handler in controls.ts is classified, and every BOARD one is gated', () => {
  const src = readFileSync(new URL('./controls.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const sites = lines
    .map((text, i) => ({ text, line: i + 1 }))
    .filter(({ text }) => /\bbutton\s*[!=]==\s*2\b/.test(text) && !/^\s*(\*|\/\/)/.test(text));

  // ⭐ S191 R2 (INPUT-4) — 4 → 5: the castle-panel put-back, classified HAND before this was bumped.
  it('there are exactly FIVE right-click sites today — a sixth must be classified before this is updated', () => {
    expect(
      sites.map((s) => s.line).length,
      `found ${sites.length}: ${sites.map((s) => `:${s.line}`).join(' ')} — tag the new one "R190-G: HAND" or ` +
        '"R190-G: BOARD" (and gate a BOARD one on isPointerOverAnyOpaqueSurface) BEFORE bumping this',
    ).toBe(5);
  });

  it('every site says whether it acts on the HAND or on the BOARD', () => {
    for (const s of sites) expect(s.text, `controls.ts:${s.line}`).toMatch(/R190-G: (HAND|BOARD)\b/);
    expect(
      sites.filter((s) => /R190-G: HAND/.test(s.text)),
      'the aim, the castle-panel, the draft-plate and the held-tower put-backs',
    ).toHaveLength(4);
  });

  it('every BOARD site asks the opaque-surface question BEFORE it picks anything', () => {
    const board = sites.filter((s) => /R190-G: BOARD/.test(s.text));
    expect(board).toHaveLength(1);
    for (const s of board) {
      const body = lines.slice(s.line, s.line + 200).join('\n');
      const guard = body.indexOf('if (this.isPointerOverAnyOpaqueSurface()) return;');
      const firstPick = body.search(/this\.pick\w+\(/);
      expect(guard, `controls.ts:${s.line} has the guard`).toBeGreaterThan(-1);
      expect(firstPick, 'fixture: the branch picks a target').toBeGreaterThan(-1);
      expect(guard, 'the guard runs before the first pick').toBeLessThan(firstPick);
    }
  });

  it('every RAID the file dispatches lies inside that gated branch', () => {
    const board = sites.find((s) => /R190-G: BOARD/.test(s.text))!;
    const raidLines = lines
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(({ text }) => text.includes("type: 'RAID_TARGET'"));
    expect(raidLines.length, 'creature, defender, bond').toBe(3);
    const guardLine = lines.findIndex((t, i) => i >= board.line && t.includes('isPointerOverAnyOpaqueSurface()')) + 1;
    for (const r of raidLines) expect(r.line, `RAID_TARGET at :${r.line}`).toBeGreaterThan(guardLine);
  });

  it('the predicate is the left click\'s four surfaces, whole', () => {
    const i = src.indexOf('private isPointerOverAnyOpaqueSurface(): boolean {');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n  }\n', i));
    for (const p of ['isPointerOverPanel()', 'isPointerOverDraftPanel()', 'isPointerOverCard()', 'isPointerOverFooterSurface()']) {
      expect(body, p).toContain(p);
    }
  });

  /*
   * ⭐ S191 R2 (INPUT-6) — WIDENED: not only `button === 2`. EVERY code token `button` / `buttons` in this
   * file sits on a line that says what it is — HAND or BOARD for a right-click, LMB for a left-click path
   * (those are the S182 surface gates' business), ROUTE where the button is merely passed on. So a
   * `buttons & 2` (a held-button check), a `button === 1`, or a helper taking a button cannot slip in
   * untagged — the hole the `=== 2` regex alone left open.
   */
  it('⭐ INPUT-6 — every `button` / `buttons` code token in controls.ts sits on a TAGGED line', () => {
    const tagged = /R190-G: (HAND|BOARD|LMB|ROUTE)\b/;
    const code = (l: string): string =>
      l.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""').replace(/\/\/.*$/, '');
    const tokens = lines
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(({ text }) => !/^\s*(\*|\/\/|\/\*)/.test(text) && /\bbuttons?\b/.test(code(text)));
    expect(tokens.length, 'anti-vacuity: the scan found the button handling').toBeGreaterThan(sites.length);
    const untagged = tokens.filter((t) => !tagged.test(t.text)).map((t) => `:${t.line} ${t.text.trim()}`);
    expect(untagged, 'tag each: R190-G: HAND | BOARD | LMB | ROUTE').toEqual([]);
    // …and a right-click line is never tagged LMB or ROUTE.
    for (const s of sites) expect(s.text, `controls.ts:${s.line}`).not.toMatch(/R190-G: (LMB|ROUTE)\b/);
  });

  it('⭐ INPUT-6 — repo-wide: the ONE right-click event listener in non-test src is today’s contextmenu suppressor', () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const root = join(process.cwd(), 'src');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.ts$/.test(f) || /\.test\.ts$/.test(f)) continue;
        const text = readFileSync(p, 'utf8').split('\r\n').join('\n').split('\n');
        text.forEach((l, i) => {
          if (/contextmenu|rightdown|rightclick|rightup|auxclick/i.test(l)) hits.push(`${p.slice(root.length + 1).replace(/\\/g, '/')}:${i + 1} ${l.trim()}`);
        });
      }
    };
    walk(root);
    expect(hits.length, `found: ${hits.join(' | ')}`).toBe(1);
    expect(hits[0]).toMatch(/^input\/controls\.ts:\d+ canvas\.addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\);$/);
  });

  it('the canvas `contextmenu` listener only suppresses the browser menu — it acts on nothing', () => {
    const listeners = src.match(/addEventListener\('contextmenu'[^\n]*/g) ?? [];
    expect(listeners).toEqual(["addEventListener('contextmenu', (e) => e.preventDefault());"]);
  });
});
