# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-19 | Session: S184 | LIVE + verify-deploy 4/4

## ⛔ READ `SPARK_CANON.md` FIRST — §9b IS NEW AND IT CARRIES A RULING

`SPARK_CANON.md` §9b is **RETALIATION** (R183-A/B/C/D + R184-A). `PROTOCOL_VERSION` unchanged at
**47** — retaliation writes the existing `targetCreatureId`, so it cost no bump.

⛔ **§9b CONTAINS A "DO NOT FIX IT" RULING.** A melee unit that turns on a ranged attacker it can
never catch stops hitting anything: measured 980 → 230 damage, never reaching its fire tick again.
That is **R183-A working as ruled**, put to the owner with a three-arm control, and he chose to ship
it. A session that rediscovers it is rediscovering a ruling, not a defect. `canon.test.ts` holds
that sentence.

## ⭐ THE ONE LESSON FROM S184

**A green suite is not a pinned feature, and the cheapest way to know the difference is to break the
code on purpose.** A mutation sweep (revert one guard → require a captured RED → restore
byte-identical) found **eight** guards in `retaliation.ts` that could be deleted with the whole file
green. 18 tests → 42. It also graded my own new tests and caught two of them before any agent did.

⚠ **AND A FINDING IS NOT A REGRESSION UNTIL A CONTROL ARM SAYS SO.** Two lanes reported the kiting
collapse as a HIGH. The third arm — archer present, retaliation *disabled* — read identical to the
baseline, which is the only thing that turned "retaliation broke this" into "retaliation causes this
and it is his rule". Without it I would have invented a fix for a ruling he chose.

## Next Steps

1. **HIS PLAYTEST OUTRANKS EVERYTHING BELOW.** Retaliation is live as of this session and he has not
   played it yet. R184-A was ruled from a table, not from the pad — his reaction to it in a real
   match is the next real signal.
2. **Connector hiding for the STINK TOWER and the 12 race/tier-9 towers.** His find in S183, still
   open: they have no ramp art so they are not in `RAMP_SPECS`, and the stink tower is a defender
   with no publish site.
3. **Idle animation for the four new towers.** ⭐ Answered already: it is CUTOUTS, not video —
   `stink-tower-anim.json` has a 12-frame `idle` row at 6 ticks/frame. The four new towers have 24
   DAMAGE frames and no idle row, so each health level is a still. One 12-frame sheet per tower.
4. **Per-race ground integration under a built tower** — his idea: *"it kinda looks like it's
   sticking out like a sore thumb … maybe goo for zombies, blood for vampires, cracks with fire for
   demons."* Wants proper scoping.
5. **The LOW audit findings from S183/S184**, and the welded-shape ruling.
6. **The `SEVER_BOND` cheat vector** (`disruptionManager.ts:87`) — a client intent whose `cause` the
   host never sanitises; the bypass arm grants a free connector cut. Pre-existing, deliberately held
   out of scope twice now because a security fix deserves its own decision.

## Blockers

- **On him:** idle-loop art for the four towers · what per-race ground integration should look like ·
  whether a welded shape should be swallowed by the building · the destructive token for the one
  remaining orphan worktree dir (below).
- **Nothing is blocked on CI or infrastructure.** Remote credential healthy, 0 unpushed.

## Pending Backlog

`S182_BACKLOG.md` and `S180_BACKLOG.md` remain the older forward lists. ⚠ Verify every line before it
reaches him — S180 found four already-done items presented as live scope.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — **S184 at the top (5 entries)**, S183 beneath it. 49 entries, under the
50 cap, no prune needed this close.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-19\The-Spark.jsonl` (8 rows; 3 written by S184)
- Last decisions:
  - **Break the code on purpose.** A mutation sweep is a better CHECK than reading the tests — it
    found 8 unpinned guards and graded my own new tests too.
  - **A finding needs a control arm before it is a regression.** The middle arm is what proves
    attribution; two lanes agreeing does not.
  - **Derive the fixture from the sim, never from the docblock.** I reproduced S183's exact failure
    one session later while knowing about it.
  - **Never mutate the tree while read-only auditors are live** — one agent sampled a mutated file.
  - **Read CI at JOB level.** The run concluded `success` over a `failure` job.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read FIRST (§9b new, carries a DO-NOT-FIX ruling)
  - [x] latest HANDOFF: `HANDOFF_S184_2026-09-19.md`
  - [x] traces jsonl path above
