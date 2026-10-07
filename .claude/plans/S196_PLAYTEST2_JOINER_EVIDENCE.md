# S196 PLAYTEST 2 — owner (host, WORKSTATION 2, idle machine) vs his brother (JOINER, remote) — joiner debug dumps

Owner: brother started "bugging at about wave six"; Helga fine; gatherers "started looking [wrong]". Brother sent debug dumps (Shift-debug panel) via Telegram from the joiner (`isHost: false`, 1v1). Key excerpts, verbatim numbers:

## ⭐ EXISTING CREATURES FROZEN FOR 30 s WHILE NEW ENTITIES STILL ARRIVE
| field | tick 41073 (19:41) | tick 42907 (19:42) — 1834 ticks = 30.6 s later |
|---|---|---|
| C204 t3Bat P0 | SEEKING pos=(40.0,660.9) ticksInState=204 ticksLeft=212253 | SEEKING pos=(40.0,660.9) ticksInState=204 ticksLeft=210419 |
| C205 t3Bat P0 | SEEKING pos=(40.0,604.8) ticksInState=159 | identical |
| C235 t3Piranha P1 | SEEKING pos=(1283.8,271.8) ticksInState=80 | identical |
| C239 chewer P1 | SEEKING pos=(1233.0,93.8) ticksInState=426 | identical |
| C240–C254 (bats + piranhas) | SPAWNING ticksInState=1 | STILL SPAWNING ticksInState=1 |
| C255/C256 voltkin P1 | SPAWNING ticksInState=0 ticksLeft=4654 | SPAWNING ticksInState=0 ticksLeft=2820 |
| NEW creatures | — | C259, C260, C261 appeared (count 26 → 29) |
| bonds in world | 201 | 217 |
| squares / triangles | 43 / 51 | 50 / 56 |
| spawners | 20 | 21 (S25 added) |
→ `ticksLeft` (derived from the local tick) moves; every EXISTING creature's pos / state / ticksInState does NOT. Additions apply; modifications to existing creatures do not (or only on rare keyframes). Bonds/primitives/spawner ADDITIONS do apply.

## tick 60658 (19:47): 78 creatures
- 12 t3PiranhaElite SPAWNING at the IDENTICAL pos (1319.3,795.7), ticksInState=0 (C562–C573) — stacked births never advanced.
- Many SEEKING with ticksInState=0 (C385, C421, C424, C426, C470, C494, C522).
- Spawner rows on the joiner: every spawner shows the same `next=` and `spawned=0` (may just be mirror-trimmed fields — check).

## tick 64914 POSTGAME: 107 creatures, spawners 0. `BOND_FORMED total seen: 0` on the joiner for the whole match (effects reach ~1/6 — known).
## Audio: `sfx voices dropped=0+27` by the end.

Timeline of dumps (joiner): 2290 TITLE · 4071 LOBBY · 10557 PLAYING (5 creatures) · 12193 · 41073 · 42907 · 60658 · 64914 POSTGAME.
Host = workstation 2 (idle, strong); this rules out host-side CPU contention.
