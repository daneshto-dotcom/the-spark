# S173 — NONET STAGES (design note only, NOTHING implemented)

Written during S173 P6 (the NONET-music regression). **No code was written for this.** It records
what the owner asked for, what the shipped NONET difficulty model actually is (read from the code,
not from a handoff), and what a 10-stage ladder would touch. Questions are left for the owner
rather than answered here.

## 1. His words, verbatim

> "we already discussed it before, but there should be STAGES. Right? Like, you have to beat like
> ten stages, and then you get to a harder level of sudoku. We're gonna have to build it in
> parallel with spark."

## 2. What the NONET difficulty model IS today

Read from `src/state/sudoku.ts`, `src/state/sudokuEvent.ts`, `src/render/arcadeOverlay.ts`,
`src/render/arcadeRun.ts`.

**There is no difficulty model. There is one puzzle shape and one dial that nothing turns.**

| thing | where | value | varies? |
|---|---|---|---|
| grid | `sudoku.ts` `SUDOKU_N` | 6 (6×6, 36 cells) | no — a `const` |
| box | `SUDOKU_BOX_H` / `SUDOKU_BOX_W` | 2×3 | no — `const`s |
| clue count | `SUDOKU_DEFAULT_GIVENS` | 16 | **parameterised, never passed** |
| trial timeout | `sudokuEvent.ts` `NONET_TIMEOUT_TICKS` | 10800 (~180 s) | no |
| score swing | `NONET_WINNER_MULT` / `NONET_LOSER_MULT` | ×2 / ×0.4 | no |
| trigger | `NONET_CONNECTOR_COUNT` | 12 bonds | no |

⭐ **The one real foothold.** `generateSudoku(seed, targetGivens = SUDOKU_DEFAULT_GIVENS)` already
takes difficulty as its second parameter, and the digger honours it (it keeps carving while the
puzzle stays uniquely solvable). **Neither call site passes it** — `startSudoku` calls
`generateSudoku(seed)` and `makeArcadeNonet` calls `generateSudoku(seed)`. So "fewer clues per
stage" is the cheapest possible ladder: the generator already supports it.

⚠ **Uniqueness is the real ceiling, not the parameter.** The digger stops early when no further
cell can be removed with a unique solution left, so `targetGivens` is a *target*, not a promise. A
6×6 with 2×3 boxes runs out of headroom well before it gets *hard*; nobody has measured where. That
measurement is a prerequisite for any ladder built on clue count.

**Two separate NONETs exist, and they are not the same code path:**

- **Match trial** — `world.sudoku`, host-authoritative, freezes the whole duel, wire-carried,
  hashed. Guarded by `world.sudokuFiredThisMatch`: **once per match, ever.**
- **Arcade** — `makeArcadeNonet(seed)` on the title screen, handed to the shipped overlay through
  its `override` seam. **Pure render state.** It touches no sim state, crosses no wire, is in no
  hash. `arcadeRun.ts` drives a wall clock through `RUNNING → ENTER_INITIALS → BOARD`, and
  `arcadeScores.ts` keeps a local high-score board. **One puzzle per run. No stage concept at all.**

## 3. What a 10-stage ladder would touch

**If the ladder is ARCADE-ONLY** (which is where he was playing, and where a ladder naturally fits):

- `arcadeRun.ts` — `ArcadeRun` gains a stage index and the phase machine gains a
  `STAGE_CLEARED → next puzzle` arm; today `RUNNING` has exactly one exit, to `ENTER_INITIALS`.
- `main.ts` — the solve handler currently does `arcadeNonet = null` on a correct grid, which ends
  the puzzle. It would instead mint the next stage's puzzle. (⚠ `main.ts` is contended; that edit
  belongs to whoever owns it.)
- `arcadeOverlay.ts` / `sudokuOverlay.ts` — a stage indicator, and a per-stage clue count passed
  into `makeArcadeNonet`.
- `arcadeScores.ts` — what a "score" even means changes (see Q6).
- **Protocol cost: ZERO.** Nothing here is synced or hashed. `PROTOCOL_VERSION` stays 46.

**If the ladder is also IN-MATCH**, the cost is categorically different:

- ⛔ **`sudokuFiredThisMatch` is a once-per-match latch.** A ladder inside a match contradicts the
  shipped rule head-on; that is a design decision for the owner, not a refactor.
- ⛔ **`world.sudoku` is HASHED** — `stateHashFull.ts` lists `sudoku: 'hashed'` and projects it as
  `JSON.stringify(world.sudoku)`. Any new field lands in the oracle automatically, so host and
  peer must agree on it exactly or two sims diverge.
- ⛔ **Only `seed`, `triggeredBy`, `solvedBy`, `resolvedTick` cross the wire — `puzzle` does not.**
  Each peer regenerates the puzzle from the seed. So if a stage changes `targetGivens`, **the
  difficulty must reach the client or the two sides render different boards.** Either:
  - send it (a **required** new serialized field ⇒ **`PROTOCOL_VERSION` 46 → 47**, and per
    `protocol.ts` that is a six-site edit, not one); or
  - derive it from state both peers already hold (a stage counter already in the snapshot), which
    costs no bump — the project's stated preference is *derive over send*.
- The four-sites warning applies: factory + serialize + hash + worker.

## 4. Open questions — for the owner, not for me

1. **Arcade only, or in-match too?** This is the whole cost difference: arcade is free of the wire,
   in-match means a protocol bump and overturning the once-per-match rule.
2. **What gets harder per stage?** Fewer clues (the existing dial), a shorter clock, a bigger grid,
   or a combination? "a harder level of sudoku" could mean any of them.
3. **A bigger grid is not a dial.** 6×6/2×3 is baked into the generator, the validator
   (`isValidComplete`), and the overlay's layout. If "harder level" means 9×9, that is a real
   feature, not a constant — should it be on the table at all?
4. **Ten stages then what?** Does stage 11 begin a new harder band (bands forever), or does the run
   *end* at ten with the harder level as a separate unlocked mode?
5. **What does failing a stage do?** Run over, or retry the stage? Does the clock keep running
   across stages (one total time) or reset each stage?
6. **What does the high-score board measure now?** Today it is one time for one puzzle. Total time
   for all ten? Deepest stage reached? Per-band boards?
7. **Does progress persist?** `arcadeScores` already uses localStorage, so a "furthest stage" could
   persist — or should every run start at stage 1?
8. **"in parallel with spark"** — read as: its own workstream, not blocking match work. Confirm.

## 5. Prerequisite before ANY of this is planned

Measure the real clue-count floor for 6×6/2×3 under the uniqueness constraint. If the digger
bottoms out at, say, 12 givens, then a ten-rung ladder built on clue count has roughly four
distinguishable rungs and the design has to lean on the clock or the grid instead. **That
measurement should come before the PDR, not inside it.**
