> STATUS: CARRIED/DEFERRED (flagged S74 handoff) -- DRAFT, never gated/executed. Lobby LOGIC changed substantially since this draft (S70 presence rack, S73 stable non-compacting seats), so this VISUAL-refactor draft needs RE-VALIDATION against the current lobby before any Council/gate. Was orphaned in the ephemeral .claude/plans/; archived here to preserve it.

═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S69 P2: Lobby seat-UX visual refactor
═══════════════════════════════════════════════════════════
Tier: FULL (>30K, net-integration-sensitive game UI) | Deliberation: 3-way Council (2 rounds + quality gate)
Status: DRAFT — pending Council + PRIME-AUDIT, then user GATE.

OBJECTIVE
  Rebuild the multiplayer lobby's VISUAL layer from the legacy 1v1 two-pane
  (HOST / JOIN) into a 6-seat "fill-the-room" seat-UX that visualizes the SHIPPED
  variable-2-6 FFA model, with the look drawn from the blueprint's vision (6
  color-coded seats, FFA, no scoreboard). Pure visual + pure-logic-extension —
  NO net-layer change (user-approved "option 1").

CURRENT STATE
  - Net layer (S62-S65, e2e-covered): MAX_PLAYERS=6; FFA 2-6; host mints the
    authoritative roster (seat 0=host, 1..N join-order) and ships it ONLY at
    Begin via START_GAME_SIGNAL (hostHandlers.ts:199); 7th+ peer dropped. During
    the LOBBY waiting phase the UI receives ONLY peerCount (main.ts:795) — the
    per-seat roster (seat/peerId/color) is NOT available pre-Begin.
  - Visual (lobbyScreen.ts, 548 LOC): 1v1 two-pane HOST/JOIN; connected count
    shown as a status STRING ("N players connected - press Begin Match (up to 6)");
    single Begin button; inactive pane dims to alpha 0.3. The pure reducer
    (lobbyStateMachine.ts) + geometry/coords (lobbyGeometry.ts) are already
    extracted + unit-tested.
  - Blueprint III.1 [LOCKED]: "Exactly 6 players. Fills to 6 or does not start."
    FSM WAITING_FOR_PLAYERS -> COUNTDOWN -> PLAYING (auto-start, no manual Begin).
    The VISUAL vision (6 colored seats, FFA, no scoreboard) IS honored; the
    exactly-6 / auto-start START-SEMANTICS are intentionally NOT adopted (code
    already uses host-triggered 2-6; user approved option 1). Divergence logged.
  - e2e safety net: lobby-construction.spec.ts (S63, built FOR this refactor) +
    smoke.spec.ts + helpers.ts drive the lobby via __SPARK__.lobbyScreen accessors
    (getRoomCode / getStatusText / getDebugState), the input[maxlength=6] selector,
    and button click COORDS computed from layout constants (Begin at
    paneY+PANE_HEIGHT+70). e2e is NOT in tsconfig and knip-invisible.

SCOPE (6 changes, ~6 files)
──────────────────────────────────────────────────────────
1. src/render/lobbyStateMachine.ts (modify)
   Extend the PURE reducer's view derivation: add `seats: readonly SeatView[]`
   (length MAX_PLAYERS) to LobbyView. SeatView = {index, color: PLAYER_COLORS[index],
   occupied: boolean, isHost: boolean, isYou: boolean}. Derive from (mode,
   peerCount, hostConnected): total = peerCount+1 when connected else (mode!=select?1:0);
   occupied = index < total; isHost = index===0; isYou = (hosting && index===0).
   roomFull = total >= MAX_PLAYERS. Keep LobbyState shape + ALL transitions +
   same-ref churn-guard byte-identical (ADD-only).

2. src/render/lobbyGeometry.ts (modify)
   Add PURE seat-rack layout: SEAT_COLS=3/SEAT_ROWS=2 + getSeatRect(i) -> {x,y,w,h}
   for a centered 6-slot rack, inside canvas bounds, non-overlapping. Keep ALL
   existing pane/button/coord helpers (e2e + tests depend on them); only the
   select-screen Host/Join button positions may shift (covered in test plan).

3. src/render/lobbyScreen.ts (modify — primary change)
   Replace the two-pane ROOM visualization with the seat-UX:
   - SELECT screen entry UNCHANGED in interaction: "Host New Room" + Join-via-
     HTML-input (same input element, same focus/paste/IME).
   - Once hosting/joining: render the 6-seat rack from view.seats — swatch
     Graphics in PLAYER_COLORS[seat] + label; HOST badge on seat 0; "(you)"
     marker; empty seats = dim dashed outline "Waiting...". Prominent room code
     (host). Room-full (6/6) indicator. Begin (host, enabled at 2+) / "Waiting
     for host..." (joiner). Back.
   - KEEP shell pieces verbatim: HTML input overlay + resize/visualViewport,
     diagnostic strips (updateDiagnostics/updateHostDiagnostics), connection-lost
     overlay, error latching, AND all DEV/e2e accessors (getRoomCode,
     getStatusText, getDebugState, getInputElement, destroy) — names + signatures
     unchanged.

4. src/render/lobbyStateMachine.test.ts (modify)
   Add seat-view derivation tests: occupancy-by-count (0..6), host=seat0,
   isYou in hosting, roomFull at MAX_PLAYERS, empty in select. Keep all existing
   reducer tests + the status-literal canary (e2e depends on those literals).

5. src/render/lobbyScreen.test.ts (modify)
   Add getSeatRect bounds + non-overlap + count tests. Update the layout-position
   regression tests (Host/Connect button bounds) to the new select-screen layout.
   Keep the pure geometry/validation tests (sanitize/validate/mapCanvasRectToPage/
   cssToCanvasCoords/JOIN_INPUT_RECT) intact.

6. e2e/helpers.ts + e2e/*.spec.ts (modify as needed)
   Update button click COORDS + any selectors the new layout moves so
   lobby-construction.spec.ts + smoke.spec.ts + nplayer.spec.ts stay green.
   Preserve the __SPARK__ accessor contract (no renames). RUN Playwright to
   verify (e2e is tsc/knip-blind — static gates cannot catch a coord drift).

NO CHANGES TO
  - Net layer: transport.ts, hostHandlers.ts, clientHandlers.ts, protocol.ts,
    sync.ts. No new message kind, NO protocol-version bump, roster still ships at
    Begin. The variable-2-6 host-Begin model is unchanged.
  - gameMode.ts seating / radialSpawnPos / applyStartGame.
  - The reducer's existing LobbyState shape + the 5 transitions (ADD the derived
    seat view only).
  - constants.ts (PLAYER_COLORS + MAX_PLAYERS already exist).
  - The HTML input overlay mechanics, connection-lost overlay, diagnostic-strip
    logic, error-latch semantics.

RISK ASSESSMENT
  - R1 (HIGH) e2e breakage — moved button coords/selectors -> Playwright clicks
    miss. MIT: keep __SPARK__ accessors stable; update e2e coord computation in
    lockstep; RUN full Playwright (gating + lobby-construction + smoke) pre-ship;
    lobby-construction.spec.ts was built S63 expressly as this refactor's net.
  - R2 (MED) reducer regression — extending LobbyView perturbs transitions/churn.
    MIT: ADD-only derived field; LobbyState + same-ref no-op gate byte-identical;
    existing reducer tests + status canary must stay green.
  - R3 (MED) roster-fidelity gap — count-based seats don't show per-seat IDENTITY
    on joiners pre-Begin (roster ships at Begin only). MIT: deliberate scope
    (R-min); LOG R-full (live lobby-roster broadcast = new net msg) as an explicit
    carry-forward, NOT silently dropped (INTEGRITY-WARNING discipline).
  - R4 (LOW) Pixi render not vitest-testable. MIT: pure parts (seat view +
    geometry) unit-tested; render path via self-driven boot-smoke (preview MCP) + e2e.
  - R5 (LOW) size charter — lobbyScreen.ts already 548 LOC (>500 charter). MIT:
    keep pure logic in reducer/geometry; seat rack replaces two-pane code (roughly
    net-neutral); if it grows, note as accepted + flag a follow-up extraction.

TESTING PLAN
  - tsc -b --noEmit PASS; knip 0; vitest run (1000 + new seat-view + getSeatRect);
    reducer tests + status canary green; vite build <=550KB.
  - Self-driven boot-smoke (preview MCP): TITLE->1v1->LOBBY; host shows code +
    6-seat rack filling (1/6 ...); 2-tab or simulated peer -> seats fill + Begin
    enables; joiner shows waiting + count. Zero console errors.
  - Playwright: gating lane (MUST pass) + lobby-construction.spec.ts + smoke.spec.ts;
    behavioral-equivalence on the host/join/Begin flow (same flow e2e already asserts).
  - MCV (S150): verification[] binding file_contains assertions on getSeatRect +
    the seats view + seat render + grep_count on the new symbols.

TOOL TRIAGE
  Visual output needed?     No image GENERATION — UI is Pixi-drawn vector. Verify via preview MCP screenshots, not Imagen/Veo.
  Research/external data?    No — design sourced from local blueprint + code (already read this session).
  Artifact delivery needed?  No — shipped via git/CI to spark-online.space.

DIFFERENTIAL_TEST_REQUIRED: false
  SCOPE touches src/render game UI, NOT ~/.claude/lib/hooks/router/LLM-prompt/schema.
  Behavioral-equivalence is still covered: e2e on the host/join/Begin flow + the
  reducer's byte-identical preserved transitions.

HOT_PATH_REFACTOR: false
  Not an OS hot-path (lib/hooks/router/classifier/LLM/schema). It IS net-integration-
  sensitive game UI -> CHECK is full Triumvirate + Playwright, but the S103
  OS-hot-path escalation rule does not apply.

ESTIMATED TOKENS: ~35-45K (Full — lobbyScreen rebuild + reducer/geometry extension
  + test updates + e2e sweep + boot-smoke + Triumvirate CHECK).
MODEL: Opus 4.8 (ALWAYS — S154).

CHECK PLAN: Triumvirate (RALPH:PATROL + GROK-ANALYST + GEMINI-AUDITOR) + Rule22 + Playwright.

───────────────────────────────────────────────────────────
COUNCIL R1+R2 SYNTHESIS (3-way, Full tier) — Battle Ledger
───────────────────────────────────────────────────────────
Positions: Claude(Architect)=net-free count-based visual; Grok(Disruptor)=split the
548-LOC file + evolve the state model + add a tiny LOBBY_ROSTER broadcast; Gemini(Auditor)=
functional+efficient but count-based caps UX quality, add a presence beacon + living-lobby polish.

ADOPTED:
- A1 (Grok, HIGH): EXTRACT the seat rack to NEW src/render/seatRack.ts (+ test). lobbyScreen.ts
  is already 548>500 charter; do NOT grow the shell. Matches the lobbyStateMachine/lobbyGeometry/
  connectionLostOverlay extraction precedent. [Claude x1.75 CONCUR — implementation domain]
- A2 (Grok — CORRECTS Claude): the reducer is NOT "byte-identical ADD-only". LobbyState must
  STORE peerCount (currently absent — only the status STRING holds it) so seats update on count
  change in BOTH hosting AND joining modes; churn-guard keys on count-delta OR status-change OR
  latch. PRIME-AUDIT self-correction (my "byte-identical" claim was wrong).
- A3 (Grok R9): FIXED control-button positions (independent of seat count); e2e drives via
  geometry getters not hardcoded coords — stabilizes Playwright vs layout shift + WebRTC timing.
- A4 (Gemini #3, HIGH): accessibility — empty seat = dashed outline + centered glyph (+/circle);
  occupied = solid swatch. Non-color state indicator; partial CVD de-risk within the vector constraint.
- A5 (Gemini #2): static "you" emphasis (brighter swatch + glow outline) on the local player's seat.

DEFERRED (logged, NOT dropped):
- D1 (Gemini #1): seat fill/empty animations ("Living Lobby") — polish follow-up (adds tweening).
- D2 (Grok): configurable SeatLayout strategy (2x3/circle/hex) — YAGNI now.

ESCALATED TO OWNER (SPLIT — Council CONVERGENT, scope decision):
- S1 (Grok LOBBY_ROSTER + Gemini presence-beacon, independent convergence): a ~6-byte host->peer
  broadcast of occupied seats on join/leave removes the count-based host/joiner desync (R6) and
  enables true per-seat fill/empty. Council RECOMMENDS it. BUT it expands beyond the owner-approved
  "no net change" -> OWNER DECIDES: (A) net-free count-based now [approved scope, B as next priority],
  or (B) +minimal presence broadcast [Council-recommended, +~50% scope: 1 additive msg + handlers + tests].

NEW RISKS (Council): R6 host/joiner seat-0 mental-model desync (count-based) [->S1]; R7 label/badge
overlap at 6 seats (mitigate: fixed layout + bounds tests); R8 z-index empty-behind-occupied
(explicit layering); R9 e2e timing/coord (mitigate A3); R10 future exactly-6 debt (acknowledged —
divergence already logged); R11 charter (mitigate A1).

REVISED SCOPE DELTA: +src/render/seatRack.ts (new) + src/render/seatRack.test.ts (new); reducer
stores peerCount (A2); accessibility glyphs (A4) + you-emphasis (A5). Files now ~8. EST ~40-50K.

PRIME-AUDIT: (1) corrected the "byte-identical reducer" error -> A2 principled state extension.
(2) Surfaced the rubber-stamped "no net change" as an explicit owner decision (S1) instead of
burying it as a vague carry-forward. (3) Grok+Gemini converge on S1 for DIFFERENT reasons
(risk/ambiguity vs quality/UX) = genuine convergence, not coincidence. Synthesis materially > R1
(extraction, corrected state model, accessibility, honest scope split). Confidence: HIGH.

═══════════════════════════════════════════════════════════
    GATE: Awaiting owner GO + the S1 scope decision (A or B)
═══════════════════════════════════════════════════════════
