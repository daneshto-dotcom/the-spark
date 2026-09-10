# BOOT SNAPSHOT — after S171 (2026-09-10)

Read `HANDOFF_S171_2026-09-10.md` for the full picture; this is the 30-second version.

## Where the code is
`master`, clean, pushed, 0 unpushed. Live at spark-online.space, `verify-deploy` 4/4.
`PROTOCOL_VERSION` **46** (bumped 45→46 for the locust cloud).
Gates at close: typecheck 0 / vitest **4271 across 272 files** / e2e:gating 65 / e2e:races 5 /
build ~819 KiB of 900 / MCV hard_fail=0.
⚠ **`check:atlas` exits 1 ON PURPOSE** — it now reports 6 size-mismatched + 9 fringed atlases.
That list IS the art polish pass. It does NOT gate the deploy (`build` never calls it).

## ⛔ FIRST: REPORT STATS IN POINTS, NOT FIFTHS
The sim stores combat as `atk*(5+pen)` — **150 fifths IS 30 points**. S171 quoted raw fifths to the
owner all session and he had to challenge it to find out. **`node scripts/stat-table.mjs`** prints
the whole roster in his units. Use it before saying any number out loud.

## THE PHARAOH IS DONE — and he has already played it
R142 shipped complete: locusts + the Ra ritual. He has seen both live and given verdicts:
- **Locusts: APPROVED.** *"Locust is fine. It doesn't look bad."*
- **Ra columns: REJECTED ON LOOKS.** Mechanic fine, visual not. Wants a ~3 s generated loop.

## The next things, in order

1. **R171-R — THE STAT PROTOCOL.** The biggest open design item. He asked for *"a mechanism -
   protocol or algorithm to build each units stats"*. Run `stat-table.mjs`: nearly every unit's
   single HIT exceeds nearly every unit's whole POOL, attack speed is a constant 1 s on all but two
   units, and `ownHits` ranges 0.03–5.60. Full write-up in `BACKLOG.md` under R171-R.
2. **R171-P + R171-Q — FINISH THE PHARAOH.** The ritual loop and the locust-release stance. He said
   these two close him. Both fully researched in `.claude/plans/S171_NEXT_SESSION_RESEARCH.md`,
   including the finding that the release stance needs NO new synced field.
3. **R171-K/L — THE ART POLISH PASS**, now that the guard works. ⚠ The scarab needs its WALK CLIP
   RE-GENERATED — I tried a repack and it cannot fix a 0.74× width, because `normaliseStateScale`
   equalises height only.
4. **R171-O — spawner tower contents.** Researched, cheap (no new synced structure), not started.
5. **R171-N — the loading-screen tutorial.** Specified, owes a script.

## Art division of labour (R171-M, standing)
Already-generated creatures — new stances, polish — are **MINE**. Anything NEW is **HIS**.
~$50 to finish polishing what exists. 12 cutouts standard; bosses want more.

## Traps that will bite
- ⛔ **Never bind a verification to something that is supposed to change.** The Stop hook caught this
  three times in S171: a pinned PROTOCOL_VERSION, a constant headcount, an exact function signature.
- ⛔ **Run `npm run typecheck` after TEST edits.** vitest strips types; twice a green suite hid a
  type error that only `npm run build` caught.
- ⛔ **The packer takes ONE union bbox across every frame of EVERY state.** A taller new pose
  permanently shrinks the character's other rows.
- ⛔ **Locusts must NOT be drawn into a Pharaoh clip** — the matte would weld them in forever.
