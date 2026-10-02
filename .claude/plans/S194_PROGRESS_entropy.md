# ⭐ S194 T6 — ENTROPY TAX — PHASE 2 FINAL REPORT (option A, R194-18) — DONE

- **Tip:** see `git log -1` on `s194/entropy` (this commit). Master merged at `fcfb9d74` (= master 3e96ccda, fast-forward content, NO conflicts).
- **Gates (exit codes captured into files under `.tmp-gates/`):** `npm run typecheck` **0**. `npx vitest run --maxWorkers=3` **0** — **521 files passed / 4 skipped, 7871 tests passed / 11 skipped**. `npm run build` **0** — entry **1122.9 KiB** (cap 1250, 127.1 KiB headroom), **+1.0 KiB** over the 1121.9 baseline in the rules. e2e NOT run: no UI surface beyond the existing toast copy.
- **Protocol bump: YES.** It adds a new `cause` value `'entropy'` on `BOND_SEVERED`/`SEVER_BOND`, and canon §4/§6 say a new cause always costs a bump. The S186 test fails: an old-build host would not roll the tax and a new one would. On host migration between builds the tax would turn on or off mid-match, and a stale client would show the wrong toast for the new cause.
- **What shipped:** `src/state/entropy.ts` (`ENTROPY_FREE_CONNECTORS` 10, `ENTROPY_RATE_PER_CONNECTOR` 10/10 000 = **+0.1 % — RULED R194-18 "mean +0.1%"**, `ENTROPY_CAP` 5 000/10 000 = 50 %, `entropyChance`, `entropyRoll` = mix32(mix32(rngSeed, wave), bondId) % 10 000, `planEntropy` (components enumerated in total order from a snapshot), `applyEntropyTax`). It is hooked ONCE in `hostTick.ts`, in the BUILD→FIGHT arm inside `if (flipped)`. There is no endgame/monster exemption, and none is forced by the code. Every bond cut goes through the real `applySeverBond`.
- **Every consumer of the cause union was visited:** the three unions (`effects.ts`, `save.ts`, `world.ts`). `severActor` (exhaustive) → no actor. `canSeverBond` → bypass. `severToastCopy` (tolerant default) → "ENTROPY: N CONNECTOR(S) SNAPPED", checked before the actor arms. `audioManager` → explicit silent arm. Untouched: `godlyMatcherCore` (only `'player'` counts as a topology change; entropy behaves like `'unit'`, and the recipe poll catches the breaks). `save.ts` passes the cause through unchanged.
- **Tests** (`src/state/entropy.test.ts`, 11):
  - arithmetic derived from the constants (54c 4.4 %, 145c 13.5 %, cap at 510);
  - the "why" fight: 20 goblins fell 0 connectors of 145c;
  - REACH through the real `runHostTick`. Over 8 fights the 145c blob lost 25, 21, 10, 8, 5, 3, 5, 5 and the 54c blob lost 2, 6, 0, 0, 0, 2, 0, 2. The 10-connector structure lost 0, and the BUILD edge never taxes. The toast text is right.
  - negative: a board of ≤ 10-connector structures loses 0 over 20 fights;
  - plan/snapshot ordering;
  - same seed → same wide hash, and a different seed gives a different plan;
  - host vs `?worker=1`: wide hash every tick across the whistle, with an anti-vacuity check;
  - source guards: one call site, inside the FIGHT arm, the gate bypass, the audio arm.
  - **Mutation-tested:** unhooking the call → 2 red; removing the cap → 1 red; removing the toast arm → 2 red; dropping the wave from the seed → 2 red. Honest gap: removing the `canSeverBond` bypass is caught only by the source guard, because the victim-seat self-sever happens to pass the gate anyway.
  - `entropyResearch.test.ts` retired.
- **Canon:** written on THIS branch. It adds a §2 "THE ENTROPY TAX" subsection (the rule, a table at 10/20/54/145, the measured erosion, determinism, MINE items) and a §4 SEVER-table row. Both are pinned in `canon.test.ts`, which also adds `state/entropy.ts` to the mechanical GATES-2 producer list.

### MINE — owner questions (with my recommendation)
1. Can ANY connector snap, a welded tower's own included (Q4)? → keep **yes** (built that way).
2. Roll once at the FIGHT whistle (Q5)? → keep **yes**.
3. Toast wording "ENTROPY: N CONNECTORS SNAPPED" and **no sound**? → keep. A sound is his audition call.
4. **A snap that SPLITS a structure deletes its smaller side** (the existing sever rule), so a fight can lose more than the roll: wave 2 above rolled 16 and lost 27. That fits *"maybe whole parts of it"* → keep. He should know it.
5. The toast reaches a REMOTE human owner only about 1/6 of the time. This is the existing ruled limitation of every sever toast; host, solo and vs-bots get it every time. → accept for now. A per-seat synced carrier would cost a wire field.
6. Entropy losses are not recorded on the end-of-match stat board (they are not damage). → leave it, or add a "lost to entropy" line later.

### Merge seams
- **T7 `s194/bots-tune`:** bots can now be taught to stop growing a structure past 10 connectors and start a new one. Today their blobs simply erode.
- The bump owner needs to record the new `'entropy'` cause in the protocol.ts docblock/checklist and canon §6.
- Shared files: `hostTick.ts` (FIGHT arm), `severToastRenderer.ts`, `audioManager.ts`, `effects.ts`/`save.ts`/`world.ts` unions, `canon.test.ts` (GATES-2 list + new describe), `SPARK_CANON.md` §2/§4.
- **Test harness note:** a same-type blob of ≥ 12 connectors opens the NONET trial (`sudokuEvent.ts`), which freezes the worker. The fixtures use mixed shape types, and the host loop mirrors the NONET freeze.

### ⛔ FINDING (pre-existing, NOT fixed — outside my file boundary): a client can choose any sever cause
`hostHandlers.ts` → `stampOrReject` / `stampSenderSeat` (`src/net/intentStamp.ts:23`) re-stamps ONLY `playerId` on a client INTENT. `SEVER_BOND` is on the client allowlist (`protocol.ts` `CLIENT_INTENT_TYPES_RECORD`), so a modified client can send `cause: 'unit'`, `'raid'` (and now `'entropy'`). `canSeverBond` then bypasses BOTH the charge gate and the hostility gate, so that client can sever any enemy bond for free. The only legitimate client cause is `'player'` (`controls.ts`; a raid is its own action). **Suggested one-line fix:** in `stampSenderSeat`, force `cause: 'player'` on `SEVER_BOND` intents, plus a test.

### NOT DONE
- e2e (no new screen surface).
- The protocol bump: per the rules, the merge owner does it.

---

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
