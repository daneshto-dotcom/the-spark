# PDR — S113 Batch C · Lightning-Drone Building ("5-Circle + Dot" suicide-drone spawner)
Status: DRAFT → awaiting Council + owner GO | Tier: **Full** (>30K, ~600-900 LOC, ~14 files) | Risk: **HIGH**
PROTOCOL_VERSION: **13 → 14** (new `CreatureType 'lightningDrone'` + new `GodlyId/recipeId 'lightningHub'` on the wire)
Supersedes: `.claude/plans/2026-06-26_PLAN_S108_Batch_C_Lightning_Drone_Building.md` (corrects its stale "12→13"; current is 13)
Owner spec (S108 verbatim): "make 5 circles connected to a dot in the middle → another building that generates SUICIDE
LIGHTNING DRONES (take the procedural Voltkin design, ~50% smaller; drones fly out and explode with lightning that ARCS
and destroys 3 connectors per lightning in a targeted area). When 3 lightning-drones are generated, the structure blows
up in a lightning storm destroying everything in its radius."

## OWNER DESIGN DECISIONS (9 — locked this session; all are reversible one-number/constant dials)
1. Hub + leaves: **Dot hub (degree 5) + 5 Circle leaves** (distinct from pentagram=Triangle-ring, turret=Line+Spiral).
2. Topology gate: **LOOSENED** — hub bond-degree ≥ 5 + every non-hub member is a Circle (tolerate inter-leaf
   auto-bonds; the laserTurret lesson — strict degree gates caused silent no-builds in dense AUTO_BOND fields).
3. Drone emit cadence: **~15s** (reuse `SPAWN_INTERVAL_TICKS`=900t). 3 drones → structure lives ~45s.
4. Drone targeting: **nearest ENEMY connector** (enemy-only; never detonates on own structure), then detonate.
5. Lethality: **≤3 connectors TOTAL per drone** (1 `ARC_FLASH` per severed bond).
6. Structure self-destruct AoE: **owner-agnostic, like the potato** — prims+bonds in radius (incl. own structure that
   hosted it). RECONCILED with A.0 delta: `applyPotatoDetonate` ALSO kills chewers in radius (`potatoLifecycle.ts:195`).
   Decision: the structure self-destruct REUSES the full potato shape → it ALSO clears creatures in its radius (matches
   precedent + "destroying EVERYTHING in its radius"). The per-drone ≤3-bond sever is the SMALL targeted AoE and does
   NOT kill creatures (bonds only). One radius dial each: `DRONE_EXPLODE_RADIUS` (small) vs `STRUCTURE_SELFDESTRUCT_RADIUS` (large).
7. Drone population: **own independent cap** (`underDroneCaps`), not shared with CHEWER caps (avoids a chewer-balance regression).
8. Codex: **yes** — TOWERS & STRUCTURES tab entry + a characterSprite.
9. Bot build path: **host-seed** one hub per bot seat (pure seat-angle math, ZERO RNG — the proven `botSpawnerSeed` path).

## 1. OBJECTIVE
Ship a new SPAWNER godly-recipe `lightningHub` (1 Dot hub deg-5 + 5 Circle leaves) that, once built, emits up to 3
self-exploding `lightningDrone` creatures on the 15s spawner cadence; each drone flies to the nearest ENEMY bond and
detonates, severing ≤3 bonds (1 ARC_FLASH each); after the 3rd drone the structure self-destructs in a large potato-style
AoE. Host-authoritative, tick-deterministic, replay-byte-safe. Drone visual = the existing procedural Voltkin rig @ ~0.5 scale.

## 2. SCOPE (in)
- Recipe detection + registration; bot host-seed; Codex tile.
- New creature type + config + drone FSM branch (seek-enemy → arrive → self-destruct).
- Per-drone radial ≤3-bond sever (new `SEVER_BOND` cause `'drone'`).
- Structure self-destruct AoE after 3 drones (reuse `applyPotatoDetonate` shape) + `REMOVE_SPAWNER`.
- Drone renderer (Voltkin rig @ 0.5). PROTOCOL_VERSION 13→14. Tests + determinism guards.
### SCOPE (out — explicit)
- No new RNG stream (codebase forbids a 6th — `main.ts:1142`). No client-side physics. No bomb/potato chain reaction
  (drone/structure AoE deletes prims/bonds/creatures, never triggers other bombs/potatoes/drones). No veo/imagen art
  (drone reuses the procedural Voltkin rig; a bespoke drone sprite is a later art spike, not this PDR).

## 3. APPROACH (layered; one commit per layer where clean)
1. **constants.ts** — `LIGHTNING_HUB_DEGREE=5`, `LIGHTNING_HUB_COMPONENT_SIZE=6`; `DRONE_EMIT_INTERVAL_TICKS`
   (=`SPAWN_INTERVAL_TICKS` 900); `STRUCTURE_SELFDESTRUCT_DRONE_COUNT=3`; `DRONE_EXPLODE_RADIUS` (~110, potato-sized) +
   `DRONE_MAX_CONNECTORS=3`; `STRUCTURE_SELFDESTRUCT_RADIUS` (~240, large); `DRONE_MAX_ACTIVE_PER_SPAWNER`/global cap;
   `LIGHTNING_DRONE_SPRITE_SCALE=0.5`. Drone tick config in voltkin-config (below).
2. **godlyRecipes/lightningHub.ts** (NEW, mirror `laserTurret.ts`) — `isLightningHubComponent(world,hubId)` (Dot,
   bond-degree≥5, all non-hub members Circle), `findAllLightningHubAnchors` (ascending-id deterministic scan),
   `ownerForAnchor`, `LIGHTNING_HUB_RECIPE {kind:'spawner', id:'lightningHub', stillValid}`, `registerRecipe(...)`.
3. **godlyRecipes/types.ts** — `GodlyId += 'lightningHub'`. **index.ts** — enumerate in the spawner-match path.
   **godlyOrchestration.ts** — `runSpawnerIgnition` currently hardcodes `findAllPentagramAnchors`; add a parallel
   lightningHub anchor scan → `REGISTER_SPAWNER {recipeId:'lightningHub'}` (do NOT touch the pentagram path — keep its
   tests byte-green; mirror the existing `runDefenderIgnition` registry pattern).
4. **spawners/spawnerLifecycle.ts** `recipeStillSatisfied` — add `case 'lightningHub' → isLightningHubComponent`.
5. **creatures/creature.ts** — `CreatureType += 'lightningDrone'`. **voltkin-config.ts** — `LIGHTNING_DRONE_CONFIG`
   (`persistent:false`, short `lifetimeTicks` as a fly-time fuse, `selfExplode:true` discriminator, drone speed) +
   `CREATURE_CONFIGS` entry (forces exhaustiveness).
6. **creatures/creatureLifecycle.ts** `applyCreatureTick` — THIRD FSM branch beside chewer(`chewHits>0`) /
   Voltkin(`chewHits===0`): a `selfExplode` drone seeks nearest ENEMY bond; on arrival (within `DRONE_EXPLODE_RADIUS`)
   OR on lifetime-fuse expiry it dispatches `DRONE_EXPLODE` then despawns. `DRONE_EXPLODE` reducer = a radial sever of
   ≤`DRONE_MAX_CONNECTORS` ENEMY bonds within radius (SORTED BondId; nearest-first cap) via `SEVER_BOND{cause:'drone'}`
   + one `ARC_FLASH` per severed bond. Extract a shared `radialSeverBonds(world, center, radius, cap, cause)` helper
   from the `applyPotatoDetonate` body so both the drone AoE and the structure AoE route through ONE tested function.
7. **disruptionManager.ts** — add `'drone'` to the `canSeverBond` bypass list (line 83-86, host-authoritative cause).
   **world.ts** + **net/protocol.ts** — widen the `SEVER_BOND.cause` union + `SerializedEffect`/audio map to include `'drone'`.
8. **main.ts** emit poll (1176-1222, the chewer block) — for a `lightningHub` spawner: emit `lightningDrone` (own
   `underDroneCaps`), and when `sp.spawnedCount` reaches `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` → dispatch the large
   `STRUCTURE_SELFDESTRUCT` AoE (potato-shape: prims+bonds+creatures in `STRUCTURE_SELFDESTRUCT_RADIUS`, owner-agnostic)
   on the anchor pos + `REMOVE_SPAWNER`. Branch on `sp.recipeId` so chewer-spawners are byte-unchanged.
9. **render/droneRenderer.ts** (NEW) — filter `creature.type==='lightningDrone'`, draw the Voltkin rig
   (`voltkinPose`/`voltkinFrames`) @ `LIGHTNING_DRONE_SPRITE_SCALE`. Wire into the main render loop.
10. **spawners/botSpawnerSeed.ts** — add a 1-Dot + 5-Circle host-seed (pure seat-angle math, no RNG), one per bot seat.
11. **Codex** — TOWERS & STRUCTURES tile + unlock-on-build (mirror the chewer-spawner entry at `main.ts:1900`).
12. **net/protocol.ts** — `PROTOCOL_VERSION 13→14`. Tests (below).

## 4. RISKS / MITIGATIONS
- **R1 Determinism / replay** (HIGH): new creature type + new sever cause + AoE iteration order. → SORTED BondId/PrimitiveId
  victim iteration (potato precedent); NO new RNG; ADD a new config entry + new literals (never mutate Voltkin/chewer
  values); `save.replay.test.ts` two-seed byte-equality is the HARD gate; effect emits (ARC_FLASH/SEVER_ERASE) BEFORE
  topology mutation.
- **R2 Friendly fire on own structure** (the drone): owner picked enemy-only targeting → drone sever helper filters to
  ENEMY bonds; a drone with no enemy bond in reach drifts until its lifetime-fuse expires then detonates harmlessly
  (no enemy bonds severed). Mitigates "blows up own base."
- **R3 Structure self-destruct kills your own build**: INTENDED (owner chose owner-agnostic). The hub is a glass-cannon —
  documented; `STRUCTURE_SELFDESTRUCT_RADIUS` is the dial.
- **R4 Recipe collision / silent no-build**: Dot+Circle is unused by pentagram(Triangle)/turret(Line+Spiral)/star; loosened
  degree gate (≥5, not ==5) per the laserTurret silent-no-build fix; `lightningHub.test.ts` shape-gate mirrors the
  pentagram/turret tests incl. the dense-AUTO_BOND case.
- **R5 Bot asymmetry**: host-seed parity (same as pentagram bot seats) — the BUILD path is symmetric by construction;
  drone/explosion sim is host-authoritative.
- **R6 Cap balance regression**: independent drone cap (`underDroneCaps`), chewer caps untouched.
- **R7 Wire/protocol**: `netHardening.test.ts` whitelist + a `lightningHub`/`lightningDrone` round-trip test at v14.

## 5. TESTING
- `lightningHub.test.ts` (NEW): shape gate (Dot deg-5 + 5 Circle = build; wrong type / deg-4 / non-circle leaf = no
  build; dense inter-leaf auto-bond = still builds), mirror pentagram/laserTurret.
- Drone FSM: seek-enemy → arrive → DRONE_EXPLODE → despawn; enemy-only sever (own bonds spared); ≤3-bond cap; lifetime-
  fuse harmless detonation with no enemy in reach.
- `radialSeverBonds` helper: cap honored, SORTED order, enemy-only filter, ARC_FLASH count == severed count.
- Structure self-destruct: 3rd drone → AoE + REMOVE_SPAWNER; owner-agnostic prims+bonds+creatures cleared in radius.
- Determinism: `save.replay.test.ts` two-seed byte-identity stays green; a NEW replay case driving a full hub→3-drone→
  self-destruct cycle. Voltkin + chewer regression suites BYTE-IDENTICAL.
- Protocol: v14 round-trip; chewer-spawner + pentagram unchanged.
- Gate: `tsc` 0 · full `vitest` green (target ≥1716 + new) · build entry < 750 KiB cap.

## 6. ROLLBACK
Each layer is a revertible commit. The feature is additive — reverting the `runSpawnerIgnition` lightningHub scan +
the main.ts recipe branch disables the building with zero effect on chewer/pentagram/Voltkin/defender paths. A new
config entry + new wire literals are purely additive; PROTOCOL_VERSION 14 is the only breaking line (gated by the bump).

## 7. WIRE / DETERMINISM
`PROTOCOL_VERSION 13→14` (new `CreatureType 'lightningDrone'` on `creatures[]` + new `recipeId 'lightningHub'` on
`SerializedSpawner`). Host-only cadence/`spawnedCount` stay off-wire (spawner wire shape is `id/owner/anchor/recipeId`).
PURE tick math; SORTED-id victim iteration; effects emit before mutation; `severBond.ts` single locked path with the new
`'drone'` bypass cause. Bot/human symmetry = the BUILD path (host-seed). Two-seed replay byte-equality is the gate.

## 8. DELIBERATION
Tier Full → mandatory 3-way Council (Claude+Grok+Gemini), 2 rounds + quality gate, 3+ challenges, PRIME-AUDIT.
A.0 STATE-DISCOVERY: PASS (substrates verified — laserTurret recipe template, applyPotatoDetonate radial sever,
spawner.spawnedCount, canSeverBond bypass list, runSpawnerIgnition/runDefenderIgnition registry pattern, Codex tab).
One A.0 DELTA folded: applyPotatoDetonate already kills chewers in radius → reconciled into decision #6.
Council verdict + PRIME-AUDIT delta appended below before the owner GO + gate-flag write.

--- COUNCIL (R1/R2) + PRIME-AUDIT ---
**Composition:** 2-way (GROK-ANALYST grok-4.20-0309-reasoning + CLAUDE Supervisor). GEMINI-AUDITOR gemini-2.5-pro
returned HTTP 429 "prepayment credits depleted" (a billing/credits exhaustion, NOT the API_KEY_INVALID class — a key
refresh would not fix it) → 2-way per the DELIBERATION fallback ("Gemini err → 2-way"), same as S112.
**R1 verdict:** Grok ADOPT-WITH-FIXES, 4 challenges. **R2:** Grok D1 PUSH-BACK, D2 AGREE.

PRIME-AUDIT (Supervisor synthesis — each Grok challenge resolved with code evidence):
- **Δ1 (Grok #1 R1+R2 — AoE sharing).** Grok wanted ONE shared radial-sever; R2 pushed back on duplication-drift.
  RESOLUTION (synthesis): the drone AoE and the structure AoE are DIFFERENT behaviors, so they are NOT one function.
  (a) DRONE = new `radialSeverEnemyBonds` (enemy-filter + ≤3 cap + bonds-only; reuses `creatureAI.isEnemyBond`).
  (b) STRUCTURE self-destruct == a potato detonation exactly (owner-agnostic prims+bonds+creatures) → reuse potato's
  radial-clear via a GUARDED extraction of a pure `radialClear(world, pos, radius)` (or radius-parameterize
  `applyPotatoDetonate`), landed as its OWN first commit with `save.replay.test.ts` two-seed byte-equality proving the
  potato call site is byte-IDENTICAL before any drone code lands. This gives Grok's DRY single-source for the genuinely
  shared part while the frozen replay path stays test-guarded (no unguarded touch). Single SEVER_BOND path preserved
  (both AoEs sever via `SEVER_BOND{cause}`; only the victim-COLLECTION is shared, not the sever).
- **Δ2 (Grok #2 — exactly-once self-destruct + arrival/fuse race).** ADOPT. Self-destruct fires in the SAME emit-poll
  branch the instant `spawnedCount` reaches `STRUCTURE_SELFDESTRUCT_DRONE_COUNT`, immediately followed by `REMOVE_SPAWNER`
  → the spawner leaves `creatureSpawners` and the branch is structurally unreachable again (exactly-once, no flag needed).
  Tick-phase order is the EXISTING main.ts order: spawner poll (emit + self-destruct) runs BEFORE the creature fan-out
  (drone DRONE_EXPLODE). Two drones severing the same bond in one tick is deterministic + harmless: the creature fan-out
  iterates SORTED CreatureId, and a second sever of an already-gone bond is an idempotent skip (the existing
  `applyCreatureAttack` defense-in-depth, creatureAI.ts:281 missing-bond guard).
- **Δ3 (Grok #3 — enemy-bond on mixed-owner endpoints).** REFINE: the predicate already EXISTS and is locked —
  `creatureAI.isEnemyBond` (creatureAI.ts:91) = "either endpoint's placerColor ≠ owner color", the SAME rule
  `disruptionManager.canSeverBond` uses. The drone reuses `isEnemyBond` + `findNearestBondTarget(enemyOnly:true)`
  verbatim (the chewer path). Mixed-owner endpoints handled by construction; cross-color bonds don't form (S46 P3 seg).
  No new predicate invented.
- **Δ4 (Grok #4 — balance).** Owner-deferred. The numbers (15s cadence / 3 drones / ≤3-bond sever / 240px owner-AGNOSTIC
  self-destruct) are the OWNER's explicit locked decisions; SPARK ships every such number as a one-constant playtest dial
  (precedent: win-score, hunter speed, potato fuse — all shipped then iterated). Grok R2 AGREE: no CORRECTNESS barrier to
  shipping them once. SHIP owner's numbers as tunable constants; LOG Grok's alternative (20s / 2 drones / 180px /
  owner-respecting creature clear) as the **#1 post-playtest dial set**. Re-target every tick via the existing
  `findNearestBondTarget` (chewer/Voltkin parity; bounded by the low drone cap; Grok R2 confirmed "yes"); a deterministic
  phase-throttle `((id+tick)&7)===0` (no RNG) is the logged perf fallback if a populated board profiles hot.

VERDICT: **SHIP-WITH-FIXES** (Δ1 guarded-extraction, Δ2 exactly-once ordering, Δ3 reuse-locked-predicate, Δ4 owner-dials).
Carry-forward logged: Δ4 balance dial-set for the owner's post-playtest pass.
