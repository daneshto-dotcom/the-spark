/**
 * SPARK — the upgrade draft's arithmetic and schedule.
 *
 * ⛔ THE OWNER'S WORKED EXAMPLE IS THE FIRST TEST, VERBATIM, because it is the whole ruling:
 * *"instead of six health he will have seven health"*. If that assertion ever goes red, the buff has
 * stopped being expressible on the 1/1/1/1 unit and the feature is silently dead.
 */

import { describe, expect, it } from 'vitest';
import {
  DRAFT_BUFF_PCT,
  DRAFT_PICKS,
  DRAFT_WAVE_INTERVAL,
  GENERAL_TRACK,
  damagePickCount,
  draftIndexForWave,
  draftedPoolFifths,
  generalPickForWave,
  isDraftWave,
  poolPickCount,
  raceUnitAttackAfterPicks,
  raceUnitPoolAfterPicks,
  type DraftPick,
} from './draft.ts';
import { applyDraftPercent, attackFifths, unitPoolFifths } from './stats.ts';
import {
  RACE_UNIT_ATK,
  RACE_UNIT_DEF,
  RACE_UNIT_HP,
  RACE_UNIT_PEN,
} from '../constants.ts';

describe('the owner’s ruling: percentage, floored, minimum one', () => {
  it('turns the race unit’s pool of 6 into 7 — his worked example', () => {
    // Derived from the constants, never a literal 6: if R125 is ever retuned this test follows it
    // rather than pinning a number the game no longer uses.
    const base = unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF);
    expect(base).toBe(6);
    expect(raceUnitPoolAfterPicks(1)).toBe(7);
  });

  it('compounds, so two picks read 6 → 7 → 8 rather than 6 → 7 → 7', () => {
    expect(raceUnitPoolAfterPicks(0)).toBe(6);
    expect(raceUnitPoolAfterPicks(1)).toBe(7);
    expect(raceUnitPoolAfterPicks(2)).toBe(8);
    expect(raceUnitPoolAfterPicks(3)).toBe(9);
  });

  it('gives a LARGE pool a real percentage instead of the floor — 260 gains 26, not 1', () => {
    // This is the half that `+1 POINT` (R118) got wrong: the same step for a chewer and a Kraken.
    expect(applyDraftPercent(260, 1, DRAFT_BUFF_PCT)).toBe(286);
    expect(applyDraftPercent(260, 2, DRAFT_BUFF_PCT)).toBe(314);
  });

  it('never returns a non-integer, at any pool size or pick count', () => {
    // damageEntity THROWS on a non-integer amount; this is the property that keeps it out.
    for (let base = 1; base <= 400; base++) {
      for (let picks = 0; picks <= 6; picks++) {
        const v = applyDraftPercent(base, picks, DRAFT_BUFF_PCT);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('is strictly increasing — a pick is never worthless, which is the point of the floor', () => {
    for (let base = 1; base <= 200; base++) {
      expect(applyDraftPercent(base, 1, DRAFT_BUFF_PCT)).toBeGreaterThan(base);
    }
  });

  it('depends only on the COUNT of picks, never on their order', () => {
    // The sim must not be able to notice the sequence; only the hash (deliberately) can.
    const a: DraftPick[] = ['hp', 'def', 'hp'];
    const b: DraftPick[] = ['hp', 'hp', 'def'];
    expect(draftedPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF, a)).toBe(
      draftedPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF, b),
    );
  });
});

describe('which picks move which derived number', () => {
  it('counts hp+def toward the pool and atk+pen toward damage', () => {
    const picks: DraftPick[] = ['hp', 'def', 'atk', 'pen', 'hp'];
    expect(poolPickCount(picks)).toBe(3);
    expect(damagePickCount(picks)).toBe(2);
  });

  it('leaves damage untouched when only pool picks are held, and vice versa', () => {
    const baseAtk = attackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN);
    expect(raceUnitAttackAfterPicks(0)).toBe(baseAtk);
    expect(draftedPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF, ['atk', 'pen'])).toBe(
      unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF),
    );
  });

  it('every DraftPick is classified as exactly one of pool or damage', () => {
    // A new value added to the union without a home here would silently buff nothing.
    for (const p of DRAFT_PICKS) {
      const asPool = poolPickCount([p]);
      const asDmg = damagePickCount([p]);
      expect(asPool + asDmg).toBe(1);
    }
  });
});

describe('the schedule — and the off-by-one that bit the original spec', () => {
  it('drafts on waves 1, 6, 11, 16, 21 — NOT 5, 10, 15', () => {
    // waveNumber starts at 1 and increments on ENTRY INTO BUILD, so the BUILD after wave 5's FIGHT
    // is wave 6. SPARK_RACES_SPEC.md §9.5 and §9.7 contradicted each other on exactly this.
    expect([1, 2, 3, 4, 5, 6, 7, 10, 11, 15, 16, 20, 21].filter(isDraftWave)).toEqual([
      1, 6, 11, 16, 21,
    ]);
  });

  it('numbers the drafts from zero, so the pre-wave-1 one is index 0', () => {
    expect(draftIndexForWave(1)).toBe(0);
    expect(draftIndexForWave(6)).toBe(1);
    expect(draftIndexForWave(21)).toBe(4);
  });

  it('follows the owner’s axis order: health, defense, attack, penetration', () => {
    expect(GENERAL_TRACK).toEqual(['hp', 'def', 'atk', 'pen']);
    expect(generalPickForWave(1)).toBe('hp');
    expect(generalPickForWave(6)).toBe('def');
    expect(generalPickForWave(11)).toBe('atk');
    expect(generalPickForWave(16)).toBe('pen');
  });

  it('WRAPS past penetration rather than running out — flagged as MINE, not his', () => {
    // R101 makes the draft recurring with no ceiling, so a table would run dry. If he rules a fifth
    // distinct option, this is the assertion that should change.
    expect(generalPickForWave(21)).toBe('hp');
    expect(generalPickForWave(26)).toBe('def');
  });

  it('keeps the interval at the ruled 5', () => {
    expect(DRAFT_WAVE_INTERVAL).toBe(5);
  });
});
