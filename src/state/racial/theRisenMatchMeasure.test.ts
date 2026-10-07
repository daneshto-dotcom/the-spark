/**
 * SPARK — S196 (owner playtest P1 item 5) — WHO ACTUALLY LANDS THE KILLING BLOW IN A REAL MATCH?
 *
 * An INSTRUMENT, not a gate (`SPARK_RISEN_MEASURE=1` to run). A four-seat bots match through the real
 * host tick, seat 1 = ZOMBIES (a bot, so it takes THE RISEN by the draft deadline), every enemy creature
 * death classified by the `KillCredit` THE RISEN receives. Answers "why did his zombies' kills raise
 * nothing" with a measured share instead of a guess.
 */
import { describe, expect, it, vi } from 'vitest';
import { BotManager } from '../../bots/botManager.ts';
import { FIGHT_PHASE_TICKS, PHASE_DURATION_TICKS, PLAYER_COLORS } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId } from '../../types.ts';
import type { Creature } from '../creatures/creature.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { sameTeam } from '../teams.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import type { KillCredit } from './killCredit.ts';

const seen: Array<{ w: World; victim: Creature; credit: KillCredit }> = [];
vi.mock('./theRisen.ts', async (orig) => {
  const m = await orig<typeof import('./theRisen.ts')>();
  return {
    ...m,
    riseOnKill: (w: World, victim: Creature, credit: KillCredit) => {
      seen.push({ w, victim: { ...victim }, credit });
      m.riseOnKill(w, victim, credit);
    },
  };
});
const { isZombieRacialType } = await import('./theRisen.ts');

const MEASURE = process.env.SPARK_RISEN_MEASURE === '1';
const Z = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

describe.skipIf(!MEASURE)('S196 MEASURE — THE RISEN in a real bots match', () => {
  it('classifies every enemy creature death by the credit THE RISEN sees', () => {
    const w = makeWorld(0x196);
    w.gameState = 'TITLE';
    const races = ['orcs', 'zombies', 'vampires', 'nagas'] as const;
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]!, raceId: races[s] })),
      botSeats: [1, 2, 3],
    });
    const m = new BotManager(['HARD', 'HARD', 'HARD'], 0xbeef);
    const d = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32); })()),
      controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps;
    const st = makeHostTickState(w);
    const WAVES = Number(process.env.SPARK_RISEN_WAVES ?? 8);
    const end = WAVES * (PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS);
    while (w.tick < end && (w.gameState as string) === 'PLAYING') { m.tick(w); runHostTick(w, d, st); w.effects.length = 0; }
    const z = w.players.get(Z)!;
    const cats = new Map<string, number>();
    const bump = (k: string): void => void cats.set(k, (cats.get(k) ?? 0) + 1);
    for (const { victim, credit } of seen) {
      if (sameTeam(w, Z, victim.ownerPlayerId)) continue; // not an enemy of the zombie seat
      if (credit === null) bump('no credit (potato/area/unnamed)');
      else if (credit.seat !== Z) bump('another seat');
      else if (credit.type === null) bump('ZOMBIE SEAT, typeless (castle gun / tower / hub / raid)');
      else if (isZombieRacialType(credit.type)) bump(`ZOMBIE SEAT RACIAL ${credit.type} -> RISES`);
      else bump(`ZOMBIE SEAT non-racial ${credit.type} (Reading A: no rise)`);
    }
    console.log(`RISEN-MEASURE waves=${WAVES} tick=${w.tick} wave=${w.waveNumber} zombiePicks=${JSON.stringify(z.draftPicks)} holds=${seatHoldsPerk(z, 'zombies.l0')}`);
    for (const [k, v] of [...cats.entries()].sort((a, b) => b[1] - a[1])) console.log(`RISEN-MEASURE ${String(v).padStart(5)}  ${k}`);
    expect(seen.length).toBeGreaterThan(0);
  });
});
