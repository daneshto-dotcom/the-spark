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

## KNOWN-BROKEN / SUSPICIOUS (outside scope — report, do not fix)
- `state/save.ts:2107` emits `castleHp` only when `< CASTLE_MAX_HP` and rehydrates absent as
  `CASTLE_MAX_HP`; with bought HP + regen a keep sits above 2500, so a joiner reads 2500.
- An HP purchase raises only the CEILING (`hpBonus`); `castleHp` is not topped up, so without regen
  the purchase changes nothing but the bar's max.
- `render/gathererRenderer.ts:366` keep bar (+ castle art state) divide by `CASTLE_MAX_HP`.
- `render/damageNumbers.ts:282` credits the castle with the BASE shot, not the upgraded one.
- `render/characterSheetRadar.ts:263` docblock says the castle gets no radar; it has drawn one since
  S185 (SHOT/RANGE/RELOAD) and now draws five axes (ATK/PEN/DEF/RANGE/RELOAD).
