# NONET — everything that was wrong with the sudoku, and what happened to it

> *"We need to fix the whole Sudoku thing too because we have a nice Sudoku, it looked good, but it's
> not consistent."* … *"and make it look cooler."*

You asked to be **told** the list. It existed only inside a commit message, which is not somewhere
you read. This is the list.

Eleven items. **Seven are fixed**, **two you have ruled on** (difficulty, and the chirp), and **two**
are decisions still waiting on you.

---

## FIXED — the "not consistent" ones

### 1. The keyboard died at random ⛔ *the big one*

**What you felt:** you'd be typing digits and the game would just stop accepting them. No sound, no
flash, nothing. It looked frozen.

**What was actually happening:** the arrow keys moved the cursor by pure arithmetic, so they could
park it on a **clue** — one of the numbers printed at the start. Typing a digit is only allowed on an
empty cell, so every keystroke after that was silently thrown away. The board looked perfect and did
nothing.

⚠ **This is the same bug you reported once already**, in S149: *"you cant imput anything in the box."*
That was fixed for the arcade, and the identical symptom reached through the arrow keys was left live
for 33 more sessions.

**Fixed:** a move now lands on a cell you can actually type in, or it doesn't happen at all.

### 2. The cursor jumped to the other side of the board

Arrow-right from the last column wrapped onto column 0 of the *next row down*. No grid anywhere
behaves like that. **Fixed:** left/right stay on their row, up/down stay in their column.

### 3. Filling a cell threw the cursor back to the top-left

After typing a digit, the game jumped to the *first* empty cell in the whole grid — so filling
something near the bottom sent you back to the start. **Fixed:** it advances forward from where your
hand already is.

### 4. Arrow keys scrolled the page underneath

Every other key in that screen suppressed the browser's default; the arrows didn't. **Fixed.**

### 5. ⛔ The banner lied to you by 20 points

The screen said **"everyone else halved"** in three places, and told the loser **"your score
halved."** The real number has been a **60% cut** since S106 — the multiplier changed, the words
never did. So the screen that exists purely to explain the stakes has been misstating them for 76
sessions.

**Fixed, and fixed so it can't come back:** the text is now *generated from* the multiplier instead of
typed next to it. Retyping "60" would have bought one session of correctness and re-armed the same
trap. There was a fourth copy in a code comment; that's corrected too.

### 6. ⛔ The 180-second timeout was invisible

A match NONET freezes the entire duel and gives everyone 3 minutes. That countdown was **never shown
anywhere.** The data was on screen's doorstep the whole time — recorded, sent to every player,
rebuilt on every machine — and no part of the display ever read it.

Meanwhile the **arcade** — same puzzle, played alone, with no time limit at all — has a big clock at
the top. Same puzzle, opposite treatment of time. **Fixed:** the match now has a countdown, in the
same place and the same style as the arcade's clock, turning red under 30 seconds.

### 7. The same run could be recorded twice

Only reachable through a retry, but under the new average system a double-count doesn't just add a
stray row — it permanently skews your average. **Fixed:** recording the same run twice is now a no-op.

---

## ⛔ RULED BY YOU — recorded, not built

### 8. Difficulty will be ADAPTIVE, and it waits for logins *(R182-H, S182)*

> *"The difficulty should be adapted to a player's scoring. So players that reach an average scoring
> of less than a minute should have more difficult games. So as long as players don't have their own
> accounts and don't log in, we don't know how good the player is — we only record them by name in
> our leaderboard. So we will keep it for later as the subject to open up. It's good that the
> difficulty dial exists, but we won't implement it just yet."*

**Nothing was built.** The dial stays where it is, untouched and unturned.

For the record, so it is not re-derived: at the clue count that ships, **100% of puzzles fall to
"find a cell with only one possible answer, fill it, repeat"** — measured against the real generator
across 300 puzzles per setting. That is the easiest class it can produce, and it is why NONET has
never felt like a real sudoku. The dial has three usable rungs, not thirty; full numbers in
[NONET_STAGE_LADDER.md](NONET_STAGE_LADDER.md).

⭐ **The blocker is identity, not the dial.** "This player averages under a minute" needs to know who
the player *is*, and today that is three typed characters anyone can borrow — so the rule would
regularly hand a hard grid to whoever typed `DAN` next. It unblocks with a Steam or Google login.

⚠ **And one thing worth having in hand before you open it:** adaptive difficulty collides with the
average ranking you just specified. That ranking is fair *because* every player faces the same spread
of random puzzles — the variance washes out over enough runs. If good players start getting harder
grids, they post slower times and drift **down** a table still comparing raw averages, so improving
makes you rank worse. Whoever picks this up has to answer the ranking question at the same time
(weight times by difficulty, or run a board per tier). It is not a one-line change once identity
exists — that part I got wrong earlier and it's better said now than discovered then.

### 9. The correct/incorrect chirp

An earlier analysis argued the per-cell sound lets someone solve by ear, making a timed board
meaningless. You overruled it: *"The sound is intentional. You will keep it, and you will ignore A0.
That's a whole thing that I have actually defined."*

**It is untouched and will stay untouched.** Noted here only so nobody raises it a third time.

---

## ⚠ WAITING ON YOU — two decisions I won't make for you

*(The difficulty question that used to be here is **answered** — see the RULED section below.)*

### 10. The loser line names a seat, not a player

It says *"player 2 solved it"* rather than using their name and colour. Another branch in this
session owns player identity and labels, so changing it here would collide. **Flagging, not fixing.**

### 11. NONET appears nowhere in `SPARK_CANON.md`

The canon is the document that answers *"is X still in the game, and what are its numbers?"* — and a
whole live subsystem you actively play isn't in it. That's how the "halved vs 60%" drift survived 76
sessions: there was nothing pinning the number to the words.

**Recommend:** a short NONET section with its load-bearing constants and a test pinning each one, the
same way the rest of the canon works. Not done here because `SPARK_CANON.md` is near-certain to be
edited by another branch in this session, and two branches editing the canon is a guaranteed conflict.

---

## "Make it look cooler" — what landed

Deliberately **presentation only, never the puzzle**:

- the **countdown clock** in match NONETs (defect 6) — a real instrument where there was nothing;
- it **turns red** in the last 30 seconds, so the pressure is visible rather than a surprise;
- the same plate and position as the arcade clock, so the two modes read as one family instead of two
  different games.

⚠ **This is the smallest of the three items and I want to be straight about that.** "Cooler" is
genuinely unspecified and everything above is a fix rather than a flourish. Tell me what you want it
to *feel* like — richer art, animation on a solve, a better grid, sharper colour — and it's its own
piece of work rather than something I guess at.
