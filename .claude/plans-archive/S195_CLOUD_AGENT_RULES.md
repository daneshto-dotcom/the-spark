# S195 CLOUD RUN — RULES EVERY WORKTREE AGENT FOLLOWS (read this whole file before your first command)

This is the S195 continuation run on Claude Code CLOUD (2026-10-05), opened by the owner while his desktop
session is paused on its weekly limit. `S195_AGENT_RULES.md` still applies in full; this file records only what
differs on the cloud box. Where they disagree, THIS file wins.

## Layout (cloud container, Linux, 4 CPUs, 15 GB RAM)
- Main checkout (the INTEGRATION branch `ccr-26eaab43-fa9mg3`, the only branch that is ever pushed):
  `/home/user/the-spark`. ⛔ Never edit, never commit there. The merge owner (main session) owns it.
- Your worktree: `/home/user/the-spark/.claude/worktrees/<tree>` on branch `s195/<tree>`. Work ONLY there.
- ⛔ `master` is NOT touched on this run at all. The owner's desktop session merges to master on Saturday.
- Your worktree already has its own `node_modules` (copied, not shared). Do not `npm install` unless the lockfile
  changed under you after a `git merge ccr-26eaab43-fa9mg3`.

## Two trees are IN FLIGHT on the owner's desktop and are OFF-LIMITS here (their files, not just their branches)
- `s195/teams` (T12 + N1 team vision + N2 uneven teams + N3 ready-lock + N16 host moves seats):
  `src/render/zoneBackgroundRenderer.ts`, `src/render/lobbyGeometry.ts`, `src/render/seatRack.ts`,
  `src/render/botSetupOverlay.ts`, `src/state/teams.ts`, `src/state/vision.ts`, `src/net/lobbyRoster.ts`,
  `src/render/lobby*.ts`, `public/art/race-zones/**`, `public/audio/teams/**`.
- `s195/lag` (N9 measurement + N17 graphics tiers / structure render caching):
  `src/render/structureRenderer.ts`, `src/render/structure*.ts` (except `structureBarHealth.ts`,
  `structureRamp*.ts` which T19 may touch), `src/render/fx/fxRuntime.ts`, `src/render/fx/fxQuality*.ts`,
  `src/render/settings*.ts`, `src/net/transport.ts`, `src/net/lagWaveMeasure.test.ts`, `scripts/lag/**`.
- Plus the standing OFF-LIMITS: `src/arcade/**`, `public/pitch-masters/**`, `src/render/arcade*.ts`,
  `src/render/nonet*.ts`, `src/render/sudokuOverlay.ts`, any `pm-*` branch (only the T13 research tree READS nonet).
If your fix genuinely needs one of those files: STOP that item, write it as NOT DONE with the exact hunk you would
have made, and carry on with the rest.

## Gates on a 4-core shared box (up to 5 trees run at once)
- While working: `npm run typecheck` + `npx vitest run <the files you touched or that cover them>`. Never the
  whole suite mid-work.
- Before your final report, ONCE: `npm run typecheck` · `npx vitest run --maxWorkers=2` (full) · `npm run build`
  (report entry KiB; master is **1183.4 KiB / 1250 → 66.6 KiB SHARED by every tree; say how much you use**) ·
  the e2e SPECS your change touches (`npx playwright test e2e/<spec>.spec.ts`), not whole lanes. The merge owner
  runs the full lanes per landing.
- Every exit code captured into a FILE, never through a pipe: `cmd > .tmp-gates/x.log 2>&1; echo $? > .tmp-gates/x.exit`.
  A timeout-only red under load → re-run that file alone, record the verdict. Never relax an assertion.
- ⚠ Playwright here runs the container's Chromium build 1194 symlinked into the 1223 slot. Treat an e2e red as
  real until shown otherwise; say in your report that e2e ran on 1194.
- No network for live multiplayer is promised here (outbound goes through a proxy). If a relay/STUN-dependent
  spec cannot connect, record it as NOT DONE (environment), not as a flake.

## Commit discipline
- Commit after EVERY step and at least every 5 minutes (R195-0c), with:
  `git -c user.email=daneshto@gmail.com -c user.name="Oleg Neshto" commit -m "<type>(s195/<tree>): <what>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_018jdmCe7ntxGtqo67z7vpx6"`
- Progress file: `.claude/plans/S195_PROGRESS_<tree>.md` in YOUR worktree. Top line = your EXACT next step. Update
  with every commit. Your final report goes at its top too.
- Never push. Never touch `PROTOCOL_VERSION` — REPORT the bump verdict (the S186 test: can two builds that shake
  hands disagree about anything either computes?). The merge owner bumps once per landing train.
- `git merge ccr-26eaab43-fa9mg3` (not master) before your final gates; conflicts in `.claude/plans/**` → take the
  integration branch's side.

## Scope
- "Fix ONLY this" (S182 rule 5). No refactors, no tidying, no drive-by doc edits outside your tree's files and
  `SPARK_CANON.md` rows your change makes true (with their `canon.test.ts` pins in the same commit).
- Anything the owner has not ruled → build the flagged `⚠ MINE` default at its constant and REPORT it as a
  question with a recommendation. Never ask the owner directly; he is not here.
- Audit your own work before reporting (R195-0b); an independent auditor audits you again before merge.
