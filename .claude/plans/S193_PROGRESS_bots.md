# S193 — PROGRESS: s193/bots (bot personalities, R193-AI)

## FINAL REPORT
- **Tip:** see `git log -1` on `s193/bots` (report commit follows 6e2f7e9d). Base = master a638565b (branched at tip; no merge needed at start). Trial merge vs current master 31b1862d: `git merge-tree` exit 0, NO conflicts; master has not touched any file this branch changes.
- **Gates (exit codes from files):** typecheck **0** · `vitest run --maxWorkers=3` **0** — 471 files passed / 4 skipped, **7261 tests passed** / 11 skipped · build **0**.
- **Entry:** 1034.9 KiB (1059765 B) vs base 1034.7 KiB (1059553 B) = **+212 B (+0.2 KiB)**; headroom 65.1 KiB. The bot logic is in the lazy bots chunk.
- **Bump verdict: NO BUMP.** Bots run host-only (and in the host's own worker via local postMessage); vs-bots has no remote peer. The only new bot intent is `FEED_TOWER`, already allowlisted, dispatched locally. No serialized/hashed field, no new discriminant on any wire action. `BotGoal.FEED` has no wire surface (same reasoning as PULL/TOWER).
- **Benign verdicts:** (1) `pentagramBuildability.test.ts.snap` shows as modified after a full vitest run — `git diff` empty: vitest rewrites it LF over a CRLF checkout; restored, not committed (pre-existing on master). (2) a stray `cp /dev/null /dev/null` exit 1 (my typo). (3) the first base-build attempt exited 1 because my new files were present against base src — re-measured with them moved aside (exit 0). (4) temp measurement tests threw deliberately (exit 1) to print numbers; deleted.
- **MINE (owner questions, recommendation in brackets):** Q-A IMBA Fortress/Saboteur/Tycoon open with the goblin tower per your S154 IMBA rule [keep the ruling] · Q-B aggressive personalities raid at the SAME rate (Q2) [keep] · Q-C several Saboteurs pile on the leader [allow] · Q-D names + numbers: hold 900/1200/2700 of 3600, Tycoon tempo 0.8, IMBA adapt window 900 ticks [as built] · Q-E IMBA Warmonger vs Tycoon read alike in 5 min; Warmonger eager fed fewer units than Saboteur leftovers [tune next session].
- **Merge seams:** (a) `botSetupOverlay.ts` PANEL_W 640→860 and the race chip moved to `PANEL_W/2-500` — any branch touching the bot lobby layout (s193/lobby-ci?) conflicts there. (b) `BotManager` ctor gained an optional 3rd arg; `makeWorkerSim`'s factory gained a 3rd param (old 2-arg lambdas still compile). (c) `botRaAction(world, seat, focusSeat?)`. (d) ⭐ FINDING: towers ignite only in `runGodlyMatcherCore` (main/worker, after `runHostTick`) — every bot harness that calls only `runHostTick` (e.g. `firstTowerSpeed.test.ts`, `botGameplay`) stamps towers that never become spawners; use `botPersonality.fixtures.ts` `runSignatureMatch` for anything that needs towers to produce. (e) §10 Q4 (goblin first + feed leftovers) and Q6 (IMBA adapts at the bell) were UNBUILT rulings — now built for IMBA, which changes IMBA bot behaviour vs master (BALANCED below IMBA is hash-identical, pinned).
- **NOT DONE:** no e2e run of the lobby chip (no Playwright on this branch; overlay change is covered by typecheck + a source-text guard only — a visual check of the 860-px rack is owed); IMBA tuning (Q-E); NOOB personalities locked by design; Voltkin still outside IMBA's 7 rungs (Q4 "later").

## Log
Branch `s193/bots`, worktree `.claude/worktrees/s193-bots`, base master `a638565b`.

## Log
- [step 0] worktree created from master a638565b, npm install exit 0. Read rules, R193-AI, BOT_INTELLIGENCE_DESIGN §10.
- NEXT: read bot code (src/bots/*), canon bot sections; then research → S193_BOTS_RESEARCH.md.
- [step 1] S193_BOTS_RESEARCH.md written (13 sources). NEXT: S193_BOTS_SPEC.md + HTML (5 personalities × 4 tiers knob table).
- pre-change baseline (master a638565b, world seed 0xb07, bot seed 0xbeef, 200 s): [NOOB,MID,HARD]=3272847274 [HARD,MID,HARD]=2679319443 (benign: a stray 'cp /dev/null /dev/null' exited 1 — my typo, no effect)
- [step 2+3] spec v2 + HTML (Desktop copy) + Council R1 ledger. NEXT: build src/bots/botPersonality.ts, wire brain/controller/manager/worker/main/overlay.
- [step 4a] personality table + brain/controller/manager/worker/main/overlay wired; typecheck 0. NEXT: botPersonality.test.ts (baseline hash identity, signature, determinism), then gates.
- [step 4b] botPersonality.test.ts 19/19 (identity hashes, table rules, brain unit+neg, REACH signatures, determinism); mutations MUT1 (adapt at HARD) + MUT2 (Fortress order) both turned it red, restored. Finding: towers only IGNITE in runGodlyMatcherCore (main/worker), not runHostTick — the old firstTowerSpeed-style harness stamps towers that never become spawners. NEXT: full gates.

- [step 5] gates green (tc 0 / vitest 0 7261 / build 0, +212 B). Spec §9 measured table, HTML re-copied to Desktop. DONE — awaiting merge-owner audit.
- [fix round] merged master c09365e -> 4bcbd50b (no conflicts), npm install. NEXT: HIGH endgame-lock fix in botBrain/botController.
- [fix round] HIGH fixed + REACH (15 cells + mid-haul + wave-26 negative), mutations M3/M4/M5 red. NEXT: MED-1 identity differential.
- [fix round] MED-1/MED-2/LOW-1/LOW-2/Q-F/teams seam done. NEXT: full gates.
