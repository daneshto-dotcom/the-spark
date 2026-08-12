# PRODUCTION DESIGN REPORT — S139 Batch: the free starter units (offence goes live)

**Tier:** Full · **Deliberation:** 3-way Council, 2 rounds + quality gate (Rule 17) · **Gate:** owner
pre-approved 2026-08-11 for a full autonomous run on this batch; `unlock_source: user`.

**A.0 basis:** two Rule-21 sweeps, 16 probes, 722 tool calls, ~3.0M subagent tokens. Sweep 1 (defender /
bank / protocol / art / budget surface): 105 claims, **65 CONFIRMED / 19 PARTIAL / 17 REFUTED / 4
NOT_FOUND**. Sweep 2 (creature / spawner / bond / grant / feed / projectile surface, run *after* the
owner redesign moved the target). Full delta list: `session-state.json → a0_state_discovery`.

---

## OBJECTIVE

Turn SPARK's damage substrate from dead code into a live system, and ship the first free non-godly
starter unit — the Stink Tower — as a playable, deployed feature. Establish the correct substrate for
the goblin producer/unit pair and land it as far as the session honestly reaches, without leaving a
half-wired entity family behind.

## CURRENT STATE

- **The S138 damage substrate is dead code.** `damageEntity` has **zero production call sites**
  (self-verified: `grep damageEntity( src/ --include=*.ts | grep -v test` returns only its own
  definition, `damage.ts:56`). Three live paths bypass it and call `damageCreature` directly:
  `creatures/creatureAttack.ts:103`, `defenders/defenderLifecycle.ts:245`, `world.ts:559`. So the
  integer guard has never fired in production and **every HP number is unvalidated by play** —
  `constants.ts:1197-1199` says so explicitly.
- **`CONNECTOR_HP` and `CHEW_DAMAGE` are dead constants** — zero importers anywhere. `CHEW_HITS` has
  zero *production* importers. The live "5 chews" is three hardcoded literals in
  `voltkin-config.ts:250-254`.
- **No non-godly buildable exists.** `DefenderKind` = `'turret' | 'princess'`; `CreatureType` =
  `'voltkin' | 'chewer' | 'lightningDrone'`; all 5 recipes are godlies.
- **CI:** gating + soak green on current HEAD (rescued this session from a 33-commit-stale red).
  Quarantine lane red — whole multi-peer suite times out. `PROTOCOL_VERSION` = 17.
- Bundle 661.4 KiB / 750 cap (88.6 KiB hard headroom, **28.6 KiB before the WARN band**).
  vitest 2148/2148 across 142 files.

## THE SUBSTRATE DECISION (the load-bearing design call, made on measured evidence)

**Towers = `DefenderKind`s. Units = `CreatureType`s. Neither is a `creatureSpawner`.**

| | why |
|---|---|
| Towers as **defenders** | `Defender` already has `hp` (mutable, serialized non-optional, hashed), `ownerPlayerId` — the *only* ownership identity needing no resolution — and a full 5-state FSM. `TURRET_DEFENDER_MAX_HP = 3000` carries the literal comment *"3 primitives' worth"*, which **is** the owner's "hp of 3 connected shapes". `TURRET_FIRE_INTERVAL_TICKS = 1800` **is** the owner's 30 s cadence, already shipped and playtested. `Record<DefenderKind, DefenderConfig>` is tsc-exhaustive. |
| Towers **not** spawners | **No spawner can be damaged** — no `hp` field, no `damageEntity` arm. Spawners are **net-positive income** (`scoring.ts:168-171` grants `SPAWNER_INCOME_COMPLEXITY` per live spawner), so a consume-3-primitives tower inverts the shipped economic direction. `spawnedCount` **resets to 0 on every load** (`spawner.ts:75`) so a bag count modelled there refills on save/load *and host migration*. Ignition is one-per-frame with pentagram unconditionally pre-empting. And `recipeStillSatisfied` falls through `default: world.primitives.has(anchor)` — a new spawner recipe missing its case arm keeps producing forever with **no compile error and no failing test**. |
| Units as **creatures** | `Creature` already has `hp`, `ownerPlayerId` (non-nullable — every creature is already player-owned), `targetBondId` **and** `targetCreatureId` as parallel nullable fields, `chewProgress`, `killCount`. Per-type `chewHits` already exists in `CreatureConfig`, so the owner's "6 attacks" is a config value, not a new mechanism. |

## SCOPE

### P1 — Switch damage on. *(committed)*

1. **`src/state/creatures/creatureAttack.ts:103`, `src/state/defenders/defenderLifecycle.ts:245`,
   `src/state/world.ts:559`** (modify) — route each through `damageEntity` with a
   `{kind:'creature', id}` target and the 4th `source` arg. Each gains the integer guard. `world.ts:63`
   currently imports `damageCreature` into the reducer barrel; repoint it.
2. **`src/constants.lock.test.ts`** (modify) — currently 24 LOC pinning exactly one value. Add
   `PRIMITIVE_MAX_HP === 1000` (load-bearing for the integer-DoT invariant: 1 % = 10, 2.5 % = 25,
   5 % = 50) plus the **coupled triple** `chewHits` / `attackFireTick` / `attackCadenceTicks`, whose
   invariant is `attackFireTick === chewHits * CHEW_INTERVAL_TICKS`. A.0b established that breaking
   that coupling makes the sever dispatch at `hostTick.ts:451` never fire — the chew loop caps
   silently with the bond intact. That is exactly the class `constants.lock.test.ts` exists for.
3. **`src/constants.ts`** (modify) — mint `DOT_CADENCE_TICKS = 30` (`0.5 s * PHYSICS_HZ`).
   `constants.ts:1184-1191` specifies this model in prose and **never declares the constant**.
4. **Dead-constant honesty** — annotate `CONNECTOR_HP` / `CHEW_DAMAGE` as unimported, or delete them.
   Leaving a constant that reads like the mechanism but drives nothing is how the S137 "5 % per tick"
   footgun happened.

### P2 — The Stink Tower, complete and deployed. *(committed)*

5. **`src/state/defenders/defender.ts`** (modify) — `DefenderKind` += `'stinkTower'`; new
   `STINK_TOWER_CONFIG`; add the `Record` row. **Also widen the second, duplicated union at
   `src/state/godlyRecipes/types.ts:138`** — inlined to break an import cycle, mentioned in no design
   doc, and every new recipe fails to typecheck at its `defenderKind:` property until it is widened.
6. **`Defender.bagsRemaining: number`** (new serialized field) — bags are **ammo**, per the owner
   ruling. Serialized deliberately: A.0b proved a count derived from spawner-style state refills on
   every load. Forced edits: `SerializedDefender`, `serializeDefender`, `deserializeDefender`, the
   `DefenderHashed` union + hash emit (tsc-forced by `NoUncovered`).
7. **`src/state/defenders/stinkTower.ts`** (create) — the whole behaviour, in its own module rather
   than inline in the already-313-LOC `defenderLifecycle.ts`:
   - **Throw** one bag every `STINK_THROW_INTERVAL_TICKS` (= `TURRET_FIRE_INTERVAL_TICKS`, 1800) at
     short range, decrementing `bagsRemaining`.
   - **Depleted state** at 0 bags: passive stink aura on the `DOT_CADENCE_TICKS` cadence, authored as
     an integer % of max HP, **plus an aggro pull**.
   - **Death blast scaling with `bagsRemaining`** — the owner's "bigger cooler explosion".
   - **Owner filter**: bags never damage the owner's own towers.
8. **`src/state/radialDamage.ts`** (create) — the missing radial-collect → per-target `damageEntity`
   bridge. **`applyRadialClear` must not be reused**: it *deletes* rather than damages and its
   prim-victim loop accepts no predicate, so it would one-shot every primitive in radius *and*
   friendly-fire the owner's own shapes. Copy its sorted-id iteration discipline, not its body.
9. **Burst directions** — pure function of `(defenderId, tick, index)` via `pseudoRand(seed, index)`
   (`state/rng.ts:61-67`, whose `index` param is documented as exactly this differentiator). **Not**
   `Math.random`, **not** the seeded RNG stream (draw-order perturbation is a documented desync
   hazard), and **not** `gathererMorphShape`/`keepRainbowTint` — the amendment cites those, but both
   are render-only and rest their purity argument on being cosmetic.
10. **`src/state/godlyRecipes/stinkTower.ts`** (create) — a 4-shape **defender** recipe. The defender
    path is switch-free and generic (`findDefenderMatches` iterates the registry; `stillValid` is
    delegated), so registration + `GodlyId` widening + one `CODEX_COPY` entry is the whole wiring.
    `CODEX_COPY` is **string-keyed**, so tsc will *not* catch a missing entry — the fallback renders
    `'???'`. Must supply `stillValid` explicitly.
11. **`src/render/stinkTowerRenderer.ts`** (create) — procedural, modelled on `turretRenderer.ts`
    (153 LOC, no texture / manifest / async load / fallback branch). Bags visibly deplete; sag when
    empty. **No atlas this session.** Also: both existing defender renderers are *exclusion* filters
    with no registry, so a new kind renders as **nothing** with no compile error — this renderer plus
    its 4 `main.ts` wiring points is what prevents that.
12. **Held state, not one-shot effects, as the client channel.** A one-shot `world.effects` push is
    lost ~5/6 of the time (10 Hz snapshot vs per-frame wipe). A 30 s throw and the out-of-ammo state
    must ride **held entity state**, per the shipped `DEFENDER_FIRE_HOLD_TICKS = 12` precedent.
13. **Motion posture, explicitly.** `defenderLifecycle.ts:126` pins/freezes only `'turret'` and
    `:229/:253/:261` freeze only `'princess'`. A third kind is **neither** — its Verlet `prevPos` is
    never reset while striking, so it drifts, and `prevPos` **is hashed** ⇒ replay/desync-visible.
    `stinkTower` joins the turret pin branch.

### P3 — Goblin units + producer towers. *(stretch; attempted in order, not committed)*

14. Two `CreatureType`s + two `DefenderKind` producer towers + a `FEED_TOWER` intent + the per-match
    free grant. **Eight A.0b traps must each be handled explicitly** — see RISK ASSESSMENT. I do not
    claim this fits after P1+P2; it is attempted only if P1+P2 are green, shipped and verified.

### P4 — `PROTOCOL_VERSION` 17 → 18 + stale literals + deploy. *(committed, runs last)*

15. One bump covering every serialized change actually landed. Edit sites: `protocol.ts:120`,
    `protocol.ts:174` (the `readonly protoVersion` tsc tripwire), `protocol.test.ts:76,:330`,
    `hostmigD2.protocol.test.ts:31`, `successionWarrant.test.ts:130`.
16. **Fix three stale e2e literals in the same change** — `smoke.spec.ts:643` asserts `'v15'` (two
    bumps stale, despite `:642` carrying an explicit warning), `:667` sets override `16` for a test
    titled *"Newer-version joiner (v16)"* which now exercises the **older**-peer branch (the defect
    S133 P2 fixed has recurred), `:680` `'v16'`.

## NO CHANGES TO

The build space, `CASTLE_BANK_CAP`, the castle panel, `slotOrigin`/`BANK_STRIP_H`, R3/R6/R7, the design
library, `origin/gh-pages`, the sim-worker default-on flip, `CarryingPlayer`, `placePrimitive`'s
throw-on-guard contract, the LOCKED §VIII.4 sever rule, `findNearestEnemyCreatureFrom` (a new sibling
is added; the original is untouched to preserve tested Voltkin replay guards), any atlas or veo art,
the quarantine-lane multi-peer failure, and the `rebuildAuthorityAllocators` banked-`SparkId` hole.

## RISK ASSESSMENT

| # | risk | mitigation |
|---|---|---|
| R1 | **A new `DefenderKind` renders as nothing, silently.** Both renderers are exclusion filters; `main.ts` wires two concrete instances with no registry. | Scope item 11 + its 4 `main.ts` wiring points. Verified by looking at the render, not by state assertions. |
| R2 | **A third kind drifts during WINDUP/FIRE/RECOVER** — neither pinned nor frozen; `prevPos` is hashed ⇒ desync. | Scope item 13: join the turret pin branch. Asserted by a real-physics test, not a state read. |
| R3 | **Killing the tower razes its anchor** (`damage.ts:112-122`) — required, because `runDefenderIgnition` re-mints any recipe match whose anchor still stands, so a plain delete yields an immortal tower that returns on the next bond formed anywhere. | Keep the shipped behaviour; test that a destroyed tower does **not** resurrect with a full 5 bags. |
| R4 | **`applyRadialClear` looks like the AoE helper and is a trap** — deletes instead of damaging, no predicate on prims. | Scope item 8: new bridge module. Test that a 1000-hp primitive in radius **survives** a stink blast. |
| R5 | **`bagsRemaining` not serialized ⇒ ammo refills on load/migration.** | Serialize it (item 6); test a save/load round-trip preserves the count. |
| R6 | **A 4th `CreatureType` is invisible and un-typechecked** (8 non-exhaustive `c.type ===` branches, zero switches). P3 only. | Triage all 8 explicitly; add a renderer before any behaviour. |
| R7 | **`applySpawnCreature` ignores `creatureType` on the null-spawner path** — a free goblin silently spawns a Voltkin. P3 only. | Fix the branch before granting anything; pin with a test asserting the spawned `type`. |
| R8 | **The type-blind max-1-per-owner gate** blocks the 2nd free unit *and* the player's Voltkin. P3 only. | Make the gate type-aware; pin both directions. |
| R9 | **Provenance-keyed combat/AI/repulse/raid** (`sourceSpawnerId === null` is overloaded as "is a Voltkin" in ≥5 places). P3 only. | Introduce an explicit predicate rather than widening the provenance test. |
| R10 | **The match-start seed is NOT host-only** — the joiner dispatches its own `START_GAME`, so any RNG, wall-clock, roster-size geometry, or `nextPrimitiveId` consumption desyncs, and id-allocator divergence is **permanent**. P3 only. | Grant units only (never recipes/primitives), zero RNG, `castleAnchor`-derived positions only. |
| R11 | **Bundle**: only 28.6 KiB of quiet headroom. | Procedural renderers only; no atlas. Measure after each priority. |
| R12 | **The 2-peer check cannot be automated** — the only runtime coverage of the version gate is in the quarantine lane, which cannot pass. | Stated as an **owner action**, never claimed as verified. |
| R13 | **A forgotten `CLIENT_INTENT_TYPES_RECORD` row compiles clean, passes every test, works in solo and host, and is silently dropped for a joiner.** `protocol.ts:631` claims a test guards this; **no such test exists**. P3 only. | Add to both records; assert set-equality explicitly. |

## TESTING PLAN

- **Unit**: FSM transitions per kind; throw cadence; bag decrement; depleted-aura cadence; blast
  scaling across all 6 bag counts; owner-filter (own tower unharmed, enemy harmed); the integer guard
  firing on a fractional DoT.
- **Real-physics acceptance** (S136 standing lesson — a state assertion is not evidence): run the
  actual physics loop for several frames and assert the tower does **not** drift while striking. Import
  `PHYSICS_DT` from `physicsLoop.ts`, never re-derive it — `constants.ts` does not export it and a test
  once silently ran on `NaN` (S138).
- **Determinism**: `hashWorldStateFull` identical host vs `?worker=1` with towers live, via
  `workerSim.differential.test.ts`.
- **Save/load + migration**: `bagsRemaining` survives a round-trip; a razed tower does not resurrect.
- **Regression**: full vitest (baseline 2148), `tsc` 0, `e2e:gating` 32/0, bundle under cap.
- **Look at the render** — legibility cannot be asserted from state.
- **Owner action on return**: two-browser 2-peer check of the v18 HELLO.

## TOOL TRIAGE

- **Visual output needed?** No new generation. Procedural renderers only; atlases are a later session,
  and the S137 spike has motion clips for only 1 of 3 units anyway.
- **Research / external data?** No — everything needed is on disk and A.0 read it. Council uses Grok +
  Gemini for deliberation, not research.
- **Artifact delivery?** No — the deliverable is shipped code plus a handoff.

## DIFFERENTIAL_TEST_REQUIRED: true
Touches host-authoritative sim state and a serialized entity field.

## HOT_PATH_REFACTOR: true
Rewires the live damage path for three existing callers.

## EST: ~120K committed (P1+P2+P4) · MODEL: claude-fable-5 (ALWAYS-STRONGEST)

═══ GATE: owner pre-approved 2026-08-11 — pending Council + PRIME-AUDIT before execution ═══
