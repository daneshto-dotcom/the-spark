# S196 PROGRESS — tree ui-5 (branch s196/ui-5)

## NEXT STEP (top, always current)
DONE — awaiting the independent audit. Nothing in flight.

## FINAL REPORT (s196/ui-5)
- **Tip**: see `git log -1` (this commit). Merged master dfbb5cb5 (plans only, no conflicts).
- **TASK 1 — click offset: ROOT CAUSE.** index.html styles the canvas `max-width/max-height: 100%; object-fit: contain`.
  Whenever the window is not exactly 16:9 (half screen, any browser toolbar eating height, a 5:4 or portrait monitor),
  the canvas' CSS box gets one axis capped and the picture is drawn letterboxed inside it. `Controls.updateCursor` was
  letterbox-aware (S39), but Pixi 8's `EventSystem.mapPositionToPoint` scales each axis over the whole box and never
  subtracts the bar — so every Pixi `eventMode='static'` control (castle panel rows / shape-pull slots / build tiles,
  title, codex, draft, bot setup, race picker, exit, match board, lobby) was offset. At 1920x1080 — the only e2e
  viewport ever used — the two formulas agree, so no test saw it.
  **FIX (one function)**: `src/input/pointerMapping.ts` `clientToCanvas` + `installLetterboxPointerMapping(app)` patches
  this renderer's `events.mapPositionToPoint`; Controls calls the same function. DPR-independent by construction.
  **BEFORE/AFTER** (`e2e/click-offset.spec.ts`; full tables in `.claude/plans/S196_ui-5_click-offset-{BEFORE,AFTER}.txt`):
  | window (same at DPR 1/1.25/1.5/2) | BEFORE Pixi offset at castle panel | BEFORE castle hits | AFTER |
  |---|---|---|---|
  | 1920x1080 | 0 | 4/4 | 0 px, 4/4 |
  | 960x1080 (half screen) | y -54..-249 px | 0/4 | 0 px, 4/4 |
  | 1366x768 (16:9) | 0 | 4/4 | 0 px, 4/4 |
  | 1920x947 (browser toolbar) | **x +82..+92 px (player must aim LEFT)**; 6 px outside the panel still hovered a row | 2/4 (both pull slots missed) | 0 px, 4/4, near-miss not hovered |
  | 2560x1440 | 0 | 4/4 | 0 px, 4/4 |
  AFTER matrix: 140/140 hits, 0 px Pixi delta; title SOLO + a real SPEED click land at all 20 size x DPR configs.
  Tests: `src/input/pointerMapping.test.ts` — 7 sizes x 4 DPRs through a REAL Pixi EventSystem; negative = stock Pixi
  misses by >60 px at 1920x947; census of every pointer-conversion token in src/** with exact per-file counts
  (off-limits trees excluded) — mutation: an added `e.clientX` in footerBand.ts turns it RED. e2e gating: 960x1080@1 and
  1920x947@1.5 — hover reach + real click + Pixi==Controls + near-miss negative (mutation: install commented out → RED).
- **TASK 2 — census REACH**: `uiSkinReach.lobby.test.ts` (real LobbyScreen; clicks through a real Pixi EventBoundary at
  the getUiPoints centres: Host / QUICK MATCH / TEST / Back / Begin / READY + the Connect chip; inside/outside edges,
  sheen; negatives: hidden Begin/READY take nothing, incomplete code reaches the chip but does not join) and
  `uiSkinReach.settings.test.ts` (minimal fake DOM, no new package: every pointer control responds and has its scoped
  CSS rule; ✕ / Escape / outside close; negative: no listener on a non-pointer element). Both mutation-tested RED.
  `uiSkinCensus.reach.test.ts` NOT_DONE is now EMPTY.
- **TASK 3 — R81 hover-grow**: ALREADY ON MASTER (S195 T18 #3: `HOVER_GROW = 0`, guard in uiSkinReach.footer.test.ts).
  Verified, not re-done: mutation HOVER_GROW=2 → that guard RED. No change made.
- **TASK 4 — hover highlight PROTOTYPE, ships OFF**: `src/render/hoverHighlight.ts` (+ test). `?hover=1` opts a viewer
  in. Ground glow + perspective ring on `fxGround()` (read-only fx reuse). Pick order mirrors the click pick; a test
  drives the REAL Controls click and asserts hover kind == click kind (castle / creature / creature-on-keep / empty).
  Screenshots: `C:/Users/onesh/OneDrive/Desktop/SPARK_S196_HoverHighlight/` (own-castle + full-board, BEFORE/AFTER).
- **GATES**: typecheck 0 · vitest 0 — 619 files passed / 7 skipped, 9279 tests passed / 14 skipped (final run, merged
  tree) · build 0 — entry **1237.5 KiB** (cap 1350, headroom 112.5; ~+2 KiB vs the 1235.5 boot figure) · e2e:gating 0 —
  69 passed / 1 skipped (the opt-in matrix), own port 39082.
  First full vitest run had 2 reds: `teams.sites.test.ts` (REAL — hoverHighlight's sameTeam call; census row added) and
  `endgameAudit.test.ts` MED-1 REACH (TIMEOUT-ONLY: 20.4 s and 51.4 s when re-run alone under 8-tree machine load, no
  assertion failed, branch touches no sim file; green in the final full run). Verdict: benign load timeout; tight budget.
- **BUMP**: none. Input mapping and the highlight are local / render-only; no wire, hash or sim change.
- **MINE (owner questions)**:
  1. Hover highlight — turn it on? Rec: yes for castles/units/towers after he sees the screenshots; if adopted, extract
     ONE shared picker for click + hover, and suppress it while a modal/panel is under the pointer.
  2. Pixi grammar buttons still grow 4 % on hover (BUTTON_HOVER_SCALE 1.04) past their REST-size hit rect (T8 semantics
     kept as briefed) — the same "dead ring looks clickable" class R81 fixed for the footer (~3 px on a 168 px button).
     Rec: lift by tint/sheen only (scale 1.0), or grow the hit with the picture.
  3. Lobby JOIN `<input>` font uses `rect.height / CANVAS_HEIGHT` (lobbyScreen.ts updateInputPosition) — 2x too big at
     half screen (960x1080). Outside my file boundary; one-line fix: scale by `mapped.height / INPUT_CANVAS_H`.
  4. castlePanel.getUiPoints reports `structureCenters` for the BUILD grid though `CASTLE_BUILD_GRID_ENABLED=false`
     builds no tiles — an e2e seam pointing at nothing. Rec: report [] when the grid is off.
- **MERGE SEAMS**: `src/main.ts` — 3 hunks: 2 import lines after `import { asPlayerId } from './types.ts';`; 3 lines after
  `root.appendChild(app.canvas);` (install + HOVER flag); 1 line before `fxEndFrame();`. nonet-home edits main.ts too.
  ⚠ The pointer census (`pointerMapping.test.ts`) turns RED if any merged branch adds a clientX / getBoundingClientRect /
  devicePixelRatio site outside its list — route it through `clientToCanvas` or add a row with a reason.
  `teams.sites.test.ts` gained one PINNED_PREDICATE row. The gating lane grows by 2 tests (~35 s locally).
- **NOT DONE**: nothing from the brief. (Creature/tower hover screenshots not captured — solo spawned no creature in
  40 s; the castle shots show the effect.)


ROOT CAUSE (found): index.html canvas CSS = max-width/max-height 100% + object-fit: contain. Whenever the
window aspect != 16:9 (half-screen, any browser with a toolbar, other monitors), the canvas CSS box is
letterboxed. Controls.updateCursor uses the letterbox-aware cssToCanvasCoords (S39), but Pixi 8's
EventSystem.mapPositionToPoint is NON-uniform (x*(canvas.width/rect.width)) and ignores the bars — so every
Pixi `pointertap`/`pointerover` (castle panel rows+slots+tiles, draft, title, codex, matchBoard, buttons) is
offset. At 1920x1080 (the only e2e viewport) the bug is invisible.

## Log
- npm install exit 0. Enumerated sites (controls.updateCursor OK; Pixi EventSystem WRONG; lobbyScreen input fontSize uses rect.height ratio).
- created progress file; branch from master 7e9d241c.
