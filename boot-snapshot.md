# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-S20 close) | Session: S20 | Last commit: c4ae96f

## Live URL
**https://spark-online.space/** (HTTPS via Let's Encrypt cert exp 2026-08-10 auto-renew)

## Next Steps
1. **S21 P0 — 1v1 BLOCKER user retest (gated on user + brother playtest).** S20 P0 deployed comprehensive Trystero 0.24 fix (callbacks + rtcConfig + diagnostic [net] logging + ICE poll + type fix). Outcome classifier:
   - **GREEN:** peer connects → mark resolved, move to NET-feel tuning (P2 NET carry-forward)
   - **YELLOW:** still stuck; F12 console `[net]` log names the failure layer → S21 P0.1 evidence-gated amendment with concrete next move
   - **RED:** still stuck AND no `[net]` console output → wrapper hooks not firing → A/B downgrade `trystero@0.20.0` per RED-path carry-forward in `.claude/plans-archive/2026-05-12_PDR_Session_20_Council_P0_BattleLedger.md`
2. **S21 P1 — transport.ts anti-bloat §XV NEW violation** (Standard): P0 grew transport.ts 124→317 LOC (13% over 280 charter). Extract diagnostic-logging + ICE-poll into `src/net/transport-debug.ts` OR accept charter relaxation for net-layer essentials.
3. **S21 P2 — lobbyScreen.ts anti-bloat §XV** (Standard, deferred from S20): 565 LOC, 13% over 500 charter. Extract input-overlay + connection-lost overlay into sub-modules.
4. **Manual playtest verification (after P0 resolves)**: ⚙ → audio settings overlay; 'M' global mute; cross-player bond → per-silhouette gradient visible; 1v1 NET feel + interpolation quality.
5. **P9 OGG compression** (Micro, deferred S18/S19/S20): 10MB MP3 → ~2MB OGG via ffmpeg (verify availability first).
6. **P5 Phase-2 next mechanic** (design-gated, user picks): D Inject Spiral / E Steal / A Fog / G Mega-combos.
7. **P7 Bond-hover cost preview** (Standard, needs hit-test infra).
8. **PannerNode + auto-duck** (audio polish, S18 Grok#5 deferred).

## Blockers
- HTTP-80 redirect on spark-online.space may still 404 (non-blocking; browsers default HTTPS)
- 1v1 P0 user retest pending — RED-path triage (A/B downgrade) documented but not pre-emptively executed

## Pending Backlog
- P0' Manual playtest audio + gradient (P0-gated)
- P2 NET feel tuning (cross-network with friend, P0-gated)
- P3 NET enhancements (Standard, playtest-signal-gated)
- P5 Phase-2 next mechanic (design-gated)
- P7 bond-hover cost preview (Standard, hit-test infra)
- P9 OGG compression (Micro, ffmpeg availability TBD)
- PannerNode + auto-duck (Grok#5 audio polish)
- transport.ts §XV extraction (NEW violation S20 P0)
- lobbyScreen.ts §XV extraction (carry-forward)

## Recent Reflexion (last 2 sessions)

### Session 20 (2026-05-12)
- S20 P0 #a0-of-library-types-finds-three-api-gaps-in-one-pass: Read `node_modules/<pkg>/dist/*.d.ts` directly when a library upgrade resolves a problem partially. A single 100-line type-file read often reveals more gaps than a multi-hour wrapper bug-hunt.
- S20 P0 #observability-before-third-shot-fix-when-second-shot-missed: BUNDLE observability with the fix in shot #2. Marginal cost of diagnostic logging is small; value if fix misses is huge (next iteration evidence-gated).
- S20 P0 #prime-audit-2-finds-app-layer-protocol-already-version-checked: Run a SECOND PRIME-AUDIT pass searching `src/` for existing fields with similar semantics. Catches duplicate-mechanism additions.
- S20 P0 #joinroom-typed-as-string-channel-eliminates-typesystem-fight: When "proper typed" hits TS variance/index-signature rules for discriminated unions, JSON-string the channel and stringify/parse at the boundary.
- S20 P1 #a0-level-2-pivot-after-pdr-lock-saves-bogus-extraction: A.0 has two levels. Level-1 pre-PDR-lock; Level-2 pre-implementation. When Level-2 finds stale handoff claim, PIVOT within user-approved intent.
- S20 P1 #shared-helper-extraction-when-three-call-sites-duplicate-same-predicate: Threshold for shared-helper extraction is 3 inline sites, not 2. 2-site duplications often coincidental; 3 is structural.
- S20 P1 #council-r1-pivots-cleanly-when-the-pivot-fits-original-intent: Distinguish SCOPE EXPANSION (Rule 16 amendment) from SCOPE MECHANISM CHANGE (different mechanism within same intent — doesn't require re-approval if rigorously documented).
- S20 P3 #council-shrinks-over-fragmentation-12-files-to-3-archetypes: When extraction granularity is "1 function per file" with functions <30 LOC, that's past the cohesion-vs-isolation knee. Group by archetype.
- S20 P3 #vite-tree-shakes-restructured-modules-to-byte-identical-bundle: Pure refactors where every exported symbol has a static caller from a barrel-or-dispatcher cost zero KB.
- S20 P3 #dag-safety-by-moving-fallback-to-shared-not-dispatcher: When extracting a dispatcher's shared fallback, the fallback belongs in shared library, NOT dispatcher. Primitives go in shared.

### Session 19 (2026-05-12)
- S19 #per-channel-gain-as-children-of-master-pause: layer per-channel gains as CHILDREN of original master rather than replacing master with a mixer; preserves UX semantics + back-compat.
- S19 #council-convergent-effect-ordering-blocker-orchestrator-owns-effects: when DISRUPTOR + AUDITOR independently flag the same issue, skip "is this real" debate.
- S19 #a0-state-discovery-flags-handoff-loc-drift: Rule 21 A.0 is cheap (3-4 reads + 2 greps); catches scope-defining claims from a stale snapshot before user `go`.
- S19 #shared-helper-extraction-when-refactor-pushes-file-over-charter: when refactor pushes file over charter, look for shared structure in NEW code before accepting overage as carry-forward.
- SESSION #refactor-before-feature-S14-lesson-replayed-for-anti-bloat-debt: trip-wire deferrals have a half-life. When file over-charter for ≥2 sessions, escalate extraction to Standard-tier priority.
- S19 P4 #silent-npm-bump-trystero-0.20-to-0.24-broke-relay-defaults: LOCKED version pins must be enforced at package-manager level not just doc level. Pin BEHAVIOR (explicit resource config) not just version.
- S19 P4-retro #fix-first-hypothesis-can-be-wrong-even-when-it-fits-the-evidence: in urgency mode, attach diagnostic logging to actual failure path BEFORE proposing a fix; post-deploy retest produces actionable signal whether fix landed or not.
