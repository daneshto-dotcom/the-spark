/**
 * SPARK — S191 (owner item 1b) — **A BOT DEMON CASTS SCORCHED EARTH**, through `runHostTick` with a real
 * `BotManager` — the path a bots match actually takes — on the zone of the highest-scoring enemy
 * (⚠ MINE, the brief's default), once per FIGHT, and identically on every run.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { hashWorldStateFull } from '../state/stateHashFull.ts';
import type { Controls } from '../input/controls.ts';
import type { DraftPick } from '../state/draft.ts';
import { BotManager } from './botManager.ts';
import { BOT_SCORCH_EVAL_EVERY_TICKS, botScorchTarget, botScorchedEarthAction } from './botScorchedEarth.ts';

const HUMAN = asPlayerId(0); // orcs
const BOT = asPlayerId(1); // demons
const THIRD = asPlayerId(2); // zombies, a second human

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function match(picks: DraftPick[], scores: [number, number, number] = [100, 0, 500]): { w: World; d: HostTickDeps } {
  const w = makeWorld(0xb191);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'orcs' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'demons' },
      { seat: 2, color: PLAYER_COLORS[2]!, raceId: 'zombies' },
    ],
    botSeats: [1],
  });
  w.draft = null;
  w.players.get(BOT)!.draftPicks.splice(0, Infinity, ...picks);
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  scores.forEach((s, seat) => w.scoreByPlayer.set(asPlayerId(seat), s));
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: new BotManager(['HARD'], 0x5eed), gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  return { w, d };
}

function run(w: World, d: HostTickDeps, ticks: number): void {
  const s = makeHostTickState(w);
  for (let i = 0; i < ticks; i++) runHostTick(w, d, s);
}

const cast = (w: World) => w.players.get(BOT)!.scorchedEarth;

describe('S191 — a bot demon casts SCORCHED EARTH in a real bots match', () => {
  it('⭐⭐ it scorches the zone of the HIGHEST-scoring enemy, at its first look in the FIGHT', () => {
    const { w, d } = match(['racial']);
    run(w, d, BOT_SCORCH_EVAL_EVERY_TICKS + 1);
    expect(cast(w), 'the bot cast').toEqual({ wave: w.waveNumber, zoneSeat: THIRD });
  });

  it('⭐ a tie goes to the LOWER seat', () => {
    const { w, d } = match(['racial'], [300, 0, 300]);
    run(w, d, BOT_SCORCH_EVAL_EVERY_TICKS + 1);
    expect(cast(w)?.zoneSeat).toBe(HUMAN);
  });

  it('⛔ a FALLEN enemy is never the target, however it scored', () => {
    const { w, d } = match(['racial'], [100, 0, 900]);
    w.players.get(THIRD)!.castleHp = 0;
    expect(botScorchTarget(w, BOT)).toBe(HUMAN);
    run(w, d, BOT_SCORCH_EVAL_EVERY_TICKS + 1);
    expect(cast(w)?.zoneSeat).toBe(HUMAN);
  });

  it('⛔ a bot WITHOUT the perk never casts; nor in BUILD', () => {
    const a = match(['hp']);
    run(a.w, a.d, BOT_SCORCH_EVAL_EVERY_TICKS * 3);
    expect(cast(a.w)).toBeNull();

    const b = match(['racial']);
    b.w.matchPhase = 'BUILD';
    for (let t = 0; t < BOT_SCORCH_EVAL_EVERY_TICKS; t++) {
      b.w.tick++;
      expect(botScorchedEarthAction(b.w, BOT)).toBeNull();
    }
  });

  it('⭐ once per FIGHT: no second cast this fight, a fresh one in the next', () => {
    const { w, d } = match(['racial']);
    run(w, d, BOT_SCORCH_EVAL_EVERY_TICKS * 3);
    const first = cast(w);
    expect(first).not.toBeNull();
    // Across the real clock: FIGHT → BUILD (cleared) → FIGHT (cast again, for the new wave).
    w.phaseEndsAtTick = w.tick + 2;
    run(w, d, 3);
    expect(w.matchPhase).toBe('BUILD');
    expect(cast(w), 'cleared at the BUILD edge').toBeNull();
    w.phaseEndsAtTick = w.tick + 2;
    run(w, d, 3 + BOT_SCORCH_EVAL_EVERY_TICKS);
    expect(w.matchPhase).toBe('FIGHT');
    expect(cast(w)).toEqual({ wave: first!.wave + 1, zoneSeat: THIRD });
  });

  it('⛔ DETERMINISM — two identical matches make the identical cast and the identical world', () => {
    const once = (): { cast: string; hash: number } => {
      const { w, d } = match(['racial']);
      run(w, d, BOT_SCORCH_EVAL_EVERY_TICKS * 3);
      return { cast: JSON.stringify(cast(w)), hash: hashWorldStateFull(w) };
    };
    const a = once();
    expect(a.cast).not.toBe('null');
    expect(once()).toEqual(a);
  });

  it('the pure seam: phase-spread by seat (only seat mod cadence ticks look)', () => {
    const { w } = match(['racial']);
    let looks = 0;
    for (let t = 0; t < BOT_SCORCH_EVAL_EVERY_TICKS; t++) {
      w.tick++;
      if (botScorchedEarthAction(w, BOT as PlayerId) !== null) looks++;
    }
    expect(looks).toBe(1);
  });
});
