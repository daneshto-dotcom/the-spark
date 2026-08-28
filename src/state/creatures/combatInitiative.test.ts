/**
 * SPARK — S156 P4: **A COLLISION IS DECIDED BY A ROLL, NOT BY WHO GOT THERE FIRST.**
 *
 * ## The ruling
 *
 * S155 N1 removed a spawn-order advantage by making every same-tick strike land, so a mutual
 * engagement destroyed both units. I then asked the owner whether to also close the remaining gap —
 * a unit that engages a few ticks earlier still lands a free first strike — and recommended leaving
 * it as "legitimate tactics". They rejected the PREMISE:
 *
 * > *"if you truly arrive first but what does arriving first even mean? deeper in enemy territory?
 * > they all have if two units have similar speed then who arrives 'first'? stupid way to think
 * > about it. random generator when two units collide is the smarter for now but actually the real
 * > fix is to give all units attack speed which we will do later - the only real solution!"*
 *
 * That is a better argument than mine. With near-identical speeds "arrived first" is a positional
 * accident, and N1 had just proved this engine amplifies such accidents into total wins. So: an
 * explicit fair roll now, per-unit attack speed later.
 *
 * ## What these tests are really guarding
 *
 * My objection to a roll was that it could re-create N1 — "one side takes zero damage", merely
 * randomised. The objection is only answered if the roll cannot be BIASED by anything durable, so
 * the tests below attack exactly that:
 *
 *   • it must not be decided by creature id (the low id must not simply always win),
 *   • it must not be decided by insertion/iteration order (N1's actual variable),
 *   • it must be re-cast every tick, so no pair can be locked into one outcome,
 *   • and both sides of a duel must reach the SAME verdict, or both/neither would strike.
 */

import { describe, expect, it } from 'vitest';
import { asCreatureId } from './creature.ts';
import { winsInitiative } from './creatureAttack.ts';

const A = asCreatureId(1);
const B = asCreatureId(2);

describe('S156 P4 — winsInitiative', () => {
  it('exactly ONE side of a duel wins, whichever way the pair is presented', () => {
    for (let tick = 0; tick < 200; tick++) {
      const aWins = winsInitiative(A, B, tick);
      const bWins = winsInitiative(B, A, tick);
      expect(aWins, `tick ${tick}: both or neither won`).not.toBe(bWins);
    }
  });

  it('⛔ is ORDER-INDEPENDENT — the same pair hashes the same however it is keyed', () => {
    // This is the N1 guarantee restated: which creature the loop reaches first cannot matter,
    // because the roll is keyed on min/max of the pair rather than on (attacker, victim).
    for (let tick = 0; tick < 200; tick++) {
      expect(winsInitiative(A, B, tick)).toBe(!winsInitiative(B, A, tick));
    }
  });

  it('⛔ is NOT decided by creature id — the low id does not always win', () => {
    let lowWins = 0;
    for (let tick = 0; tick < 1000; tick++) if (winsInitiative(A, B, tick)) lowWins += 1;
    // A fair coin over 1000 casts. A wide band, because this asserts "not rigged", not "exactly 50%".
    expect(lowWins).toBeGreaterThan(350);
    expect(lowWins).toBeLessThan(650);
  });

  it('⛔ is RE-CAST EVERY TICK — no pair is locked into one outcome', () => {
    const seen = new Set<boolean>();
    for (let tick = 0; tick < 50; tick++) seen.add(winsInitiative(A, B, tick));
    expect(seen.size, 'the same pair won every single tick — that is N1 again').toBe(2);
  });

  it('⛔ NO SEAT OR SPAWN COHORT CAN HOLD AN ADVANTAGE across many distinct pairs', () => {
    // The N1 failure was systematic: one side won every exchange all match. Sweep many pairs at many
    // ticks and confirm the earlier-spawned id (the lower one, since ids are minted in spawn order)
    // wins roughly half — i.e. spawning first buys nothing.
    let earlierWins = 0;
    let total = 0;
    for (let id = 1; id <= 60; id++) {
      for (let tick = 0; tick < 60; tick++) {
        const lo = asCreatureId(id);
        const hi = asCreatureId(id + 1000); // a much later spawn
        if (winsInitiative(lo, hi, tick)) earlierWins += 1;
        total += 1;
      }
    }
    const share = earlierWins / total;
    expect(share, `spawning earlier won ${(share * 100).toFixed(1)}% of exchanges`).toBeGreaterThan(0.4);
    expect(share, `spawning earlier won ${(share * 100).toFixed(1)}% of exchanges`).toBeLessThan(0.6);
  });

  it('is a pure function — same inputs, same answer, no hidden state', () => {
    const first = winsInitiative(A, B, 12345);
    for (let i = 0; i < 10; i++) expect(winsInitiative(A, B, 12345)).toBe(first);
  });

  it('a creature never arbitrates against itself', () => {
    expect(winsInitiative(A, A, 7)).toBe(true);
  });
});
