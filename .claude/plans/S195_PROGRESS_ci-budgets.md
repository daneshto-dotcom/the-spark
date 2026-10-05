# S195 PROGRESS — s195/ci-budgets

NEXT STEP: gates — mutation (yml PW back to 29 / 46 → lanes test must go RED, restore), typecheck, build, `playwright test --list` on the 5 edited specs, ci.* suite; then final report.

DONE: (1)–(5) in one commit — specs, helpers constant, yml 41/49 + 52/60, lanes pin, CLAUDE.md + LOCKED §15.4.
OLD NEXT STEP: (1) export `LOBBY_2PEER_BUDGET_MS` from e2e/helpers.ts and call it in the four 2-peer lobby tests; (2) Sym F/I + hostmigration:29 timeouts; (3) e2e.yml lobby 29/37→41/49, quarantine 46/54→52/60; (4) re-pin ci.e2eLanes; (5) CLAUDE.md + LOCKED_DECISIONS §15 in the same commit; (6) gates + mutation.

## Spec (from S195_PROGRESS_net-mp.md SEAMS (a)/(b), measured on CI run 37047025269)
- (a) e2e-lobby: four 2-peer tests at 120 s ⇒ 3 × (330 + 4 × 120) = 2430 s ⇒ PW 29→41, job 37→49.
- (b) e2e-quarantine: Sym F + Sym I at TWO_PEER_BUILD_BUDGET_MS (+360 s), hostmigration:29 240→300 s (+60 s) ⇒ 3120 s ⇒ PW 46→52, job 54→60.
- (c) CLAUDE.md gates line + LOCKED_DECISIONS §15 + yml comments, same commit.
- (d) no gating/soak/render budget touched; no assertion changed; no retry added.

## Log
- worktree opened at 1cee3822; rules + yml + ci.e2eLanes.test.ts + specs read.
