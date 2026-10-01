# S192 BACKLOG — everything S191 leaves owed (written at S191 close, 2026-10-01)

⛔ Read first: `SPARK_CANON.md`, `.claude/plans/S190_OWNER_RULINGS.md`, `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §0
(every S191 owner ruling, verbatim), `.claude/plans/S191_DISPATCH_LOG.md`, `.claude/plans/S191_AUDIT_DIGEST.md` (every
S191 audit finding). The owner ALSO has a NEW list from his weekend playtest with friends (bugs found) — take it first.

## 0 · WHAT IS LIVE (deploy #5 = `d5c9c49`, PROTOCOL **52**, verify-deploy 4/4, looked at: title renders, 0 console errors, `/pitch-masters/` 200)
- `s189/weld` **at c7436a2** (NOT its round 5): C2 "exact to build, contains to survive" (welding onto a tower no longer
  dissolves it), `ownBondIdLimit` identity, DORMANT Helga + revive at both phase edges (R190-J), orphan raze, bot raids on
  own connectors, W-FR1..3, the DORMANT seam census fix. ⚠ A welded structure is still UNREPAIRABLE live (R185-B as of S185) —
  the owner has since ruled per-tower repair (R191-A) → round 5 below.
- `s189/net` at 02e493d **minus FIX-3** (reverted `70d90fc`): C4 reconnect (leave once, 8 s retry past the grace, 180 s
  give-up, seated-survivor gate), C5 per-peer latest-wins snapshot backpressure, C6 lobby-age seat rule, per-match id
  (NETFR-1/2), NETFR-3 minimal, begin latch, Escape repeat guard + guards.
- Pitch Masters (another session pushed 38 commits to master during the pause) — merged untouched, no overlapping files.
- Gates on `d5c9c49`'s tree: typecheck 0 · vitest 0 (412 files) · build 0 (972.7 / 1100 KiB) · e2e:gating 70/70 ·
  e2e:races 5/5 · net specs 16/17 (the red = `reconnect-hard-blip` @quarantine-flaky = the known C4 timing, §B).

## A · BRANCHES CARRIED — each has its worktree, progress file and (where run) its audit. Merge `master` in FIRST (all are
## 83–115 commits behind), re-run gates, then audit → fix → merge one at a time (S182 lesson 3).
| branch · worktree | tip | state | next |
|---|---|---|---|
| `s189/weld` · s189-weld | 002cd42 | round 5 (R191-A: per-tower FIX/SCRAP in a welded structure, `ownPrimitiveIds` identity, tower + structure cards) BUILT, audited RED | fix the round-5 findings in the digest (IDENTITY-1 a paid FIX that never re-registers, IDENTITY-2 shared shape → lowest spawner, SHEETS-1 phantom DOWN towers + FIX over-charge, SHEETS-2 clicks after a welded card closes, SEAMGATES-1 endstats seam …), re-audit, merge; THEN round 6 (R191-B FIX-by-gatherer, the owner's full spec in PDR §0 incl. his late answers: no shape → keep gathering, fetch when one appears; a repair in flight at FIGHT waits in the castle and lands next BUILD; FIX ALL button; nearest source that HOLDS the type) |
| `s189/net` · s189-net | 02e493d | on master except FIX-3 | ROUND-1 (MED): redo FIX-3 with the auditor's `clockStartedHostAbsent` flag shape (digest), ROUND-2 (LOW) migrationCase for a no-roster client (deposed host rejoined), ROUND-3 (LOW) FIX-4 guard holes; **FIX-2 per the owner** — host quits a 3+ seat match → the next in line hosts, a returning ex-host is a NEW lower seat ("he's like player three"); SEAM-1 terminal overlay text while still retrying; then **C4 retry tuning** (step 8 of `.claude/plans/S191_BRIEFS/net.md`) |
| `s191/carry` · s191-carry | 0339771 | rounds 1–2 built (C-1..C-6, hub blast 120 TOTAL split, bag bursts spare the owner, canon truth, **overkill CARRIES** per the owner) — round 2 NOT audited | finish C-8 (castle hit/heal numbers — failing tests parked in `.claude/plans/S191_C8_pending/`), C-9 (Ra above buildings, rune ring on the ground), C-7 (health bar on the star — weld is on master now), canon §5b text; then ONE audit of the whole branch |
| `s191/perf` · s191-perf | 0b0fef6 | done, byte-identical (twin-match differential 45 000 ticks); -43 % / -32 % host tick | audit (never ran), merge; owner Q: `pickNavUnit` returns a unit killed earlier in the same tick |
| `s191/addons` · s191-addons | 629854e | rounds 1–2 done (rage 25 s + cooldown, frenzy never sets a Warlord, Alt footer, R190-G right-click surfaces, modal cover, CI lane split, magic-attack DESIGN doc) | re-audit (stopped at 98 % budget — NOT DONE), merge; the magic-attack doc `.claude/plans/S191_MAGIC_ATTACK_DESIGN.md` goes to the owner |
| `s191/owner` · s191-owner | 9f1a657 | Scorched Earth (FIGHT-only tint, aimed cast, double, half rate on structures, bots) + the SYSTEMIC stock fix (chewers / HELLSPAWN / drones persist through BUILD) — audited, findings in the digest | apply the owner's later answers (Helga is NOT immune; a fallen caster's ENEMY-zone cast stops, his own zone keeps burning), fix the audit findings, re-audit, merge |
| `s191/endstats` · s191-endstats | eb1c53d | END-OF-MATCH STAT BOARD v1 BUILT (table + SCORE/BUILT graphs, R20 placings, lazy chunk) — never audited, never looked at on screen | audit, LOOK at it, merge (wide footprint: damage.ts, hostTick, main.ts — merge LATE); seat attacker for the hub blast + scorch (digest BLAST-2) |
| `s191/tune` · s191-tune | bfe84c2 | research only; item-1 draft patch `.claude/plans/S191_TUNE_ITEM1_DRAFT.patch` | owner rulings: Ra perk column = **35 fifths TOTAL, split** across everything it hits (a structure = one target; Pharaoh boss stays 300); castle no-build radius **121 → 61** with the porch slots kept clear — build, test, audit, merge |

## B · OPEN / OWNER QUESTIONS STILL OWED (one plain-words batch, each with a recommendation; none block)
- C4: `reconnect-hard-blip` lands only after the grace (Trystero `answeringTtlMs` 23.3 s) — the tuning is in net's step 8.
- NETFR-3 stronger shape (a seat whose own transport died never claims) vs the residual L+22 s window.
- Weld W-FR7: bots weld their frontier into their own towers — ANSWERED "keep it for bots" (S191).
- `pickNavUnit` targeting a unit killed earlier in the same tick (perf finding).
- Magic-attack class design (`S191_MAGIC_ATTACK_DESIGN.md`) — headline: under "ignores DEF" one Ra column one-shots tier-9 bosses.
- ANSWERED in S191 (do not re-ask): see PDR §0 — overkill carries; rage-through-BUILD fine; warlord-specific rage; host
  succession; bags never hit their owner; hub blast 120 total split; Ra 35 total split; castle zone halved; scorch rules;
  FIX-by-gatherer rules; chewers no cap; Voltkin defends first.

## C · CARRY-FORWARDS from S191_BACKLOG §C still open
`structureTargets` is now the biggest wave-5 cost (33.7 % at 120 creatures) · delta encoding (wire ~113 KiB at wave 5) ·
the empty-bank wide-hash false mismatch after a worker INIT (found twice) · castle units' `spawnedAtTick` not bit-exact
through a worker save · other projects' `.claude/` litter (owner's word needed) · `glue_pdr_unlock` hook key order ·
scratch copies left by auditors in the S191 scratchpad (~1.3 GB, guardrail refused `rm -rf`).

## D · PROCESS LESSONS S191 PAID FOR
- Multi-agent audits with 2 verifiers per finding cost ~2–4 M subagent tokens EACH; three ran at once and hit the org
  spend limit twice. Next time: one audit at a time, verifiers only for MED/HIGH.
- Search by the project's name for a feature ("END-OF-MATCH STAT BOARD"), not the owner's words of the day.
- Another session can push to master while you are paused: `git fetch` before every push (S191 deploy #5 was rejected once).
