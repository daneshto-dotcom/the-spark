# S195 PROGRESS — s195/ci-budgets

NEXT STEP: DONE — final report below; merge owner integrates. Nothing in flight.

## FINAL REPORT (S195 · s195/ci-budgets) — 2026-10-05
- **tip**: `git log -1` (this commit); work commit b9d3c9e4 on top of base 1cee3822 = the integration tip
  (`ccr-26eaab43-fa9mg3` had NOT moved — `git merge-base --is-ancestor` true, no merge, no conflicts).
- **Gates (exit codes in .tmp-gates/)**: `npm run typecheck` **0** · `npx vitest run src/ci.` **0** (6 files, 102 passed /
  2 skipped; `ci.e2eLanes` 20/20) · `npm run build` **0** — entry **1189.9 KiB** (cap 1250, headroom 60.1). ⚠ That is the
  integration tip's OWN number, **+0.0 KiB from this branch**: `git diff --name-only 1cee3822..HEAD` holds only e2e/,
  .github/, src/ci.e2eLanes.test.ts and .md files — none is in Vite's entry graph. · `npx playwright test <4 specs> --list`
  **0** (29 tests in 4 files load — the LOCKED §15.4 load-time check; e2e/ is not type-checked). No e2e was RUN: the
  change is timeouts only, and the 2-/3-peer specs cannot form here (net-mp: unreachable relays, 40–60 s connects).
- **Derivation table** (every number READ by `ci.e2eLanes.test.ts` from the spec / helper constant, never a literal):
  | lane | specs × timeouts × attempts | seconds | min | PW / job |
  |---|---|---|---|---|
  | e2e-lobby (retries 2) | 3 × (LATE_JOINER_BUDGET_MS 330 s + 4 × LOBBY_2PEER_BUDGET_MS 120 s) | 2430 | 40.5 → 41 | **41 / 49** (was 29/37; 8-min gap kept) |
  | e2e-quarantine (retries 0) | sum of 16 tests' own budgets: 2700 + Sym F 240 + Sym I 240 (−2 × 60 default) + hostmig:29 (300 − 240) | 3120 | 52 | **52 / 60** (was 46/54) |
  | soak / render / gating / races / worker-bots / protocol | untouched | | | |
- **Mutations** (each one side only, each RED, tree restored, lanes test GREEN again, exit 0):
  yml lobby PW 41→29 ⇒ `e2e-lobby PW_GLOBAL_TIMEOUT_MIN=29 cannot hold 2430000 ms` · yml quarantine PW 52→46 ⇒ `cannot hold
  3120000 ms over 16 tests` · helpers LOBBY_2PEER_BUDGET_MS 120→180 s without yml ⇒ `PW=41 cannot hold` · Sym F's
  setTimeout deleted ⇒ `Sym F must call test.setTimeout(TWO_PEER_BUILD_BUDGET_MS)` · hostmigration:29 300→240 ⇒ `the
  takeover completed just past 240 s`.
- **What changed**: `e2e/helpers.ts` exports `LOBBY_2PEER_BUDGET_MS = 120_000` (⚠ MINE — 2× the slowest measured pass,
  59 s; docblock carries the run-37047025269 evidence); `test.setTimeout(LOBBY_2PEER_BUDGET_MS)` in smoke S46 Baseline,
  join-stall :85/:109, exit-match MP; Sym F + Sym I `test.setTimeout(TWO_PEER_BUILD_BUDGET_MS)` (T20's held-back lines);
  hostmigration:29 `240_000 → 300_000`; e2e.yml lobby 41/49 + quarantine 52/60 with their job comments; `ci.e2eLanes`
  lobby pin reads the helper constant and enumerates the four call sites (count pinned at 4), quarantine pin names Sym
  F/I/hostmig:29; CLAUDE.md gates line + LOCKED_DECISIONS §15.4 (new first bullet — §15 had NO lobby/quarantine budget
  sentence before; created rather than edited) in the same commit. The e2e.yml HEADER lists no numeric budgets, so it
  needed no edit (only the per-job comments do).
- **Not touched, by brief (d)**: no gating/soak/render budget, no assertion in any spec, no retry added, no
  `PROTOCOL_VERSION`.
- **Bump verdict: NO — CI only.** Nothing on the wire or in the sim; two builds that shake hands compute the same world.
- **NOT DONE**: nothing from the brief. Environment caveat only: the raised budgets are verified by derivation and the
  pins, not by a green CI run — the merge owner's next master run of `e2e-lobby` / `e2e-quarantine` is the measurement.
  e2e `--list` ran on the container's Chromium 1194 slot.

## Spec (from S195_PROGRESS_net-mp.md SEAMS (a)/(b), measured on CI run 37047025269)
- (a) e2e-lobby: four 2-peer tests at 120 s ⇒ 3 × (330 + 4 × 120) = 2430 s ⇒ PW 29→41, job 37→49.
- (b) e2e-quarantine: Sym F + Sym I at TWO_PEER_BUILD_BUDGET_MS (+360 s), hostmigration:29 240→300 s (+60 s) ⇒ 3120 s ⇒ PW 46→52, job 54→60.
- (c) CLAUDE.md gates line + LOCKED_DECISIONS §15 + yml comments, same commit.
- (d) no gating/soak/render budget touched; no assertion changed; no retry added.

## Log
- worktree opened at 1cee3822; rules + yml + ci.e2eLanes.test.ts + specs read.
