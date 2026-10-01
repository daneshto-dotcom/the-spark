# S192 — PROGRESS — `s192/teams`

Base: master `663c4c9`. Merge owner: the main session. This branch never pushes and never touches master.

## STEP 1 — SPEC (committed before any code)
- `.claude/plans/S192_TEAMS_SPEC.md` + `.claude/plans/S192_TEAMS_SPEC.html`, desktop copy `C:\Users\onesh\OneDrive\Desktop\SPARK_Teams_Spec.html`.
- (a) 69 converted "is this an enemy?" sites (A sim 49 · B bots 9 · C input 3 · D render 8) + the lobby (#70), plus the
  unchanged ownership list (E).
- Owner questions Q1–Q8 with recommendations; bump verdict YES (52→53) owed at merge.

## STEP 2 — BUILD v1
DONE (WIP commit, see git log):
- `src/state/teams.ts` — sameTeam / isEnemySeat / sameTeamColor / teamOf / normalizeTeams / teamsPlayable / arrangeTeamSeats.
- `World.teams?` (worldTypes) · hash part `tm…` only when set + FIELD_COVERAGE · `WorldSnapshot.teams?` serialize/apply (`readTeams`)
  · `applyStartGame` stamps from `roster[].team` · RETURN_TO_TITLE clears.
- Sites converted: all of spec A (sim, incl. alliesOf for Pharaoh ritual + zombie death blast), B (bots), C (raid picker), D render
  (walls `wallSeparatesSides`, projectile, damage numbers, character-sheet ALLY labels, TEAM N WINS banner).
- untargetable census regex extended to see `sameTeam(...ownerPlayerId` forms.
IN FLIGHT: first full vitest = 4 failing tests (typecheck 0):
  canon.test.ts §9d radial-clear source text · raidHitsAnything.test.ts picker source text ·
  stateHashFull.test.ts FIELD_COVERAGE contribution (teams needs a contribution case) · untargetable census verdict rot (re-run after regex fix).
RESUMED: the 4 reds fixed (commit below); full vitest 0 — 6735 passed.
  applyRadialClear stays in the 1200-char window); census regex FIXED via Edit. STILL TO FIX: raidHitsAnything.test.ts:203 expects
  `/c\.ownerPlayerId === this\.playerId/` in pickCreature → re-pin to the sameTeam form; stateHashFull.test.ts FIELD_COVERAGE
  contribution case for `teams`. EXACT NEXT STEP: fix those two, re-run `npx vitest run --maxWorkers=3`.
NEXT (after): fix those 4 (re-pin source-text guards to the new form) → re-run vitest → commit → guard test teams.sites.test.ts (mutation-tested)
  → FFA differential (hashWorldStateFull, 4-seat bots) → REACH tests (units, towers, castle gun, area blasts, raids) → lobby UI
  (bot overlay team chips + multiplayer CLAIM_TEAM/roster.team + arrangeTeamSeats at Begin) → build gate.
