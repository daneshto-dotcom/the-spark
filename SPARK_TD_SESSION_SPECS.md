# SPARK TD — PER-SESSION BUILD SPECS

**Companion to `SPARK_TD_BLUEPRINT.md`.** The blueprint holds the *design* and the 36 owner rulings.
This holds the *build*: for every session, exactly what changes, where, how it is proven, and what
must be true before the next session starts.

**Written to be executed autonomously.** Every open question has a concrete answer. Answers the owner
ruled are marked **[OWNER]**; answers I chose so execution is never blocked are marked
**[CLAUDE — overridable]** and can be reversed at any point without re-planning.

---

## 0. GROUND RULES FOR EVERY SESSION

Non-negotiable, applied identically in all eleven:

1. **Determinism first.** Any new `World` field is serialized, hashed, and registered in
   `FIELD_COVERAGE` (`stateHashFull.ts`). That registry is a *forcing function* — omitting a field
   fails `tsc`. It caught a real miss this session, so trust it and never route around it.
2. **Never `Math.random()` in sim code.** Draw from a seeded `mulberry32` stream (`spawner.ts`
   precedent). A client-side draw desyncs every peer instantly.
3. **Never wall-clock time in sim code.** Everything is derived from `world.tick`. 90 s = **5400
   ticks** at 60 Hz.
4. **No-op, never throw.** Reducers refuse invalid input by returning `world` untouched
   (`applyPullFromBank` is the reference). A throwing reducer kills the host dispatch loop.
5. **Run `tsc` before believing a new test.** vitest does **not** typecheck; assertions can run green
   against `undefined`. This has bitten twice.
6. **Every session ends shippable:** `npm run build` · `tsc` 0 · full vitest · `e2e:gating` ·
   push · `verify-deploy` 4/4.
7. **Protocol bumps are deliberate.** Any wire-shape, intent-payload, or shared-constant change bumps
   `PROTOCOL_VERSION` and updates `LOCAL_PROTO_V` in `e2e/smoke.spec.ts`
   (`protocolVersionSync.test.ts` enforces the pair).

### Reference constants already in the codebase

| Constant | Value | Relevance |
|---|---|---|
| `PHYSICS_HZ` | 60 | 90 s = 5400 ticks |
| `CANVAS_WIDTH` × `HEIGHT` | 1920 × 1080 | the field |
| `SPAWNER_CENTER_*` | 960, 540 | quarry centre |
| `SPAWNER_RADIUS` | 125 | quarry radius |
| `KEEP_RING_RADIUS` | 420 | **being replaced** by zone-derived anchors |
| `PHASE_1_WIN_SCORE` | 1500 | the owner's exact number, already shipped |
| `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` | 0.05 | the income rate |
| `GATHERER_SPEED_PER_LEVEL` / `MAX_SPEED_LEVEL` | 0.8 / 5 | speed upgrades — why the shelter rule must be speed-independent |
| `CASTLE_PORCH_SLOTS` | 4 | porch capacity |

---

## 1. EVERY OPEN QUESTION, ANSWERED

So no session stalls waiting on a decision.

| # | Question | Answer |
|---|---|---|
| Q1 | Shape → goblin mapping | **[CLAUDE — overridable]** Each shape reads as its unit: **Dot → suicide** (smallest, simplest, pops) · **Line → archer** (a line is an arrow) · **Triangle → swordsman** (a blade) · **Square → shield goblin** (a shield) · **Circle → hound** (rolls, runs) · **Spiral → bat rider** (spiral = flight). |
| Q2 | How is "gatherers are in 1 s before the walls drop, whatever their speed" guaranteed? | **[CLAUDE — overridable]** Do **not** race pathfinding against the clock. At exactly `phaseEndsAtTick − 60`, every gatherer unconditionally enters `SHELTERED`: removed from the field, cargo auto-deposited. Deterministic, speed-independent, and impossible to fail. Nothing can attack during BUILD, so the snap is unobservable as unfairness. |
| Q3 | Castle HP / defence / attack numbers | **[CLAUDE — overridable, first pass]** HP **3000**; attack range **300 px**; damage **8** per shot; fire interval **45 ticks**. Identical for every player (R29). All four are playtest dials. |
| Q4 | Castle targeting rule | **[OWNER, from the notes]** *"castle attacks any enemy units that attack it"* → **retaliation-only**. Concretely: it acquires any enemy unit in range that has damaged this castle **within the last 300 ticks (5 s)**; timer length is **[CLAUDE — overridable]**. |
| Q5 | Do walls block projectiles? | **[OWNER — R37/R38] CORRECTED.** Only ENEMY structures block; your own are transparent to your fire.  My first answer conflated two kinds of wall. **PHASE BORDER WALLS** are down before the first shot, so they never meet a projectile — that half stands. **PLAYER-BUILT WALLS AND STRUCTURES** stand through the FIGHT and **do** block: 2D, no height, so a projectile hits the first thing in its path, damages it and vanishes; the next shot repeats. Enemy fire must chew through your fences to reach what is behind them. |
| Q6 | Do walls block gatherers reaching the quarry? | **No, by geometry.** Walls run from the quarry rim *outward* along the zone borders, so every zone has unobstructed access to its own slice of the quarry. |
| Q7 | The 2.6× haul re-tune | **Measured, not guessed** (S148). Instrument one build stage and set the gatherer base speed so a first 4-connector tower is affordable inside one 90 s BUILD. |
| Q8 | Footer connector range | **Derived from the recipe registry, never hardcoded.** Shipped recipes span 4–9 shapes (stink 4 · pentagram 5 · lightningHub 6 · helga 7 · turret 7 · voltkin 8 · NONET 9). |
| Q9 | ⚠ **R15 vs R24 conflict** | R15 said *"simple towers for our archer and melee goblins"* (plural); R24 said **one** tower producing all six by shape. **R24 supersedes** — later and more specific. **One goblin tower, six outputs.** Flagged rather than silently resolved. |
| Q10 | Tower dormancy — do towers keep HP through BUILD? | **[CLAUDE — overridable]** Yes. Damage persists across the cycle; that is what makes FIX (S152) matter. |
| Q11 | Default target preference for a new tower | **[CLAUDE — overridable]** `NEAREST` — the current behaviour, so an unset tower behaves exactly as today. |
| Q13 | Can tower orders be changed DURING the fight? | **[OWNER — R40] YES.** R26 already lets you feed the goblin tower mid-fight, so commanding mid-fight is the symmetric case — and without it the fight stage is something you watch rather than play. Re-targeting is a command, not a build, so it is not covered by "building stops". |
| Q12 | Does the match start in BUILD? | **[CLAUDE — overridable]** Yes, a full 90 s BUILD, so nobody is attacked before they can build. |

---

## 2. THE SESSIONS

---

### S147 · THE MATCH CLOCK ✅ SHIPPED S147 (protocol 23) — live

**Objective.** Give the sim a deterministic two-phase heartbeat, and nothing else. Both Council seats
picked this first: *if temporal state is unstable, nothing built on it can be trusted.*

**Step 0 — subtractive warm-up (R14/R23).** Switch OFF potato bomb, regular bomb, seagull, rainbow:
set their spawner cadences to zero behind a named constant. **Retain all code.** Update the specs that
assert they spawn. This removes four moving parts before the clock has to be proven against them.

**Data model** (`worldTypes.ts`, `world.ts`):
```ts
export type MatchPhase = 'BUILD' | 'FIGHT';
matchPhase: MatchPhase;      // starts 'BUILD' (Q12)
phaseEndsAtTick: number;     // world.tick + PHASE_DURATION_TICKS at each edge
```
`constants.ts`: `PHASE_DURATION_TICKS = 90 * PHYSICS_HZ` (5400).

**Behaviour.** In `hostTick`, after the physics step: if `world.tick >= world.phaseEndsAtTick`, flip
the phase and set the next deadline. Emit a `PHASE_CHANGED` effect for renderer/audio.

**Scoring gate (R3/R7/R16).** `tickScoring` runs **only** when `matchPhase === 'FIGHT'`. One guard,
one call site. The income engine itself is already correct — see the blueprint's A.0 finding.
Also switch off the anti-coast leader decay (R28) behind a constant.

**Determinism.** Both fields serialized + hashed + in `FIELD_COVERAGE`. `phaseEndsAtTick` is
host-authoritative and rides the snapshot so a joiner cannot disagree about the deadline.

**Protocol.** Bump — two new hashed snapshot fields. Update `LOCAL_PROTO_V`.

**UI.** HUD: phase name + seconds remaining, from ticks.

**Tests.** Unit: phase flips exactly on the boundary tick; score is 0 across a whole BUILD and rises
across a whole FIGHT. Differential: BUILD→FIGHT→BUILD with identical hashes host-vs-worker.
E2E: the HUD countdown advances and the label flips.

**Exit gate.** Differential cycle passes; a host migration across a phase edge preserves phase and
deadline; score 0 in BUILD, rising in FIGHT.

**Traps.** `Date.now()` anywhere here is the desync. `FIELD_COVERAGE` will fail the build if the
projection is forgotten — that is a feature, and it already caught exactly this mistake once.

---

### S148 · ZONES, CASTLE ANCHORS, BUILD LEGALITY ⚠ PARTLY SHIPPED S148 — zones + anchors + economy LIVE (protocol 25); BUILD LEGALITY NOT WIRED

**Objective.** Replace the polar ring with a real zone partition, and confine building to your own zone.

**Data model** (`src/state/zones.ts`, new):
```ts
export type ZoneLayout = 'PITCH_2P' | 'QUADRANTS_4P';
export function zoneOf(pos: Vec2, layout: ZoneLayout): number | null;  // null = the quarry
export function zoneOwner(seat: number, layout: ZoneLayout): number;
export function zoneCastleAnchor(seat: number, layout: ZoneLayout): Vec2;
```
- `PITCH_2P` — one vertical split at x=960. Zone 0 = left, 1 = right. Castles in the **goalmouths**:
  `(120, 540)` and `(1800, 540)`.
- `QUADRANTS_4P` — split at x=960 and y=540, clock order (R2): zone 0 = 9–12 (top-left), 1 = 12–3
  (top-right), 2 = 3–6 (bottom-right), 3 = 6–9 (bottom-left). Castles at the **outer corners**, inset
  ~130 px: `(130,130) (1790,130) (1790,950) (130,950)`.
- `layout` lives on `World`, set at match start from the player count. 3 players → `QUADRANTS_4P`
  with one zone unowned (R2).

**Replace** `castleAnchor()` in `gatherers/gatherer.ts` with the zone-derived anchor. ⚠ This is
**hashed state** — gatherer spawn positions derive from it and host migration rebuilds from a mirror,
so host, worker and a promoted successor must agree bit-for-bit.

**Build legality (R17 scoped).** A new predicate `canBuildAt(world, playerId, pos)` = `zoneOf(pos) ===
zoneOwner(seat)`. ⛔ **CORRECTED S148 — IT IS SIX SITES, NOT THREE.** Measured on disk: the three
host refusals `placePrimitive.ts`, `placeFromFree.ts`, `blueprintLegality.ts` **plus**
`bots/botBrain.ts`, `input/controls.ts` and `input/dragPreview.ts`. Wiring only the first three
leaves the CLIENT DRAG GHOST and the BOTS on the old territory rule, so the ghost shows "legal"
exactly where the host refuses — which a player reads as a desync bug, not a rule. Original
wording, now known wrong, listed only — `placePrimitive.ts:125`,
`placeFromFree.ts:173`, `blueprintLegality.stampRefusalAt`. The territory-influence predicate is
retired from those sites; `territory.ts` itself stays for its other consumers.

**Economy re-tune (Q7).** ⛔ **CORRECTED S148 — THE ~1100 px FIGURE WAS NEVER A MEASUREMENT.**
Measured quarry-rim-to-castle: **295 px → 800.7 px on QUADRANTS_4P (2.71×)** and 715 px on
PITCH_2P (2.42×). The *ratio* in this spec was right; both absolute numbers were not, and the
wrong one propagated through two handoffs before being caught. Instrument one BUILD stage; raise the
gatherer base speed until a 4-connector tower is affordable within it. **Measure, do not guess** —
this is the item Council flagged as unsettled by evidence.

**Protocol.** Bump — `layout` is a shared constant both peers compute geometry from.

**Tests.** Unit: `zoneOf` is total and correct at boundaries and dead centre; anchors are inside their
own zone; every seat gets a distinct zone. Legality: a build one pixel across the border is refused;
one pixel inside is allowed. E2E: a 4-player and a 2-player match each fund a first tower in one BUILD.

**Exit gate.** Both layouts produce correct zones and anchors; cross-zone building is refused at all
three sites; the economy funds a first tower in one build stage on both maps.

---

### S149 · BORDER WALLS + GATHERER SHELTER

**Objective.** Seal the zones during BUILD, open them for FIGHT, and guarantee no gatherer is ever
caught outside.

**Walls.** Derived geometry, not entities: for each interior border segment (from the quarry rim
outward to the field edge), each adjacent player owns a strip in **their own colour** (R-notes).
Present only while `matchPhase === 'BUILD'`; **invulnerable** (R5). Because they exist only when
nothing can attack (Q5), they need no HP, no damage handling and no projectile interaction — they are
a movement barrier and a visual. Blocking is enforced in the same movement clamp that already keeps
sparks in bounds.

**Gatherer shelter (R6/R12, mechanism Q2).** New `GathererState` value `SHELTERED`.
- At `world.tick === phaseEndsAtTick - 60` (T−1 s), **every** gatherer enters `SHELTERED`
  unconditionally: removed from the field, any carried cargo auto-deposited to the inventory.
- At the FIGHT→BUILD edge they leave `SHELTERED` at their castle and resume.
- Speed-independent by construction, so upgrades can never break the invariant.
- ⚠ Keep the case handler even once unreachable-by-normal-play — a unit can arrive in any serialized
  state from an old save. (This exact mistake was avoided in S146 for `WAITING`.)

**Unit blocking (R39).** Ground units are blocked by structures and must chew through or path
around them — unlike projectiles, which simply stop. A wall is therefore a real barrier to armies as
well as armour against fire. **[CLAUDE — overridable, derived from R38's friendly-transparency
principle]:** a unit is NOT blocked by its **own** side's structures, so a player can never wall their
own army in. Movement blocking reuses the same clamp that keeps sparks in bounds.

**Quarry (R22).** The spawner produces during BUILD only.

**Tests.** Unit: at T−60 every gatherer is `SHELTERED` at every speed level 0–5, from every distance
including the far corner. Cargo is conserved. Walls present in BUILD, absent in FIGHT. E2E: run a full
cycle and assert no gatherer is ever outside at a wall-drop.

**Exit gate.** Zero gatherers outside at any wall-drop, at any speed level; no cargo lost.

---

### S150 · THE CASTLE BECOMES REAL — HP, GUNS, ELIMINATION, PLACINGS

**Objective.** Turn the castle from drawn scenery into a real entity — one that can shoot, can be
destroyed, and whose destruction ends a player's match. This is the session where both win conditions
become real and the game first matches the notes.

⚠ Contains the **castle weapon system**, which audit pass 1 missed entirely because it comes from the
notes rather than a numbered ruling.

**Castle entity.** Promote the castle from drawn scenery to a `World` entity: `castles: Map<PlayerId,
Castle>` with `{ hp, maxHp, lastDamagedByTick, nextFireTick, alive }`. Damage flows through the
**existing** `state/damage.ts` pipeline. **Generates no points** (R29).

**Weapon system.** Arms at BUILD→FIGHT, stands down at FIGHT→BUILD. **Retaliation-only** (Q4): targets
any enemy unit in range that damaged this castle within 300 ticks. Reuses the defender FSM shape
(IDLE/WINDUP/FIRE/RECOVER) rather than inventing a second combat state machine. Stats per Q3,
identical for all players.

**Elimination + placings (R10/R20).** Castle at 0 HP → that player is eliminated: their towers and
units are removed, their zone becomes neutral ground. Last one standing wins. **1500 points is an
instant win** (R20). Remaining places ordered by final score. Eliminated players may spectate.

**Protocol.** Bump — `castles` is a new hashed snapshot family.

**Tests.** Unit: castle takes damage, dies at 0, eliminates its owner; retaliation targets only recent
attackers; both win conditions fire; a 4-player match yields a full 1st–4th ranking.

**Exit gate.** Both win conditions verified; full ranking produced; **this is the session the game
first becomes the game in the notes.**

---

### S151 · TOWERS COME ALIVE + TARGET PREFERENCE

**Objective.** Towers act only in FIGHT, and act on your orders.

**Dormancy (R4).** Defender FSM ticks only while `matchPhase === 'FIGHT'`. HP persists across the
cycle (Q10).

**Target preference (R1/R8/R31).**
```ts
type TargetPreference =
  | { kind: 'NEAREST' }                 // default (Q11)
  | { kind: 'PLAYER'; seat: PlayerId }
  | { kind: 'STRONGEST' } | { kind: 'WEAKEST' };
```
Stored on the defender, serialized + hashed. New client intent `SET_TOWER_PREFERENCE`, routed through
the same `dispatchFn` seam every other panel control uses. **All-vs-all** means any player is a legal
target (R1). Ties broken by lowest entity id — never RNG.

**Range crosses borders (R9).** Once the walls are down, acquisition is purely `attackRange`; zone
membership does not restrict targeting. This is what makes placement a real decision.

**Protocol.** Bump — new intent + a new hashed defender field.

**Tests.** Unit: each preference selects the right target; ties are deterministic; a dormant tower
fires zero shots across a whole BUILD. E2E: a border tower demonstrably strikes into a neighbouring
zone; a castle-ringed one demonstrably cannot.

**Exit gate.** All four preferences behave; dormancy holds; cross-border reach demonstrated.

---

### S152 · FIX + SCRAP (R13/R19/R21)

**Objective.** Give towers an attrition economy so persistence across cycles (R13) becomes a decision
rather than just a fact — repair what is worth keeping, strip what is not.

**FIX.** Build-stage only (R19). For a damaged structure, compute the shapes it has lost (blueprint
bill minus surviving primitives). If the inventory covers the shortfall, one click consumes exactly
those shapes and restores the structure. Otherwise refuse — no partial repair.

**SCRAP.** Build-stage only. Tear a structure down; **only the shapes still standing** return to
inventory (R21). Destroyed ones are gone, so scrapping can never launder damage.

**Intents.** `REPAIR_STRUCTURE`, `SCRAP_STRUCTURE`. No-op-never-throw. Protocol bump.

**Tests.** Inventory conservation is the headline: fix-then-scrap round-trips must conserve shapes
exactly, with **no duplication** — assert on total counts, not on individual ids.

**Exit gate.** Round-trip conservation proven; both refuse correctly outside BUILD.

---

### S153 · TRAVELLING PROJECTILES + THE GOBLIN TOWER (R18/R24–R26, R31–R35)

**Objective.** Give the fight stage moving armies, and give SPARK its first travelling projectile —
the one genuinely new piece of technology in the whole roadmap.

The largest session. **Two deliverables, in this order.**

#### 153a — the projectile system (R35), built FIRST as infrastructure

Every attack in SPARK today is instant-hit; there is **no precedent** for a travelling projectile, and
the owner has more ranged units planned — so this is infrastructure, not the archer's private feature.

```ts
projectiles: Map<ProjectileId, {
  id; ownerPlayerId; pos; vel; damage; radius;
  spawnedAtTick; expiresAtTick; targetKind;
}>
```
**⭐ FIRST-BLOCKER COLLISION, NOT SEEK-THE-TARGET (R37/R38).** A projectile is stepped in `hostTick`
and hits **the first ENEMY entity along its path** — a primitive, a bond/fence connector, a tower, a
unit, a castle. It damages that entity and is **removed**. It does not pass over, through or around
anything: SPARK is 2D with no height axis.

**Friendly entities are transparent (R38)** — the sweep considers **enemy entities only**, so your own
base can never shadow your own guns. This is also a real simplification: no friendly-fire arbitration,
and a smaller candidate set per sweep.

Implementation: swept-segment test from `pos` to `pos + vel*dt` each tick against candidate entities,
taking the **nearest** intersection along the segment (never the first found in map order — that
would make the result depend on iteration order and desync). Ties broken by lowest entity id.

Consequence to build for, not against: this is what turns R17's plain shape-walls into **armour**, and
it means firing lines are a genuine part of where you place a tower.

All fields hashed; ids from a world-level allocator (`nextProjectileId`).

**Its own differential test before a single goblin uses it** — spawn tick, velocity and lifetime are
all hashed state.

#### 153b — the goblin tower

- A **4-connector** tower. Feeding it a shape queues **one goblin of that shape's type** (R24, mapping
  Q1). Feed during BUILD *or* FIGHT; **the whole queue emerges at the next FIGHT start** (R26).
- **Plus 1 random goblin per round** (R32) — drawn from the **seeded host stream**, never
  `Math.random()`.
- **Orders live on the TOWER** (R31): goblins inherit their spawner's `TargetPreference`. This is the
  entire reason to own several goblin towers, so it is not optional polish.
- Survivors **return into their tower** between rounds (R34).
- Six stat spreads, all weakest-class (R25). Starting values **[CLAUDE — overridable]**:

| Goblin | Shape | HP | Attack | Speed | Note |
|---|---|---|---|---|---|
| Swordsman | Triangle | 8 | 4 | med | the baseline |
| Archer | Line | 5 | 3 | med | ranged — uses 153a |
| Shield | Square | 20 | 1 | slow | very high HP, still under Voltkin/HELGA |
| Hound | Circle | 5 | 4 | fast | low defence |
| Suicide | Dot | 4 | 12 blast | med | contact bomber, **~half** the drone tower's radius (R33) |
| Bat rider | Spiral | 6 | 2 | fast | decent defence |

**Protocol.** Bump — new projectile + goblin families, new intent.

**Tests.**
- *Projectile (before any goblin uses it):* a differential test proving spawn tick, travel, hit and
  expiry are identical host-vs-worker; a projectile that hits nothing expires exactly on its lifetime
  tick.
- *First-blocker (R37/R38):* a projectile fired at a distant tower **with an ENEMY wall in between
  hits the WALL**, not the tower, and is removed. The mirror case is asserted too: **a FRIENDLY wall
  in the path is ignored** and the shot reaches the enemy behind it. Repeated fire chews through the wall and only then reaches
  the tower. Nearest-intersection is asserted explicitly, so a regression to map-iteration order —
  which would desync — fails loudly.
- *Mapping:* each of the six shapes produces exactly its mapped goblin (Q1), asserted per shape so a
  future edit cannot silently re-map one.
- *Queue:* shapes fed during FIGHT emerge at the **next** fight start, not immediately (R26).
- *Randomness:* the per-round random goblin is drawn from the seeded stream — same seed, same goblin,
  every run. This is the test that catches a `Math.random()` creeping in (R32).
- *Orders:* goblins inherit their spawning tower's preference, and two towers with different
  preferences produce differently-targeted broods (R31) — the test that proves multiple goblin towers
  are actually worth building.
- *Persistence:* survivors return into their tower and are still alive next cycle (R34/R27).

**Exit gate.** A projectile fires, travels, hits and expires identically host-vs-worker; all six
goblins spawn from their shapes, obey their tower's orders, and persist across a cycle per R27.

---

### S154 · TOWER ROSTER REWORK (R15 as amended by Q9)

**Objective.** Make every shipped recipe coherent in a phased tower defence. Today's roster was
designed for a continuous free-build game, and some of it no longer has a job.

**The roster, and its verdict** (each is a small, contained change):

| Recipe | Shapes | Verdict |
|---|---|---|
| Stink tower | 4 | Keep as the cheap defensive baseline. |
| Pentagram | 5 | Spawner — re-frame as an offensive unit source, phase-gated. |
| Lightning hub | 6 | Spawner — same treatment. |
| Laser turret | 7 | ⭐ **Make offensive** (R15): may acquire enemy **towers** in range, not only creatures. |
| HELGA | 7 | Keep; she already walks to a target, which now reads as a raider. |
| Voltkin | 8 | Keep; R27 already describes its lifetime/respawn loop as the model for timed units. |
| **Goblin tower** | 4 | **New in S153** — one tower, six outputs (Q9). |

**Work.** Widen defender target acquisition from creature-only to an entity-kind set per recipe
(`targets: ('creature'|'defender'|'castle')[]` on `DefenderConfig`), so "offensive vs defensive" is a
data property rather than six bespoke code paths. Laser turret gets `['creature','defender']`.

**Tests.** Unit: each recipe's `targets` set is honoured — a defensive tower ignores an enemy tower in
range; the laser turret engages it. Regression: no recipe silently loses its existing behaviour
(assert each kind's target set explicitly, one test per kind, so a future edit cannot widen one by
accident).

**Exit gate.** Every shipped recipe has a stated role and an explicit `targets` set; no recipe is a
dead prop; full suite green.

### S155 · THE FOOTER BAND + GATHERER PREFERENCE MENU (R36)

**Objective.** Make the build surface readable, and surface the two preference controls the sim
already supports.

**Footer, indexed by connector count (R36).**
- The bar shows only the **numbers** present in the recipe registry — derived, never hardcoded (Q8).
- Clicking a number opens that complexity's build menu; each entry is enabled the moment the castle
  inventory covers its recipe, reusing the shipped `castleStructuresModel` affordability logic
  (cost / `missing[]` / "NEED n MORE") rather than a second implementation that can drift.
- Purely presentational: **no new sim state, no protocol bump.**

**Castle panel** stays inventory-only (shipped S146).

**Gatherer preference menu.** Click a gatherer → a small castle-style panel with one toggling line:
`PREFERENCE: CLOSEST → TRIANGLE → SPIRAL → …`. It writes the existing, already-serialized
`preferredType` through the existing intent seam. **No new sim state.**

**Tests.** Render: the footer lists exactly the registry's distinct connector counts, ascending; a
number with no affordable recipe still renders but its entries are disabled; the panel geometry fits
the plate at every count (the S140 lesson — a strip whose width tracked a growing constant overflowed
silently with every test green). E2E: click a number, the menu opens; click a gatherer, the preference
cycles and the sim's `preferredType` actually changes.

**Exit gate.** Footer renders from the registry with no hardcoded numbers and no overflow at any
count; the gatherer preference round-trips to sim state.

### S156 · MODES & TEAMS

**Objective.** Turn the four modes in the notes into real, selectable match configurations.

**Modes** (the notes' own flow chart): **1)** Multiplayer → 1v1 · 2v2 · 4-player deathmatch ·
**2)** Single player (solo sandbox, "try things out") · **3)** vs Bots · **4)** Codex.
Note 2 and 3 are **separate entries** in the notes, not one combined "solo vs bots".

**Board selection.** 1v1 → `PITCH_2P`. 2v2 and 4-FFA → `QUADRANTS_4P`. Three players →
`QUADRANTS_4P` with one zone unowned (R2).

**Teams.** A `teamOf(seat)` mapping on `World`, serialized + hashed. In 2v2 teammates sit in
**adjacent** quadrants (R11). Team membership does two things and no more:
- **gates targeting** — a tower's preference may not resolve to a teammate, and area damage does not
  hurt allies;
- **shares the win condition** — a team wins when the last surviving castle(s) are theirs, or when a
  member reaches 1500 (R20).
FFA is simply the degenerate case where every seat is its own team, so there is **one** code path.

**Protocol.** Bump — `teamOf` is hashed state both peers compute targeting from.

**Tests.** Unit: FFA-as-singleton-teams is behaviourally identical to today's all-vs-all (this is the
test that proves the unification did not change FFA); a tower refuses a teammate target; a team win
fires when the last enemy castle falls. Boards: each mode selects the right layout; 3 players leaves
exactly one zone unowned.

**Exit gate.** All four modes launch on the correct board; team targeting and the shared win condition
hold; FFA is provably unchanged.

### S157+ · THE BALANCE PASS (R30)

**Objective.** The full unit + player stat rethink the owner called for once the mechanics are real —
*"we will need to rethink the player and unit stats of this new game state."* Deliberately last:
balancing before the loop exists would be balancing a different game.

**Scope.**
- Every unit and tower stat re-derived against the 90 s / 90 s rhythm rather than inherited from the
  continuous game.
- Castle HP / defence / attack upgrades bought with shapes (R29) — the spec the owner deferred.
- Per-race castle weapon systems and the unique colour/style/race identity from the notes.
- Art for the new roster (six goblins, the goblin tower, the border walls).
- The first-pass numbers in Q3 and S153 are the starting point, not the answer.

**Method.** Balance from **measurement**, not opinion: instrument a full match, record income curves,
time-to-first-tower, tower survival rate and average match length, then tune one dial at a time. This
project has a standing lesson that unplaytested tuning ships wrong — `SCORE_INCOME_PER_COMPLEXITY_PER_SEC`
went 0.15 → 0.05 for exactly that reason.

**Tests.** Regression-only: balance changes must not alter determinism. A replay recorded before a
tuning change must still produce an identical hash after it, unless the change is deliberately a sim
change — which is the tripwire that catches a "tuning" edit that was secretly a mechanic edit.

**Exit gate.** A full match plays end-to-end at a length the owner signs off on, with no dominant
single strategy in bot-vs-bot sampling.

---

## 3. DEPENDENCY ORDER — WHY THIS SEQUENCE

```
S147 clock ──► S148 zones ──► S149 walls+shelter ──► S150 castle ──► S151 towers ──► S152 fix/scrap
   │              │                                      │              │
   │              └── build legality needs zones          │              └── preference needs live towers
   │                                                      │
   └── every later phase-gated behaviour needs the clock  └── elimination needs castle HP

S153 projectiles+goblins ──► S154 roster ──► S155 UI ──► S156 modes ──► S157 balance
```

Each arrow is a hard dependency, not a preference. The clock is first because **six** later sessions
gate behaviour on `matchPhase`; zones are second because build legality, walls and castle anchors all
derive from the partition.

---

## 4. STANDING RISKS

| Risk | Mitigation |
|---|---|
| Phase clock desync | tick-derived only; differential test + migration-across-edge in S147's exit gate |
| `castleAnchor` replacement breaks migration | hashed-state parity test host / worker / promoted successor (S148) |
| The 2.6× haul makes BUILD unfundable | measured and re-tuned inside S148, not deferred |
| Projectiles are new tech with no precedent | built first and alone inside S153, with its own differential test |
| A `Math.random()` slips into the random goblin | called out in R32 and in ground rule 2 |
| Scope creep across eleven sessions | each session has one objective and one exit gate; anything else becomes a carry-forward |

---

## 5. STILL GENUINELY OPEN (does not block execution)

Every item here has a working default above; these are refinements the owner may want to revisit
after actually playing it.

1. Castle stat values (Q3) — first-pass numbers, expect to tune.
2. Goblin stat spreads (S153) — same.
3. Whether plain non-recipe structures should physically **block movement**, not just absorb damage.
4. Whether the retaliation window (300 ticks) is the right feel for castle guns.
5. Per-race castle weapon differentiation (deferred to S157+ by the notes themselves).
