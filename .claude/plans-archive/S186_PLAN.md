# S186 — DYNAMIC SCORING, THE SPAWN RAMP, AND THE TWO CARRIED PLAYTEST ITEMS

STATUS: **COMPLETED** — 4 of 4 shipped, all live. Carried: the empty-quarry fix (measured, needs his word) and #5’s footer question.
Created: 2026-09-22 · Base commit: `5d699b6` · PROTOCOL_VERSION **47**
Owner approval: **EXPLICIT, this session, pre-approved for autonomous execution.**

> *"I approve you to run number 11, the stuck carry shape. Number five, the bottom band. And yeah,
> those are fully researched. We know how to work them. Approved. … I approved them, I pre-approved
> so you can get to work on them autonomously and I'll check it when it's all done."* — owner, S186

---

## GATE BASELINE (captured `$?`, not a pipe, not the wrapper's line)

| gate | result |
|---|---|
| `npm run typecheck` | `TYPECHECK_EXIT=0` |
| `npx vitest run` | `VITEST_EXIT=0` — **5465 tests / 329 files** |
| CI at JOB level, HEAD `5d699b6` | e2e · e2e-lobby · atlas-guard · e2e-races · e2e-soak · e2e-protocol · worker-typecheck all `success`; `e2e-quarantine` `failure` |

**Two non-zero / absent signals, both ruled BENIGN with evidence — neither is passed over:**

1. `e2e-quarantine` = `failure`. Non-gating **by design**: `continue-on-error: true` at JOB level,
   documented at `.github/workflows/e2e.yml:48`. Unchanged since S183.
2. **No Deploy run exists for HEAD `5d699b6`.** Not a missed deploy: the three commits after
   `408ee37` touched only `.claude/**`, `boot-snapshot.md` and `.handoff-archive/**`, and
   `deploy.yml`'s `paths:` filter deliberately excludes exactly those so session bookkeeping cannot
   cancel an in-flight code deploy. The live site is built from `408ee37`, which deployed green.

---

## PRE-FLIGHT WARNS, ADDRESSED

- ⚠ **Stale plan.** `.claude/plans/S185_PLAN.md` still carried an in-progress status line while its archived
  counterpart said `COMPLETED`. The WARN matches on the STATUS line inside the file, not the
  filename. **Fixed** — aligned to the archive, 1/1 anchor asserted before writing.
- ⚠ **Orphan worktree** `.claude/worktrees/s182-arcade-leaderboard-02a32c` (280 MB) still on disk.
  S185 proved all 567 of its source files hash to blobs reachable from `master`, so nothing is
  unmerged. **Left alone** — it needs the owner's destructive token, not mine.
- ⚠ Four other plan files carry `IN-PROGRESS` (S155 batch, two S155/S156 scope amendments,
  S173_NONET_STAGES). Older than the S185 cycle; **not touched this session**, recorded so the next
  boot knows they were seen rather than missed.

---

## P1 · DYNAMIC WIN SCORE ("nikud dinami") — the owner's new spec

### THE RULING, VERBATIM

> *"It takes 2,500 points to win in the first five waves. After the fifth wave and until the 10th
> fight wave, it's 5,000. After that, if nobody won with 5,000 points, or by destroying each other's
> castle until then, then it climbs to 10,000 until level 15 from level 10. Then, if nobody won till
> then, it climbs to 20,000 from level 15 to level 20. If nobody won then, from level 20 to level 25,
> it takes 50,000."*

And he pre-empted the boundary question himself, so it is not open:

> *"If someone is at level four, then it's up to 2,500 points. Still. Level five. Still 2,500 points.
> If nobody won then, then level six, it's already 5,000 points. And so on and so on."*

| wave (inclusive) | win score |
|---|---:|
| 1 – 5 | **2,500** |
| 6 – 10 | **5,000** |
| 11 – 15 | **10,000** |
| 16 – 20 | **20,000** |
| 21 – 25 | **50,000** |

**His intent, in his words:** *"in the beginning you really need to build as many gatherers and speed
to get as many shapes. But then you can't cheat by building a lot of them and then just letting the
points run at level five and then everyone can win at level five."*

⭐ **THE BAR MOVES; THE SCORE IS NOT RESET.** A player sitting on 3,000 at wave 5 has won. The same
player who reaches wave 6 without winning now needs 5,000. That IS the anti-coast mechanic — it is
the whole point of the spec, not a side effect to soften.

### ⛔ PAST WAVE 25 IS **MINE**, NOT HIS — HE DID NOT SPEAK TO IT

The band table stops at 25. **Decision: the bar CLAMPS at 50,000 for wave 26 and beyond.** The two
alternatives are worse: continuing the ×2.5 climb makes a long match unwinnable on points and quietly
converts it into a castle-only match, and falling back to a default would make the bar *drop*, handing
victory to whoever coasted longest — the exact behaviour the spec exists to kill. Clamping preserves
"points remain winnable, but only just". **Flagged for his review; one line reverses it.**

### STATE DISCOVERY (Rule 21 A.0) — HAND-VERIFIED, NOT TAKEN FROM A HANDOFF

- `PHASE_1_WIN_SCORE = readTestWinScore() ?? 2500` — `constants.ts:432`.
- `world.waveNumber` is **already** hashed (`stateHashFull.ts:134`, *"drives the spawn rate, so a
  divergence is a real desync"*), serialized additive-optionally (`save.ts:1103`, restored `:1618`)
  and typed on the world (`worldTypes.ts:721`).
  ⭐ **THEREFORE: a win bar DERIVED from `waveNumber` needs no new field, no four-sites work and NO
  PROTOCOL BUMP.** Both peers already agree on the wave. This is the project's own "prefer deriving
  over sending" rule paying out — the spec is free on the wire.
- Wave N is *"the Nth BUILD+FIGHT turn"*; incremented on entry to BUILD at `hostTick.ts:415`, and the
  opening BUILD is wave 1 from `makeWorld` (`world.ts:477`).

### THE PRODUCTION CONSUMER CENSUS — enumerated mechanically, then classified

| site | what it is | verdict |
|---|---|---|
| `gameState.ts:174` `Math.floor(world.scoreProgress) >= PHASE_1_WIN_SCORE` | **THE win check.** One site. | **MUST FOLLOW** |
| `ui.ts:55` `SCORE ${score}/${PHASE_1_WIN_SCORE}` | the score readout | **MUST FOLLOW** |
| `ui.ts:50` `TIER ${tier} — ${tier*SCORE_TIER_STEP}/${PHASE_1_WIN_SCORE}` | the tier readout | **MUST FOLLOW** |
| `ui.ts:1084` per-seat leaderboard row `${score}/${PHASE_1_WIN_SCORE}` | the seat rows | **MUST FOLLOW** |
| `constants.ts:1117` `HUNTER_TRIGGER_SCORE = floor(PHASE_1_WIN_SCORE × 0.75)` | the hunter | **MUST FOLLOW — my call, see below** |
| `scoring.ts:267` `PHASE_1_WIN_SCORE × LEADER_DECAY_THRESHOLD_FRACTION` | leader score-decay | gated OFF by R28 — verify, then leave consistent |
| `CASTLE_MAX_HP` (2500, `constants.ts:~1925`) | *"deliberately the SAME as `PHASE_1_WIN_SCORE`"* | ⛔ **MUST STAY PINNED** |

### ⛔ THE CASTLE COUPLING IS A REAL DESIGN CONSEQUENCE AND HE MUST BE TOLD, NOT SILENTLY ABSORBED

`CASTLE_MAX_HP` is 2500 and the comment at its constant says the number is *"deliberately the SAME as
`PHASE_1_WIN_SCORE` — the two victory conditions are meant to feel like equal-length races (castle OR
points wins), so one shared magnitude says that better than two tuned ones."*

**From wave 6 on, that equality is gone.** The castle stays a 2500-point race while the points race
becomes 5,000 → 50,000. So the longer a match runs, the more decisively **castle-rush becomes the
correct strategy** — which may be exactly the pressure valve he wants (a long game should end in
blood, not arithmetic), or may need the castle to climb too.

⛔ **NOT CHANGED THIS SESSION.** He did not ask, R88 pins one castle constant for every seat, and
raising it would retune every castle relationship measured in S181. **Reported to him as a
consequence of his own spec, with the recommendation to leave it and watch one match.**

### THE HUNTER IS **MINE** TOO, AND HERE IS THE CASE

`hostTick.ts:2086` — `if (!world.hunterSpawned && Math.floor(world.scoreProgress) >= HUNTER_TRIGGER_SCORE)`,
latched by the serialized `world.hunterSpawned` so it can fire at most once per match.

**Decision: the trigger FOLLOWS the dynamic bar.** It is *defined* as 75% of the win score, and the
win score is now a function of the wave. Pinned at 1,875 it would fire at **37.5%** of a wave-6 bar and
**3.75%** of a wave-21 bar — turning an anti-runaway measure into an early-match nuisance that is
spent before the race it exists to police has begun. The latch makes this safe in both directions: a
hunter that has already fired stays fired when the bar jumps, and a leader who has not yet tripped the
old number simply keeps chasing the new one.

### FIX SHAPE

1. `constants.ts` — add `WIN_SCORE_BANDS` (the table above) and `winScoreForWave(waveNumber)`, a pure
   total function clamping at the top band. Keep `PHASE_1_WIN_SCORE` as the wave-1 value so the E2E
   override seam (`readTestWinScore`) and every existing fixture keep working.
2. Make `hunterTriggerScoreForWave(waveNumber)` the same shape; keep `__TEST_HUNTER_TRIGGER_SCORE__`.
3. Thread `world.waveNumber` into the win check, the three UI readouts and the hunter gate.
4. **No serialization, no hash change, no worker change, no protocol bump** — derived on both sides.

### TESTS OWED

- The band table at every boundary wave: **4, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26** — he named 4→5→6
  explicitly, so those three are his assertion, not mine.
- `winScoreForWave` is TOTAL: wave 0 and negative waves return the base band, never `undefined`.
- **The anti-coast property, through the real host tick:** a leader banked above 2,500 who crosses the
  wave-5→6 boundary without winning does NOT win on the next tick.
- The hunter fires **at most once** across a band jump (drive the latch through the boundary).
- Determinism: `winScoreForWave` is a pure function of a hashed field — assert the host and the
  `?worker=1` mirror agree across a boundary crossing.

### ⚠ TESTS THAT WILL GO RED BY DESIGN — RE-PIN, NEVER SILENCE

Any fixture asserting a literal `2500` win bar past wave 5. The S177 rule applies: **derive the
literal from the constant** so a future retune cannot half-land, and where a count is a COVERAGE gate,
**lengthen the run** past the new bar rather than relaxing the assertion.

---

## P2 · THE PRIMITIVE SPAWN RAMP — "significantly faster" at 5 / 10 / 15 / 20

### THE RULING, VERBATIM

> *"We already kind of did that, we implemented that a while ago. But every wave the primitives need
> to be spawned quicker and quicker. So far it does that but not fast enough — because at wave like
> six or seven all your gatherers are waiting in line and not moving until the shapes come up. So we
> need that too, like significantly faster: after wave 5, then after wave 10 even more, even faster
> after 15, even faster after 20."*

### WHAT IS ACTUALLY THERE — HAND-VERIFIED

`waveNumber` has **exactly one** consumer in the whole tree, and it is this:

```ts
// constants.ts:1479-1482
export const WAVE_SPAWN_RATE_STEP = 0.2;
export function waveSpawnMultiplier(waveNumber: number): number {
  return 1 + WAVE_SPAWN_RATE_STEP * Math.max(0, waveNumber - 1);
}
```

Read once, at `physicsLoop.ts:103`, and passed to `spawner.tick(...)` where it **divides the
inter-arrival interval** (`spawner.ts:223`) rather than touching the seeded RNG — so the draw count
and draw order are untouched and host/worker stay hash-identical.

Its own docblock carries the S157 owner ruling it implements — *"wave 1 is normal. wave 2 is 1.2.
wave 3 is 1.4x faster"* — and an explicit **do-not-cap**: *"dont cap because people build more and
more gatherers so it should scale in the way i have described."*
⛔ **The new spec must therefore LAYER ON the linear ramp, not replace it, and must not introduce a
cap.** Reversing either would reverse a live ruling.

### THE ARITHMETIC THAT SIZES HIS COMPLAINT

`SPAWN_RATE_PER_SECOND = 1.125` (`constants.ts:192`). The quarry runs **during BUILD only**
(`physicsLoop.ts`, S149 P2 — the dispatch is gated, never `spawner.tick`, so the RNG stream stays
aligned), and BUILD is **90 s** (`PHASE_DURATION_TICKS = 5400`), FIGHT 60 s.

⛔ **AND THERE IS EXACTLY ONE QUARRY FOR THE WHOLE TABLE** — `main.ts:478` constructs a single
`Spawner` at one `SPAWNER_CENTER`. Every seat's gatherers feed from it.

| wave | multiplier | shapes/sec | shapes per 90 s BUILD | **per seat, 4-player** |
|---|---:|---:|---:|---:|
| 1 | 1.0 | 1.13 | ~101 | ~25 |
| 5 | 1.8 | 2.03 | ~182 | ~46 |
| **6** | **2.0** | **2.25** | **~202** | **~51** |
| 10 | 2.8 | 3.15 | ~284 | ~71 |
| 15 | 3.8 | 4.28 | ~385 | ~96 |
| 20 | 4.8 | 5.40 | ~486 | ~122 |
| 25 | 5.8 | 6.53 | ~587 | ~147 |

**At wave 6 the whole table shares 2.25 shapes per second.** That is the number behind *"all your
gatherers are waiting in line"* — a fleet that has been growing for six waves against a supply that
has not even doubled. The ramp is real; it is simply far too shallow against a fleet that compounds.

⚠ **THE PROPOSED BAND MULTIPLIERS BELOW ARE PROVISIONAL** pending the throughput measurement in the
running probe, which is establishing whether the spawn interval is genuinely the limiter or whether a
board cap / gatherer walk time / the castle deposit path binds first. **If the limiter is not the
spawn rate, raising it changes nothing and he needs to be told that in one sentence with the number.**
The measurement lands before this priority is built, not after.

### TESTS OWED

- The multiplier at every band boundary (4, 5, 6, 10, 11, 15, 16, 20, 21, 25), derived from the
  constants, never copied literals.
- **Monotonic and uncapped** — assert it strictly increases and has no ceiling, so R-S157's
  "don't cap" cannot be quietly reintroduced as a clamp.
- **RNG invariance survives** — `spawnerRngInvariance` must still hold; the multiplier may only scale
  the resulting interval, never the draw.
- A real-host-tick throughput measurement at waves 1 / 6 / 20, in the `castleGuns.test.ts` style:
  **measured through the loop, never reasoned about.**

---

## P3 · #11 — THE STUCK CARRIED SHAPE (owner playtest, carried from S185)

A match-long soft-lock: a shape pulled from the castle mid-drag when the FIGHT whistle blew stays
glued to the cursor for the rest of the match, and every further free-form pickup is refused.

**Already ruled:** the shape returns to the **BANK**. ⛔ Not "the centre" — that would DELETE it via
the free-spark reaper. Research + adversarial verify complete in `.claude/research/S185/`.

Known from S185's verified research, to be re-confirmed against today's tree:
`controls.ts:1063` is the match-long gate · `controlsCore.ts:119-127` is the cursor hard-snap that
makes it look welded on · the phase-edge block at `hostTick.ts` has exactly one arm (BUILD) and
nothing fires entering FIGHT · **the local `ControlState` must be cleared too**, which the S185
verifier graded as the gap in the proposed fix.

---

## P4 · #5 — THE DEAD BOTTOM BAND (owner playtest, carried from S185)

⛔ **NOT the menu** — the chips already let clicks fall through. The blocker is the **off-screen
rule**: a tower's footprint forces a lowest legal centre, and the band below it is dead.

He approved this for autonomous execution and said not to bring him questions he has already
answered. The S185 note *"needs his canvas-edge ruling"* is therefore resolved the way he asked: the
probe measures the real numbers, I take the least-surprising option, **state the assumption plainly
and flag it for his review** rather than blocking on it.

---

## EXECUTION ORDER AND THE RULES THIS SESSION RUNS UNDER

P1 → P2 → P3 → P4. **Commit and push after each priority** — an exhausted window then costs the step
in flight and nothing else.

- ⛔ Every gate's exit code read from a **captured `$?`**. Never a pipe; never the wrapper's
  `[exited with code 0]`, which is not the gate's verdict.
- ⛔ **Touch a Pixi layer → run the e2e spec that censuses it BEFORE pushing.** S185 shipped a red
  gating lane for three commits because no renderer runs under vitest and a green unit suite
  structurally cannot see a display-list change.
- ⛔ **Assert the match count on every patch.** CRLF ate three anchors last session.
- ⛔ No failed command passed over: every non-zero exit gets **investigated and resolved**, or
  **ruled benign with the reason recorded**.
- ⭐ A number enters `SPARK_CANON.md` only **with its constant**, and its assertion in
  `src/canon.test.ts` lands in the **same commit**.
