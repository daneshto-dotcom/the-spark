# S189 CANON NOTES — `s189/weld` (C2). For the merge owner to fold into `SPARK_CANON.md`.

Branch never edits `SPARK_CANON.md` / `src/canon.test.ts`. Each item below says WHERE it goes, the
text, and the constant/function an assertion should pin.

## A · NEW RULE (suggest §7b, after R185-B) — R189-C2: EXACT TO BUILD, CONTAINS TO SURVIVE

> Owner, S189: *"If you connect shapes … to existing towers, like to a laser tower, my brother
> connected like two triangles … it got his tower disappeared … as long as the existing tower, the
> shape is there … it still has a pentagram, but you can connect to it."*

- **Ignition is exact and unchanged** (`isLaserTurretComponent`, `isLightningHubComponent`,
  `isGoblinTowerComponent`, `isStinkTowerComponent`, `isHelgaComponent`, `isPentagramComponent`).
  Its exactness keeps the recipes disjoint.
- **Survival of a LIVE tower is "its own recipe is still contained"** — `towerStandsAt`
  (`src/state/towerMembers.ts`), for the laser turret, lightning hub, goblin tower, stink tower, Helga
  and the pentagram. A weld — any shape bonded on anywhere, hub included — neither kills nor counts.
  - a star's OWN arms = per arm type, the lowest-bond-id arms (`starArmsAt`, `starShape.ts`);
  - a pentagram's OWN ring = the lexicographically-least simple 5-cycle of Triangles through its
    anchor (`ringCycleAt`, `ringShape.ts`), which is provably the original ring while it is intact;
  - the survival shape is DERIVED from `blueprints.ts` (`towerShapeFor`, exhaustive over `GodlyId`).
- **Cutting one of the tower's OWN connectors still levels it.** Cutting a weld does not.
- ⚠ **A surplus same-type weld stands in for a LOST own arm** ("the shape is there"): a turret with
  a 7th Spiral welded to its hub survives losing one Spiral. So the S140 "builds at six, dies at
  seven" trap is gone for a LIVE turret; ignition still needs exactly six.
- ⚠ **Hysteresis consequences, deliberate:** a star welded BEFORE it is complete never ignites
  (unchanged); HELGA's re-summon after she is killed goes through ignition, so a WELDED hall stands but
  cannot re-summon her; an accidental stink tower you keep building onto no longer "self-heals"
  away (`stinkTower.ts` property 1 is retired — property 2, no self-blast, is untouched).
- ⛔ **The twelve race rings (t3/t9) keep R136 for survival** — a weld of the ring's OWN type still
  un-makes them. Not moved in S189 (owner ruling + five renderer files outside the branch).

Suggested `canon.test.ts` assertions: `towerShapeFor('laserTurret')` = Line hub + `TURRET_HUB_DEGREE`
Spirals (and the other five); `towerShapeFor('t3TowerVampires') === null`.

## B · §7b R185-A — the "exclusions are correct as written" sentence is now PARTLY STALE

It names `ringBondsOf` (`towerRenderer.ts:79`, race towers — unchanged, still correct) and "the star
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
