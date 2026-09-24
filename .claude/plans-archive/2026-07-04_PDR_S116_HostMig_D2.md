# PDR — S116: Host-Migration D2 — instrument-only detection layer (epoch + starvation + successor calc + live identity wiring)

**Date:** 2026-07-04 · **Tier:** Standard (S115 D1 precedent) · **Council:** 3-WAY R1 (Grok-4.20-reasoning ANALYST + Gemini-2.5-pro AUDITOR + Claude Supervisor) — Gemini BACK ONLINE (no 429)
**Status:** AWAITING USER APPROVAL

═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S116: Host-Migration D2
═══════════════════════════════════════════════════════════

OBJECTIVE
  Ship the D2 phase of HOST_MIGRATION_DESIGN.md §9: activate the dormant D1 identity
  plumbing (live client keygen + HELLO pubkey), issue the SuccessionWarrant at Begin,
  add the epoch envelope field, the snapshot-starvation detector, and the pure successor
  computation — ALL instrument-only (console forensics; zero takeover behavior, zero UI).
  This makes D3 (MIGRATION_CLAIM takeover) a single concern next session.

CURRENT STATE (A.0-verified this session, commit 7d4d5c8, tsc 0 / vitest 1779/1779)
  - D1 primitives shipped dormant (S115): successionWarrant.ts build/sign/verify/
    warrantedPubkeyForSeat; generateClientIdentity(); HELLO clientPubkeyB64?
    (fail-closed parse, NO live sender).
  - NetSnapshotMsg = {kind, snapshotSeq, snapshot} — envelope has no epoch.
  - ClientSync.receive(msg, performance.now()) called from the TRANSPORT callback
    (clientHandlers.ts:207) — arrival-time stamping already exists structurally.
  - START_GAME_SIGNAL carries additive-optional hostAttest (precedent channel).
  - generateHostIdentity() boot-parallel promise (main.ts:230). RECONNECT_GRACE_MS
    15000 (main.ts:982). session.hostSeats freezes peerId→seat at Begin.
  - PROTOCOL_VERSION = 14.

SCOPE (8 changes, 8 files + tests)
──────────────────────────────────────────────────────────
1. src/net/hostIdentity.ts (modify) — proof-of-possession [GROK FIX]: new injective
   domain-separated buildPubkeyPopPayload(roomCode, selfId, spki); client signs it with
   its ephemeral key; verifier helper. Closes the "claim any pubkey in HELLO" hole.
2. src/net/protocol.ts (modify) — HELLO += clientPubkeyPopB64? (fail-closed);
   NetSnapshotMsg += epoch?: number (absent=0, fail-closed type check);
   StartGameMsg += warrant? (fail-closed shape validation); buildHello threading.
3. src/main.ts (modify) — boot clientIdentityPromise (joiner path, mirror of host
   pattern); networked-client render-path starvation check: edge-triggered latch
   (re-arm on recovery), console.warn forensics = {sinceMs, would-be successor,
   warrant present?, aliveSeats, document.visibilityState + lastVisibilityChangeAt
   [GEMINI FIX 1]}. No claim, no UI.
4. src/net/clientHandlers.ts (modify) — HELLO populates pubkey+PoP; on
   START_GAME_SIGNAL: verifyWarrant → session.warrant; verify-fail/absent =
   log + ignore, match proceeds (fail-open — instrument phase).
5. src/net/hostHandlers.ts (modify) — HELLO handler verifies PoP BEFORE storing
   peerId→pubkey in session.peerPubkeys (garbage/unproven → ignore field + log);
   Begin path: build+sign warrant from roster ∩ peerPubkeys BEFORE broadcasting
   START_GAME_SIGNAL / starting snapshot emission — ordering by construction
   [GROK R1 FIX]. Mixed-v14-build tolerance: seats without proven pubkeys OMITTED
   from warrant (they just can't be successor in D3+; strictly less harm than a
   version bump that would disconnect them entirely).
6. src/net/session.ts (modify) — peerPubkeys Map, warrant, currentEpoch (0),
   teardown resets (mirror hostSeats.clear()).
7. src/net/sync.ts (modify) — HostSync stamps epoch; ClientSync: lastAcceptedAtMs
   + epoch gate (drop epoch < currentEpoch — PROVABLY inert at 0: 0<0 false).
8. NEW src/net/succession.ts — pure computeSuccessorSeat(warrant, aliveSeats)
   (lowest warranted surviving seat | null) + isSnapshotStarved(now, last, ms) +
   HOST_STARVATION_MS = 6000.

TESTS (~35 new): successor permutations incl. MIXED-BUILD (alive seats absent from
warrant) [GEMINI FIX 2]; crypto failure paths — wrong-key warrant, malformed sig,
garbage PoP [GEMINI FIX 3]; async slow-sign Begin ordering [GEMINI FIX 4 / GROK];
epoch inert-gate + absent=0 back-compat; nowMs-jump starvation (background-tab
proxy); old-message parse (no epoch/warrant/PoP) unchanged; save.replay
byte-identity re-run (epoch is ENVELOPE-only — never enters WorldSnapshot/save).

NO CHANGES TO
  PROTOCOL_VERSION (held 14 — every field additive-optional, no new kinds);
  WorldSnapshot/save format; MIGRATION_CLAIM/takeover (D3); reconnect grace
  machinery; CLIENT_INTENT_TYPES; any render/game-feel path; deploy (manual).

RISK ASSESSMENT
  R1 Begin async ordering (Grok kill-shot) → sign BEFORE any Begin broadcast on the
     host (ordering by construction) + slow-sign test; client tolerates absent warrant.
  R2 fake-pubkey HELLO (Grok) → PoP signature verified host-side before storage.
  R3 background-tab false starvation → DEFUSED with evidence: receive() is
     transport-driven (clientHandlers.ts:207), so lastAcceptedAtMs stays fresh while
     backgrounded; residual ambiguity covered by visibilityState in the forensic
     payload. Real-browser background e2e DELIBERATELY DOWNGRADED to a nowMs-jump
     unit test (headless throttling infidelity — logged, PRIME-AUDIT).
  R4 epoch landmine (Grok REJECT) → OVERRULED WITH EVIDENCE: epoch rides the
     NetSnapshotMsg ENVELOPE, not the save path (save.replay untouched by
     construction); gate inert at 0. CARRY-FORWARD (logged): D4 must design
     epoch-advance/reset rules + late-packet semantics before activation.
  R5 console spam → edge-trigger latch, one line per starvation episode.

TESTING PLAN
  tsc 0 · full vitest (1779 + ~35 new) · save.replay byte-identical · bundle < 750
  charter · e2e lobby/Begin lane on tip · in-browser 0-console-error smoke ·
  RALPH:PATROL. Deploy manual (npm run deploy) only after gates green.

TOOL TRIAGE
  Visual output?      No — netcode + console forensics; nothing rendered.
  Research/external?  No — design doc + code are authoritative; Council R1 done.
  Artifact delivery?  No — code + tests in-repo.

DIFFERENTIAL_TEST_REQUIRED: false — no ~/.claude lib/hooks/router/LLM-prompt/schema
  scope; the equivalence burden is carried by save.replay byte-identity + protocol
  back-compat tests (stronger, domain-native).
HOT_PATH_REFACTOR: false — project netcode, not OS hot-path; already at 3-way
  Council R1 regardless.

ESTIMATED TOKENS: ~25K | MODEL: claude-fable-5 (ALWAYS-STRONGEST)

BATTLE LEDGER (R1)
  W1 identity: Grok ADOPT-WITH-FIX (PoP) · Gemini ADOPT → ADOPTED + PoP fix.
  W2 warrant@Begin: Grok REJECT (async race, "smuggled D3") · Gemini ADOPT
    (W5 untestable without it) → SUPERVISOR: IN, with Grok's ordering fix +
    fully fail-open verify. Honest note: this is a real 1-1 split; the design
    doc's D2 line does NOT list W2 — Gemini's cohesion argument + the D1-tested
    primitives tipped it. Owner may strike W2 → pure-detection D2 (W1,3,4,5).
  W3 epoch: Grok REJECT (determinism/landmine) · Gemini ADOPT (textbook dormant)
    → SUPERVISOR: ADOPTED — Grok's determinism claim rested on an envelope/save
    conflation refuted by code read; landmine logged as D4 carry-forward.
  W4/W5: both ADOPT-WITH-FIX → all four Gemini fixes + Grok's test list folded in.

PRIME-AUDIT DELTA
  - Grok's W3 REJECT partially hallucinated a save-path coupling; refuted by
    protocol.ts:216 (envelope) vs save.ts (payload) — overrule is evidence-based,
    not consensus-masking.
  - R2 was MY unverified fear too; probe (clientHandlers.ts:207) defused it.
  - Deliberate downgrades logged: no real-browser background-tab e2e (headless
    infidelity); D4 epoch-advance rules deferred (carry-forward, not dropped).
  - Boot-then-smoke: warrant path crosses real WebRTC only in e2e — Begin lane
    runs on tip + in-browser smoke before deploy.

═══════════════════════════════════════════════════════════
    GATE: Awaiting approval to proceed
═══════════════════════════════════════════════════════════
