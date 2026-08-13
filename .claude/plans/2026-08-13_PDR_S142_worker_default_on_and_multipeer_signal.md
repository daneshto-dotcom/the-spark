# PDR — S142 BATCH: MAKE THE WORKER PATH SAFE · KILL THE 2-BROWSER TAX · AN HONEST LEDGER

Session: S142 · Tier: **Full** · Branch: master · Protocol at boot: **20**
Status: A.0 COMPLETE · Council pending · owner pre-approved the batch 2026-08-13

---

## ⭐ THE HEADLINE — A.0 KILLED THE PRIORITY AS WRITTEN, AND THAT IS THE POINT

The session opened intending to **flip the sim worker default-on** — a ruling LOCKED for **S129**,
13 sessions overdue, with the owner's playtest already PASSED.

**A.0 proved the flip is unsafe today**, for a reason in **no document**, and the shape of the
defect is the exact lesson S141 wrote down: *it lives in the INTERACTION between two separately
reviewed, individually-correct decisions.*

- `deserializeSpawner` deliberately **re-seeds** a `CreatureSpawner`'s cadence and resets
  `spawnedCount` to **0**. Correct for save/load, where every peer re-derives identically.
- Host-migration TAKEOVER (`main.ts`, `world.isHost = true`) promotes a **client** to host
  **mid-match**, on a fully-populated mirror, with `simWorkerDriver === null` (clients never adopt).

Put together, after a default-on flip the promoted host's **very next frame** satisfies every
adoption condition — `workerFlagWanted` ✓, `!isClientNow` ✓, `PLAYING` ✓, bots gate ✓,
`simWorkerDriver === null` ✓ — so it **adopts the worker mid-match with live spawners**. `restore()`
then re-seeds all four cadence fields (**all hashed** — `:ns :lv :sc :ig`) and resets `spawnedCount`,
which is **not telemetry but a live gameplay cap** (`spawnedCount >= STRUCTURE_SELFDESTRUCT_DRONE_COUNT`).

**Result: oracle divergence + a free extra structure-spawner lifetime for the new host.** Today it
is gated behind an experimental flag almost nobody sets. **The flip makes it universal.**

The `deserializeSpawner` docblock's defence — *"can't desync because every peer re-derives the
cadence identically; the next NetSnapshot re-syncs anyway"* — is **false on this path**: under
worker INIT only **one** side re-derives (the worker restores while main keeps its originals), and
in solo/VS-BOTS **there is no NetSnapshot at all**.

This is precisely the hazard the BACKLOG warned about in the abstract ("flipping makes the
worker-INIT serialization path universal") — but it named the **wrong bug**. The creature-lifetime
and hunter cases it cited are both CLOSED. The open one is the **spawner**, and nobody had it.

---

## A.0 STATE-DISCOVERY — MEASURED, not inherited

⚠ **Process note:** the first 7-agent fan-out died on the individual spend limit with **zero**
recoverable results — **third consecutive session**. Re-run as **3 tight probes** (3/3 landed,
274K tokens) after doing the highest-risk area **by hand first**. That is now the standing pattern.

### Pre-flight 5/5
`0` unpushed · `npm run build` PASS (entry `index-C3JJhc7b.js`, 677.1 KiB, 72.9 KiB headroom;
rebuilt BEFORE verify-deploy per the S141 trap) · `verify-deploy` **4/4** · `e2e:gating`
**36/36** (2.2 m) · `PROTOCOL_VERSION` **20** · `gh run list` 12/12 success, 0 open issues.

### ⛔ PRIME-AUDIT DELTAS — doc vs disk

| # | Doc claim | Actual on disk | Sev |
|---|---|---|---|
| **D1** | `deserializeSpawner`: "can't desync — every peer re-derives identically; the next NetSnapshot re-syncs anyway" | **FALSE under worker INIT.** Only ONE side re-derives; solo/bots have no NetSnapshot. Resets a live gameplay cap. **This is what blocks the flip.** | **CRITICAL** |
| **D2** | BACKLOG: after the flip "the probe harness becomes **refuse-by-default**; that guard must be inverted" | **BACKWARDS, in the UNSAFE direction.** `probeHarness` refuses on `get('worker') === '1'`; with worker-on-by-default the param is ABSENT → guard FALSE → the harness **ARMS while the worker is active**, the exact broken-instrument state it exists to prevent. The stated rationale makes a dangerous defect read as benign. | **CRITICAL** |
| **D3** | Differential test: "the WIDE per-frame compare is only MEANINGFUL if entities in the newly-hashed families actually exist. **Asserted rather than assumed.**" | The assertion is a stale **S133-era sum** never extended. **No test world holds a gatherer, bank, order queue, stink tower or goblin** — every family shipped since S135 is differentially **UNPROVEN while the suite looks green**. One creature satisfies the guard. | **HIGH** |
| **D4** | `stateHashFull`: names `structuralSignature` as an UNFORCED site "that the S135 audit caught being missed" | S141 added `gathererOrders` to FIELD_COVERAGE + hash + save/restore — **but NOT to `structuralSignature`**. A queue mutation is invisible to the mirror until the ~100 ms floor. **The lesson was written down, then repeated on the very next family.** | **HIGH** |
| **D5** | Session-close ritual, every session: "CI cannot verify a bump — the owner must open two browsers." | **FALSE.** `NetTransport.handleRawMessage` is a **PUBLIC seam** whose own JSDoc says it exists to test the receive path *"without a live Trystero room"*, and `window.__SPARK__.netTransport` exposes it in-browser. **And the two real 2-browser protocol-mismatch tests PASS locally in 9.8 s** — they are merely tagged `@quarantine-flaky` and grep-inverted out of the gating lane. | **HIGH** |
| **D6** | S139/S140: the single `LOCAL_PROTO_V` pin makes the inversion "impossible by construction" | True only for `NEWER_PEER_V` (derived). **`LOCAL_PROTO_V` ↔ `PROTOCOL_VERSION` is still hand-synced**, enforced by a comment. This exact link **rotted silently across ~6 bumps** (asserted `v9` while live was `v15`). In-repo precedent to mechanize it: `src/ci.deployGate.test.ts`. | **HIGH** |
| **D7** | Quarantine lane is red because the network/product is broken | **It is BUDGET-INFEASIBLE by construction.** 32 tests × **3 attempts** (`retries: 2` — the job never sets `PW_RETRIES: 0`, unlike soak) × 60–90 s ≫ `PW_GLOBAL_TIMEOUT_MIN: 17`. It could not finish on a perfect network. | **HIGH** |
| **D8** | Carry-forward #13: "`test` is bare `vitest` = WATCH MODE; add a `test:run` script" | `test` is **`vitest run`**; `test:watch` exists separately. STALE — acting on it is a **no-op that would look like shipped work**. | HIGH |
| **D9** | `e2e.yml` header: "Runs on every push to master + every PR" | No `push:` trigger exists — schedule + pull_request + workflow_dispatch only. **The file contradicts itself 6 lines later.** | MED |
| **D10** | `protocol.ts` JSDoc (~20×): a stale peer is "**hard-rejected**", implying ordering | The accept/reject path is strict **equality** (`===`/`!==`). A **newer** peer is rejected by the same branch. Ordering exists only in the UX advice string. | MED |
| **D11** | Carry-forward #1/#2/#3 "NEXT PRIORITY — THE STINK TOWER"; ROADMAP V6-1.3/V6-1.4 show `—`/🔒 BLOCKED | All SHIPPED. The forward plan advertises as unbuilt two slots live in production. | MED |
| **D12** | `waitForWorld` docblock: "Times out at the page's expect timeout" | Times out at its own `timeoutMs = 30_000`. Worse, its **bare `catch {}` swallows the real error** — which is *why no session has ever diagnosed the lane*. | MED |
| **D13** | `probe-relays.mjs`: "probes the relays configured in `src/net/iceConfig.ts`" | It does **not read** `iceConfig.ts` — it declares its own hardcoded list. Agrees today; can drift silently. | LOW |

### CONFIRMED (verifying a true claim is also A.0 output)
6 worker-flag literals / 4 files (S137's correction HOLDS) · `FIELD_COVERAGE` **names AND projects**
all five families — no named-but-UNHASHED family · S141's `voltkinFrames` correction intact ·
stink-tower magazine, gatherer, castleBanks, gathererOrders all **PRESERVED** across save/restore
(the magazine only because `?? 0` was chosen over `?? config.bags`) · `NEWER_PEER_V` genuinely derived.

### NEW (in no document)
**N1** — the flip silently re-points **16 of 21** e2e spec files onto the worker path.
**N2** — **there is no `?worker=0`**; every read is `=== '1'`. No escape hatch, no way to test direct.
**N3** — the flag is parsed **twice, independently** (`main.ts`, `probeHarness.ts`) — D2 is a
*consequence* of that duplication, the same class S141 P3 deleted in the allocator repair.
**N4** — the **gating lane has ZERO multi-peer tests**; all 36 are solo/bots.

---

## OBJECTIVE

Make the sim-worker path **actually safe** before making it universal — fixing the migration/spawner
interaction, the two unforced-serialization gaps, and the guard whose own documentation is
backwards. Then convert the owner's recurring "open two browsers" chore into a CI gate, using a
seam that already exists. Then make the forward plan describe the code that exists.

## CURRENT STATE

- Worker is opt-in `?worker=1`; default-on LOCKED for S129, unbuilt at S142.
- A migration-promoted host would adopt mid-match and desync (**D1**) — latent today, universal after a flip.
- Everything shipped since S135 is **differentially unproven** (**D3**); `gathererOrders` is invisible to `structuralSignature` (**D4**).
- Every networked behaviour sits in a 32-test non-gating lane that **cannot finish** (**D7**), and the owner is the only verifier of every protocol bump (**D5**).

## SCOPE — 3 priorities, 5 + 5 + 4 changes

### P1 · MAKE THE WORKER PATH SAFE, THEN FLIP (Full)
1. **`src/state/save.ts` / worker INIT — the spawner re-seed (D1).** Preserve spawner cadence +
   `spawnedCount` across the worker-INIT restore. Preferred shape: make the bad case
   **unrepresentable** rather than guarded — derive the re-seed decision from *whether this is a
   fresh load or an authority handoff*, asking the world instead of trusting the call site
   (the S141 `destroyDefender` pattern). Alternative considered: refuse adoption while spawners
   are live (weaker — leaves the worker permanently unadopted after a migration).
2. **`gathererOrders` → `structuralSignature` (D4).**
3. **Differential harness (D3)** — seed gatherer, castle bank, order queue, stink tower and goblin
   into the equivalence run; replace the vacuous S133 sum with a **per-family** anti-vacuity
   assertion that fails when a family is absent.
4. **ONE shared worker-flag predicate (D2/N2/N3)** — single source of truth; `?worker=0` opt-out;
   `probeHarness` reads the SAME predicate.
5. **Flip the default** — **conditional on 1–4 green**, plus deliberate `?worker=0` direct-path coverage.

### P2 · MAKE THE PROTOCOL BUMP SELF-VERIFYING (Full)
1. **vitest gate (~15 lines, no network):** assert `LOCAL_PROTO_V` (read from `e2e/smoke.spec.ts`)
   `=== PROTOCOL_VERSION`. Mechanizes the link that rotted across ~6 bumps (**D6**); precedent
   `src/ci.deployGate.test.ts`. Highest value per line in the batch.
2. **Gating Playwright test (~40 lines, NO WebRTC):** drive `__SPARK__.netTransport.handleRawMessage`
   with a synthesized HELLO at `LOCAL-1` and `LOCAL+1`; assert the lobby UX chain in **both**
   direction arms. Covers the **wiring** (handler → `onLobbyError` → `setErrorMessage`) that pure
   unit tests never reach (**D5**).
3. **`PW_RETRIES: 0` on the quarantine job (D7)** — exact S127 precedent; a structurally-failing
   test reproduces identically, so retries buy nothing and cost 3×.
4. **`waitForWorld` stops swallowing the real error (D12).**
5. **`e2e.yml` self-contradicting header (D9).**
   ⚠ Promotion of the two real 2-browser tests to gating is **evidence-gated** on the CI baseline
   run dispatched this session (`31707927282`) — local green is not CI green.

### P3 · AN HONEST LEDGER (Standard)
1. Strike **D8** and **D11** from `carry_forward`; update the ROADMAP "Executed in" rows.
2. Correct **D2** in place **with its true rationale** (a wrong rationale is worse than none).
3. **D10** — stop the ~20 JSDoc sites implying ordered rejection.
4. **D13** — `probe-relays.mjs` reads `iceConfig.ts`; stale `s82-maps` anchors → symbols.

## NO CHANGES TO
Game balance · Stink Tower recipe/constants · `PROTOCOL_VERSION` (**no bump** — P1 changes a
client-local default, not the wire) · `CASTLE_BANK_CAP` / recipe-size table · `origin/gh-pages`
and Pages `build_type` (both OWNER-GATED) · any B5 constant · bot behaviour.

## RISK ASSESSMENT

| Risk | Mitigation |
|---|---|
| **The D1 fix changes save/load determinism** — the re-seed exists for a real reason | Fix targets the *handoff* path only; save/load round-trip tests must stay green; mutation-test the discriminator |
| **The flip degrades a weak laptop** — the passing playtest was a PHONE, and that config is exactly what went untested | `?worker=0` escape hatch ships WITH the flip; failure-fallback already exists; **owner playtest still owed and will be stated, not claimed** |
| **16 specs silently change what they test (N1)** | Full `e2e:gating` before AND after; deliberate direct-path coverage retained |
| **Council unanimity on a finding ≠ a correct fix** (the S141 lesson) | Price diagnosis and prescription separately; refute on disk, not by vote |
| **Fan-out kills the session (3rd consecutive)** | ≤3 agents/invocation, tight prompts, highest-risk area by hand FIRST, verification in a separate invocation |
| **P2 promotion designed on local-only evidence** | Gated on the dispatched CI baseline run |

## TESTING PLAN
`npm run build` (bundle gate) · `npm test` (vitest, 2266 baseline) · `npm run e2e:gating` 36/36
before AND after · differential/equivalence harness with the new families seeded · targeted
`?worker=0` + default-on specs · `npx playwright test <spec> --list` after any spec edit (e2e/ is
outside tsconfig) · **mutation tests**: flip the shared predicate, drop `gathererOrders` from
`structuralSignature`, and revert the spawner discriminator — each must turn a test **red** ·
`npm run build` THEN `npm run verify-deploy` 4/4 (rebuild FIRST).

## TOOL TRIAGE
- Visual output needed? **No** — no art/UI surface changes.
- Research/external data? **Yes** — Council (Grok + Gemini), Full tier.
- Artifact delivery needed? **No** — code + docs in-repo.

DIFFERENTIAL_TEST_REQUIRED: **true** — P1 changes which authority runs the sim for every player.
HOT_PATH_REFACTOR: **true** — P1 touches main-loop authority selection.

ESTIMATED TOKENS: ~220K
MODEL: strongest pinned

═══════════════════════════════════════════════════════════
    GATE: owner approved the batch 2026-08-13 · Council + PRIME-AUDIT pending
═══════════════════════════════════════════════════════════
