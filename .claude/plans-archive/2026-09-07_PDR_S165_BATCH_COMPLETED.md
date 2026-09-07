> **STATUS: COMPLETED — S165, all nine priorities.** Archived at handoff.
>
> Nine priorities closed with `check_completed=true` and MCV `hard_fail=0`. The batch grew well past
> its original scope on owner request: the planned art + W1-C wiring, then a five-lane bug sweep
> (20 findings closed), then seven live playtest reports, then two new features (per-race music and
> the race-background toggle).
>
> ⛔ **NOT in this batch and deliberately deferred by the owner:** the tier-3 tower and its six
> units, and the wave-5 tech draft. Both are fully scoped in `S165_OPEN_ITEMS.md`, whose FIRST
> PRIORITY section is the tier-3 build — owner: *"lets close off leave it as first priority next
> session"*.

# PDR — S165 BATCH · RACE ART COMPLETION + W1-C WIRING

Status: **APPROVED BY OWNER, VERBATIM, 2026-09-05.**
> *"I pre approve full priority batch ... i approve full priority batch and full autonomous run!
> in the end check and analyze the work making sure it all landed is commited pushed and deployed
> as it should be. nothing is broken and if it is fix it. do not close off session when youre done
> i would like to check your work before handoff"*

Tier: **Full** (6 priorities, ~60 generated art pieces, one sim-facing code feature).
Baseline measured at boot, gates read directly (never through a pipe):
`typecheck` **exit 0** · `vitest` **exit 0, 3679/3679 across 234 files** · commit `48b9475` · PROTOCOL **41**.

---

## A.0 STATE-DISCOVERY — probes run BEFORE this PDR was written

| Check | Expected (from S164 handoff) | Actual (measured this session) | Verdict |
|---|---|---|---|
| Race-unit atlases on disk | 6 | **6**, each with idle/walk/attack/die × 12 frames | ✅ |
| `src/` references them | none | **none** — `grep -rn "unit-vampires\|RACE_UNIT" src/` empty | ✅ confirmed |
| Owner: *"only vamps, orcs, naga generated"* | — | **REFUTED.** 6 design PNGs, **24** clips, 6 atlases all present | ⚠ presentation gap, not a generation gap |
| Shadow instruction sites | 1 (`design-spec.json`) | **2** — also `scripts/gen-character-design.mjs:78` (the default) | ⛔ **DELTA** |
| Bundle charter counts `public/` | unstated | **NO** — gate measures the entry JS chunk only (`check-bundle-size.mjs`), parsed out of `dist/index.html` | ✅ atlases are free |
| A proven no-shadow wording exists | unstated | **YES** — `race-castles/design-spec.json` `_no_shadow`, already owner-accepted | ⭐ reuse, don't invent |

⭐ **The delta matters.** S164 filed the shadow defect against ONE file. There are two, and the
second is the DEFAULT every future character spec inherits. Fixing only the one the handoff named
would have left the defect live for the tier-3 units generated later in this very batch — the exact
"grep for the CLAUSE, not the files you remember" failure the project CLAUDE.md records.

---

## THE OWNER RULINGS THIS BATCH EXECUTES (verbatim, from session-state)

- **R133** — B1 resolved as a **castle sentinel `SpawnerId`**; race units take the normal spawner
  population path rather than widening the voltkin exemption.
- **R134** — **TWO DISTINCT POPULATIONS.** The CASTLE spawns the six humanoid soldiers generated in
  S164 (vampire thrall, naga warrior, mummy soldier, zombie villager, orc grunt, imp) — *"I do like
  the designs you have just made so we will use those as the castle spawn"*. The **TIER-3 TOWER**
  spawns the R116 creatures: piranhas · scarab beetles · the hound · bats · orc-warband grunt with
  twin axes · soul-eaters.
- **R135** — tier-3 units get **varied** stats. ⚠ **THE NUMBERS ARE NOT RULED.** Art only this batch;
  any stat line would be mine. Not written.
- **R136** — video loops for moving / attacking / dying, **seeded off the same creature image**.
- **R137** — **TWELVE** zone backgrounds, not six: one per race per board. `PITCH_2P` zone is
  960×1080 portrait, `QUADRANTS_4P` is 960×540 landscape. Generate 4P landscape first, seed 2P off it.
- **R119** — the tier-3 tower is **three of the race's own shape closed in a triangle**.

---

## THE PRIORITIES

| # | Priority | Kind | Protocol |
|---|---|---|---|
| **P1** | Race-unit art regenerated with **no baked shadow** and **no near-white on the character** | art | none |
| **P2** | **W1-C — wire the castle emitter** (R133 sentinel SpawnerId) | code | **none owed** — rides 41 |
| **P3** | **Tier-3 tower units** — bat · piranha · scarab · hound · warband grunt · soul-eater | art | none |
| **P4** | **Tier-3 race towers** — 6 × {healthy, damaged, spawning, destroyed} + per-species destruction | art | none |
| **P5** | **12 zone backgrounds** (R137) | art | none |
| **P6** | Final audit — gates, commit, push, **deploy verified**, fix anything broken | verify | — |

### P1 — the two clauses, and why the second one is the real win
The shadow clause is the owner's note. The **near-white** clause is the fix for a *different* owner
reject: *"you have removed the white from the orcs eyes"*. The matte deletes enclosed near-white
pockets, and for the orc, eyes and background leaks measured the **same size** with a monotonic curve
and **no knee** — so no threshold separates them and S164 shipped a stated compromise (~55% of the
eye kept, ~31% of the leak left). If nothing on the character is near-white, every near-white pocket
is background *by construction* and the aggressive limit runs clean on all six.
⇒ The orc's `enclosedWhiteLimitPct: 0.0003` override is **retired only after the rebuilt sheet is
measured**, never on faith.

### P2 — what W1-C actually touches
Castle sentinel `SpawnerId` (R133) → `ownHomePos`, `underGoblinCaps`, `recipeStillSatisfied`.
Cadence on `world.tick` only (~30 s, R120) — no float accumulator, phase-spread by entity id.
Stats 1/1/1/1 (R125). A `CHEWER_MAX_*`-style sentinel backstop (R123/R124: no per-player cap, but a
backstop is required). Then the `RACE_UNIT` table + renderer wiring for the six atlases.

### P4 — the destruction cinematics, per species
Pyramid → collapses into a **sand-devil**; zombie kennel → slumps to **ooze**; vampire bat-cave →
**collapses in a burst of bats**; naga → **floods and drains**; orc → **burns and falls**; demon →
**implodes to embers**. ⛔ The **gravity rule** from the castle spec binds every `damaged` state:
a damaged tower is a state the board *holds for minutes*, not a freeze-frame — every detached piece
must have **come to rest**.

---

## EXIT GATES (all must hold at batch close)

1. `npm run typecheck` → `npx vitest run` → `npm run build` (under charter) → `npm run e2e:gating`.
   ⛔ **Exit codes read DIRECTLY, redirected to a file — never through a pipe.** S159 shipped past a
   `hard_fail=2` verdict exactly that way.
2. Every regenerated sheet is **LOOKED AT** before it is wired. A green suite proved nothing when the
   FIGHT banner shipped permanently oversized.
3. Art consistency is **measured, not eyeballed**: a leaked-white-pixel census per sheet, and a
   cross-race height check, both reported as numbers.
4. Deploy verified with `npm run verify-deploy` (content-hash equality). `gh api .../pages` is stale
   and must not be used.
5. Owner sees the art **as it lands**, not at the end.

## WHAT THIS BATCH DELIBERATELY DOES NOT DO

- **No tier-3 stat numbers** (R135 open — art only).
- **No dying-window in the sim.** The `die` row exists in every atlas and nothing plays it; that
  needs serialized state and is its own work. Generated, honestly unwired.
- **No handoff / no session close** — owner will review first.
