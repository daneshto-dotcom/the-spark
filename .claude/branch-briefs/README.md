# S182 — THE PARALLEL SPLIT · 6 BRANCHES

Every brief in this folder is **self-contained**. A session opened against one of them does NOT need
to read a handoff, a backlog, or this session's transcript. Read your brief, read `SPARK_CANON.md`,
read the project `CLAUDE.md`, and work.

Everything in these briefs was **verified against the tree this session** by 40+ research agents, each
recon followed by an adversarial refute pass. Where a claim is unverified it says so. Where a number
is Claude's rather than the owner's it says so.

---

## The six branches

| # | brief | branch | owns |
|---|---|---|---|
| 1 | `01-net-bandwidth.md` | `s182/net-bandwidth` | the peer-lag fix — the biggest win in the list |
| 2 | `02-mp-identity-and-sheet.md` | `s182/mp-identity` | seat identity, P2 sheet access, portraits, labels |
| 3 | `03-placement.md` | `s182/placement` | build legality, castle keep-out, cost preview |
| 4 | `04-damage-truth.md` | `s182/damage-truth` | damage numbers, the Voltkin bleed, turret table |
| 5 | `05-lightning-hub.md` | `s182/lightning-hub` | the hub art pilot + the 24-frame ramp |
| 6 | `06-arcade.md` | `s182/arcade` | shared leaderboard, sudoku consistency, the stage ladder |

**All six are safe to run at once.** Their file sets are disjoint except for three watch files listed
below, which the merge owner resolves.

---

## ⛔ THE RULES EVERY BRANCH FOLLOWS

1. **Commit to YOUR branch. Never push `master`.** `deploy.yml:25` fires on a push to `master` only —
   that is the property that makes this parallel plan safe. The orchestrator session merges.
2. **Read every gate's exit code from a captured `$?`.** Never through a pipe, and never trust the
   wrapper's `[exited with code 0]` line — it is the harness, not the gate.
   ```bash
   npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK_EXIT=$?"
   npx vitest run > /tmp/vt.log 2>&1; echo "VITEST_EXIT=$?"
   npm run build > /tmp/bd.log 2>&1; echo "BUILD_EXIT=$?"
   ```
3. **Run `npm run e2e:gating` before any commit that moves UI geometry or touches the sim.**
4. **No failed command is passed over.** A non-zero exit is a FINDING until investigated or
   explicitly ruled benign *with the reason written down*.
5. **Enumerate a rule's SITES before claiming it is applied.** This project's signature defect is a
   rule applied at some of its sites. `grep -rn "<clause>" src --include=*.ts | grep -v "\.test\."`
6. **The four-sites law**: a wide field needs factory + serialize + hash + worker. ⚠ There is a FIFTH
   site this repo's own tests do not cover — `src/state/workerSim.ts`. Check it.
7. **Source-text tripwires, not just behaviour tests.** S181 shipped 8 defects green because the
   failure mode was *unreached code*. When you add a rule, assert each call site exists.
8. **Never invent a damage or HP number.** `SPARK_CANON.md §2` is the one ladder. A number that is
   YOURS says so at the constant, with the measurement behind it.
9. **Write source and long prose with the file tool, not a heredoc.**
10. **A delegated hunt is an accelerator, never the verdict.** If an agent run dies, hand-run the lane.

## Determinism

The host simulates; peers apply snapshots. No `Math.random`, no wall clock, no float accumulators in
the sim. Every target scan is a total order: squared distance, then an explicit id compare.
`hashWorldStateFull` is the wide oracle and is test-only.

## ⚠ THE THREE WATCH FILES

Shared across branches. Keep your edits tight and localised; the merge owner resolves conflicts.

| file | who touches it | how to stay safe |
|---|---|---|
| `src/main.ts` | 1, 2, 5 | append in your own region; never reformat or reorder imports |
| `src/state/save.ts` | 1 (`netSnapshot`), 4 (`applySnapshot` wipes) | different functions — do not touch the other's |
| `src/constants.ts` | 3, 5 | append your constants at the end of your own section |

**The bundle charter is 1000 KiB and 147.8 KiB of headroom is SHARED between all six of you.** If
your branch adds weight, say so in your final report.

## When you finish

1. All gates green, exit codes captured.
2. Commit to your branch with a message that says what you verified, not just what you changed.
3. Push your branch (**not** `master`).
4. Report: what landed, what did not, every gate's exit code, anything you ruled benign and why,
   and any **open gate** you hit (a decision only the owner can make).

## ⛔ OPEN GATES

Some briefs contain a **GATE** — a decision only the owner can make. If you hit one: **stop that
item, do everything else, and report it.** Do not guess, and do not quietly pick a default.
