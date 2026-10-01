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
   - **Star** (turret, hub, goblin, stink, Helga): its OWN arms are the hub bonds to the leaves in its
     `ownPrimitiveIds` (`starArmsAt(…, own)`), whatever the bond ids. It stands iff all `c` arms of every
     type are still there.
   - **Ring** (pentagram, t3, t9): its OWN ring is the exact walk among its own shapes
     (`ringMembersAt(…, own)`, O(n)). It stands iff that walk still closes. (`ringCycleAt`, an
     uncapped cycle search, is DELETED — audit W7.)

**⚖ FIX ROUND (audit W1) — THERE IS NO SPARE. A CUT OWN CONNECTOR ALWAYS LEVELS THE TOWER.**

The first version let a same-type weld "stand in" for a cut own connector (a spare arm on a star's
hub, a same-type bypass through a ring's anchor). Nobody ruled that; the brief and R185-B (*"it
destroys the connectors that he's attacking"*) say the opposite, so it is REVERTED. The rule now:

- **A tower's own members are the ones it was BUILT with.** Every spawner and defender records
  `ownPrimitiveIds` — the shapes it was built of, at registration (serialized on disk, worker INIT AND
  the wire; hashed). Its own connectors are the bonds BETWEEN those shapes. ⭐ S191: this replaced the
  `ownBondIdLimit` bond-id watermark before it shipped — FIX re-welds with a NEW bond id, so a repaired
  own connector read as a weld and the tower fell (audit W-FR4); no bond can ever join two existing
  shapes except a recipe edge, so "between two own shapes" is own by construction.
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
  a new tower with its own new `ownPrimitiveIds`, not the old one surviving.
- **No own set (a pre-S189 save, or a structure that is not a live tower):** the exact pre-S189 reading.

**Consequences, all deliberate and tested:**
- ~~welding costs repair (R185-B): FIX refused on any welded structure~~ ⭐ **AMENDED S191 (R191-A),
  see §I**: the welded STRUCTURE (clicked on a weld) is never FIXed; each TOWER in it (clicked on the
  tower) keeps its own FIX. The welded pool is still the whole welded structure's (> 2× one tower's).
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
human building beside his tower merges into it by accident. ⭐ S192 (audit SEAMGATES-7) — the consequence
as of R191-A: the tower stays FIXable from its own card, but the drop now shares the structure's pool,
and SCRAP from the dropped shape's card takes the tower with it. Ask: *"keep, or re-lock auto-bond
onto live towers?"* — NOT the superseded "unrepairable for good under R185-B". And
an own-race Dot 3-ring welded through a live lightning hub stays inert (the ignition de-dup has no
recipe compare). Both need his call.

Suggested `canon.test.ts` assertions: `towerShapeFor('laserTurret')` = Line hub + `TURRET_HUB_DEGREE`
Spirals (and the other four stars incl. Helga 3+3); `towerShapeFor('pentagram')` = Triangle ring of 5;
`towerShapeFor(RACE_TOWER_IDS[r])` / `(T9_TOWER_IDS[r])` = ring of `RACE_FEED_SHAPE[r]` × 3 / × 9;
`towerShapeFor('voltkin') === null`.

## B · §7b R185-A — the "exclusions are correct as written" sentence is now PARTLY STALE

It names `ringBondsOf` (`towerRenderer.ts:79`, race towers — unchanged, still correct; its ring now comes from `towerMembersAt(...).whole` — the ring it was BUILT with, via `ringOf`) and "the star
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
⭐ S191 (W-FR5) — the reason the docblock gives is now WRONG, not merely dated: a LIVE welded tower
does not need to re-ignite, it STANDS on its own members (`towerStandsAt`), so restoring its blueprint
inside the weld would not "leave a tower that would not ignite". The true reason for the refusal is the
owner's trade (R185-B: *"they cannot be repaired either, because it's like a full shape now"*). Suggested
text for §8 limit 2 and the docblock: *"refused because a hand-placed shape is welded on — R185-B, a
welded structure is unrepairable by design; SCRAP stays available."* ⚠ Round 5 (R191-A, S191) AMENDS
R185-B — the welded STRUCTURE stays unfixable but each tower inside it can be fixed — so this docblock
is rewritten with that change, in the same commit, not separately.

## F · §4 table — "A tower … dies by recipe-break when its connectors go"

Still true; add "— its OWN connectors. A weld on it is not part of its recipe."

## G · §8 / §4 — the race-tower renderers and the Voltkin

- `towerRenderer.ringOf` and `towerFrames.towerRingCentroid` (and so `healthBar`, which delegates)
  read `towerMembersAt(...).whole` — the ring the tower was BUILT with (the bonds among its
  `ownPrimitiveIds`); `groundDecalRenderer` and `spawnerZoneRenderer` read `towerFootprintAt` (the same
  own members). A same-type-welded race tower is still DRAWN, on its own ring's centroid (the old exact
  walk returned `null` for it — no sprite). (`ringCycleAt` was deleted in the fix round, audit W7.)
- VERIFIED, no change: the Voltkin TV does NOT vanish on a weld — `findAllVoltkinChains` is a path
  search with no isolation check (that lives only in ignition, `voltkinPredicate`).

## H · PROTOCOL — THE FINAL LIST FOR 52 (S191, measured on the merged tree; copy into the 52 docblock)

**Verdict: 51 → 52 owed** (the S186 test — two builds that shake hands would disagree about what
either computes). Wire/hash hunks are in `save.ts` / `stateHashFull.ts` only; no new action, no new
`GameEffect` kind, no new intent.

**(A) `ownPrimitiveIds` — a NEW FIELD on `SerializedSpawner` AND `SerializedDefender`** (⭐ S191: it
REPLACED `ownBondIdLimit`, which never shipped). The shapes a tower is BUILT of, ascending (recorded at
`applyRegisterSpawner` / `applyRegisterDefender`; amended by a FIX (either scope) that re-mints a node,
or re-registered by a tower FIX — S192). Emitted
additive-optional by both serializers, read `?? null` by both deserializers; it RIDES THE WIRE —
`trimMirrorSpawner` KEEPS it (identity, not a clock); worker INIT + disk via the same save;
WIDE-HASHED (`stateHashFull.ts` both unions, `:op<ids>` in both projections). Additive-optional alone
would cost no bump, but every survival walk, render walk and both R191-A cards READ it: a v51 peer
ignores it and walks the raw hub / raw ring instead.

**(B) the serialized `'DORMANT'` discriminant on `DefenderState` (`defender.ts:104`).** A killed Helga is
now KEPT as a record in this state (`ehp: null`) instead of deleted. A v51 client has no arm for it:
master's `princessRenderer` draws every princess, and `helgaCell`'s switch (no `default`) returns
`undefined` for `'DORMANT'` → `atlas.cells[undefined.state]` → **TypeError in `syncSprite` every frame**
(verified against master's `helgaFrame.ts`). A new discriminant on a serialized field = a bump, by rule.

**(C) SHARED RULES — each runs on whichever peer is host (and after a migration), or on every client:**
1. **built-with survival** — a live tower stands while the connectors it was BUILT with stand
   (`towerStandsAt` / `towerMembersAt`, `starArmsAt(…, own)`, `ringMembersAt(…, own)`), for the
   turret, lightning hub, goblin tower, stink tower, Helga's hall, pentagram and all 12 race rings. A
   v51 host tears a welded tower down on the next poll; a weld never stands in for a cut own connector.
2. **Helga** — her FIRST build is exact (`isHelgaComponent`); a kill leaves her DORMANT; she revives from
   the factory at BOTH phase edges (`hostTick.ts:482` FIGHT→BUILD for a FIGHT death, `:565` BUILD→FIGHT
   for a BUILD death)
   while her hall's own members stand; the FIGHT→BUILD sweep removes the record of a hall that fell.
3. **the S107 P4 auto-bond lock is empty** (`placePrimitive.ts:679`) — a drop may auto-bond onto a live
   spawner (host re-pick, merge candidates, merge sweep); a v51 host refuses the same drop.
4. **orphan raze** — a lightning hub's self-destruct razes only its OWN star, and a t9 release only its
   own nine, each also taking a weld left holding no bond (`hostTick.ts:916`, `:1333`, `razeOrphans`).
   ⭐ S192 (audit SEAMGATES-3) — and **the lightning hub's FUSE** (`starIsBelowSelfDestruct`, the host's
   spawner poll) judges the hub's OWN arms (`structureStarHealth.ownStarBonds` → `towerMembersAt`): a
   weld on the hub neither pads the pool nor banks damage. A v51 host fuses over `hub.bonds`, so whether
   and when a hub-welded hub detonates (its blast, REMOVE_SPAWNER) differs — a SIM rule, not a render walk.
5. **the render walks** — the ramp cover set / sprite centroid / art price (`rampMembersAt`), the stink
   tower cover, the race-tower ring + centroid (`towerMembersAt(...).whole`), the spawner aura + ground
   zone (`towerFootprintAt`), the FEED row
   (`seatFeedTowerAt`, `goblinKinds.ts:128`, a total order) and the sheet's emplacement row (skips a
   DORMANT Helga) — all read the tower's own members.
6. **bot raids** target an enemy tower's OWN connectors (`botBrain.ts:1037` `nearestEnemySpawnerBond`).
7. **allocator floor** — a takeover / worker repair never rebuilds `nextPrimitiveId` onto a shape a live
   tower is built of (`migrationClaim.ts` `rebuildAuthorityAllocators`, W-FR1 — moved from `nextBondId`
   in S191 with the identity).
8. ⭐ S191 step 3 — **a Helga revived before the renderer saw her DORMANT prints her kill, not a heal**
   (`damageNumbers.ts` defender arm of `syncStructures`). Render-only; listed because it runs on every
   client and exists only because of (B).

9. ⭐ S191 R191-A — **FIX / SCRAP act on the TOWER or the STRUCTURE depending on the shape clicked**
   (`structureRepair.reclaimScopeAt` over `towerUnit.towerUnitAt`): the same `REPAIR_STRUCTURE` /
   `SCRAP_STRUCTURE` intent a v51 host would apply to the whole component (scrapping every tower on a
   tower click, refusing every FIX in a weld) is scoped to one tower here. No new action and no new
   field — the SEMANTICS of two existing intents changed, which is the S186 test's case exactly.
10. ⭐ S191 R191-A — **a FIX on a fallen welded stamp re-registers it** (`settleTowerIdentity`) and a FIX
   on a live one amends its `ownPrimitiveIds` — both host-side sim results a v51 host never produces.
11. ⭐ S191 R191-A — render-side, every client: FEED is offered only by the tower that owns the
   clicked shape (`seatFeedTowerAt`), a visible weld beats the art box on click, and the two cards
   (`welded` on the view) — none on the wire; listed so the bump's docblock names them.

12. ⭐ S192 round-5 fixes — all inside reasons 9-11, no new wire/hash state: a fallen stamp is grouped
   over its whole component and a minority of a stamp is rubble (`towerUnit.stampGroupAt` / `towerUnitAt`,
   ⚠ MINE) — the SAME `REPAIR_STRUCTURE` now re-welds a held leaf instead of minting one, and refuses a
   whole-turret FIX around one shape inside a weld; a fallen tower's FIX is offered (and charged) only
   when it will re-register (`fallenTowerRegistrationRefused`, per collection); `weldedAt` is membership.
   Host-side semantics of existing intents again — covered by the same 52, no new reason to bump.

⚠ Round 6 (R191-B, the repair job — QUEUED) will add its own wire/hash state (the job) and append here.
As of round 5 this list is complete for the branch as committed.

### (superseded by the list above) the fix-round statement — kept for provenance; its `ownBondIdLimit` is §H-A's retired watermark

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

## I · ⭐⭐ R191-A (S191) — A WELDED STRUCTURE HOLDS TOWERS. R185-B AMENDED. (suggest §7b, replacing
## the R185-B "unrepairable" paragraph's conclusion, and a line in §8)

> Owner, S191: *"a welded shape can still consist of multiple towers, okay? When you click on the tower
> that's connected within the welded shape, you can only see the tower with its stats, but when you
> click on the shape that's welded to it, you can see the whole structure and what it's made of … people
> can still like go and destroy the towers themselves. Remember, by attacking the connectors of the
> towers … it's the connector of the tower that is severed … the towers themselves should still be
> shown as towers and be able to be repaired and … scraped … just the tower, not the whole shape … when
> you clicking on a welded structure you can't fix it because it's … fixing what … are you fixing all
> the towers on it no you have to fix [them] manually … you can separate those two. It's as simple as
> that."* And on the cards: *"it should show its own HP. And then out of how much the total structure
> has HP. And maybe … what kind of buildings are there just by … little pictures … when you click on
> the … welded shape itself, it's new character sheet will include like all the structure[s]."*

**R185-B AS AMENDED:** welding still buys pool — the pool is the whole welded structure's, and damage
still severs the connector being attacked (R6, verified in code and through the host tick: a chewer at
a welded turret's edge severs a TURRET connector and only the turret falls). The welded STRUCTURE as a
whole cannot be FIXed. **Each TOWER inside it can**, from its own card.

| you click | card | FIX | SCRAP | FEED |
|---|---|---|---|---|
| a tower (its art, or one of its own shapes) | that tower: its own connectors, shapes, pool, gun / aura / Helga, + "PART OF A WELDED STRUCTURE cur / max" + the other towers' icons | that tower only — priced by what IT lost (R13 / R182-E) | that tower's own shapes (a shape another tower is also built of stays — ⚠ MINE) | that tower only |
| a free-form welded shape | WELDED STRUCTURE: its pool, connectors, shapes by type, every tower (icon, name, own pool; click → that tower) | **never** (plan null, reducer no-op) | the whole component, towers included | none |
| anything not welded | unchanged | unchanged | unchanged | unchanged |

- ⭐ A TOWER THAT FELL inside a weld is still a tower for FIX when it was STAMPED: its remains (shapes
  carrying its blueprint `origin`) open its card, and its FIX restores it and re-registers it directly
  (exact ignition can never see a welded tower). ⚠ MINE — the coordinator's R4 ("priced by what the
  tower lost") read as including lost nodes; a hand-built tower that fell has no provenance and its
  shapes are free-form (as un-welded hand-built rubble always was).
  ⭐ S192 (audit SHEETS-1 / IDENTITY-3, ⚠ MINE) — the remains are grouped over the WHOLE component (a
  leaf a weld still holds is the same tower, and FIX re-welds it, priced as the lost connector), and a
  group of AT MOST HALF its blueprint is RUBBLE (free-form: SCRAP only), never a second "DOWN" tower —
  a lone stamped leaf in a wall, the stray an un-welded FIX left loose and a drop bonded back on, the
  leaves a weld held when the hub was razed. Two disjoint majorities of one stamp cannot exist.
- ⭐ S192 (audit IDENTITY-2) — a click that NAMES a tower (its art; its row / icon on a welded card)
  selects its lowest own shape no other live tower shares, so a shared anchor (a mummies ring through a
  turret's hub, W2-4) never opens / FIXes / SCRAPs the other tower. Only a shape WELDED into the hit
  tower's component (not a live tower's own) beats the art box (SHEETS-4); loose rubble on the art does not.
- ⚠ UNCHANGED RULE, stated so it is not read as new: FIX needs blueprint provenance (S152 — it must know
  what to restore TO). A HAND-BUILT tower (never stamped) had no FIX un-welded and has none welded; its
  card inside a weld offers SCRAP (+ FEED) only. Only stamped towers are fixable, as before.
- identity survives the FIX: `ownPrimitiveIds` (§A / §H-A). A connector FIX re-welds is own again; a
  node FIX re-mints joins the live record.
- Suggested `canon.test.ts` assertions: `planStructureRepair` on a welded free-form shape is `null`;
  on a welded tower's hub it is `scope: 'tower'`; `planStructureScrap` on the weld has the whole
  component; on the tower only its own shapes. `weldedTowerSheet` / `weldedStructureSheet` titles.
- §8 limit 2 (*"one friendly hand-placed shape … makes that hub permanently unrepairable"*) is
  SUPERSEDED: the hub's tower is repairable from its own card; only the welded structure's card has
  no FIX.
