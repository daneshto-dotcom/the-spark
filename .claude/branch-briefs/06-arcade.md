# BRANCH 6 — `s182/arcade`

Three items. One of them is **SPARK's first server-side dependency ever**, so read that section fully
before you touch anything.

---

## ITEM 1 ⛔ — THE SHARED LEADERBOARD

> *"I don't see anyone else's records on the arcade, on NONET, on the Sudoku. My friend played it and
> he put his name on and he got first place. Now I did my shit and I got first place. Who the fuck is
> first place? I can't even see his name. It should be just like an old arcade thing. You put your
> name, you see any other names that hit records, and the last ten places, twenty five names. It
> should be saved in a database."*

### The current state — confirmed, and worse than "not shared"

`src/render/arcadeScores.ts:50` — `STORAGE_KEY = 'spark.arcade.nonet.scores.v1'`, read at `:149`,
written at `:170`. The docblock at `:34` states it outright:
> *"localStorage, per browser profile — the arcade is a local high-score table, not an account system."*

`loadScores` returns `[]` when the key is absent, and **nothing seeds a default board**. So a fresh
profile shows an empty table and the first run committed is always `1ST — NEW RECORD`
(`arcadeRun.ts:184`). **The owner and his friend each hold a private board of one row. Neither can
ever appear on the other's, and neither can ever be beaten.**

⚠ **Tell him plainly: his friend's first-place time is unrecoverable.** It lives in a localStorage key
on his friend's browser. Unless the friend replays after this ships, it is gone.

**Persisted today:** name (3 chars, `normaliseName`-clamped), `ms`, `at`. Capped at `TOP_N = 25`
(`:42`). **Not persisted:** anything cross-device, and any run that missed the cut — `recordRun` only
saves when `onBoard` is true (`:188`).

### ⛔ THERE IS NO BACKEND IN SPARK. THIS IS THE FIRST ONE.

Confirmed empirically: every `fetch()` in `src/` is a same-origin static asset (audio and atlas
manifests). The only socket is `net/relayProbe.ts:117`, a WebRTC signalling probe. `public/CNAME` is
`spark-online.space`; `deploy.yml` publishes a static artifact to GitHub Pages. **There is no server
of any kind.**

⚠ **And there is no prior research to build on.** The owner believed a previous session had studied
this. An exhaustive grep across every handoff, plan archive, backlog and `LOCKED_DECISIONS.md` found
**nothing**. What it did find: the arcade board was built in S150 **over the objection of both Council
seats**, escalated to the owner, and kept on his word — and **nobody in that PDR asked where the
scores would live.** localStorage was assumed, never decided.

### The recommended backend

**Cloudflare Workers + D1.** Numbers as of May 2026 — ⚠ **re-check the pricing page before signing up.**

- Workers free: 100k requests/day (~3M/month), no card. Paid $5/mo for 10M.
- D1 free: 5 GB, **5M row reads/day, 100k row writes/day**.
- **At 100 players: $0. At 10,000 players: still $0** (~600k requests/mo against 3M free).
- ⛔ **NOT Workers KV** — its free tier is **1,000 writes per DAY**. A leaderboard write path would
  exhaust that in an afternoon. Use D1 (SQLite) or Durable Objects.
- CORS: write the headers yourself and **pin `Access-Control-Allow-Origin: https://spark-online.space`**,
  not `*`.

> ⛔ **GATE — THE OWNER MUST SAY YES.** This creates an account and a dependency the project has never
> had. If he has not approved it: **build the client against a small interface, ship the local board
> as the implementation behind it, and report.** Do not create accounts on his behalf.

### Scope v1

⭐ **The presentation is already built and it is good.** `arcadeRunOverlay.ts:236-285` already draws
HIGH SCORES, the place line, two columns of 13, and highlights your own row on the full
`(name, ms, at)` triple. **Almost nothing about the screen changes. What changes is where
`run.scores` comes from.** That is the whole feature.

**N = 25** — already `TOP_N`, already his own number from S149 (*"only like top 25 are shown"*), and
the layout is built around it.

**Keep the local board as an offline fallback** so a dead network never costs a run.

### Cheating — say it out loud, do not solve it

A public write endpoint with no accounts means anyone can POST a 0:01. Realistic mitigations
(rate-limiting, plausibility bounds, a server-side minimum time) raise the bar and **none is airtight
client-side.** For a board among friends that is probably fine. **Report the exposure; do not gold-plate it.**

⛔ **AND DO NOT "FIX" THE SUDOKU AUDIO.** A prior analysis argued that the correct/incorrect chirp
lets a player solve by ear and therefore invalidates a timed board. **The owner has overruled that
explicitly:** *"The sound is intentional. You will keep it, and you will ignore A0. That's a whole
thing that I have actually defined."* **Keep it. Do not gate it. Do not raise it again.**

---

## ITEM 2 — SUDOKU CONSISTENCY

> *"We need to fix the whole Sudoku thing too because we have a nice Sudoku, it looked good, but it's
> not consistent."* … *"and make it look cooler."*

Concrete defects, read from code. These are what he felt:

- **SI-2 — the keyboard dies at random.** In `sudokuOverlay.ts`, auto-advance after a digit skips
  givens (`:755`: `findIndex((v,i) => v === 0 && this.givens[i] === 0)`), but the **arrow keys
  (`:763-770`) only clamp the index** and will park the cursor on a **given** cell. Digit entry then
  requires `this.givens[this.selected] === 0` (`:747`), so every keystroke is **silently swallowed**
  and the game reads as frozen. ⚠ Same class as the S149 bug he reported as *"you cant imput anything
  in the box"* — fixed for the arcade seam, never for navigation.
  Secondary: `ArrowRight` from the last column walks onto column 0 of the next row (`+1`, not
  row-clamped), which no grid UI does.
- **SI-3 — the banner lies by 20 points.** `sudokuOverlay.ts:200` and `:565` both read
  *"first to solve · winner x2 · everyone else halved"*, and the loser line at `:656` says
  *"your score halved"*. But `state/sudokuEvent.ts:54` is `NONET_LOSER_MULT = 0.4` — **a 60% cut**,
  changed in S106, copy never followed. Three UI strings assert a number the sim contradicts.
- **SI-4 — the match trial's 180 s timeout is invisible.** `NONET_TIMEOUT_TICKS = 10800`
  (`sudokuEvent.ts:58`), enforced at `:186`. `startTick` is on the event (`sudoku.ts:45`), serialized
  (`save.ts:1079,1456`) — and **never read by the overlay** (`grep startTick src/render/sudokuOverlay.ts`
  returns nothing). Meanwhile the *arcade* has a prominent clock (`arcadeRunOverlay.ts:47`). Same
  puzzle, opposite treatment of time.

Five more were found; enumerate them yourself from the file rather than trusting this list to be
complete. **Fix the copy from the constant** (derive the string, don't retype the number) so SI-3
cannot recur.

**"Make it look cooler"** is genuine scope and deliberately unspecified — he likes the music, the feel
and the art already. Improve presentation without changing the puzzle.

---

## ITEM 3 — THE 30-STAGE LADDER ⛔ **RESEARCH FIRST, THEN ASK**

> *"We have different levels of Sudoku. We had like ten levels of the first level, then ten of the
> second, then ten of the third. We have to start building this. Let's build the first thirty ones.
> So we'll have also leaderboards for the first… because how is it working now? I don't even know.
> Like, we generate a random Sudoku every time. Is there difficulty? We need to rework it a little bit."*

**He asked questions, not for a build.** Answer them from the code before proposing anything:

1. How is a puzzle generated today — random per run, or from a fixed set? Is it seeded, and is the
   seed deterministic across peers?
2. **Does a difficulty parameter exist?** `S180_BACKLOG.md` claims *"difficulty is already a live
   parameter nothing passes"* — **verify that claim, it may be stale.**
3. What would 3 tiers × 10 stages mean for the match event vs the arcade? `S180_BACKLOG.md` notes an
   **arcade-only ladder is free; an in-match ladder needs a wire field** (and therefore a
   `PROTOCOL_VERSION` bump). Confirm both halves.
4. Per-stage leaderboards multiply the board by 30 — how does that change the schema in item 1?
   **Design item 1's table so stage-scoping is a column, not a migration.**
5. `S180_BACKLOG.md` says **eight NONET questions are still open.** Find them and list them.

**Deliverable: a short design note plus the open questions, for the owner.** Build only the parts he
has unambiguously asked for (the shared board, the consistency fixes). ⛔ **Do not invent a difficulty
curve.**

---

## GATES

`typecheck` · `vitest` · `build`. **`e2e:gating` if you touch the overlay's geometry or input.**

## FILE BOUNDARY

**Yours, and they collide with nothing:** `render/arcadeScores.ts` · `render/arcadeRun.ts` ·
`render/arcadeRunOverlay.ts` · `render/arcadeOverlay.ts` · `render/sudokuOverlay.ts` ·
`state/sudokuEvent.ts` · `state/sudoku.ts` · any new worker/backend directory.

⭐ **This is the most isolated branch in the split.** You should hit zero merge conflicts.

## REPORT BACK

Whether the backend gate was approved or you shipped behind the interface; the real free-tier numbers
you verified (not the ones in this brief); the full enumerated Sudoku defect list; and the answers to
his five ladder questions, written for him rather than for a developer.
