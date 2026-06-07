# PDR — S73 P1: Stable (non-compacting) lobby seats

**Tier:** Standard (10–30K; ~4–6 files, wire-adjacent net/lobby logic) → 3-way Council, 1 round, Battle Ledger.
**Session:** S73 · **Author:** ZERO/KARPATHY · **Status:** R1 DRAFT (pre-deliberation)

---

## 1. OBJECTIVE
When a player leaves the **lobby**, the remaining players currently **reshuffle** seats + colors
(seat = index in `transport.peerIds()`, a compacting `Set`). Fix: remaining players **keep their
seat + color**; the leaver's seat shows **empty**; a new joiner fills the **lowest empty seat**.
The lobby rack becomes stable (non-compacting). User-value: friends in a lobby stop "changing
color/slot" every time someone drops & rejoins — the #1-ranked, most-tractable backlog item.

## 2. SCOPE
**IN**
- `src/net/lobbyRoster.ts` — replace the stateless positional builder with: a pure
  `reconcileLobbySeats(prev, peerIds)` (stable seat-map), a stable projection for the LOBBY
  preview (holes allowed), and a **dense** projection for the Begin authoritative roster.
- `src/net/hostHandlers.ts` — host holds the stable map on `session`, reconciles on each
  `onPeerChange`, broadcasts the stable roster; at **Begin**, compacts the SAME map to a dense
  roster and freezes `hostSeats` from it.
- `src/net/session.ts` — add `lobbySeats: Map<string, number>` (+ clear in `teardownNet`).
- `src/net/lobbyRoster.test.ts` — rewrite for stable behavior + reconcile/compaction; add cases.

**OUT (explicitly deferred / unchanged)**
- In-game **sparse** seats (Option 2). `radialSpawnPos(seat, total)` uses `seat/total`, so a hole
  (e.g. seats {0,1,3}, total 3 → seat 3 angle == seat 0 angle) would **overlap avatars**. The
  game requires **contiguous** seats. Making the game tolerate holes (spawn-by-ordinal) is a
  bigger change to the determinism-critical core + N-player tests → **logged carry-forward to #4
  netcode-infra**, NOT this session.
- Render layer (`lobbyStateMachine.ts`, `seatRack.ts`, `lobbyScreen.ts`, `main.ts` digest):
  **UNCHANGED**. Verified shape-agnostic — `lobbyView` already does `bySeat.get(i)` for
  `i in 0..MAX_PLAYERS` (a missing seat → empty cell), and the digest maps RosterEntry→SeatPresence
  by field. Holes "just work" on the client.
- **Wire protocol shape + `PROTOCOL_VERSION` (stays 5).** `RosterEntry {seat,peerId,color}` and
  `isValidRoster` (`length ≤ MAX_PLAYERS`, no contiguity assumption) are unchanged. A LOBBY_PRESENCE
  roster with holes is still a valid, ≤MAX_PLAYERS array. No new client intent → no bump (the S71
  v4→5 bump stands). `clientHandlers.ts` unchanged.

## 3. APPROACH — Option 1b (single source of truth)
The **stable seat-map** (`session.lobbySeats: Map<peerId, seat>`, seats `1..MAX_PLAYERS-1`; host is
always seat 0, not stored) is the ONE source of truth, projected two ways:

- **`reconcileLobbySeats(prev, peerIds)`** (pure): keep present peers' seats; drop departed peers'
  seats (frees the hole); assign each genuinely-new peer the **lowest free seat ≥1**; a new peer
  with no free seat (room full) is left unseated (host-authoritative cap, matches today).
- **`buildLobbyRoster(seatByPeer, selfId)`** (pure) — STABLE preview projection: `seat 0 = host`,
  plus one entry per seated peer **ordered by seat asc**; seats may be **non-contiguous** (holes).
  Drives `LOBBY_PRESENCE` + the host's own rack.
- **`buildMatchRoster(seatByPeer, selfId)`** (pure) — DENSE Begin projection: compacts the seated
  peers to **contiguous** seats `0..N-1` (host=0; remotes re-densified in **ascending stable-seat
  order**) so the game's `radialSpawnPos(seat, total=N)` gets the contiguous seats it requires.
  Color = `PLAYER_COLORS[denseSeat]`. Drives `START_GAME_SIGNAL` + `hostSeats`.

**Why 1b and not "make the lobby stable, leave Begin positional" (1a):** 1a **diverges**. After a
hole is back-filled (new peer takes a freed lower seat), the stable map's assignment disagrees with
`peerSet` insertion order, so the lobby preview and the positional Begin roster assign **different
seats/colors to the same peers** (a lobby↔game color swap). S70 deliberately UNIFIED preview & Begin
via one builder to prevent exactly this drift; 1b preserves that by projecting both from the one map.

**Accepted tradeoff:** if a hole persists **unfilled to Begin** (someone left a lower seat and no one
replaced them), the dense compaction shifts the players above the gap down one seat → a **one-time
color change at match start** for those players. This is far milder than the bug being fixed (the
lobby reshuffling on *every* leave) and only triggers on an unfilled mid-lobby departure. Documented;
the shift-free version is Option 2 (deferred).

## 4. FILES
| File | Change | ~LOC |
|---|---|---|
| `src/net/lobbyRoster.ts` | reconcile + 2 projections (was: 1 positional builder) | ~50 |
| `src/net/hostHandlers.ts` | hold map, reconcile on peerChange, compact at Begin, hostSeats from dense | ~25 |
| `src/net/session.ts` | `lobbySeats` field + teardown clear | ~6 |
| `src/net/lobbyRoster.test.ts` | rewrite + new cases (reconcile/holes/compaction/idempotence) | ~120 |
| (maybe) `src/net/hostHandlers.test.ts` or extend | Begin-compaction + hostSeats freeze | ~tbd |

Render/protocol/client: **0 LOC**.

## 5. RISKS & MITIGATIONS
1. **Determinism / replay** — Begin MUST stay dense or `radialSpawnPos` overlaps + N-player
   determinism tests + `save.replay` byte-equivalence break. → `buildMatchRoster` always emits
   contiguous `0..N-1`; run full vitest + `save.replay` + the N-player seating suite.
2. **Lobby preview ↔ Begin divergence** (the 1a bug) → single-source-of-truth map (1b); add a unit
   canary asserting that with NO holes, the stable and dense projections agree.
3. **e2e is tsc-blind** (lobby specs live outside tsconfig) → run the Playwright gating lane
   (`--grep-invert "@quarantine-flaky"`) — lobby construction / presence specs.
4. **One-time Begin color shift** (accepted) → documented; carry-forward Option 2.
5. **`hostSeats` correctness** (anti-spoof intent stamping) — must key peerId→**dense** in-game seat
   (not stable seat) so stamps match the world's seats → freeze `hostSeats` from `buildMatchRoster`.
6. **Teardown / lifecycle** — `lobbySeats` must clear on `teardownNet` (lobby Back / peer-drop /
   postgame) so a fresh Host/Join starts empty → add to `teardownNet`; mirror the `hostSeats.clear()`.

## 6. TESTING
- **Unit (`lobbyRoster.test.ts`)**: host-alone → [seat0]; join order assigns 1,2,3; **leave frees the
  hole, incumbents unchanged**; **back-fill takes the lowest free seat** (the 1a-divergence case);
  cap at MAX_PLAYERS (7th unseated); stable projection emits holes ordered by seat; dense projection
  compacts to contiguous 0..N-1 with `PLAYER_COLORS[denseSeat]`; idempotent reconcile; **no-hole
  canary: stable==dense seat numbers**.
- **Regression**: full `vitest` (expect 1096 → +N green); `save.replay` byte-equivalence held;
  N-player seating suite (`nplayerSeating.test.ts`) unchanged-green (proves dense Begin preserved).
- **Build**: `tsc -b` + `vite build` (bundle ~529KB ± noise).
- **e2e**: Playwright gating lane — lobby construction + presence + (sanity) a full 1v1/3p start.

## 7. ROLLBACK
Single commit. Revert restores the positional `buildLobbyRoster(peerIds, selfId)`. No wire/protocol
change → **no cross-version concern** (a reverted client and a stable-seat client both speak v5 with
the identical RosterEntry shape; the only difference is which seat numbers appear — both valid).

## 8. OPEN QUESTIONS → DELIBERATION
- **Q1 (resolved, present for challenge):** 1a vs 1b → **1b** (1a diverges on back-fill). Challenge?
- **Q2 (scope):** Option 1 (bounded; dense Begin; one-time shift) vs Option 2 (sparse in-game; no
  shift; touches determinism core). Recommend **Option 1** + log Option 2 → #4. Challenge the
  deferral?
- **Q3 (policy):** hole-fill = **lowest-free** (rack stays visually compact, incumbents never move)
  vs append-only/monotonic (gaps persist, seats exhaust in 6 cycles). Recommend **lowest-free**.
- **Q4 (test surface):** is a dedicated `hostHandlers` Begin-compaction test worth the Pixi-free
  extraction, or do the pure-`lobbyRoster` tests + the e2e start cover it?

---

## 9. DELIBERATION OUTCOME — 3-way Council (Claude + Grok-4.20-reasoning + Gemini-2.5-pro)
Both external reviewers: **ADOPT-WITH-CHANGES**. Battle Ledger (each finding triaged against the
ACTUAL code read this session — not rubber-stamped):

| # | Source | Finding | Verdict | Reasoning (code-grounded) |
|---|---|---|---|---|
| 1 | Grok G3 + Gemini Ge3 | **Pure-fn + e2e tests miss the STATEFUL sequence** (join,join,leave-middle,back-fill,Begin). Need table-driven sequence coverage. | **ADOPT (primary change)** | The heart of the feature is the *accumulation* in `session.lobbySeats`. Since `reconcileLobbySeats` is PURE, I test the full sequence by **folding** reconcile over an event list (no Pixi extraction) → assert map + both projections at each step. Resolves Q4: the fold covers the logic; e2e covers the host glue (`send`/`onPresence`). |
| 2 | Grok G4 | **Invariant untested:** no two peers share a seat; host always 0; seats in [1,MAX-1]. | **ADOPT (test + comment)** | Structurally guaranteed (assign lowest-FREE over KEPT seats), but add an explicit invariant assertion across the sequence test. |
| 3 | Grok G1 | reconcile assigns NEW peers in `peerIds` iteration order → "non-deterministic across replays, breaks save.replay." Suggests canonical peerId sort. | **PARTIAL — reject the sort, adopt the clarity** | **save.replay does NOT replay lobby seating** (it replays the seeded *game* sim; rosters are passed to `applyStartGame` directly in tests, never through reconcile). Assignment is **arrival-ordered** (= `peerSet` insertion order) — the only intuitive contract ("first to join → lower seat"). A peerId sort would be *arbitrary* + worse UX. Keep arrival-order; **document it's deterministic-given-the-event-sequence, not part of replay.** |
| 4 | Grok G2 + Gemini Ge2 | **TOCTOU:** peer leaves between Begin's roster build and clients applying START_GAME_SIGNAL. | **PRE-EXISTING — document, carry-forward #4** | EXISTS TODAY (Begin already reads `peerIds()` then ships). NOT worsened: clients seat from `msg.roster` (the shipped authoritative roster), **not** local `peerIds` (`clientHandlers.ts:100`), so a just-left peer is seated-but-idle, same as today. Belongs to #4 netcode. |
| 5 | Gemini Ge1 | **Host-migration stale `lobbySeats`** → corruption in `buildMatchRoster`. | **N/A today + PARTIAL** | SPARK has **no host migration** (backlog #4, not built). Host is fixed per session. Real hygiene point — clear on re-Host — already in scope (`teardownNet` clears `lobbySeats`, mirroring `hostSeats.clear()`). Carry-forward: a future #4 host-migration PDR MUST init `lobbySeats` fresh on promotion. |
| 6 | **Gemini Ge4** | **MUST bump PROTOCOL_VERSION** — "LOBBY_PRESENCE changes to a SPARSE array with null holes; old positional client desyncs." | **REJECT — factual error in premise (PRIME-AUDIT delta)** | The roster is **NOT sparse/null** — it's a COMPACT array of *occupied* seats whose `seat` FIELD can be non-contiguous, e.g. `[{seat:0},{seat:1},{seat:3}]` (length 3). `isValidRoster` (protocol.ts:329) checks `length ≤ MAX_PLAYERS` + per-entry shape — **no contiguity assumption**. The client renders the **received** roster via `lobbyView`'s `bySeat.get(i)` (lobbyStateMachine.ts:329) — never a local positional recompute (that's the point of S70). Begin stays **dense** (unchanged). Wire shape + schema identical → **no bump**, per S70's own no-bump-cosmetic-presence precedent + friends-only single-deploy. |

### 9.1 PRIME-AUDIT (Rule 20) — adversarial self-audit + delta
- **Consensus-masking-disagreement:** Gemini says BUMP, I say NO-BUMP (#6). I do **not** silently override — I refute with three verified code facts: (a) `isValidRoster` has no contiguity check; (b) the client presence rack renders the *received* roster (`bySeat.get(i)`), never a local positional recompute; (c) Begin's `START_GAME_SIGNAL` roster stays dense/unchanged. Gemini's "sparse array with nulls" is a misread of the data shape. **No-bump CONFIRMED.** (If a future cross-version feature needs it, the S52 new-client-intent→bump precedent applies — same hook as S72's logged no-bump carry-forward.)
- **Runtime-verifiability (boot-then-smoke):** net/lobby state-machine logic, not Docker/deploy. Pure fns get runtime coverage via vitest; the host wiring gets *real-browser* coverage via the Playwright lobby/presence specs (cross-browser join/leave). Runtime-validated, not static-parse-only.
- **Mtime:** N/A (no leak/regression-landing claim).
- **Materially-better-than-R1?** Yes — adds the **stateful sequence fold** (the real regression surface) + the invariant assertion + the no-hole stable==dense canary. Confidence: **HIGH**.

### 9.2 Final decisions (Q1–Q4)
- **Q1 → 1b** (single source of truth; 1a diverges on back-fill — both reviewers concede).
- **Q2 → Option 1** (bounded; dense Begin; accept the one-time Begin shift). Option 2 deferred to **#4** (both reviewers concede the deferral).
- **Q3 → lowest-free** hole-fill (incumbents never move; rack stays compact; no 6-cycle exhaustion). Both concede.
- **Q4 → pure reconcile-fold sequence test** (no Pixi-free host extraction); e2e covers the host glue.

### 9.3 Carry-forwards logged (not dropped)
- (a) **Option 2** — sparse in-game seats (spawn-by-ordinal) for a fully shift-free experience → #4 netcode.
- (b) **TOCTOU late-leave** at Begin (pre-existing) → #4 reconnect/late-leave.
- (c) **Host-migration** must init `lobbySeats` fresh on promotion → #4 host-migration.

**STATUS: R2 FINAL — APPROVED (user pre-approved the full batch; `unlock_source=user`).**

---

## 10. SCOPE AMENDMENT — S73 P2 (Micro): bomb WIN-edge teardown parity
**Tier:** Micro (<10K; 3 LOC + 1 test, 2 files). Deliberation opt-in → auto-waived (user-path, `unlock_source=user`). CHECK = RALPH:PATROL + GROK-ANALYST. Trigger: surfaced by the S73 landing audit (Rule 22).

**OBJECTIVE:** Close the hazard-teardown asymmetry the landing audit found — `WIN_TRIGGER` clears `world.hunters` (`teardownHunters`) and `world.potatoes` (`teardownPotatoes`) but **not** `world.bombs`. A bomb live at the moment of WIN lingers on the win screen for the ~2s WIN dwell (cosmetic; can't be grabbed — grab is PLAYING-gated — and can't leak to the next match — `START_GAME` + `RETURN_TO_TITLE` both clear bombs). Completes the "all three hazards teardown on every PLAYING-exit edge" invariant S72 P4 was building toward.

**SCOPE — IN:** add `teardownBombs(world)` to `src/state/bombLifecycle.ts` (mirror `teardownHunters`/`teardownPotatoes`: `world.bombs.clear(); world.nextBombId = 0;`); import + call it in the `WIN_TRIGGER` case of `src/state/world.ts` alongside the other two; add a `bombLifecycle.test.ts` case asserting a dispatched `WIN_TRIGGER` clears live bombs. **OUT:** the inline `START_GAME`/`RETURN_TO_TITLE` bomb-clears stay inline (they already work + match the hunter/potato inline style there — no refactor); the bomb-e2e-spec gap is larger test-debt → spun off as a chip.

**TESTING:** `bombLifecycle.test.ts` WIN-clears-bombs case (mirror the hunter/potato WIN teardown tests); full `vitest` green; `tsc`/`knip 0`/`build`; Playwright gating lane re-run (gameplay-edge change, per the gotcha rule).

**ROLLBACK:** single commit; revert removes the helper + the WIN call (reverts to the pre-amendment asymmetry — harmless).
