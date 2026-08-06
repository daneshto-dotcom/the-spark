# PDR S133 — Determinism tripwire + small-items batch

**Tier:** Standard (batch tier = highest member; P1 Standard, P2 Micro)
**STATUS: COMPLETED — P1 + P2 both shipped, CHECKed and pushed (amended: see §AMENDMENT-1)**
**Priority ids:** `P1-determinism-tripwire`, `P2-small-items-batch` (dot-free — a dotted id fails
`validate_priority_id` and the unlock mint silently no-ops)
**Deliberation:** Standard ⇒ MANDATORY 3-way Council (Rule 17). NOT waivable on the user path.
**A.0 STATE-DISCOVERY:** ✅ RUN THIS SESSION, EMPIRICALLY — 12 agents (6 probes + 6 adversarial
audits), 78 findings, 39 deltas, 34 refutations, **4 fabricated citations caught and discarded**.
See §A.0. Every load-bearing claim below was then re-verified by hand by the supervisor.
**User approval:** verbatim `go` on option **C + small items batched in** (determinism gap before any
new per-entity state).

---

## 1. OBJECTIVE

The owner ruled (S130) that a "structure HP + `damageEntity` dispatcher" slot must precede V6-2.1.
A.0 says that slot would land on a determinism surface that **cannot detect the state it is about to
add**, and that the roadmap has been planning against a safety net which does not exist.

So: **make entity state observable to the determinism oracles that already run, and install the
forcing function that stops the next family being omitted silently** — before any V6 slot adds a
third damage model. Then clear the four logged small items honestly, including formally **rejecting**
one that is a resurrected false positive.

This is deliberately NOT the structure-HP slot. It is the prerequisite that slot needs, and it is the
only V6-adjacent work not gated on the owner's playtest.

---

## §A.0 — STATE-DISCOVERY (empirical, this session)

### CONFIRMED — the owner's R6 premise, stronger than written
`.hp -=` occurs **exactly once** in the whole tree (`src/state/creatures/creatureLifecycle.ts:246`).
The only other `hp` write is `d.hp = s.hp` (`src/state/save.ts:1342`) — deserialization, not damage.
`defender.hp` (declared `src/state/defenders/defender.ts:85`, seeded `:182` from config `:133`/`:143`)
is **DEAD STATE**: serialized, wire-shipped, save-restored, never decremented by anything. Primitives,
bonds, freeSparks, spawners, hunters, potatoes, rainbows, seagulls and poops have no `hp` at all.
**Exactly one entity family in the game is damageable.**

### DELTA-1 — `HashableWorld` is blind to every entity family (R1, verified verbatim)
`src/state/stateHash.ts:45-48`:
`type HashableWorld = Pick<World, 'tick'|'primitives'|'bonds'|'freeSparks'|'scoreProgress'|'scoreByPlayer'>`
Six fields. No creatures, spawners, defenders, bombs, hunters, potatoes, rainbows, seagulls, poops,
or fouledPrimitives. A desync in any entity family is invisible to the hash.

### DELTA-2 — the "R1 remedy" treats two non-symmetric levers as symmetric
`structuralSignature` (`src/state/workerSim.ts:251-281`) is a **SIZE-ONLY** fingerprint: `.size` of 15
collections plus a handful of scalars. Its own docblock (`:245-250`) states the contract — *"Collection
sizes catch spawn/despawn; the scalar fields catch the state-machine transitions."* There is **no
per-entity field anywhere in it**, and a mutable `hp` cannot be expressed as a size. Widening it to
per-entity granularity changes its cost model from O(families) to O(entities) at a **per-batch** call
site (`:423`) built specifically to avoid that. ⇒ **These are different tools. The hash is the
per-entity oracle; the signature is the cheap structural one. BACKLOG R1's "add gatherers to both"
is wrong about the signature.**

### DELTA-3 — no forcing function on either site (ABSENCE finding)
`stateHash.test.ts` has exactly 4 `it` blocks and touches only primitives, bonds, scoreByPlayer,
scoreProgress, tick. It never constructs a creature/defender/spawner/hazard and never asserts which
fields are in the `Pick`. `structuralSignature` has **one** assertion repo-wide and it is *negative*
(`workerSim.differential.test.ts:395-397`, "avatar move is NOT structural"). **Adding a family to one
and not the other fails zero tests.** BACKLOG's 17-site registration checklist is documentation-only
here — unlike `benchGate.test.ts`, which BACKLOG itself calls a "hard forcing function".

### DELTA-4 — both existing damage models RESET on host migration
`trimMirrorCreature` (`src/state/save.ts:804-826`) strips `hp` **and** `chewProgress` from the wire as
host-only state (`hp: _h, // S102 — strip damaged-hp from the wire (client rehydrates the config
default)`), and `deserializeCreature` defaults it (`:1528`, `hp: s.hp ?? getCreatureConfig(s.type).hp`).
`netSnapshot()` is what applies the trim (`:768`, confirmed by the note at `:1251`). A client's world
is built by `applyNetSnapshot`, so on takeover the successor becomes authoritative with **creatures
healed to full and chew progress reset to zero**. Since `CONNECTOR_HP` *is* `chewProgress`
(`src/constants.ts:925-926`), **both** of the game's damage models reset. `defender.hp` is the
opposite — non-optional on the wire (`:521`), emitted (`:1316`), restored (`:1342`) — so it survives.
**The two existing hp fields have OPPOSITE migration behaviour, and the new slot would inherit
whichever precedent it copied.**

### CORRECTED BY THE SUPERVISOR — an audit overstatement, recorded because it changed the plan
An audit concluded *"a host-vs-client hp divergence has NO oracle of any kind today."* Too strong.
There is a robust **test-time** differential oracle already running: `hostTick.differential.test.ts`
asserts `hashWorldState` equality between two independently-seeded sims **every tick** (`:523-524`);
`workerSim.differential.test.ts` asserts identity across **300 frames** of live play (`:129`);
`hostTick.replay.test.ts:83` and `save.replay.test.ts:889` assert replay equality. What is missing is
not the harness — it is the hash's **coverage**. This is why the plan below widens the `Pick` instead
of building a new oracle: **four existing harnesses become sensitive to entity desync for free.**
The runtime host↔client check genuinely does not exist (`stateHash` has zero importers under
`src/net/`; no checksum field on the wire) — that stays OUT (§3).

### CORRECTED — the prod call site is real but narrow
`hashWorldState` has one production call site (`src/main.ts:1706`), inside the worker-result handler
and gated on `result.hash !== undefined`. It compares main's mirror to the worker's own snapshot hash —
both derived from one authority — so its own comment is right that it *"validates the APPLY path
only."* Cost of widening therefore lands **only on the `?worker=1` opt-in path today**, but V6-1.1
plans worker-default-on, so the cost must be measured now, not assumed.

### FABRICATIONS CAUGHT (4) — discarded, recorded per the anti-fabrication rule
(1) `voltkin-config.ts` cited as the location of `DEFENDER_HP`/`CONNECTOR_HP`/`CHEW_DAMAGE` — file
exists, zero occurrences of any of the three. (2) `save.ts:245` cited as a no-bump precedent — no
`PROTOCOL_VERSION` token on that line. (3) "Six call sites" for `damageCreature` — three exist.
(4) `hostTick.differential.test.ts:158-216` cited as the defender mirror — that range is the spawner
mirror. **Seventh consecutive session in which a reviewer's mechanism, not just its conclusion, had
to be checked.**

### The four small items, verified
1. **`package.json:13` `"test": "vitest"` — ACCURATE.** Bare `vitest` = watch mode. **CI-safe to fix:**
   no workflow calls `npm test`; `deploy.yml:102-103` already carries a comment warning about exactly
   this and uses `npx vitest run`.
2. **`P2-18 'godly'` — CLAIM IS WRONG; THIS MUST BE REJECTED, NOT DONE.** `BACKLOG.md:836` records it
   was already *"dropped per false-positive pattern (existing comment documents intentional
   back-compat)"*. `src/game/effects.ts:136` says `'godly' kept for back-compat`; the member is
   **wire-serialized** (`src/state/save.ts:369`); and `src/render/severToastRenderer.ts:120` uses a
   deliberately TOLERANT lookup *because* it is in the union. Removing it is a back-compat regression.
   It has been carried across handoffs as outstanding work for multiple sessions.
3. **`e2e/smoke.spec.ts:637` `toContain('v9')` — ACCURATE and stale.** `PROTOCOL_VERSION = 15`
   (`src/net/protocol.ts:101`); `'v15'` does not contain `'v9'`. Genuinely **non-gating**: the describe
   block is tagged `@quarantine-flaky` (`:595`) and `e2e:gating` excludes that tag. Stale prose at
   `:643-644` too. **Also found:** `src/net/protocol.test.ts:300`'s test title says *"PROTOCOL_VERSION
   is 14 after the S113 lightning-drone bump"* — stale title on a **gating unit test**; and
   `HelloMsg.protoVersion`'s changelog docblock (`protocol.ts:143`) stops at S113 13→14, never
   recording 14→15.
4. **`V6-RISK` anchors — real, but cited at the wrong line and bigger than logged.** The claim lives at
   `BACKLOG.md:535-538`, not 518-521. It declares the carry-forward ledger's enforcement "rides three
   carriers", carrier (b) being an in-code `// V6-RISK(Rn):` comment at each risk's anchor. **That
   carrier exists for none of the 23 risks.** The only `V6-RISK` hit in `src/` is `V6-RISK(B3)` at
   `src/dev/probeBootstrap.ts:26` — B-numbered, not R-numbered. A ledger claiming a defence it never
   built is worse than one that claims nothing.

---

## 2. SCOPE — IN

**P1 — `P1-determinism-tripwire` (Standard)**

(a) **Widen `HashableWorld` to cover every entity family**, with the per-entity fields that govern
    determinism — including `hp` and `chewProgress`, the two fields DELTA-4 shows reset today. Sorted
    by stable numeric id, matching the existing insertion-order-invariance posture.
(b) **Install the forcing function.** A test that derives the entity-collection field set from `World`
    and fails when a family is neither covered by `HashableWorld` nor listed in an explicit,
    commented `ACKNOWLEDGED_UNHASHED` set. A future `gatherers`/`castles` family then cannot be
    omitted silently — it must be added or consciously excused. This is the R1 fix.
(c) **Measure the prod cost** at `main.ts:1706` before/after and report it. If the widened hash is
    material on the worker path, keep the narrow `Pick` for the prod oracle and use the wide one in
    the differential harnesses — decide on the measurement, not in advance.
(d) **Pin DELTA-4 with a characterization test** proving creature `hp`/`chewProgress` reset across an
    `applyNetSnapshot` round-trip, so the behaviour cannot drift silently, and so the fix has a
    red-to-green target when it is scheduled.
(e) **Correct the false documentation:** `stateHash.ts:13-23`'s "each side hashes its world and
    compares" framing, BACKLOG R1's symmetric-lever claim (DELTA-2), and the `SPARK_Blueprint.md`
    HashableWorld blindness note.
(f) **Expect existing differential tests to go red** if entity families genuinely diverge. That is a
    discovery, not a regression — report it as the honest starting state (the R11 precedent).

**P2 — `P2-small-items-batch` (Micro)**

1. `package.json`: `"test": "vitest run"`, add `"test:watch": "vitest"`.
2. `e2e/smoke.spec.ts:637` + stale prose `:643-644` → derive from `PROTOCOL_VERSION`, not a literal.
3. `src/net/protocol.test.ts:300` stale title (14→15) + `protocol.ts:143` changelog gap.
4. **`P2-18 'godly'`: formally REJECT.** Annotate `BACKLOG.md:907` with the back-compat grounds and a
   pointer to `:836` so it stops being re-carried as outstanding.
5. **`V6-RISK` carrier:** add real `// V6-RISK(Rn):` anchors for the earliest-biting risks with precise
   code anchors (R1, R5, R10, R12), and correct `BACKLOG.md:535-538` so carrier (b) describes what
   actually exists rather than what was intended.

---

## 3. SCOPE — OUT (carry-forward, nothing dropped)

> ## ⚠ AMENDMENT-1 (Rule 16 scope amendment — authorised in-session by the owner)
>
> **The owner selected "Include the fix (Recommended)" via AskUserQuestion**, overriding
> §2(d)'s characterize-only scope after the Council (Grok + Gemini, 2.75 v 1.0) both called
> characterizing-only indefensible. Therefore, superseding the two bullets below:
>
> - **DELTA-4 IS FIXED, not merely characterized.** `trimMirrorCreature` no longer strips
>   `hp`, `chewProgress` or `targetBondId`. `targetBondId` joins them by necessity, not
>   scope creep: chew progress without the bond it is progress against is incoherent.
> - **§6 ROLLBACK's "no wire, no save format" is therefore FALSE of this commit.** P1 DOES
>   change production wire content. Corrected rollback statement: the change is additive and
>   version-neutral (all three fields were already additive-optional, the deserializer
>   already defaulted them, `parseNetMessage` gates on `schemaVersion` only), so a revert
>   cannot strand a save or a peer — but it is a wire change and must be read as one.
>   Measured cost: **+408 B (+3.3%)** on the worst case, 3,563 B under the 16 KiB ceiling.
>
> **Still OUT, and now precisely characterized rather than vaguely deferred:** the lifecycle
> trio (`sourceSpawnerId`, `despawnAtTick`, `targetCreatureId`). CHECK found the sharpest
> case is worse than a reset — with `despawnAtTick` rehydrating to 0, a promoted client runs
> the lifetime gate and **DELETES every non-persistent creature (every live Voltkin) on its
> first creature tick.** It is NOT fixable by un-stripping, because `serializeCreature` only
> emits `despawnAtTick` for chewers; the fix must change the serializer's emit condition.
> Logged as a carry-forward with that mechanism recorded.

- **The structure-HP + `damageEntity` slot itself.** This PDR is its prerequisite. It stays owner-ruled
  to precede V6-2.1, and its two most interesting dispatch targets (castle, gatherer) do not exist
  until V6-1.1/V6-1.2, both gated on the playtest.
- **A runtime host↔client desync oracle on the wire.** Genuinely absent, and deliberately not built
  here: it is a wire change ⇒ `PROTOCOL_VERSION` bump ⇒ the R15 17-site checklist ⇒ Full tier. And
  **R11 already puts the wire at 2.35× its own 16 KiB ceiling at six seats** — adding a field to a wire
  that is already over budget, before V6-4.2's wire work, would be irresponsible. **Logged as a new
  properly-tiered slot with the R11 constraint attached.**
- **Fixing DELTA-4** (creature hp/chew reset on migration). Characterized here (2d), not fixed: the fix
  is a wire-shape decision that belongs with the same wire-budget work as the oracle above. S102
  stripped these fields deliberately for wire size; reversing that is not a drive-by.
- The push and the probe playtest — owner-only, unchanged.
- `PHASE_1_WIN_SCORE` / `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` ownership (V6-4.3, R-B5).
- Existing carry-forwards from S130–S132 are untouched and remain logged.

---

## 4. RISKS

| # | Risk | Mitigation |
|---|---|---|
| 1 | Widening the hash makes existing differential tests fail | **Expected and desired.** If entity families diverge, that is the bug R1 warned about. Report red-as-found; do not weaken the hash to force green. |
| 2 | Prod hot-path cost at `main.ts:1706` on the worker path | Measure before/after (2c). Two-`Pick` split is the pre-agreed fallback. |
| 3 | The forcing function is itself vacuous | **MUTATION-TEST IT:** remove a family from the `Pick` and confirm the test fails; add a fake family to `World` and confirm it fails. A guard that has not been broken on purpose is not a guard (S131 lost 4 of 4 this way). |
| 4 | Hash value changes could break a test asserting a literal | Verified: no test asserts a literal hash constant — all assertions are relational (`toBe(otherHash)` / `not.toBe`). Re-check during execution. |
| 5 | `chewProgress` in the hash could be legitimately host-only | Then it belongs in `ACKNOWLEDGED_UNHASHED` with the reason written down — which is the point of (b). Decide on evidence. |
| 6 | Bundle/wire deltas | P1 is test+type surface; `stateHash.ts` is already shipped. Report entry-chunk delta and snapshot bytes per the standing gate either way. |
| 7 | Editing `BACKLOG.md` trips MCV | Author the ABSOLUTE-path `verification[]` binding on a **completed** priority at close (bindings on `in_progress` are ignored — fired in S125 and S126). |

---

## 5. TESTING

- `npx vitest run` (**never** `npm test` until P2-1 lands) — expect ≥2001, report the true count.
- `npx tsc --noEmit` → 0.
- **Mutation-test every new guard** (Risk 3): each new assertion must be shown failing against a
  deliberately broken version. Report the mutation matrix as `N applied / N caught`.
- Characterization test for DELTA-4 must be shown **failing** if the strip is removed — proving it
  pins the real mechanism and not a lookalike.
- `npx playwright test e2e/smoke.spec.ts --list` for the e2e edit (`e2e/**` is NOT type-checked).
- Prod-cost measurement for 2c, reported as a number.
- Bundle: `npm run build` + entry-chunk delta vs 645.5 KiB / 750 KiB cap.

## 6. ROLLBACK

Two commits, one per priority, each independently revertable. P1 touches `stateHash.ts` + tests + docs;
no wire, no save format, no `PROTOCOL_VERSION` change, no reducer. P2 is four isolated edits. Nothing
in this PDR alters shipped game behaviour, so a revert cannot strand a save or a peer.

## 7. DELIBERATION

Standard ⇒ **MANDATORY 3-way Council** (Claude + Grok + Gemini), Battle Ledger, ≥3 challenges with
tool/quality challenges mandatory, then **PRIME-AUDIT** before execution. Council must specifically
adjudicate: (i) widen-the-`Pick` vs build-a-new-oracle; (ii) whether `chewProgress` belongs in a
determinism hash or in `ACKNOWLEDGED_UNHASHED`; (iii) whether DELTA-4 should be fixed here rather than
characterized; (iv) whether deferring the wire oracle on R11 grounds is correct or an evasion.
Gemini per memory: `gemini-3.1-pro-preview` passed explicitly (`gemini-2.5-pro` retired). Gemini error
⇒ 2-way; both error ⇒ solo + warning.

## 8. OWNER RULINGS RELIED ON

- **S130:** a structure-HP + `damageEntity` slot precedes V6-2.1 (this PDR is that slot's prerequisite,
  not the slot).
- **S133 (this session), verbatim `go`:** option C — fix the determinism gap before any V6 slot adds
  mutable per-entity state, with the small items batched in.
- **S101 standing:** on a bundle-cap breach, RAISE the charter; never debug around it.
- **Assumption stated:** that `go` approved the recommended option C, not A or B. If that misreads the
  intent, P1 is a single revert.

## 9. EXECUTION ORDER

1. Council + PRIME-AUDIT (gate).
2. P1 (a)→(f), mutation-tested, then commit + checkpoint + reflexion.
3. P2 1→5, then commit + checkpoint + reflexion.
4. End-of-session audit pass (Rule 22), `/handoff`.
