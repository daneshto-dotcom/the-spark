# S191 CANON NOTES — `s191/owner` (for the branch allowed to edit SPARK_CANON.md / canon.test.ts)

This branch may not edit the canon. Each item below is a sentence + the constant it must be pinned to.

## §3e SCORCHED GROUND row — extend it
- The ember look is FIGHT-only (and PLAYING-only), following the burn: `zoneBackdropTintNow` wraps
  `zoneBackdropTint` (the canon test still calls the phase-free one — keep it).
- ⭐ **SCORCHED EARTH** (the aimed half, same perk `demons.l0`), owner S191: *"you can click on any
  quadrant of the enemy … you will be resistant … with the same … amount of … health lost per … second
  … you can place it on your own as well … double scorched earth"* + *"also enemy structures will take
  half the damage that units take."*
  - `SCORCHED_EARTH_CHARGES` = **1** a FIGHT, lasts to the FIGHT's end (HIS answer), keyed on
    `waveNumber`, cleared at the BUILD edge (`clearScorchedEarthAtBuild`).
  - `SCORCHED_EARTH_CAST_PER_MILLE` = `SCORCHED_GROUND_PER_MILLE` = **20** (creatures).
  - `SCORCHED_STRUCTURE_RATE_DIV` = **2** — a structure (its connected component) burns as ONE at
    2 × `dotIntervalTicks(structurePoolFifths(n), 20)`: 5-conn **120** · 4 **166** · 3 **250** · 2 **428** ·
    1 **1000** ticks a fifth; lone shape / stink bag (pool 5) **1200**.
  - `SCORCHED_EARTH_OWN_ZONE_MUL` = (20 + 20) / 20 = **2** — each source on its own clock.
  - NOT burned: the castle (HIS), gatherers, avatars, Helga (⚠ MINE). The caster is spared everywhere.
  - ⚠ MINE: caster eliminated → cast stops; zone owner falls → keeps burning; a burned-through
    connector severs with `'raid'`; the bot targets the highest-scoring enemy at its first look.
  - Consequence to state: over a 60 s FIGHT one cast takes 60 % of ONE connector's pool from each
    enemy structure — no building falls to one cast; any creature in the zone 50 s dies.

## §3e HELLSPAWN row
- *"ageing out is not dying"* is now moot: chewers no longer age out (below). Children are chewers,
  persist, and go home to their parent's pentagram (`sourceSpawnerId` inherited).

## New: TOWER UNITS ARE STOCK (owner S191, systemic)
- `CHEWER_CONFIG.persistent` = **true**, `lifetimeTicks` = `GOBLIN_LIFETIME_TICKS` (match-length).
- `LIGHTNING_DRONE_CONFIG.persistent` = **true**, `lifetimeTicks` = `GOBLIN_LIFETIME_TICKS`;
  `DRONE_LIFETIME_TICKS` (8 s) RETIRED, unread.
- The stock ceiling is the existing one: `DRONE_MAX_PER_SPAWNER` **3** (now load-bearing, no longer
  "inert slack"), `DRONE_MAX_GLOBAL` **12**; chewer caps OFF (sentinels 10 000, S157 B8b).
- Unchanged, flagged: the Voltkin's 20 s fight-clock battery (S155), direwolf / locust lifetimes.

## §6 — the bump list this branch owes (one bump at merge, the merge owner writes it)
1. New client intent `CAST_SCORCHED_EARTH { playerId, zoneSeat }` — a new discriminant (both allowlist
   rows in `protocol.ts`, bench + elimination `'deny'`).
2. New `Player.scorchedEarth` (additive-optional, hashed `,se…`) — rides the bump.
3. New host rules both sims compute: the cast's burn (creatures / structures / lone shapes / bags), the
   BUILD-edge clear, the bot cast.
4. Chewer + drone persistence — a successor on a v51 build would age the inherited stock out (the S186
   test: two builds that shake hands disagree about what either computes).
