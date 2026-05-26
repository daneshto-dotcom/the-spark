# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-26 | Session: S51

## Next Steps

1. **Verify CI still GREEN** — `gh run list --workflow="E2E (2-browser harness)" --limit 1` should show run `26444645703` SUCCESS at SHA `0c277a4`. First all-active-green e2e CI run since S46 P1 baseline.
2. **USER 2-peer smoke** on https://spark-online.space/?debug=1 — verify (a) S49 Sym F territorial repulsion in real play, (b) S51 P2 audio polish: positional SFX panning, music duck on Voltkin events, OGG/Opus music loads + plays. 5-min smoke.
3. **Phase-2 next mechanic** — Council pick from: D Inject Spiral / E Steal / A Fog / G Mega-combos / Anvil 2nd creature. User decision required.
4. **Audio P2 follow-ups** — (a) Gemini CHECK #1: `duckMusic` + AudioContext suspend → restore-via-setTimeout uses stale `currentTime` on resume after long tab-blur — snapshot `audioContext.currentTime` at SCHEDULE time; (b) optionally drop music to 48k Opus (~2.3 MB) for mobile cold-load; (c) PannerNode tuning — current refDistance=1/maxDistance=2 with linear model + [-1,+1] mapping is subtle, could widen.
5. **Deferred carry** — `__TEST_RNG_SEED__` test seam (Gemini Council Δ1 — root-cause robustness); vitest 4.x bump (S50 carry); Sym E placeholder rendering helper.

## Blockers

- **USER 2-peer smoke** carry-forward from S49 + S50 + S51 — multi-session deferral. Same 5-min gate.

## Pending Backlog

- [ ] Phase-2 mechanic (one of D / E / A / G / Anvil) — user-direction needed.
- [ ] Audio: address Gemini #1 `duckMusic` suspend-time edge case.
- [ ] Audio (optional): 48k Opus re-encode for ~2 MB mobile target if quality drop acceptable.
- [ ] `__TEST_RNG_SEED__` override seam — Gemini Council Δ1 — more robust than rate-only override.
- [ ] vitest 4.x bump (S50 P1 carry — deferred, dedicated test-API session).
- [ ] main.ts further extraction (controls/input handlers ~100 LOC) — diminishing returns per S50 P2 audit.
- [ ] Sym E rendering bounds helper for `test.fixme` placeholder.
- [ ] chateau-guardian CI audit (cross-project) — leverage point for shared Pro quota.
- [ ] Phase-3 net (Colyseus / Geckos.io) for >2-player scalability — long-term.

## Recent Reflexion (last 2 sessions)

## 2026-05-26 — Session 51 (S51 autonomous batch overnight: P1 e2e spawner-rate test-override seam + Sym D/I downstream fixes + P2 audio polish OGG/Opus + PannerNode + auto-duck; 2 commits a394612..0c277a4 + push, 6/6 e2e GREEN local in 1.3 min, unit 796/796, bundle 497.67 KB / 500 KB charter)

- S51 #deterministic-seed-x-low-rate-causes-test-timeout-systematic-not-statistical: 5 e2e tests timed out on `waitForWorld(sparks spawned)` because `mulberry32(0xc0ffee).first()=0.0214` × `SPAWN_RATE_PER_SECOND=0.15` (LOCKED Item 3) = 25.71s first wait; tests time out at 10-30s. P(0 sparks at tick=1604 over 15 trials) ≈ 10⁻²⁶ — systematic, not flake. **Lesson: when "intermittent" tests fail with statistically-impossible patterns and the random source is deterministic, simulate the seed math BEFORE rerunning. `node -e "..."` finds the bug in seconds.**

- S51 #sym-d-test-contract-obsolete-by-sym-f-mechanic-test-only-disable-seam-is-the-fix: S49 P1's territorial repulsion (min R=72 > AUTO_BOND_RADIUS=60) makes Sym D's cross-color bond test unreachable. Fix: add `__TEST_TERRITORY_BASE_RADIUS__` window seam; Sym D-only sets it to 0. Color-seg invariant becomes observable as defense-in-depth. **Lesson: when a new mechanic geometrically excludes a prior test's contract, add a test-only override seam — don't delete the test. Prior code path is defense-in-depth.**

- S51 #spawner-zone-placement-rejection-silently-eats-anchors-test-must-account-for-it: Sym I anchors at (800,400)/(800,600) were INSIDE SPAWNER_RADIUS=250 zone — placePrimitive silently rejects. Fix: move to X=300 (dist 675+). **Lesson: e2e placement tests must compute distance-from-spawner-center BEFORE choosing coords. Add `safePlacementPos(...)` helper.**

- S51 #playwright-addinitscript-content-form-beats-function-form-when-toplevel-vars-suffice: Function-form `addInitScript(disableTerritory)` had intermittent failures; `addInitScript({content:'window.__X__=0'})` was stable. **Lesson: for top-level window setters, prefer `{content:'...'}` over arrow-via-closure.**

- S51 #duck-music-max-end-time-semantics-prevents-overlap-shortening: Naive `clearTimeout + new setTimeout` on duck pattern truncates a longer active duck with a shorter overlapping event. Fix: `max(currentEnd, newEnd)` semantics via `nextDuckEndCtxTime` pure helper. **Lesson: every "duck/highlight/flash for N ms" with multiple triggers needs `max(...)` end-time logic. Factor as a pure helper for unit testability.**

- SESSION #s51-shipped-2-priorities-2-commits-6-of-6-e2e-green-bundle-under-charter: 2 commits `a394612..0c277a4` + push. P1: test-override seams + e2e fixes. P2: OGG/Opus 10MB→3.5MB, PannerNode, duckMusic. Bundle 496.28→497.67 KB. Tests 783→796 GREEN. CI E2E run `26444645703` SUCCESS. API spend $0.06.

## 2026-05-26 — Session 50 (S50 autonomous batch overnight: P1 vite/vitest CVE bump + P2 main.ts hypertrophy refactor 1221→888 LOC + P3 Sym E score occlusion polish + P4 e2e Sym I/F coverage; 5 commits e392e96..8484e7e + push)

- S50 #npm-audit-fixavailable-can-overshoot-when-nested-deps-pin-old-major: vitest 2.x has `dependencies.vite: ^5.0.0` (NOT peer) → npm nests vite 5.x with CVE. Naive minimal bump worsened audit 4→5 CVEs. vitest 3.2.4 widens range, hoists single vite 6.4.2. **Lesson: after CVE bumps, scan `npm audit` `nodes` for nested `node_modules/X/node_modules/Y` paths.**

- S50 #closure-state-mutable-holder-pattern-preserves-identity-across-factory-boundary: 4 closure mutables unified into `NetSession` typed holder. Per-invocation `session.X` reads guarantee reconnect freshness. **Lesson: explicit typed holder beats factory closures and `Record<string,unknown>` for shared lifecycle state.**

- S50 #playwright-context-addinitscript-is-the-correct-test-only-feature-seam: `window.__TEST_WIN_SCORE__` read at module load + `context.addInitScript` injection. Production reads window (falls through to default). **Lesson: addInitScript + module-load read pattern beats direct world mutation (snapshots overwrite) and test-skip.**

- S50 #rule-21-empirical-state-discovery-caught-handoff-claim-vs-reality-delta-in-under-1-minute: Boot snapshot claimed P4 should "flip fixme" but `Read e2e/smoke.spec.ts` showed no Sym F/I describes existed. Rescoped to author-new in <1 min. **Lesson: Rule 21 STATE-DISCOVERY GATE is cheap enough to fire on every priority. Treat handoff text as a hint, not a contract.**

- SESSION #s50-batch-shipped-4-priorities-5-commits-783-tests-green-bundle-under-charter: 5 commits, main.ts 1221→888 LOC (-27%), bundle 494.45→496.28 KB, tests 783/783 GREEN.
