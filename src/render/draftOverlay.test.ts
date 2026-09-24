/**
 * SPARK — the draft panel: his geometry, BOTH states of the racial tile, the cards, and the
 * enumeration that keeps it honest.
 *
 * ⛔ **THE FILL COUNT IS THE POINT OF THIS FILE.** S182 found a source-text tripwire that was green
 * over a live bug — it proved a line EXISTED but not that the failing path REACHED it. The fix it
 * landed on, and the one copied here, is to make the enumeration MECHANICAL: count the fill calls in
 * the module and pin the total, naming the hit-test that pairs with each. A new fill fails this test
 * until somebody either hit-tests it or declares it decorative in writing.
 *
 * ⛔ **AND BOTH RACIAL STATES ARE DRIVEN THROUGH THE REAL CLASS, NOT ONLY THE PURE HELPERS.** S187
 * found two bugs in this panel that every assertion missed and only the running game showed (a shared
 * TextStyle repainting the wrong tile; the dead tile drawing the live tile's emblem). So the class is
 * constructed, rendered against a real started `World`, and poked with the same pointer events Pixi
 * delivers. The only fakes are the two things Node lacks — a canvas to measure text with, and a card
 * fetch — and the OFFER, injected, because on a branch every `RACIAL_PERK_BUILT` entry may be false.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Texture, TextureSource, type Container, type Graphics, type Sprite, type Text } from 'pixi.js';
import {
  DraftOverlay,
  PANEL_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  UPGRADE_CARD_DIR,
  coverFitTop,
  draftHitTest,
  draftTileViews,
  drawsOwnTitle,
  formatDraftClock,
  generalTileRect,
  pickForTile,
  racialTileRect,
  upgradeCardUrl,
  type DraftOptions,
} from './draftOverlay.ts';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  PHYSICS_HZ,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import {
  RACIAL_PERK_COPY,
  RACIAL_PERK_IDS,
  RACIAL_PERKS_BY_RACE,
  racialPerkFor,
  type RacialPerkId,
} from '../state/racialPerks.ts';
import { GENERAL_PICKS, draftIndexForWave, generalPickForWave, type DraftPick } from '../state/draft.ts';
import { draftOptionsFor } from '../state/draftEvent.ts';
import { ALL_RACES, type RaceId } from '../state/races.ts';
import { makeWorld, type World } from '../state/world.ts';
import { applyStartGame } from '../state/gameMode.ts';
import type { PlayerId } from '../types.ts';

/* ── the two offers every test below uses ─────────────────────────────────────────────────────── */

/** The S187 state: no racial perk on offer — the COMING SOON tile. */
const DEAD: DraftOptions = { general: 'hp', racial: null };
/** A racial perk on offer. Injected, never read from the registry, so it holds on every branch. */
const LIVE: DraftOptions = { general: 'hp', racial: 'vampires.l0' };

function centre(r: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

describe('his geometry, derived from the spawn zone rather than guessed', () => {
  it('is taller than the spawn disc, but only just — "slightly bigger than the circle"', () => {
    const diameter = SPAWNER_RADIUS * 2;
    expect(PANEL_H).toBeGreaterThan(diameter);
    expect(PANEL_H).toBeLessThan(diameter * 1.25);
  });

  it('is about twice as long as it is tall — "the length is about twice longer"', () => {
    expect(PANEL_W / PANEL_H).toBeGreaterThan(1.9);
    expect(PANEL_W / PANEL_H).toBeLessThan(2.25);
  });

  it('covers the spawn disc, so the spawners are not visible behind it', () => {
    expect(PANEL_X).toBeLessThanOrEqual(SPAWNER_CENTER_X - SPAWNER_RADIUS);
    expect(PANEL_X + PANEL_W).toBeGreaterThanOrEqual(SPAWNER_CENTER_X + SPAWNER_RADIUS);
    expect(PANEL_Y).toBeLessThanOrEqual(SPAWNER_CENTER_Y - SPAWNER_RADIUS);
    expect(PANEL_Y + PANEL_H).toBeGreaterThanOrEqual(SPAWNER_CENTER_Y + SPAWNER_RADIUS);
  });

  it('is centred on the spawn zone', () => {
    expect(Math.abs(PANEL_X + PANEL_W / 2 - SPAWNER_CENTER_X)).toBeLessThanOrEqual(1);
    expect(Math.abs(PANEL_Y + PANEL_H / 2 - SPAWNER_CENTER_Y)).toBeLessThanOrEqual(1);
  });

  it('⛔ clears the FOOTER, which is the surface that has swallowed clicks three times', () => {
    // canon §4b: the footer's opaque plates eat clicks on purpose. A panel overlapping them would
    // be unclickable along its bottom edge, and the cause would look like a draft bug.
    expect(PANEL_Y + PANEL_H).toBeLessThan(FOOTER_TOP_Y);
  });

  it('stays on the canvas on all four sides', () => {
    expect(PANEL_X).toBeGreaterThanOrEqual(0);
    expect(PANEL_Y).toBeGreaterThanOrEqual(0);
    expect(PANEL_X + PANEL_W).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(PANEL_Y + PANEL_H).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('splits into two tiles that do not overlap', () => {
    const g = generalTileRect();
    const r = racialTileRect();
    expect(g.x + g.w).toBeLessThan(r.x);
    expect(g.w).toBe(r.w);
    expect(g.y).toBe(r.y);
    expect(g.h).toBe(r.h);
  });

  it('is the 251 × 242 tile the cards were generated and built for', () => {
    // MANIFEST.md and scripts/build-upgrade-cards.py both size the art off these two numbers.
    const g = generalTileRect();
    expect([g.w, g.h]).toEqual([251, 242]);
  });
});

describe('the hit-test — the racial tile answers ONLY while a perk is on offer', () => {
  it('picks up a click in the middle of the LEFT tile, in both states', () => {
    const c = centre(generalTileRect());
    expect(draftHitTest(c.x, c.y, DEAD)).toBe('general');
    expect(draftHitTest(c.x, c.y, LIVE)).toBe('general');
  });

  it('⛔ COMING SOON: returns NOTHING for the right tile — "it’s not choosable" is his instruction', () => {
    const r = racialTileRect();
    expect(draftHitTest(r.x + r.w / 2, r.y + r.h / 2, DEAD)).toBeNull();
    expect(draftHitTest(r.x + 1, r.y + 1, DEAD)).toBeNull();
    expect(draftHitTest(r.x + r.w - 1, r.y + r.h - 1, DEAD)).toBeNull();
  });

  it('⭐ LIVE: returns "racial" for the right tile, edges included', () => {
    const r = racialTileRect();
    expect(draftHitTest(r.x + r.w / 2, r.y + r.h / 2, LIVE)).toBe('racial');
    expect(draftHitTest(r.x, r.y, LIVE)).toBe('racial');
    expect(draftHitTest(r.x + r.w, r.y + r.h, LIVE)).toBe('racial');
  });

  it('returns nothing for the seam, the padding and anywhere off the plate, in both states', () => {
    const g = generalTileRect();
    const r = racialTileRect();
    for (const opts of [DEAD, LIVE]) {
      expect(draftHitTest(PANEL_X + 2, PANEL_Y + 2, opts)).toBeNull(); // plate, outside the tile
      expect(draftHitTest((g.x + g.w + r.x) / 2, g.y + g.h / 2, opts)).toBeNull(); // the seam
      expect(draftHitTest(0, 0, opts)).toBeNull();
      expect(draftHitTest(CANVAS_WIDTH - 1, CANVAS_HEIGHT - 1, opts)).toBeNull();
    }
  });

  it('is inclusive of the left tile’s own edges, so a click on the border is not swallowed', () => {
    const g = generalTileRect();
    expect(draftHitTest(g.x, g.y, DEAD)).toBe('general');
    expect(draftHitTest(g.x + g.w, g.y + g.h, DEAD)).toBe('general');
  });

  it('a click sends the offered axis, the literal "racial", or nothing', () => {
    for (const axis of GENERAL_PICKS) {
      expect(pickForTile('general', { general: axis, racial: null })).toBe(axis);
    }
    expect(pickForTile('racial', LIVE)).toBe('racial');
    expect(pickForTile('racial', DEAD)).toBeNull();
    expect(pickForTile(null, LIVE)).toBeNull();
  });

  it('⛔ the REAL offer: at level 10 every race is COMING SOON, whatever the registry says', () => {
    // RACIAL_PERKS_BY_RACE has two rows per race (L0, L5); wave 11 is draft index 2. This holds on
    // every branch and after every merge, so it pins the dead state through `draftOptionsFor` itself.
    for (const race of ALL_RACES) {
      const opts = draftOptionsFor(11, race);
      expect(opts.racial).toBeNull();
      const r = racialTileRect();
      expect(draftHitTest(r.x + r.w / 2, r.y + r.h / 2, opts)).toBeNull();
    }
  });

  it('the REAL offer at levels 0 and 5 is choosable exactly when its perk is built', () => {
    for (const race of ALL_RACES) {
      for (const wave of [1, 6]) {
        const opts = draftOptionsFor(wave, race);
        const built = racialPerkFor(race, draftIndexForWave(wave)) !== null;
        expect(draftTileViews(opts).racial.choosable).toBe(built);
        const r = racialTileRect();
        expect(draftHitTest(r.x + r.w / 2, r.y + r.h / 2, opts)).toBe(built ? 'racial' : null);
      }
    }
  });
});

describe('what each tile shows', () => {
  it('the general tile shows its own axis’s card and copy', () => {
    const titles: Record<string, string> = { hp: 'TOUGHER', def: 'ARMOURED', atk: 'STRONGER', pen: 'PIERCING' };
    for (const axis of GENERAL_PICKS) {
      const v = draftTileViews({ general: axis, racial: null }).general;
      expect(v.card).toBe(`general-${axis}`);
      expect(v.title).toBe(titles[axis]);
      expect(v.choosable).toBe(true);
      expect(v.detail).not.toBeNull();
    }
  });

  it('⭐ a live racial tile shows ITS perk’s card and copy, from RACIAL_PERK_COPY', () => {
    for (const perk of RACIAL_PERK_IDS) {
      const v = draftTileViews({ general: 'hp', racial: perk }).racial;
      const copy = RACIAL_PERK_COPY[perk];
      expect(v).toEqual({ choosable: true, card: copy.card, title: copy.title, line: copy.line, detail: copy.detail });
    }
  });

  it('⛔ the COMING SOON tile has no card, no detail, and promises nothing', () => {
    const v = draftTileViews(DEAD).racial;
    expect(v).toEqual({ choosable: false, card: null, title: 'YOUR RACE', line: 'COMING SOON', detail: null });
  });

  it('⛔ the racial tile NEVER shows the general option’s card (the S187 dead-tile bug)', () => {
    for (const axis of GENERAL_PICKS) {
      for (const racial of [null, ...RACIAL_PERK_IDS] as (RacialPerkId | null)[]) {
        const v = draftTileViews({ general: axis, racial });
        expect(v.racial.card).not.toBe(v.general.card);
      }
    }
  });

  it('⛔ a tile SHOWING its card draws no overlay title; any other tile keeps it (the manifest’s rule)', () => {
    const live = draftTileViews(LIVE);
    expect(drawsOwnTitle(live.general, true)).toBe(false);
    expect(drawsOwnTitle(live.racial, true)).toBe(false);
    // Not arrived yet, or failed: the name must still be on screen exactly once.
    expect(drawsOwnTitle(live.general, false)).toBe(true);
    expect(drawsOwnTitle(live.racial, false)).toBe(true);
    // No card at all.
    expect(drawsOwnTitle(draftTileViews(DEAD).racial, false)).toBe(true);
  });
});

describe('the cards on disk — the 16 a tile can ask for, WRATH OF RA ahead of its perk, and only those', () => {
  const PUBLIC = join(__dirname, '..', '..', 'public');
  const DIR = join(PUBLIC, UPGRADE_CARD_DIR);
  /** ⚠ MINE, not the owner's — a payload sanity bound. The largest shipped card is ~87 KB. */
  const MAX_CARD_BYTES = 150 * 1024;

  /** Width × height of a lossy (`VP8 `) or extended (`VP8X`) WebP, read from its header. */
  function webpSize(buf: Buffer): { w: number; h: number } | null {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    return null;
  }

  const referenced = [
    ...GENERAL_PICKS.map((a) => draftTileViews({ general: a, racial: null }).general.card as string),
    ...RACIAL_PERK_IDS.map((p) => RACIAL_PERK_COPY[p].card),
  ];

  /*
   * ⭐ S188 `s188/ra-vfx` — A CARD THAT SHIPS ONE MERGE AHEAD OF THE PERK THAT DRAWS IT, named here
   * rather than tolerated by a looser assertion. The owner's WRATH OF RA art (`l10-mummies`) lands on
   * this branch; its mechanic `mummies.l10` lands in the parallel `s188/wrath`, which this branch may
   * not touch (`racialPerks.ts`). Until both are merged the card is on disk and referenced by nothing.
   *
   * ⚠ The allowance is a UNION, so it is harmless in either merge order: once `mummies.l10` names
   * `l10-mummies` the card is simply in `referenced` as well, and the shipped set is still exactly
   * 17. Delete the entry then — a stale allowance is where a future stray would hide.
   */
  const AHEAD_OF_THEIR_PERK = ['l10-mummies'] as const;
  const expectedShipped = [...new Set<string>([...referenced, ...AHEAD_OF_THEIR_PERK])];

  it('the URL is served from public/', () => {
    expect(upgradeCardUrl('general-hp')).toBe('/art/upgrade-cards/general-hp.webp');
  });

  it('every card a tile can ask for (and every card ahead of its perk) is shipped, 2× the tile, and a sane size', () => {
    expect(referenced).toHaveLength(16);
    for (const card of expectedShipped) {
      const path = join(DIR, `${card}.webp`);
      expect(existsSync(path), `${card}.webp is missing — run python scripts/build-upgrade-cards.py`).toBe(true);
      const size = webpSize(readFileSync(path));
      expect(size, `${card}.webp is not a readable WebP`).toEqual({ w: 502, h: 484 });
      expect(statSync(path).size).toBeLessThanOrEqual(MAX_CARD_BYTES);
    }
  });

  it('⛔ ships nothing else — no THE SWARM (vampires L10 is not built), no alternates, no strays', () => {
    const shipped = readdirSync(DIR).sort();
    expect(shipped).toEqual(expectedShipped.map((c) => `${c}.webp`).sort());
    // 16 a tile can ask for on this branch + WRATH OF RA. Exactly 17 after `s188/wrath` merges too.
    expect(shipped).toHaveLength(17);
    expect(shipped).not.toContain('l10-vampires.webp');
  });

  it('one card per (race, level) — no two perks share art', () => {
    expect(new Set(referenced).size).toBe(referenced.length);
  });
});

describe('cover-fit, anchored to the TOP where every card keeps its name', () => {
  const r = { x: 100, y: 200, w: 251, h: 242 };

  it('a shipped 2× card lands exactly on the tile at half scale', () => {
    expect(coverFitTop(502, 484, r)).toEqual({ x: 100, y: 200, scale: 0.5 });
  });

  it('a square card covers the tile, is centred across, and loses only its BOTTOM', () => {
    const f = coverFitTop(1254, 1254, r);
    expect(1254 * f.scale).toBeGreaterThanOrEqual(r.w - 1e-9);
    expect(1254 * f.scale).toBeGreaterThanOrEqual(r.h - 1e-9);
    expect(f.y).toBe(r.y);
    expect(f.x).toBeCloseTo(r.x + (r.w - 1254 * f.scale) / 2, 9);
  });

  it('a portrait card still keeps its top edge on the tile’s top edge', () => {
    const f = coverFitTop(784, 1168, r);
    expect(f.y).toBe(r.y);
    expect(784 * f.scale).toBeCloseTo(r.w, 9);
  });
});

describe('⛔ the mechanical fill enumeration (the S182 lesson)', () => {
  /**
   * Every fill call in the module, and the hit-test it pairs with. "decorative" means the surface is
   * drawn but must never be clickable — and the pairing is what a future session checks rather than
   * re-deriving.
   *
   * ⚠ S188 WIDENED THE COUNT from `.fill({` to ANY `.fill(`. The card stencil could have been written
   * `.fill(0xffffff)` — the racePicker idiom — and slipped past the old pattern unseen. A count that
   * a different argument shape can evade is the S182 hole again.
   */
  const FILLS: ReadonlyArray<{ what: string; hitTest: string }> = [
    { what: 'the plate behind both tiles', hitTest: 'decorative (not a button) — SWALLOWED by DraftOverlay.isOver' },
    { what: 'the LEFT (general) tile', hitTest: "draftHitTest -> 'general'" },
    { what: 'the RIGHT (racial) tile', hitTest: "draftHitTest -> 'racial' while a perk is offered; NONE while COMING SOON" },
    { what: 'the card stencil (one call, one per tile)', hitTest: 'decorative — a Pixi mask, never drawn as a surface' },
    { what: 'the hover detail plate', hitTest: 'decorative (not a button) — drawn BELOW the panel while a choosable tile is hovered; SWALLOWED by DraftOverlay.isOver' },
  ];

  const src = readFileSync(join(__dirname, 'draftOverlay.ts'), 'utf8');
  // Count only CODE, so the docblocks that discuss fills do not inflate the total.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  it('the module contains exactly the enumerated fills, and no more', () => {
    const fills = code.match(/\.fill\(/g) ?? [];
    expect(
      fills.length,
      'A new filled surface appeared in draftOverlay.ts. Add it to FILLS with the hit-test it pairs ' +
        'with, or say in writing that it is decorative. A surface without a hit-test is how S182 ' +
        'shipped a cost plate that swallowed clicks.',
    ).toBe(FILLS.length);
  });

  it('exactly two enumerated surfaces are clickable — and only one of them is conditional', () => {
    const clickable = FILLS.filter((f) => f.hitTest.startsWith('draftHitTest'));
    expect(clickable).toHaveLength(2);
    expect(clickable.filter((f) => f.hitTest.includes('NONE'))).toHaveLength(1);
  });

  it('both pointer handlers ask the SAME hit-test, with the options that were drawn', () => {
    expect(code.match(/draftHitTest\(p\.x, p\.y, this\.opts\)/g) ?? []).toHaveLength(2);
  });
});

describe('⛔ what S188 removed stays removed', () => {
  const src = readFileSync(join(__dirname, 'draftOverlay.ts'), 'utf8');

  it('drawAxisGlyph is DELETED, not dormant — "just a hand drawn heart that looks gay"', () => {
    expect(src).not.toMatch(/function\s+drawAxisGlyph|drawAxisGlyph\(/);
    expect(src).not.toContain('bezierCurveTo');
  });

  it('the "owed" arithmetic is seatMustStillPick, not a hardcoded / 5', () => {
    expect(src).toContain('seatMustStillPick(world, localSeat, ev.waveNumber)');
    expect(src).not.toMatch(/waveNumber\s*-\s*1\)\s*\/\s*5/);
  });
});

/* ── THE CLASS, DRIVEN FOR REAL ───────────────────────────────────────────────────────────────── */

/*
 * Node has no canvas, and Pixi measures text through one (`CanvasTextMetrics` tries
 * `OffscreenCanvas` first, and probes `CanvasRenderingContext2D.prototype` for letter spacing). A
 * fixed-advance stand-in is enough: nothing below asserts a glyph width, only which things are shown,
 * where the tip comes from, and what a click sends.
 */
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
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}
vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
afterAll(() => {
  vi.unstubAllGlobals();
});

/** A card texture the size the build script ships, labelled with the URL it was asked for. */
function fakeCard(url: string): Texture {
  return new Texture({ source: new TextureSource({ width: 502, height: 484, label: url }) });
}

/** A card loader that records every URL it is asked for and resolves each to its own texture. */
function recordingLoader(fail = false): { load: (url: string) => Promise<Texture>; asked: string[]; made: Map<string, Texture> } {
  const asked: string[] = [];
  const made = new Map<string, Texture>();
  return {
    asked,
    made,
    load: (url) => {
      asked.push(url);
      if (fail) return Promise.reject(new Error(`404 ${url}`));
      const t = fakeCard(url);
      made.set(url, t);
      return Promise.resolve(t);
    },
  };
}

/** Let the loader's promises settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A started match: the pre-wave-1 draft is open and every seat owes its first pick. */
function startedWorld(): { w: World; seat: PlayerId; race: RaceId } {
  const w = makeWorld(0x188);
  applyStartGame(w, { type: 'START_GAME' } as never);
  const seat = [...w.players.keys()][0] as PlayerId;
  const race = w.players.get(seat)!.raceId;
  return { w, seat, race };
}

/** The offer as it will be once the seat's L0/L5 perk is built — without touching the registry. */
function offerAsIfBuilt(waveNumber: number, race: RaceId): DraftOptions {
  return { general: generalPickForWave(waveNumber), racial: RACIAL_PERKS_BY_RACE[race][draftIndexForWave(waveNumber)] ?? null };
}
/** The offer with no racial perk at all. */
function offerDead(waveNumber: number): DraftOptions {
  return { general: generalPickForWave(waveNumber), racial: null };
}

function child<T>(c: Container, label: string): T {
  const found = c.getChildByLabel(label);
  if (found === null) throw new Error(`no child labelled ${label}`);
  return found as unknown as T;
}

function move(o: DraftOverlay, p: { x: number; y: number }): void {
  o.container.emit('pointermove', { global: p } as never);
}
/** A primary-button tap — what a left click, a finger or a pen delivers. */
function tap(o: DraftOverlay, p: { x: number; y: number }, button = 0): void {
  o.container.emit('pointertap', { global: p, button } as never);
}

describe('⭐ the class, with a racial perk ON OFFER', () => {
  it('shows the panel, and a click on the racial tile sends "racial"', () => {
    const { w, seat } = startedWorld();
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    expect(o.container.visible).toBe(true);
    tap(o, centre(racialTileRect()));
    tap(o, centre(generalTileRect()));
    expect(picks).toEqual(['racial', 'hp']);
  });

  it('⛔ a MIDDLE or RIGHT button tap picks NOTHING — right-click is the put-it-back / raid gesture', () => {
    // Pixi v8 dispatches pointertap for every button; a pick is permanent, so only button 0 may make it.
    const { w, seat } = startedWorld();
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    expect(draftTileViews(offerAsIfBuilt(1, w.players.get(seat)!.raceId)).racial.choosable).toBe(true);
    for (const button of [1, 2]) {
      tap(o, centre(generalTileRect()), button);
      tap(o, centre(racialTileRect()), button);
    }
    expect(picks).toEqual([]);
    tap(o, centre(racialTileRect()), 0); // and the primary button still works on the same panel
    expect(picks).toEqual(['racial']);
  });

  it('hovering the racial tile opens ITS detail panel, from RACIAL_PERK_COPY', () => {
    const { w, seat, race } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    move(o, centre(racialTileRect()));
    o.render(w, seat);
    const perk = RACIAL_PERKS_BY_RACE[race][0] as RacialPerkId;
    expect(child<Text>(o.container, 'tip').text).toBe(RACIAL_PERK_COPY[perk].detail);
    move(o, { x: 0, y: 0 });
    o.render(w, seat);
    expect(child<Text>(o.container, 'tip').text).toBe('');
  });

  it('⛔ each tile fetches ITS OWN card and nothing else — never another race, never l10', async () => {
    const { w, seat, race } = startedWorld();
    const loader = recordingLoader();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: loader.load });
    o.render(w, seat);
    o.render(w, seat); // a second frame must not refetch
    await settle();
    const perk = RACIAL_PERKS_BY_RACE[race][0] as RacialPerkId;
    expect(loader.asked).toEqual([upgradeCardUrl('general-hp'), upgradeCardUrl(RACIAL_PERK_COPY[perk].card)]);
  });

  it('⛔ once a card is ON SCREEN its tile draws no title; the effect line stays, in the bottom band', async () => {
    const { w, seat, race } = startedWorld();
    const loader = recordingLoader();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: loader.load });
    o.render(w, seat);
    // Frame one: nothing has arrived — both names are drawn as text.
    expect(child<Sprite>(o.container, 'generalCard').visible).toBe(false);
    expect(child<Text>(o.container, 'generalTitle').visible).toBe(true);
    expect(child<Text>(o.container, 'racialTitle').visible).toBe(true);

    await settle();
    o.render(w, seat);
    const perk = RACIAL_PERKS_BY_RACE[race][0] as RacialPerkId;
    const gCard = child<Sprite>(o.container, 'generalCard');
    const rCard = child<Sprite>(o.container, 'racialCard');
    expect(gCard.visible).toBe(true);
    expect(rCard.visible).toBe(true);
    // ⛔ the S187 bug class: the racial sprite carries the RACIAL texture, not the general one.
    expect(gCard.texture).toBe(loader.made.get(upgradeCardUrl('general-hp')));
    expect(rCard.texture).toBe(loader.made.get(upgradeCardUrl(RACIAL_PERK_COPY[perk].card)));
    expect(child<Text>(o.container, 'generalTitle').visible).toBe(false);
    expect(child<Text>(o.container, 'racialTitle').visible).toBe(false);
    const gLine = child<Text>(o.container, 'generalLine');
    const rLine = child<Text>(o.container, 'racialLine');
    expect(gLine.visible).toBe(true);
    expect(rLine.text).toBe(RACIAL_PERK_COPY[perk].line);
    const g = generalTileRect();
    expect(gLine.y).toBeGreaterThan(g.y + g.h / 2); // clear of the baked lettering at the top
    // A live tile has its own art and no '?'.
    expect(child<Text>(o.container, 'racialMark').visible).toBe(false);
  });

  it('⛔ a card that FAILS leaves the tile on its text title, and the panel still works', async () => {
    const { w, seat } = startedWorld();
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { optionsFor: offerAsIfBuilt, loadCard: recordingLoader(true).load });
    o.render(w, seat);
    await settle();
    o.render(w, seat);
    expect(child<Sprite>(o.container, 'generalCard').visible).toBe(false);
    expect(child<Text>(o.container, 'generalTitle').visible).toBe(true);
    expect(child<Text>(o.container, 'racialTitle').visible).toBe(true);
    tap(o, centre(racialTileRect()));
    expect(picks).toEqual(['racial']);
  });

  it('⛔ a loader that THROWS instead of rejecting cannot take the frame down', async () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, {
      optionsFor: offerAsIfBuilt,
      loadCard: () => { throw new Error('boom'); },
    });
    expect(() => o.render(w, seat)).not.toThrow();
    await settle();
    expect(() => o.render(w, seat)).not.toThrow();
    expect(child<Text>(o.container, 'generalTitle').visible).toBe(true);
  });

  it('⛔ the two effect lines keep SEPARATE styles — tinting the racial one never recolours the general', () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    const gLine = child<Text>(o.container, 'generalLine');
    const rLine = child<Text>(o.container, 'racialLine');
    expect(gLine.style).not.toBe(rLine.style);
    expect(gLine.style.fill).not.toBe(rLine.style.fill);
  });
});

describe('⛔ the class, with NO racial perk on offer (COMING SOON)', () => {
  it('a click on the racial tile sends NOTHING; the general tile still works', () => {
    const { w, seat } = startedWorld();
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { optionsFor: offerDead, loadCard: recordingLoader().load });
    o.render(w, seat);
    tap(o, centre(racialTileRect()));
    expect(picks).toEqual([]);
    tap(o, centre(generalTileRect()));
    expect(picks).toEqual(['hp']);
  });

  it('hovering the dead tile promises nothing — no detail panel', () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerDead, loadCard: recordingLoader().load });
    o.render(w, seat);
    move(o, centre(racialTileRect()));
    o.render(w, seat);
    expect(child<Text>(o.container, 'tip').text).toBe('');
  });

  it('draws COMING SOON and the ?, fetches NO racial card, and draws no racial sprite', async () => {
    const { w, seat } = startedWorld();
    const loader = recordingLoader();
    const o = new DraftOverlay(() => {}, { optionsFor: offerDead, loadCard: loader.load });
    o.render(w, seat);
    await settle();
    o.render(w, seat);
    expect(loader.asked).toEqual([upgradeCardUrl('general-hp')]);
    expect(child<Sprite>(o.container, 'racialCard').visible).toBe(false);
    expect(child<Text>(o.container, 'racialLine').text).toBe('COMING SOON');
    expect(child<Text>(o.container, 'racialTitle').visible).toBe(true);
    expect(child<Text>(o.container, 'racialMark').visible).toBe(true);
  });

  it('⭐ through the PRODUCTION offer too: a level-10 draft is COMING SOON with no seam injected', () => {
    const { w, seat } = startedWorld();
    // Put the seat at the level-10 draft (wave 11), owing its third pick.
    w.players.get(seat)!.draftPicks.splice(0, Infinity, 'hp', 'def');
    w.draft = { openedAtTick: w.tick, waveNumber: 11 };
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { loadCard: recordingLoader().load });
    o.render(w, seat);
    expect(o.container.visible).toBe(true);
    tap(o, centre(racialTileRect()));
    expect(picks).toEqual([]);
    tap(o, centre(generalTileRect()));
    expect(picks).toEqual(['atk']);
  });
});

describe('when the panel is up at all', () => {
  it('is hidden once the seat has picked — seatMustStillPick, not arithmetic', () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    expect(o.container.visible).toBe(true);
    w.players.get(seat)!.draftPicks.push('hp');
    o.render(w, seat);
    expect(o.container.visible).toBe(false);
  });

  it('is hidden with no draft open, with no local seat, and on any screen but PLAYING', () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, null);
    expect(o.container.visible).toBe(false);
    w.gameState = 'WIN';
    o.render(w, seat);
    expect(o.container.visible).toBe(false);
    w.gameState = 'PLAYING';
    w.draft = null;
    o.render(w, seat);
    expect(o.container.visible).toBe(false);
  });

  it('a hidden panel forgets its hover and sends nothing on a stray tap', () => {
    const { w, seat } = startedWorld();
    const picks: DraftPick[] = [];
    const o = new DraftOverlay((p) => picks.push(p), { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    move(o, centre(racialTileRect()));
    w.draft = null;
    o.render(w, seat);
    tap(o, centre(racialTileRect()));
    expect(picks).toEqual([]);
  });

  it('⛔ a pointer that LEAVES the panel unlights the tile and drops the detail plate', () => {
    // pointermove only arrives while over the panel, so without a leave handler the last hover sticks.
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    const idle = tileFills(o);
    move(o, centre(racialTileRect()));
    o.render(w, seat);
    expect(child<Text>(o.container, 'tip').text).not.toBe('');
    o.container.emit('pointerleave', {} as never);
    o.render(w, seat);
    expect(child<Text>(o.container, 'tip').text).toBe('');
    expect(tileFills(o)).toEqual(idle);
    expect(frameWidths(o)).toEqual([1, 1]);
  });

  it('⭐ hovering a live tile LIGHTS it — plate, card and frame — and only that tile', async () => {
    const { w, seat } = startedWorld();
    const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: recordingLoader().load });
    o.render(w, seat);
    await settle();
    o.render(w, seat);
    const [gIdle, rIdle] = tileFills(o);
    move(o, centre(racialTileRect()));
    o.render(w, seat);
    const [gNow, rNow] = tileFills(o);
    expect(rNow.color).not.toBe(rIdle.color);
    expect(gNow.color).toBe(gIdle.color);
    expect(child<Sprite>(o.container, 'racialCard').tint).toBe(0xffffff);
    expect(child<Sprite>(o.container, 'generalCard').tint).not.toBe(0xffffff);
    expect(frameWidths(o)).toEqual([1, 3]);
  });

  it('⛔ a cursor RESTING on the racial tile when its offer goes dead does not keep it lit', () => {
    // `hover` only updates on a pointer move, so this is the path a stale highlight would take.
    const { w, seat } = startedWorld();
    let live = true;
    const o = new DraftOverlay(() => {}, {
      optionsFor: (wave, race) => (live ? offerAsIfBuilt(wave, race) : offerDead(wave)),
      loadCard: recordingLoader().load,
    });
    live = false;
    o.render(w, seat);
    const deadBaseline = tileFills(o)[1];
    live = true;
    o.render(w, seat);
    move(o, centre(racialTileRect()));
    o.render(w, seat);
    expect(child<Text>(o.container, 'tip').text).not.toBe('');
    live = false;
    o.render(w, seat); // no pointer move in between
    expect(child<Text>(o.container, 'tip').text).toBe('');
    expect(tileFills(o)[1]).toEqual(deadBaseline);
    expect(deadBaseline.alpha).toBeLessThan(1); // and it is the DIMMED plate
  });
});

/** The two tile plates' fill styles, in draw order: [general, racial]. */
function tileFills(o: DraftOverlay): { color: number; alpha: number }[] {
  const g = child<Graphics>(o.container, 'tiles');
  return g.context.instructions
    .filter((i) => i.action === 'fill')
    .map((i) => {
      const st = i.data.style as { color: number; alpha: number };
      return { color: st.color, alpha: st.alpha };
    });
}

/** The two tile frames' stroke widths, in draw order: [general, racial]. */
function frameWidths(o: DraftOverlay): number[] {
  const g = child<Graphics>(o.container, 'frames');
  return g.context.instructions
    .filter((i) => i.action === 'stroke')
    .map((i) => (i.data.style as { width: number }).width);
}

describe('the countdown', () => {
  it('reads in seconds, because that is what he sees', () => {
    expect(formatDraftClock(PHYSICS_HZ * 90)).toBe('1:30');
    expect(formatDraftClock(PHYSICS_HZ * 5)).toBe('0:05');
    expect(formatDraftClock(0)).toBe('0:00');
  });

  it('rounds UP, so it never shows 0:00 while time remains', () => {
    expect(formatDraftClock(1)).toBe('0:01');
  });
});
