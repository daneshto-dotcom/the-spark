# Boot Snapshot (auto-generated at S30 close)
Generated: 2026-05-14 | Session closed: S30 → next: S31 | Last commit: 9d69a21 (S30 reflexion entries)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay + S30-P0a video diagnostic + S30-P0b creature-state log)

## Status

**S30 P0 COMPLETE — 6 priorities all shipped + verified via preview-tool screenshots**. User pre-approved overnight execution after reporting regressions on live site (static voltkin instead of mp4 + no movement/laser). Root cause was NOT what the user (or initial diagnosis) thought — the cinematic overlay was opaque-black for 12 sec covering Voltkin's entire 8-sec lifetime. ARC_FLASH lightning had been shipped in S27 and was firing the whole time, invisible underneath. Fix path was 2 LOC + 1 method deletion + a defensive mp4 fix + visibility tuning. Voltkin now: cinematic mp4 plays → bg fades 800ms after mp4 → creature visible for ~7s with head-tracking rotation, walking toward bond targets, attacking with bright cyan jagged lightning bolt + radial spark burst + screen-shake on fire-tick.

**5 commits shipped (origin/master)**: dbd0e51 (P0a cinematic mp4 fix) → 3edf7cd (P0b overlay timing) → cc920f8 (P0c ARC_FLASH visibility tune) → ac6848d (P0d procedural rotation/lean) → fc9e18f (P0e screen-shake + sparks) → 5648681 (close state) → 9d69a21 (reflexion).

## Next Steps (S31+ candidates)

1. **User confirms visual quality of voltkin alive feel** — open https://spark-online.space/?debug=1 + build SQ4-TR4 chain. Expect: mp4 cinematic plays (not black/static) → creature emerges + walks (with rotation lean toward target bond) + attacks with bright cyan jagged lightning bolt + screen-shake + radial sparks → 7 attacks over ~6 sec → DESPAWN shrink-fade. If quality acceptable: S31 moves to Anvil. If iteration needed: tune specific dimension (rotation amplitude, lightning duration, spark count, etc.).
2. **S31 Anvil creature** (Standard ~25K) — apply S25-S28 architecture (FSM + Verlet + AI + ATTACK + NetSnapshot v2 mirror) to second godly. Per-type CreatureConfig table comes online (Gemini Q2 carry from S26+S27+S28). Visual treatment is per-character bespoke (S29 pre-mortem killed cross-godly payback claim).
3. **S31 alt — Bond UX RMB-drag multi-target** (Micro/Standard) — long-standing S23 P2 carry. Smaller scope, no asset blocker.
4. **S31 alt — Per-type CreatureConfig table** (Micro) — Gemini Q2 carry from S26+S27+S28. Refactor creature.ts + creatureLifecycle.ts to read per-type constants from a config map. Enables Anvil ship cleanly.
5. **S31 alt — 1v1 brother retest** — NetSnapshot v2 mirror still unblocks. After S30 ARC_FLASH visibility + procedural rotation, 1v1 should look as good as solo on both peers.

## Blockers
None. All S30 P0 priorities complete + pushed. GH Pages auto-deploys on push to master.

## Manual Smoke (P0f verification)

Open `https://spark-online.space/?debug=1` in solo. Build SQ4-TR4 chain. Observe:
- Cinematic phase: mp4 video plays (voltkin emerging from TV, ~4 sec) — NOT pure black, NOT static stamp
- Voice plays "Volt-kiiin!" at ~3.5s
- bg fades out ~800ms after mp4 ends
- Voltkin creature visible in play area for ~7 sec
- Creature sprite has rotation tilt (leans toward target bond)
- Lightning attacks: ~7 cyan jagged bolts emanating from voltkin to bonds, with corona+halo+core multi-pass rendering
- Screen shakes briefly on each fire-tick
- Radial spark burst at lightning origin
- Despawn shrink-fade at ~8s mark

Console diagnostic at `?debug=1`:
- `[cinematic] video.*` events: loadstart → loadedmetadata → loadeddata → canplay → play → playing → pause → ended
- `[creature] state` every 60 ticks: id + state + ticksInState + targetBondId + pos + targetPos

## Pending Backlog
- [ ] S31+ Anvil creature using proven Phase 2 architecture (apply S25-S28 to second godly)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (S23 P2 carry)
- [ ] Per-type CreatureConfig table (Gemini Q2 carry S26+S27+S28)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational; low priority)

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 30 (P0 Voltkin regression repair + alive pipeline — Standard-tier Grok pre-mortem only, Gemini quota exhausted)
- S30 #real-root-cause-was-overlay-timing-not-shader-or-fsm: Lifecycle math (overlay duration vs creature lifetime) is the cheapest debug pass for "feature visible but broken" complaints. Pattern: map wall-clock timeline of obstruction-window vs feature-window BEFORE diving into shader/CORS/autoplay theories.
- S30 #lightning-was-already-shipped-claimed-not-built: A.0 STATE-DISCOVERY GATE must Glob keyword patterns from PDR scope BEFORE proposing "build new." Boot prompts and reflexion logs can mis-frame state.
- S30 #grok-pre-mortem-3-useful-deltas-2-fabricated-rejected-pattern: Code-blind LLM pre-mortem hallucinates ~30-50% of specific cited lines. Extract CATEGORIES of risk; verify each against actual code. Format prompt as "list bug categories" not "cite buggy file:lines."
- S30 #gemini-2-5-pro-daily-quota-1000-requests-rule-17-2way-fallback: gemini-2.5-pro has hard 1000/day cap. Monitor quota early; fall back to flash for non-critical passes; document quota-exhausted in session-state.
- S30 #user-pre-approval-overnight-execution-mode-pattern: When user says "going to bed / pre-approve / work to completion," session is ATOMIC. No partial wins. Plan ALL pivots upfront. Use preview-tool screenshots as approval proxy.
- S30 #preview-tool-ticker-pump-needed-for-headless-simulation-advancement: app.ticker.update(synthetic ms) drives world.tick deterministically. Replay-safe code makes this reliable. Use for tick-gated visual feature verification.
- S30 #verify-handoff-before-fsm-edits-paid-off: For "feature regression on shipped code" fixes, read full data-flow chain (state machine → orchestration → render → display) BEFORE editing any layer. Catches "the bug is elsewhere" cases.
- S30 #standard-tier-check-degraded-to-screenshot-self-audit-when-gemini-unavailable: Document degradation explicitly in session-state.active_* fields. Don't pretend Triumvirate ran; record what actually happened.

### 2026-05-14 — Session 29 (P0a Cinematic shader fix — Standard-tier Council R1+R2 + user-requested PRE-MORTEM Triumvirate audit; P0b rig system DEFERRED to S30)
- S29 #user-requested-pre-mortem-found-11-issues-r2-synthesis-missed: pre-mortem (Grok+Gemini+RALPH) on R2-locked plan found 11 CRITICAL/HIGH issues R1+R2 missed; cost ~$0.05 vs 25K rebuild
- S29 #imagen-reference-conditioning-non-functional-with-api-key-auth: gcp-vertex MCP `imagen_edit` description explicit; read tool descriptions for capability limits
- S29 #imagen-text-only-cannot-hold-locked-canonical-style: $0.02 probe + 6 prior failures = 7 confirmations; manual slice is only reliable path
- S29 #alive-needs-concrete-reference-not-mechanical-interpretation: probe concrete references BEFORE designing for abstract aesthetic words
- S29 #rig-pays-back-claim-must-be-roadmap-verified: "pays back across X" must be verified against actual roadmap entity topologies
- S29 #glsl-es-300-vs-legacy-100-silent-shader-failure-class: Pixi v8 auto-300-version prelude silently fails on mixed `in vec2` + `gl_FragColor`
- S29 #askuserquestion-tool-can-return-empty-answers: use inline-prose-numbered-options for load-bearing architectural decisions
- S29 #pre-mortem-cheaper-than-rebuild-codify-protocol: codify pre-mortem into Standard/Full-tier protocol — S30 confirmed third utility, ready for codification
