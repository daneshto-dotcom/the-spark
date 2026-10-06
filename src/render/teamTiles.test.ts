/**
 * SPARK — ⭐⭐ S195 N19 (owner) — **SIX BLENDABLE RACE TILES, NOT 56 TRIO IMAGES.**
 * *"just take the single-player and put them beside each other … you just take the walls down between them
 * … if it doesn't look perfect, I'll just generate six."*
 *
 *   · the resolver: a 3v1 trio paints from tiles when EVERY trio race has one (⚠ MINE all-or-none), pairs keep
 *     the owner's pair art unless `forPairs` (⚠ MINE off), solos / the 2v1 solo half / FFA never read a tile;
 *   · the seam cross-fade: every open seam between TEAMMATES on single-quadrant art, never an enemy seam;
 *   · the manifest ships EMPTY, so every board is byte-identical to deploy #8 except the 3v1 cross-fade
 *     (`TEAM_SEAM_BLEND_LEGACY_ART`, ⚠ MINE on);
 *   · REACH through the real renderer `sync`, the FFA negative, and the missing-file fallback through the real
 *     `Assets.load` rejection path.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { Assets, Container, Texture, type Application } from 'pixi.js';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  MANIFEST_TILES,
  TEAM_SEAM_BLEND_LEGACY_ART,
  TEAM_SEAM_FEATHER,
  TEAM_TILES_FOR_PAIRS,
  TEAM_TILE_RACES,
  ZoneBackgroundRenderer,
  seamBandPx,
  teamTileUrl,
  zoneBackdropPlan,
  type TileAvailability,
  type ZoneBackdrop,
} from './zoneBackgroundRenderer.ts';
import { PLAYER_COLORS } from '../constants.ts';
import type { RaceId } from '../state/races.ts';

const U = undefined;

function start(teams: (number | undefined)[], races: RaceId[]): World {
  const w = makeWorld(0x5195);
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: teams.map((t, s) => ({ seat: s, color: PLAYER_COLORS[s]!, raceId: races[s]!, ...(t !== undefined ? { team: t } : {}) })),
    botSeats: Array.from({ length: teams.length - 1 }, (_, i) => i + 1),
  });
  w.tick = 1000; // past the renderer's opening hold
  return w;
}

const tilesFor = (races: readonly RaceId[], over: Partial<TileAvailability> = {}): TileAvailability => ({
  has: (r) => races.includes(r), url: teamTileUrl, forPairs: false, blendLegacy: false, ...over,
});
const ALL6: RaceId[] = ['demons', 'mummies', 'nagas', 'orcs', 'vampires', 'zombies'];

const brief = (plan: ZoneBackdrop[]) => plan.map((p) =>
  `${p.zone}:${p.url.replace('/art/race-zones/', '')}|${p.part}${p.mirror ? '|M' : ''}${p.blend ? `|b:${p.blend.map((b) => `${b.side}=${b.url.replace('/art/race-zones/', '')}`).join(',')}` : ''}`);

describe('S195 N19 — the shipped defaults', () => {
  it('the manifest ships EMPTY, pairs keep pair art, today\'s 3v1 art blends (each ⚠ MINE, pinned)', () => {
    expect(TEAM_TILE_RACES).toEqual([]);
    expect(TEAM_TILES_FOR_PAIRS).toBe(false);
    expect(TEAM_SEAM_BLEND_LEGACY_ART).toBe(true);
    expect(TEAM_SEAM_FEATHER).toBe(0.22);
    expect(MANIFEST_TILES.blendLegacy).toBe(TEAM_SEAM_BLEND_LEGACY_ART);
    expect(teamTileUrl('orcs')).toBe('/art/race-zones/tiles/orcs.webp');
  });

  it('every race the manifest lists ships its tile in public/ (vacuous until he delivers; the folder exists)', () => {
    expect(existsSync('public/art/race-zones/tiles')).toBe(true);
    for (const r of TEAM_TILE_RACES) expect(existsSync(`public${teamTileUrl(r)}`), r).toBe(true);
    // ⛔ and no stray tile sits there unlisted (a delivered file that nobody wired is a silent no-op)
    const files = readdirSync('public/art/race-zones/tiles').filter((f) => f.endsWith('.webp'));
    expect(files.sort()).toEqual(TEAM_TILE_RACES.map((r) => `${r}.webp`).sort());
  });

  it('⭐ the default plan (no tiles): 3v1 = today\'s 4p art, cross-faded on the two trio seams only', () => {
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    expect(brief(zoneBackdropPlan(w))).toEqual([
      '0:zone-vampires-4p.png|full', // the solo NW — walls up, nothing blends into him
      '1:zone-orcs-4p.png|full|b:s=zone-zombies-4p.png',
      '2:zone-zombies-4p.png|full|b:n=zone-orcs-4p.png,w=zone-nagas-4p.png',
      '3:zone-nagas-4p.png|full|b:e=zone-zombies-4p.png',
    ]);
  });
});

describe('S195 N19 — the resolver table', () => {
  it('⭐ 3v1 with all six tiles: each trio member his race tile, seams NE|SE and SE|SW blended; the solo untouched', () => {
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    expect(brief(zoneBackdropPlan(w, tilesFor(ALL6)))).toEqual([
      '0:zone-vampires-4p.png|full',
      '1:tiles/orcs.webp|full|b:s=tiles/zombies.webp',
      '2:tiles/zombies.webp|full|b:n=tiles/orcs.webp,w=tiles/nagas.webp',
      '3:tiles/nagas.webp|full|b:e=tiles/zombies.webp',
    ]);
  });

  it('⚠ MINE all-or-none: one trio race without a tile → the whole trio stays on today\'s art', () => {
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    const plan = zoneBackdropPlan(w, tilesFor(['orcs', 'zombies'])); // nagas missing
    expect(plan.every((p) => !p.url.includes('/tiles/'))).toBe(true);
    // …and with the legacy flag off, today's art does not blend
    expect(zoneBackdropPlan(w, tilesFor(['orcs', 'zombies'])).some((p) => p.blend !== undefined)).toBe(false);
    expect(zoneBackdropPlan(w, tilesFor(['orcs', 'zombies'], { blendLegacy: true })).filter((p) => p.blend).length).toBe(3);
  });

  it('a same-race trio blends too (two copies of one tile still meet at a seam)', () => {
    const w = start([0, 0, 0, U], ['orcs', 'orcs', 'orcs', 'demons']);
    const plan = zoneBackdropPlan(w, tilesFor(ALL6));
    expect(plan.find((p) => p.zone === 2)?.blend?.map((b) => b.side)).toEqual(['n', 'w']);
  });

  it('⭐ pairs keep the owner\'s pair art while forPairs is off, even with every tile present', () => {
    const t = tilesFor(ALL6);
    expect(brief(zoneBackdropPlan(start([0, 1, 1, 0], ['vampires', 'nagas', 'mummies', 'orcs']), t))).toEqual([
      '0:teams/vampires-orcs.webp|top', '1:teams/nagas-mummies.webp|top|M',
      '2:teams/nagas-mummies.webp|bottom|M', '3:teams/vampires-orcs.webp|bottom',
    ]);
    expect(brief(zoneBackdropPlan(start([U, 0, 0], ['mummies', 'demons', 'vampires']), t))).toEqual([
      '0:zone-mummies-2p.png|top', '1:teams/demons-vampires.webp|top|M',
      '2:teams/demons-vampires.webp|bottom|M', '3:zone-mummies-2p.png|bottom',
    ]);
  });

  it('forPairs on: a 2v2 paints four tiles, each pair blended on its OWN seam only — never across the enemy line', () => {
    const plan = zoneBackdropPlan(start([0, 1, 1, 0], ['vampires', 'nagas', 'mummies', 'orcs']), tilesFor(ALL6, { forPairs: true }));
    expect(brief(plan)).toEqual([
      '0:tiles/vampires.webp|full|b:s=tiles/orcs.webp',
      '1:tiles/nagas.webp|full|b:s=tiles/mummies.webp',
      '2:tiles/mummies.webp|full|b:n=tiles/nagas.webp',
      '3:tiles/orcs.webp|full|b:n=tiles/vampires.webp',
    ]);
  });

  it('forPairs on: the 2v1 solo half stays his 1v1 art and nothing blends into it', () => {
    const plan = zoneBackdropPlan(start([U, 0, 0], ['mummies', 'demons', 'vampires']), tilesFor(ALL6, { forPairs: true }));
    expect(brief(plan)).toEqual([
      '0:zone-mummies-2p.png|top', '1:tiles/demons.webp|full|b:s=tiles/vampires.webp',
      '2:tiles/vampires.webp|full|b:n=tiles/demons.webp', '3:zone-mummies-2p.png|bottom',
    ]);
  });

  it('1v1v2 solos never read a tile and never blend (walls up on both sides)', () => {
    const plan = zoneBackdropPlan(start([U, U, 1, 1], ['orcs', 'zombies', 'nagas', 'vampires']), tilesFor(ALL6, { forPairs: true, blendLegacy: true }));
    expect(brief(plan).filter((b) => b.startsWith('0:') || b.startsWith('3:'))).toEqual([
      '0:zone-orcs-4p.png|full', '3:zone-zombies-4p.png|full',
    ]);
  });

  it('⛔ NEGATIVE — a free-for-all is byte-identical whatever the tiles say (no tile url, no blend field)', () => {
    for (const races of [['orcs', 'zombies', 'nagas', 'vampires'], ['demons', 'demons', 'mummies']] as RaceId[][]) {
      const w = start(races.map(() => U), races);
      const base = zoneBackdropPlan(w);
      for (const t of [tilesFor(ALL6), tilesFor(ALL6, { forPairs: true, blendLegacy: true })]) {
        const plan = zoneBackdropPlan(w, t);
        expect(plan).toEqual(base);
        expect(plan.every((p) => p.blend === undefined && !p.url.includes('/tiles/'))).toBe(true);
      }
    }
    // the pitch too
    const pitch = start([U, U], ['orcs', 'zombies']);
    expect(zoneBackdropPlan(pitch, tilesFor(ALL6, { forPairs: true, blendLegacy: true }))).toEqual(zoneBackdropPlan(pitch));
  });

  it('the band arithmetic: TEAM_SEAM_FEATHER of the extent ACROSS the seam, in the texture\'s own pixels', () => {
    expect(seamBandPx(480, 270, 'e')).toBe(106); // 480 × 0.22 = 105.6
    expect(seamBandPx(480, 270, 'w')).toBe(106);
    expect(seamBandPx(480, 270, 'n')).toBe(59); // 270 × 0.22 = 59.4
    expect(seamBandPx(480, 270, 's')).toBe(59);
    expect(seamBandPx(2, 2, 'n')).toBe(1); // never zero
  });
});

/** The real renderer; `load` decides what `Assets.load` does for each url (the real ensureTexture runs). */
function renderer(tiles?: TileAvailability) {
  const app = { stage: new Container() } as unknown as Application;
  const r = new ZoneBackgroundRenderer(app, new Container());
  const inner = r as unknown as {
    sprites: Map<number, { label: string }>;
    baked: Map<string, unknown>;
    failed: Set<string>;
    tileBase: TileAvailability;
  };
  if (tiles !== undefined) inner.tileBase = tiles;
  return { r, inner, labelOf: (z: number) => inner.sprites.get(z)?.label };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('S195 N19 — REACH through the real renderer sync', () => {
  afterEach(() => vi.restoreAllMocks());

  it('⭐ tiles listed and loading: the trio quadrants paint the tiles, labelled with their blended seams', async () => {
    vi.spyOn(Assets, 'load').mockImplementation((async () => Texture.WHITE) as never);
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    const { r, inner, labelOf } = renderer(tilesFor(ALL6));
    r.sync(w);
    await flush();
    r.sync(w);
    expect(labelOf(0)).toBe('zone-bg:/art/race-zones/zone-vampires-4p.png|full');
    expect(labelOf(1)).toBe('zone-bg:/art/race-zones/tiles/orcs.webp|full|blend:s');
    expect(labelOf(2)).toBe('zone-bg:/art/race-zones/tiles/zombies.webp|full|blend:nw');
    expect(labelOf(3)).toBe('zone-bg:/art/race-zones/tiles/nagas.webp|full|blend:e');
    // the blend is part of the bake key, so a changed neighbour re-bakes instead of reusing a stale fade
    expect([...inner.baked.keys()].filter((k) => k.includes('|b:')).length).toBe(3);
  });

  it('⭐ MISSING FILE: a listed tile whose load REJECTS falls back to today\'s art (the real catch marks it failed)', async () => {
    vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
      if (url.includes('/tiles/nagas')) throw new Error('404');
      return Texture.WHITE;
    }) as never);
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    const { r, inner, labelOf } = renderer(tilesFor(ALL6, { blendLegacy: TEAM_SEAM_BLEND_LEGACY_ART }));
    r.sync(w);
    await flush();
    r.sync(w);
    await flush();
    r.sync(w);
    expect(inner.failed.has('/art/race-zones/tiles/nagas.webp')).toBe(true);
    // all-or-none: the whole trio is back on today's art, cross-faded by the legacy flag (on)
    expect(labelOf(1)).toBe('zone-bg:/art/race-zones/zone-orcs-4p.png|full|blend:s');
    expect(labelOf(2)).toBe('zone-bg:/art/race-zones/zone-zombies-4p.png|full|blend:nw');
    expect(labelOf(3)).toBe('zone-bg:/art/race-zones/zone-nagas-4p.png|full|blend:e');
    expect([0, 1, 2, 3].every((z) => labelOf(z) !== undefined)).toBe(true); // never a black quadrant
  });

  it('a blending quadrant waits for its teammate\'s art, then paints (never bakes a half-blend)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
      if (url.includes('zombies')) await gate;
      return Texture.WHITE;
    }) as never);
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    const { r, labelOf } = renderer();
    r.sync(w);
    await flush();
    r.sync(w);
    // orcs (NE) and nagas (SW) both border zombies (SE): held until it lands
    expect(labelOf(1)).toBeUndefined();
    expect(labelOf(3)).toBeUndefined();
    expect(labelOf(0)).toBe('zone-bg:/art/race-zones/zone-vampires-4p.png|full');
    release();
    await flush();
    r.sync(w);
    expect(labelOf(1)).toBe('zone-bg:/art/race-zones/zone-orcs-4p.png|full|blend:s');
    expect(labelOf(3)).toBe('zone-bg:/art/race-zones/zone-nagas-4p.png|full|blend:e');
  });

  it('⛔ NEGATIVE — an FFA through the real sync: four plain labels, no blend, no tile request', async () => {
    const load = vi.spyOn(Assets, 'load').mockImplementation((async () => Texture.WHITE) as never);
    const w = start([U, U, U, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    const { r, labelOf } = renderer(tilesFor(ALL6, { forPairs: true, blendLegacy: true }));
    r.sync(w);
    await flush();
    r.sync(w);
    expect([0, 1, 2, 3].map(labelOf)).toEqual([
      'zone-bg:/art/race-zones/zone-orcs-4p.png|full', 'zone-bg:/art/race-zones/zone-zombies-4p.png|full',
      'zone-bg:/art/race-zones/zone-nagas-4p.png|full', 'zone-bg:/art/race-zones/zone-vampires-4p.png|full',
    ]);
    expect(load.mock.calls.some(([u]) => String(u).includes('/tiles/'))).toBe(false);
  });
});
