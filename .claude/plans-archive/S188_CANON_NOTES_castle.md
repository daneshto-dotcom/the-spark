# S188 P3 · canon text for the merge owner (`s188/castle`)

Proposed for `SPARK_CANON.md` §3d, "THE CASTLE NOW CLIMBS TOO", as a new last paragraph. The branch
did NOT edit the canon or `canon.test.ts` (brief rule). Every number below already has a constant
AND an assertion in the S187 tests, so no new canon assertion is needed unless you want the
castle-card rows pinned there too (suggested assertion at the bottom).

---

⭐ **S188 — AND NOW HE CAN PRESS IT.** S187 built all four in the sim and nothing dispatched
`UPGRADE_CASTLE_STAT`. His words: *"For now on, we just have regen … wire that in and implement it."*
The castle panel now carries **four rows under REGEN — HP, ATK, DEF, PEN** — each reading
`HP 3/10  100` and, on a second line, what the NEXT point buys (`castleUpgradePreview`, so HP shows
the CURRENT wave band's gain: 250 on waves 1–5, 350 on 6–10 …). A disabled row names its reason:
`NEED 100` · `MAX` · `LOCKED` (NONET or benched) · `CASTLE LOST` · `NOT YOURS`.

The castle card now prints the PURCHASED numbers: its bar's max is `castleMaxHpFor` (2500 + the
baked HP bonus), and its rows are **ATK · PEN · DEF · RANGE · RELOAD · REGEN**, with the shot on
the ATK row it derives from (`castleShotFifthsFor` — 40 base, 48 after one ATK point). ⚠ The old
standalone SHOT row is gone: it printed the UN-upgraded 40 whatever the keep had bought.

| constant | value | whose |
|---|---:|---|
| `CASTLE_UPGRADE_PRICE` | 100 | his (S187, unchanged) |
| `CASTLE_UPGRADE_MAX_LEVEL` | 10 | his (S187, unchanged) |
| `CASTLE_HP_GAIN_BY_BAND` | 250/350/450/550/650 | his (S187, unchanged) |
| `ROW_DETAIL_FONT_SIZE` (`castlePanel.ts`) | 11 px | ⚠ MINE — the second line fits inside the existing 44 px row |

---

Suggested `canon.test.ts` assertion, if you land the paragraph:

```ts
// S188 P3 — the castle card prints the purchased shot, not the base one
const w = makeWorld(1); /* seat 0 */ w.players.get(P0)!.castleUpgrades =
  { hpLevel: 1, hpBonus: 250, atkLevel: 1, defLevel: 0, penLevel: 0 };
const v = characterSheetModel(w, P0, { kind: 'castle', seat: P0 })!;
expect(v.health.max).toBe(CASTLE_MAX_HP + 250);
expect(v.stats.find((r) => r.label === 'ATK')!.derived).toBe(`${attackFifths(CASTLE_ATK + 1, CASTLE_PEN)} a shot`);
```
