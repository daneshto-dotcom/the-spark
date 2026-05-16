# Boot Snapshot (auto-generated at S33 close)
Generated: 2026-05-16 | Session closed: S33 (S32 P1 audit batch — 9 priorities shipped) | Last commit: 99e8b1a

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master)
**https://spark-online.space/?debug=1** (debug overlay + `[cinematic] video.*` events + `[creature] state` every 60 ticks)

## Status
S33 P1 batch complete. 9 priorities shipped from S30 audit P1 findings (originally 10; P1-7 dropped per PRIME-AUDIT Δ2 as audit false-positive — existing `cutsceneOverlay.ts:364` comment already documents the belt-and-suspenders intent). Standard tier Council R1 + PRIME-AUDIT 2 evidence-based overrides reversed Council on Q1 (no schema bump per S15 P2/S28 P0/S31 P0-3 precedent) and Q3 P1-7 drop.

**Tests:** 588/588 (576 baseline + 12 new across P1-12 ×4 + P1-11 ×2 + P1-6 ×6)
**Bundle:** 467.46 KB (32.54 KB headroom on 500 KB hard cap)
**Branch:** master, clean, in sync with origin
**Context at close:** 275,699 / 1,000,000 (27.6% GREEN)

## Next Steps
1. **User-noted bugs** — pending from S31/S32: user said "a few bugs i will note later"; capture the list at S34 boot before any new work.
2. **1v1 brother retest** — NetSnapshot effects mirror (S31 P0-3) + creatureId additivity (S33 P1-11) need cross-network 2-peer playtest confirmation. User-driven.
3. **S33 P2 batch** — 9 P2 audit findings (see BACKLOG.md §"Session 33"): ScreenShake.reset wiring verify, voltkin-config.ts refactor (prereq for Anvil), Phase-2 codification in LOCKED_DECISIONS, etc. Standard tier ~18-22K.
4. **S34+ Anvil creature** — post-audit-cleanup base. P2-20 voltkin-config refactor is the prereq (consolidates hardcoded constants from 6 files into per-type CreatureConfig table).
5. **Bond UX**: RMB-drag multi-target for polygon frames (S23 P2 carry).

## Blockers
None. Production deploy live + verified HTTP 200 at S33 boot. Bundle within cap. All tests green. Master in sync with origin.

## Pending Backlog (excerpt — see BACKLOG.md for full)
- [ ] S33 P2 batch (9 audit findings — `BACKLOG.md §"Session 33"`)
- [ ] S34+ Anvil creature (apply S25-S28 architecture + voltkin-config base)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (S23 P2 carry)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational; low priority)

## Manual Smoke (CHECK live — if running it again)
Open `https://spark-online.space/?debug=1` solo. **Hard refresh (Ctrl+Shift+R) first.** Build SQ4-TR4 chain. Expected:
- Cinematic phase: mp4 video plays (~4 sec)
- Voice plays "Volt-kiiin!" at ~3.5s
- bg fades out ~800ms after mp4 end
- Voltkin SPAWNING pulse FULLY visible from tick 288 onward (S31 P0-1)
- Lightning attacks with cyan jagged bolts; **jitter pattern now varies per creature** (S33 P1-11 creatureId mix)
- Screen shake on each fire-tick — gate now ARC_FLASH-explicit, not bond-delta (S33 P1-6)
- Despawn shrink-fade at ~8s
- R or canvas-click mid-cinematic cleanly resets (S31 P0-2)

## Recent Reflexion (S33 highlights)

### S33 P1 batch
- **#audit-finding-can-be-false-positive-when-existing-comment-documents-intent**: P1-7 was dropped after PRIME-AUDIT read `cutsceneOverlay.ts:364` and found the redundancy was already documented as intentional. Pattern: for any audit claim of "redundant/dead/duplicate" code, read ±20 line context for rationale comments before accepting.
- **#council-reasons-from-generic-best-practice-prime-audit-brings-domain-evidence**: Council unanimously voted bump SCHEMA_VERSION; PRIME-AUDIT read `save.ts:75-83` and found documented S15 P2/S28 P0/S31 P0-3 additive-optional precedent. Override reversed Council 2-0. Pattern: PRIME-AUDIT MUST grep for prior schema/protocol/version decisions before accepting any Council bump recommendation.
- **#replay-determinism-test-catches-its-own-first-run-nondeterminism**: P1-12 failed first run on `savedAt: new Date().toISOString()`. Test caught real nondeterminism on its FIRST run — stronger signal than "test passed." Lesson: distinguish game-state-determinism from intentional metadata.
- **#replay-test-as-guard-for-byte-exact-refactor-claim**: P1-12 ordered FIRST so P1-10 (pseudoRand consolidate) algebraic-equivalence claim was empirically verified by replay tests passing post-refactor. Grok's R1 catch of ordering was the highest-value Council contribution.
- **#a0-state-discovery-gate-catches-backlog-scope-deltas-before-user-go**: BACKLOG said 6 stale handoffs; A.0 probe found 9 (6 IDENTICAL + 1 DIFFERS + 1 NO-ARCHIVE + current). DIFFERS file was actually NEWER than archive — would have lost data without inspection.

### S32 lesson carry-over
- **#browser-cache-first-look-for-multi-system-asset-loss**: When multiple unrelated deployed-asset subsystems fail simultaneously, FIRST hypothesis is stale browser cache. Three 30-second user-side diagnostics (hard refresh, ♪̸ icon, debug=1 console) rule out 80% of "regression" reports.
