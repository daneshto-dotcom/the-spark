# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-26 | Session: S106

## ⭐ FULL PRIORITY BACKLOG — owner to review + organize (everything still open across S104→S106)
> Owner asked to see the COMPLETE defined-but-undone backlog at boot to reorganize it. Deduped below.
> Owner will FIRST playtest the live S106 build and bring corrections — those jump the queue (regression-first).

### A. From the S105/S106 sessions (carry-forwards)
1. **Anti-coast POINT-LOSS — owner picks the lever** (S106 shipped the visible own-score bar + harsher NONET 0.5→0.4; the *deeper* lever is undone):
   - (2) **Leader score-decay** — the current leader slowly bleeds points once past 75% (gentle coast-breaker), OR
   - (3) **Lose-a-structure CLAWBACK** — an enemy chewer/raid severing your connector or killing your spawner DOCKS your banked score (most competitive, but OVERTURNS the S76 "banked score is safe" invariant → own PDR, floor-at-0, host-only, serialized, replay tests).
2. **SCALABLE "smooth regardless of host" MILESTONE** (S105 chose the architecture; the cutover is undone): move the authoritative sim into a **Web Worker** so the host becomes render-only (== client; worker boundary == future dedicated-server boundary). Flag-gated (`?worker=1`) own session. Groundwork that ships with/before it: snapshot **pooling + delta-encode** (the real O(world)/100ms fix), `runHostTick` extraction, STATEHASH + transcendental-determinism audit, collision 64→8 grid-rebuild (needs a new stepPhysics replay test FIRST).
3. **Voltkin polish** (S106 shipped the procedural rig): VISUAL-TUNE the electric being if the owner doesn't love it (fully tunable in voltkinPose.ts/drawVoltkin) + DEAD-ASSET cleanup (delete the dead atlas/legacy PNGs/build scripts AFTER an import-graph grep — KEEP voltkin-zap.png, it's the Codex placeholder for 4 recipes).
4. **bot-self-break-its-own-pentagram polish** — the bot auto-bonds into its seeded ring → self-breaks its spawner (monitor; place the ring farther or mark nodes no-auto-bond).

### B. From BACKLOG.md Tier-1 CORE GAME (USER-MANDATED, still open)
5. **G1b MOTION** — Wheel/Star slow structure rotation; Capsule glow-trail. (S90 deferred: needs a mechanical verb, not pure visual.)
6. **G2 family TRAITS** — rule-based per-family traits so every placeholder pair does something. **GATED:** needs a LOCKED_DECISIONS §6 lock-amendment (functional combos locked MID/1.0×/generic).
7. **G3b Codex silhouettes** — undiscovered combos render as silhouettes; mark used combos. (S104 unified codex covers how-to-build; silhouettes are the remaining bit.)
8. **G4 build-feel juice** — in-world LEADER CROWN + enhance the existing BOND_COMMIT flair (re-scope, NOT a parallel burst) + pooped-reject cue. (S104/S105 deferred.)
9. **Ghost build-hint** — live next-primitive scaffold ("you're 1 triangle away") for the spacing-sensitive TD recipes.
10. **TD connector visible-damage** — render Bond.hp so a chewed connector visibly degrades (S102 de-scope).

### C. BACKLOG.md Tier-3 infra + PARKED (only after Tier-1 or explicit ask)
11. **Host migration** (D1-D4) — surviving player takes over when the host drops (HOST_MIGRATION_DESIGN.md). [NOTE: the worker-sim milestone #2 is the modern path to this.]
12. Dense-compaction colour-shift at Begin · periodic-scoreboard knob · (Tier-4) VFX lightning-overlay library · (PARKED) 10Hz client-mirror pose-stepping smoothing.

## Next Steps
1. **PLAYTEST the live S106 build** on https://spark-online.space (rematch a friend): +25% match length; build a 1-Line+7-Spirals turret (codex shows it); HELGA slapping across the screen; a NONET loss visibly halving YOUR bar + the red flash; the new procedural Voltkin (no more gif-square). Bring corrections — they jump the queue.
2. **Organize the FULL BACKLOG above** (owner request) into the next session's priorities.
3. Then execute the chosen batch under a PDR.

## Blockers
None. All S106 work is LIVE (Deploy to GitHub Pages SUCCESS for 9631995) + verified (vitest 1664/1664, tsc 0, MCV exit 0, runtime boot-smoke clean). The push-triggered E2E (2-browser, non-gating; S106 doesn't touch the net/fog contract) — confirm green next boot via `gh run list --workflow="E2E (2-browser harness)"`.

## Pending Backlog
(BACKLOG.md uses TIER structure, no `- [ ]` checkboxes — see the FULL PRIORITY BACKLOG section above for the complete consolidated list.)

## Recent Reflexion (last 2 sessions)
See .claude/reflexion_log.md top 2 blocks (S106 + S105). S106: balance anchors bump in lockstep or the invariant test catches you · match the shape not the color (rainbow teeth) · a screen-wide melee needs a reach VFX · a correct reducer can still be an invisible bug (display layer) · a procedural rig replaces a bitmap by keeping every pure helper + porting the watcher verbatim. S105: the randomness bug was a fixed seed not a bad picker · reveal the recipe not the reward · profile before optimizing the host gap · not broken just quiet (gnaw).
