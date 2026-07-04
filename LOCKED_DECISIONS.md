# SPARK — Locked Decisions (Pre-Build)

**Status:** Frozen at end of S34 Phase A, 2026-05-16. §13.15 (Phase-2 godly/creature system) locked S34 P2-19 (commit `c64c94c`). Original planning session: 2026-05-09; subsequent locks documented per-section.
**Source:** SPARK_Blueprint.md v0.5 + 3-way Council deliberation (Claude + Grok + Gemini).
**Scope:** Phase-1 implementation decisions. Vision is per spec — this doc only fills HOW.
**Authority:** Blueprint LOCKED rules > this document > session-level tuning.

---

## 1 · Engine & Stack

| Choice | Value | Why |
|---|---|---|
| Renderer | **PixiJS v8** | WebGL2/WebGPU; Claude TS fluency; Vite HMR speed |
| Language | **TypeScript 5.x strict** | Type-level invariants for carry-1, color, immobility |
| Bundler | **Vite 5** | HMR is the iteration multiplier |
| Audio | **Deferred** (see § 9) | Phase 1 ships silent per spec § XV.6 |
| Phase-2 net | **Trystero (^0.24)** [v5 amendment 2026-05-12, S20 P0] | WebRTC + Nostr signaling, ~40KB bundle, zero infra. For 1v1 friends-only play. v4 pinned 6 Nostr relays (§ 13.1 NOTE v4); v5 wires JoinRoomCallbacks (onJoinError, onPeerHandshake, handshakeTimeoutMs) + rtcConfig.iceServers (STUN x2 + free public TURN x3 via openrelay.metered.ca) for symmetric-NAT users + [net]-tagged diagnostic logging at every layer + 1Hz ICE-state poll via room.getPeers() (see § 13.1 NOTE v5). |
| Phase-3 net | Colyseus or Geckos.io (later) | Web-native server-authoritative — reserved for >2-player scalability + matchmaking |
| Test runner | Vitest | Same Vite stack |
| Lint/format | ESLint + Prettier defaults | Don't bikeshed |

**Engine path:** Spec § XII.1 listed Godot recommended + HTML5 alt. We chose Pixi+TS — engine choice is NOT in the LOCKED list, so this is allowed. Phase 3 networking via web-native libs.

### Bundle charter — main entry ≤ 750 KiB raw (S95 P1; raised 560→750 S101, 2026-06-24)

The main entry chunk (`dist/assets/index-*.js`) must stay **≤ 750 KiB raw** (= 768,000 bytes; raw byte size / 1024, NOT gzip). History: a "550 KiB" soft cap was raised from 500 in S57 but lived only in handoff prose — no `LOCKED_DECISIONS` entry, no CI guard — so it silently crept to 553.0 KiB by S94. S95 set it to **560 KiB** AND made it **mechanically enforced**: `scripts/check-bundle-size.mjs` runs as the last step of `npm run build`, so `deploy.yml` CI (`npm ci && npm run build`) fails on a regression. **S101 raises it to 750 KiB (owner directive).** Rationale: S100's tower-defense slice put the entry at 570.9 KiB — 10.9 KiB over — which **hard-failed the deploy build and silently kept the feature off the live site for a whole session** while it sat "done" in git. The cap is self-imposed, not a platform limit; the gzipped transfer is ~185 KiB (fine for a WebGL game), so the gate's failure mode (block deploy) was far costlier than the few-KiB-gzip it guarded. 750 gives real headroom for the rest of TD Phase 1 while keeping the mechanical tripwire against *unbounded* creep. A future breach is a **deploy-blocker to fix before marking a priority done** — NOT a "soft budget" to wave past (that mislabel was S100's root failure). Heavy/optional UI (codex, bots, debug, NONET overlay, quickmatch) still stays **lazy code-split**; big art/audio goes to `public/` assets, never the bundle. To change the cap: bump `CAP_KIB` in the script AND this clause together.

### NOTE (S19 P4, 2026-05-12) — Trystero relay pin

S19 playtest BLOCKER: brother + user both stuck at "connecting" in 1v1 lobby
across separate networks. Root cause: silent npm bump `^0.20 → ^0.24` since
S15 P2 wiring + Trystero 0.24's Nostr module picks 5 random relays from 55
defaults (`shuffle(defaults, strToNum(appId))` — deterministic per appId
but the picked relays include many tiny / personal / geo-flaky endpoints).
Both peers picked the same dead set → no signaling → no peer handshake.

Pinned relay set in `src/net/transport.ts` `NOSTR_RELAYS`:

| Relay | Why |
|---|---|
| `wss://relay.damus.io` | Most-used public Nostr relay |
| `wss://nos.lol` | High-traffic community relay |
| `wss://relay.mostr.pub` | ActivityPub bridge, high uptime |
| `wss://purplerelay.com` | Public; in Trystero defaults |
| `wss://relay.nostr.band` | Aggregator-backed, very stable |
| `wss://nostr.wine` | Long-running paid+free relay |

Trystero call site (`src/net/transport.ts:48`) passes `relayConfig.urls`
+ `relayConfig.redundancy = NOSTR_RELAYS.length` so ALL 6 relays connect
(no sub-sampling). Both peers connect to the same 6 — first relay to
deliver the WebRTC offer wins; the rest are redundancy.

**Future Trystero bumps:** Run `npm install trystero@latest` audit before
locking — relay list + package layout changed materially between 0.20
and 0.24 (`trystero` package now re-exports from `@trystero-p2p/nostr`
+ `@trystero-p2p/core` scoped sub-packages). Re-run a 1v1 playtest
after any version bump; the relay pin protects against random-shuffle
regressions but not against API breaking changes.

### NOTE (S20 P0, 2026-05-12) — Trystero v5 amendment: JoinRoomCallbacks + rtcConfig + observability

S19 P4's relay pin did NOT resolve the 1v1 BLOCKER (post-deploy retest
2026-05-12 ~18:25 UTC: both peers still stuck at "Connecting..." /
"Waiting for Player 2..."). A.0 state-discovery of Trystero 0.24's
actual API surface from `node_modules/@trystero-p2p/core/dist/types.d.mts`
revealed THREE additional gaps in our wrapper that the v4 amendment
had not addressed:

1. **`joinRoom(config, roomId, callbacks?)` 3rd arg unused.** `JoinRoomCallbacks`
   includes `onJoinError` (signaling-layer failure events: relay rejection,
   handshake timeout, peer mismatch), `onPeerHandshake` (per-peer connection
   progress), and `handshakeTimeoutMs` (default implementation-defined). Without
   these, any signaling failure was invisible — the user saw indefinite
   "Connecting..." with zero F12 console output.

2. **`JoinRoomConfig.rtcConfig` unset.** Trystero 0.24 defaults the underlying
   `RTCPeerConnection` to Google STUN only. Symmetric-NAT users (mobile
   hotspots, corporate networks, some ISP CGNATs) cannot establish ICE
   via STUN alone and need TURN — the most-probable root cause of the
   user/brother BLOCKER given mismatched network types.

3. **`makeAction` cast was a type lie.** v4 declared the return as a 2-tuple
   `[sendFn, recvFn]` with synchronous void sender. Trystero 0.24's actual
   return is a 3-tuple `[ActionSender, ActionReceiver, ActionProgress]` with
   `Promise<void[]>` sender. Unhandled rejections on send were silently
   swallowed.

**v5 codifies the following changes (all in `src/net/transport.ts`):**

- `joinRoom` now passes 3rd-arg `JoinRoomCallbacks`:
  - `onJoinError(details)` → `classifyJoinError(details.error)` → `onError`
    handler → `lobbyScreen.setErrorMessage` (red statusText). Classifier
    matches case-insensitive substrings: `timeout` → "Signaling timeout
    — try again"; `rejected`/`invalid`/`denied` → "Connection rejected
    — check the room code"; else "Signaling: ${raw}".
  - `onPeerHandshake(peerId, send, receive, isInitiator)` → observability-
    only `console.info('[net] onPeerHandshake ...')`. PRIME-AUDIT-2 revision
    of Council R1 ADOPT-E: protocol.ts already encodes `HelloMsg.protoVersion`
    at the application layer, so a duplicate handshake-layer version check
    is redundant. The handshake callback fires after Trystero handshake
    completes but before peer-join — useful for layer-naming in logs.
  - `handshakeTimeoutMs: 30000` (explicit; was implementation-defined).

- `rtcConfig.iceServers` ICE_SERVERS const passed to RTCPeerConnection:
  - STUN x2: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`
  - TURN x3 (openrelay.metered.ca public free creds `openrelayproject`/`openrelayproject`):
    - `turn:openrelay.metered.ca:80` (UDP, fastest where allowed)
    - `turn:openrelay.metered.ca:443?transport=tcp` (TCP fallback for restrictive firewalls)
    - `turn:openrelay.metered.ca:443?transport=udp` (UDP/443 third option)
  - `iceTransportPolicy: 'all'` (the RTCConfiguration default, made explicit)
  - `trickleIce: true` (default, made explicit per Council Gemini #3)
  - Replace `openrelay.metered.ca` with an org-owned coturn deployment if
    rate-limiting or abuse becomes an issue (see https://www.metered.ca/tools/openrelay/).

- `[net]`-tagged diagnostic console logging at every layer transition:
  - `connect-entry` (roomCode, appId, relay count, ICE-server count)
  - `relay sockets attached` (from `getRelaySockets()` defensive probe)
  - `onPeerHandshake` (per-peer event)
  - `onPeerJoin/Leave` (peerId + size delta)
  - `ice-poll`: 1Hz `room.getPeers()` poll while `peerSet.size === 0`,
    capped at 30 s. Per-peer log fields: `iceConnectionState`,
    `iceGatheringState`, `connectionState`, `signalingState`. Stops on
    first peer-join OR after the 30 s cap. Names the failure layer for
    users who would otherwise see indefinite "Connecting..." with no
    console output.
  - `onJoinError` (full details envelope)
  - `send failed` (Promise<void[]> .catch escalates to `onError`)

- `makeAction` typed as `Room.makeAction<string>('msg')` (JSON-encoded
  NetMessage as a single string). String is a `JsonPrimitive ⊂ DataPayload`
  — no struct-vs-index-signature type fight. Wire-format change vs. v4 is
  acceptable: both peers upgrade together via the deploy. Sender returns
  `Promise<void[]>`; `.catch()` escalates to `onError` (Council ADOPT-F,
  Grok #7).

- `NetTransport.onError: ErrorHandler | null` public field. Set once in
  `main.ts` after construction; routes signaling/ICE/send/parse failures
  to `lobbyScreen.setErrorMessage(text)` for red-statusText display.

**Battle Ledger:** `.claude/plans/2026-05-12_PDR_Session_20_Council_P0_BattleLedger.md`
(Grok DISRUPTOR 12 challenges + Gemini AUDITOR 10 findings; ADOPT 8,
REJECT 9, DEFER 1, VERIFY 2; PRIME-AUDIT delta added the carry-forward
RED-path branch).

**RED-path carry-forward:** If post-v5 deploy still shows NO `[net]` logs
at all on user retest, the wrapper hooks themselves aren't firing or
Trystero 0.24 internals don't trigger them — pivot to S20 P0.1 amendment:
A/B downgrade `trystero@0.20.0` to isolate the version-bump impact.

---

## 2 · Canvas, Spawner, Vision (§ XIV items 1-7)

| # | Item | Locked value | Notes |
|---|---|---|---|
| 1 | Canvas | **1920×1080 logical, CSS-scaled** | `object-fit: contain`; mouse coords scaled |
| 2 | Spawner radius | **250 px** (~9% area) | Slightly above precise 7.5% for breathing room |
| 3 | Spawn rate | **0.15/sec** Poisson [v2 amendment 2026-05-09] | Was 1.5/sec — S5 playtest amendment, see Open Items below |
| 4 | `R_personal` | **300 px** [PHASE 2] | Placeholder |
| 5 | `R_beacon` | **80 px** [PHASE 2] | Placeholder |
| 6 | Vision fade | **40 px** soft [PHASE 2] | Placeholder |
| 7 | Memory-fog curve | Linear opacity 1.0→0.4, desat 0→0.7 over 30s [PHASE 2] | Placeholder |

Phase 1 = solo, no fog. Items 4–7 are placeholders only. Spawner/canvas/spawn-rate must be locked.

### Open Items v2 (Session 5 — 2026-05-09)

S5 hands-on play exposed three playability defaults that were chosen pre-playtest. Per "If a number must change during Phase 1, log as Open Items v2 — don't sneak":

- **Item 3 — Spawn rate 1.5/sec → 0.15/sec.** At 1.5/sec the player gets any shape on demand; the strategic-bet feel of "wait for the type you need" was lost. ~10× drop makes the spawner pace match the build cadence. Soft-cap of 50 still applies but takes ~5 min to fill at the new rate (was ~33 sec).
- **NEW — Spark initial velocity 20–80 px/sec → 5–20 px/sec.** Old range produced a chaotic blur at 50-population; new range looks like floating dust.
- **NEW — `ATTRACT_STRENGTH` 12 000 → 60 000 (5×).** Pre-S5 the 20-80 initial velocity gave sparks momentum the player could redirect; with the new 5-20 initial range attract had to accelerate from rest, which felt like crawling. 5× boost restores responsiveness. (Constant lives in `controls.ts`, not `constants.ts` — module-private.)
- **NEW — `enforceSpawnerBounds` now exempts the actively-AttractDragged spark from boundary reflection.** Without this, a player pulling a spark out of the zone hits an invisible wall at the rim — the bounce reflects every substep and the spark can never cross. Exempt is keyed off `controls.state.sparkId` when state is `AttractDrag`.
- **NEW — LMB-up outside spawner zone now PICKUP+PLACE in a single action** (was 2-action: PICKUP then RMB to place). Auto-bonds to any primitive within `AUTO_BOND_RADIUS=60` of the release point. RMB connect-drag still available for explicit targeting on a non-default flow. Reason: user playtest of the 2-action design — "the spark gets attached to the cursor instead of staying where I leave it". This makes first-time discoverability work without an existing primitive on the canvas.

**ABANDONED mid-session:** A `SPARK_MAX_SPEED_PX_PER_SEC = 30` hard cap was added then removed inside S5. Rationale: the cap was meant to dampen collision-cascade speed-ups but it also clamped attract-drag velocity, so the player couldn't pull sparks past the rim. Lower initial velocity + Verlet damping handle drift without it.

These are CARRIED FORWARD as candidates for re-tuning after S6 user playtest. If 0.15/sec feels too slow or attract feels too snappy/sluggish, log a v3 amendment.

---

## 3 · Energy, Area-Claim, Mega-combo (§ XIV items 8-11)

| # | Item | Locked value |
|---|---|---|
| 8 | Energy | **+5.0/sec flat passive** (Phase 1 stub) |
| 9 | Area-claim | `claim(n) = 1 + 0.1·(n-2)` capped at 2.0× |
| 10 | Mega-combo mult | **1.75×** (mid-of-range) |
| 11 | Connector chain | min 2 primitives, +1 build-action credit per [PHASE 2] |

Full energy formula `Σ(stability × complexity)` deferred to Phase 2 once structures have meaning.

---

## 4 · Bond Physics (§ XIV item 12)

**Verlet position-based dynamics** (NOT force-based — impulses explode).

| Param | Value |
|---|---|
| Tick rate | 60 Hz |
| Substeps/tick | 8 |
| Damping/substep | 0.998 |
| Position-correction clamp | 0.5 × rest_length per substep |
| Soft-collision iterations | 8 (within physics substeps) |

**Stiffness tiers** (constraint-relaxation coefficient, 0–1):

| Tier | Stiffness | Strain break threshold |
|---|---|---|
| LOW | 0.2 | 200% rest length (Spiral combos) |
| MID | 0.5 | 150% (default) |
| HIGH | 0.8 | 125% (Triangle, locked structural) |

**Sanity check** (rest=50, current=65, k=0.5): error=15px → correction=(15/65)·0.5·0.5=0.058 → vec=(3.7,0) → new dist=57.6 px. Stable, non-explosive convergence.

---

## 5 · Spark Types & Color Palette (§ IV — CANONICAL)

```typescript
enum SparkType {
  Dot = 0,       // #FFFFFF
  Line = 1,      // #FFE066
  Triangle = 2,  // #FF3B3B
  Square = 3,    // #3B5BFF
  Circle = 4,    // #3BFF7A
  Spiral = 5,    // #A23BFF
}
```

**Player palette** (6 distinct, max-saturation): `0xff3b6b 0x3bd7ff 0x9bff3b 0xffb13b 0xd73bff 0x3bffb1`. Phase 1 = solo (P1 only); architecture multi-color from day 1.

**DO NOT rename.** Earlier Council misstep produced (Kinetic/Thermal/Static/Floral/Crystal/Shadow) — that was rejected. Canonical names per § IV are the only valid ones.

**Color application rule [v0.5.1 amendment]:** Free shapes are rendered in `0xe6e6f0` (neutral off-white). The 6 type colors above are kept in `SPARK_COLORS` for the UI legend only; they do not tint free or placed shapes. **Placed primitives tint to the placer's player color** via `prim.ownerColor` (set = `placerColor` in Phase 1, mutates on Phase-2 Steal). Bond gradients blend the two endpoints' player colors — single-player Phase 1 = monochrome, Phase 2 multi-color comes free. **Player avatars** render at the cursor in the local player's color (the visual proof of "you ARE a spark").

---

## 6 · Combo Table — Schema & Magic-14 Seed

> **S98 AMENDMENT (order-symmetry, Option B — user-approved, 2-round Council ADOPT).** The 8
> "one-way" magic pairs are now **order-SYMMETRIC**: both carry orders yield the SAME magic
> (e.g. Line→Dot is also a Filament, Square→Dot is also an Anchor, Spiral→Dot is also a Vortex
> and pulls). The pairs: Dot↔Line, Line↔Triangle, Square↔Circle, Dot↔Spiral, Spiral↔Line,
> Triangle↔Spiral, Dot↔Square, Line↔Circle. **Triangle↔Circle stays order-DEPENDENT by design**
> (Triangle→Circle=Wheel ≠ Circle→Triangle=Star — the intentional dual; symmetry must NOT collapse
> it). The 4 magic self-pairs are inherently symmetric. Implementation: the reverse rows are mirrored
> into the TABLE reusing the forward outcome object (byte-identical), `comboKey` is NOT sorted (so
> persistence/replay keys are unchanged), discovery canonicalizes via `canonicalComboKey` so a magic
> in either order unlocks the SAME Codex tile (HUD stays **N/14**). **Win-score UNCHANGED (630):** the
> change is additive (never touches a forward key), so the optimal/canonical-build income — the
> ~157.5s anchor — is provably unchanged; symmetry only raises the floor for sloppy ordering. A
> playtest-gated micro-rebalance (raise win+step in lockstep, keep /3) is held if casual pace feels
> too fast. Supersedes the "order-dependent" clauses below where they conflict.

**Schema (key still carried→target; the 8 one-way magics mirrored per the S98 amendment above):**

```typescript
type ComboKey = `${SparkType}->${SparkType}`;  // e.g. "2->4"

interface ComboOutcome {
  resultName: string;
  stiffnessTier: 'LOW' | 'MID' | 'HIGH';
  areaMultiplier: number;   // RESERVED — currently unread by production (S116 audit F3); the "area claim" slot for a future mechanic, not live behavior.
  visualEffectId: string;
  isMagical: boolean;
  description: string;
}
```

> **S116 audit F3 note:** the `×` values in the Magic-14 seed list below are the `areaMultiplier` slot. As of the S116 audit NO production code reads `areaMultiplier` — the values are catalogued (reserved) for a future area/territory mechanic, NOT a live area claim. Treat them as design intent until a consumer is wired.

**The Magic-14 seed** (all 6 types, both Spiral roles, see [src/combos.ts](src/combos.ts) for full data):

1. Dot → Line: **Filament** (HIGH, 1.5×)
2. Line → Line: **Cable** (MID, 1.0×)
3. Line → Triangle: **Bracket** (HIGH, 2.0×)
4. Triangle → Triangle: **Diamond** (HIGH, 2.0×)
5. Triangle → Circle: **Wheel** (MID, 3.0×)
6. Circle → Triangle: **Star** (MID, 2.0×)
7. Circle → Circle: **Orbital** (LOW, 3.0×)
8. Square → Square: **Lattice** (HIGH, 2.0×)
9. Square → Circle: **Capsule** (MID, 2.0×)
10. Dot → Spiral: **Vortex** (HIGH, 2.0×)
11. Spiral → Line: **Whip** (LOW, 1.5×)
12. Triangle → Spiral: **Warped Anchor** (LOW, 3.0×)
13. Dot → Square: **Anchor** (MID, 1.0×) — promoted S91 (G2-PROMO), `fx.anchor`, visual + discovery + magic premium only (no bespoke behavior; **S98: order-symmetric — Square→Dot is also Anchor**)
14. Line → Circle: **Spindle** (MID, 1.0×) — promoted S91 (G2-PROMO), `fx.spindle`, visual + discovery + magic premium only (no bespoke behavior; **S98: order-symmetric — Circle→Line is also Spindle**)

**Win-score rebalance (S91, G2-PROMO):** `PHASE_1_WIN_SCORE` 210 → 630, `SCORE_TIER_STEP` 70 → 210 (ratio 3 preserved; `scoring.test.ts:330-331` stays green) — offsets the structural 8× magic-income premium the two promotions add to combo-leaning builds; holds the canonical P=20/B=30 combo build's match length ~constant (152.7s → 157.5s). Behaviors deferred to a Phase-2 PDR. User-approved S91 (`go`).

Remaining **22 functional combos** ship as one-liners (MID/1.0×/generic visual). Phase 1 ships all 36 functionally. **Visual polish per combo is tunable across many sessions** — Phase 1 just needs each combo to *resolve* with the right physics tier and area claim. Combos are "limitless in the future" — Phase 2+ can extend the table without breaking the schema.

---

## 7 · Module Architecture (PixiJS, anti-bloat ≤ 500 LOC/module)

```
spark/
├── index.html
├── package.json, tsconfig.json, vite.config.ts
├── src/
│   ├── main.ts                  // Entry, Pixi app init, GameLoop
│   ├── constants.ts             // SparkType enum, colors, all tunable nums
│   ├── combos.ts                // COMBO_TABLE (36 entries) + lookup
│   ├── physics/
│   │   ├── verlet.ts            // Position-based Verlet integration
│   │   ├── bonds.ts             // Spring constraint solver, strain-break
│   │   ├── collision.ts         // Soft pairwise collision (in spawner zone)
│   │   └── spatial.ts           // Cell grid for neighbor queries
│   ├── game/
│   │   ├── spark.ts             // Spark entity (state union: Free|Carried|Bonded)
│   │   ├── primitive.ts         // Placed spark inside a structure
│   │   ├── structure.ts         // Connected component, sever (BFS)
│   │   ├── spawner.ts           // Confined zone, ticker, bounce
│   │   └── player.ts            // Carry-1 FSM, energy, build counter
│   ├── input/
│   │   ├── controls.ts          // Mouse + Space-key: attract drag, connect drag, sever, END_TURN
│   │   └── redundantBondTargets.ts // S15 P1: pure geometric pickers (extracted from controls.ts)
│   ├── render/
│   │   ├── renderer.ts          // Pixi.Application, scene graph, frame budget
│   │   ├── effects.ts           // Bloom filter, glow, particle bursts
│   │   ├── statsOverlay.ts      // Dev FPS + physics ms + counts (toggle ~)
│   │   ├── ui.ts                // Carry indicator, energy gauge, S15 P2 1v1 HUD (turn badge, per-player score, connection dot)
│   │   ├── titleScreen.ts       // S15 P2: 1 Player / 1v1 mode select
│   │   ├── lobbyScreen.ts       // S15 P2: host/join panes + connection-lost overlay; S20 P0 setErrorMessage for [net]-tagged signaling/ICE failures
│   │   ├── bondVisualRenderer.ts // S7 P2 dispatcher; S20 P3 slim 536→73 LOC (12 silhouettes extracted to effects/silhouettes/)
│   │   └── effects/silhouettes/  // S20 P3 (Council R1): 3 archetype files for 12 magic silhouettes + shared lib + barrel
│   │       ├── shared.ts        // BondVisualParams + lerpColor + midColor + strokeAxisLerp + strokePathLerp + drawDefaultLine fallback
│   │       ├── axisAligned.ts   // filament/cable/bracket/diamond/wheel/lattice/capsule (7 shapes whose primary stroke runs along the bond axis)
│   │       ├── midpointOrnaments.ts // star/orbital/warped (3 ornaments centered at midpoint with faint axis underlay)
│   │       ├── parametricPaths.ts   // vortex/whip (2 curves traced A→B parametrically)
│   │       └── index.ts         // barrel re-export for dispatcher
│   ├── net/                     // S15 P2 (LOCKED § 13 NEW): Phase-2 1v1 networked play
│   │   ├── transport.ts         // Trystero/Nostr WebRTC adapter
│   │   ├── protocol.ts          // Typed envelopes (Hello/Intent/NetSnapshot/EndGame), room code gen/parse
│   │   ├── sync.ts              // HostSync seq emit + ClientSync seq receive + lerp interpolation
│   │   └── lerp.ts              // clamp utility for lerp coefficients
│   └── state/
│       ├── world.ts             // Single state-mutation seam (dispatch pattern); S15 P2 1v1 fields + actions; S20 P1 trimmed 311→275 LOC (≤280 charter)
│       ├── gameMode.ts          // S16 P0: START_GAME/END_TURN/RETURN_TO_TITLE/UPDATE_AVATAR_POS handlers + addScore (extracted from world.ts)
│       ├── placePrimitive.ts    // S14 P2.0: PLACE_PRIMITIVE handler (extracted from world.ts)
│       ├── disruptionManager.ts // S19 P2: SEVER_BOND helpers (canSeverBond + computeBaseCharge + computeSeverEraseEffects + applySeverTopology)
│       ├── sparkLifecycle.ts    // S20 P1: SPAWN/DESPAWN/PICKUP/DROP/TICK_ENERGY case-body helpers + action shapes (extracted from world.ts)
│       ├── authGate.ts          // S20 P1: shared `requireActivePlayer(world, playerId)` 1v1 auth gate (eliminates inline duplication at 3 dispatch sites)
│       ├── gameState.ts         // FSM: TITLE→LOBBY→PLAYING→WIN→POSTGAME→TITLE (S15 P2 extension)
│       └── save.ts              // WorldSnapshot JSON serializer + S15 P2 NetSnapshot wire variant
└── public/                      // S16 P2 Step 1.5: favicon.svg + robots.txt
    ├── favicon.svg              // 32x32 concentric spark glyph (PLAYER_COLORS[0/1])
    └── robots.txt               // User-agent: * / Allow: /
```

`audio/` directory deliberately omitted — see § 9.

---

## 8 · Phase 1 Done Gates (3 simple)

1. **Physics stable.** No NaN, no explosions, sustained ≥60 fps under load (50 free sparks + 30-primitive structure).
2. **Spec § XIII Phase 1 features functionally exist.** All 6 types, confined spawner, carry-1, mouse controls, all 36 combos resolve, self-sever with BFS topology rule, energy ticking, win-state plumbing, save/load.
3. **User confirms playability.** Hands-on session, user says "yes, this works, ship Phase 2."

If after Session 5 all three pass → Phase 1 done. If not → Sessions 6+ tune.

---

## 9 · Audio Plan (Deferred)

**Phase 1: silent.** No `tone`, no `Web Audio API`, no audio code paths. Spec § XV.6 holds.

**Future plan (saved to memory):**
- User will create a continuous didgeridoo trance track with Suno AI and upload it
- Track will be the Phase-1.5+ background music
- Small SFX added at the same time: bond commit, sever, spark collect, magical-combo formation
- Engine: Tone.js or native Web Audio added as a dep at that time
- See `~/.claude/projects/.../memory/spark_audio_plan.md` for full plan

---

## 10 · Architecture Seams for Phase 2/3 (Grok Round 3 audit)

Phase 1 must store the right state from day 1 so Phase 2/3 plug in without rewrite.

### 10.1 Per-Primitive day-1 fields (do not skip)

```typescript
interface Primitive {
  readonly id: PrimitiveId;
  readonly type: SparkType;
  readonly placerColor: number;       // permanent (§ VI.4)
  readonly createdTick: number;       // for sever tiebreaker (§ VIII.4) + trophy (§ III.7)
  pos: Vec2;                          // mutable for bond physics, but only via PhysicsManager
  prevPos: Vec2;                      // Verlet integration
  bonds: Set<BondId>;                 // adjacency for sever BFS
  ownerColor: number;                 // mutable on Steal disruption (Phase 2) — set = placerColor in Phase 1
  lastOwnershipChange: number;        // 0 in Phase 1; updated on Steal in Phase 2
}
```

Even though Phase 1 is solo + monocolor, store all of this. Skipping `createdTick` or `bonds` forces a rewrite later.

### 10.2 State mutation seam (Phase 3 networking)

All world mutations route through one function:

```typescript
// src/state/world.ts
type GameAction =
  | { type: 'PLACE_PRIMITIVE'; spark: Spark; targetPrim: PrimitiveId; tick: number }
  | { type: 'SEVER_BOND'; bondId: BondId; tick: number }
  | { type: 'SPAWN_SPARK'; sparkType: SparkType; pos: Vec2; tick: number }
  | { type: 'TICK_ENERGY'; playerId: PlayerId; deltaSec: number }
  | { type: 'WIN_TRIGGER'; winnerId: PlayerId; tick: number };

export function dispatch(world: World, action: GameAction): World;
```

Phase 1: every input handler / spawner tick / energy tick calls `dispatch()` locally.
Phase 3: `dispatch()` becomes `await dispatchOverNetwork(action)` — same call sites, no rewrite.

**S15 P2 amendment (§ 13 NEW):** Phase-2 1v1 plugs in via dispatcher injection,
not via `dispatch()` rewrite. `Controls` constructor takes a `ControlsDispatchFn`
(`makeLocalDispatcher` default; client path wraps each action as an Intent
envelope and sends over Trystero). Host receives Intent envelopes via
`NetTransport.on()` and calls `dispatch(world, msg.action)` authoritatively. The
single-seam invariant is preserved: all world mutation still routes through
`dispatch()`, only the call-site indirection changed.

**Input sanitization (Gemini R1 BLOCKER):** Host's reducer rejects
`PICKUP_SPARK`, `DROP_SPARK`, `PLACE_PRIMITIVE` when `gameMode === '1v1'` AND
`action.playerId !== world.currentPlayerId`. Defense-in-depth even when client
controls layer should not have sent the action.

### 10.3 Render seam (Phase 2 fog)

```typescript
// src/render/renderer.ts
export function render(world: World, viewerId: PlayerId): void;
// Phase 1: viewerId always = 'p1', no fog applied
// Phase 2: applyVisionMask(world.visionMaskFor(viewerId), viewport)
```

Track `lastSeenBy: Map<PrimitiveId, Set<PlayerId>>` from day 1 if cheap, else add in Phase 2 (no API change).

### 10.4 Snapshot shape (save/load + Phase 3 replay)

```typescript
interface WorldSnapshot {
  schemaVersion: 1;
  tick: number;
  rngSeed: number;             // for deterministic replay
  primitives: PrimitiveSerialized[];
  bonds: BondSerialized[];
  freeSparks: SparkSerialized[];
  players: PlayerSerialized[];
  spawnerState: { lastSpawnTick: number };
  gameState: 'PLAYING' | 'WIN' | 'POSTGAME';
}
```

JSON-serializable. Phase 1 uses for save/load; Phase 3 uses same shape for server snapshots + replay scrubbing.

**S15 P2 amendment:** `WorldSnapshot` extended (additive, optional fields for
pre-S15 compat): `gameMode: 'solo' | '1v1'`, `currentPlayerId: PlayerId`,
`scoreByPlayer: Array<[PlayerId, number]>`. `SerializedPlayer` gains
`avatarPos: Vec2`.

`NetSnapshot` is the wire variant for Phase-2 host→client sync at 10 Hz
(`NET_SNAPSHOT_HZ`). Council R2 + PRIME-AUDIT consolidated retain-list:
`NetSnapshot = Omit<WorldSnapshot, 'savedAt' | 'rngSeed' | 'nextPrimitiveId' | 'nextBondId'>`.
Stripped fields are host-only (timestamp not needed, RNG deterministic on
host, monotonic ID counters host-authoritative).

### 10.5 Determinism (Phase 3 prerequisite)

- Use **mulberry32** seeded PRNG (16-line impl, no deps). Live in `src/state/rng.ts`.
- Game tick = explicit counter, NOT `Date.now()`. Spawner spawns on `tick % rate === 0`, not wall-clock.
- Phase 1 does not require cross-CPU determinism — same browser is enough. Phase 3 will revisit if desync issues appear.

### 10.6 Frame budget (60 fps = 16.67 ms/frame)

| Slice | Budget |
|---|---|
| Physics (Verlet + bonds + collision + spatial) | 5.5 ms |
| Render (Pixi draw + bloom + stats) | 7.0 ms |
| Input + combo lookup + sever check | 2.0 ms |
| GC / misc | 2.17 ms |

Stats overlay (toggle `~`) shows live ms per slice. If any slice consistently exceeds budget → triage in dev session before adding features.

### 10.7 Perf wins to bake in early

- `ParticleContainer` for all free sparks (position + tint only — no per-sprite filter)
- One `Graphics` instance per `Structure` for bonds (clear/redraw on bond/sever, NOT per frame)
- Pixi v8 `BatchRenderer` auto-batches placed primitive sprites
- No per-bond `Graphics` instances — that was the easiest Pixi perf trap to fall into

---

## 11 · TypeScript Invariant Enforcement (Grok Round 3)

| Invariant | Enforcement | Where |
|---|---|---|
| Carry-1 (§ III.3) | Discriminated union `IdlePlayer \| CarryingPlayer` + runtime guard at FSM transitions | `src/game/player.ts` |
| Structure immobility (§ VI.5) | `readonly pos` after placement; `Object.freeze` post-place | `src/game/primitive.ts` |
| Order-dependence (§ V.1) | Tuple key `[A,B]` (NOT sorted) in `COMBO_TABLE` | `src/combos.ts` (DONE) |
| Sever topology (§ VIII.4) | BFS connected-component + tiebreaker assertion post-cut | `src/game/structure.ts` |
| Color inheritance (§ VI.4) | `readonly placerColor` set in `Primitive` constructor only | `src/game/primitive.ts` |
| Spawner confinement (§ IX.1) | Per-frame `enforceBounds()` with reflection + spatial hash | `src/game/spawner.ts` |

Runtime asserts gated by `if (import.meta.env.DEV)` — zero cost in production build.

---

## 12 · Risk Register (top 5)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Verlet tuning rabbit hole | Pre-locked stiffness/damping/clamp; max 1 hr tuning per session; integration tests catch regressions |
| 2 | Bond rendering = first frame-loss source | One `Graphics` per Structure, NOT per Bond; redraw only on bond/sever; ParticleContainer for free sparks |
| 3 | Phase 3 networking blocked by Pixi choice | Single dispatch seam (§ 10.2); web-native authoritative server later (Colyseus); revisit then |
| 4 | Sever edge cases (anchor isolation, single-primitive sides) | Hand-crafted graph tests in `sever.test.ts` for 8+ topologies |
| 5 | Drift across long sandbox sessions | Damping 0.998 + position-correction clamp; periodic re-centroid not needed at Phase 1 scale |

---

## 13 · Phase-2 Networked Play v1 (S15, 2026-05-12)

**Authority:** User-authorized LOCKED § 1 amendment ("not same machine hotseat
because my friend is in a different country"). Council R1+R2 closed
(grok-4.20-0309-reasoning DISRUPTOR + gemini-2.5-pro AUDITOR). Trystero
chosen over PeerJS (multi-strategy fallback negates rate-limit concern);
"Connection lost" UI overlay v1 chosen over mandatory host-migration stub
(deferred to S16 if playtest shows transient-drop annoyance).

### 13.1 Transport
- **Library:** [`trystero`](https://github.com/dmotz/trystero) ^0.24.0 (~40KB bundle, S16 doc-drift fix from ^0.20)
- **Strategy:** Nostr-primary (`import { joinRoom } from 'trystero/nostr'`).
  PRIME-AUDIT #1: BitTorrent tracker default rejected (Grok R1 rate-limit
  concern); Nostr decentralized signaling with multi-relay fallback.
- **Wire:** WebRTC DataChannel (peer-to-peer) after Nostr signaling.
  No relay server for in-game traffic.
- **API surface (src/net/transport.ts):** `connect(roomCode)`, `send(msg)`,
  `on(handler)`, `peerCount()`, `disconnect()`.

### 13.2 Authority model
- **Host = first joiner = P1 (red, PLAYER_COLORS[0]).** Runs full Verlet sim
  authoritatively. Snapshot emit every `SNAPSHOT_INTERVAL_TICKS = PHYSICS_HZ /
  NET_SNAPSHOT_HZ = 60/10 = 6` physics ticks.
- **Client = second joiner = P2 (blue, PLAYER_COLORS[1]).** Does NOT step
  physics (`stepPhysics` gated on `!isClient`). Renders interpolated
  snapshots; sends Intent envelopes (`ClientSync.wrapIntent` + per-direction
  `intentSeq`).
- **Reducer auth gate (Gemini R1 BLOCKER):** Host's `dispatch()` silently
  rejects `PICKUP_SPARK` / `DROP_SPARK` / `PLACE_PRIMITIVE` when
  `world.gameMode === '1v1' && action.playerId !== world.currentPlayerId`.

### 13.3 Sync protocol
- **Per-direction sequence numbers** (Council R2 + PRIME-AUDIT #2): host
  emits `snapshotSeq` monotonic; client receives validates
  `msg.snapshotSeq > lastSeq` (out-of-order rejected). Client→host
  intents use independent `intentSeq` counter.
- **Render-delay snapshot-buffer interpolation** (S89 P5 — SUPERSEDES the
  original single-pair lerp below; Council CONVERGED): the client buffers the
  last `SNAP_BUFFER_MAX = 8` snapshots with arrival timestamps and renders the
  world `NET_RENDER_DELAY_MS = 150ms` behind real time, interpolating the two
  buffered snapshots **bracketing** that render clock (`ClientSync.pickBracket`).
  This replaced the original window-equals-interval scheme, which had zero jitter
  buffer (a late packet saturated `t` at 1 → freeze-then-jump every jittery
  interval — the S89 "choppy joiner" report). Cold start / single snapshot clamps
  to oldest; buffer underrun clamps to newest (no extrapolation). Position lerp
  also covers the continuously-moving hazards (hunters, seagulls, and SEEKING
  creatures); poops/potatoes/rainbows/bombs are excluded (discontinuous transitions
  would smear). Non-position state still snaps to the LATEST snapshot once per
  arrival via `applyNetSnapshot()`. Render-layer only — determinism untouched.
  - *Original (pre-S89, superseded):* client maintained `prevSnap` + `currentSnap`;
    render frame computed `t = elapsed / NET_INTERPOLATION_MS = 100ms`; positions =
    lerp(prev, curr, t).
- **Envelopes (src/net/protocol.ts):** `HELLO` (handshake),
  `INTENT { intentSeq, action: GameAction }` (client→host),
  `NETSNAPSHOT { snapshotSeq, snapshot: NetSnapshot }` (host→client),
  `ENDGAME { winnerId }`.

### 13.4 Lobby
- **Room codes:** 6-character alphanumeric, no-confusion alphabet
  (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` — drops `0/O/1/I` for verbal sharing).
  `generateRoomCode()` / `parseRoomCode()` in `src/net/protocol.ts`.
- **S82 P4(a) AMENDMENT:** the HOSTED room code is no longer Math.random — it is the
  30-bit truncated SHA-256 fingerprint of the host's page-session ECDSA P-256 public
  key (`roomCodeFromPubkey`, `src/net/hostIdentity.ts`), same alphabet/length/UX. The
  code IS the host's key commitment (see §13.20). One identity per page load ⇒
  re-hosting from the same tab reuses the code; a refresh mints a new one.
  `generateRoomCode()` is retained for tests/back-compat only.
- **UI (src/render/lobbyScreen.ts):** host pane generates code + waits
  for joiner + "Begin Match" button; join pane keyboard input + "Connect";
  "Back to Title" cancel; "Connection lost" full-screen overlay when
  `peerCount === 0` during PLAYING.

### 13.5 Game-state FSM extension
- **Solo path:** `TITLE → PLAYING → WIN → POSTGAME → TITLE`.
- **1v1 path:** `TITLE → LOBBY → PLAYING → WIN → POSTGAME → TITLE`.
- New actions: `START_GAME { mode, isHost }`, `END_TURN`, `RETURN_TO_TITLE`,
  `UPDATE_AVATAR_POS`.
- `RETURN_TO_TITLE` clears world (primitives, bonds, freeSparks, effects)
  AND drops P2 AND resets scoreProgress + scoreByPlayer.

### 13.6 Per-player scoring
- `scoreByPlayer: Map<PlayerId, number>` added to World.
- `addScore(world, playerId, delta)` helper:
  - **Solo:** additive `world.scoreProgress += delta` (preserves test
    contract; gameState.test.ts L51, session13.test.ts directly mutates
    scoreProgress).
  - **1v1:** `scoreByPlayer[playerId] += delta`;
    `scoreProgress = max(scoreByPlayer.values())` (leader's score drives
    `PHASE_1_WIN_SCORE` gate; ensures WIN fires when ANY player crosses
    threshold first, not when summed totals do).
- `tickGameState` in 1v1: attribution scans `scoreByPlayer` for max,
  passes that PlayerId to `WIN_TRIGGER.winnerId`.

### 13.7 Known v1 limitations (documented for playtest expectations)
- **AttractDrag client latency** (~RTT/2 sluggish). Client doesn't run
  physics — local cursor + spark visuals lag until host snapshot returns.
  S16 prediction work plan.
- **No host-migration.** Connection drop → "Connection lost" overlay →
  both players must return to title + reconnect with new room code.
  Grok R2 advocated mandatory one-line stub; Gemini R2 (adopted) deferred.
- **Tab-hidden host pause.** Pixi animation pauses when host's tab
  hides → sim freezes → client sees stale snapshots until tab refocused.
- **Save format break.** Pre-S15 saves rejected gracefully (gameMode +
  currentPlayerId + scoreByPlayer + avatarPos are optional in restore
  but solo defaults applied — pre-S15 mid-game saves replay correctly
  but won't deserialize per-player score state that didn't exist).
- ~~**No reconnect.** Session ends on disconnect.~~ **S82 P4(b) AMENDMENT
  (user-authorized):** an in-page transport blip now gets a 15s RECONNECTING grace —
  the client auto-rejoins the same room (same page ⇒ same Trystero selfId ⇒ the host's
  frozen peerId→seat map re-binds; latch + ClientSync watermark survive; next 10Hz
  snapshot restores state). e2e/reconnect.spec.ts (@quarantine-flaky) proves it over
  real WebRTC. HOST-page death remains fatal (host-migration still deferred — the
  world state lives in the host page; see backlog carry-forward). Mid-game peer drops
  past a 3s grace no longer ghost: the host benches them via a rolling 2s re-stamp
  (`BENCH_OFFLINE_PLAYER`) that self-heals on rejoin (S82 P4(c)).

### 13.8 Constants (src/constants.ts)
- `NET_SNAPSHOT_HZ = 10`
- `NET_RENDER_DELAY_MS = 150` (S89 P5 — REPLACED `NET_INTERPOLATION_MS = 100`; see §13.3 render-delay buffer)
- `NET_ROOM_CODE_LENGTH = 6`
- `NET_CONNECTION_TIMEOUT_MS = 30000` (reserved for future)

### 13.9 Deployment (S16 P2 NEW; S18 P0 SHIPPED 2026-05-12)
- **Primary URL (S18 P0 SHIPPED 2026-05-12):** `https://spark-online.space/`
  — HTTP 200 LIVE, HTTPS enforced via Let's Encrypt cert (auto-issued
  by GitHub Pages, expires 2026-08-10, auto-renews). Domain registered at
  Squarespace Domains (5yr, exp 2029-05-12). DNS configured at Squarespace
  (Squarespace Defaults preset deleted; 5 custom records added): 4 A records
  (Host=`@`, values=`185.199.108.153` / `.109.153` / `.110.153` /
  `.111.153`, TTL 1hr), 1 CNAME (Host=`www`, value=`daneshto-dotcom.github.io.`,
  TTL 4hr Squarespace default). Custom Domain bound via `gh api -X PUT
  repos/daneshto-dotcom/the-spark/pages -F cname=spark-online.space` then
  `-F https_enforced=true` after cert approved. Cloudflare DNS migration
  optional carry-forward (user preference; deferred indefinitely).
- **Fallback URL (S16 P2 Step 1 SHIPPED, S18 P0 REPURPOSED):**
  `https://daneshto-dotcom.github.io/the-spark/` — now 301-redirects to
  `https://spark-online.space/` since custom domain bound at the Pages
  level. `vite.config.ts base='/'` (was `'/the-spark/'` pre-S17 P0) so
  assets serve from root path under the primary URL.
- **CI:** `.github/workflows/deploy.yml` on push:master via GitHub's
  official Pages actions: `actions/upload-pages-artifact@v3` (after
  `npm ci` + `npm run build`) + `actions/deploy-pages@v4`. Required
  workflow elements: `permissions: { contents:read, pages:write,
  id-token:write }`, `environment: github-pages`, `concurrency:
  { group: pages, cancel-in-progress: false }`. Switched from
  `peaceiris/actions-gh-pages@v3` per Council R1 Grok #4 + Gemini #2
  (audited modern path).
- **One-time user-step:** Settings → Pages → Source = "GitHub Actions"
  (NOT "Deploy from a branch"). Enabled S16 P3 via `gh api -X POST
  /repos/.../pages -f build_type=workflow` after first deploy failed
  with 'Pages not enabled' error.
- **CSP:** GitHub Pages has NO default CSP set (Council R1 Grok #5 risk
  defused). Trystero WebRTC bypasses `connect-src` via `RTCPeerConnection`
  anyway; Nostr signaling uses WSS to public relays which is also
  unblocked at default GH Pages.
- **HTTPS:** github.io enforces HTTPS at github.com cert; custom domain
  will use Let's Encrypt auto-issued ~15min after DNS resolves.
- **OG meta:** `index.html` includes `<link rel='icon' href='favicon.svg'>`,
  `og:title`, `og:description`, `og:type`. og:image deferred to S17+
  (no designed share asset).

### 13.10 Persistent BETA badge (S16 P3.a, S17 P3 text update)
- Persistent BETA Pixi `Text` added directly to `app.stage` (not inside
  any TitleScreen / LobbyScreen / HUD container) so it's visible across
  all gameState values until v1.0.
- Visual: monospace 14px, cyan `PLAYER_COLORS[1]`, letterSpacing 4,
  alpha 0.55, anchored top-right `(CANVAS_WIDTH - 12, 12)`.
- S17 P3 text update: `'BETA'` → `'BETA · S17 PHASE-2'` signaling Phase-2
  Tier-1 (Sever-as-disruption + multi-color bonds) is LIVE. Connection
  status dot relocated from `(CANVAS_WIDTH - 24, 24)` to
  `(CANVAS_WIDTH - 24, 48)` to clear the longer badge (PRIME-AUDIT E
  layout discovery).

---

### 13.11 Phase-2 §VIII.3 row 1 — Sever-as-disruption (S17 P1 NEW)

Cross-player Sever is the first member of the Phase-2 disruption suite
(`docs/phase-2-design-options.md` Tier-1 pick C). Spec authority:
**§VIII.3 row 1 LOCKED + §VIII.4 LOCKED + §VIII.1-2 LOCKED**.

**Action shape:**
```ts
{ type: 'SEVER_BOND'; bondId: BondId; playerId: PlayerId; cause: 'player' | 'physics' }
```

- `cause='player'` — user RMB-clicks an enemy bond. Routes through host
  auth + charge gate.
- `cause='physics'` — constraint-solver overstretch breakage from
  `physics/bonds.ts` `solveBonds()`. Bypasses both gates (it's the
  solver firing, not a disruption action).

**Auth rule (Council R1 Gemini #3):** bond is HOSTILE if EITHER endpoint's
`placerColor` differs from actor's `color`. Self-sever (both endpoints
share actor's `placerColor`) preserves Phase-1 §VIII.4 zero-cost path.
Uses `placerColor` (immutable, §VI.4) — actor's contribution history is
the auth signal, NOT transient `ownerColor` (which mutates on Phase-2
Steal).

**Charge consumption (§VIII.1-2):**
- Cost = 1 charge per destructive hostile sever
- Charges accumulate at 1 per `BUILD_ACTIONS_PER_CHARGE=5` successful
  builds via `tickBuildAction` (already wired pre-S17 in
  `placePrimitive.ts:468`)
- Cap = `MAX_DISRUPTION_CHARGES=2`
- §VIII.2 silent reject when actor has 0 charges (no error, no UI
  feedback beyond hollow charge dot indicator)

**PRIME-AUDIT B — cycle-bond charge consumption** (S52 P2 AMENDED):

~~_HISTORICAL pre-S52 P2 (2026-05-12 → 2026-05-26)_: if `severSplit` returns
empty `del` set (§VIII.4 cycle case — bond cut but no primitives die because
both sides remain connected through the cycle), no charge is consumed. The
bond itself is still removed (pre-existing §VIII.4 behavior). Strategic
balance: defender's cycle build investment costs build-actions but isn't a
real defense; attacker's "free" cycle break consumes no charge but does no
damage. Net-neutral gameplay.~~

**S52 P2 AMENDMENT (2026-05-26, user-authorized verbatim "each raid point =
break 1 connection no 5"):** the cycle-no-consume exception is REMOVED.
Every hostile sever — including bonds that close cycles where `severSplit`
returns empty `del` — now consumes 1 `disruptionCharge` via the same
`computeBaseCharge` path. The bond is still removed (pre-existing §VIII.4
topology behavior unchanged). Self-sever (both endpoints share actor's
`placerColor`, `computeBaseCharge = 0`) remains the only 0-cost path.

**Strategic balance shift:** attackers can no longer chip cycle bonds for
free. Defenders' triangulated cells now cost actual raid charges to
penetrate, restoring the defensive value of cycle build investment.
`src/state/world.ts` SEVER_BOND case dropped the
`chargeToConsume = split.del.size === 0 ? 0 : computeBaseCharge(...)`
ternary in favor of a uniform `chargeToConsume = computeBaseCharge(...)`.
`src/state/disruptionManager.ts` `computeBaseCharge` JSDoc updated.

**Charge dots UI** (`src/render/ui.ts`): per-player 0/1/2 filled circles
in the player's color next to per-player score readouts. Hollow ring
when charge not yet earned. Visible only in 1v1 PLAYING.

**Test coverage:** 10 new tests in `src/state/world.test.ts` S17 P1
describe block (cross-player consume, 0-charge reject, self-sever free,
wrong-turn reject, mixed-ownership auth, **cycle-consume — S52 P2
amendment renamed from cycle-no-consume**, charge cap, independent
accumulation, save roundtrip, physics-cause bypass). 16
pre-existing `SEVER_BOND` dispatch sites migrated to include `playerId`
+ `cause: 'physics'` (preserves their §VIII.4 topology-focused
semantics).

---

### 13.12 Phase-2 §VI.4 — Multi-color bond rendering (S17 P2 NEW)

Per-endpoint bond stroke gradient when adjacent primitives have
different `placerColor`. Spec authority: **§VI.4 LOCKED + §X.2 LOCKED**
("multi-color structures reveal contributions").

**API change** (`src/render/bondVisualRenderer.ts`): `BondVisualParams`
`color: number` → `colorA + colorB`. Caller (`structureRenderer.ts`
`drawBonds`) sources `colorA = primitive.aId.placerColor` and `colorB =
primitive.bId.placerColor` (Council R1 Gemini #1 BLOCKER: placerColor is
immutable contribution record, NOT transient ownerColor). Stress-tint
applied per-endpoint via `lerpTint(.., 0xff3030, stress * 0.85)`.

**Implementation (stroke decomposition):** Pixi v8 Graphics has NO
native A→B endpoint gradient stroke API (Council R1 Grok #6 + Gemini #5
both confirmed). `drawDefaultLine` decomposes into 4 sub-segments with
color lerped at `t ∈ {0.125, 0.375, 0.625, 0.875}` via the `lerpColor`
pure helper (exported for test pixel-sampling).

**Back-compat fast-path:** when `colorA === colorB` (Phase-1 single-player
build, or solo mode), `drawDefaultLine` emits a single solid stroke —
identical to S7-S16 behavior. Existing 22 bondVisualRenderer tests stay
green.

**Magic-14 silhouettes (filament, cable, bracket, diamond, wheel, star,
orbital, lattice, capsule, vortex, whip, warped, anchor, spindle) use `colorA`
as primary stroke** — per-silhouette gradient upgrade deferred to S18 polish.
Phase-2 Tier-1 v1 ships with default-line gradient only. (S116 audit F4: was
stale "Magic-12" + missing anchor/spindle, which were promoted to magic in S91.)

**Test coverage:** 8 new tests in `src/render/bondVisualRenderer.test.ts`
S17 P2 describe blocks (lerpColor at t=0/0.5/1, green-cyan channel
preservation, same-color back-compat, cross-color 4-segment count,
monotonic R/B progression, axis-span boundary).

---

### 13.13 Phase-2 §VIII.4 — Sever topology preserved (S17 unchanged)

The Phase-1 `severSplit` rule (smaller side erases; tiebreaker = newer
max-`createdTick`; cycle = no primitives die but bond is still cut)
remains unchanged for both cause='player' and cause='physics'. The
charge accumulator + auth gate (§13.11) layer ON TOP of this topology;
they decide whether the action runs, not what it does.

---

### 13.14 Audio subsystem (S18 P1 NEW; S19 P1 per-channel controls)

**Background music:** user-supplied Suno track "Blue Steppe Orbit" served
from `public/audio/blue-steppe-orbit.mp3` (~10MB mp3, OGG compression
deferred S20+). Lazy-loaded + decoded once on first user gesture; looped
via `AudioBufferSourceNode.loop = true`. Music starts on transition into
`gameState === 'PLAYING'` (covers solo + 1v1 host + 1v1 client paths).

**SFX (procedural — no external assets):**
- **Clave-tap** on bond-form: two sine oscillators @ 1200 Hz + 2400 Hz
  with `exponentialRampToValueAtTime` envelope decay over 30 ms
- **Descending pitch sweep** on player-cause sever: sawtooth oscillator
  600 Hz → 180 Hz over 280 ms with lowpass biquad sweep 800 Hz → 120 Hz
  (filter Q = 4) and envelope decay

`placePrimitive.ts` emits exactly ONE `BOND_FORMED` per placement
regardless of N bonds formed (Council Adoption-B). `world.ts SEVER_BOND`
emits `BOND_SEVERED` with `cause` discriminator; audio drain filters
`cause === 'player'` (physics-overstretch is silent).

**Replay safety:** `drainAudioEffects()` uses a `lastDrainedTick` cursor.
Effects with `tick <= cursor` are skipped on re-drain (save/load replay
+ NET reconciliation re-applies actions but cursor preserved → no
double-fire). `resetAudioDrainCursor()` called on `RETURN_TO_TITLE`.

**Audio graph (S19 P1):**

```
music source ──▶ musicGain ──┐
                             ├──▶ masterGain ──▶ destination
SFX envelope ─▶ sfxGain ─────┘
```

- **masterGain** — 'M' key target. `toggleMute()` flips it between 0 and
  1, preserving per-channel state. Legacy `spark_audio_muted`
  localStorage key drives this; pre-existing users keep their preference.
- **musicGain** — per-channel volume + mute. Effective output =
  `musicMuted ? 0 : clamp01(musicVolume)`. Default volume 0.25 (matches
  pre-S19 hard-coded `MUSIC_GAIN`).
- **sfxGain** — per-channel volume + mute. Effective output =
  `sfxMuted ? 0 : clamp01(sfxVolume)`. Default volume 1.0.

**Mute interactions:** `setMusicMuted` / `setSfxMuted` are independent
of `toggleMute` (master). Master mute = 0 wins over per-channel
non-zero. Volume sliders remain interactive while muted; the slider
value is stored but does not unmute the channel.

**localStorage schema (5 keys, namespace `audio.*` + legacy):**

| Key | Type | Default | Owner |
|---|---|---|---|
| `spark_audio_muted` | `'true'` / `'false'` | `false` | `toggleMute()` master pause |
| `audio.musicMuted` | `'true'` / `'false'` | `false` | `setMusicMuted()` |
| `audio.sfxMuted` | `'true'` / `'false'` | `false` | `setSfxMuted()` |
| `audio.musicVolume` | numeric `0..1` | `0.25` | `setMusicVolume()` |
| `audio.sfxVolume` | numeric `0..1` | `1.0` | `setSfxVolume()` |

Malformed values fall back to defaults (NaN / Infinity / `not a number`
→ clamped to default per channel). All writes wrapped in `try/catch`
for Safari private mode.

**UI surfaces:**
- **♪ glyph** at `(CANVAS_WIDTH-12, 30)`, alpha 0.55. Dims to `♪̸`
  alpha 0.25 when `isMuted()` true ('M' global pause active).
- **⚙ icon** at `(CANVAS_WIDTH-32, 30)`, alpha 0.55, Pixi
  `eventMode='static'`. Pointertap opens HTML settings overlay.
- **Settings overlay** (`src/render/settingsOverlay.ts`): HTML
  `position:fixed`, top:60px, right:24px, z-index:1000. Two channel
  rows (Music + SFX), each with on/off checkbox + 0..100 range slider.
  Closes on ✕ button / ESC / outside-click. Keydown inside the overlay
  stops propagation so typing/sliding does not bubble to canvas-bound
  'M' handler (S19 PRIME-AUDIT #3).

**'M' key gate:** Canvas-level keydown handler in `main.ts` checks
`document.activeElement.tagName` — INPUT and TEXTAREA bypass the mute
toggle so typing into the lobby room-code input doesn't flip mute.
Settings overlay keydown stopPropagation provides defense-in-depth.

**Pure helpers** (exported for unit tests, no AudioContext required):
`claveEnvelope(t, duration)`, `fartFreq(t, duration, startHz, endHz)`,
`clamp01(n)`.

---

### 13.15 Phase-2 godly/creature system (S22–S33 codification; locked S34 P2-19)

This section codifies the live constants and architecture of the Phase-2 godly
mechanic chain. Source-of-truth file paths are absolute paths under `src/`.
All values are verbatim from current code at S34 commit `88b11b0` — any future
divergence between this section and the code is a regression in one of the
two; the code is canonical for runtime semantics, this section is canonical
for design intent.

#### Cinematic timing (`src/render/cutsceneOverlay.ts` + `src/state/godlyRecipes/voltkin.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `cinematicMs` | **4500** | Wall-clock duration of the mp4 video overlay |
| `sustainedEffectMs` | **500** | Post-video opaque-bg hold before fade-out |
| `FADE_MS` | **300** | Black-overlay fade-out duration |
| `VIDEO_LOAD_TIMEOUT_MS` | **5000** | Fallback if `canplay` never fires (mp4 hardening) |

**Spawn-delay math (S31 P0-1):** SPAWN_CREATURE fires at
`fireAtTick = world.tick + cinematicMsToTicks(cinematicMs + sustainedEffectMs + FADE_MS)`
so the creature's SPAWNING pulse is fully visible the moment overlay reaches
alpha=0.

#### Creature lifecycle (`src/state/creatures/creature.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `VOLTKIN_LIFETIME_TICKS` | **480** | 8 s @ 60 Hz — total creature life span |
| `CREATURE_SPAWN_TICKS` | **60** | SPAWNING → SEEKING transition tick |
| `CREATURE_DESPAWNING_TICKS` | **60** | Final-state duration before delete |
| `CREATURE_FADE_TICKS` | **30** | Last-N-ticks alpha-out window within DESPAWNING |

FSM: `SPAWNING` → `SEEKING` → `ATTACKING` (cadenced) → `DESPAWNING` → cleared.

#### Combat (`src/state/creatures/creatureAttack.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `VOLTKIN_ATTACK_CADENCE_TICKS` | **60** | Tick-cycle period for one attack |
| `VOLTKIN_ATTACK_FIRE_TICK` | **30** | Mid-cycle tick at which ARC_FLASH+SEVER_BOND fires |
| `VOLTKIN_ATTACK_RANGE` | **180** px | Max distance from creature to target bond midpoint |
| `VOLTKIN_ATTACK_RANGE_SQ` | derived | `VOLTKIN_ATTACK_RANGE²` for sqrt-free distance check (consumer-derived, not a config field per S34 PRIME-AUDIT Δ2) |

#### Steering (`src/physics/creatureVerlet.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `SEEKING_LEAN_MAX_RAD` | **≈0.262** (~15°) | Rotation lean cap during SEEKING state |
| `CREATURE_MAX_ACCEL` | (per-substep peak) | Top-speed gate via VELOCITY_DAMPING=0.998 |

Per-behavior helpers `seekForce` / `arriveForce` / `repulseForce` are **`@internal`
test-only exports** (S26 Council Q4 COMPROMISE Δ2, re-locked S34 P2-17).

#### Visual effects (`src/render/effects/arcFlash.ts` + `src/render/effects/lifetime.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `ARC_FLASH_DURATION_TICKS` | **24** (~400 ms) | Lightning effect visible window (S30 P0c tune, was 18) |
| `ARC_HALO_WIDTH` | **12** | Outer cyan halo line width |
| `ARC_CORE_WIDTH` | **3.5** | Inner bright-cyan core line width |
| `ARC_JITTER_AMP_PX` | **20** | Per-vertex perpendicular jitter amplitude |
| `arcSeed(tick, sx, sy, creatureId)` | mulberry32 | Deterministic per-vertex jitter (S33 P1-11: `creatureId?` mixed in additively-optionally so two creatures at int-truncated same pos same tick produce DIFFERENT jitter; legacy snapshots without creatureId degrade to pre-S33 pattern via `(undefined \| 0) → 0`) |

#### Screen shake (`src/render/screenShake.ts`)

| Constant | Value | Purpose |
|---|---|---|
| Decay duration | **6 ticks** | Triangular envelope, peak-then-decay |
| Amplitude | **±2 px** | Stage offset peak |
| Gate | `shouldTriggerShakeForArcFlash(world.effects, world.tick)` | S33 P1-6 forward-defense: tied to ARC_FLASH emit (visual cause), NOT bond-delta (side-effect). Anvil-ready: cleave/AOE creatures may emit flash without severing OR sever without flashing. |

#### NetSnapshot (`src/state/save.ts`)

| Field | Schema posture | Notes |
|---|---|---|
| `world.effects` ARC_FLASH | serialized | host→client mirror (S31 P0-3) |
| `world.effects` BOND_FORMED | serialized | host→client mirror (S31 P0-3) |
| `world.effects` BOND_SEVERED | serialized w/ `cause` union | `'player' \| 'physics' \| 'godly' \| 'creature'` — `'godly'` is **dead-but-kept-for-back-compat** post-S27 (S34 P2-18 DROP-not-delete per audit-finding-can-be-false-positive-when-existing-comment-documents-intent pattern) |
| ARC_FLASH `creatureId?: CreatureId` | additive-optional | S33 P1-11 — **NO SCHEMA_VERSION bump** per documented additive-optional precedent (S15 P2 / S28 P0 / S31 P0-3); legacy snapshots without creatureId rehydrate as `undefined` |
| `pendingCreatureSpawn` | force-cleared on apply | save.ts:336 in applySnapshotCore — host save mid-cinematic must not spawn a queued creature on client restore |

**Schema bump bar:** A new field that EXTENDS without changing existing rehydration semantics does NOT bump SCHEMA_VERSION. Schema bumps are reserved for shape-incompatible changes (e.g. removing a field, renaming, semantic flip). Reaffirmed S34.

#### Teardown / state clearing

Five paths clear cinematic + creature state (regression-locked S34 P2-16 / P2-21):

1. `applyReturnToTitle` (`src/state/gameMode.ts:104`) — clears `world.creatures`, `nextCreatureId`, `activeCinematicPlayerId`, `currentCinematicEvent`, `pendingCinematics`, `pendingCreatureSpawn` on TITLE re-entry.
2. `GODLY_ABORT` (`src/state/world.ts:407`) — same 6-field cascade on peer-drop.
3. `applySnapshotCore` (`src/state/save.ts:336`) — clears `pendingCreatureSpawn` on snapshot restore.
4. `createWorld` (`src/state/world.ts:275`) — initializes all six to null/empty.
5. `applyStartGame` (`src/state/gameMode.ts:57`, S34 P2-21) — defensive `pendingCreatureSpawn = null` at game entry; no-op under known flows, forward-proofing for Anvil S35+.

Orchestration side (in `main.ts:741-750` PLAYING→TITLE transition watcher):
- `cutsceneOverlay.abort()` — kills active HTMLVideoElement + Pixi sprite + ticker callback
- `screenShake.reset()` — zeroes stage offset cursor
- `creatureRenderer.clear()` — sprite-Map empty (S34 P2-16; preserves container)
- `lastCinematicOwner = null` — releases `startCinematicIfNeeded` gate
- `clientLastShakeArcFlashTick = -Infinity` — resets shake tick threshold

#### Anvil migration (S35+ — when second godly ships)

Adding a second creature type after voltkin-config consolidation (S34 P2-20) is:
- `+1 CreatureConfig` entry in `CREATURE_CONFIGS` (anvilConfig with own constants)
- `+1 attack handler dispatch` in `creatureAttack.ts` (e.g. cleave-style instead of arc-zap)
- `+1 voice/video asset pair` registered in recipes
- `+1 ARC_FLASH variant OR new effect kind` (e.g. SHOCKWAVE) — additive-optional NetSnapshot field; **NO SCHEMA_VERSION bump** per the precedent above
- `+P1-12 replay-determinism run` to verify byte-exact preservation across the second-creature path

Open design Q (to be locked at Anvil PDR): does Anvil reuse Voltkin's
SEEKING/ATTACKING FSM (per-state attack range from config) or introduce a
new state (e.g. CHARGING for melee wind-up)? Either is config-extensible.

#### Cross-references

- Blueprint: § VI Voltkin spec, § VII godly recipes registry, § X.2 visual reveals
- Handoff series: S22 P3 (godlyRecipes types) → S25–S28 implementation chain → S29–S30 polish → S31 P0 (5 user-visible bugs) → S33 P1 (10 quality fixes) → S34 P2 (this codification + voltkin-config refactor)
- Reflexion: `#audit-finding-can-be-false-positive-when-existing-comment-documents-intent` (S33 P1-7 + S34 P2-18), `#council-reasons-from-generic-best-practice-prime-audit-brings-domain-evidence` (S33 PRIME-AUDIT Δ1)

---

### 13.16 Phase-2 Sym D — Color-segregated bonding (S46 P3 NEW)

Spec authority: **§VI.4 LOCKED** (multi-color structures reveal contributions). Council R1 Grok #4 + Gemini #1 BLOCKER.

**Invariant:** All bonds in the world have both endpoints with the same `placerColor`. Cross-color bonds cannot form. Enforced at two layers:

1. **Host re-pick** (`src/state/placePrimitive.ts`): when a PLACE_PRIMITIVE intent arrives from a remote peer (`action.playerId !== localPlayerId`), the host discards the joiner-supplied `targetPrimitiveId` and re-derives the nearest same-color candidate within `AUTO_BOND_RADIUS = 60 px` from the authoritative world state. Re-pick fires ONLY for remote-origin intents — it never overrides an explicit same-color joiner-supplied target, never fires for local (host) placements.

2. **Color gate** (`src/state/placePrimitive.ts`): after target selection, the host verifies `candidate.ownerColor === placer.color`. If the candidate belongs to a different player, the placement becomes an anchor (no bond formed). Auth uses `placerColor` (immutable per §VI.4, set at creation) — NOT transient `ownerColor` (which mutates on Phase-2 Steal).

**Dead rendering code:** The S17 P2 + S19 P3 multi-color gradient branches in `drawDefaultLine`, `strokeAxisLerp`, `strokePathLerp` (shared.ts) and `drawDiamond`, `drawLattice` (axisAligned.ts) were removed in S49 P3 — ~51 LOC. The `colorA` / `colorB` fields remain in `BondVisualParams` and are passed through by the caller (`structureRenderer.ts`) but are now always equal. `lerpColor` and `midColor` helpers remain (used by midpoint ornaments and tested directly).

**Geometric consequence with Sym F (§13.19):** `TERRITORY_BASE_RADIUS (60 px) = AUTO_BOND_RADIUS (60 px)`. It is geometrically impossible to be within auto-bond range of an enemy primitive without being inside enemy territory. Therefore the Sym D color gate is now defense-in-depth code that never fires in normal gameplay — territory rejection (§13.19) is the outer gate. If `AUTO_BOND_RADIUS` is ever raised above `TERRITORY_BASE_RADIUS`, this invariant weakens.

---

### 13.17 Phase-2 Sym G — Voltkin chain isolation (S48 P4 NEW)

Spec authority: Phase-2 godly system (§13.15). S48 P4.

The Voltkin 8-primitive recipe (`src/state/godlyRecipes/voltkin.ts`) requires a **strictly isolated linear chain** of exactly 4 squares + 4 triangles, bonded in a single line with no branches or cross-links to the rest of the board. Isolation is validated with two belt-and-suspenders checks applied to every candidate chain:

1. **Degree check** — `bonds.size === expectedDegree`: each chain primitive must have exactly the expected bond count (interior nodes = 2, endpoint nodes = 1). A chain primitive that also bonds to a non-chain primitive has extra bonds → rejected.

2. **Endpoint containment** — `every bond endpoint is in chainSet`: even if degree matches, all bond partners must be within the chain set. Guards against graph pathologies where off-chain prims happen to have the same degree.

Either check failing → recipe match rejected, Voltkin does not spawn. This closes the gameplay loophole where a sprawling mesh with an embedded 4Sq-4Tr fragment would erroneously fire Voltkin.

**Test coverage:** the pre-S48 "branched topology" test in `voltkin.test.ts` was inverted to verify rejection (S48 P4). Existing clean-chain tests remain GREEN.

---

### 13.18 Phase-2 Sym I — ENDGAME envelope wire (S48 P1 NEW)

The `ENDGAME` NetMessage kind was defined in `src/net/protocol.ts` since S15 but never wired with a send call site or recv handler — same anti-pattern as `parseNetMessage` pre-S38 audit and `KNOWN_GAME_ACTION_TYPES` pre-Pass-2. Three instances identified; pattern codified as S48 reflexion entry.

**Host-side send** (`main.ts`): on PLAYING→WIN edge transition, host now sends `{ type: 'ENDGAME', winnerId }` to all peers. Send is ordered BEFORE the standard snapshot emission so the client can gate snapshot application.

**Client-side recv** (`main.ts`): new recv handler applies `dispatch(world, { type: 'WIN_TRIGGER', winnerId, tick: world.tick })` on receipt. The handler gates on `snapshotSeq` (current client snapshot sequence) to prevent double-application if the subsequent snapshot also carries WIN state.

**Symptom fixed:** joiner remained stuck at PLAYING state after host transitioned to WIN/POSTGAME, requiring a manual page reload to see the result screen.

**Pattern rule:** when adding a new NetMessage kind to `protocol.ts`, MUST verify BOTH halves before merging — the send call site AND the recv-side dispatch.

---

### 13.19 Phase-2 Sym F — Territorial repulsion (S49 P1 NEW; Full-tier Council deliberation)

Spec authority: Phase-2 mechanic spec (user-confirmed design S46+S47 handoffs). Full-tier 3-way Council Battle Ledger.

**Core mechanic:** each player's placed structures "own" space around them. Enemy placements inside that space are silently rejected (carry preserved). Enemy bonds inside that space are stiffness-penalised each physics tick.

#### Complexity & radius formula

```
complexity(pid) = primCount + 0.5 × bondCount + 0.1 × componentCount
R(pid) = TERRITORY_BASE_RADIUS + TERRITORY_RADIUS_SCALE × log₂(complexity + 1)
```

Constants (`src/constants.ts`):

| Constant | Value | Purpose |
|---|---|---|
| `TERRITORY_BASE_RADIUS` | **60 px** | Minimum radius (matches `AUTO_BOND_RADIUS`; see §13.16 geometric note) |
| `TERRITORY_RADIUS_SCALE` | **12 px** | log₂ scale factor per complexity unit |
| `TERRITORY_ENGULF_STIFFNESS` | **0.3** | Bond stiffness multiplier inside enemy territory |
| `TERRITORY_SHRINK_DURATION_TICKS` | **300** | 5 s @ 60 Hz — SHRINK_TERRITORY effect duration |

#### Hard block (placement rejection)

`isInsideEnemyTerritory(spark.pos, playerId, world)` in `src/state/territory.ts` returns `true` when `spark.pos` is within any enemy player's `R`. Called in `src/state/placePrimitive.ts` after the spawner-zone check, before bond formation. On rejection: `world.diagnostics.territoryBlockRejects++`; carry is preserved (spark stays held).

#### Engulf-warp (bond stiffness penalty)

`computeTerritorialInfluence(world)` in `src/state/territory.ts` iterates all bonds in the world and sets `bond.stiffnessMultiplier = TERRITORY_ENGULF_STIFFNESS (0.3)` for any enemy bond whose A or B endpoint is inside the local player's territory. Called ONCE per physics tick in `main.ts` **before** the 8-substep loop. `solveBonds` in `src/physics/bonds.ts` reads `bond.stiffnessMultiplier ?? 1.0` when computing the constraint correction.

**§10.2 compliance:** `stiffnessMultiplier` is ephemeral — the field is reset (or left unset) every tick by `computeTerritorialInfluence`. It is NOT stored in `WorldSnapshot` / `NetSnapshot`, not serialized, and not part of game state. The field is declared as mutable (non-`readonly`) on the `Bond` interface exactly because it is a per-tick physics annotation, not a durable property.

#### SHRINK_TERRITORY disruption

```typescript
{ type: 'SHRINK_TERRITORY'; playerId: PlayerId }
```

- **Trigger:** 'Q' key in `src/input/controls.ts`. Guarded by `gameMode === '1v1'`, `gameState === 'PLAYING'`, and `player.disruptionCharges >= 1`. Skipped when an INPUT/TEXTAREA has focus.
- **Cost:** 1 disruption charge (`player.disruptionCharges--`).
- **Effect:** all enemy players gain `territorialShrinkUntilTick = world.tick + TERRITORY_SHRINK_DURATION_TICKS`. While `world.tick < player.territorialShrinkUntilTick`, `computeTerritorialRadius` returns `R / 2`.
- **1v1-only:** dispatch handler exits early when `world.gameMode !== '1v1'`; Q key handler guards the same condition before dispatching.
- **Net:** `SHRINK_TERRITORY` registered in `KNOWN_GAME_ACTION_TYPES_RECORD` (`src/net/protocol.ts`). Host applies authoritatively; client sends as Intent envelope.

#### Serialization

`territorialShrinkUntilTick: number | null` added to `PlayerCommon` (`src/game/player.ts`). Serialized in `SerializedPlayer` as an additive-optional field (same pattern as S15/S28/S31/S33 precedents) — pre-S49 saves rehydrate as `null`. Cleared on `applyStartGame` + `applyReturnToTitle`.

#### Files

| File | Change |
|---|---|
| `src/state/territory.ts` | NEW — `computePlayerComplexity`, `computeTerritorialRadius`, `isInsideEnemyTerritory`, `computeTerritorialInfluence` |
| `src/state/territory.test.ts` | NEW — 21 tests covering radius formula, hard block, engulf-warp, shrink effect |
| `src/state/placePrimitive.ts` | territory hard block after spawner check |
| `src/main.ts` | `computeTerritorialInfluence(world)` before substep loop in `stepPhysics` |
| `src/physics/bonds.ts` | `Bond.stiffnessMultiplier?: number` (non-readonly); `solveBonds` applies `× (bond.stiffnessMultiplier ?? 1.0)` |
| `src/game/player.ts` | `territorialShrinkUntilTick: number \| null` in PlayerCommon; FSM transitions carry it |
| `src/state/world.ts` | `SHRINK_TERRITORY` action + dispatch; `diagnostics.territoryBlockRejects` counter |
| `src/state/gameMode.ts` | reset `territoryBlockRejects` + `territorialShrinkUntilTick` on game start + title return |
| `src/state/save.ts` | `territorialShrinkUntilTick?: number \| null` in `SerializedPlayer` |
| `src/net/protocol.ts` | `SHRINK_TERRITORY: true` in `KNOWN_GAME_ACTION_TYPES_RECORD` |
| `src/input/controls.ts` | Q-key handler + optimistic territory gate in LMB-up |
| `src/render/debugOverlay.ts` | TERRITORY section (complexity, R, shrink countdown per player) |
| `src/render/ui.ts` | `Q=ZONE` hint text (visible in 1v1 PLAYING) |

### 13.20 Netcode hardening — crypto host identity + reconnect + intent allowlist (S82 P4 NEW; Full-tier Council R1+R2)

- **Host attestation (lifts the S79 P4 TOFU race ceiling).** `src/net/hostIdentity.ts`:
  page-session ECDSA P-256 keypair (WebCrypto, 0 dependency bytes); room code = first
  30 bits (big-endian) of SHA-256(pubkey SPKI), 5 bits/char over the §13.4 alphabet —
  ONE exported pure slicer (`roomCodeFromDigest`) used by host-derive AND client-verify.
  Attestation payload = `utf8('SPARK-HOST-ATTEST-v1') || u16be(len)||roomCode ||
  u16be(len)||hostPeerId` (length-prefixed + domain-separated — injective; Council
  convergent fix). Attached additive-optionally to HELLO + START_GAME_SIGNAL — **NO
  PROTOCOL_VERSION bump** (lockstep deploys; stale peers null-reject).
- **Client latch (S79 hostAuthFilter v2).** Latch precondition = `hostVerifiedPeerId
  === sender` (set ONLY after `verifyHostAttest`: fingerprint === typed code AND valid
  sig AND signed peerId === transport sender) + the seat-0-self-naming roster rule. The
  weak first-NETSNAPSHOT fallback is REMOVED. Pre-verify, START_GAME_SIGNAL +
  LOBBY_PRESENCE buffer (latest per kind per peer, bounded) and REPLAY on verify
  success — the Begin signal can never be lost to verification latency. Verify failure
  leaves the client in pre-latch able to process the next attestation. Residual
  (accepted): Trystero signaling-layer selfId spoofing; ~2^30 fingerprint preimage ≈
  hours of keygen vs minutes-long friend lobbies.
- **In-page auto-reconnect** — see the §13.7 amendment. Session fields `roomCode` /
  `hostAttest` / `hostVerifiedPeerId` survive reconnect; only teardownNet clears them.
- **Client-intent allowlist.** `CLIENT_INTENT_TYPES` (protocol.ts, single source of
  truth) = the 12 genuine player intents; the host INTENT handler drops everything
  else fail-closed (+ raceRejects diagnostic). Closes the pre-S82 hole where ANY
  GameAction type (SPAWN_*, WIN_TRIGGER, START_GAME, …) was wire-valid as an INTENT.
  `BENCH_OFFLINE_PLAYER` is the first action that RELIES on this gate.
- **Tests:** netHardening.test.ts (encoding injectivity, fixed-vector slicing,
  e2e generate→attest→verify + all tamper rejections, allowlist, drop-bench reducer);
  clientHandlers.test.ts rewritten to the v2 latch contract (race-is-dead case);
  e2e/reconnect.spec.ts real-WebRTC blip recovery (@quarantine-flaky, verified locally).

---

## 14 · Fog Palette — USER-LOCKED (S86, 2026-06-12)

| Constant | Value | Status |
|---|---|---|
| `MEMORY_FOG_COLOR` (constants.ts) | **`0x000000`** | **LOCKED — user decided TWICE** |
| `FOG_COLOR` (fogRenderer.ts local) | `0x000000` | same decision, same shade |

The explored-area "dim memory tier" renders **pure black** — visually identical
to unexplored fog. This is a deliberate, twice-made USER decision, not an
accident to be "fixed":

- **S63** — user live-tuned the original S59 design away: *"kill the blue fog
  tint → pure black = the background."*
- **S85 P4b** regressed it by treating the S59 design note as a carry-forward
  and restoring `0x161b2e` ("user-EYES knob"). Round-6 playtest verdict
  (2026-06-12, user verbatim): *"the stupid blue fog is back... it should be
  as it was just black background."* → reverted + locked.

**Rule for future sessions:** do NOT restore a dim/blue explored tier — not as
a carry-forward, not as an EYES follow-up, not as a "designed tier restore" —
unless the user explicitly asks for it IN THAT SESSION. Old design notes do not
outrank newer user tuning. Enforced by `src/constants.lock.test.ts` (vitest =
CI-blocking); changing the value requires consciously editing the lock test,
which cites this section.

---

## End — All Phase 1 + Phase-2 Tier-0 (1v1 networked) + Phase-2 Tier-1 (Sever-as-disruption + multi-color bond rendering) + Audio subsystem (Suno BGM + procedural SFX + per-channel controls) + Phase-2 godly/creature system (Voltkin lifecycle + combat + NetSnapshot semantics) + Phase-2 Sym D (color-segregated bonding) + Sym G (Voltkin chain isolation) + Sym I (ENDGAME envelope) + Sym F (territorial repulsion) implementation decisions are locked. Phase 2+ remaining: Inject Spiral (D), Steal (E), Fog of war (A), Mega-combos via connector chain (G), Anvil second-creature (post-S34 P2-20 voltkin-config base). Audio polish remaining: OGG compression for mobile, PannerNode + auto-duck. Phase 3 net (Colyseus / Geckos.io) reserved for >2-player scalability.
