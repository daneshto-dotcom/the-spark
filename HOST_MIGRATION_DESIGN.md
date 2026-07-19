# SPARK — Host Migration Design (S85 P4a)

**Status:** ✅ SHIPPED — D1 (S115) → D2 (S118) → D3 (S122) → **D4 production-ON (S124,
PROTOCOL_VERSION 15)**. §11 records the D4 as-built deltas from this design; the locked
runtime semantics live in LOCKED_DECISIONS.md §13.21. (Original S85 text kept below as
the design rationale record.)
**Carried from:** S82 P4 ("host-migration explicitly deferred — world dies with the
host page; needs state-handover design — own design session"), re-logged S83/S84.
**Scope anchor:** true host handover for in-progress matches (2..MAX_PLAYERS FFA),
NOT lobby-phase host replacement (lobby loss already routes to title cleanly).

---

## 1. Problem statement

Today the host page IS the match. The host runs the only authoritative sim
(`world.isHost`, `HostSync.buildSnapshotMessage` at 10 Hz — [sync.ts](src/net/sync.ts));
clients are render mirrors that send INTENTs. S82 P4(b)'s auto-reconnect
(15 s grace, `RECONNECT_GRACE_MS`, [main.ts:559](src/main.ts:559)) only heals
**client** transport blips — the host "simply waits out the same grace." If the
host's tab dies, every surviving peer shows connection-lost and the match is
unrecoverable, no matter how many players remain.

## 2. What the current architecture already gives us (empirically grounded)

These are read-verified facts, not assumptions:

1. **Full mesh.** Trystero/Nostr rooms are full-mesh — every peer already has a
   data channel to every other peer. A successor does not need new transport to
   reach survivors; they are already connected.
2. **The mirror is ~95 % of the state.** `netSnapshot(world)` is the FULL
   `WorldSnapshot` minus exactly `{savedAt, rngSeed, nextPrimitiveId,
   nextBondId, spawner}` ([save.ts:564](src/state/save.ts:564) destructure).
   Everything else — players (incl. `poopedUntilTick`, benches, carried ids),
   primitives, bonds, sparks, scores, hazards (bombs/hunters/potatoes/rainbows/
   seagulls/poops/fouled set), creatures, cinematic state, `rainbowSwitchTick`,
   `tick` itself — already rides the wire 10×/s.
3. **Bit-exact local save/restore exists.** S82 P2 shipped
   `snapshot(world, {spawnerState})` + `restore` with a bit-exact resume test —
   the serialization layer needed for handover is proven, only its *transport*
   is missing.
4. **Deterministic seat roster.** `hostSeats` freezes peerId→seat at Begin
   ([session.ts:38](src/net/session.ts:38)); the START_GAME_SIGNAL roster gives
   every client the same ordered seat list. Every peer can compute the same
   successor with zero votes.
5. **Cryptographic host identity (the hard constraint).** S82 P4(a): the room
   code IS a 30-bit fingerprint of the host's pubkey; the host signs
   `(roomCode || selfId)` and clients latch `hostVerifiedPeerId`
   ([hostIdentity.ts](src/net/hostIdentity.ts), [session.ts:64-71](src/net/session.ts:64)).
   **A successor cannot attest under the existing room code** — it does not hold
   the original private key. Any design that "just lets another peer start
   hosting" reopens the S79 TOFU spoof race that S82 deliberately killed
   (LOCKED §13.20).

## 3. The two design problems, separated

Host migration is TWO orthogonal problems and conflating them is what makes it
look intractable:

- **(A) Authority handover** — who simulates next, from what state?
  (Easy: facts 1–4 above make this almost mechanical.)
- **(B) Identity handover** — why should survivors TRUST the new authority?
  (The real problem: fact 5 means trust is anchored to a key the successor
  doesn't have.)

## 4. Design decision D-A: authority handover = "adopt the mirror, reseed the streams"

**Chosen: cold-standby reconstruction.** No new periodic full-state broadcast.

On takeover, the successor already holds the latest applied `NetSnapshot`. It
rebuilds the five stripped fields:

| Stripped field | Rebuild rule |
|---|---|
| `nextPrimitiveId` | `max(primitives.keys()) + 1` (ids are monotonic ints) |
| `nextBondId` | `max(bonds.keys()) + 1` |
| `rngSeed` / RNG streams | **reseed** from `(roomCode hash ^ takeover tick)` |
| `spawner` state | fresh `SpawnerState` from the reseeded streams, `secondsUntilNextSpawn` reset |
| `savedAt` | now (cosmetic) |

**Accepted divergence:** the spawn/hazard cadence pattern after takeover differs
from what the dead host would have produced. This is a ONE-TIME discontinuity of
the same UX class as the existing reconnect rejoin — invisible unless you had
both timelines side by side. Bit-exact succession is explicitly a NON-goal
(rejected alternative: 0.5 Hz full-`WorldSnapshot` broadcast = +wire cost every
second of every match to slightly improve a once-per-match-if-ever event).

Allocator-rebuild edge: ids of entities DESTROYED in the final pre-death
snapshot can be reused by the successor. All consumers key off live Maps (no
tombstone semantics anywhere in state/), so reuse is safe; document it in the
rebuild helper.

## 5. Design decision D-B: identity handover = succession warrant, signed at Begin

The original host pre-authorizes its successors while it is still alive and
trusted:

1. At **Begin Match**, each joiner's HELLO is extended (additive-optional field,
   same pattern as `HostAttest` itself) with the joiner's own ephemeral
   **pubkey** (clients today don't generate identities — they will under this
   design; same `generateHostIdentity()` machinery).
2. The host builds a **SuccessionWarrant**: `sig_hostKey(roomCode || epoch ||
   orderedList[(seat, pubkey), ...])` and attaches it to START_GAME_SIGNAL
   (clients already verify host signatures on that message — the warrant rides
   the trusted channel).
3. Every client stores the warrant + the full pubkey list.
4. On host-loss past grace, the **successor = lowest surviving seat in warrant
   order** (deterministic; no election protocol). It broadcasts
   `MIGRATION_CLAIM { warrant, successorAttest: sig_successorKey(roomCode ||
   epoch+1 || selfId), snapshotSeq }`.
5. Survivors verify: (a) warrant signature chains to the ORIGINAL host key that
   the room code commits to, (b) claimed successor's seat is the lowest they
   too observe alive, (c) successor's own sig verifies against its pubkey IN
   the warrant. Then they re-latch `hostVerifiedPeerId` to the successor.

This preserves the S82 trust model end-to-end: **the room code commitment never
changes; trust flows through a signature chain rooted in it.** No TOFU re-latch,
no room-code rotation (links/codes keep working for late reconnects).

**Zombie-host defense (epoch counter):** the warrant carries `epoch` (0 for the
original host). A migrated session runs at epoch 1. If the original host's tab
thaws (laptop lid reopened) and resumes emitting NETSNAPSHOTs at epoch 0,
survivors drop them (`epoch < current`) and the zombie, receiving an epoch-1
MIGRATION_CLAIM or snapshot, demotes itself to client (or, v1: routes to its
connection-lost overlay — simpler and acceptable). The 10 Hz snapshot envelope
grows by one small int field.

**Seq continuity:** the successor starts `snapshotSeq` at
`lastSeenSeq + SEQ_JUMP` (e.g. +10 000) so its snapshots always win the
`ClientSync.receive` seq gate ([sync.ts:62](src/net/sync.ts:62)) on every
survivor regardless of per-peer last-seen skew, without a reset handshake.

## 6. Failure detection

Trigger = EITHER of (whichever fires first):
- transport peer-left event for `hostVerifiedPeerId`, OR
- **snapshot starvation**: no NETSNAPSHOT accepted for `HOST_STARVATION_MS`
  (proposed 6 000 ms = 60 missed snapshots; well past worst observed relay jitter).

Then the existing 15 s reconnect grace runs FIRST (the host may come back —
today's behavior, unchanged). Only at grace expiry does the successor fire
MIGRATION_CLAIM. Total worst-case interruption ≈ 21 s, all under the existing
connection-lost overlay (add a "migrating…" line). Mid-grace, the sim is frozen
for everyone (clients don't simulate) — no divergence accumulates by design.

## 7. Protocol impact

- `PROTOCOL_VERSION` 7 → 8 (HELLO pubkey field could be additive, but
  MIGRATION_CLAIM + epoch-stamped snapshots are semantically breaking for old
  peers; the version gate force-disconnects mid-deploy mixes — S22/S52 precedent).
- New messages: `MIGRATION_CLAIM` (above). That is the ONLY new kind; the
  warrant rides START_GAME_SIGNAL, the epoch rides NETSNAPSHOT.
- `CLIENT_INTENT_TYPES` unchanged (migration messages are session-control, not
  world intents — same plane as HELLO/ENDGAME, parsed in `parseNetMessage`).
- LOCKED amendments needed: §13.7 (already amended by S82 for reconnect —
  extend to "host migration after grace"), §13.20 (warrant = sanctioned
  delegation of the host key's authority), new §13.x for epoch semantics.

## 8. What deliberately does NOT survive migration (v1)

- **In-flight intents** sent to the dead host: lost (same as today's loss; the
  optimistic-prediction layer already reconciles via snapshots).
- **The dead host's own player**: drop-benched by the new host via the existing
  `BENCH_OFFLINE_PLAYER` rolling re-stamp — it self-heals if the old host
  reconnects *as a client* (epoch demotion path, v2).
- **RNG/spawner continuity**: reseeded (D-A).
- **Audio/FX one-shot dedupe latches** on survivors: keyed monotonic
  (`lastYelledSwitchTick` etc.) — epoch jump cannot re-fire them. Verified
  pattern: S84's `<=` monotonic latch.

## 9. Implementation phasing (each lands green-gated; no big-bang)

- **D1 (≤1 session, no behavior change):** client identity generation + pubkey
  in HELLO + warrant build/sign/verify helpers + unit tests. Feature-flagged off.
- **D2 (1 session):** epoch field in NETSNAPSHOT + starvation detector +
  successor computation (pure, unit-tested against roster permutations).
  Still no takeover — instrument only (console forensics, S84 P4 pattern).
- **D3 (1 session):** MIGRATION_CLAIM happy path behind `__TEST_MIGRATION__`
  seam: kill-host e2e (real WebRTC, reconnect.spec.ts precedent) asserting
  survivors resume PLAYING under the successor within grace+claim budget.
- **D4 (1 session):** zombie demotion, double-failure (successor also dies →
  next seat claims with epoch+2), POSTGAME/WIN interactions, LOCKED ledger
  amendments, protocol bump ships.

## 10. Open questions (parked, answers not needed for D1–D2)

1. ~~Should the migrated match keep accepting LATE reconnects of the original
   host as a *client*? (v2 epoch-demotion path — recommended yes, needs UX.)~~
   **RESOLVED — S125 P1 (v2) SHIPPED: yes.** A deposed original host auto-rejoins as a
   client (see §12); the "UX" is just the existing reconnecting→migrating overlay
   state-machine — no bespoke screen needed.
2. Warrant refresh on mid-match late-join (currently impossible — joins are
   lobby-only — so: no).
3. Solo-survivor migration (1 peer left): technically trivial (it just becomes
   a solo-authority match) — but is a 1-player FFA worth continuing? Product
   call; recommend yes (they may win by score-out).

## 11. D4 as-built deltas (S124, Full-tier Council R1+R2 + PRIME-AUDIT)

Where the shipped D4 differs from (or extends) the sections above:

1. **Successor selection = a CLAIM LADDER, not the unique lowest-alive seat** (§5 step 4
   as designed deadlocks on a wedged-but-transport-alive successor). Rank k of the
   warranted ∩ transport-alive order fires at grace + k·`CLAIM_LADDER_MS` (1500 ms;
   rank 0 is timing-identical to the design). Races converge via lowest-seat-wins:
   survivors re-latch downward at the same epoch; a losing adopter demotes to client
   (ClientSync intact; `setEpoch` resets the seq watermark so the winner's first
   snapshot is admitted by construction).
2. **Acceptance is MONOTONIC-FORWARD** (`epoch > current` + locally-observed host loss),
   not strict +1 — a survivor that reconnect-cycled through N migrations converges via
   the CLAIM ECHO: the migrated host re-sends its own signed claim on stale-epoch
   snapshots and peer joins (≥5 s rate-limited). Sender-binding makes the echo the ONLY
   relay that can verify — replay-proof by construction.
3. **Zombie demotion carries an ANTI-GRIEF gate the design lacked** (PRIME-AUDIT
   addition): a verified higher-epoch claim deposes a host only alongside local
   partition evidence — a main-loop freeze ≥ the starvation window or a total peer
   wipe-out, within a 60 s TTL. A healthy host can never be deposed by a bare signed
   claim from one malicious warranted client. v1 zombie routing = terminal
   connection-lost overlay, exactly as §5 chose; worker-mode zombies also terminate
   their sim worker.
4. **Takeover hostSeats = the FULL Begin roster minus self** (the design's roster ∩
   alive left the dead host's seat outside the §8 drop-bench sweep — its avatar ghosted
   forever). Dead peers now flow into the S82 rolling re-stamp and self-heal on rejoin;
   a post-migration rejoiner's intents stamp correctly without any HELLO machinery.
5. **The migration window is PAUSE-ONLY** (§8's in-flight-loss stance upheld; Council
   REJECTED buffering): local intents are neither optimistically applied nor sent while
   a warranted survivor observes host loss; the overlay shows MIGRATING… with the
   ladder-deadline countdown; the transport is never torn while the mesh survives
   (peerCount === 0 keeps the S82 reconnect-cycle byte-identically).
6. **Fail-closed intent stamping on BOTH host paths** (`stampOrReject`) — closes the
   pre-existing S62 unknown-peer apply-as-is spoof hole the D3 successor handler had
   copied.
7. **PROTOCOL_VERSION 14 → 15** (§7 said 7→8 — versions moved on underneath). The
   `__TEST_MIGRATION__` seam survives as a TIMING override only; e2e test 2 proves the
   production path with no seam under the real 15 s grace.

## 12. v2 as-built — zombie auto-rejoin-as-client (S125 P1)

Resolves §10 Q1. The deposed ORIGINAL host no longer routes to the terminal overlay (v1); it
auto-rejoins the ongoing match as a client under the successor's term.

1. **One demotion core.** `demoteToClient(newEpoch, winner, { reestablishTransport })` unifies all
   three demotions: the loser-adopter (ladder race lost, ClientSync kept), the terminal fail-safe
   (winner === null, no room code), and the v2 rejoin (`reestablishTransport: true`).
2. **Rejoin = the S82 reconnect path.** The original host was authoritative-only (no ClientSync;
   its transport is a HOST transport). On deposal it nulls its ClientSync, `disconnect()`s, and
   `connectAsClient(roomCode)` — the exact in-page auto-reconnect flow — so a provably-fresh
   ClientSync (empty buffer) starts following the successor. `setEpoch(newEpoch)` fences the term.
3. **Admission + split-brain fence by construction.** The successor broadcasts epoch ≥ 1 at a
   `+MIGRATION_SEQ_JUMP` seq base; a fresh ClientSync (epoch 0 / seq 0) admits it with no reset
   handshake, while the fenced epoch drops the zombie's own residual epoch-0 frames at any seq.
4. **Seat 0 is warrant-excluded**, so a rejoined ex-host correctly NEVER re-claims but DOES follow
   a cascading further migration as a plain client (via its surviving `session.warrant`).
5. **No new UX / no protocol bump.** The existing reconnecting→migrating→terminal overlay
   state-machine owns the display; the successor's peer-join CLAIM ECHO re-teaches the term to the
   rejoiner for free. No new wire field/kind — PROTOCOL_VERSION stays 15.
6. **Council:** Full-tier R1+R2 + PRIME-AUDIT — the transport-hand-off "race" (Grok CRIT) refuted by
   the shipped S82 precedent; "permanent demotion" (Grok HIGH) refuted by the seat-0 warrant
   exclusion; zero residual HIGH/CRITICAL. Runtime-validated in e2e test 3 (freeze-thaw rejoin).

---
*Grounding: all file references verified against working tree at commit d4a7d8b
(S85). NetSnapshot strip list read from save.ts:564-578; trust chain from
session.ts:47-77 + hostIdentity.ts; reconnect constants from main.ts:553-561.*
