NEXT: DONE — final report below; awaiting the merge owner's audit. (If re-opened: the only open seam is main.ts' modalCover line, see "Seams".)

# FINAL REPORT — s195/controls-macros (N6: Shift = place many; number-key build macros)

**Tip**: see `git log -1 s195/controls-macros` (report commit). Integration branch `ccr-26eaab43-fa9mg3` merged twice
(start 1c5ce299; final 1bae6810 merge, CLEAN, no conflicts, none of my files touched by it).

## Gates (each exit code read from a file in `.tmp-gates/`)
- `npm run typecheck` → exit **0** (`typecheck.exit`, re-run after the last hunk).
- `npx vitest run --maxWorkers=2` (full) → exit **0** — **585 files passed | 5 skipped (590) · 8872 tests passed | 12 skipped**
  (`vitest.exit`). ⚠ Run at 804bd748's source; the ONE later hunk (3 lines in `shiftPlaceMany`) was re-gated by typecheck +
  its four covering files (`controls.keyMacros`, `keyMacros`, `controls.refusedCue`, `controls.altFooter`: 54 tests, exit 0).
- `npm run build` → exit **0** — entry **1189.3 KiB / 1250, headroom 60.7** (`build.exit`). Baseline built from the integration
  tip in this worktree with my files set aside: **1186.3 KiB** → **my delta = +3.0 KiB**.
- `npx playwright test e2e/click-to-build.spec.ts e2e/footer-order-shapes.spec.ts e2e/button-press-edge.spec.ts` → exit **0**,
  **8 passed (2.6 m)** (`e2e.exit`) — on the container's **Chromium 1194** symlinked into the 1223 slot (per CLOUD rules).
- Mutations verified RED against `controls.keyMacros.test.ts` (source restored, diff clean after each): drop the Shift
  condition → 2 red · delete the keep call → 6 red · delete the `handleDigitKey` call → 10 red · drop the modal-cover guard → 1 red.
- Benign failure recorded: the first baseline build exited 1 because `tsc` compiled my NEW test files against the OLD footer
  (`keyBadges` missing) — the test, not the tree; redone with the tests set aside → exit 0.

## Bump verdict: **NO** (S186 test: can two builds that shake hands disagree about anything either computes? No.)
Nothing touches `src/state/**`. A Shift placement sends the SAME `BUILD_BLUEPRINT` a single placement sends (the REACH test pins
the key set `blueprintId, centre, playerId, type` on every sent intent); a digit ends in exactly the call the mouse makes on the
same chip or card (`select` / `pressCard`), both render-only. No new action, field, discriminant or rule. An old peer and a
new peer compute identical worlds from identical intents.

## What was built
1. **Shift = place many** (`controls.ts` stamp arm → `keepArmedAfterPlacement`): after the legal placement's intent goes out,
   the tower stays armed iff Shift is held AND `planBlueprintPayment(world, seat, id) !== null` (the predicate the card's READY and
   the reducer's refusal both come from). Running out → disarmed; Shift keyup → the CHAINED tower goes back (`endShiftChain`,
   keyed by `shiftChainedId` so a tower picked afresh survives); blur / tab hidden → same (no stuck Shift); illegal spot → the
   existing refusal cue, still armed (that path is untouched — my hunk sits after its `return`). Shift comes from real
   `keydown`/`keyup('Shift')` plus the pointer event's own `shiftKey` (freshest truth, both directions).
2. **Digit macros** (`keyMacros.ts` pure + `handleDigitKey`): the owner's two-stroke reading — first digit = the number PRINTED
   on the chip (its complexity, already drawn), second = card position in the open menu ("three, one" = BAT TOWER; "7, 2" = HELGA).
   Rule: open menu's card first, else the chip printing that digit. Registry today: chips 3..9, ≤2 cards/tier → disjoint;
   `keyMacros.test.ts` pins `maxCardsPerTier < minComplexity` so a collision turns red. Armed card's digit → disarm (toggle);
   open chip's digit → shuts it (the click's `select`). `code` is read before `key` (Shift+1 is `!` on US layouts); numpad too.
3. **Card key badge** (`footerBand.ts` `CARD_KEY_BADGE`): 18×16 plate at (+4,+4) inside the card rect, own `keyLabels` pool (the
   `CARD_LABELS` stride is untouched). It is the 12th opaque fill → registered in `footerBand.test.ts` as plate 12 ⊆ plate 5
   (`cardAt`), and `controls.keyMacros.test.ts` asserts badge ⊆ card on live geometry. `getUiPoints()` gained `keyBadges` + `keyMap`.
4. `dragPreview.ts`: NOT touched — the ghost is `blueprintGhost.sync(world, cursor, castlePanel.armedBlueprint())` every frame
   (main.ts:4525), so it persists for free while the tower stays armed.

## Overlay enumeration — which swallow digits (each pinned in `controls.keyMacros.test.ts` § "INERT")
| surface | how digits are inert |
|---|---|
| lobby chat / room-code / name field; settings overlay's controls | `document.activeElement` INPUT / TEXTAREA / SELECT (settings' DOM root also `stopPropagation`s) |
| codex (G+C), CONNECTION LOST, exit-confirm | the SAME `modalCover` predicate the click gates ask, at the board centre (point-independent arms) |
| NONET trial (digits 1–6 are its keys) | `world.sudoku !== null` (also `isInputLocked`) |
| POSTGAME match board (← → Tab paging), LOBBY, TITLE, arcade | `gameState !== 'PLAYING'` (the band draws nothing there) |
| band collapsed (Alt / arrow) | `keyMacroTargets()` is `[]` — nothing drawn, nothing addressed |
| benched seat | `isInputLocked` |
| auto-repeat; Ctrl / Meta / Alt + digit | left to the browser (tab chords; Alt is the footer toggle) |
⚠ "codex search": the codex overlay has NO text input today (grep `codexOverlay.ts`: none) — covered by the modal clause.

## ⚠ MINE (owner questions, with recommendations)
- **Digit precedence** card-first-then-chip; irrelevant while the registry keeps 1–2 = cards, 3–9 = chips (test-pinned).
  Recommend: keep; revisit only if a tier gains a 3rd tower or a 2-connector recipe appears.
- **Badge look**: 18×16 plate, 11 px mono bold, card tint, top-left over the thumb's empty corner. Chips carry NO badge — their
  printed number IS the key. Recommend: owner eyeballs it once; the hover tooltip for it belongs to info-ui.
- **Numpad**: both rows bound (NumLock on). Recommend keep.
- **Shift+digit**: identical to the plain digit (arm); "keep armed" is decided per placement by Shift being held then. Recommend
  keep — it is what "combines with 1" means in practice.
- **Chip digit plays the click SFX** (the mouse `select` arm is silent — a key has no press sink). Recommend keep.
- **Blur / hidden ends the chain** (the chained tower goes back on alt-tab). Recommend keep (a held-key gesture ends with focus).
- **Known limit** (reported, not fixed): on a joiner / worker-host the bank is the last snapshot's, so within one snapshot
  interval a rapid 2nd Shift click can send a `BUILD_BLUEPRINT` the host refuses (documented no-op); the next click after the
  snapshot lands sees the real bank and puts the tower back. Nothing is built twice. Fix would need an input-local spend ledger.

## Seams for the merge owner
- `controls.ts` hunks: imports (2 lines) · `FooterBandLike.keyMacroTargets?` · the card arm of `handleFooterChipClick` is now
  ONE call `this.pressCard(card)` (body moved verbatim into `pressCard`) · new block `pressCard` / `handleDigitKey` /
  `shiftPlaceMany` / `keepArmedAfterPlacement` / `endShiftChain` placed just above `toggleRaAim` · stamp arm: 6 lines AFTER the
  `!canStampAt` refusal `return` (its logic untouched — coherence-2's REACH hunk should merge clean) · `onKeyDown` +2 lines (Shift,
  digits) · `onKeyUp` +1 · `onAltFocusLost`/`onAltVisibility` +1 each · `putBackHand` and the Escape arm each clear `shiftChainedId`.
- `main.ts` (not mine, one-line offer): add `|| settingsOverlay.isVisible()` to the `setModalCover` predicate (main.ts:2216) so
  digits are also inert while the settings overlay is open with focus on `body`; today only its focused controls block them.
- `footerBand.test.ts` fill count 11 → 12 (rule followed: plate 12 inside plate 5).

## NOT DONE
- Hover tooltip for the digit — not mine (info-ui tree).
- The settings-overlay modalCover line in `main.ts` — outside my file boundary (seam above).


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
