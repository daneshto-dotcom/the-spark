# S194 PROGRESS — fixes (`s194/fixes`, tree T8)

Base: master 0a37175e (`git merge master` = already up to date, 0 conflicts). npm install exit 0.

## Items
1. Rage projectile fire tick — DONE (render-only, NO BUMP: the sim already used ragedFireTick at hostTick:2112; only the picture was on the calm clock. LATENT: goblins never rage)
2. Helga spin — DONE (render-only, NO BUMP; `princessRenderer.ts` fx path fed drawImpact `world.tick / 60`, a literal; now `slapSpinSeconds(tick)` = tick / PHYSICS_HZ. Identical today (PHYSICS_HZ = 60) — a drift hazard, not a visible bug)
3. Worker-heap soak 2 reds — TODO
4. Quarantine specs — TODO
5. CI L2 SLOWEST_CI_TICKS_PER_S 6→5 + lane minutes — TODO
6. Tripwire backtick hole — verifying (2028ba4 is an ancestor of master)
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

NEXT STEP: item 7 (boot finding: exit-match edge + hub-ramp frame CI reds) — then 5, 4, 3, 6.
