# PDR — S159 BATCH (Full tier)

**Status: APPROVED** — owner, 2026-09-02, mid-turn, verbatim: *"I shall pre-approve this sessions
priority batch as i need to go. work it to the best of your ability in the end making sure everything
has landed as it should have. produce the highest possible quality of outpus in the best interests of
this project and vision. in the end make sure it has all landed and there are no bug/unfinished/open
pathways, inconsistencies, or anything non coherent. fix if you find any. then run end of session
procedures including check and analyze and then finally a methodical and thorough /handoff making sure
you have commited, pushed and deployed everything."*

Tier: **Full** (>30K, 7 priorities, two sim features). Deliberation: **2-round 3-way Council**
(Claude + GROK-PLAN + GEMINI-AUDITOR) — recorded in §7. PRIME-AUDIT in §8.
Parent record: `boot-snapshot.md` (S158) next-steps 3 and 5; R77's deferred-mechanics list at
`.claude/plans-archive/2026-08-22_PDR_S151_BATCH_COMPLETED.md` §"Deferred from R77".

---

## 1. OBJECTIVE

Close the last two unbuilt R77 mechanics (bag navigation aggro; Voltkin chain lightning), kill the two
pieces of session machinery that have been lying to every boot for multiple sessions, record the
owner's own two-workstation measurement, and then sweep the repo for anything unfinished or incoherent
before handing back a game the owner is going to sit down and play.

## 2. SCOPE

| # | priority | tier | why now |
|---|---|---|---|
| **P1** | **Bag navigation aggro** — units walk ACROSS the map to a landed stink bag | Standard | R77's one unbuilt bag property; owner next-step #3 |
| **P2** | **Voltkin chain lightning** (~6 targets) | Standard | R77 deferred mechanic; `VOLTKIN_CHAIN_MAX_TARGETS = 6` already holds the owner's number |
| **P3** | **The HELD-card root cause** | Micro | the pre-handoff gate has printed S155-era items for 2 sessions; root cause found, see §3 |
| **P4** | **Stale plan naming** | Micro | 3 archived plans still named `*_IN-PROGRESS`; pre-flight WARNs about all 3 every boot; their work HAS shipped |
| **P5** | **B1 closure from the owner's own measurement** | Micro | the owner pressed TEST CONNECTION on both workstations and sent the result; it disproves the S158 hypothesis |
| **P6** | **Coherence sweep** (owner mandate) | Standard | *"no bug/unfinished/open pathways, inconsistencies, or anything non coherent. fix if you find any"* |
| **P7** | **The four numbers that are mine, not the owner's** | Micro | each is flagged at its constant; make each coherent and decide the one that is a real design question (recipe overlap) |

**OUT OF SCOPE, and why:**
- **TURN provisioning** — an owner account action (metered.ca + three repository secrets). Code side
  complete and verified since S158 P1.
- **A `CreatureTarget` discriminated union** (GROK's R1 counter-proposal) — rejected on the record,
  see §7; a scope EXPANSION under Rule 16 that the owner has not approved. Held as a debt note.
- **Drone AoE sizing** — `DRONE_EXPLODE_RADIUS = 110` is live and playing; the deferred R77 item is a
  NUMBER ruling, not unbuilt code. Surfaced in the handoff, not silently retuned.
- **N2 raid parity** — needs an owner observation; no sim asymmetry exists to fix (S158 probed it).

## 3. A.0 STATE DISCOVERY (Rule 21) — every row empirically probed this session

| # | claim under test | verifier | result |
|---|---|---|---|
| E1 | the suite is green at the number the handoff claims | `npx vitest run` | ⚠ **3353** passed / 212 files. The S158 handoff claims **3352**. No code changed since. DELTA recorded, not papered over |
| E2 | typecheck clean | `tsc -b --noEmit` | exit 0 |
| E3 | no CI run died silently as `cancelled` | `gh run list --limit 12` | 12/12 `completed success` |
| E4 | no open issues, nothing unpushed | `gh issue list`, `git log origin/master..HEAD` | both empty |
| E5 | the landed bag is a real entity with hp | `grep` | `world.stinkClouds`, `StinkCloudId`, `ehp` serialized REQUIRED + hashed, `damageEntity({kind:'stinkCloud'})`, bursts on death |
| E6 | a unit standing at a bag already attacks it | `creatureAI.ts:610 enemyStinkCloudInReach` | yes (S158 A2). NAVIGATION aggro absent — confirmed |
| E7 | why the tower taunt cannot be reused | `stinkTower.ts:279` + `creature.ts:251` | the taunt writes `targetPrimitiveId`; a tower has an ANCHOR PRIMITIVE, a bag is not a primitive |
| E8 | which `Creature` target fields exist and how they are wired | `creature.ts:205-251` | `targetPos`, `targetBondId`, `targetCreatureId`, `targetPrimitiveId` — parallel nullable fields, chosen deliberately over a union |
| E9 | is a new `Creature` field caught by a forcing function | `stateHashFull.ts:340` | YES — `NoUncovered<Exclude<CreatureF, CreatureHashed>>` breaks `tsc`. ⚠ but `stateHashFull.ts:268` warns in its own words that "ADDING A NAME HERE IS NOT ENOUGH — IT ONLY SILENCES tsc": the projection is a hand-written template with no executable link to the union ⇒ **3 sub-sites** (union, template, per-field contribution test) |
| E10 | can P1 avoid a protocol bump | `save.ts:1197` + `creature.ts:228` | YES. `targetCreatureId` is STRIPPED from the wire and that is exactly why S103 #8 "adds ZERO wire surface and needs NO protocol bump". ⚠ the guard early-returns on ONE field tested by name |
| E11 | does a version-mismatched peer degrade or refuse | `transport.ts:144` + `:194` | REFUSES — mismatched HELLO dropped before parse, peerId latched, all later messages refused. No degraded-play path exists |
| E12 | is there client-side creature prediction | `grep -riE "predict\|clientSim\|localSim\|reconcil" src` | NO — only `botController` predicting a placement target (host-side). Client is snapshot-driven |
| E13 | chain lightning state | `constants.ts:1582` | NOT implemented, recorded as scope; `VOLTKIN_CHAIN_MAX_TARGETS = 6`; VOLTKIN_ATK 3 / PEN 6 |
| E14 | how a per-strike visual reaches the 1v1 client | `render/creatureProjectile.ts:1-46` | ⭐ **RENDER-DRIVEN, DERIVED EVERY FRAME** from state already on the wire — because (a) a new effect kind costs a bump (`deserializeEffect` is an exhaustive switch with no default arm) and (b) a one-shot `world.effects` push is **lost ~5/6 of the time** (effects sampled at 10 Hz, renderer wipes at 60). "Same inputs, same rule, same answer on both peers" |
| E15 | is the other R77 AoE item already done | `constants.ts` | terrorist-goblin AoE SHIPPED (`GOBLIN_SUICIDE_BLAST_RADIUS = 70`, S158 P3); drone AoE radius live at 110 |
| E16 | why the HELD card is stale | `~/.claude/scripts/pre-handoff-review.py:148` | ⭐ ROOT CAUSE: `carry_forward_from_S152 or …S151 or …S150 or carry_forward`. None of the S150–S152 keys exist here; generic `carry_forward` still holds the **S155** list; the LIVE list is `carry_forward_s158_deferred`. A hardcoded chain that cannot see session-suffixed keys |
| E17 | are the 3 `*_IN-PROGRESS` plans really unfinished | `grep` per plan | NO — all shipped later: starter units (`GOBLIN_ARCHER_ATK`, `DefenderKind` includes `stinkTower`), zones (`src/state/zones.ts` 11 KB + `zoneEconomy.test.ts`), castle HP + elimination (`CASTLE_MAX_HP = 1500`, `damage.ts:116` win gate, `gameState.ts:76` fallen/survivors) |
| E18 | the two-workstation split | **owner measurement**, 2026-09-02 | ⭐ NO SPLIT. Both machines on one network: room `KFU2AR`, **2 players connected**, `sync 3/3`, `nostr:7/7`, `torrent:fail`, "Matchmaking: All 7 answered". The only red line is "No relay server" = TURN. The S158 hypothesis (0/7 on the second machine ⇒ firewall) is DISPROVED |

## 4. APPROACH

### P1 — bag navigation aggro
- New parallel nullable **`Creature.targetStinkCloudId: StinkCloudId | null`**, following `creature.ts:237`'s
  recorded rationale verbatim (a union would force a new hash encoding and touch ~18 sites for no gain).
- **Host-only**: stripped from the wire alongside `targetCreatureId`, emitted through the save path.
  **No protocol bump** (E10/E11). `trimMirrorCreature`'s early-return guard moves with it.
- The taunt is written ONLY for a creature that will act on it (the double-gate `stinkTower.ts:279`
  documents), and a **`chewProgress`-glued** creature is left alone — the glue wins, so the owner's
  "6 attacks" invariant is never disturbed (GEMINI R1 #1).
- Hash: all **three** sub-sites (E9).

### P2 — Voltkin chain lightning
- One **pure exported predicate** `chainTargetsFrom(world, voltkin)`: hop set of targets within
  `VOLTKIN_CHAIN_HOP_RANGE` of one another, capped at `VOLTKIN_CHAIN_MAX_TARGETS`, no target twice,
  **lowest-id tie-break**, full ATK/PEN per hop (no falloff — the owner never specified one; flagged
  at the constant as MINE).
- The sim applies damage from it; the renderer draws arcs **from the same function** (E14's
  render-driven channel). Not a `world.effects` push (lost 5/6), not a new serialized field, no bump.
  This answers GROK's R2 press structurally: one function, two callers, rather than a shipped list
  that is stale by up to 5 frames at 10 Hz.
- Adversarial test (GEMINI R1 #3): a Voltkin surrounded by **7 equidistant targets** ⇒ the
  **highest-id** target is the sole survivor.

### P3 — HELD card
- `pre-handoff-review.py`: resolve HELD from the **newest** `carry_forward*` key (session-suffixed,
  numerically ordered) with the generic key as last resort.
- This project's session-state: archive the stale `carry_forward`, drop the moot CF-S157-g (S158 A4
  closed it: `HAZARD_SPAWN_ENABLED=false`).

### P4 — plan naming
Stamp all three with their shipped evidence from E17 and rename to `_COMPLETED` / `_SUPERSEDED`.

### P5 — B1
Record E18 in `TURN_SETUP.md` + session-state; look at `torrent:fail` and either fix or document it.

### P6 — coherence sweep
Repo-wide pass for unfinished pathways, dead flags, half-widened rules, and contradictions between
code and its own comments. Fix what is found; log what is deliberately left.

### P7 — the four numbers
Keep them mine, keep them flagged, and settle the one that is a genuine design question (recipe
OVERLAP after S158's star fix) rather than leaving it undecided in the code.

## 5. TESTING / EXIT GATE

`tsc -b --noEmit` 0 · full `vitest` (≥3353, and every new field carries a test that FAILS if the
field is unwired) · `npm run e2e:gating` **reading the exit code directly, never through a pipe** ·
`npm run build` under the 900 KiB cap · `npm run verify-deploy` **4/4 with content-hash equality** ·
MCV claims verifier exit 0 with per-file `verification[]` bindings (`grep_count` uses `pattern`+`op`+`value`).

## 6. RISKS

1. **The four-sites hazard, twice** — P1 is a wide field. Mitigated by E9's compile-time contract plus
   a binding that each of the three hash sub-sites is verified, and by a test that fails on an unwired field.
2. **P2 divergence between sim and renderer** — mitigated structurally (one pure function, two callers).
3. **A dead target mid-hold** shrinking the drawn arc set — the arrow renderer solves the same class;
   follow its solution rather than inventing one.
4. **Batch size.** Seven priorities. P6/P7 are the ones that shrink first if anything goes wrong;
   P1–P5 are the owner-visible commitments.

## 7. COUNCIL — BATTLE LEDGER (2 rounds, 3 seats)

**R1 GROK-PLAN — REJECT**, 4 challenges. **R1 GEMINI-AUDITOR — ADOPT-WITH-CHANGES**, 3 challenges.

| # | challenge | ruling | evidence |
|---|---|---|---|
| G-C1 | the gating story is broken; a green test can coexist with partial wiring | **UPHELD** — and it made the plan cheaper as well as safer | E9, E10 |
| G-C2 | stop the parallel-nullable pattern, introduce a `CreatureTarget` union | **REJECTED on the record** (measured, not stylistic): `creature.ts:237` already rejected it — a new hash encoding (`n()` expects a numeric id) + ~18 sites for no behavioural gain; `targetPrimitiveId` alone has 159 refs across 48 files. Also Rule 16 scope expansion. **Conceded in R2** | E8 |
| G-C3 | the chain list affects damage ⇒ must be serialized + hashed | **PARTIALLY REFUTED** — `hashWorldStateFull` is TEST-ONLY and compares two SIMS, never host-vs-mirror; damage is already covered by `ehp` + deaths. The surviving worry (one authority, not two derivations) is **ADOPTED** | E14, `stateHashFull.ts:29` |
| G-C4 | a 38-client vs a 39-host rubber-bands; the client prediction layer must respect the field | **REFUTED twice over**, **conceded in R2** | E11, E12 |
| G-R2 | the client arc renderer will re-derive the chain because the authority's list never crosses the wire | **constraint ADOPTED, supporting claim FABRICATED** — it cited draw calls in `src/client`; there is no `src/client` directory and no arc renderer, because the feature does not exist yet | E14 |
| G-order | do P2 before P1 | **REJECTED** — the owner's own next-steps list puts bag aggro at #3 and chain lightning at #5. Risk-ordering is mine to argue; sequencing against the owner's stated order is not | `boot-snapshot.md` |
| M-C1 | `chewProgress` glue vs a bag taunt is undefined | **ADOPTED** — the glue wins, the taunt is not written; the "6 attacks" invariant is never touched | `stinkTower.ts:279` |
| M-C2 | the arc path is transient and never belongs in the save | **ADOPTED**, and sharpened by E14: it is not merely "not saved", it is **derived every frame** | E14 |
| M-C3 | mandate a 7-equidistant-targets test asserting the highest id is the sole survivor | **ADOPTED verbatim** | — |
| M-R2 | classify the chain list `'hashed'`, pack its projection tightly; refactor the trim guard to a Set | **MOOT / ADAPTED** — E14 removed the serialized list entirely, so there is no classification to make. The guard fix is adopted but as an "all stripped fields undefined" early-return, preserving the recorded no-realloc rationale rather than Gemini's guessed key-equality loop | `save.ts:1197` |

**Seat disagreement that consensus would have masked:** GROK said serialize-and-hash the chain, GEMINI
said never serialize it. Both were arguing from the same unstated premise — that the client learns
about a strike from a *message*. E14 shows this codebase learns about strikes by *re-deriving them*,
which satisfies GROK's determinism worry more strongly than its own prescription would have.

## 8. PRIME-AUDIT (Rule 20)

- **Rubber-stamped?** GEMINI's three R1 challenges were adopted fast, so each was re-probed: #1 and #3
  survive; #2's *reason* was replaced by a better one from the code (E14). Its R2 mechanism guess about
  `trimMirrorCreature` (a key-equality loop) is **wrong in detail** — the real guard is a
  `=== undefined` early-return with a recorded no-realloc rationale. Not propagated.
- **Claim-addressed-not-fixed?** G-C2 (parallel-field debt) is genuinely not fixed. It is out of scope
  under Rule 16, so it is logged as a carry-forward debt note rather than waved off.
- **Consensus masking disagreement?** Yes, and named above in §7.
- **Runtime-verifiability (boot-then-smoke):** the P1/P2 claims are pure-sim and are provable by
  vitest; the DEPLOY claims are not, so `e2e:gating` + `verify-deploy` 4/4 with content-hash equality
  are required, exit codes read directly.
- **Materially better than R1?** Yes, and specifically: R1's draft carried a protocol bump 38→39 that
  E10/E11 show is unnecessary, and a serialized chain list that E14 shows would be *worse* than
  deriving it. The deliberation removed work rather than adding it.
- **What remains uncertain:** the 1-test discrepancy at E1 (3353 vs a claimed 3352) has no explanation
  yet. It is recorded, and P6 will look for it rather than assume the handoff simply miscounted.


---

## STATUS: COMPLETED (stamped at the S159 handoff)

All seven priorities shipped, committed and pushed; the live site is verified by content-hash equality
(`verify-deploy` PASS 4/4 at `5e682ac`). Gates at close: `tsc` 0 - **3393/3393** unit tests across 216
files - `e2e:gating` exit 0, 62 passed (run TWICE, before and after the stink-tower sim change) -
bundle 763.9 / 900 KiB - MCV claims verifier **88 bindings, hard_fail=0, exit 0**.

⭐ WHAT THE PLAN DID NOT PREDICT. P6 was the lowest-status priority in the batch and returned the
highest value: the **stink tower was the fourth site of the S158 B2b bug** - the owner's own reported
defect, still live in the FIRST tower a player builds. The plan's own A.0 also carried one FALSE row
(E15 called drone AoE 'a NUMBER ruling, not unbuilt code'; the shape is unbuilt and the owner's stats
are dead), which the sweep corrected. Both are recorded in `analyze_s159` in session-state.
