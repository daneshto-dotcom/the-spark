═══════════════════════════════════════════════════════════
    SCOPE AMENDMENT — S155 (Rule 16)
    THE BOTS GET EYES, A LADDER, AND THE HOST STOPS LAGGING
═══════════════════════════════════════════════════════════

Status: IN-PROGRESS
Parent PDR: `.claude/plans/2026-08-28_PDR_S155_BATCH.md` (7 priorities; P1/P2/P3/P6 shipped,
P4 partial, P7 substrate-only, P5 not started)
Tier: **Standard** (3 changes, ~6 files, no protocol bump)

## OWNER APPROVAL (verbatim, 2026-08-28)

> *"bots should target "the leader OR the nearest enemy whose score sits closest above their own" —
> i.e. each bot punches one rung up the ladder! i already told you. you can have upto 2 raids at a
> time right? it doesnt matter if they are concurrent or not, a player should be able to use his
> raids "if he has them" at any time against any unit/enemy/connector. question there - lets make it
> all work and then flipp it - "ower desync wouldn't be caught. Few hours of work." then lets get to
> work!! yes lets take scouting work now too and everything we can get done. im going to test the
> game in the meanwhile"*

Plus, from the previous turn:

> *"a saving bot doesnt need to look passive he can explore the map, see what his neighbors are
> building and if they are building where."*

⚠ *"i already told you"* is a fair hit and is recorded as such: the laddered ruling was in
BACKLOG's "Bot rulings" section all along. I flagged it as a CONFLICT with the later §10 raid
prohibition when it was in fact ORTHOGONAL — one is about WHO you aim at, the other about HOW OFTEN
you may fire. The amendment below acts on the owner's reading, not my re-derivation of it.

---

# A1 — RAID TARGETING BECOMES A LADDER (not "whatever is nearest")

**Ruled.** Bots target *"the leader OR the nearest enemy whose score sits closest above their own"* —
each bot punches ONE RUNG UP. NOOB/MID keep raiding as they do today.

**Current state (measured, not assumed):** `chooseGoal`'s SEVER branch calls
`nearestEnemySpawnerBond` then `nearestEnemyBond` — **pure distance, the scoreboard is never read.**

**⛔ THE RAID BUDGET IS NOT TOUCHED, AND THE OWNER'S CLARIFICATION CLOSES THE QUESTION I RAISED.**
*"you can have upto 2 raids at a time right? it doesnt matter if they are concurrent or not, a player
should be able to use his raids 'if he has them' at any time against any unit/enemy/connector."*
`MAX_DISRUPTION_CHARGES = 2` IS that budget, and it is already a spend-when-you-have-it resource with
no concurrency gate anywhere. So there is nothing to add and nothing to remove: `severChance` stays,
the charge budget stays, and the design doc's withdrawn 1-concurrent-raider cap stays withdrawn. A1
changes **only which target is chosen**, which is exactly the orthogonality the two rulings allow.

**Scope**
1. `src/bots/botBrain.ts` — new pure `raidTargetSeat(world, seat)`: the enemy whose score sits
   closest ABOVE mine; if I am the leader, the runner-up; ties broken by `world.players` insertion
   order (the rule `leaderPlayerId` already uses, so both agree by construction).
2. Filter the two SEVER scans to that seat when the tier reads the scoreboard; fall back to
   today's nearest-enemy behaviour when there is no such seat (2-player, or everyone below me).
3. Gate on a new `readsScoreboard` tier flag (HARD + IMBA) — `BOT_INTELLIGENCE_DESIGN` §3's field,
   finally consumed.

**Why laddered and not argmax-leader:** the owner's own note — argmax makes everyone dogpile the
leader, which makes *sandbagging at 2nd place* the optimal human strategy. One rung up spreads the
pressure across the table and dissolves that by construction.

# A2 — THE SAVING BOT SCOUTS, AND THE FOG FINALLY APPLIES TO IT

**Ruled.** *"a saving bot doesnt need to look passive he can explore the map, see what his neighbors
are building and if they are building where."*

⭐ **This is one behaviour, not two, and it is why P7 shipped inert.** P7 generalised the fog to any
seat but left it unwired, partly because blinding a bot without giving it a way to LOOK makes it
dumber rather than fairer. Scouting is that missing half — and it is the only thing that makes fog
*mean* anything to a bot: something to DO about not knowing.

**Scope**
1. `src/bots/botBrain.ts` — a `SCOUT` goal: walk toward the nearest point this seat has NOT explored,
   preferring a neighbour's ground (that is the information the owner asked for: *what* they are
   building and *where*).
2. Per-seat explored memory, reusing the shipped `exploredMemory.ts` grid rather than inventing one.
3. **Activate P7**: pass the seat's vision into the three enemy scans, so a bot can only act on what
   it has actually seen.
4. Re-home the three `botGameplay.test.ts` cases that assert FIGHT verbs in a BUILD world, and
   diagnose the `carry-1 violation: player 2 already carries 60` that surfaced when that fixture
   moved to FIGHT — it may be a real latent defect and is now in scope rather than deferred.

**⛔ Q2 COMPLIANCE, again:** `fogActive` is `!solo && PLAYING && BUILD`, so the vision gate is a
pass-through during FIGHT. Raid frequency and count are untouched in the phase where raiding lives.

# A3 — CLOSE THE TOWER-DESYNC GAP, THEN FLIP THE SIM-WORKER

**Ruled.** *"lets make it all work and then flipp it"*, on *"tower desync wouldn't be caught. Few
hours of work."*

**The gap, precisely:** `defenders` IS hashed in `stateHashFull.ts` (line 82). What is missing is
COVERAGE — `workerSim.differential.test.ts` records `peak.defenders === 0` across all 300 frames, so
the guard sits green having compared nothing. Its own comment says so. So a tower desync between the
worker and the main thread would not be caught.

**Scope**
1. Make the differential scenario actually seed a live defender (a real tower that survives
   re-validation — the existing comment warns an injected spawner is torn down within a tick).
2. Confirm the per-family guard now fails if defenders diverge (force it, do not assume it).
3. **Then** flip `WORKER_DEFAULT_ON` to `true` — a one-constant change by design.

**⚠ TWO REAL HAZARDS, BOTH RECORDED BEFORE STARTING**
- **Only 5 of 21 spec files carry the `?worker=` flag**, so the flip silently re-points the other 16
  onto the worker path. The full `e2e:gating` lane must be re-run AFTER the flip, not before.
- **The owner is playtesting RIGHT NOW.** Flipping the default changes the game underneath them
  mid-session. A3 therefore runs LAST, and the flip is announced when it lands.

---

# ORDERING, AND THE BUDGET REALITY

Executed **A1 → A2 → A3**, smallest and most certain first. Context at amendment time is **~68 %
YELLOW** against an ORANGE threshold of 750 K, so A3 may not fit. If it does not, the flip is NOT
taken and that is reported explicitly rather than half-done — the same discipline P4 and P7 were
closed under this session.

# TESTING

Per change: pure-function unit tests first (the `lobbyStateMachine` pattern this repo uses for
anything decision-shaped), then the driven `runHostTick` fixture on the REAL phase clock and the
REAL four-seat shape — the representativeness lesson P4 paid for. Batch: `tsc` · full vitest ·
`e2e:gating` exit 0 read from a redirect · `verify-deploy` 4/4 with content-hash equality.

⚠ **DETERMINISM IS THE STANDING HAZARD FOR A1 AND A2.** Both add branches to `chooseGoal`, whose
seeded rng draw ORDER is depended on by `hostTick.replay`, `workerSim.differential` and
`botController`'s same-seed stream test. Every new decision must be a pure function of world state
drawing ZERO rng, or the re-baseline must be justified per test rather than blanket-accepted.

═══════════════════════════════════════════════════════════
    GATE: owner GO ("lets get to work!!") — EXECUTING
═══════════════════════════════════════════════════════════
