# S193 — PROGRESS: s193/bots (bot personalities, R193-AI)

## FINAL REPORT — FIX ROUND (after audit FIX FIRST)
- **Merge:** `git merge master` → **4bcbd50b** (master was 8ffd4146 = c09365e deploy #20 + visuals-boss), **no conflicts**; npm install 0. Trial merge vs current master b72e7790: clean.
- **Gates:** typecheck **0** · vitest `--maxWorkers=3` **0** — 486 files / 4 skipped, **7495 tests passed** / 11 skipped, 0 errors · build **0**, entry **1062.1 KiB** (1087585 B) vs master 8ffd4146 1061.9 KiB (1087358 B) = **+227 B**; cap 1250, headroom 187.9 KiB.
- **Bump verdict: still NONE.** All changes are host-only bot decisions; the only intents used (FEED_TOWER, DROP_SPARK) are existing allowlisted ones dispatched locally.
- **HIGH (endgame lock):** `chooseGoal` skips TOWER + the whole loose-BUILD block (BUILD/ORDER/PULL) when `isBuildLocked`; the controller DROPs a carried shape and goes IDLE (returns for the tick — `me` is stale after the drop); `chooseFeed` reserves nothing under the lock and runs for every personality incl. `feed: never` (⚠ MINE, Q-F). REACH (real frame lifecycle, lock at a BUILD start, wave forced 27, one of each shape banked): **15 cells MID/HARD/IMBA × 5 → 0 lock rejects, feeds ≥ seats with a feedable tower**; mid-haul case 0 rejects, hands empty; wave-26 negative. Mutations: brain BUILD skip removed → 762 rejects (red); controller drop removed → 831 rejects in the mid-haul test (red; the 15-cell test alone did NOT catch it, hence the extra test); `never && !locked` reverted → 0 feeds (red).
- **MED-1:** absolute pins replaced by a differential — bare tier config (persona never read) vs explicit BALANCED, 4 cells × 300 s, frame lifecycle; plus old-harness bare-manager == BALANCED. No absolute pin kept (none survives an unrelated merge). Negatives: IMBA BALANCED ≠ bare; non-BALANCED lobby ≠ bare. Mutation (BALANCED saveHold 1700) → 4 red.
- **MED-2:** `endgameS193.test.ts` census botBrain 12→13, verdict "…; chooseFeed: own spawners; a pants owns none".
- **LOW-1:** spec §0 names TYCOON's `buildCooldownTicks` ×0.8. **LOW-2:** SABOTEUR tagline "eats links, hits leader"; `BOT_TAGLINE_MAX_CHARS` = 27 by arithmetic (196 px free / 7.2 px), every tagline + the NOOB lock line pinned, with a layout guard.
- **Found + fixed in my tests:** vitest "Timeout calling onTaskUpdate" (all green, exit 1) — back-to-back synchronous matches starve the worker's RPC; fixed with a macrotask yield in `afterEach` and one match per `it`. Benign: `pentagramBuildability.test.ts.snap` LF rewrite after every full vitest run (git diff empty; pre-existing; never committed).
- **MINE / owner questions:** Q-A IMBA goblin floor for all styles [keep] · Q-B no raid-rate lever for aggressive styles [keep Q2] · Q-C leader pile-on [allow] · Q-D names + numbers [as built] · Q-E IMBA Warmonger vs Tycoon separation [tune next] · **Q-F leftovers also feed RACE towers, and under the lock every personality feeds [keep]**.
- **Teams seam (written down, not built):** `leaderTargetSeat` must skip `sameTeam` seats; the bot lobby needs a 4-chip re-layout (a team chip at ≈ −120 collides with the race chip [−162, 22]).
- **Other merge seams:** overlay PANEL_W 860 / RACE_X; BotManager 3rd arg; makeWorkerSim factory 3rd param; botRaAction focusSeat; towers ignite only in `runGodlyMatcherCore` (runHostTick-only harnesses never ignite).
- **NOT DONE:** visual/e2e check of the lobby rack; IMBA tuning (Q-E); bots still never FIX (REPAIR_STRUCTURE) — not in scope, no bot emits it today.

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
- [fix round] gates green (tc 0 / vitest 0 7495 / build 0, +227 B). DONE — awaiting light re-audit.
