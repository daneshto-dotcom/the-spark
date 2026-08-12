# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-11 | Session: S139 | Commit: fd48d3d | Branch: master | PROTOCOL_VERSION: **18**

**S139 shipped 3 of 4 priorities: damage went LIVE, and the first free non-godly unit — the GOBLIN —
is in the game and deployed. `PROTOCOL_VERSION` is now 18 — BOTH PEERS MUST RELOAD.**

Deploy verified 4/4 (`index-CGwv_oyg.js`). tsc 0 · vitest **2172/2172** (144 files) ·
e2e:gating **32/0** · bundle 666.9 KiB (83.1 KiB headroom) · MCV **38/38 exit 0** ·
gitleaks clean (913 commits) · Rule 22 audit clean · 0 commits unpushed.

## ⭐ READ THIS FIRST — the finding that should change how you read handoffs

**S138's damage substrate was DEAD CODE.** `damageEntity` had **zero production call sites** for an
entire session. Its only importer in the whole repo was its own test file, while three live damage
paths went on calling `damageCreature` directly. It was typed, serialized, hashed, 22-tests-green,
and documented as "the ONE way anything in the world takes damage" — and the game never called it.
The previous boot snapshot said "the blocker is GONE (P1 built it)", which was true only in the sense
that the function existed.

**No behavioural test could have caught it**: all 22 of its unit tests called it themselves, so every
one passed while the game never reached it. The defect was the *absence of an edge* in the import
graph. `src/state/damage.wired.test.ts` now guards exactly that.

Then I reproduced the same class of bug in the very session that fixed it (see P2 bug #3 below).
**Treat "shipped" as meaning CALLED, not present-and-green.**

## What shipped

- **P1 (`f61928f`)** — damage switched ON. The three bypassing callers
  (`creatures/creatureAttack.ts`, `defenders/defenderLifecycle.ts`, `world.ts`) now route through
  `damageEntity`. `DOT_CADENCE_TICKS = 30` minted (specified in prose since S138, never declared).
  `CHEW_DAMAGE` deleted and `CONNECTOR_HP` annotated as documentation-only — both measured to have
  **zero code consumers**; a bond has no `hp` field at all. `constants.lock.test.ts` gained
  **invariant** tripwires instead of value tripwires, incl.
  `attackFireTick === chewHits × CHEW_INTERVAL_TICKS`, which existed only as a comment beside two
  hardcoded literals.
- **P2 + P4 (`fd48d3d`)** — **THE GOBLIN.** A 4th `CreatureType` that walks to the nearest enemy
  *primitive* and destroys it in 6 strikes; granted free to every seat at match start; fights other
  units. New procedural `goblinRenderer.ts` (no atlas). `PROTOCOL_VERSION` **17 → 18**.

## THREE BUGS FIXED — all silent, none type-checkable

1. `applySpawnCreature` **ignored `action.creatureType`** on the null-spawner path — it called
   `makeVoltkinCreature` unconditionally, so a goblin would have spawned a **Voltkin**.
2. Its population gate was **type-blind** — the free goblin would have silently no-oped every later
   free unit **and permanently blocked that player's Voltkin summon**.
3. ⭐ **Caught by the real-physics test and nothing else could have.** The Voltkin ATTACKING bounce
   aborts when `!bondValid && !creatureValid`; both are false for a structure attacker, so the goblin
   bounced out of ATTACKING *before every strike*. Traced live: entered ATTACKING at tick 112,
   `ticksInState` **still** resetting to 0 at tick 320, target at full hp. It closed distance, played
   the approach, and did nothing. Post-fix: hp 1000 → 833 → 666 → 499, exactly 167/strike.

## WHAT TO DO NEXT (priority order)

1. **⚠ 2-PEER CHECK — only you can do this.** Open two browsers on v18 and confirm the HELLO
   lockstep. The only runtime coverage of the version gate is the e2e **quarantine lane, which is
   fully red** and `continue-on-error`, so CI *cannot* verify it. This is not optional bookkeeping —
   it is the one gate on a protocol bump.
2. **PLAYTEST the goblin** and answer two design questions it raises: (a) every goblin is a permanent
   roaming ~120 px **vision source**, which materially changes fog of war; (b) goblins render **above
   the fog** (following the shipped chewer precedent), so enemy goblins are always visible — sensible
   for a raider, but **unruled**.
3. **THE STINK TOWER** — the deferred P3, next up. All four Council rulings are recorded in
   `session-state.json → carry_forward`; do not re-derive them. Build it as a **DefenderKind, not a
   spawner** (spawners cannot be damaged, are net-positive income, and their `spawnedCount` resets on
   every load so ammo would refill on save/load *and host migration*).
   `TURRET_FIRE_INTERVAL_TICKS` is already the owner's 30 s and `TURRET_DEFENDER_MAX_HP` already
   carries the comment "3 primitives' worth" = the owner's "hp of 3 connected shapes".
4. **BUILD SPACE** — blocked on **two owner rulings that contradict each other** (see Blockers).

## Blockers

- **⛔ TWO OWNER RULINGS POINT OPPOSITE WAYS.** `constants.ts:410-414` carries B4b verbatim: *"THE
  PAIRING IS THE POINT — NEVER TUNE THIS NUMBER APART FROM THE TABLE BELOW"*, plus *"NOT a licence to
  retune the cap on its own"*. The R2 build-space ruling raises `CASTLE_BANK_CAP` to 12–13, at which
  **all six recipes become directly assemblable**, deleting the carve-down tactic the v0.6 pivot
  exists to protect. Needs an explicit override before the build space is built.
- **⛔ R7 (design library) IS NOT IMPLEMENTABLE AS RULED.** The library is per-browser localStorage,
  never serialized/hashed/wired, so peers hold *different* libraries and the host cannot validate "I
  own this design" — contradicting the design's own §5 non-negotiable host-validation contract. A
  design decision, not an implementation task.
- **Owner-gated, standing:** `origin/gh-pages` deletion.

## Traps from S139 (the first two are the same shape)

- **A subsystem can be perfect, tested, and never called.** See the top of this file. The acceptance
  criterion for a new dispatcher/attacker is a named production caller, or an assertion that the
  *target* changed — never that the actor reached a state.
- **The real-physics test earned its place.** A state assertion (is it ATTACKING? has it a target?)
  would have passed on a goblin that never dealt damage. Assert the **effect**, and keep a throwaway
  scratch test that prints state/ticks/distance/hp — it named the mechanism in two minutes.
- **Three hand-synced numbers is not an invariant, it's a wish.** `smoke.spec.ts` asserted `'v15'`
  against a v17 host and had silently inverted a "newer-version joiner" test into the older-peer
  branch — the exact defect S133 P2 already fixed once, invisible because the lane is
  `@quarantine-flaky` and gating grep-inverts that tag. Fixed structurally: one `LOCAL_PROTO_V`, with
  `NEWER_PEER_V` **derived**. When you find a stale constant a prior session already fixed, delete the
  *opportunity*, not the value.
- **A hidden Browser pane can't screenshot, but the scene graph can be interrogated.** rAF is paused
  so the canvas composites nothing (S129 recorded "visual unverified"). Instead I drove
  `app.ticker.update()` by hand and read the graph: `aboveFogLayer` has 15 children, `children[4]` is
  the goblin's `_Graphics` with **19 draw instructions** and 25×27 px bounds. Stronger than a
  screenshot — and it incidentally proved the grant fires live and spawned a goblin, not a Voltkin.
- **Naming CONSUMERS instead of mechanisms tripled the Council's yield.** 5 of 8 challenges adopted
  vs S138's 1 of 8. The S138 retrospective prescribed exactly this; it worked.
- **Distinguish a flake from a regression before reporting either.** `bomb.spec.ts` failed in the full
  lane, passed 2/2 alone, and the next full lane was 32/32.

## Pending Backlog

BACKLOG.md uses a roadmap table. Next slot is the Stink Tower (deferred P3), then the build space
(blocked on the two contradictions above). 15 carry-forwards are recorded in
`session-state.json → carry_forward` — including the fully-red e2e quarantine lane, the migration
`SparkId` collision hole, the `castleBanks` missing per-element hash guard, `npm test` being watch-mode
(so it reports **cancelled**, not failure), and five stale docblocks found but not all fixed.

## Recent Reflexion (last 2 sessions)

### S139 (2026-08-11)
`#a-subsystem-can-be-perfect-tested-and-never-called` · `#pin-the-relationship-not-the-value` ·
`#the-real-physics-test-caught-what-i-had-just-written` ·
`#three-hand-synced-numbers-is-not-an-invariant` ·
`#a-hidden-pane-cannot-screenshot-but-the-scene-graph-can-be-interrogated`

### S138 (2026-08-11)
`#a-council-fed-a-partial-fact-set-agrees-confidently-and-wrongly` · `#prove-the-guard-dont-read-it` ·
`#the-obvious-suspect-can-be-refuted-by-a-docblock` ·
`#a-hardcoded-copy-of-a-formula-is-a-time-bomb-with-someone-elses-name-on-it` ·
`#required-beats-optional-because-tsc-becomes-the-auditor` ·
`#file_lacks-needles-match-my-own-explanatory-comments` · `#a-test-can-pass-while-running-on-NaN` ·
`#invert-the-tests-that-pinned-the-behaviour-you-just-deleted`

Full text: `.claude/reflexion_log.md` (37 tagged entries, under the 50 cap).

## Process deviations (S139)

- **The A.0 sweep's adversarial re-check stage and its synthesis agent ALL died on a spend limit**
  after the 10 probes completed. Probe payloads were recovered from `journal.jsonl` and triaged by
  hand instead. Stated as a deviation, not compliance: single-probe findings carry ONE source. The two
  highest-consequence findings (damageEntity dead; CI red) were personally re-verified with direct
  greps and `gh` calls before being reported.
- **CHECK ran as RALPH:PATROL in-loop plus the PLAN Council, not a separate Full-tier CHECK
  Triumvirate.** The two external seats were spent on PLAN (2 rounds), where they changed the cut
  line; verification leaned on tsc + 2172 tests + 38 MCV bindings + a live scene-graph probe + the
  Rule 22 audit. Stated plainly rather than presented as a full Triumvirate.
- **The owner delegated the cut line** ("full autonomous run on this session priority batch") after
  being told the batch was likely more than one session. P3 was deferred under that delegation, and
  the ordering turned out to be *correct* rather than merely affordable.
