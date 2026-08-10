# The in-bubble build space (V6-1.3 P2) — design, S137

> **Status: OWNER-RULED 2026-08-10, NOT IMPLEMENTED.** §1 records the rulings verbatim. §3 is the
> protocol blocker that must be handled in the same session as the implementation. §7 is the one
> consequence of the rulings that needs an answer before code.
> Everything cited here was read from the code in S137.

---

## 1. OWNER RULINGS (2026-08-10) — verbatim, then what they mean

**Q1 — what comes out of the castle?**
> *"both loose shapes on the porch and the one draggable assembly (while your gatherer is collecting
> shapes you can prebuild them in another dimensional space by clicking on the design (tower) and
> then place it where you want on the map. or drag shapes one by one and build them independently or
> make structures while building them step by step. maybe if you want to build distructions for your
> enemies or other structures which are not combos. or create the combos manually)."*

⇒ **BOTH paths coexist and neither replaces the other.** The shipped one-by-one pull stays exactly as
it is; the build space is **purely additive**. Three consequences that were NOT in the original design:
- **Arbitrary structures, not just recipes.** "structures which are not combos" — the build space must
  not validate against the recipe registry. *(Free: `placePrimitive` bonds by same-colour adjacency,
  not by recipe, so arbitrary layouts bond correctly through the shipped path.)*
- **"create the combos manually"** — a player may deliberately assemble a known recipe here. So the
  godly matcher must see the result identically to a hand-built one. *(Also free, for the same reason:
  the structure is made of ordinary primitives and bonds.)*
- **"clicking on the design (tower) and then place it"** — you pick the finished design, then place it.

**Q2 — where does it land?** → **Wherever you drop it.** Same legality rules as today (blocked inside
the spawn disc and inside enemy territory).

**Q3 — capacity?**
> *"as many as you want, some structures (voltkin) take like 8 shapes - four squares followed by four
> triangles. NONET takes 9 shapes of the same kind to build. it just needs to be a smart third
> dimention place to build the structures and a comfortable one to use - something super high tech
> that fits the game and is super coherent and accessible and easy to understand"*

⇒ **The build space is NOT capped by `CASTLE_BANK_CAP`.** This overrules the premise I put in the
question — I had assumed the bank was the ceiling. It is not. The space must comfortably hold **at
least 9** (NONET) and should not feel rationed. Named targets: **Voltkin = 8** (four squares then four
triangles), **NONET = 9** (nine of the same kind).
⇒ Also a **UX mandate**, not just a number: *smart, comfortable, super high tech, coherent with the
game, accessible, easy to understand.* Treat that as an acceptance criterion, not flavour text.

**Q4 — arrangement?** → **2D freeform grid.** Real prebuilding, not an ordered row.

**Still NOT ruled:** `CASTLE_BANK_CAP` itself. Q3 ruled the *build space*, not the bank. See §7.

## 2. What already ships (verified)

| piece | where | behaviour |
|---|---|---|
| the bank | `state/castleBank.ts:65` | `CastleBank = Spark[]`, capped at `CASTLE_BANK_CAP` (5). Holds whole `Spark` objects lifted OUT of `world.freeSparks` — invisible to collision, the grid, the soft cap and the TTL reap |
| the panel | `render/castlePanel.ts` | opens on a keep click; `CASTLE_BANK_CAP` slots; a filled slot is clickable |
| the pull | `gathererLifecycle.ts:157` `applyPullFromBank` | index-addressed; returns the SAME spark (same id) to the first genuinely unoccupied porch slot |
| selection | `castlePanel.ts:16-20` | `selectedSeat` is render-local: never serialized, hashed, or wired |

## 3. ⛔ BLOCKER: this needs PROTOCOL_VERSION 16 → 17

`PULL_STRUCTURE_FROM_BANK` is a **new client intent**. Precedent is unambiguous:
- `protocol.ts:101-106` — V6-1.1 bumped 15→16 for exactly one new intent (`BUY_GATHERER`), because a
  stale peer's intent is dropped by the host allowlist, so "the two seats would disagree".
  **Hard-rejected at HELLO.**
- `protocol.ts:476-478` — same for `PLACE_FROM_FREE` (2→3).

So this **breaks multiplayer against every already-deployed client until both sides reload**.
**Do it at the START of a session, with a deploy and a 2-peer check in the same session.**

## 4. The design, as ruled

- **A separate "dimensional space"** opened from the castle — a 2D freeform grid, not a slot strip.
- **Place shapes freely in 2D**, in any layout, recipe or not.
- **No arbitrary capacity limit** (§7 decides how that is honoured).
- **Finish → the assembly attaches to your cursor → drop it anywhere legal.**
- **The one-by-one porch pull is untouched**, and remains the way to build step by step.

## 5. Host validation contract (non-negotiable)

The client sends a layout derived from *its* view. The host re-derives everything:

1. `world.players.get(playerId)` exists; not benched (`benchGate.ts`: add
   `PULL_STRUCTURE_FROM_BANK: 'deny'` — the existing `PULL_FROM_BANK: 'deny'` rationale applies more
   strongly).
2. Every referenced shape is genuinely held by that seat, and each is referenced **at most once**.
3. ⚠ **RESOLVE REFERENCES TO CONCRETE `Spark`s BEFORE REMOVING ANY.** `bankTake`
   (`castleBank.ts:108`) does `cur.splice(index, 1)`, so **every removal shifts every later index** —
   taking `[0,1,2]` naively yields shapes 0, 2, 4. *Prefer addressing by `SparkId`, not by index,
   which removes this class entirely.* This is the most likely silent, plausible-looking bug here.
4. Validate **every** target position before mutating anything: canvas bounds, outside the spawner
   disc, not inside enemy territory (`state/territory.ts`). Reject **atomically** — on any failure
   nothing leaves the bank (`placeFromFree.ts:16-17` exists because a partial commit once left a
   player permanently stuck).
5. `protocol.ts`: add to `KNOWN_GAME_ACTION_TYPES_RECORD` **and** the client-intent allowlist, and
   bump `PROTOCOL_VERSION` (§3).

## 6. Placement + bonding — reuse, do not reinvent

`AUTO_BOND_RADIUS = 60` (`constants.ts:550`); primitives auto-bond to same-colour neighbours within
it on placement. So a 2D layout whose cell pitch is comfortably under 60 px bonds **through the
shipped `placePrimitive` path**, with no new bonding logic — which also keeps `BOND_COMMIT` emission,
audio, and merge/impulse behaviour identical to hand-building, and is exactly why "create the combos
manually" works for free.

⚠ **The physics trap, already paid for once.** `gathererLifecycle.ts:176-194` records that clearing
`escrow` let `enforceSpawnerBounds` rim-snap a pulled shape off the porch toward the quarry — a
~194 px teleport, **and no unit test caught it because none of them run physics**. Primitives are not
rim-snapped, so this does not apply if the structure lands as primitives; any variant that leaves
**free sparks** on the board must keep `escrow` set.

## 7. ⚠ THE ONE THING THE RULINGS BROKE — decide before coding

The original design kept the staging **render-local** (never serialized/hashed/wired), which is what
made it free of `FIELD_COVERAGE` + save + protocol + `structuralSignature` + positions-buffer cost
**and** free of desync surface. That was defensible when staging was ≤5 shapes and momentary.

**"As many as you want", 2D, and prebuilding over time breaks it.** A player may now spend minutes
arranging nine shapes — which is several minutes of gatherer labour. Losing that on a reload is no
longer a small trade; it is destroying paid-for work, which is the exact thing the bank was created
to stop (`castleBank.ts:26-34`).

Two ways out. **They differ in cost by roughly an order of magnitude:**

| | **A — BLUEPRINT (recommended)** | **B — REAL STORAGE** |
|---|---|---|
| what staging is | a **layout plan**. Shapes stay in the bank; the grid records "a square goes here". Filled cells light up as matching shapes become available | shapes physically **move** into the build space and live there |
| capacity | naturally unlimited — a plan costs nothing | needs real storage ≥9, i.e. `CASTLE_BANK_CAP` must rise or the space needs its own serialized container |
| reload | you lose a **drawing**, not shapes. Acceptable | you would lose real shapes unless serialized |
| serialization | **none** — stays render-local, zero desync surface | new serialized World state: `FIELD_COVERAGE` + save + protocol + `structuralSignature` + hash |
| matches the ruling? | yes — *"while your gatherer is collecting shapes you can prebuild them"* reads exactly like designing ahead of supply | yes, but heavier |

**Recommendation: A.** It satisfies "as many as you want" *without* raising `CASTLE_BANK_CAP` at all
(so the scarcity pressure the cap exists for survives), keeps the zero-desync property, and matches
the owner's own phrasing about prebuilding *while* gatherers are still collecting. Under A, the pull
simply refuses until the plan is fully satisfied by shapes on hand.

**This is the only question blocking implementation.** Everything else in §1 is ruled.

## 8. Tests required before this is callable done

- Unit: reference resolution incl. the §5.3 shift trap, duplicates, out-of-range, atomic reject
  leaves the bank untouched.
- **Real-physics acceptance:** place a structure, run the actual physics loop for several frames,
  assert every primitive is still where it was put and the bonds still exist. A state-only assertion
  is not evidence (S136).
- Determinism: `hashWorldState` identical for the same action on the same world.
- **Worker path:** confirm the reducer behaves identically under `?worker=1`
  (`state/workerSim.differential.test.ts` is the rig).
- **2-peer:** required this time regardless, because of §3.
- The gating lane must stay green — it exercises the panel on **every** placement via
  `placeFreeSparkAndConfirm`, so a panel regression surfaces there.
- **UX is an acceptance criterion** (§1 Q3): the space must be legible and comfortable, and per the
  S136 lesson that means *looking at the render*, not only asserting state.
