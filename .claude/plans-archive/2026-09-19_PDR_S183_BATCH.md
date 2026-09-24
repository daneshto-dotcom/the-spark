# PDR — S183 BATCH (Full tier)

STATUS: COMPLETED (3 of 4 priorities; P3 carried forward, see below)
Approved: owner, 2026-09-19 — *"Go — all three branches"* + *"Fade on everything"*

## OBJECTIVE

Audit the S182 six-way merged tree that nobody had reviewed as a whole, then ship the owner's four
new tower damage ramps, make the shapes and connectors under every tower actually disappear, and fix
the defects the audit confirms.

## SCOPE

- **P1 — the merged-tree audit.** 8 lanes over `d76074a..HEAD`, each pipelined find → verify →
  adversarial-refute, dispatched as TWO independent runs so a spend limit could cost one round rather
  than the audit (S161).
- **P2 — Branch A, "you only see the tower."** A transparent-sheet intake, four atlases, four
  `RAMP_SPECS` entries, the spawner aura fading with the cover, a defender cover publish path, and
  the reveal moved to the crumble.
- **P3 — Branch B, retaliation.** R183-A/B/C/D.
- **P4 — Branch C, the caption + the audit's confirmed defects.**

## APPROACH

Three parallel git worktrees, one self-contained brief each, every brief carrying measured numbers
rather than descriptions. Merge owner = the main session: each branch audited by an agent that did
not write it, gates re-run by the merge owner rather than read from a claim, merged ONE AT A TIME
with the full suite between every step.

## RISKS, AND WHAT THEY COST

- ⭐ **Every branch shipped defects while reporting green** — the S182 measurement held exactly. The
  audits caught a HIGH (a click box on the wrong half of every tower), a MEDIUM (a future-stamped
  leaderboard run that was immortal) and three behavioural defects in retaliation.
- ⚠ **Shared bundle charter** across three branches — re-measured on the merged tree, never trusted
  from a branch.
- ⚠ **e2e cannot be trusted from a worktree** (sibling dev-server adoption) — run only by the merge
  owner on the merged tree.

## TESTING

typecheck · typecheck:server · vitest · build (bundle charter) · check:atlas · e2e:gating, every exit
code from a captured `$?`, never a pipe and never the wrapper's trailing line.

## ROLLBACK

Per-branch merge commits are `--no-ff`, so any branch is revertable as one commit. 190 restore points
via `claude-rollback.py --list`.

## SUCCESS CRITERIA — MET

Live at spark-online.space, `verify-deploy` 4/4 twice. Final gates: typecheck 0, typecheck:server 0,
vitest **5349 / 322**, build **878.8 KiB of 1000**, e2e:gating **68 passed, GATING_EXIT=0**.

## OUT OF SCOPE (stated up front, still out)

The SEVER_BOND free-cut cheat vector (pre-existing, deserves its own decision) · the bomber's
below-50% fallback · NONET polish · the end-of-match stat board.

## ⛔ P3 CARRY-FORWARD — NOT DONE

Branch B was built (`0f0d68d` on `s183/retaliation`, worktree preserved) and its audit found three
behavioural defects it had not reported, including that its central determinism claim is false as
written. The fix round was dispatched and **the agent died on the org monthly spend limit**. Per the
S161 rule a dead agent run is not a completed lane, so this is recorded NOT DONE. **Nothing from
branch B is on master.**
