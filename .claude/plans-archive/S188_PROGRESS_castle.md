# S188 P3 · `s188/castle` — running progress

Branch `s188/castle`, worktree `.claude/worktrees/s188-castle`. **STATUS: DONE — ready for audit.**

## DONE
- `src/render/castlePanel.ts` — four rows `castleHp/Atk/Def/Pen` in `CASTLE_ROW_KEYS`, drawn by the
  existing row loop (zero new `.fill({`), a second 11px line = `castleUpgradePreview`, reasons
  NOT YOURS / LOCKED / CASTLE LOST / MAX / NEED 100; `activate` is an exhaustive key switch;
  `setCastleStatHandler`.
- `src/main.ts` — `setCastleStatHandler` → `dispatchFn({ type: 'UPGRADE_CASTLE_STAT', … })`. Nothing else.
- `src/render/characterSheetModel.ts` — castle card: bar max `castleMaxHpFor`, rows ATK (upgraded
  shot) / PEN / DEF / RANGE / RELOAD / REGEN.
- Tests: `src/render/castleStatButtons.test.ts` (30), `characterSheetModel.test.ts` re-pinned (SHOT → ATK).
- `e2e/castle-panel.spec.ts` — seven-key literal + a castle-HP click case. **NOT RUN** (brief).
- Mutations M1/M2/M3 all red, reverted, tree verified clean.
- Gates: typecheck 0 · vitest 0 (5658 / 344) · build 0 (921.7 KiB, 78.3 KiB headroom).
- Live client (vite :29866, solo): panel drawn, real click on HP spent 100 → 0, hpLevel 1, hpBonus 250.
- Canon text: `.claude/plans/S188_CANON_NOTES_castle.md`.

## FIX ROUND (merge owner sent back items 1–5) — ALL DONE
- 1e2a8a1 save.ts emit + rehydrate against `castleMaxHpFor` (was the wire bug) — mutation-tested.
- 3538965 an HP purchase adds its band gain to current HP too.
- 3b580c1 keep bar + damage art divide by the seat's upgraded max (`keepHpFraction`).
- 0813feb kill floater prints the upgraded shot.
- c062ea3 radar docblock corrected (comment only).
- Gates after the round: typecheck 0 · vitest 0 (5674 / 345) · build 0 (921.8 KiB, 78.2 headroom).

## STILL OPEN, OUTSIDE SCOPE (report, do not fix)
- `state/gameMode.ts` ~:197–245 resets `castleHp`, `castleRegenLevel` and `draftPicks` at match
  start but NOT `castleUpgrades`, so bought castle stats carry into a rematch for an existing seat.
