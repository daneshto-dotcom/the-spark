═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-05-09
Session: 5 of 10 — Playability Pass (drift, spawn rate, DPR alignment, drag reliability, single-action place)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (geometric-emergence multiplayer prototype)
- Working directory: C:\Users\onesh\OneDrive\Desktop\The Spark
- Git: NOT a git repo — durable record is this handoff doc + .handoff-archive/
- Tech stack: TypeScript 5.x strict, Vite 5, PixiJS v8, Vitest
- Codebase: ~4250 LOC across 32 source + test .ts files (largest [controls.ts](src/input/controls.ts) ~330 LOC after S5 — anti-bloat charter ≤500 holds)

## CURRENT STATE
- Build: typecheck clean (`npm run typecheck`)
- Tests: 104/104 passing
- Spec: SPARK_Blueprint.md v0.5.1 (S4 amendment)
- Locked decisions: Open Items v2 amended this session — see LOCKED_DECISIONS.md § 2
- Dev server: http://localhost:15842 (Vite, named spark-dev) — running

## SESSION COST
- Model counter: ~/.claude/session-model-counts.tmp had 5 entries (3 sonnet, 1 opus, 1 haiku) — likely undercounts the real turn count of this long session
- Estimated routed cost from counter: ~$0.12 ; baseline: ~$0.38 ; savings: ~68%
- Cumulative log: ~/.claude/usage-log.csv (refreshed at SessionEnd)

## THIS SESSION'S WORK

User flagged 4 playability blockers from a hands-on attempt: drift speed, spawn rate, cursor alignment, drag reliability. Then surfaced 2 follow-up regressions live: max-speed clamp killing attract, and 2-action place feeling like sparks "stuck to the cursor". Session shipped all 4 originals + both hot-fixes, end-to-end browser-verified.

**P1 — Free-spark drift slowed.** [`constants.ts`](src/constants.ts) `SPARK_INITIAL_VELOCITY_MIN/MAX` 20-80 → 5-20. Tried a per-substep `SPARK_MAX_SPEED_PX_PER_SEC=30` clamp in [`spawner.ts:enforceSpawnerBounds`](src/game/spawner.ts) but it broke AttractDrag (clamped pull velocity too) so reverted same session. Lower initial range + Verlet damping handle drift naturally.

**P2 — Spawn rate reduced 10×.** [`constants.ts:70`](src/constants.ts:70) `SPAWN_RATE_PER_SECOND` 1.5 → 0.15. Strategic-bet feel restored.

**P3 — Cursor↔avatar pixel-aligned.** [`controls.ts:updateCursor`](src/input/controls.ts) — replaced `canvas.width / rect.width` (which double-counts DPR under `autoDensity:true`) with `CANVAS_WIDTH / rect.width`. Handles native size, HiDPI, AND CSS-constrained containers. Verified at TL/center/BR within 2 px float precision.

**P4 — LMB/RMB drag reliability.** [`controls.ts`](src/input/controls.ts): `pointerup` moved from canvas → `window`; `setPointerCapture` acquired on every drag entry; new `onLostCapture` safety net resets to Idle if focus is stolen mid-drag. Verified: synthetic LMB drag with `pointerup` fired on `window` correctly committed PICKUP and returned state to Idle.

**Hot-fix #1 — Attract responsiveness (mid-session).** Removed the max-speed clamp; bumped `ATTRACT_STRENGTH` 12 000 → 60 000 in [`controls.ts:39`](src/input/controls.ts:39); plumbed `controls.state.sparkId` through to [`enforceSpawnerBounds`](src/game/spawner.ts:111) as `exemptSparkId` so the actively-attracted spark skips boundary reflection. End-to-end probe: spark accelerated from zone-center past the 250 rim (peaked at 274), LMB-up triggered PICKUP cleanly.

**Hot-fix #2 — Single-action place.** Original 2-action design (LMB-out-of-zone → Carrying state → RMB-elsewhere → place) felt like "sparks attached to the cursor" on first playtest. Changed [`controls.ts onUp`](src/input/controls.ts:155): LMB-up outside zone now PICKUP+PLACE in one go, with auto-bond to any primitive within `AUTO_BOND_RADIUS=60`. Browser-verified: 2 sparks → 2 primitives + 1 bond after sequential drags.

**Tests fallout (3 spawn-rate-coupled tests broke from rate change):**
- [`spawner.test.ts`](src/game/spawner.test.ts) — Poisson rate test + in-disk sampling test now scale their simulation windows with `SPAWN_RATE_PER_SECOND` to preserve √N CI math.
- [`integration.test.ts`](src/physics/integration.test.ts) — Session-1 exit gate now overrides spawner rate to 1.5/sec since it tests physics-under-load, not the playability default. File header updated.

**LOCKED_DECISIONS amendments (Open Items v2 — 2026-05-09):**
- Item 3 spawn rate 1.5/sec → 0.15/sec
- NEW: spark initial velocity 20-80 → 5-20 px/sec
- NEW: ATTRACT_STRENGTH 12 000 → 60 000 (5×, in controls.ts not constants.ts)
- NEW: enforceSpawnerBounds exempts the AttractDragged spark
- NEW: LMB-up outside zone is single-action PICKUP+PLACE with auto-bond ≤60 px
- ABANDONED: SPARK_MAX_SPEED_PX_PER_SEC (added then removed inside S5)

## OPEN ISSUES

- **Bond stiffness tier defaulted to MID for Dot→Line** in single-action-place verification (spec says HIGH/Filament). Likely cause: `computeStiffnessTier` looks up the carried spark via `world.freeSparks.get(carriedSparkId)` AFTER `dispatch(PICKUP_SPARK)` — the dispatch handler may be moving/transforming the spark. Affects [`controls.ts:172-181`](src/input/controls.ts:172). Worth a 5-minute investigation in S6 — the combo lookup is plumbed but the wrong tier means strain-break thresholds + visual effects key off the wrong combo entry. Functional fix; not visible to the player yet because visualEffectIds aren't rendered (S3 carry-forward).
- **Effects active list lacks hard count cap** (S3 carry-forward — lifetime-bounded only).
- **Combo `visualEffectId`s wired in [combos.ts](src/combos.ts) but not rendered** (S3 carry-forward) — combos resolve mechanically but Filament/Cable/etc all look identical.
- **Strain auto-sever thresholds untested at real playtest pressure** (S3 carry-forward, was gated on S5 fixes; now ready).

## BLOCKED ON
None. S6 priorities are all self-contained: user playtest, then tune.

## NEXT STEPS (priority order)

**Session 6 — User Playtest + Tuning (TOP PRIORITY)**
1. Hands-on full game loop: pull spark → drop → bond → form 5-spark structure → sever → win condition
2. Investigate bond-tier=MID for Dot→Line latent bug (~5 min)
3. Tune strain auto-sever thresholds with playtest data
4. Decide if AUTO_BOND_RADIUS=60 feels right (forgiving vs sticky)
5. Decide if ATTRACT_STRENGTH=60 000 is too snappy (overshoot)

**Session 7+ recommendations:**
- Render combo `visualEffectId` placeholders so combos visually differentiate
- Effects-list hard count cap (S3 carry-forward)
- Multi-player scaffolding (Phase 2 prep)

## CHANGED FILES (this session)
```
src/constants.ts                   ±5 lines (SPAWN_RATE 1.5→0.15, INITIAL_VEL 20-80→5-20)
src/game/spawner.ts                ±15 lines (max-speed clamp added then removed; SparkId import; exemptSparkId param)
src/input/controls.ts              ±60 lines (DPR fix, pointer capture, lostpointercapture, single-action place, auto-bond, AUTO_BOND_RADIUS, pickPrimitiveInRange, ATTRACT_STRENGTH 12k→60k)
src/main.ts                        +3 lines (attractedId plumbing)
src/game/spawner.test.ts           ~25 lines (rate-coupled window scaling)
src/physics/integration.test.ts    +6 lines (rate override + header note)
LOCKED_DECISIONS.md                +12 lines (Open Items v2)
BACKLOG.md                         (no change — Session 5 entry inherited)
reflexion_log.md                   +12 lines
boot-snapshot.md                   regenerated
.claude/plans/PDR_Session_5.md     deleted (archived as COMPLETED)
.claude/plans-archive/2026-05-09_PDR_Session_5_COMPLETED.md   NEW
```

## SESSION PIPELINE REPORT
Pipeline: ad-hoc spec-alignment carry-over (no PDCA state file used) | 1 PDR (Session 5, Standard tier, user-path approval) | All 4 originals + 2 hot-fixes complete | Browser-verified twice (after each hot-fix)

## REFLEXION ENTRIES (this session)
- S5 #single-action-place: 2-action place rejected on first playtest; LMB-up auto-place + auto-bond ≤60 px shipped same session.
- S5 #max-speed-clamp-broke-attract: per-substep velocity clamp clamped attract too — gate clamps by spark state or don't add them.
- S5 #attract-needs-momentum-or-strength: tuning numbers couple — changing initial velocity rebalances every interaction that assumed it.
- S5 #spawner-bounds-blocks-pickup: physics confinement and player extraction are mutually exclusive; per-spark exempt is the cleanest seam.
- S5 #headless-test-contamination: probes must `world.freeSparks.clear()` + reset player to Idle to be hermetic.
- S5 #dpr-double-bug: Pixi `autoDensity:true` already inflates canvas.width by DPR; scale by stage→rect only.
- S5 #naive-fix-incomplete: verify cursor mapping in a CSS-shrunk container, not just at native size.
- S5 #pointer-capture-auto-release: browser-managed capture release fires `lostpointercapture` before our onUp — first one wins is fine.
- S5 #spawn-rate-test-coupling: tests reading constants couple by reference; either compute thresholds from the constant or override config.
- S5 #max-speed-clamp-location: best location for clamps is the existing per-substep loop, not the integrator.
- SESSION #user-path-go-skip-deliberation: a well-written backlog carry-forward block IS its own deliberation log.

## CARRY-FORWARD PRIORITIES
1. Bond stiffness tier defaulting to MID — investigate computeStiffnessTier lookup ordering after PICKUP_SPARK dispatch (~5 min)
2. Strain auto-sever threshold tuning — needs real playtest data (S3 carry-forward, now unblocked)
3. Effects-list count cap — S3 carry-forward
4. Combo visualEffectId rendering — S3 carry-forward

═══════════════════════════════════════════════════════════
