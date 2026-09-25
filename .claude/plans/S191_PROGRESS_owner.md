# S191 PROGRESS — `s191/owner` (Scorched Earth · pencil chewers)

Brief: `.claude/plans/S191_BRIEFS/owner.md` (main checkout). Rules: S191 PDR §4 + S189 PDR §4.

## Owner answers to the open gates (received by message, S191)
1. Casts / duration — ONCE PER FIGHT, the scorch lasts until that FIGHT ends. **HIS number.**
2. Castle — NOT burned. **HIS ruling.**
3. Own-zone passive vs buildings — moot (*"enemies cant build buildings in your zone so stupid and
   redundant question."*). Passive unchanged, nothing added.
4. NEW — *"also enemy structures will take half the damage that units take."* A structure in a scorched
   zone burns at HALF the units' rate (1 %/s of its structure pool). The own-zone double applies to
   outsiders' UNITS.

## Item 2 WIDENED by the owner (message, S191)
*"the same bug that makes the pencil chewers disappear … It does the same thing to the drones from the
drone hub … three drones in each tower, and then the fight started. Boom, they disappeared, and it
started producing them from zero … when you fix a pencil chewer, it should be a systemic fix for all the
other spawn that get the same … bug."* → (a) enumerate every tower-spawned type and its phase-edge
fate; (b) failing REACH tests for chewers AND drones; (c) ONE mechanism — tower-produced units are
STOCK (survive BUILD at home, released at FIGHT, production continues up to the existing ceiling);
consumed-by-own-action is fine; (d) tests per affected type, wide hash over two waves, mutation per
root cause, the table in the final report.

## Council items ACCEPTED by the merge owner (message, S191)
- Structures burn as ONE unit: interval = `SCORCHED_STRUCTURE_RATE_DIV ×
  dotIntervalTicks(structurePoolFifths(current n), unit rate)` (half the rate = twice the interval),
  re-derived when the structure re-forms; phase = tick + the lowest bond id clear of the caster; one
  fifth to that bond, NO attacker; sever via SEVER_BOND reducer with the EXISTING `'raid'` cause. A
  welded component with no caster-clear bond does not burn. Stink bags: an explicit `world.stinkClouds`
  arm.
- Stacking: each source (passive own zone, aimed cast) on its OWN clock; own-zone cast doubles creatures.
- ⚠ MINE defaults: caster eliminated → his cast stops; zone owner falls after the cast → keeps burning;
  Helga, gatherers, avatars never burn (Helga reported).
- Keying: charges + zone record on `waveNumber`, cleared at BUILD.
- UI: the square has the collapsed compact form (like Ra's), in BOTH hit-tests; the footer fill guard
  pins NINE opaque fills today — re-pin with the added fill + hit-test (s191/addons also edits it).
- CHEWERS: `persistent: true`, NO new ceiling (caps OFF, S157 `constants.ts:~1586`). HELLSPAWN
  children persist and return home too. A fallen pentagram's chewers do what tier-3 units do. Measure
  a bots match to wave 15 (chewers/seat, snapshot bytes, host tick mean/p95) before + after — REPORT.
  Same systemic rule for drones etc.
- If the cast needs "world.tick moved backwards on a joiner" protection, say so (s191-carry C-2).

## Done
- Step 0 — `npm ci` EXIT=0. Progress skeleton.
- **1a** — the ember tint is FIGHT-only (and PLAYING-only, following the burn's own gate).
  `zoneBackdropTintNow(player, phase)` wraps the phase-free `zoneBackdropTint(player)` (kept, because
  `canon.test.ts` — which this branch may not edit — calls it with one argument). The renderer's `sync`
  calls the wrapper. Checked: the BURN itself was already FIGHT-only (`runRacialPerksFight` sits inside
  `hostTick`'s `matchPhase === 'FIGHT'` block, ~:2094/:2132) — nothing else changed.
  Tests `src/render/s191ScorchedTintFightOnly.test.ts` (REACH: the real host tick across BUILD→FIGHT and
  FIGHT→BUILD, the REAL `ZoneBackgroundRenderer.sync`, sprite tint read back). Mutation: renderer back on
  `zoneBackdropTint(player)` → 2 red; restored.

- **1b-sim** — `CAST_SCORCHED_EARTH { playerId, zoneSeat }` (a SEAT, never a point). Rules leaf
  `src/state/racial/scorchedEarthRules.ts` (`scorchedEarthCastRefusal`, `scorchedEarthTargetZone`,
  `scorchedEarthActiveZone`, `scorchedEarthFromWire`); reducer + burn in `scorchedGround.ts`
  (`applyCastScorchedEarth`, `clearScorchedEarthAtBuild`, `runScorchedGround` = passive byte-identical,
  then each live cast on its own clock: creatures · structures (one clock per component, lowest
  caster-clear bond, `damageConnector(…, 1, null)`, sever via `applySeverBond` cause `'raid'`) · lone
  shapes · stink bags). New field `Player.scorchedEarth: {wave, zoneSeat} | null` — four sites.
  Tests: `scorchedEarth.test.ts` (39) + `scorchedEarth.differential.test.ts` (host vs worker, cast as
  a real intent). Mutations (all red, restored): M1 cast spares nobody → resistance red; M2 cast
  REPLACES the passive → double red; M3 `SCORCHED_STRUCTURE_RATE_DIV` 1 → 3 red; M4 one clock per
  connector → 2 red. Re-pinned: `damage.callSites` 15→17 (null 7→9), `damageConnector.callSites` 5→6,
  `creatureMaxPool.guard` SANCTIONED + scorchedGround.ts (the stink bag's pool — not a creature).

- **1b-UI** — the square (`footerBand.ts`: `layoutScorchedEarthButton` = Ra's slot geometry, a
  compact square beside the collapsed tab, `drawScorchedEarthButton`, `isOverScorchedEarthButton` in
  BOTH `isOverChip` and `isOverBandSurface`, icon `public/art/skills/scorched-earth.webp` cut by
  `scripts/cut-skill-icon.py --preset scorched-earth` from `l0-demons.png` top 440 side 700), the aim
  context `src/render/scorchedEarthAim.ts` (aim, `zoneSeatAt` via the reducer's target predicate,
  hover seat, pending-cast record with the `age < 0` guard), the gesture in `controls.ts` (press /
  again / RMB / Escape consumed / quarry refused / BUILD refused), the backdrop `zoneTintFor` (hover
  preview `SCORCHED_EARTH_PREVIEW_TINT` ⚠ MINE · a live cast's zone = ember · else the 1a passive).
  Tests `src/input/controls.scorchedEarth.test.ts` (12, the real Controls + FooterBand + backdrop).
  Mutations red, restored: square dropped from `isOverBandSurface` → collapsed test red; hover ignored →
  preview test red; cast-zone arm removed → red. Re-pinned: `footerBand.test.ts` fills 9 → 11 (plate +
  pip, both inside the square); `isOverBandSurface` 300-char source windows → 420 in `footerBand.test.ts`
  and `s182UiSurfaceGuards.test.ts`. Fixed a test-only type error left in the 1b-sim commit
  (`fp` returns a number). Suite 6520 / 0 failed, typecheck 0.

## In flight
- 1b-bots

## Next
- item 2

## Constants (S191)
| constant | value | whose |
|---|---|---|
| `SCORCHED_EARTH_CHARGES` | 1 a FIGHT, lasts to the FIGHT's end | HIS (answer 1) |
| `SCORCHED_EARTH_CAST_PER_MILLE` | = `SCORCHED_GROUND_PER_MILLE` (20) | HIS ("the same amount"), derived |
| `SCORCHED_STRUCTURE_RATE_DIV` | 2 (structures at half = twice the interval) | HIS (answer 4) |
| `SCORCHED_EARTH_OWN_ZONE_MUL` | (20 + 20) / 20 = 2, derived, not read by the burn | HIS ("double") |
| structure intervals (ticks/fifth) | 5-conn 120 · 4 166 · 3 250 · 2 428 · 1 1000 · lone/bag 1200 | derived |

## Decisions / numbers that are MINE
- ⚠ The sever cause for a burned-through connector is `'raid'` (POWER OF RA's precedent: plays the
  player-sever SFX, toast "<SEAT> BROKE YOUR BOND").
- ⚠ Caster eliminated → his cast stops; zone owner falls after the cast → keeps burning (Council defaults).
- ⚠ Helga is NOT burned (Council default; reported). Gatherers/avatars/castle never.
- ⚠ A burned-out stink bag BURSTS like any killed bag (the burst spares the bag's owner, not the caster).
- ⚠ `SCORCHED_EARTH_PREVIEW_TINT` 0xff2a2a (a deeper red than the ember). The preview and the red cast zone
  are backdrop TINTS (the brief's "hover tint"), so with backdrops toggled OFF neither shows.
- ⚠ Escape uses an inline `preventDefault` (s189/net's `consumeCancel` is not on master) — at merge,
  switch to `consumeCancel(e)` and add this cancel to `doubleEscapeLeave.ts`'s consumer list.
- ⚠ A bond is "in the zone" by its MIDPOINT (POWER OF RA's rule); a structure's phase key = its lowest
  caster-clear in-zone bond id.
- Consequence for the owner: at 1 %/s over a 60 s FIGHT one cast takes 60 % of ONE connector's pool
  off each enemy structure in the zone — no building falls to one cast alone; any creature standing in
  the zone for 50 s dies. A stink bag lives 5 s and burns once per 20 s — the bag arm almost never lands.

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
- `save.ts`: import `scorchedEarthFromWire`; `SerializedPlayer.scorchedEarth?`; rehydrate line; emit
  line (only when set). Self-contained.
- `stateHashFull.ts`: players docblock line + `,se{wave},{seat}` / `,se_` right after `,ra…`.
- (not hotspots, listed anyway) `hostTick.ts`: 1 import + `clearScorchedEarthAtBuild(world)` in the
  FIGHT→BUILD edge block before `recallArmies`. `game/player.ts` field + factory + both carry-FSM
  rebuilds; `gameMode.ts` reset in `applyStartGame`; `world.ts` union + case; `benchGate.ts` +
  `elimination.ts` `'deny'` rows; ⚠ `src/net/protocol.ts` — the TWO intent-allowlist rows only.
