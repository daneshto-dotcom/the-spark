# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-20 | Session: S185 | LIVE + verify-deploy 4/4

## ⛔ READ `SPARK_CANON.md` FIRST — §7 AND §9c ARE NEW AND BOTH CARRY DO-NOT-FIX RULINGS

`PROTOCOL_VERSION` unchanged at **47** across 14 shipped items — nothing this session touched the wire.

Four owner rulings landed in the canon with assertions that fail if anyone reverses them:
- **R185-A** a welded shape STAYS at full opacity (closes §7's only open call)
- **R185-B** a welded structure being unrepairable is a deliberate trade, not a bug
- **R185-C** clicking an enemy building through fog is INTENDED — a skill expression
- **R185-D** the connector damage numbers are good as they are

⚠ Three of those read like obvious defects to anyone who has not read the file, and two came out of an
AUDIT — so an audit will produce them again. The tests are what stop the next session "fixing" him.

## ⭐ THE TWO LESSONS FROM S185

**1 · A GREEN UNIT SUITE CANNOT SEE A DISPLAY-LIST CHANGE.** I added two nodes to `groundLayer`,
broke `e2e/fog.spec.ts`'s exact roll call, and shipped a RED gating lane for three commits while
typecheck, 5448 unit tests and the build were all green. No renderer runs under vitest. **Touch a Pixi
layer → run the e2e spec that censuses it BEFORE pushing.**

**2 · DO NOT MEASURE A PARTIALLY-OCCLUDED SHAPE BY ITS VISIBLE PIXELS.** The ground-zone position took
SEVEN rounds because I decoded his screenshots for the decal's visible red and halved it — but the
building hides the ellipse's top, so every centre I computed was too low, by up to 2.5×. His method
fixed it in one step: **mark the current centre with the spark, mark the wanted centre, measure both
against a fixed reference.** Use that for any visual offset.

## Next Steps

1. **HIS PLAYTEST IS THE SIGNAL.** 14 items shipped today and he tested most of them live. Whatever
   the next session opens with, his reaction outranks this list.
2. **#5 — the bottom-band build area.** ⛔ NOT the menu: the chips already let clicks fall through.
   The blocker is the OFF-SCREEN rule — a laser turret's footprint is 112px tall, so the lowest legal
   centre is y=1016 and the bottom 64px is dead. **Needs his ruling:** may a tower overhang the canvas
   edge? A partly off-screen tower is partly unclickable, which is why it was never just lifted.
3. **#11 — the stuck carried shape.** A match-long soft-lock; already ruled (returns to BANK, not the
   centre — "back to the centre" would DELETE it via the free-spark reaper). `controls.ts:1063` is the
   gate; `hostTick.ts:387` is the phase edge. Graded Full by its verifier: two extra `DROP_SPARK`
   producers exist and fix (a) does not clear the local `ControlState`.
4. **Ground zones — he will reopen this.** *"It's not perfect, but it's a lot better. I'll bring it up
   when I wanna rework it again."* `ZONE_SINK`, `ZONE_SPREAD` and `GROUND_DECAL_ALPHA` are the dials.
5. **Voltkin rework** — his words: the towers do not look as he wants.
6. **Bot personality** — defensive / offensive / balanced in the bot lobby, on top of difficulty. He
   will define what each builds, then we shape it per difficulty.
7. **Wave-gated upgrades** — spec'd earlier, never implemented: choose a RACE upgrade or a GLOBAL one
   at game start and again after waves 5/10/15/20, then no more. The general ones exist (first is
   ~10% HP to all spawns); the creative per-race ones still need designing.
8. **Idle animation rows** for the four new towers — 12 frames each, exactly what the stink tower has.
9. **The `SEVER_BOND` decision** — ⚠ I still owe him a clearer explanation. He said *"I don't
   understand it still… I don't see the reasons when you cut this connector."* **The fix is to say
   the 'cause' is an INVISIBLE field inside the network message, never shown to a player** — my first
   explanation implied a UI that does not exist.

## Blockers

- **On him:** the canvas-edge ruling (#5) · idle-loop art for four towers · Voltkin's new look · the
  bot-personality definitions · the per-race upgrade designs · the destructive token for the one
  orphan worktree dir.
- **Nothing is blocked on CI or infrastructure.** Remote healthy, 0 unpushed, all deploys green.

## Pending Backlog

`S182_BACKLOG.md` and `S180_BACKLOG.md` are the older forward lists. ⚠ Verify every line before it
reaches him — S180 found four already-done items presented as live scope.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — **S185 at the top (7 entries)**, S184 beneath it. 45 entries after the
prune (S180's block aged out at the 50 cap).

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-20\The-Spark.jsonl` (4 rows, all scrubbed)
- Last decisions:
  - **Commit the research before the budget can take it.** 34 agents, 3 independent runs, saved to
    the repo before a line of code was written.
  - **Check the brief's central assumption first.** Two items were a different bug than research said
    — the ramp was not skipping frames, the arrows were an S181 targeting regression.
  - **Read the sibling renderer instead of re-deriving its geometry.** Three position bugs, one cause.
  - **Assert the match count on every patch.** CRLF silently ate three anchors; one invalidated a
    mutation run whose `MUTATED_EXIT=0` I nearly read as "guard unpinned".
  - **Sequential beats parallel under a budget ceiling.** The eight-worktree split was planned and
    deliberately dropped at 94% weekly; commit-and-push per item delivered 14.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read FIRST (§7 and §9c new, both carry DO-NOT-FIX rulings)
  - [x] latest HANDOFF: `HANDOFF_S185_2026-09-20.md`
  - [x] traces jsonl path above
