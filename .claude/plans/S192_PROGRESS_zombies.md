# S193 ROUND 2 (R193-B blasts) — IN PROGRESS
- WIP: `src/state/blastFalloff.ts` (shared falloff); applyRadialDamage gains required `falloff`; hub split by distance; zombie blast 2:1, spares own side. NEXT: re-pin zombie REACH tests (own side now spared, chains must be ENEMY), run suite, re-pin hub/suicide/drone/stink tests, census test, canon + canon.test, gates.

# S193 ROUND 1 — FINAL REPORT (merge master into `s192/zombies`)

- **Merge SHA `c717e52`** (master `71abc27` into branch tip `9e995f3`; 213 commits). `npm install` run after the merge
  (pixi-filters 6.1.5 from master's lockfile — owner-approved, not new).
- **Conflicts (3):** `hostTick.ts` zombie-boss death (master `STRUCTURE_SELFDESTRUCT blast:'raze'` vs branch
  `applyZombieDeathBlast`) → kept the branch's split-pool arm (owner T3). `damage.callSites.test.ts` → master 20/12
  + zombie blast = 21 sites / 13 null. `damageConnector.callSites.test.ts` → master 8 + zombie blast = 9.
- **Merge seams found by the suite after a clean auto-merge (2):** (1) CARRY-2 census — the blast severed with a bare
  `SEVER_BOND`, deleting the overkill the owner ruled CARRIES (S191) → now `severWithCarry`; REACH test (a lone chain at
  his feet loses both connectors), negative (a small share fells nothing), mutation to a bare sever → RED (1 bond left).
  (2) canon.test R182-C / GATES-2 — canon said the zombie boss still razes → canon §9d text + SEVER table row
  (`racial/zombieDeathBlast.ts`, `'unit'`), test now pins raze = none in hostTick, `applyZombieDeathBlast(world,` = 1.
- **Gates (merged tree + fix):** typecheck 0 · vitest 0 (474 files passed / 4 skipped; 7275 passed / 11 skipped) ·
  build 0, entry **1038.5 KiB** vs master 1034.7 (measured on master in this worktree) = **+3.8 KiB**; headroom 61.5.
- **Bump:** BUMP (unchanged verdict — feed-bite coin exemption + serialized heal bank + blast/RISEN rules both peers compute).
- **MINE (unchanged):** 312 pool · 380 radius · own-side hit · THE_RISEN Reading A · 6×10 pulses · feed coin exemption ·
  stun-doesn't-stop · forfeit at fight end · heal-above for ALL heals.
- **Seams for the merge owner:** the `blast:'raze'` variant of `STRUCTURE_SELFDESTRUCT` has no production dispatcher
  now (tests only) — retire or keep; KillCredit vs s191/endstats `{kind:'seat'}` (see report); healAnchor now also
  places master's C-8 castle heal numbers straight above the castle.

# S192 PROGRESS — `s192/zombies` (T12, T11, T2, T3)

Branch `s192/zombies`, fresh from master `663c4c9`. Never merged, never pushed. Research source:
`.claude/plans/S192_RESEARCH_zombies_heals.md`. Canon text for the merge owner: `S192_CANON_NOTES_zombies.md`.

## Item 1 — T12 CORPSE EATER visibly heals

- (a) feed bite skips the S156 P4 initiative coin — `creatureAttack.ts` (predicate `isCorpseEaterFeeding`; no action flag). ⚠ MINE.
- (b) heal over time — `Creature.corpseEaterHealBank {fifths, untilTick}`; 6 pulses × 10 ticks (MINE), `floor(owed/pulsesLeft)`,
  last pulse takes the rest (104 → 17 17 17 17 18 18); each pulse through `noteCreatureHeal`. Four sites: creature.ts (defaults
  undefined), save.ts (serialize + deserialize, validated), stateHashFull.ts (`:cb` + `…Hashed` union), worker (rebuilds from the
  same serializer — snapshot→restore differential test). Forfeited if the FIGHT ends mid-schedule (MINE). Stun does not stop it (MINE).
- (c) heals drawn straight above the unit, no drift — `damageNumbers.ts` `healAnchor` (render-only, all heals).
- Tests: `src/state/racial/corpseEaterHeal.test.ts` (arithmetic, REACH 8/8 bites via runHostTick, pulses, negative coin, wire,
  hash, restore mid-payout), `src/render/damageNumbersHealAbove.test.ts` (placement, host REACH, joiner via HostSync→ClientSync).
  Re-pinned 3 assertions in `corpseEater.test.ts` (heal now measured after the 60-tick pulse schedule).
- Mutations: drop the feed exemption → REACH 1/8 bites RED; heal back on `damageAnchor` → placement + REACH RED.
- Bump verdict: **BUMP** — (a) is a rule both peers compute; (b) adds a serialized sim field. (c) none.
- Gates (item 1): typecheck 0 · vitest 0 (421 files passed / 2 skipped; 6751 tests) · build 0, **976.3 KiB** (+1.1 over 975.2).
  Two more existing assertions re-pinned (`s189HealCounter.test.ts` #4, `draftStrikeArms.test.ts` CORPSE EATER): heal measured after the pulse schedule.
- Commit: `d752b4f`.

## Item 2 — T11 a repaired structure shows a green number — DONE

- `World.structureHealHits {x, y, owner, amount, keys}[]` — per-frame, host-local; pushed once per repair by
  `applyRepairStructure` (total = connector banks cleared + shape HP refilled, at the frame centre). Five wipe sites
  (gameMode applyReturnToTitle, gameState softReset, save applySnapshotCore, damageNumbers sync = consumer, workerSim
  applyTickBatch) + world.ts factory + FIELD_COVERAGE 'acknowledged'. Consumer re-seeds the refilled shape keys so they
  do not print twice. `poolDelta` NOT flipped; castle hit/heal split untouched (carry C-8 owns it).
- ⚠ Stated limit: a JOINER has no record → on a peer only shape refills print.
- Tests: `src/render/repairHealNumber.test.ts` (one total green via real dispatch REPAIR_STRUCTURE; shape+connector sum;
  negative sever prints no green; nothing restored → no record). `damageTruthS182.test.ts` ARRAYS + `stateHashFull.test.ts`
  acknowledged list extended. Mutation: drop the push → 2 RED.
- Gates: typecheck 0 · vitest 0 (422 files / 2 skipped; 6755 tests) · build 0, **976.7 KiB**. Bump: none (render-only, host-local).

## Items 3 + 4 — T2 THE RISEN from every zombie kill + T3 the death blast as a split pool — DONE

- Commits: `2e21264` (KillCredit seam), `e2db129` (the blast), census follow-up (tip).
- T2: `racial/killCredit.ts` `KillCredit = {seat, type} | null`, resolved at the blow in `damageEntity` (new optional 6th arg
  `credit`; omitted = derived from a live creature attacker) → `damageCreature(credit)` → `onCreatureDeathDecided` →
  `riseOnKill(credit)` (no longer needs the killer alive). Reading A kept; `THE_RISEN_ANY_SEAT_UNIT = false` is the
  Reading-B lever (⚠ MINE pending owner). Castle gun / raid / unnamed splash still pass no credit → raise nobody.
- T3: `racial/zombieDeathBlast.ts` — `T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS = 3 × attackFifths(8,8) = 312` (⚠ AWAITING OWNER,
  one-line lever `T9_ZOMBIE_DEATH_BLAST_BITES`), `w = max(1, floor(380 − √d²))`, floor-1 integer shares summing exactly,
  remainder nearest-first, total order d² → kind → id, structure = ONE target on its nearest connector (sever `cause:'unit'`
  in his seat's name), owner-agnostic (`T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE = true`, ⚠ AWAITING OWNER), radius 380 kept
  (⚠ AWAITING OWNER). Null attacker + explicit credit → no retaliation / lifesteal from a dead boss. Self-contained (tune's
  `raSplitShares` is an equal split, not this rule). `hostTick` roster gains `owner`; the STRUCTURE_SELFDESTRUCT dispatch
  is replaced by `applyZombieDeathBlast`. Kills are queued and born in the existing spawn window.
- Tests: `src/state/racial/zombieDeathBlast.test.ts` (arithmetic incl. the research table 180/104/28; REACH: exact planned
  share per victim, Warlord adjacent survives, one risen per enemy corpse, own dead raise none, non-perk raises none,
  outside radius untouched, kill-hit prints the share; a structure is one target and banks; original vs snapshot→restore
  vs reversed-Map-order hash). Census pins moved: damageEntity 15→16 (null 7→8), damageConnector 5→6, strike-derivation
  SANCTIONED + acquisition NOT_ACQUISITION entries. `bossDeathExplosion.test.ts` still green unchanged.
- Mutation: drop the credit at the blast → "one risen per enemy corpse" RED (0 vs 10).
- Gates: typecheck 0 · vitest 0 (423 files / 2 skipped; 6767 tests) · build 0, **979.0 KiB** (+3.8 over 975.2).
- Bump: **BUMP** (a successor on the old build razes and raises nobody; the new one splits 312 and raises k).
