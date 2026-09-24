# PDR — S173 BATCH — STATUS: AWAITING OWNER APPROVAL

Tier: **Standard**. A.0 STATE-DISCOVERY: **COMPLETE** (§A.0 — 2 lanes returned by agent, 4 hand-run
after a spend-limit kill; every load-bearing claim re-verified against the tree).

## A.0 STATE-DISCOVERY — what is actually true today

Gates at boot, every one from a captured `$?`:

| gate | exit | detail |
|---|---|---|
| typecheck | 0 | |
| vitest | 0 | 4296 tests / 274 files — exact S172 baseline |
| e2e:gating | 0 | |
| verify-deploy | 0 | 4/4 carriers, live is current |
| check:atlas | 1 | INTENDED — 6 size-mismatch + 9 fringe |

Corrections to premises carried in from the docs:

1. `PROTOCOL_VERSION` is **46** (`src/net/protocol.ts:667`, pinned by `protocol.test.ts:93`).
   Project `CLAUDE.md:141` still says "44 at S167" — stale.
2. The acquisition-census regex is **not** `/ownerPlayerId\s*(===|!==)/`. S172 widened it to
   `/ownerPlayerId\b[^;\n]{0,24}(===|!==)/` to close the cast blind spot.
3. The stale-plan WARN scans `.claude/plans-archive/`, **not** `.claude/plans/` (`pre-flight.sh:81`).
4. `speedMul` ("with varried speed", R141) is **MOVEMENT** speed, not attack speed.

⛔ **PROCESS FAILURE TO RECORD:** the A.0 sweep rode all six lanes on ONE workflow invocation and a
single org spend-limit hit killed six of eight agents. That is precisely the S161 mistake this
project's CLAUDE.md warns about ("size the fan-out so one failure is not total"). The four dead
lanes were re-run BY HAND in this session before this PDR was written — not deferred, not recorded
as "the sweep produced nothing".

## P1 — TOWER HEALTH BARS  (the S172 PARTIAL; the owner's outstanding item)

**OBJECTIVE.** Give every tower the bar Helga now has. Owner: *"all towers should have health bars
... how much they take before their first connector dies."*

**WHY IT IS CHEAP — the pieces exist, and one was written for exactly this:**

- `structureDefenceFifths(n) = n × connectorCapacityFifths(n)` — `src/state/stats.ts:236`. Its own
  docblock says it exists *"so the HUD and the tests can speak their language"*. It has **ZERO
  production callers** (tests only). The MAX half of the bar is already written and never wired —
  the same shape as the S167 `t3TowerAtlasBase` accident.
- `connectorCapacityFifths(n) = n + 4` — `stats.ts:224`.
- `Bond.damageFifths` is the ONLY stored durability state (`physics/bonds.ts:48`), and it is both
  **serialized** (`save.ts:402` type, `:1832` emit-when-nonzero) and **hashed**
  (`stateHashFull.ts:269` union, `:538` projection `:dmg${b.damageFifths}`). A peer sees the true value.
- `componentOf(anchor, primitives, bonds) -> {primitiveIds, bondIds}` — `game/structure.ts:21`.
  Renderers ALREADY call it every frame (`spawnerZoneRenderer.ts:77`), so this is not a new cost pattern.
- `Defender.anchorPrimitiveId` — `defenders/defender.ts:94` — is the entry point.

⇒ **No new wire field. No protocol bump. No four-sites work.** The aggregate is
`max = structureDefenceFifths(n)`, `current = max − Σ bond.damageFifths` over `comp.bondIds`.

**SCOPE.** `src/render/healthBar.ts` (replace `if (stats === null) continue` with the tower arm),
`src/main.ts` (wire a tower sprite-box lookup from `TowerRenderer`), `src/render/healthBar.test.ts`.

⛔ **ONE OWNER AMBIGUITY, AND IT CHANGES THE CODE** — see THE QUESTION below.

**TESTING.** Extend `healthBar.test.ts` (its fault-1..6 structure). Required: a tower at full
connectors draws a full bar; damaging ONE connector visibly shortens it; losing a connector shrinks
the TRACK too (capacity falls with count — the owner's intended cascade); a concealed enemy tower
draws nothing; plus a source-text pin on the `main.ts` wire — S172's lesson is that a missing wire
between two modules cannot be caught by a unit test of either.

## P2 — THE ATLAS REPACK EXPERIMENT  (empirical: either free art, or a proven bill)

**OBJECTIVE.** Settle by measurement how much of `check:atlas`'s red is code-fixable.

**THE FINDING THAT MAKES THIS A PRIORITY.** The handoff says the scarab needs its walk clip
RE-GENERATED because `normaliseStateScale` equalises HEIGHT only. That mechanism is **confirmed**
(`build-sprite-atlas.mjs:322`, `_subject_h`). But S171 changed HOW it measures (commit `6023b98`,
*"measure the BODY, not every opaque pixel — THIS IS THE SCARAB BUG'S REAL CAUSE"*), and:

| atlas | PNG mtime | vs packer fix (2026-09-10 10:39) |
|---|---|---|
| t3-mummies-scarab | 2026-09-10 10:41 | REPACKED AFTER — still 0.73w ⇒ **re-gen genuinely owed** |
| unit-demons | 2026-09-06 09:16 | **predates — a repack has never been tried** |
| unit-vampires | 2026-09-06 09:16 | **predates** |
| t3-nagas-piranha | 2026-09-07 08:30 | **predates** |
| t3-vampires-bat | 2026-09-07 08:30 | **predates** |
| t9boss-vampires | 2026-09-07 23:57 | **predates** |

**5 of the 6 have never been packed with the corrected measurement.** Everything needed is present
locally: source clips (`assets-source/*/clips/`, 6+6 dirs), `atlas-specs.json` with
`normaliseStateScale: true` ALREADY set, numpy 2.4.4 / scipy 1.17.1 / Pillow 12.2.0, ffmpeg 8.1.

⚠ **MTIME IS NOT PROOF** — a `git checkout` touches it. That is exactly why this is framed as an
EXPERIMENT with a recorded verdict, not as a claimed fix.

**SCOPE.** Repack the 5; re-run `check:atlas`; record the delta per atlas. Ship only atlases that
strictly improve. Any that does not improve is recorded as **ART OWED** with its measurement.
⛔ No art re-generation in this priority, and `check:atlas` NEVER gates the deploy.

**TESTING.** `check:atlas` before/after from a captured `$?`, per-atlas numbers in the commit
message. `npm run build` re-measured — the repack changes shipped PNGs and the static payload.

## P3 — THE DOC THAT LIES  (one line)

`CLAUDE.md:141` says `PROTOCOL_VERSION` is 44; it is 46. This project has a standing finding that
*"comments that lie are a defect class"* — one such paragraph lied for sixteen sessions and caused
the S167 accident. Docs-only ⇒ `deploy.yml`'s paths filter correctly triggers no deploy run, and
`verify-deploy` reports "no run is OWED".

## NOT IN THIS BATCH, AND WHY

- **The Pharaoh (P4)** — the code half is real (`framesPerState` scalar → per-state, a per-spec JSON
  value consumed by `build-sprite-atlas.mjs:94,110,149,153,156,179`), but the priority is majority
  ART GENERATION and the owner has asked to be in the loop on art. Needs his go.
- **Vlad's life sap (P9)** — BLOCKED on a mechanic decision, and the cost is worse than it looks:
  every shipped boss ability is Pixi vectors painted into an EXISTING `Graphics`, and
  `bossAuras.ts:93` forbids a new display object because `e2e/tower-art.spec.ts:152` and `:295`
  probe `above.children[6]` / `[11]` by hardcoded index (both CONFIRMED by hand). A generated sprite
  needs the first ability-VFX render seam in the codebase. Also surfaced: the OTHER half of R140
  (conversion-on-kill) has never been built and no document says so.
- **Attack speed** — cadence is `60` on almost everything, `300` on the chewer (a legacy chew span,
  not a speed), `5×PHYSICS_HZ` for the Pharaoh's locust; the only modulation is `rageMultiplier`
  (`creatureLifecycle.ts:979`). Making it a dimension is an owner BALANCE ruling, not a code task.

## ⛔ THE QUESTION THAT CHANGES P1's CODE

His sentence is *"how much they take before their FIRST CONNECTOR dies"*, which reads as the
**weakest** connector — but a health bar conventionally shows the **pool**. These are different bars:

- **(a) POOL** — Σ remaining capacity across the structure. Comparable with every other bar in the
  game; falls in steps as connectors die. **Recommended**, because `structureDefenceFifths` was
  written for exactly this and every other bar on screen is a pool.
- **(b) WEAKEST** — the worst single connector's remaining capacity. Literally answers his sentence
  and predicts the next SEVER — but it is not comparable to a unit's bar, and it jumps UP when the
  weakest connector finally breaks.

One word settles it. If he would rather I just go, ship **(a)** and record the call at the constant.

## GATES BEFORE ANY COMMIT

`npm run typecheck` · `npx vitest run` · `npm run e2e:gating` · `npm run build` · `check:atlas`
(recorded, never gating) · `npm run verify-deploy` — every exit code read from a captured `$?`,
never through a pipe and never from the wrapper's trailing `[exited with code 0]`.
