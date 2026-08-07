═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-07
Session: S134 — creature lifetime serialization fix; ALL SIX v0.6 economy decisions ruled
═══════════════════════════════════════════════════════════

## PROJECT
- Name: spark 0.1.0 · Working dir: `Founder DNA/Extension Projects/The Spark`
- Branch: `master` · Latest: `a0d3314 chore(s134): review gate APPROVED`
- Stack: TypeScript / Vite / PixiJS / WebRTC (Trystero) · deterministic host-authoritative sim
- Codebase: ~76,522 lines across 310 `.ts` files in `src/`
- Live: https://daneshto-dotcom.github.io/the-spark/

## CURRENT STATE
- Build: PASSING · bundle **645.3 / 750 KiB** (−88 B vs S133), 104.7 KiB headroom
- Tests: **2028 / 2028** across 133 files (+8 tests, +1 file)
- tsc: 0 · MCV: exit 0 (21 bindings) · gitleaks: clean (1 fingerprint-scoped allowlist)
- Deploy: **VERIFIED LIVE** — run `31181718138` success, verify-deploy **4/4 carriers**,
  live entry asset `index-BxmxAHDO.js` content-hash identical to local build
- PROTOCOL_VERSION 15 (no bump) · schemaVersion 1

## SESSION COST
Model routing data unavailable (statusline reported dead all session; `session-model-counts.tmp`
not written). Real context at close: ~283K / 1M (28.3%, GREEN). Subagent spend was the dominant
cost: **~2.0M tokens across 20 agents** in three workflows (A.0 8 agents / Council 7 / CHECK 5)
against a **two-line** production diff. Recorded honestly in `analyze_result.calibration` — the
ratio was justified here (A.0 and Council each independently caught a blocker) but should not be
assumed normal.

## THIS SESSION'S WORK

### P1 — creature lifetime serialization (Standard, completed)
`serializeCreature` coupled the `despawnAtTick` emit to `sourceSpawnerId !== null`, and
`trimMirrorCreature` stripped it from the wire unconditionally ⇒ `deserializeCreature`
rehydrated **0**, which is a DETONATION default, not a neutral one.
- **Three consumers, not one.** The third is live on today's build with no peer and no
  disconnect: `main.ts:1630` → `workerSim.restore()` + `isHost = true`. MEASURED: a Voltkin at
  1700 rehydrated to **0** under `?worker=1`, on the ORIGINAL host. V6-1.1 was going to flip
  `?worker=1` on by default, making it universal.
- **Worse than deletion.** `hostTick` Step 1.5 runs BEFORE the lifetime gate and fires
  DRONE_EXPLODE on `world.tick >= despawnAtTick - 1` = `>= -1` ⇒ every inherited drone
  detonated, up to 3 enemy bonds each × up to 12 drones = **up to 36 irreversible severs**.
- **`sourceSpawnerId` shipped in the same commit** — the deletion was MASKING two defects it
  causes (per-spawner caps silently disabled; a rehydrated chewer counted as its owner's
  Voltkin, blocking their summon), and those are untestable while creatures are being deleted.
- Edits: `save.ts` emit decoupled + `trimMirrorCreature` narrowed to `targetCreatureId` only;
  4 → 11 stale docblocks corrected; `workerSim.ts` anchor comment; `constants.ts` byte figures.
- New `save.creatureLifetime.test.ts` (8 tests) + both characterization locks inverted in place.
- Wire: 12,821 → **13,313 B** (+492 B, +3.8%) measured on the worst-case fixture.
- **Mutation matrix 3/3** with the load-bearing asymmetry: M1 → A/B/B2 red; M2 → B/B2/C red
  while **TEST A stays GREEN**; M3 → D/D2 red.

### CHECK (Triumvirate) — verdict SHIP-WITH-FIXES, 5 adopted, all landed in `c98e2e2`
1. **My own commit message overclaimed** — it said all four docblocks were rewritten; seven more
   were stale, including `serializeCreature`'s OWN header 44 lines above the emit I changed.
2. **Hunter residual** — identical bug one family over. Logged, NOT fixed (see OPEN ISSUES).
3. **TEST C hand-copied** hostTick Step 1.5's predicate instead of running it. Now runs 5 real
   `runHostTick`s.
4. **TEST D2 was vacuous** — and my FIRST fix was also vacuous. Only re-running the matrix caught it.
5. Unused imports removed.
6 fabricated citations rejected (all one reviewer pass; e.g. an `export function
trimMirrorCreature` that is unexported, a guard that does not exist).

### ⭐ OWNER RULINGS — the larger outcome
All six open v0.6 economy decisions PLUS the whole of V6-1.1 were ruled. **Phase 1 is unblocked
and specified for the first time in six sessions.** Full tables at the top of `BACKLOG.md`.
- B3 **6× spark rate** · B4 **an ordered RTS BUILD QUEUE, not a filter** (first recording said
  "filters" and was corrected) · bank **5 slots** · B6 **additive-only** (CarryingPlayer retained,
  deletion moves to V6-4.3) · **gatherer** everywhere · R19 connected-bond bonus **KEPT**.
- V6-1.1: start at **1** gatherer, more BOUGHT from the castle for **~100 victory points**,
  **ONE POOL — spending sets you back**; art is a **procedural shapeshifting spark** (no asset,
  no bundle cost) and the morph is **purely cosmetic ⇒ renderer-only**; **sim-worker flip SPLIT
  OUT** behind the hunter fix.
- ⭐ **SCORE IS NOW A CURRENCY** — it was write-only and monotonic; it is now spendable and
  non-monotonic. Widest blast radius of anything ruled this arc.

## OPEN ISSUES
- **HUNTER RESIDUAL (MEDIUM, sequencing-critical).** `serializeHunter` emits no lifetime;
  `deserializeHunter` hardcodes `despawnAtTick: 0`; `hunterLifecycle.ts:148` gates on it. A live
  hunter silently escapes to DESPAWNING on migration or worker-resume, and `hunterSpawned` blocks
  respawn ⇒ the leader-punish mechanic is gone for the match. **Must close BEFORE the worker flip.**
- **`SPARK_Blueprint.md:725-729` still says the bug is "live in three paths".** Strike it ONLY in
  the same change that closes the hunter — until then it is the only accurate warning left.
- **`workerSim.differential.test.ts:236` is blind to this whole bug class** — its
  `hashWorldStateFull` INIT compare runs on an EMPTY creature+hunter set. This is why the defect
  needed a manual `?worker=1` measurement to find. Seeding it is the systemic fix.
- **No runtime verification of any kind.** The vitest lane mocks the wire with
  `JSON.parse(JSON.stringify(...))`; nothing chains wire → promote → `snapshot()` → `restore()`.
  `e2e/hostmigration.spec.ts` is `@quarantine-flaky`, excluded from the gating lane, and contains
  **zero** occurrences of "creature".
- **Mixed-build window accepted, not eliminated.** No PROTOCOL_VERSION bump, so a pre-S134 peer
  still sends lifetime-less snapshots. Bounded by TAB LIFETIME, not by one refresh.
- **`prevPos`/`targetPos`/`spawnedAtTick` still do not travel** — a host-vs-successor
  `hashWorldStateFull` equality test cannot be written.
- **16 KiB wire assertion is fiction** — fixture-scoped, enforces nothing at runtime; reality is
  ~38.5 KB at six seats. Annotated in-test, not re-based.
- **`origin/gh-pages` still exists** (1 commit not on master). Owner's call, deliberately unactioned.
- **`FREE_SPARK_SOFT_CAP = 50` becomes live at 6×** — proven unreachable dead code at the old rate.
- **`.gitleaksignore` added** — one fingerprint. Verified the flagged line is an MCV binding path,
  not a credential. Every future `json_field` binding will trip the same rule; triage each by reading.

## BLOCKED ON
Nothing. Phase 1 is unblocked. No owner decision outstanding.

## NEXT STEPS
1. **Hunter residual** — small, self-contained, and gates the worker flip. Emit `despawnAtTick`
   from `serializeHunter`, rehydrate `?? 0`, test a SEEKING hunter through the wire + 5 host ticks.
2. **V6-1.1 gatherer substrate** (Full tier PDR). ⛔ **R3 — gatherer identity is still unchosen
   and load-bearing**: a `freeSparks` entry inherits the 10 s TTL reap and rim-snapping; a new map
   is invisible to R1/R2; a seated Player collides with `MAX_PLAYERS = 6`. Also in scope: minimal
   keep, the score-spend path **including the monotonicity audit** (a tier crossing can now go
   DOWNWARD), the procedural shapeshift renderer, `gatherer` naming. NOT the worker flip.
3. **Seed `workerSim.differential.test.ts`** with one Voltkin, one chewer, one hunter.
4. **Two-tab boot-then-smoke** for host migration.
5. **Re-scope V6-1.6** — its energy sink is redundant now that score is spendable.

## CHANGED FILES
```
 .gitleaksignore                             |  14 +
 BACKLOG.md                                  | 168 ++++++++
 boot-snapshot.md                            | rewritten
 src/constants.ts                            |   9 +-
 src/state/creatures/creature.ts             |   7 +-
 src/state/save.creatureLifetime.test.ts     | 330 +++++++++++++++
 src/state/save.migrationDamage.test.ts      |  76 ++--
 src/state/save.replay.test.ts               |  44 +-
 src/state/save.ts                           | 214 ++++++----
 src/state/workerSim.ts                      |  20 +
```

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **1/1 complete** | ~283K/1000K (GREEN)
P1 `creature-lifetime-serialization` — completed — Standard — `b3e02b4` + `c98e2e2`

## REFLEXION ENTRIES (this session — 9, in `.claude/reflexion_log.md`)
`#a-logged-fix-location-can-be-the-defect` · `#the-bug-was-not-where-the-title-said` ·
`#my-mutation-matrix-lied-twice-before-it-told-the-truth` ·
`#my-first-fix-for-a-vacuous-test-was-also-vacuous` · `#fixing-one-bug-can-unmask-two` ·
`#i-repeated-the-exact-failure-i-had-just-diagnosed` ·
`#three-assertions-from-memory-again-one-session-after-logging-it` ·
`#the-user-could-not-understand-my-output` ·
`#the-owner-gave-a-better-answer-than-any-option-i-offered`

## CARRY-FORWARD PRIORITIES
None incomplete. Carried ITEMS are in OPEN ISSUES and the BACKLOG ledger.

═══════════════════════════════════════════════════════════
