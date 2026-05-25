# IN-PROGRESS — S47 Regression Triage & Latent-Bug Audit

**Status:** S48 EXECUTED — P1-P5 shipped (commits daa750d..3c615a6). Awaiting live 2-peer smoke validation post-deploy. Plan archives after user-confirmed PASS.
**User directive:** No Council. Skip Sym E (#4). Audit all systems where these bugs and "incomplete pathways" can originate. Methodical + pedantic.
**Built from:** Live 2-peer smoke S47 (debug paste + 4 screenshots, host gameState=POSTGAME tick 29431, joiner gameState=PLAYING tick 30613)

---

## 0. EXECUTIVE STATE

Production bundle `index-CchOodwK.js` 490,129 bytes, ETag `6a140afb-77a91`, Last-Modified Mon 25 May 08:40 GMT — matches S46 close. Code shipped, fixes insufficient.

**Confirmed-bug count: 6** (Sym A, B, C, E, G, I)
**Verified non-bug: 1** (avatar pulse boost is intentional)
**Carry-forward: 1** (Sym F, new mechanic, defer to S49)

**Pattern:** 5th consecutive session on the joiner intent path (S43→S44→S45→S46→S47). S46 reflexion rule was correct — the Playwright harness IS the structural fix, but the assertions written so far don't exercise the real-world failure modes. The harness uses synthetic events that don't reproduce client-prediction vs host-rejection divergence, snapshot-lag target-picking, or game-end wire transitions.

---

## 1. SYMPTOM CATALOG (source-cited)

### Sym A — Joiner LMB-drag-release doesn't place primitive

**Observation:** Host (red) places via LMB-drag-release single action. Joiner (blue) must LMB-click to pick up + RMB-click to place (two-step workflow). Joiner debug at tick 28119 shows `P1 kind=Carrying` after LMB — confirms pickup succeeds locally — but the auto-PLACE on LMB-release doesn't materialize on host.

**Source path traced:**
- `src/input/controls.ts:244-338` — joiner LMB-up branch. **Both** `PICKUP_SPARK` and `PLACE_PRIMITIVE` are dispatched sequentially (lines 294-299 and 327-334). Client-mode bypass at line 271-280 makes reach + zone gates pass on joiner.
- `src/main.ts:212-215` — `PREDICTABLE_ACTIONS = ['PICKUP_SPARK', 'UPDATE_AVATAR_POS']`. Joiner client-side-predicts PICKUP_SPARK (local Carrying state).
- `src/main.ts:216-236` — dispatcher wraps both as INTENT envelopes and sends to host via `clientSync.wrapIntent`.
- `src/state/sparkLifecycle.ts:122-158` — host's `applyPickupSpark` re-validates `action.pos` for remote carriers (line 141: `isValidPickupPos(action.pos, player.avatarPos)` checks within REASONABLE_PICKUP_REACH=250).
- `src/state/sparkLifecycle.ts:169-175` — `isValidPickupPos`: canvas bounds + 250px Euclidean reach from joiner's last-known authoritative avatarPos.
- `src/state/placePrimitive.ts:81` — `if (player.kind !== 'Carrying') throw new CarryViolation('not carrying — cannot place');`
- World dispatch loop catches CarryViolation silently (need to verify which try/catch — investigation item #A-1).

**Root cause hypothesis (HIGH confidence):**
1. Joiner LMB-up at placement coord (say 600,400). Joiner's avatarPos is 10Hz-throttled UPDATE_AVATAR_POS data on host; can lag by up to 100ms.
2. If cursor moves >250px between last UPDATE_AVATAR_POS broadcast and LMB-up, host's `isValidPickupPos` returns false → `raceRejects++` → silent return → player stays Idle on host.
3. PLACE_PRIMITIVE arrives next intent → `player.kind !== 'Carrying'` → CarryViolation throws → silently caught in dispatch loop.
4. Joiner's local prediction already set joiner=Carrying. Host says Idle. UI shows Carrying.
5. User's RMB workflow succeeds because: RMB-down at line 211 of controls requires `player?.kind === 'Carrying'` (joiner's predicted-Carrying allows it); the RMB ConnectDrag → RMB-up dispatches only PLACE_PRIMITIVE — BUT this would ALSO throw on host because host's player is still Idle. **Yet user reports RMB workflow succeeds → reach hypothesis is incomplete.**

**Alternative root cause hypothesis (MEDIUM confidence):**
- Host's PICKUP_SPARK *does* pass validation, but PLACE_PRIMITIVE arrives in the same tick burst and references a `targetPrimitiveId` from joiner's stale local world. Host treats target as null (Sym C interaction) or aborts placement on a downstream check.
- Investigation needed: does host log `raceRejects` to a counter the joiner can see? Currently no — needs diagnostic.

**Fix path options (for RALPH:HUNT):**
- **(a) Raise reach ceiling to canvas-diagonal** — eliminates plausibility check, keeps only canvas-bounds. Trade-off: no anti-teleport-exploit defense, but joiner-canvas-bounds is the same as physical limit. **Recommended starting point** — root cause likely lives elsewhere.
- **(b) Increase UPDATE_AVATAR_POS broadcast rate** — 10Hz → 30Hz reduces stale-avatarPos window from 100ms to 33ms. Trade-off: more bandwidth, but tiny payload.
- **(c) Surface `raceRejects` to debug overlay** — joiner sees host's rejection count in real time. Diagnostic-only, no fix; necessary before choosing (a) or (b).
- **(d) Remove client prediction for PICKUP_SPARK** — joiner doesn't see Carrying state until host confirms. Kills the perceptual-lag bridge but eliminates state divergence. **Last resort**.
- **(e) Add `raceRejects` per-action-type accounting + debug-overlay surface** — splits raceRejects into PICKUP_REACH / PICKUP_STATE / PICKUP_RACE / PLACE_NOT_CARRYING so diagnosis is one glance not a guess.

**Recommended ordering:** (c) + (e) FIRST (pure diagnostic, no behavior change) → reproduce with overlay visible → IF reach is the cause, apply (a) → IF still failing, investigate the actual rejection cause → THEN decide between (b) and (d).

**Investigation items for S48:**
- **A-1:** Find the try/catch that swallows CarryViolation. Grep `catch.*CarryViolation` and `dispatch(world,` call sites. Confirm rejection is truly silent or logged.
- **A-2:** Add `world.diagnostics.pickupRejectReasons: { reach: n, stateNotFree: n, posShape: n, raceWonByOther: n }` counters. Surface in debug overlay.
- **A-3:** Reproduce Sym A with overlay showing live counters. Confirm which path increments.

---

### Sym B — Circle around carried spark (any shape) on joiner

**Observation (user-corrected):** Circle appears around the joiner's carried spark regardless of shape (spiral, square, triangle). User says it's NOT the avatar pulse (which is at cursor). They see a halo around what they identify as a "primitive" — actually their carried Free spark, which has primitive-shape rendering.

**Source path traced:**
- `src/render/structureRenderer.ts:208-218` — `drawCarryHalo` iterates `world.players.values()`, draws `g.circle(carried.pos.x, carried.pos.y, carried.radius + 8).stroke({ width: 2, color: player.color, alpha: 0.9 })` for each Carrying player.
- **No `isLocal` gate.** Both players' carry halos render on both browsers.
- `src/render/avatarRenderer.ts:114-116` — separate avatar throb (S45 C10) at cursor. NOT the same as carryHalo.

**Why joiner sees it visibly:**
1. Joiner's client-prediction (Sym A) sets joiner=Carrying locally.
2. drawCarryHalo iterates, sees joiner=Carrying, draws ring at joiner's carried-spark position.
3. Host's authoritative state has joiner=Idle (Sym A rejection) → host's local view shows no ring on joiner.
4. Asymmetry: joiner has ring, host doesn't.
5. **Even after Sym A fix:** ring will still appear, just briefly during normal carry. User's preference is unclear — design call needed.

**Fix path options (for RALPH:HUNT):**
- **(a) Remove drawCarryHalo entirely** — strongest fix, removes visual element user dislikes.
- **(b) `isLocal` gate** — show only own carry halo to each player.
- **(c) Reduce alpha + briefer pulse** — visually softer, kept for own player only.
- **(d) Replace ring with subtle gradient tint on the carried spark sprite itself** — same "intent" cue, no ambient ring.

**Investigation items for S48:**
- **B-1:** Confirm with user whether the halo should exist at all (then pick a-d).
- **B-2:** If keeping (b/c/d), verify host-side rendering doesn't break.

---

### Sym C — Joiner same-color bonds intermittent ("first 4 didn't connect, 5th did")

**Observation:** Joiner places same-color primitives close together. Sometimes they bond, sometimes they don't. Concurrent debug: host `currentBondsInWorld:48`, joiner `currentBondsInWorld:45` = 3-bond lag at the same wall-clock moment.

**Source path traced:**
- `src/input/controls.ts:303` — `pickPrimitiveInRange(AUTO_BOND_RADIUS, targetRefPos)` queries `this.world.primitives` (joiner's LOCAL world).
- `src/input/controls.ts:445-463` — filters by `placerColor === myColor` then nearest-within-radius.
- `src/input/controls.ts:317,324` — `mergeCandidateIds` and `extraBondTargetIds` also from local world.
- `src/state/placePrimitive.ts:79-118` — host's `placePrimitive`. Trusts joiner-supplied `targetPrimitiveId`. Demotes to anchor if `target.placerColor !== player.color` (line 115) or if `target === undefined` (line 111-114, race reject).

**Root cause (HIGH confidence):**
- Joiner places prim N → INTENT to host → host applies → snapshot returns ~RTT/2 later.
- If joiner places prim N+1 before snapshot RTT elapses, joiner's local primitives map has no prim N → `pickPrimitiveInRange` returns null → PLACE_PRIMITIVE sent with `targetPrimitiveId: null`.
- Host applies as anchor (line 153-188 of placePrimitive.ts: `if (effectiveTargetId !== null)` block skipped). No bond.
- After several placements + snapshot ticks elapsed, joiner's local has prim N-K visible → target picked → bond fires.

**Fix path options (for RALPH:HUNT):**
- **(a) Host re-picks target on remote PLACE_PRIMITIVE intents.** Add `placementPos: Vec2` field to PlacePrimitiveAction. When intent comes from remote player, host runs its own `pickPrimitiveInRange` against `world.primitives` using `placementPos`. **Recommended.**
- **(b) Joiner client-predicts PLACE_PRIMITIVE locally with negative ID assignment + reconcile on snapshot.** Heavy refactor, ID conflict risk. Rejected at S46 C13 for the same reason — keep rejected.
- **(c) Speed up snapshot rate to 20Hz.** Reduces the lag window. Trade-off: bandwidth + CPU.
- **(d) Buffer joiner's local intent stream + delay rendering** — UX-degrading; rejected.

**Investigation items for S48:**
- **C-1:** Augment `PlacePrimitiveAction` with `placementPos: Vec2` (joiner sends cursor at LMB-up). Update wire allowlist in protocol.ts.
- **C-2:** In `placePrimitive.ts`, when `action.targetPrimitiveId === null` AND placement comes from remote player, run authoritative target sweep against host's world.
- **C-3:** Same applies to `mergeCandidateIds` and `extraBondTargetIds` — host should re-derive both from its own world when intent is remote-origin.
- **C-4:** Playwright assertion: joiner places 5 same-color prims in rapid succession (faster than snapshot RTT). Verify all 5 bond on host's authoritative world.

---

### Sym D — Color-segregated bonding ✅ PASS

Working as designed. `controls.ts:445-463` filters by `placerColor === myColor`. `placePrimitive.ts:115` defense-in-depth demotes cross-color to anchor. Shibboleth `placerColor!==i.color` confirmed in deployed bundle.

---

### Sym E — Score "/50" occlusion (DEFERRED per user)

User said "dont care about 4." Skip this session's fix work. Latent observation: BLUE row reads "BLUE 48 / 50" clean in screenshots; RED row has charge dots + godly cooldown glyph crowding where "/50" should display. Root cause likely in `src/render/ui.ts:168` POSTGAME branch + chargeDots x positioning. Carry to S49+.

---

### Sym F — Territorial repulsion (NEW MECHANIC, DEFERRED)

Not yet implemented. Was scoped S47 P1 (Full tier with design). Deferred to S49 — base game must work first. Design from S46 close still valid:
- combination complexity = primCount + 0.5*bondCount + 0.1*componentScore
- R = 60 + 12*log₂(complexity+1)
- INVISIBLE radius hard block
- engulf-warp candidate (c) sluggish bond physics (user-leaning)
- disruption charges repurpose: "shrink enemy radius 50% for 5s"

---

### Sym G — Voltkin matcher misfires on non-isolated chain

**Observation (user-corrected):** User had 5 squares all bonded together as one structure, then connected 4 triangles to that structure. Voltkin fired. Expected behavior: STRICT linear 4Sq→4Tr chain — chain primitives must have NO bonds outside the chain.

**Source path traced:**
- `src/state/godlyRecipes/voltkin.ts:29-38` — `EXPECTED_CHAIN = [Sq,Sq,Sq,Sq,Tr,Tr,Tr,Tr]`.
- `src/state/godlyRecipes/voltkin.ts:49-86` — `findVoltkinChain` DFS through bond graph. Matches consecutive types. Does NOT check whether chain primitives have additional bonds outside the chain.
- A "5-square blob + 4-triangle line" satisfies this DFS: pick a leaf square, walk through 3 bonded squares (skipping the 5th if it's adjacent but off the linear path), exit into the 4 triangles. DFS finds the path; extra blob bonds ignored.

**Root cause (HIGH confidence):** Chain isolation never enforced.

**Fix path (for RALPH:HUNT):**
- **(a) Degree check:** after `findVoltkinChain` returns chain `[p0..p7]`, verify each chain primitive's `bonds.size` equals its in-chain-neighbor count (p0=1, p1-p6=2, p7=1). Reject match if any chain prim has off-chain bonds.
- **(b) Component-equivalence check:** verify `componentOf(p0).primitiveIds.size === 8` and every chain ID is in that component. Stronger guarantee.
- **(c) Walk-the-fragment check:** verify that traversing the chain's connected component using ONLY the chain bonds reaches all 8 prims.

**Recommended:** (a) — simplest, equivalent in effect, O(8) verification.

**Investigation items for S48:**
- **G-1:** Vitest unit test: 5-square blob + 4-triangle line → predicate returns null.
- **G-2:** Vitest unit test: clean 4+4 linear chain → predicate matches.
- **G-3:** Vitest unit test: 4+4 chain where any chain square has 1 extra bond to off-chain primitive → predicate returns null.
- **G-4:** Code change: degree check after `findVoltkinChain` returns chain.

---

### Sym H — "Sometimes connecting, sometimes not"

Same root cause as Sym C. Just user's re-framing. Not a separate issue.

---

### Sym I — 🔴 CRITICAL — POSTGAME never reaches joiner

**Observation:** Host gameState=POSTGAME tick 29431. Joiner gameState=PLAYING tick 30613 (running ~1182 ticks past host's last-received snapshot tick). Joiner won the match (host debug `P1 cd=25076t` = joiner's godly cooldown was active), joiner never informed. Game ends silently for joiner.

**Source path traced — both halves unwired:**

**Half 1 (host never sends ENDGAME):**
- `src/net/protocol.ts:64-67` — `EndGameMsg { kind: 'ENDGAME'; winnerId: PlayerId }` envelope DEFINED.
- `src/net/protocol.ts:215-216` — `parseNetMessage` accepts incoming ENDGAME if `winnerId` is numeric.
- `src/main.ts:800-810` — snapshot send gated by `world.gameState === 'PLAYING'`. The instant host transitions PLAYING → WIN → POSTGAME, **snapshots stop**. Last snapshot joiner received still shows PLAYING.
- **NO `netTransport.send({kind:'ENDGAME', winnerId})` call exists anywhere in main.ts.** Grep verified: only `INTENT` (line 232), `START_GAME_SIGNAL` (line 379), `GODLY_TRIGGER` (line 563), and `NETSNAPSHOT` (line 808) send sites exist.

**Half 2 (joiner has no recv handler):**
- `src/main.ts:343-366` — joiner's `netTransport.on` handles only `NETSNAPSHOT`, `GODLY_TRIGGER`, `START_GAME_SIGNAL`. **No `if (msg.kind === 'ENDGAME')` branch.**
- Even if host sent ENDGAME, joiner would silently drop it.

**Root cause:** Wire envelope was scaffolded in protocol.ts but never connected on either side. Same anti-pattern as `parseNetMessage` being defined-but-not-called pre-S38 audit (and same as `KNOWN_GAME_ACTION_TYPES` pre-Pass-2-fix).

**Fix path (for RALPH:HUNT, BOTH halves required):**
- **(a) Loosen snapshot gate** at main.ts:800-810 from `gameState === 'PLAYING'` to `gameState === 'PLAYING' || gameState === 'WIN' || gameState === 'POSTGAME'`. Host keeps sending snapshots through win/end transitions — joiner sees gameState change via normal snapshot flow.
- **(b) Add ENDGAME envelope** — host sends `{kind:'ENDGAME', winnerId}` on WIN_TRIGGER dispatch. Joiner receives + dispatches a local `WIN_TRIGGER`. Guarantee delivery independent of snapshot continuity.
- **Recommended: BOTH (a) + (b).** Defense in depth — snapshot continuity for graceful UI fade + explicit ENDGAME guarantee for race resilience.

**Investigation items for S48:**
- **I-1:** Loosen snapshot gate at main.ts:800. Confirm host doesn't send junk snapshots during POSTGAME (it shouldn't — game state is frozen).
- **I-2:** Add ENDGAME send call near `dispatch(world, { type: 'WIN_TRIGGER', winnerId })` in gameState.ts:60.
- **I-3:** Add joiner-side ENDGAME handler in main.ts netTransport.on at line ~365.
- **I-4:** Vitest: protocol round-trip ENDGAME message with random winnerIds.
- **I-5:** Playwright: 2-peer match ending; assert joiner sees gameState='POSTGAME' within 1s.

---

## 2. LATENT-BUG AUDITS — adjacent risks

### 2.A — Other wire envelopes scaffolded-but-not-wired

**Wire matrix (verified by grep):**

| NetMessage kind | Sender | Send call | Receiver | Recv handler | Status |
|---|---|---|---|---|---|
| HELLO | both via NetTransport | inside transport.ts | both | inside transport.ts | ✓ wired (handshake) |
| INTENT | joiner | main.ts:232 | host | main.ts:302-310 | ✓ wired |
| NETSNAPSHOT | host | main.ts:808 (PLAYING-gated — **Sym I bug**) | joiner | main.ts:344-346 | ⚠️ gated |
| START_GAME_SIGNAL | host | main.ts:379 | joiner | main.ts:363-365 | ✓ wired |
| **ENDGAME** | — | **NONE** | — | **NONE** | ❌ unwired (Sym I) |
| GODLY_TRIGGER | host | main.ts:563 | joiner | main.ts:350-352 | ✓ wired |

**Action:** Sym I covers the only complete-unwired envelope. NETSNAPSHOT's PLAYING-gate is part of Sym I fix.

### 2.B — Render asymmetry across players

**Renderers checked:**

| Renderer | Player gate | Risk |
|---|---|---|
| `avatarRenderer.ts:108` | `isLocal = player.id === localPlayerId` then forks cursor vs avatarPos | ✓ correctly gated |
| `structureRenderer.ts:65-70` syncPrimitives / drawBonds | none — shared world state | ✓ correct (prims are global) |
| `structureRenderer.ts:163-205` drawPreview | only when `controls.kind === 'ConnectDrag'` (local-only state) | ✓ correct (state is local) |
| **`structureRenderer.ts:208-218` drawCarryHalo** | iterates ALL Carrying players, no gate | ❌ Sym B (no isLocal gate) |
| `effectsRenderer.ts` | TBD — not read this session | ⏳ S48 investigate |
| `bondVisualRenderer.ts` | TBD — not read this session | ⏳ S48 investigate |
| `statsOverlay.ts` | TBD — not read this session | ⏳ S48 investigate |
| `ui.ts` HUD | TBD — Sym E partial fix observation suggests row layout issues | ⏳ S48 investigate |
| `creatureRenderer.ts` | TBD | ⏳ S48 investigate |

**Action items for S48:**
- **2.B-1:** Read effectsRenderer + bondVisualRenderer + creatureRenderer for player-id gates. Identify any shared rendering that should be local-only or vice-versa.
- **2.B-2:** Pay particular attention to effects that fire on placement (BOND_COMMIT, STRUCTURE_GROW, SCORE_TIER, STRUCTURE_MERGE) — are these emitted only by host and shipped via snapshot, or duplicated on joiner via client prediction?

### 2.C — Snapshot-lag intent vulnerabilities

Joiner-supplied IDs in remote intents that may reference joiner's stale local world:

| Intent | Vulnerable field | Host validates? | Action |
|---|---|---|---|
| `PLACE_PRIMITIVE` | `targetPrimitiveId` | Demotes if not found / cross-color (placePrimitive.ts:108-118) — but NO host-side re-pick | ❌ Sym C |
| `PLACE_PRIMITIVE` | `mergeCandidateIds[]` | Skips missing IDs (placePrimitive.ts:295) — but if joiner's local list is empty (snapshot lag), host doesn't compensate | ❌ extension of Sym C |
| `PLACE_PRIMITIVE` | `extraBondTargetIds[]` | DEV-only validation (placePrimitive.ts:212-251) | ⚠️ same as above |
| `SEVER_BOND` | `bondId` | Need to read sever handler | ⏳ S48 investigate |
| `PICKUP_SPARK` | `sparkId` | Validates spark exists + Free (sparkLifecycle.ts:132-137) | ✓ tolerant |
| `DROP_SPARK` | `playerId` | Validates carrying (sparkLifecycle.ts:196) | ✓ tolerant |
| `UPDATE_AVATAR_POS` | `pos` | TBD — Sym A relies on this being accurate | ⏳ investigate |
| `GODLY_TRIGGER` | host-only emit | n/a | ✓ |

**Action items for S48:**
- **2.C-1:** Audit SEVER_BOND host validation. Joiner picks bond via local map — same lag vulnerability.
- **2.C-2:** Add host-side authoritative re-pick for ALL ID-bearing fields in remote-origin PLACE_PRIMITIVE.
- **2.C-3:** Document UPDATE_AVATAR_POS host handler — does it validate pos shape? Is it rate-limited?

### 2.D — Client-prediction state divergence

`PREDICTABLE_ACTIONS = ['PICKUP_SPARK', 'UPDATE_AVATAR_POS']` (main.ts:212).

| Predicted action | Host rejection paths | Divergence window |
|---|---|---|
| PICKUP_SPARK | (1) raceRejects on bad pos shape, (2) sparkNotFreeRace, (3) reach validation fail | ~RTT/2 until next snapshot reconciles |
| UPDATE_AVATAR_POS | TBD — need to read handler | ⏳ investigate |

**Action items for S48:**
- **2.D-1:** Read UPDATE_AVATAR_POS host handler. Document rejection paths if any.
- **2.D-2:** Split `world.diagnostics.raceRejects` into per-reason counters. Surface in debug overlay. (Same as A-2.)
- **2.D-3:** Consider adding a "predicted action rolled back" event so joiner UI can flash a brief "rejected" cue on prediction mismatch.

### 2.E — Godly recipe predicate weakness pattern

Voltkin DFS finds a path matching type sequence but doesn't enforce isolation. Future recipes (Anvil, Pac-Predator) may inherit the same anti-pattern.

**Action items for S48:**
- **2.E-1:** Add a shared `validateChainIsolation(chain, world)` helper that the degree check from Sym G G-4 reuses.
- **2.E-2:** Document in `LOCKED_DECISIONS.md` (§ recipe predicates) that all recipes must validate chain isolation.

---

## 3. PRIORITY ORDERING for S48 (RALPH:HUNT mode)

Each priority = one HUNT iteration (hypothesis → test → fix → verify). Per session-pdca skill: HUNT max 3 iterations, ~25K tokens.

**Day-of-S48 order:**

### P1 — Sym I CRITICAL fix (game-end wire)
**Why first:** Highest user-visible impact (a winner not knowing they won is a fatal UX bug). Smallest code surface (loosen 1 conditional + add 1 send + 1 recv handler). Easiest to validate (2-peer match → end → assert).

**Touchpoints:**
- `src/main.ts:800-810` — loosen gameState gate
- `src/main.ts:~563` or near WIN_TRIGGER dispatch — add ENDGAME send
- `src/main.ts:343-366` — add joiner ENDGAME recv handler
- `src/net/protocol.test.ts` — vitest round-trip
- `e2e/` — Playwright 2-peer end-of-match assertion

**Verification:** 2-peer match runs to win threshold; joiner sees POSTGAME within 1s.

### P2 — Sym C fix (snapshot-lag target picking)
**Why second:** Eliminates the most-frequent intermittent failure on joiner, unblocks Sym A diagnosis (removes a confounding variable).

**Touchpoints:**
- `src/state/placePrimitive.ts` — add `placementPos: Vec2` to PlacePrimitiveAction
- `src/input/controls.ts:294-334` — pass cursor as placementPos
- `src/state/placePrimitive.ts:108-118` — when remote origin and target null/stale, host re-picks
- `src/net/protocol.ts:131-154` — KNOWN_GAME_ACTION_TYPES already lists PLACE_PRIMITIVE; no schema bump (field is additive optional)
- Vitest: host re-pick scenarios

**Verification:** Joiner rapid-fires 5 same-color placements; host's bond count matches joiner-expected by next snapshot.

### P3 — Sym A diagnostics + fix
**Why third:** Needs P2 done so target-picking failure isn't masking PICKUP rejection.

**Touchpoints:**
- `src/state/world.ts` — extend `world.diagnostics` with per-reason rejectReasons
- `src/state/sparkLifecycle.ts:128/135/142` — populate specific counters
- `src/render/debugOverlay.ts` — surface counters in overlay
- 2-peer smoke session: reproduce, identify which counter rises
- Apply chosen fix (a/b/c/d/e from §1 Sym A)

**Verification:** Joiner LMB-drag-release single-action commits placement on host.

### P4 — Sym G fix (Voltkin chain isolation)
**Why fourth:** Lower urgency than core gameplay, but easy + bounded. ~10 LOC.

**Touchpoints:**
- `src/state/godlyRecipes/voltkin.ts` — add degree check after findVoltkinChain
- Vitest: 3 new unit tests (G-1, G-2, G-3)

**Verification:** Unit tests pass; live 2-peer test with "5-square blob + 4-triangle line" does not fire Voltkin.

### P5 — Sym B fix (carryHalo asymmetry)
**Why fifth:** Lower urgency; resolves partially with Sym A fix anyway. Quick design decision + ~5 LOC.

**Touchpoints:**
- User confirms design choice (a/b/c/d from §1 Sym B)
- `src/render/structureRenderer.ts:208-218` — apply fix

**Verification:** Visual smoke test — no unwanted ring around carried sparks per user preference.

### P6 — Latent-bug audits (read-only this session)
Complete the audits in §2 that were not finished. Add findings to next IN-PROGRESS plan.

### P7 — Carry-forward
Sym E (Sym E was deferred per user, but if cycle remains)
Sym F design start for S49
LOCKED_DECISIONS.md amendment for Syms D, G, I
Harness diagnostic gap (S46 reflexion rule) — add Playwright assertions that exercise real-WebRTC client-prediction divergence

---

## 4. VALIDATION STRATEGY

For each fix, before commit:
1. **Vitest unit tests** — pure-function path coverage
2. **Vitest integration** — multi-step dispatch on a synthetic world
3. **Playwright 2-peer E2E** — real-WebRTC with the actually-failing path. Per S46 reflexion rule, the harness assertion MUST exercise the failing path, not a mock substitute.
4. **4-layer prod verify** — bundle deployed + ETag changed + shibboleth present + 2-peer live smoke
5. **User-side 2-peer smoke** — hard-refresh both browsers; user reports PASS/FAIL per Sym row

**NEVER close a Sym until item #5 passes.** S46 closed Sym A/C as PASS on Playwright alone; live smoke revealed both still broken. The harness must complement, not substitute, real-user validation.

---

## 5. RISK LEDGER

| Risk | Mitigation |
|---|---|
| Sym A fix introduces new race (e.g., reach raised → exploit potential) | Diagnostic counters first; pick narrowest fix that closes the user-observed gap |
| Sym C host re-pick changes existing solo behavior | Gate on `world.gameMode === '1v1' && action.originRemote === true` (need new field) |
| Sym I snapshot gate loosen sends junk snapshots during POSTGAME | Verify host's gameState transitions are stable + idempotent post-win |
| Sym G degree check rejects legitimate matches | Vitest with 8-prim linear chain + verify endpoints (degree 1) and middles (degree 2) |
| Sym B fix removes a feature host depends on | Confirm with user host's experience is unchanged |

---

## 6. OUT-OF-SCOPE for S48

- Sym E (user-deferred)
- Sym F (new mechanic — S49+)
- Node.js 20 deprecation 2026-06-02 (DevOps)
- vite/vitest CVE major bump (carry from S37+S45+S46+S47)
- main.ts hypertrophy refactor (carry from S37+S39+S44+S46+S47)
- Multi-color renderer dead-code deletion (carry from S46 → S47)
- `continue-on-error` removal from e2e.yml
- Differential state audit (Grok C7 from S46) — until harness exposes divergence

---

## 7. SESSION START CHECKLIST for S48

Before any code work:
- [ ] Read this file (IN-PROGRESS_S47_regression_triage_and_audit.md)
- [ ] Read most-recent HANDOFF in project root
- [ ] `git status` — confirm working tree clean
- [ ] `curl -sI https://spark-online.space/` — confirm bundle stable since S47 close
- [ ] Boot mode: RALPH:HUNT (no Council, max 3 iterations per priority)
- [ ] Per global CLAUDE.md INTEGRITY-WARNING PROTOCOL: write `checkpoint_commit` + `check_completed:true` + `check_method` to session-state at every priority close
- [ ] Per user memory rule: always Opus 4.7 1M MAX

---

## 8. APPENDIX — diagnostic data from S47 smoke

### Host (Player 1) debug snapshot
```
tick: 29431, gameState: POSTGAME, isHost: true
GODLY_MATCHER: WILL_RUN false (gameState=POSTGAME), firedEver: true, lastMatcherTick: 27918
BOND_FORMED FLOW: lastTick 27156, total seen 34, currentBondsInWorld: 48
VOLTKIN CHAIN: 9 sq, 7 tr, longest partial 6/8
PLAYERS: P0 cd=none kind=Idle, P1 cd=25076t kind=Idle (joiner-on-cooldown — joiner WON)
CREATURES: count 0 (Voltkin already despawned)
clave calls total=35 synthed=35  (Voltkin fired)
```

### Joiner (Player 2) debug snapshot
```
tick: 30613, gameState: PLAYING (!), isHost: false
GODLY_MATCHER: WILL_RUN false (!isHost — expected)
BOND_FORMED FLOW: lastTick -1, total seen 0, currentBondsInWorld: 45
  ↑ "total seen" is a MEASUREMENT ARTIFACT (counter only updated in host-only runGodlyMatcher); not a real subscription gap
  ↑ 45 vs host's 48 = 3-bond snapshot lag
VOLTKIN CHAIN: 9 sq, 7 tr, longest partial 6/8 (matches host)
PLAYERS: P0 cd=none kind=Idle, P1 cd=none kind=Carrying
  ↑ joiner predicts Carrying locally (Sym A predicted state); host has joiner=Idle
clave calls total=5 (joiner heard 5 clave SFX from BOND_FORMED effects in snapshots)
```

### Tick divergence
Joiner local tick 30613, last applied snapshot from host ~tick 29431 → joiner running ~1182 ticks (~19.7s at 60Hz) past host's authoritative state. Snapshots stopped at host's PLAYING→WIN transition (Sym I). Joiner continued local render-frame physics in the absence of new snapshots.

### Score state
HUD shows BLUE 48 / 50 cleanly on joiner. RED row obscured by raid charge dots + godly cooldown indicator (Sym E partial fix). Joiner reached 50 → WIN_TRIGGER on host → POSTGAME on host → joiner never notified.

---

**END OF PLAN — execute in S48 RALPH:HUNT mode.**
