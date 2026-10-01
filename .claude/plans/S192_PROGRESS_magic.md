# S192 PROGRESS — `s192/magic` (MRES on the DEF ladder, attack classes)

Branch `s192/magic`, from master 663c4c9. Merge owner: the main session. Never pushed, never merged here.

| step | status | commit | notes |
|---|---|---|---|
| 0 | `npm ci` in the worktree — exit 0 | — | own node_modules |
| 1 | SPEC — `.claude/plans/S192_MAGIC_SPEC.md` + `.html` (+ `C:\Users\onesh\OneDrive\Desktop\SPARK_Magic_Resistance_Spec.html`) | afa5ec3 | rule: magic hit = floor(A·(5+DEF)/(5+MRES)), min 1; DoT ticks Bresenham over beats. Report sent to main. |
| 2a | SUBSTRATE — `src/state/magicResist.ts`; required `cls` on damageEntity / damageConnector / applyRadialDamage / RadialDamageFn; 29 production sites tagged; 154 existing test calls get `'physical'`; draftStrikeArms re-pinned (the chain-hop victim is an orcs soldier, MRES = DEF) | 4ce7116 | typecheck 0; full vitest: 1 red (that re-pin) → green |
| 2b | TESTS — `magicResist.test.ts` (arithmetic, table, negatives, funnels), `magicResist.callSites.test.ts` (29-site census; MUTATION-TESTED: castleGuns `'physical'`→`'magic'` turns 2 assertions red, reverted) | 3607a37 | |
| 2c | TESTS — `magicResist.reach.test.ts`: Ra perk, Pharaoh ritual, Voltkin chain, stink aura, Scorched Ground, rot, physical negative — all through `runHostTick` | 32b4414 | 7/7 green, typecheck 0 |
| 2d | DIFFERENTIAL — `magicResist.differential.test.ts`: 18000 ticks (2 waves) A(all-physical) vs B(MRES=DEF) hashWorldStateFull identical EVERY tick; B ran 1344 magic hits + 24 DoT ticks; C (shipped table) diverged at tick 5491 | 665ed12 | |
| GATES | tip 665ed12: typecheck **0**; `npx vitest run --maxWorkers=3` **0** (423 files passed / 2 skipped, 6764 tests passed / 7 skipped); `npm run build` **0**, 977.4 KiB (master 975.2 → +2.2 KiB; headroom 122.6) | (this commit) | DONE — final report sent |

| STINK | the "empty magazine still throws" fix (77415ba) REVERTED (3ba5ff0): it contradicts owner ruling S161 P3 (BUG-2) *"continuously throw out poop bags throughout the fight stage"*, pinned by `stinkReload.test.ts` (2 red). Only the stale comment at `defenderLifecycle.ts` (targeted lob, "when the magazine is empty the throw simply does not happen") is wrong — merge owner's | 3ba5ff0 | finding WITHDRAWN |
| R1/3/4 | rulings at their constants: buildings raise DEF+MRES together; globals MRES = DEF (HIS); stink cloud magic (HIS); zero beat accepted (HIS) | 3b31a47 | |
| R2 | castle MRES axis: `'mres'` CastleStat (new discriminant), `mresLevel` four sites, starting MRES = starting DEF (0), DEF no longer raises MRES, magic into keep floor(A·5/(5+mres)) min 1, panel row + card row, canon §3/§3d re-pinned; `castleMres.test.ts` (reducer, funnel, host-tick Voltkin REACH 33→16, wire/hash/reset; mutation → 3 red) | 31d54b2 | bots never buy castle stats |
| R5 | RESIST floater: `state/magicResistCue.ts` (derived, no wire) + DamageNumbers grey 'RESIST' ≤ 1/unit/s (⚠ MINE look); `resistFloater.test.ts` (cue == swallowed beats through runHostTick; mutation → red) | 37af44f, 8257080 | |
| SPEC | MD + HTML + Desktop copy updated with the rulings | 381cc24 | |
| GATES | tip 8257080: typecheck 0; vitest 0 (425 files / 6779 tests passed, 7 skipped); build 0, 979.6 KiB (+4.4 over master 975.2) | (this commit) | |
## Finding — ⛔ WITHDRAWN (it is owner ruling S161 P3; see the STINK row)
A DEPLETED stink tower (`bagsRemaining` 0) still lobs bags: `stinkThrowBag` decrements only when > 0 but always
splashes and leaves a cloud. `src/state/defenders/stinkTower.ts:243` (`if (d.bagsRemaining > 0) d.bagsRemaining--;` then unconditional splash + cloud); its two callers `src/state/defenders/defenderLifecycle.ts:450` (blind lob) and `:465` (targeted) check no magazine, although the comment at :459 says *"when the magazine is empty the throw simply does not happen"*. Seen in the REACH test (about one physical 6-fifth splash every 4 s from a spent tower). NOT fixed here.

## Questions reported to the owner (spec §d)
Q1 DEF pick → MRES (already via pool; keep) · Q2 castle MRES = bought DEF · Q3 ATK pick never buffs magic (R190-E) → Voltkin draft consequence, NOT built ·
Q4 MRES card later · Q-G globals MRES = DEF · Q-V Voltkin seed zap magic · Q-C stink cloud magic · Q-D a DoT beat may land 0 · Q-E elite/swarm keep base MRES · Q9 raceUnit by race vs R94/R117.

## Bump verdict
BUMP at merge (shared rule both peers compute). PROTOCOL_VERSION not edited on this branch.
