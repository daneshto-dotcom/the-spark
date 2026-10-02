# ⭐ S193 DEPLOY-#22 BLOCKER ROUND — `s192/magic`

- merge master af4ab26 = fast-forward (branch == master + the 59→60 bump). `npm install` 0.
- **castle-panel.spec.ts:75**: the row literal now has eight keys (`castleMres` after `castlePen`), with a comment. Fixed in 6a90107.
- **tower-art.spec.ts:168 / :314 — NOT a magic regression; NOT REPRODUCIBLE on this tree.**
  - On this worktree's own port, the file passes 3/3 alone, 3/3 under an 8-worker vitest load, and 71/71 inside `npm run e2e:gating`.
  - The merge owner's failing artifacts (main checkout `test-results/`, 07:59) show **no static asset loaded at all**: the castle is the placeholder box, the draft cards have no art, the creature is a placeholder triangle, and in the same run `settings-toggles` failed with *"no race track was fetched. Saw: []"*. The tower ring stamped and ignited; only its PNG atlas (lazy `Assets.load` in `towerRenderer.ts`) never arrived.
  - Magic touches no asset, renderer-layer or stamp path: its render diff vs origin/master is damageNumbers / castlePanel / characterSheetModel plus tests, and `towerRenderer.ts` is untouched.
  - → Environmental in that run: the browser got no `/art` or `/audio` from the server on the main checkout's port (31118, `reuseExistingServer`). Recommendation: make sure nothing stale is listening on 31118 (or set `SPARK_E2E_PORT`), then re-run on a fresh server.
- Gates: e2e:gating **0** (71 passed) · typecheck **0** · vitest `--maxWorkers=3` **0** (491 files / 7492 tests passed) · build **0**, entry 1066.7 KiB.

# ⭐ S193 ENDGAME MERGE — `s192/magic` (latest; ready for deploy #21)

- **merge**: 1cdbe49 = `git merge master` at c09365e (endgame, PROTOCOL 59). No conflicts. `npm install` exit 0.
- **1 · seam** 27d02c7 — the auditor's `.tmp-audit/endgame-seam.patch`, applied as is:
  - `CREATURE_MRES` `endgameMonster: 'def'` and `megaPants: 'def'` (⚠ MINE: MRES = DEF);
  - `'physical'` on three endgame test calls;
  - creature-type count 28;
  - `magicResistCue.ts` added to the endgame owner-predicate census (n 5).
- **2 · differential** (WIP commit + the final one) — `magicResist.differential.test.ts` now:
  - grants `demons.l0` to the nagas seat (the auditor's mock);
  - keeps three stink clouds seeded each FIGHT;
  - places a real STINK TOWER star and a real HELGA star (both the target seat's, on its land);
  - dispatches one CAST_SCORCHED_EARTH per wave onto that land.

  Each magic call in B is attributed to its source by its stack frame (scorched creature beats are split passive/cast by the victim's zone). There is a floor PER SOURCE: rot, voltkinChain, ra, scorchPassive, scorchCast, scorchHelga, scorchConnector, stinkAura, stinkCloud.
  - Measured: 18000 ticks, A == B every tick. Per source: scorchCast 8593 · rot 6264 · scorchPassive 1469 · stinkCloud 373 · voltkinChain 118 · scorchHelga 68 · scorchConnector 26 · ra 7 · stinkAura 5 · (Voltkin zap, unfloored) 69. C diverges at 5412.
  - Mutation: stink cloud `magicDot`→`'physical'` → red on `source stinkCloud` (reverted).
- **3 · canon** — §2b differential sentence rewritten to say exactly what it proves (per-source floors, plumbing not table); the zombie boss death blast added to the physical column; both pinned in `canon.test.ts`.
- **Gates** (tip after this file's commit): typecheck **0** · vitest `--maxWorkers=3` **0** (490 files passed / 4 skipped; 7469 tests passed / 11 skipped) · build **0**, entry **1055.5 KiB**, cap now 1250, headroom 194.5 KiB (my share ≈ +4.4 KiB; master not rebuilt here).
  - Failed commands, both resolved: my canon pin first had a broken string (typecheck red → fixed); the Helga fixture used recipeId `'princessHelga'` (typecheck red → `'helga'`; the measured counts were identical after the fix).
- **Bump verdict**: BUMP **59 → 60** (the MRES rule both peers compute + the `'mres'` CastleStat discriminant). PROTOCOL_VERSION not edited.
- **MINE**: endgameMonster / megaPants MRES = DEF (rec: keep, like every global unit) + the earlier list.
- **NOT DONE**: nothing. e2e not run.

# ⭐ S193 ZOMBIES MERGE — `s192/magic` (latest; ready for the light re-audit)

- **merge**: 465bc37 = `git merge master` at e693dac (zombies 7ecc53e + PROTOCOL 58). `npm install` exit 0, lockfile unchanged.
- **Conflicts (12)**, all resolved by KEEPING BOTH:
  - Source:
    - `damage.ts`: imports; `damageEntity(…, attacker, cls, credit?)`; the creature arm passes `landed` plus master's kill credit; the bag burst passes `'physical', 'distance'`; the three radial arms take master's per-victim `amountOf` falloff hit AND forward `cls` by hand.
    - `suicideBlast.ts`, `droneLifecycle.ts`, `stinkTower.ts` (RadialDamageFn = `cls` then `falloff`; death blast and bag `'physical','distance'`; aura `magicDot(…)`, `'flat'`), `stinkCloud.ts` (`magicDot(…)`, `'flat'`).
  - Tests: `canon.test.ts` (both describe blocks); `untargetableCallSites.test.ts` (both verdicts); 5 radial test files (`'physical', 'distance'`); `hubSelfDestructLadder.test.ts` (master's falloff expectation + `'physical'`).
- **Signature**: `applyRadialDamage(…, sparePlayerId, cls, falloff, alsoSparePlayerId = null)`. `cls` is still slot 8, so `CLASS_ARG.radial` = 8 is unchanged. A swapped order would classify `'distance'` as OTHER → red.
- **Tags**: `racial/zombieDeathBlast.ts` connector + entity arms `'physical'` (R192-M3); its bag share goes through `damageStinkCloud` (no class; bag MRES = DEF). The only blastFalloff paths are inside the funnels plus the suicide connector arm, all `'physical'`. Two master test files were given `'physical'` (`zombieDeathBlast.test.ts`, `repairHealNumber.test.ts`).
- **Census**: 37 sites (21 + 9 + 7; physical 16) + the bypass census now includes the death blast's bag share. Mutation: death blast `'physical'`→`'magic'` → 2 red (reverted).
- **Differential**: A == B every tick for 16229 ticks (the bots WIN inside wave 2; ≥ one wave); B 97 magic hits (was 919, still > 20), 5644 DoT beats; C diverges at 5437.
- **Gates**: typecheck **0** · vitest `--maxWorkers=3` **0** (485 files passed / 4 skipped; 7382 tests passed / 11 skipped) · build **0**, entry **1045.4 KiB**, headroom **54.6 KiB** (the script now WARNS below ~55 KiB: raise the charter, merge owner's call). My share is still ≈ +4.4 KiB; master was not rebuilt here.
- **Bump verdict**: BUMP **58 → 59** (MRES rule both peers compute + the new `'mres'` CastleStat discriminant). PROTOCOL_VERSION (58) not edited.
- **NOT DONE**: nothing. e2e not run (not asked).

# ⭐ S193 FIX ROUND (after the clean audit) — `s192/magic`

- **merge**: 9dc1bf6 = `git merge master` at 29e1257, no conflicts. `npm install` run (lockfile unchanged).
- **1 · MED (R192-M12)** 5fbd9ec — `state/magicResistCue.ts` now also walks `scorchedEarthZones(world)` at `SCORCHED_EARTH_CAST_PER_MILLE` with the same `zero(dotBeat(…))` test. The passive AND the cast loops both call `isScorchImmune` (the ONE predicate, so teams' sameTeam change flows through). REACH: a new `resistFloater.test.ts` case, where a demon cast on P1 land with the Archdemon there gives cued ticks == swallowed cast beats (> 0) over 1200 real host ticks. Mutation: removing the cast loop's return → red (reverted).
- **2 · LOW** 98aaa3c — the bypass census adds `/\.ehp\s*=\s*[^;]*\.ehp\s*-/` and `/castleHp\s*-=/` (both 0 today). Each was mutation-checked by adding one such line → red (reverted).
- **3 · docs** 98aaa3c — `damage.ts` castle-MRES comment (it is now its own bought axis, R192-M9); `magicResist.ts` now cites `state/magicResistCue.ts` + `render/damageNumbers.ts`; `callSites.test.ts` now cites `magicResist.reach.test.ts`.
- **4 · canon** 214169f (text) + 09515b8 (pins) + 0df8dab (duplicate-import fix) — new **SPARK_CANON.md §2b MAGIC RESISTANCE**: the rule and formula, the worked case (Archdemon DEF 8 / MRES 14, magic 300 → 205), the DoT beat rule, the magic/physical table (Ra per share, Voltkin zap MINE), the MRES table (structures n, shapes/bags 0, globals/Helga = DEF, races 4·4·3·2·1·0, bosses 6+2×level), the castle axis (0 start, 100 VP, max 10, DEF does not raise it), and the RESIST cue. Every number is pinned in `canon.test.ts` (5 tests). Mutation: zombies level 0→1 → red (reverted). ⚠ The text and its pins landed one commit apart (WIP save), not in a single commit.
- **Gates** (tip 0df8dab): typecheck **0** · vitest `--maxWorkers=3` **0** (476 files passed / 4 skipped; 7292 tests passed / 11 skipped) · build **0**, entry **1039.4 KiB** (+0.1 over last round), headroom 60.6 KiB. My first typecheck after the canon pins was RED (duplicate `emptyCastleUpgrades` / `PHYSICS_HZ` imports); fixed in 0df8dab, then re-run green.
- **Bump verdict**: BUMP (unchanged; the cue is derived, not on the wire).
- **NEXT STEP (waiting on the coordinator)**: once zombies lands on master, `git merge master`. Keep `cls` required and put `falloff: RadialFalloff` AFTER it; move `CLASS_ARG.radial` to follow; re-apply `cls` forwarding by hand in damage.ts's three forwarded arms; tag the zombie DEATH BLAST `'physical'`; re-pin the census; then run the gates.

# ⭐ S193 ROUND REPORT — `s192/magic` (latest first)

- **tip**: the commit that carries this file (after 609f3d2) · **merge**: b3aafd7 = `git merge master` at 71abc27 (master had moved one bookkeeping commit past 8693fdd).
- **Conflicts (4, all source)**: `damage.ts` (stinkCloud arm → master's `damageStinkCloud`, its burst tagged `'physical'`; `applyRadialDamage` keeps BOTH `cls` (required) and master's `alsoSparePlayerId` (optional, AFTER `cls`)); `bossSkillsPharaohRitual.ts` + `powerOfRa.ts` → master's shared `landRaColumn` (my two local Ra calls dropped); `scorchedGround.ts` → master's five arms, then re-tagged. No plans/session-state conflicts.
- **Re-tags (R192-M2/M3)**: `racial/raColumn.ts` `landRaColumn` (perk, WRATH, bot cast AND the Pharaoh boss) → `'magic'` on both arms, per share · SCORCHED GROUND + SCORCHED EARTH → magic: creatures/Helga/structures as DoT beats (`magicDot`), lone shapes + stink bags plain `'magic'` (MRES = DEF = 0, lands as is) · `potatoLifecycle.ts` hub ladder blast (`applyHubLadderBlast`) → `'physical'` (connector + entity; its bag share goes through `damageStinkCloud`, no class, bag MRES = DEF) · `severWithCarry` overkill carry → `'physical'` (already-landed damage, never re-rescaled; moot since a structure's MRES = DEF) · 13 test call sites → `'physical'`.
- **Census (mechanical)**: `magicResist.callSites.test.ts` now 35 sites (20 damageEntity + 8 damageConnector + 7 radial; magic 6 · magicDot 6 · strikeClassFor 6 · forwarded 3 · physical 14) + a NEW **bypass census** pinning every direct pool write (`.ehp -=`, `castleHp = Math.max(0,`, `.hp -=`, `damageFifths +=`) and every call under a funnel (`damageCreature(`, `damageStinkCloud(`), `src/arcade/**` excluded. Mutation: raColumn `'magic'`→`'physical'` plus a stray `ehp -=` → 3 red (reverted).
- **Ra per share (owner flag) — CONFIRMED**: `landRaColumn` splits the pool first (`raSplitShares`), then calls the funnel once per target with that target's share, so each share is rescaled by its own target's DEF/MRES. REACH (`magicResist.reach.test.ts`, real `runHostTick`, perk AND Pharaoh): Archdemon share 18 → 12, MRES=DEF soldier share 17 → 17 (a total-based rescale would have shrunk his); negative asserts the sum ≠ rescaled total. Mutation: raColumn entity arm → `'physical'` turns both red (reverted).
- **Differential re-pinned**: after the merge the bots WIN at tick 17919 and B ran 0 DoT beats (anti-vacuity caught it). Zombie boss now LEADS the top-up mix; coverage = two waves, or the whole match if it ends sooner (floor: one wave). Result: 18000 ticks A == B every tick, 919 magic hits, 5258 DoT beats; C diverges at 5437.
- **Chore**: `defenderLifecycle.ts` ~:459 comment corrected to S161 P3 (throws the whole fight). Comment only.
- **Gates** (after `npm install`, lockfile unchanged): typecheck **0** · `npx vitest run --maxWorkers=3` **0** (476 files passed / 4 skipped; 7286 tests passed / 11 skipped) · build **0**, entry **1039.3 KiB**, headroom 60.7 KiB (≈ +4.3 KiB over master's ~1035 by the brief's ~65 KiB headroom figure; master not rebuilt here).
- **Bump verdict: BUMP** (unchanged reason + one more): both peers compute the MRES rule from synced state, and the new `'mres'` CastleStat discriminant rides `BUY_CASTLE_UPGRADE` — a stale peer would fall through. PROTOCOL_VERSION (56) not edited.
- **MINE (owner questions)**: per-unit MRES table (R192-M6 ordering, one level per race; rec: keep) · boss MRES 6+2×level (rec: keep) · Voltkin's own zap magic (rec: keep, it is his "chain") · castle MRES level = separate buy, starts = DEF (HIS R192-M9, built) · RESIST grey floater look (rec: show him) · Q1 drafted DEF pick → MRES only via pool (rec: keep) · lone shape / stink bag under SCORCHED EARTH tagged magic but MRES = DEF = 0 so no effect (rec: fine).
- **Merge seams**: ⚠ **ZOMBIE BOSS BLAST** — on master it is `applyRadialClear` (a raze, no damage funnel, so no class). `s192/zombies` rebuilds it; when I merge master again, if it becomes a funnel call the census goes red — tag it `'physical'` (R192-M3, "blows up") unless he says otherwise. · `applyRadialDamage` param order is now (…, sparePlayerId, cls, alsoSparePlayerId?) — any branch adding a radial call with `alsoSparePlayerId` must pass `cls` before it. · any new damage call anywhere turns the census red by design: decide its class and re-pin.
- **NOT DONE**: nothing in this round's brief. e2e not run (not asked).

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
