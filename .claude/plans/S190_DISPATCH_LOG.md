# S190 — DISPATCH LOG (executing `.claude/plans/2026-09-24_S189_BATCH_PDR.md` §3)

Merge owner: the main session. If this session is cut off, the next one resumes from THIS file + each
worktree's `.claude/plans/S189_PROGRESS_<name>.md`.

## Step 0 — boot + CI verdicts (2026-09-24)

- Boot gate: all 11 required reads done. `git worktree list` = the ten worktrees of PDR §0, all clean, all
  with `node_modules`. Session-state rolled S189 → S190 (S189 archived at
  `.claude/session-archive/session-state_S189_2026-09-24.json`), verified in a separate call.
- ⛔ **CI E2E run 35972498981 (15035b9, live deploy #2) concluded FAILURE, not green.** `e2e` 2 failed /
  56 passed and hit the 720 s lane cap (11 of 69 never ran); `e2e-quarantine` 2 failed; `e2e-soak` 1 failed.
- ⛔ **And it is not new: E2E has been RED on EVERY master push since `a145db4` (S187 castle upgrades,
  2026-09-23 06:21Z)** — 12 consecutive non-green runs; last green `ed0029d` (06:08Z). Deploys ship
  regardless (separate workflow). Recurring signatures: `hunter.spec.ts:68` + `worker.spec.ts` +
  `worker-heap.spec.ts:354` all time out on *"a gatherer banks a shape into the local castle"*;
  `nplayer.spec.ts:168` full-table render; the 720 s lane cap.
- The **cancelled** 5c6615f run: `e2e-quarantine` (20 min) and `atlas-guard` (10 min) were killed at their
  `timeout-minutes`; its `e2e` job itself FAILED (hunter.spec, 720 s cap).
- Verdict: **OPEN — dispatched to a read-only investigator** (below). Not waived: local 69/69 on a quiet
  machine does not explain a CI red that starts at one commit.

## Step 1 — dispatched in ONE message

| what | kind | id |
|---|---|---|
| disconnect hunt (6 lanes: transport, wire, exceptions, load+C5, coverage-history, quickmatch C6) + verify + critic | Workflow | run `wf_01cef74d-ce3` |
| audits — `input-layer` (2 lenses) | Workflow | run `wf_add47999-96a` |
| audits — `wrath` + `swarm` (4 lenses) | Workflow | run `wf_89457ca4-08d` |
| audits — `ra-vfx` + `draft-atk` + `canon` (3 triage) | Workflow | run `wf_bb8ad4d6-b51` |
| `s189-units` — §5.2 | Agent (background) | see session transcript |
| `s189-weld` — §5.3 | Agent (background) | see session transcript |
| `s189-render` — §5.4 | Agent (background) | see session transcript |
| `s188-ra-vfx` — §5.5 | Agent (background) | see session transcript |
| CI-red diagnosis (read-only; may run one spec) | Agent (background) | see session transcript |

Script edits before the re-run (facts only, no re-plan): both S189 scripts said master = `8c369c4` =
deploy #1 and that an e2e run was in progress; corrected to master `441c832` = deploy #2 (src identical to
15035b9; deploy #1→#2 touched no `src/net`, no `main.ts`), `s188/deploy2-candidate` merged + deleted, and
master's real lead over each branch (27–96 commits). The hunt gained lane F (C6 quickmatch seat — the net
brief needs it and no lane covered it) and lane D now owns C5 (lag). The audits script takes `args` (branch
names) so it runs as three groups — one limit hit costs one group (S161), and train A can start the moment
input-layer's audit lands.

## Owner approval, S190 (verbatim)

> *"After a full and complete boot sequence, you already have the plan from last session. I approve the full
> session priority batch. And full independent agent run and work trees work on all priorities in
> parallel."*

This OVERRIDES the PDR's sequencing where it held work back: Council R2 M3 ("no net dispatch before the
hunt") and §3 Step 2/3 ("dispatch draft-atk / fix rounds after the audits"). Owner ruling over Council. What
stays, because it protects the result rather than delaying it: an auditor still audits code it did not
write, and nothing merges without its verified findings.

## Step 1b — every remaining priority dispatched in parallel (same message)

| priority | agent | phase |
|---|---|---|
| P0 | `s189-net` | full brief now: strictPort → C6 → C5 measure → C4 own diagnosis + reproducing test; hunt's verified findings forwarded by message; no C4 fix commit without agreement or a reproduction |
| P6 | `s188-draft-atk` | PHASE 1 read-only (its triage is reading the branch): confirm bug + failing reach test (untracked) + strike-site table + salvage verdict → PHASE 2 on my message |
| P2 | `s188-input-layer` fix agent | PHASE 1 read-only: baseline gates, merge-tree prediction, own independent review → PHASE 2 = merge master + fix ONLY confirmed findings |
| P3 | `s188-wrath` fix agent | same shape |
| P4 | `s188-swarm` fix agent | same shape (merges after wrath) |
| P10 canon | `s188-canon` agent | PHASE 1 read-only: claim table vs master + drafted assertions → PHASE 2 merge master + text/assertions together; train-E deltas left marked |
| P10 infra | `p10-infra` | fix `pdca-context.sh` string-id parse (backup + replay test); DIAGNOSE the session-state race (`router-telemetry.sh` et al.) — no fix |

All new agents run `npx vitest run --maxWorkers=6`: ten suites share 32 cores, and a timeout-shaped red is
re-run alone before it is called a defect (S189: two reds were load).

## Results as they land

- **CI-red verdict — (B) CI-environment timing, NOT a code regression; nplayer:168 was (C) a stale fixture,
  already fixed at 5c6615f.** ⚠ CORRECTION to Step 0 above: it is **8** consecutive non-green master pushes
  since a145db4 (7 failure + 1 cancelled), not 12 — the 12 counted older failures in the 60-run window.
  Verified by hand: `e2e/helpers.ts:87` `pullFromBank` waits 30 s of WALL CLOCK for a sim event; the tick-bounded
  `waitForWorldWithinTicks` (`helpers.ts:512`, S143) exists and is unused there. The sim advances only with
  rendered frames; the slow (software-GL) runner's in-match frame time rose ~+11-13 % at S187 P1-P3 (fba461f,
  BEFORE a145db4 — the draft batch) and ~+15 % more at S188, roughly fixed per frame → inferred (not A/B-proven)
  `DraftOverlay.render` redrawing its panel every frame for the whole BUILD. First bank lands ~650-800 ticks;
  30 s needs ≥22-26 t/s; S188 runs manage 17-18. The lane also sits at ~94-100 % of its 720 s cap even when
  green, so fixing hunter/worker alone will NOT turn it green on a slow runner. 5c6615f's `cancelled` = a
  transient `actions/checkout` hang (10 min) in atlas-guard, not the atlas script. Evidence:
  `scratchpad/ci/` (durations.json, table3.txt). → **SCOPE AMENDMENT SA-S190-1 PROPOSED to the owner (R16), not
  started**: `pullFromBank` → tick-bounded wait; split `worker-bots` into its own gating job (the `e2e-races`
  pattern, + `ci.e2eLanes.test.ts`); `timeout-minutes: 3` on checkout. The draft-overlay frame cost went to
  `s189-net` as a C5 lead (report-only — draftOverlay.ts is outside its boundary).
- **Group C triage landed (14 agents, 0 dead).** draft-atk: finish the salvage (DA-1 HIGH confirmed: no strike
  reads `creatureAttackFifths`) — its own phase 1 found the same independently → PHASE 2 sent. canon: CANON-1..10
  → PHASE 2 sent (merge master, deploy-#2 facts, §3d live truth, restore the goblin-ceiling warning; train deltas
  left PENDING; §6 version line is the merge owner's). ra-vfx: RAVFX-1 (flat top edge on frames 21-23, MED
  confirmed), -5, -7, -8, -10 → FIX ROUND sent; RAVFX-6 deferred to after wrath.
- ⛔ **MERGE ORDER CHANGE (RAVFX-4, confirmed): `s188/ra-vfx` merges BEFORE `s188/wrath`** (head of train B, or
  train A if it is clean first) — wrath relies on ra-vfx to ship `l10-mummies.webp`; wrath-first ships WRATH OF RA
  with no card art and forces a test patch ra-vfx then conflicts with. ra-vfx contains master cf40f41, so it
  merges without conflicts. Train C is now render → units → weld.
- **MERGE-OWNER DEBTS (do them in the step named):**
  - at the WRATH merge: `raStrikeArt.test.ts:112` `.raStrike!` → `.raStrikes[0]!`; `draftOverlay.test.ts:283`
    16 → 17, delete `AHEAD_OF_THEIR_PERK` + its union, fix the :271 comment (RAVFX-2/3).
  - at the SWARM merge: `draftOverlay.test.ts` :283/:297 → 18, drop :298, retitle; add `l10-vampires` to
    `scripts/build-upgrade-cards.py` CARDS.
  - after wrath: RAVFX-6 (painter's order across per-charge `drawRaColumns` calls); RAVFX-9 (wrath's icon window,
    measured on the l0 card, slices the l10 card's eye-discs — wrath fix agent / owner's eye).
  - at EVERY train bump (B → 51, D → 52): `SPARK_CANON.md` §6 version sentence + its `canon.test.ts` pin (~:153)
    on master in the same commit (CANON-8), and ONE docblock per bump listing every reason (B: raStrikes +
    t3BatSwarm; D: `Creature.atkFifths` + the birth-bake, + net's per its report).
  - CANON-9: `castleRegen.ts` docblock + §6's castleHp sentence — after s189/units lands.
- **OWNER QUESTIONS accumulating (report, never block):** APEX ×4 · SWARM ×11 · does a drafted ATK pick buff a
  boss SKILL with its own stat line (the Pharaoh's Ra column) or Helga? (built: NO — creature strikes only) ·
  CANON-5 castle regen % of base vs the upgraded max (the PDR chose upgraded max, s189/units) · CANON-10 §6's
  bump-reason wording · the Ra strike draws UNDER unit sprites.
- **P5 `s188/ra-vfx` — READY (verified by the merge owner, not only claimed)** → reopened for the fix round above. Tip `bb9d31d`: 15 cases in
  `raStrikeArt.test.ts` (mutation-tested ×2), master `cf40f41` merged in with ZERO conflicts, gates 0/0/0 after
  the merge (6011 tests, 946.3 / 1100 KiB, branch cost 2.1 KiB), `check:atlas` 0; `git diff master s188/ra-vfx --
  src/state src/net src/bots` EMPTY (re-checked here). Merge-owner debts for train C: after `s188/wrath` lands,
  `raStrikeArt.test.ts:112` `castStrike()` reads `.raStrike!` → must become `.raStrikes[0]!` (one line); the only
  file shared with wrath is `src/render/bossAuras.ts` and merge-tree says it merges clean. Known, NOT fixed,
  outside an art brief → owner report: the Pharaoh's 5th column never shows its explosion (the sim removes him
  on that impact tick); the strike draws UNDER unit sprites (a mushroom cloud can sit behind units north of it).
  Not looked at on screen — do so after deploy #5.

## ⛔ SPEND-LIMIT STOP (~70 min in) — and the resume

The org monthly spend limit killed 11 named agents + 16 workflow jobs at once (hunt: 5 verifiers,
coverage-history lane, critic; audits A: 2 verifiers; audits B: swarm:sim lane + 6 verifiers). Landed on
disk before the stop (commit-every-step held): net strictPort + C6 (2bbcd20) · units C3 test + C8 (82b4040)
· weld C2 repro + fix (4f2bc9a, + 4 uncommitted files mid-step) · render C1 + C7 (78eefed, + 1 untracked
test) · draft-atk master merged (5391d0e, + untracked reach test). Resumed after the reset: all three
workflows via `resumeFromRunId` (completed agents replay from cache), eight agents via SendMessage with
their context. input-layer went straight to PHASE 2 (the audit's two lenses had landed; IL-M1 conflict
recipe, IL-B1 vacuous e2e, IL-1/IL-B2 hover-under-draft, IL-2 RMB put-back, one doc commit; IL-3/IL-Q1 and
IL-4 are owner questions). wrath / swarm fix agents held until audits B's verifiers land.

## Results after the resume

- **P10 infra — item 1 FIXED, verified, committed (`~/.claude` 3f9d8ee).** Not a string-id bug: `lib/glue.sh:416`
  split with `IFS=$'\t'`, and TAB is IFS-whitespace, so EMPTY fields collapsed and shifted left (SPARK
  priorities have `title`, no `name`) → the bogus "Pin_progress" + "[GATE LOCKED]" pair, AND the gate failed
  OPEN for a truly unapproved priority. `\x1f` separator; replay V1-V6 before/after; `bash -n` 0; LF kept;
  hermetic hook test 11/12 → 12/12. Backup `lib/glue.sh.S190.bak`. Found-not-fixed: titles print "unknown"
  (a `.title` jq fallback needs JSON-escaping at `pdca-context.sh:223`), `false` reads as absent (jq `//`).
- **P10 infra — item 2 DIAGNOSED (race reproduced 5/5 in a sandbox).** The hot-path writer is
  `router-telemetry.sh:49-118`: on EVERY tool call it rewrites the whole session-state via tmp+mv under a
  one-shot lock — byte-identical for SPARK (no `tool_calls_this_turn` key) — and a session's unlocked write
  landing between its read and its mv is reverted. One run took 12.8 s under today's load. Also unlocked:
  `glue_pdr_unlock`, `glue_statusline_watchdog`. Litter: hooks killed at timeout never run their trap (73
  empty tmp files); zombie lockdirs are never swept (1,772 reclaims logged for SPARK, 8,308 all projects).
  → **SCOPE AMENDMENT SA-S190-2 PROPOSED (global hooks + deletions → owner):** take the counters off
  session-state (sidecar file), guard the rare hook writers (skip byte-identical mv; compare-and-swap),
  sessions write tmp + `os.replace`; sweep `tmp.*` > 10 min and `lockdir.zombie.*` > 1 min. Nothing deleted.
- **P9 `s189/render` — DONE, verified (tip 1675ca2; +3-line follow-up in flight).** C1: the cursor-following
  thing is the LOCAL CRUISER, and the cause was `draftOverlay.ts` `zIndex = 900` on a zIndex-sorted stage —
  deleted, and the panel's staging line moved before `bringLocalToFront()`. Seam checked by the merge owner:
  `characterSheet.bringToFront()` runs once at startup (`main.ts:1298`), so the panel stays above the card and
  input-layer's click guard stays honest. C7: bare `g.arc()` in the S188 swirl drew a line from the previous
  shape's end — `moveTo` per arc (the S86 hazardRing fix); no lerp change. LOW (b) elite piranha fallback.
  LOW (a) NOT fixed (needs a sim-side heal record, outside a render boundary) — pinned by a test that goes red
  when it lands → owner/carry-forward. Gates 0/0/0, 6028 tests, 944.4 KiB (+0.2). Wire: none.
  Follow-up sent: the same stray-line bug at `bossAuras.ts:359/366` (Kraken sonar) + `raceMotifs.ts:100`
  (rainbow sites skipped — archived).
- **Merge notes from render:** `goblinRenderer.ts` fallback block conflicts with s188/swarm → resolve as
  `type === 't3BatSwarm' ? 't3Bat' : type === 't3PiranhaElite' ? 't3Piranha' : null`, then add the swarm case
  to render's "no other type has a fallback" test. After input-layer + render both land: fix input-layer's
  isOver docblock ("the zIndex-900 plate") and `controls.ts:726` ("the card is drawn ABOVE everything").
- **Audits A verifiers: IL-M1 + IL-B1 both CONFIRMED** (correction forwarded: `__SPARK__` has no draft seam —
  click the general tile at derived coordinates).

- **C5 MEASURED by `s189-net` (b72a4c4) — the wave-5 lag is HOST SIM CPU, O(creatures × bonds).** Real 4-seat
  bots match to wave 5 (~250 prims / ~550 bonds): ≤17 creatures 1.3-1.9 ms/tick; the brother's 120 creatures
  **8.22 ms mean / 12.5 p95 / 96 max**, ×3 ticks/frame → the sim cannot hold 60 Hz. Profile: `structureTargets`
  69 % → `findNearestBondTarget` 65 % (every bond × every creature × every tick) + `spreadEnemyTarget` 42 % self.
  Wire is also above the canon: ≈113 KiB / 9.3 Mbit/s per peer on a real board (canon 84 / 6.88 was a ~1.0
  bonds/prim fixture). `maxEhp` = 11.2 B/buffed creature — not the lag. DraftOverlay renders only while the
  LOCAL seat owes a pick (hidden at wave 5) → it explains the CI soak lane (seat 0 never picks), not the owner.
  → **NEW BRANCH `s190/perf`** (worktree off master 554dbd7; `creatureAI.ts` is untouched by all ten other
  branches — checked): a pure perf change with a byte-identical-output oracle (reference implementation +
  per-tick `hashWorldStateFull` differential incl. mid-tick sever/creation). No bump if identity holds. Rides
  train C (or its own deploy). This is P0's C5 fix — inside the approved batch, not a scope amendment.
  → net continues: latest-wins snapshot BACKPRESSURE in `transport.ts` (10 Hz × 113 KiB fire-and-forget into
  Trystero; below 9.3 Mbit/s it queues unbounded and Trystero drops after 10 s → client starvation — a candidate
  C4 mechanism), reproduction through the real Trystero action wire first.

- **P9 render follow-up** `fd8d90b` (Kraken sonar rings + naga fallback crest `moveTo`; test mutation-proven) —
  verified; `bossAuras.ts` auto-merges with ra-vfx and with wrath (merge-tree). → **independent AUDIT running**
  (`s190-branch-audit.js`, run `wf_1ddae473-5ee`, 2 lenses + verify). Every S189/S190 branch gets this audit
  before it merges (S182 lesson 1) — the script is generic (`args` = branch, worktree, base, brief, lenses).
- **P8 `s189/weld` core DONE (code tip f870446)**: survival = "the tower still CONTAINS its recipe" (new
  `src/state/towerMembers.ts`), building still EXACT (keeps recipes from overlapping). Cause: each recipe check did
  "is a tower here?" AND "does the live tower still stand?" with an exact-equality test — a drop bonded to the
  laser hub (8 bonds ≠ 6) → removed within 0.5 s; pentagram/Helga demanded the whole component = blueprint
  (S158 B2b never applied to them). 29 tests incl. brother's joiner path, two towers welded both survive, host-vs-
  worker hash differential; gates 0/0/0 (6026, 948.4 KiB, +4.2). ⛔ A RULE EVERY PEER COMPUTES → **bump owed in
  train C**. Health bar (§9d rule 1): brother's welded turret — pool 204 vs its own star 66 → bar 83 % / art 49 %;
  the bar change (not built) must use `starPoolFifths`/`towerMembersAt`, not `hub.bonds.size`.
  → **FOLLOW-UP sent (inside C2 — these block the owner's own R185-B bat-tower example):** (1) `placePrimitive.ts`
  S107 P4 auto-bond skip means nothing can weld onto a live spawner; (2) tier-3/tier-9 race towers still dissolve
  on a same-type weld (R136 exact rule); (3) `hostTick.ts:856` hub self-destruct razes the whole connected
  structure incl. welded towers (must take only its own members; the blast itself untouched). Estimate first; stop
  and report if beyond an afternoon. Then its audit.

- **P5 ra-vfx FIX ROUND DONE (tip 696dd51)** — RAVFX-1 `ab1be03` (top feather + intake guard exit 2, atlas rebuilt,
  test decodes the shipped PNG), -8 `d9c5357`, -7 `e9bb008` (prefetch implemented), -10 `7817205`, -5 `9b98680`
  (render-only per-world tail cache for the Pharaoh finale). Gates 0/0/0/0 (6019, 947.0 KiB, branch +2.8), mechanics
  diff vs master EMPTY (re-checked here). Wrath now breaks TWO test lines (`raStrikeArt.test.ts:116` and `:560`).
  → fix round under its own audit (run `wf_3bd767c8-18c`). If clean, ra-vfx rides TRAIN A with input-layer (no
  wire change) — before wrath, as RAVFX-4 requires.

- **P2 input-layer PHASE 2 DONE (tip 7439780)** — merge d995a09 (the IL-M1 recipe), IL-B1 `43789df` (click-to-build
  resolves the draft via `generalTileRect()`; sibling case with the draft open), IL-1 `79f88ec`, IL-2 `5f44bf8`, docs
  `ac85a97`. Mutation-proven each. Merged-tree gates 0/0/0 (6185 tests, 945.1 KiB), click-to-build 4/4, no wire.
  Verified here: merge-tree vs master CLEAN, vs s188/ra-vfx CLEAN. Its own note: the Ra crosshair still shows over
  the draft plate while aiming (Ra is FIGHT-only, the draft BUILD-only → unreachable). ⚠ It warns: any OTHER e2e
  spec clicking inside the panel during the first BUILD is now swallowed → the merged-tree e2e:gating run is where
  that shows. → fix round under audit (run `wf_04c0a5e0-4c0`).
- **TRAIN A = s188/input-layer + s188/ra-vfx → deploy #3** once both fix-round audits are clean. No bump (neither
  touches the wire).

- **P10 canon PHASE 2 DONE (s188/canon, 7 commits to ac9bf69)** — master merged (no conflicts), 36 claims checked
  vs master (3 wrong: Ra aim is REFUSED off-canvas not clamped; ATK/PEN picks buy nothing live; Scorched burn
  time rounds), 6 deploy-#2 facts added, goblin-ceiling warning restored, session readings flagged MINE; +17 canon
  tests (56 in canon.test.ts), gates 0/0. Four tests are RED BY DESIGN when trains land (a new L10 perk; a caller
  of `draftedAttackFifths`; `attackCycleRaged` entering the 50 docblock; units' regen change) — each train fixes
  the canon in the same commit. ⛔ **MERGE-OWNER DECISION: canon rides TRAIN A, not E** — its tripwires make "the
  canon describes the merged tree" enforced per train instead of hoped-for at the end, and the live canon's stale
  §3d stops misleading sessions four deploys sooner. Under a one-lens audit (run `wf_1460d7a5-967`).
- **Merge-owner items for train A (docs-only, one commit after the merges):** add `Creature.attackCycleRaged` to
  the PROTOCOL 50 docblock in `protocol.ts` (a comment — it rides 50, additive-optional; canon §6 text in the SAME
  commit, since its tripwire fires); project CLAUDE.md bundle-cap line (1000 → 1100 KiB, measured) and protocol
  line (46 → "read the constant", 50 today).
- **OWNER QUESTION (CANON-10, recorded open):** deploy #1 (5c6615f) and deploy #2 (15035b9) both advertise 50, but
  #2 changed four host-side sim rules (lifesteal batch-sum, rage latch, fallen demon seat, corpse-eater re-anchor).
  Clients do not run those rules, so the exposure is a stale-tab HOST or a host-migration successor on #1. Train
  B's 50 → 51 closes the window by refusing both old builds; no separate action proposed.

- **P6 draft-atk PHASE 2 DONE (tip 9026a47)** — all 12 creature strike sites read `creatureAttackFifths`, HELLSPAWN
  inherits the parent's strike, card + fatalBlowFifths read the creature (and the S187 card HP-row bug for every
  HP/DEF-drafted unit is fixed too), mechanical `attackFifths(` census guard, host-vs-worker differential, +499 B.
  Gates: typecheck 0 · vitest **1** (6030/6031 — `canon.test.ts:342` source-text pin wants literal `attackFifths(` in
  the castle arm, which now reads `creatureAttackFifths(creature)`; ruled benign-for-now by the merge owner: the
  ladder rule holds; the re-pin `toMatch(/[aA]ttackFifths\(/)` is a MERGE-OWNER item at the train-D merge, together
  with s188/canon's red-by-design ATK test) · build 0 (944.7). Owes the train-D bump. Under a 2-lens audit (run
  `wf_05c696b4-44a`).
- **OWNER QUESTIONS were put to him in plain words (S190)** — 10 questions + 2 approvals (A1 CI fix, A2 note-script
  race + litter). Awaiting his rulings; the discriminating disconnect question is Q1 (title screen → the
  double-Escape bug; background tab → hidden-tab deposition; both in game → broken auto-reconnect).

## ⭐ DEPLOY #3 LIVE — TRAIN A (input-layer + ra-vfx + canon) · 5934d3b · verify-deploy 4/4

Integrated on `s190/train-a`, one branch at a time, typecheck + FULL vitest after every merge (6185 → 6208 →
6224+1 red → fixed → 6227). The red was a SEAM: canon.test.ts counted exactly 16 cards, ra-vfx ships WRATH's
`l10-mummies` ahead of its perk → the same UNION allowance as draftOverlay.test.ts, canon prints 17. The ra-vfx
fix-round audit's RAVFX-A (finale drawn when the deadline falls in BUILD — the ritual only runs in hostTick's FIGHT
gate) + RAVFX-B (godly abort inside the slack) were verified by the merge owner and FIXED on the train branch
(absence + `structureWatchEpoch` gates, both mutation-proven). CLAUDE.md bundle (1100 / 948.1) + protocol lines.
Gates, captured $?: typecheck 0 · vitest 0 (6227/370) · build 0 (948.1/1100) · e2e:gating 0 (70/70, machine
quiet) · e2e:races 0 (5/5). ff master → push 441c832..5934d3b → Pages success → verify-deploy 4/4.
⭐ LOOKED at spark-online.space: loads, zero console errors; solo match, tier 4 open, a click on the STINK TOWER
card over the arrow ARMED the tower and the footer STAYED UP — **C9 fixed in production.** P2 + P5 COMPLETED.
⚠ Audit lanes that died at the second limit: input-layer + canon fix-round audits (checked by hand — merge-tree,
wire diff, mutation proofs, full gates); render lens 1 (lens 2 landed: R2-1 MED click-through → sent to render).
Deferred to train B (touches protocol.ts anyway): `attackCycleRaged` in the 50 docblock + canon §6 tripwire; the
pre-existing BUILD-phase Ra columns in `drawRaRitual` (no FIGHT gate — columns 0-3 of a ritual crossing into BUILD
draw though nothing lands) → carry-forward.

- **P0/C5 `s190/perf` DONE (tip 11bc451)** — host tick at 120 creatures on a wave-5 board **6.6-7.1 → 2.5 ms mean**
  (p95 9.2-9.9 → 3.0-3.3; a 3-tick frame at p95 26-29 → 9 ms). Byte-identical: per-tick oracle vs a verbatim
  copy of the old scan + two-world `hashWorldStateFull` differential, 456 388 scans / 0 mismatches over a full
  wave-5 FIGHT with 554 severs, 564 creations, 246 shape removals injected mid-tick. Index reused only inside a
  window `runHostTick` opens around the creature loop, revalidated before every scan. hostTick.ts +12 lines. No
  bump. Next hotspot: physics 40.4 % (computeTerritorialInfluence 18 %, solveBonds 8.8 %), pickNavUnit 9.3 %
  (O(n²) enemy search), tickScoring 7.7 %. → under a 1-lens identity audit (run `wf_da0cd9c1-768`).
  ⚠ REPORTED BUG (not fixed — changes targeting output): the chewer/drone SPREAD step (`spreadEnemyTarget`) picks
  from a looser enemy set than the S162 rule → can hand a creature a bond with one of its OWN seat's shapes on it
  (the "my creature destroys my own tower" chain) — a candidate cause of the owner's C3 (units could not
  reproduce C3). → goes to s189/units with its audit findings, as a bug-fix-to-an-existing-rule (S162), not a spec
  change.

- **P0 `s189/net` DONE (tip 668952b, master 5934d3b merged in)** — C4 REPRODUCED end to end on real WebRTC
  (`e2e/reconnect-hard-blip.spec.ts`: killed the joiner's peer connection mid-match → retries at 1.4/5.5/9.5/13.7 s
  never recovered, both boards froze) and fixed: never re-join a room still leaving (≤2 s wait, each room left once),
  retry 4 → 8 s, retries continue behind the terminal overlay, a client claims host only if another survivor exists
  (⚠ behaviour change: 1v1 never self-promotes — the old path split-brained; 3+ player migration unchanged).
  Latest-wins snapshot backpressure (5 Mbit/s: worst latency 47 s → 405 ms). E3 drop-reason logs. A1 Escape-as-
  cancel fixed. C6: the room code is minted per PAGE LOAD (main.ts:280) — the owner's tab held the larger code;
  beacons now carry lobby age, the first arrival keeps the room. Backlog → CONNECTION LOST on its own: NO (it
  split-brains at ≥21 s instead). Claims no bump. Gates on the merged tree 0/0/0 (6279, 951.9 KiB). ⚠ OWED to the
  merge owner at train D: e2e `reconnect-hard-blip`, `reconnect`, `exit-match`, `hostmigration`. → 2-lens audit
  (run `wf_6bc5b278-12e`).

- **P4 `s188/swarm` PART A DONE (tip e309ff1)** — SWARM-B1 portrait fallback, SW-7 swarm sheet warmed only on the
  first frame a seat holds vampires.l10 (7 tests, 2 mutations), SW-4/5 card pipeline (script + MANIFEST from master
  + l10-vampires; regen byte-identical). Canon notes: R190-D; bite 132 vs bat 12; CRIMSON TIDE heals 66/bite > the
  60 pool. Gates 0/0/0. WAITING for wrath on master → PART B (14-perk union, one `perkDraftIndex` keeping
  LEVELS_PER_DRAFT, four draftOverlay.test.ts reds :175/:270/:283/:624, script + MANIFEST conflicts → swarm's side).
  A leftover scratch clone `%TEMP%/s190_swarm_probe1` (the guard refused to delete it) — scratch only.
- **P10 infra A2 DONE (~/.claude 0fa4ed1)** — the hot-path rewrite of session-state removed from router-telemetry.sh
  and pdca-context.sh; watchdog no longer writes; glue_pdr_unlock + pre-flight use a locked compare-and-swap
  (`state_cas_commit`); stale-lock reclaim checks the owner stamp before/after and sweeps zombies > 60 s. Race demo
  5/5 lost → 0/5. SPARK litter cleared: 258 tmp + 123 zombie lockdirs → 0 (bak / state-hash untouched). Other
  projects: 869 tmp + 309 zombies COUNTED, not deleted (their zombies will self-sweep on the next reclaim there —
  approved code; their tmp files need the owner's word). Not fixed: glue_pdr_unlock only rewrites keys AFTER
  `"status"`, so SPARK's `unlock_source` (which precedes it) is never set by the unlock (pre-existing);
  claude-rollback.py's backward-restore check now reads a frozen `tool_calls_session_total`; Rule 24 — no eval
  baseline covers any hook.

- **P9 `s189/render` ALL DONE (tip a5d6262, master 5934d3b merged)** — R190-I every hit and heal separate
  (`Creature.healedFifths`, monotonic, written at the four heal sites after the cap, additive-optional on the wire
  when > 0, full-hash only; claims no bump); R2-1 fixed (codex + CONNECTION LOST backdrops swallow clicks — confirmed
  real by reverting); R2-4 claim corrected; R190-H the Ra strike moved into goblinRenderer's arrowLayer (above unit
  sprites; still under Helga / turret rig / tower buildings → NEXT-SESSION owner question "above buildings too?").
  Limit: two hits in one host tick still merge into one number (would need a per-hit wire list). Gates 0/0/0 (6292,
  948.9 KiB). → 2-lens audit (run `wf_17627f30-0a4`) — heal counter touches lifesteal/corpseEater/bossSkills/save/
  stateHashFull, overlapping s189/units + s188/draft-atk.

- **Weld AUDIT landed (2 lenses, 5/5 MED verified CONFIRMED)** → FIX ROUND sent. ⛔ Two UNAPPROVED spec changes
  REVERTED per the owner's standing order: W1 the spare-arm/spare-ring rule (a same-type weld stood in for a cut own
  connector — several cuts harder to kill, against the brief + R185-B) → own members fixed AT IGNITION
  (spawners: `bond.createdTick <= ignitedAtTick`, no field; defenders: an ignition watermark, four sites); W2 Helga's
  FIRST build had been loosened to "contains" (a lattice Triangle could sprout a hall) → first build EXACT, and R190-J
  implemented properly as a DORMANT Helga record revived at the phase edge while her hall's own members stand (closes
  W4). Defects: W3 bots raid welds, W2-1/W5 aura + decal point at the welds, W2-2 hub raze orphans welds, W8 weaker
  differential. Recorded for next session (owner question): W9/W2-6 the narrowed P4 lock makes bots weld their
  frontier into their own towers. Protocol bump owed (rides the one bump of the combined deploy).
- ⛔ **MERGE-OWNER DECISION (context budget, 73 % at this point): trains B/C/D ship as ONE combined deploy #4 with ONE
  protocol bump (50 → 51, every reason in one docblock), integrated by an INTEGRATOR AGENT in its own worktree
  (merge one branch at a time, full gates after each, protocol six-site checklist, canon rows); the merge owner keeps
  triage, the final gates, e2e, push, verify-deploy and the live look. A branch that is not clean is left out and
  ships in a later deploy.**

## Next

Step 2 when audits land (triage → fix rounds → dispatch `s188-draft-atk`) · Step 3 when the hunt lands (net
DIAGNOSIS → dispatch `s189-net`) · Step 4 merge trains A–E.
