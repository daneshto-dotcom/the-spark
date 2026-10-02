# S194 PROGRESS — fixes (`s194/fixes`, tree T8)

Base: master 0a37175e (`git merge master` = already up to date, 0 conflicts). npm install exit 0.

## Items
1. Rage projectile fire tick — DONE (render-only, NO BUMP: the sim already used ragedFireTick at hostTick:2112; only the picture was on the calm clock. LATENT: goblins never rage)
2. Helga spin world.tick / PHYSICS_HZ — TODO
3. Worker-heap soak 2 reds — TODO
4. Quarantine specs — TODO
5. CI L2 SLOWEST_CI_TICKS_PER_S 6→5 + lane minutes — TODO
6. Tripwire backtick hole — verifying (2028ba4 is an ancestor of master)
7. Boot finding: exit-match edge + hub-ramp frame 12 CI reds (run 36976244366) — TODO

## Log
- worktree at 0a37175e, npm install exit 0.

- item 1: `projectileFireTick(c)` = ragedFireTick(config fire, c) used by resolveShotIn + impact seed (`creatureProjectile.ts`). Test `creatureProjectileRage.test.ts` (4): REACH through runHostTick — strike ticks (bank rises) == landing ticks (shot t=1), calm at 30 / raged at 15; cycle gaps 61 calm / 31 raged (cadence + 1 SEEKING bounce tick — so "twice as fast" is 61/31 = 1.97x, pre-existing, both peers same); negative: live bit alone does not move the clock. Mutation (bare config fire tick) RED 1/4. Probe found a raged archer turning on an emitted enemy unit mid-run (units-first) — correct behaviour, fixture now clears other creatures.

NEXT STEP: item 2 (Helga spin world.tick / PHYSICS_HZ).
