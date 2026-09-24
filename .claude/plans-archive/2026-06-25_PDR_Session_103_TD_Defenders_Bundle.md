# PDR — Session 103 — TD Defenders Bundle (#8 Voltkin-vs-chewer · #9 Laser Turret · #10 HELGA) + Tier-1

> **Tier:** FULL (>30K; new synced entity collection `defenders`, protocol bump, original state-driven character, 2 new recipes) · **Pipeline:** Session PDCA v2
> **Source:** owner message 2026-06-25 — "run the bundle #8/#9/#10, build the generic Defender substrate + findNearestEnemyCreature + lightning-cloud FIRST, then resume Tier-1 G1b/G2/G3b/G4 and any other top recommended priorities. i pre-approve full session and autonomous run."
> **Status:** DRAFT → Council → PRIME-AUDIT → gate-flag (owner pre-approved `unlock_source:user`) → execute.
> **Discovery (A.0):** 4-agent fresh mapping of CURRENT post-S102 source — all file:line verified. Supersedes the S102 PDR's pre-S102 assumptions.

---

## A.0 STATE-DISCOVERY — verified facts (CURRENT source, post-S102)

| Claim | Verdict | Evidence |
|---|---|---|
| `damageCreature` is the single creature-death path | TRUE (shipped S102) | `creatureLifecycle.ts:217` — `damageCreature(world, id, amount):boolean`, decrements hp, deletes at ≤0 |
| Unified HP model live | TRUE | `constants.ts:802` — `CONNECTOR_HP=CHEW_HITS=5`, `CHEW_DAMAGE=1`, `CHEWER_HP=1`, `VOLTKIN_HP=2`, `RAID_CREATURE_DAMAGE=1` |
| `findNearestEnemyCreature` exists | **FALSE — greenfield** | only `findNearestBondTarget` (`creatureAI.ts:145`) |
| `Creature.targetCreatureId` exists | **FALSE — greenfield** | only `targetBondId` (`creature.ts:183`) |
| `applyCreatureAttack` has a creature-target branch | **FALSE — bond-only** | `creatureAttack.ts:44-48,76-135` |
| `attackRange` is per-config (not hardcoded) | TRUE (shipped S102) | `creatureAI.ts:281`, Voltkin 180 / chewer 35 |
| Recipe registry exists | TRUE but pentagram NOT registered | `godlyRecipes/index.ts:23-32` registry; `runSpawnerIgnition` hardcodes `findAllPentagramAnchors` (`godlyOrchestration.ts:82,161`) |
| Combo classification available | TRUE | `combos.ts:209` `lookupCombo(a,b).resultName` → 'Whip' (Spiral/Line, order-symmetric), 'Warped Anchor' (Triangle→Spiral), 'Star' (Circle→Triangle), 'Wheel' (Triangle→Circle) |
| Green-goo death VFX is render-driven (snapshot diff) | TRUE | `chewerRenderer.ts:156-173` death-watcher diffs `lastSeenPos` vs live ids |
| Voltkin char-animation pipeline exists (clone for HELGA) | TRUE | `voltkinFrames.ts:316` `currentAnimCell(state,ticksInState,...)`; atlas+manifest in `public/godly/voltkin/anim/` (0 bundle); `build-voltkin-atlas.py`, `matte-voltkin-frames.py` |
| `defenders` Map exists | **FALSE — greenfield** | World has `creatures`/`creatureSpawners` only (`worldTypes.ts:123-141`) |
| 4 teardown sites | CONFIRMED | `gameMode.ts:194-195` (START), `gameMode.ts:327-328` (RETURN_TO_TITLE), `godlyActions.ts:76-77` (GODLY_ABORT), `world.ts:415` (WIN via `teardownSpawners`) |
| `PROTOCOL_VERSION` | 11 | `protocol.ts:78`; `RAID_CREATURE` in both KNOWN_GAME_ACTION + CLIENT_INTENT |
| Save round-trip pattern | additive-optional, emit-only-when-non-default | `save.ts:664-665` (spawners), `:1180` (`hp` emit only when damaged), `:723-754` `trimMirrorCreature` strips host-only fields |
| Determinism gate | `runCreatureStress` / `runChewerStress` | `save.replay.test.ts:180-208,220-340` — tick-only, two-seed byte-identical |
| `Bond.hp` / visibly-damaged connector | **NOT shipped** (de-scoped carry-forward) | `bonds.ts:27-47` no hp; model is per-creature `chewProgress`. **OUT OF SCOPE** here. |

---

## FIELD 1 — OBJECTIVE

Complete the tower-defense counterplay loop with creature-vs-creature combat and two new player-built **defenders**, then resume the Tier-1 geometry roadmap. Make the godly Voltkin fight the enemy's chewer swarm; give the player two structures to build — a slow heavy **laser turret** and **HELGA**, a real articulated Bavarian-princess character who swats chewers — both standing on ONE generic, deterministic, multiplayer-safe `Defender` substrate built FIRST (foundations-precede-consumers, the S102 Council lesson). Ship Tier-1 value if budget allows.

## FIELD 2 — SCOPE

**In-scope (priority order — foundations first):**
- **P1 — Creature-combat foundation + #8 Voltkin-vs-chewer.** `findNearestEnemyCreatureFrom` (generic, position+owner+range), `Creature.targetCreatureId`, ONE creature-target branch in `applyCreatureAttack` → `damageCreature`, Voltkin target selection (creatures-first when in range), Voltkin-death **lightning-cloud** VFX (render-driven death-watcher). No new wire intent (host-authoritative; targetCreatureId host-only). Accepted Voltkin replay re-baseline.
- **P2 — Generic Defender substrate + recipe generalization.** `defenders: Map<DefenderId,Defender>` + `nextDefenderId`; `defenders/defenderLifecycle.ts` (register/remove/tick/attack/recipeStillSatisfied); 4 teardown sites; save round-trip (additive-optional) + `WorldSnapshot.defenders`; finish recipe registry (register pentagram + add a defender-recipe ignition pass); unordered {type-set} combo detector; generic fire/slap poll in main.ts; **PROTOCOL 11→12**; `runDefenderStress` determinism gate.
- **P3 — #9 Laser turret** (1 Line deg-7 + 7 Spiral=Whip leaves). `laserTurret.ts` recipe; defender `kind:'turret'`; fire every `TURRET_FIRE_INTERVAL_TICKS`; 5 windup rings derived from `nextFireTick` (client-visible); `LASER_BEAM` VFX; kills nearest enemy creature via `damageCreature` (chewer→goo 1 hit, Voltkin→cloud 2). Original turret art (procedural pencil/ink). `TurretRenderer`.
- **P4 — #10 HELGA princess** (central Triangle hub + 3 Spiral=Warped-Anchor + 3 Circle=Star, single component, unordered type-set). `princessHelga.ts` recipe; defender `kind:'princess'`; stationary; periodic slap on nearest enemy **creature** (never structures); chewer 1 / Voltkin 2. **HELGA = a real state-driven articulated character** (idle/sip-beer → acquire → windup → slap → react), ORIGINAL, Courage-the-Cowardly-Dog *style* only. `PrincessRenderer`.
- **P5 (stretch, Tier-1, budget-gated GREEN) — G4 build-feel juice** (bond-formation burst + in-world leader crown) — highest value-per-risk, pure render/feel, no LOCKED-§6 gate. Falls to carry-forward if budget ≤ YELLOW after P4.

**Out-of-scope (explicit):** `Bond.hp` / visibly-damaged connector + multi-chewer stacking (S102 de-scoped polish); delta-encoding the wire; G1b MOTION (Council-deferred, no mechanical verb); G2 traits (needs LOCKED §6 amendment — gated); G3b Codex silhouettes (carry-forward unless P5 swaps); host-migration; raising chewer caps. **HELGA art = ORIGINAL** (memory `art-no-franchise-copying`; no Peach, no copied CtCD character).

## FIELD 3 — APPROACH

### Cross-cutting design decisions (owner specs + Council-pending)
- **DD1 — generic targeting helper.** `findNearestEnemyCreatureFrom(world, fromPos, ownerPlayerId, maxRangeSq?): CreatureId|null` — scan `world.creatures`, enemy filter (`c.ownerPlayerId !== ownerPlayerId`), `distSq`, **lowest-CreatureId tie-break**, range-gate. Creature wrapper `findNearestEnemyCreature(world, creature)` calls it; defenders call it directly. (Mirrors `findNearestBondTarget` `creatureAI.ts:145`.) Determinism: no `Math.random`/wall-clock; tie-break by id.
- **DD2 — single-target damage = 1.** Add `CREATURE_HIT_DAMAGE = 1` (Voltkin zap, laser beam, HELGA slap all = 1). Chewer (1 HP) dies in 1; Voltkin (2 HP) in 2. AoE (potato) stays lethal-despawn. All flow `damageCreature` (MF1 single path).
- **DD3 — death VFX is render-driven snapshot-diff (MF2, the 1v1-visibility rule).** chewer-death → green goo (exists). voltkin-death-by-kill → **lightning-cloud** via a death-watcher in `creatureRenderer` that fires when a voltkin vanishes that was NOT in `DESPAWNING` last frame (a hard `damageCreature` delete ≠ natural lifetime despawn). Zero wire/save surface; reliable on host + 1v1 client.
- **DD4 — defenders removed by recipe-break, not combat.** Chewers attack enemy *bonds*; a defender's underlying structure can be chewed apart → `recipeStillSatisfied` false → `REMOVE_DEFENDER`. `Defender.hp` kept for symmetry/future, defaulted high; defenders are not directly attacked v1.
- **DD5 — laser windup client-visible (MF2).** 5 windup rings derived from the synced `defender.nextFireTick − world.tick`, NOT host-local transient effects. Beam: a short-lived `LASER_BEAM` effect — render it on BOTH peers by also deriving "just fired" from `nextFireTick` cadence so a missed transient still shows (defense-in-depth like S84 rainbow).
- **DD6 — HELGA animation = ARTICULATED PIXI PUPPET RIG (primary), generated texture detail (optional bonus).** Per OC3 a "rig/puppet OR per-state hand-authored animation" is explicitly allowed and is distinct from the rejected S96 single-sprite "PowerPoint spin" twitch. A multi-part puppet (torso, head, beer-arm, slap-arm, dirndl skirt, legs) with **hand-authored keyframe poses per state**, pose `= f(state, ticksInState)` (replay-safe, deterministic, zero bundle, zero API dependency), thick painterly CtCD-style outlines via Pixi Graphics. This is the most robust autonomous deliverable and genuinely "a real functioning character, not a gif." **Deviation logged** from memory `feedback-real-video-over-procedural-animation`: that note rejected transform-twitching ONE flat sprite; a true multi-limb authored-pose rig is the OC3-sanctioned reconciliation. *Optional enhancement if gcp-vertex cooperates:* generate an original painterly face/texture (imagen) to texture the puppet head — additive, never blocks the priority.
- **DD7 — art is ORIGINAL (CONSTITUTIONAL).** Turret + HELGA both original house style. "Bavarian princess / Looney-Tunes laser" are vibe cues only. No franchise copy ([[art-no-franchise-copying]]).
- **DD8 — territory exemption.** Turret + HELGA exempt from `isInsideEnemyTerritory` (player-built on own turf, like spawners).

### P1 — Creature-combat foundation + #8 (no new entity, no protocol bump)
1. `findNearestEnemyCreatureFrom` + `findNearestEnemyCreature` wrapper in `creatureAI.ts`.
2. `Creature.targetCreatureId: CreatureId|null` (`creature.ts`), default null in `makeCreature`; save additive-optional (emit only when non-null) + strip in `trimMirrorCreature` (host-only).
3. Voltkin target selection in main.ts creature-tick: try `findNearestEnemyCreature` first (in-range), else `findNearestBondTarget`; set the matching target field, clear the other.
4. `applyCreatureAttack` (`creatureAttack.ts`): if `targetCreatureId != null` → `damageCreature(world, targetCreatureId, CREATURE_HIT_DAMAGE)` (+ killCount on kill); else existing bond path. Voltkin keeps ARC_FLASH; chewer path unchanged.
5. Voltkin-death lightning-cloud death-watcher in `creatureRenderer.ts` (clone goo-watcher; cyan/white jittered arcs + radial spark burst, reuse `arcFlash.ts` primitives; new `playZapBurstSFX` procedural).
6. Extend `runCreatureStress` (or add `runVoltkinCombatStress`): Voltkin spawns near an enemy chewer, walks, kills it (hp 1→0), byte-identical two-seed. **Re-baseline** the intentional Voltkin divergence; document.

### P2 — Generic Defender substrate + recipe generalization (PROTOCOL 11→12)
1. `Defender` type + `DefenderId` + `DefenderState` (`'IDLE'|'ACQUIRE'|'WINDUP'|'FIRE'|'RECOVER'` for both kinds; HELGA adds `'SIP'`): `{id,kind:'turret'|'princess',ownerPlayerId,pos,anchorPrimitiveId,recipeId,state,ticksInState,hp,nextFireTick,targetCreatureId}`.
2. `worldTypes.ts`: `defenders: Map<DefenderId,Defender>` + `nextDefenderId` (after line 141). `world.ts` makeWorld init (after 290).
3. `defenders/defenderLifecycle.ts`: `applyRegisterDefender`, `applyRemoveDefender`, `applyDefenderTick` (FSM), `applyDefenderAttack` (→ `damageCreature`), `recipeStillSatisfied(world, defender)` (switch on recipeId), `teardownDefenders(world)`.
4. 4 teardown sites wired (`gameMode.ts:194-195/327-328`, `godlyActions.ts:76-77`, `world.ts:415`).
5. Recipe generalization: `registerRecipe(PENTAGRAM_RECIPE)` (close the existing gap) + a `runDefenderIgnition(world)` pass (clone `runSpawnerIgnition`) that iterates **defender recipes** in the registry and registers/dedups defenders on the live `defenders` map. Unordered type-set helper `componentMatchesTypeSet(world, anchorId, spec)` for the {Triangle,Circle}=Star detection.
6. Generic per-tick fire/slap poll in main.ts (clone spawner emit-poll `main.ts:1082-1119`): for each defender, revalidate recipe, advance FSM, on `nextFireTick` pick target via `findNearestEnemyCreatureFrom` and dispatch `DEFENDER_ATTACK`.
7. Save: `SerializedDefender` + `WorldSnapshot.defenders?` (additive-optional, emit when non-empty); serialize/deserialize + `nextDefenderId` advance (mirror spawners `save.ts:664-665,937-946`); strip nothing host-only beyond `targetCreatureId`/`nextFireTick`? (keep `nextFireTick` synced — windup rings need it; strip `targetCreatureId`).
8. `protocol.ts`: `PROTOCOL_VERSION 11→12`; add `REGISTER_DEFENDER`/`REMOVE_DEFENDER`/`DEFENDER_TICK`/`DEFENDER_ATTACK` to `KNOWN_GAME_ACTION_TYPES_RECORD` (host-internal; no new CLIENT_INTENT — defenders are auto-built from geometry, not a click intent, so the bump is for the synced `defenders` map + a stale v11 peer mis-handling it).
9. `runDefenderStress` HARD gate (`save.replay.test.ts`): two seeds, defenders register from geometry, tick/fire/kill, byte-identical; save round-trip a damaged + targeting defender.

### P3 — #9 Laser turret (on P2 substrate)
1. `godlyRecipes/laserTurret.ts`: predicate — a Line with `bonds.size===7`, each neighbor a Spiral, each bond `lookupCombo(Line,Spiral).resultName==='Whip'` (strict). `registerRecipe`; side-effect import in main.ts.
2. Constants: `TURRET_FIRE_INTERVAL_TICKS=1800`, `TURRET_WINDUP_RINGS=5`, `TURRET_ATTACK_RANGE` (~420), `TURRET_HP` high, `CREATURE_HIT_DAMAGE` reused.
3. Defender `kind:'turret'`: FSM idle→ (nextFireTick) → fire; target nearest enemy creature in range; `damageCreature` (goo or cloud).
4. VFX: `LASER_BEAM` effect (reuse `drawArcFlash` low-jitter, red) + windup rings derived from `nextFireTick` (DD5). `playLaserSFX` procedural.
5. `TurretRenderer` (clone `ChewerRenderer` Graphics pattern; original pencil turret: tripod + lens barrel + charge glow keyed to `nextFireTick`). Wire in main.ts (create/sync/clear).
6. Tests: recipe predicate (strict 1-Line-7-Spiral-Whip; rejects 6 or 8), fire cadence, target determinism, kill→goo/cloud.

### P4 — #10 HELGA princess (on P2 substrate; the articulated character)
1. `godlyRecipes/princessHelga.ts`: predicate — a Triangle hub with exactly 6 bonds, neighbors = exactly 3 Spirals (each `Triangle/Spiral`='Warped Anchor') + 3 Circles (each unordered {Triangle,Circle}='Star'), single connected component (`componentOf`). `registerRecipe`; side-effect import.
2. Constants: `PRINCESS_SLAP_INTERVAL_TICKS=90`, `PRINCESS_SLAP_RANGE=160`, `PRINCESS_WINDUP_TICKS`, `PRINCESS_HP` high.
3. Defender `kind:'princess'`: stationary; FSM IDLE/SIP → ACQUIRE (enemy creature in range) → WINDUP → SLAP (fire tick → `damageCreature` on `targetCreatureId`) → RECOVER → IDLE. Creatures only, never structures.
4. `PrincessRenderer` — articulated puppet rig (DD6): parts = skirt(dirndl), torso(bodice), head(braids+face), beer-arm(stein), slap-arm(hand), 2 legs; `helgaPose(state, ticksInState): PoseTransforms` pure fn (per-part rotation/offset/scale per state, interpolated; slap-arm swings windup→impact→recover; idle breathing + periodic beer-sip). Thick painterly outlines via Pixi Graphics. Slap impact = `SLAP_IMPACT` VFX (star-burst) + `playSlapSFX` (wet thwack). Optional: imagen-generated original face texture on the head part (additive).
5. Wire in main.ts (create/sync/clear). HELGA spec memory `helga-princess-spec`.
6. Tests: recipe predicate (3 WarpedAnchor + 3 Star single component; reject Wheel-direction confusion; reject Triangle hub with wrong neighbor mix), `helgaPose` determinism (pure fn, same (state,ticks)→same pose), slap cadence + kill.

### P5 (stretch) — G4 build-feel juice
- Bond-formation juice burst on a new bond (render-local, synced-tick deterministic) + in-world leader crown over the top-score seat. Pure render; additive-optional if any wire. Skipped → carry-forward if budget ≤ YELLOW.

## FIELD 4 — FILES (by priority)
- **P1:** `state/creatures/{creatureAI.ts, creature.ts, creatureAttack.ts}`, `constants.ts`, `main.ts`, `state/save.ts`, `render/creatureRenderer.ts`, `render/effects/` (lightning-cloud), `render/audioManager.ts`; `save.replay.test.ts`, creature tests.
- **P2:** `state/worldTypes.ts`, `state/world.ts`, `state/defenders/*`(new), `state/godlyRecipes/{index.ts,pentagram.ts,types.ts}`, `state/godlyOrchestration.ts`, `state/gameMode.ts`, `state/godlyActions.ts`, `main.ts`, `state/save.ts`, `net/protocol.ts`(bump), `constants.ts`; `save.replay.test.ts`(runDefenderStress), protocol test.
- **P3:** `state/godlyRecipes/laserTurret.ts`(new), `state/defenders/*`, `state/spawners/spawnerLifecycle.ts`(or defenderLifecycle switch), `constants.ts`, `main.ts`, `render/turretRenderer.ts`(new), `render/effects/laserBeam.ts`(new), `render/effectsRenderer.ts`, `render/lifetime.ts`, `render/audioManager.ts`; recipe + turret tests.
- **P4:** `state/godlyRecipes/princessHelga.ts`(new), `state/defenders/*`, `constants.ts`, `main.ts`, `render/princessRenderer.ts`(new), `render/helgaPose.ts`(new), `render/effects/slapImpact.ts`(new), `render/effectsRenderer.ts`, `render/audioManager.ts`, memory `helga-princess-spec`; recipe + pose tests. (optional `scripts/`/`public/godly/helga/` if generated texture.)
- **P5:** `render/` juice + crown; bond-formation hook.
- **Global:** `LOCKED_DECISIONS.md` (defenders + protocol 12 note), `BACKLOG.md`, `TOWER_DEFENSE_DESIGN.md`.

## FIELD 5 — TESTING (acceptance gates)
- **P1:** `findNearestEnemyCreatureFrom` determinism (lowest-id tie-break, range-gate); Voltkin kills a chewer (hp 1→0) + emits cloud; creature-target branch doesn't break bond path; **Voltkin replay re-baselined** (documented intentional divergence); save round-trip `targetCreatureId`.
- **P2:** defender register-from-geometry; `recipeStillSatisfied`; FSM tick determinism; `runDefenderStress` two-seed byte-identical (HARD gate); save round-trip (damaged + targeting defender + nextDefenderId advance); protocol test (defenders internal, version=12); teardown ×4 clears defenders.
- **P3:** strict laser recipe (1 Line + 7 Spiral Whips; reject 6/8); fire cadence (1800); target determinism; chewer→goo 1 hit / Voltkin→cloud 2 hits; windup rings derive from nextFireTick.
- **P4:** HELGA recipe (3 WarpedAnchor + 3 Star, single component; reject Wheel-direction + wrong mix); `helgaPose` pure-determinism (full state×ticks sweep); slap cadence + kill; never targets structures.
- **P5:** juice/crown render-local + (if wired) additive-optional round-trip.
- **Global:** `npm run build` exit 0 under **750 KiB** charter (early-warning <60 KiB headroom — raise charter not debug if breached, memory `bundle-cap-raise-dont-debug`); full vitest green; gating E2E green; **LIVE deploy verified `gh run list --workflow=deploy.yml` SUCCESS** per priority milestone (S101 lesson).

## FIELD 6 — RISKS & MITIGATIONS
- **R-determinism (CRITICAL):** every new sim path host-only, tick-based, no `Math.random`; sorted-id removal; `runDefenderStress` two-seed byte-identical is the HARD gate.
- **R-wire-split (highest trap, MF2):** death VFX (goo/cloud) + laser windup MUST be snapshot-derived, not transient-only, or the 1v1 joiner sees silent vanishes. → DD3/DD5.
- **R-Voltkin re-baseline:** #8 intentionally diverges Voltkin's locked replay → accepted, documented, re-baselined.
- **R-protocol:** one bump (11→12) for `defenders`. Internals in `KNOWN_GAME_ACTION_TYPES_RECORD`; no new CLIENT_INTENT.
- **R-teardown leak:** `defenders` wired to ALL 4 sites + the WIN `teardownDefenders` call.
- **R-bundle:** 2 new renderers (turret + HELGA puppet) are pure code (no atlas needed for the puppet) → modest JS growth; watch the 60 KiB early-warning; **raise charter, don't debug** if breached.
- **R-HELGA art robustness:** puppet rig (DD6) removes the gcp-vertex API dependency from the critical path; generated texture is optional/additive. Avoids the S96 twitch AND the API-flakiness failure mode.
- **R-combo order trap:** Star vs Wheel is the one order-dependent dual → detect Star by unordered {Triangle,Circle} type-set; Warped Anchor is Triangle→Spiral. Don't confuse with plain Anchor (Dot→Square).
- **R-recipe registry refactor:** registering pentagram + adding a defender-ignition pass must NOT change pentagram/chewer behavior → keep `runSpawnerIgnition` intact; add `runDefenderIgnition` alongside; pentagram tests stay green.
- **R-art/IP (CONSTITUTIONAL):** original only; no Peach/CtCD-character/franchise copy.
- **R-scope/budget:** 4 large priorities + stretch. Per-priority commit+deploy; if ORANGE (≥750K) finish the in-flight priority + `/handoff` with whatever shipped. P5 is explicitly budget-gated.

## FIELD 7 — ROLLBACK & COMPLETION
- **Rollback:** each priority an independent commit; revert by priority. VFX/audio additive (revert the case). Protocol 11→12 gated behind passing replay+protocol tests before commit.
- **Completion (per priority, COMPLETION PROTOCOL):** git commit+push → session-state (status, check_completed, check_method verbose, real_context tokens, checkpoint_commit SHA) → print ZERO line → reflexion entry → deploy-verify at milestone → next priority.
- **CHECK:** FULL tier = Triumvirate (RALPH + GROK-ANALYST + GEMINI-AUDITOR) on each shipped diff + runtime boot-then-smoke; END-OF-SESSION runtime audit (Rule 22) before `/handoff`. Ultracode: per-priority adversarial-verify workflow on the diff.

## FIELD 8 — DELIBERATION
3-way Council (Claude + Grok + Gemini), Battle Ledger, ≥3 challenges incl tool/quality, FULL tier (escalate to R2 only on divergence; owner pre-approved so single decisive round + PRIME-AUDIT acceptable), then PRIME-AUDIT (runtime-verifiability: boot-then-smoke for defenders/laser/slap/cloud; wire-split; replay re-baseline; HELGA-animation-bar honesty). A.0 satisfied by the 4-agent fresh mapping above.

---

## COUNCIL BATTLE LEDGER (Round 1) + PRIME-AUDIT DELTA — supersedes conflicting text above

**Grok-ANALYST:** REWORK — (1) Voltkin-death watcher unreliable at 10Hz; (2) Voltkin target priority backwards (creatures-first → abandons structures); (3) replay re-baseline violates the HARD gate; (4) serialization/host-only stripping underspecified, defenders must serialize sorted-by-id; (5) P2 clones instead of generalizing.
**Gemini-AUDITOR:** ADOPT-WITH-FIXES — (1) transient-VFX triggers (death-watcher + cadence beam/slap) incompatible with 10Hz; use snapshot STATE; (2) insta-fire-on-load bug (nextFireTick in the past → mass discharge); (3) sync all visually-relevant state; (4) protocol-bump scope; + endorses HELGA puppet rig ("lock this in") + recipe-break-only removal as a strong design.

**SYNTHESIS VERDICT: ADOPT-WITH-FIXES.** Sequencing (foundations-first) endorsed by both — no re-sequence. Eight must-fixes (MF) folded:

- **MF1 (CRITICAL — attack VFX is STATE-derived, not cadence-derived).** ADOPT Gemini. The laser beam + HELGA slap are transient events on a *persisting* entity → deriving from raw cadence is unreliable at 10Hz. FIX: the defender FSM `state` (`FIRE`/`SLAP`) is held for `VFX_VISIBLE_TICKS≈12` (≥2 snapshot intervals) and is **SYNCED**; the client renders the beam/slap whenever it observes that state. The FSM state IS the event bus — no separate queue needed for attacks.
- **MF2 (death VFX — KEEP render-driven diff; EVIDENCE-BASED PARTIAL OVERRULE of both reviewers).** Both flagged the "vanished & not-DESPAWNING" discriminator as 10Hz-unreliable, reasoning from a generic transient prior. **Override rationale:** (a) the prev/curr `world.creatures` diff is the *proven* S102 chewer-goo mechanism — reliable on host + 1v1 client, **zero wire/save surface** (S102 P3 reflexion); a removal is a *persistent* state change, always observable across snapshots, not a one-tick transient. (b) Natural Voltkin despawn passes through `DESPAWNING` for ~60 ticks = ~10 snapshots, so "last-seen LIVE state → gone" is a robust kill discriminator; the discriminator tracks last-seen STATE (renderer already caches per-id). Only failure = spawn-and-die inside one 6-tick window (creature barely existed) = acceptable, matches current chewer behavior. **Watch-item:** if playtest shows missed clouds, the logged fallback is Gemini's bounded synced `recentDeaths[]` queue. Do NOT regress the proven zero-wire pattern preemptively.
- **MF3 (CRITICAL — Voltkin target priority: BONDS primary, creatures OPPORTUNISTIC).** ADOPT Grok. Voltkin must NOT navigate toward distant chewers and abandon its job (destroy enemy structures). FIX: bond target = primary navigation; an enemy creature is zapped ONLY if already within `attackRange` (180) — i.e. "it swats chewers that wander into range while marching on the enemy base." Selection: if an enemy creature is in attackRange → attack it this tick; else pursue nearest enemy bond. Never path toward a creature.
- **MF4 (CRITICAL — determinism gate stays GREEN; only the golden behavior-snapshot re-baselines).** Resolve Grok's objection precisely: the **two-seed byte-identical gate MUST stay green** (same input → same output — never re-baselined). Existing **Voltkin-ONLY** golden replays (no enemy creatures present) stay byte-identical by construction (`findNearestEnemyCreature` returns null → identical path). ONLY new golden snapshots for scenarios that actually contain chewers-for-Voltkin-to-kill are new baselines, each independently proven deterministic via two seeds. No determinism is waived.
- **MF5 (CRITICAL — insta-fire-on-load).** ADOPT Gemini. On load, re-phase every defender: `nextFireTick = world.tick + (((nextFireTick - world.tick) % INTERVAL) + INTERVAL) % INTERVAL` (preserve relative phase, never fire on tick 0). Prevents the despawnAtTick=0 bug class (mass alpha-strike on load). Covered by a save/load stress assertion.
- **MF6 (deterministic serialization, sorted-by-id).** ADOPT Grok. `defenders` serialize sorted by id on BOTH save and snapshot; `nextDefenderId` advances past max loaded id. Synced defender fields = `{id,kind,owner,pos,recipeId,state,ticksInState,nextFireTick,targetCreatureId,hp}` (ALL synced — beam/windup need them). `Creature.targetCreatureId` stays **host-only stripped** (no creature-reticle in this game's visual language; the synced ATTACKING animation + victim-vanish-diff fully cover Voltkin-vs-chewer feedback → P1 needs NO bump). Protocol bump **11→12 = the `defenders` synced map only**.
- **MF7 (generalize, don't clone — bounded).** ADOPT Grok partially. Extract genuinely shared logic: ONE `findNearestEnemyCreatureFrom` (P1) used by Voltkin + both defenders; ONE "register-from-recipe + dedup on live map" ignition helper shared by spawner + defender passes; ONE `recipeStillSatisfied` switch. Do NOT over-merge spawners (emit creatures) and defenders (fire at creatures) into one mega-entity — different roles. Register the orphaned `PENTAGRAM_RECIPE` while there.
- **MF8 (defender hp stub + expanded stress).** ADOPT both nice-to-haves. Keep `Defender.hp` + a `damageDefender` stub routed like `damageCreature` so a future direct-attack balance lever needs no new protocol bump (recipe-break removal stays the v1 mechanism). `runDefenderStress` MUST include: a save→load cycle (assert no insta-fire, MF5), Voltkin+turret+princess co-resident, recipe-break removing a defender mid-fight, unordered {Triangle,Circle} combo detection, Voltkin rapid target-switch bond↔creature — all two-seed byte-identical.

**PRIME-AUDIT delta (self-audit, runtime-verifiability):**
- **Boot-then-smoke (MANDATORY live, not just unit):** in a running game — (a) a Voltkin summoned with enemy chewers nearby zaps a chewer that wanders within 180px while still advancing on enemy structures (NOT chasing distant chewers); chewer pops with goo. (b) Build a Line+7-Spiral turret → after ~30s it fires a visible beam that kills the nearest enemy creature; the 1v1 joiner sees the windup rings + beam + the kill VFX. (c) Build the HELGA recipe → she idles/sips, and when an enemy creature enters range she winds up + slaps it dead; the joiner sees the slap. (d) A Voltkin killed by turret/slap (2 hits) discombobulates into a lightning-cloud on BOTH peers.
- **Determinism gate per priority:** `save.replay.test.ts` GREEN before AND after each priority; `runDefenderStress` (MF8) is the HARD gate; every new entity list sorted by id before snapshot; audit every new code path for `Math.random`/`Date.now` (none).
- **Wire byte-budget:** the synced `defenders` map is the only new wire surface (additive-optional, emit-when-non-empty). `Creature.targetCreatureId` host-only = zero wire. Death/cloud VFX add ZERO wire (MF2 render-diff). Re-check the 10Hz full-snapshot budget with N defenders present.
- **HELGA animation-bar honesty (owner-critical):** the puppet rig must read as a *real articulated character* (distinct authored poses per state, a genuine windup→impact→recover slap arc, idle breathing + beer-sip) — NOT a single-sprite transform-twitch (the S96 rejection) and NOT a loop. Council endorsed the rig; the bar is met by multi-part authored poses, verified by the `helgaPose` state×ticks sweep + live eyes.

### SESSION 103 PRIORITIES (gate-flagged in session-state.json)
- **P1** — Creature-combat foundation + #8 Voltkin-vs-chewer (MF2/MF3/MF4; no protocol bump).
- **P2** — Generic Defender substrate + recipe generalization (MF1/MF5/MF6/MF7/MF8; PROTOCOL 11→12).
- **P3** — #9 Laser turret on the substrate (MF1 state-derived beam; windup from synced nextFireTick).
- **P4** — #10 HELGA princess — articulated puppet rig (MF1 SLAP state-derived; Council-locked rig).
- **P5** — (budget-gated GREEN) Tier-1 G4 build-feel juice; else carry-forward.
