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

## 1b. ROUND-2 OWNER RULINGS (2026-08-10, after the creative/architectural council)

| # | ruling | status |
|---|---|---|
| R1 | **Architecture = REAL STORAGE (B).** Shapes physically move into the space | settles §7 |
| R2 | **`CASTLE_BANK_CAP` → 12–13** ("real leeway") | ⚠ see C1 |
| R3 | **Per-gatherer submenu** — click a gatherer, get its OWN footer/panel to choose which shapes it focuses on | cheap, see C5 |
| R4 | **Castles start at the extremities of the starting zone, further from the quarry** | ⚠ see C2, C3 |
| R5 | **Gatherers deposit STRAIGHT into the castle/build space** (auto-routing) | answers open Q2 |
| R6 | **A third castle control** beside BUY GATHERER / SPEED: **"BUILD SPACE" / "DIMENSION"**, given a striking graphic. Opens the space to build in, or to pull single shapes out. Must be convenient and intuitive | |
| R7 | **Design library starts EMPTY.** You UNLOCK a design in the Codex → it saves to your library → you click it and it builds for you | see C4 |
| R8 | **Free starter designs**: every player gets the same design(s) free EVERY game whether unlocked or not — "like the drones or pencil chewers or other towers (**not godlies**)" | ⚠ see C6 |

### Consequences found by checking these against the code

**C1 — cap 13 breaks the bank strip layout.** `castlePanel.ts` lays the bank out as ONE row of
`CASTLE_BANK_CAP` slots (`slotOrigin`, `SLOT_W` 40 + `SLOT_GAP` 6) inside a `PANEL_W` of **268**.
13 slots in a row is **592 px** — it overflows by more than double. Fix: a **5-wide grid, 3 rows**
(224 × 132 px), which fits the existing panel. Small change, but `slotOrigin` and the panel-height
maths both assume a single row today.

**C2 — R4 and R2 push the economy in OPPOSITE directions.** The keep ring is
`SPAWNER_RADIUS + 150` = **275 px** from centre, so the quarry-rim→keep gap is **150 px**. Moving the
ring to ~420 makes that gap **295 px — a 1.97× longer haul**, so throughput *drops* while the bank
gets *bigger*. Both changes are wanted, but they are not independent: measured today at cap 5 the
economy banks ~5 shapes/60 s, and doubling the haul will cut that materially. **We already have the
harness to measure it** (`e2e/bank-throughput.spec.ts`) — so this should be re-measured after the
move rather than guessed, and gatherer speed / count re-tuned against the result.

**C3 — there is no "starting zone" in the code.** Grep finds no `startingZone` / `homeZone` concept;
keeps sit on a fixed ring around the arena centre. So R4's actionable form is **"increase the keep
ring radius"**. Verified on-canvas fit for the 7-seat ring: **R = 275 (today) · 360 · 420 · 460 all
fit**; 460 puts the extreme keeps at y = 63…1017 inside a 1080 canvas. Recommend **~420** (comfortable
margin, nearly double the haul distance).

**C4 — the design-library infrastructure ALREADY EXISTS.** `render/codexStore.ts` is a
localStorage-backed unlock store with `loadUnlockedSet(): Set<GodlyId>` / `unlockGodly(id)`, and
`comboCodexStore.ts` does the same for discovered combos. R7 is therefore close to free: the library
IS the unlocked set, and "click it and it builds for you" is the template loader from §1 Q3.

**C5 — R3 is what the panel was designed for.** `castlePanel.ts:11-14` already says the panel is
built around a `PanelControl` descriptor list *because* "different towers and stuff will have their
own upgrades and pop up when you click on them". A gatherer panel is a second descriptor list, not a
new system. Note it REPLACES today's click-to-cycle preference (`controls.ts` `SET_GATHERER_PREFERENCE`
cycles Any→Dot→…→Any) with an explicit picker — better, and the reducer already exists and takes a
resolved value, so no new intent is needed for the picking itself.

**C6 — ⚠ THE FREE STARTER DESIGNS DO NOT EXIST YET.** `godlyRecipes/` contains exactly five recipes —
pentagram, lightningHub, voltkin, laserTurret, princessHelga — and **all five are godlies**, including
laserTurret. So there is currently **no non-godly buildable recipe at all**. R8 therefore is not a
"grant what we have for free" change; it is **new content that must be authored** (a wall? a block? a
spike? a simple tower?). This is the single biggest unscoped item in the whole feature and it is a
DESIGN question, not an engineering one. Chewers appear to be hostile creatures that EAT structures
(`hostTick.ts:303` "a chewer ate the structure"), not player-buildable — so "pencil chewers" as a free
design needs the owner to confirm what they mean.

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

## 7. ✅ RESOLVED — §1b R1 RULED **REAL STORAGE (B)**. Kept below for the reasoning.

> **Do not re-open this.** §1b R1 (2026-08-10, round-2 rulings) settles §7: **architecture = REAL
> STORAGE (B)** — shapes physically move into the build space. `CASTLE_BANK_CAP` is likewise ruled
> (§1b R2 → **12–13**), which is what pays for B's storage requirement, together with the C1 panel
> regrid (5-wide × 3 rows).
>
> ⚠ **S138 correction to the S137 handoff:** `boot-snapshot.md` and the S137 carry-forwards both said
> §7 was *"the ONE thing left to decide"* and that `CASTLE_BANK_CAP` was *"still UNRULED"*. **Both
> claims were STALE** — written before the round-2 addendum landed in `ab091ca`. The recommendation
> below still argues for A; it is superseded by R1 and retained only as the record of the trade-off.

## 7b. ⚠ THE ORIGINAL ANALYSIS (superseded by §1b R1 — retained for the reasoning)

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

---

# ADDENDUM — CASTLE RACES BY COLOUR (owner vision, ruled 2026-08-27, S154)

Recorded verbatim-in-substance so it is not lost between sessions. **Not scheduled yet** — the owner
placed it "next session or the session after". S154 ships only the castle's **1500 HP** and the
damage/win path underneath it.

## The races, keyed on the player's colour

| Colour | Race | Passive spawn | Notes |
|---|---|---|---|
| white | **ghosts** | ghosts | |
| green | **zombies** | the **zombie hound** — ALREADY GENERATED, sitting in `assets-source/zombie-castle/` (idle + walk; the attack clip failed twice on veo backpressure, see CF-S153-c) | the one race with art already on disk |
| red | **vampires** | bats | the bat rider atlas already exists and reads as vampiric |
| blue | **ice giants** | — | |
| purple | **demons** | — | |
| yellow | *(undecided — owner has not named it)* | — | ⚠ ASK before inventing one |

## What each race gets

- **A generated castle** — "awesome looking", per race.
- **Cinematics**: how it ATTACKS, how it looks DAMAGED, how it looks DESTROYED. Three states, not one.
- **A passive spawn** — the castle itself produces units over time (zombie hound / bats / ghosts …),
  distinct from the goblin tower's fed spawns.
- **A distinct attack kind** per race.

## ⛔ THE BALANCE RULING, and it is the load-bearing constraint

> *"all castles and their spawn will have the same strengh and hp to start with - later we will add
> castle upgrades like we have for the gatherers"*

So the races are **cosmetic + flavour at first, identical in stats**. This matters for how S154's HP
work is written: `CASTLE_MAX_HP` is ONE constant for every seat, deliberately, and nothing should key
HP or damage off the race. It also matches R88, already on record: *all castle races share ONE stat
line.*

**Later**, castle upgrades arrive and follow the GATHERER precedent — points spent from
`scoreByPlayer`, a level per castle, a cap, and the same "the panel names its blocker" contract the
gatherer rows use (`GATHERER_SPEED_UPGRADE_PRICE` / `GATHERER_MAX_SPEED_LEVEL` are the shape to copy).

## Why this addendum lives here

`CASTLE_BUILD_SPACE_DESIGN.md` is the castle document and is already marked
`OWNER-RULED 2026-08-10, NOT IMPLEMENTED` for its own §1 rulings, so it is the natural home for a
second castle ruling that is also not yet implemented. The colour→race map is the part most likely to
be misremembered, which is why it is a table.
