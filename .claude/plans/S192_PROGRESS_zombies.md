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
