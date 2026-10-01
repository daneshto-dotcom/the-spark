# S192 PROGRESS — `s192/magic` (MRES on the DEF ladder, attack classes)

Branch `s192/magic`, from master 663c4c9. Merge owner: the main session. Never pushed, never merged here.

| step | status | commit | notes |
|---|---|---|---|
| 0 | `npm ci` in the worktree — exit 0 | — | own node_modules |
| 1 | SPEC — `.claude/plans/S192_MAGIC_SPEC.md` + `.html` (+ `C:\Users\onesh\OneDrive\Desktop\SPARK_Magic_Resistance_Spec.html`) | (this commit) | rule: magic hit = floor(A·(5+DEF)/(5+MRES)), min 1; DoT ticks Bresenham over beats |
| 2 | SUBSTRATE — class tag, mresFor, funnel rescale, six sources tagged, tests | pending | |

## Questions reported to the owner (spec §d)
Q1 DEF pick → MRES (already via pool; keep) · Q2 castle MRES = bought DEF · Q3 ATK pick never buffs magic (R190-E) → Voltkin draft consequence, NOT built ·
Q4 MRES card later · Q-G globals MRES = DEF · Q-V Voltkin seed zap magic · Q-C stink cloud magic · Q-D a DoT beat may land 0 · Q-E elite/swarm keep base MRES · raceUnit by race vs R94/R117.

## Bump verdict
BUMP at merge (shared rule both peers compute). PROTOCOL_VERSION not edited on this branch.
