# SPARK

### A Real-Time Multiplayer Game of Geometric Emergence

**Game Design Blueprint — Version 0.5.1**
*May 2026 · Status: Phase-1 complete + Phase-2 Tier-0 (1v1 Trystero/Nostr networked) + Phase-2 Tier-1 (Sever-as-disruption + multi-color bond rendering + audio + Voltkin godly) SHIPPED. Live at https://spark-online.space/. · v0.5.1 amends color/no-build rules*

### v0.5.1 Changes (Patch — Session 4)

Two clarifications surfaced during Phase-1 implementation. Neither is a schema or mechanic change — both make the user's intent explicit where v0.5 was ambiguous.

1. **Free building blocks are colorless; ownership is the only color.** § IV's "Color override" rule is amended: free-floating shapes in the spawner zone render in a neutral off-white. Type identity is communicated by **shape geometry** (the six distinct shapes already defined in § IV). When a player places a shape into a structure, it permanently inherits the placer's player color. This makes color = ownership only — type and ownership do not share the color channel. (See § IV, § VI.4.)
2. **No building inside the spawner zone.** § IX is amended with an explicit § IX.5: `PLACE_PRIMITIVE` is rejected when the carried shape's position is inside the spawner radius. The spawner zone is for spawning + collection only; building there would put the structure in the one always-visible-to-all-players region (§ III.4), collapsing the geographic trade-off (§ X.2). The connect-drag preview turns red and shows a "no-build" glyph when the cursor is inside the zone, so the rejection is never silent. (See § IX.5.)

---

## 0 · Document Status

This document is the canonical specification for the SPARK prototype. Decisions marked **LOCKED** are invariant — they are load-bearing and tuning them will collapse adjacent systems. Decisions marked **OPEN** are deliberately unresolved and must be settled before Phase 2. Decisions marked **DEFERRED** are out of scope for the prototype but reserved for v0.6+.

### v0.5 Changes (Major)

Version 0.5 supersedes v0.4 with four substantive additions. The first three are core mechanic changes; the fourth is a closure/reveal mechanic.

1. **Structures are immobile post-construction.** Once a primitive is placed, it cannot be picked up, dragged, or relocated. Multi-structure linking is now performed by building a **connector chain** of intermediate primitives between two structures. (See § VI.5, § VI.3.)
2. **Sparks are confined to the spawner zone.** Generated sparks remain within an invisible circular boundary at the canvas center. They do not drift outward. Players must travel into the spawner zone to collect them. (See § IX.)
3. **Fog of war.** The canvas is no longer full-vision. Players see a personal radius around their spark plus permanent vision beacons around each of their own structures. The rest of the canvas is dark. (See § III.4, § X.4.)
4. **Victory cinematic.** When the win condition triggers, the fog lifts entirely, all structures migrate to center, and they collapse in rank order — leaving the winner's "trophy" subgraph as the visual proof of their margin of victory. Provides closure for the no-HUD / fog-of-war information vacuum. (See § III.7, § XII.7.)

These changes interact: fog of war makes "build far" genuinely defensive (concealment), spawner confinement makes "build far" genuinely costly (longer trips), structure immobility makes mega-combo planning a real spatial commitment, and the cinematic closes the information loop without compromising the mid-game opacity.

---

## I · Vision

A real-time, six-player canvas of geometric emergence.

You are a single glowing spark on a black field. Six floating ingredients are confined to a glowing central spawner zone. You travel into the zone, grab one, return to your structure, combine — alone or in conflict with five other sparks — until one player's color claims the canvas.

**No HUD. No chat. No tutorial. No menu.** The game starts on launch. Discovery is the tutorial. Geometry is the language.

The aesthetic is minimalist — soft glow on black, beautiful gradients of multi-player ownership, fragile structures rotating and snapping into being, hidden bases revealed only by scouting. The lineage is *Powder Toy* meets *Townscaper* meets *Auralux*, with a layer of *StarCraft* fog over the top.

The feel is **tactile**. Mouse-only controls. Drag to attract, drag to connect. Every interaction is geometric, not symbolic.

---

## II · Core Loop

1. **Travel** to the central spawner zone.
2. **Grab** one spark from inside the zone (your carry limit is exactly 1).
3. **Return** to your structure (or build a new one anywhere on the canvas).
4. **Combine** the carried spark with your structure — connect primitives to form emergent shapes. Most magic pairings now work in **either** order (S98); the Triangle↔Circle pair stays directional (Wheel vs Star).
5. **Defend, Disrupt, or Scout.** Every 5 build actions earns 1 disruption charge (max 2 stored). Spend on enemies' structures, scout the canvas to find them, or keep building.
6. **Claim Area.** Complex, stable structures claim more canvas area per primitive.
7. **Win** when your color covers ≥ 51% of the canvas.

The loop is short, repeatable, and decision-rich at every step. Every trip is a 4-way trade-off:

- **Speed** (build close to spawner, fast cycles)
- **Safety** (build far, hidden by fog, harder to find)
- **Information** (scout enemy positions, gather intel, lose build time)
- **Pressure** (raid leaders to slow them, gain nothing direct)

---

## III · Locked Game Rules

### III.1 — Player Count [LOCKED]

**Exactly 6 players per canvas.** Asymmetric counts break the spawner economy and the central-resource competition density. Lobby fills to 6 or does not start.

### III.2 — Win Condition [LOCKED]

**Territory fill.** First player whose colored area-claim reaches **≥ 51% of canvas surface area** wins.

Area is computed from **claimed primitives × complexity multiplier** (see § VI). A simple Line claims `1 unit`; a stable rotating Circle-Triangle ring claims `5+ units`. Exact multiplier curve is **OPEN** (see § XIV).

There is no scoreboard. The only feedback on who is winning is **visual** — and with fog of war (§ III.4), even the visual signal is information-gated. A leader can hide their dominance from players who haven't scouted them.

When the win condition triggers, the **victory cinematic** plays — fog lifts, all structures migrate to center, and the rank order is revealed through sequential collapse (see § III.7).

### III.3 — Carry Limit [HARD INVARIANT — LOCKED]

**A player carries exactly 1 spark at any time.** Never more. Never less when active.

This single rule is **load-bearing** for every other system:

- It prevents hoarding inside the spawner zone (you cannot stockpile)
- It makes the central spawner contestable instead of a vending machine
- It makes travel time meaningful (each trip = 1 unit of progress)
- It naturally throttles build pace without an explicit cooldown
- It creates the build-vs-raid trade-off (every disruption is a build action you didn't make)
- It interacts cleanly with spawner confinement (§ IX): every primitive requires a round-trip into the central zone

**Do not tune this during playtesting. Tune everything else around it.** If a balance problem appears, the answer is never "let players carry 2."

### III.4 — Vision (Fog of War) [LOCKED — major change from v0.4]

**The canvas is fogged. Players see only:**

- A **personal vision radius** around their spark (radius OPEN, see § XIV)
- A **vision radius around each of their own structures** — permanent beacons
- The **spawner zone**, which is always visible to all players (it is the one common space; it must be visible because collection requires entering it)

Everything else is rendered with one of two states: **solid black** for areas you have never observed, or **dimmed/desaturated memory** for areas you have previously seen but no longer have in active vision (last observed state of any structures there).

**Why fog of war replaced full vision:**

- "Hiding far" now has real meaning — distant builds are genuinely concealed until scouted, not just expensive to reach
- Decoy structures become strategically meaningful (build false bases to mislead enemy scouts)
- Scouting becomes a real activity with real opportunity cost
- The "no leaderboard" rule combines with fog to create two-layer information asymmetry — even the visible signal is partial

**Vision uses memory-fog.** Once you have personally observed any structure, its location is remembered and rendered in a dimmed/desaturated style when out of current vision. Live state (color shifts, severs, new primitives) only updates when the structure is in your active vision radius. This is RTS-standard (StarCraft model) and was chosen over live-only fog because it preserves the disruption math: scouts pay the cost once per target, then can return to attack with knowledge intact.

**Vision overlaps additively.** When your spark approaches your own structure, the personal radius and the beacon radius overlap into one contiguous visible area. Multiple structures owned by you produce separate visible patches across the canvas. Walking between two of your own structures means traveling through fog between two islands of vision.

### III.5 — No HUD [LOCKED]

**No leaderboard. No score display. No minimap.** The only persistent UI elements are:

- The player's own carry indicator (what spark, if any, the player is holding)
- The player's energy gauge (small, peripheral)
- The player's disruption charge count (0, 1, or 2 dots)

All other game state is read **visually from what the canvas reveals to you** (§ III.4). The leader is identified by the colored area you can see. If you've scouted three of six players, you have partial information. If you haven't left your base, you have almost none.

This combines with fog of war to make information itself a strategic resource.

### III.6 — No Chat [LOCKED]

**All inter-player interaction is geometric.** No text, no voice, no emotes. Cooperation and conflict are signaled through positioning, building, attacking, or color-coded contributions when visible.

### III.7 — Victory Cinematic [LOCKED — added in v0.5]

When the win condition triggers (any player ≥ 51% canvas claim), gameplay halts and a closing cinematic plays. This is the **information reveal** — the answer to "what was happening on the canvas I couldn't see?"

**Sequence:**

1. **Fog lift (≈ 1 s).** Memory-fog and active fog dissolve simultaneously. The full canvas becomes visible — every structure, every color, every primitive — for the first and only time in the round.
2. **Migration (≈ 2 s).** All structures lift from their built positions and migrate toward canvas center. They retain shape, color, and topology during transit. (This deliberately violates § VI.5 structure immobility — it is a cinematic-state rule, not a gameplay rule. See § XII.7.)
3. **Sequential collapse (≈ 4 s).** Structures dissolve in ascending rank order — 6th place first, then 5th, 4th, 3rd, 2nd. Each non-winner's structure dissolves *fully* (every primitive erased to free sparks that fade to nothing).
4. **Trophy formation (≈ 1 s).** The winner's structure begins to dissolve, but stops when the remaining mass equals their **margin of victory over second place** (winner % − second %). The surviving subgraph is the **trophy** — the visual proof of margin.
5. **Hold.** The trophy sits at center against the now-revealed canvas backdrop. Game enters POSTGAME state, no input accepted, return to lobby after 10 s or on player action.

**Trophy selection rule [LOCKED]:** The surviving subgraph is the **most-recently-built contiguous region** of the winner's structure (highest `createdTick` values, grown greedily backward through time while maintaining connectivity). The trophy reflects late-game divergence — opening techniques converge across players (everyone learns the same magic-12 plays early), but late expansions are unique. Players who adapted, improvised, and committed late-round mega-combos get visually distinctive trophies. Players who stopped building early get a trophy of older, more generic geometry.

**Trophy floor [TUNABLE — not a hard invariant]:** Default minimum trophy size = **5% of canvas area OR 10 primitives**, whichever is larger. The floor exists so razor-thin wins still produce visually substantial trophies. Below the floor, the winner's full structure is preserved. The exact number is not load-bearing — adjust during playtesting if trophies feel anticlimactic or oversized.

**Cinematic state ruleset [LOCKED]:**

- All player input is disabled
- Structure immobility (§ VI.5) is suspended — structures can move
- Spark physics (§ IX) is suspended — no spawning, no collisions
- Disruption mechanics (§ VIII) are inert
- Fog of war (§ III.4) is fully lifted and stays lifted

**Persistence [LOCKED]:** A snapshot of the final cinematic state (revealed canvas + trophy) is saved as a **local replay/screenshot file** at the moment of trophy formation. No server-side accounts, no global leaderboards, no progression — just memorabilia. Players can save these locally if they want to keep them. (Anti-bloat charter § XV remains intact: no accounts, no unlocks.)

---

## IV · The Six Sparks

The atoms of the game. Each is visually distinct, behaviorally unique, and combinable with every other type in any order.

| # | Type | Shape | Color | Glow | Behavior |
|---|------|-------|-------|------|----------|
| 1 | **Dot** | Small filled circle, 4 px | White `#FFFFFF` | Soft white halo | High mobility. Lightweight connector. Cheap. |
| 2 | **Line** | Thin glowing rod, 24 px | Pale yellow `#FFE066` | Linear glow along axis | Creates straight extensions. Directional. |
| 3 | **Triangle** | Equilateral, 16 px side | Crimson `#FF3B3B` | Sharp angular flare | Rigid. Adds structural stability. Anti-rotation. |
| 4 | **Square** | Filled square, 14 px | Cobalt blue `#3B5BFF` | Boxy diffuse glow | Creates flat surfaces, grids, lattices. |
| 5 | **Circle** | Hollow ring, 18 px diameter | Emerald `#3BFF7A` | Pulsing radial glow | Enables curves, loops, and rotation. |
| 6 | **Spiral** | Tight spiral, 20 px | Violet `#A23BFF` | Twisting animated glow | Introduces dynamic, chaotic growth. Modifies adjacent combos. |

**Spark physics:** Free sparks are confined to the spawner zone (§ IX) and move freely within it, bouncing off the invisible boundary. They obey soft collisions with each other but do not interact with player structures (which are outside the zone). Once collected by a player, the spark is held in the carry slot until placed.

**Color override [AMENDED v0.5.1]:** Free-floating shapes in the spawner zone are **colorless** — they render in a neutral off-white. The six type colors above (Dot=white, Line=pale yellow, etc.) are retained as a UI legend/key only and do not tint the actual free shapes. **Type is communicated by shape geometry alone** while a shape is free. Once placed into a structure, the shape permanently inherits the *placing player's color* (§ VI.4). This means color encodes ownership exclusively; shape encodes type. The two visual channels do not overlap.

**Why the amendment:** v0.5's original rule (free = type color, placed = player color) created a confusing transition: a yellow Line free in the zone became a red Line in a P1 structure, with both color and meaning shifting at the moment of placement. With the amendment, the colorless-shape → player-color transition is the single visual event "this is mine now," making ownership read instantly across the canvas.

---

## V · Combination System

### V.1 — Order Dependence [LOCKED — S98 AMENDED to order-symmetry for the 8 one-way magics]

**S98 amendment (Option B, user-approved):** the 8 one-way magic pairs are now **order-SYMMETRIC** — connecting the same two shapes makes the same magic in **either** order (the user's "connecting two shapes shouldn't feel arbitrary" fix). The original blanket order-dependence punished a player for carrying the "wrong" piece. The one **intentional directional dual is retained**: **Triangle → Circle = Wheel ≠ Circle → Triangle = Star** — two different magics from one pair, the Mortal-Kombat "input order is part of the input" principle where it adds genuine depth. Functional (placeholder) pairs are unaffected. See `LOCKED_DECISIONS.md §6` (S98) for the full pair list + rationale.

The table still ships all 36 ordered keys (zero implementation cost); the 8 mirrored magics + the Wheel/Star dual keep directional intent where it's meaningful while removing the arbitrary-feeling duds.

### V.2 — Pair Combo Matrix [LOCKED SCOPE: 36 ordered pairs]

The prototype ships with all 6×6 = 36 ordered pair combos defined in a hand-crafted lookup table. Of these, expect:

- **~12 magical** — visually striking, mechanically interesting, players will seek them deliberately
- **~24 functional** — connective tissue, valid moves, but not memorable

Design effort goes into the 12. Do not waste time trying to make Spiral → Spiral interesting.

### V.3 — Seed Examples (Suggestive, Not Locked)

These are *seeds* for the magical-12 — to be validated and refined in playtesting:

| First → Second | Suggested Outcome |
|----------------|-------------------|
| Dot → Line | Anchored extension (line with stable origin) |
| Line → Line | Longer line, axis-aligned |
| Line → Triangle | Rigid corner — locks angle |
| Triangle → Triangle | Diamond — high stability, anti-rotation |
| Triangle → Circle | Rotating wheel — slow spin |
| Circle → Triangle | Triangulated arc — partial stability |
| Circle → Circle | Orbital — linked rotation, two bodies |
| Square → Square | Grid lattice — flat tessellation |
| Square → Circle | Capped tube — half-cylinder construction |
| Spiral → anything | Chaos modifier — destabilizes the result, beautiful but fragile |
| anything → Spiral | Dynamic growth — adds rotation/expansion to base |
| Dot → Spiral | Fractal seed — small recursive sparkle |

Lock the final 12 in a design session before Phase 1 implementation.

### V.4 — Triple and Higher-Order Combos [DEFERRED]

Sequences of 3+ primitives yielding compound shapes are reserved for v0.6. The prototype handles only pairs. If a player attempts to add a third primitive to an existing pair-combo, treat it as a fresh pair-combo against the most recent attachment point.

### V.5 — Combo Discovery

There is no in-game combo book. Players discover combos by experimentation. This is core to the design — the joy is reading geometry and predicting outcomes. A community wiki will emerge organically.

---

## VI · Build Mechanic

### VI.1 — Controls (Mouse-Only) [LOCKED]

| Input | Action |
|-------|--------|
| Mouse movement | Spark follows cursor (smoothed, not 1:1) |
| Left-click + drag | **Attract** — pulls the held spark toward your cursor for placement, or pulls a free spark in the spawner zone toward your spark for collection |
| Right-click + drag | **Connect** — draw a bond between the held spark and a primitive in your structure |
| Release drag | Apply current selection / commit the connection |
| Double right-click on bond | **Spend energy** to break the bond (cost scales with structure complexity) |

No keyboard. No menus. No macros. Pure tactile discovery.

### VI.2 — Bond Creation

A bond is a spring constraint between two primitives. Bonds have:

- A **rest length** equal to the placement distance at creation
- A **stiffness** that scales with the type combo (Triangle bonds are stiffer than Spiral bonds)
- A **break threshold** based on accumulated stress

Bonds are rendered as thin glowing lines between primitives, colored by the combined ownership of the two endpoints (gradient if multi-player).

### VI.3 — Multi-Structure Mega-Combos via Connector Chain [LOCKED — UPDATED in v0.5]

Players can build multiple separate structures and link them via a **connector chain** for a multiplier reward.

Because structures are immobile (§ VI.5), linking is **not** done by dragging structures together. It is done by physically building a chain of intermediate primitives that bridges the gap.

- **Mechanic:** Place individual primitives between the two structures, one carry-trip at a time, until the chain reaches and bonds into the second structure. The final bond — connecting the chain's terminal primitive to a primitive in the target structure — commits the merge.
- **Reward:** When two stable substructures are bridged, the resulting combined structure earns an area-claim multiplier of **1.5× to 2.0×** (exact value OPEN, see § XIV) on the joined topology.
- **Cost:** Building the connector takes real trips and primitives — typically 3–8 primitives depending on distance. This is a genuine investment, not a free reward.
- **Vulnerability:** The connector chain is itself a target. A single sever cut anywhere in the bridge will split the merged structure back into two — and per § VIII.4, the smaller side deletes. **Long thin connectors are exactly the kind of structure that severs love.** Strategic players will build redundant connectors (two parallel bridges) or thicken the chain into a small lattice.

**Strategic effect:** Mega-combos become powerful but spatially expensive and structurally risky. Encourages thoughtful map control — a player must scout the path between their two structures, build the connector through safe terrain, and accept the bridge as a defensive liability.

### VI.4 — Color Inheritance [LOCKED]

**Each primitive permanently retains the color of the player who placed it.**

- Multi-player structures are visually multi-toned (gradient bonds, mixed primitives)
- A "stolen" primitive (via Disruption — § VIII) changes color to its new owner
- The visual ownership map *is* the strategic ownership map — but only within the visible (non-fogged) areas of the canvas

This is a single rendering rule that does enormous design work: it makes raids visible (when scouted), makes alliances visible, makes contested zones visible, and creates aesthetic beauty as an emergent property of multiplayer interaction.

### VI.5 — Structure Immobility [LOCKED — new in v0.5]

**Once placed, primitives do not move (except as governed by bond physics within their own structure).**

Players cannot pick up, drag, or relocate whole structures. A structure exists where it was built. Forever.

This eliminates a class of edge cases:

- What happens when two structures collide?
- What if you drag a structure onto an enemy?
- What about into the spawner zone?
- Can you push other players' structures?

All of these become non-questions. The canvas geography is stable. Where you place a primitive is a permanent commitment, and **mega-combos require building bridges**, not towing.

---

## VII · Energy System

### VII.1 — Sources

Energy is generated **passively** by structure complexity and stability. The richer your topology, the higher your tick income.

Initial formula (OPEN):

```
energy_per_tick = sum_over_primitives(stability_score × complexity_score)
```

Where:

- `stability_score`: how rigid the local topology is (densely-bonded = high)
- `complexity_score`: how many distinct combo types feed into that primitive's neighborhood

A single Dot generates negligible energy. A 12-primitive, multi-combo, anchored structure generates substantial energy.

### VII.2 — Sinks

Energy is spent on:

- **Breaking your own bonds** (refactoring, scaled by local complexity)
- **Strong attraction drag** (pulling sparks across longer distances faster)
- **Disruption actions** (see § VIII — though these are gated by build-action count, not raw energy)

### VII.3 — No Cap, No Decay

Energy accumulates without ceiling and does not decay. A defensive turtling player builds up reserves; an aggressive raider stays near zero. This is intentional: energy is not the win condition, area is.

---

## VIII · Disruption Mechanic

### VIII.1 — Earning [LOCKED]

**1 disruption charge per 5 build actions.**

A "build action" is the placement of a single primitive into your structure (i.e., one completed travel-grab-return-combine cycle). The counter is internal and not displayed numerically.

### VIII.2 — Cap [LOCKED]

**Maximum 2 stored charges.** When at cap, the gauge stops accumulating. Build progress continues normally — you do not pause or lose anything else.

This creates **mild FOMO** for raiders (every build past cap is "wasted potential disruption") and zero pressure for pure builders (they ignore the gauge). Both playstyles are valid.

Cap of 2 was chosen over 3 to favor faster tempo: more frequent small disruption events, more decision points per minute, more opportunities for emergent moments. Easier to balance up than down.

### VIII.3 — Action Types [LOCKED]

When you spend a charge, you choose **one** of three action types and a **target**. Targeting requires the target structure (or a portion of it) to be **visible to you** — fog of war (§ III.4) gates raiding on scouting.

| Action | Effect |
|--------|--------|
| **Sever** | Cut a single bond in the target structure. The smaller side of the resulting split is deleted (see § VIII.4). |
| **Inject Spiral** | Add a free Spiral primitive into the target structure at the chosen attachment point. The Spiral's chaos modifier propagates through neighboring combos, often destabilizing them. |
| **Steal** | Detach one primitive from the target structure and add it to your own carry slot (overrides the 1-spark limit for this single bypassed instance — the steal *is* the carry). The stolen primitive changes color when placed. |

The action is **deterministic**. The player chooses the target and the type. The *outcome variance* comes from the target's topology, not from RNG.

### VIII.4 — Sever Topology Rules [LOCKED]

When **Sever** cuts a bond, the structure splits into two connected components.

- **Default rule:** The component with **fewer primitives** is deleted (erased, sparks return to the global pool as free-floating *and respawn within the spawner zone*).
- **Tiebreaker (50/50 split by primitive count):** **The side built last is deleted.** The foundation survives; the latest construction falls. "Last built" is determined by the timestamp of the most recently placed primitive on each side. The side whose newest primitive has a later timestamp is the "newer" side and is deleted.
- **Edge case (single-primitive side):** Always deleted (smaller by definition).
- **Edge case (cut isolates the player's anchor):** Currently treated as normal — the smaller side deletes regardless of which side has the anchor. The anchor itself is just another primitive. Revisit if playtesting shows this is too punishing.
- **Edge case (cut on a connector chain):** Treated identically. A long thin bridge between two large structures is highly vulnerable: a cut anywhere in the bridge splits the mega-combo, and the bridge itself (small primitive count) is the "smaller side" and deletes. This is intentional — long connector chains are a real risk.

### VIII.5 — No Preview [LOCKED]

**The player does not see the predicted outcome before committing a sever.** You select a bond and click. The result is revealed only after the cut.

This preserves the skill ceiling — experienced players learn to read structures and predict cut outcomes. It also preserves emergent surprise. Topology-reading becomes a real game skill.

### VIII.6 — Disruption Math: Why Raiding is Viable

The asymmetry:

- **Earning** a disruption charge — passive byproduct of building (no opportunity cost)
- **Damage** dealt — potentially massive (chunk deletion can erase 5+ primitives in one cut)
- **Cost** to attacker — travel time + scout time + click — typically 10–20 seconds with fog of war
- **Cost to target** — lost build value + lost time

If a single sever erases 5 primitives that took the target 25+ seconds to build, the attacker has dealt ~25s of damage at ~15s of cost on the **first** attack. **~1.7× efficiency in attacker's favor** on the first hit, slightly reduced from v0.4 because fog of war added scouting cost. With memory-fog (§ III.4), the scout cost is paid once per target — repeat attacks on the same enemy structure cost only travel time, restoring the v0.4 ~2.5× efficiency on follow-ups. The system rewards cultivating a "favorite victim" — find them once, harass them repeatedly. Still viable; still in the canonical RTS harassment range.

---

## IX · Spawner & Resource Flow

### IX.1 — Confined Central Spawner [LOCKED — major change from v0.4]

The center of the canvas contains an **invisible circular boundary** within which sparks spawn and are confined. Sparks generate at the zone center and move freely *within* the zone — bouncing softly off the invisible boundary — but **do not leave it**.

**This means there is exactly one place in the universe to collect sparks: inside the spawner zone.** Travel from your build site to the zone is mandatory for every primitive you ever place.

The spawner zone is small relative to the canvas (size OPEN — see § XIV). Six players entering and leaving creates emergent traffic, congestion, and natural conflict at the center. With fog of war (§ III.4), the spawner zone is the one **always-visible common space** — players see each other only when both are inside the zone, or otherwise via scouting.

### IX.2 — Spawn Trigger [LOCKED]

**Per-tick base rate + bonus on player build events.**

- **Base rate:** 1 spark every N ticks (N OPEN — calibrate so 6 players in steady state have ~1 spark visible per player inside the spawner zone at any moment)
- **Bonus:** each completed build action by any player triggers an additional spark spawn (rewards game tempo, not the leader specifically)
- **Type distribution:** uniform random across the 6 types. **No rarity tiers** — the design rejected per-type rarity because the geographic and fog-of-war trade-offs already create strategic differentiation.

### IX.3 — Spark Behavior Within the Zone [LOCKED — replaces v0.4 outward drift]

Sparks emerge at zone center with random initial velocity. They move freely within the spawner zone, bouncing off the invisible boundary on contact (soft elastic bounce). Soft collisions between sparks within the zone produce gentle scattering — visually a churning soup of geometric atoms.

**No despawn rule needed.** With confinement, the population stabilizes naturally as players collect at roughly the spawn rate. If population grows too high, gradually slow the spawn rate (negative feedback) — but this is a tuning concern, not a hard rule.

### IX.4 — Sparks in Transit [LOCKED]

**Sparks being carried by a player are not vulnerable.** Other players cannot intercept, steal, or knock them out of transit. The carry is committed.

This is intentional. Vulnerability in transit was considered and rejected: it would over-punish travel and collapse the geographic trade-off.

### IX.5 — No Building Inside the Spawner Zone [LOCKED — added in v0.5.1]

**`PLACE_PRIMITIVE` is rejected if the carried shape is inside the spawner radius.** The carry slot is preserved on rejection — no spark loss; the player simply has to drag the carried shape outside the ring before committing. The connect-drag preview line turns red and a "no-build" glyph appears at the cursor while the rejection condition holds, so the player understands why the placement won't commit.

**Why:** The zone is the one canvas region with a different vision contract — it is *always visible to all players* (§ III.4 spawner exception). Building there would (a) put your structure in everyone's permanent view, defeating fog-based concealment (§ X.2), and (b) clog the contested collection space, breaking the "central traffic" social dynamic (§ XI.8). The amended rule keeps the zone purely an ingress/collection ring.

**Boundary semantics:** Strict inequality. Placing exactly on the ring is allowed (liminal — counts as outside). Inside the ring is rejected.

**Implementation note:** Both the controls preview (red line + glyph) and the dispatch handler (silent reject + carry preserved) must check. The preview is for UX; the dispatch check is the defensive backstop.

---

## X · Map & Geography

### X.1 — Canvas

A rectangular black field, 16:9 aspect ratio. The central spawner zone (§ IX) sits at canvas center, occupying approximately 5–10% of canvas area (OPEN — see § XIV).

Exact dimensions: **OPEN**. Constraint: fastest-trip (build adjacent to spawner) to slowest-trip (build in the farthest corner) ratio of approximately **3× to 5×**. Lower ratios make positioning trivial; higher ratios make corner-hiding too dominant.

### X.2 — Geographic Trade-Off [LOCKED — UPDATED for fog of war]

Every player chooses where to build, with three coupled consequences:

| Position | Cycle Speed | Exposure to Traffic | Fog Concealment |
|----------|-------------|---------------------|-----------------|
| **Adjacent to spawner** | Fastest | Maximum (every player passes through) | Always discovered (everyone enters the zone) |
| **Mid-canvas** | Moderate | Moderate (passing scouts may find) | Discovered only if scouted |
| **Far corner** | Slowest | Low | Hidden until specifically scouted |

The geographic trade-off is now **three-dimensional**. With fog of war, "build far" gains a real defensive property (concealment) on top of low traffic. With the carry-1 + confined spawner, "build close" gains real economic value (fast cycles).

### X.3 — Structure Vulnerability [LOCKED]

**Your structure is vulnerable while you are away from it.**

This is the actual mechanism that makes "build far" defensive in a shallow sense (longer travel = harder for raiders to reach) but offensive in another sense (longer travel = your structure is unattended longer per trip).

With fog of war (§ III.4), enemies must first **scout** your structure before they can attack it. Scouting itself is an opportunity cost (time not spent building). A hidden far-corner base is doubly defended: hard to find AND hard to reach.

The vulnerability window is the time you are not adjacent to your structure. Defending requires being there. Building requires being away. The tension is the game.

### X.4 — Vision System (Detail) [NEW in v0.5]

Implementation of fog of war (§ III.4):

- **Personal radius:** A circular area centered on the player's spark, radius `R_personal` (OPEN — see § XIV). Always present, always travels with the spark.
- **Structure beacons:** Each primitive in any of the player's structures provides a small radius `R_beacon` of permanent vision around itself. Coincident primitives' radii overlap into a single visible area covering the whole structure plus a margin.
- **Additive composition:** Total visible area = personal radius UNION all structure-beacon radii. Multiple structures owned by the same player produce separate visible patches across the canvas.
- **Memory-fog:** Once you have personally observed any structure, its position is remembered and rendered in dimmed/desaturated style when out of current vision. Live state (color shifts, severs, primitive additions) only updates when in active vision. RTS-standard (StarCraft model). Chosen over live-only fog because it preserves disruption math (scout cost paid once per target, not per attack).
- **Spawner exception:** The spawner zone is *always visible to all players*, since collection requires entering it. It is the one common visible space.
- **Rendering:** Areas never observed are rendered solid black. Vision edges should soft-fade (~20 px gradient) to avoid jarring boundaries. Memory-fogged areas use a desaturated, dimmed render of last observed state.

**Default radius rule of thumb (OPEN):** `R_personal` ≈ size of the spawner zone. So when standing in the spawner zone, you see the whole zone and a small ring around it. When standing far from any of your own structures, you see only your immediate surroundings.

---

## XI · Strategic Layers (Emergent)

These are not new rules. They are properties that emerge from the interaction of locked rules. They are documented here so they are not accidentally balanced away.

### XI.1 — Topology as Defense

Because Sever deletes the smaller side of a cut, players will learn to build:

- **Densely interconnected** structures (no long thin chains exposed to single-cut amputation)
- **Multi-anchor** structures (no single point of failure)
- **Decoy chains** (deliberately sacrificial arms protecting a robust core)
- **Redundant connector bridges** for mega-combos (parallel chains so one sever doesn't break the merge)

The build mechanic now has both an aesthetic skill axis (what claims more area, what looks beautiful) and a defensive skill axis (what survives raids). **Topology is gameplay.**

### XI.2 — Build vs. Raid Dynamics

Each player navigates a continuous trade-off:

- **Pure builder:** ignores disruption charges, accumulates them at cap, focuses on territory. Will be slow to know about leaders due to fog.
- **Hybrid:** builds primarily, scouts occasionally, raids opportunistically when enemies are visible
- **Raider:** scouts aggressively, spends every charge as soon as it is earned, deliberately throttles enemies

All three are valid. The cap-of-2 design ensures pure builders are not punished while raiders are rewarded.

### XI.3 — Geographic Positioning

See § X.2. The build-near-vs-far trade-off is real and strategic, three-dimensional with fog of war added.

### XI.4 — The Raider Role

A player who falls behind on territory has a viable comeback path: switch to raiding. There is no explicit reward for raiding (no resources gained from severs), but the implicit payoff is that **the game stays open**. By slowing leaders, the raider preserves their own win condition. This is the same logic as attacking the leader in Diplomacy or sabotaging in Among Us.

**Fog of war adds a scouting prerequisite to raiding.** A raider can no longer attack a leader they spotted from across the canvas — they must first locate the target. This adds skill ceiling and time cost to raiding, but the disruption math (§ VIII.6) still favors attacker over builder by ~1.7×, keeping raiding viable.

### XI.5 — Color as Information (Gated)

Multi-color gradient structures reveal contributions and contested zones at a glance — but only **within scouted areas**. A structure that is 80% one color and 20% another is a half-conquered prize, but you have to be looking at it to see. Information about colors elsewhere on the canvas is unavailable until scouted.

A player's mental model of "who owns what" is therefore always partial. This is a feature, not a bug.

### XI.6 — Scouting [NEW in v0.5]

With fog of war, **scouting is a real activity with real cost.** A player can:

- Travel toward suspected enemy positions to reveal their structures
- Travel along the canvas perimeter to discover hidden builds
- Stay near home and rely on the spawner zone for incidental sightings (other players' colors visible only when they enter the zone)

Scouting trades build cycles for information. A player who never scouts may not realize they are losing until the leader's color has already filled enough canvas to be obvious near the spawner. A player who over-scouts builds nothing and falls behind on territory.

The optimal scouting rate is non-trivial and player-dependent — exactly the kind of strategic axis that makes a game replayable.

### XI.7 — Decoy Bases [NEW in v0.5]

Because vision is fog-of-war, **a player can build a small, deliberately visible structure as a decoy** to mislead enemy scouts about the location of their main base. The decoy costs primitives and area-claim potential, but might convince enemies to spend disruption charges on the wrong target — or, more importantly, might cause enemies to *stop scouting elsewhere*, leaving the real base concealed longer.

This was meaningless in v0.4 (full vision) and is now genuinely strategic. It is also entirely emergent — no rule defines "decoy"; it's just a structure that the builder considers expendable.

### XI.8 — The Spawner Zone as Social Hub

Because the spawner zone is always visible to all players (§ III.4 exception), it is the **one place where direct multi-player encounters happen with full information.** Sparks colliding, cursors crossing, players grabbing the same target spark — this is where social game state is built. Outside the zone, encounters are partial, mediated by fog and topology.

Expect playtesters to develop spawner-zone etiquette: who has priority on a contested spark, when is a "ram" considered hostile, etc. None of this is enforced; all of it is emergent.

---

## XII · Technical Architecture

### XII.1 — Engine [RECOMMENDED]

**Primary: Godot 4.x.** Reasons:

- Native multiplayer support (high-level networking nodes)
- Built-in 2D physics suitable for Verlet + spring constraints
- Light-and-fog rendering via shaders or viewports
- GDScript or C# — both viable
- Free, open-source, lightweight, single-file export

**Alternative: HTML5 Canvas + JavaScript (vanilla or p5.js).** Reasons:

- Web-deployable, zero-install for playtesters
- Custom physics (must implement Verlet + springs manually)
- Custom fog rendering (offscreen canvas + composite operations)
- WebSocket multiplayer (requires server)

**Godot is recommended** for the prototype because the physics, networking, and viewport-based fog all come "for free."

### XII.2 — Physics Model

- **Verlet integration** for primitive positions (more stable than Euler under spring constraints)
- **Spring constraints** for bonds (Hooke's law, with configurable rest length, stiffness, and break threshold per combo type)
- **Soft collisions** between free-floating sparks within the spawner zone (positional resolution, no rotational dynamics)
- **Boundary physics** for the spawner zone — sparks bounce elastically off the invisible circular wall
- **No rigid-body simulation** — primitives are point masses with rendered shapes
- **Structures do not move** (§ VI.5) — physics applies *within* structures (bond springs) but the structure as a whole has no translational motion

Target: 200–400 active simulated entities at 60 fps on a mid-range laptop.

### XII.3 — Rendering Architecture (Fog of War)

Two-pass rendering per player viewport:

1. **Scene pass:** Render everything (canvas, all sparks, all primitives, all bonds) to an offscreen texture.
2. **Visibility mask pass:** Compute the union of (a) personal radius around the local player's spark, (b) beacon radii around each of the local player's primitives, (c) the always-visible spawner zone. Render this as a white-on-black mask with soft-faded edges.
3. **Composite:** Multiply the scene texture by the mask. Output is the player's view: lit areas show, fogged areas are black.

In Godot, this is straightforward via `SubViewport` + a shader. In HTML5, use offscreen `<canvas>` and `globalCompositeOperation = 'destination-in'`.

**Performance note:** the visibility mask only needs updating when player position or primitive count changes — typically 5–10 Hz is fine, well below the 60 Hz scene pass.

### XII.4 — Core Data Structures

```
Spark {
  id: UUID
  type: SparkType  // Dot, Line, Triangle, Square, Circle, Spiral
  position: Vec2
  velocity: Vec2
  state: Free | Carried | Bonded
  ownerColor: Color | null  // null while free or carried
  carriedBy: PlayerId | null
  bondedTo: List<BondId>
}

Bond {
  id: UUID
  sparkA: SparkId
  sparkB: SparkId
  restLength: float
  stiffness: float
  breakThreshold: float
  comboType: ComboKey  // (typeA, typeB) ordered
  createdTick: int
}

Structure {
  id: UUID
  rootSpark: SparkId  // anchor
  member_sparks: List<SparkId>  // all primitives in this connected component
  member_bonds: List<BondId>
  totalAreaClaim: float  // computed
  ownerColors: Map<Color, int>  // color -> primitive count
  isImmobile: true  // structural invariant
}

Player {
  id: PlayerId
  color: Color
  cursorPos: Vec2
  carriedSpark: SparkId | null  // exactly 0 or 1
  energy: float
  buildActionCount: int  // mod 5 -> earns charge
  disruptionCharges: int  // 0, 1, or 2
  visionMask: BitMap  // computed per-frame, what this player can see
}

SpawnerZone {
  center: Vec2
  radius: float  // invisible boundary
  containedSparks: List<SparkId>
  isAlwaysVisible: true
}

ComboTable: Map<(SparkType, SparkType), ComboOutcome>
  // 36 entries for ordered pairs

ComboOutcome {
  resultantBondStiffness: float
  visualEffect: EffectId
  areaClaimMultiplier: float
}
```

### XII.5 — Game State Machine

```
SETUP -> WAITING_FOR_PLAYERS -> COUNTDOWN -> PLAYING -> WIN_CINEMATIC -> POSTGAME
```

- **SETUP:** World initialized, spawner zone placed at center, no players
- **WAITING_FOR_PLAYERS:** Lobby fills to 6
- **COUNTDOWN:** 3-second silent countdown, sparks begin spawning inside the zone
- **PLAYING:** Main loop. Tick rate 60 Hz physics, 10 Hz network snapshots, 10 Hz vision-mask recompute
- **WIN_CINEMATIC:** Triggered when any player's `totalAreaClaim` exceeds 51% of canvas area. Gameplay rules suspend; cinematic-state ruleset takes over (see § III.7, § XII.8). All player input disabled. Duration ~8 seconds.
- **POSTGAME:** Trophy displayed against revealed canvas. Snapshot saved. No more actions. Return to lobby after 10s or on player action.

### XII.6 — Networking [DEFERRED to Phase 3]

- **Server-authoritative** for: spawner emissions, energy calculations, disruption resolution, win condition, vision masks
- **Client-authoritative** for: cursor position, attraction inputs (smoothed and reconciled)
- **Snapshot rate:** 10 Hz state, 30 Hz physics
- **Lag compensation:** rewind for sever/steal targeting (player clicks based on what they see)
- **Vision filtering:** server sends each client only the entities visible to that client (anti-cheat, since fog must be authoritative)

**Networking is the highest-risk component.** It is intentionally Phase 3 work, after solo and local-MP have validated the gameplay.

### XII.7 — Rendering Polish

- Black background (`#000000`)
- Sparks rendered as filled shapes with bloom/glow shader
- Bonds rendered as gradient line segments (from `colorA` to `colorB`)
- Subtle particle effects on bond creation, severing, and combo formation
- **Fog-of-war layer:** opaque black overlay over canvas, with cutouts at vision sources (player spark, own structures, spawner zone). Cutout edges soft-faded (~20 px radial gradient) to avoid hard transitions.
- **Memory-fog layer:** desaturated/dimmed render of last-observed state in areas the player has previously seen but is not currently observing. Renders below the live layer; live updates overwrite when an area re-enters vision.
- Spawner zone rendered as a faint glow ring (so players can see where they need to enter)
- 60 fps target, no compromise

### XII.8 — Cinematic Implementation [NEW in v0.5]

Implementation details for the victory cinematic (rule defined in § III.7).

**Phase breakdown (target durations, total ~8 s):**

| Phase | Duration | Engine behavior |
|-------|----------|-----------------|
| Fog Lift | 1.0 s | Linear alpha fade of fog and memory-fog layers from full opacity to zero. All structures progressively reveal. |
| Migration | 2.0 s | Each structure interpolates from its built position toward an assigned slot near canvas center. Slots arranged in a ring, ordered by descending area-claim. Structures retain shape, color, and topology during transit (rigid translation, no rotation). |
| Sequential Collapse | 4.0 s | Players ranked 6th → 2nd. Each player's structure dissolves over ~0.6 s: bonds break in topological order from periphery to anchor, primitives fade to free sparks, free sparks fade to nothing. Pause ~0.2 s between players. |
| Trophy Formation | 1.0 s | Winner's structure begins dissolving identically. Dissolution **halts** when remaining mass equals `max(canvas_area × 0.05, 10 primitives, win_margin × canvas_area)`. The surviving subgraph is the **most-recently-built contiguous region** (highest `createdTick` values, grown greedily backward through time while maintaining connectivity). |

**Trophy selection algorithm (deterministic):**

```
1. For each primitive in winner's structure, read createdTick (already
   stored on each Bond; primitive's createdTick = max of its bond ticks)
2. Initialize trophy_set = { primitive with highest createdTick }
3. Loop:
     a. Find all primitives bonded to trophy_set members but not yet in it
     b. Pick the one with the highest createdTick among those candidates
     c. Add it to trophy_set
     d. Stop when trophy_set size >= floor (5% canvas OR 10 primitives)
4. Dissolve all primitives NOT in trophy_set
```

This grows the trophy from the newest primitive backward through time, always staying connected. The result is the "leaf cluster" of the winner's most recent expansion — the unique, late-game part of their build.

**Note:** The sever tiebreaker rule (§ VIII.4) deletes the last-built side in a 50/50 split. The trophy rule does the inverse: it preserves last-built. They are not contradictory — sever protects the foundation during gameplay (you want your core to survive damage); the trophy showcases divergence during the cinematic (you want the unique part to be the memorial). Different game states, different goals.

**Cinematic-state ruleset (engine override):**

- All input handlers detached
- Physics integration paused for non-cinematic actors
- Cinematic actors animated by tween system, not physics
- Fog mask removed
- Spawner deactivated
- All player UI elements (carry indicator, energy gauge, charge dots) fade out at fog-lift start

**Snapshot capture:**

- Triggered at the end of Trophy Formation (T = 8.0 s)
- Captures: full canvas render (no fog), trophy 3D-position, color metadata, win margin %, all six players' final claim percentages, timestamp
- Saved as a local file: `spark_replay_<timestamp>.png` (image) + `spark_replay_<timestamp>.json` (metadata)
- File location: OS-standard user data directory (e.g., `~/.local/share/spark/replays/` on Linux)
- No upload, no server-side persistence in Phase 3 — local-only is the v0.5 spec

**Phase 1 placeholder:** During Phase 1 prototyping, the cinematic is a single-frame canvas reveal with a "WIN" text overlay. The full sequence (with migration, collapse, trophy formation) lands in Phase 3 polish.

---

## XIII · Build Roadmap

### Phase 1 — Solo Prototype [WEEKEND, ~12–16 HOURS]

**Goal: Validate the build mechanic and combo discovery loop in absolute isolation. ONE spark, ONE player, no opponents (not even AI dummies).**

- 1 player, 1 spark, no networking, no opponents
- Mouse controls (attract, connect, sever your own structure)
- 6 spark types implemented with distinct visuals
- Confined central spawner with tick-based emission and bouncing within the zone
- All 36 ordered pair combos defined (6–12 polished, rest functional placeholders)
- Energy system computing passive income from complexity
- Color system architecturally present (single-player monocolor for now — color-inheritance code-paths can be stubbed)
- Win condition: reach a target area-claim threshold (single-player goal-driven; placeholder for multiplayer territory contest)

**Day 1:** 6 spark types + drag physics + confined spawner + first 12 polished combos + carry mechanic.

**Day 2:** Energy system + self-sever + visual polish + win-state plumbing (placeholder cinematic = "WIN" text overlay).

**Out of scope for Phase 1:** networking, multiple players, AI opponents, fog of war (single-player doesn't need it), full disruption mechanic, color inheritance, mega-combos via connector chain, audio, menus, tutorial, victory cinematic (placeholder only).

The Phase 1 deliverable is a *single-player sandbox* — a player can come to the spawner, grab sparks, build, combine, sever, and watch their structure grow. That is the entire prototype goal. Adversarial systems land in Phase 2.

### Phase 2 — Local Multiplayer + Fog [WEEK 2]

**Goal: Validate adversarial play with all gameplay mechanics on, including fog of war.**

- 2 players, hot-seat or split-screen on one machine (each player gets their own viewport with their own fog mask)
- Disruption mechanic fully online (sever, inject, steal)
- Multi-color structures, color inheritance
- Mega-combos (multi-structure bonding via connector chain with multiplier)
- Fog of war with memory-fog implementation
- Territory win condition (51% canvas claim)
- Tuning pass on combo magic-12, area multipliers, energy formula, disruption damage, vision radii

**Lock all open variables (§ XIV) by end of Phase 2.**

### Phase 3 — Networked 6-Player [WEEK 3+]

**Goal: Ship a playable competitive prototype.**

- Server-authoritative architecture with per-player vision filtering (anti-cheat)
- Lobby + matchmaking (basic — code-share or quick match)
- State sync, lag compensation
- Full victory cinematic implementation (§ XII.7)
- Public playtesting to gather data on the magic-12, area multiplier curve, disruption math, and fog-of-war balance

### Phase 4 — Persistence, Achievements & Monetization [LONG-TERM]

**Goal: Build the long-term retention and revenue layer. Anti-bloat charter (§ XV) is relaxed for this phase.**

- **Accounts:** Email-or-OAuth player accounts with persistent identity across sessions
- **Match history:** Server-side replay storage of past games (last N matches per player, with a configurable cap)
- **Achievements:** Cumulative goals across matches (e.g., first mega-combo, hidden-base win, raider streak, magic-12 mastery). Unlockable visual flourishes — never gameplay advantages.
- **Trophy gallery:** Each saved cinematic snapshot becomes a viewable artifact in the player's profile, browsable like a portfolio
- **Monetization (cosmetic-only):**
  - Color palettes (alternative player-color sets — never gameplay-affecting)
  - Spawner theme variants (different visual styles for the central zone)
  - Trophy display frames (cosmetic borders for cinematic snapshots)
  - Optional one-time unlock fee for the game itself (premium model) OR free-to-play with cosmetics
- **No gameplay-affecting purchases.** No pay-to-win. The 6 sparks, the combos, the disruption mechanics, the win condition — all permanently equal across all players. This is non-negotiable; the integrity of the game depends on it.

Phase 4 work begins ONLY after Phase 3 has shipped a playable, validated multiplayer prototype with verified retention. Build accounts when there's something worth retaining players for.

---

## XIV · Open Questions (Lock Before Phase 2)

These are deliberately unresolved. Each must be specified before Phase 2 implementation begins.

1. **Canvas dimensions** (in pixels or world units). Constraint: fastest-to-slowest trip ratio of ~3–5×.
2. **Spawner zone radius** (% of canvas).
3. **Spawn rate** (sparks per tick base).
4. **Personal vision radius** `R_personal` (in canvas units / % of canvas diagonal). Default rule of thumb: ≈ spawner zone size.
5. **Structure-beacon vision radius** `R_beacon` (per-primitive).
6. **Vision-edge fade width** (hard cut vs. soft gradient).
7. **Memory-fog visual style** — opacity and desaturation curve for previously-observed but not currently-visible areas. Affects readability vs. fog tension.
8. **Energy formula** specifics — coefficient on `stability × complexity`.
9. **Area-claim multiplier curve** — how much more does a complex combo claim than a simple primitive? Linear? Exponential? Capped?
10. **Mega-combo multiplier** — exact value between 1.5× and 2.0×.
11. **Connector chain** — minimum length, primitive cost, whether each connector primitive earns 1 build action toward disruption charge.
12. **Bond stiffness / break-threshold** table per combo type.
13. **The magic-12** — which 12 of the 36 ordered pairs get polish-level design.
14. **Round time limit** (if any) — pure first-to-fill, or sudden-death timer?
15. **Spectator mode** behavior on win.

Items 1–7 are spawner/map/vision calibration — playtest in Phase 1.
Items 8–12 are economic balance — playtest in Phase 2.
Items 13–15 are content/UX — design in parallel.

---

## XV · Anti-Bloat Charter

**Scope: This charter applies to Phases 1–3 (prototype through networked launch). Phase 4 (accounts, achievements, monetization) is a deliberate, planned expansion — see § XIII.4.**

The following are forbidden in the prototype unless explicitly required by a locked rule:

- **No accounts, no progression, no unlocks, no cosmetics during Phases 1–3.** Every player has the same 6 sparks. Forever (in-game). Phase 4 introduces cosmetic-only unlocks; no gameplay-affecting purchases ever.
- **No tutorial.** Discovery is the tutorial.
- **No menus** in Phase 1. The game starts on launch.
- **No audio** in Phase 1. (Reserved for v0.6 — ambient drone + combo sparkle sounds.)
- **No animations** beyond spark glow + bond formation particles + sever erasure + fog edge gradient + the cinematic.
- **No external dependencies** beyond the engine and a physics math library.
- **No module over 500 lines.** Refactor or split.
- **No frame-rate compromise.** 60 fps minimum on the dev machine. If a feature drops fps, the feature is wrong.
- **No structure dragging during gameplay.** Ever. Structures are permanent fixtures during PLAYING state. (Cinematic state suspends this — § III.7.)
- **No feature added** unless required by the spec or solving a real problem in playtesting.
- **No second screen, no in-game stats, no analytics, no leaderboards.** The canvas is the entire game during PLAYING. Match history and the trophy gallery are Phase 4 features and live OUTSIDE the canvas.

If a feature isn't being used in playtesting, **cut it**.

---

## XVI · Glossary

- **Spark** — A floating geometric primitive (one of six types). Also: a player's avatar (overloaded term — context disambiguates).
- **Primitive** — A spark that has been placed into a structure (i.e., is no longer free-floating).
- **Bond** — A spring constraint connecting two primitives.
- **Structure** — A connected component of primitives joined by bonds. Immobile once built (§ VI.5).
- **Combo** — An ordered pair of spark types (typeA, typeB) and the resulting outcome from the combo table.
- **Mega-combo** — Two separate structures joined by a connector chain, granting an area-claim multiplier.
- **Connector chain** — A sequence of intermediate primitives built between two structures to bridge them into a mega-combo. Itself a vulnerable thin structure.
- **Carry slot** — The single-spark holding capacity of a player. Always 0 or 1.
- **Disruption charge** — A stored attack action, earned 1 per 5 builds, capped at 2.
- **Sever** — A disruption action that cuts one bond and deletes the smaller side.
- **Inject Spiral** — A disruption action that adds a chaos primitive to an enemy structure.
- **Steal** — A disruption action that detaches a primitive from an enemy and adds it to your carry.
- **Topology** — The shape and connectivity pattern of a structure. The strategic property defending against severs.
- **Magic-12** — The 12 of 36 ordered pair combos that receive polish-level design.
- **Spawner zone** — The invisible circular boundary at canvas center within which sparks are confined and generated. Always visible to all players.
- **Fog of war** — The rendering rule that black-outs canvas areas outside the local player's vision. Real-time only, no memory.
- **Personal radius** — The vision circle around the local player's spark.
- **Beacon (vision beacon)** — A vision radius around each of the local player's own primitives. Permanent, additive with personal radius.
- **Scouting** — The act of traveling across the canvas to reveal enemy structures or terrain via personal radius.
- **Decoy base** — A small visible structure built deliberately to mislead enemy scouts.
- **Structure immobility** — The locked rule that placed primitives do not move (§ VI.5).

---

## End of Blueprint v0.5

**Status:** Frozen for Phase 1 implementation.
**Supersedes:** v0.4 (3 major mechanic changes — see § 0).
**Next revision:** v0.6 after Phase 2 playtesting, locking the OPEN items in § XIV.
**Author:** Drafted with Claude · May 2026.

*"Geometry is the language. Fog is the canvas. The unseen is the game."*
