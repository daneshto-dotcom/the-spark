/**
 * SPARK — S191 1a — **THE EMBER TINT FOLLOWS THE BURN: FIGHT ONLY.**
 *
 * > *"it kind of turns your whole … side of the screen into red, which sucks because they want to see
 * > the original art … switched on only during fight."* — owner, S191
 *
 * SCORCHED GROUND burns only in FIGHT (`runRacialPerksFight` sits inside `hostTick`'s FIGHT gate), but
 * until S191 its ember tint was drawn from the picks alone, so a demon seat's whole side stayed red
 * through every BUILD — the phase the owner wants to look at the original art in.
 *
 * ⭐ REACH: the real host tick carries the board across BOTH edges, and the REAL renderer's `sync`
 * paints the sprite whose `tint` is read back — not the pure helper alone.
 */
import { describe, expect, it } from 'vitest';
import { Container, Texture, type Application } from 'pixi.js';

import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import type { Controls } from '../input/controls.ts';
import { asPlayerId } from '../types.ts';
import { SCORCHED_ZONE_TINT, ZoneBackgroundRenderer, zoneBackdropTintNow } from './zoneBackgroundRenderer.ts';

const P0 = asPlayerId(0);
const UNTINTED = 0xffffff;

function demonBoard(phase: 'BUILD' | 'FIGHT'): World {
  const w = makeWorld(0x191a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.draft = null;
  w.creatures.clear();
  const pl = w.players.get(P0)!;
  pl.raceId = 'demons';
  pl.draftPicks = ['racial'];
  w.tick = 1000; // past the renderer's opening hold
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + 4; // the edge is four ticks away
  return w;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function tickRunner(w: World): () => void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  return () => runHostTick(w, d, st);
}

/** The real renderer, with its texture loader short-circuited (no network / GPU under vitest). */
function renderer(): { r: ZoneBackgroundRenderer; tintOf: (zone: number) => number | undefined } {
  const app = { stage: new Container() } as unknown as Application;
  const r = new ZoneBackgroundRenderer(app, new Container());
  const inner = r as unknown as {
    ensureTexture(url: string): void;
    textures: Map<string, Texture>;
    sprites: Map<number, { tint: number }>;
  };
  inner.ensureTexture = (url: string) => { inner.textures.set(url, Texture.WHITE); };
  return { r, tintOf: (zone) => inner.sprites.get(zone)?.tint };
}

describe('S191 1a — the ember tint is FIGHT-only, through the real host tick and the real renderer', () => {
  it('⭐ BUILD → FIGHT: the original art in BUILD, ember from the first FIGHT frame', () => {
    const w = demonBoard('BUILD');
    const step = tickRunner(w);
    const { r, tintOf } = renderer();
    r.sync(w);
    r.sync(w); // the first sync starts the (stubbed) load; the second paints
    expect(w.matchPhase).toBe('BUILD');
    expect(tintOf(0), 'BUILD shows the original backdrop').toBe(UNTINTED);
    for (let i = 0; i < 8 && w.matchPhase === 'BUILD'; i++) {
      step();
      r.sync(w);
      if (w.matchPhase === 'BUILD') expect(tintOf(0)).toBe(UNTINTED);
    }
    expect(w.matchPhase, 'fixture: the edge was crossed by the real clock').toBe('FIGHT');
    expect(tintOf(0), 'FIGHT: the burning land looks burning').toBe(SCORCHED_ZONE_TINT);
    expect(tintOf(1), 'the other seat’s land is never tinted').toBe(UNTINTED);
  });

  it('⭐ FIGHT → BUILD: ember while it burns, the original art from the first BUILD frame', () => {
    const w = demonBoard('FIGHT');
    const step = tickRunner(w);
    const { r, tintOf } = renderer();
    r.sync(w);
    r.sync(w);
    expect(tintOf(0)).toBe(SCORCHED_ZONE_TINT);
    for (let i = 0; i < 8 && w.matchPhase === 'FIGHT'; i++) {
      step();
      r.sync(w);
      if (w.matchPhase === 'FIGHT') expect(tintOf(0)).toBe(SCORCHED_ZONE_TINT);
    }
    expect(w.matchPhase, 'fixture: the edge was crossed by the real clock').toBe('BUILD');
    expect(tintOf(0), 'BUILD: the burn has stopped, and so has the red').toBe(UNTINTED);
    // …and it comes back at the next whistle, on the real clock.
    w.phaseEndsAtTick = w.tick + 2;
    for (let i = 0; i < 4; i++) { step(); r.sync(w); }
    expect(w.matchPhase).toBe('FIGHT');
    expect(tintOf(0)).toBe(SCORCHED_ZONE_TINT);
  });

  it('the pure predicate: FIGHT and PLAYING and standing and held — each conjunct is load-bearing', () => {
    const held = { raceId: 'demons' as const, draftPicks: ['racial' as const], castleHp: 2500 };
    const fight = { matchPhase: 'FIGHT' as const, gameState: 'PLAYING' as const };
    expect(zoneBackdropTintNow(held, fight)).toBe(SCORCHED_ZONE_TINT);
    expect(zoneBackdropTintNow(held, { ...fight, matchPhase: 'BUILD' }), 'BUILD').toBe(UNTINTED);
    // The burn is gated on a PLAYING match (`runRacialPerksFight`); a decided match burns nothing.
    expect(zoneBackdropTintNow(held, { ...fight, gameState: 'WIN' }), 'decided').toBe(UNTINTED);
    expect(zoneBackdropTintNow({ ...held, castleHp: 0 }, fight), 'F4 — a fallen seat').toBe(UNTINTED);
    expect(zoneBackdropTintNow({ ...held, draftPicks: ['hp'] }, fight), 'not held').toBe(UNTINTED);
  });

  it('⛔ the burn itself is FIGHT-only today (checked, not changed): BUILD edge length is real', () => {
    // Anti-vacuity for the two REACH tests: the fixture edges are the real phase lengths' edges.
    expect(phaseDurationTicks('BUILD')).toBeGreaterThan(8);
    expect(phaseDurationTicks('FIGHT')).toBeGreaterThan(8);
  });
});
