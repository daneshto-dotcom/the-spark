# PDR — Session 102 — Tower-Defense Combat Overhaul (10-item playtest batch)

> **Tier:** FULL (>30K, new networked entities, protocol bump) · **Pipeline:** Session PDCA v2
> **Source:** owner playtest message 2026-06-24 (10 items) · **Status:** DRAFT → Council → PRIME-AUDIT → owner `go`
> **Discovery:** 11-agent mapping workflow (wf_75936d94-17e) — all file:line verified against source.

---

## FIELD 1 — OBJECTIVE

Make the live tower-defense fun and fair after the first real playtest. The pencil-chewers are
too oppressive and "wrong" in feel (lightning instead of gnawing, attacking from afar, ugly teeth,
no counter), NONET has an art + feedback gap, and two new defensive structures are wanted to round
out the counterplay loop. Ten owner items, grouped into four sequenced batches that build shared
foundations once and reuse them.

## FIELD 2 — SCOPE

**In-scope (this session — Batches 1–3, items 1–8):**
- B1 quick wins: #4 buck-teeth · #5 owl-b mask fade · #6 NONET correct/wrong SFX · #7 rebuild-verify
- B2 chewer feel: #3 chewer melee close-in · #2 gnaw audio (kill the lightning leak)
- B3 combat foundations + consumers: #8 Voltkin attacks chewers · #1 RAID chewer-kill (green goo + fly-splat)

**In-scope (next session — Batch 4, items 9–10), spec'd here for one approved design:**
- #9 Laser turret (Line+7 Spirals=7 Whips) · #10 Princess (3 Warped Anchors + 3 Stars)

**Out-of-scope:** delta-encoding the wire; raising CHEWER_MAX caps; G1b/G2/G3b/G4 Tier-1 roadmap;
the LOW pentagram build-hint UX (carry-forward).

**Recommended execution:** Batches 1–3 this session (8 items). Batch 4 (2× LARGE greenfield + original
art) as the immediate next session, on the HP + findNearestEnemyCreature + green-goo foundations laid here.

## FIELD 3 — APPROACH (per batch)

### Resolved owner decisions (defaults — confirm at `go`)
- **D1 chew cadence (per owner spec):** 1 attack = a 3-pulse "tchhht·tchhht·tchhht" gnaw; **5 attacks
  sever one connector**. Keep `CHEW_HITS=5`; every chew now audibly gnaws (today 4 are silent + 1 is
  lightning). Sever still lands on the 5th. No lightning, no crackle, no charge-tone for chewers.
- **D2:** chewer attacks no longer screen-shake; gnaw is **procedural** Web-Audio (no asset); chewer
  engages at true melee (~30–40px), not 180.
- **D3 RAID:** new **`RAID_BLAST`** action — key (R) + click → AoE radius pops **enemy** chewers only;
  costs **1 disruption charge** (mirrors Q-shrink / RMB-sever). Green-goo splat + fly-splat SFX.
- **D-goo unification:** a chewer death uses **green-goo + fly-splat for BOTH potato and RAID** (consistent;
  replaces the orange boom for chewer kills specifically — bomb/potato keep boom for everything else).
- **D5 owl:** regenerate a **wider** owl-b matte covering the wing span; accept a faint brief flame if
  wing/flame spans overlap (verify visually on the webm frames first).
- **D-HP:** add `hp` to `CreatureConfig` (chewer 1, Voltkin 2). **AoE kills (potato, RAID) = guaranteed
  despawn (ignore HP); single-target ranged (Voltkin zap, laser, slap) = −1 HP.** In B3, Voltkin hitting
  a chewer deals 1 → chewer (1 HP) dies; Voltkin's 2-HP only matters in B4.
- **D9 cadence:** `TURRET_FIRE_INTERVAL = 1800` ticks (30s); 5 windup rings at ~6s spacing during the
  interval; beam on fire. ("every 30s" + "5 rings" both honored.)
- **D9/D10 target:** "enemy spawn" = enemy **creatures** (chewers + Voltkin). Laser/slap kill chewer in 1,
  Voltkin in 2 → Voltkin death = discombobulated **lightning-cloud**, chewer death = green goo.
- **D9 strictness:** exactly 1 Line(deg 7) + 7 Spiral leaves (strict, pentagram-style).
- **D10 topology:** single connected component = a central Triangle hub bonded to 3 Spirals (3 Warped
  Anchors) + 3 Circles (3 Stars). Star detected by unordered {Triangle,Circle} type-set (don't force
  Star-vs-Wheel direction). Princess **stationary** (turret-like), slaps nearest enemy creature in range.
- **D-substrate:** ONE generic `Defender` entity (`kind:'turret'|'princess'`) for #9+#10.
- **D-territory:** turret & princess exempt from `isInsideEnemyTerritory`.
- **D-art (CONSTITUTIONAL):** chewer, turret, **princess all ORIGINAL** — NOT a Princess-Peach copy
  (memory `art-no-franchise-copying`; S95 Totoro incident). "Bavarian princess" / "Looney-Tunes laser"
  are *vibe cues* only. Original pencil/ink-and-graphite house style.

### BATCH 1 — Standalone quick wins (no shared foundation)
- **#4 teeth (TINY, render-only):** replace the `teeth=3` loop (`chewerRenderer.ts:283-302`, 6 small
  ivory squares) with **two big funny buck-teeth** hanging from the top lip (each ~`mw*0.55` wide,
  `BODY_R*0.9` tall, mirrored by `face`). Keep mouth frame/interior. Relax `chewerRenderer.test.ts:148`
  rect≥4→≥2; add `roundRect` to the GraphicsMock if used.
- **#5 owl-b mask (TINY, asset):** owl-b is the only guardian with a custom mask (`mask:'owl-b-mask'`,
  `sudokuOverlay.ts:343`); `owl-b-mask.png` opaque core is ~40% width vs the shared `spirit-mask.png`
  ~69%, so the wings get cropped to faint. Regenerate a wider matte (via `make_mask.py` larger horizontal
  core, or a less-aggressive alpha-stretch of spirit-mask) covering wing span (~x117..423 of 540) while
  still crushing the stray veo flame. **Verify by extracting owl-b.webm frames first** (wing/flame overlap).
- **#6 NONET SFX (TINY, render-local, zero netcode):** add `playNonetYey` (fast high up-chirps =
  chipmunk) + `playNonetOww` (one long low descending sad tone, original — NOT named "Eeyore") to
  `nonetJuice.ts` via the `blip` primitive. In `SudokuOverlay.onKey` '1'..'6' (`sudokuOverlay.ts:712-713`):
  `const correct = world.sudoku.puzzle.solution[selected] === Number(key)` → `correct ? playNonetYey()
  : playNonetOww()`, replacing the unconditional `playNonetPop()`. `puzzle.solution` is already on
  `world.sudoku` at render level on every peer.
- **#7 rebuild (NO CODE — verify only):** ignition de-dups on the **live `creatureSpawners` map**
  (`godlyOrchestration.ts:167-174`), NOT `godlyFiredThisMatch` (which only gates cinematics); rebuild
  already works (passing test `pentagram.test.ts:221-242`). Add a regression test for destroy→rebuild and
  confirm in playtest. Optional cleanup: dead `findSpawnerMatch`, stale STUB comment.

### BATCH 2 — Chewer feel (shared chewer FSM + audio; one replay re-baseline)
- **#3 close-in (SMALL):** (a) route `isWithinAttackRange` (`creatureAI.ts:275-279`) through
  `getCreatureConfig(creature.type).attackRange` instead of the hardcoded `VOLTKIN_ATTACK_RANGE_SQ`;
  lower `CHEWER_CONFIG.attackRange` to ~35 (true melee). (b) skip/redirect the global-`SPAWNER_POS`
  repulse in `computeSteeringAccel` (`creatureVerlet.ts:113-134`) for chewers. **Voltkin stays
  byte-identical (180²) via config** — never blanket-change the constant.
- **#2 gnaw audio (SMALL):** (2a) in `applyCreatureAttack` (`creatureAttack.ts:76-128`) branch on
  `creature.type==='chewer'`: suppress `ARC_FLASH`, dispatch `SEVER_BOND` with a new **`cause:'chewer'`**
  (add to the `BOND_SEVERED.cause` union, `effects.ts:117-130`); gate the screen-shake (`main.ts:1227`).
  (2b) make every chew emit an audible gnaw: add a `CHEW_BITE` case to `drainAudioEffects`
  (`audioManager.ts:987-1027`) → new `playGnawSFX` (procedural 3-pulse noise/filter burst modeled on
  `playFartSFX`, positional). Audio drain ignores the new `cause:'chewer'` (no lightning).

### BATCH 3 — Combat foundations + dependent kills (Foundations A+B+D; one protocol bump)
- **Foundation A — creature HP:** `hp` on `CreatureConfig` (Voltkin 2, chewer 1) + mutable `hp` on
  `Creature`, defaulted in `makeCreature`, round-tripped in save like `chewProgress`. AoE despawns ignore
  HP; ranged single-target decrement.
- **Foundation B — `findNearestEnemyCreature`:** pure helper in `creatureAI.ts` (inverse of
  `findNearestBondTarget`): scan `world.creatures`, enemy filter, `distSq`, lowest-`CreatureId` tie-break,
  range-gated. Used by Voltkin (B3) and turret/princess (B4).
- **Foundation D(goo) — `CREATURE_SPLAT`/green-goo VFX + fly-splat SFX:** new effect kind (clone
  `bombExplode.ts` → green palette + radial droplets) wired into all four switches (effects union,
  `effectsRenderer.draw`, `effectLifetime`, audio); **wire-mirrored** (1v1 opponent must see the kill).
  `playSplatSFX` procedural (noise burst + wet thud + high transient).
- **#8 Voltkin attacks chewers (MEDIUM):** add `targetCreatureId: CreatureId|null` to `Creature`;
  Voltkin pre-tick target selection tries `findNearestEnemyCreature` (and may prefer creatures or bonds —
  default: nearest of either, creatures first if in range); creature-target branch in `applyCreatureAttack`
  → `DESPAWN_CREATURE` (chewer 1 HP dies) + green goo. **Chewer half already correct** (enemyOnly, bonds
  only). **Intentionally breaks Voltkin's locked byte-equivalence → accepted regression + re-baseline.**
- **#1 RAID_BLAST (SMALL-MED):** new charge-gated action (mirror SHRINK_TERRITORY): `world.ts` action +
  dispatch case; `applyRaidBlast` (factor the "despawn chewers in radius, sorted-CreatureId,
  sourceSpawnerId-gated" loop into ONE shared helper also used by `applyPotatoDetonate` — no drifting
  copy); enemy-only; input in `controls.ts` (R key + cursor); `net/protocol.ts` CLIENT_INTENT + version
  bump; green goo + fly-splat per victim.

### BATCH 4 — Greenfield defenders (Foundations C+E, reuse A/B/D) — NEXT SESSION
- **Foundation C — generic `Defender`:** `defenders: Map<DefenderId,Defender>` + `nextDefenderId` on
  World; `defenders/defenderLifecycle.ts` (register/remove/`recipeStillSatisfied` switch/teardown × 4
  sites); `kind:'turret'|'princess'`; one fire/slap poll in `main.ts` (clone the spawner emit-poll
  `main.ts:1081-1119`). Save round-trip + nextId-advance + `defenders?` additive-optional wire.
- **Foundation E — recipe generalization:** generalize `runSpawnerIgnition` to iterate registered
  emitter recipes once (stop hardcoding `findAllPentagramAnchors`).
- **#9 laser turret:** recipe `laserTurret.ts` (1 Line deg-7 + 7 Spiral leaves = 7 Whips); fire every
  1800 ticks; 5 host-local windup rings; **wire-synced** red `LASER_BEAM` (reuse `drawArcFlash` low-jitter);
  kill nearest enemy creature (chewer→goo 1 hit; Voltkin→`LIGHTNING_CLOUD` 2 hits). Original turret art.
- **#10 princess:** recipe `princess.ts` (central Triangle hub: 3 Spirals=3 Warped Anchors + 3 Circles=3
  Stars); stationary; periodic `SLAP_IMPACT` on nearest enemy creature (creatures only, never structures);
  chewer 1 hit, Voltkin 2. **Original** fat-Bavarian princess art (NOT Peach).
- Protocol bump (the second), one teardown wiring, one save round-trip, byte-budget + replay-stress
  extension cover both #9 and #10.

## FIELD 4 — FILES (by batch)

- **B1:** `chewerRenderer.ts`(+test); `public/art/nonet/owl-b-mask.png`, `assets-source/nonet-video/make_mask.py`;
  `render/nonetJuice.ts`, `render/sudokuOverlay.ts`; new test in `state/godlyRecipes/pentagram.test.ts`.
- **B2:** `state/creatures/creatureAI.ts`, `physics/creatureVerlet.ts`, `state/creatures/voltkin-config.ts`,
  `state/creatures/creatureAttack.ts`, `game/effects.ts`, `render/audioManager.ts`, `main.ts`, `constants.ts`,
  `state/creatures/creatureLifecycle.ts`; replay-stress + creature tests.
- **B3:** `state/creatures/{creature.ts, creatureAI.ts, creatureAttack.ts, creatureLifecycle.ts, voltkin-config.ts}`,
  `main.ts`, `state/world.ts`, `state/disruptionManager.ts`, `state/potatoLifecycle.ts` (shared helper),
  `constants.ts`, `input/controls.ts`, `net/protocol.ts` (bump), `game/effects.ts`,
  `render/effects/creatureSplat.ts`(new), `render/effectsRenderer.ts`, `render/lifetime.ts`, `render/audioManager.ts`,
  `state/save.ts`; `save.replay.test.ts` (extend `runCreatureStress`), TD tests.
- **B4 (next session):** `state/worldTypes.ts`, `state/world.ts`, `state/defenders/*`(new),
  `state/godlyRecipes/{laserTurret.ts, princess.ts, types.ts, index.ts}`(new/edit),
  `state/godlyOrchestration.ts`, `main.ts`, `constants.ts`, `state/creatures/{creatureAI.ts, creature.ts, voltkin-config.ts}`,
  `state/save.ts`, `net/protocol.ts` (bump), `render/{turretRenderer.ts, princessRenderer.ts}`(new),
  `render/effects/{laserBeam.ts, turretWindupRing.ts, lightningCloud.ts, slapImpact.ts}`(new),
  `render/effectsRenderer.ts`, `render/lifetime.ts`.

## FIELD 5 — TESTING (acceptance gates)

- **B1:** teeth render test (≥2 incisors); NONET correct vs wrong fires the right synth (unit on the
  branch); destroy→rebuild spawner regression test; owl fix verified by extracted-frame visual + live.
- **B2:** chewer engages at melee range (unit on `isWithinAttackRange` per-config); chewer sever emits
  `cause:'chewer'` not lightning; `CHEW_BITE` audio case covered; **Voltkin replay byte-identical**
  (auto-delete @1200 / DESPAWN @1140 unchanged); chew still severs on the 5th.
- **B3:** HP decrement unit; `findNearestEnemyCreature` determinism (lowest-id tie-break); Voltkin kills a
  chewer (1 HP) + emits goo; RAID_BLAST charge-gated, enemy-only, sorted-id despawn; orphaned-chewer (dead
  spawner) still RAID-killable; **extend `runCreatureStress`** to tick chewer-vs-creature + HP + RAID path,
  byte-identical across two seeds; protocol test (RAID_BLAST in CLIENT_INTENT, TD internals not); save
  round-trip of `hp`/`targetCreatureId`; **re-baseline** the intentional Voltkin change.
- **B4:** recipe predicates (strict 1-Line-7-Spiral; 3 WarpedAnchor+3 Star single component; Star/Wheel
  order-set); fire/slap cadence; creature-HP kill (2-hit Voltkin → cloud); defender save/teardown×4/replay-
  stress/byte-budget; turret & princess targeting determinism.
- **Global:** `npm run build` exit 0 under the **750 KiB** charter (early-warning <60 KiB); full vitest green;
  gating E2E green; LIVE deploy verified via `gh run list --workflow=deploy.yml` SUCCESS (the S101 lesson).

## FIELD 6 — RISKS & MITIGATIONS

- **R-determinism (CRITICAL):** every new sim path host-only, tick-based, no `Math.random` (mix32),
  sorted-CreatureId removal, sever only via `SEVER_BOND`. → extend `runCreatureStress` is the HARD gate.
- **R-Voltkin-equivalence:** #3 must stay byte-identical (config-route); #8 intentionally diverges →
  accepted regression, re-baseline, documented.
- **R-wire-split (highest trap):** kill-confirming effects (goo on a RAID/Voltkin kill, later LASER_BEAM/
  SLAP) MUST wire-sync or the 1v1 joiner sees creatures vanish silently; windup rings + bulk cosmetics stay
  host-local. Watch the byte-budget (full-world 10Hz snapshot, no delta).
- **R-protocol:** one bump in B3 (RAID + hp + cause:'chewer'), one in B4 (defenders). Internals in
  `KNOWN_GAME_ACTION_TYPES_RECORD`, RAID in `CLIENT_INTENT_TYPES`.
- **R-potato coupling:** adding `hp` must NOT let a potato leave a creature alive → AoE = guaranteed
  despawn, explicit.
- **R-teardown leak:** any new Map wired to all FOUR sites (`world.ts:407`, `gameState.ts:126`,
  `godlyActions.ts:75` inline, gameMode return-to-title).
- **R-save insta-fire:** re-seed cadence from `world.tick` on load (the despawnAtTick=0 chewer-bug class).
- **R-bundle:** two B4 renderers will exceed headroom → **raise the charter, don't debug** (memory rule);
  share `drawArcFlash`/`bombExplode` scaffolding.
- **R-combo order trap (B4):** Star vs Wheel is the one order-dependent dual → detect by {Triangle,Circle}
  type-set. Don't confuse Warped Anchor (Tri+Spiral) with plain Anchor (Dot+Square).
- **R-art/IP (CONSTITUTIONAL):** original art only; no Peach/franchise copy.
- **R-scope/budget:** B4 is 2× LARGE → recommend next session; if owner wants all-now, accept likely spill.

## FIELD 7 — ROLLBACK & COMPLETION

- **Rollback:** each batch is an independent commit; revert by batch. Audio/VFX are additive (revert the
  effect case). Protocol bumps are the only hard-to-revert step — gate them behind passing replay + byte
  tests before commit.
- **Completion (per priority, COMPLETION PROTOCOL):** git commit+push → session-state (status, check_completed,
  check_method, real_context tokens, checkpoint_commit) → print ZERO line → reflexion entry → next priority.
- **CHECK:** FULL tier = Triumvirate (RALPH + GROK-ANALYST + GEMINI-AUDITOR) on the shipped diff; runtime
  boot-then-smoke for the new actions/effects; END-OF-SESSION runtime audit (Rule 22) before `/handoff`.

## FIELD 8 — DELIBERATION

3-way Council (Claude + Grok + Gemini), Battle Ledger, ≥3 challenges incl tool/quality, 2 rounds (FULL),
then PRIME-AUDIT (runtime-verifiability + wire-split + replay) before owner presentation. State-discovery
(A.0) satisfied by the 11-agent mapping workflow (all file:line + combo table + teardown sites + protocol
version + "RAID doesn't exist" verified against source).

---

## COUNCIL BATTLE LEDGER (Round 1) + PRIME-AUDIT DELTA — supersedes the batch structure above

**Grok-Analyst:** REWORK — foundations must precede consumers; host-local effects violate the
10Hz-snapshot contract; damage model under-budgeted; one shared area-damage helper needed.
**Gemini-Auditor:** ADOPT-WITH-FIXES — wire-sync visibility failure, incoherent HP model (two death
paths), B4 builds generic entity AFTER bespoke ones, RAID strictly-better-than-potato balance creep.
**Synthesis verdict: ADOPT-WITH-FIXES + re-sequence.** Six must-fixes (MF) folded in:

- **MF1 (CRITICAL — unify death path).** No "AoE ignores HP / despawn" parallel path. ONE
  `damageCreature(world, targetId, amount, cause, out)` reducer; ONE `applyAreaDamage(world, origin,
  radius, filter, amount, vfxFactory, out)` helper used by **potato, RAID, laser, princess**. AoE passes
  a lethal amount (≥max HP) so it always kills but flows the single deterministic path. Voltkin-on-chewer
  (#8) = single-target `damageCreature`. chewer HP 1, Voltkin HP 2.
- **MF2 (CRITICAL — client-visible feedback).** A non-simulating 1v1 client only renders the synced
  snapshot, and transient `world.effects` reach it unreliably (the rainbow-yell `~1/6` precedent). So:
  **death VFX (goo / lightning-cloud) is driven by the CLIENT diffing prev↔curr `world.creatures` and
  playing the splat on a removed creature** (reliable; renderer already caches prev/curr) — NOT by a
  transient wire effect. **The gnaw is client-derived from the synced creature `state==='ATTACKING'` +
  tick cadence** (reliable, zero wire cost), with the host-local `CHEW_BITE` as the host/vs-bots path.
  **Laser windup must be client-visible** → derive rings from the synced defender's `nextFireTick` −
  `world.tick` (reliable), not host-local ring effects. Net: prefer synced-STATE-derived VFX over
  transient effects for anything a remote player must perceive.
- **MF3 (CRITICAL — re-sequence; touch `applyCreatureAttack` ONCE).** Collapse old B2+B3 into ONE
  **creature-combat batch**: build Foundations A(hp)+B(findNearestEnemyCreature)+area-damage helper+
  D(goo/splat) FIRST, refactor `applyCreatureAttack` ONCE to a bond-OR-creature target, THEN land #2,#3,
  #8,#1 together with a SINGLE replay re-baseline + SINGLE protocol bump. In the structures batch build
  Foundation C (generic `Defender`) + E (recipe generalization) + the unordered-{type-set} combo detector
  FIRST, then implement #9 and #10 ON TOP of them (no throwaway bespoke entities).
- **MF4 (MAJOR — shared helper, no drift).** The "creatures in radius (sorted-CreatureId,
  sourceSpawnerId-gated)" loop exists once (`applyAreaDamage`); potato is refactored onto it in the same
  batch so there is never a second copy to drift.
- **MF5 (MAJOR — RAID balance).** RAID_BLAST must NOT be a strictly-superior, no-risk potato. Make it a
  **smaller radius** (`RAID_BLAST_RADIUS` < `POTATO_BLAST_RADIUS=110`, ~60) — a precise swat vs the
  potato's big owner-agnostic nuke. Documented; revisit in playtest.
- **MF6 (MAJOR — save round-trip + intent path tests).** (a) Save a damaged Voltkin (hp=1) → load → assert
  hp deserializes to 1, NOT the config default 2 (the despawnAtTick=0 bug class). (b) A CLIENT-dispatched
  RAID_BLAST reaches the host via CLIENT_INTENT and applies host-authoritatively (test the intent path).
  (c) `BOND_SEVERED.cause` exhaustiveness: adding `'chewer'` must not break any other `cause`-switch
  (audit `severBond.ts`, `disruptionManager.ts`, audio, effects renderer).

**PRIME-AUDIT delta (self-audit, runtime-verifiability):**
- Boot-then-smoke (MANDATORY live, not just unit): after the combat batch, in a running game — press R →
  a chewer actually pops with goo + fly-splat sound + 1 charge spent; a Voltkin summoned near an enemy
  chewer actually walks over and pops it; a chewer walks up to a connector (melee) and gnaws audibly ×3
  per attack, severs on the 5th, NO lightning, NO screen-shake.
- Determinism gate per foundation: run `save.replay.test.ts` GREEN before AND after; extend
  `runCreatureStress` to tick chewer-vs-creature + HP decrement + area-damage + RAID before the batch is
  called done (HARD gate); every new entity list sorted by id before snapshot; audit every new `mix32`
  call site (no `Math.random`).
- Wire byte-budget: the new `cause:'chewer'` rides the existing BOND_SEVERED (no new field); goo/gnaw add
  ZERO wire surface under MF2 (state-derived) → no byte-budget regression this batch. (Structures batch
  re-checks the budget with the synced `defenders` map.)

### FINAL BATCH STRUCTURE (this supersedes FIELD 3's B1–B4)
- **BATCH 1 — quick wins (items 4,5,6,7):** unchanged; no combat foundations; parallelizable.
- **BATCH 2 — creature combat (items 1,2,3,8):** Foundations A+B+area-damage+D, ONE `applyCreatureAttack`
  refactor, ONE protocol bump, ONE replay re-baseline. MF1/2/3/4/5/6 apply here.
- **BATCH 3 — greenfield defenders (items 9,10), NEXT SESSION:** Foundation C+E + combo detector FIRST,
  then #9 + #10 on top; second protocol bump; byte-budget + replay-stress + teardown×4 + save round-trip
  cover both.
- **Recommended this session:** Batches 1 + 2 (items 1–8). Batch 3 (9,10) next session.

---

## OWNER CORRECTIONS (2026-06-24, post-Council) — AUTHORITATIVE, supersede conflicting text above

**OC1 — "RAID" IS the existing player sever.** The owner calls deleting an enemy connector a "raid"
(= right-click → `SEVER_BOND{cause:'player'}`, costs 1 disruption charge). Item #1 is therefore NOT a new
key/AoE action — it **extends that same raid** to also hit creatures ("destroy a low-level spawn"):
- Right-click an enemy **connector** → delete it (unchanged).
- Right-click an enemy **chewer** → 1 raid kills it (green-goo splat + fly-splat SFX). 1 charge.
- Right-click an enemy **Voltkin** → 2 raids kill it → discombobulate into a lightning-cloud. 1 charge each.
- Implementation: the RMB handler picks a creature first (`pickCreature`), else a bond; a creature hit
  dispatches a new `RAID_CREATURE{creatureId,playerId}` CLIENT_INTENT (host-authoritative, charge-gated,
  → `damageCreature`). Replaces the earlier `RAID_BLAST` R-key/AoE design (MF5 radius balance is moot —
  it's now precise single-target, intrinsically costed by the charge economy).

**OC2 — UNIFIED HP/DAMAGE MODEL (coherent, logical, epic). Connectors AND creatures have HP.**
- **Connector (bond) HP = `CONNECTOR_HP = 5`.** A chew does `CHEW_DAMAGE = 1`; **5 chews sever a
  connector** (replaces the per-creature `chewProgress` accumulator — the HP now lives on the BOND, so
  multiple chewers stack damage and the connector can be **rendered as visibly damaged**). A player **raid**
  and a **Voltkin** attack still instant-sever a connector (decisive teardown; preserves the battle-tested
  `applySeverBond` cascade — bond HP is the chew accumulator + its visual, not a rewrite of sever).
- **Creature HP (in hits): chewer = 1, Voltkin = 2.** Voltkin is godly → twice as tough. Every
  single-target hit (a raid, a Voltkin zap on a chewer, and next session the laser beam + HELGA's slap)
  deals **1**. AoE (**potato**) = lethal despawn. So: 1 raid kills a chewer / 2 kill a Voltkin; the laser &
  slap kill a chewer in 1 and a Voltkin in 2 — all via the single `damageCreature` path (MF1).
- Constants: `CONNECTOR_HP=5`, `CHEW_DAMAGE=1` (CHEW_HITS=5 derived), `CHEWER_HP=1`, `VOLTKIN_HP=2`,
  `RAID_CREATURE_DAMAGE=1`, `VOLTKIN_VS_CREATURE_DAMAGE=1`; potato stays guaranteed-kill (lethal).
- New obligations from bond HP: `Bond.hp` round-trips in save (additive-optional, emit only when < max);
  wire-synced (the victim must SEE a connector being eaten) — additive-optional to bound bytes; the bond
  renderer shows damage (fade/cracks as hp→0); replay-stress ticks bond-hp decrement.

**OC3 — HELGA (the princess, item #10, NEXT SESSION) — locked character spec.**
- Name **HELGA**. Traditional Bavarian dress (dirndl), **a beer stein in one hand**, **slaps enemies with
  the other**. Art style = **Courage the Cowardly Dog** (thick painterly outlines, exaggerated, expressive
  — emulate the STYLE; the character is ORIGINAL, not a copied CtCD or Nintendo character; "Princess Peach"
  is dropped entirely).
- **"Full motoric and graphic functions — a real functioning character, NOT a looping gif."** HELGA must
  be a **properly articulated, state-driven character** (idle/sip-beer, target-acquire, wind-up, slap,
  react) — a rig/puppet or per-state hand-authored animation, NOT a single ambient video loop AND NOT a
  cheap procedural transform-twitch (the S96 "PowerPoint spin" rejection). Reconciles the prior
  `feedback-real-video-over-procedural-animation` note: the bar is a genuinely animated character, driven
  by game state. Pipeline TBD at Batch 3 (candidate: per-state veo/imagen frames → atlas, replay-safe via
  `(state,ticksInState)`; or a bone rig). Captured in memory + TOWER_DEFENSE_DESIGN.md for next session.

**Scope confirmation:** owner approved the full session batch. This session executes Batches 1 + 2
(items 1–8) with OC1+OC2 folded in; Batch 3 (items 9 laser turret + 10 HELGA) is the next session.

### SESSION 102 PRIORITIES (gate-flagged in session-state.json)
- **P1 — Quick wins** (items 4 teeth, 5 owl-b mask, 6 NONET sounds, 7 rebuild-verify).
- **P2 — HP/damage foundation + chewer feel** (CONNECTOR/creature HP, `damageCreature`/`applyAreaDamage`,
  ONE `applyCreatureAttack` refactor, item 3 melee, item 2 gnaw, green-goo VFX/SFX, damaged-bond render).
- **P3 — Raid + Voltkin-vs-chewer** (item 1 `RAID_CREATURE`, item 8 Voltkin targets chewers; protocol bump;
  final replay re-baseline + save round-trip + byte-budget check).
