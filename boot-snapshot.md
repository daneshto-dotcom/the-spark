# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-16 | Session: S145 | Commit: `e76fe5d` | Branch: master | PROTOCOL_VERSION: **21**

**S145 fixed the owner's "the playtest didnt work". The deploy was PERFECT — 0 unpushed, live hash
byte-identical, verify-deploy 4/4, zero console errors — and the game was still unwinnable. Measured
twice in a real browser with no seeding: the castle bank fills in ~46 s and its composition then
FREEZES for 11,449 further ticks, every build tile reading "NEED n MORE" forever, ZERO towers ever
built. A short build tile is now the ORDER button: one click orders the shortfall AND makes room for
it. Owner flow verified end to end — bank jams, one click, tile lights in 15 s, tower built.**

Deploy verified 4/4 (`index-Blrtx25J.js`, confirmed on spark-online.space itself, not just the
github.io URL) · tsc 0 · vitest **2438/2438** (158 files) · e2e:gating **41/41** (was 39/39) ·
bundle 691.5 KiB, charter raised 750 → **900** KiB · MCV 14/14, exit 0.

## ⭐ WHY THE GAME WAS UNWINNABLE (the closed loop)

`pickGathererTarget` runs ONLY in `SEEKING`, and only when the current target is invalid. A gatherer
that reached a full bank sat in `WAITING` holding cargo chosen **before** the player ordered anything.
`WAITING`'s only exit was a successful deposit → which needed a free slot → which only freed by
building → which needed a satisfied bill → which needed a composition change → which needed a
delivery. So `orderForGatherer` could never reach a parked unit. **Measured: ordering the missing type
twice through the real UI left the composition unchanged 60 s later with both orders still queued.**
Freeing a slot by hand did not help either — the parked unit instantly refilled it with the STALE
shape, not the ordered one.

## ⭐ THE TWO FEATURES THAT SOLVED EACH OTHER AND HAD NEVER MET

The S141 gatherer order queue was the remedy for the S144 build-grid deadlock, and grep showed **zero
references between them anywhere in the codebase**. Neither was broken alone. The defect lived in the
gap, which is exactly where no unit test looks.

## WHAT TO DO NEXT

1. **PLAYTEST — click a tower you cannot afford.** It should order the missing shapes, decant your
   bank to the porch, and light up within ~15–25 s. Then click it again to build and drag it out.
2. **⚠ CF1 — click-to-build under `?worker=1` SPENDS YOUR SHAPES AND BUILDS NOTHING.** 4 primitives
   stamped, bank debited, `defenders: []`. PRE-EXISTING S144, invisible because no test ever ran the
   build grid under the worker. Harmless today (`WORKER_DEFAULT_ON` false) — **a hard blocker on the
   worker flip.** Root-cause lead + cheapest discriminator are in `session-state.json → carry_forward`.
3. **CF2 — `CASTLE_BANK_CAP` 7 vs 12–13 is now only a PACING dial.** P1/P2 fixed the mechanism, so a
   full bank is no longer terminal at any cap. `constants.ts` now records what cap 7 measurably cost,
   so the ruling can argue from data. Still yours to make; NOT touched this session.
4. Stink Tower recipe shapes — still a Claude ruling awaiting your blessing or retune.
5. Then: seed `defenders` in the differential harness (last gate on the worker flip — but see CF1
   first, it may be the bigger blocker), or V6-1.5 hero unit → V6-1.6 → V6-1.7 the boredom gate.

## ⚠ TRAPS

- **A green pipeline is not a playable game.** Everything the deploy could check was green while the
  game was unwinnable. When a playtest fails, check the GAME, not the delivery.
- **A test's workaround can be a bug report.** `click-to-build.spec.ts` seeds the bank, and its own
  comment says why: *"a full bank of the wrong mix satisfies nothing."* That sentence WAS the defect,
  written a session before it was diagnosed. `e2e/bank-deadlock.spec.ts` now covers the unseeded path.
- **MCV `file_contains` wants `needle`, NOT `pattern`.** Objects with `pattern` parse fine and every
  priority silently reads WEAK (hard_fail=18). The memory note says "assertion objects" — the KEY
  matters too.
- **vitest does not typecheck.** `SparkType.Pentagon` does not exist; 8 assertions ran green against
  `undefined`. Run `tsc` before believing a new test file.
- **Under `?worker=1`, `__SPARK__.world` is the RENDER MIRROR.** Seeding into it (the
  `stink-tower.spec.ts` idiom) never reaches the authoritative world.
- **NEVER import a `godlyRecipes/*` module for its constants** (S144 trap, still live) ·
  **`nextPrimitiveId` is frozen on a worker mirror** — use `maxPrimitiveId` (S143 trap, still live).
- **Hand-drag placement e2e is flaky** — `bomb.spec` failed once this session and passed on rerun. Do
  NOT bisect a single failure as a regression. **`e2e-quarantine` failing is EXPECTED.**
- **A run-level `cancelled` can hide GREEN jobs** — audit JOB conclusions, never the run.
- **Rebuild before `verify-deploy`.** Run `/handoff`, never hand-write it.

## Pending Backlog

25 entries in `session-state.json → carry_forward` (3 new this session: CF1 the worker ignition
blocker, CF2 the cap now being a pacing dial, CF3 the seeding-hides-failures sweep). Still live from
before: the deferred ranged goblin / producer towers, and the owner-gated set below.

## Blockers (owner-gated — only you can rule these)

1. **`CASTLE_BANK_CAP` 7 vs 12–13** — no longer blocks playability, now a pacing choice (CF2).
2. **R7 design library is not implementable as ruled** (per-browser localStorage cannot satisfy its
   own host-validation contract). A design decision, not an implementation task.
3. **Energy vs score as the currency** (V6-1.6) — `player.energy` still has zero reads.
4. **The S139 goblin** — renders above fog + permanent ~120 px vision source. Unruled.
5. **Stink Tower recipe shapes** — a Claude ruling awaiting blessing or retune.
6. **Q6 bot starvation policy** — last open bot question.
7. Standing: `origin/gh-pages` deletion · Pages `build_type` flip.

## Recent Reflexion (last 2 sessions)

### S145 (2026-08-16)
`#the-workaround-in-the-test-was-a-description-of-the-bug` ·
`#two-features-that-solve-each-other-and-have-never-been-introduced` ·
`#the-council-was-confidently-wrong-about-my-own-codebase-twice` ·
`#groks-strictly-dominating-fix-did-not-fix-it` ·
`#my-loop-guard-went-false-after-the-first-iteration` ·
`#vitest-does-not-typecheck-so-my-tests-passed-on-a-type-that-does-not-exist` ·
`#the-fallthrough-that-kept-an-idle-player-earning-spent-the-slots-an-active-player-had-just-freed` ·
`#the-owner-said-it-didnt-work-and-the-deploy-was-perfect`

### S144 (2026-08-14)
`#the-blob-was-not-ugly-the-towers-were-simply-absent` ·
`#the-call-site-said-structural-the-callee-guard-said-event-driven` ·
`#my-pure-geometry-module-silently-rewired-the-whole-codebase` ·
`#the-strongest-challenge-came-from-the-seat-that-voted-adopt` ·
`#the-render-caught-two-things-thirteen-green-assertions-could-not` ·
`#one-pass-and-one-fail-is-not-attribution` ·
`#my-own-safety-cleanup-made-the-feature-i-was-building-impossible` ·
`#the-getter-lied-and-the-lie-looked-exactly-like-the-bug`
