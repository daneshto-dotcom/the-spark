---
STATUS: COMPLETED
session: S92
created: 2026-06-17
tier: Micro
item: HYGIENE (two S91-CHECK LOW items)
gate: user 'go' (explicit unlock); no user-locked surface touched
commits: 3244ed3 (code) + c64caa8 (session-state)
check: 3-lens adversarial CHECK (wf_31455c37-1ef) ALL CLEAN high-confidence
---

# PDR — S92 HYGIENE (Micro)

Presented inline this session; archived here for audit-reconstructability.

## 1. OBJECTIVE
Clear the two LOW items the S91 CHECK flagged. Pure cleanup, zero runtime behavior change.
- **Item A:** `MAGIC_12_KEYS` now maps **14** magical combos → rename to `MAGIC_COMBO_KEYS`.
- **Item B:** `session15.test.ts` solo-win loop iterates `PHASE_1_WIN_SCORE / SCORE_ANCHOR` (=630) purely to build a structure, but the win is driven by the direct `w.scoreProgress` set on the next line → decouple the loop count from the balance constant (reflexion `#a-relative-test-still-breaks-on-a-fixed-iteration-budget`).

## 2. SCOPE
- **Item A (rename, 3 code files):** `combos.ts:226` (export-const def); `render/ui.ts:29` (import) + `:153` (comment) + `:163` (`.length` HUD read); `combos.test.ts:12` (import) + `:24` (`.length` assertion). RHS unchanged → semantically inert.
- **Item B (`session15.test.ts`):** replace loop bound `PHASE_1_WIN_SCORE/SCORE_ANCHOR` with a named local `WINNING_STRUCTURE_SIZE = 12` + clarifying comment; drop now-unused `SCORE_ANCHOR` from the line-24 import (keep `PHASE_1_WIN_SCORE`, used @336/@351); assertions + the `scoreProgress` set unchanged.
- **OUT:** any constant value change, any combo-table/lock-surface change.

## 3. TESTING
`tsc -b --noEmit` → 0 · `vitest run` → 1433/1433 (80 files) · production bundle `index.js` = 561.42 vite-kB = **548.3 KiB < 550** (unchanged — local identifier mangles away, test-loop change doesn't ship). No E2E (no shipped runtime behavior change).

## 4. RESULT — COMPLETED & PUSHED
- Code `3244ed3`, session-state `c64caa8` (both on `master`, pushed `d1650de..c64caa8`).
- State-Discovery (Rule 21 A.0) done inline pre-PDR (all consumers + constants read).
- CHECK = Micro RALPH + 3-lens adversarial workflow on the actual diff → **ALL CLEAN, high confidence**: rename completeness (0 surviving refs, no dynamic/string access), test integrity (win gates only on `scoreProgress`; `placePrimitive` never scores → 12-vs-630 irrelevant), doc-drift (all 11 non-src hits dated history, correctly left; S91 false-claim trap re-checked). No findings to triage.
