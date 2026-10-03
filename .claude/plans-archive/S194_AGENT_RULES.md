# S194 — RULES EVERY WORKTREE AGENT FOLLOWS (read this whole file before your first command)

Repo root (main checkout, MASTER — never edit, never commit there):
`C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
Your worktree is under `.claude/worktrees/<name>`. Work ONLY there, on your own branch.

## Read first
1. `SPARK_CANON.md` (main checkout) — how the game IS. Never re-ask anything it answers.
2. `CLAUDE.md` (main checkout) — the project rules (determinism, four sites, stat ladder, gates, hunts).
3. Your own progress file (named in your brief; S194 trees: `.claude/plans/S194_PROGRESS_<tree>.md` in YOUR worktree) — it holds your EXACT next step. Update it with every commit.
4. Owner rulings: `.claude/plans/S192_OWNER_PLAYTEST_LIST.md`, `S192_OWNER_RULINGS_teams_magic.md`, `S192_OWNER_ENDGAME_SPEC.md`, `S190_OWNER_RULINGS.md` (main checkout).

## Hard rules
- ⛔ **THE ARCADE IS OFF-LIMITS** (owner, S192 + S194): never edit `src/arcade/**` (Pitch Masters), `public/pitch-masters/**`, `src/render/arcade*.ts`, `src/render/nonet*.ts` (NoNet), `src/render/sudokuOverlay.ts`, or any `pm-*` branch; exclude them from every enumeration/tripwire.
- ⭐ Owner, S194: the S192–S193 Pixi fx work *"looks a lot better … for everything … So let's keep that up."* New visuals build on `src/render/fx/*` (deterministic emitter, pooled sprites, `fxQuality`, `?fx=legacy`).
- ⛔ Never push. Never touch `master`. Never edit `PROTOCOL_VERSION` — REPORT a bump verdict (the S186 test: *can two builds that shake hands disagree about anything either computes?*). The merge owner bumps.
- First step: `git merge master` (master = the merge owner's current master — `git log -1 master` (deploy #23 + S194 PDR)). Conflicts in `.claude/session-state.json`, `.claude/plans/**`, `HANDOFF_*`, `boot-snapshot.md` → take MASTER's side. Source conflicts: resolve on their merits, list each in your progress file.
- ⛔ **SAVE PROGRESS EVERY 5–10 MINUTES** (owner, S193 — the session may hit its limit overnight): a WIP commit + one line in your progress file saying the exact next step, even mid-task. Never write scratch into the MAIN checkout — only inside your worktree (`.tmp-gates/`).
- After `git merge master`, run `npm install` in your worktree before building (pixi-filters 6.1.5, owner-approved S192, lockfile-pinned).
- **Commit after EVERY step** (spend limits kill agents): `git -c user.email=daneshto@gmail.com -c user.name="Oleg Neshto" commit …` with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gates**, each exit code captured into a FILE, never through a pipe (`cmd > log 2>&1; echo $? > exit`): `npm run typecheck` · `npx vitest run --maxWorkers=3` (8 worktrees share one machine; a timeout-only red → re-run that file alone and record the verdict) · `npm run build` (report entry KiB; shared headroom ~128 KiB across 8 trees (entry 1121.9 / 1250) — say how much you use).
- e2e only on your worktree's own port (the config hashes it per worktree — never adopt another worktree's server; never use 5173).
- Determinism: no `Math.random`, no wall clock, no float accumulators in the sim; every target scan is a total order (squared distance, then id).
- A new hashed field = the `…Hashed` union + the string projection + the per-field test. A wide field = factory + serialize + hash + worker.
- Stat ladder: pool = HP×(1+0.2·DEF)×5, damage = ATK×(1+0.2·PEN)×5. Never invent a number on its own scale.
- No unapproved spec changes. Anything the owner has not ruled is built as a flagged `⚠ MINE` default at its constant and REPORTED as a question — never asked by you directly.
- Python file writes: `open(p, 'w', encoding='utf-8', newline='')`. Never `unicode_escape`. CRLF-tolerant source-text tests (`\r?\n`).
- No new npm/pip packages without the merge owner (who asks the owner).
- Every failed command is a FINDING until resolved or ruled benign with the reason — write the verdict down.
- A source-text guard proves a line EXISTS, not that it is REACHED: pair every guard with a REACH test through the real host tick / Controls / renderer model.
- Per fix: arithmetic, a REACH test, a negative test, one mutation-tested guard.

## Your final report (in your last message AND at the top of your progress file)
tip SHA · merge SHA + conflicts · each gate's exit code + counts · entry KiB (+delta) · bump verdict with the reason ·
what is MINE (owner questions, one line each, with a recommendation) · merge seams the merge owner must know · anything NOT DONE.
