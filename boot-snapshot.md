# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-20 | Session: S149 | Branch: master | Commit: **a8028ec** | PROTOCOL_VERSION: **27**

**S149 shipped SIX priorities. The owner rebuilt the batch mid-session from a live playtest, so the
plan I opened with (castle HP) was dropped entirely and replaced by their five complaints. All five
are now addressed except bots-build-towers. Two agents were delegated (owner's request) for
FIX/SCRAP and a HUD coherence audit. Deploy 4/4 live.**

⛔ READ FIRST: `.claude/plans-archive/2026-08-20_SCOPE_AMENDMENT_S149_PLAYTEST_COHERENCE_COMPLETED.md`
and the 14-entry `carry_forward_next_session[]` in `.claude/session-state.json` — it is ordered.

## Next Steps

1. **CF-S149-e — ARCADE NONET: timed trial + 80s leaderboard UI.** ⚠ AN HONEST HALF. The model
   (`src/render/arcadeScores.ts`) is COMPLETE and mutation-tested: top-25, 3-letter initials,
   `M:SS.cc`, corrupt-storage tolerance, and the subtle part — **the sort is INVERTED because faster
   wins**, and a reversed board would still look perfectly plausible. MISSING: the timer display,
   the ENTER-YOUR-INITIALS screen, and the HIGH SCORES board. Wire: stamp `performance.now()` when a
   puzzle launches (legitimate — crosses no wire, feeds nothing host-authoritative), stop on solve,
   call `recordRun(name, ms, at)`, show the place. Owner asked for this explicitly.
2. **CF-S149-d — `e2e/click-to-build.spec.ts`, 3 tests are `test.fixme`.** STALE, not flaky: tower
   selection moved from the castle to the footer. The rewrite recipe is written into the file (open
   the tier chip → read the cards → click to arm → place). Both geometry getters already exist.
3. **CF-S149-f — P7 BOTS BUILD TOWERS.** The last of the owner's five original complaints, and the
   only one not addressed. A.0 measured: `botBrain.chooseGoal` has FLEE/CLEAN/RAINBOW/SEVER/POTATO/
   BUILD/PULL, and the BUILD goal places ONE primitive — there is no recipe goal anywhere, so bots
   are structurally INCAPABLE of building a tower. Full tier.
4. **CF-S149-a — DESIGN RULING NEEDED (owner):** the quarry is an OPEN HUB. Border walls stop at the
   rim (Q6), so a unit can route between zones through the centre while the walls are up. Faithful
   to the stated geometry and pinned by a named test; sealing it needs a wall arc across the rim.
5. Then CF-S149-b (the wall clamp has no sim consumer — the rim case), CF-S148-b/c/d, CF-S147-b/c/e.

## Blockers

None blocking. ⚠ The owner is playtesting **2-player multiplayer with a friend** after this session
and will report defects next session — expect an interrupt-driven start, exactly like this one.

## Traps (still live)

- **⭐ A RENDERER KEYED ON A PHASE OR ROSTER FIELD NEEDS A `gameState` GUARD TOO.** Shipped this bug
  twice in one session: border walls drew across the TITLE SCREEN (a never-started world reads
  `matchPhase === 'BUILD'`), and the HUD agent then found FOUR MORE instruments leaking onto the
  title for the identical reason (`world.players` holds P1 from boot, so every "is the player alive"
  guard passes on the menu).
- **⭐ LOOK AT THE FRAME.** Three defects this session were invisible to 171 green test files: walls
  on the title screen, an arcade menu rendering *under* the title screen, and footer chips whose
  numbers were unreadable against black. No unit test asserts legibility or z-order.
- **⭐ A GREEN SUITE CAN MEAN NOTHING.** After the entire P2 phase-split implementation landed, the
  suite reported the EXACT pre-change count (2629). 163 files and not one noticed. When a behaviour
  change moves no test count, that is the signal to write the test.
- **A REQUIRED hashed World field is TEN sites, and TWO are tsc-forced** (S150 recount, verified on
  all three shipped fields). The old "nine sites / one tsc-forced" line was traced on an OPTIONAL
  field, which needs no `makeWorld` initializer — the tenth site is that object literal, and it is
  tsc-forced because it is annotated `const w: World`. `netSnapshot` is NOT an eleventh site (it
  derives via `Omit`). An OPTIONAL field really is nine.
- **A protocol bump is SIX sites, not five** (S150 added the session-label item), and it is now
  MECHANICALLY GATED: `protocolVersionSync.test.ts` asserts both changelog carriers document an
  unbroken chain ending at `PROTOCOL_VERSION`. CF-S147-b is CLOSED. Enumerating that chain instead of
  reading it found FIVE live drift instances, two of which (`8→9`, `20→21`) had survived eight and
  three bumps unnoticed.
- **MCV bindings rot when a later priority supersedes an earlier one.** Happened twice this session
  (P1's `canBuildAt` → P2's `canBuildNow`; P2's protocol 26 → P6's 27). Pin the INVARIANT, not the
  spelling or the number.
- **`file_lacks` needles**: if a new comment QUOTES the retired text, the needle is still on disk.
- Mixed line endings — detect the file's own EOL, write with `newline=''`; prefer single-line anchors.
- Bash eats backticks inside double-quoted strings — use heredocs for comment text.
- Two agents on one tree cost real time (a TEMP probe broke `tsc` for everyone). Give each a disjoint
  file set, or run them sequentially when both touch `main.ts`.
- **PLAYER_COLORS stays at SIX** (a race roster, R45). `bomb`/`rainbow` e2e are load-sensitive.

## Pending Backlog

`SPARK_TD_BLUEPRINT.md` + `SPARK_TD_SESSION_SPECS.md` remain the forward plan. Castle HP /
elimination (S150 spec) is still UNSTARTED — the owner deferred it this session to fix the five
playtest defects first.
