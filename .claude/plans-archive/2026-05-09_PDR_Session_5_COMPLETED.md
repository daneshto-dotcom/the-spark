---
session: 5 of 10
title: Playability Pass
tier: Standard (~12-15K, 3-4 files)
pdr_approved: true
deliberation_completed: true
unlock_source: user
approved_at: 2026-05-09
status: COMPLETED
completed_at: 2026-05-09
---

> **STATUS: COMPLETED** — All 4 priorities landed + 2 user-driven hot-fixes (max-speed clamp revert, single-action place). 104/104 tests pass.

# PDR — Session 5 (Playability Pass)

User pre-approved via "run top priority session batch (especially the four fixes I told you about last session)". Council waived per Rule 17 user-path. Priorities triaged in BACKLOG.md "Session 5 — Playability Pass [TOP PRIORITY]".

## Priorities

### P2 — Reduce spawn rate (executed first; trivial)
- `constants.ts` `SPAWN_RATE_PER_SECOND` 1.5 → 0.15

### P1 — Slow free-spark drift + max-speed clamp
- `constants.ts` `SPARK_INITIAL_VELOCITY_MIN` 20 → 5
- `constants.ts` `SPARK_INITIAL_VELOCITY_MAX` 80 → 20
- `constants.ts` new `SPARK_MAX_SPEED_PX_PER_SEC` = 30
- `spawner.ts:enforceSpawnerBounds` — clamp implicit velocity for Free sparks after reflection

### P3 — Cursor↔avatar DPR fix
- `controls.ts:updateCursor` — drop `canvas.width / rect.width` scaling. Pixi `autoDensity:true` keeps stage in CSS-px; we were double-counting DPR.

### P4 — LMB/RMB drag reliability
- `controls.ts` constructor — add `setPointerCapture(e.pointerId)` on pointerdown when transitioning out of Idle; move `pointerup` listener from canvas → window; add `lostpointercapture` safety net; drop `pointerleave` Idle reset (capture covers it).

## Acceptance criteria
1. typecheck clean
2. 104/104 tests pass (no test additions expected; spawner test is rate-independent)
3. Browser at localhost:15842 verified: scarce slow drift, pixel-aligned cursor, 10/10 drag commits
4. LOCKED_DECISIONS.md § 2 amended (Open Items v2): new spawn rate + velocity range + max-speed clamp
5. reflexion_log.md S5 entry appended

## Rollback
Revert constants + controls.ts + spawner.ts diff — single-session scope, no downstream consumers.
