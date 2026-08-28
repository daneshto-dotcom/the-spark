═══════════════════════════════════════════════════════════
    SCOPE AMENDMENT — S156 (Rule 16)
    FINISH WHAT S155 LEFT, PLUS TWO COMBAT/BOT RULINGS
═══════════════════════════════════════════════════════════

Status: IN-PROGRESS
Parent: `.claude/plans/2026-08-28_SCOPE_AMENDMENT_S155.md` (A1/A2/A3 had owner GO and were
NEVER EXECUTED — S155 stopped early on a false "budget" call that Rule 0 has since forbidden).
Tier: **Full** (5 priorities, combat-rule change + a default flip)

## OWNER APPROVAL (verbatim, 2026-08-28)

> **Q1 — the free first strike.** *"if you truly arrive first but what does arriving first even mean?
> deeper in enemy territory? they all have if two units have similar speed then who arrives 'first'?
> stupid way to think about it. random generator when two units collide is the smarter for now but
> actually the real fix is to give all units attack speed which we will do later - the only real
> solution!"*
>
> **Q2 — bot tower timing.** *"bot in hard and imba should build the first tower whenever the tower
> they want to build is available!!! can even be 30 sec!"*
>
> **Q9/Q10 — the batch.** *"fix those three things this session and then i found lots new bugs to fix
> right after so get cooking on everything you can here autonomously and i will tell you what to do
> after - approved!"* … *"get to it - approved!"*

⚠ **Q1 OVERRULES MY RECOMMENDATION, AND THE OWNER'S REASONING IS BETTER THAN MINE.** I argued for
keeping arrival-order as "legitimate tactics". The owner destroyed the premise rather than the
conclusion: with units of near-identical speed, *"who arrived first"* is not a skill signal at all —
it is a tiny positional accident that the engine then amplifies into a total win. My d20 objection
was that a roll re-introduces "one side takes zero damage"; the owner accepts that consciously as a
**stopgap**, and named the real fix (per-unit attack speed) as a later change. Proceeding as ruled.

---

# P1 — RAID TARGETING BECOMES A LADDER  (inherited A1, owner GO twice)

Bots target *"the leader OR the nearest enemy whose score sits closest above their own"* — each bot
punches ONE RUNG UP. Today they hit the NEAREST enemy connector and never read the scoreboard.
⛔ **Rate and budget are UNTOUCHED.** `MAX_DISRUPTION_CHARGES=2` is the owner's settled balance
(§10 Q2: *"dont change raid rate or number of allowed raids"*). This changes **only which target is
chosen**, which is why it does not collide with that prohibition — targeting vs rate are orthogonal.

# P2 — THE SAVING BOT SCOUTS, AND THE FOG FINALLY APPLIES TO IT  (inherited A2, owner GO)

> *"a saving bot doesnt need to look passive he can explore the map, see what his neighbors are
> building and if they are building where."*

ONE change, not two: the per-seat vision substrate shipped INERT in S155 P7 because blinding a bot
without giving it a way to LOOK makes it dumber rather than fairer. Scouting is the missing half.
Known consequences to absorb: three `botGameplay` cases pin FIGHT verbs in a BUILD fixture and need
re-homing, and a `carry-1 violation: player 2 already carries 60` surfaces and must be DIAGNOSED,
not silenced.

# P3 — SEED `defenders` IN THE WORKER DIFFERENTIAL, THEN FLIP `WORKER_DEFAULT_ON`  (inherited A3, owner GO)

> *"lets make it all work and then flipp it"*

The gap is COVERAGE, not hashing: `defenders` IS hashed, but the differential records
`peak.defenders === 0` across all 300 frames, so the guard sits green having compared nothing.
Seed a live defender that survives re-validation → FORCE the guard to fail on divergence → then flip.
⚠ Only 5 of 21 e2e specs carry `?worker=`, so the flip silently re-points the other 16 onto the
worker path. **Re-run `e2e:gating` AFTER the flip, not before.**

# P4 — RANDOM INITIATIVE WHEN TWO UNITS COLLIDE  (NEW, owner ruling Q1)

Replaces S155 N1's strict same-tick simultaneity: on a mutual engagement a deterministic roll decides
who strikes first. **Explicitly a stopgap** — the owner named per-unit attack speed as the real fix,
NOT this session.

⛔ **THE ROLL MUST NOT DRAW FROM A SEQUENTIAL RNG STREAM.** `hostTick.replay`,
`workerSim.differential` and `botController`'s same-seed test all depend on the *draw order* of the
shared streams. The roll must be a **stateless hash** of values both host and client already agree
on (the repo's `mix32` seagull idiom), so it is a pure function of world state, reproducible from a
snapshot, and adds zero draws. A roll that shifts draw order would trade a combat bug for a desync.

⛔ **AND IT MUST NOT RE-CREATE N1.** The original bug was that ONE side systematically never took
damage. A roll is only acceptable if it is *symmetric per engagement* — the same pair must not
resolve the same way every tick, or the loser of the first roll is invulnerable-in-reverse and we
have shipped N1 with extra steps.

# P5 — HARD AND IMBA BUILD THEIR FIRST TOWER AS SOON AS IT IS AVAILABLE  (NEW, owner ruling Q2)

Measured S155 on a representative 4-seat real-clock fixture: MID none in 5 sim-min, HARD first tower
~tick 10,400 (~2.9 min), IMBA ~17,900 (~5 min). Owner wants it gated on AVAILABILITY, not on a
timer — *"can even be 30 sec"*.
⚠ **Two prior attempted fixes MEASURED WORSE (HARD 2→1 towers) and were reverted.** The measurement
harness is the deliverable's proof, not the code diff. Report the before/after tick for MID/HARD/IMBA
or the priority is not done. And per S155 P4: the tier under test must be at the SEAT being measured —
`BotManager([...])` assigns seats in order, and measuring seat 1 while the tier sits at seat 2 is
exactly how a whole session was spent describing a NOOB behaving as designed.

---

# ORDERING

**P1 → P5 → P4 → P2 → P3.** Rationale: P1 is the most certain and smallest. P5 produces MORE
defenders, which is precisely the live entity P3 needs to seed — doing P5 first makes P3's fixture
honest rather than synthetic. P4 changes combat outcomes and therefore any creature-count baseline,
so it lands BEFORE P3 re-baselines, never after. P2 is the largest blast radius (three red tests plus
a real bug to diagnose), so it does not sit between P4 and P3's re-baseline. P3 flips a default and
goes LAST so `e2e:gating` runs once, after everything.

# TESTING (per priority, non-negotiable)

Pure-function unit test first (the `lobbyStateMachine` idiom this repo uses for anything
decision-shaped) → then the driven `runHostTick` fixture on the REAL phase clock and the REAL
four-seat shape (the representativeness lesson P4 paid for). Batch close: `tsc` · full vitest ·
`e2e:gating` exit 0 read from a redirect · `verify-deploy` 4/4 with content-hash equality.

═══════════════════════════════════════════════════════════
    GATE: owner GO ("approved!" ×2, "get to it") — EXECUTING
═══════════════════════════════════════════════════════════
