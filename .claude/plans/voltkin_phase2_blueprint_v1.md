# Voltkin Phase 2 — Architecture Blueprint v1

**STATUS**: APPROVED (S24 P0 close, 2026-05-14)
**Council**: Full-tier 3-way (Claude + Grok + Gemini), R1 parallel → Quality Gate → R2 refinement (both ACCEPT ALL) → PRIME-AUDIT (8 audit deltas applied)
**Reference**: `.claude/plans/ACTIVE_PLAN_voltkin_phase2.md` (5-session plan, this blueprint is the S24 output)
**Implementation phase**: S25 (entity infra) → S26 (physics/locomotion) → S27 (AI + attack) → S28 (animation + 1v1 sync + polish)

---

## EXECUTIVE SUMMARY

Voltkin Phase 2 replaces the current "static sprite + synchronous SEVER_BOND cascade" payoff with an **autonomous creature actor** that lives in the game world for ~8 seconds after the cinematic intro, runs FSM-driven AI, integrates with existing Verlet physics, and severs bonds via discrete attack actions. The cinematic intro (Phase 1) stays untouched. The architecture generalizes to Anvil + Pac-Predator (S29+).

Total bundle budget: **+25 KB** (current 455 KB → projected 480 KB; 20 KB headroom remaining of 500 KB hard cap).

---

## 10 ARCHITECTURE DECISIONS

### Q1 — Physics integration
**DECISION**: Creature is a Verlet body (`pos: Vec2 + prevPos: Vec2`) in a NEW dedicated list `world.creatures: Map<CreatureId, Creature>`. NOT inserted into the bond solver's body list. Phase-through prims (no collision response).

**Rationale**: Reuses Contract #2's pos/prevPos shape for free implicit-velocity + replay determinism. Separate list keeps the bond constraint solver from accidentally pushing creatures around (creature has no bonds; the solver should never see it). Phase-through avoids the "stuck on prim cluster" problem and matches the "ethereal lightning being" fantasy.

**Implementation**:
- `src/state/world.ts` — add `creatures: Map<CreatureId, Creature>` to `World` interface
- `src/physics/creatureVerlet.ts` (new, ~40 LOC) — integrate creature `pos/prevPos` + steering force per substep
- Creature steering integrates inside the existing 8-substep loop (after bond solver, before next substep)
- Z-order: creatures rendered ABOVE prims in Pixi container so "phase-through" reads visually as "overlapping"

### Q2 — AI architecture
**DECISION**: Hand-rolled FSM with 4 states: `SPAWNING → SEEKING → ATTACKING → DESPAWNING`. Generic driver in `src/state/creatureFSM.ts`; per-creature transition tables in `src/state/creatures/voltkinFSM.ts`.

**Generic shape**:
```typescript
type CreatureState = string;  // creature-type-specific union
interface Creature {
  id: CreatureId;
  type: 'voltkin' | 'anvil' | 'pacPredator';
  ownerPlayerId: PlayerId;
  pos: Vec2;
  prevPos: Vec2;
  state: CreatureState;
  ticksInState: number;
  spawnedAtTick: number;
  despawnAtTick: number;
  targetBondId: BondId | null;
  // ... extensible per type
}
```

**Rationale**: FSM compiles to <2 KB. Bundle headroom (Contract #7) rules out BT libs. Reactive enough for "target deletes mid-approach → re-seek" via state re-entry. Generalizes to Anvil/Pac-Predator by swapping the transition table.

**Implementation**:
- `src/state/creatureFSM.ts` — generic `tickFSM(creature, world, transitionTable)` driver
- `src/state/creatures/voltkinFSM.ts` — Voltkin's transition table (4 states, ~6 transitions)
- Reducer dispatches `CREATURE_TICK { creatureId }` per frame; FSM driver mutates creature state in place

### Q3 — Sprite rig
**DECISION**: Single 512×512 spritesheet, 14 frames at 128×128 (4 idle + 4 walk + 4 attack + 2 despawn). Generated via Imagen side session in S28.

**S25/S26/S27 fallback**: existing `voltkin-zap.png` rendered as plain Pixi `Sprite` (not `AnimatedSprite`) — single-frame "static creature." Animation arrives in S28.

**S28 acceptance criterion**: working multi-frame walk + attack OR documented procedural-motion fallback (tint flicker + scale jitter) if Imagen frames don't unify visually.

**Implementation**:
- `assets-source/godly-voltkin/voltkin-sheet.png` + `voltkin-sheet.json` (S28)
- `src/render/creatureRenderer.ts` — picks frame based on `creature.state + creature.ticksInState`
- AnimationController class (~50 LOC, lives in `src/render/animationController.ts` — reusable for Anvil/PacPredator)

### Q4 — Player interaction
**DECISION**: Visual-only for Phase 2. Player's spark phases through creature (no collision). Creature ignores player entirely (no targeting, no damage, no awareness).

**Rationale**: PvE adds HP, hit detection, KO state, damage numbers — easily 200+ LOC and rebalances 1v1 (does triggering give you a "ranged tool" against opponent?). Godly framing is "I cast this thing, it does cool stuff, then it's gone" — Diablo-hammer style, not pet style. User vision's "reacts to environment" is satisfied by structure-change reactivity (target deletes → re-seek).

**Future**: revisitable post-Phase 2 if user wants PvE. Architecture allows adding `creature.hp` field without breaking serialization (additive).

### Q5 — Lifecycle gate
**DECISION**: Time-only. `creature.despawnAtTick = spawnedAtTick + 480` (8 seconds @ 60Hz). FSM enters `DESPAWNING` state at `currentTick === despawnAtTick - 60` (last 1 second).

**Rationale**: Determinism (replay + 1v1), simple reducer. HP gate without PvE has no damage source. Cooldown math unchanged.

**Timing**: cinematic 4s (T+0 → T+4s) → creature 8s active (T+4 → T+12s, last 1s is DESPAWNING) → GODLY_COMPLETE fires at T+12s. Total = 12 seconds (matches today's wall-clock budget = `cinematicMs + sustainedEffectMs`).

### Q6 — 1v1 net sync
**DECISION**: Host-authoritative full state in NetSnapshot. Client holds READ-ONLY mirror, runs NO creature simulation. Creatures piggyback existing snapshot cadence (no special per-entity stride).

**Snapshot shape per creature** (~36 bytes):
```typescript
{
  id: CreatureId,
  type: GodlyId,
  ownerPlayerId: PlayerId,
  pos: { x: number, y: number },
  prevPos: { x: number, y: number },
  state: string,
  ticksInState: number,
  targetBondId: BondId | null,
}
```

**Frame number is NOT in snapshot** — client derives frame locally from `state + ticksInState`. Drift impossible because both inputs ARE in snapshot.

**Rationale**: Contract #6 host-authority. Per-creature state is ~36 B × max 2 creatures = ~72 B per snapshot — negligible. Client running FSM is impossible because target-selection is RNG-driven (tie-break order).

**Wire compat**: extend snapshot schema with `creatures: []` (default empty for back-compat). Old clients ignore unknown field.

### Q7 — Spawn animation
**DECISION**: Sprite-handoff. At `T+cinematicMs` (4s), the cinematic's static `voltkin-zap.png` sprite is REPLACED in-place by the creature's Sprite/AnimatedSprite at the same pos/scale. The creature enters `SPAWNING` state for 60 ticks (1s) with a scale-pulse `1.0 → 1.15 → 1.0` and one "click" SFX (reuse voltkin-voice tail OR procedural short click).

**Skip behavior**: If user presses Space/Esc during cinematic, `cutsceneOverlay.skipIfActive` dispatches `SPAWN_CREATURE` IMMEDIATELY (no waiting). Creature lifetime stays 8s from spawn.

**Rationale**: Visual continuity (no pop). No "ground" concept in geometric puzzle space (rejected rise-from-ground). Cinematic-to-creature handoff is the moment the static "intro card" becomes a live actor.

**Implementation**: `cutsceneOverlay.onComplete` callback dispatches `SPAWN_CREATURE { type: 'voltkin', pos: centroid, ownerPlayerId: triggerer }`.

### Q8 — Despawn animation
**DECISION**: 60-tick `DESPAWNING` FSM state. During this state:
1. Creature stops attacking + stops seeking
2. Plays "power-down" animation (last 2 frames of spritesheet OR alpha-flicker as fallback)
3. Last 30 ticks (~500ms): sprite alpha tweens 1.0 → 0.0
4. At `currentTick === despawnAtTick`: dispatch `DESPAWN_CREATURE { id }` → removed from map → renderer cleans up

**Audio**: descending "voom" or reuse voltkin-voice tail at 50% volume during alpha-fade. No new asset.

**Rationale**: Symmetrical with spawn. Cinematic intro IS the spectacle — quiet despawn keeps visual rhythm. Final-burst rejected as "second cinematic in one trigger."

### Q9 — Attack range
**DECISION**: Ranged lightning arc. Attack radius = 180 px (~3× prim radius). Cadence: 1 attack per 60 ticks (1s). Lifetime: ~7 active seconds = ~7 attacks max (last 1s is DESPAWNING).

**Per attack**:
- FSM selects nearest enemy bond (or own if no enemy), within 180 px
- If none in range, FSM stays SEEKING and steers toward nearest target
- If in range, FSM transitions ATTACKING (60 ticks)
- ATTACKING dispatches `CREATURE_ATTACK { creatureId, bondId }` once
- Reducer rechecks bond exists; if not, no-op + FSM returns to SEEKING
- If exists, dispatch SEVER_BOND with `cause: 'creature'` + push `ARC_FLASH` effect (start=creature.pos, end=bond midpoint)

**Rationale**: Name = Voltkin (lightning canon). Voice line = "VOLT-KIIIN!" Ranged simplifies AI movement (just "get within 180 px"). Discrete dispatched actions preserve event sourcing.

**Implementation**:
- New action `CREATURE_ATTACK { creatureId, bondId }` (reducer in `src/state/creatures/creatureAttack.ts`)
- New effect kind `ARC_FLASH` in `src/game/effects.ts` (audio + visual)
- Renderer: `src/render/arcFlashRenderer.ts` draws Pixi Graphics polyline with glow filter

### Q10 — Multi-creature
**DECISION**: `world.creatures: Map<CreatureId, Creature>`. Max 1 creature per player asserted in `SPAWN_CREATURE` reducer. In 1v1, both players can each have a creature alive simultaneously.

**Rationale**: Cooldown is per-player (Contract #5) — both players can trigger independently. Hardcoded single slot would be a 1v1 race condition (Grok's R1 blind spot). Per-player-max-1 is the simplest invariant.

**Known limitation (v1)**: Two creatures may target the same bond → one severs it, the other's attack no-ops on recheck. Visible glitch (two arcs to one already-dead bond). Acceptable for v1; advanced target-arbitration can land in S28 polish if user notices.

### Q11 — Frame authority (PRIME-AUDIT Grok addition)
**DECISION**: Frame number is DERIVED on client from `creature.state + creature.ticksInState`. NOT serialized in snapshot.

**Rationale**: Saves bandwidth (~1 byte/creature). Drift impossible because both inputs ARE in snapshot. Pure render-layer concern.

### Q12 — Solo targeting semantics (Quality Gate gap)
**DECISION**: In solo mode, creature attacks player's OWN structures (since no enemy exists). This is the "consequence of summoning a godly" tax — encourages cooldown awareness + tactical placement.

**Document**: blueprint NOTES this behavior. If user objects post-S27 playtest, revise targeting logic to "idle wander" in solo as alternative.

---

## CARRY-FORWARD AUDIT FROM PRIME-AUDIT

### § S27 migration notes (Gap A: synchronous cascade deletion)

The existing `GODLY_TRIGGER` reducer in `src/state/world.ts:305-346` cascades SEVER_BOND on all bonds connected to `event.targetComponentPrimitiveIds`. With creature doing severance, this cascade is REDUNDANT.

**Phased migration**:
- **S25/S26**: KEEP synchronous cascade. Creature exists (S25) and moves (S26) but does NOT attack yet. Phase-1 payoff (visible explosions) remains intact while infrastructure builds up.
- **S27**: DELETE synchronous cascade as `CREATURE_ATTACK` ships. Creature now severs bonds discretely during its 8-second active window. Phase-1 cinematic still plays but the post-cinematic destruction is creature-driven.

**S27 test surgery required**:
- REMOVE: tests that assert `GODLY_TRIGGER` cascades SEVER_BOND on target component (these tests currently exist for the Phase-1 cascade)
- ADD: tests that assert `CREATURE_ATTACK` severs target bond + emits ARC_FLASH effect
- ADD: tests that assert FSM transitions from SEEKING → ATTACKING when target in range
- ADD: tests that assert FSM transitions ATTACKING → SEEKING when target bond no longer exists

**Estimated test churn**: ~5-8 tests removed, ~12-15 tests added. Net positive coverage.

### § Performance budget (PRIME-AUDIT Gap C extension)

**Steady-state**: ~80 prims, 1-2 creatures, FSM ticks at 60Hz per creature.
- Linear scan over `world.primitives` for nearest-bond query: 80 × 2 = 160 distance checks per FSM tick = 9,600 checks/sec → ~0.2 ms/sec. Negligible.

**Worst case**: 150 prims (late 1v1 game), 2 creatures.
- 150 × 2 = 300 distance checks per FSM tick = 18,000 checks/sec → ~1 ms/sec. Still negligible (frame budget is 16.6 ms).

**Threshold for spatial-grid optimization**: linear scan becomes a hot path only at >250 prims or >5 creatures. Defer spatial extension to S28+ polish if profiler flags it.

### § Edge cases / known issues v1

1. **Cinematic skip mid-intro**: User presses Space/Esc → `cutsceneOverlay.skipIfActive` callback dispatches `SPAWN_CREATURE` immediately. Creature lifetime = full 8s from skip moment. NOT adjusted for time elapsed.

2. **Connection drop mid-creature (1v1)**: `GODLY_ABORT` action handler (currently clears `pendingCinematics`) MUST ALSO dispatch `DESPAWN_CREATURE` for all creatures owned by all players. Clean teardown.

3. **Target bond mid-physics-break**: Bond solver may strain-break the target bond before creature's `CREATURE_ATTACK` reducer runs. Reducer MUST recheck bond exists; no-op if not + FSM returns to SEEKING.

4. **Multi-creature target conflict**: Two creatures target same bond → first attack severs, second no-ops on recheck. Documented limitation; revisit in S28 if user notices.

5. **Spawner zone collision**: Creatures phase-through prims but should NOT enter the spawner zone (spawner is sacred game space). FSM `SEEKING` state's steering applies a repulsion force when creature is within `SPAWNER_RADIUS + 50 px` of `(SPAWNER_CENTER_X, SPAWNER_CENTER_Y)`.

6. **Cooldown reset semantics**: Cooldown starts at GODLY_TRIGGER (T+0) and ends at T+60s = T+48s after creature despawn (which is at T+12s). Player can trigger again ~48 seconds after creature is gone. ✓ Unchanged from Phase 1.

### § Audio plan (PRIME-AUDIT extension)

| Event | Audio | Source | New asset cost |
|-------|-------|--------|----------------|
| Cinematic intro | `voltkin-voice.ogg` "VOLT-KIIIN!" | Existing | 0 |
| Spawn click (T+4s) | Reuse voltkin-voice tail OR procedural 100ms square-wave click | Web Audio synth | 0 |
| Per-attack zap | Procedural lightning crackle: short noise burst + low-pass envelope (~50 LOC) | Web Audio synth | 0 |
| Despawn fade | Reuse voltkin-voice tail at 50% volume + descending pitch | Existing + Web Audio param ramp | 0 |

**Total new audio assets**: ZERO. All Phase 2 audio is either reuse or procedural Web Audio. No WaveNet TTS cost. No OGG bundle growth.

### § Creature type config interface

Future-proofing for Anvil + Pac-Predator. Each creature type registers a config object:

```typescript
interface CreatureTypeConfig {
  readonly id: GodlyId;
  readonly spriteSheetUrl: string;
  readonly frameSize: { width: number; height: number };
  readonly animations: {
    idle: { frames: number[]; loop: boolean; ticksPerFrame: number };
    walk: { frames: number[]; loop: boolean; ticksPerFrame: number };
    attack: { frames: number[]; loop: boolean; ticksPerFrame: number };
    despawn: { frames: number[]; loop: boolean; ticksPerFrame: number };
  };
  readonly lifetimeTicks: number;
  readonly attackRange: number;
  readonly attackCadenceTicks: number;
  readonly fsmTransitions: TransitionTable;
}
```

Voltkin is the reference impl. Anvil/PacPredator implementations register their own config.

### § S25 acceptance criteria (PRIME-AUDIT specific)

1. `Creature` interface defined in `src/state/creatures/creature.ts`
2. `world.creatures: Map<CreatureId, Creature>` added to `World` interface
3. `SPAWN_CREATURE` + `DESPAWN_CREATURE` + `CREATURE_TICK` actions + reducers
4. Time-based despawn at 480 ticks (8s)
5. Static-sprite renderer (plain Pixi `Sprite` with existing `voltkin-zap.png`)
6. Spawn handoff: `cutsceneOverlay.onComplete` dispatches `SPAWN_CREATURE` at centroid
7. Despawn alpha tween over last 30 ticks
8. **`?debug=1` overlay extended**: shows active creatures list with `id / type / state / pos.x,y / ticksInState`
9. No movement, no AI, no attack, no spritesheet (deferred)
10. All 432 vitest tests still pass; ~6 new tests for spawn/tick/despawn

**S25 bundle delta target**: +8 KB (creature.ts + creatureFSM-driver + renderer + actions). Headroom 45-8 = 37 KB remaining for S26-S28.

### § S26 acceptance criteria

1. Verlet body integration (`src/physics/creatureVerlet.ts`)
2. Steering behaviors (seek, arrive, spawner-zone repulsion)
3. Smooth movement toward stub target (random point in world for testing)
4. Phase-through prims (no collision)
5. Spawner-zone repulsion verified
6. **Goal**: creature MOVES, looks alive even with stub AI
7. **S26 bundle delta target**: +5 KB. Cumulative S25+S26 = +13 KB. Headroom 32 KB remaining.

### § S27 acceptance criteria

1. FSM transitions wired: SPAWNING → SEEKING → ATTACKING → DESPAWNING
2. Target selection: nearest enemy bond, fallback to own bond if no enemy exists (solo always falls back)
3. `CREATURE_ATTACK` action + reducer + ARC_FLASH effect
4. SEVER_BOND with `cause: 'creature'` dispatched from CREATURE_ATTACK
5. Bond-existence recheck in reducer
6. **DELETE** synchronous SEVER_BOND cascade in `GODLY_TRIGGER` reducer (migration)
7. Tests: ~12-15 new, ~5-8 removed (cascade tests)
8. **S27 bundle delta target**: +8 KB (AI + ARC_FLASH + audio synth). Cumulative = +21 KB. Headroom 24 KB.

### § S28 acceptance criteria

1. Spritesheet generated via Imagen side session (14 frames, 128×128 each)
2. AnimationController class (~50 LOC, reusable for Anvil/PacPredator)
3. AnimatedSprite swap in `creatureRenderer.ts`
4. NetSnapshot v2 schema extension with `creatures: []`
5. 1v1 net sync verified (host runs FSM, client renders mirror only)
6. Polish: spawn scale-pulse, despawn power-down, attack arc visual + audio
7. Acceptance: in-game playtest looks polished + 1v1 retest with brother (S24 P1 carry)
8. **S28 bundle delta target**: +4 KB (renderer + snapshot extension + animation controller).
9. **Spritesheet asset**: ~14 KB compressed (PNG-8 or WebP).
10. **Cumulative total**: code +25 KB + asset +14 KB = 39 KB. Final projected bundle: 494 KB / 500 KB hard cap. **6 KB headroom** for emergencies.

---

## ABSOLUTE NON-NEGOTIABLES (carried from ACTIVE_PLAN)

1. Build stays under Vite's 500 KB hard limit. **Projected final: 494 KB. Margin: 6 KB.**
2. Solo + 1v1 net sync both work end-to-end.
3. Cinematic intro + voice line stays as Phase 1 currently ships.
4. No regression in existing 432 vitest tests.
5. Existing Voltkin trigger predicate unchanged (S23 cursor fix locked).
6. New tests for every new game-state action.
7. Cursor comparator MUST be `<` not `<=` (S23 reflexion lesson).

---

## TRACEABILITY

- **S23 P4 lesson**: cursor off-by-one bug — applied to all new effect-cursor code in S27 ARC_FLASH renderer.
- **S22 P3 D2-D7 LOCKED contracts**: respected throughout (godly architecture base).
- **S20 P1 sparkLifecycle extraction pattern**: creatureLifecycle.ts follows same shape (extracted reducer module).
- **S19 P2 disruptionManager pattern**: creatureAttack.ts will follow same shape.

---

## DELIBERATION ARTIFACTS

- **R1 outputs**: Grok (~5K tokens, dense + specific), Gemini (~5.5K tokens, thorough + reasoned), Claude (~3.5K tokens, codebase-grounded).
- **Quality Gate**: 5 high-stakes disagreements identified (Q1, Q6, Q7, Q8, Q10), 5 gaps surfaced (cascade migration, solo targeting, spatial grid, handoff timing, frame authority).
- **R2 refinement**: both Grok and Gemini "ACCEPT ALL" on Quality Gate resolutions.
- **PRIME-AUDIT**: 8 additive deltas applied (S27 migration notes, performance budget, edge cases, creature config interface, audio plan, S25 acceptance, S25 renderer fallback, S28 acceptance criterion).

**All artifacts archived in the conversation transcript** (S24 main session).

---

## OPEN QUESTIONS (FOR USER PRE-S25)

1. **Solo targeting**: confirm creature attacks player's OWN structures in solo (consequence-of-summoning tax). Alternative: "idle wander" in solo. Recommendation: own-structure attacks (already in blueprint).

2. **Despawn audio source**: confirm reuse of voltkin-voice tail at 50% vs procedural descending tone. Recommendation: tail reuse (zero asset cost).

3. **Spritesheet timing**: confirm S28 Imagen side-session is acceptable timing OR move sprite generation earlier (e.g., S26) for buffer. Recommendation: S28 (per current 5-session plan).

---

## NEXT-SESSION CHECKLIST (S25 boot)

- [ ] Read this blueprint in full
- [ ] Confirm 3 open questions with user OR proceed with recommended answers
- [ ] Standard-tier PDR for S25 P0 (creature scaffold) — likely ~15-20K tokens
- [ ] Council deliberation for S25 P0 (Standard tier, 1 round)
- [ ] Implement S25 P0 per § "S25 acceptance criteria" above
