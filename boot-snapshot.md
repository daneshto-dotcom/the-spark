# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-17 | Session: S181 | LIVE + verify-deploy 4/4 | 12 commits, 16/16 priorities

## ⛔ READ `SPARK_CANON.md` FIRST

It says what is LIVE vs ARCHIVED and how every number works, and `src/canon.test.ts` pins it so it
cannot rot. **It moved this session:** the castle pool is now **2500** and its gun hits for **40**.

## ⛔ THE ONE LESSON FROM S181, AND IT IS WORTH MORE THAN THE FEATURE LIST

**Every defect this session was a rule applied at SOME of its sites and not the rest.** Three of four
wipe sites for a per-frame array. Two of three arrival arms for the suicide bomber. One of three
UI-surface guards for the card. A transform set and then reset. A block that draws but never advances
the layout cursor. That is the four-sites law in `CLAUDE.md`, and it bit **five more times in one
session** — and every single one shipped with typecheck, 4,700 tests, the build and the deploy green.

⭐ **WHAT CAUGHT THEM: SOURCE-TEXT TRIPWIRES ON THE CALL SITES.** Not behaviour tests — those stayed
green throughout, because the failure mode is *unreached code*, not wrong code. When you add a rule,
enumerate its sites and assert each one exists.

⚠ **AND RUN `npm run e2e:gating` BEFORE PUSHING ANYTHING THAT MOVES UI GEOMETRY OR TOUCHES THE SIM.**
Pushed the castle merge without it → CI caught a panel that could not be closed. Pushed the targeting
fix with it → clean. 4.3 minutes against a bug he hits in his first minute.

## Next Steps

1. **HE TESTS FIRST.** 16 priorities shipped and deployed; his bug list outranks everything below.
2. **The remainder cap is fixed for CREATURES ONLY.** The verification pass found four other pools
   still print the victim's *remaining* health on a killing blow — shapes, defenders and **the landed
   bag** among them. Same class he has now reported twice.
3. **Portraits still on a placeholder, and the reason differs.** NO ART EXISTS: laser turret,
   pentagram, goblin tower, lightning hub (procedural puppets — the emblem is honest). ART EXISTS BUT
   UNWIRED: **Helga's hub**, the **landed stink bag** (it has its own 12-frame atlas), the **Voltkin
   creature** (not the TV).
4. **The Voltkin TV is barely clickable** — it registers no spawner, so `towerAnchorAtPoint` skips it
   and only its eight member shapes can be hit. Its portrait is now wired, which makes this *more*
   visible, not less.
5. **The suicide bomber's below-50%-health fallback** is ruled and unbuilt (buildings-first is done).
6. **`DEFENDER_TARGETS.turret` still declares BOTH** while he ruled units-only in S180. One line.
7. **END-OF-MATCH STAT BOARD** — still one line of text. **CONNECTOR HIDING** — specified across
   three sessions, renderer-only, still absent.
8. **Five S161 sweep lanes still owe a verdict** (determinism, four-sites, creature lifecycle, wire,
   host-migration). This session is the third time their class produced a live defect.
9. **His open question, answered but not decided: Steam?** My recommendation was no to Steam yet — a
   permanent review score against a game where four systems were visibly lying — but yes to shipping
   publicly at spark-online.space for feedback with no score attached. Signal to wait for: an evening
   of play that yields only balance complaints, not broken systems. **His call.**

## Blockers

- **Nothing is blocked on me.**
- **Art only he can make:** per-race border walls, boss ability VFX, the two Voltkin TV videos
  (~EUR 20/clip measured).

## Pending Backlog

See `S180_BACKLOG.md`. Of THE TEN, this session shipped #1 (targeting), #2 partially, #4 (portraits),
#5 (castle buy functions, via the merge) and #10's sibling work. Unshipped from the ten: #3 SOUL/feed
clarity, #6 end-of-match board, #7 border art, #8 boss VFX, #9 Kraken, #10 connector hiding.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — S181 at the top (20 entries), S180 beneath it. 43 entries, under the cap
(S177 and S178 blocks pruned this handoff; they survive in `.handoff-archive/`).

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-17\The-Spark.jsonl`
- Last decisions:
  - **A rule applied at some of its sites is the defect.** Enumerate the sites before claiming done.
  - **Adversarial verification before he tests pays for itself** — 6 agents found 8 defects that had
    all shipped green, including a regression my own fix caused. The refute round kept false alarms out.
  - **Run the click-driven e2e lane before pushing geometry or sim changes.**
  - **A blind renderer looks exactly like missing logic** — grep whether the VIEW already carries it.
  - **He can be wrong about the cause and right about the bug** (the chewer has no sheet; he still
    deserved his hero's face on the card).
  - **An owner number given in percent is not its consequence** — surface derived changes, don't choose.
  - **Write source and long prose with the file tool, not a heredoc** — three quoting failures cost
    four retries that produced nothing.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read it FIRST (castle numbers moved)
  - [x] latest HANDOFF: `HANDOFF_S181_2026-09-17.md`
  - [x] `S180_BACKLOG.md` · `S180_TARGETING_TABLE.md` (its GROUP A warning is now STALE — fixed)
  - [x] traces jsonl path above
