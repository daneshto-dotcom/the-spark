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

## STEP 2 — DONE (S192 resume)
- d3cf130 four reds fixed (raid picker re-pin, teams hash contribution, census sees team predicates, canon §9d window).
- 9a458b4 `teams.sites.test.ts` — inline owner comparisons + predicate calls pinned per file; mutation-tested.
- f3e516d `teams.ffaDifferential.test.ts` — 90 hashWorldStateFull checkpoints, 3 waves, 4-seat bots; golden recorded on
  master 663c4c9; byte-identical; mutation (forced teams) diverges at tick 2100.
- 7acfde5 `teams.reach.test.ts` — REACH + enemy CONTROL: units, castle gun, laser turret, area blasts (+alliesOf),
  zombie death blast, Scorched Ground, raids; walls, last-team-standing, snapshot, START_GAME.
- 24478c2 bot lobby team chips; 066fc08 multiplayer lobby (RosterEntry.team, CLAIM_TEAM, seat chip, Begin gate,
  side-by-side re-seat); 0a641e3 wire tests.
- Browser check (dev server on 5291, this worktree): bot lobby chips cycle; started 2v2 → world.teams [0,1,1,0], the
  host's teammate re-seated to BL, only the vertical wall drawn. Host room: own-seat chip cycles to T1 without opening
  the race menu. A real two-peer join was NOT exercised (unit-tested only).
- Final gates: typecheck 0 · vitest 0 (6770 passed / 7 skipped) · build 0, 980.2 KiB (+5.0 over 975.2).
OPEN: Scorched Earth (`isScorchImmune`, s191/owner) converts when that branch lands — `git merge master` and re-enumerate.
BUMP: YES 52→53 (or the next free number after whatever master now carries) — owed at merge.
