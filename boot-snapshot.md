# Boot Snapshot (auto-generated at S34 close)
Generated: 2026-05-16 | Session closed: S34 (Phase A: S30 audit P2 batch — 8 priorities + Phase B: fresh audit cleanup — 9 priorities) | Last commit: e52a963

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master)
**https://spark-online.space/?debug=1** (debug overlay + `[cinematic] video.*` events + `[creature] state` every 60 ticks)

## Status
S34 Phase A + Phase B complete. 17 priorities shipped (Phase A: P2-22, P2-23, P2-17, P2-21, P2-19, P2-16, P2-20, P2-24 + Phase B: PB-1..PB-9), with P2-18 dropped (false-positive pattern #2) and 3 Phase B audit-agent false-positives rejected with documented rationale.

**Tests:** 625/625 (588 baseline + 32 Phase A + 5 Phase B; P1-12 replay + new PB-5 creature replay both green)
**Bundle:** 468.14 KB (31.86 KB headroom on 500 KB hard cap)
**Branch:** master, clean, in sync with origin
**Context at close:** ~406K / 1M (40.6% GREEN)

## Next Steps
1. **User-noted bugs** — still pending from S31/S32 carry; user said "i will check later." Capture list at S35 boot before any new scope.
2. **1v1 brother retest** — NetSnapshot effects mirror (S31 P0-3) + creatureId additivity (S33 P1-11) need cross-network 2-peer playtest confirmation. User-driven.
3. **S35+ Anvil creature** — Phase A P2-20 shipped the voltkin-config.ts CreatureConfig table — Anvil is now a `+1 CreatureConfig entry + 1 attack handler dispatch` instead of `+6 file edits per constant`. See LOCKED §13.15 Anvil migration checklist.
4. **Bond UX**: RMB-drag multi-target for polygon frames (S23 P2 carry).
5. **P3 NET enhancements** (Standard, playtest-gated): client prediction + delta NetSnapshot + host migration + live cursor sync.

## Blockers
None. Production deploy live + verified HTTP 200 at S34 Phase A close. Phase B was 100% doc + test + dead-code-delete (zero production risk). Bundle within cap. Master in sync.

## Pending Backlog (excerpt — see BACKLOG.md for full)
- [ ] S35+ Anvil creature (apply consolidated voltkin-config + new attack handler)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (S23 P2 carry)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D Inject Spiral / E Steal / A Fog / G Mega-combos)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational; low priority)
- [ ] CutsceneOverlay.abort integration test (S34 P2-24 stretch goal deferred)

## Manual Smoke (CHECK live — if running it again)
Open `https://spark-online.space/?debug=1` solo. **Hard refresh (Ctrl+Shift+R) first.** Build SQ4-TR4 chain. Expected:
- Cinematic phase: mp4 video plays (~4 sec)
- Voice plays "Volt-kiiin!" at ~3.5s
- bg fades out ~800ms after mp4 end
- Voltkin SPAWNING pulse FULLY visible from tick 288 onward (S31 P0-1)
- Lightning attacks with cyan jagged bolts; **jitter pattern varies per creature** (S33 P1-11 creatureId mix)
- Screen shake on each fire-tick — gate ARC_FLASH-explicit (S33 P1-6)
- TITLE-transition cleanup: cutsceneOverlay.abort + screenShake.reset + creatureRenderer.clear (S34 P2-16)
- Despawn shrink-fade at ~8s
- R or canvas-click mid-cinematic cleanly resets (S31 P0-2)

## Recent Reflexion (S34 highlights)

### S34 Phase B (fresh audit + cleanup)
- **#audit-agent-false-positive-rate-9-percent-control-flow-skipped**: 4-parallel audit produced 16 findings; PRIME-AUDIT rejected 3 (~9%) on control-flow grounds. Cumulative S33+S34 rate ~9% (3 of 32). Audit prompts are tuned to "flag scary patterns" but skip the 5-line context grep that distinguishes real hazards from guarded code. Codify: grep ±5 lines for guards (`if (... < eps)`, early returns) before accepting div-by-zero / NaN / underflow claims.
- **#test-invariant-vs-runtime-guard-choose-by-reachability**: PB-8 considered adding a defensive runtime guard in computeCreatureTint. PRIME-AUDIT confirmed: control flow prevents reach (FIRE_TICK=0 → `ticksInState < 0` is unreachable). Runtime guard would be dead code. Test invariant tightening (`> 0` not `>= 0`) is the right defense. Lesson: when a guard is proposed, ask "can the guarded condition ACTUALLY occur in production?" — if requires source-code edit, fix is test-invariant, not runtime guard.
- **#council-q-pre-resolve-saves-revision-round**: Gemini AUDITOR R1 verdict REVISE; PRIME-AUDIT pre-resolved all 4 open Q's with evidence-locked answers. Council R2 would have just confirmed. Lesson: structure PDR Q's to expose evidence-based answers, not gestalt-pick — synthesis pre-locks save the re-prompt cycle.

### S34 Phase A (S30 audit P2 batch)
- **#audit-finding-false-positive-pattern-fires-twice-in-2-batches**: P2-18 'godly' variant flagged as dead but ALREADY-documented intentional back-compat. Same as S33 P1-7 (belt-and-suspenders video pumping). 10% false-positive rate consistent across S33+S34 batches.
- **#voltkin-config-as-anvil-prereq-byte-exact-via-replay-determinism**: P2-20 lifted 7 hardcoded VOLTKIN_* constants into per-type CreatureConfig table. P1-12 replay-determinism test STAYED GREEN through refactor — empirical byte-exact proof. Pattern carry-forward for Anvil: any physics/state refactor must run save.replay.test.ts as GO/NO-GO gate.
- **#council-helper-extraction-tradeoffs-tested-vs-untested-dom-code**: P2-24 pure-helper extraction works on DOM-gated paths IFF compute-phase distinct from apply-phase. Compute = returns data (diff, polyline). Apply = side effects. CutsceneOverlay.abort has no compute-phase → extraction infeasible → deferred to S35.
