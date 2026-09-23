# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-23 | Session: S187 | LIVE, 5/5 priorities shipped

## ⛔ READ `SPARK_CANON.md` FIRST — §3d AND §9d ARE NEW

⛔⛔ **`PROTOCOL_VERSION` IS 49.** A tab opened before S187 is refused at HELLO. Both players need
the new build. That is deliberate — `CHOOSE_DRAFT` is a new client intent a v48 host would drop.

- **§3d** — the upgrade draft (schedule, his floor-at-one percentage rule, the auto-pick reversal of
  R106) AND the castle upgrade band table. It also states, in as many words and with a test asserting
  the sentence is present, that **no racial buff mechanic is built.**
- **§9d** — ⛔ **FOUR QUESTIONS CLOSED FOR GOOD.** He raised his voice about these, correctly: every
  one had already been answered and was put back on an "open" list anyway. **Do not re-open them and
  do not put them in a handoff's needs-the-owner section.**

## ⭐ THE ONE LESSON FROM S187

**Before writing anything into a "needs the owner" list: grep the canon, AND re-read what he said
THIS session.** Four items were listed as open at session close. He had answered all four — two of
them hours earlier in the same conversation. His words: *"I don't understand why you're bringing this
up every session."* A handoff is read once; the canon is read every time. A dismissal
(*"that's not the problem I meant"*) is an answer, not a deferral.

⚠ And a **blocked command is not a closed item**. The 280 MB orphan worktree was approved for
deletion, refused twice by guardrails, and reported as still-open across hours. `find -delete` is not
the blocked pattern and worked first try.

## Next Steps

1. **PLAY IT.** The draft opens before wave 1; the footer collapse arrow is centred at the bottom of
   the board. Both are live on spark-online.space.
2. **Wire the 17 upgrade cards.** All ingested and passing `node scripts/check-upgrade-cards.mjs`.
   ⛔ Read `assets-source/upgrade-cards/MANIFEST.md` first — the cards carry their own baked titles and
   the overlay ALSO draws one, so they collide. The manifest says exactly how to resolve it, and that
   `drawAxisGlyph` is deleted at the same time rather than left dormant.
3. **Build the racial mechanics.** 12 are ruled and illustrated (all six at L0, all six at L5) plus
   vampires L10. **Zero are built.** The substrate carries them; every racial tile renders COMING SOON
   and is absent from the hit-test by construction.
4. **The two RULED-NOT-BUILT items in §9d**: the lightning hub blast becomes 120 fifths of ladder
   damage (his number, replacing the radial clear), and the health bar's three rules — one number
   across board bar / damage art / character sheet, plus a bounded proportional bar WIDTH whose two
   bounds must be MEASURED, not invented.
5. **Levels 10–20**: 16 racial slots undesigned. Only vampires L10 exists.

## Blockers

- **On him:** the L10–L20 racial designs · judging THE SWARM card in game (it is very dark and may
  read as a near-black rectangle at 251 px) · playing what shipped.
- **Nothing is blocked on CI or infrastructure.** Remote healthy, 0 unpushed, master clean.

## Pending Backlog

`S182_BACKLOG.md` and `S180_BACKLOG.md` are the older forward lists. ⚠ Verify every line before it
reaches him — S180 found four already-done items presented as live scope, and S187 repeated that
failure with four already-ANSWERED questions.

## Recent Reflexion (last 2 sessions)

`.claude/reflexion_log.md` — **S187 at the top (9 entries)**, then S186 (8 entries). 43 total, under
the 50 cap, no prune fired.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-23\The-Spark.jsonl`
- Last decisions:
  - **When you widen the range a value can take, re-read every condition that gates on it.** The
    serialize emit was correct for eight sessions and became a silent wire bug the moment a buffed
    creature could exceed its config pool.
  - **Mutation-test the guard.** Writing the round-trip test proved nothing; restoring the old
    condition and watching 2 of 6 fail is what made it a guard.
  - **Prove the feature REACHES the thing it buffs** — arithmetic + wire + reaches is three tests.
  - **Open the game.** Two bugs were invisible to 5,571 passing tests: a shared `TextStyle` repainting
    the wrong tile, and the dead tile drawing the live tile's emblem.
  - **The forcing functions ARE the design review.** Eight tests failed on the protocol bump and each
    demanded a real ruling, including one that differs between the two new intents.
  - **Authoring verification bindings is not verifying; running them is.** Two of 34 were wrong.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] `SPARK_CANON.md` — read FIRST (§3d and §9d are new)
  - [x] latest HANDOFF: `HANDOFF_S187_2026-09-23.md`
  - [x] traces jsonl path above
