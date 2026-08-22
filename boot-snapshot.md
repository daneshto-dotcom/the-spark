# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-22 | Session: S151 | Branch: master | Commit: **78248a3+** | PROTOCOL_VERSION: **30**

**S151 shipped THREE priorities: the hazard archive, THE STAT SYSTEM, and THE GOBLIN TOWER with
animated art for three characters. Two protocol bumps (28→29, 29→30) — the second was avoidable and
is recorded as a sequencing lesson. The owner supplied the full unit stat table mid-session (R77),
which reclassified HELGA from tower to unit and invalidated part of what had already been built.**

⛔ READ FIRST: `owner_rulings_s151` in `.claude/session-state.json` (**R73–R78**, the owner's own
words plus what each means operationally), then the two known gaps under Blockers below.

## Next Steps

1. **RAID (P4 / owner R78) — DEFERRED, NOT STARTED, no code in the tree.** The owner scoped it as
   the last item and the session reached ORANGE context first. Spec is complete and recorded
   verbatim. ⚠ **R78 SUPERSEDES R64 IN THREE WAYS** — RIGHT-click (not left), 1 point per **2
   towers** (not 3 buildings), and a raid point **IS a 2-ATK hit** on the shared ladder rather than a
   bespoke rule, so "it dies if its defence is low enough" falls out of the pool arithmetic with no
   special case. A raid deals `attackFifths(2,0)` = **10 fifths**: it one-shots chewer (5), melee
   goblin (7), ranged goblin (6), hound (5), flying goblin (10) and terrorist goblin (10); it does
   NOT one-shot shield goblin (16), HELGA (54) or voltkin (64). The RAIDED cloud is in the
   **RAIDER's** colour (the owner wrote "attacked color" once and "the player that raided it" once —
   the stated purpose, *"they will know who attacked them"*, disambiguates it). ⚠ STILL OPEN from
   R64: does RAID **replace** the existing `disruptionCharges`/SEVER economy or run beside it? Both
   already exist — resolve before building.

2. **⛔ `FEED_TOWER` HAS NO PLAYER GESTURE — the goblin tower is unreachable in play.** Everything
   else about it landed: it builds (it is in `ALL_BLUEPRINT_IDS`, and `blueprints.test.ts` stamps it
   through the live reducer AND matcher), it ignites, it tears down when its star breaks, its six
   outputs exist with the owner's stats, and `applyFeedTower` is fully gated with 13 tests. What is
   missing is the way to pick a shape and hand it over. Natural home: the S152 FIX/SCRAP structure
   popover — a player already clicks a structure and gets a panel, so this wants a FEED row of six
   shape buttons beside those two. `goblinTowerFeed.ts` says all of this at the top of the file.

3. **THE OTHER FOUR GOBLINS + THE POOP BAGS** — owner-scoped for next session, explicitly:
   *"lets at least do the melee and the archer(ranged) goblins and the stink tower this session.
   next session well do the other 4 goblins and the poop bags."* Their stats are ALREADY recorded
   (R77) and their configs, roles and targeting are ALREADY shipped — only the ART is missing, and
   they currently fall back to the procedural puppet so they are visible and playable meanwhile.
   ⭐ `scripts/build-sprite-atlas.mjs` is a reusable pipeline built for exactly this; feed it a spec
   naming one veo clip per state. Seed every clip IMAGE-TO-VIDEO off the character's own PNG or the
   states will not match (owner: *"need to stay consistent throughout"*).

4. **R77 MECHANICS RECORDED BUT NOT BUILT** — voltkin CHAIN LIGHTNING (multi-target, owner suggests
   max ~6; `VOLTKIN_CHAIN_MAX_TARGETS` is already a constant), the terrorist goblin's AoE, drone AoE
   sizing, destructible stink BAGS as entities with aggro and on-destroy damage, and the stink tree's
   0.2-atk/sec aura. All are numbers-in-hand, mechanics-not-written.

5. Then **R62** fog is BUILD-phase only · **R63** the four peace rules · **R68** win-screen fireworks
   · **R69** NONET tiers · then castle HP/elimination · CF-S149-f (bots build towers) · CF-S147-e ·
   CF1 · CF3 · CF-S148-b/d · CF-S150-b/c.

## Blockers

**None blocking.** Two known gaps, both stated in code and above: RAID is unstarted, and the goblin
tower has no feed gesture. Neither is half-built — there is no RAID code at all, and the tower's
missing piece is UI only.

## Traps (still live)

- ⭐ **A TYPE CHANGE IS TSC-FORCED; A UNIT CHANGE IS NOT.** Renaming `hp`→`ehp` made every unconverted
  READ a compile error. Sites that PASS a number compile fine and deal one FIFTH of the damage —
  those had to be enumerated by hand.
- ⛔ **AUDIT THE DIFF OF ANYTHING A SCRIPT TOUCHED.** A patch script of mine wrote a hardcoded
  `damageFifths: 0` into a PRODUCTION deserializer. Compiled, passed 2891 tests, would have healed
  every damaged connector on every snapshot apply and host migration.
- ⛔ **DO NOT VALUE-IMPORT A RECIPE MODULE FROM ANYTHING `world.ts` REACHES.** Documented in capitals
  in `blueprints.ts`; I did it anyway and it stopped the `?worker=1` bots match from leaving TITLE.
  Shared recipe data now lives in the side-effect-free leaf `state/goblinKinds.ts`.
- ⭐ **GREEN TESTS PROVE CODE RUNS, NOT THAT A PLAYER CAN REACH IT.** Three open pathways shipped
  green. `Record<GodlyId,…>` is exhaustiveness-checked; a hand-written array of the same ids is NOT.
- ⛔ **NEVER READ A RUNNER'S EXIT CODE THROUGH A PIPE.** `npm run e2e:gating | tail` prints
  "exited with code 0" while Playwright fails. Redirect, then `echo $?`.
- ⚠ **ONE GREEN RUN AFTER A FIX IS A HYPOTHESIS, NOT A CONFIRMATION.** I overclaimed causation on a
  single re-run and had to correct the record; re-verified 3/3.
- Deploying HALF of a two-part wire change costs an extra protocol bump (28→29 then 29→30).
- Mixed line endings per file — respect each; python writes need `newline=''`.
- `grep -c` exits 1 on zero matches, which silently breaks `&&` chains.
- Bash heredocs mangle backslashes — write a script file for anything with Windows paths.

## Pending Backlog

`SPARK_TD_BLUEPRINT.md` + `SPARK_TD_SESSION_SPECS.md` remain the forward plan. **Castle HP / guns /
elimination / placings** is still UNSTARTED and remains the largest roadmap item — Full tier, a new
hashed `castles` family, TEN sites with TWO tsc-forced for a REQUIRED hashed World field.

## Recent Reflexion (last 2 sessions)

**S151** — a type change is tsc-forced but a unit change is not · my own automation wrote the worst
bug of the session · I committed a trap this repo documents in capitals · I overclaimed causation on
one green run · green tests prove code runs, only an audit proves it is reachable · the owner's
arithmetic was an independent oracle.

**S150** — a human checks the last link, a machine checks every link · my first gate was wrong and
the failure was the most useful output · I proved the gate by breaking the file back · the stubbed
test was green and the real browser found the bug in one frame · I could not screenshot so I said so.
