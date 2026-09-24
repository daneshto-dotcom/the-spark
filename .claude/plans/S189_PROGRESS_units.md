# S189 PROGRESS — `s189/units` (worktree agent `s189-units`)

Brief: PDR §5.2 / P7 of `.claude/plans/2026-09-24_S189_BATCH_PDR.md` — C3 Voltkin, C8 Helga,
C10 Kraken + four sim LOWs (a corpse-eater latch, b castle regen of effective max, c serialized
`nextCreatureId`, d spawn-queue gap). Branch `s189/units` off `15035b9` (deploy #2, PROTOCOL 50).
Order: C3 → C8 → C10 → LOWs, one commit each. Never push. Never touch PROTOCOL_VERSION / canon.

## Status

| step | state | commit |
|---|---|---|
| 0 · progress skeleton | done | 550c765 |
| C3 · Voltkin prefers enemy structures | done — GUARD ONLY, no production change (see C3 below) | 36e3386 |
| C8 · Helga patrol clamped to the board | done | 82b4040 |
| C10 · Kraken sonar short knockback + stun | done | 37929de |
| LOW a · corpse-eater bite latch | done | e594e88 |
| LOW b · castle regen of effective max | done | 7c1036c |
| LOW c · serialized nextCreatureId | done | a026902 |
| LOW d · spawn-queue gap outside runHostTick | done | 58fa5fc |
| final gates | done — tsc 0 · vitest 0 (6029 / 373) · build 0 (945.1 / 1100 KiB, +0.9 KiB) | 58fa5fc |
| BRIEF COMPLETE — report sent to the merge owner; nothing in flight | | |

## C3 — what was measured (the merge owner should read this before merging)

⛔ **THE REPORTED BEHAVIOUR DOES NOT REPRODUCE IN THE SIM.** Run, not read:

1. `findNearestBondTarget` (Voltkin passes `enemyOnly: false`) keeps own bonds strictly as a
   FALLBACK — `bestEnemyId ?? bestOwnId`: an enemy connector 1100 px away beats an own one 30 px away.
2. `voltkinChainFrom` hops are enemy-only (`isEnemyBond`, creature owner compare).
3. The brother's board through the real host tick (Voltkin seat 0 at x 360 beside two seat-0
   buildings, six seat-1 buildings at x 1400): 0 ticks aimed at an own bond, 0 own connectors
   touched, the Voltkin crosses to x > 1200 and damages 22 enemy connectors in its 20 s life.
4. The FULL production summon path (seat 1 stamps the Voltkin blueprint → `runGodlyMatcherCore`
   fires with `triggererPlayerId` 1 → `tickWorkerCinematics` schedules `pendingCreatureSpawn` →
   `SPAWN_CREATURE` → FIGHT): the Voltkin is owned by seat 1 and every target it takes is seat 0's.

So the Voltkin can attack its own buildings ONLY through the fallback, i.e. only when EVERY bond on
the board reads as its owner's colour (`placerColor` vs the owner's live `player.color`). Checked
and ruled out as causes of that: players are never deleted mid-match (only on title-return,
`gameMode.ts:553`); every primitive is born with `placerColor = player.color` (placePrimitive,
blueprintBuild, structureRepair); auto-bond is same-colour only; the lobby resolves race-colour
collisions (`resolveRosterRaceCollisions`); nothing writes `creature.ownerPlayerId` after birth.

**Two candidate explanations for what he saw, both OUTSIDE this brief's layer — for the merge owner:**

- **(most likely) CREATURE-FIRST PINNING, which is shipped behaviour (S103 #8), not a targeting
  bug.** A Voltkin with an enemy unit inside its 180 px `attackRange` zaps the unit before its
  building target. Measured through the real host tick: with enemy goblins arriving at its base every
  2.5 s it spent **1199 of 1199** life ticks at home (x < 700), zapping raiders on 688 of them, and
  never reached the enemy; its OWN buildings took damage — from the raiders. With a single raid it
  kills them and marches on (reached x 1273 by tick 650). From across the board that reads exactly
  as *"he just started attacking the buildings around him"*: the bolts land among his own buildings
  and his buildings lose health. Whether a Voltkin should IGNORE raiders and march is an owner call
  (it would reverse S103 #8 for the Voltkin and interact with R183 retaliation) — NOT changed here.
- **(unverified) an upstream seat/colour attribution fault** — if some path ever stamps a shape
  with another seat's colour (C6's quick-match seat swap is the only live report in that area), the
  Voltkin's fallback would fire exactly as described. Belongs to `s189/net`; not investigated further.

**Shipped in this commit:** `src/state/creatures/voltkinEnemyFirst.test.ts` (5 cases) — the
preference arithmetic, the brother's board through the real host tick, the chain never jumping onto
own, the real summon path's ownership, and the zero-enemy fallback (negative). ⭐ MUTATION-TESTED:
replacing `bestEnemyId ?? bestOwnId` with "nearest bond of either owner" turned 3 of 5 red
(preference, host-tick board, summon path); restored with Edit (no EOL flip — `git diff` empty).

Protocol: C3 changes NO rule and NO wire field → owes no bump.

## C8 — Helga's patrol stays on the board

**Why her path bypassed the creature clamp:** `defenders/defenderMotion.ts` is a hand MIRROR of
`creatureVerletStep` and was deliberately left unclamped — `creatureVerlet.ts`'s docblock said
*"she is held by her HUB LEASH … so she has no path to an edge"*. S183's patrol made that false: IDLE
walks her to a derived point up to `attackRange × PRINCESS_PATROL_RADIUS_FRAC` = 380 × 0.35 = 133 px
from her hub in any direction, and seat 0's keep sits at x 120 (`zones.ts` ANCHORS). Measured on
master through the real host tick with a hall stamped at the legal site nearest the touchline beside
the keep: **616 of 1500** sampled positions off the board.

**Fix (two halves, both the creature bounds `WORLD_EDGE_MARGIN` / `CANVAS_* − WORLD_EDGE_MARGIN`):**
- `defenderVerletStep` now calls `clampIntoPlayfield(d.pos, d.prevPos)` — the same function every
  creature uses, prevPos moved with pos (no fling). No-op on the board → byte-identical otherwise.
- the patrol POINT is clamped (`clampPointIntoPlayfield`, new, in `defenderMotion.ts`) so she walks
  to a reachable spot and snaps there instead of pressing the edge for the rest of the leg.
- stale docblock in `creatureVerlet.ts` corrected (it listed Helga as a deliberately-unclamped
  integrator).

**Tests:** `src/state/defenders/helgaOnTheBoard.test.ts` (4) — REACH through the real host tick
(real stamp + real matcher, 10 legs, 0 positions and 0 destinations off-board, she reaches the
margin), the point-clamp arithmetic, the integrator half (pressed, never flung), and a negative
(an open-ground hall never nears an edge and still roams). ⭐ MUTATION-TESTED three ways: both clamps
removed = master → REACH red (616 off-board); integrator clamp removed → integrator case red;
patrol-point clamp removed → REACH red (600 off-board destinations). Restored; content verified
identical to the pre-mutation copy. Full suite after C8: **vitest 0 — 6005 / 369**; tsc 0.

Protocol: **no bump owed.** Defender motion runs only inside `runHostTick` (host + worker, same
build); clients render Helga from snapshots. No new field; `walkTargetPos`/`pos` values change only
where they used to leave the board.

## C10 — the Kraken sonar: a short knockback, held to the board, and a stun

**The defect, measured:** `KRAKEN_SONAR_KNOCKBACK = 26` was applied as a `prevPos` offset, i.e. a
velocity of 26 px PER SUBSTEP (12,480 px/s). A stunned unit coasts (stun gate 2 = `ZERO_ACCEL`,
`creatureDamping` does not brake a stunned unit) at `VELOCITY_DAMPING` 0.998/substep for 960 substeps,
so it travels ≈ 425.8 × the offset ≈ 11,000 px — stopped only by the board clamp. The docblock
claimed *"roughly a body-length and a half"*: a distance used as a speed.

**Fix:** `KRAKEN_SONAR_KNOCKBACK` DELETED (not re-meant, so stale readers fail to compile);
`KRAKEN_SONAR_KNOCKBACK_PX` = `2 × GOBLIN_ATTACK_RANGE` = **70 px** (⚠ MINE) lives in
`bossSkillsKraken.ts` (it cannot live in `constants.ts`: `GOBLIN_ATTACK_RANGE` is declared ~150 lines
later there → TDZ); `KRAKEN_SONAR_SHOVE_PER_SUBSTEP` = D / Σ_{k=1..960} 0.998ᵏ ≈ 0.1644 px/substep,
built by repeated multiplication at module load (no `Math.pow` on a sim-feeding value);
`applySonarShove(v, ux, uy)` is the one shove, used by the runner and by the corpse-eater F1 test.
The board hold is the integrator's existing `clampIntoPlayfield`. The stun already ran through
`applyStun` (the `stunGates.test.ts` system) — unchanged, 2 s (⚠ MINE, S169's number, left alone).

**Tests (bossSkillsKraken.test.ts, +4):** the arithmetic (sum × impulse = 70; real integrator coasts
70.000000); REACH through the real host tick (a unit in the cone is stunned and slides 70 ± 10 %,
pushed away, never off-board); AT THE EDGE (shoved at the touchline → held, ends pressed exactly at
the margin); negative (a unit behind the Kraken, at rest, does not move at all). ⭐ MUTATION-TESTED:
restoring the 26 px/substep impulse turned 3 red (arithmetic, REACH, corpse-eater F1); restored
byte-identical (`cmp`).

**Re-pinned, not relaxed:** `corpseEater.test.ts` F1 staged the sonar with a COPY of the old shove
(`prevPos.x -= KRAKEN_SONAR_KNOCKBACK`) and asserted the boss was flung `> 3 × leash` (180 px). It now
calls `applySonarShove` and asserts the anchor moved `≈ KRAKEN_SONAR_KNOCKBACK_PX` (measured
**70.0000000000773** through the real host tick) and `> CORPSE_EATER_LEASH_RADIUS` — plus a fixture
guard that 70 > 60, because if the shove ever drops inside the leash, F1's re-anchor becomes
unreachable by a real Kraken. Stale "~26 px/substep" docblock in `corpseEater.ts` corrected.

Full suite after C10: **vitest 0 — 6009 / 369**; tsc 0.

Protocol: **no bump owed.** The sonar runs only inside `runHostTick` (host + worker, same build);
`prevPos` is off the wire (S182) and clients render snapshot positions. No new field, no new
discriminant. ⚠ Stale owner-facing doc for the merge owner: `BOSS_STATS_TABLE.md:57` still says
*"knocks back 26 px"* — now 70 px of slide (not edited: outside my file boundary).

## LOW (a) — CORPSE EATER's bite clock latches rage per cycle

**Defect:** `feedStep` computed `cadence = round(attackCadenceTicks / rageMultiplier(boss))` from the
LIVE `enraged` bit every tick — the class deploy #2's F3 closed for the FSM with `attackCycleRaged`.
Measured through the real host tick (by the mutation): calm → raged after the calm bite bit again
**29** ticks later (should finish the calm swing: 59); raged → calm on the raged fire tick bit AGAIN
**1** tick later (a second bite in one swing).

**Fix:** the feed clock reads `attackCycleMultiplier(boss)` (the F3 latch) and latches
`attackCycleRaged` from `enraged` on the cycle's first tick (`ticksInState === 0` — this clock starts
at 0 on engaging, the FSM's at 1). The modulo of the ENDING cycle uses its own latched cadence.
Movement (`corpseEaterOwnStepPx`) still reads the live bit, as every creature's does.

⚠ **LATENT IN PRODUCTION:** the only `enraged` writers are `runWarlordRage` (orc boss only) and
BLOOD FRENZY (`isOrcRacialCreatureType`: race unit / orc tier-3 / orc boss), so nothing that ships
enrages a zombie boss. The test sets the bit as a fixture.

**Tests:** `src/state/racial/corpseEaterRageLatch.test.ts` (4) — arithmetic, a negative (no flip →
every gap = 60), and two REACH cases through the real host tick (the 59 and the no-double-bite).
⭐ MUTATION-TESTED (live bit restored → exactly those two red: "expected 29 to be 59", "expected 1 to
be greater than 1"); restored byte-identical. vitest 0 — **6013 / 370**; tsc 0.

Protocol: **no bump.** `attackCycleRaged` is already serialized and hashed (F3, deploy #2); the feed
clock is host-only. No new field or site.

## LOW (b) — castle regen is a percent of the seat's effective max

**Defect:** `castleRegenTick` capped at `castleMaxHpFor(castleUpgrades)` (S187) but the RATE,
`castleRegenPerSecond(level)`, was `CASTLE_MAX_HP × pct` — the flat 2,500. R128 is "% of max".

**Fix:** `castleRegenPerSecond(level, maxHp = CASTLE_MAX_HP)`; the tick passes the seat's
`castleMaxHpFor`. The default keeps every one-argument caller — `canon.test.ts:244`'s 25/30/35/40/45 —
unchanged (I may not edit the canon test, so the signature had to stay compatible). The percent is
now held in integer TENTHS (`8 + 2·L`, derived from the two constants) with one half-up division:
at 2,500 every level was exact, but at 2,750 level 5 is 49.5 and a float product is not guaranteed
to land on the half.

⭐ **OWNER RULING R190-C (relayed by the merge owner after this commit): this IS his rule** — *"your
regen is based on the current health … upgraded total."* Canon notes updated to cite it as his, not
mine. Consequence: buying HP buys regen too — one wave-1
HP point at regen level 1 is 28 HP/s instead of 25; at level 5, 50 instead of 45.

**Tests:** `src/state/castleRegenEffectiveMax.test.ts` (4) — arithmetic (base ladder unchanged with and
without the argument, 2,750 → 28 / 50, whole HP across pools), REACH through the real host tick after
the REAL purchase reducers (`UPGRADE_CASTLE_STAT` hp + `UPGRADE_CASTLE_REGEN`), a negative (an
un-upgraded keep regains exactly 25), and the ceiling (stops exactly at its own max). ⭐
MUTATION-TESTED (flat pool passed again → REACH red, "expected 25 to be 28"); restored byte-identical.
vitest 0 — **6017 / 371**; tsc 0.

Protocol: **no bump.** Regen runs only inside `runHostTick`; `castleHp` rides the existing field; no
client computes a rate (the castle panel shows the level, not a number).

## LOW (c) — `nextCreatureId` is serialized and monotonic (Council M2 fix shape)

**Defect:** `applySnapshotCore` set `nextCreatureId = max(LIVE id) + 1`, so when the highest-id
creature had died, a save/restore, a `?worker=1` adoption (its INIT is `snapshot()` → `restore()`)
or a host migration (the successor applies the last NetSnapshot) minted the dead creature's id
again. Measured by the mutation: after a real castle-gun kill through the host tick the restored
world minted id **1** — an id that had existed before the save — instead of **3**.

**The four sites, as they stand after this commit:**
- factory: `world.ts:437` `nextCreatureId: 0` — already existed;
- hash: `stateHashFull.ts:143` (`'hashed'`) + `:499` projection — already existed;
- **serialize (NEW, save.ts hotspot):** `WorldSnapshot.nextCreatureId?: number` (additive-optional,
  NOT omitted from `NetSnapshot` on purpose — a migration successor is a client until promoted);
  emitted by `snapshot()` ONLY when the counter is ahead of `rederivedNextCreatureId(live ids)`
  (new exported pure helper) — so every pre-S189 save and any board with no dead id above the
  survivors stays byte-identical; read in `applySnapshotCore` as `max(serialized, re-derived)`
  (integer-checked) — an absent field is exactly the old derivation, a stale low value is ignored;
- worker: rides `save.ts` (INIT save + `netSnapshot` mirror) — no worker file touched.

**Tests:** `src/state/creatureIdCounter.test.ts` (7) — arithmetic; REACH (a real kill through the
host tick → save/restore mints the counter; a NetSnapshot-applying successor holds the host's
counter); NO COLLISION (three post-restore mints, none ever existed before the save); negatives
(byte-identity: key absent when the derivation is right, for both `snapshot` and `netSnapshot`; an
old snapshot without the key → the derivation; a serialized value below a live id → ignored).
⭐ MUTATION-TESTED (reader dropped → 3 red: "expected 1 to be 3", "id 1 was minted before the
save"); restored byte-identical. vitest 0 — **6024 / 372**; tsc 0.

**Protocol:** additive-optional wire field → by the project rule **no bump owed**. Only the host
mints; an old client ignores the key; an old successor re-derives (the old behaviour) — no two
builds disagree about anything either computes. ⚠ The merge owner may still fold it into a train's
bump docblock as a documented wire addition.

## LOW (d) — the racial spawn queue drains at the boundary a save lands on

**The spawn queue** is S188's `queueAfterStrike` / `drainRacialSpawnQueue` (Council A5): a
module-level `WeakMap<World, closures>`, never serialized, documented as *"empty at every tick
boundary by construction"*. **False for two producers:**
- OUTSIDE `runHostTick`: the host applies a remote INTENT with `dispatch` on arrival
  (`hostHandlers.ts` / main's `applyRemoteIntentAuthoritatively`, the worker's posted intents, and
  the host's own local actions). A `RAID_TARGET` that kills a demons.l5 seat's chewer queues
  HELLSPAWN's two children, which waited for the next tick's drain;
- INSIDE `runHostTick` but AFTER its post-sweep drain: the bots act after it.

A save in the gap is reachable: a NetSnapshot on a render frame that ran zero ticks (any display
above 60 Hz), the `?worker=1` adoption INIT (`snapshot()`), a migration successor's last snapshot.
Measured by the mutation: the save held the dead parent and **no** children (the split was lost),
and a `restore()` of an older save into the SAME world kept the stale closure — the next tick
spawned two phantom children of a live parent (**3** chewers where 1 stands).

**Fix — "drain at the boundary", closure API unchanged** (so the unmerged S188 racial branches that
call `queueAfterStrike(world, () => …)` keep compiling):
- `src/state/racial/spawnQueue.ts` (NEW leaf module, type-only imports): the queue moved here,
  plus an in-host-tick window (`beginHostTickSpawnWindow` / `endHostTickSpawnWindow` — the latter a
  FINAL drain), a re-entrancy guard, and `drainRacialSpawnQueueOutsideHostTick`;
- `racialTick.ts`: its queue body replaced by a re-export of the same three names; the false
  docblock paragraph corrected; the slot lines untouched;
- `hostTick.ts`: `beginHostTickSpawnWindow(world)` as `runHostTick`'s first line,
  `endHostTickSpawnWindow(world)` as its last (no early returns in the function — checked);
- `world.ts`: `dispatch` is now a thin wrapper (depth counter, `try/finally`) around the renamed
  `dispatchReducer`; a TOP-LEVEL dispatch that returns outside a host tick drains. Inside the tick
  the hook is silent, so the strike batch keeps A5's post-sweep ordering exactly.

⚠ Semantics that moved (deterministic, same in live play and in any replay of the same actions): an
out-of-tick RAID's HELLSPAWN children are born at the raid, not after the next tick's sweep; a bot's
are born at the end of its own tick. In-batch spawns are unchanged.

**Tests:** `src/state/racial/spawnQueueBoundary.test.ts` (5) — REACH with a save mid-gap (production
intent path: `dispatch(RAID_TARGET)` between ticks, then `snapshot` → a fresh world holds both
children); REACH same-world restore (no phantom split); negative (inside a window a top-level
dispatch does NOT drain; the window end does); control (outside, FIFO, once); invariant (every real
host tick in a raiding fight ends with 0 queued). ⭐ MUTATION-TESTED (hook dropped → 3 red:
"expected 1 to be +0", "expected 3 to be 1", "expected [] to deeply equal [1,2]"); restored
byte-identical.

Gates: **tsc 0 · vitest 0 — 6029 / 373 · build 0 — 945.1 / 1100 KiB** (base 944.2 → +0.9 KiB).

Protocol: **no bump.** Nothing new is serialized; the queue stays off the wire. The rule moved is
host-only (only the host kills a chewer by RAID and spawns; clients never drain).

⚠ **For the merge owner:** `world.ts` is not on the hotspot list but is central, and this adds a
wrapper around `dispatch`. Any branch that edits the `export function dispatch(` line itself will
conflict textually (the body is untouched).

## Decisions

- C3: no production change. The owner's rule ("own buildings only once every enemy building is
  gone") is already the code; a targeting change would be fixing the wrong layer. Guarded instead.

## Numbers that are MINE (not the owner's)

| constant | value | where | why |
|---|---|---|---|
| `KRAKEN_SONAR_KNOCKBACK_PX` | 70 px (`2 × GOBLIN_ATTACK_RANGE`) | `bossSkillsKraken.ts` | *"a little bit"* — two melee arms: out of a melee unit's reach, well inside the 260 px wave |
| `KRAKEN_SONAR_STUN_TICKS` | 120 (2 s) | `constants.ts` | S169's number, re-confirmed and left alone; he ruled THAT it stuns, not how long |

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

`save.ts` only (LOW c), four self-contained hunks, no refactor:
1. `WorldSnapshot` — new optional field `nextCreatureId?: number` + docblock (after `creatures?`).
2. new exported pure `rederivedNextCreatureId(ids)` just above `export function snapshot(`.
3. `snapshot()` — one emitted key after `creatures:` (undefined unless ahead of the derivation).
4. `applySnapshotCore` — one `max(...)` block right after the existing creature re-derivation.
No change to `stateHashFull.ts` (already hashed), `worldTypes.ts` (field exists) or `main.ts`.

## Wire / hash / shared-rule changes (for the merge owner's bump decision)

- C3: none.
- C8: host-only motion rule (Helga clamped to the board); no field, no bump.
- C10: host-only rule (sonar impulse size); `prevPos` is off the wire; no field, no bump.
- LOW a: host-only feed clock now reads the existing `attackCycleRaged` latch; no new field; no bump.
- LOW b: host-only regen RATE now a percent of the seat's effective max; no new field; no bump.
- LOW c: NEW additive-optional wire/save field `nextCreatureId?` (emitted only when the live-id
  derivation would under-state it); already in the wide hash; no bump owed (additive-optional,
  host-only minting).
- LOW d: nothing serialized; host-only drain timing; no bump.

## Creature-birth touches (s188/draft-atk merges after this branch)

**None.** No edit to `makeCreature`, `makeVoltkinCreature` or `applySpawnCreature`. Nearest touches:
`applySnapshotCore`'s counter block (LOW c, after the creature rehydrate loop) and the racial spawn
queue's drain timing (LOW d, `spawnQueue.ts` / `dispatch` wrapper) — neither changes how a creature
is built.

## Failed commands and their verdicts

- probe `zzProbeVoltkin.test.ts` (scratch, deleted) — `TypeError: Cannot read properties of undefined
  (reading 'aId')`: RULED BENIGN — my probe's logging read a bond the Voltkin had just severed; the
  sim was fine and the probe was rewritten into the committed test.
- `voltkinEnemyFirst.test.ts` under the deliberate mutation — EXIT 1, 3 failed: EXPECTED (that is
  the mutation test); restored, EXIT 0.
- C8 mutation via `sed -i` — no match (EXIT 0 on the unmutated run, so the "mutation" run was a
  no-op): INVESTIGATED AND RESOLVED. git-bash `sed -i` did not match the CRLF lines AND rewrote both
  files as LF. Mutations redone with Edit; CRLF restored byte-safely (python binary mode); content
  diffed against the pre-mutation backups (identical) and `file` reports CRLF again.
- helgaOnTheBoard.test.ts under the three deliberate mutations — EXIT 1 each: EXPECTED.
- After every FULL `npx vitest run`, `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap`
  shows as modified: RULED BENIGN — `git diff` shows NO content change; vitest's snapshot writer
  re-serialises the CRLF working copy as LF (autocrlf). Reproduced twice; restored with
  `git checkout --` each time, never committed. (The agent was also killed once mid-C10 by the org
  spend limit — resumed from this file; `git status` was clean at 82b4040.)
- C10 first inline-heredoc patch — `bash: unexpected EOF while looking for matching ''`: RESOLVED —
  shell quoting in a long inline heredoc; the test block was written with the Write tool and applied
  by a python script (binary mode, CRLF preserved). Nothing had been written.
- C10 new tests, first run — 2 failed: INVESTIGATED AND RESOLVED — both FIXTURE defects: (1) the
  run-up to the boss's due tick took up to 540 ticks and the Kraken marched off its mark → the clock
  is now jumped to the due window; (2) the negative case put the "behind" unit NEARER than the aim
  unit, so it stole the self-aiming axis → aim unit moved to 150 px vs 180 px.
- corpseEater.test.ts F1 after the fix — `expected 70.0000000000773 to be greater than 180`:
  EXPECTED BY DESIGN (the ladder moved) → re-pinned to the constant, see C10.
- C10 mutation run — EXIT 1, 3 failed: EXPECTED.
- LOW a mutation run — EXIT 1, 2 failed: EXPECTED.
- LOW b first runs — 3 failed ("expected +0 to be 28"): INVESTIGATED AND RESOLVED — two FIXTURE
  defects: (1) funding the seat 100,000 VP crossed the win bar, so the match went to WIN on tick 1
  and `castleRegenTick` (PLAYING-gated) never ran — the fixture now funds exactly the purchases and
  asserts the score is spent; (2) a `Player` reference held across a host tick is stale (the tick
  rebuilds Player objects) — re-read after every tick. Then `expected NaN` — I imported
  `CASTLE_UPGRADE_PRICE` from `constants.ts`; it lives in `castleUpgrades.ts` (vitest does not
  typecheck; tsc would have caught it). Fixed.
- LOW b mutation run — EXIT 1, 1 failed: EXPECTED.
- LOW c first run — 2 failed: INVESTIGATED AND RESOLVED — fixture: (1) the castle emitter
  (`raceUnitEmitTick`, runs in FIGHT too) minted units above the dead goblin, so it was no longer
  the highest id → the fixture now kills those through `damageEntity` and asserts only the low-id
  goblin survives; (2) a whole-world `hashWorldStateFull` equality after restore differed for
  reasons unrelated to the counter (not investigated further — outside this brief) → that case was
  replaced by a direct NO-COLLISION check against every id that ever existed. Then `tsc` EXIT 1
  (`'P0' is declared but never read` in the new test) — fixed. The mutation run: EXIT 1, EXPECTED.

## FIX ROUND (audit wf_642c93b4-7ea) — U1, U2-1, U2-7/U5, one commit each

### U1 (MED) — the sonar shove REPLACES the victim's velocity — DONE

**Confirmed through the real host tick** (the audit's figure was a recurrence, not a run): a goblin
SEEKING into the Kraken at >100 px/s closing speed ended the stun **37.2 px CLOSER** with the additive
shove (`prevPos -= u·S` = current velocity + 79 px/s). `applySonarShove` now sets
`prevPos = pos − u·S`: the wave stops the victim and pushes it `KRAKEN_SONAR_KNOCKBACK_PX` out,
whatever it was doing — the premise the derived impulse was built on. The Kraken is the only
production caller of `applyStun` (grep: `bossSkillsKraken.ts:250`), so only the sonar changes.
corpseEater F1 unaffected (the boss is at rest when shoved; its `≈ 70` pin still holds to 3 dp).
Test: `bossSkillsKraken.test.ts` "REACH (audit U1)" — the goblin is walked in by the real host tick
(Kraken held still + silent by a stun), then the Kraken is made due; end distance − start distance
must be 70 ± 10 %. ⭐ Mutation: the run BEFORE the fix is the additive form → RED
("expected -37.17697840468017 to be greater than 63"); after → green. vitest 0 — 6030 / 373; tsc 0.
Protocol: host-only rule, no field → no bump.

### U2-1 (LOW) — runHostTick's spawn-queue window is now proven opened AND closed — DONE (tests only)

`spawnQueueBoundary.test.ts`: (a) the per-tick invariant case now also asserts the queue is EMPTY
straight after each between-ticks raid — true only if the previous `runHostTick` closed its window;
(b) NEW REACH: a stub `botManager.tick` dispatches a lethal `RAID_TARGET` on a demons.l5 chewer
(bots act AFTER the post-sweep drain), and after ONE `runHostTick` both children exist and nothing is
queued — only `endHostTickSpawnWindow`'s final drain can do that. ⭐ Mutation: deleting
`endHostTickSpawnWindow(world);` turns both red ("straight after the raid at tick 20: expected 1 to be
+0", "nothing queued when the tick ends: expected 1 to be +0"); an early return that skips the line is
the same mutation. Restored byte-identical. No production change (the try/finally hardening the audit
listed as optional was NOT added — fix-only-these).
