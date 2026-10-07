/**
 * SPARK — S196 `s196/render-perf` (team-art audit L1) — **A BACKDROP PICTURE NO QUADRANT USES IS RELEASED.**
 *
 * Before S196 `ZoneBackgroundRenderer.textures` only grew: every race / pair / trio picture a session met
 * stayed decoded for the life of the tab (27 trios × 960×540 RGBA ≈ 54 MB worst case). These tests drive the
 * REAL renderer `sync` over real `START_GAME` worlds with `Assets.load` / `Assets.unload` stubbed (the real
 * `ensureTexture`, plan, bake and release code all run).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Assets, BufferImageSource, Container, Texture, type Application } from 'pixi.js';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { TEAM_TRIO_ART, ZoneBackgroundRenderer, teamTrioArtUrl } from './zoneBackgroundRenderer.ts';
import { holdForLobby } from './backdropTextureShare.ts';
import { PLAYER_COLORS } from '../constants.ts';
import type { RaceId } from '../state/races.ts';

const U = undefined;

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

function renderer() {
  const app = { stage: new Container() } as unknown as Application;
  const r = new ZoneBackgroundRenderer(app, new Container());
  const inner = r as unknown as {
    sprites: Map<number, { texture: Texture; destroyed: boolean }>;
    textures: Map<string, Texture>;
    baked: Map<string, Texture>;
    loadStarted: Set<string>;
  };
  return { r, inner };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const tex = () => new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }) });

/** Stub the loader: a distinct texture per url, resolved at once unless the url is in `hold`. */
function stubAssets(hold: Set<string> = new Set()) {
  const made = new Map<string, Texture>();
  const pending = new Map<string, () => void>();
  const load = vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
    if (hold.has(url)) await new Promise<void>((res) => pending.set(url, res));
    const t = tex();
    made.set(url, t);
    return t;
  }) as never);
  const unload = vi.spyOn(Assets, 'unload').mockImplementation((async () => undefined) as never);
  const unloaded = () => unload.mock.calls.map(([u]) => String(u));
  return { load, unload, unloaded, made, release: (url: string) => pending.get(url)?.() };
}

const TRIO_A = { teams: [0, 0, 0, U], races: ['demons', 'mummies', 'nagas', 'orcs'] as RaceId[] };
const PIC_A = teamTrioArtUrl('demons', 'mummies', 'nagas');
const TRIO_B = { teams: [0, 0, 0, U], races: ['demons', 'demons', 'demons', 'zombies'] as RaceId[] };
const PIC_B = teamTrioArtUrl('demons', 'demons', 'demons');

afterEach(() => { vi.restoreAllMocks(); });

describe('S196 L1 — the title releases every backdrop (REACH through the real sync)', () => {
  it('⭐ a 3v1 trio match, then TITLE: the trio picture and the solo art are unloaded; nothing is held', async () => {
    const a = stubAssets();
    const w = start(TRIO_A.teams, TRIO_A.races);
    const { r, inner } = renderer();
    r.sync(w);
    await flush();
    r.sync(w);
    expect(inner.sprites.size).toBe(4);
    expect([...inner.textures.keys()].sort()).toEqual([PIC_A, '/art/race-zones/zone-orcs-4p.png'].sort());
    const sprites = [...inner.sprites.values()];

    w.gameState = 'TITLE';
    r.sync(w);
    expect(a.unloaded().sort()).toEqual([PIC_A, '/art/race-zones/zone-orcs-4p.png'].sort());
    expect(inner.textures.size).toBe(0);
    expect(inner.baked.size).toBe(0);
    expect(inner.sprites.size).toBe(0);
    expect(sprites.every((s) => s.destroyed)).toBe(true);
    // idempotent: a second title frame does nothing more
    r.sync(w);
    expect(a.unload).toHaveBeenCalledTimes(2);
  });

  it('⭐ and the NEXT match loads its art again (a released url is asked for afresh, not stranded)', async () => {
    const a = stubAssets();
    const w = start(TRIO_A.teams, TRIO_A.races);
    const { r, inner } = renderer();
    r.sync(w); await flush(); r.sync(w);
    w.gameState = 'TITLE';
    r.sync(w);
    const w2 = start(TRIO_A.teams, TRIO_A.races);
    r.sync(w2); await flush(); r.sync(w2);
    expect(a.load.mock.calls.filter(([u]) => String(u) === PIC_A).length).toBe(2);
    expect(inner.sprites.size).toBe(4);
  });
});

describe('S196 L1 — a plan change mid-session releases what the new plan does not name', () => {
  it('⭐ trio A then trio B (no title between): A is unloaded once B is painted; B is kept', async () => {
    const a = stubAssets();
    const { r, inner } = renderer();
    const wa = start(TRIO_A.teams, TRIO_A.races);
    r.sync(wa); await flush(); r.sync(wa);
    const wb = start(TRIO_B.teams, TRIO_B.races);
    r.sync(wb); await flush(); r.sync(wb);
    expect(a.unloaded()).toContain(PIC_A);
    expect(a.unloaded()).toContain('/art/race-zones/zone-orcs-4p.png');
    expect(a.unloaded()).not.toContain(PIC_B);
    expect([...inner.textures.keys()].sort()).toEqual([PIC_B, '/art/race-zones/zone-zombies-4p.png'].sort());
  });

  it('⛔ NEGATIVE — a picture still ON a sprite while its replacement loads is NOT released (no blank quadrant)', async () => {
    const a = stubAssets(new Set([PIC_B]));
    const { r, inner } = renderer();
    const wa = start(TRIO_A.teams, TRIO_A.races);
    r.sync(wa); await flush(); r.sync(wa);
    const wb = start(TRIO_B.teams, TRIO_B.races);
    r.sync(wb); await flush(); r.sync(wb);
    // B's picture is still loading: quadrants 1-3 keep showing A, so A stays loaded
    expect(a.unloaded()).not.toContain(PIC_A);
    expect(inner.textures.has(PIC_A)).toBe(true);
    expect(inner.sprites.get(1)!.texture).toBe(a.made.get(PIC_A));
    a.release(PIC_B);
    await flush();
    r.sync(wb);
    expect(inner.sprites.get(1)!.texture).toBe(a.made.get(PIC_B));
    expect(a.unloaded()).toContain(PIC_A); // released the frame the swap landed
  });

  it('⛔ NEGATIVE — a url the plan names but has not loaded yet is never released', async () => {
    const a = stubAssets(new Set([PIC_A]));
    const { r, inner } = renderer();
    const wa = start(TRIO_A.teams, TRIO_A.races);
    r.sync(wa); await flush(); r.sync(wa); r.sync(wa);
    expect(inner.loadStarted.has(PIC_A)).toBe(true);
    expect(a.unloaded()).toEqual([]);
  });

  it('⛔ NEGATIVE — a texture the LOBBY holds is dropped from the board cache but never unloaded', async () => {
    const a = stubAssets();
    const { r, inner } = renderer();
    const wa = start(TRIO_A.teams, TRIO_A.races);
    r.sync(wa); await flush(); r.sync(wa);
    holdForLobby(a.made.get('/art/race-zones/zone-orcs-4p.png')!);
    wa.gameState = 'TITLE';
    r.sync(wa);
    expect(a.unloaded()).toEqual([PIC_A]);
    expect(inner.textures.size).toBe(0);
  });
});

describe('S196 L1 — arithmetic: the held set is bounded by the board, not by the session', () => {
  it('cycling all 27 trio pictures through one renderer never holds more than 2 loaded pictures (trio + solo)', async () => {
    const a = stubAssets();
    const { r, inner } = renderer();
    let maxHeld = 0;
    const solos: RaceId[] = ['orcs', 'vampires', 'zombies'];
    for (const [i, key] of TEAM_TRIO_ART.entries()) {
      const [ne, se, sw] = key.split('-') as [RaceId, RaceId, RaceId];
      const w = start([0, 0, 0, U], [ne, se, sw, solos[i % solos.length]!]);
      r.sync(w); await flush(); r.sync(w);
      maxHeld = Math.max(maxHeld, inner.textures.size);
    }
    // 27 pictures × 960×540×4 B ≈ 56 MB before; now one trio + one solo art at a time.
    expect(a.load.mock.calls.length).toBeGreaterThanOrEqual(27);
    expect(maxHeld).toBeLessThanOrEqual(2);
    expect(inner.baked.size).toBeLessThanOrEqual(4);
  });
});
