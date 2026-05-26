# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-26 | Session: S50

## Next Steps

1. 🔴 **USER ACTION — 2-peer smoke on https://spark-online.space/?debug=1.** Verify NO regression from S50 toolchain + refactor work:
   - **P1 CVE bump (vite 5.2→6.4.2 + vitest 1.5→3.2.4):** verify game boots, audio plays, P2P signaling works. Bundle 496.28 KB so any size regression already caught.
   - **P2 main.ts refactor (1221→888 LOC, 4 extractions):** verify Sym A/B/C/D/G mechanics + lobby host/join + cinematic playback + ENDGAME envelope all still function — the netSession holder + factory handlers preserve all wire semantics, but live verification is the runtime-pass complement.
   - **P3 Sym E score occlusion polish:** in 1v1 PLAYING, verify "RED XX / 50" + "BLUE XX / 50" are no longer crowded by charge dots. Q=ZONE hint should still be visible top-row.
   - **S49 Sym F territory (already shipped) — pending user smoke from S49 close:** hard block, engulf-warp (sluggish bonds), SHRINK Q. This carries forward.

2. **E2E CI monitor — run 26439874197 was IN_PROGRESS at S50 handoff write-time.** Check `gh run view 26439874197` to see if new Sym F + Sym I tests passed on first run. If they fail on WebRTC handshake, diagnose Trystero/Nostr networking in GH Actions vs test fixture; consider `test.fixme()` re-flip until env is stable.

3. **Phase-2 next mechanic** — pick one: Inject Spiral (D), Steal (E), Fog (A), Mega-combos (G), Anvil second-creature. See `docs/phase-2-design-options.md` if it exists.

4. **Audio polish:** OGG compression for mobile (~10MB mp3 → ~2MB), PannerNode + auto-duck. Carry from S18 P9.

5. **Phase-3 net (Colyseus / Geckos.io)** — reserved for >2-player scalability. Not blocking 1v1 polish.

## Blockers

None blocking. User 2-peer smoke gates verification of S49 Sym F + S50 toolchain regression scan.

## Pending Backlog

- [ ] User 2-peer smoke on Sym F (carry from S49) + verify P1-P3 no-regression
- [ ] E2E CI verify Sym F + Sym I pass first run
- [ ] Phase-2 next mechanic (D Inject Spiral / E Steal / A Fog / G Mega-combos / Anvil)
- [ ] Audio polish: OGG compression for mobile, PannerNode + auto-duck
- [ ] Phase-3 net (Colyseus / Geckos.io) — reserved for >2-player scalability
- [ ] vitest 4.x bump (deferred from S50; Council picked minimal 3.x to limit risk)

## Recent Reflexion (last 2 sessions)

## 2026-05-26 — Session 50 (S50 autonomous batch overnight: P1 vite/vitest CVE bump + P2 main.ts hypertrophy refactor 1221→888 LOC + P3 Sym E score occlusion polish + P4 e2e Sym I/F coverage; 5 commits e392e96..8484e7e + push)

- S50 #npm-audit-fixavailable-can-overshoot-when-nested-deps-pin-old-major: npm audit's `fixAvailable: vitest 4.1.7` overshot by 2 majors. Actually-needed minimum was vitest 3.x because vitest 2.x has `dependencies.vite: ^5.0.0` (NOT a peer dep) which conflicts with project's vite ^6.4.2, causing npm to nest a vite 5.x copy under `node_modules/vitest/node_modules/vite/`. The naive minimal-bump (vite ^6.4.2 + vitest ^2.1.9 per Council R1) WORSENED audit from 4→5 moderate CVEs. vitest 3.2.4 widens vite range to `^5||^6||^7-0`, allowing npm to hoist to single vite 6.4.2 install.

- S50 #closure-state-mutable-holder-pattern-preserves-identity-across-factory-boundary: main.ts pre-refactor had 4 lifecycle-coupled `let` mutables (netTransport, hostSync, clientSync, lastSnapshotTick) referenced from BOTH lobby callbacks AND per-tick snapshot loop. Picked state holder pattern over factory closures and mutable record. Per-invocation `session.X` reads guarantee freshness on reconnect (PRIME-AUDIT Δ1). All 783 tests stay GREEN.

- S50 #playwright-context-addinitscript-is-the-correct-test-only-feature-seam: For e2e Sym I (win-condition), used `__TEST_WIN_SCORE__` env-override read at PHASE_1_WIN_SCORE module load. Playwright's `context.addInitScript()` runs BEFORE bundled scripts so assignment is observable at constants.ts load time. Scope override to specific Sym I test's BOTH contexts via inline `addInitScript` calls — contexts isolated, no leak to A/C/D/E/F.

- S50 #rule-21-empirical-state-discovery-caught-handoff-claim-vs-reality-delta-in-under-1-minute: Boot snapshot said P4 should "flip test.fixme() for Sym I + Sym F" but Read on e2e/smoke.spec.ts at boot showed only Sym A/C/D/E describes exist — NO Sym F or Sym I describes. Rescoped P4 from "flip-fixme" to "author-new" before Council deliberation. Cost: 1 file Read. Saved: not building Council around fictitious task.

- SESSION #s50-batch-shipped-4-priorities-5-commits-783-tests-green-bundle-under-charter: 5 commits e392e96..8484e7e + push. P1 vite 5.2→6.4.2 + vitest 1.5→3.2.4 (4 moderate CVEs → 0). P2 4 extractions main.ts 1221→888 LOC (-27%). P3 chargeDots 210→260 + qHintText 240→290. P4 e2e Sym I + Sym F describes + __TEST_WIN_SCORE__ env-override. Bundle 494.45 → 496.28 KB (+1.83 KB, 3.72 KB headroom). Council Standard-tier (3-way agent deliberation). API: 1 Council deliberation call (~38K tokens). User authorized autonomous overnight.

## 2026-05-26 — Session 49 (S49 autonomous full-batch: P1 Sym F territorial repulsion NEW MECHANIC + P2 latent audits CLEAN + P3 housekeeping; 2 commits 463df39..ba54c3e + push)

- S49 #territory-base-radius-equals-auto-bond-radius-creates-geometric-Sym-D-defense-in-depth: TERRITORY_BASE_RADIUS=60 = AUTO_BOND_RADIUS=60 means territory always gates before Sym D color gate fires. Document in LOCKED_DECISIONS.md.

- S49 #dead-code-deletion-requires-test-audit-not-just-code-audit: Removing dead production code also means removing tests that specifically exercise those dead paths. Before deleting a branch, grep the test file for inputs that trigger it and remove those tests explicitly.

- S49 #ephemeral-per-tick-physics-annotation-pattern-for-territory-engulf-warp: Non-readonly Bond field + `?? 1.0` fallback in solveBonds = ephemeral annotation without game-state persistence. Pattern reusable for future per-tick physics overlays.

- S49 #latent-audit-clean-sweep-saves-scope: Schedule latent audits BEFORE assuming fixes are needed. A clean audit saves session scope.

- SESSION #s49-autonomous-sym-f-territorial-repulsion-shipped-783-tests-green: 2 commits 463df39..ba54c3e + push. Bundle 492.22 → 494.45 KB (+2.23 KB). Tests 770 → 783 (+13 net). Context 13.05% GREEN.
