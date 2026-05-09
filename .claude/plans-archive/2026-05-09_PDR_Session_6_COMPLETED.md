---
session: 6 of 10
title: Polish Pass + Git + Carry-Forwards
tier: Standard (~25-30K, 6-8 files)
pdr_approved: true
deliberation_completed: true
unlock_source: user
approved_at: 2026-05-09
status: COMPLETED
completed_at: 2026-05-09
---

> **STATUS: COMPLETED** — All 4 priorities + git infra + browser verification shipped. Per-priority commits: `bc89a53` (initial), `cc1e0c7` (P1 bond-tier defensive fix), `ed9e879` (P2 effects cap + P3 12 magic-combo placeholders). 104/104 tests pass; typecheck clean. Browser-verified via Pixi grid render of all 13 visualEffects (12 magic + default).

# PDR — Session 6 (Polish Pass + Git + Carry-Forwards)

User explicit-go: "first commit and figure git ... then run top priority batch including top suggested priorities from handoff and carry-forward. Then make sure the game works ... please make sure in the end of this session that everything works! ... Priority batch and everything down the line this session is - APPROVED!!"

Council waived per Rule 17 user-path. PDR scope chosen so user has a clean playable build to test against between sessions, while NOT touching tuning numbers (those need playtest data).

## Priorities

### P0 — Git initialization + first commit (infrastructure)
- Project is currently NOT a git repo (per handoff). `.gitignore` exists already (basic Node/Vite hygiene).
- `git init` in the project root
- Set local user.email = `daneshto@gmail.com` per CLAUDE.md GIT IDENTITY (do NOT touch global config)
- First commit captures the entire current state (post-S5)
- Subsequent commits per logical priority below

### P1 — Bond stiffness tier latent bug (controls.ts single-action place)
**Root cause confirmed via static read**: in `controls.ts:onUp` line 182-197, `dispatch(PICKUP_SPARK)` is called BEFORE `computeStiffnessTier(world, spark.id, target)`. PICKUP_SPARK transitions the spark's state to `Carried` (world.ts:122-133) but the spark stays in `world.freeSparks`. However `computeStiffnessTier` does `world.freeSparks.get(carriedSparkId)` and reads `carried.type` — that path actually still works since the entry isn't deleted. **But** the original handoff said tier=MID was observed; need to re-verify in browser before assuming the fix is "always works". Most likely cause if bug reproduces: there's a code path where the spark IS removed before lookup, or the test was passing target=null.

**Fix**: capture `spark.type` BEFORE the PICKUP_SPARK dispatch (defensive — independent of map-state behavior). Refactor `computeStiffnessTier` to take the carried `SparkType` directly.

### P2 — Effects-list hard count cap (S3 carry-forward)
- `EffectsRenderer.active[]` is bounded only by lifetime ticks. A pathological spam (e.g. fast spam-place + spam-sever) could in theory grow it. Hard cap = drop oldest when over `MAX_ACTIVE_EFFECTS`.
- New constant: `MAX_ACTIVE_EFFECTS = 64` (well above any natural usage)
- In `EffectsRenderer.sync` after drain, if `this.active.length > MAX_ACTIVE_EFFECTS`, splice the oldest off the front.

### P3 — Combo visualEffectId rendering (S3 carry-forward)
- Currently every BOND_COMMIT looks identical (single white-ish ring). Spec calls for visually-distinct combos (Filament/Cable/Bracket/Diamond/Wheel/Star/Orbital/Lattice/Capsule/Vortex/Whip/Warped + 24 generic).
- Plumb `visualEffectId: string` from `PLACE_PRIMITIVE` dispatch path into the `BOND_COMMIT` effect record. World-side: lookup combo at place time, attach to effect.
- Renderer-side: switch on visualEffectId to render distinct **placeholder** flair (full-spec animations are Phase 2):
  - `fx.filament` → tight white starburst (snap-tight pop)
  - `fx.cable` → twin parallel rings
  - `fx.bracket` → angular polygon outline
  - `fx.diamond` → rotated square outline
  - `fx.wheel` → ring with spoke flicker
  - `fx.star` → 5-point star burst
  - `fx.orbital` → expanding double ring
  - `fx.lattice` → grid hatch
  - `fx.capsule` → rounded rect outline
  - `fx.vortex` → spiral flourish
  - `fx.whip` → wave squiggle
  - `fx.warped` → distorted ring
  - `fx.bond.default` → existing single ring (24 functional combos keep the current look)
- Keep all effects under EFFECT_LIFETIME_TICKS budget — pure decorative draw, no state.

### P4 — Browser verification + screenshots
- Restart dev server on `$SESSION_PORT` (or reuse if alive)
- Smoke screenshots:
  1. Empty canvas + spawner zone
  2. ~10 free sparks drifting (post-S5 slow drift)
  3. Pull spark out, single-action place → primitive + bond visible
  4. Place several with mixed types → see distinct combo effects
  5. RMB-sever → erase animation
- Confirm 104+ tests still pass

### P5 — Commit per priority + final commit + /handoff
Per-priority commits so git log narrates the session. Final `/handoff` writes the new HANDOFF + boot snapshot for S7.

## Acceptance criteria
1. `git status` clean; commits exist
2. `npm run typecheck` clean
3. All tests pass (104+; new effects-cap test if cheap)
4. Browser-verified: bond commit has distinct effect by combo; sever effect intact; no console errors
5. /handoff doc written; boot-snapshot regenerated; PDR archived

## Non-goals (explicitly deferred to S7)
- Tuning AUTO_BOND_RADIUS / ATTRACT_STRENGTH (need playtest data)
- Strain auto-sever threshold tuning (need playtest data)
- Audio (Suno track upload pending)
- Phase 2 multi-player scaffolding

## Rollback
Per-priority commits = each priority is independently revertable. Git init itself is reversible (`Remove-Item -Recurse .git`).

## Estimated tokens
~25-30K. Standard tier. User-path approval; same-turn flag-write + execution.
