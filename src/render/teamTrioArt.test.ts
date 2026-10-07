/**
 * SPARK — ⭐⭐ S196 (owner R196-A1 / R196-A2) — **THE 3v1 TRIO ART: HIS COMPOSED GROK PICTURES.**
 * R196-A1: *his Grok images are far higher quality than the original single-race art; composed pair/trio pictures
 * beat single-race art side by side even with the cross-fade; today's art + cross-fade beats the hard edge.*
 * R196-A2: *"we can already wire in the images we already have."*
 *
 *   · the manifest ↔ the files (every key ships a 960×540 picture, no picture sits unlisted);
 *   · the resolver table: a trio WITH a picture → its quarters; WITHOUT → today's single-race art + seam blend;
 *     pairs, the 2v1 solo half, 1v1v2 solos unchanged; the FFA byte-identical (negative);
 *   · the NW-quarter mask (R195-T5's wiring note): no trio quarter is ever the solo's NW;
 *   · REACH through the real renderer `sync` (labels, bake keys, and the real crop's source rectangle);
 *   · a missing / broken picture falls back through the real `Assets.load` rejection path.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { Assets, BufferImageSource, Container, Texture, type Application } from 'pixi.js';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  MANIFEST_TILES,
  TEAM_SEAM_BLEND_LEGACY_ART,
  TEAM_TRIO_ART,
  ZoneBackgroundRenderer,
  teamTrioArtUrl,
  trioBackdropUrl,
  trioQuarterOfZone,
  trioQuarterRect,
  zoneBackdropPlan,
  type TileAvailability,
  type ZoneBackdrop,
} from './zoneBackgroundRenderer.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { ALL_RACES, type RaceId } from '../state/races.ts';

const U = undefined;

/** `teams[s]` per seat; a 3v1 is `[0, 0, 0, U]` → seat 3 solo NW, seats 0/1/2 = NE/SE/SW (slot order). */
function start(teams: (number | undefined)[], races: RaceId[]): World {
  const w = makeWorld(0x5196);
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: teams.map((t, s) => ({ seat: s, color: PLAYER_COLORS[s]!, raceId: races[s]!, ...(t !== undefined ? { team: t } : {}) })),
    botSeats: Array.from({ length: teams.length - 1 }, (_, i) => i + 1),
  });
  w.tick = 1000; // past the renderer's opening hold
  return w;
}

const brief = (plan: ZoneBackdrop[]) => plan.map((p) =>
  `${p.zone}:${p.url.replace('/art/race-zones/', '')}|${p.part}${p.mirror ? '|M' : ''}${p.blend ? `|b:${p.blend.map((b) => b.side).join('')}` : ''}`);

/** The shipped availability with NO trio art — what every board looked like before S196. */
const NO_TRIO: TileAvailability = { ...MANIFEST_TILES, trio: undefined };

/** A WebP's canvas size from its header (VP8X / VP8 / VP8L) — no decoder needed. */
function webpSize(b: Buffer): { w: number; h: number } {
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  return { w: -1, h: -1 };
}

describe('S196 — the shipped defaults (owner R196-A1)', () => {
  it('⭐ the seam blend on today\'s art is ON — his ruling: "today\'s art + cross-fade beats the hard edge"', () => {
    expect(TEAM_SEAM_BLEND_LEGACY_ART).toBe(true);
    expect(MANIFEST_TILES.blendLegacy).toBe(true);
    expect(MANIFEST_TILES.trio).toBe(trioBackdropUrl);
  });

  it('the manifest: 27 of his 56 cards (1–13, 15–28; card 14 downloaded empty), each a valid NE-SE-SW key', () => {
    expect(TEAM_TRIO_ART.length).toBe(27);
    expect(new Set(TEAM_TRIO_ART).size).toBe(27);
    const order = [...ALL_RACES].sort();
    const cards: string[] = [];
    for (let a = 0; a < 6; a++) for (let b = a; b < 6; b++) for (let c = b; c < 6; c++) cards.push(`${order[a]}-${order[b]}-${order[c]}`);
    expect(cards.length).toBe(56);
    expect(TEAM_TRIO_ART).toEqual([...cards.slice(0, 13), ...cards.slice(14, 28)]);
    expect(TEAM_TRIO_ART.includes('demons-nagas-vampires')).toBe(false); // card 14 — the 0-byte download
  });

  it('every listed key ships its 960×540 picture, and no trio picture sits there unlisted', () => {
    for (const key of TEAM_TRIO_ART) {
      const [ne, se, sw] = key.split('-') as [RaceId, RaceId, RaceId];
      const f = `public${teamTrioArtUrl(ne, se, sw)}`;
      expect(existsSync(f), key).toBe(true);
      expect(webpSize(readFileSync(f)), `${key} must be the whole board at half resolution`).toEqual({ w: 960, h: 540 });
    }
    const trioFiles = readdirSync('public/art/race-zones/teams').filter((f) => /^[a-z]+-[a-z]+-[a-z]+\.webp$/.test(f));
    expect(trioFiles.sort()).toEqual(TEAM_TRIO_ART.map((k) => `${k}.webp`).sort());
  });

  it('the resolver is POSITIONAL (NE, SE, SW), never a set', () => {
    expect(trioBackdropUrl('demons', 'mummies', 'nagas')).toBe('/art/race-zones/teams/demons-mummies-nagas.webp');
    expect(trioBackdropUrl('nagas', 'mummies', 'demons')).toBeNull(); // the same three races, other corners
    expect(trioBackdropUrl('mummies', 'demons', 'nagas')).toBeNull();
    expect(trioBackdropUrl('vampires', 'vampires', 'zombies')).toBeNull(); // not generated yet
  });
});

describe('S196 — the resolver table', () => {
  it('⭐ 3v1 WITH his picture: the trio\'s three quarters of it, ungraded, no blend; the solo keeps his own art', () => {
    const w = start([0, 0, 0, U], ['demons', 'mummies', 'nagas', 'orcs']);
    const plan = zoneBackdropPlan(w);
    expect(brief(plan)).toEqual([
      '0:zone-orcs-4p.png|full', // the solo, NW — walls up
      '1:teams/demons-mummies-nagas.webp|ne',
      '2:teams/demons-mummies-nagas.webp|se',
      '3:teams/demons-mummies-nagas.webp|sw',
    ]);
    expect(plan.filter((p) => p.zone !== 0).every((p) => p.grade === null && !p.mirror)).toBe(true);
  });

  it('⭐ 3v1 WITHOUT a picture (races not in a card\'s corners): today\'s art, the two trio seams cross-faded', () => {
    const w = start([0, 0, 0, U], ['nagas', 'mummies', 'demons', 'orcs']);
    expect(brief(zoneBackdropPlan(w))).toEqual([
      '0:zone-orcs-4p.png|full',
      '1:zone-nagas-4p.png|full|b:s',
      '2:zone-mummies-4p.png|full|b:nw',
      '3:zone-demons-4p.png|full|b:e',
    ]);
  });

  it('card 14 (demons · nagas · vampires — the empty download) falls back the same way', () => {
    const w = start([0, 0, 0, U], ['demons', 'nagas', 'vampires', 'zombies']);
    expect(brief(zoneBackdropPlan(w))).toEqual([
      '0:zone-zombies-4p.png|full',
      '1:zone-demons-4p.png|full|b:s',
      '2:zone-nagas-4p.png|full|b:nw',
      '3:zone-vampires-4p.png|full|b:e',
    ]);
  });

  it('a same-race trio with a picture (card 1) — and the solo may share a race with it', () => {
    const w = start([0, 0, 0, U], ['demons', 'demons', 'demons', 'demons']);
    expect(brief(zoneBackdropPlan(w))).toEqual([
      '0:zone-demons-4p.png|full',
      '1:teams/demons-demons-demons.webp|ne', '2:teams/demons-demons-demons.webp|se', '3:teams/demons-demons-demons.webp|sw',
    ]);
  });

  it('the host MOVE chip (N16) re-orders the corners: the picture follows who stands where, not the seat numbers', () => {
    // nagas, mummies, demons by seat → no card; the same races with slots swapped so NE=demons, SE=mummies, SW=nagas
    const w = makeWorld(0x5196);
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [
        { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'nagas', team: 0, slot: 3 },
        { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'mummies', team: 0, slot: 2 },
        { seat: 2, color: PLAYER_COLORS[2]!, raceId: 'demons', team: 0, slot: 1 },
        { seat: 3, color: PLAYER_COLORS[3]!, raceId: 'orcs', slot: 0 },
      ],
      botSeats: [1, 2, 3],
    });
    w.tick = 1000;
    expect(brief(zoneBackdropPlan(w)).slice(1)).toEqual([
      '1:teams/demons-mummies-nagas.webp|ne', '2:teams/demons-mummies-nagas.webp|se', '3:teams/demons-mummies-nagas.webp|sw',
    ]);
  });

  it('pairs, the 2v1 solo half and 1v1v2 solos are unchanged by the trio manifest', () => {
    for (const [teams, races] of [
      [[0, 1, 1, 0], ['demons', 'mummies', 'nagas', 'orcs']],
      [[0, 0, 1, 1], ['demons', 'mummies', 'nagas', 'orcs']],
      [[U, 0, 0], ['demons', 'mummies', 'nagas']],
      [[U, U, 1, 1], ['demons', 'mummies', 'nagas', 'orcs']],
    ] as Array<[(number | undefined)[], RaceId[]]>) {
      const w = start(teams, races);
      const plan = zoneBackdropPlan(w);
      expect(plan).toEqual(zoneBackdropPlan(w, NO_TRIO));
      expect(plan.some((p) => /teams\/[a-z]+-[a-z]+-[a-z]+\.webp/.test(p.url))).toBe(false);
    }
  });

  it('⛔ NEGATIVE — a free-for-all is byte-identical: no trio url, no quarter part, no blend', () => {
    for (const races of [['demons', 'mummies', 'nagas', 'orcs'], ['demons', 'demons', 'demons', 'demons'], ['demons', 'mummies', 'nagas']] as RaceId[][]) {
      const w = start(races.map(() => U), races);
      const plan = zoneBackdropPlan(w);
      expect(plan).toEqual(zoneBackdropPlan(w, NO_TRIO));
      expect(plan.every((p) => p.part === 'full' && p.blend === undefined && /zone-[a-z]+-4p\.png$/.test(p.url))).toBe(true);
    }
    const pitch = start([U, U], ['demons', 'mummies']);
    expect(zoneBackdropPlan(pitch)).toEqual(zoneBackdropPlan(pitch, NO_TRIO));
  });
});

describe('S196 — the NW-quarter mask (R195-T5: the solo owns NW; backdrops draw at 0.55 alpha)', () => {
  it('no zone but NE / SE / SW maps to a trio quarter, and no trio quarter rectangle touches the NW quarter', () => {
    expect([0, 1, 2, 3].map(trioQuarterOfZone)).toEqual([null, 'ne', 'se', 'sw']);
    for (const [w, h] of [[960, 540], [961, 541], [2, 2]] as const) {
      const rects = (['ne', 'se', 'sw'] as const).map((q) => trioQuarterRect(w, h, q));
      for (const r of rects) {
        const inNw = r.x < Math.trunc(w / 2) && r.y < Math.trunc(h / 2);
        expect(inNw, JSON.stringify({ w, h, r })).toBe(false);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
    }
    expect(trioQuarterRect(960, 540, 'ne')).toEqual({ x: 480, y: 0, w: 480, h: 270 });
    expect(trioQuarterRect(960, 540, 'se')).toEqual({ x: 480, y: 270, w: 480, h: 270 });
    expect(trioQuarterRect(960, 540, 'sw')).toEqual({ x: 0, y: 270, w: 480, h: 270 });
  });

  it('⛔ every one of the 27 pictures, on every 3v1 board it can appear on: zone 0 is never painted from it', () => {
    for (const key of TEAM_TRIO_ART) {
      const [ne, se, sw] = key.split('-') as [RaceId, RaceId, RaceId];
      for (const solo of ALL_RACES) {
        const plan = zoneBackdropPlan(start([0, 0, 0, U], [ne, se, sw, solo]));
        const nw = plan.find((p) => p.zone === 0)!;
        expect(nw.url, key).toBe(`/art/race-zones/zone-${solo}-4p.png`);
        expect(plan.filter((p) => p.url.endsWith(`${key}.webp`)).map((p) => `${p.zone}${p.part}`)).toEqual(['1ne', '2se', '3sw']);
      }
    }
  });
});

/** The real renderer; `Assets.load` is stubbed per test (the real `ensureTexture` runs). */
function renderer() {
  const app = { stage: new Container() } as unknown as Application;
  const r = new ZoneBackgroundRenderer(app, new Container());
  const inner = r as unknown as { sprites: Map<number, { label: string }>; baked: Map<string, unknown>; failed: Set<string> };
  return { r, inner, labelOf: (z: number) => inner.sprites.get(z)?.label };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const PIC = '/art/race-zones/teams/demons-mummies-nagas.webp';

describe('S196 — REACH through the real renderer sync (world.layout + world.teams of a real 3v1 START_GAME)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('⭐ the trio quadrants paint his picture, one quarter each; the solo NW his own art', async () => {
    const load = vi.spyOn(Assets, 'load').mockImplementation((async () => Texture.WHITE) as never);
    const w = start([0, 0, 0, U], ['demons', 'mummies', 'nagas', 'orcs']);
    expect(w.teams).toBeDefined();
    expect(w.layout).not.toBe('QUADRANTS_4P'); // the host's mapped board (solo seat 3 → NW)
    const { r, inner, labelOf } = renderer();
    r.sync(w);
    await flush();
    r.sync(w);
    expect([0, 1, 2, 3].map(labelOf)).toEqual([
      'zone-bg:/art/race-zones/zone-orcs-4p.png|full',
      `zone-bg:${PIC}|ne`, `zone-bg:${PIC}|se`, `zone-bg:${PIC}|sw`,
    ]);
    expect(load.mock.calls.filter(([u]) => String(u) === PIC).length).toBe(1); // one picture, loaded once
    expect([...inner.baked.keys()].filter((k) => k.startsWith(PIC)).map((k) => k.split('|')[1]).sort()).toEqual(['ne', 'se', 'sw']);
  });

  it('⭐ the real crop reads exactly that quarter of the picture (stub 2D canvas records drawImage)', async () => {
    const draws: number[][] = [];
    const ctx = new Proxy({}, {
      get: (_t, k) => (k === 'drawImage' ? (...a: unknown[]) => { draws.push(a.slice(1).map(Number)); }
        : String(k).includes('Gradient') ? () => ({ addColorStop() {} }) : () => {}),
      set: () => true,
    });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    vi.spyOn(Texture, 'from').mockImplementation(((c: { width: number; height: number }) =>
      new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: c.width || 1, height: c.height || 1 }) })) as never);
    vi.spyOn(Assets, 'load').mockImplementation((async (u: string) => new Texture({
      source: new BufferImageSource({ resource: new Uint8Array(4), width: u === PIC ? 960 : 480, height: u === PIC ? 540 : 270 }),
    })) as never);
    const w = start([0, 0, 0, U], ['demons', 'mummies', 'nagas', 'orcs']);
    const { r } = renderer();
    r.sync(w);
    await flush();
    r.sync(w);
    // the three 9-argument crops (src x, y, w, h → dst 0, 0, w, h); never the NW quarter (x < 480 AND y < 270)
    const crops = draws.filter((a) => a.length === 8 && a[2] === 480 && a[3] === 270 && a[4] === 0 && a[5] === 0);
    expect(crops.map((a) => `${a[0]},${a[1]}`).sort()).toEqual(['0,270', '480,0', '480,270']);
  });

  it('⭐ MISSING / BROKEN picture: its load REJECTS → marked failed → today\'s art with the seams cross-faded', async () => {
    vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
      if (url === PIC) throw new Error('404');
      return Texture.WHITE;
    }) as never);
    const w = start([0, 0, 0, U], ['demons', 'mummies', 'nagas', 'orcs']);
    const { r, inner, labelOf } = renderer();
    for (let i = 0; i < 3; i++) { r.sync(w); await flush(); }
    r.sync(w);
    expect(inner.failed.has(PIC)).toBe(true);
    expect([0, 1, 2, 3].map(labelOf)).toEqual([
      'zone-bg:/art/race-zones/zone-orcs-4p.png|full',
      'zone-bg:/art/race-zones/zone-demons-4p.png|full|blend:s',
      'zone-bg:/art/race-zones/zone-mummies-4p.png|full|blend:nw',
      'zone-bg:/art/race-zones/zone-nagas-4p.png|full|blend:e',
    ]);
  });

  it('⛔ NEGATIVE — an FFA through the real sync never requests a trio picture', async () => {
    const load = vi.spyOn(Assets, 'load').mockImplementation((async () => Texture.WHITE) as never);
    const w = start([U, U, U, U], ['demons', 'mummies', 'nagas', 'orcs']);
    const { r, labelOf } = renderer();
    r.sync(w);
    await flush();
    r.sync(w);
    expect([0, 1, 2, 3].map(labelOf)).toEqual([
      'zone-bg:/art/race-zones/zone-demons-4p.png|full', 'zone-bg:/art/race-zones/zone-mummies-4p.png|full',
      'zone-bg:/art/race-zones/zone-nagas-4p.png|full', 'zone-bg:/art/race-zones/zone-orcs-4p.png|full',
    ]);
    expect(load.mock.calls.some(([u]) => String(u).includes('/teams/'))).toBe(false);
  });
});
