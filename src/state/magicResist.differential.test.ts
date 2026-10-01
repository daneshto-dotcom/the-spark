/**
 * SPARK — S192 (owner R192-M1) — ⛔ THE MRES = DEF IDENTITY ORACLE, OVER A LONG BOTS MATCH.
 *
 * *"it will look the same, but it'll be calculated differently."* The magic substrate threads a class
 * through every damage call and rescales magic hits by `(5+DEF)/(5+MRES)`. The claim the spec rests on:
 * **with every MRES equal to DEF, nothing in the game changes** — so every difference the shipped table
 * makes is the table's, never the plumbing's.
 *
 * Three identical four-seat bots matches (`c5WaveFiveBoard.fixtures.ts`) run in lockstep from tick 0
 * through two whole waves, the board topped up in each FIGHT with the units the magic sources hit
 * (Voltkins to zap, castle soldiers of four races, bosses, souleaters):
 *   · twin A — `isMagicClass` forced false: EVERY hit is physical. This is master's arithmetic exactly.
 *   · twin B — the real magic path, with `mresFor` forced to the type's own DEF (the identity table).
 *   · twin C — the real magic path with the SHIPPED table (⚠ MINE), the anti-vacuity twin.
 * A and B are compared with `hashWorldStateFull` EVERY tick and must never differ; B must have pushed
 * real magic hits through the rescale (so it was not identical by never running); C must diverge from A
 * (so the table genuinely reaches the board and this oracle could see a difference if one existed).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CreatureType } from './creatures/creature.ts';
import type { DamageClass } from './magicResist.ts';
import type { RaceId } from './races.ts';

type Mode = 'physical' | 'equal' | 'shipped';
const H = vi.hoisted(() => ({ mode: 'shipped' as 'physical' | 'equal' | 'shipped', magicCalls: 0, dotCalls: 0, rescaled: 0 }));

vi.mock('./magicResist.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./magicResist.ts')>();
  const { getCreatureConfig } = await import('./creatures/voltkin-config.ts');
  return {
    ...real,
    isMagicClass: (cls: DamageClass): boolean => (H.mode === 'physical' ? false : real.isMagicClass(cls)),
    mresFor: (type: CreatureType, race: RaceId | null): number =>
      (H.mode === 'equal' ? getCreatureConfig(type).def : real.mresFor(type, race)),
    landedFifths: (amount: number, cls: DamageClass, def: number, mres: number, phase: number): number => {
      const out = real.landedFifths(amount, cls, def, mres, phase);
      if (H.mode === 'equal') {
        if (cls === 'magic') H.magicCalls++;
        else if (typeof cls === 'object') H.dotCalls++;
      }
      if (H.mode === 'shipped' && out !== amount) H.rescaled++;
      return out;
    },
  };
});

import { runHostTick } from './hostTick.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { startC5Match, topUpCreatures, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';

const WAVES = 2;
const CREATURES = 28;
// ⭐ S193 — the zombie boss LEADS the mix: `topUpCreatures` picks type `floor(i / 4) % length`, so a type
// late in the list only spawns when 20+ slots are empty at once. After the master merge the board never
// emptied that far and B ran ZERO DoT beats (the anti-vacuity assertion below caught it); first in the
// list, every top-up that refills a slot can bring his ROT aura (a magic DoT) back onto the board.
const MIX: readonly CreatureType[] = ['t9BossZombies', 'voltkin', 'raceUnit', 't9BossDemons', 't3Souleater', 'voltkin', 'goblinMelee'];

describe('S192 MRES — ⛔ MRES = DEF is byte-identical to the all-physical game over a bots match', () => {
  it('A (physical) and B (magic, MRES = DEF) agree on hashWorldStateFull every tick; C (shipped table) does not', async () => {
    const A = startC5Match(false);
    const B = startC5Match(false);
    const C = startC5Match(false);
    expect(hashWorldStateFull(B.world)).toBe(hashWorldStateFull(A.world));
    const end = WAVES * WAVE_TICKS;
    let compared = 0;
    let cDivergedAt = -1;
    let fights = 0;
    const step = (m: typeof A, mode: Mode): void => {
      H.mode = mode;
      m.bots.tick(m.world);
      runHostTick(m.world, m.deps, m.state);
      m.world.effects.length = 0;
    };
    while (A.world.tick < end && (A.world.gameState as string) === 'PLAYING') {
      if (A.world.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
      if (A.world.matchPhase === 'FIGHT' && A.world.tick % 60 === 0) {
        fights++;
        topUpCreatures(A.world, CREATURES, MIX);
        topUpCreatures(B.world, CREATURES, MIX);
        if (cDivergedAt < 0) topUpCreatures(C.world, CREATURES, MIX);
      }
      step(A, 'physical');
      step(B, 'equal');
      const ha = hashWorldStateFull(A.world);
      const hb = hashWorldStateFull(B.world);
      if (ha !== hb) throw new Error(`MRES = DEF DIVERGED from the all-physical game at tick ${A.world.tick}`);
      compared++;
      if (cDivergedAt < 0) {
        step(C, 'shipped');
        if (hashWorldStateFull(C.world) !== ha) cDivergedAt = A.world.tick;
      }
    }
    H.mode = 'shipped';
    console.log(`[S192 MRES differential] ${compared} ticks compared · B magic hits ${H.magicCalls} · B DoT ticks ${H.dotCalls} · C diverged at tick ${cDivergedAt} after ${H.rescaled} rescaled hits`);
    // ⭐ S193 — two whole waves, OR the whole match when it ends sooner: after the master merge the bots
    // can WIN inside wave 2 (a match that is over has no more ticks to compare). Never less than one wave.
    const ended = (A.world.gameState as string) !== 'PLAYING';
    expect(compared, 'at least one whole wave').toBeGreaterThanOrEqual(WAVE_TICKS);
    if (!ended) expect(compared, 'the run covered two whole waves').toBeGreaterThanOrEqual(end - 1);
    expect(fights, 'both FIGHTs ran').toBeGreaterThan(0);
    // ⛔ ANTI-VACUITY — B ran the magic arithmetic for real, many times, single hits AND DoT beats.
    expect(H.magicCalls, 'magic single hits went through the rescale in B').toBeGreaterThan(20);
    expect(H.dotCalls, 'magic DoT ticks went through the rescale in B').toBeGreaterThan(0);
    // …and the shipped table genuinely changes the board, so this oracle can see a difference.
    expect(cDivergedAt, 'the shipped MRES table reached the board').toBeGreaterThan(0);
    expect(H.rescaled).toBeGreaterThan(0);
  }, 300_000);
});
