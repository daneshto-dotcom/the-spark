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

## Next

Step 2 when audits land (triage → fix rounds → dispatch `s188-draft-atk`) · Step 3 when the hunt lands (net
DIAGNOSIS → dispatch `s189-net`) · Step 4 merge trains A–E.
