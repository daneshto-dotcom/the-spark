/**
 * ⛔ S191 C-4 — **`drawRaRitual` HAD NO FIGHT GATE.** A Pharaoh's ritual that straddles the FIGHT→BUILD
 * edge kept drawing its remaining columns — telegraphs growing, beams falling — through BUILD, while the
 * sim lands nothing there: `runPharaohRitual` runs only inside `hostTick`'s one `matchPhase === 'FIGHT'`
 * boss-skill gate (and returns unless `gameState === 'PLAYING'`). A telegraph is a PROMISE (R171-B); those
 * were promises the sim does not keep.
 *
 * REACH: the REAL host tick carries the ritual across the REAL phase edge (`phaseEndsAtTick`), and every
 * tick the REAL `drawBossAuras` draws the board. The sim's landings are observed at `landRaColumn` (a
 * pass-through spy — the one call `runPharaohRitual` damages through since S192; it was `applyRadialDamage`
 * at 300 before), counted only for `spare === null` — the boss's posture, never the perk's — so what is
 * asserted is the two sides AGREEING tick by tick, not either side alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `spy: true` keeps every real implementation and records calls. (A pass-through factory with
// `importOriginal` did NOT intercept here: an import cycle binds the sim's copy before it resolves.)
vi.mock('../state/racial/raColumn.ts', { spy: true });

import type { Graphics } from 'pixi.js';
import { PLAYER_COLORS, RA_COLUMN_TICKS, RA_RITUAL_TICKS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { damageCreature } from '../state/creatures/creatureLifecycle.ts';
import { isChannellingRa } from '../state/creatures/creature.ts';
import { landRaColumn } from '../state/racial/raColumn.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';
import { drawBossAuras } from './bossAuras.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A two-seat FIGHT with seat 0's Pharaoh entering his ritual on this tick. */
function ritualBoard(): { w: World; id: CreatureId; start: number; until: number } {
  const w = makeWorld(0);
  w.isHost = true;
  w.gameState = 'PLAYING';
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: T9_BOSS_TYPE.mummies, ownerPlayerId: P0,
    pos: { x: 900, y: 500 }, targetPos: { x: 900, y: 500 },
  });
  const boss = [...w.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.mummies)!;
  damageCreature(w, boss.id, 100_000); // lethal → the ritual (R171-A)
  const until = boss.raRitualUntilTick!;
  return { w, id: boss.id, start: until - RA_RITUAL_TICKS, until };
}

/** A Graphics that records what it was asked to draw. */
function recorder(): { g: Graphics; fills: () => number; haloStrokes: () => number; ops: () => number } {
  let fills = 0;
  let halo = 0;
  let ops = 0;
  const g = {
    circle() { ops++; return g; },
    moveTo() { ops++; return g; },
    lineTo() { ops++; return g; },
    ellipse() { ops++; return g; },
    // Every column draws a FILL (the growing shade before impact, the scorch after); the priest's halo
    // is the only Ra op that is a stroke alone — width 2, against the telegraph outline's 1.5.
    fill() { ops++; fills++; return g; },
    stroke(o: { width?: number }) { ops++; if (o.width === 2) halo++; return g; },
    texture() { ops++; return g; },
    setFillStyle() { return g; },
  } as unknown as Graphics;
  return { g, fills: () => fills, haloStrokes: () => halo, ops: () => ops };
}

interface Frame { tick: number; phase: 'BUILD' | 'FIGHT'; channelling: boolean; landed: number; columnDrawn: boolean; halo: boolean }

/** Run the real host tick from the ritual's start to past its deadline, drawing every tick. */
function run(w: World, id: CreatureId, until: number): Frame[] {
  const d = deps();
  const st = makeHostTickState(w);
  const spy = vi.mocked(landRaColumn);
  const frames: Frame[] = [];
  while (w.tick < until + 20) {
    const before = spy.mock.calls.length;
    runHostTick(w, d, st);
    const landed = spy.mock.calls.slice(before)
      .filter((c) => c[1].severCause === 'unit').length; // the boss's column (S195 B-25: it spares his side now — `severCause: 'unit'` is his alone)
    const g = recorder();
    const strike = recorder();
    drawBossAuras(g.g, w, strike.g);
    const boss = w.creatures.get(id);
    frames.push({
      tick: w.tick,
      phase: w.matchPhase,
      channelling: boss !== undefined && isChannellingRa(boss, w.tick),
      landed,
      columnDrawn: g.fills() > 0 || strike.ops() > 0,
      halo: g.haloStrokes() > 0,
    });
  }
  return frames;
}

beforeEach(() => { vi.mocked(landRaColumn).mockClear(); });

describe('S191 C-4 — a Pharaoh ritual that straddles FIGHT→BUILD draws no column after the edge', () => {
  it('⛔ REACH: the real edge falls between columns 1 and 2 — the sim lands two, and nothing is drawn in BUILD', () => {
    const { w, id, start, until } = ritualBoard();
    // The edge between column 1's impact (start + 240) and column 2's (start + 360).
    w.phaseEndsAtTick = start + 2 * RA_COLUMN_TICKS + RA_COLUMN_TICKS / 2;
    const frames = run(w, id, until);

    const build = frames.filter((f) => f.phase === 'BUILD');
    expect(build.length, 'anti-vacuity: the real phase machine crossed the edge').toBeGreaterThan(0);
    expect(build.some((f) => f.channelling), 'anti-vacuity: he is still channelling after the edge').toBe(true);

    // The sim: exactly columns 0 and 1, both in FIGHT, on their own impact ticks.
    const landings = frames.filter((f) => f.landed > 0);
    expect(landings.map((f) => [f.tick - start, f.phase])).toEqual([
      [RA_COLUMN_TICKS, 'FIGHT'],
      [2 * RA_COLUMN_TICKS, 'FIGHT'],
    ]);
    // The renderer: every landing tick drew its column…
    for (const f of landings) expect(f.columnDrawn, `drawn on its landing tick +${f.tick - start}`).toBe(true);
    // …and pre-fix columns 2..4's telegraphs and beams were drawn through BUILD.
    for (const f of build) expect(f.columnDrawn, `BUILD tick +${f.tick - start}`).toBe(false);
  });

  it('⚠ the priest\'s halo still shows while he channels in BUILD (the sim still has him channelling)', () => {
    // ⚠ MINE: only the COLUMNS are gated. `isChannellingRa` is the sim's truth in BUILD too (the damage
    // guard reads it), so the halo that says "he is channelling" is not a promise the sim breaks.
    const { w, id, start, until } = ritualBoard();
    w.phaseEndsAtTick = start + 2 * RA_COLUMN_TICKS + RA_COLUMN_TICKS / 2;
    const frames = run(w, id, until);
    const buildChannelling = frames.filter((f) => f.phase === 'BUILD' && f.channelling);
    expect(buildChannelling.length).toBeGreaterThan(0);
    for (const f of buildChannelling) expect(f.halo, `halo at +${f.tick - start}`).toBe(true);
  });

  it('negative — a ritual wholly inside FIGHT lands all five and draws every one of them, unchanged', () => {
    const { w, id, start, until } = ritualBoard();
    const frames = run(w, id, until);
    expect(frames.every((f) => f.phase === 'FIGHT')).toBe(true);
    const landings = frames.filter((f) => f.landed > 0);
    expect(landings.map((f) => f.tick - start)).toEqual([1, 2, 3, 4, 5].map((n) => n * RA_COLUMN_TICKS));
    for (const f of landings) expect(f.columnDrawn).toBe(true);
    // Every channelling tick draws a column (a telegraph is always open until the finale).
    for (const f of frames.filter((x) => x.channelling)) expect(f.columnDrawn, `+${f.tick - start}`).toBe(true);
  });

  it('the render model alone: the same ritual tick draws columns in FIGHT, none in BUILD, none outside PLAYING', () => {
    const { w, start } = ritualBoard();
    w.tick = start + RA_COLUMN_TICKS + RA_COLUMN_TICKS / 2; // column 1 half grown, column 0's beam faded
    const draw = (): { col: boolean; halo: boolean } => {
      const g = recorder();
      const s = recorder();
      drawBossAuras(g.g, w, s.g);
      return { col: g.fills() > 0 || s.ops() > 0, halo: g.haloStrokes() > 0 };
    };
    expect(draw()).toEqual({ col: true, halo: true });
    w.matchPhase = 'BUILD';
    expect(draw()).toEqual({ col: false, halo: true });
    w.matchPhase = 'FIGHT';
    w.gameState = 'WIN';
    expect(draw().col).toBe(false);
  });
});
