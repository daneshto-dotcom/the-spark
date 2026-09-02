# SCOPE AMENDMENT (Rule 16) — S159: the owner's two playtest tower faults

**STATUS: APPROVED** — owner, verbatim, 2026-09-02 after playing the S159 build: *"make sure to fix
them THIS SESSION and only then close off the session systematically running a FULL /handoff ... now
those two bugs are extra last priorities to complete! do it"*.

Tier: **Standard**. Parent: `.claude/plans-archive/2026-09-02_PDR_S159_BATCH_COMPLETED.md`.
This is an EXPANSION beyond that batch, so it gets its own amendment — and the URGENCY protocol
applies (the owner's *"wtf?"* and *"it should not be so"* are exactly the signal that makes the scope
gate more important, not less). Both mechanisms were located and grep-verified BEFORE any code.

---

## 1. THE TWO REPORTS, VERBATIM

> **T1.** *"stink tower only plays on his first fight cycle (throwing 5 poop bags to random locations
> at random intervals) and then the next fight he does nothing! Need to restart him each round."*

> **T2.** *"lightning drone tower spawns like 3 drones and then dissapears! wtf? it should not be so.
> he should continuously spawn them at the equal intervals."*

## 2. A.0 STATE DISCOVERY — probed before writing anything

| # | claim under test | verifier | result |
|---|---|---|---|
| E1 | is the stink magazine ever refilled? | `grep -rn bagsRemaining src` | **NO.** Filled once at `defender.ts:368` (`bagsRemaining: config.bags`), decremented once at `stinkTower.ts:194`. Those are the ONLY two writes in `src/` |
| E2 | does any phase boundary reset it? | `grep -rn matchPhase src/state/defenders/*.ts` | **NO** — the only hits are in test files. `state/defenders/` has no phase awareness at all |
| E3 | where COULD it be reloaded? | `hostTick.ts:291` | the BUILD phase-edge block already exists and already does *"Walls up, guns cold, doors open"* (`standDownDefenders`, `releaseShelteredGatherers`, `recallArmies`). Keyed on `flipped` + landed-in-BUILD, documented idempotent, and correct across a NONET double-flip |
| E4 | does a depleted tower still tick? | `stinkTower.ts:193` | yes — `stinkThrowBag` returns false and *"simply falls through to the aura"*. So a reload needs no FSM surgery: the tower is still running its cadence, it just has nothing to throw |
| E5 | why does the drone hub vanish? | `hostTick.ts:491-521` | **BY DESIGN.** It emits `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` (**3**) drones, then on the NEXT cadence slot dispatches `STRUCTURE_SELFDESTRUCT` + `razePrimitives` on its own component + `REMOVE_SPAWNER` |
| E6 | whose design is that? | `.claude/plans-archive/2026-06-28_PDR_S113_Batch_C_…_COMPLETED.md` | the OWNER'S. The PDR calls the hub a *"glass-cannon"*, and R3 records *"Structure self-destruct kills your own build: INTENDED (owner chose owner-agnostic)"*. S157 P0 later refined it to spare the owner's OTHER structures |
| E7 | is there a SECOND teardown path making the hub vanish? | `spawnerLifecycle.ts:109` | **NO.** `lightningHub` re-validates through `isLightningHubComponent`, which S158 B2b already converted to `isStarAt`. The self-destruct is the sole cause |
| E8 | is the PENTAGRAM a fifth site of the B2b component bug? | `pentagram.ts:57` | **NO, and this is worth recording so nobody "fixes" it.** It still has a component-size clause, but a pentagram is a closed RING of degree-2 nodes: you cannot bond anything to a ring node without breaking `p.bonds.size !== RING_DEGREE` first. The size clause is redundant there, not load-bearing. Its geometry protects it |
| E9 | what caps live drones? | `constants.ts:1774` | `DRONE_MAX_PER_SPAWNER = STRUCTURE_SELFDESTRUCT_DRONE_COUNT` — an ALIAS. Removing the self-destruct orphans the number it borrows |
| E10 | where can a hub DEATH blast hook without firing on match end? | `hostTick.ts:421` | the recipe-break branch, whose own comment states the property: *"teardownSpawners clears the map directly and never reaches this branch, so a match-end / title-return mints nothing"* — the same guarantee `awardSpawnerKillReward` already relies on |
| E11 | is "random locations at random intervals" RNG? | `grep -rn "Math.random" src/state` + `stinkLobTarget` | **there is no RNG in the sim** and the cadence is the fixed `STINK_THROW_INTERVAL_TICKS`. So "random" is the OBSERVED effect of the blind-lob fallback + a target scan, not a random call. Investigated as T1b below |

## 3. SCOPE

**P8 (T1) — the stink tower re-arms between fights.**
**P9 (T2) — the drone hub produces continuously, and keeps its blast as a death throe.**

## 4. APPROACH

### P8 — reload on the BUILD edge
`bagsRemaining = config.bags` for every defender with a magazine, inside the existing landed-in-BUILD
block beside `standDownDefenders`. Rationale for the BUILD edge rather than the FIGHT edge:
- the branch already exists and is already documented idempotent + double-flip-safe (E3);
- `stinkTowerRenderer` draws the hanging bag count from `bagsRemaining`, so the player **watches the
  tower re-arm during BUILD** instead of it silently filling at the whistle. Better feedback, same rule;
- it matches the owner's own words — *"restart him each round"* — one full magazine per round.
- ⚠ THE NUMBER IS NOT NEW: `STINK_TOWER_BAGS = 5` is the owner's (*"visibly shoot out all 5 stink
  bags"*). What was missing is a REFILL RULE nobody ever wrote. The refill CADENCE is mine and is
  flagged at the code, with the two alternatives named (a slow BUILD reload; a feed gesture).

### P8b (T1b) — the "random locations" thread
Read `stinkLobTarget` and report what it actually does. **No behaviour change unless a defect is
found**; if it is a defect, it comes back to the owner rather than being retuned in passing.

### P9 — continuous production, blast moved to death
1. Delete the `spawnedCount >= STRUCTURE_SELFDESTRUCT_DRONE_COUNT` arm. The hub then emits on
   `DRONE_EMIT_INTERVAL_TICKS` forever, gated by `underDroneCaps` — which caps LIVE drones per hub, so
   the hub replenishes as its drones fly off and detonate. **That is "continuously spawn at equal
   intervals" with no new machinery.**
2. **Keep the owner's lightning storm — move it to the hub's DEATH** (E10's recipe-break site), which
   is the `stinkDeathBlast` shape one file over. ⚠ THIS IS MY CALL AND IT IS DELIBERATELY THE
   CONSERVATIVE ONE: the owner reversed *"it disappears after 3 drones"*, not *"it has a blast"*, and
   deleting an owner-chosen mechanic that was not complained about would be the expensive
   interpretation. Recorded at the constant so they can strike it in one line.
3. **De-alias `DRONE_MAX_PER_SPAWNER`** — it keeps the value 3 (so the in-flight feel is unchanged) but
   stops borrowing a constant whose meaning has changed.

## 5. TESTING / EXIT GATE

- P8: a tower fires 5, is depleted, crosses a BUILD edge, and fires 5 again — through the REAL host
  tick, not a hand-set phase. Plus: the reload is idempotent across a double flip; a tower built
  mid-FIGHT is unaffected; and a NEGATIVE CONTROL (reload removed ⇒ the second fight throws nothing).
- P9: the hub emits well past 3 (assert ≥ 6 over enough cadences) and still EXISTS; live drones never
  exceed `DRONE_MAX_PER_SPAWNER`; the blast fires on recipe-break death; it does NOT fire on
  `teardownSpawners`; negative control (self-destruct restored ⇒ the hub is gone by drone 4).
- Full gates: `tsc` 0 · full `vitest` · `e2e:gating` **exit code read from a file, never a pipe** ·
  `npm run build` under the charter · `verify-deploy` 4/4 · MCV exit 0 with per-file bindings.

## 6. RISKS

1. **P9 changes a balance the owner tuned in S113** (a burst weapon becomes a factory). Mitigated by
   keeping the live cap at 3 and keeping the blast; flagged for their eye.
2. **A per-BUILD reload makes the stink tower much stronger over a long match.** It is what they asked
   for; the aura is separately 12× weaker since S158 A1, so the net is not a straight buff.
3. `spawnedCount` now grows unbounded on a long-lived hub. It is an existing serialized integer and is
   only compared against caps — no overflow risk at 60 Hz over any real match length.

## 7. DELIBERATION

Micro-tier waiver does not apply (Standard). The owner's directive is explicit and time-boxed
(*"fix them THIS SESSION"*), so the deliberation is the A.0 table above plus the two named design
calls in §4, each recorded at the constant it governs — the S158 A1 precedent for a number that is
mine. Both external seats were run this session on the parent batch and their standing lesson is
applied here: their questions are the value, so the two questions I would have asked them (*does the
blast survive?* and *what cadence?*) are answered in §4 and flagged for the owner rather than buried.

## 8. PRIME-AUDIT

- **Rubber-stamped?** The first read of T2 was "a bug". E5/E6 proved it is the shipped design and the
  owner's own ruling — so the amendment treats it as a reversal to record, not a defect to fix quietly.
- **Claim-addressed-not-fixed?** T1b (the "random" thread) is explicitly investigate-and-report, not
  retune. Said out loud so it cannot be counted as fixed.
- **Consensus masking disagreement?** The owner's two sentences pull in different directions on the
  blast (they want continuous production; they never asked to lose the AoE). §4.2 keeps both and names
  the tension instead of resolving it silently.
- **Runtime-verifiability (boot-then-smoke):** both fixes are phase/cadence behaviour, which a static
  read cannot confirm — so both tests drive the REAL `runHostTick` across a real phase flip, and both
  carry a negative control.
- **Materially better than the first draft?** Yes: the first draft deleted the self-destruct outright
  and would have thrown away an owner-chosen mechanic they had not complained about.


---

## STATUS: COMPLETED (stamped at the S159 handoff)

Both priorities shipped, committed and pushed at `c90b444`; the live site is verified by content-hash
equality (`verify-deploy` PASS 4/4). Gates: `tsc` 0 · **3399/3399** unit tests across 218 files ·
`e2e:gating` exit 0 with 62 passed (exit code read FROM A FILE) · bundle 764.0 / 900 KiB · MCV
**110 bindings, hard_fail=0**.

**What the amendment got right:** it refused to treat T2 as a bug. A.0 E5/E6 found the shipped S113
design and the owner's own R3 ruling behind it, so the fix became a recorded reversal that MOVED the
blast instead of deleting a mechanic nobody complained about.

**What it did not predict:** THREE tests pinned the retired design, not one — including the
anti-vacuity test in `spawnerPhaseGate`, whose detonation coverage had to be RELOCATED to the new
death path rather than dropped. And the P8 fixture failed twice before it worked, both times for
reasons worth keeping: the recipe registry is a side-effect import, and `runDefenderIgnition` is
BUILD-gated by S157 B6, so a fixture that sets FIGHT first gets a world with no tower in it.

**T1b closed as NOT A DEFECT:** *"random locations at random intervals"* is the owner's own S157 B9
ruling, implemented deterministically with `mix32` (never `Math.random`, which would desync the
worker mirror) and uniform over the disc. Recorded so nobody "fixes" it later.
