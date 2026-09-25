**STATUS: IN-PROGRESS — S191 worktree agent `s191-endstats` (branch `s191/endstats`). Merge owner = the main session.**

# S191 PROGRESS — `s191/endstats` (owner item 3: end-of-game stats)

Brief: `.claude/plans/S191_BRIEFS/endstats.md`. Rules: `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §4 (+ S189 PDR §4).

## Done
- **Step 0** — `npm ci` in this worktree: `NPM_CI_EXIT=0` (captured `$?`, "added 116 packages, and audited 117 packages in 9s"). Branch `s191/endstats` at `42cc2ee` (master + the S191 plan commit). Progress skeleton committed `66dd0cc`.
- **Step 1** — the search. **THE RESEARCH EXISTS. It was filed as the "END-OF-MATCH STAT BOARD"**, which is why an "end of game" grep misses it. Hits below.

## Step 1 — every hit (path:line)

### A. The research itself (lives ONLY in session transcripts / workflow journals — never written into the repo)
- `~/.claude/projects/<spark>/9a13a4d1-fd1d-481d-b444-12c1625d6e74.jsonl:610` — **S179, 2026-09-15, the owner's ask**: *"look at games like Dota … any really grand strategy or real-time strategy … tower defense games like Legion TD2 … a stat board to show how many units were built by each character, how many buildings or connectors were built, how much damage was done … taken … healed … with even graphs … For now, we'll do like a simplified version."*
- `…/9a13a4d1-…/subagents/workflows/wf_8afd6d5c-769/journal.jsonl` (script `…/9a13a4d1-…/workflows/scripts/spark-endgame-statboard-research-wf_8afd6d5c-769.js`) — **the 3-lane research + synthesis** (631k subagent tokens): lane `research:genre` (LTD2 manual + v3.15/v4.04 notes, Dota 2 Dark Rift + ONE Esports, AoE2 score wiki, SC2 Liquipedia, Civ VI, Total War — all URLs in the journal), lane `research:inventory` (what SPARK tracks), lane `research:design` (house panel pattern), and `synthesis` = **"SPARK — End-of-Match Stat Board, v1 proposal"** (ASCII mock, stat table, storage, protocol verdict, 5 owner questions).
- `…/9a13a4d1-….jsonl:821` — S179 PDR presenting it to the owner; `:2117` "End-of-match stat board v1 — researched, design ready" (approved, carried).
- `…/045e266f-ad5d-42ef-8455-d5b431760d51/subagents/workflows/wf_ede94c48-3f4/journal.jsonl` — **S180 re-run** ("statboard A.0", 1.78M tokens): probes world-counters / free-stats / match-end-ui / damage-attribution / castle-damage + verifiers. `…/045e266f-….jsonl:674` "confirmed my hand counts and found that structure damage threads no attacker at all. Parking it."
- `…/57700746-1a3e-4c9b-9cf9-aac822d2fb2b/subagents/workflows/wf_e207af7f-bcf/journal.jsonl` lane "END-OF-MATCH STAT BOARD — empirical state-discovery (A.0)" — **S181/S182 recon**: the WIN_TRIGGER teardown trap, `scoreByPlayer` is a spendable wallet, `matchPlacings` violates R20 (survivors by seat, not score), `damageConnector` has no attacker, Tier1/Tier2 split, 14 tests owed.
- `…/57700746-….jsonl:946` — **S181 owner**: *"stat board … We had it defined last session or two sessions ago … It's gonna be a whole big session working on end of the game stat board."*
- Owner S191 (relayed by the merge owner): *"how many units were built, how many units were killed of each type … the graphs showing like all the players and how much they have built and like compared to each other."*

### B. In-repo record of it (main checkout)
- `HANDOFF_S179_2026-09-16.md:77, :97, :105` — "research complete, v1 designed, build not started".
- `.claude/session-archive/session-state_S187_2026-09-23.json:725` (priority "End-of-match stat board v1", `carry_reason` "research + v1 design COMPLETE and recorded"), `:900`, `:2444` ("its own big session later").
- `S180_BACKLOG.md:131-137, :196` — the recon summary (tracks none of the five stats; finishing order computed, consumed by a log line; TAKEN cheap; DONE 14 sites; structure damage no attacker; one line of text).
- `S182_BACKLOG.md:27` (no v1 design DOCUMENT exists), `:59` (P6 Tier 1 + ⛔ THE TRAP), `:70` (B2 "what goes on it" — now answered by his S191 words), `:108`.
- `HANDOFF_S180_2026-09-17.md:22, :107`; `HANDOFF_S181_2026-09-17.md:114`; `HANDOFF_S182_2026-09-18.md:73, :99`; `.claude/plans/2026-09-19_PDR_S183_BATCH.md:58`; `STRUCTURE_EXTENSION_DESIGN.md:122` — deferral lines.
- `src/state/elimination.ts` docblock (~:155-162) — "the postgame board off `matchPlacings` … render-only when it comes".
- Adjacent, NOT the stat board: `SPARK_Blueprint.md:130, :536` + `SPARK_v0.6_DESIGN.md:278` + `BACKLOG.md:1198` (v0.6 "Endgame Ceremony + trophy mint" — a 28 s cinematic, different feature); `.tmp-gates/research/W2.json` (Dota talents / AoE4 / LTD2 legion spells — the S187 upgrade-draft research, not end stats); `.claude/plans/2026-09-16_PDR_S180_CHARACTER_SHEETS.md:45-48` (SC/AoE unit panels, not end stats).

### C. Memory folder + BRAIN
- `~/.claude/projects/<spark>/memory/` — **zero hits** (grep exit 1 = no match; benign, verdict recorded).
- `Founder DNA/BRAIN/` — **no stat-board research**. Only unrelated "endgame"/"red alert" words (estate governance, parking plan). `data_collection/PC_DEEP_SCAN.json:237` lists *Command and Conquer Generals* installed — context for his taste, not research.

## In flight
- Merge-owner REDIRECT received: skip web research; write a SHORT spec from the record + his words; then IMPLEMENT v1 in slices without waiting (he considers it designed).

## Next
- Re-verify the recon against the CURRENT tree (it is 10+ sessions stale: PROTOCOL 46→51, castle 1500→2500, attacker attribution may have moved with retaliation §9b), write `.claude/plans/S191_ENDGAME_STATS_SPEC.md` (≤ 120 lines), commit; then slices.

## Decisions
- Branch taken: **2a (implement)**, on the merge owner's redirect — the research + a v1 proposal exist; his S191 words answer the one open question (B2 "what goes on it").

## Numbers that are MINE
- _none yet_

## Hotspot hunks
- _none yet_
