# S189 CANON NOTES — `s189/weld` (C2). For the merge owner to fold into `SPARK_CANON.md`.

Branch never edits `SPARK_CANON.md` / `src/canon.test.ts`. Each item below says WHERE it goes, the
text, and the constant/function an assertion should pin.

## A · NEW RULE (suggest §7b, after R185-B) — R189-C2: EXACT TO BUILD, CONTAINS TO SURVIVE

> Owner, S189: *"If you connect shapes … to existing towers, like to a laser tower, my brother
> connected like two triangles … it got his tower disappeared … as long as the existing tower, the
> shape is there … it still has a pentagram, but you can connect to it."*
> Owner, S185 (R185-B), the case the follow-up closed: *"a bat tower … welding it through many
> connectors to another bat tower — those two bat towers are a lot harder to destroy."*
> Owner ruling R190-J: *"Every fight she should come back as long as the tower is still up."*

**THE RULE, for every standing tower in the game except the Voltkin (a cinematic):** laser turret,
lightning hub, goblin tower, stink tower, Helga's hall, the pentagram, and all twelve tier-3 / tier-9
race rings.

1. **BUILDING a tower is exact** — unchanged: `isLaserTurretComponent`, `isLightningHubComponent`,
   `isGoblinTowerComponent`, `isStinkTowerComponent`, `isPentagramComponent`, and R136's `isRingAt`
   for the race rings (via `findRingAnchors`). That exactness keeps the recipes disjoint.
   ⚠ **One exception, by ruling R190-J: Helga.** Her build predicate is the survival test below,
   because she dies while her hall stands and comes back through that predicate — there is no record
   of "this was her hall", so first build and re-summon are one test.
2. **A LIVE tower STANDS while its own recipe is still contained** — `towerStandsAt`
   (`src/state/towerMembers.ts`, shape derived from `blueprints.ts`, exhaustive over `GodlyId`).
   A weld — any shape, any type, bonded anywhere, hub included — neither kills it nor counts toward it.
   - **Star** (turret, hub, goblin, stink, Helga): its OWN arms are, for each arm type T that the
     recipe needs `c` of, the `c` lowest-bond-id hub bonds reaching DISTINCT neighbours of type T
     (`starArmsAt`). It stands iff the hub still has at least `c` distinct T-neighbours for every T.
   - **Ring** (pentagram, t3, t9): its OWN ring is the lexicographically-least simple `n`-cycle of the
     ring's shape THROUGH ITS ANCHOR (`ringCycleAt`). It stands iff such a cycle exists.
   - Lowest-id = the ORIGINAL members while they are intact — provable, because every weld is minted
     after ignition and ids are monotonic.

**⚖ EXACTLY WHEN A CUT LEVELS THE TOWER, AND WHEN A SPARE TAKES OVER** (a "cut" = one of the tower's
OWN connectors severed, or one of its own shapes destroyed):
- **STAR — a cut LEVELS it unless the hub carried a SURPLUS shape of the SAME arm type, bonded
  DIRECTLY TO THE HUB.** Before the cut the hub had exactly `c` T-arms → after it, `c − 1` → it falls.
  Before the cut it had `c + k` (k ≥ 1 same-type welds on the hub itself) → after it, still ≥ `c` → the
  lowest-id surplus becomes an own arm and it stands. A weld of any OTHER type, or any weld on a LEAF,
  never stands in.
  - pinned "levels": `weldOntoTowerS189.test.ts` — *an enemy cutting one own arm of the welded turret
    levels it within the poll* (the welds are Triangles — foreign to a Spiral turret).
  - pinned "spare takes over": *STAR: a 7th Spiral welded to the turret HUB takes over when an own
    Spiral arm is cut* (host tick) and *starArmsAt takes the LOWEST-id arms; a surplus same-type weld
    is not an arm until one is lost* (arithmetic).
- **RING — a cut LEVELS it unless welds of the ring's OWN shape complete ANOTHER simple `n`-cycle
  THROUGH THE ANCHOR.** A same-type spur, or a same-type triangle that does not include the anchor,
  does not count; neither does anything of another type.
  - pinned "levels": *a pentagram whose own ring is cut falls, welded or not* (a Circle weld) and
    *…and with one of its OWN ring connectors cut it falls* (a race ring with a same-type spur).
  - pinned "spare takes over": *RING: a Triangle bridging nodes 0 and 2 takes over when the pentagram
    edge 0–1 is cut* (host tick) and *ringCycleAt returns the ORIGINAL ring even when a chord weld
    opens a second 5-cycle* (arithmetic).
- **Cutting a WELD never levels a tower** — *…while cutting a WELD leaves it standing*.
- ⭐ So *"cutting one of the tower's OWN connectors still levels it"* is exact for a tower with no
  same-type weld on its hub (star) / no same-type bypass through its anchor (ring) — every tower as
  built, and every tower welded only with foreign shapes. The spare exists only when the player welded
  the tower's own shape onto the exact spot that rebuilds the recipe, and then the recipe genuinely is
  there again (*"as long as the existing tower, the shape is there"*).

**Consequences, all deliberate and tested:**
- welding costs repair (R185-B): FIX refused on any welded structure — unchanged, now also asserted
  for two welded bat towers; the welded pool is the whole welded structure's (> 2× one tower's).
- welded towers keep producing: two welded bat towers BOTH emit their unit in FIGHT.
- a star welded BEFORE it is complete never ignites (build is exact) — except Helga (R190-J).
- the S140 "dies at seven" trap is gone for a LIVE turret (a 7th Spiral on the hub is a spare).
- an accidental stink tower you keep building onto no longer "self-heals" away.
- the S107 P4 auto-bond lock (`placePrimitive.ts`) now locks only a spawner still on an exact survival
  rule — none ships — so a JOINER can weld onto any live spawner and one drop can merge two of them.
- a lightning hub's self-raze deletes only its OWN star (`towerMembersAt`), never what is welded to it
  (R182-B: *"the neighbouring shapes are protecting it"*). Its blast is unchanged.
- a t9 ring's release razes only its own nine; a same-type weld survives the release.
- a welded Helga hall brings her back every BUILD after she dies (R190-J) — ⚠ ignition still needs a
  BUILD-phase topology change, true of an un-welded hall too (reported; see the progress file).

Suggested `canon.test.ts` assertions: `towerShapeFor('laserTurret')` = Line hub + `TURRET_HUB_DEGREE`
Spirals (and the other four stars incl. Helga 3+3); `towerShapeFor('pentagram')` = Triangle ring of 5;
`towerShapeFor(RACE_TOWER_IDS[r])` / `(T9_TOWER_IDS[r])` = ring of `RACE_FEED_SHAPE[r]` × 3 / × 9;
`towerShapeFor('voltkin') === null`.

## B · §7b R185-A — the "exclusions are correct as written" sentence is now PARTLY STALE

It names `ringBondsOf` (`towerRenderer.ts:79`, race towers — unchanged, still correct; its ring now comes from `ringCycleAt`) and "the star
walk (`structureRamp.ts:509`)". The star walk USED to be `anchor.bonds`, correct only because a weld
on the hub killed the tower. It is now `towerMembersAt` for BOTH ramp shapes (`rampMembersAt`), and
`stinkTowerCover.stinkTowerMembers` likewise — so a welded shape is never covered, never moves the
sprite, never prices the art. R185-A is preserved by construction; the line reference is what moved.

## C · §7 R182-B — "the percentage is the hub's OWN star, `starHealthFrac` over `hub.bonds`"

`hub.bonds` is no longer the star (a hub may carry welds). `starBankedFifths` / `starPoolFifths` read
the live tower's OWN arms (`ownStarBonds` → `liveTowerRecipeAt` + `towerMembersAt`); a primitive that
anchors no live tower keeps the raw-bond reading. Asserted: a hub-welded lightning hub's
`starPoolFifths` = 50, and damage on the weld's connector is not its banked damage.

## D · §7b R182-F / §9d rule 1 (the bar follows the star) — INTERACTION, MEASURED, NOT BUILT

The bar (`healthBar.ts`, `structureDefenceFifths` over the COMPONENT) is untouched. The art reads the
star's own arms. MEASURED on the owner's own case (2 triangles dropped on a laser turret, real
placement path): the component is **12 connectors** (6 own + 6 weld bonds from the K=3 redundancy),
component pool **204** fifths vs the star's **66**. At banked 34: **bar 83 %, art 49 %**.
- So the R182-F divergence now ALSO applies to hub-welded towers (before S189 they could not exist).
- ⚠ When §9d rule 1 is built, the bar must read `starPoolFifths` / `towerMembersAt(...).bonds`,
  NOT `hub.bonds.size` — the canon's own sentence (`structurePoolFifths(component.bonds.size)` over
  "the tower's OWN star") would count weld bonds on a hub-welded tower.
- ⚠ And the tension the canon already names is now concrete: the SIM needs 204 banked before the
  first connector of that welded turret snaps (welding really does buy pool — R185-B), so a bar moved
  onto the star (66) would UNDER-state how tough the welded stack is. The owner should see 204 vs 66.

## E · §8 REPAIR — one docblock is stale

`structureRepair.ts` `blueprintGroupOf`: *"a tower that then still would not ignite (every recipe gate
counts component size EXACTLY)"* — survival no longer counts component size. The refusal itself
(R185-B, welded = unrepairable) is unchanged and asserted in `weldOntoTowerS189.test.ts`.

## F · §4 table — "A tower … dies by recipe-break when its connectors go"

Still true; add "— its OWN connectors. A weld on it is not part of its recipe."

## G · §8 / §4 — the race-tower renderers and the Voltkin

- `towerRenderer.ringOf`, `towerFrames.towerRingCentroid` (and so `healthBar`, which delegates) and
  `groundDecalRenderer` walk `ringCycleAt`: a same-type-welded race tower is still DRAWN, on its own
  ring's centroid (the exact walk returned `null` for it — no sprite).
- VERIFIED, no change: the Voltkin TV does NOT vanish on a weld — `findAllVoltkinChains` is a path
  search with no isolation check (that lives only in ignition, `voltkinPredicate`).

## H · PROTOCOL — restated once, with the final rule list

No serialized or hashed field changed (no hotspot file touched). But every rule below is computed by
whichever peer is HOST (so after a migration to an older build it would be applied differently), and
the render walks + the feed lookup run on every client. Two builds that shake hands at the same
`PROTOCOL_VERSION` would disagree about: (1) whether a welded star / pentagram / race ring stands;
(2) whether Helga ignites / re-summons on a welded hall; (3) whether a drop may auto-bond onto a live
spawner (the S107 P4 lock); (4) which members a hub self-raze and a t9 release delete; (5) the cover
set, centroid and FEED row of a welded tower. By the S140 precedent (a recipe retune bumped 18→19 as
"shared constants both peers compute from") this OWES ONE BUMP — the merge owner writes it.
