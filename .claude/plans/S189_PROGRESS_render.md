# S189 PROGRESS — `s189/render` (PDR §5.4 / P9)

Branch `s189/render`, base `15035b9` (live deploy #2, PROTOCOL_VERSION 50). Commits are LOCAL only.

## Scope (the brief)
- **C1** — the spark (the thing that follows his mouse) must draw ABOVE the draft panel.
- **C7** — Deep Current gatherer teleport draws a line across the screen; target: vanish → castle → deposit → walk back. No line.
- **LOW a** — same-tick heal hidden inside a NET damage floater (`damageNumbers.ts`).
- **LOW b** — elite piranha has no fallback sheet; missing atlas must fall back to base piranha at 2×.

## Status
| step | state | commit |
|---|---|---|
| 0 progress skeleton | done | 68e7c7a |
| C1 diagnose | done | (C1 commit) |
| C1 fix + tests | done — mutation-tested | (C1 commit) |
| C7 diagnose | next | |
| C7 fix + tests | — | |
| LOW a | — | |
| LOW b | — | |
| gates | — | |

## C1 — DIAGNOSIS (verified against the tree)
- "The spark" = his POINTER: `AvatarRenderer`'s `avatarRendererLocal` layer (S153 A1), drawn at
  `controls.cursor`, OS cursor hidden in PLAYING (S86 P4). NOT `SparkRenderer` (that draws free
  building blocks — the S153 P4 mix-up).
- main.ts already stages the cruiser layer LAST (`avatarRenderer.bringLocalToFront()`, after the
  footer/sheet lifts), so construction order was not the cause.
- **Root cause: `draftOverlay.ts:351` `this.container.zIndex = 900` (S187, c036152) + `exitButton.ts:273`
  `app.stage.sortableChildren = true`.** Pixi 8.19 sorts a sortable stage by zIndex every frame
  (`RenderGroupSystem._buildInstructions` → `root.sortChildren()`, stable), so the 900 panel sorted
  above every zIndex-0 sibling — the cruiser included — regardless of child order.
- Fix: delete the zIndex (comment says why), and MOVE the staging line
  `app.stage.addChild(draftOverlay.container)` from main.ts ~936 to immediately before
  `avatarRenderer.bringLocalToFront()` (after `footerBand.bringToFront()` / `characterSheet.bringToFront()`),
  so the panel still covers every HUD surface it covered before and the cruiser covers the panel.

### C1 — what is above / below the cruiser now (STATED, only the draft relationship changed)
- Cruiser ABOVE: draft panel (NEW), castle panel, footer band + cards, character sheet, HUD, toasts,
  blueprint ghost, cutscene overlay, fog, board — the last five unchanged since S153.
- Cruiser still BELOW (unchanged, NOT touched, reported): the exit confirm modal root (`exitButton.ts`
  zIndex 900 — pinned by a test as a stated exception), the cinematic vignette (0.15 tint), the lobby's
  CONNECTION LOST overlay, lazily staged overlays (codex, bot setup, NONET).
- Side effects of removing the panel's zIndex (all surfaces staged LATER now draw over the panel,
  which is what child order says they should): the connection-lost overlay, codex, NONET, bot setup,
  the cinematic vignette. See out-of-scope finding F1 — the connection-lost case was a latent bug.

### C1 — input side
- The cruiser layer is `passive` with passive Graphics → Pixi's `EventBoundary` never returns it as a
  hit target. Tested with a real `EventBoundary` over the sorted stage: a hit on either tile resolves to
  the panel container and its `pointertap` still sends the pick; with the panel closed the same point
  hits nothing.
- `controls.ts` listens on the raw canvas and does not consult the panel at all — that is the
  `s188/input-layer` branch's F1 (draft click-through), NOT this brief, and it is untouched here.

### C1 — tests (`src/render/s189CruiserAboveDraft.test.ts`, 11)
- REACH on the real classes (AvatarRenderer synced against a started World, DraftOverlay rendered
  open, real `makeExitButton` making the stage sortable), `stage.sortChildren()` as the renderer does.
- NEGATIVE: staged after the lift, the panel covers the cruiser (the order is the mechanism); panel
  closed → hit-test null.
- Source-text guard on main.ts (footer lift < sheet lift < draft staged < cruiser lift), which states
  its own limit (EXISTS, not REACHED; `e2e/fog.spec.ts` is the runtime half).
- Mechanical enumeration: every code-level `.zIndex =` in src/ is exactly `[render/exitButton.ts]`.
- **Mutation-tested**: restored `this.container.zIndex = 900` → 3 red (REACH, no-zIndex, enumeration),
  restored → green.

## In flight
- C7

## Decisions
- C1 fix shape: remove the panel's zIndex + move one staging line, NOT a zIndex on the cruiser layer.
  A cruiser zIndex > 900 would also lift it over the exit modal and every later overlay — unasked.
  Child order is the project's documented z-order mechanism (canon §7b R183-G; `ui.ts` "no zIndex API
  needed"; `zoneBackgroundRenderer.ts` "NO sortableChildren, AND ITS ABSENCE IS THE POINT").

## Numbers that are MINE (not the owner's)
- (none)

## Hotspot hunks (`save.ts`, `stateHashFull.ts`, `worldTypes.ts`, `main.ts`)
- `main.ts` ~936: the `app.stage.addChild(draftOverlay.container)` line + its one comment REMOVED from
  here, replaced by a one-line pointer comment.
- `main.ts` ~1313: the same line RE-ADDED immediately before `avatarRenderer.bringLocalToFront();`,
  with a comment block. No other main.ts change.

## Non-zero exits (each: resolved / benign because …)
- `wc src/render/sparkRenderer.ts` exit 1 — benign: the file does not exist; `SparkRenderer` lives in
  `render/renderer.ts`.
- first C1 test run exit 1 (3 red: `currentTarget.isInteractive is not a function`) — resolved: Node
  never boots a Pixi Application, so the federated-event mixin was not loaded; the test now imports
  `pixi.js/events` (what `browserAll` does in the browser).
- first mutation attempt reported MUT_EXIT=0 — resolved: the git-bash `sed` did not match the CRLF
  anchor so no mutation was applied (grep showed only the comment). Re-done with a node script: the
  mutation landed at line 351 and 3 tests went red (MUT_EXIT=1). File restored from a scratch copy.
- mutation run MUT_EXIT=1 — intended (that is the guard working).

## Out-of-scope findings (REPORTED, not fixed)
- **F1 (net / C4-adjacent)**: before this branch, the draft panel (zIndex 900 on the sortable stage)
  drew ABOVE the lobby's CONNECTION LOST overlay and its "Return to Title" button
  (`connectionLostOverlay.ts`, centre-x, y 610) sits inside the panel rect (y 405–675), so during an
  open draft the panel would draw over that button and, being `eventMode: 'static'`, take its clicks.
  This branch's C1 change resolves it as a side effect (the overlay is staged later, zIndex 0 → above
  the panel). Merge owner: tell `s189/net`.
- **F2 (codex)**: `codexOverlay.setAvatarLayer(avatarRenderer.layer)` (main.ts ~1393) lifts the REMOTE
  avatar container above the codex, not the local cruiser — S153 A1 moved the local cruiser into
  `avatarRendererLocal` and this S110 P3 call was never updated. With the codex open in-game (G+C) his
  cruiser is under the codex backdrop — the S110 owner complaint ("I need to see the cruiser always").
  Not in this brief's file boundary.
- **F3 (merge note)**: `s188/input-layer` adds `DraftOverlay.isOver` whose docblock says "the
  zIndex-900 plate". After this branch that phrase is stale (text only; no conflict in hunks — its
  additions are at the end of `draftOverlay.ts`, mine are at the constructor).
