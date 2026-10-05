/**
 * SPARK — S195 N6 (owner) — **NUMBER-KEY BUILD MACROS**, the PURE half.
 *
 * > *"click like three, one … tier three towers … first tower in line … five, two … Helga … like in TD
 * > games"* — owner, S195 (N6)
 *
 * His two-stroke macro, read off what the footer already draws: the FIRST digit is the number PRINTED ON
 * THE CHIP (a chip is labelled with its connector count — `footerBand.ts` draws `String(c.complexity)`
 * on it — so "three" is the chip that says 3, not the third chip from the left), and the SECOND digit is
 * the card's position in the menu that chip opened ("first tower in line"). Pixi-free and DOM-free so it
 * can be driven headless from `controls.ts` and pinned without a renderer.
 *
 * ⚠ ONE RULE RESOLVES A DIGIT THAT COULD MEAN BOTH: **the open menu's card wins, the chip is the fallback.**
 * Today's registry makes the two sets disjoint — the chips print 3..9 and no tier holds more than two
 * towers, so 1–2 are always cards and 3–9 always chips (`keyMacros.test.ts` pins this against the live
 * registry; a third tower at one tier or a 2-connector recipe turns it red and the owner decides). ⚠ MINE:
 * the precedence itself is my default, reported in the S195 controls-macros report.
 *
 * ⛔ CLIENT INPUT ONLY. Nothing here reads or writes `src/state/**`; a digit ends in exactly the call a
 * mouse press on the same chip or card makes, so the wire sees what it already saw (no protocol bump).
 */

/** What a digit addresses this frame: a card in the open menu, or a tier chip, by what the player sees. */
export type KeyMacroTarget =
  | { readonly kind: 'card'; readonly id: string; readonly index: number }
  | { readonly kind: 'chip'; readonly complexity: number };

/** Digits 1–9 are macro keys; 0 is not (no chip prints 0 and no menu has a zeroth card). */
export const KEY_MACRO_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type KeyMacroDigit = (typeof KEY_MACRO_DIGITS)[number];

/**
 * The digit a keyboard event carries, on BOTH the main row and the numpad, or null.
 *
 * ⚠ `code` FIRST, `key` SECOND, and the order is load-bearing: with Shift held (the N6 "arm and keep
 * armed" chord) a US layout reports `key: '!'` for the 1 key while `code` stays `Digit1`. `key` is the
 * fallback for a synthetic event or a layout whose `code` is empty. Numpad digits arrive as `Numpad1`
 * only with NumLock on; off, the same key is `ArrowEnd`/`End` and is correctly NOT a digit.
 */
export function digitOfKey(e: { readonly code?: string; readonly key?: string }): KeyMacroDigit | null {
  const code = e.code ?? '';
  let m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (m === null && code === '' && e.key !== undefined) m = /^([1-9])$/.exec(e.key);
  if (m === null) return null;
  return Number(m[1]) as KeyMacroDigit;
}

/**
 * The target a digit addresses, given this frame's visible order: the open menu's cards (in the order
 * they are drawn, left to right) and the chip row (each with the number printed on it).
 *
 * Returns null when the digit names nothing on screen — a digit above the open menu's card count whose
 * number is on no chip — so the caller does nothing (and plays nothing: an inert key is not a refusal).
 */
export function keyMacroTarget(
  digit: KeyMacroDigit,
  chips: ReadonlyArray<{ readonly complexity: number }>,
  cards: ReadonlyArray<{ readonly id: string }>,
): KeyMacroTarget | null {
  const card = cards[digit - 1];
  if (card !== undefined) return { kind: 'card', id: card.id, index: digit - 1 };
  const chip = chips.find((c) => c.complexity === digit);
  if (chip !== undefined) return { kind: 'chip', complexity: chip.complexity };
  return null;
}

/** The whole map for one frame, index `d - 1` for digit `d`. What the footer exposes to `controls.ts`. */
export function keyMacroTargets(
  chips: ReadonlyArray<{ readonly complexity: number }>,
  cards: ReadonlyArray<{ readonly id: string }>,
): ReadonlyArray<KeyMacroTarget | null> {
  return KEY_MACRO_DIGITS.map((d) => keyMacroTarget(d, chips, cards));
}

/**
 * The digit a CARD shows on its badge: its 1-based position in the open menu. Chips show their printed
 * complexity already, which IS their key, so they carry no second label (one number per control).
 */
export function cardKeyDigit(index: number): KeyMacroDigit | null {
  const d = index + 1;
  return d >= 1 && d <= 9 ? (d as KeyMacroDigit) : null;
}
