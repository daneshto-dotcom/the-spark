/**
 * SPARK — S153 P5c: the goblin speed ladder is REAL, not merely declared (owner R82).
 *
 * ⛔ WHY THIS FILE EXISTS. S153 P1 "re-tiered the goblin speeds" by editing three `hopSpeedMul`
 * values and shipped a change that could not do anything at all: NOTHING READ THAT FIELD. The only
 * input to locomotion is `config.maxAccel` (creatureVerlet.computeSteeringAccel), and all six
 * goblins carried an identical flat `GOBLIN_MAX_ACCEL`. Every test passed. The owner found it by
 * playing: *"the speed of the goblin units has not yet been changed as i asked it to be."*
 *
 * The P1 A.0 even reported that per-type speeds ALREADY EXISTED — true of the DATA and false of the
 * BEHAVIOUR. Checking that a config table matches a spec is not checking that anything consumes it.
 *
 * So these tests deliberately assert against the FIELD THE ENGINE READS, and assert an ORDERING
 * rather than six magic numbers, so retuning stays cheap while a dead knob fails loudly.
 */

import { describe, expect, it } from 'vitest';
import { GOBLIN_MAX_ACCEL } from '../../constants.ts';
import { CREATURE_CONFIGS } from './voltkin-config.ts';
import type { CreatureType } from './creature.ts';

/** The owner ladder, R82: hound and bat fastest, then fighter and suicide, then archer, then defence. */
const TIERS: ReadonlyArray<readonly CreatureType[]> = [
  ['goblinHound', 'goblinBat'],
  ['goblinMelee', 'goblinSuicide'],
  ['goblinArcher'],
  ['goblinShield'],
];

/** What the ENGINE actually uses to move a creature. Not hopSpeedMul — that was the whole bug. */
const speedOf = (t: CreatureType): number => CREATURE_CONFIGS[t].maxAccel;

describe('S153 P5c — the owner speed ladder drives the engine, not just the config table', () => {
  it('is STRICTLY DESCENDING across the four tiers', () => {
    for (let i = 0; i < TIERS.length - 1; i++) {
      const faster = Math.min(...TIERS[i]!.map(speedOf));
      const slower = Math.max(...TIERS[i + 1]!.map(speedOf));
      expect(
        faster,
        `tier ${i} (${TIERS[i]!.join('/')}) must outrun tier ${i + 1} (${TIERS[i + 1]!.join('/')})`,
      ).toBeGreaterThan(slower);
    }
  });

  it('gives the two units the owner paired the SAME speed', () => {
    expect(speedOf('goblinHound')).toBe(speedOf('goblinBat'));
    expect(speedOf('goblinMelee')).toBe(speedOf('goblinSuicide'));
  });

  it('⭐ is not all one number — the exact failure that shipped in P1', () => {
    const all = (['goblinHound', 'goblinBat', 'goblinMelee', 'goblinSuicide', 'goblinArcher', 'goblinShield'] as const)
      .map(speedOf);
    // P1 left every goblin on a flat GOBLIN_MAX_ACCEL. One distinct value means the ladder is dead
    // again, whatever hopSpeedMul happens to say.
    expect(new Set(all).size).toBeGreaterThan(1);
    expect(all.every((v) => v === GOBLIN_MAX_ACCEL)).toBe(false);
  });

  it('⭐ every goblin maxAccel actually TRACKS its hopSpeedMul — no orphaned knob', () => {
    // The bug was a field with no consumer. This binds the two together, so editing hopSpeedMul
    // alone can never again look like a speed change while doing nothing.
    for (const t of ['goblinHound', 'goblinBat', 'goblinMelee', 'goblinSuicide', 'goblinArcher', 'goblinShield'] as const) {
      const cfg = CREATURE_CONFIGS[t];
      expect(cfg.maxAccel, `${t} maxAccel must derive from its hopSpeedMul`).toBe(
        Math.round(GOBLIN_MAX_ACCEL * cfg.hopSpeedMul),
      );
    }
  });

  it('leaves the pre-existing non-goblin locomotion alone (the replay-equivalence guard)', () => {
    // Voltkin is the byte-equivalence guard the whole creature system is pinned against; the chewer
    // and drone bake their own multiplier. None of them may move because of this change.
    expect(CREATURE_CONFIGS.voltkin.maxAccel).toBe(200);
    expect(CREATURE_CONFIGS.chewer.maxAccel).toBe(120);
    expect(CREATURE_CONFIGS.lightningDrone.maxAccel).toBe(240);
  });
});
