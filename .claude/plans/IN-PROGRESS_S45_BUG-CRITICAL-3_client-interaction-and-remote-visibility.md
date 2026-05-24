# S45 BUG-CRITICAL-3 — Client-mode interaction + remote-player visibility + per-player color identity

**Status:** PENDING NEXT-SESSION DELIBERATION · Tier: TBD (likely Standard or Full) · Author: Claude S44 (post user 2-peer smoke)
**Constitutional posture:** Will require Scope Amendment + Council R1 (Standard/Full tier) per session-pdca pipeline.
**Blueprint contract at stake:** `SPARK_Blueprint.md:3` ("A Real-Time Multiplayer Game") + line 6 ("Phase-2 Tier-0 1v1 networked SHIPPED") + intent of "real time red spark vs blue spark" per user S44 directive.

---

## CONTEXT — S44 user 2-peer smoke result

S44 BUG-CRITICAL-2 (multi-strategy P2P transport) successfully restored peer pairing. User confirmed via real 2-browser smoke on https://spark-online.space/?debug=1: **both players login, snapshot sync works (gameState=PLAYING, gameMode=1v1, scoring updates), but interaction + visibility broken for the client peer.**

Screenshot from joiner (P1/blue, isHost=false) at tick 7140 shows:
- World rendering OK: free sparks visible, primitives visible, zone visible, HUD shows BOTH players (RED for P0/host, BLUE 0/50 for P1/joiner)
- DEBUG panel: PLAYERS section shows `P0 color=0xff3b6b cd=none kind=Idle` AND `P1 color=0x3bd7ff cd=none kind=Idle`
- Despite host actively playing (per user report), P2 sees both players' kind=Idle
- GODLY_MATCHER WILL_RUN: false (BLOCKED: !isHost) — correct, host-only
- BOND_FORMED currentBondsInWorld: 1 — one bond exists (host built it)
- VOLTKIN CHAIN: 1 square, 1 triangle — progress visible to client

**User verbatim symptom report (S44 close):**
> "ok so both players login, only host actually gets to play. player 2 doesnt play but can see the other playing in real time. he is blocked from interacting with the primitives but can see player one pull them and build stuff. now a few things, player 2 doesnt see player 1's spark but just that some primitives being pulled out by some invisible force. they should see each others spark and the host is always red the joining one is always blue. and so are their constructions."

---

## SYMPTOMS (3 distinct, possibly linked)

### Sym A — Joiner cannot interact with primitives/sparks
User: "player 2 doesnt play... is blocked from interacting with the primitives"
- P2's LMB/RMB drag should generate Intents
- `main.ts:204-215 dispatchFn` wraps actions as INTENT and sends via netTransport when `world.gameMode === '1v1' && !world.isHost && clientSync !== null && netTransport !== null`
- Possible causes:
  1. dispatchFn's gate condition fails for P2 (some field not set)
  2. Controls (controls.ts) isn't actually invoking dispatchFn — maybe playerId mismatch silently drops inputs
  3. Intents are sent but host's net handler (main.ts:275) doesn't apply them (filter? new requireActivePlayer-style gate?)
  4. P2's hit-test logic uses world.localPlayerId differently than host's (different active player gate?)
  5. **Most likely**: spark pickup logic in `applyPickupSpark` (sparkLifecycle.ts) silently rejects when `state.kind !== 'Free'` because the local optimistic carry already conflicts with snapshot-applied state — Council R2 S42 lesson "shared-vs-owned race silent-return + counter" might be over-aggressive on client side

### Sym B — Joiner doesn't render host's avatar or carried spark ("invisible force")
User: "player 2 doesnt see player 1's spark but just that some primitives being pulled out by some invisible force"
- `main.ts:228 const avatarRenderer = new AvatarRenderer(app, P1)` — SINGLE renderer parameterized for ONE player (the `P1` const, which is `asPlayerId(0)` or `asPlayerId(1)` depending on host/client setup)
- AvatarRenderer almost certainly renders only its parameterized player, not iterating `world.players`
- **Root cause confirmed at static-parse level**: only 1 avatar instance per browser; remote player's avatar literally never renders. Carried spark is rendered as part of avatar's visual, so remote carried spark also never renders. Free sparks (in zones) DO render because `sparkRenderer.sync(freeSparkArr)` iterates `world.freeSparks` (not player-scoped).
- Fix: either (a) instantiate AvatarRenderer per player and feed each its own player ref, OR (b) refactor AvatarRenderer to iterate world.players and render N avatars + carried sparks
- Also verify NETSNAPSHOT player serialization (save.ts:538 serializePlayer) includes `kind` + `carriedSparkId` (it does per grep) AND applySnapshotCore copies them into world.players (line 485-495 yes)

### Sym C — Per-player color identity not enforced in render
User: "they should see each others spark and the host is always red the joining one is always blue. and so are their constructions."
- `world.players[0].color = 0xff3b6b` (red, host), `world.players[1].color = 0x3bd7ff` (blue, joiner) — confirmed by debug panel
- Render path may not be reading per-player color for sparks/primitives
- "Constructions" interpretation: primitives currently render white in all states. User likely wants visual indication of which player created/owns each primitive (red-tinted for host, blue-tinted for joiner)
- OR user means: spark held by host renders red, spark held by joiner renders blue (carry-state color tint)
- Need to deliberate with user on intended semantics

---

## STATE-DISCOVERY (Rule 21 §A.0) — REQUIRED before lock

1. **Probe Sym A reproducibility:** Run dev with 2 browser windows. Verify `[net]` console logs whether P2's INTENT messages reach host. If yes → host-side rejection bug. If no → controls/dispatchFn plumbing bug on P2.
2. **Read controls.ts** for LMB/RMB → dispatch path; verify it calls dispatchFn (not direct dispatch)
3. **Read sparkLifecycle.ts applyPickupSpark** for silent-reject conditions; verify whether shared-resource race counter is silently dropping legitimate P2 attempts
4. **Read AvatarRenderer source** to confirm single-player render vs all-players iteration
5. **Read sparkRenderer source** to verify carried-spark rendering (likely missing for remote)
6. **Read SPARK_Blueprint.md or LOCKED_DECISIONS.md** for any §X.X-defined color/ownership semantics

---

## SCOPE — three tier options for next-session Council deliberation

### Option A — Sym A only (Standard, ~15K, ~80 LOC)
- Diagnose + fix P2 input dispatch (likely controls.ts + sparkLifecycle.ts adjustment)
- DEFER Sym B (render multi-player) + Sym C (color identity)
- Risk: ships "P2 can interact" but visibility still confusing; partial UX restoration

### Option B — Sym A + Sym B (Standard, ~25-30K, ~150 LOC, 4 files) — RECOMMENDED
- Sym A fix per Option A
- Refactor AvatarRenderer to render N avatars (iterate world.players) OR instantiate per-player avatars in main.ts
- Extend SparkRenderer to render CARRIED sparks for all players (not just free sparks)
- Add basic spark color tint = owner's player.color when carried
- 1-round Council deliberation
- DEFER Sym C "constructions colored" semantics (clarify with user post-fix)

### Option C — Sym A + B + C full color identity (Full, ~40-50K, ~250 LOC, 6+ files)
- Everything in Option B
- Add per-player color tint to ALL constructions (primitives created by red-side render red-tinted, blue-side blue-tinted)
- Requires extending Primitive type with `createdByPlayerId: PlayerId` + serialize/deserialize
- Possibly extending Bond type for combined-construction provenance
- 2-round Council + quality gate
- HIGHER RISK: touches game-state schema; protoVersion bump probably required; back-compat snapshot handling needed; may affect deterministic save replay

---

## CHALLENGES (preliminary — to be refined in Council R1)

1. **Are these 3 symptoms ONE bug or three?** Sym A (interaction) + Sym B (render) could share a root cause (e.g. dispatchFn not actually being invoked → no local optimistic update → no render hint → "invisible force"). Or they could be independent. State-Discovery must classify before locking scope.

2. **Was this regression introduced in S42 (real-time restoration) or S15 (1v1 hotseat) or earlier?** S42 stripped turn-based gate. If multi-player avatar rendering was OK before S42 and broken now, S42 implicated. If always broken, it's a never-implemented feature mislabeled as bug. `git log --oneline -- src/render/avatarRenderer.ts` will tell.

3. **What does "constructions colored by who made them" mean?** Possible interpretations: (a) primitive fill tint, (b) primitive outline tint, (c) carried-state-only color, (d) godly-creature color, (e) bond color. Ask user before locking C.

4. **protoVersion bump required for Option C?** Adding `createdByPlayerId` to serialized Primitive is a back-incompat change. Old peer tabs deserializing new snapshots would either crash or ignore. Council R1 must adjudicate: bump + cross-version guard, OR defer Option C until v2 protoVersion is needed for other reasons too.

5. **Test coverage for multi-player render:** Currently AvatarRenderer test exists (line 222 in `src/render/avatarRenderer.test.ts` per S44 test run) but tests single-avatar. Need failing test first → fix → green test (TDD discipline for visual regression).

## TESTING (next session executes)

- `npm run typecheck` MUST be CLEAN
- `npm run test` MUST be 754/754 PASS or higher (new tests added for multi-avatar + carry-color)
- Bundle size MUST stay <500 KB cap (currently 486.91 KB, 13.09 KB headroom — Option C might push close)
- Deploy + 4-layer verification
- **GATED on user 2-peer smoke** — user must confirm: (a) P2 can grab/build, (b) P2 sees both avatars + both sparks, (c) per-player color is correct

## VERIFICATION GATE
At least 8/10 shibboleths:
- POSITIVE: render path iterates world.players (grep avatarRenderer for `for...players`)
- POSITIVE: carried spark color matches player.color (probe via preview_eval after grab)
- POSITIVE: P2 INTENT logged on host console after P2 LMB drag (manual smoke)
- POSITIVE: applyPickupSpark non-Free state counter doesn't increment on legitimate P2 grab
- NEGATIVE: avatarRenderer no longer instantiated as singleton with single P parameter
- NEGATIVE: no "[net] rejected" warning on host receiving P2 INTENT
- NEGATIVE: no kind=Idle stuck-state for actively-playing remote player

## ROLLBACK
- Revert offending commits via `git revert <hash>` chain back to commit 6f412f3 (S44 BUG-CRITICAL-2 ship)
- Re-deploy
- Time-to-rollback: <5 min

## RISK
- **Highest in Option C** (schema change, protoVersion bump, back-compat needed)
- **Lowest in Option A** (single dispatcher fix)
- **Sweet spot in Option B** (Sym A + B addresses 2 of 3 user complaints with bounded scope)

---

## RECOMMENDED PATH
**Option B (Standard tier, 1-round Council).** Reasoning:
- Sym A + Sym B cover the majority of user pain (interaction works + both players visible)
- Sym C (color identity for constructions) deserves a user-product-design conversation BEFORE coding (currently 3+ interpretations possible)
- Option B's bundle delta likely fits 500 KB cap; Option C might not
- Schema change in Option C is non-trivial and warrants its own PDR if needed

Next session should:
1. Read this PDR + S44 reflexion entries + boot-snapshot
2. Run State-Discovery (probe Sym A repro, read controls.ts + AvatarRenderer + sparkLifecycle silent-reject path)
3. Surface State-Discovery findings to user
4. Ask user to choose tier (A / B / C / ask-Council)
5. Council R1 (mandatory at Standard tier; +R2 quality gate at Full)
6. Execute, deploy, verify, GATE on user 2-peer re-smoke

## SESSION TOKEN BUDGET ESTIMATE
- State-Discovery + reads: ~8-10K
- Council R1: ~6K
- Implementation (Option B): ~25-30K
- Tests + build + deploy + verify: ~10K
- Reflexion + handoff: ~5K
- **Total estimate: ~55-65K** (well under GREEN at 1M context window)
