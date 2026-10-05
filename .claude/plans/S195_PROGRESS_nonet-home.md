NEXT STEP: Lane 3 — web research (Tetris 99/Effect, Puyo, sudoku apps, open-source) with WebSearch/WebFetch; then write S195_NONET_HOME_OPTIONS.md.

# S195 PROGRESS — s195/nonet-home (T13, research only, no src edits, no gates)

- Lane 1 (NONET as it is): DONE — findings below
- Lane 2 (what to carry): DONE (code read) — findings below
- Lane 3 (puzzle-game research): IN PROGRESS
- Deliverable `.claude/plans/S195_NONET_HOME_OPTIONS.md`: NOT STARTED

## Lane 1 findings (read from the tree, nothing edited)

Two NONETs share one generator and one overlay:
- MATCH TRIAL: `src/state/sudokuEvent.ts` — `detectNonet` fires on a same-type component with >= 12 BONDS
  (`NONET_CONNECTOR_COUNT`), once per match (`world.sudokuFiredThisMatch`), freezes the duel, host-authoritative,
  ×2 winner / ×0.4 others, 180 s timeout. Wire: only seed/startTick/triggeredBy/solvedBy/resolvedTick (`save.ts:1303`,
  regenerated at `:1884`), `SUDOKU_SOLVED` intent (`world.ts:410,1061`; protocol allowlists :2012/:2076).
  HASHED: `stateHashFull.ts:178,586` — `JSON.stringify(world.sudoku)` INCLUDES `puzzle` → any change to
  `generateSudoku`'s default output, shape or clue count is a cross-sim divergence AND a protocol bump.
- ARCADE: `arcadeOverlay.ts` `makeArcadeNonet(seed)` (seed = `performance.now()`), render-state only, handed to
  `SudokuOverlay.render(world, override)` (`sudokuOverlay.ts:666`). `arcadeRun.ts` phase machine RUNNING →
  ENTER_INITIALS → RECAP → BOARD (wall clock). `main.ts:784-807` constructs, `:2877-2915` solve handler (arcade checked
  FIRST), `:4240-4275` render + realm audio edge, `:3844` `modalUp` includes the run.
- Generator `src/state/sudoku.ts`: 6×6, 2×3 boxes, digits = the six SparkType colours, `SUDOKU_DEFAULT_GIVENS=16`,
  `targetGivens` param exists and NOTHING passes it (R182-H: deferred on identity). Measured S182
  (`NONET_STAGE_LADDER.md`): floor ~10 clues; 16 = 100% naked singles; ~3 usable rungs (16 / 12-14 / ~10). 9×9 closed
  (six colours). Difficulty beyond that = the clock, puzzles-per-stage.
- Leaderboard: `arcadeScores.ts` (sum+count, `TOP_N=25`, 3-char name = identity), `arcadeLeaderboard.ts`
  (Local + Remote tiers, `VITE_LEADERBOARD_URL`), backend `server/leaderboard/worker.js` (Cloudflare Worker + D1,
  board id is a COLUMN, floor 15 s / ceiling 1 h, 40 runs per 10 min per IP). R182-G: ranking = AVERAGE; board
  revealed only after submit. R182-H: adaptive difficulty DEFERRED on identity (Steam/Google login).
- Presentation: `sudokuOverlay.ts` (960 lines, lazy chunk) + `nonetJuice.ts` (procedural SFX) + `nonetCelebration.ts`
  (fireworks); art off-bundle `public/art/nonet/` (2.2 MB: bg.webm + kami/owl-a/owl-b/moss-b webm+webp + masks);
  music `public/audio/nonet-theme.ogg` (1.2 MB) via `enterNonetRealm`/`exitNonetRealm` (`audioManager.ts:941`).
  Input: pointer tap + keyboard only (`:405-406`) — no on-screen number pad (mobile gap).
- Rulings: S93 PDR (D1 6×6, D2 freeze, D3 resume, D4 trigger), R132 (9→12), R159 (>=12 bonds), S106 (0.4),
  S173 codex: "NONET is an Easter egg, not in the codex", R182-G/H, R194-24 (menu restyle OK, game untouched),
  R194-25 (own game + home screen). Owner S173: "STAGES … beat ten stages, then a harder level". 30-stage ladder
  WITHDRAWN by R182-G (average makes random puzzles fair).
- Tests: sudoku 12, sudokuEvent 32, sudokuOverlay 13, arcadeOverlay 14, arcadeRun 21, arcadeRunOverlay 16,
  arcadeScores 28, arcadeLeaderboard 40, worker 29, juice 11, celebration 7, uiSkinReach.arcade 3.
  e2e: only `zones-visual.spec.ts` "ARCADE … launches NONET" (@visual).

## Lane 2 findings (what to carry)
- Second-page pattern EXISTS: `src/arcade/pitchMasters/vitePlugin.ts` builds `/pitch-masters/` as its OWN Vite pass
  so SPARK's index chunk is byte-identical (bundle charter untouched). A `/nonet/` page can copy it 1:1.
- Reusable as-is: fx substrate (`fx/emitter.ts` pure, `fxLayer.ts`, `fxRuntime.ts` installFx/bloom/shockwave,
  `softTextures.ts`), `uiSkin.ts` (skinButtonFx/skinPanelFx/skinIcon), `uiSkinButton.ts`, `uiScreenChrome.ts`
  (ScreenAccent + glowTitleStyle + LazyScreenBackdrop), `titleBackdrop.ts` (lazy), `buttonFeedback.ts`, `textFit.ts`,
  `displayPrefs.ts` pattern (try/caught localStorage), arcadeRun/arcadeScores/arcadeLeaderboard + worker.
- Needs new: home/menu screen, level/campaign data + progress store, stage-run state machine arm, settings page,
  any PvP room (Trystero via `transport.ts` pattern or PM `matchmaker.ts` seniority pairing — transport-agnostic,
  tested over an in-memory bus), on-screen number pad, identity.
- Pitch Masters lessons: HTML loading screen with progress bar (`pitch-masters/index.html`), URL flags for tests
  (`?autoplay ?seed ?quickmatch ?host ?join=CODE`), friend code (5/6 letters), elder-hosts rule, star-not-mesh.
