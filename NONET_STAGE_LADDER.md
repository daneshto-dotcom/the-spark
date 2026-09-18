# NONET — the 30-stage ladder

**S182. RESEARCH, NOT A BUILD.** You asked questions; these are the answers, read out of the code and
measured where measuring was the only honest way to answer. Nothing here is implemented, and the
design decisions at the end are yours to make.

> *"We have different levels of Sudoku. We had like ten levels of the first level, then ten of the
> second, then ten of the third. We have to start building this. Let's build the first thirty ones.
> So we'll have also leaderboards for the first… because how is it working now? I don't even know.
> Like, we generate a random Sudoku every time. Is there difficulty? We need to rework it a little
> bit."*

⭐ **This is not the first time this was researched.** `.claude/plans/S173_NONET_STAGES.md` answered
most of it nine sessions ago and has been sitting marked IN-PROGRESS ever since. It named one
prerequisite — *"measure the real clue-count floor… that measurement should come before the PDR, not
inside it"* — and nobody ran it. **I ran it.** The result changes the answer, which is why the note
was right to insist on it.

---

## 1. "We generate a random Sudoku every time" — yes, and it is worse than random

There are **two** NONETs and they are not the same code path.

| | in a match | in the arcade |
|---|---|---|
| where the puzzle lives | `world.sudoku` — host-authoritative, hashed, wire-carried | render state only, touches no sim |
| the seed | `mintNonetSeed` — host mints it from the world rng + the tick, broadcasts it | `Math.floor(performance.now())` — **the wall clock** |
| same puzzle for everyone? | **yes** — only the seed crosses the wire, each peer regenerates byte-identically | **no** |
| how often | **once per match, ever** (`sudokuFiredThisMatch`) | one puzzle per run |

⛔ **THE ARCADE SEED IS THE CLOCK, AND THAT MATTERS FOR THE LEADERBOARD YOU JUST ASKED FOR.** Every
run mints a different puzzle from `performance.now()`. So when you and your friend both post a time
to the shared board, **you did not solve the same puzzle** — one of you may have drawn a grid that
falls out in 40 seconds and the other one that fights back. Over 25 rows that mostly averages out,
but it is not a like-for-like race, and a *stage* board would be far more meaningful precisely
because a stage could pin its seed.

This is a decision point, not a defect I should quietly fix — see Q1 at the bottom.

## 2. "Is there difficulty?" — the dial exists, and **nothing in the game has ever turned it**

`generateSudoku(seed, targetGivens = SUDOKU_DEFAULT_GIVENS)` takes difficulty as its second argument
and the digger honours it. **All three production call sites pass one argument:**

- `sudokuEvent.ts:119` `generateSudoku(seed)` — the match trial
- `arcadeOverlay.ts:109` `generateSudoku(seed)` — the arcade
- `save.ts:1455` `generateSudoku(snap.sudoku.seed)` — a peer rebuilding the puzzle from a snapshot

So every NONET ever played, in either mode, has been the same difficulty: **16 clues**. The backlog's
claim that *"difficulty is already a live parameter nothing passes"* is **verified true, not stale.**

## 3. ⛔ THE MEASUREMENT — and it is bad news for a ten-rung ladder built on clues

S173 guessed the digger might bottom out around 12 givens and that a ten-rung ladder would then have
"roughly four distinguishable rungs". I measured it against the shipped generator: **300 seeds per
target**, with a solver that classifies each puzzle by the hardest technique it actually needs.

| target clues | realised min | median | max | naked singles only | needs hidden singles | needs guessing |
|---|---|---|---|---|---|---|
| 4 | 8 | 10 | 12 | 67% | 26% | 7% |
| 6 | 8 | 10 | 12 | 67% | 26% | 7% |
| 8 | 8 | 10 | 12 | 67% | 26% | 7% |
| 10 | 10 | 10 | 12 | 70% | 23% | 7% |
| 12 | 12 | 12 | 12 | 89% | 8% | 3% |
| 14 | 14 | 14 | 14 | 97% | 2% | 0% |
| **16 — what ships today** | 16 | 16 | 16 | **100%** | 0% | 0% |
| 18 | 18 | 18 | 18 | 100% | 0% | 0% |

Two findings, and both are load-bearing:

⛔ **THE FLOOR IS ~10 CLUES, NOT 4.** Targets of 8, 6 and 4 all produce the identical distribution —
the digger physically cannot carve further and keep the puzzle uniquely solvable. Asking for 4 gets
you 10.

⛔ **AND THE SHIPPED PUZZLE IS THE EASIEST ONE THE GENERATOR CAN MAKE.** At 16 clues, **100% of
puzzles are solvable by naked singles alone** — "look for a cell with one option, fill it, repeat".
No scanning, no deduction, no technique. That is why it has never felt like a real sudoku. It is not
your imagination and it is not the presentation.

**The usable range is therefore 16 → 10, and it yields about THREE distinguishable rungs, not ten:**

| | clues | what it feels like |
|---|---|---|
| easy | 16 (today) | scan and fill, no technique |
| medium | 12–14 | mostly scanning, occasional real deduction |
| hard | target 8 → realises ~10 | a quarter need hidden singles, ~7% need a guess |

⛔ **SO A 30-STAGE LADDER CANNOT BE BUILT ON CLUE COUNT.** Thirty stages need thirty rungs, and this
dial has three. Anything more has to come from somewhere else.

## 4. Where else difficulty could come from — and the one that is closed

- **The clock.** Free, works today, scales smoothly, and is the only lever with thirty distinguishable
  settings in it. Stage 1 gives you 5 minutes, stage 30 gives you 45 seconds. Costs nothing on the
  wire in the arcade.
- **Grid size (9×9).** ⛔ **CLOSED, AND NOT FOR THE REASON S173 THOUGHT.** It listed 9×9 as "a real
  feature, not a constant". It is worse: `fillSolution` hardcodes `shuffle([1, 2, 3, 4, 5, 6])`, and
  more importantly **the six digits ARE the six SparkTypes** — `SPARK_COLORS` has exactly six
  entries and the numeral is drawn in the spark's own colour. A 9×9 needs nine digits, which needs
  three new spark colours, which is a change to the core alphabet of the whole game. **This is not a
  sudoku decision, it is a SPARK decision, and I do not think you want to make it for a minigame.**
- **Number of puzzles per stage.** Three in a row before the stage clears — a stamina lever rather
  than a difficulty one, and it stacks with either of the above.

## 5. "Leaderboards for the first…" — already designed in, costs nothing later

This was built this session as part of the shared-board work, before the ladder exists:

- the client addresses a board by an **opaque string id** — `'nonet'` today, `'nonet:s07'` for a
  stage, no code change;
- the server table has **`board` as a COLUMN**, not a table name, with the ranking index already on
  `(board, ms, at)`.

So thirty boards is thirty values in one column. **Adding it later would have been a migration on
live data plus a client that handles both shapes; adding it now cost one parameter.**

## 6. What a ladder would cost to build

**Arcade-only — cheap, and where you were actually playing:**

- `arcadeRun.ts` gains a stage index and a `STAGE_CLEARED → next puzzle` arm (today `RUNNING` has
  exactly one exit).
- `main.ts`'s solve handler currently nulls the puzzle; it would mint the next stage instead.
- a stage indicator in the overlay, and a per-stage clue count / clock passed into `makeArcadeNonet`.
- **`PROTOCOL_VERSION` cost: ZERO.** Nothing in the arcade is synced or hashed.

**In-match — categorically different, and I would advise against it:**

- ⛔ `sudokuFiredThisMatch` is a **once-per-match latch**. A ladder inside a match contradicts the
  shipped rule head-on. That is your call, not a refactor.
- ⛔ `world.sudoku` is **hashed**, and `save.ts:1455` regenerates the puzzle **from the seed alone**.
  If a stage changes the clue count, the difficulty must reach the peer or the two sides render
  **different boards from the same seed** — a silent divergence, the dangerous half. That means a
  required new serialized field ⇒ **`PROTOCOL_VERSION` 46 → 47**, a six-site edit, and every peer on
  the old build is refused.
- The four-sites law applies: factory + serialize + hash + worker.

---

## ⭐ SUPERSEDED IN PART — R182-H AND R182-G HAVE ANSWERED SOME OF THIS

Two rulings landed after this note was written, and they close several questions below.

**R182-G — ranking is by AVERAGE, and puzzles stay RANDOM.** The fixed-seed stage ladder this
document was written to cost out is **withdrawn**. Difficulty variance washes out over a mean, so
random generation is fair without it. Questions 1, 4, 5, 6, 7 and 9 below are moot.

**R182-H — difficulty will be ADAPTIVE to a player's average, and is DEFERRED until logins exist.**
> *"Players that reach an average scoring of less than a minute should have more difficult games.
> So as long as players don't have their own accounts and don't log in, we don't know how good the
> player is... we won't implement it just yet."*

That closes questions 2 and 3: the lever will be the existing clue-count dial, and a bigger grid is
off the table (nine digits would need nine spark colours; the game has six).

⚠ **The measurement in §3 is still the live, load-bearing part of this document** — it is what says
the dial has three usable rungs rather than thirty, and it is what whoever opens R182-H will need.

---

## ⛔ THE EIGHT OPEN QUESTIONS (historical — see above for which survive)

You were told eight questions were open and never shown them. They are real — they are §4 of
`.claude/plans/S173_NONET_STAGES.md`, written in S173 and carried through four handoffs as a number
with no list attached. Here they are, with what I now know folded in.

1. **Arcade only, or in-match too?** The whole cost difference. Arcade is free of the wire; in-match
   means a protocol bump and overturning the once-per-match rule. *(My recommendation: arcade only.)*
2. **What gets harder per stage?** ⚠ **The measurement narrows this a lot.** Clue count gives you
   three rungs, not thirty. Realistically: the clock, or clock + clue count together.
3. **A bigger grid — on the table at all?** ⛔ **I would now say no.** It needs nine digits and SPARK
   has six colours; see §4.
4. **Ten stages then what?** Does stage 11 begin a new harder band (bands forever), or does the run
   *end* at ten with the harder level as a separate unlocked mode? You said "ten of the first, then
   ten of the second, then ten of the third" — that reads as three bands of ten, but it does not say
   what stage 31 is.
5. **What does failing a stage do?** Run over, or retry it? Does the clock keep running across stages
   (one total time) or reset each stage?
6. **What does the high-score board MEASURE now?** Today it is one time for one puzzle. Total time
   for all thirty? Deepest stage reached? A board per stage? *(All thirty are already addressable —
   see §5 — so this is a design choice, not a cost.)*
7. **Does progress persist?** A "furthest stage reached" could live in localStorage beside the board,
   or every run could start at stage 1.
8. **"in parallel with spark"** — read as: its own workstream, not blocking match work. Confirm.

**And one new one the measurement forces:**

9. ⛔ **Should a stage have a FIXED puzzle?** Today the arcade seeds off the wall clock, so no two
   players ever solve the same grid — which makes a shared leaderboard a comparison between
   different puzzles. A stage could pin its seed (stage 7 is always the same grid for everyone),
   which makes its board a real race. The cost is that the grid is memorisable. For a board among
   friends I think a fixed seed per stage is clearly right, but it is your call.
