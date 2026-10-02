# ⏸ PAUSED (owner session limit) — RESUME HERE
- RESUMED. NEXT STEP: scope add A (THE RISEN on pants). (old:) item 7 is DONE (7a exit edge, 7b hub-ramp, 7c tower-art). Next: item 5 (CI L2: SLOWEST_CI_TICKS_PER_S 6→5 in e2e/worker-bots.spec.ts:80 + lane minutes; ALSO the gating lane budget — deploy #22 died at the 12-min PW_GLOBAL cap with green runs at 8.9-10.5 min, so 3 retries overran it), then 6 (verify-only: 2028ba4 is in master; run a real-tree mutant), then scope adds A-D, then 4 (quarantine), 3 (soak), then full gates.
- Half-done: nothing uncommitted. Full gates (typecheck / full vitest / build) NOT yet run on this branch.
- Last runs: vitest per-file all exit 0 (creatureProjectileRage, princessSlapSpin, buttonPressHit+buttonFeedback, e2eHubRampClock, visualsCombatReach); e2e on own port: button-press-edge+exit-match x3 exit 0 (42/42), hub-ramp-art x3 exit 0 (9/9), tower-art exit 0 (3/3); throttled repros documented below.

# S194 PROGRESS — fixes (`s194/fixes`, tree T8)

Base: master 0a37175e (`git merge master` = already up to date, 0 conflicts). npm install exit 0.

## Items
1. Rage projectile fire tick — DONE (render-only, NO BUMP: the sim already used ragedFireTick at hostTick:2112; only the picture was on the calm clock. LATENT: goblins never rage)
2. Helga spin — DONE (render-only, NO BUMP; `princessRenderer.ts` fx path fed drawImpact `world.tick / 60`, a literal; now `slapSpinSeconds(tick)` = tick / PHYSICS_HZ. Identical today (PHYSICS_HZ = 60) — a drift hazard, not a visible bug)
3. Worker-heap soak 2 reds — TODO
4. Quarantine specs — TODO
5. CI L2 — DONE: SLOWEST_CI_TICKS_PER_S 6→5 (derived worker-bots budget 690 s → lane 11/20 → 12/20); GATING lane 12/18 → 15/23 (MINE; green runs 8.9-10.5 min, #22 overran 12 with 3 retries). Guards: ci.e2eLanes rate ≤5 (mutant 6 RED; and the existing lane check went RED at PW 11 vs 690 s before the yml edit — the derivation works); e2eHubRampClock gating-room test (mutant PW 12 RED). CI-only, NO BUMP.
6. Tripwire backtick hole — ALREADY FIXED (2028ba4, S193 carry-fwd, an ancestor of master). Verified now with a real-tree mutant: a destructured dynamic import with a BACKTICK specifier + call appended to src/net/quickmatch.ts → trysteroPolyfill.test.ts RED 2/11; restored GREEN 11/11. No change, no bump.
7. Boot finding: exit-match edge + hub-ramp frame 12 CI reds (run 36976244366) — TODO
8. SCOPE ADD A — THE RISEN on pants (killed by zombie racial unit → 1 castle soldier at killer's keep) — TODO
9. SCOPE ADD B — THE RISEN on Helga (enemy Helga killed by zombie racial unit → 1 soldier) — TODO
10. SCOPE ADD C — knocked-out seat mid pants-wave: queued stop, emerged keep attacking — verify — TODO
11. SCOPE ADD D — chewer + lightning drone never target units/Helga (keeps: report) — verify — TODO

## Log
- worktree at 0a37175e, npm install exit 0.

- item 1: `projectileFireTick(c)` = ragedFireTick(config fire, c) used by resolveShotIn + impact seed (`creatureProjectile.ts`). Test `creatureProjectileRage.test.ts` (4): REACH through runHostTick — strike ticks (bank rises) == landing ticks (shot t=1), calm at 30 / raged at 15; cycle gaps 61 calm / 31 raged (cadence + 1 SEEKING bounce tick — so "twice as fast" is 61/31 = 1.97x, pre-existing, both peers same); negative: live bit alone does not move the clock. Mutation (bare config fire tick) RED 1/4. Probe found a raged archer turning on an emitted enemy unit mid-run (units-first) — correct behaviour, fixture now clears other creatures.

- item 2: test `princessSlapSpin.test.ts` (3) runs with PHYSICS_HZ MOCKED to 30 so the literal is behaviourally visible; REACH via PrincessRenderer.sync (ray endpoints at slapSpinSeconds(tick)*8); negative: legacy path follows performance.now. Mutation (`/ 60` restored) RED 1/3. visualsCombatReach 0.

- item 7 diagnosis: deploy #22 gating red = 720 s suite cap (61 passed / 3 flaky / 7 did not run); green runs take 8.9-10.5 min of 12. exit-match right edge: PRESS scale 0.97 about the top-left origin shrinks the hit rect to 162.96 px, so a click 3 px inside the right edge (local 165) misses the pointerup hit test whenever a frame renders between down and up (pointerupoutside → no tap). Repro e2e next.
- item 7a (exit edge) DONE — REAL PRODUCT BUG: `buttonFeedback.ts` hitRectAtScale + setScale (target never below the rest plate while pressed). Repro `e2e/button-press-edge.spec.ts` (held 150 ms click): before fix right-edge RED 1/3 deterministic, after 3/3 green; exit-match+new spec --repeat-each=3 42/42. Unit `buttonPressHit.test.ts` (5): arithmetic incl. codex pivot, REACH real Container via its pointerdown handler, negative outside edge. Mutation (setScale keeps the rest rect) RED unit 1/5 + e2e 1/3. Render-only, NO BUMP. ⚠ shared helper: arcadeOverlay.ts is a consumer (not edited).
- item 7b (hub-ramp) DONE — HARNESS defect: 1200 ms wall wait for a 22-tick cursor walk; reproduced under 14x/20x CPU throttle (columns 9/6); now waitForTickAdvance(11*2+2) via tickClock.ts; passes at 20x. Guard `src/e2eHubRampClock.test.ts` (spec's ticks-per-frame copy == HUB_RAMP_TICKS_PER_FRAME; tick wait present) — mutants (copy=3; wall wait restored) RED.
- item 7c (tower-art.spec.ts:314, the THIRD #22 flake) DONE — HARNESS defect: lazy atlas fetch raced a fixed 900 ms read; reproduced with 1.5 s CDP latency; now expect.poll up to TOWER_ATLAS_WAIT_MS 20 s (MINE) for both sprite checks, assertion unchanged (exactly 1). Guard in e2eHubRampClock.test.ts, mutant RED.
- #22 run verdict: red = 720 s suite cap (61 passed, 3 flaky, 7 not run); retries of the 3 flakes overran a lane whose green runs take 8.9-10.5 of 12 min.

OLD NEXT: item 7 (boot finding: exit-match edge + hub-ramp frame CI reds) — then 5, 4, 3, 6.
