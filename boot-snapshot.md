# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-17 | Session: S180 | LIVE + verify-deploy 4/4 | 9 commits

## ⛔ READ `SPARK_CANON.md` BEFORE ANSWERING ANYTHING ABOUT THE GAME

New this session, and it exists because he had to repeat archived facts for the third time:
*"let's resolve all of this once and for all… this should be in our canonical document somewhere
that you go to to see how things are."* It says what is LIVE vs ARCHIVED, the one stat ladder, what
can and cannot be attacked, and the wire rules. **`src/canon.test.ts` pins every number in it to its
constant**, so it cannot rot the way `UNIT_STAT_TABLE.md` did (still ~3× wrong on the bosses).

⛔ **AND THE LESSON THAT COST HIM THE MOST TIME THIS SESSION: GREEN GATES ARE NOT PROOF A FEATURE IS
WIRED.** A patch adding the character sheet to a click silently failed to apply. typecheck, 4,588
tests, the build, the charter and the deploy were ALL green and the feature was dead. He found it in
the first minute of play. **After writing a patch, grep for the line you believe you added.**

## HOW TO OPEN S181 — he set this explicitly

> *"Next session, we'll open the handoff. From the handoff, I will test everything. I will tell you
> if I found any bugs or anything that's not good enough. We'll fix it. Then you can present to me
> the next 10 priorities… and I'll tell you what to work on."*

**So: he tests first. His bug list outranks everything.** The ten are already written up in
`S180_BACKLOG.md` under **"THE TEN, FOR S181"** — do not re-derive them, and do not present them as
a plan. They are a menu he picks from, after he has played.

## What shipped in S180 (all live on spark-online.space)

1. **THE CHARACTER SHEET.** Click any unit, building or castle — yours or theirs. Portrait, name,
   live health (bar *and* number), stats. Your own building keeps FIX/SCRAP/FEED beneath the card;
   an enemy's has no buttons. A building that fields a unit (Helga's hub, the Voltkin TV) shows that
   unit underneath with its own health, and clicking it re-aims the card. The card **freezes** on
   death or fog rather than vanishing. No skills row — he ruled it out twice.
2. **THE KEEP IS ON THE ONE LADDER.** `GOBLIN_DAMAGE_VS_CASTLE` (a flat 6 every creature dealt to a
   castle) is retired unread; an attacker now deals its own `attackFifths(atk, pen)`. Re-measured,
   not relaxed: the goblins needed to fell a keep moved from ~15 to **between 8 and 10**.
3. **`SPARK_CANON.md` + `src/canon.test.ts` + the mandatory-read pointer in `CLAUDE.md`.**
4. **The bundle charter 900 → 1000 KiB**, in its own commit before the feature that needed it.

## Blockers

- **Nothing is blocked on me.** P2 TARGETING is fully ruled and NOT built — he did not authorise the
  build. It is item #1 of the ten.
- **Art he alone can make:** per-race border walls, boss ability VFX, the two Voltkin TV videos.

## ⛔ THE BUG HE FOUND AND I HAVE NOT FIXED — it is still live

**Nothing can attack a building.** Shipped in S179's lone-shape commit (`00e02bf`). The shape scan
skips every shape that has a connector, and the same branch nulls the connector target — so a
standing building is invisible and the castle march is all that is left. **21 of 24 unit types**;
only Voltkin, the pencil chewer and the lightning drone can still break a building. His targeting
rulings fix it and are complete; the work is not started.

## Pending Backlog

See `S180_BACKLOG.md` — §1 bugs, §2 the targeting table, §3 bosses, §4 art, §5 ruled-not-built, and
**THE TEN, FOR S181** at the end.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — S180 at the top (11 entries), S179 beneath it. 45 entries, under the cap.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-17\The-Spark.jsonl`
- Last decisions:
  - **Green gates are not proof a feature is wired.** Grep for the line you believe you added.
  - **A dead agent run is not a verdict.** Three auditors died to the spend limit; the lanes were
    hand-run and all three passed — and the hand pass found what no agent had (`damageConnector`
    already cascades overkill), which made the targeting fix far cheaper.
  - **Prove provenance with git.** He believed I had added the SOUL feed chip; one command showed
    the file last changed nine days earlier. It protected him from a wrong fix and me from a wrong denial.
  - **A canon doc rots unless it is pinned.** Proven: one stale digit turns `canon.test.ts` red.
  - **Re-measure a coverage gate, never relax it.** The castle threshold was re-run, not loosened.
  - **Speak in what he sees.** *"I don't know what is 21 of 24 unit types. What the fuck does that mean?"*
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read it FIRST
  - [x] latest HANDOFF: `HANDOFF_S180_2026-09-17.md`
  - [x] `S180_BACKLOG.md` (incl. THE TEN) · `S180_TARGETING_TABLE.md`
  - [x] traces jsonl path above
