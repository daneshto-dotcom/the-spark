# NONET AS ITS OWN GAME — THE OPTIONS (T13 · s195/nonet-home · S195, research only, nothing built)

For the owner. Plain words. Every file:line below was read in this tree; every cost is MINE (agent-days, one
agent, including tests and the audit round S182 showed every branch needs). Pick one; a later tree builds it.

## (a) What NONET is today — in ten lines

1. One generator: `src/state/sudoku.ts` — 6×6, boxes 2×3, digits 1–6 drawn as the six SparkType colours.
   `generateSudoku(seed, targetGivens = 16)`. The difficulty dial is the second argument and NOTHING passes it.
2. Measured (S182, `NONET_STAGE_LADDER.md`): at 16 clues 100 % of puzzles fall to "find the cell with one
   option"; the floor is ~10 clues; the dial has about THREE real rungs (16 / 12–14 / ~10). 9×9 is closed — nine
   digits would need nine spark colours.
3. Two ways to reach it, one overlay. MATCH TRIAL (`src/state/sudokuEvent.ts`): a same-shape blob with ≥ 12
   bonds freezes the whole duel, once per match, first solver ×2, everyone else ×0.4, 180 s timeout. Easter egg
   by your ruling (S173: "no NONET anywhere in the codex").
4. ARCADE (`src/render/arcadeOverlay.ts` → `makeArcadeNonet`): click NONET on the ARCADE menu → straight into
   one random puzzle (seed = the wall clock), clock running. That drop-straight-in is what you called wrong.
5. After a solve: `src/render/arcadeRun.ts` RUNNING → ENTER INITIALS → RECAP (the averaging cinematic) → BOARD.
6. The board is SHARED and live: Cloudflare Worker + D1 (`server/leaderboard/worker.js`), ranking = AVERAGE time
   across all your runs (R182-G), identity = three typed letters, board revealed only after you submit. The board
   id is a COLUMN on the server, so a second board (a stage, a day) is a string, not a migration.
7. Presentation: `src/render/sudokuOverlay.ts` (960 lines, lazy chunk) — jewel cells, gold frame, the kami and
   owls as webm/webp off-bundle in `public/art/nonet/` (2.2 MB), the theme `public/audio/nonet-theme.ogg` (1.2 MB),
   procedural SFX (`nonetJuice.ts`), fireworks (`nonetCelebration.ts`). Input is pointer + keyboard only — no
   on-screen number pad, so touch players cannot enter a digit.
8. No modes, no levels, no campaign, no daily, no settings, no profile, no PvP. The 30-stage fixed-seed ladder was
   WITHDRAWN by R182-G (the average makes random puzzles fair); adaptive difficulty is DEFERRED on identity (R182-H).
9. SHARED between the match trial and anything standalone: `sudoku.ts`, `sudokuOverlay.ts` (+ juice, celebration),
   `audioManager.ts` `enterNonetRealm/exitNonetRealm`, the art + theme files, and `main.ts` glue (`:784-807`
   construction, `:2877-2915` solve handler, `:3844` `modalUp`, `:4240-4275` render + music edge).
10. ⛔ The match trial HASHES the whole event: `stateHashFull.ts:586` is `JSON.stringify(world.sudoku)`, which
    INCLUDES the generated puzzle. So changing the generator's default output (default clue count, fill order,
    box shape) is a cross-sim divergence AND a protocol bump. A standalone game must call the generator with ITS
    OWN arguments and leave the single-argument match call (`sudokuEvent.ts:119`, `save.ts:1889`) byte-identical.

## (b) The options

Cost scale: 1 agent-day ≈ one cloud tree's full day including tests + one audit round. All options keep the match
trial reachable and unchanged unless a row says otherwise. Protocol bump: NONE for A–C (nothing crosses the wire).

### Option A — "A front door" (smallest honest fix)
- **Player sees:** click NONET → a NONET home page in the arcade's skin (glowing title, living backdrop, the kami
  art as the hero): PLAY (timed run, exactly today's), DAILY (one fixed puzzle per UTC day, same for everyone,
  its own board), ZEN (no clock, no board), RANKING (today's average board), BACK.
- **Reused as-is:** `arcadeRun.ts`, `arcadeScores.ts`, `arcadeLeaderboard.ts` + worker (board ids `nonet`,
  `nonet:d20261005`), `sudokuOverlay.ts` through its `override` seam, `uiSkin.ts`/`uiSkinButton.ts`/
  `uiScreenChrome.ts` (a `ScreenAccent` for NONET), `titleBackdrop.ts`, `buttonFeedback.ts`.
- **New:** `src/nonet/homeScreen.ts` (one menu overlay, modelled on `arcadeOverlay.ts`), a daily-seed function
  (UTC date → seed, pure, tested), a `mode` field on the run so ZEN skips the board.
- **Cost:** 2–3 days. **Risk to the match trial:** none — no shared module changes; the arcade row's `onSelect`
  opens the home instead of minting a puzzle.
- **Verdict:** the floor. Do this even if nothing else is picked; it is what "home page" literally asked for.

### Option B — "Home + campaign" (RECOMMENDED now)
- **Player sees:** A, plus CAMPAIGN: three bands × ten stages (your S173 "ten stages, then a harder level").
  A stage = `{clueTarget, puzzlesInARow, clockSeconds, fixedSeed}`. Band 1 = 16 clues, band 2 = 13, band 3 = 10
  (the three rungs that exist); inside a band the clock tightens and puzzles-per-stage grows 1 → 3, which is where
  the other 27 distinct steps honestly come from. A stage is cleared under the clock; fail = retry that stage;
  stars (1–3) by time, like Puyo Puyo Tetris 2's star thresholds. Progress saved on the device
  (`spark.nonet.progress.v1`, the `displayPrefs.ts` try/caught pattern). Each stage has its own average board
  (`nonet:s07`), so "leaderboards for the first ten" is free.
- **Reused:** everything in A. The difficulty dial is finally passed — IN THE ARCADE CALL ONLY (`makeArcadeNonet`
  gains a `targetGivens` argument; the match call stays `generateSudoku(seed)`, pinned by a test).
- **New:** `src/nonet/campaign.ts` (the 30-stage table as DATA + pure `nextStage`/`stars` fns), a
  `STAGE_CLEARED → next puzzle` arm in `arcadeRun.ts` (today RUNNING has one exit), a stage/star strip on the home,
  a `main.ts` solve-handler branch that mints the next puzzle instead of nulling (`:2898-2901`).
- **Cost:** 5–7 days (A included). **Risk:** the `arcadeRun.ts` arm and the `main.ts` branch are shared glue —
  one bad edit breaks the existing timed run, not the match trial; `arcadeRun.test.ts` (21) + a new "match call
  is still single-argument" test are the guards. ⚠ R182-H said do not wire the dial until identity exists —
  that ruling was about ADAPTIVE difficulty on an average board. A fixed per-stage clue count with its own board
  per stage does not collide with R182-G (everyone on stage 7 draws the same distribution). Your call to confirm.
- **Verdict:** recommended. It is what you described, it uses the measurement instead of fighting it, and if it
  is built in a `src/nonet/` folder with one mount call from `main.ts`, Option C becomes a move, not a rewrite.

### Option C — "Its own page: /nonet/ (the Steam path)"
- **Player sees:** `spark-online.space/nonet/` — a standalone page with its own title, home, campaign, daily,
  ranking, settings, profile (name now, Steam later). The arcade row becomes `href: '/nonet/'` (one line —
  Pitch Masters already launches this way, `arcadeOverlay.ts:78`).
- **Reused:** the exact pattern that exists: `src/arcade/pitchMasters/vitePlugin.ts` builds a second page as its
  OWN Vite pass so SPARK's index chunk stays byte-identical and the bundle charter is untouched. The page imports
  `sudoku.ts`, `sudokuOverlay.ts`, the fx substrate, uiSkin, arcade* and the worker client BY PATH — imports,
  never edits.
- **New:** `nonet/index.html`, `src/nonet/page.ts` (its own Pixi `Application`, no `World` — the overlay's
  `render(world, override)` needs a `World` today, so a tiny stub or an overlay signature change is owed; the
  latter is a shared-module edit), settings (volume, effects HIGH/LOW via `fxRuntime`), an on-screen number pad.
  Later: Electron + Steamworks (GemShell / steam-electron-build / steamworks.js — all wrap an HTML5 game and give
  overlay, achievements, cloud saves, leaderboards).
- **Cost:** 8–12 days on top of B's content (B's screens move, the page shell + settings + pad are new).
- **Risk:** the one real hazard is editing `sudokuOverlay.ts` "for the page" — every edit there is live in a
  match. Rule for the brief: the page adapts to the overlay, not the other way; any overlay edit ships with the
  13 overlay tests green AND the e2e `zones-visual` arcade spec.
- **Verdict:** right destination, wrong first step. Build B in a folder shaped for this.

### Option D — "Ranked PvP first"
- **Player sees:** RANKED: find an opponent, same puzzle, first to solve wins, a rating climbs.
- **Reused:** Trystero rooms (`net/transport.ts` pattern) or Pitch Masters' transport-agnostic `matchmaker.ts`
  (elder-hosts pairing, tested over an in-memory bus); the worker for ratings (new table).
- **Cost:** 6–9 days for a 1v1 race with a win/loss ladder; rating (Glicko-2 as TETR.IO uses) needs identity.
- **Risk:** cheating is trivial without a server-held solution and a trusted clock; identity is three letters.
- **Verdict:** not first. See (c) for the cheap honest versions that A/B already give you.

## (c) PvP / competitive — what "like Tetris 99" means for a sudoku

Tetris 99 is 99 players, garbage attacks, a targeting wheel, badges for KOs, Team Battle, Invictus unlocked by a
win, daily missions for theme tickets, Maximus Cup events. Tetris Effect: Connected is Journey (27 stages in 7
areas) + 17 Effect Modes + Zone Battle / Score Attack 1v1 (ranked, friend, local) + 3-player co-op vs bosses.
Puyo Puyo Tetris 2 adds a JRPG-shaped Adventure, star thresholds per stage, and four ranked leagues.

⚠ The honest difference: a sudoku has NO ATTACK CHANNEL. Nothing you do on your grid can land on mine. Every
sudoku PvP that exists (Sudoku Clash, GridPuzzle, Sudoku Friends, Sudoku2gether) is one of two things: a RACE
(same puzzle, separate boards, first to finish) or TURNS on one shared board. Sudoku Clash's ladder is Bronze →
Diamond, re-evaluated every 25 games on win rate, with daily challenges on one shared puzzle.

Cheapest to most expensive, all honest:
1. **Daily race (asynchronous, zero netcode)** — one fixed seed per UTC day, everyone solves the same grid, a
   board per day. This is the NYT/Wordle shape (same puzzle for the world, streaks, "I did it in 1:03"). Free with
   Option A. Cheating exposure is the same as today's board.
2. **Live race, 2–4 players** — a Trystero room, host mints one seed, every peer regenerates the grid (the
   match trial ALREADY does exactly this: `startSudoku` + seed on the wire + `submitSudokuSolve` first-valid-wins).
   Add the one thing the S93 PDR left out of scope: mirror each rival's FILLED-CELL COUNT as a progress bar, so
   it feels like a race. 3–4 days on top of B. No rating — a win/loss tally per name.
3. **"NONET Royale" (rounds + elimination)** — N players, each round a fresh shared seed, slowest finisher out,
   clue count drops a rung each round. The battle-royale FEEL with the three rungs we have. SPARK rooms are capped
   at 4 seats (R41) — so 4-player royale, not 99. Same netcode as 2, plus a round state machine. +2–3 days.
4. **Rated ladder** — Glicko-2 or Sudoku Clash's win-rate league. Blocked on identity (R182-H's blocker), which
   is the Steam-login dependency. Do not build before C.

A sudoku "attack" is possible later (a correct box lob-locks one of the rival's cells for 10 s) but it is new
design, not what you have, and I would put it after the royale shows the race is fun.

## (d) Open questions for you — each with my recommendation

1. **Inside SPARK's arcade now, or its own page now?** — Inside now (B), built in `src/nonet/` with one mount
   call so C lifts it later. One deploy path, one bundle, your current players find it where NONET already is.
2. **Does R182-H's "do not wire the dial" allow a FIXED per-stage clue count?** — Yes in my reading: the ruling
   defers ADAPTIVE difficulty on a shared average board; a stage board compares players on the same stage.
   Confirm or refuse. If refused, the campaign ladders on clock + puzzles-per-stage only (still 30 distinct).
3. **Fixed seed per campaign stage and per day?** — Yes. Stage 7 is the same grid for everyone, so its board is a
   real race; memorising a 6×6 after a few tries is the price. The timed run stays random (R182-G stands).
4. **What does failing a stage do; does the clock carry across puzzles?** — Retry the stage; the clock is per
   stage, counts all its puzzles; stars by time at 1/2/3 thresholds set per stage in the data file.
5. **Where does progress live before Steam?** — On the device (localStorage, try/caught), labelled "this
   device". No account system invented now; it would be unpicked at Steam login.
6. **First PvP form?** — The daily race (free, in A). Then the 2–4 player live race with progress bars (c.2).
7. **Grid stays 6×6?** — Yes. 9×9 needs nine colours and is a SPARK alphabet decision, not a sudoku one.
8. **On-screen number pad for touch?** — Yes, and it is the ONE shared-module edit I would allow in B, because
   the match trial is equally unplayable on a phone today; additive, with the overlay tests + e2e.
9. **Does the match trial change at all?** — No. It stays the Easter egg; it only shares code. (If you ever want
   "the trial uses band 2 puzzles", that is a wire field + protocol bump — a separate decision.)
10. **Steam wrapper when?** — After C exists and has been live a while. GemShell / steam-electron-build wrap an
    HTML5 game with overlay, achievements, cloud saves; the page must be self-contained first, which C ensures.

## (e) Sources

Code read in this tree (never edited): `src/state/sudoku.ts`, `src/state/sudokuEvent.ts`, `src/render/sudokuOverlay.ts`,
`arcadeOverlay.ts`, `arcadeRun.ts`, `arcadeRunOverlay.ts`, `arcadeScores.ts`, `arcadeLeaderboard.ts`, `nonetJuice.ts`,
`nonetCelebration.ts`, `audioManager.ts:860-1000`, `main.ts` (lines cited), `save.ts:1303,1884`, `stateHashFull.ts:178,586`,
`server/leaderboard/*`, `src/render/fx/*`, `uiSkin.ts`, `uiSkinButton.ts`, `uiScreenChrome.ts`, `titleBackdrop.ts`,
`src/arcade/pitchMasters/{vitePlugin,page,matchmaker,lobby3}.ts`, `pitch-masters/index.html`, `vite.config.ts`.
Rulings/plans: S93 PDR (`plans-archive/2026-06-19_PDR_S93_NONET_SUDOKU_COMPLETED.md`), `S173_NONET_STAGES.md`,
`NONET_STAGE_LADDER.md` (S182 measurement), `branch-briefs/06-arcade.md`, `SPARK_CANON.md` §9 (R182-G/H),
`S194_OWNER_RULINGS.md` R194-24/25.
Web (search snippets; `tetris.wiki`, `wikipedia.org`, `play.google.com` were blocked by the egress proxy — environment,
not a flake — so Tetris detail is from the sources below):
- Tetris 99 modes, Invictus, daily missions, Team Battle: https://www.shacknews.com/article/113771/tetris-99-gets-new-invictus-mode-daily-missions-in-20-update-tomorrow · https://www.engadget.com/2019-12-11-tetris-99-team-battle-mode.html · https://www.nintendolife.com/news/2019/09/tetris_99_is_being_updated_to_version_2_0_includes_more_modes_and_dlc
- Tetris Effect: Connected modes: https://gamefaqs.gamespot.com/pc/296457-tetris-effect-connected/faqs/78800/multiplayer · https://www.shacknews.com/article/108436/tetris-effect-gameplay-all-areas-in-journey-mode · https://www.tetriseffect.game/
- Puyo Puyo Tetris 2 Adventure / Skill Battle / Leagues: https://www.gematsu.com/2020/10/puyo-puyo-tetris-2-details-skill-battle-online-modes · https://www.nintendolife.com/news/2020/09/sega_shares_details_on_puyo_puyo_tetris_2s_adventure_mode_and_pre-order_bonus · https://puyonexus.com/wiki/Puyo_Puyo_Tetris_2
- Sudoku.com (Easybrain): daily challenges, seasonal events, six levels, tournaments: https://easybrain.com/sudoku · https://sudoku.com/challenges
- Sudoku PvP apps: https://play.google.com/store/apps/details?id=com.sudokuclash.sudoku_clash · https://gridpuzzle.com/multiplayer · https://www.sudokufriends.io/ · https://sudoku2gether.com/en/multiplayer-sudoku
- TETR.IO Tetra League (Glicko-2), Quick Play, Zen: https://tetrio.github.io/faq/mechanics.html · https://harddrop.com/wiki/TETR.IO · Jstris: https://jstris.jezevec10.com/guide
- Daily-puzzle psychology (same puzzle for everyone, streaks): https://innotechinsider.com/gaming/nyt-strands-micro-puzzles-gaming-attention-economy/ · https://quizrebel.com/blog/wordle-psychology-daily-streaks.html
- Open-source sudoku difficulty by TECHNIQUE, not clue count: https://github.com/AImenes/sudokUI · https://f-droid.org/en/packages/org.secuso.privacyfriendlysudoku/ · https://gitlab.com/opensudoku/opensudoku
- HTML5 game → Steam: https://github.com/alexanderthurn/steam-electron-build · https://gemshell.dev/ · https://liana.one/integrate-electron-steam-api-steamworks
