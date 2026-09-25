# S191 PROGRESS — `s191/addons` (worktree `s191-addons`)

Brief: `.claude/plans/S191_BRIEFS/addons.md` (main checkout). Rules: S191 PDR §4 + S189 PDR §4.
Merge owner = the main session. This branch never merges, never pushes.

## Status

| step | what | state | commit |
|---|---|---|---|
| 0 | `npm ci` (NPM_CI_EXIT=0) + this skeleton | DONE | 3fb5733 |
| A-1 | Warlord rage 25 s + cooldown | DONE | be61e6a |
| A-2 | Alt toggles the footer while a tower is armed | DONE | 7f8b326 |
| A-3 | R190-G opaque panels swallow right-clicks | DONE | 7fcf0f7 |
| A-4 | A1 CI e2e lane | DONE | 811121b |
| A-5 | magic-attack DESIGN doc | DONE | ea6cef4 |
| R2-1 | RAGE-1 the clock runs through BUILD | DONE | d2757a0 |
| R2-2 | RAGE-3 attack row reads the cycle latch | DONE | 5cab86b |
| R2-3 | RAGE-7 the two-Warlord tests | DONE | 48dab3d |
| R2-8 | INPUT-7 S182 GATE A/E windows bounded by the handler | DONE | c2c7f5c — landed BEFORE INPUT-1, whose `onDown` line reddened GATE A's fixed window |
| R2-4 | INPUT-1 + INPUT-3 modals and HUD controls cover the board | DONE | de5dedd |
| R2-5 | INPUT-4 castle-panel RMB put-back | DONE | 90732c4 |
| R2-6 | INPUT-5 Alt latch reset on blur / hidden | DONE | (this commit) |
| R2-7,9 | INPUT-6 · INPUT-4 · INPUT-5 · INPUT-6 · INPUT-7 · DOCS | next | — |

## Decisions / owner answers received mid-task

- **A-1 open gate ANSWERED by the owner (via the merge owner, S191):** when the 25 s rage ends and the
  Warlord is still under half, it is **"COOLDOWN FIRST"**, not an immediate re-trigger. No length given →
  `WARLORD_RAGE_COOLDOWN_TICKS` = 25 × 60, flagged `⚠ MINE` (length only). One field carries both windows.
- **Council items (S191 ledger, accepted), applied to A-1:** the stamp is written ONLY by `runWarlordRage`;
  `isFrenzySource` = "his own 25 s window is open" and nothing else (the bare-bit check was dropped); the
  25-on/25-off consequence is stated at `WARLORD_RAGE_COOLDOWN_TICKS`.
- Council items for A-2 / A-4 recorded for those steps: Alt calls the EXISTING `toggleCollapsed()`; raise
  on disarm/place only if Alt lowered it; ignore `e.repeat`, focused text fields, Ctrl+Alt;
  `preventDefault` on keyup too. `worker-bots` job gets `PW_GLOBAL_TIMEOUT_MIN` < `timeout-minutes` via
  `env:`. The footer fill guard pins NINE opaque fills today.

## A-1 — what landed

- `constants.ts`: `WARLORD_RAGE_SECONDS` 25, `WARLORD_RAGE_TICKS` = 25 × `PHYSICS_HZ` (1500, derived, his),
  `WARLORD_RAGE_COOLDOWN_TICKS` = 25 × `PHYSICS_HZ` (1500, ⚠ MINE length). `WARLORD_RAGE_CLEAR_PCT`
  retired in place (kept exported, unread by the sim).
- `creatures/creature.ts`: `Creature.rageStartTick?` + `isOwnRageActive` / `isRageCoolingDown`.
- `bossSkillsWarlord.ts` `runWarlordRage`: in window → raging; else not cooling and strictly below 50 % →
  stamp + rage; else lower the bit (the frenzy re-sets a frenzied Warlord the same tick).
- `racial/bloodFrenzy.ts` `isFrenzySource(c, tick)`: alive Warlord with his own window open.
- Tests: new `src/state/warlordRageClock.test.ts` (13): window arithmetic; REACH via `runHostTick` —
  healed above half still rages exactly 1500 ticks; still under half → exactly 1500 calm → re-fires with a
  fresh stamp; healed in the cooldown → no re-fire until he drops; dropped inside the cooldown → waits it
  out; BLOOD FRENZY race unit + tier-3 follow his clock every tick of the full cycle, goblin never; a
  Kraken is never stamped; hash contribution; save + netSnapshot round-trip; restore validation; host vs
  `?worker=1` INIT mid-rage byte-identical (wire + narrow + wide) across end → cooldown → re-fire, with a
  NEGATIVE: a stamp-less save diverges exactly at the host's rage end.
- Re-pinned (not relaxed): `bossSkillsLate.test.ts` (R151 heal exit → the clock; S179 trigger kept),
  `bloodFrenzy.test.ts` (source = clock; the "frenzy never calms a Warlord" case re-pinned at
  `runBloodFrenzy` because the clock makes the host-tick version unconstructible).
- Mutations (each red, each restored): M1 `since <= WARLORD_RAGE_TICKS` → 5 red; M2 cooldown check removed →
  5 red; M3 frenzy source back to the health read → 5 red.
- Gates at A-1: typecheck 0; full vitest 0 (6478 passed / 2 skipped / 0 failed, 397 files) before a
  fixture-only follow-up; the clock file re-run 13/13 after it.
- **Protocol verdict: BUMP** (rule change + new field) — see `S191_CANON_NOTES_addons.md` §6.

## A-2 — what landed

- `render/footerBand.ts`: `toggleCollapsed` also clears `altLowered` (one line); a self-contained block
  after `isCollapsed()` — `private altLowered`, `altToggleCollapsed()` (calls `toggleCollapsed`, then
  records that Alt lowered it), `isAltLowered()`; `setArmed(null)` (polled every frame by `main.ts:4067`)
  raises the band only if Alt lowered it. No new fill — the guard stays at **9**.
- `input/controls.ts`: `FooterBandLike.altToggleCollapsed?`; a `keyup` listener in the constructor; one
  line at the top of `onKeyDown`; a self-contained block after it (`altKeyConsumed`, `handleAltFooterKey`,
  `onKeyUp`). Alt acts only with a tower armed; ignores `e.repeat`, Ctrl/Meta, focused INPUT/TEXTAREA;
  `preventDefault` on the consumed keydown AND its keyup; unarmed Alt is untouched (no preventDefault).
- No change was needed in any placement guard: every consumer (`isPointerOverFooterChip`,
  `isPointerOverFooterSurface` at the armed-stamp arm and both PLACE commit gates) routes through the
  band's own predicates, which S187 already taught the collapse. The REACH test proves it at the stamp.
- Tests: new `src/input/controls.altFooter.test.ts` (9), real `Controls` + real `FooterBand`: armed + Alt
  → a stamp under the CARRY READOUT plate and (separately) under a TIER CHIP — both derived from live
  geometry, e.g. `t3TowerVampires` at (568, 1018) — is accepted; Alt again → refused; place / Escape / RMB
  raise the band Alt lowered; unarmed Alt → nothing (no preventDefault); a tab-lowered band is never
  raised by a disarm; repeat / Ctrl / Meta / focused field ignored; keyup swallowed once; edge rule intact.
- Mutations: MA1 (Alt hook removed) → 5 red; MA2 (provenance ignored in `setArmed`) → 2 red. Restored.
- Gates at A-2: typecheck 0; full vitest 0 (6487 passed / 2 skipped, 398 files).
- Wire/hash: NONE (render-only view state). No protocol change.
- ⚠ Suspect: Alt is acted on at KEYDOWN (as briefed), so Alt+Tab with a tower in hand also drops the band.

## A-3 — what landed

- `input/controls.ts`: new `isPointerOverAnyOpaqueSurface()` (castle panel ∥ draft panel ∥ character card ∥
  footer band surface — the four the LMB commit gates ask) right after `isPointerOverFooterSurface`;
  the RMB RAID branch returns on it BEFORE any pick. Each of the four `button === 2` sites carries a
  tag: three `R190-G: HAND` (Ra-aim put-away, the draft-plate put-back, the held-tower put-back — S190
  IL-2: they act on the hand, so they stay live over every surface) and one `R190-G: BOARD (gated
  below)`. R190-F untouched (the seam arrow is a LEFT press).
- Tests: new `src/input/controls.rightClickSurfaces.test.ts` (23). REACH via real `Controls.onDown` +
  real `FooterBand`: an enemy UNIT and an enemy CONNECTOR under a tier chip, an open tower card, the
  collapse tab, the character card, the castle panel, the draft panel → no RAID_TARGET; bare board →
  raided (both arms, the negative control); collapsed band → the ground is raidable again, the collapsed
  tab still swallows; RMB over the footer still puts the held tower back; LMB on the tab still collapses.
  MECHANICAL: exactly 4 `button === 2` sites, each tagged HAND/BOARD, 3 HAND + 1 BOARD; the BOARD guard
  precedes the first pick; all 3 `RAID_TARGET` dispatches lie after it; the predicate names all four
  surfaces; the one `contextmenu` listener only preventDefaults.
- Mutation MR1 (guard removed) → 10 red; restored.
- Gates at A-3: typecheck 0; full vitest 0 (6510 passed / 2 skipped, 399 files).
- Wire/hash: NONE. No protocol change.
- ⚠ The first run went red in `s182UiSurfaceGuards.test.ts` GATE E: it slices a FIXED 4200-char window
  from `const armed = …` and my tag lengthened the held-tower RMB line; shortened the tags instead of
  widening their window. `onBuildBlueprint` now sits at **4141** chars on a CRLF checkout (4125 before,
  4083 on LF/CI) — **59 chars of headroom locally**. s191/owner's aim mode in `onDown` can false-red it.

## A-4 — what landed

- **CI verdict recorded BEFORE any change (`gh run list`, 2026-09-25):** the E2E run for deploy #4
  (36088405562) concluded **success**, and so did its gating `e2e` job (70 passed, 8.8 m) — but it is the
  ONLY green gating `e2e` in the last five master runs: 36059057491 **cancelled** (Checkout hung 9m23s, the
  tests got ~9 of 18 min), 35972498981 / 35905288147 / 35831620160 **failure** — each ran the 720 s
  Playwright cap out ("2 failed · 11 did not run"), and the failing specs are `hunter.spec.ts:68` and
  `worker.spec.ts:21`, both dying in `pullFromBank` on `waitForWorld timeout (30000ms): a gatherer banks a
  shape` at tick **521** / **723** (a gatherer still hauling). (`nplayer`'s `hpBonus` pageerror in 35831620160
  was a real S187 product bug, since fixed.) Verdict: **STILL FLAKY — green once, by margin, not fixed.**
  (`e2e-soak` / `e2e-quarantine` stay red and are non-gating by design.)
- `e2e/helpers.ts`: `pullFromBank(page, budgetTicks = PULL_FROM_BANK_BUDGET_TICKS (1800 = 30 s of SIM),
  wallCapMs = 240_000)` — the economy wait is `waitForWorldWithinTicks`; the porch wait after the click
  stays wall-clock at its old 30 s (named constant). Both callers stop passing a (drag) wall budget.
- `e2e/worker-bots.spec.ts`: describe title tagged ` @worker-bots`.
- `package.json`: `@worker-bots` added to `e2e:gating`'s `--grep-invert`; new `e2e:worker-bots` script.
- `.github/workflows/e2e.yml`: new GATING job `e2e-worker-bots` (timeout-minutes 12, `env:
  PW_GLOBAL_TIMEOUT_MIN: 9`, no continue-on-error); `timeout-minutes: 3` on EVERY job's Checkout (9 jobs);
  header lane list + checkout note. YAML parses (python yaml).
- `src/ci.e2eLanes.test.ts` re-pinned (nothing relaxed): `@worker-bots` → OWN_JOB → `e2e-worker-bots` /
  `e2e:worker-bots`; NEW: every OWN_JOB job sets `PW_GLOBAL_TIMEOUT_MIN` strictly below its
  `timeout-minutes`; NEW: every job's Checkout carries `timeout-minutes` ≤ 3.
- Mutations: the UNCHANGED guard went red on the new tag (3 red) before its re-pin; MC1 (worker-bots
  PW 9 → 12) red; MC2 (one Checkout unbounded) red; restored (cmp).
- **Local e2e, this worktree, port 20442 = FNV-1a of this path (free before; the log shows this run
  STARTING `vite --port 20442`):** `npm run e2e:worker-bots` → 1 passed (45.7 s), EXIT 0;
  `hunter.spec.ts` + `worker.spec.ts` → first run **2 failed** on MY defect (`ReferenceError: timeoutMs is not
  defined` — `pullFromBank` reused the removed parameter in its porch wait; `e2e/` is outside `tsc -b`),
  fixed, re-run → **2 passed (47.5 s), EXIT 0**. `--list`: gating lane 70 → 69 tests (18 → 17 files), the
  new lane exactly 1. Ad-hoc `tsc` over the changed e2e files: one error, pre-existing and identical on the
  baseline (unused `isPlayerPickable`, TS6133) — benign.
- Gates at A-4: typecheck 0; full vitest 0 (6511 passed / 2 skipped, 399 files).
- ⚠ Not verified: the branch's own CI run (this branch is never pushed). The merge owner's push is the
  first real measurement of the split lanes.

## A-5 — what landed

- `.claude/plans/S191_MAGIC_ATTACK_DESIGN.md` — DESIGN ONLY, no code. §1 inventory of 14 non-unit strikes
  with file:line, amount (from the constants), whether ATK/PEN picks reach it, and what defends against
  it; §2 three options on the ONE ladder (1 LABEL ONLY · 2 MAGIC IGNORES DEF · 3 a RES stat starting = DEF);
  §3 the R190-E draft interaction as built; §4 five plain-words questions with a recommendation each;
  §5 what each option would touch (bump verdicts). Headline consequence: under option 2 one Ra column
  (300) kills every tier-9 boss (HP parts 100–120).

## ROUND 2 (audit wf_8262665a-fa9) — fix ONLY the listed items

- **RAGE-1 (HIGH) — reproduced first:** a Warlord firing 10 s before a REAL whistle was still red at
  tick T+1500 in BUILD (`warlordRageClock.test.ts`, "RAGE-1"). Fix (merge-owner decision, flagged
  `⚠ MINE` at `runWarlordRage` and in `hostTick`): the latch's FIRE branch alone requires `matchPhase ===
  'FIGHT'`; `hostTick` gains one `else if (gameState === 'PLAYING')` block after the FIGHT block that runs
  `runWarlordRage` + `runBloodFrenzy` (the frenzy's own rule, so frenzied orcs — and a frenzy-raised
  sibling Warlord — follow their source down; it can raise a unit only while a source's window is open,
  i.e. at most `WARLORD_RAGE_TICKS` into BUILD). ⚠ I used the frenzy's full rule rather than a clear-only
  pass so a sibling Warlord and the soldiers calm on the same tick. Consequence sentence at
  `WARLORD_RAGE_COOLDOWN_TICKS` rewritten from `FIGHT_PHASE_TICKS` / `WARLORD_RAGE_TICKS` /
  `WARLORD_RAGE_COOLDOWN_TICKS`. Tests (+3): the whistle case (Warlord + soldier lowered at exactly T+1500,
  in BUILD); the per-FIGHT pattern DERIVED from the constants over FIGHT + BUILD into the next FIGHT; nothing
  fires in BUILD. Mutation (outside-FIGHT pass removed) → 2 red; restored. typecheck 0; vitest 0 (6514).

- **RAGE-3 (LOW) — reproduced first** (the renderer had no row-aware choice: new test red). Fix: pure
  `animRageForRow(row, enraged, attackCycleRaged)` in `goblinRenderer.ts`; `syncSprite` gains an
  `attackCycleRaged` parameter (both call sites pass `c.attackCycleRaged === true`) and the attack row's
  `per` reads the latch; walk/idle keep the live bit. The tint still follows the live bit (unchanged).
  Test `src/render/rageAnimRow.test.ts` (4, pure + the two call sites). Mutation → 2 red; restored.

- **RAGE-7 (LOW) — NOT A DEFECT, a missing test.** Both cases pass on the tree as it stands: (1) two
  Warlords, the source's 25 s window ends while he is ALIVE under half (in cooldown) → the frenzy-raised
  sibling and the soldier calm at exactly T+1500, the sibling's `rageStartTick` stays undefined; (2) the
  source killed INSIDE a tick by an enemy zombie boss's rot aura (`ehp ≤ 0`, the deferred sweep) → both
  calm on the kill tick. ⚠ A bare-bit source mutation did NOT go red — measured: `runWarlordRage` lowers
  every Warlord without a live clock BEFORE the frenzy reads the bits, so two Warlords cannot keep each
  other raging in this order. Mutations that do bite: the frenzy stamping a clock on a Warlord it raises →
  2 red; a dying source (`ehp ≤ 0`) still counting → 1 red. Restored (cmp).

- **INPUT-7 (LOW) — reproduced:** measured at HEAD, GATE E's needle sat at 4179 of its 4200 window and
  GATE A's at 4445 of 4600 (CRLF); INPUT-1's one new `onDown` line then turned GATE A red with nothing
  wrong. Fix (test only): `onDownBody()` (the `onDown…onMove` slice, `hoverBlock`'s shape) for GATE A and
  `armedArm()` (from `const armed` to the handler's end) for both GATE E cases; every assertion unchanged.
  Mutation (the armed arm's footer-surface return removed) → GATE E red; a 1.2 KB comment padded into
  `onDown` → still green. Committed before INPUT-1 for that reason.

- **INPUT-1 + INPUT-3 (MED) — the defect I reported, reproduced by restoring it** (the covered runs go red,
  15 of them, with the `onDown` return removed). `Controls.setModalCover((x, y) => …)`; `onDown` returns
  right after `updateCursor` / `setPressed` for EVERY button while covered; `onUp` does NOT return — the
  potato plant and the `PLACE_FROM_FREE` commit gain `!isPointerUnderModal()`, so a drag begun before the
  modal still DROP_SPARKs, releases the capture and goes Idle; folded into `isPointerOverAnyOpaqueSurface`;
  the hover returns early with a plain cursor and no highlight (kept OUTSIDE GATE D's pinned lines).
  `main.ts`: ONE statement after `const exitButton = …` — the codex ‖ CONNECTION LOST (closes SEAM-3) ‖
  the exit confirm ‖ (PLAYING and the BACK TO MAIN rect) ‖ the settings-gear rect — plus two import-line
  extensions. `ui.ts`: `settingsGearRect()` exported and used by `hudSurfaces` (one source for both). The
  settings PANEL is a DOM overlay (the canvas never sees its clicks), so only the gear glyph is registered.
  Tests `controls.modalCover.test.ts` (31): six scenarios (stamp, spark grab, gatherer re-task, enemy card,
  RMB raid, potato plant) × three modals → nothing, each with a bare-board negative that acts; the drag
  begun before the codex ends DROP_SPARK / released / Idle with no placement (control: it places); BACK TO
  MAIN and the gear swallow every scenario (anti-vacuity: uncovered, the same point is live board); the
  auditor's case — a voltkin armed builds under BACK TO MAIN uncovered, nothing covered; the cursor plain
  under the codex; a source-text pin that `main.ts` builds the cover with the tested five terms, after the
  exit button exists. Mutations: `onDown` return → 15 red; the release gate → 1 red; the hover → 1 red.
  typecheck 0; vitest 0 (6551).

- **INPUT-4 (LOW) — reproduced** (tower and aim both stayed in hand). Fix: one line before the castle-panel
  guard in `onDown` — `if (e.button === 2 && this.isPointerOverPanel())` puts the aim away, else disarms —
  tagged `R190-G: HAND`; the guard `if (this.isPointerOverPanel()) return;` stays literal (GATE A pins it).
  The mechanical right-click guard went red on the new site as designed; re-pinned 4 → 5 sites, HAND 3 → 4.
  The "everywhere" wording fixed (not under a modal). Tests +3 (tower put back + no raid; aim put away; LMB
  over the panel still acts on nothing). Mutation (no disarm) → 1 red; restored.

- **INPUT-5 (LOW) — reproduced** (no listener: a consumed Alt whose keyup lands elsewhere left the latch
  set, so the next browser-meant Alt release was swallowed). Fix: `window` 'blur' and `document`
  'visibilitychange' (hidden only) clear `altKeyConsumed`; `document.addEventListener` is guarded (bare
  harness stubs). The keydown toggle is unchanged. Tests +3 in `controls.altFooter.test.ts`, fired through
  the listeners `Controls` really registered (the stubs now record them): blur, hidden, and the negative
  (going visible clears nothing). Mutation (blur no-op) → 1 red; restored.

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

- `save.ts` — 3 self-contained lines/blocks: `SerializedCreature.rageStartTick?` (after
  `attackCycleRaged`), the serialize spread (after `attackCycleRaged`), the validated restore spread
  (after `attackCycleRaged`).
- `stateHashFull.ts` — `| 'rageStartTick'` in the creature union (after `'attackCycleRaged'`) and the
  `:rs${o(c.rageStartTick)}` projection element (after `:ak`).

## footerBand.ts / controls.ts hunks (s191/owner edits the same files)

- ⚠ **`main.ts` (hotspot), ROUND 2 INPUT-1:** one `controls.setModalCover(…)` statement (+ a comment line)
  right after `const exitButton = makeExitButton(app, leaveToTitle);`, and the `pointInRect` /
  `exitButtonRect` / `settingsGearRect` names added to three existing import lines.
- `controls.ts` ROUND 2: `setModalCover` + `modalCover` field (after `setDraftPanel` / `draftPanel`);
  `isPointerUnderModal` (before `isPointerOverAnyOpaqueSurface`, which now asks it first); one `return`
  line after `setPressed(true)` in `onDown`; one condition in each `onUp` commit gate; the early-return
  block at the top of `updateHoverCursor`; `pointInRect` export before `distToSegment`.

- `footerBand.ts` A-2: (1) one line in `toggleCollapsed`; (2) the block `// ── ⭐⭐ S191 A-2 … // ── end
  S191 A-2` right after `isCollapsed()`; (3) two comment lines + one `if` inside `setArmed`.
- `controls.ts` A-2: (1) `altToggleCollapsed?(): boolean;` in `FooterBandLike` after `toggleCollapsed?`;
  (2) the `keyup` listener after the `keydown` one in the constructor; (3) the first line of
  `onKeyDown`; (4) the block `// ── ⭐⭐ S191 A-2 … // ── end S191 A-2` after the S42 comment below
  `onKeyDown`.
- `controls.ts` A-3: (1) the four `button === 2` lines gained a trailing `// R190-G: …` tag (lines
  ~675, ~1159, ~1204, ~1388); (2) the block `isPointerOverAnyOpaqueSurface()` after
  `isPointerOverFooterSurface()`; (3) a comment block + `if (this.isPointerOverAnyOpaqueSurface())
  return;` at the top of the RMB raid branch.

## Numbers that are MINE

- `WARLORD_RAGE_COOLDOWN_TICKS` = 1500 (25 s) — the LENGTH only; "cooldown first" is his.
- A-2: raise the band on disarm / place when Alt lowered it (the brief's default; he asked for the toggle).

## What I suspect / questions (not built)

- ⛔ **FOUND (A-3 enumeration), NOT FIXED — out of the brief's surface set:** the CODEX (G+C, openable
  mid-match, backdrop alpha 0.93), CONNECTION LOST (alpha 0.88, shown while still PLAYING — R190-A) and
  the EXIT-CONFIRM modal (alpha 0.72) swallow only PIXI hits (`eventMode = 'static'`). `Controls` listens
  on the raw canvas, so BOTH buttons still act on the board under them — a held tower stamps, a spark
  is grabbed, a right-click raids. None of the LMB gates know them either. Fix shape (one predicate,
  both buttons): inject a `setCoveredBy(() => codex visible || connection-lost visible ||
  exitButton.isConfirmOpen())` into `Controls` beside `draftOverlay.setCoveredBy` (`main.ts:2042`) and
  return at the top of `onDown`/`onUp` while covered. Needs main.ts (hotspot) — the merge owner's call.

- The rage latch is FIGHT-gated (S168 post-audit), so a Warlord raging at the whistle keeps the red bit
  through BUILD and is re-judged on the first FIGHT tick (both windows long over by then). Pre-existing
  shape (before S191 he stayed red forever); flagging because "25 seconds" is now visible as a length.
