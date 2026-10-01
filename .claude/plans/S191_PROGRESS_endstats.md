**STATUS: S193 round 2 — merged master e693dac (zombies, PROTOCOL 58) + BLAST-2 FOLDED into KillCredit; gates green; report sent. Next: the merge owner's independent audit — fix only what it sends back.**

## ⭐ S193 ROUND 2 REPORT (merge zombies + fold)
- **merge** `6edf187` (master `e693dac`, PROTOCOL 58) + `962bdba` (test fix) — tip = the docs commit above `962bdba`.
- **Conflicts (5):** `creatureLifecycle.ts` imports (kept both) · `suicideBlast.ts` connector arm (master's `blastHitAtDistance` hit + the seat attacker) · `damage.ts` imports (matchStats + killCredit + blastFalloff; statCredit dropped) and `applyRadialDamage`'s three arms (master's per-target falloff amounts + `blastBy`) · `damage.callSites.test.ts` · `damageConnector.callSites.test.ts` (both re-derived; zombie blast joins the SEAT tallies, nulls stay 0).
- **The fold (ONE seam):** `racial/killCredit.ts` — `KillCredit.type` widened to `CreatureType | null`; NEW `killCreditOf(world, attacker)` (creature = `creatureKillCredit`, tower = its seat/no type, `{kind:'seat'}` = that seat/no type). `damageEntity` resolves `blow = credit ?? killCreditOf(...)` ONCE at the top; the board reads `blow.seat`, `damageCreature`/THE RISEN get `blow`. `racial/theRisen.ts` `riseOnKill`: NEW `if (credit.type === null) return;` BEFORE the `THE_RISEN_ANY_SEAT_UNIT` lever → Reading A byte-identical, and the lever can never raise on a seat credit. `statCredit.ts` DELETED. `zombieDeathBlast.ts`: `{kind:'seat', seat: owner}` on the connector, bag and entity arms + `carryBy` on its `severWithCarry`; explicit credit kept (wins, carries his type).
- **Tests:** `matchStats.blast2.test.ts` 14 — hub REACH re-derived from master's DISTANCE split (`planHubBlast` read on the blast tick; conservation); NEW zombie 312 death blast through `runHostTick` (DEALT == TAKEN == Σ min(share, pool), every kill his seat's); NEW suicide goblin via the shared falloff through `runHostTick` (DEALT == TAKEN == shape + unit loss); NEW THE RISEN Reading A (seat kill raises 0, race-unit control raises 1). Mutations, each red then restored: zombie entity arm → null (census); `blastBy` → null (suicide REACH + census); explicit-credit precedence dropped (zombieDeathBlast T2 RISEN test).
- **Gates** on `962bdba` (captured `$?`): typecheck **0** · vitest --maxWorkers=3 **0** (485 files / 4 skipped; **7388 passed** / 11 skipped) · build **0** — entry **1046.5 KiB** (1,071,590 B) vs master e693dac **1040.6 KiB** (1,065,619 B) = **+5.8 KiB**; headroom 53.5 KiB (S101 raise-the-charter warning prints). `npm install` exit 0 after the merge.
- **Bump verdict on 58: NONE owed.** Attackers/credits are call arguments, never serialized; the only state they move is the inert `World.matchStats` (additive-optional wire field, no reducer reads it). THE RISEN's decisions are unchanged (guard + mutation-tested), so two builds that shake hands simulate identically.
- **Merge seams:** the hub REACH no longer exercises the carry (the distance split gives e12 < 14); the carry credit is pinned by the raid-carry REACH. Any new `severWithCarry` call must pass a seat (census). Any new damage call with a `null` attacker turns both censuses red by design.
- **NOT DONE:** e2e; a live look at the board.

---

## ⭐ S193 FINAL REPORT (round: merge master + BLAST-2)
- **tip** the docs commit on top of `4b30761` (see the report message for its SHA) · merge `3a06b9d` (master `71abc27`, 233 commits) · BLAST-2 `041c741` · adapter `4b30761`.
- **Merge conflicts (3 + 1 silent):**
  1. `src/state/damage.ts` stinkCloud arm — master lifted it into `damageStinkCloud` (hub-owner burst spare); took master, re-added the stat-board `recordDamage` INSIDE `damageStinkCloud`.
  2. `src/state/racial/powerOfRa.ts` — master moved `landRaColumn` to `racial/raColumn.ts`; took master (endstats' seat on the connector arm was then re-applied in raColumn by BLAST-2).
  3. `src/state/damage.callSites.test.ts` — counts re-derived from the merged tree.
  4. ⚠ `src/state/damageConnector.callSites.test.ts` merged TEXTUALLY CLEAN BUT WRONG (audit GATES-5 predicted it): master's null sites landed inside endstats' SEAT tally. Re-derived.
  Merge-tree full suite (before BLAST-2): vitest exit 0, 475 files / 7283 passed / 11 skipped.
- **BLAST-2** — every `null` damage attacker in production is now a SEAT (censuses: damageEntity null 6→0, damageConnector null 4→0):
  · hub ladder blast (`potatoLifecycle.ts` `applyHubLadderBlast`) → the hub OWNER (entity, connector, bag arms + its carry);
  · SCORCHED GROUND passive → the perk's seat; SCORCHED EARTH cast → the caster (`racial/scorchedGround.ts`, all 5 arms);
  · Ra column (`racial/raColumn.ts`) → `src.owner` = the caster (perk) AND the Pharaoh's seat (boss);
  · castle gun + 3 raid arms were already seats (S191) — REACH-tested now (raid);
  · ⭐ FOUND: master's S191 overkill CARRY (`severWithCarry`) re-applied the leftover with a `null` attacker, so every fifth the carry felled was TAKEN with no dealer, for EVERY striker (a boss's 150 credited only its first connector). `severWithCarry` gains `carryBy: SeatAttacker | null` (typed so a creature cannot be passed — it would lifesteal twice); all 7 production callers pass the striking seat; a new census case pins them (optional param, so tsc cannot).
  · `{kind:'seat'}` is INERT: retaliation/lifesteal/THE RISEN read `kind === 'creature'` (grep-verified: damage.ts:251/278/348, lifesteal.ts:114).
- **Tests**: NEW `src/state/matchStats.blast2.test.ts` 11 — REACH through `runHostTick` (hub via the real spawner poll + matcher; scorch passive + cast; Ra perk cast; Pharaoh ritual column) and the real `RAID_TARGET` reducer; every case checks conservation (DEALT == victim's TAKEN). Negatives: hub owner's own unit; demon's own unit; Pharaoh's own-seat share is TAKEN not DEALT. Mutations (each → red, restored): hub entity arm → null; carry `carryBy` → null; scorch creature arm → null; Ra entity arm → null; raid carry arg dropped.
- **Gates** on `4b30761` (captured `$?`): typecheck **0** · `vitest run --maxWorkers=3` **0** (476 files passed / 4 skipped; **7295 passed** / 11 skipped) · build **0**.
- **Bundle**: entry **1040.6 KiB** (1,065,547 B) vs master `71abc27` measured the same way **1034.7 KiB** (1,059,553 B) → **+5.9 KiB** (the board's eager shim + recorder; BLAST-2 itself ~0). Headroom **59.4 KiB** — build prints the S101 "raise the charter" warning (shared headroom). `npm ci` ran after the merge (pixi-filters 6.1.5 from master's lockfile; `node_modules/pixi-filters` present) — the build is not the 1158 KiB double-pixi one.
- **PROTOCOL bump verdict: NONE owed by this branch.** `DamageAttacker`/`carryBy` are call arguments, never serialized; BLAST-2 changes only `World.matchStats` values, which no reducer reads (inert) and which ride the already additive-optional `WorldSnapshot.matchStats?`. S186 test: two shaking builds never disagree about anything either SIMULATES — an older build simply does not compute or show the board.

### MINE — owner questions (one line each, with a recommendation)
- The Pharaoh boss's column credits his SEAT (DEALT/KILLS) — rec: keep; it is that seat's unit.
- A bag popped by the hub blast: its burst credits the BAG's owner (as every bag pop does, S158 A2) — rec: keep.
- ⚠ Edge: in the S178 shrunken-pool cascade (a structure already holding MORE than its pool), the carry re-applies OLD banked damage and the board counts it TAKEN a second time (pre-existing on master's carry) and now DEALT to the breaker — rec: accept (rare; normal hits leave ≤ the hit's own overkill, proven: banked < pool before any non-breaking hit).
- Owner Qs carried from S191/S192 (still flagged, unchanged): `HISTORY_WINDOW_TICKS` 120 · BUILT graph = connectors standing · `towersFell` counts a scrapped/extended recipe · `ARM_MS` 1200 · HELGA not a tower.

### ⭐ THE ONE SEAM — how BLAST-2 unifies with s192/zombies' `KillCredit` (merge owner ruling: KillCredit IS the seam)
Built now as a THIN ADAPTER: `src/state/statCredit.ts` — `StatCredit = { seat, type: CreatureType | null } | null` (KillCredit with `type` widened), `statCreditOf(world, attacker)`; `damage.ts`'s `attackerSeat` is a one-liner through it. NON-sim (only matchStats writers read it). **The fold, when zombies is on master** (also written in the file header):
1. delete `statCredit.ts`; in `racial/killCredit.ts` widen `type` to `CreatureType | null`, add `killCreditOf(world, attacker)` (= `statCreditOf`; its creature arm IS `creatureKillCredit`);
2. `damageEntity` resolves `const blow = credit !== undefined ? credit : killCreditOf(world, attacker)` ONCE at the top; `recordDamage`/`recordKill` read `blow?.seat ?? null`; `damageConnector`/`damageStinkCloud` read `killCreditOf(...)?.seat` — so the zombie boss's explicit death-blast credit reaches the board too (today: credits nobody);
3. ⛔ `riseOnKill` gains `if (credit.type === null) return;` BEFORE the `THE_RISEN_ANY_SEAT_UNIT` lever — Reading A unchanged (null fails `isZombieRacialType`), and the lever-ON reading cannot start raising zombies for castle-gun/raid/Ra/scorch kills. Pass `blow` to `damageCreature` only after that guard exists;
4. `zombieDeathBlast.ts` connector arm: `null` → `{ kind: 'seat', seat: owner }`, and its sever through `severWithCarry(…, { kind: 'seat', seat: owner })` (master's carry rule);
5. re-pin both censuses (zombies' entity site = `null` attacker + explicit credit — a 5th population or count it in `null`); add a zombie-death-blast REACH case to `matchStats.blast2.test.ts`.
Files the fold touches: `statCredit.ts` (deleted), `racial/killCredit.ts`, `damage.ts`, `racial/theRisen.ts`, `racial/zombieDeathBlast.ts`, both `*.callSites.test.ts`, `matchStats.blast2.test.ts`.

### Merge seams for the merge owner
- Both census files are touched by this branch AND zombies — derive the counts on the merged tree, never hunk-by-hunk.
- `severWithCarry` has a 4th param now: any branch adding a `severWithCarry` call gets the census case red until it names a seat (zombies' blast uses a direct SEVER_BOND today — see fold step 4).
- Canon notes (`S191_CANON_NOTES_endstats.md`) updated: the "`null` is left at the Pharaoh … SCORCHED GROUND" sentence is gone.
- BLAST-3 (hub 'drone' vs scorch 'raid' sever causes) untouched — not this branch's.

### NOT DONE
- No e2e run (not asked this round); no live look at the board in a browser (pane serves the main checkout).
- The KillCredit fold itself — by ruling, after zombies is on master.

---


# S191 PROGRESS — `s191/endstats` (owner item 3: end-of-game stats)

Brief: `.claude/plans/S191_BRIEFS/endstats.md`. Rules: `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §4 (+ S189 PDR §4).

## Done
- **Step 0** — `npm ci` in this worktree: `NPM_CI_EXIT=0` (captured `$?`, "added 116 packages, and audited 117 packages in 9s"). Branch `s191/endstats` at `42cc2ee` (master + the S191 plan commit). Progress skeleton committed `66dd0cc`.
- **Step 1** — the search. **THE RESEARCH EXISTS. It was filed as the "END-OF-MATCH STAT BOARD"**, which is why an "end of game" grep misses it. Hits below.

## Step 1 — every hit (path:line)

### A. The research itself (lives ONLY in session transcripts / workflow journals — never written into the repo)
- `~/.claude/projects/<spark>/9a13a4d1-fd1d-481d-b444-12c1625d6e74.jsonl:610` — **S179, 2026-09-15, the owner's ask**: *"look at games like Dota … any really grand strategy or real-time strategy … tower defense games like Legion TD2 … a stat board to show how many units were built by each character, how many buildings or connectors were built, how much damage was done … taken … healed … with even graphs … For now, we'll do like a simplified version."*
- `…/9a13a4d1-…/subagents/workflows/wf_8afd6d5c-769/journal.jsonl` (script `…/9a13a4d1-…/workflows/scripts/spark-endgame-statboard-research-wf_8afd6d5c-769.js`) — **the 3-lane research + synthesis** (631k subagent tokens): lane `research:genre` (LTD2 manual + v3.15/v4.04 notes, Dota 2 Dark Rift + ONE Esports, AoE2 score wiki, SC2 Liquipedia, Civ VI, Total War — all URLs in the journal), lane `research:inventory` (what SPARK tracks), lane `research:design` (house panel pattern), and `synthesis` = **"SPARK — End-of-Match Stat Board, v1 proposal"** (ASCII mock, stat table, storage, protocol verdict, 5 owner questions).
- `…/9a13a4d1-….jsonl:821` — S179 PDR presenting it to the owner; `:2117` "End-of-match stat board v1 — researched, design ready" (approved, carried).
- `…/045e266f-ad5d-42ef-8455-d5b431760d51/subagents/workflows/wf_ede94c48-3f4/journal.jsonl` — **S180 re-run** ("statboard A.0", 1.78M tokens): probes world-counters / free-stats / match-end-ui / damage-attribution / castle-damage + verifiers. `…/045e266f-….jsonl:674` "confirmed my hand counts and found that structure damage threads no attacker at all. Parking it."
- `…/57700746-1a3e-4c9b-9cf9-aac822d2fb2b/subagents/workflows/wf_e207af7f-bcf/journal.jsonl` lane "END-OF-MATCH STAT BOARD — empirical state-discovery (A.0)" — **S181/S182 recon**: the WIN_TRIGGER teardown trap, `scoreByPlayer` is a spendable wallet, `matchPlacings` violates R20 (survivors by seat, not score), `damageConnector` has no attacker, Tier1/Tier2 split, 14 tests owed.
- `…/57700746-….jsonl:946` — **S181 owner**: *"stat board … We had it defined last session or two sessions ago … It's gonna be a whole big session working on end of the game stat board."*
- Owner S191 (relayed by the merge owner): *"how many units were built, how many units were killed of each type … the graphs showing like all the players and how much they have built and like compared to each other."*

### B. In-repo record of it (main checkout)
- `HANDOFF_S179_2026-09-16.md:77, :97, :105` — "research complete, v1 designed, build not started".
- `.claude/session-archive/session-state_S187_2026-09-23.json:725` (priority "End-of-match stat board v1", `carry_reason` "research + v1 design COMPLETE and recorded"), `:900`, `:2444` ("its own big session later").
- `S180_BACKLOG.md:131-137, :196` — the recon summary (tracks none of the five stats; finishing order computed, consumed by a log line; TAKEN cheap; DONE 14 sites; structure damage no attacker; one line of text).
- `S182_BACKLOG.md:27` (no v1 design DOCUMENT exists), `:59` (P6 Tier 1 + ⛔ THE TRAP), `:70` (B2 "what goes on it" — now answered by his S191 words), `:108`.
- `HANDOFF_S180_2026-09-17.md:22, :107`; `HANDOFF_S181_2026-09-17.md:114`; `HANDOFF_S182_2026-09-18.md:73, :99`; `.claude/plans/2026-09-19_PDR_S183_BATCH.md:58`; `STRUCTURE_EXTENSION_DESIGN.md:122` — deferral lines.
- `src/state/elimination.ts` docblock (~:155-162) — "the postgame board off `matchPlacings` … render-only when it comes".
- Adjacent, NOT the stat board: `SPARK_Blueprint.md:130, :536` + `SPARK_v0.6_DESIGN.md:278` + `BACKLOG.md:1198` (v0.6 "Endgame Ceremony + trophy mint" — a 28 s cinematic, different feature); `.tmp-gates/research/W2.json` (Dota talents / AoE4 / LTD2 legion spells — the S187 upgrade-draft research, not end stats); `.claude/plans/2026-09-16_PDR_S180_CHARACTER_SHEETS.md:45-48` (SC/AoE unit panels, not end stats).

### C. Memory folder + BRAIN
- `~/.claude/projects/<spark>/memory/` — **zero hits** (grep exit 1 = no match; benign, verdict recorded).
- `Founder DNA/BRAIN/` — **no stat-board research**. Only unrelated "endgame"/"red alert" words (estate governance, parking plan). `data_collection/PC_DEEP_SCAN.json:237` lists *Command and Conquer Generals* installed — context for his taste, not research.

- **Step 2 — the spec**: `.claude/plans/S191_ENDGAME_STATS_SPEC.md` (98 lines), written from the record + his words after
  re-verifying the recon against the CURRENT tree. Deltas vs the S179-S181 record: attacker attribution now EXISTS
  (`DamageAttacker`, S183 retaliation / S188 lifesteal) so DEALT is no longer an 18-site refactor; the Council item (S191)
  on history-through-migration is answered in §3 with a stated deviation (no new NetMessage).

- **Slice 1 — the recorder + its four sites.** NEW `src/state/matchStats.ts` (types, writers, `sampleBuilt`, wave sample,
  serialize / net trim / apply / hash parts). `World.matchStats` (worldTypes), factory (`makeWorld`), resets
  (`applyStartGame`, `applyReturnToTitle`, `softReset`), final sample in `WIN_TRIGGER` before teardown (host-only),
  `save.ts` (field, emit, net trim, core seats, restore=full history, applyNetSnapshot=keep-or-replace),
  `stateHashFull.ts` (`matchStats: 'hashed'`, `ms`/`mh` parts) + its family-test row. Tests: `matchStats.test.ts` 13/13;
  `stateHashFull.test.ts` 26/26; `save.test.ts` 44/44; typecheck exit 0.

- **Slice 2 — the hooks + attribution.** `DamageAttacker` gains `{kind:'seat'}` (inert: retaliation/lifesteal/Risen test
  `kind === 'creature'`; `lifesteal.ts`'s restated type follows). `damageEntity` records applied damage in every arm +
  kills (`died && before > 0`); `damageConnector` banks in full minus the broken bond's thrown-away remainder; radial
  forwards `sparePlayerId` as a seat; seats passed at `castleGuns.ts`, the 3 raid arms (`world.ts`), `suicideBlast.ts`
  and `powerOfRa.ts` connector passes. Mints: 3 `recordUnitBuilt` in `applySpawnCreature`. Towers: register defender /
  spawner; fell at `destroyDefender`, the Helga-killed arm, and `awardSpawnerKillReward` (the spawner destruction
  event — ⚠ moved there from `hostTick.ts` because the frozen S119 differential D5 went red: the reference calls the
  shared helper, not the new tick body). `markFallenSeats` stamps the wave. Wave edge: one line after
  `waveNumber += 1`. Census tests re-pinned (4 populations). Tests: `matchStats.reach.test.ts` 8/8; worker
  differential + seeded-stats assertion 7/7; hostTick differential/replay 18/18. ⭐ Mutation: removing the kill hook
  turns 2 reach tests red (restored).
- Full suite at the slice-2 midpoint: 1 red (D5, above) → fixed; re-run pending at the gates step.
- ⚠ Benign, recorded: vitest rewrote `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` with LF
  endings (git shows `M`, `git diff` empty after autocrlf) — restored with `git checkout --`.

- **Slice 3 — R20 placings.** `matchPlacings` now implements R20's unbuilt second half (*"remaining places are then
  ordered by score"*): the crowned seat leads the survivors, the rest by score desc, seat id settles ties; the fallen
  keep reverse-elimination order. +3 tests in `elimination.test.ts` (50/50 with gameState). Mutation: dropping the
  score comparator turns the R20 test red (restored). ⚠ REPORT: this is a live R20 violation the recon found in S181;
  its only prior consumer was a `console.info` line.

- **Slice 4 — the board MODEL.** NEW `src/render/matchBoardModel.ts` (pure; POSTGAME-only; rows by `matchPlacings`,
  seat labels `P n`/`BOT n`, OUT + wave, per-type lines, SCORE + BUILT graph series, `noStats` for an older host).
  Tests `matchBoardModel.test.ts` 8/8 — ⛔ the REACH case plays a real match (castle-gun kill, a tower, a wave edge)
  through `runHostTick`, wins through `tickGameState` INCLUDING the 2 s dwell, and asserts a non-empty board on the
  host AND an identical board on a peer fed only the POSTGAME snapshot; a source-text tripwire pins that the model
  never reads the four families the teardown empties. Mutation: dropping the WIN-edge sample turns 2 tests red.

- **Slice 5 — the view + wiring.** NEW `src/render/matchBoard.ts` (Pixi; scrim + plate; headline; 8-column table with
  bar-in-cell; per-type breakdown of the hovered/your/winner row; SCORE + BUILT graphs as moveTo-started polylines;
  trust line; CONTINUE armed after `ARM_MS`; primary button only; single-source `matchBoardLayout`). `main.ts`: import;
  construction + staging line after the draft panel / before the cruiser lift + a ticker `render`; POSTGAME block —
  `resetIfPostgame` waits for `isArmed`, the canvas click is ignored while `isShowing()`. `ui.ts`: the win banner is
  WIN-only (its POSTGAME "click or press R to reset" would now be false). Tests `matchBoard.test.ts` 6/6 (+ the
  staging guard `s189CruiserAboveDraft.test.ts` 11/11).

- **Slice 6 — bundle, Helga, measurements.** Gates on the slice-5 tree: typecheck 0, vitest 0 (6502 passed / 2
  skipped), build 0 — but the entry chunk measured **+12.4 KiB** (base `42cc2ee` 955.9 KiB → 968.3; measured by
  checking the base `src` out, `vite build` + `check-bundle-size`, and restoring) — OVER the 10 KiB budget. Fixed the
  codebase's way: the view + model are a LAZY chunk behind NEW `src/render/matchBoardHost.ts` (fetched when a match
  starts; answers "no board" until it arrives). Entry now **961.2 KiB = +5.3 KiB**; lazy `matchBoard-*.js` 7.91 kB /
  3.53 kB gzip. Guard: `main.ts` must not import `matchBoard.ts`/`matchBoardModel.ts` statically. Self-audit found
  HELGA counted as a tower (she re-summons every BUILD → one hall = a new tower + a fall per wave): excluded at both
  sites, test added. Wire MEASURED (`matchStats.wire.test.ts`, 4 seats × 8 types × 30 waves): totals 1,527 B /
  snapshot; with history 6,765 B (~20 snapshots a wave).

- **Final gates** on `2939336` (captured `$?`, never the wrapper): `npm run typecheck` **0** · `npx vitest run
  --maxWorkers=4` **0** (401 files passed / 1 skipped; 6506 tests passed / 2 skipped) · `npm run build` **0** — entry
  **961.2 KiB (984,286 B), +5.4 KiB** over base `42cc2ee` (978,794 B); headroom 138.8 KiB; lazy `matchBoard-*.js` 7.91 kB.
  No e2e (brief). ⚠ NOT DONE: no LIVE LOOK at the board — the browser pane serves the main checkout, not this worktree.


## S192 — merge master + self-audit (agent `s191-endstats`, branch tip below)
- `git merge master` (base 42cc2ee → master e4d52dc, 123 commits): ONE conflict, `src/state/damage.ts` Helga kill arm.
  Took master's DORMANT body (R190-J), dropped endstats' `world.defenders.delete`, rewrote the S191 comment
  (her damage is on the board; her fall is neither a kill nor a tower fall). Merge commit `513a160`.
  defenderLifecycle.ts merged textually clean (both imports kept). No plan/state/handoff conflicts arose.
- SEAMGATES-1 applied: `matchStats.reach.test.ts` Helga case re-pinned to `state === 'DORMANT'` + `ehp === null`;
  NEW case through the REAL matcher + two phase edges (hall ignites → FIGHT → killed by a seat → BUILD revives
  her IDLE): towersBuilt 0, towersFell 0, no unit kill, damage credited. 10/10.
- Recorder vs master's new events, by enumeration (grep of every defenders/spawners create/delete + record* site):
  · DORMANT Helga — excluded (register skips 'princess'; `destroyDefender` skips 'princess'; `reviveDormantHelgas`
    mutates in place, never registers). CONFIRMED + tested.
  · orphan raze (`razePrimitives(..., true)` in hostTick hub/T9 arms) — deletes primitives only; reaches the board
    via `sampleBuilt` (connectors standing) — no counter to double. The tower's fall is still the one
    `awardSpawnerKillReward` edge. OK.
  · C2 survival rule (`towerStandsAt`) — changes WHEN a recipe breaks, not the destruction path; fall recorded at
    the same two sites. OK.
  · per-match reset — `resetMatchStats` at applyStartGame, applyReturnToTitle, softReset; a client gets START_GAME
    from START_GAME_SIGNAL; POSTGAME exits to TITLE (teardownNet), so no in-session rematch carries history.
    The net-keep rule (history absent ⇒ keep) cannot show a stale board because WIN_TRIGGER always samples on
    the host and history always rides in WIN/POSTGAME. Verdict: no defect.
- Four-sites self-audit: factory (`makeWorld`) · serialize (snapshot/restore/netSnapshot trim/applyNetSnapshot) ·
  hash (`stateHashFull` ms/mh) · worker (restore on INIT; mirror fed by worker netSnapshot; gameState is in the
  structural signature so WIN/POSTGAME force a snapshot; differential seeded-stats assertion green). No gap.
- Click hazards re-read: canvas click ignored while the board shows; CONTINUE/R refused for ARM_MS; a CONTINUE tap
  followed by the DOM click finds TITLE and no-ops; if the lazy chunk failed the old click-reset still works.
  ⚠ Stale comments (merge-owner chore, not code): `main.ts` ~:2961 "canvas click → resetIfPostgame" and ~:3683
  "POSTGAME returns on a click".
- Gates on the merged tree (captured `$?`): typecheck **0** · vitest --maxWorkers=3 **0** (417 files / 2 skipped;
  6749 passed / 7 skipped) · build **0** — entry **978.1 KiB** (1,001,571 B; master 972.7 → **+5.4 KiB**),
  headroom 121.9 KiB; lazy `matchBoard-*.js` 7.91 kB (3.54 kB gzip).
- PROTOCOL bump verdict: **none owed by this branch.** `WorldSnapshot.matchStats?` is additive-optional and inert
  (no reducer reads it); `{kind:'seat'}` DamageAttacker is never serialized (call-arg only).

## In flight
- _nothing_ — report sent to the merge owner.

## Next
- The merge owner's audit; fix only what it sends back.

## Decisions
- Branch taken: **2a (implement)**, on the merge owner's redirect — the research + a v1 proposal exist; his S191 words answer the one open question (B2 "what goes on it").

## Numbers that are MINE
- `HISTORY_WINDOW_TICKS = 2 × PHYSICS_HZ` (matchStats.ts) — how long the whole history rides the net snapshot after each sample.
- The BUILT graph = connectors standing (`sampleBuilt`) — the lever if he wants a different line.
- `towersFell` includes a tower its owner scrapped/extended (the sim does not record who broke a recipe).
- `ARM_MS = 1200` (matchBoard.ts) — how long the board is up before CONTINUE / R may leave it.
- HELGA is not a tower on the board (register + destroy sites skip `'princess'`).

## Hotspot hunks
- `src/state/worldTypes.ts` — one import line + the `matchStats` field block (after `scoreByPlayer`).
- `src/state/save.ts` — one import; `WorldSnapshot.matchStats?` block; one emit line in `snapshot()`; one trim line in
  `netSnapshot()` (after the spawner strip); one apply line in `applySnapshotCore` (after `scoreByPlayer`); one line each
  in `restore()` and `applyNetSnapshot()`.
- `src/state/stateHashFull.ts` — one import; the `matchStats: 'hashed'` entry; one `parts.push` after the scores.
- `src/main.ts` — one import; the board's construction/staging block (3 lines + comment) between
  `app.stage.addChild(draftOverlay.container);` and `avatarRenderer.bringLocalToFront();`; the POSTGAME block
  (`resetIfPostgame`'s condition + the canvas click listener).
