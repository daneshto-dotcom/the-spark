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

## ⏸ PAUSED (owner order, usage limit) — EXACT NEXT STEP ON RESUME

Item 3+4 (T2 + T3) not started. Next: write `src/state/racial/zombieDeathBlast.ts` (self-contained, NOT in
potatoLifecycle — carry owns that file): `T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS = 3 × attackFifths(8,8)` = 312 (⚠ AWAITING
OWNER), linear-falloff integer split (w = max(1, floor(R − sqrt(d²))), floor 1, remainder nearest-first by d²/kind/id),
structure = one target on its nearest connector, owner-agnostic, radius 380 kept; then `KillCredit {seat,type}` through
damageEntity → damageCreature → onCreatureDeathDecided → riseOnKill; roster gains `owner` in hostTick; replace the
STRUCTURE_SELFDESTRUCT dispatch at hostTick ~2441 with the new blast. Re-pin `bossDeathExplosion.test.ts`.
