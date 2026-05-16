# PDR — Session 33 / S32 P1 Audit Batch (10 priorities)

**Tier:** Standard (~20-25K)
**Date:** 2026-05-16
**Session:** S33 (executes S32-deferred P1 batch — S32 was diagnostic-only)
**Source:** S31 audit (4 parallel agents, 24 findings → 5 P0 shipped S31, 10 P1 here, 9 P2 → S34)
**Baseline commit:** `1f3247d` (master, origin/master in sync)
**STATUS:** Council R1 + PRIME-AUDIT COMPLETE → 4 evidence-based deltas applied → awaiting user `go`

---

## PRIME-AUDIT Δ (post-Council, pre-user) — 4 evidence-based overrides

### Δ1 — REVERSE Council Q1: keep A (no SCHEMA_VERSION bump)
**Council R1 ruled B (bump) on Grok+Gemini consensus. Both reasoned from generic best-practice; neither read save.ts.**

**Evidence in save.ts:75-83:**
> "S28 P0 — Voltkin Phase 2D NetSnapshot v2 (Council Q1 UNANIMOUS A **additive-optional pattern; no schemaVersion bump per S15 P2 precedent**). Host serializes live creatures so 1v1 clients can render the mirror... Pre-S28 saves omit this field; applySnapshotCore handles `undefined` via nullish-coalescing"

And save.ts:86-103 (S31 P0-3 effects array): same pattern.

**Verification:** save.ts:249-250 throws on `schemaVersion !== 1`. Bumping to `2` would BREAK every pre-S33 save in localStorage + every pre-S33 NetSnapshot in flight from an older host. The schemaVersion gate is **load-blocking**, not migration-aware.

**Adding creatureId to ARC_FLASH effect entry is identical pattern to S28 P0 (added creatures field) and S31 P0-3 (added effects field): inner field added, outer schemaVersion stays at 1, missing field on parsed JSON degrades gracefully (`effect.creatureId | 0 === 0` on undefined → `Math.imul(0, K) === 0` → seed XORs to baseline, no crash, slight jitter pattern difference for legacy snapshots only).**

**OVERRIDE:** Q1 = **A (no bump)**. Document precedent in P1-11 commit message + add JSDoc note in `effects.ts` ARC_FLASH type.

### Δ2 — DROP P1-7 from batch (audit false-positive)
**Council R1 SYNTHESIS was "keep both pumps, add comment."**

**Evidence in cutsceneOverlay.ts:351-368 (existing comment):**
> "S30 P0a — defensively pin autoUpdate=true on the VideoSource (default...) [...]
> app.ticker. **Belt-and-suspenders for VideoSource autoUpdate.** If autoUpdate misses a frame (tab visibility, rVFC not firing, browser..."

The redundancy is **already documented as intentional**. The S31 audit's "drop one" finding missed that the existing comment explains why both exist. Council's "add a comment" synthesis is redundant with the comment already present.

**OVERRIDE:** **DROP P1-7 entirely** from the batch. Mark in BACKLOG as `RESOLVED — audit false-positive (existing comment at cutsceneOverlay.ts:364 documents intentional belt-and-suspenders for autoUpdate failure modes).` Batch reduces from 10 → 9 priorities.

### Δ3 — REFINE P1-12 test design (use existing serializer, not slice list)
**Council R1 ruled "expand to world.tick + world.gameState + world.primitives" (4-slice add).**

**Better design (PRIME-AUDIT insight):** save.ts already has `snapshot(world): WorldSnapshot` serializing all deterministic fields. P1-12 test should:
```ts
const seed = 0xABCDEF;
const w1 = createWorld(seed);
for (let i = 0; i < 1000; i++) tick(w1);
const snapA = JSON.stringify(snapshot(w1));

const w2 = createWorld(seed);
for (let i = 0; i < 1000; i++) tick(w2);
const snapB = JSON.stringify(snapshot(w2));

expect(snapA).toBe(snapB);
```
This catches **any deterministic-field drift** automatically — no manual slice maintenance, no risk of forgetting to add new world fields. Better than slice list.

**OVERRIDE:** P1-12 uses `JSON.stringify(snapshot(world))` equality. Council's slice expansion satisfied implicitly (and then some).

### Δ4 — Document legacy-snapshot creatureId fallback (P1-11)
**Council R1 + Council R1 ruled Q1=A no-bump. PRIME-AUDIT confirms (Δ1).**

**Add to P1-11 implementation:** the new `arcSeed(tick, sx, sy, creatureId)` MUST tolerate `creatureId === undefined` from pre-S33 NetSnapshots replayed/received from older hosts. The bitwise `(creatureId | 0)` coerces undefined → 0, which makes the new field's contribution to the seed null on legacy data — backward-compatible jitter pattern.

**ACTION:** JSDoc note above `arcSeed`; explicit test in `arcFlash.test.ts` (if doesn't exist, add it to scope) covering both undefined-creatureId and number-creatureId paths.

---

## PRIME-AUDIT — Net Impact
- **P1-7 dropped** → -1 priority, batch 10→9
- **Δ1 saves ~1.5K tokens** (no save.ts SCHEMA_VERSION machinery, no migration handler)
- **Δ3 simplifies P1-12** by ~0.5K
- **Δ4 adds ~0.3K** documentation
- **Net estimate: ~22-25K** — Standard tier, comfortable margin

---

## Council R1 — Battle Ledger

### Triumvirate Positions
- **Claude (Prime Architect):** 10-item batch as drafted; Q1=A no-bump, Q2=A drop per-tick, Q3=A full backfill, Q4=A rng.ts, Q5=A keep root
- **Grok (Disruptor):** P1-11 schema additivity unproven; P1-7 rVFC brittle on low-end mobile (HIGH); P1-12 ordering wrong (must precede P1-11); P1-12 scope incomplete
- **Gemini (Auditor):** Verdict REVISE — P1-11 schema bump justified by replay-determinism gravity; P1-6 needs explicit test; P1-15 DIFFERS needs detail before action

### Battle Ledger
| # | Decision | Claude | Grok | Gemini | Authority | Resolution | Δ LOC | Δ Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | Q1 NetSnapshot schema bump (P1-11) | A no-bump | **B bump** | **B bump** | Grok(1.75) | **CONCEDED → B bump SCHEMA_VERSION** | +2 | -2 (HIGH→LOW) |
| 2 | Q2 Video pump (P1-7) | A drop per-tick | Keep both | A drop per-tick | Claude(1.75) | **SYNTHESIS — Keep both pumps; add comment explaining belt-and-suspenders intent** | +5 (comment) | -1 (mobile-stutter risk eliminated) |
| 3 | Q3 BACKLOG backfill (P1-14) | A full | B deprecate | **B deprecate** | Gemini(1.75) | **CONCEDED → B deprecate-and-redirect ~5 LOC** | -95 | 0 |
| 4 | Q4 pseudoRand placement (P1-10) | A rng.ts | A rng.ts | A rng.ts | Claude(1.75) | **AGREED → rng.ts** | 0 | 0 |
| 5 | Q5 S32diagnostic at root (P1-15) | A keep | A keep | B remove | Gemini(1.75) | **OVERRULED 2v1 — A keep** | 0 | 0 |
| 6 | **Ordering — P1-12 before P1-11** (Grok adds) | (not raised) | ADD ordering | (not raised) | Grok(1.75) | **ADOPTED — P1-12 first runs as BASELINE before any math touch** | 0 | -2 (replay-determinism gravity) |
| 7 | **P1-6 explicit test** (Gemini adds) | (not raised) | (not raised) | ADD test | Gemini(1.75) | **ADOPTED — extend `screenShake.test.ts` with phantom-gate regression** | +20 | -1 |
| 8 | **P1-12 scope expansion** (Grok+Gemini add) | 4 slices | "missing camera/audio/input" | "long-tail coverage" | Grok+Gemini consensus | **PARTIAL ADOPT — expand to world.tick + world.gameState + world.primitives. REJECT camera/audio/input (out of world model — render layer)** | +15 test LOC | -1 |
| 9 | P1-7 fallback guard `if(!autoUpdate) source.update()` (Grok adds) | (not raised) | ADD guard | (not raised) | Claude(1.75) implementation domain | **REJECTED — autoUpdate is documented Pixi v8 API; runtime feature-detection of standard API is over-engineering (YAGNI)** | 0 | 0 |
| 10 | P1-11 promote to standalone PDR (Grok adds) | (not raised) | "schema migration not micro" | (not raised) | Claude(1.75) implementation domain | **REJECTED — ~25 LOC across 4 files = comparable to S31 P0-3 (effects+save+main+client also single priority). SCHEMA_VERSION bump (Resolution #1) caps risk** | 0 | 0 |

### Quality Scorecard (Gemini)
- Quality: 4/5 (after revisions)
- Efficiency: 5/5 (per-priority commits, dependency-ordered)
- Completeness: 4/5 (P1-15 DIFFERS file content still TBD until inspection)

### Veto Log
- No vetoes used by either dissenter.

### Risk Consensus
- Agreed: P1-11 schema additivity was unsafe; bump resolves it. P1-7 removal was risky; comment resolves it. P1-12 ordering correction prevents replay-test gap.
- Unresolved: None (all decisions resolved via domain-weighted voting + 2 SYNTHESIS rows).

### CONFIDENCE: HIGH (after revisions)

---

## FINAL EXECUTION ORDER (post-Council R1 + PRIME-AUDIT)

**9 priorities** (P1-7 dropped as audit false-positive):

1. **P1-12** Replay determinism test (BASELINE first — uses `JSON.stringify(snapshot(world))` equality across 1000-tick double-run, catches any deterministic-field drift)
2. **P1-9** Delete dead `readyState >= 2` fast-path in cutsceneOverlay.ts:377
3. **P1-8** Consolidate dup `loadeddata` listeners (lines 194 + 382)
4. **P1-10** `pseudoRand` consolidation — add one-shot to `rng.ts`, refactor 2 call sites
5. **P1-11** Add `creatureId` to ARC_FLASH + mix into arcSeed. **NO SCHEMA_VERSION BUMP** (PRIME-AUDIT Δ1 — S15 P2 / S28 P0 / S31 P0-3 additive-optional precedent). JSDoc legacy-snapshot fallback.
6. **P1-13** Rename `cutsceneOverlay.characterSprite` private → `videoSprite` (recipe data field untouched)
7. **P1-6** Phantom-shake gate: replace `!bonds.has` with `effects.some(ARC_FLASH && tick===)` + **add regression test to `screenShake.test.ts`**
8. **P1-14** Deprecate BACKLOG S20-S30 with redirect header (~5 LOC, no full backfill)
9. **P1-15** Handoff cleanup — DIFFERS inspection report mandatory before removal; 6 byte-IDENTICAL remove; NO-ARCHIVE archive-then-remove; S32diagnostic stays at root

**Dropped:** ~P1-7~ — audit false-positive, see PRIME-AUDIT Δ2.

## REVISED ESTIMATE
- Base: ~22-25K
- Council additions: +5K (P1-12 baseline + P1-6 test + SCHEMA bump + DIFFERS inspection)
- Council subtractions: -3K (P1-14 deprecate-not-backfill, P1-7 comment-not-refactor)
- **Net: ~24-27K** — Standard tier preserved

---

## A.0 STATE-DISCOVERY GATE — Findings

All 10 audit findings verified present at HEAD `1f3247d`. **5 material DELTAs** vs BACKLOG description:

| ID | BACKLOG Claim | Reality | Action |
|---|---|---|---|
| P1-10 | "Consolidate dup `pseudoRand` to `src/state/rng.ts`" | `rng.ts` exports `mulberry32(seed): Rng` (stateful **generator**). arcFlash.ts `pseudoRand(seed, index)` is 2-arg one-shot; screenShake.ts `pseudoRand(seed)` is 1-arg one-shot. Direct consolidation onto generator API breaks replay determinism. | Add **new one-shot export** `pseudoRand(seed: number, index?: number): number` to rng.ts. Both call sites switch. Generator API untouched. |
| P1-11 | "ARC_FLASH seed missing creature.id" | ARC_FLASH effect type (`game/effects.ts:143`) has **no creatureId field**. NetSnapshot serializes ARC_FLASH (`save.ts:519, 558`). Schema change cascades into NET wire. | Add `creatureId: number` to ARC_FLASH effect. Emit from `creatureAttack.ts:112`. Mix into `arcSeed(tick, sx, sy, creatureId)`. NET-compat: new field is additive — old clients ignore. **No SCHEMA_VERSION bump.** |
| P1-13 | "`characterSprite` rename to `videoSprite`" | TWO usages: (a) `cutsceneOverlay.ts:60` private field (NOW holds video — rename target ✅), (b) `recipes/types.ts:41` + `voltkin.ts:207` recipe data field (PNG path, used by codex — **DO NOT rename**). | Rename ONLY (a) + comments at lines 11, 228, 294-361. (b) untouched. |
| P1-15 | "6 stale handoffs at root, byte-identical archives exist → remove" | Probe found **9** at root. 7 IDENTICAL (S24, S25, S27, S28, S29, S31close, S32diagnostic). 1 DIFFERS (S23close — root vs archive diverged). 1 NO-ARCHIVE (HANDOFF_2026-05-13.md). | Remove the **6** byte-identical EXCLUDING `S32diagnostic` (keep current at root). DIFFERS: inspect; keep the longer/newer; archive resolution. NO-ARCHIVE: copy root→archive, then remove root. |
| P1-6 | "Gate shake on `effects.some(...ARC_FLASH && tick===world.tick)`" | Existing gate `main.ts:683` is `!world.bonds.has(bondId)`. Functionally equivalent today (CREATURE_ATTACK always emits ARC_FLASH on SEVER). | Adopt BACKLOG gate as **forward-defense** for non-ARC_FLASH severing attacks (Anvil may add cleave/AOE that severs without emitting ARC_FLASH). Replace check at main.ts:683. |

---

## OBJECTIVE

Close 10 P1 audit findings (latent-bug surface + dead code + naming drift + cleanup). Net delta: **-25 LOC src/**, **+1 test file (~80 LOC)**, **+100 LOC BACKLOG.md backfill**, **7-9 file removals at repo root**. Unblocks S34 Anvil work on clean slate.

## SCOPE — 10 priorities, dependency-ordered

1. **P1-9** — Delete dead `readyState >= 2` fast-path
2. **P1-8** — Consolidate dup `loadeddata` listeners
3. **P1-7** — Drop one of belt-and-suspenders video-pump paths
4. **P1-10** — Add one-shot `pseudoRand` to rng.ts; refactor 2 call sites
5. **P1-11** — Add `creatureId` to ARC_FLASH; mix into arcSeed
6. **P1-13** — Rename `cutsceneOverlay.characterSprite` private → `videoSprite`
7. **P1-6** — Phantom-shake gating: explicit ARC_FLASH-this-tick check
8. **P1-12** — New `save.replay.test.ts`: snapshot→simulate N ticks→snapshot diff
9. **P1-14** — BACKLOG.md S20-S30 backfill (summary header + per-session 1-liner)
10. **P1-15** — Handoff cleanup at root (6 IDENTICAL remove + 1 DIFFERS resolve + 1 NO-ARCHIVE archive-then-remove)

## NON-GOALS

- S33 P2 batch (9 P2 audit findings) — separate session
- P2-20 voltkin-config.ts refactor (Anvil prereq) — separate session
- S34 Anvil creature work — post-audit cleanup
- 1v1 brother retest — user-driven separate session
- User-noted bug list — deferred until user provides

## APPROACH

### P1-9 — Delete dead readyState fast-path
**File:** `src/render/cutsceneOverlay.ts:377-385`
**Before:**
```ts
if (video.readyState >= 2) {
  setup();
} else {
  video.addEventListener('loadeddata', setup, { once: true });
}
```
**After:**
```ts
video.addEventListener('loadeddata', setup, { once: true });
```
**Rationale:** This block runs BEFORE `video.load()` (per audit trace); readyState is always 0 here. The fast-path is dead.
**LOC:** -3. **Risk:** None — code path provably unreachable.

### P1-8 — Consolidate dup loadeddata listeners
**File:** `src/render/cutsceneOverlay.ts:194` + `:382`
**Action:** Two distinct listeners attached. First (line 194) inlines diagnostic logging; second (line 382) calls `setup()`. Merge into a single listener that runs both side-effects. Use `{ once: true }`.
**LOC:** -8. **Risk:** Listener-ordering — verify diagnostic-log fires BEFORE setup so console events stay correlated.

### P1-7 — Drop belt-and-suspenders video pump
**File:** `src/render/cutsceneOverlay.ts:354-368`
**Action:** `src.autoUpdate = true` (line 355) + per-tick `source.update()` (line 364 area) are both pumping the VideoSource. Drop the per-tick update — `autoUpdate` is sufficient under Pixi v8 (uses `requestVideoFrameCallback` natively). Keep the autoUpdate pin as the primary path.
**LOC:** -5. **Risk:** Frame stutter on tab-visibility-change / rVFC drop. Mitigation: keep PR small for easy revert if smoke fails.

### P1-10 — pseudoRand consolidation
**Files:** `src/state/rng.ts` (add), `src/render/effects/arcFlash.ts` (remove local), `src/render/screenShake.ts` (remove local)
**New rng.ts export:**
```ts
/**
 * One-shot mulberry32-style hash → [-1, 1]. Replay-safe. Index arg optional —
 * when omitted, single-arg form matches screenShake.ts use. When supplied,
 * 2-arg form matches arcFlash.ts use (seed differentiated per polyline vertex).
 */
export function pseudoRand(seed: number, index: number = 0): number {
  let x = ((seed | 0) ^ ((index | 0) * 2654435761)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x / 0x80000000) - 1;
}
```
**Verify math equivalence:**
- screenShake.ts current: `(seed | 0) >>> 0` start (no XOR with index) → matches new `pseudoRand(seed, 0)` because `0 * K1 === 0`, `seed ^ 0 === seed`.
- arcFlash.ts current: `((seed | 0) ^ ((index | 0) * 2654435761)) >>> 0` start → matches new `pseudoRand(seed, index)` exactly.
- **Byte-exact replay-determinism preserved.**

**LOC:** +12 rng.ts, -7 arcFlash.ts, -7 screenShake.ts. **Risk:** Replay drift — mitigation: existing tests + new P1-12 replay test guard.

### P1-11 — ARC_FLASH seed mix creature.id
**Files:** `src/game/effects.ts` (schema), `src/state/creatures/creatureAttack.ts:112` (emit), `src/render/effects/arcFlash.ts:83` (arcSeed), `src/state/save.ts:519, 558` (NetSnapshot)

**Schema change:**
```ts
// game/effects.ts
{ kind: 'ARC_FLASH'; tick: number; start: Point; end: Point; creatureId: number }
```

**arcSeed signature:**
```ts
function arcSeed(tick: number, sx: number, sy: number, creatureId: number): number {
  return (
    (tick | 0)
    ^ Math.imul(sx | 0, 374761393)
    ^ Math.imul(sy | 0, 668265263)
    ^ Math.imul(creatureId | 0, 2246822507)
  ) | 0;
}
```

**Emit site (creatureAttack.ts:112):**
```ts
world.effects.push({
  kind: 'ARC_FLASH',
  tick: world.tick,
  start: { x: c.pos.x, y: c.pos.y },
  end: { x: b.midPoint.x, y: b.midPoint.y },
  creatureId: c.id,  // NEW
});
```

**NetSnapshot:** `save.ts` `serializeEffectsForNet` / `deserializeEffectsForNet` add creatureId pass-through.

**NET wire compat:** New field is additive. Old clients running JSON.parse + structural typing IGNORE unknown fields. **No SCHEMA_VERSION bump needed.** Council R1 to confirm.

**LOC:** +5 effects.ts, +1 creatureAttack.ts, +4 arcFlash.ts (sig change), +6 save.ts. **Risk:** Tests asserting effect equality may need creatureId added; mitigation: type-checked compile catches.

### P1-13 — characterSprite → videoSprite (cutsceneOverlay private field)
**File:** `src/render/cutsceneOverlay.ts` — lines 60, 11, 228 (delete commented line entirely), 294-297, 361
**Scope FENCE:** `recipes/types.ts` + `voltkin.ts` `characterSprite` recipe-data field STAYS — that's the codex's PNG.
**LOC:** 0 net (rename only) + delete 1 commented-out line.
**Risk:** None — private field, no external consumers.

### P1-6 — Phantom shake gate
**File:** `src/main.ts:683-685`
**Before:**
```ts
if (!world.bonds.has(bondId)) {
  screenShake.trigger(world.tick);
}
```
**After:**
```ts
const arcFlashThisTick = world.effects.some(
  (e) => e.kind === 'ARC_FLASH' && e.tick === world.tick
);
if (arcFlashThisTick) {
  screenShake.trigger(world.tick);
}
```
**Rationale:** Forward-defense — Anvil cleave/AOE may sever bonds without emitting ARC_FLASH. Current code happens to be safe but the invariant is "shake follows ARC_FLASH" not "shake follows bond-disappearance."
**LOC:** +3. **Risk:** Inverse — what if ARC_FLASH emits but bond DOES persist (e.g. visual-only effect)? Today: impossible (creatureAttack.ts only emits on successful SEVER). Forward: if Anvil adds visual-only arc, shake would fire spuriously. Mitigation: keep gate tied to ARC_FLASH-emit which IS the bond-impact signal.

### P1-12 — Replay determinism test
**New file:** `src/state/save.replay.test.ts` (~80 LOC)
**Test strategy:**
1. Seed world with deterministic Spawner + fixed seed
2. Run 1000 ticks → snapshot A
3. Reset; same seed; run 1000 ticks → snapshot B
4. Deep-equal A.creatures, A.bonds, A.freeSparks, A.effects vs B
**Catches:** future Math.random / Date.now / performance.now creep into reducer hot paths.
**Risk:** May FAIL on existing accidental nondeterminism. Mitigation: if any failure, log as P2 finding, do NOT auto-fix in this batch — separate priority next session.

### P1-14 — BACKLOG.md S20-S30 backfill
**File:** `BACKLOG.md`
**Approach (option A — preferred):** Insert 11 single-line entries (S20 through S30) summarizing each session's deliverable + handoff filename. Remove the line-7 staleness note.
**Approach (option B — fallback if line-count blows out):** Add a "Sessions 20-30 — see `.handoff-archive/HANDOFF_2026-05-1{2,3,4}_*.md`" deprecation header.
**Council R1 input:** A vs B preference.
**LOC:** +100 (A) or +5 (B).

### P1-15 — Handoff cleanup
**Action sequence:**
1. Remove 6 IDENTICAL (keep S32diagnostic at root as current-handoff marker):
   - `HANDOFF_2026-05-14_S24close.md`
   - `HANDOFF_2026-05-14_S25close.md`
   - `HANDOFF_2026-05-14_S27close.md`
   - `HANDOFF_2026-05-14_S28close.md`
   - `HANDOFF_2026-05-14_S29close.md`
   - `HANDOFF_2026-05-16_S31close.md`
2. Inspect `HANDOFF_2026-05-13_S23close.md` (DIFFERS): diff root vs archive, keep longer/newer in archive, remove root.
3. `HANDOFF_2026-05-13.md` (NO-ARCHIVE): copy root → archive, then remove root.

---

## RISKS

| ID | Risk | Mitigation |
|---|---|---|
| R1 | P1-11 NetSnapshot wire-compat break for in-flight 1v1 clients | New field additive; old clients ignore. No SCHEMA_VERSION bump. Test pre/post with `save.test.ts` round-trip suite. |
| R2 | P1-10 pseudoRand math drift breaks replay-determinism | Byte-exact preserve via algebraic equivalence proof above. P1-12 replay test guards regression. |
| R3 | P1-12 replay test exposes existing nondeterminism | Log as P2 finding for next session, do NOT auto-fix in-batch. |
| R4 | P1-6 forward-defense gate suppresses valid shake | Tied to ARC_FLASH-emit (bond-impact signal). Existing tests + manual smoke. |
| R5 | P1-7 video frame stutter on tab-visibility change | Council R1 weigh: keep both pumps as defensive OR trust Pixi v8 autoUpdate. Per-commit revert available. |
| R6 | P1-15 DIFFERS handoff loss | Diff before action; archive preserves both versions if needed. |
| R7 | P1-13 rename touches imported references unexpectedly | Field is `private` in cutsceneOverlay class — no external consumers. TS compile-check catches any stragglers. |

## TESTING

- **Baseline:** 576/576 tests green at `1f3247d`
- **New:** `save.replay.test.ts` (~3-5 tests)
- **Expected:** 580+/580+ post-batch
- **Bundle ceiling:** <500KB hard cap (current 467.47KB → 32.53KB headroom; P1 should be net-negative)
- **Manual smoke:** Solo voltkin chain SQ4-TR4 → cinematic → ARC_FLASH × 3-5 → screen shake → despawn. Run with `?debug=1` overlay.
- **1v1 smoke:** Deferred to brother retest session (NOT in this batch)
- **Per-priority commits:** Each priority = 1 commit + push. CI green required before next priority starts.

## ROLLBACK

- 10 priorities = 10 distinct commits → per-priority `git revert` available
- Council R1 Battle Ledger + PRIME-AUDIT delta logged in `.claude/plans/2026-05-16_PDR_Session_33_S32_P1_Audit_Batch.md` (this file)
- If P1-11 breaks NetSnapshot: revert commit, file expanded follow-up PDR for schema versioning
- If P1-12 replay test fires on existing nondeterminism: revert test, log P2 finding

## SUCCESS CRITERIA

1. 10 commits on master, each green CI
2. 580+ tests passing post-batch
3. Bundle ≤500KB
4. Production deploy via auto-push to master succeeds (https://spark-online.space/ HTTP 200)
5. 6+ root handoffs removed; DIFFERS resolved; NO-ARCHIVE archived
6. BACKLOG.md S20-S30 backfill present OR explicit deprecation
7. Reflexion entries logged
8. `boot-snapshot.md` updated for S34

---

## Council R1 — INPUT QUESTIONS (Battle Ledger)

**Q1 (P1-11 schema):** Should ARC_FLASH `creatureId` carry a SCHEMA_VERSION bump in NetSnapshot, or rely on additive-field tolerance?
- Option A: No bump — additive field, old clients ignore (current proposal)
- Option B: Bump SCHEMA_VERSION — explicit version gate

**Q2 (P1-7 video pump):** Drop per-tick `source.update()` keeping `autoUpdate`, or vice versa?
- Option A: Keep `autoUpdate`, drop per-tick (current proposal — trust Pixi v8)
- Option B: Keep per-tick, drop `autoUpdate` (more explicit, less rVFC-dependent)

**Q3 (P1-14 BACKLOG):** Backfill all 11 entries (S20-S30 detail) or deprecate-and-redirect?
- Option A: Full backfill (~100 LOC)
- Option B: Deprecation header + redirect to handoff series (~5 LOC)

**Q4 (P1-10 pseudoRand placement):** Put consolidated `pseudoRand` in `rng.ts` or new `src/state/hash.ts`?
- Option A: `rng.ts` (current proposal — co-located with `mulberry32`)
- Option B: New `hash.ts` (pseudoRand is a hash not a generator — different semantics)

**Q5 (P1-15 S32diagnostic at root):** Keep S32diagnostic.md at root as current-handoff marker, or remove since archive exists?
- Option A: Keep (current proposal — current-session pattern)
- Option B: Remove — `.handoff-archive/` is single source of truth

**Tool/quality challenge:** Verify P1-12 replay test catches a deliberately introduced `Math.random` regression before declaring success.

---

## TRACE LINKS
- S31 PDR (P0 batch, COMPLETED): `.claude/plans-archive/2026-05-16_PDR_Session_31_P0_Audit_Batch_COMPLETED.md`
- BACKLOG: `BACKLOG.md` §Session 32, §Session 33
- Boot snapshot: `boot-snapshot.md`
- Prior handoff: `HANDOFF_2026-05-16_S32diagnostic.md`
