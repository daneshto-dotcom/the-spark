/**
 * SPARK — S195 N6 (owner) — the PURE half of the number-key build macros, and the registry pin that
 * keeps the owner's two-stroke reading ("three, one … five, two") unambiguous.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { footerBandModel, structuresAtComplexity } from '../render/footerBandModel.ts';
import { KEY_MACRO_DIGITS, cardKeyDigit, digitOfKey, keyMacroTarget, keyMacroTargets } from './keyMacros.ts';
import '../state/godlyRecipes/registerAll.ts';

describe('S195 N6 — digitOfKey reads the main row AND the numpad, Shift-safe', () => {
  it('Digit1..Digit9 and Numpad1..Numpad9 → 1..9; Digit0 / Numpad0 are not macro keys', () => {
    for (const d of KEY_MACRO_DIGITS) {
      expect(digitOfKey({ code: `Digit${d}`, key: String(d) })).toBe(d);
      expect(digitOfKey({ code: `Numpad${d}`, key: String(d) })).toBe(d);
    }
    expect(digitOfKey({ code: 'Digit0', key: '0' })).toBeNull();
    expect(digitOfKey({ code: 'Numpad0', key: '0' })).toBeNull();
  });
  it('⛔ with Shift held a US layout reports key "!" for the 1 key — `code` is what is read', () => {
    expect(digitOfKey({ code: 'Digit1', key: '!' })).toBe(1);
    expect(digitOfKey({ code: 'Digit2', key: '@' })).toBe(2);
  });
  it('a synthetic event with no code falls back to key; a non-digit code never does', () => {
    expect(digitOfKey({ key: '3' })).toBe(3);
    expect(digitOfKey({ code: '', key: '7' })).toBe(7);
    expect(digitOfKey({ code: 'KeyA', key: '1' }), 'a real code that is not a digit wins over key').toBeNull();
    expect(digitOfKey({ code: 'End', key: 'End' }), 'numpad 1 with NumLock off is End').toBeNull();
  });
});

describe('S195 N6 — keyMacroTarget: the open menu\'s card first, then the chip printed with that number', () => {
  const chips = [{ complexity: 3 }, { complexity: 4 }, { complexity: 5 }, { complexity: 7 }];
  const cards = [{ id: 'a' }, { id: 'b' }];
  it('"first tower in line" → card 1; "second" → card 2', () => {
    expect(keyMacroTarget(1, chips, cards)).toEqual({ kind: 'card', id: 'a', index: 0 });
    expect(keyMacroTarget(2, chips, cards)).toEqual({ kind: 'card', id: 'b', index: 1 });
  });
  it('"three" → the chip that PRINTS 3 (not the third chip from the left)', () => {
    expect(keyMacroTarget(3, chips, cards)).toEqual({ kind: 'chip', complexity: 3 });
    expect(keyMacroTarget(5, chips, cards)).toEqual({ kind: 'chip', complexity: 5 });
    expect(keyMacroTarget(7, chips, cards)).toEqual({ kind: 'chip', complexity: 7 });
  });
  it('a digit on no chip and past the menu → null (inert, not a refusal)', () => {
    expect(keyMacroTarget(6, chips, cards)).toBeNull();
    expect(keyMacroTarget(9, chips, cards)).toBeNull();
  });
  it('no menu open → every digit is a chip lookup', () => {
    expect(keyMacroTarget(1, chips, [])).toBeNull();
    expect(keyMacroTarget(3, chips, [])).toEqual({ kind: 'chip', complexity: 3 });
  });
  it('the whole map is indexed d − 1 and has nine slots', () => {
    const m = keyMacroTargets(chips, cards);
    expect(m).toHaveLength(9);
    expect(m[0]).toEqual({ kind: 'card', id: 'a', index: 0 });
    expect(m[2]).toEqual({ kind: 'chip', complexity: 3 });
    expect(m[8]).toBeNull();
  });
  it('cardKeyDigit: 1-based, and a tenth card has no key', () => {
    expect(cardKeyDigit(0)).toBe(1);
    expect(cardKeyDigit(8)).toBe(9);
    expect(cardKeyDigit(9)).toBeNull();
  });
});

describe('⛔ S195 N6 — THE REGISTRY KEEPS THE TWO SETS DISJOINT (the owner\'s "three, one" stays unambiguous)', () => {
  it('no tier holds as many towers as the smallest printed complexity', () => {
    const w = makeWorld(1);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1],
    });
    const model = footerBandModel(w);
    expect(model.length, 'fixture: the bar has chips').toBeGreaterThan(0);
    const minComplexity = Math.min(...model.map((m) => m.complexity));
    const maxCards = Math.max(...model.map((m) => structuresAtComplexity(w, m.complexity).length));
    /*
     * Today: chips print 3..9 and no tier holds more than 2 towers, so digits 1–2 are ALWAYS cards and
     * 3–9 ALWAYS chips. A third tower at one tier, or a 2-connector recipe, makes a digit mean both —
     * `keyMacroTarget` would then resolve it CARD-FIRST (⚠ MINE), and the owner should decide.
     */
    expect(maxCards, `a tier holds ${maxCards} towers but the smallest chip prints ${minComplexity}`).toBeLessThan(minComplexity);
    // And every chip's printed number is a macro digit (1–9), so no tier is unreachable from the keyboard.
    for (const m of model) expect(KEY_MACRO_DIGITS as readonly number[]).toContain(m.complexity);
  });
});
