/**
 * SPARK — S186: THE DYNAMIC WIN SCORE ("nikud dinami").
 *
 * Owner, S186: *"It takes 2,500 points to win in the first five waves. After the fifth wave and
 * until the 10th fight wave, it's 5,000. After that, if nobody won with 5,000 points, or by
 * destroying each other's castle until then, then it climbs to 10,000 until level 15 from level 10.
 * Then, if nobody won till then, it climbs to 20,000 from level 15 to level 20. If nobody won then,
 * from level 20 to level 25, it takes 50,000."*
 *
 * And he closed the boundary question in the same breath, which is why there is no ambiguity to
 * interpret here: *"If someone is at level four, then it's up to 2,500 points. Still. Level five.
 * Still 2,500 points. If nobody won then, then level six, it's already 5,000 points."*
 *
 * ⭐ WHY HE ASKED FOR IT: *"in the beginning you really need to build as many gatherers and speed to
 * get as many shapes. But then you can't cheat by building a lot of them and then just letting the
 * points run at level five and then everyone can win at level five."*
 *
 * ⛔ THE ANTI-COAST PROPERTY IS THE FEATURE, NOT A ROUGH EDGE. A seat holding 3,000 at wave 5 has
 * won; the same seat that reaches wave 6 without winning now owes 5,000. The host-tick test at the
 * bottom of this file pins exactly that, so a future session cannot "fix" the bar into never
 * overtaking a banked score without turning this file red.
 */

import { describe, expect, it } from 'vitest';
import {
  HUNTER_TRIGGER_SCORE,
  PHASE_1_WIN_SCORE,
  PLAYER_COLORS,
  WIN_SCORE_BANDS,
  hunterTriggerScoreForWave,
  winScoreForWave,
  winScoreMultiplierForWave,
} from '../constants.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { restore, snapshot } from './save.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';

function board(): World {
  const world = makeWorld(0x186);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  });
  world.gameState = 'PLAYING';
  return world;
}

describe('S186 — the owner\'s table, wave by wave', () => {
  it('⭐ produces exactly the five bands he dictated', () => {
    // The literals below are the ONLY place his spoken numbers appear as numbers. Everything else in
    // the codebase derives from `WIN_SCORE_BANDS`, so this is the single assertion that says "the
    // shipped ladder is the one he asked for" rather than "the ladder is self-consistent".
    expect(winScoreForWave(1)).toBe(2500);
    expect(winScoreForWave(6)).toBe(5000);
    expect(winScoreForWave(11)).toBe(10000);
    expect(winScoreForWave(16)).toBe(20000);
    expect(winScoreForWave(21)).toBe(50000);
  });

  it('⭐⭐ the band boundaries land where HE put them — 4 and 5 are still 2,500, 6 is already 5,000', () => {
    // He pre-empted this himself, verbatim: "If someone is at level four, then it's up to 2,500
    // points. Still. Level five. Still 2,500 points. If nobody won then, then level six, it's
    // already 5,000 points." Each band is INCLUSIVE of its top wave. This is his assertion, not
    // mine — an off-by-one here is a spec violation, not a taste call.
    expect(winScoreForWave(4)).toBe(2500);
    expect(winScoreForWave(5)).toBe(2500);
    expect(winScoreForWave(6)).toBe(5000);
  });

  it('every other band boundary is inclusive the same way', () => {
    expect(winScoreForWave(10)).toBe(5000);
    expect(winScoreForWave(11)).toBe(10000);
    expect(winScoreForWave(15)).toBe(10000);
    expect(winScoreForWave(16)).toBe(20000);
    expect(winScoreForWave(20)).toBe(20000);
    expect(winScoreForWave(21)).toBe(50000);
    expect(winScoreForWave(25)).toBe(50000);
  });

  it('the bar never goes DOWN as the match goes long', () => {
    // The whole spec is an anti-coast mechanic. A bar that ever dipped would hand the win to
    // whoever waited longest — the exact behaviour it exists to kill.
    for (let w = 1; w < 40; w++) {
      expect(winScoreForWave(w + 1), `wave ${w + 1} must not be easier than wave ${w}`)
        .toBeGreaterThanOrEqual(winScoreForWave(w));
    }
  });
});

describe('S186 — past wave 25 is MINE, and it clamps', () => {
  it('⚠ clamps at the top band rather than climbing or falling back', () => {
    // He did not speak past wave 25. Clamping keeps points winnable-but-only-just; climbing would
    // quietly convert a long match into a castle-only match, and falling back would make the bar
    // DROP. Flagged at the constant as my call so he can overrule it in one line.
    expect(winScoreForWave(26)).toBe(50000);
    expect(winScoreForWave(40)).toBe(50000);
    expect(winScoreForWave(9999)).toBe(50000);
  });
});

describe('S186 — the function is TOTAL, because the win gate calls it every tick', () => {
  it('never returns undefined or NaN for any input, including nonsense ones', () => {
    // `waveNumber` is 1-based from makeWorld and only ever incremented, so these arms are
    // unreachable in production. They exist so the win gate can call this unguarded on every tick.
    for (const w of [0, -1, -9999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const v = winScoreForWave(w);
      expect(Number.isFinite(v), `winScoreForWave(${String(w)}) must be a finite number`).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    // Below wave 1 reads as the opening band, not as the clamp.
    expect(winScoreForWave(0)).toBe(PHASE_1_WIN_SCORE);
    expect(winScoreForWave(Number.NaN)).toBe(PHASE_1_WIN_SCORE);
  });
});

describe('S186 — bands are MULTIPLIERS, which is what keeps the E2E seam alive', () => {
  it('⭐ every band is a multiple of PHASE_1_WIN_SCORE, never an absolute literal', () => {
    // `readTestWinScore()` forces the bar low so a Playwright match finishes in seconds. Absolute
    // literals would defeat that seam from wave 6 on — it would set 50 and the sim would still
    // demand 5,000. As multipliers the whole ladder scales with the seam.
    for (const band of WIN_SCORE_BANDS) {
      expect(winScoreForWave(band.lastWave)).toBe(PHASE_1_WIN_SCORE * band.multiplier);
    }
    expect(WIN_SCORE_BANDS.map((b) => b.multiplier)).toEqual([1, 2, 4, 8, 20]);
    expect(WIN_SCORE_BANDS.map((b) => b.lastWave)).toEqual([5, 10, 15, 20, 25]);
  });

  it('wave 1 is still exactly PHASE_1_WIN_SCORE, so nothing that reads the old constant drifted', () => {
    expect(winScoreForWave(1)).toBe(PHASE_1_WIN_SCORE);
    expect(winScoreMultiplierForWave(1)).toBe(1);
  });
});

describe('S186 — the hunter trigger follows the bar', () => {
  it('⚠ stays 75% of whatever the bar currently is (my call, not his)', () => {
    // The hunter is DEFINED as "75% of the win threshold". Pinned to the wave-1 bar it would fire at
    // 37.5% of a wave-6 bar and 3.75% of a wave-21 bar — spending the game's only anti-runaway
    // measure long before the race it polices has begun.
    expect(hunterTriggerScoreForWave(1)).toBe(HUNTER_TRIGGER_SCORE);
    expect(hunterTriggerScoreForWave(1)).toBe(Math.floor(winScoreForWave(1) * 0.75));
    expect(hunterTriggerScoreForWave(6)).toBe(Math.floor(winScoreForWave(6) * 0.75));
    expect(hunterTriggerScoreForWave(21)).toBe(Math.floor(winScoreForWave(21) * 0.75));
  });

  it('is always a whole number, because the gate compares it against a floored score', () => {
    for (let w = 1; w <= 26; w++) expect(Number.isInteger(hunterTriggerScoreForWave(w))).toBe(true);
  });
});

describe('S186 — ⛔ THE ANTI-COAST PROPERTY, through the real win gate', () => {
  /**
   * This is the test that pins his actual ask. It drives `tickGameState` — the production gate at
   * `gameState.ts` — rather than re-implementing the comparison, so it fails if the gate is ever
   * reverted to the flat constant.
   */
  function runGate(world: World): World['gameState'] {
    const extras = makeGameStateExtras();
    return tickGameState(world, extras, asPlayerId(0));
  }

  it('a seat on 3,000 WINS at wave 5', () => {
    const world = board();
    world.waveNumber = 5;
    world.scoreProgress = 3000;
    world.scoreByPlayer.set(asPlayerId(0), 3000);
    expect(runGate(world)).toBe('WIN');
  });

  it('⭐⭐ the SAME seat on the SAME 3,000 does NOT win at wave 6 — the bar overtook it', () => {
    // "you can't cheat by building a lot of them and then just letting the points run at level five
    // and then everyone can win at level five." The banked score is untouched; the bar moved.
    const world = board();
    world.waveNumber = 6;
    world.scoreProgress = 3000;
    world.scoreByPlayer.set(asPlayerId(0), 3000);
    expect(runGate(world)).not.toBe('WIN');
    expect(world.scoreProgress, 'the score is NOT reset — only the bar moved').toBe(3000);
  });

  it('and it wins again once it actually reaches the new bar', () => {
    const world = board();
    world.waveNumber = 6;
    world.scoreProgress = 5000;
    world.scoreByPlayer.set(asPlayerId(0), 5000);
    expect(runGate(world)).toBe('WIN');
  });

  it('the top band really is reachable and really does gate', () => {
    const world = board();
    world.waveNumber = 21;
    world.scoreProgress = 49_999;
    world.scoreByPlayer.set(asPlayerId(0), 49_999);
    expect(runGate(world)).not.toBe('WIN');

    const won = board();
    won.waveNumber = 21;
    won.scoreProgress = 50_000;
    won.scoreByPlayer.set(asPlayerId(0), 50_000);
    expect(runGate(won)).toBe('WIN');
  });
});

describe('S186 — it is free on the wire, and this is the proof', () => {
  it('⭐ the bar is derived from a field that is ALREADY hashed, so no peer can disagree', () => {
    // This is why the spec cost no new field, no four-sites work and no PROTOCOL_VERSION bump:
    // `waveNumber` was already synced and hashed for the spawn rate, so both peers derive the same
    // bar from state they already agree on.
    const world = board();
    const before = hashWorldStateFull(world);
    world.waveNumber = 7;
    expect(
      hashWorldStateFull(world),
      'the wave must be hashed, or two sims could disagree about who has won',
    ).not.toBe(before);
  });

  it('the bar survives a save round-trip, because the wave does', () => {
    const world = board();
    world.waveNumber = 12;
    const rebuilt = makeWorld(0x186);
    restore(snapshot(world), rebuilt);
    expect(rebuilt.waveNumber).toBe(12);
    expect(winScoreForWave(rebuilt.waveNumber)).toBe(winScoreForWave(world.waveNumber));
    expect(winScoreForWave(rebuilt.waveNumber)).toBe(10000);
  });

  it('is a PURE function — same wave in, same bar out, no clock and no rng', () => {
    // Determinism is the product. Calling it a thousand times must not drift.
    for (let i = 0; i < 1000; i++) expect(winScoreForWave(13)).toBe(10000);
  });
});
