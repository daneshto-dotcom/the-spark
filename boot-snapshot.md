# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-16 | Session: S179 | LIVE + verify-deploy 4/4 | 6 commits

## ⛔ HOW TO OPEN S180 — HE SET THIS EXPLICITLY

He named the starting list himself. **Use it. Do not re-derive one from a handoff.**

> *"Next session, we will start with the end of session stat board, end of match stat board. We will
> start with character sheets. We will start with maybe Kraken Tentacles and Vulcan TV art."*

⛔ **AND DO NOT RAISE ANYTHING HE DECLINED.** His words: *"Everything I declined, do not bring up in
the next session. I declined it for a reason. Note it and see why I declined it so you don't
fucking waste our time bringing it up."* The declined list and his reasons are in **DECLINED**
below — read it before proposing anything.

⚠ S179 opened by presenting the S178 handoff's numbered list as a plan and he stopped the session
for it: *"i think you are tripping about the priority list."* A handoff is CONTEXT, not a mandate.

## Next Steps

1. **END-OF-MATCH STAT BOARD v1** — his pick for first. Research is DONE (3 agents, genre +
   codebase + design) and the v1 is designed; see `S179_FINDINGS.md` and the handoff. Key facts:
   SPARK tracks **none** of the five stats today; **damage TAKEN is ~6 lines** (the victim's owner is
   known where damage lands) while **damage DONE is an 18-site refactor** (the attacker is never
   passed — `damageEntity` literally has `void source; // attribution only for now`); ⭐ **castle
   damage is the headline stat and is cheap**, which no single research lane spotted. Counters go
   **world-level per-seat**, NOT on the player object (it is rebuilt field-by-field on every
   pickup/drop — four documented traps). `matchPlacings()` already gives a correct finishing order
   and is currently consumed only by a `console.info`. **No protocol bump. No graph in v1.**
2. **CHARACTER SHEETS** — needs ONE answer from him first: *when you click an ENEMY, does their
   sheet show LIVE health, or just stats?* Stats-only is local and cheap; live enemy health may need
   new wire fields and a PROTOCOL BUMP, which locks out old tabs. Everything else is ready: every
   entity already has real stats on the one ladder, and click hit-testing was fixed in S178 A9.
3. **KRAKEN TENTACLES** — *"maybe"*. ⚠ He also said **the whole Kraken needs reworking, including
   its video**. A design exists (derived effect, no bump, 6 tentacles superseding R139's 3) but he
   has NOT reviewed it. Ask before building.
4. **VOLTKIN TV ART** — the two transition videos (~€20). ⚠ He said **Voltkin needs reworking on a
   lot of things**. He already has the climbing-out still — wire it rather than generate it.

## Blockers

- **Character sheets** are blocked on the live-enemy-health answer above.
- **Art only he can make:** the two TV transition videos, the 5 waived atlases, general/goblin tower art.
- **He is testing the live build now** and will report bugs at the start of S180. Expect that list to
  outrank everything above.

## ⛔ DECLINED — DO NOT RAISE THESE AGAIN

| | why he declined |
|---|---|
| **Boss-ring orphan shape** | Explained; he did not approve. **Now moot** — that orphan is a lone shape and dies to anything under the S179 rule. |
| **Castle gun firing at a corpse** | *"I did not see it fire at a corpse because corpses disappear usually... So cancel that."* |
| **Spark-id counter (`nextPulledSparkId`)** | Explained as latent, never observed in play. He did not approve. Real but dormant. |
| **Protocol bump for stale browser tabs** | Ruled S178: *"Nobody cares. They'll just figure it out."* An agent WILL propose this again. |
| **Potato blast** | ARCHIVED and he was right — `HAZARD_SPAWN_ENABLED` is false, only a Playwright seam flips it. No potato can exist in a shipped match. |

## Allowed, but NOT next session

**Building a continuous city** — structures keeping their function when extended.
*"We will allow that starting like a future session or whatever. Not in the next session though."*
Full write-up in `STRUCTURE_EXTENSION_DESIGN.md`, including the one ruling needed BEFORE any code
(can one shape belong to two recipes?) and the two halves that already exist.

## ⚠ OPEN WITH HIM, HE PARKED IT HIMSELF

The **untargetable freeze**. S179 shipped units DROPPING a target that phases out, so they stop
standing still dealing zero. He then said the S177 complaint I cited was about a poop bag, not the
Pharaoh, and that showing `0, 0, 0` on something phased out *"makes total sense"*. So the shipped
behaviour may not be what he wants. His words: *"We'll bring that up later. Don't worry about it."*
**Do not re-litigate unprompted; have the one-line revert ready if he raises it.**

## Pending Backlog

(no unchecked items — the forward list is the numbered steps above)

## Recent Reflexion (last 2 sessions)

See `.claude/reflexion_log.md` — the S179 block is at the top (12 entries), S178 beneath it.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-16\The-Spark.jsonl`
- Last decisions:
  - **The list has to be HIS.** A handoff's priority order is a previous session's reading of a
    previous conversation. Presenting it as a plan is what broke this session's opening.
  - **Speak in what he sees, not what the code is called.** Four options naming `potatoLifecycle.ts`
    and `deathOnVanish` read to him as noise, and he said so.
  - **Measure, don't estimate.** The lone-shape fixture cost was settled by applying the rule and
    running the suite (13 red / 7 files), then restoring byte-exactly — never `git checkout`, which
    flips line endings.
  - **Half a rule is worse than none.** The lone-shape rule failed twice because each attempt capped
    the shape without stopping creatures targeting member shapes.
  - **Prove it before explaining it to him.** My first account of his "56" was a theory; he rejected
    it and re-measuring found a second, independent defect.
  - **A dead verifier is not a refutation** — my own sweep filed unverified findings as refuted when
    their verifiers died to a spend limit.
  - **A binding that asserts ABSENCE finds what reading misses** — it caught two more stale comments.
- CLAUDE_LOOP: **closed** (no loop open; two workflows completed, an earlier pair died to the org
  spend limit and was re-dispatched + hand-run, so all five sweep lanes now have a verdict)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S179_2026-09-16.md`
  - [x] `S179_FINDINGS.md` — the verified findings, incl. the stat-board research
  - [x] `STRUCTURE_EXTENSION_DESIGN.md` — the city idea, recorded not built
  - [x] traces jsonl path above
