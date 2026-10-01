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

- **1b-bots** — `src/bots/botScorchedEarth.ts` (`botScorchTarget`: the highest-scoring LEGAL enemy, ties
  to the lower seat; `botScorchedEarthAction`: at its first look each FIGHT, phase-spread by seat,
  `BOT_SCORCH_EVAL_EVERY_TICKS` 30 ⚠ MINE) + one call in `botController.ts` after the Ra call. Tests
  `botScorchedEarth.test.ts` (7, the real BotManager through `runHostTick`: target, tie, fallen enemy,
  unheld/BUILD, once per FIGHT across the real clock, determinism). Mutations red, restored: controller
  call removed → 5 red; lowest-score target → 2 red. Suite 6527 / 0 failed, typecheck 0.

- **item 2** — tower units are STOCK. Diagnosis (reproduced red through the real host tick,
  `s191TowerStock.test.ts`): spawners are dormant outside FIGHT (S157 P0) so chewers/drones are born in
  FIGHT; `recallArmies` sends them home at the whistle; the fan-out is FIGHT-gated so nothing ticks them
  through BUILD; on the FIRST FIGHT tick (1) `applyCreatureTick` step 1 `world.tick >= despawnAtTick`
  (`creatureLifecycle.ts:~751`) deletes every chewer whose S104 P1 3000-tick ABSOLUTE lifetime ran out at
  home, and (2) `hostTick` Step 1.5 `world.tick >= despawnAtTick - 1` (`hostTick.ts:~1896`) detonates every
  drone whose 8 s ABSOLUTE fuse ran out at home. Fix = the tier-3/castle lifecycle: `persistent: true` +
  `GOBLIN_LIFETIME_TICKS` for `CHEWER_CONFIG` and `LIGHTNING_DRONE_CONFIG` (`voltkin-config.ts`); no new
  ceiling; `DRONE_LIFETIME_TICKS` retired unread. Tests: `s191TowerStock.test.ts` (8, REACH: chewers alive
  at the bell after a whole BUILD; a hub holding its 3 holds + releases them; production continues;
  the hub ceiling holds; HELLSPAWN children persist + go home to the pentagram; a fallen pentagram's
  chewers go home to the castle and live), `s191TowerStock.differential.test.ts` (host vs worker, TWO
  waves). Mutations (red, restored): chewer back to persistent:false/3000 → 5 red; drone back to
  persistent:false/480 → 3 red. Re-pinned (old lifecycle, by design): `save.replay` churn gate → stock
  gate over the same window; `towerDefense` chewer DESPAWNING → never fades; `voltkin-config` lock;
  `hellspawn` "ages out" → never ages out; `lightningHubDelivers` ×2 (see behaviour change below) and its
  "cap is inert slack" assertion retired. Measurement `s191StockMeasure.test.ts` (opt-in).

### Item 2 — every tower-produced unit, and its fate at the phase edges
| unit | produced by | persistent / lifetime (before → after) | FIGHT→BUILD | BUILD→FIGHT | what removed it at the edge | affected |
|---|---|---|---|---|---|---|
| chewer | pentagram (15 s, FIGHT only, caps OFF) | false/3000 abs → **true/match** | recalled to pentagram | resumes | step-1 auto-delete on the 1st FIGHT tick | **YES → fixed** |
| HELLSPAWN child | a dying chewer | follows chewer | recalled to parent's pentagram | resumes | same as chewer | **YES → fixed** |
| lightningDrone | lightning hub (5 s, FIGHT only, ≤3/hub, ≤12 global) | false/480 abs → **true/match** | recalled to hub | resumes | Step 1.5 fuse detonation on the 1st FIGHT tick | **YES → fixed** |
| goblins ×6 (incl. suicide, bat) | goblin tower (FED) | true/60 min | recalled | resumes | none (suicide goblin's Step 1.5 fuse = 60 min — latent only) | no |
| t3 units ×6 + SWARM + elite piranha | tier-3 tower | true/match | recalled | resumes | none | no — reference |
| raceUnit (incl. THE RISEN) | castle | true/match | recalled | resumes | none | no — reference |
| t9 bosses (incl. DYNASTY Pharaoh) | tier-9 tower (one-shot) | true/match | recalled | resumes | none | no |
| Helga | hall (a DEFENDER) | — | removed only if her recipe broke (S157 B6) | re-summoned | by design | no |
| Voltkin | its godly structure | false/20 s `'fight'` clock | recalled | resumes | dies at the next bell if its 20 s ran out | same class — S155 ruling, NOT changed, flagged |
| direwolf / locust | boss skills | false/own lifetimes | recalled | resumes | can expire across a BUILD | skill summons, NOT changed, flagged |

### Item 2 — measured, bots match (C5 fixture, 4 seats, seat 0 idle), BEFORE → AFTER
- NATURAL: bots never build a pentagram or a hub — 0 chewers / 0 drones all match, both builds; the
  match ends at wave 7 (a score win). Snapshot 105.3 KiB / host 0.81→0.92 ms mean at wave 7 (noise).
- SEEDED (every bot seat given a pentagram + hub at wave 1): razed by wave 3 in both; peak 2 chewers.
- STRESS (towers re-stamped each BUILD, no win, no keep falls) to wave 15: stock on the bell BEFORE = 0
  every wave from 2 on; AFTER = 1–3 on some bells (w3, w9, w10, w14); peak chewers per FIGHT 1–5 →
  1–6; wave-15 snapshot 194.1 → 158.9 KiB; wave-15 host tick 1.99 / 3.04 → 1.44 / 2.05 ms mean / p95
  (a different trajectory, not a saving — the enemy kills the stock). No runaway in bots play.
- ⚠ The worst case is arithmetic, not bots: a pentagram nobody kills now adds **4 chewers per FIGHT**
  (60 s / 15 s) forever — **60 by wave 15**, per pentagram. That growth is the owner's call (lever:
  `CHEWER_MAX_PER_SPAWNER`, or a finite lifetime on the `'fight'` clock).
- ⚠ BEHAVIOUR CHANGE, measured: a drone with nothing to home on no longer fizzles at its hub every 8 s.
  That fizzle's owner-sparing blast used to hit enemy units chewing the hub — in `lightningHubDelivers`'
  fixture the hub now falls at t=1499 instead of 3329. Lever: let an idle drone target enemy UNITS.

## Final gates (captured `$?`, S191)
- `npm run typecheck` EXIT=0 · `npx vitest run --maxWorkers=4` EXIT=0 (6536 passed / 5 skipped, 403 files)
  · `npm run build` EXIT=0 — bundle **964.4 KiB** / 1100 (headroom 135.6; +8.5 vs the PDR's 955.9).
- Non-zero exits along the way, each resolved: 1a/1b/2 RED runs (intended); `npm run typecheck` 1 after
  the stock patch (unused `DRONE_LIFETIME_TICKS` import — removed); the first two measurement runs
  (harness defects: sampled the trough; the hold-open clamped the wrong score field) — fixed and re-run.

## Commits
72343b0 step 0 · e3f0686 1a · 8f785f2 1b-sim · ae2ec25 1b-UI · 46f763c 1b-bots · 9c1a9b6 item 2

## Status
DONE — both items; waiting for the merge owner's audit / fix rounds.

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
- ⚠ Bot: scorches the highest-scoring enemy's zone at its first look each FIGHT; never its own zone.
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

---
# S192 — fix round (merge owner's brief)

## S192 step 1 — `git merge master` (e4d52dc, deploy #5 + S192 bookkeeping) → merge commit 4200429
- **Conflicts: NONE.** Files touched by both sides, auto-merged textually clean: `src/input/controls.ts`,
  `src/net/protocol.ts` (PROTOCOL_VERSION now 52 from master — untouched by this branch),
  `src/state/hostTick.ts`, `src/state/save.ts`, `src/state/stateHashFull.ts`. `spawnerLifecycle.ts` is not
  touched by this branch (the stock fix lives in `voltkin-config.ts`), so weld's hunks are master's verbatim.
- Gates after the merge: typecheck EXIT=0 · vitest EXIT=1 — ONE red, `doubleEscapeLeave.test.ts` SEAM-4
  (`expected 3 to be 2`) = digest UIGATES-3, predicted. Fixed in the next commit.
- **UIGATES-3 — FIXED.** controls.ts scorch Escape branch → `consumeCancel(e)` (inline guard + MERGE NOTE
  removed); SEAM-4 pin 2→3 (named); consumer list in `doubleEscapeLeave.ts`; new REACH case (scorch aim,
  Escape ×2 through the real Controls + `makeDoubleEscapeLeave` → 0 leaves). Mutation: drop the
  `consumeCancel` → the REACH case AND SEAM-4 red (2); restored. (On the merged tree the inline
  `preventDefault` already made the behaviour right — the guard was the red, as the audit said.)

## S192 step 2 — the owner's two later answers (HIS rulings) — DONE
- **Caster falls** → `scorchedEarthActiveZone`: `isEliminated(caster) && cast.zoneSeat !== caster.id` → stop.
  An ENEMY-zone cast stops the tick he falls; an OWN-zone cast burns on to the end of that FIGHT. The
  PASSIVE keeps S188 F4 (canon-pinned) — "his own zone keeps burning" read as the CAST; whether it also
  reverses F4 is SCORCH-6, still an open question (reported, not built).
- **Helga is NOT immune** → new `burnHelgas` arm in `scorchedGround.ts`, run by BOTH sources (passive and
  each cast — she is a unit, "the units' 2 %"): every live unit-class defender (`ehp > 0`, not DORMANT,
  `unitStats` non-null) not the spared seat's, in the zone, one fifth on the creature DoT clock for HER pool
  (`dotIntervalTicks(unitPoolFifths(PRINCESS_HP, PRINCESS_DEF)=156, 20)` = 19 ticks), phase = tick + her id,
  `damageEntity(defender, 1, 'aura', null)`. DORMANT Helga (S189 C2 record, `ehp === null`) takes nothing.
  (The passive arm is moot in practice — an enemy Helga's hall cannot stand in your zone — but a Helga that
  WALKS into a demon's land now burns there too.)
- Tests `src/state/racial/scorchedEarthOwnerAnswers.test.ts` (7, real host tick + real Helga recipe/matcher):
  RED first (2: own-zone after fall 0≠3; Helga 0≠6), green after. Negatives: enemy-zone cast stops; no cast
  → Helga untouched; caster's own Helga resistant; DORMANT Helga untouched and stays DORMANT. Mutations
  (each reverted): old `isEliminated` stop → own-zone REACH red; Helga arm dropped from the cast → Helga REACH red.
- Re-pinned: `damage.callSites` 17→18 sites, null 9→10, scorchedGround null 3→4; `creatureMaxPool.guard`
  scorchedGround occurrences 1→2 (Helga's pool, a defender's).
