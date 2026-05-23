# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-23 | Session: S39 (BUG-A peer lobby-stuck + BUG-B cursor↔avatar drift)

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master)
**https://spark-online.space/?debug=1** (debug overlay + `[net]` + `[cinematic]` + `[creature]` logs)

## Status
S39 shipped BOTH user-reported 1v1 regressions in a Micro-tier batch (commit `f8d237a`, close `9d2e600`). BUG-A: peer no longer strands at "Waiting for host to begin" — fixed via dedicated `START_GAME_SIGNAL` wire envelope that decouples lobby-exit from snapshot delivery (S38 audit had added 3 silent-drop modes that broke the S35 P0 fix). New visible lobby diagnostic strip surfaces snapshot accept/reject/applyErr counters so future regressions are diagnosable in seconds without `?debug=1`. BUG-B: cursor↔avatar drift at viewport edges fixed via letterbox-aware `cssToCanvasCoords` + `fitCanvasIntoRect` shared pure helpers (canvas is `object-fit: contain`; old non-uniform sx/sy math was correct only at matched aspect, gave ±72 CSS-px drift at edges on 1280×900). Tests 745 → 759 (+14). Bundle 472.47 → 474.26 KB (25.7 KB headroom).

**Tests:** 759/759
**Bundle (app code):** 474.26 KB / 500 KB cap
**Branch:** master, clean, in sync with origin (c9db329..9d2e600, 2 new commits this session)
**Context at close:** 346,837 / 1,000,000 (34.68% GREEN)
**Deploy at close:** run `26331426232` pending (auto-cancellation race from close push). Earlier S39 run `26331024236` got cancelled when close push landed. **Live site at spark-online.space may not yet have S39 — `gh run rerun 26331426232` if it stays stuck >10 min.**

## Next Steps (priority order)
1. **Verify deploy + user playtest** at https://spark-online.space/?debug=1 once GH Pages clears. Watch the NEW visible diagnostic line in the lobby — if peer joins + host clicks Begin, peer should transition to PLAYING within ≤1 RTT (~200ms), diagnostic strip should disappear. If peer stays stuck, diagnostic shows `gs=LOBBY` while accepted-counter > 0 → opens a precise failure-mode triage path
2. **2-peer 1v1 smoke** (pending since S35 P0 — now covers S35 deadlock + S36 animation + S37 audio + S37 wire-parity + S38 audit hardening + S39 lobby-exit + S39 cursor alignment in one session)
3. **vite/vitest major bump** dedicated session — closes 2 moderate dev-server CVEs (esbuild GHSA-67mh-4wv8-2f99 + vite GHSA-4w7w-66w2-5vf9); semVerMajor bump, regression risk → own session
4. **main.ts hypertrophy refactor** — 984 LOC, no direct test (extract netMessageRouter / godlyMatcher / cinematicStateMachine / teardownNet into pure modules — multi-priority Standard batch)
5. S37 carry-forwards still open: P8 FWOOSH form-swap SFX, P9 crystal-crown Pixi sprite during ATTACKING wind-up, S38 stretch polish items
6. S38 carry-forwards: per-symbol triage of 42 knip-unused exports, Continue-UI product decision on `loadFromLocalStorage`

## Blockers
- GH Actions deploy queue auto-cancellation pattern still occasionally fires when multiple pushes land in the same session (close commit pruned a 21m-in-flight `[S39]` deploy run). User can `gh run rerun 26331426232` to force a single S39 deploy through
- 2-peer 1v1 smoke needs 2 humans + deployed code with S39 fixes live

## Pending Backlog
- [ ] **User 2-peer smoke** verifying S39 lobby-exit + cursor alignment + S38 audit hardening + S37 charge SFX + S36 animation + S35 deadlock fix together
- [ ] P8: Web Audio FWOOSH SFX on form-swap (mirror S37 P7 procedural pattern)
- [ ] P9: Crystal-crown layered Pixi child sprite with alpha/scale pulse during ATTACKING wind-up
- [ ] PRIME-AUDIT Δ7 (S36 deferred): re-compress voltkin-zap.png from WINNER source if user notices style drift
- [ ] D9 rollback ladder if S37 charge SFX subjectively grates: waveform swap → recorded sample → gain reduction
- [ ] S38 audit Pass-3 candidates (per AUDIT.md): all from Pass 2 carry/new — see findings.2.json for IDs
- [ ] vite/vitest CVE major bump (regression risk → dedicated session)
- [ ] main.ts hypertrophy refactor (multi-priority Standard batch)
- [ ] Continue-UI product decision on loadFromLocalStorage (or downgrade to test-only export)
- [ ] Per-symbol triage of 42 knip-flagged unused exports (5-10 per session pattern)

## Recent Reflexion (last 2 sessions)

### 2026-05-23 — Session 39 (Live 1v1 BUG-A peer-lobby-stuck + BUG-B cursor↔avatar drift; commit f8d237a)
- #runtime-only-bug-needs-runtime-verification-not-just-unit-tests: 745/745 tests passed at S38 close yet BUG-A was live regression. Standard/Full-tier PDRs touching wire-protocol code MUST include "live boot + 1 wire round-trip" verification or explicit deferral with BLOCKER surface.
- #dedicated-control-signals-decouple-state-transitions-from-snapshot-reliability: new START_GAME_SIGNAL envelope is independent of NETSNAPSHOT. Pattern carry-forward: any critical FSM transition (RECONNECT, MATCH_END, FORFEIT) should ride a dedicated signal, not be inferred from the next data payload.
- #visible-to-user-diagnostics-over-debug-flag-required: lobby diagnostic strip surfaces sync N/T seq=K kind=X applyErr=J gs=LOBBY. Any silent-drop path should pair with counter increment + UI-visible exposure (~50 LOC total).
- #object-fit-contain-letterbox-coordinate-mapping-trap: non-uniform sx/sy gives correct answer only at canvas center; wrong at edges under any aspect ≠ canvas aspect. Codify single canonical canvas↔CSS helper; all call sites import it.
- #wire-protocol-handler-idempotence-via-state-gate: any handler whose action RE-INITIALIZES state (vs incrementally updates) should gate on current state. 6-char fix prevents whole class of late/dup signal regressions.
- SESSION #s39-bugfix-batch-stats: 1 commit f8d237a (close 9d2e600). 9 files / +520/-27. Tests 745→759 (+14). Bundle 472.47→474.26 KB. Highest user-value session since S35 P0.

### 2026-05-21 — Session 38 (Cross-Project Audit campaign — Pass 1 → P1-P5 fixes → Pass 2 → Pass-2 fixes; commits 5750cd6, 04887e5, da23b51)
- #cross-project-audit-prompt-as-high-leverage-protocol: scheduled adversarial audit caught what 15+ sessions of incremental development missed (parseNetMessage trust-boundary unwired since S22 P3). Run every ~10-15 sessions or after Standard/Full multi-file infra ships.
- #audit-pass-2-self-check-catches-fix-induced-regressions: Pass 2 surfaced 3 NEW findings all introduced by Pass-1 fix. Bake Pass-2 into every audit workflow.
- #record-of-union-literal-true-beats-set-of-string-for-closed-allowlists: bidirectional compile-time exhaustiveness via Record<Union,true> vs Set<string>.
- #publish-subscribe-seam-closes-layer-violation-with-zero-runtime-cost: 60 LOC pub/sub publisher in lower layer restores broken state→render boundary.
- #defense-in-depth-at-the-peer-trust-boundary: parseNetMessage + sync.ts try/catch as two-layer defense; bounds worst-case to one dropped frame.
- #knip-unused-exports-need-per-symbol-chesterton-triage-not-blanket-deletion: 42 remaining unused exports need git-log archaeology per symbol; mass deletion would remove latent features + test infra.
- SESSION #s38-audit-campaign-batch-stats: 3 commits, tests 729→745 (+16), bundle +1.36 KB, knip 46→42. Highest-ROI single-session work since multi-frame Council deliberation in S25-S28.
