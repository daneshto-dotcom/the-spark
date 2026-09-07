# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-07 | Session: S165 | Commit: `bee38a1` | **PROTOCOL 42**

State at close: `tsc` 0 · **3756/3756** unit tests / 241 files · `e2e:gating` exit 0, 62 passed ·
`e2e:races` exit 0, 5 passed · bundle **784.8 / 900 KiB** · static assets 76.0 MiB (reported, not
gated) · `check:atlas` 0 (30 atlases) · `verify-deploy` **PASS 4/4** at `843f025` · MCV
`hard_fail=0` · CI all-green (E2E + Deploy) on the last three commits.

> ⭐ **W1-C IS WIRED AND LIVE.** The castle produces its race's unit — `src/state/raceUnitEmit.ts`,
> PROTOCOL 41→42. The twelve per-race zone backdrops are live, with a settings toggle back to cosmos
> black. Per-race music shipped with its own toggle.
>
> ⭐ **A FIVE-LANE SWEEP CLOSED 20 FINDINGS**, including a real multiplayer bug: a host takeover
> could silently OVERWRITE a live spark, because `nextPulledSparkId` was rebuilt by nothing despite
> a docblock promising the rebuild.
>
> ⛔ **THE TIER-3 TOWER AND ITS SIX UNITS ARE STILL ART-ONLY.** 18.4 MB ships and no code references
> it. The owner stopped the build for context and set it as **first priority next session**.

## Next Steps

1. ⭐ **BUILD THE TIER-3 TOWER + ITS SIX UNITS — owner's explicit first priority.**
   *"i want to test all the tier 3 units of all races"* … *"lets close off leave it as first
   priority next session"*. **Fully scoped in `S165_OPEN_ITEMS.md` → "FIRST PRIORITY NEXT SESSION"**
   — read that section before planning, it is the research not the summary. Key points:
   · **R134**: these units come from the TOWER, not the castle. Do not shortcut that for testing.
   · **R135**: stats UNRULED. The owner intends to decide by TESTING, so ship provisional numbers
     and mark every one as MINE at the constant — the project's standing convention.
   · Shape: **ONE recipe, six race-keyed outputs** (goblinTower's precedent, and what R134 says).
   · A new recipe needs an unoccupied (hub type, hub degree) pair, **re-derived from the live
     registry** — a collision builds the wrong structure silently.
   · Owes a **PROTOCOL bump 42→43** (new `CreatureType` discriminant), six sites.
   · Put its e2e in the **`@races` lane**, never the shared one.
   · ⚠ Ask the owner the tower's **build cost** first — cheaper than a rework.
2. **Wave-5 tech draft (R101–R112)** — fully specced, zero code. R112 is itself the trigger:
   *"BUILD ONLY WAVE 5 FIRST… ask once wave 5 ships."* Needs owner stat rulings.
3. Two owner decisions surfaced by the new music feature, both named at their code:
   a **track swap restarts from 0:00** (WebAudio sources are single-use), and **HELGA/NONET still
   outrank the base track** — which now means they interrupt a player's race identity music.
4. Residual low-value sweep items, all documented and none load-bearing: dead exports
   (`CREATURE_HIT_DAMAGE`, `isDebugMode`, `CREATURE_ROLES`, `DEFENDER_ROLES`), the
   `serializerCompletenessSweep` that is not a sweep, `SLICE_SPEC.md` served publicly, and the
   9.77 MB `blue-steppe-orbit.mp3` retained as a manual spare (15% of the static payload — its
   false "Safari fallback" rationale is now corrected in code, deleting it is the owner's call).

## Blockers

**None blocking.** Two items need owner RULINGS rather than work: tier-3 stats (R135) and the
wave-5 perk numbers (R112's named trigger). The tower's build cost is a third, and is the one worth
asking before writing code.

⚠ **Unreproduced, not benign:** `worker-bots.spec.ts:78` failed ONCE in a full-suite local run
(world back at TITLE/solo mid-test), then passed standalone, passed a second full-suite run, and
passed on CI. The project CLAUDE.md already records this spec as historically red. Watch it.

## Pending Backlog

- [ ] Tier-3 tower + six units (see Next Steps 1 — the live plan is `S165_OPEN_ITEMS.md`)
- [ ] Wave-5 tech draft, R101–R112 (needs owner rulings)
- [ ] Race perks for waves 10/15/20 — eighteen perks, deferred by R112
- [ ] The six race castle-upgrade branches (Layer 2) — owner: *"don't worry about them right now"*
- [ ] `die` animation rows exist in all 12 unit atlases and CANNOT play — `syncSprite` maps every
      state to attack/walk/idle. The tower destruction atlases imply the owner wants this; it is a
      renderer change, and `check-atlas-scenery.mjs`'s deliberate `die` exclusion must move back
      into the verdict the same day.

## Recent Reflexion (last 2 sessions)

Read `.claude/reflexion_log.md` — S165's fourteen entries are at the top, S164's ten below them.
The S165 ones worth reading before touching tests or CI:

- `#a-partial-negative-control-accuses-a-working-test` — a control that neutralises one of two code
  paths convicts working code; one that silently matches nothing manufactures confidence.
- `#never-assert-on-anything-a-wall-clock-touches` — a frame-comparison test encoded the speed of
  the machine and blocked the deploy. Identify what quantity the claim is about first.
- `#a-lane-budget-is-a-shared-resource` — a slow test in a shared lane does not fail, the LANE times
  out; and prove a cadence with a probe before trusting arithmetic about when it first fires.
- `#scout-the-subsystem-before-designing-against-it` — two read-only passes caught four defects that
  would otherwise have shipped, including a ~736 MB audio cache.
- `#read-the-number-the-error-printed` — three wrong diagnoses of one CI red; the answer was in the
  first error string all along.
- `#an-asset-opinion-must-never-block-a-ship` — a quality guard wired into `npm run build` took the
  live deploy down and caught nothing.
