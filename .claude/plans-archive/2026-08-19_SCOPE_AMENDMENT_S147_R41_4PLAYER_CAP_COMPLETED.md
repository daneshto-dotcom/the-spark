# SCOPE AMENDMENT — S147 · R41 (4-PLAYER CAP) + R42 (DASHBOARD) + S148 (ZONES)

**STATUS: COMPLETED** (stamped S159 P4) — P2 (R41 cap + R42 dashboard) shipped at `a23510d`, and P3, the part this line said was NOT STARTED, shipped as **S148 P1**. Evidence, re-probed at the stamp: the zone partition is `src/state/zones.ts` (11 KB) with `zones.test.ts` + `zones.fixtures.ts`; **anchors** are `zoneCastleAnchor` feeding `castleAnchor` (`zones.ts:13`, flagged there as HASHED GEOMETRY); **legality** is `buildLegalityGates.test.ts` (16 KB); and the **economy re-tune** is `constants.ts:513` — *"S148 P1 — RAISED 1.9 -> 2.6 BECAUSE THE ZONE PARTITION MOVED THE CASTLES"* — measured over five seeds by `src/state/gatherers/zoneEconomy.test.ts`. Nothing in P3 is outstanding.

**Status: APPROVED** (owner, 2026-08-19: *"sure lets run it why not if we have context. get to work"*)
Tier: **FULL** · Parent PDR: `.claude/plans/2026-08-16_PDR_S147_MATCH_CLOCK.md` (P1 shipped at `4e586ee`)
**Rule 16** — this expands scope beyond the approved S147 batch, so it gets its own amendment.

---

## 1. WHAT THE OWNER ADDED

Verbatim: *"remember the quadrants for the different modes of the game. remember that each quadrant
also has a wall during the build stage. other than that castles and all other things should be in
their correct places. and from now on the game will be only upto 4 players so keep that in mind
because the dashboard screen including the game modes and bot modes and multiplayer/single needs to be
adapted to this new build"*

| # | New ruling |
|---|---|
| **R41** | ⭐ **THE GAME IS MAX 4 PLAYERS.** Today `MAX_PLAYERS = 6`, `MAX_BOTS = 6`, and VS-BOTS seats **seven** (human + 6 bots, `PLAYER_COLORS` has a 7th "Silver" entry, `KEEP_RING_SEATS = 7`). All of that comes down to 4. |
| **R42** | **THE DASHBOARD ADAPTS** — title-screen modes, bot modes, multiplayer/single, and the lobby seat rack all reflect the 4-seat cap. |
| **R45** | ⭐ **THE PALETTE IS A RACE/CLASS ROSTER, NOT A SEAT-COUNT PROXY.** Owner, correcting me mid-build: *"its ok to have 6 colors with only 4 players max — in the future we said we'll make each color a class/race and give players an option to choose... during pregame lobby stage be able to chose your color."* So `PLAYER_COLORS` **stays at six** while `MAX_PLAYERS` becomes 4; the surplus entries are unchosen races, not dead seats. I had proposed cutting the palette to 4 — that was **wrong** and would have had to be undone later. The work is therefore **decoupling** seat-count from palette-size, never shrinking. Measured: the sim is already choice-ready (every consumer reads `player.color`, which rides the wire as `RosterEntry.color`), so the lobby picker itself is future work that nothing here forecloses. |
| R43 | Re-affirmed: quadrants per mode (1v1 = pitch, 2v2 / 4-FFA = quadrants); **each quadrant has a wall during BUILD**; castles at their correct extremities. |

**Ruling on R43's wall clause:** the walls stay **S149** as the roadmap has them, because they are
coupled to the gatherer-shelter mechanism (both are phase-toggled movement rules) and S148 is already
oversized. The zone BORDERS become visible in this amendment as the zone tint/divider so the partition
*reads* on screen; the invulnerable player-coloured wall object and the shelter rule land together next.
Flagged rather than silently dropped — say the word and I pull the wall visual forward.

---

## 2. SEQUENCING — THE CAP GOES **FIRST**, AND THAT IS NOT ARBITRARY

**P2 = R41 + R42 (the cap + dashboard). P3 = S148 (zones + anchors + legality + economy).**

The cap is a *precondition* for the zone work, not a parallel chore:
- `QUADRANTS_4P` has exactly four zones. With `MAX_PLAYERS = 6` the partition is incoherent — seats 4
  and 5 would own no zone, and `zoneOwner(seat)` would have no total answer.
- `castleAnchor` currently divides by `KEEP_RING_SEATS = PLAYER_COLORS.length = 7`. Cutting the roster
  first means the anchor rewrite in P3 only ever has to satisfy 2 and 4 seats.
- Doing zones first would mean writing `zoneOf`/`zoneOwner` twice.

Each priority ships independently green, with its own commit, deploy and CHECK.

---

## 3. PROTOCOL — TWO BUMPS, ONE PER PRIORITY

`PROTOCOL_VERSION 23 → 24` (P2) and `24 → 25` (P3). Both are genuine wire changes:
- **P2** lowers the cap inside wire VALIDATORS (`validateRoster` rejects `> MAX_PLAYERS`;
  `parseHostAttest` caps `seats.length`). A v23 peer could offer a 5–6 seat roster a v24 host refuses.
- **P3** changes `castleAnchor`, which `protocol.ts:106-109` already records as **"A SHARED CONSTANT
  BOTH PEERS COMPUTE FROM"** — the client calls it to draw and hit-test every keep. It forced 16→17
  once already for exactly this reason.

Per the owner's standing bump policy (*"ALLOW TWO BUMPS, spread out. Each bump gets its own deploy +
2-peer check"*), two bumps is inside the authorised allowance. SPARK has no external playerbase, so the
real cost is the owner reloading twice.

---

## 4. A.0 STATE-DISCOVERY — PRIME-AUDIT DELTA TABLE

Method: hand-run targeted probes (the S147 lesson — an 8-probe Workflow lost 7 probes to the spend
limit, and hand-work was cheaper and fully self-verified). Every row cites a line read directly.

| # | Claim | Status | Actual | Consequence |
|---|---|---|---|---|
| **E1** | S148 spec: build legality wires into **"the three existing refusal sites"** | ⛔ **REFUTED — it is SIX** | `isInsideEnemyTerritory` is imported by `state/placePrimitive.ts:39`, `state/placeFromFree.ts:55`, `state/blueprintLegality.ts:35` (the three named) **plus `bots/botBrain.ts:24`, `input/controls.ts:58`, `input/dragPreview.ts:31`** | ⭐ **HIGHEST CONSEQUENCE.** Wiring only the three host refusals leaves the CLIENT PREVIEW and the BOTS on the old influence rule: the drag ghost would show "legal" exactly where the host refuses, which reads as a desync bug to the player, and bots would keep trying to build in territory the host now rejects. All six must move together. |
| **E2** | (unstated) the cap is a one-constant change | ⛔ **REFUTED** | `MAX_PLAYERS = 6` (`constants.ts:68`), `MAX_BOTS = 6` (`:71`), `PLAYER_COLORS` has **7** entries (`:66-79`, the 7th is bots-only Silver), `KEEP_RING_SEATS = PLAYER_COLORS.length` (`:421`). Non-test consumers span `net/` (hostHandlers, lobbyRoster, protocol×4 validators, quickmatch, session), `render/` (lobbyScreen, lobbyStateMachine, seatRack, lobbyGeometry, ui.ts:379), `state/`, and `dev/probeHarness`. | ~20 production sites plus the constants. `ui.ts:379` sizes a render pool by `PLAYER_COLORS.length` *specifically because* bots seat 7 — that comment becomes wrong and the pool over-allocates. |
| **E3** | (unstated) the lobby rack fits 4 seats | ⚠ **PARTIAL** | `lobbyGeometry.ts:22-31` is a **2 rows × 3 cols** rack (`SEAT_COLS = 3`), and `lobbyScreen.test.ts:310,338` assert row-major 2×3 by name. | The rack becomes **2×2**. This is real geometry + a named test, not a constant tweak — and this repo has a standing lesson about panel geometry that overflows silently while every test stays green. |
| **E4** | (unstated) tests are incidental | ⚠ **PARTIAL** | 15 test files reference the seat constants. Hard literals: `botsMode.test.ts:139` `expect(MAX_PLAYERS).toBe(6)`, `:148`/`:161` assert **7** distinct seats, `nplayerSeating.test.ts:72` asserts 6, `botSpawnerSeed.test.ts:73` asserts 6 spawners, `e2e/nplayer.spec.ts:227,233` assert 6 players. | Each is a deliberate re-pin, not a delete. `e2e/nplayer.spec.ts` is in the **gating** lane. |
| **E5** | `castleAnchor` is a contained sim helper | ⛔ **REFUTED** | **13 non-test consumers**, including three in `render/castlePanel.ts` (`:860,896,980`), two in `render/gathererRenderer.ts` (`:160,202`), `state/castleBank.ts:140`, `state/gameMode.ts:320,345`, `gathererLifecycle.ts:113,457`, and `main.ts:1058` (`keepCenter`). | It is shared host+client geometry, which is exactly why P3 needs the bump. Replacing it touches render hit-testing (`keepHitTest.test.ts`) as well as sim. |
| **E6** | The four modes exist as the notes describe | ✅ CONFIRMED | `titleScreen.ts` builds `btnSolo` (`:86`), `btn1v1` (`:98`), `btnVsBots` (`:111`), `btnCodex` (`:125`). | R42 adapts these four rather than inventing a flow. Matches the notes' own chart. |
| **E7** | Bot count is already ≤3 | ⛔ **REFUTED** | `botSetupOverlay.ts` picks **1..MAX_BOTS = 6** bots and defaults `botCount = 3` (`:47`). | Becomes 1..3 (human + 3 bots = 4). The default of 3 happens to become the maximum, so the overlay's own layout needs re-checking, not just its bound. |
| **E8** | The haul re-tune has a measurable seam | ✅ CONFIRMED | `GATHERER_BASE_SPEED = 1.9`, `GATHERER_SPEED_PER_LEVEL = 0.8`, `GATHERER_MAX_SPEED_LEVEL = 5` (`constants.ts:456-460`); `KEEP_RING_RADIUS = 420` (`:442`) is the current haul radius. | The corner anchors put the haul at ~1100 px. Measure, then raise base speed — do not guess (the standing lesson: `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` shipped wrong at 0.15 for exactly that reason). |
| **E9** | `territory.ts` can be deleted | ⛔ **REFUTED (and the spec agrees)** | `computeTerritorialInfluence` is called from `physics/physicsLoop.ts:70`; `computeTerritorialRadius`/`computePlayerComplexity` from `render/debugOverlay.ts:27`. | The MODULE stays. Only the `isInsideEnemyTerritory` *predicate* is swapped at its six call sites. |

**Blocking questions: NONE.**

---

## 5. SCOPE

**P2 — R41 + R42.** `MAX_PLAYERS 6→4`, `MAX_BOTS 6→3`, `PLAYER_COLORS` 7→4 entries (Silver retired
with a recorded reason), `KEEP_RING_SEATS` follows. Wire validators, lobby seating, lobby rack 2×3→2×2,
seat rack, `ui.ts` pool, bot-setup bound 1..3, title/dashboard copy. Protocol 23→24. Re-pin the 6
literal test assertions. **No zone work.**

**P3 — S148.** New `state/zones.ts` (`ZoneLayout`, `zoneOf`, `zoneOwner`, `zoneCastleAnchor`),
`PITCH_2P` (vertical split at x=960; goalmouth castles at `(120,540)`/`(1800,540)`) and
`QUADRANTS_4P` (splits at x=960/y=540, clock order per R2; corner castles inset ~130 px). `layout` on
`World`, hashed. `castleAnchor` → zone-derived. `canBuildAt` swapped in at **all six** E1 sites.
Measured economy re-tune. Protocol 24→25.

**OUT:** border walls + gatherer shelter (S149), castle HP/guns (S150), towers/projectiles/goblins
(S151-153). **CF1** stays open.

---

## 6. EXIT GATES

**P2:** `tsc` 0 · full vitest · `e2e:gating` · a 4-seat bots match starts and seats exactly 4 · a 5th
peer is refused at the lobby · rack renders 2×2 with no overflow · `verify-deploy` 4/4.

**P3:** both layouts give total, correct `zoneOf` at borders and dead centre · every seat a distinct
zone · anchors inside their own zone · cross-zone build refused at all six sites (host **and** preview
**and** bots agree) · host/worker/promoted-successor agree bit-for-bit on anchors · a first tower is
affordable inside one 90 s BUILD on both boards · `verify-deploy` 4/4.
