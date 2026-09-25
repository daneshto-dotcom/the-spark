/**
 * SPARK — S190 (audit SW-7) — **THE SWARM'S SHEET IS FETCHED ON THE PICK, NEVER AT MATCH START.**
 *
 * `preloadRaceKit` warmed `t3BatSwarm` for every seated vampire race: a 2400×800 RGBA sheet (7.32 MiB
 * decoded) held in texture memory all match on every peer, for a unit that cannot exist before the
 * wave-11 draft and then only for a seat that took `vampires.l10`. It now warms from `sync` once a
 * seat HOLDS the perk (`warmPerkSheets`), and the bat-sheet fallback (`atlasFallbackType`) covers the
 * gap until it resolves.
 *
 * ⚠ HOW THIS IS TESTED. No renderer runs under vitest and `loadAtlas` does real network I/O, so it is
 * stubbed and COUNTED on a real `GoblinRenderer` — the stink-bag portrait precedent
 * (`stinkBagPortrait.test.ts`). The assertions are about WHEN the load is triggered, through the real
 * `preloadRaceKit` and the real `sync`, not about pixels: a behavioural assertion on the class, not a
 * source-text guard, so it cannot be green over a line that is never reached.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Application, Container } from 'pixi.js';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import type { DraftPick } from '../state/draft.ts';
import type { RaceId } from '../state/races.ts';
import { ALL_RACES } from '../state/races.ts';
import { BAT_SWARM_ATLAS_BASE, GoblinRenderer } from './goblinRenderer.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const stubParent = (): Container => ({ addChild: () => undefined } as unknown as Container);
const stubApp = (): Application => ({ stage: { addChild: () => undefined } } as unknown as Application);

/** A real renderer whose network load is stubbed and recorded as `[key, base]` pairs. */
function rendererWithCountedLoad(): { r: GoblinRenderer; keys: () => string[] } {
  const r = new GoblinRenderer(stubApp(), stubParent());
  const spy = vi.fn();
  (r as unknown as { loadAtlas: (key: string, base: string) => void }).loadAtlas = spy;
  return { r, keys: () => spy.mock.calls.map((c) => c[0] as string) };
}

/** A two-seat world with nothing on the board: seat 0 of `race` holding `picks`. */
function world(race: RaceId, picks: DraftPick[]): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!, { x: 0, y: 0 }, race));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!, { x: 0, y: 0 }, 'orcs'));
  w.players.get(P0)!.draftPicks.push(...picks);
  return w;
}

const swarmLoads = (keys: string[]): number => keys.filter((k) => k === 't3BatSwarm').length;

describe('S190 SW-7 — the swarm sheet is not part of the match-start race kit', () => {
  it('⭐⭐ preloadRaceKit("vampires") warms the bat and the boss, and NOT the swarm', () => {
    const { r, keys } = rendererWithCountedLoad();
    r.preloadRaceKit('vampires');
    expect(keys()).toContain('t3Bat');
    expect(swarmLoads(keys())).toBe(0);
  });

  it('no race kit warms it', () => {
    const { r, keys } = rendererWithCountedLoad();
    for (const race of ALL_RACES) r.preloadRaceKit(race);
    expect(swarmLoads(keys())).toBe(0);
  });
});

describe('S190 SW-7 — it warms on the seat’s vampires.l10 pick, through the real sync', () => {
  it('⛔ nothing is fetched before the pick: levels 0 and 5 taken (racial both times), wave 11 not yet', () => {
    const { r, keys } = rendererWithCountedLoad();
    const w = world('vampires', ['racial', 'racial']);
    r.preloadRaceKit('vampires');
    for (let i = 0; i < 3; i++) r.sync(w);
    expect(swarmLoads(keys())).toBe(0);
  });

  it('⭐⭐ the frame after the seat takes "racial" at wave 11, the swarm sheet is fetched — once', () => {
    const { r, keys } = rendererWithCountedLoad();
    const w = world('vampires', ['hp', 'def']);
    r.sync(w);
    expect(swarmLoads(keys())).toBe(0);
    w.players.get(P0)!.draftPicks.push('racial');
    r.sync(w);
    expect(swarmLoads(keys())).toBe(1);
    r.sync(w);
    r.sync(w);
    expect(swarmLoads(keys()), 'a later frame must not refetch').toBe(1);
  });

  it('it fetches the swarm’s OWN sheet, not the bat’s', () => {
    const r = new GoblinRenderer(stubApp(), stubParent());
    const spy = vi.fn();
    (r as unknown as { loadAtlas: (key: string, base: string) => void }).loadAtlas = spy;
    r.sync(world('vampires', ['hp', 'def', 'racial']));
    expect(spy.mock.calls.find((c) => c[0] === 't3BatSwarm')?.[1]).toBe(BAT_SWARM_ATLAS_BASE);
  });

  it('negative: a vampire seat that took the GENERAL at wave 11 never fetches it', () => {
    const { r, keys } = rendererWithCountedLoad();
    r.sync(world('vampires', ['racial', 'racial', 'atk']));
    expect(swarmLoads(keys())).toBe(0);
  });

  it('negative: another race holding "racial" at every level never fetches it', () => {
    const { r, keys } = rendererWithCountedLoad();
    r.sync(world('nagas', ['racial', 'racial', 'racial']));
    expect(swarmLoads(keys())).toBe(0);
  });
});
