/**
 * SPARK — S196 `s196/render-perf` fix round (audit MED-1) — **THE LOBBY'S OWN REGISTRATION IS WHAT KEEPS ITS ART ALIVE.**
 *
 * `zoneBackdropRelease.test.ts` called `holdForLobby` by hand, so the ONE real caller (`lobbyBackdrop.ts`, in
 * `backdropTexture`'s load callback) was untested: deleting it left every render test green. Lose that line
 * and a 4-player orcs match ends → the title's `releaseAll` unloads `zone-orcs-4p.png` → that destroys the
 * SAME `Texture` the lobby cached → the next lobby visit draws a sprite whose source is null.
 *
 * Driven here through the REAL `makeLobbyBackdrop().update(seats)` and the REAL `ZoneBackgroundRenderer.sync`,
 * with only `Assets.load` / `Assets.unload` stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Assets, BufferImageSource, Container, Texture, type Application } from 'pixi.js';
import { MAX_PLAYERS, PLAYER_COLORS } from '../constants.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import type { RaceId } from '../state/races.ts';
import type { SeatView } from './lobbyStateMachine.ts';
import { makeLobbyBackdrop } from './lobbyBackdrop.ts';
import { lobbyHoldsTexture } from './backdropTextureShare.ts';
import { ZoneBackgroundRenderer } from './zoneBackgroundRenderer.ts';

const ORCS_4P = '/art/race-zones/zone-orcs-4p.png';
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function orcSeats(n: number): SeatView[] {
  const out: SeatView[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const occ = i < n;
    out.push({ index: i, color: 0, occupied: occ, isHost: occ && i === 0, isYou: occ && i === 0, raceId: occ ? 'orcs' : undefined });
  }
  return out;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('S196 MED-1 — the REAL lobby registers what it caches, so the board never unloads it', () => {
  it('⭐ a 4-seat orcs lobby → orcs match → title: zone-orcs-4p.png is held by the lobby and NOT unloaded', async () => {
    const made = new Map<string, Texture>();
    vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
      const t = made.get(url) ?? new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }) });
      made.set(url, t); // the Assets cache: one url, one shared Texture
      return t;
    }) as never);
    const unload = vi.spyOn(Assets, 'unload').mockImplementation((async () => undefined) as never);

    // the lobby, through its real update path (its re-projection poll rides Ticker.shared: no rAF in node)
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const lobby = makeLobbyBackdrop(() => true);
    lobby.update(orcSeats(4));
    await flush();
    const lobbyTex = made.get(ORCS_4P);
    expect(lobbyTex, 'the lobby asked for the 4-player orcs art').toBeDefined();
    expect(lobbyHoldsTexture(lobbyTex!)).toBe(true);

    // the board, through its real sync: an all-orcs 4-player match, then the title
    const w = makeWorld(0x5196);
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]!, raceId: 'orcs' as RaceId })),
      botSeats: [1, 2, 3],
    });
    w.tick = 1000;
    const r = new ZoneBackgroundRenderer({ stage: new Container() } as unknown as Application, new Container());
    r.sync(w); await flush(); r.sync(w);
    expect((r as unknown as { textures: Map<string, Texture> }).textures.get(ORCS_4P)).toBe(lobbyTex); // the SAME object
    w.gameState = 'TITLE';
    r.sync(w);
    expect(unload.mock.calls.map(([u]) => String(u))).not.toContain(ORCS_4P);
    expect(lobbyTex!.destroyed).toBe(false);
  });
});
