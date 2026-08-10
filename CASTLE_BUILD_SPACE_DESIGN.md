# The in-bubble build space (V6-1.3 P2) — design, S137

> **Status: DESIGNED, NOT IMPLEMENTED — and the reason is a verified protocol fact, not caution.**
> Read §3 before anything else. Everything here is grounded in code read this session, with
> file:line cites.

## 1. The owner's ask

Playtest item 5, ambitious half: *prebuild a structure inside the castle popup, then pull the whole
structure out.* The one-by-one pull already ships (S136 P1), so this is **purely additive**.

## 2. What already ships (verified)

| piece | where | behaviour |
|---|---|---|
| the bank | `state/castleBank.ts:65` | `CastleBank = Spark[]`, capped at `CASTLE_BANK_CAP` (5). Holds **whole `Spark` objects**, lifted OUT of `world.freeSparks` — so collision, the spatial grid, the soft cap and the TTL reap cannot see them |
| the panel | `render/castlePanel.ts` | opens on a keep click; bank strip of `CASTLE_BANK_CAP` slots; a filled slot is clickable |
| the pull | `state/gatherers/gathererLifecycle.ts:157` `applyPullFromBank` | index-addressed; returns the SAME spark (same id) to `freeSparks` at the first genuinely unoccupied porch slot |
| selection | `castlePanel.ts:16-20` | `selectedSeat` is **render-local**: never serialized, hashed, or wired |

## 3. ⛔ THE BLOCKER: this needs a PROTOCOL_VERSION bump 16 → 17

`PULL_STRUCTURE_FROM_BANK` is a **new client intent**. This repo's own precedent is unambiguous:

- `protocol.ts:101-106` — *"V6-1.1 — bumped 15->16: … a NEW client INTENT (BUY_GATHERER). A stale
  v15 peer … its own buy would be dropped by the host's allowlist — so the two seats would disagree
  … **Hard-rejected at HELLO**."*
- `protocol.ts:476-478` — the same for `PLACE_FROM_FREE` (bumped 2→3).

So shipping this **hard-rejects every already-deployed peer at HELLO until both sides reload**. That
is a lockstep-deploy, multiplayer-breaking change. It was deliberately not made unattended in S137,
hours before an owner playtest, for exactly the reason the sim-worker default-on flip was deferred:
*the owner must not discover a compatibility break during a playtest they cannot report on.*

**Do it at the START of a session, with a deploy and a 2-peer check in the same session.**

## 4. Design — staging is RENDER-LOCAL, only the pull crosses the wire

The arrangement is a **local ordering over shapes the bank already holds** — the same posture as
`selectedSeat`, and for the same stated reason: any new `World` field must be added to
`FIELD_COVERAGE` + save + protocol + `structuralSignature` + the positions buffer, and would create a
desync surface. A staged list needs none of that.

- **Stage:** click a filled bank slot → its index joins a local ordered `staged: number[]`.
- **Unstage:** click a staged slot → it returns.
- **Pull:** one control row, enabled at `staged.length >= 2`, dispatches
  `{ type: 'PULL_STRUCTURE_FROM_BANK', playerId, indices: staged }`.
- v1 accepts that an un-pulled arrangement is **lost on reload** — the same trade the open-panel
  state already makes. Persisting it is what would cost the whole serialization tax above.

**v1 is an ORDERED LIST, not a 2D editor.** Shapes come out in a compact row and bond via the shipped
path (§6). Freeform 2D arrangement is v2; it is not needed to deliver "prebuild and pull out as one".

## 5. Host validation contract (non-negotiable — Council ADOPT-2)

The client sends indices derived from *its* view. The host must re-derive everything:

1. `world.players.get(playerId)` exists.
2. `indices` is an array, `2 <= length <= CASTLE_BANK_CAP`.
3. Every entry is an integer, `0 <= i < bank.length`, **and all entries are UNIQUE**.
4. ⚠ **RESOLVE INDICES TO CONCRETE `Spark`s BEFORE REMOVING ANY.** `bankTake` (`castleBank.ts:108`)
   does `cur.splice(index, 1)`, so every removal **shifts every later index**. Taking `[0,1,2]`
   naively yields shapes 0, 2, 4. Resolve first, then remove by identity. *This is the single most
   likely way this feature ships a silent, plausible-looking bug.*
5. Validate every target position **before** mutating anything: canvas bounds, outside the spawner
   disc, not inside enemy territory (`isInsideEnemyTerritory`, `state/territory.ts`) — the same
   validators `placeFromFree.ts` runs. Reject atomically: on any failure, **nothing** is removed from
   the bank (the `placeFromFree` "validation-then-commit" contract, `placeFromFree.ts:16-17` — that
   file exists because a partial commit left a player permanently stuck).
6. `benchGate.ts`: add `PULL_STRUCTURE_FROM_BANK: 'deny'`. The existing `PULL_FROM_BANK: 'deny'`
   rationale applies verbatim and more strongly.
7. `protocol.ts`: add to `KNOWN_GAME_ACTION_TYPES_RECORD` **and** the client-intent allowlist, and
   bump `PROTOCOL_VERSION` (§3).

## 6. Placement + bonding — reuse, do not reinvent

`AUTO_BOND_RADIUS = 60` (`constants.ts:550`) and primitives auto-bond to same-colour neighbours
within it on placement. So placing the staged shapes in a row with a pitch **well under 60 px**
(≈30–34 px; primitive radius is 9) makes the structure bond **through the shipped `placePrimitive`
path** with no new bonding logic — which is also what keeps `BOND_COMMIT` emission, audio, and the
merge/impulse behaviour identical to hand-building.

⚠ **The physics trap, already paid for once.** `applyPullFromBank`'s docblock
(`gathererLifecycle.ts:176-194`) records that clearing `escrow` let `enforceSpawnerBounds` rim-snap a
pulled shape off the porch back toward the quarry — a ~194 px teleport, a *worse* fling than the one
being fixed — and that **no unit test caught it because none of them run physics**. If the structure
is pulled out as **primitives**, this does not apply (primitives are not rim-snapped). If any variant
leaves **free sparks** on the board, `escrow` must stay set.

## 7. Tests required before this is callable done

- Unit: index resolution incl. the §5.4 shift trap, duplicate indices, out-of-range, bank-shorter-
  than-staged, atomic reject leaves the bank untouched.
- **Real-physics acceptance (R3):** place a structure, then run the actual physics loop for several
  frames and assert every primitive is *still where it was put* and the bonds still exist. This is
  the S136 lesson; a state-only assertion is not evidence.
- Determinism: `hashWorldState` identical for the same action applied to the same world.
- **Worker path:** confirm the new reducer runs identically under `?worker=1`
  (`state/workerSim.differential.test.ts` is the existing rig).
- The gating lane must stay green — it exercises the panel on **every** placement via
  `placeFreeSparkAndConfirm`, so a panel regression surfaces there.

## 8. Open questions for the owner

1. **Does the structure come out as a finished BONDED structure on the board, or as loose shapes on
   the porch to place yourself?** This design assumes bonded-on-the-board (it is what "pull the whole
   structure out" reads as), but it removes the placement gesture, which is the core verb of the game.
2. **Where does it land?** Auto-placed beside the castle, or does the player click a target?
3. **Should staging be limited to `CASTLE_BANK_CAP`, or should the build space have its own capacity?**
   Note §9 of `BANK_CAP_MEASUREMENT_S137.md`: the cap's real job is "which recipe can I hold
   outright", so this decision and the cap decision are the same decision.
4. **2D freeform arrangement — wanted, or is an ordered row enough?**
