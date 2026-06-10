# PDR — S82 batch: cruiser-poopy-slow · spawner-save wiring · fog/CVD · netcode infra · lobby delta

Tier: FULL (>30K, movement-model + netcode + crypto). Deliberation: 3-way Council R1+R2 (Grok grok-4.20-0309-reasoning + Gemini 2.5-pro), CONVERGED. PRIME-AUDIT below.
Approval: USER-EXPLICIT pre-approval in session opener — "I pre-approve full session batch and autonomous run" (unlock_source=user, same-turn flag-write permitted).
Model note: session runs Fable 5 (user-sanctioned this session: "We are now working with Fable 5 Ultracode"); ALWAYS-OPUS pin drift WARN acknowledged.

## A.0 STATE DISCOVERY (Rule 21 — empirical probe via 6 parallel readers, maps archived at .claude/s82-maps/*.json)
Key state-vs-claim DELTAS surfaced BEFORE lock:
| # | claim | actual |
|---|-------|--------|
| Δ1 | S69 P2 lobby seat-UX "never gated/executed, needs re-validation" (CARRIED banner) | FULLY SHIPPED: S69 e7190b8 (rack, peerCount reducer, glyphs, you-emphasis, fixed buttons) + S70 LOBBY_PRESENCE + S73 stable seats + S79 sender-auth. P5 scope collapsed to true delta. |
| Δ2 | INTENT path assumed player-intents-only | parseNetMessage/host handler accept ANY GameAction type from clients (stamped to own seat) — pre-existing hardening hole, folded into P4. |
| Δ3 | "wire Spawner state into WorldSnapshot" assumed reachable | snapshot(world) cannot reach the Spawner (World has no spawner field); netSnapshot derives by 4-key omission → naive field add would leak onto EVERY 10Hz NetSnapshot. Param-injection design chosen. |
| Δ4 | fog edge assumed hard | edge already soft (plateau→0.72 + 40px band); "fuzzy" upgrade = angular noise in brush texture, inside existing band. |

## OBJECTIVE
Ship the user-queued batch: (P1) poop can hit the player cruiser and slow it (capped cursor-chase + tint), (P2) spawner RNG-stream state round-trips through WorldSnapshot, (P3) backlog #3 EYES fog fuzzy-edge + CVD non-color identity, (P4) backlog #4 netcode infra — crypto host identity (lifts S79 TOFU race ceiling) + in-page auto-reconnect + drop-bench hardening + client-intent allowlist, (P5) S69 lobby seat-UX true delta. End-of-session commit + handoff queuing next-session Voltkin upgrade.

## SCOPE (per priority)

### P1 — cruiser-poopy-slow (movement-model feature; user explicit go)
- constants.ts: POOP_AVATAR_HIT_RADIUS=30, POOP_CRUISER_SLOW_TICKS=15*PHYSICS_HZ, POOP_CRUISER_MAX_SPEED=7 (px/tick).
- player.ts: Player.poopedUntilTick?, Player.poopedCursorTarget?: Vec2 (additive-optional).
- seagullLifecycle.ts applyPoopTick FALLING: players checked FIRST (seat-ascending, deterministic-order comment), within POOP_AVATAR_HIT_RADIUS of avatarPos, skip benched; hit → stamp poopedUntilTick + poopedCursorTarget=avatarPos copy, consume poop. Bodyblock (avatar shields structure beneath) is intended, unit-tested precedence.
- gameMode.ts applyUpdateAvatarPos: debuffed → write poopedCursorTarget (verbatim), avatarPos untouched; un-debuffed → verbatim avatarPos + CLEAR poopedCursorTarget (explicit guard, Grok R2#1).
- NEW per-tick chase (host sim loop fan-out, hunter precedent): while poopedCursorTarget defined, move avatarPos toward it ≤POOP_CRUISER_MAX_SPEED/tick; within one step → EXACT snap + clear (Gemini R2#1 float-equality fix); carried-spark snap-coupling preserved in chase.
- avatarRenderer.ts: local player while debuffed renders via existing smoothTowards displayPos chase of avatarPos (not raw cursor); avatar tint lerps toward POOP_FOUL_TINT @ POOP_FOUL_TINT_STRENGTH while debuffed (local + remote).
- save.ts: SerializedPlayer.poopedUntilTick / poopedCursorTarget conditional-spread (S81 carriedAtTick precedent; rides NetSnapshot — required for client tint; no schema bump).
- NO dispatch-gate change (chase converges host-side without extra messages — R1 Grok#3 dissolved by redesign).
- Documented intended synergy: debuffed pickups far from lagging avatar fail the 600px reach gate; client optimistic-prediction divergence reconciles via snapshot (R1 Grok#4 acknowledged, no code change).

### P2 — Spawner ↔ WorldSnapshot
- save.ts: WorldSnapshot.spawner?: SpawnerState additive-optional; snapshot(world, opts?:{spawnerState?: SpawnerState|null}) param injection; netSnapshot() never passes it + 'spawner' added to NetSnapshot Omit + runtime destructure (defense-in-depth); restore() leaves spawner restoration to caller; getState() null falls back to from-seed (documented).
- main.ts DEV block: __SPARK__.snapshotWorld() (includes spawner state) + __SPARK__.restoreWorld(json) (restores world + spawner.restoreState). DEV-gated (tree-shaken).
- sync.test.ts: extend wire-absence assertion to include 'spawner'.
- save.test.ts/spawner integration test: tick sim+spawner N ticks, snapshot w/ spawner state, restore into fresh world+different-seed spawner, continue both, byte-identical snapshots (closes the S79 docblock latent gap + SparkId-collision defense via nextId round-trip).
- REJECTED (Council R1 Grok#5): putting spawner on the wire — clients never run a spawner (!isClient gate) and RNG words would leak the spawn schedule to cheating clients (rngSeed-exclusion precedent).

### P3 — EYES fog fuzzy-edge + CVD
- fogRenderer.ts makeRadialBrushTexture: angular edge-radius wobble (fixed sin-harmonic mix, explicit documented coefficients, deterministic by construction — no Math.random), amplitude ≤±12px INSIDE the existing 40px fade band; plateau (≤0.72) preserved. Zero per-frame cost (texture baked once). Knobs documented for playtest round 4.
- avatarRenderer.ts: per-seat nameplate "P{seat+1}" under each avatar — small monospace, white WITH dark stroke (contrast on any background, Grok R1#8 adopted-modified), alpha ~0.85. Color-independent identity at the action point.
- ui.ts connection dot: shape differentiation (connected=filled dot, lost=hollow ring/cross) — kills the green/red CVD trap.
- All render-local; sim/wire/RNG untouched. fog.spec probes are ≥160px from soft bands and fuzz stays inside the existing band → contracts hold (verify by running fog.spec locally; Gemini R1#4 addressed-by-verification).
- Logged follow-ups (NOT silently dropped): structure-ownership non-color cue (per-owner bond patterning) + above-fog hazard identity (S77 Δ5) + MEMORY_FOG_COLOR dim-tier restore (user-EYES knob, left black per S63 user tuning).

### P4 — netcode infra (3 slices; host-MIGRATION explicitly deferred — logged carry-forward)
- (a) CRYPTO HOST IDENTITY (lifts S79 TOFU race ceiling, no protocol bump — additive-optional fields, lockstep deploys):
  - NEW src/net/hostIdentity.ts: ECDSA P-256 session keypair (WebCrypto, 0 bundle bytes); roomCodeFromPubkey(spkiBytes)=SHA-256, first 30 bits big-endian, 5 bits/char over the existing 32-char alphabet (pure fn, fixed-vector unit tests, Grok R1#10); attestation payload = utf8('SPARK-HOST-ATTEST-v1') || u16be(len)||roomCode || u16be(len)||peerId (length-prefixed + domain-separated — Grok R1#11 + Gemini R1#5 convergent).
  - hostHandlers: room creation derives the code from the keypair (async ~50ms; lobby Host flow awaits); attestation {spkiB64, sigB64} attached to HELLO + START_GAME_SIGNAL.
  - clientHandlers hostAuthFilter: latch ONLY after async verify (fingerprint==roomCode AND sig valid AND sender peerId==signed peerId); verify ONCE, single in-flight, FAILURE leaves pre-latch state able to process the next attestation (Gemini R2#2); pre-latch host-authored messages drop fail-closed (today's behavior); persistent failure surfaces via lobby error-latch diagnostic.
  - Residual documented: ~30-bit preimage ≈ hours of keygen vs minutes-long lobbies (friends-play threat model); Trystero selfId spoofing at signaling layer remains out of scope.
- (b) IN-PAGE AUTO-RECONNECT (amends LOCKED §13.7 — user-authorized): client transport-loss during PLAYING → RECONNECTING state (grace ~15s, overlay text), retry leave+joinRoom(same code); same selfId (page alive) → host's frozen peerId→seat re-binds; rejoin success REQUIRES latched hostPeerId present in peerIds() (Gemini R1#7) else connection-lost; next 10Hz snapshot restores state; timeout → existing overlay. Host side: peerCount-0 grace before declaring loss. Host page refresh/death stays fatal (NOT covered — that is host-migration, deferred; R1 Grok#12 rejected with rationale: world state dies with the host page regardless of key persistence).
- (c) DROP-BENCH + INTENT ALLOWLIST (6p hardening): host-side, on seated peer absent mid-game past grace → re-stamp benchedUntilTick=tick+2s per tick (self-heals ≤2s after rejoin — Gemini R1#9 race resolved by construction; unit-tested); implemented as direct host-side dispatch of host-internal action; NEW CLIENT_INTENT_ALLOWLIST single source-of-truth const (Grok R2#2) enforced in the host INTENT handler — closes Δ2 (clients sending host-internal GameActions).
- e2e: protocol-mismatch specs unaffected (no bump). New reconnect e2e (if added) tagged @quarantine-flaky (real-WebRTC flake class); deterministic unit coverage gates instead. LOCKED amendments logged at close (§13.7 reconnect, §13.4 room-code derivation, new §13.20 host attestation + intent allowlist).

### P5 — lobby seat-UX delta (re-validated; Micro-scale)
- NEW src/render/seatRack.test.ts via pure-helper extraction (label composition + style derivation fns out of seatRack.ts).
- Correct the stale CARRIED banner on 2026-06-06_PDR_S69_P2_lobby-seat-ux_CARRIED.md (mark SUPERSEDED/SHIPPED — archive history preserved; R1 Grok#15 delete-file rejected).
- Remove vestigial hostPaneAlpha/joinPaneAlpha from lobbyView + their tests + orphaned helpers (Gemini R1#10 sweep).
- D1 animations + e2e geometry-getter migration stay DEFERRED (logged).

## TESTING PLAN
Per priority: tsc -b --noEmit clean; vitest full (1188 baseline, re-run not trusted from handoff); targeted new units (P1 ~14: hit/precedence/bench-skip/seat-order/chase-cap/exact-snap/clear-on-convergence/un-debuffed-guard/serialization round-trip/reach-reject; P2 ~5 incl. byte-identical resume; P3 ~4 pure helpers; P4 ~15: fingerprint vectors/attest encode/verify-fail-retry/allowlist/drop-bench self-heal/reconnect handler; P5 ~6). Playwright gating lane locally per gameplay/net change (seagull.spec for P1 — pre-audit avatar-vs-poop interception coupling BEFORE landing constants, S81 P2 lesson; fog.spec for P3; smoke+lobby-construction for P4/P5). Bundle <550KB. Live-preview boot-smoke for P1 feel + P3 visuals. MCV verification[] bound per priority BEFORE completed status.

## RISK ASSESSMENT
R1(HIGH) P4a async latch regression in lobby join flow → fail-closed drops mirror today's pre-latch; full smoke lane + real 2-context local run. R2(MED) P1 e2e coupling: falling poop intercepted by test cursor positions in seagull/smoke specs → pre-audit + keep test cursors away or assert new behavior. R3(MED) P4b reconnect leans on unverified Trystero same-selfId rejoin semantics → empirical local 2-context probe BEFORE building UI on it; if leave+rejoin mints a new peer relationship that the frozen hostSeats rejects, fall back to scope: reconnect attempts + overlay only (logged). R4(LOW) P2 wire leak → triple defense (param injection + Omit + test). R5(LOW) bundle creep → WebCrypto is built-in; measure at close. R6(LOW) P3 fog.spec exact-RGB asserts → fuzz confined inside existing band; local run gates.

## TOOL TRIAGE
Visual generation: none (vector Pixi; preview MCP verifies). External research: none (Council via Grok/Gemini MCP done). Artifact delivery: git/CI to spark-online.space.

DIFFERENTIAL_TEST_REQUIRED: false (game code, not OS hot-path; behavioral equivalence via existing suites). HOT_PATH_REFACTOR: false.
ESTIMATED TOKENS: ~120-180K total batch. MODEL: Fable 5 (user-directed this session).
CHECK PLAN: per-priority RALPH:PATROL-style self-sweep + full gates; Triumvirate-grade external CHECK satisfied by Council R1+R2 design-stage adversarial pass; Rule 22 runtime audit-pass at close (unrendered placeholders / restart-survival / CI runs).

## COUNCIL BATTLE LEDGER (R1: Grok 15 findings, Gemini 10; R2: CONVERGED both)
ADOPTED: per-tick target-chase movement model (supersedes per-message cap — Grok#2+Gemini#1 convergent BLOCKER); exact-snap convergence (Gemini R2#1); un-debuffed-UPDATE explicit guard (Grok R2#1); attest length-prefix+domain-tag (Grok#11+Gemini#5 convergent); fingerprint pure-fn + fixed vectors (Grok#10); verify-once + fail→pre-latch-retry (Grok#9 kernel + Gemini R2#2); rejoin requires latched host present (Gemini#7); verify-failure diagnostic (Gemini#8 lite); CLIENT_INTENT_ALLOWLIST single-source const (Grok#13+Gemini#6 convergent + Grok R2#2); seat-order determinism comment (Gemini#2); nameplate dark stroke (Grok#8 mod); orphan-helper sweep (Gemini#10); DEV-gate confirmation (Gemini#3).
REJECTED with rationale: Grok#1 collect-all-hits (single-victim consume IS the bodyblock mechanic; fixed order deterministic; precedence unit-tested); Grok#3 (moot — redesign removes extra traffic); Grok#5 spawner-on-wire (clients don't simulate; cheat-surface leak); Grok#12 host-keypair persistence (world state dies with host page — migration territory, deferred); Grok#14 (alpha fields are dead surface — tests deleted WITH the code they guarded); Grok#15 delete-archive (history preserved; banner corrected); Gemini#4 fog e2e invalid (fuzz confined inside existing band, probes ≥160px away — verified by running the spec).
PARTIAL: Grok#4 pickup-prediction divergence (documented + host-reject test; no local-reach change); Grok#7 LUT (fixed documented harmonics suffice).

## PRIME-AUDIT (Rule 20)
1) Not rubber-stamped: R1 forced a real redesign of P1 (target-chase) — synthesis materially better than R1 draft. 2) Boot-then-smoke: P1/P3 verified in live preview; P4a/b verified by local 2-context Playwright run (real WebRTC), not static parse — R3 probe ordered BEFORE dependent code. 3) Consensus-masking check: both externals independently hit the same two blockers (cap bypass, concat ambiguity) — genuine convergence. 4) Remaining edge cases owned: solo-mode poop-hit works (host==solo); potato-carrier hit while debuffed composes (bench skip only on benched); P4b unknown Trystero rejoin semantics explicitly de-risked by empirical probe with scoped fallback. 5) Wire/determinism: every new field additive-optional conditional-spread; no RNG stream touched anywhere in batch; replay byte-equality suite must stay green. Confidence: HIGH.

GATE: USER PRE-APPROVED (opener message) — executing.
