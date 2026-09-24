# PLAN — S108 Batch C · New "5-Circle + Dot" Lightning-Drone Building (point #4)
Status: PLANNED (needs its own PDR + 3-way Council + owner design decisions before execution) | PROTOCOL_VERSION: **12 → 13** | Tier: **Full** | Risk: **HIGH**
Source: S108 scope-discovery workflow (investigator #4, Opus). Owner spec (S108, verbatim intent):

> "make 5 circles connected to a dot in the middle → another building that generates SUICIDE LIGHTNING DRONES (take
> the new [procedural] Voltkin design, make it ~50% smaller; drones fly out and explode with lightning that ARCS and
> destroys 3 connectors per lightning in a targeted area). When 3 lightning-drones are generated, the structure blows
> up in a lightning storm destroying everything in its radius." Reuses the current procedural Voltkin design as the drone.

## OBJECTIVE
A new SpawnerGodlyRecipe: a hub-and-spoke (1 center "dot" primitive, degree 5, + 5 Circle leaves) that, when built,
emits self-exploding lightning-drone creatures; after 3 drones, the structure self-destructs in an AoE.

## CURRENT STATE (verified) — three reusable substrates compose the whole feature
- **Recipe detection**: pentagram.ts (5-node closed ring) + laserTurret.ts (1 hub degree-N + N leaves) are the
  topology templates. New recipe mirrors `isLaserTurretComponent` (hub bond-degree===5, component size===6, every
  non-hub member is Circle). Registry: godlyRecipes/index.ts (`registerRecipe`); ignition driver:
  godlyOrchestration.ts `runSpawnerIgnition` (155-185, HARDCODED to pentagram — generalize or add a parallel loop).
- **Self-exploding drone**: new `CreatureType 'lightningDrone'` (creature.ts:144) + CreatureConfig (voltkin-config.ts;
  persistent:false, finite lifetime, drone speed). FSM behavior = a THIRD branch in creatureLifecycle.applyCreatureTick
  (258-473) beside chewer (chewHits>0) and Voltkin (chewHits===0): on reaching target → SELF-DESTRUCT.
- **AoE connector destruction** ALREADY EXISTS: `applyPotatoDetonate` (potatoLifecycle.ts:153+) — radial SQUARED-dist
  victim collection in SORTED id order, SEVER_ERASE + incident-bond deletion. Reuse its shape (cap ≤3 bonds, emit one
  ARC_FLASH per severed bond for "lightning that arcs"). Sever routes through the single locked SEVER_BOND path
  (severBond.ts:47) with a NEW cause added to canSeverBond's bypass list (disruptionManager.ts:83-86).
- **Structure self-destruct after 3**: CreatureSpawner already tracks `spawnedCount` (spawner.ts:47, ++ in the main.ts
  emit poll 1190). After the 3rd drone → large-radius applyPotatoDetonate-style AoE on the anchor + REMOVE_SPAWNER.
- **Bot symmetry**: botSpawnerSeed.ts hard-places a pentagram per bot seat (pure seat-angle math, ZERO RNG). The new
  building needs an equivalent bot-seed (1 Dot + 5 Circles) OR the bot brain must learn it — host-seed is the proven path.

## PROPOSED APPROACH (~600-900 LOC, ~14 files)
1. constants.ts: LIGHTNING_HUB_SIZE=6, HUB_DEGREE=5; DRONE_LIFETIME/SPEED/EMIT_INTERVAL; DRONE_EXPLODE_RADIUS +
   DRONE_MAX_CONNECTORS=3; STRUCTURE_SELFDESTRUCT_DRONE_COUNT=3 + STRUCTURE_SELFDESTRUCT_RADIUS.
2. NEW godlyRecipes/lightningHub.ts (modeled on laserTurret): isLightningHubComponent, findAllLightningHubAnchors
   (ascending-id deterministic scan), ownerForAnchor, predicate, LIGHTNING_HUB_RECIPE{kind:'spawner', id:'lightningHub'}.
3. types.ts: GodlyId += 'lightningHub'. index.ts/godlyOrchestration.ts: enumerate + REGISTER_SPAWNER{recipeId:'lightningHub'}.
4. spawnerLifecycle.ts recipeStillSatisfied: add case 'lightningHub'.
5. creature.ts: CreatureType += 'lightningDrone'. voltkin-config.ts: LIGHTNING_DRONE_CONFIG + a `selfExplode:true`
   discriminator. creatureLifecycle.ts: drone FSM branch → on arrival, dispatch a DRONE_EXPLODE (or reuse a generalized
   radial-sever helper extracted from applyPotatoDetonate): sever ≤3 bonds in radius via SEVER_BOND{cause:'drone'} +
   ARC_FLASH per bond, then despawn the drone.
6. disruptionManager.ts: add 'drone' to canSeverBond bypass; world.ts: widen SEVER_BOND cause union; protocol.ts
   SerializedEffect/audio handle 'drone'.
7. main.ts emit poll (1156-1194): emit lightningDrone; when spawnedCount reaches 3 → structure self-destruct AoE +
   REMOVE_SPAWNER.
8. NEW render/droneRenderer.ts: filter creature.type==='lightningDrone', draw the existing Voltkin design
   (voltkinPose/voltkinFrames) at scale 0.5 (the "new Voltkin design made 50% smaller").
9. botSpawnerSeed.ts: add a 1-Dot + 5-Circle hub bot-seed (pure seat-angle math).
10. protocol.ts: PROTOCOL_VERSION 12→13 (new CreatureType + recipeId literals on the wire). Tests: lightningHub.test.ts
    (shape gate, mirror pentagram/laserTurret), drone behavior, save.replay determinism.

## WIRE / DETERMINISM
PROTOCOL_VERSION 12→13 (new CreatureType 'lightningDrone' on creatures[] + new GodlyId 'lightningHub' on
SerializedSpawner.recipeId). PURE tick math, NO new RNG stream (codebase forbids it — main.ts:1142 "NO 6th RNG
stream"), SORTED-id victim iteration (potato precedent). save.replay byte-equivalence MUST stay green (add a NEW
config entry, don't mutate existing literals → Voltkin/chewer unchanged). Effect ordering: ARC_FLASH/SEVER_ERASE emit
BEFORE topology mutation. Bot/human symmetry = the BUILD path (host-seed parity); the drone/explosion sim is
host-authoritative + symmetric by construction.

## OPEN QUESTIONS (owner — design decisions BEFORE the PDR locks)
1. The center "dot": SparkType.Dot as the hub + Circle leaves? (pentagram=Triangle, turret=Line+Spiral — each recipe
   picks distinct types to stay discoverable + non-colliding.) Confirm Dot+Circle.
2. Hub degree EXACTLY 5 + strict leaf-degree-1, or tolerate inter-leaf auto-bonds (laserTurret deliberately loosened
   this to fix dense-AUTO_BOND silent no-builds)? Looser = proven-robust.
3. Drone emit cadence: reuse SPAWN_INTERVAL_TICKS (900t/15s) or faster? With only 3 drones, 15s ⇒ structure lives ~45s.
4. Drone targeting: fly to nearest ENEMY connector (enemyOnly, never blows up own structure) then detonate, or
   fixed/random point?
5. "3 connectors per lightning bolt" vs "3 connectors total per drone"? (Assumed 3 total per drone, 1 ARC_FLASH per bond.)
6. Structure self-destruct "destroying everything in its radius": owner-agnostic (like potato, incl. own structure)
   or enemy-only? Also kill creatures in radius?
7. Drone population: count toward existing CHEWER_MAX_* caps or its own independent population (likely its own, to
   avoid a chewer-cap balance regression)?
8. Codex: appear in the TOWERS & STRUCTURES tab + needs a characterSprite.
9. Bot build path: host-seed one hub per bot seat (proven) or teach the bot brain to build it dynamically?
