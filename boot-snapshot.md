# Boot Snapshot (auto-generated at handoff)
Generated: 2026-10-02 | Session: S194 | deploy S194-#6 LIVE (`e9855ba9`, PROTOCOL **66**, verify-deploy 4/4 re-run at handoff on master `aca06dbb`+, entry 1165.4 / 1250 KiB)

## ⛔ READ FIRST
- `.claude/plans/S195_BACKLOG.md` — §0 live state + the five unmerged branches, **§A0 the merge owner's first job**, §A the 8 trees, §B owner questions (ask in CHAT), §C LOWs, §D process.
- `.claude/plans/S194_OWNER_RULINGS.md` (R194-1..35, all ruled — never re-ask) · `.claude/plans/S194_DISPATCH_LOG.md` (every landing, audit verdict, CI-red verdicts).
- `.claude/plans/S194_AGENT_RULES.md` → copy to `S195_AGENT_RULES.md` with the new master SHA; hand to every tree agent.
- ⛔ Pitch Masters (`src/arcade/**`, `public/pitch-masters/**`, `pm-*`, `F:/pm-s2-work`) is OFF-LIMITS. ⛔ Bumps via the six-site script; READ THE CONSTANT.

## Next Steps
1. §A0-1 `s194/rules` (T11, tip `80aaa870`, worktree `.claude/worktrees/s194-rules`) — run its owed gates on the tip (exit codes to files), light re-audit of the quick-check round (save.ts LF bytes, simMemo.generation, MED-1 halves), merge, **BUMP 66→67** (porch R194-16, pants window R194-17, mega 251st R194-26, cap 360 R194-27); `git ls-files --eol` must read `i/lf`.
2. §A0-2 `s194/visuals-6` (T4, tip `acda8b05`) — progress file says re-audit (a)(b)(c) done and gates green after merging `e9855ba9`, but the merge owner's quick check was INTERRUPTED at S194 close: re-run it, then merge. Leaves ~70 KiB bundle headroom for all of S195.
3. §A0-3 `s194/ui-upgrade` r3 (T5, tip `3d6c5696`) — audited CLEAN, owner-approved merge (R194-35); the merge owner merges it (the integrator was refused by the permission classifier).
4. §A0-4 `s194/mp` (T17, tip `c44708f4`) — merge the live-MP harness (`scripts/live-mp/`, no src); recommended.
5. §A0-5/6 — gates after EACH merge, one fresh-server e2e per deploy, `verify-deploy` 4/4, deploy every landing; write `S195_AGENT_RULES.md` before the split.
6. Trees (§A, lands order): **T21** `s195/ci-perf` (CI e2e reds fog/hunter, worker-typecheck checkout timeout, lane split, T4 re-bench) FIRST → **T22** `s195/fixes` (draftOverlay wall-clock flake, botFix timeout, worker-heap metric, chewer-at-keep, entropy follow-ups) → **T20** `s195/net-mp` (reconnect hard-blip 20–31 s vs 15 s grace, RECONNECTING heading, TURN re-paste, Sym F/I, e2e-lobby STUN) → **T18** `s195/ui-4` → **T19** `s195/coherence-2` → **T12+T14** `s195/teams-2v2-art` (36 backdrops + team music from `s194/team-music` `ab7f6237`) → **T23** `s195/art` → **T13** `s195/nonet-home` (research report only).
7. §B owner questions (33, each with a recommendation) — ask in chat at boot, not HTML.

## Blockers
- None technical. Owner-only: §B answers; team-music tracks (he presents them at S195 start); TURN secret re-paste unwrapped + tcp/443 (account action); gcp-vertex Imagen 404 (art routes via Grok stills); constitution STALE / infra alerts (his OS session).

## Pending Backlog
- `BACKLOG.md` holds no `- [ ]` lines; the live list is `.claude/plans/S195_BACKLOG.md` §A–§C. S194_BACKLOG and older lists are superseded.

## Recent Reflexion (last 2 sessions)
`.claude/reflexion_log.md` top: **S194** (integrator agent does the landings · every fix round adds a defect — 9/10 audits found one in an all-green branch · CRLF in audits: diff --stat size vs the real change · a permission refusal is not laundered by a relayed approval · the owner names the mechanism · the dev server watched sibling worktrees · measure before deciding (pants cap 360) + 8 auto-extracted per-tree lines), then **S193** (property-test the split · pin measured numbers · merge owner applies seam lists · required args ripple · the owner's reason is a requirement · …). S188/S189 pruned to keep ≤50 entries.

## Muscle memory (auto) [Vigil]
- Traces: `C:/Users/onesh/.claude/traces/2026-10-02/The-Spark.jsonl` (S194 row = last line; TRACE-VERIFY PASS host CHTEAUDECHAZEU)
- Last decisions:
  - Six deploys, each audited by a non-author agent and verified 4/4; PROTOCOL 62→66 in four bumps.
  - One integrator agent did merges/gates/deploys so the merge owner stayed light; 3 deploys landed while trees ran.
  - 9 of 10 audits found a real defect in an all-green branch — the audit is the product, not the author's gates.
  - A merge refused by the permission classifier was NOT pushed through on a relayed approval; the owner approved live (R194-35) and it is carried to the merge owner.
  - Measure before deciding: pants cap 360 chosen from 250/500/1000 live-pants measurements.
  - vite.config ignores `.claude/worktrees/**` (watch + dep scan) so main-checkout e2e stops timing out.
- CLAUDE_LOOP: **closed** (`.claude/CLAUDE_LOOP.json`, no open loop)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF path: `HANDOFF_S194_2026-10-02.md` (archived in `.handoff-archive/`)
  - [x] LOCKED_DECISIONS.md (repo root)
  - [x] traces jsonl path above
