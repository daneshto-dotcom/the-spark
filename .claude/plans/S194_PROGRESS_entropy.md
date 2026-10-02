# ⛔ PAUSED (owner session limit) — PHASE 2 BUILD (option A WEAR ONLY) — RESUME HERE

**Owner picked A only.** Spec (from the merge owner): free ≤ 10 connectors (`ENTROPY_FREE_CONNECTORS`=10); per-connector snap chance per roll = min(`ENTROPY_CAP` 50 %, rate × (n − 10)); `ENTROPY_RATE_PER_CONNECTOR` integer (per-ten-thousand), default +0.1 % = 10/10000, flagged `⚠ PENDING OWNER: 0.1 % or 1 %` — tests derive from the constant + a test at both values on 54c/145c. Any connector can snap, a welded tower's own included (⚠ MINE). Roll ONCE per FIGHT start; toast to the owner seat "ENTROPY: N connectors snapped". Seeded mix32(rngSeed, wave, bondId); severs via the real SEVER_BOND with a NEW cause `'entropy'`. Endgame waves too. Report the bump (do not edit PROTOCOL_VERSION). Canon §2 paragraph. Turn `entropyResearch.test.ts` into real tests or delete it.

**Half-done:** research done, NO source edited yet for Phase 2. Found:
- hook point: `src/state/hostTick.ts` ~line 598, the `if (world.matchPhase === 'FIGHT') {` arm inside `if (flipped)` (next to `reviveDormantHelgas`).
- cause unions (THREE + render): `src/game/effects.ts:186`, `src/state/save.ts:682`, `src/state/world.ts:245` (action union); consumers: `severBond.ts:149` (exhaustive `severActor` → entropy = no actor), `disruptionManager.ts:82` (bypass gates list — add 'entropy'), `severToastRenderer.ts:136/156/265` (tolerant default — add copy), `audioManager.ts:1941`, `save.ts` deserialize (~2729/2808 — check the cause allowlist), `net/protocol.ts` validators. Grep `'chewer'` file list for the rest.
- toast carrier: unverified — look at severToastRenderer (victim seat on BOND_SEVERED) vs a summary toast.

**EXACT NEXT STEP:** write `src/state/entropy.ts` (`entropyChancePerTenThousand(n)`, `applyEntropyTax(world)`: enumerate components in total order by min bond id from a snapshot, roll per bond, sever ascending id via `applySeverBond(... cause:'entropy', playerId: owner)`), add `'entropy'` to the three unions + every consumer, hook into the hostTick FIGHT arm, then tests.

**Gates last run:** `npm run typecheck` exit 0; `npx vitest run src/state/entropyResearch.test.ts` exit 0 (both at c467ed1a/326f5a7d, Phase 1). No background processes running.

# S194 — T6 ENTROPY TAX — progress (branch `s194/entropy`)

## ⭐ FINAL REPORT — PHASE 1 (research only, NOTHING BUILT — waiting for the owner to pick)

**Status:** branch `s194/entropy`, fast-forwarded from master 18560cd8 with no conflicts. Gates: `npm run typecheck` exit 0; `npx vitest run src/state/entropyResearch.test.ts` exit 0 (1/1). The full suite and the build were NOT run, because only the research test file was added. No game code changed, so the bundle is +0 KiB.
**Protocol bump:** none for this branch as it stands (no game code changed). Any option once built = YES: A/C add a host-only sever with a new `BOND_SEVERED` cause, and B changes the pool every peer computes for its health bars.

### How it works today (checked in the code and measured, not taken from the docs)
- `damageConnector` (`src/state/damage.ts:566`) reads `structurePoolFifths(n)` = **n × (5 + n)** over the WHOLE connected structure (`componentOf`), and that full pool is the price of **one** connector. Damage builds up across the whole structure and drains when a connector breaks. Shapes do not count at all.
- His numbers come out exactly: **145c → 145 × 150 = 21 750** ("twenty thousand"), **54c → 54 × 59 = 3 186** ("three thousand one hundred"). Shown in the welded/freeform card as `CONNECTORS n · <pool> pool` (`characterSheetModel.ts`).
- **Why 20 units can't break one connector:** a melee goblin hits `attackFifths(2,1)` = 12 once a second, and a fight lasts 60 s, so 20 goblins deal 14 400 per fight. That is less than 21 750. Measured through the real `damageConnector` → `severWithCarry` → `SEVER_BOND`: **0 connectors fall** on the 145c lattice, 4 on the 54c lattice, and a 5-connector tower falls in 5 swings. Breaking ALL 145 costs **1 079 670** (~75 such fights) because the per-connector cost is n² (so the total is n³).
- The damage stays (a freeform lattice cannot be FIXed), so the blob does fall eventually, about 1.5 fights for the first connector.
- No tower recipe has more than **9** connectors (measured), so a "free" allowance of 10 never taxes a single tower.

### The options (⚠ the coefficients are MINE)
- **A · WEAR.** Every wave, each connector in a structure bigger than 10 connectors has a small chance to snap, +0.1% for each connector past 10 (cap 25%). Two welded towers (20c): 1% each, about 0.2 lost per wave. **54c: 4.4%, about 2.4 lost per wave. 145c: 13.5%, about 19 lost per wave (21 750 → ~16 500).** Big blobs shrink toward a stable size. Player's choice: one big fragile blob or several small safe towers. Bots: their blobs erode and they waste shapes regrowing them. ~4–6 h (new `entropy.ts` at the fight start, a new sever cause, a toast, tests).
- **B · DIMINISHING RETURNS.** Past 10 connectors, extra connectors still add HP but no more DEF: pool = n × (5 + min(n, 10)). Towers are unchanged. **145c: 21 750 → 2 175, so 20 goblins break ~6–7 per fight. 54c: 3 186 → 810, ~22 per fight.** No dice and no randomness. This changes his ruled ladder (R173-B: HP = DEF = connectors). Bots: their blobs become killable without any bot change. ~2–3 h (`stats.ts` + re-pin ~15–30 tests + canon §2).
- **C · CRUMBLE.** Each wave, a big structure rolls once, at (n − 10)% (max 90%). On a hit its outermost shapes break off, one shape per 20 connectors. **145c/65s: 90%, loses 8 shapes + 19 connectors (→ 16 506). 54c/24s: 44%, loses 3 shapes + 7 connectors (→ 2 444).** Whole chunks fall off, which is visible. ~6–8 h. Weakest of the three: a player can wrap the core in a cheap shell that soaks the losses.

### Recommendation: **A + B together.** B fixes "20 units can't break one connector". A and C only shrink n, and the per-connector cost stays n², so 20 goblins still break 0 on the first wave. A is the entropy he asked for: bigger is riskier, so "build onto this tower or build another" becomes a real choice. If he wants only one: **A** matches his words, **B** fixes his complaint.

### Council (Grok `grok-4.20-0309-reasoning` + Gemini `gemini-3.1-pro-preview`, both answered): **unanimous A + B.** Neither A nor C alone fixes the 0-connectors fight.
Accepted from the critiques:
- (G) A random snap can SPLIT a blob. Two halves are worth far less than the whole (21 750 → ~2 × 5 250), so a split works as a hidden extra tax. Under B this is mild.
- (G/Gk) C's "outermost" invites a shell of cheap shapes. C is ranked last.
- (Gk) A roll seeded only by the match seed + wave is predictable to anyone who reads the code. That is acceptable (host-authoritative), but the seed is open to change.
- (Gk) A alone can spiral on very large blobs (cap 25%).
Rejected:
- "Splitting into ≤10-connector pieces dodges the tax." That is the intended outcome.
- "Ascending-id sever order is exploitable." The rolls are per-bond and independent, so the order does not change which bonds snap.
- "Integer centroid desync." The sim already runs on deterministic float positions.

### MINE — owner questions (each with my recommendation)
1. A, B, both, or C? → **A + B**.
2. Free allowance of 10 connectors (so no single tower is ever taxed)? → **yes, 10**.
3. A's rate, +0.1% per connector past 10, cap 25%? → **yes**, tune after a playtest.
4. Do a welded tower's OWN connectors snap under A, or only the weld/freeform connectors? → **all of them** (his "do I keep building onto this tower" implies the tower is at risk).
5. B breaks R173-B (DEF = connectors) above 10. Does he accept DEF capped at 10? → **yes** (towers are unaffected).
6. When does A roll: at fight start (lose before the fight) or at fight end? → **fight start**, with a toast "entropy: N connectors snapped".

### Merge seams
- `s194/bots-tune` may want a structure-size cap (~10 connectors, then start a new structure) once A lands.
- B touches `stats.ts`, which every pool consumer and canon §2 / `canon.test.ts` read.
- `src/state/entropyResearch.test.ts` is research-only (it prints with console.log). Turn it into real tests or delete it when the build starts.

### NOT DONE (by design)
No mechanic was built: Phase 1 ONLY. Full suite, build and e2e were not run (no game code changed).

## Log
- Boot: rules, canon §2/§7b, CLAUDE.md, Q2 read. `git merge master` = already up to date (0a37175e). `npm install` exit 0.
- NEXT STEP: reproduce 145c/65s and 54c/24s through the real `damageConnector` (research test), then options + Council.
- (correction) `git merge master` fast-forwarded to 18560cd8 (amendment A2), no conflicts.
- Research test `src/state/entropyResearch.test.ts` (exit 0): 145c/65s first connector = 21 750 fifths, 20 goblins x 60 s fell 0; 54c/24s = 3 186, they fell 4; 5c tower = 50, they fell all 5. Option A/B/C arithmetic printed.
- Council run (both models answered); final report written at top. NEXT STEP: STOP — wait for owner pick, then Phase 2 build.
