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

1. **BUILDING a tower is exact** — unchanged, Helga included: `isLaserTurretComponent`,
   `isLightningHubComponent`, `isGoblinTowerComponent`, `isStinkTowerComponent`, `isHelgaComponent`,
   `isPentagramComponent`, and R136's `isRingAt` for the race rings (via `findRingAnchors`).
   ⭐ **Helga's RE-SUMMON (R190-J) is not a build:** when she dies her defender record stays DORMANT
   (no pool; untargetable, not drawn, not ticking; her HALL keeps its art and identity) and she
   revives at the FIGHT→BUILD edge while the hall's own members stand — welded or not, no bond needed.
   If the hall falls, that edge's sweep removes the record and she never returns.
2. **A LIVE tower STANDS while its own recipe is still contained** — `towerStandsAt`
   (`src/state/towerMembers.ts`, shape derived from `blueprints.ts`, exhaustive over `GodlyId`).
   A weld — any shape, any type, bonded anywhere, hub included — neither kills it nor counts toward it.
   - **Star** (turret, hub, goblin, stink, Helga): its OWN arms are the hub bonds below its
     `ownBondIdLimit` (`starArmsAt(…, limit)`). It stands iff all `c` arms of every type are still there.
   - **Ring** (pentagram, t3, t9): its OWN ring is the exact walk over the bonds below its limit
     (`ringMembersAt(…, limit)`, O(n)). It stands iff that walk still closes. (`ringCycleAt`, an
     uncapped cycle search, is DELETED — audit W7.)

**⚖ FIX ROUND (audit W1) — THERE IS NO SPARE. A CUT OWN CONNECTOR ALWAYS LEVELS THE TOWER.**

The first version let a same-type weld "stand in" for a cut own connector (a spare arm on a star's
hub, a same-type bypass through a ring's anchor). Nobody ruled that; the brief and R185-B (*"it
destroys the connectors that he's attacking"*) say the opposite, so it is REVERTED. The rule now:

- **A tower's own members are the ones it was BUILT with.** Every spawner and defender records
  `ownBondIdLimit` = `world.nextBondId` when it registered (serialized on disk, worker INIT AND the
  wire; hashed). Its own connectors are the recipe's shape among the bonds with a LOWER id.
- **Cutting (or eating) ANY one of those connectors levels the tower** — always, whatever is welded on,
  whatever its type. Pinned: `weldOntoTowerS189.test.ts` — *STAR: a 7th Spiral welded to the turret HUB
  does NOT save it*, *RING: a Triangle bridging nodes 0 and 2 does NOT save the pentagram*, *a bat tower
  welded with its own shape falls to one own cut*, *an enemy cutting one own arm of the welded turret
  levels it*, *a pentagram whose own ring is cut falls*.
- **Cutting a WELD never levels a tower.** Pinned: *…while cutting a WELD leaves it standing*, and the
  W8 differential (a pentagram weld cut inside the window; it stands on host and worker).
- ⚠ **What looks like a spare but is not:** after a tower falls, the shapes left may happen to form an
  EXACT recipe again (e.g. five original Spirals + a Spiral welded on the hub = a clean 6-arm star).
  That can IGNITE a brand-new tower on the next BUILD-phase topology change — ordinary exact ignition,
  a new tower with a new `ownBondIdLimit`, not the old one surviving.
- **No limit (a pre-S189 save, or a structure that is not a live tower):** the exact pre-S189 reading.

**Consequences, all deliberate and tested:**
- welding costs repair (R185-B): FIX refused on any welded structure — unchanged, now also asserted
  for two welded bat towers; the welded pool is the whole welded structure's (> 2× one tower's).
- welded towers keep producing: two welded bat towers BOTH emit their unit in FIGHT.
- a star welded BEFORE it is complete never ignites (build is exact) — Helga included (audit W2
  reverted her "contains" first build).
- a 7th Spiral welded on a live turret's hub is a harmless weld; losing an own Spiral still levels it.
- an accidental stink tower you keep building onto no longer "self-heals" away.
- the S107 P4 auto-bond lock (`placePrimitive.ts`) now locks only a spawner still on an exact survival
  rule — none ships — so a JOINER can weld onto any live spawner and one drop can merge two of them.
- a lightning hub's self-raze deletes only its OWN star (`towerMembersAt`), never what is welded to it
  (R182-B: *"the neighbouring shapes are protecting it"*). Its blast is unchanged.
- a t9 ring's release razes only its own nine; a same-type weld survives the release.
- a welded Helga hall brings her back at every FIGHT→BUILD edge after she dies (R190-J, dormant
  record, no bond needed); while she is dormant the hall shows a STRUCTURE bar (a pool-less defender).
- the spawner aura and the ground zone are drawn over the tower's own members (audit W2-1/W5); bot
  raids aim at its own connectors (W3); a hub self-raze and a t9 release also take a weld left holding
  nothing (S157 B2, audit W2-2).

⚠ OWNER QUESTION carried (audit W9 / W2-6, NOT changed this round): with the S107 P4 lock empty,
every drop next to a spawner becomes a weld — bots weld their frontier into their own towers, and a
human building beside his tower merges into it by accident (unrepairable for good under R185-B). And
an own-race Dot 3-ring welded through a live lightning hub stays inert (the ignition de-dup has no
recipe compare). Both need his call.

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

THE FIX ROUND ADDED WIRE AND HASH STATE (hotspots `save.ts`, `stateHashFull.ts`, self-contained hunks):
(A) `ownBondIdLimit` on `CreatureSpawner` and `Defender` — serialized (disk, worker INIT, and the WIRE:
`trimMirrorSpawner` keeps it), hashed in both projections, additive-optional; (B) a new serialized
`DefenderState` value `'DORMANT'` — a stale peer holds a state it has no arm for. Plus the shared-rule
reasons: every rule below runs on whichever peer is HOST and the render walks run on every client, so
two builds at one `PROTOCOL_VERSION` would disagree about (1) whether a welded star / pentagram / race
ring stands, and which connectors are its own; (2) Helga's exact first build and her dormant revive;
(3) whether a drop may auto-bond onto a live spawner (the S107 P4 lock); (4) which members a hub
self-raze and a t9 release delete, orphans included; (5) the cover set, centroid, aura, ground zone
and FEED row of a welded tower; (6) which connector a bot raid aims at. ONE BUMP owed, every reason
listed — the merge owner writes it (S182 lesson 6).
