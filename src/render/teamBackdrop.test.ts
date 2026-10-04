/**
 * SPARK — ⭐⭐ S195 (owner R194-19 / R195-T2 / R195-T5) — **TEAM BACKDROPS.**
 *
 *   · a 2-player team half shows the owner's pair art `{top}X{bottom}`: WEST as-is, EAST mirrored left↔right
 *     (*"not 180°"*);
 *   · the 2v1 solo shows the current 1v1 race art (`zone-<race>-2p`) across his half — NOT `{Race}X{Race}`;
 *   · a 1v1v2 solo and every 3v1 trio member show their own single-quadrant race art;
 *   · a free-for-all is byte-identical (each seat's race art on its home zone).
 * The pure plan, then REACH through the real renderer `sync`, then the FFA negative.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { Container, Texture, type Application } from 'pixi.js';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { ZoneBackgroundRenderer, teamPairArtUrl, trioBackdropUrl, zoneBackdropPlan } from './zoneBackgroundRenderer.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { ALL_RACES, type RaceId } from '../state/races.ts';

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

const brief = (w: World) => zoneBackdropPlan(w).map((p) => `${p.zone}:${p.url.replace('/art/race-zones/', '')}|${p.part}${p.mirror ? '|M' : ''}`);

describe('S195 — zoneBackdropPlan per team shape', () => {
  it('⭐ 2v2: west pair as-is ({NW}X{SW}), east pair MIRRORED ({NE}X{SE}), split per quadrant', () => {
    // seats 0+3 west (vampires over orcs), 1+2 east (nagas over mummies) — the identity board
    const w = start([0, 1, 1, 0], ['vampires', 'nagas', 'mummies', 'orcs']);
    expect(w.layout).toBe('QUADRANTS_4P');
    expect(brief(w)).toEqual([
      '0:teams/vampires-orcs.webp|top',
      '1:teams/nagas-mummies.webp|top|M',
      '2:teams/nagas-mummies.webp|bottom|M',
      '3:teams/vampires-orcs.webp|bottom',
    ]);
  });

  it('⭐ 2v2 on a mapped board: the pair image follows who stands top and bottom, not the seat numbers', () => {
    // seats 0+1 vs 2+3 → west = 0 (NW) over 1 (SW); east = 2 (NE) over 3 (SE)
    const w = start([0, 0, 1, 1], ['demons', 'zombies', 'nagas', 'orcs']);
    expect(w.layout).toBe('QUADRANTS_4P:0231');
    expect(brief(w)).toEqual([
      '0:teams/demons-zombies.webp|top',
      '1:teams/nagas-orcs.webp|top|M',
      '2:teams/nagas-orcs.webp|bottom|M',
      '3:teams/demons-zombies.webp|bottom',
    ]);
  });

  it('⭐ 2v1: the solo shows his 1v1 race art (zone-<race>-2p) across NW+SW; the pair its pair art east', () => {
    const w = start([U, 0, 0], ['mummies', 'demons', 'vampires']);
    expect(brief(w)).toEqual([
      '0:zone-mummies-2p.png|top',
      '1:teams/demons-vampires.webp|top|M',
      '2:teams/demons-vampires.webp|bottom|M',
      '3:zone-mummies-2p.png|bottom',
    ]);
    // ⛔ never {Race}X{Race} for the solo
    expect(brief(w).some((b) => b.includes('teams/mummies-mummies'))).toBe(false);
  });

  it('⭐ 1v1v2: the pair east; each solo his own single-quadrant (4p) art', () => {
    const w = start([U, U, 1, 1], ['orcs', 'zombies', 'nagas', 'vampires']);
    expect(brief(w)).toEqual([
      '0:zone-orcs-4p.png|full',
      '1:teams/nagas-vampires.webp|top|M',
      '2:teams/nagas-vampires.webp|bottom|M',
      '3:zone-zombies-4p.png|full',
    ]);
  });

  it('⭐ 3v1 (R195-T5, for now): every player his own single-quadrant race art; the trio seam returns null', () => {
    const w = start([0, 0, 0, U], ['orcs', 'zombies', 'nagas', 'vampires']);
    expect(brief(w)).toEqual([
      '0:zone-vampires-4p.png|full', // the solo, NW
      '1:zone-orcs-4p.png|full',
      '2:zone-zombies-4p.png|full',
      '3:zone-nagas-4p.png|full',
    ]);
    expect(trioBackdropUrl('orcs', 'zombies', 'nagas')).toBeNull();
  });

  it('⛔ NEGATIVE — FFA: each seat its race 4p art on its home zone; a 3-seat FFA paints no SW', () => {
    expect(brief(start([U, U, U, U], ['orcs', 'zombies', 'nagas', 'vampires']))).toEqual([
      '0:zone-orcs-4p.png|full', '1:zone-zombies-4p.png|full', '2:zone-nagas-4p.png|full', '3:zone-vampires-4p.png|full',
    ]);
    expect(brief(start([U, U, U], ['orcs', 'zombies', 'nagas']))).toEqual([
      '0:zone-orcs-4p.png|full', '1:zone-zombies-4p.png|full', '2:zone-nagas-4p.png|full',
    ]);
    // the pitch, with or without teams: each seat's 2p art (2 seats can never share a side)
    expect(brief(start([U, U], ['orcs', 'zombies']))).toEqual(['0:zone-orcs-2p.png|full', '1:zone-zombies-2p.png|full']);
  });

  it('every pair url the plan can name ships in public/ (36 files, a,b in TOP-BOTTOM order)', () => {
    expect(ALL_RACES.length).toBe(6);
    for (const a of ALL_RACES) for (const b of ALL_RACES) {
      const url = teamPairArtUrl(a, b);
      expect(existsSync(`public${url}`), url).toBe(true);
    }
  });
});

/** The real renderer, its texture loader short-circuited (no network / GPU under vitest). */
function renderer(): { r: ZoneBackgroundRenderer; labelOf: (zone: number) => string | undefined; zones: () => number[] } {
  const app = { stage: new Container() } as unknown as Application;
  const r = new ZoneBackgroundRenderer(app, new Container());
  const inner = r as unknown as {
    ensureTexture(url: string): void;
    textures: Map<string, Texture>;
    sprites: Map<number, { label: string }>;
  };
  inner.ensureTexture = (url: string) => { inner.textures.set(url, Texture.WHITE); };
  return { r, labelOf: (zone) => inner.sprites.get(zone)?.label, zones: () => [...inner.sprites.keys()].sort() };
}

describe('S195 — REACH through the real renderer sync', () => {
  it('⭐ a 2v1 board paints four quadrant sprites: the solo half and the MIRRORED east pair half', () => {
    const w = start([U, 0, 0], ['mummies', 'demons', 'vampires']);
    const { r, labelOf, zones } = renderer();
    r.sync(w);
    r.sync(w);
    expect(zones()).toEqual([0, 1, 2, 3]);
    expect(labelOf(0)).toBe('zone-bg:/art/race-zones/zone-mummies-2p.png|top');
    expect(labelOf(3)).toBe('zone-bg:/art/race-zones/zone-mummies-2p.png|bottom');
    expect(labelOf(1)).toBe('zone-bg:/art/race-zones/teams/demons-vampires.webp|top|mirror');
    expect(labelOf(2)).toBe('zone-bg:/art/race-zones/teams/demons-vampires.webp|bottom|mirror');
  });

  it('⛔ NEGATIVE — a 3-seat FFA paints three home zones and nothing on SW', () => {
    const w = start([U, U, U], ['orcs', 'zombies', 'nagas']);
    const { r, labelOf, zones } = renderer();
    r.sync(w);
    r.sync(w);
    expect(zones()).toEqual([0, 1, 2]);
    expect(labelOf(2)).toBe('zone-bg:/art/race-zones/zone-nagas-4p.png|full');
  });

  it('the mirror is the VERTICAL axis only (left↔right), never a 180° turn', () => {
    const src = readFileSync(new URL('./zoneBackgroundRenderer.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function cropHalfTexture'), src.indexOf('function cropHalfTexture') + 1800);
    expect(body).toMatch(/ctx\.translate\(w, 0\);\s*ctx\.scale\(-1, 1\);/);
    expect(body).not.toMatch(/rotate|scale\(-1, -1\)|scale\(1, -1\)/);
    expect(src).toMatch(/const src = piece\.part === 'full' \? raw : cropHalfTexture\(raw, piece\.part, piece\.mirror\);/);
  });
});
