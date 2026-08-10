═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-08-11
Session: S138 — the damage substrate, then three owner playtest fixes, then PROTOCOL 16→17
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (2D real-time multiplayer browser game) · https://spark-online.space
- Working directory: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Git branch: `master` · Latest commit: `0067e6f` chore(s138): ANALYZE complete + gitleaks fix
- Tech stack: TypeScript · Pixi · host-authoritative sim · optional Web Worker mirror · WebRTC ·
  deterministic state hash · Vite · Vitest · Playwright
- Codebase: 142 test files / 2148 unit tests

## CURRENT STATE
- Build: **PASSING** — 661.4 KiB entry, cap 750 KiB, **88.6 KiB headroom**
- Typecheck: **tsc 0**
- Tests: **2148 / 2148** unit · **e2e:gating 32 / 0** (incl. both `?worker=1` smokes, 0 hash mismatches)
- Deployment: **verified 4/4 live** — `index-vSzv8e82.js`, CI `conclusion=success` (checked explicitly)
- Security: **gitleaks clean** on history (907 commits) AND working tree
- MCV: `hard_fail=0 warn=0 exit 0` — 35 typed assertions, 0 unbound
- **`PROTOCOL_VERSION` = 17** (was 16) ⇒ **stale peers are hard-rejected at HELLO; both sides must reload**
- ⚠ **1 commit unpushed** (`0067e6f`) — remote credential HEALTHY, so the count is exact, not a lower bound

## SESSION COST
Model routing data unavailable for this session (`~/.claude/session-model-counts.tmp` not populated).
Context at close: **450,673 / 1,000,000 (45.1% GREEN)**. Cumulative log: `~/.claude/usage-log.csv`.

## THIS SESSION'S WORK

### P1 — the damage substrate (`72e1542`, `190948d`, `c7ec3c0`)
The verified prerequisite blocking the offence goblins and the Stink Tower's destructible bags.
Before this, `damageCreature` was the ONLY damage function in `src/` and nothing else in the game
could be hurt: `DEFENDER_HP` was a `1e9` sentinel, primitives had no `hp`, and `CONNECTOR_HP` is the
*attacker's* `chewProgress` counter, not HP.

- `state/razePrimitives.ts` — extracted FIRST, as a pure behaviour-preserving refactor, and committed
  separately. There was no shared raze path: two ad-hoc `primitives.delete` sites
  (`disruptionManager.ts:188`, `potatoLifecycle.ts:258`) duplicated an identical 4-step contract.
- `Primitive.hp` + `PRIMITIVE_MAX_HP = 1000`. **REQUIRED, not optional** — which immediately caught
  three PRODUCTION sites (`botSpawnerSeed.ts:92,159,180`) that would have minted `hp: undefined`,
  turning every later subtraction into `NaN`. Scale 1000 so the ruled "% of max HP on a 0.5 s cadence"
  DoT model lands on integers (1% = 10, 2.5% = 25, 5% = 50) ⇒ integer damage can't drift.
- `DEFENDER_HP` sentinel → real `TURRET_DEFENDER_MAX_HP` 3000 / `PRINCESS_DEFENDER_MAX_HP` 2000.
  ⚠ **First-pass, unvalidated by play.**
- `state/damage.ts damageEntity(world, target, amount, source)` — THE damage path. `damageCreature` is
  delegated to, never duplicated. Fractional/negative `amount` **throws**, naming the cause.
- ⭐ **Killing a defender razes its ANCHOR.** Verified hazard, not caution: `runDefenderIgnition`
  (`godlyMatcherCore.ts:156-168`) re-registers any recipe match whose anchor has no live defender on
  ANY topology change, so a plain delete yields an **immortal defender** returning on the next
  `BOND_FORMED` anywhere on the board.
- Wire: `hp` additive-optional, emitted only when damaged ⇒ an undamaged board is byte-identical to
  v16, and a pre-S138 save restores at full health. Projected in the WIDE oracle only; the narrow prod
  hash stays `p{id}:{x},{y}`.
- 22 new tests incl. real-physics acceptance through the ACTUAL `solveBonds` substep loop, and two
  that pin the refutation of the Council's central objection.

### P2 — three owner playtest fixes + the bump (`cc4e382`)
Rule 16 scope amendment, raised mid-session after the owner played the live build.

1. **Keeps to the extremities** — `castleAnchor`'s ring `SPAWNER_RADIUS + 150` (275) → named
   `KEEP_RING_RADIUS = 420`. No "starting zone" exists in code, so the radius is the lever. 4 new tests.
2. **The "anti-magnetism" deleted — and it was NOT collision.** `anchorStabilize.ts:9-11` states placed
   primitives are never free-integrated and `resolveCollisions` is spark-only. The real source was
   `STRUCTURE_GROW_IMPULSE` (S13 P2): an OUTWARD verlet impulse written into every primitive of the
   structure on EVERY placement. Constant + application deleted; the visual flash KEPT; `MERGE_IMPULSE`
   (inward) left alone. The 5 tests that PINNED the puff were **inverted, not deleted**.
3. **Bots off the shared quarry** — `pickTargetSpark` scanned all `world.freeSparks`, so bots ran two
   income channels (gatherer→bank AND cruiser→quarry; every seat gets a gatherer, `gameMode.ts:260`).
   Now scoped to the seat's own porch via `isOwnPorchSpark`, plus a new `BotGoal 'PULL'` on the shipped
   `PULL_FROM_BANK`. Safe because `pickTargetSpark` draws `rng()` exactly once (zero on the smart path)
   so filtering can't shift the replay stream, and `BotGoal` has no wire surface.

`PROTOCOL_VERSION` 16→17 for (1): not a new literal but a **shared constant both peers compute from**.

### Close chain
ANALYZE (calibration + retrospective + deviations) · 8 reflexion entries appended, log pruned 58→43 ·
gitleaks self-referential false positive fixed (see OPEN ISSUES) · boot-snapshot regenerated.

## OPEN ISSUES
- ⚠ **1 commit unpushed** (`0067e6f`). Push is operator-confirmed and was deliberately not performed.
- ⚠ **vs-bots is now EASIER** — bots gated on gatherer throughput + the 1.97× longer haul. Needs a playtest.
- ⚠ **The opening economy is SLOWER** — haul 150→295 px with `CASTLE_BANK_CAP` still 5. The ruled raise
  to 12–13 is the counterweight and was deliberately excluded.
- Defender HP (3000/2000) unvalidated by play — nothing dealt damage when they were written.
- CHECK ran **2-way** (CLAUDE + GROK-ANALYST) not the Full-tier Triumvirate: both reviewers timed out at
  120 s on long prompts; Grok recovered on retry, Gemini did not. Every Grok claim was re-verified on disk.
- `.gitleaksignore` had a **self-referential** `generic-api-key` hit (its own comment quoted the pattern
  it suppresses), pre-existing from `d902571d` (S134). Live file fixed; historical blob fingerprinted.
- S135 residuals untouched: SCORE_TIER corner-bloom replay · carried-potato onUp pointer capture ·
  deposit-slot column overflow. No 2-peer/joiner exercise of the castle bank.
- e2e-quarantine lane still red (known `@quarantine-flaky` host-migration D3), non-gating by design.

## BLOCKED ON
- **Owner playtest** of the new keep ring + bot economy (the two consequences above).
- **Owner-gated, standing:** `origin/gh-pages` deletion.
- Three design questions for the starters session — see boot-snapshot "Blockers".

## NEXT STEPS (priority order)
**Immediate**
1. Push `0067e6f` (or tell me to).
2. Playtest the new ring + bot economy; report whether vs-bots is too easy and the opening too slow.

**Short-term**
3. **STARTER DESIGNS — Session A.** The blocker is gone. Extend `DefenderKind` with goblinSword /
   goblinArcher / stinkTower + per-kind config + behaviours on the existing FSM + placeholder art +
   4-shape recipes. **Read §2b of the archived amendment first** — it hands over the API and the three
   open questions.
4. **BUILD SPACE** — full scope: REAL STORAGE, `CASTLE_BANK_CAP` → 12–13 + 5-wide × 3-row regrid, R3
   submenu, R6 control, R7 library. **R4 is already done.**
5. ⚠ **ONE bump covers both** — starters and the build space each force one; do a single 17→18 with a
   deploy + 2-peer check in the same session.

**Medium-term**
6. Bank-cap re-measurement + gatherer retune (`e2e/bank-throughput.spec.ts`), pairs with #4.
7. Sim-worker default-on flip — ⚠ do NOT pair with a new serialized entity family (BACKLOG V6-1.1).
8. V6-2.1 / V6-2.4 are now unblocked (R6 CLOSED) — structure taxonomy + castle HP/repair.

## CHANGED FILES (this session)
```
 48 files changed, ~1,150 insertions(+), ~180 deletions(-)
 NEW: src/state/damage.ts · src/state/razePrimitives.ts · src/state/damage.test.ts
 KEY: src/constants.ts · src/game/primitive.ts · src/state/save.ts · src/state/stateHashFull.ts
      src/net/protocol.ts · src/state/gatherers/gatherer.ts · src/state/castleBank.ts
      src/state/placePrimitive.ts · src/bots/{botBrain,botController}.ts
      e2e/helpers.ts · e2e/castle-panel.spec.ts · .gitleaksignore
```

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **2/2 complete** | 450.7K/1M (**45.1% GREEN**)
- P1 `P1-damage-substrate` — completed — `c7ec3c0`
- P2 `P2-owner-playtest-fixes` — completed (Rule 16 amendment) — `cc4e382`

## REFLEXION ENTRIES (this session)
- `#a-council-fed-a-partial-fact-set-agrees-confidently-and-wrongly` — a partial brief makes a Council
  AGREE, not hesitate; unanimity with my own framing is the weakest signal.
- `#prove-the-guard-dont-read-it` — the field-level hash guard was a docblock claim until I ran it.
- `#the-obvious-suspect-can-be-refuted-by-a-docblock` — "primitives push each other" was never collision.
- `#a-hardcoded-copy-of-a-formula-is-a-time-bomb-with-someone-elses-name-on-it` — the inlined ring formula.
- `#required-beats-optional-because-tsc-becomes-the-auditor` — required `hp` caught 3 production sites.
- `#file_lacks-needles-match-my-own-explanatory-comments` — fired THREE times in one session.
- `#a-test-can-pass-while-running-on-NaN` — `PHYSICS_DT` wasn't where I imported it from.
- `#invert-the-tests-that-pinned-the-behaviour-you-just-deleted` — 5 tests inverted, not deleted.

## CARRY-FORWARD PRIORITIES
None incomplete — both priorities closed. Forward work is items 3–8 in NEXT STEPS; the starters
amendment is archived **IN-PROGRESS** at
`.claude/plans-archive/2026-08-10_SCOPE_AMENDMENT_S137_starter_designs_IN-PROGRESS.md` (design +
art spike + owner rulings done; §2b added this session; NOT implemented).

═══════════════════════════════════════════════════════════
