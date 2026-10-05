NEXT: write src/input/keyMacros.ts (pure digit → target mapping), then wire footerBand.keyMacroTargets + card digit badge, then controls.ts Shift chain + digit handler, then tests.

# S195 — controls-macros tree (N6: Shift = place many; number-key build macros)

Branch `s195/controls-macros`. Merged `ccr-26eaab43-fa9mg3` at start (1c5ce299, clean).

## Design decisions (⚠ MINE unless quoted)
- Owner: *"click like three, one … tier three towers … first tower in line … five, two … Helga"*. The chip
  already PRINTS its complexity (3..9), so the first digit IS the chip's printed number; the second digit is
  the card's index in the open menu. Registry today: chips 3..9, ≤2 cards per tier → digits 1–2 always
  address cards, 3–9 always chips; a test pins the disjointness so a registry change turns it red.
- Digit of the armed card → disarm. Digit of the open chip → toggles it shut (the click's own `select`).
- Shift read from real keydown/keyup('Shift') + the pointer event's own `shiftKey`; cleared on blur/hidden.
- Shift-kept item is re-checked with `planBlueprintPayment` (the model's own affordability predicate).
