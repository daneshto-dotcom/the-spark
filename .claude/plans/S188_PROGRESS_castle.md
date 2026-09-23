# S188 P3 · `s188/castle` — running progress

Branch `s188/castle`, worktree `.claude/worktrees/s188-castle`. Updated with every commit.

## DONE
- `npm install` (exit 0).
- Read: batch PDR §0–§8 + BRIEF P3, canon §3 / §3d, `castleUpgrades.ts`, `castleRegen.ts`,
  `castlePanel.ts` (+ tests), `characterSheetModel.ts` castle card, `main.ts` regen dispatch.

- CODED + committed (e681db5, caf65ba, 233be0a): panel rows, main.ts dispatch, castle card,
  e2e key literal + castle-HP click case (e2e NOT run), `src/render/castleStatButtons.test.ts` 30/30.
- Mutation-tested, all three went RED and were reverted (tree verified clean after):
  M1 old index chain in `activate` → 10 red · M2 drop the NOT-YOURS seat clause → 1 red ·
  M3 card bar max back to flat 2500 → 2 red.

## IN PROGRESS
- Full gates (typecheck / vitest / build), canon notes file, screenshot attempt.

## THE DESIGN AS BUILT
- (as below)
  - `render/castlePanel.ts`: four new rows in `CASTLE_ROW_KEYS` — `castleHp`, `castleAtk`,
    `castleDef`, `castlePen` — drawn by the SAME row loop (no new `.fill({` site). Two-line label:
    main line `ATK 3/10  100` / blocker, sub line = `castleUpgradePreview(...)`.
    Reasons: `LOCKED` (NONET / benched, the regen template), `CASTLE LOST`, `MAX`, `NEED 100`,
    `NOT YOURS` (panel opened on a seat that is not the local one).
    `activate` index chain -> key map. New `setCastleStatHandler((stat) => …)`.
  - `main.ts`: `castlePanel.setCastleStatHandler(stat => dispatchFn({ type: 'UPGRADE_CASTLE_STAT', … }))`.
  - `render/characterSheetModel.ts` castle card: health max = `castleMaxHpFor`, rows ATK (with the
    upgraded shot) / PEN / DEF / RANGE / RELOAD / REGEN.

## NEXT
- Tests: model reasons (one negative per reason), label fit, fill enumeration for castlePanel.ts,
  REACH through the real reducer + real host tick, main.ts wiring tripwire.
- Gates: typecheck, vitest, build.

## KNOWN-BROKEN / SUSPICIOUS (outside scope — report, do not fix)
- `state/save.ts:2107` emits `castleHp` only when `< CASTLE_MAX_HP` and rehydrates absent as
  `CASTLE_MAX_HP`; with bought HP + regen a keep can sit above 2500, so a joiner reads 2500.
- An HP purchase raises only the CEILING (`hpBonus`); current `castleHp` is not topped up, so
  without regen the purchase changes nothing but the bar's max.
- `render/gathererRenderer.ts:366` keep bar and `castleFrames` art state divide by `CASTLE_MAX_HP`.
- `render/damageNumbers.ts:282` credits the castle with the BASE shot, not the upgraded one.
