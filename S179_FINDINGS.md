# S179 — FINDINGS. No code was changed.

**Session kind: scoping + investigation. Zero priorities approved, zero implementation.**

The owner withheld approval and asked to discuss the priority list instead:
*"no priorities approved. lets discuss everything. i think you are tripping about the priority list
or how to implement and work the priorities"*. He was right to: the list presented to him was the
**S178 handoff's** list, handed over as if it were a plan for today. That is the process defect of
this session and it is recorded here so S180 does not repeat it.

⛔ **DO NOT open S180 by re-reading `S179_CARRY_FORWARD.md` and presenting its numbered list.** Ask
him what is wrong when he plays it. That is the only list that has ever been his.

---

## ⭐ WHAT HE SAID TODAY (verbatim — these are rulings, not notes)

| | |
|---|---|
| on the priority list | *"i think you are tripping about the priority list or how to implement and work the priorities"* |
| on the damage-number questions | *"what are you talking about even!?!? i have no idea what are those fucking options"* |
| on the potato | *"there is no potato blast anymore since a while ago"* |
| on what matters | *"dont you have actyually important prioritiess to do like the character sheets with the stats?"* |
| Warlord rage (ANSWERED, still unbuilt) | *"enrage at 49 calm at 50 so the literall meaning of below 50."* |

⚠ **THE POTATO.** He says the potato blast is gone. The CODE IS STILL THERE AND STILL WIRED:
`POTATO_SPAWN_MIN_SPARKS` 10 / `MAX` 18, `POTATO_FUSE_TICKS` 23 s, `POTATO_BLAST_RADIUS` 110,
plus bot `POTATO_GRAB` / `POTATO_PLANT` errands and a whole `potatoLifecycle.ts`. Either it is
gated off somewhere I did not find, or it is dead code that should come out. **Ask him, then
measure it in the running game — do not settle this from source comments.**

---

## ✅ CONFIRMED BY HAND THIS SESSION (I read the code; these are not agent claims)

### 1. HIGH — a creature never re-checks `isUntargetable` on a target it already holds
Defenders were fixed for this; creatures never were.
- `defenders/defenderLifecycle.ts:159` — `if (isUntargetable(victim, world.tick)) return false;` ✅
- `creatures/creatureAI.ts:463` — the ONLY creature-side call, and it is in the **acquisition** scan
  (`findNearestEnemyCreatureFrom`), not the retention path.
- `creatures/creatureLifecycle.ts` — `isUntargetable` appears **once, inside a COMMENT at line 538**.
  Zero code uses.
- `creatures/creatureAttack.ts` — **zero occurrences.**

**What the player sees.** The Pharaoh enters his Ra ritual and is untargetable for 10 s. Every unit
already locked on him keeps the lock, keeps swinging, deals nothing — and is **frozen in place** for
the full 10 s, because a unit in ATTACKING returns `ZERO_ACCEL`. Voltkin and chewers escape it (they
re-acquire through a gated path), so it hits the structure-attacker army, i.e. most of the board.

⭐ This is his own S177 P9 complaint reopened: *"There shouldn't be pretending to attack and not
hitting anything. That's just ridiculous."*

### 2. HIGH — `nextPulledSparkId` is a four-sites violation
- factory ✅ `world.ts:396` (`-1`) · sim-mutated ✅ `gathererLifecycle.ts:222` · hashed ✅
  `stateHashFull.ts:140` + projected at `:469` · **serialize ❌ — `save.ts` mentions it ZERO times.**
- Its siblings ARE carried: `nextPrimitiveId` / `nextBondId` at `save.ts:1018-1019`, restored at
  `:1147-1148`.
- Host migration happens to recover it (`migrationClaim.ts:223` recomputes `minSpark - 1`), but the
  snapshot→restore path does not — and the field is in the oracle that compares host against worker.

### 3. MEDIUM — phantom damage numbers over the whole board at match end
`render/damageNumbers.ts` has **no reset method at all**, while `world.primitives.clear()` fires at
`gameState.ts:227`, `gameMode.ts:425` and `save.ts:1346`. The vanish sweep
(`damageNumbers.ts:446-452`) then prints a number over **every shape and every defender on screen**.

### 4. The SCRAP design in `S179_CARRY_FORWARD.md` §4 is UNWORKABLE AS WRITTEN
It says *"`pendingCreatureDeaths` is the precedent … only open bit: the set's lifetime."* Both halves
are wrong:
- the death number is **not** an effect — it is a **renderer-local diff** of `world.primitives`
  (`damageNumbers.ts:399`, `deathOnVanish: true`);
- **SCRAP never enters `runHostTick`.** It dispatches synchronously from a DOM pointer handler
  (`main.ts:1025-1029` → `main.ts:603`). A set opened and nulled inside a host tick cannot see it.

The workable mechanism is the `world.effects` contract (written by the reducer, cleared by the
consumer). Still no protocol bump — nothing is serialized.

### 5. The lone-shape rule — MEASURED, not estimated
Applied the two-line rule, ran the suite, restored the files byte-exactly (34396 / 247540 bytes,
CRLF preserved — **not** via `git checkout`, which would have flipped line endings).

**Exactly 13 failures across 7 files.** The carry-forward's estimate was right.

| file | failing tests |
|---|---|
| `state/creatures/standoff.test.ts` | 4 |
| `state/creatures/suicideGoblin.test.ts` | 3 |
| `state/defenders/stinkTower.test.ts` | 2 |
| `state/creatures/goblin.test.ts` | 1 |
| `state/creatures/strikeOrderAndRecall.test.ts` | 1 |
| `state/defenders/stinkCloud.test.ts` | 1 |
| `state/lightningDrone.test.ts` | 1 |

⭐ **WHY THE `bonds.size === 0` GATE IS LOAD-BEARING** (this is what killed attempt #1): a creature
damages a shape it is committed to whether bonded or not (`creatureAttack.ts:381`), and
`applyRadialDamage` (`damage.ts:579`) hits structure members too. Both reach the same
`case 'primitive'` arm, so a bare `PRIMITIVE_MAX_HP` retune shreds buildings.

### 6. Boss rework — three asks are ALREADY SATISFIED, do not "build" them
- `runArchdemonHell`, `runArchdemonTeleport`, `runKrakenSonar`, `runPharaohLocusts`,
  `runPharaohRitual` are **all called every host tick** (`hostTick.ts:1830-1848`).
- `DIREWOLF_MAX_PER_OWNER = 3` and `DIREWOLF_SUMMON_INTERVAL_TICKS = 30 × PHYSICS_HZ` already match
  *"up to 3 at a time, every 30 seconds"*.
- Rage already doubles **both**: `creatureVerlet.ts:257` (movement) and `creatureLifecycle.ts:979`
  (attack cadence). The suspected R149 bug does not exist.

**Still genuinely needing a change:** `VLAD_LIFE_SAP_USES` 3→2 · `ARCHDEMON_HELL_THRESHOLD_PCT` 5→10 ·
locusts 150→50 fifths (`LOCUST_CLOUD_STATS` is `{hp:1,def:0,atk:10,pen:10}`; on the ladder only
`atk 10/pen 0` or `atk 5/pen 5` give exactly 50) · `WARLORD_RAGE_TRIGGER_PCT` 25→50 per his answer.
⚠ `bossSkillsLate.test.ts:151-153` asserts `CLEAR > TRIGGER` and **will go red by design** — re-pin
it to his rule, never silence it. No test pins the sap literal (they derive from the constant), so
only PROSE moves there.

### 7. Closed: the S161 `droneLifecycle.ts:153` carry-forward — **REFUTED, already fixed**
It does not sever unconditionally. Candidates are filtered by `isEnemyBond` + `sparesOwn` + radius,
sorted to a total order, and the sever at `:218` walks only that list.

### 8. Housekeeping found
- `CLAUDE.md:26` says *"4513 tests / 284 files"*; measured today: **4547 / 288**.
- `bossSkillsWarlord.ts:67` still says *"Three wolves every fifteen seconds"* — stale, the constant
  is 30 s. ⚠ **ONE line only.** The other six "15 sec" hits are verbatim R149 owner quotes kept
  deliberately as provenance; leave them.
- Six plans in `.claude/plans/` never archived because they carry **no STATUS line** (that is what
  the archiver matches on, not the filename). All predate S177 and describe shipped work.
- Removed `src/state/__tmp_pulledid.test.ts` — debris a sweep agent left behind after claiming it
  had deleted it. It was polluting the suite (289 files / 4548 tests instead of 288 / 4547).

---

## 🔎 SWEEP LANES — ALL FIVE NOW HAVE A VERDICT

S178 left these owing one. Two workflow runs were killed mid-flight by the org spend limit; per the
S161 rule the dead lanes were re-dispatched and the load-bearing ones hand-run, rather than recorded
as "the sweep produced nothing".

| lane | verdict |
|---|---|
| determinism | **4 findings, all REFUTED** on two independent lenses each |
| four-sites | **1 CONFIRMED** (`nextPulledSparkId`, above) + 3 lower-severity |
| creature lifecycle | **3 findings** — the `isUntargetable` HIGH above, plus two MEDIUM (below) |
| wire / protocol | 2 findings — see the ⛔ below |
| host migration | **2 CONTESTED, neither actionable** — see below |

**Lifecycle, the two MEDIUM I did NOT hand-verify (S180 must verify before acting):**
- `castleGuns.ts:114` — the castle gun acquires through `findNearestEnemyCreatureFrom`, which has no
  `ehp <= 0` test, and runs INSIDE the deferred-death window. Every sibling system guards it
  explicitly (`bossSkillsArchdemon.ts:72`, `bossSkillsKraken.ts:84`, `bossSkills.ts:116`,
  `bossSkillsWarlord.ts:54`). Claim: it spends a 4-second shot on a corpse.
- `hostTick.ts:1116` — the tier-9 boss release razes its ring without `razeOrphans`, claimed to
  strand a bond-less shape. ⭐ **This is exactly the unkillable-clutter symptom his lone-shape rule
  is about** — check them together.

**Host migration — refuted, and worth recording so nobody re-chases it:** the claim was that a
promoted host resumes at an inflated tick and detonates every drone. The tick is **wall-clock
correct** (it advances at 60 Hz of real time, and deadlines were stamped on the same clock via
`applySnapshotCore`'s `world.tick = snap.tick`). Freezing it would be strictly worse. And every
drone alive at host-loss was already doomed — `DRONE_LIFETIME_TICKS` is 480 (8 s) against a 15–18 s
blackout — so promotion yields FEWER detonations than no migration at all.

⛔ **THE WIRE LANE RECOMMENDS A PROTOCOL BUMP. HE CLOSED THAT IN S178: *"Nobody cares. They'll just
figure it out."* DO NOT RE-OPEN IT.** Recorded because an agent will propose it again.

---

## 📋 STILL OPEN, AND HONESTLY LABELLED

**Answered by him, not yet built:** Warlord rage → trigger 50, clear stays 50 (*"the literall
meaning of below 50"*). `bossSkillsLate.test.ts:151-153` must be re-pinned when it lands.

**He raised it himself and it is NOT scoped:** **character sheets with the stats.** What is already
true: every entity has real stats on the one ladder (`T9_BOSS_STATS`, the creature configs,
`structurePoolFifths(n) = n × (n+5)`), and click hit-testing was fixed in S178 A9. So a sheet is
mostly a panel reading numbers that already exist. **The one real decision is whether an ENEMY's
sheet shows LIVE health** — stats-only is local and cheap; live enemy health may need new wire
fields and a protocol bump, which refuses every peer on an old build.

**Never discussed with him this session:** the Voltkin TV transition videos, the Kraken's tentacles
(designed by an agent, unreviewed by him — note R139/S167 said *"3 tentacles"* and S178 said *"up to
like six"*, which looks like a supersession and needs his word).

---

## 🚫 PROCESS NOTE FOR S180

Two workflow runs died to the org monthly spend limit mid-session. A classification bug in the first
sweep script filed **unverified** findings as **"refuted"** when their verifiers died
(`live.length === 0` → `survives: false`). Fixed in the salvage run, which distinguishes
`UNVERIFIED` from `REFUTED` explicitly. ⚠ **A dead verifier is not a refutation** — the same trap
S161 fell into at the lane level, reproduced at the finding level.
