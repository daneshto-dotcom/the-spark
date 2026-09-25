**STATUS: IN-PROGRESS — S191 `s191/endstats` canon notes for the merge owner (this branch may not edit `SPARK_CANON.md` / `src/canon.test.ts`).**

# S191 — canon notes: THE END-OF-MATCH STAT BOARD

Proposed canon text (a new § after §9d, or under §3b beside the win bar). Each number cites its constant; the
merge owner adds the `canon.test.ts` assertions in the same commit.

## ⭐ THE STAT BOARD (S191, owner S179 + S191) — what it counts, and the one rule that keeps it free

- **Shows in POSTGAME only** — the 2 s WIN banner lands on its own first. Rows by `matchPlacings`: the crowned seat,
  then the other survivors **by score** (R20's second half, unbuilt until S191), then the fallen in reverse
  elimination order; seat id breaks every tie.
- **Columns:** PLACE · PLAYER (seat label, race, `YOU`, `OUT Wn`) · SCORE (the banked balance, floored) · UNITS
  (minted, per type) · KILLS (enemy units, per victim type, credited to the killer's SEAT) · TOWERS built / fell ·
  DEALT · TAKEN — **damage in fifths as ACTUALLY APPLIED** (after castle DEF and every clamp; a connector hit banks
  in full because overkill carries, minus what a broken last connector throws away).
- **Graphs:** per wave, one line per seat — SCORE, and BUILT = **connectors standing** (⚠ Claude's choice, lever
  `sampleBuilt`). One point per wave edge (`hostTick.ts`, after `waveNumber += 1`) + one at the win, taken in the
  `WIN_TRIGGER` reducer BEFORE the teardown.
- ⛔ **INERT.** No reducer may read `World.matchStats`. That is what makes it additive-optional with no bump; the
  day something gates on a stat, the field needs a protocol bump.
- **Wire:** `WorldSnapshot.matchStats?` — absent while empty (byte-identical opening). Running totals ride every
  snapshot; the whole history rides only for `HISTORY_WINDOW_TICKS` = **120** ticks (2 s) after each sample and
  through WIN/POSTGAME (`matchStats.ts`). Measured (`matchStats.wire.test.ts`, 4 seats × 8 types × 30 waves):
  totals **1,527 B** a snapshot, with the history **6,765 B**.
- **TOWERS** = turrets, stink towers and spawners. ⚠ HELGA is not one (a unit her hall re-summons each BUILD).
- **Bundle:** the view + model are a lazy chunk (`matchBoardHost.ts` is the eager shim); entry +5.3 KiB.
- **`DamageAttacker` has a fourth answer, `{ kind: 'seat' }`** — the castle gun, the raid arms, every blast that
  names its owner. It turns, heals and raises NOBODY (retaliation / lifesteal / THE RISEN read `kind === 'creature'`);
  it exists so the board can credit a seat. `null` is left at the Pharaoh's divine fire and SCORCHED GROUND.
- **The exit:** a canvas click no longer resets POSTGAME; the board's CONTINUE (primary button) or R does, each
  refused for `ARM_MS` = **1200** ms after the board appears (`matchBoard.ts`).

## Constants to pin in `canon.test.ts`
| constant | value | file |
|---|---|---|
| `HISTORY_WINDOW_TICKS` | `2 * PHYSICS_HZ` = 120 | `src/state/matchStats.ts` |
| `ARM_MS` | 1200 | `src/render/matchBoard.ts` |
