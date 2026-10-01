# S192 PROGRESS — `s192/magic` (MRES on the DEF ladder, attack classes)

Branch `s192/magic`, from master 663c4c9. Merge owner: the main session. Never pushed, never merged here.

| step | status | commit | notes |
|---|---|---|---|
| 0 | `npm ci` in the worktree — exit 0 | — | own node_modules |
| 1 | SPEC — `.claude/plans/S192_MAGIC_SPEC.md` + `.html` (+ `C:\Users\onesh\OneDrive\Desktop\SPARK_Magic_Resistance_Spec.html`) | afa5ec3 | rule: magic hit = floor(A·(5+DEF)/(5+MRES)), min 1; DoT ticks Bresenham over beats. Report sent to main. |
| 2a | SUBSTRATE — `src/state/magicResist.ts`; required `cls` on damageEntity / damageConnector / applyRadialDamage / RadialDamageFn; 29 production sites tagged; 154 existing test calls get `'physical'`; draftStrikeArms re-pinned (the chain-hop victim is an orcs soldier, MRES = DEF) | 4ce7116 | typecheck 0; full vitest: 1 red (that re-pin) → green |
| 2b | TESTS — `magicResist.test.ts` (arithmetic, table, negatives, funnels), `magicResist.callSites.test.ts` (29-site census; MUTATION-TESTED: castleGuns `'physical'`→`'magic'` turns 2 assertions red, reverted) | 3607a37 | |
| 2c | TESTS — `magicResist.reach.test.ts`: Ra perk, Pharaoh ritual, Voltkin chain, stink aura, Scorched Ground, rot, physical negative — all through `runHostTick` | 32b4414 | 7/7 green, typecheck 0 |
| 2d | DIFFERENTIAL — `magicResist.differential.test.ts`: 18000 ticks (2 waves) A(all-physical) vs B(MRES=DEF) hashWorldStateFull identical EVERY tick; B ran 1344 magic hits + 24 DoT ticks; C (shipped table) diverged at tick 5491. 18 s | (this commit) | PAUSED here by owner order. **NEXT: run the gates** — `npm run typecheck`, `npx vitest run --maxWorkers=3`, `npm run build` (<= 985.2 KiB), each $? to a file; then the final report |

## Finding (not mine to fix — for the merge owner)
A DEPLETED stink tower (`bagsRemaining` 0) still lobs bags: `stinkThrowBag` decrements only when > 0 but always
splashes and leaves a cloud. Seen in the REACH test (about one physical 6-fifth splash every 4 s from a spent tower).

## Questions reported to the owner (spec §d)
Q1 DEF pick → MRES (already via pool; keep) · Q2 castle MRES = bought DEF · Q3 ATK pick never buffs magic (R190-E) → Voltkin draft consequence, NOT built ·
Q4 MRES card later · Q-G globals MRES = DEF · Q-V Voltkin seed zap magic · Q-C stink cloud magic · Q-D a DoT beat may land 0 · Q-E elite/swarm keep base MRES · Q9 raceUnit by race vs R94/R117.

## Bump verdict
BUMP at merge (shared rule both peers compute). PROTOCOL_VERSION not edited on this branch.
