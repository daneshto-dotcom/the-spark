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
| C1 diagnose | done | 797709c |
| C1 fix + tests | done — mutation-tested | 797709c |
| C7 diagnose | done | 78eefed |
| C7 fix + tests | done — mutation-tested | 78eefed |
| LOW a | done — STATED, NOT FIXED (outside file boundary); characterization test | 52b0e28 |
| LOW b | done — mutation-tested | a82fb13 |
| gates | done — typecheck 0 · vitest 0 (6028 / 371) · build 0 (944.4 / 1100 KiB) | (final commit) |

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

## C7 — DIAGNOSIS (verified against the tree + measured on Pixi 8.19)
- Candidates ruled OUT: (b) a gatherer↔cargo tether — `SparkRenderer` draws cargo as a sprite, no line,
  and the cargo leaves `freeSparks` on the snap tick (`gathererLifecycle.ts:540-563`); (c) client
  interpolation — `interpolatePositions` (`net/sync.ts:410`) does not lerp gatherers at all (latest
  snapshot's position, full apply), and the cargo is absent from the post-snap snapshot. **No
  `src/net/lerp.ts` change was needed or made.**
- **Root cause: `gathererRenderer.ts` `drawDeepCurrentVortices` stroked each swirl with a bare
  `g.arc(...)`.** Pixi v8 = canvas path semantics: `arc()` joins the current pen to its start, and after
  every fill/stroke `GraphicsContext._initNextPathLocation` re-seats the pen at `getLastPoint()` — which
  returns stale `Point.shared` after a SHAPE (circle/rect: no switch case; (0,0) on a fresh page) and
  `(undefined, undefined)` after an ARC (it reads `data[5], data[6]` of a 6-arg arc). So the first swirl
  arc of every teleport frame was stroked as a line from elsewhere on the board (measured in the test:
  a single swirl stroke 928 px wide on the host, 925 px on the client), for the swirl's 36-frame life,
  on every peer. Identical to the S86 P2 defect documented in `hazardRing.ts:59-64`.
- Fix: `g.moveTo(start of arc).arc(...)` — each arc its own subpath. Swirls kept (they are the
  vanish/appear); only the beam is gone. The mechanic already matches his target (snap on the first
  HAULING tick, deposit same tick, SEEKING → walks back out) — untouched.

### C7 — tests (`src/render/s189DeepCurrentNoBeam.test.ts`, 12)
- REACH through the real `runHostTick` + real `GathererRenderer.sync`, reading the polygon points
  Pixi's stroke builder receives, on BOTH seats: HOST (host world) and CLIENT (real
  `HostSync.buildSnapshotMessage → ClientSync.receive → interpolateInto` at 10 Hz with
  `NET_RENDER_DELAY_MS`, second renderer on the client world).
- Per seat: the hop lands in ONE frame (no slide), swirls at both ends, EVERY swirl stroke over 40
  frames is finite, ≤ 64 px, and sits at one end; then it walks back toward the centre.
- NEGATIVE: a naga seat without the pick walks home and no frame holds a swirl stroke.
- **Mutation-tested**: bare `g.arc(` restored → 4 red (both seats: "swirl where it left", "every
  frame": *"a swirl stroke is 928 px wide"*), restored → green.

## LOW a — SAME-TICK HEAL INSIDE A NET FLOATER: STATED, NOT FIXED
- Confirmed on the real path (`damageEntity` + `applyPendingLifesteal`, the pair `runHostTick` runs,
  into the real `DamageNumbers`): a BLOOD DEBT unit that takes 12 and heals 2 in one tick prints ONE
  red "10"; under CRIMSON TIDE (heal 6) a red "6". The true 12 and the green heal are both invisible.
  Damage-only and heal-only are exact today.
- WHY NOT here: `ehp` is the only synced quantity, and the heal's size depends on the healer's own
  swing into a target the wire does not name (`trimMirrorCreature` strips `targetCreatureId`). An exact
  split needs a host-local per-frame heal record (the `creatureKillHits` pattern): a new `World`
  field in `worldTypes.ts` + `world.ts` factory + 3 phase resets (`gameMode.ts`, `gameState.ts`,
  `save.ts`) + `workerSim.ts` + `stateHashFull.ts` 'acknowledged', written at `racial/lifesteal.ts:126`
  and `:147`, `bossSkills.ts:121` (Vlad's sap), `racial/corpseEater.ts:256`; consumer in
  `damageNumbers.ts` prints red `(prev − cur) + heal` and green `heal`. All outside this brief's file
  boundary (and corpseEater.ts is `s189/units`' LOW territory). A joiner / worker-mode main thread
  would still see the net number — the same host-only limit `creatureKillHits` accepts.
- `damageNumbers.ts` is UNCHANGED on this branch (R185-D anchoring untouched).
- Test: `src/render/s189HealInsideNetFloater.test.ts` (4) — pins the gap; goes red ON PURPOSE when the
  channel lands (re-pin to "red 12 + green 2", never delete).

## LOW b — ELITE PIRANHA FALLBACK SHEET
- Cause: `goblinRenderer.ts` looked up `atlases.get('t3PiranhaElite')` only; `loadAtlas` swallows a
  404, so a missing / in-flight elite sheet fell to `drawGoblin`'s green puppet.
- Fix (goblinRenderer.ts only): `export function atlasFallbackType(type)` → `'t3Piranha'` for
  `'t3PiranhaElite'`, else null; the draw loop ensures the fallback's sheet and uses it when the own
  sheet is unresolved. Scale stays keyed by TYPE (`creatureSpriteScaleMul('t3PiranhaElite')` = 2) →
  base piranha at 2×. Both shipped manifests carry idle/walk/attack/die, same cellH 200, same foot
  anchor (elite cellW 226 vs 200 — width only). Portrait (`portraitTexture`) NOT given the fallback
  (the swarm branch does not either; an unresolved portrait draws the plate alone, no error).
- ⭐ MERGE-FRIENDLY ON PURPOSE: `s188/swarm` adds the same function (same name/signature) for
  `t3BatSwarm → t3Bat` at the SAME insertion point, and an identical draw-loop hunk. My draw-loop hunk
  is byte-identical to swarm's (including its "⭐ S188 —" comment) so git merges it cleanly; the
  function block WILL conflict (both insert after `CORPSE_EATER_FEED_KEY`) — resolve as the union:
  `return type === 't3BatSwarm' ? 't3Bat' : type === 't3PiranhaElite' ? 't3Piranha' : null;`, keep
  one docblock. My negative test "every other creature type has NO fallback" must then gain the swarm
  arm (it enumerates `CREATURE_CONFIGS`, so it goes red until updated — intended).
- Tests (`src/render/s189EliteFallback.test.ts`, 5): REACH through the real `GoblinRenderer.sync`
  with `fetch` + `Assets.load` stubbed and the SHIPPED manifests read off disk — elite 404 → one
  Sprite cut from the piranha sheet at `GOBLIN_SPRITE_BASE_SCALE × 2`, zero console.error/warn.
  Negatives: elite sheet present → its OWN sheet; plain piranha untouched (own sheet, ×1); no other
  type has a fallback; the borrowed sheet has every row the elite's has.
- **Mutation-tested**: removed the `?? atlases.get(fallbackType)` arm → REACH red ("expected [] to
  have a length of 1"), restored → green.

## GATES (tip a82fb13, each exit from a captured `$?` written to a file)
- `npm run typecheck` → **TYPECHECK_EXIT=0**
- `npx vitest run` → **VITEST_EXIT=0**, 6028 tests / 371 files, all passed
- `npm run build` → **BUILD_EXIT=0**, entry **944.4 KiB** / cap 1100 KiB, headroom 155.6 KiB
  (base 944.2 → **+0.2 KiB** of the shared headroom)
- e2e NOT run (per brief — the merge owner runs it on the merged tree). No dev server started.
- **Wire / hash / shared rules: NONE changed.** `git diff --stat 15035b9 -- src/state src/net` is
  EMPTY. No `PROTOCOL_VERSION`, canon, or `canon.test.ts` edit. No new synced field, no `GameEffect`.
- Branch diff: `main.ts` (1 line moved), `draftOverlay.ts`, `gathererRenderer.ts`,
  `goblinRenderer.ts`, 4 new test files, the two plan notes.

## FOLLOW-UP (merge owner, after acceptance) — the C7 defect at its other LIVE sites
- Fixed, one commit: `render/bossAuras.ts` `drawSonarWave` (the Kraken sonar's 4 body rings, was
  :359, and its foam edge, was :366) and `render/raceMotifs.ts` `drawRaceKeepFallback` naga shell
  crest (was :100). Each arc now `moveTo`s its own start first. Only the DRAWING changed — the
  Kraken mechanic (`s189/units`' C10) is untouched.
- `bossAuras.test.ts`'s hand-rolled Graphics recorder gained a `moveTo` method (it had none, so the
  four existing sonar tests would have thrown). No assertion there changed.
- Test: `src/render/s189PenLiftArcs.test.ts` (4) — real Pixi `Graphics`, pen parked by a prior shape;
  every sonar ring's points lie on one circle about the boss, every crest point inside the keep, all
  finite. **Mutation-tested once for the set**: all three `moveTo`s removed → both invariant tests red
  (sonar ring 0: a point 1272 px off its circle; crest path 0 starts at (0, 0)); restored → green.
- **SKIPPED on the merge owner's instruction**: `render/rainbowRenderer.ts:53` and
  `render/rainbowFlyoverRenderer.ts:259` carry the same bare `arc()`, but the rainbow and its flyover
  are ARCHIVED (canon §1 — unreachable in production). Left as-is, noted here.
- Gates after the follow-up (captured $?): TYPECHECK_EXIT=0 · VITEST_EXIT=0 (`--maxWorkers=6`, 6032 / 372) ·
  BUILD_EXIT=0 (944.5 / 1100 KiB, +0.3 KiB total for the branch). Snapshot EOL rewrite recurred — benign,
  `git diff --quiet` 0, restored.
- Still report-only: the codex z-order (`main.ts` ~1393, F2) — not touched.

## In flight
- nothing — branch complete, awaiting audit + merge

## Decisions
- C1 fix shape: remove the panel's zIndex + move one staging line, NOT a zIndex on the cruiser layer.
  A cruiser zIndex > 900 would also lift it over the exit modal and every later overlay — unasked.
  Child order is the project's documented z-order mechanism (canon §7b R183-G; `ui.ts` "no zIndex API
  needed"; `zoneBackgroundRenderer.ts` "NO sortableChildren, AND ITS ABSENCE IS THE POINT").

## Numbers that are MINE (not the owner's)
- No production constant was introduced or changed.
- Test tolerances only: `SWIRL_BOX_PX = 64` (the swirl's own 2×28 px + stroke slack) and
  `LAND_SLACK_PX = 60` (six ~6.6 px walk steps between two 10 Hz snapshots) in
  `s189DeepCurrentNoBeam.test.ts`.

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
- C7 first test run exit 1 (1 red: client landed at (127.7, …) not (120, 614)) — resolved: correct
  behaviour, a 10 Hz client first sees the gatherer one snapshot after the snap, by which time it has
  walked a few steps back out; the assertion now allows ≤ 60 px on the client (0 on the host).
- a `node -e` patch exit 1 ("missing …") — resolved: bash ate the backticks in the heredoc'd JS, the
  anchor did not match, NOTHING was written (the script throws before `writeFileSync`); redone with Edit.
- `rm -rf src/__scratch` BLOCKED by the destructive-command guard — resolved: removed the one scratch
  file with `rm <file> && rmdir <dir>`; `git status` clean of it.
- C7 mutation run MUT_EXIT=1 — intended (4 red, restored → green).
- LOW a first run exit 1 (3 red, no heal seen) — resolved: fixture error, a `goblinMelee` pool is 7
  fifths so one 12 killed both units before any heal could land (measured with a throwaway debug test,
  since deleted). Fixture now uses `t3Warband`; 4/4 green.
- Session was killed once by the org spend limit mid-LOW-a; resumed from this file, commits intact.
- After the full vitest run, `git status` showed
  `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` modified — benign: vitest
  rewrote the snapshot's line endings only (`git diff --quiet` exit 0 = no normalized content change).
  Restored with `git checkout --`; tree clean. Pre-existing behaviour of that snapshot, not this branch.

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
- **F4 (same Pixi pen-carry defect as C7, other renderers — NOT fixed, not in this brief)**: a bare
  `.arc(` after a fill/stroke on the same Graphics, no `moveTo`/`beginPath` first:
  `render/bossAuras.ts:359` and `:366` (the KRAKEN SONAR arcs — C10 is `s189/units`' — the first sonar
  arc joins the previous stroke's stale pen point); `render/rainbowRenderer.ts:53`;
  `render/rainbowFlyoverRenderer.ts:259`; `render/raceMotifs.ts:100` (the NAGA fallback keep's shell
  crest — drawn only when the castle atlas fails to load, i.e. in every vitest run). Each is one
  `moveTo(start)` like C7's. `hazardRing.ts:65` and `hunterRenderer.ts:70` already do it right.
- **F3 (merge note)**: `s188/input-layer` adds `DraftOverlay.isOver` whose docblock says "the
  zIndex-900 plate". After this branch that phrase is stale (text only; no conflict in hunks — its
  additions are at the end of `draftOverlay.ts`, mine are at the constructor).

## R190-I (owner ruling, boundary extended) — DONE: every hit and every heal, separately, joiners too
Owner: *"It has to show -12 and +2 separately, in different colors … it shows every single hit or heal.
They can stack on top of each other."*
- **Field**: `Creature.healedFifths?: number` — a MONOTONIC counter of every heal APPLIED (after the max
  cap), written only via `noteCreatureHeal(c, ehpBefore)` (`creatures/creature.ts`, self-contained block
  at the end of the interface + the helper). Absent = 0; no factory change; no reset needed (creatures
  are born fresh; nothing clears it mid-life).
- **The four heal sites** (minimal hunks — `s189/units` also edits lifesteal.ts / corpseEater.ts):
  · `racial/lifesteal.ts` — the import line; `applyLifesteal` immediate arm (+2 lines around the ehp
    write); `applyPendingLifesteal` loop (+2 lines around the ehp write).
  · `bossSkills.ts` — the import line; `runVladLifeSap` (+2 lines around `vlad.ehp = …`).
  · `racial/corpseEater.ts` — the import list (+1 line `noteCreatureHeal,`); `bite` (+2 lines around
    `boss.ehp = …`; the local is `ehpBefore` because `before` is already taken there).
- **Wire (`save.ts`, HOTSPOT — three self-contained hunks)**: `SerializedCreature.healedFifths?` (+docblock);
  `serializeCreature` emits it only when > 0; `deserializeCreature` accepts only a positive integer.
- **Hash (`stateHashFull.ts`, HOTSPOT — two self-contained hunks)**: `'healedFifths'` in `CreatureHashed`
  (+docblock) and `:hf${o(c.healedFifths)}` in the creature projection. NOT added to the narrow
  production `hashWorldState`. Contribution test added to `stateHashFull.test.ts`.
- **Worker**: the `?worker=1` mirror rebuilds creatures from the same `serializeCreature` snapshot
  (`trimMirrorCreature` strips only `targetCreatureId`), so the counter reaches the host's main thread;
  the wide hash now covers it for the host-vs-worker differential.
- **Renderer**: `damageNumbers.ts` `creaturePoolChange(prevEhp, curEhp, prevHealed, curHealed)` → heal =
  counter rise, hit = ehp drop + heal; both emitted at the same anchor (R185-D untouched) and `place`
  stacks them. Fallbacks to the old net reading: a counter that went down (host migration onto an older
  build) counts no heal; a rise the counter does not explain is shown as a heal.
- **PROTOCOL — no bump needed, and why**: additive-optional, emitted only once > 0; the deserializer copies
  named fields, so a stale peer (same v50 without this code) ignores it and prints the old net number; no
  sim on any peer READS the counter (host migration onto a stale build just stops counting — the fallback
  handles a counter that never rises); not in the narrow production hash, so no false desync. A stale
  peer cannot disagree about anything it SIMULATES — only its floaters differ.
- **Wire cost (MINE, by construction)**: `,"healedFifths":N` ≈ 17–19 bytes per creature that has ever
  healed, per snapshot — vampire units under BLOOD DEBT / CRIMSON TIDE, Vlad after a sap, the zombie boss
  after a bite. Zero for everything else. Flag for `s189/net` (C5 lag) if a vampire army is large.
- **Stated limit**: resolution is one observation — two hits on the same host tick (or inside one 10 Hz
  snapshot on a joiner) still merge into one red number, two heals into one green one. Splitting those
  would need a per-hit event list on the wire; not built.
- **Tests**: `src/render/s189HealInsideNetFloater.test.ts` FLIPPED (10): host BLOOD DEBT → red 12 + green 2
  (+ the enemy's red 12); CRIMSON TIDE → red 12 + green 6; JOINER through the real
  HostSync → ClientSync → interpolateInto → red 12 + green 2; STALE PEER (counter stripped from the wire)
  → old net red 10, no error; singles exact; `creaturePoolChange` arithmetic + both fallbacks.
  `src/state/s189HealCounter.test.ts` (10): each of the four sites through its real entry point writes
  exactly what landed (incl. under the cap); counter absent while 0; round-trips
  netSnapshot → applyNetSnapshot; junk off the wire rejected. `stateHashFull.test.ts` +1.
- **Mutation-tested**: (a) `creaturePoolChange` ignoring the counter → 5 red in the floater test (host ×2,
  joiner, arithmetic ×2); (b) `noteCreatureHeal` removed at the pending-batch site → the site test red.
  Both restored → green.
- Non-zero exit: the first write of this section went through a bash `node -e` with backticks, which bash
  executed as command substitutions (one was `git merge master`, which failed "not something we can
  merge" — NOTHING was merged; `git status` clean, no MERGE_HEAD). The text was mangled and committed in
  3df4cbb; rewritten here with the Write tool. Resolved.

## AUDIT R2-1 / R2-4 (merge owner) — next
- R2-1: codex backdrop + CONNECTION LOST backdrop are passive, so clicks fall through to the (now lower)
  draft panel. Fix: `eventMode = 'static'` on both backdrops; hit-test test; mutation-tested.
- R2-4: correct the false "e2e/fog.spec.ts is C1's runtime half" claim (it never looks at the panel).

## NEXT — R190-H (ra-vfx is on master 5934d3b)
- `git merge master`, keep ra-vfx's two S190 finale guards (absence check + structureWatchEpoch check),
  then draw ONLY the Ra strike above unit sprites, with a z-order test that states its limit.
