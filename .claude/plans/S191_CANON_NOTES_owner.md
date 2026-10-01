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

### §6 — THE FINISHED DOCBLOCK (S192, for the merge owner to paste above `PROTOCOL_VERSION`; 55 → 56)
⚠ The list above is the S191 draft; its item 4 is CORRECTED below (audit UIGATES-13: inherited stock does
NOT age out — `despawnAtTick` is serialized and absolute; the divergence is in stock MINTED by an old build).

```ts
/**
 * ⭐⭐ S192 — **BUMPED 55 -> 56: `s191/owner` — SCORCHED EARTH + TOWER UNITS ARE STOCK.** Four reasons, each
 * enough alone (the S186 test — a v55 and a v56 build that shook hands would compute different worlds from
 * the same intents; `.claude/plans/S191_CANON_NOTES_owner.md`):
 *   1. A NEW CLIENT INTENT DISCRIMINANT — `CAST_SCORCHED_EARTH { playerId, zoneSeat }` (S191, owner: "click on
 *      any quadrant of the enemy"), in both allowlist records, bench + elimination policy `'deny'`. A v55 host
 *      or host-migration successor drops a v56 joiner's cast silently: the square shows USED, nothing burns.
 *   2. A NEW SERIALIZED FIELD — `Player.scorchedEarth { wave, zoneSeat } | null` (additive-optional, emitted
 *      only when non-null, rehydrated through `scorchedEarthFromWire`; in the wide `stateHashFull` `,se…`,
 *      NOT the narrow production hash). A v55 successor's `applySnapshotCore` forgets a live cast and would
 *      let the caster cast a second time in the same FIGHT.
 *   3. NEW BURN RULES BOTH SIMS COMPUTE — the cast burns every unit (creatures AND Helga — owner S191: "Helga
 *      is NOT immune", at the units' 2 %; the PASSIVE now burns an enemy Helga too) at
 *      `SCORCHED_EARTH_CAST_PER_MILLE` 20, and structures (one clock per component, its current pool, severed
 *      `'raid'` through `severWithCarry`), lone shapes and landed stink bags at HALF
 *      (`SCORCHED_STRUCTURE_RATE_DIV` 2); resistance is `isScorchImmune` (the caster's seat); the castle is
 *      never burned; the record clears at the BUILD edge; a fallen caster's ENEMY-zone cast stops while his
 *      OWN-zone cast burns on; the bot demon casts once a FIGHT. A v55 sim runs none of it.
 *   4. THE STOCK RULE (S191, owner: "If you have some drone stock, you should be able to use them the next
 *      fight") — chewers, HELLSPAWN children and lightning drones are `persistent` with a match-length
 *      lifetime; a drone that loses its target flies home; a persistent drone has no fuse. A v55 host or
 *      successor MINTS new chewers with a 3000-tick life and new drones with a 480-tick absolute fuse, so its
 *      stock dies at the next FIGHT edge while a v56 build keeps it.
 */
```
