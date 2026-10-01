# S193 — PROGRESS: s193/bots (bot personalities, R193-AI)

Branch `s193/bots`, worktree `.claude/worktrees/s193-bots`, base master `a638565b`.

## Log
- [step 0] worktree created from master a638565b, npm install exit 0. Read rules, R193-AI, BOT_INTELLIGENCE_DESIGN §10.
- NEXT: read bot code (src/bots/*), canon bot sections; then research → S193_BOTS_RESEARCH.md.
- [step 1] S193_BOTS_RESEARCH.md written (13 sources). NEXT: S193_BOTS_SPEC.md + HTML (5 personalities × 4 tiers knob table).
- pre-change baseline (master a638565b, world seed 0xb07, bot seed 0xbeef, 200 s): [NOOB,MID,HARD]=3272847274 [HARD,MID,HARD]=2679319443 (benign: a stray 'cp /dev/null /dev/null' exited 1 — my typo, no effect)
- [step 2+3] spec v2 + HTML (Desktop copy) + Council R1 ledger. NEXT: build src/bots/botPersonality.ts, wire brain/controller/manager/worker/main/overlay.
- [step 4a] personality table + brain/controller/manager/worker/main/overlay wired; typecheck 0. NEXT: botPersonality.test.ts (baseline hash identity, signature, determinism), then gates.
- [step 4b] botPersonality.test.ts 19/19 (identity hashes, table rules, brain unit+neg, REACH signatures, determinism); mutations MUT1 (adapt at HARD) + MUT2 (Fortress order) both turned it red, restored. Finding: towers only IGNITE in runGodlyMatcherCore (main/worker), not runHostTick — the old firstTowerSpeed-style harness stamps towers that never become spawners. NEXT: full gates.
