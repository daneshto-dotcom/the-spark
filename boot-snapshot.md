# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-16 | Session: S146 | Branch: master | PROTOCOL_VERSION: **22**

**S146 shipped two owner-reported fixes, then the owner PIVOTED the game. The loose-spark
"antimagnet" is gone and the castle inventory is now LIMITLESS, counted per shape type
(`SPIRAL x6 · SQUARE x2`) — both live, deploy 4/4. The owner then redefined SPARK as a classical
tower defence via handwritten notes + two hand-drawn maps, and the rest of the session produced the
plan: 40 rulings, a unanimous 3-way Council ADAPT-not-rewrite decision, and an 11-session build spec
written for autonomous execution.**

⛔ **READ THESE TWO FIRST — they supersede BACKLOG.md as the forward plan:**
- `SPARK_TD_BLUEPRINT.md` — the design: owner notes verbatim, both maps, all 40 rulings, the
  adapt-vs-rewrite decision with measured evidence, the current-state audit.
- `SPARK_TD_SESSION_SPECS.md` — the build: 11 sessions, each with objective, exact data model,
  determinism obligations, protocol bump y/n, tests, exit gate, traps. §1 answers every open question.

## Next Steps

1. **START S147 — THE MATCH CLOCK, ALONE.** `BUILD`/`FIGHT` phases, tick-derived (never `Date.now()`),
   serialized + hashed + in `FIELD_COVERAGE`. Step 0 switches OFF the four cut hazards (potato, bomb,
   seagull, rainbow) — cadence to zero, code retained. Gate `tickScoring` to FIGHT; switch off the
   anti-coast leader decay. Full spec: `SPARK_TD_SESSION_SPECS.md` §2 S147.
   **Exit gate:** differential BUILD→FIGHT→BUILD with identical hashes host-vs-worker, plus a host
   migration across a phase edge. Score 0 in BUILD, rising in FIGHT.
2. Then S148 zones + castle anchors + build legality (**re-tune the economy in the SAME session** —
   the haul grows ~2.6×).
3. Then S149 walls + gatherer shelter · S150 castle HP/guns/elimination · S151 towers alive +
   target preference · S152 fix/scrap · S153 projectiles + goblin tower · S154 roster · S155 footer
   · S156 modes · S157+ balance.
4. ⚠ **CF1 still open:** under `?worker=1` click-to-build spends shapes and builds nothing. Opt-in
   only (`WORKER_DEFAULT_ON=false`), zero live blast radius. S146 REFUTED its leading theory —
   `workerSim.ts:218` sets `world.isHost = true`, `netSnapshot` does carry `defenders`, and
   `applySnapshotCore` rehydrates them unconditionally. Needs a runtime probe. Blocks the worker
   flip, not the roadmap.

## Blockers

None blocking S147. Every open design question has an answer in `SPARK_TD_SESSION_SPECS.md` §1,
marked **[OWNER]** or **[CLAUDE — overridable]**.

## Traps (still live)

- **`Date.now()` in sim code is the desync** — everything is tick-derived. 90 s = 5400 ticks @ 60 Hz.
- **Never `Math.random()` in sim code** — seeded `mulberry32` only (R32's random goblin especially).
- **`FIELD_COVERAGE` is a forcing function** — it caught a real miss this session. Never route around it.
- **vitest does NOT typecheck** — run `tsc` before believing a new test file. Bit twice now.
- **A collection's `.length` lies after a shape change** — the inventory tally is length 6 when EMPTY.
- **Anchor-to-anchor doc replacement eats what moved in between** — it deleted 30 rulings this session.
- Under `?worker=1`, `__SPARK__.world` is the RENDER MIRROR — seeding it never reaches the worker.
- Never import a `godlyRecipes/*` module for constants · `nextPrimitiveId` is frozen on a worker mirror.
- Hand-drag placement e2e is flaky — do not bisect a single failure. `e2e-quarantine` failing is EXPECTED.
- Run `/handoff`, never hand-write it. Rebuild before `verify-deploy`.

## Pending Backlog

`session-state.json → carry_forward` (CF1 open; CF2 **superseded** — the cap is deleted; CF3 open).
Owner-gated leftovers now superseded by the pivot: R7 design library, energy-vs-score, the S139
goblin fog questions.

## Recent Reflexion (last 2 sessions)

### S146 (2026-08-16)
`#the-council-told-me-to-delete-the-bots-supply-chain` · `#empirical-refutes-plausible-criticals` ·
`#the-forcing-function-caught-what-i-forgot` · `#length-is-six-even-when-empty` ·
`#my-own-patch-deleted-the-thing-i-was-documenting` ·
`#an-audit-that-only-checks-rulings-misses-the-notes` · `#the-feature-was-already-shipped` ·
`#the-owner-corrected-my-reading-twice-and-both-mattered`

### S145 (2026-08-16)
`#the-workaround-in-the-test-was-a-description-of-the-bug` ·
`#two-features-that-solve-each-other-and-have-never-been-introduced` ·
`#the-council-was-confidently-wrong-about-my-own-codebase-twice` ·
`#my-loop-guard-went-false-after-the-first-iteration` ·
`#vitest-does-not-typecheck-so-my-tests-passed-on-a-type-that-does-not-exist`
