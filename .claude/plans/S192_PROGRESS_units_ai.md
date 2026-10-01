# S192 PROGRESS — `s192/units-ai` (T5 + T13 + T6)

Branch `s192/units-ai`, from master 663c4c9 (fast-forwarded to 2ab7910, docs only). Merge owner = main session.
Every exit code below was captured from `$?` into a file, never through a pipe.

## T5 — Helga patrols in BUILD — DONE
- `stepPrincessPatrol(world, d, homePos)` factored out of the FSM's IDLE arm (`defenderLifecycle.ts`), byte-identical
  for FIGHT; `defenderHomePos` reads the anchor the way `applyDefenderTick` does.
- `hostTick.ts` defender poll: in the non-FIGHT branch a living (`IDLE`) Helga takes one patrol step and `continue`s.
  No acquire, no fire clock, no aura, no state change; DORMANT untouched.
- `audioManager.ts`: the theme's raw engaged predicate extracted as the pure `isHelgaEngagedRaw` (no behaviour change)
  so the sim test can pin "her music does not start".
- Tests: `src/state/defenders/helgaBuildPatrol.test.ts` (5): REACH through `runHostTick` (moves > 10 px, ≤ 133+5 px from
  hub, on board), arithmetic (destination = the S183 formula, anti-vacuity floor), NEGATIVE motion-only (enemy at 50 px
  never acquired, `nextFireTick` unchanged, IDLE, `isHelgaEngagedRaw` false every tick), NEGATIVE DORMANT does not move,
  the predicate itself.
- Mutations: (1) BUILD call removed → 3 red (REACH, arithmetic, negative's live-walk floor); (2) patrol puts her in WALK →
  3 red (incl. the music assertion).
- Gates: typecheck 0 · vitest 0 (420 files passed / 2 skipped, 6739 tests passed / 7 skipped) · build 0, **975.5 KiB**.
  No replay / differential baseline moved.
- Bump: **NO** — host-only motion of the synced `pos`; a client runs no defender FSM.
