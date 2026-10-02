# S194 — IN PROGRESS (T1 teams) — WIP log, final report will replace this block

- STEP 1 DONE be40841e — merge master 0a37175e, 11 conflicts (listed in the commit). npm install 0. typecheck 0.
- STEP 2+3 DONE 4d924bd5 — zombie death blast / leaderTargetSeat / RESIST cue / building cards / stat board / bot lobby relayout / permuteBots.
- STEP 4 DONE cd0ce649 — FFA golden re-recorded on master 0a37175e, merged tree 90/90 identical, mutation diverges @3900.
- NEXT: step 5 e2e teams-lobby on own hashed port; step 6 gates (typecheck, vitest --maxWorkers=3, build KiB).

# S193 ROUND 2 — FINAL REPORT (top) — `s192/teams`, worktree agent, NOT the merge owner

- Merge **031c9e37** = `git merge master` @ **656b106** (deploy #17, units-ai, PROTOCOL 57). 5 conflicts, resolved per the
  audit: archdemon + kraken (sameTeam kept, `c.ehp <= 0` dropped — master's isLiveCreatureTarget), retaliation (sameTeam
  kept, isUntargetable dropped — inside isLiveCreatureTarget), defenderLifecycle (isEnemySeat AND isLiveCreatureTarget),
  creatureAI enemyCastleMarchPos (sameTeam AND the fallen-keep castleHp test). `npm install` 0.
- ⚠ master has moved AGAIN since (deploy #18 + s192/endgame merge, 5be7e13) — NOT merged this round; the next merge owes
  a re-record of the FFA golden.
- FFA: golden re-recorded on 656b106; identical to the auditor's a684ce5 series; merged tree 90/90 identical (exit 0).
- F1: multiplayer Begin dims (alpha 0.4, MINE) with the bot lobby's hint (shared TEAMS_UNPLAYABLE_HINT) when every seat is
  on one team — `lobbyView.teamsPlayable` + pure `beginButtonPaint`; unit test + mutation red; e2e REACH reads the live
  alpha/hint and presses Begin (stays LOBBY).
- F2: CLAIM_TEAM (and the host's own pick) call `maybeQmAutoBegin`; `sessionTeamsPlayable` is the one predicate Begin and
  auto-begin read; onAutoBegin now refuses BEFORE stopQuickmatch (a one-team room stayed undiscoverable otherwise). REACH
  through the real host route; mutation red.
- F3: census docblock names the aliased-operand hole; REACH tests are the backstop.
- F4: teams.reachSites.test.ts — teammate/enemy pair via the host tick for stink tower, Helga, Voltkin chain, suicide blast,
  drone blast, zombie rot (12 tests). Mutations: radial spare → 3 red; chain, rot → red; Helga red only with all three of
  her guards reverted (defense in depth).
- Docs: canon §5d TEAMS (R192-T1..T4, win rule, every MINE) + canon.test pin (TEAM_COUNT 4); bump text 57→58 in protocol.ts
  docblock and the spec. Canon ~707 already fixed in round 1.
- Gates: typecheck 0 · vitest 0 (7355 passed / 11 skipped, 482 files) · build 0, entry 1041.7 KiB vs base 656b106 1035.9
  (+5.9), headroom 58.3 (the checker now WARNS under 60). e2e teams-lobby: 2/2 exit 0 (1.1 m, 1.3 m).
- Bump: YES 57 → 58 — a pre-teams peer ignores world.teams / RosterEntry.team and computes every enemy decision differently.
- MINE: Begin dim alpha 0.4 · Pharaoh column / zombie R138 blast spare teammates, hit own seat · CARRY-1 owner-only ·
  scorch on a teammate's zone allowed · teammates side by side.
- Seams: s192/zombies spares the zombie boss's own side (R193-B3) — when it lands, extend that spare to teammates through
  sameTeam (`alliesOf` on the 'raze' self-destruct today spares teammates only). Plus round 1's seams.
- NOT DONE: protocol bump (merge owner); e2e lane promotion (merge owner); merge of master 5be7e13 (arrived mid-round).

# S193 — FINAL REPORT (top) — `s192/teams`, worktree agent, NOT the merge owner

- Merge 8e3eed69 = `git merge master` @ 71abc27. 6 source conflicts: bossSkillsPharaohRitual (master landRaColumn + new
  REQUIRED `RaColumnSource.alliesOf`), damage.ts applyRadialDamage (both params: alsoSparePlayerId 9th, alliesOf 10th, team-aware),
  potatoLifecycle (master ladder|raze union; alliesOf on 'raze'), powerOfRa + scorchedGround (master taken; team logic moved to
  raColumn.ts / scorchedEarthRules.ts), untargetableCallSites.test (both regexes).
- Ally exemption: isScorchImmune(world, owner, spared)=sameTeam · raColumnTargets team spare; Pharaoh boss own seat burns,
  teammates spared (MINE) · planHubBlast 5 arms · popped-bag burstAlsoSpares (team) · CARRY-1 kept owner-only (MINE-classified)
  · FOUND by the new SEATVAR census: botScorchTarget `other === seat` would scorch a teammate → sameTeam.
- SEATVAR census (teams.sites.test.ts): 81 hits / 46 files classified + pinned; mutation-tested. teams.reachMaster.test.ts: 12
  REACH/CONTROL tests; 6/6 hand mutations red.
- FFA differential: golden re-recorded on 71abc27; merged tree 90/90 identical; forced-teams mutation diverges at tick 2100.
- e2e/teams-lobby.spec.ts (3 browsers, port 33228): run 1 exit 1 (joiner 2 rack froze after a nostr SDP/TURN failure; host had
  its claim), runs 2+3 exit 0. @quarantine-flaky.
- Gates: typecheck 0 · vitest 0 (7292 passed / 11 skipped) · build 0, entry 1039.8 KiB vs master 1034.7 (+5.1), headroom 60.2.
- Bump: YES 56→57 (next free) — a pre-teams peer ignores world.teams/RosterEntry.team and computes enemies differently.
- MINE: Pharaoh column spares teammates not own seat (keep) · zombie R138 same (keep) · CARRY-1 owner-only (keep) · scorch on a
  teammate's zone allowed (harmless).
- Seams: applyRadialDamage arg order; RaColumnSource.alliesOf required; isScorchImmune takes world first; per-file census pins;
  FFA golden tied to 71abc27; e2e promotion is the merge owner's call. NOT DONE: bump, e2e lane promotion.

---

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
