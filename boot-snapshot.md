# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-15 | Session: S178 | LIVE + verify-deploy 4/4 | 15 commits

## Next Steps

1. **⛔ THE LONE-SHAPE RULE — his top ask, NOT BUILT, attempted twice and reverted twice.**
   Owner: *"a single primitive has ONE health... one hit to destroy by anyone"* / *"for every time
   there's a single shape, it's always worth five"* / *"You're not to touch the whole system we've
   built so far."* **Design is settled — do not redesign it**, read `S179_CARRY_FORWARD.md` §1:
   a new `LONE_PRIMITIVE_POOL_FIFTHS = 5` plus a one-line `Math.min` cap in `damage.ts` gated on
   `prim.bonds.size === 0`. **`PRIMITIVE_MAX_HP` STAYS 70.**
   ⛔ Two things already failed: retuning 70→5 makes every building one-swing paper (measured: one
   12-fifth swing took a 3-shape triangle from 3 bonds to 1), and marking fixtures "connected" with
   a sentinel bond id corrupts the recipe gates (13 red → 28 red). **The real job is re-pinning ~13
   fixtures across 7 files with REAL partner shapes** — all enumerated in the carry-forward.
2. **THE BOSS REWORK, his numbers verbatim** — Vlad sap 2 uses not 3; Warlord rage at 50% not 25%,
   doubling attack AND movement speed; direwolves 3 at a time, every 30 s; Archdemon hell below 10%
   not 5%; Kraken keeps sonar and **gains up to 6 tentacles** (NEW, undesigned); Pharaoh locusts
   **50 damage each not 150**; Whopper unchanged.
   ⚠ **TELL HIM FIRST:** he believes the Archdemon's skills, the Kraken's sonar and the Pharaoh's Ra
   ritual are unbuilt. They are **built and called every tick** (`hostTick.ts:1830-1848`). S179
   ADJUSTS numbers; only the tentacles are new. Full data: `BOSS_STATS_TABLE.md`.
3. **THE VOLTKIN TV — two transition videos, ~€20.** (a) the TV appears / breaks open and **Voltkin
   climbs out** — he already has the climbing-out still, wire it rather than generate it; (b)
   damaged → destroyed. **No video between intact and damaged.**
4. **No damage numbers when you SCRAP.** Ruled. Design settled (`pendingCreatureDeaths` is the
   non-serialized per-tick precedent); only the set's lifetime is open. ~20 min.
5. **Character sheets** — he deferred them explicitly. Needs two answers before building: which
   entity kinds first, and may an enemy sheet show LIVE health (that may cost wire fields + a bump).

## Blockers

- **Five sweep lanes were never run** — determinism, four-sites, creature lifecycle, wire/protocol,
  host-migration. Killed by the org spend limit, never hand-run. They still owe a verdict.
- **Art only he can make:** the two TV transition videos; the 5 waived atlases; general/goblin tower art.

## Pending Backlog

(no unchecked items — the forward list is the numbered steps above)

## Recent Reflexion (last 2 sessions)

See `.claude/reflexion_log.md` — the S178 block is at the top (12 entries), S177 beneath it.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-15\The-Spark.jsonl`
- Last decisions:
  - **A probe beats an argument, twice.** The poop bag (`ticksToDie=null` whenever any enemy shape
    exists) and the Vlad duel (wins 12/12, heals 20% back) were both settled by measurement after
    reasoning had got them wrong for sessions.
  - **Gates are not verification.** Every gate was green on work containing three regressions I had
    shipped. The owner-requested verification pass is what found them.
  - **Measure the artifact, not the manifest.** The TV manifest says `frames: 12`; four of six rows
    are twelve byte-identical copies of one still. Building on the manifest made his complaint worse.
  - **Flavour text is not a ruling.** The Vortex's only authority was a description string a session
    chose to "realize" as physics.
  - **A clamp on movement is not a clamp on existence** — adding a playfield instantly created an
    unreachable-structure exploit.
  - **Stop short of a known break.** The lone-shape rule was held twice rather than shipped broken.
  - **`file_lacks` is the wrong binding here** — this repo quotes superseded text at the correction.
- CLAUDE_LOOP: **closed** (no agentic loop open; the overnight sweep died to the spend limit and was
  hand-run or salvaged per the S161 rule — five lanes remain NOT RUN, carried forward)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S178_2026-09-15.md`
  - [x] `S179_CARRY_FORWARD.md` — read this before picking work
  - [x] `BOSS_STATS_TABLE.md`, `S178_OPEN_QUESTIONS.md`
  - [x] traces jsonl path above
