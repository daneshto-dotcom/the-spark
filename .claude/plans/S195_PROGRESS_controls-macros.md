NEXT: wait for the full vitest (.tmp-gates/vitest.exit), then baseline-build the integration tip for the entry delta, then `npx playwright test e2e/click-to-build.spec.ts e2e/footer-order-shapes.spec.ts e2e/button-press-edge.spec.ts`, then the final report.

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

## Gate log so far (merged tree 1bae6810, integration branch re-merged clean, no conflicts, my files untouched by it)
- typecheck: exit 0 (`.tmp-gates/typecheck.exit`)
- build: exit 0 — entry 1189.3 KiB / 1250 (headroom 60.7) — baseline of the integration tip still to measure
- slice vitest (input + footer + skin census + canon + ci lanes): 25 files / 625 tests, exit 0
- mutations verified RED against controls.keyMacros.test.ts: drop Shift condition (2 red) · delete keep call (6 red) ·
  delete handleDigitKey call (10 red) · drop modal-cover guard (1 red); source restored, diff clean.
