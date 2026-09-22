# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-22 | Session: S186 | LIVE + verify-deploy 4/4

## ⛔ READ `SPARK_CANON.md` FIRST — §3b, §3c AND §4b ARE ALL NEW

⛔⛔ **`PROTOCOL_VERSION` IS 48. S186 SHIPPED ALL FOUR PRIORITIES BELIEVING NO BUMP WAS NEEDED, AND
ITS OWN END-OF-SESSION AUDIT PROVED THAT WRONG.** The reasoning stopped at *"no new field"* — but
`tickGameState` is run by **every peer including the client** and gates on `winScoreForWave`, so two
builds both advertising 47 would shake hands and then disagree about when the match ends. ⭐ **The
precedent was already in `protocol.ts`**: 39→40 says *"⛔ THE BUMP IS FOR THE RULE, NOT FOR THE
FIELD … Both peers run that function."* **The question is never "did a field change?" — it is "can
two builds that will shake hands disagree about anything either of them computes?"**

Three new canon sections, all pinned by `canon.test.ts`:
- **§3b** the dynamic win bar — his table, his inclusive boundary, and the two calls that are MINE
- **§3c** the quarry — one shared faucet, the band step-up, and the empty-quarry finding
- **§4b** the edge rule — NOT a bottom rule, bounded by melee reach, and why the FOOTER is the real
  blocker. ⚠ It said *symmetrical* until the audit measured 15 of 19 recipes and found otherwise.

## ⭐ THE THREE LESSONS FROM S186

**1 · EVERY LANE'S ADVERSARIAL VERIFIER FOUND SOMETHING REAL. EVERY ONE — INCLUDING THE AUDIT THAT
OVERTURNED THE SESSION'S OWN PROTOCOL CALL AND FOUND MY MOJIBAKE, MY TAUTOLOGY-GUARD, AND THREE
FEATURES GUARDED ONLY AT WAVE 1.** Not a style note — the
list: a worker-divergence bug I had written minutes earlier (`window` read per tick, invisible to
vitest because jsdom shares one window); a differential-test oracle that had silently diverged from
production and agreed only at wave 1; a proposed spawn formula that was an algebraic NO-OP *whose own
proposed guards all passed on it*; the fatal flaw in the obvious carry fix; and three false claims in
my own verification bindings. **A branch that reports "done, gates green" is a branch with
undiscovered defects in it** — S182 said so and S186 reproduced it exactly.

**2 · WHEN TWO ANALYSES DISAGREE ABOUT A CAUSE, ONLY THE REAL LOOP SETTLES IT.** One lane blamed
`FREE_SPARK_SOFT_CAP`; its verifier argued a pool cap cannot throttle an arrival rate. I drove
`stepPhysics` through a whole BUILD and FIGHT: peak pool at wave 6–7 was 18–19 against a cap of 24, so
the cap was **not** binding and the owner's own hypothesis was right. ⭐ **And the same fixture then
found what neither side was looking for** — the quarry is EMPTY at every BUILD whistle from wave 2 on.

**3 · AUTHORING VERIFICATION BINDINGS IS NOT VERIFYING; RUNNING THEM IS.** 42 bindings, and the
verifier refused three. One of them **passed vacuously** — a needle that could never have been in the
file. A binding that cannot fail is worse than no binding, because it reads as coverage.

## Next Steps

1. **HIS PLAYTEST IS THE SIGNAL.** Two balance changes landed that he will feel in the first match —
   the rising win bar and a quarry that is ~60 % faster from wave 6. Both carry numbers that are MINE
   and are one line each to retune.
2. **The empty quarry** — measured, pinned in canon §3c, **deliberately not fixed**. The spawn
   dispatch is BUILD-gated but the TTL reap is unconditional, and FIGHT (3600 ticks) far outlasts the
   TTL (600), so `pool@FIGHT-end` is **0 at every wave**. The fleet is released onto nothing and walks
   ~870 px as one pack — *"waiting in line and not moving"*, verbatim, and no faucet number removes
   it. One line fixes it; it is a balance change he has not been asked for.
3. **#5 is now ONE question**: *do you want the footer moved?* The dead band and the footer stand on
   the same ground, so geometry alone cannot give it to him. ⚠ **Ask this first:** a loose SHAPE has
   no edge rule at all and can already be placed there — if he was dropping shapes rather than
   stamping a tower, the blocker was a footer plate and never this rule.
4. **The castle no longer matches the points race** (canon §3b). `CASTLE_MAX_HP` stays 2500 while the
   bar climbs to 50,000, so castle-rush gets stronger the longer a match runs. Left unchanged on
   purpose; he may want to watch one long match and rule.
5. Re-explain `SEVER_BOND` as an invisible wire field — still owed from S185.
6. Voltkin rework · bot personalities · wave-gated upgrades · idle animation rows · the chewer radar
   cadence and `keystoneTelegraphRenderer` defects carried from S185.

## Blockers

- **On him:** the footer question (#5) · idle-loop art for four towers · Voltkin's new look ·
  bot-personality definitions · per-race upgrade designs · the orphan-worktree token · and above all,
  playing what landed today.
- **Nothing is blocked on CI or infrastructure.** Remote healthy, 0 unpushed, deploy verified 4/4.

## Pending Backlog

`S182_BACKLOG.md` and `S180_BACKLOG.md` are the older forward lists. ⚠ Verify every line before it
reaches him — S180 found four already-done items presented as live scope.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — **S186 at the top (9 entries)**, then S185/S184/S183/S182.
⚠ The 50-entry cap fired at handoff: S181's 20-entry block was pruned (54 → 34). It is not lost —
pruned blocks live on in `.handoff-archive/`.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-22\The-Spark.jsonl`
- Last decisions:
  - **Probe, then have a DIFFERENT agent try to refute.** It found something real in every lane,
    including two bugs in code I had just written.
  - **Measure through the real loop when a cause is contested.** It arbitrated the argument and then
    produced the finding neither side had.
  - **Mutation-test against the PLAUSIBLE wrong implementation**, not an absurd one. The spawn-ramp
    mutation was literally the no-op a rejected proposal would have shipped.
  - **A required parameter beats a tolerant default.** 16 compile errors, all in tests — which was
    itself the proof production was fully wired.
  - **Assert the match count on every patch, and detect the file's EOL first.** `ui.ts` is CRLF while
    `constants.ts` is LF; an anchor written with the wrong one silently matches nothing.
  - **Run the verification bindings.** Three of mine were false and one passed vacuously.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read FIRST (§3b, §3c, §4b are new)
  - [x] latest HANDOFF: `HANDOFF_S186_2026-09-22.md`
  - [x] traces jsonl path above
