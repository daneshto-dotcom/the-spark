# ACTIVE PLAN — Voltkin Phase 2 (Autonomous Creature Actor)

**STATUS: IN-PROGRESS** — created 2026-05-13 at S23 close. S24 ✓ blueprint + S25 ✓ entity infra + S26 ✓ physics/locomotion + **S27 ✓ AI + attack + cascade DELETION**. S28 remains.

**S24 BLUEPRINT COMPLETE** — read `.claude/plans/voltkin_phase2_blueprint_v1.md` for the approved architecture. Full-tier Council (R1 parallel → Quality Gate → R2 ACCEPT ALL → PRIME-AUDIT 8 deltas). All 10 open questions answered. Cumulative bundle budget +25 KB code + 14 KB asset (~6 KB headroom). 3 open questions LOCKED at S25 P1.

**S25 ✓ COMPLETE 2026-05-14** (commit d191bf0): Voltkin Phase 2A entity scaffold. Creature interface + world.creatures Map + 3 reducers + plain-Sprite renderer + debug overlay. Bundle +3.30 KB.

**S26 ✓ COMPLETE 2026-05-14** (commit 902e430): Voltkin Phase 2B physics + locomotion. NEW src/physics/creatureVerlet.ts (creatureVerletStep + computeSteeringAccel + seekForce + arriveForce + repulseForce + computeStubTargetPos + 4 constants). targetPos: Vec2 field added to Creature; SPAWNING → SEEKING transition at ticksInState >= 60; substep-loop physics integration host-gated. Bundle +1.18 KB (cumulative +4.48 KB; 40.52 KB headroom remaining).

**S27 ✓ COMPLETE 2026-05-14** (commit ea4b459): Voltkin Phase 2C AI + attack + cascade DELETION migration. NEW src/state/creatures/creatureAI.ts (findNearestBondTarget + bondMidpoint + isWithinAttackRange + isEnemyBond + distSq) + src/state/creatures/creatureAttack.ts (applyCreatureAttack reducer re-dispatching SEVER_BOND with cause='creature' per Council Q1 B UNANIMOUS) + src/render/effects/arcFlash.ts (jittered polyline + halo + arcSeed determinism for multi-creature same-tick uniqueness per CHECK Triumvirate Grok C4 + Gemini G5 UNANIMOUS). targetBondId field added to Creature; SEEKING↔ATTACKING FSM transitions + Δ4 wind-up abort (`<=` boundary per CHECK G3); GODLY_TRIGGER cascade DELETED (26 LOC removed) — bond severance now creature-driven via ~7 attacks at 1/sec over 8s active window. ARC_FLASH visual feedback per attack. Bundle +2.39 KB (cumulative +6.77 KB; 38.13 KB headroom for S28).

**READ AT S28 BOOT**: `.claude/plans/voltkin_phase2_blueprint_v1.md` § "S28 acceptance criteria" first, then this file. S28 ships spritesheet (Imagen side-session) + AnimatedSprite swap + NetSnapshot v2 (creatures: []) + 1v1 net sync + spawn scale-pulse + despawn power-down + procedural Web Audio zap synth (S27 Δ6 carry-forward) + attack wind-up animation frames (S27 Δ7 carry-forward) + wall-clock-state-mutation refactor → tick-deterministic pending-spawn flag.

---

## OBJECTIVE

Replace Voltkin's current "cinematic + static sprite stamp + SEVER_BOND cascade" implementation with an **autonomous creature actor** that lives in the game world for ~10 seconds, animates in real time, runs AI behavior (target selection → approach → attack), and feels like a real entity with physics and presence.

## USER VISION (verbatim, S23 final message — 2026-05-13)

> "a real game entity/actor that comes to life for like 10 sec. a creature that actually appears in game world, not only becomes visible as a 'picture' but runs as an animation in real time with realistic motion and moves around via in built physics or navigation, and runs active behavior/AI (attacking/zapping enemy structures (if there are no enemy structures then your own). he will attack, follow, pathfind and react to the environment!"

## SCOPE — what this pulls forward from S25+ backlog

This is the **Pac-Predator architecture** (previously slated for S25+ as "the biggest build") applied to **Voltkin first**. Voltkin gets the first creature-actor implementation; Anvil and Pac-Predator follow the same architecture pattern.

**The current Phase 1 implementation is NOT discarded** — the cinematic + voice line remains as the dramatic INTRO. After the cinematic ends, the creature spawns and takes over.

---

## 5-SESSION STRUCTURE

### S24 — DELIBERATION + BLUEPRINT (zero code) — ✅ COMPLETE 2026-05-14
**Full-tier Council** (Claude + Grok + Gemini, 2 rounds + Quality Gate + R2 synthesis + PRIME-AUDIT). Output: `.claude/plans/voltkin_phase2_blueprint_v1.md`. Council ran clean: R1 parallel (~14K tokens model output), Quality Gate (5 disagreements + 5 gaps surfaced, including Grok blind spot on per-player cooldown), R2 refinement (both ACCEPT ALL), PRIME-AUDIT (8 additive deltas → blueprint §s).

Original scope covered:

- **Entity model**: `Creature` interface (id, position, velocity, hp, behavior state, target, animation frame, lifespan ticks). New `world.creatures: Map<CreatureId, Creature>`.
- **Spawn flow**: cinematic ends → spawn creature at target structure's centroid → 10s lifecycle starts.
- **Despawn**: timeout / hp depletion / explicit GODLY_COMPLETE. Wire into existing godly cooldown.
- **Physics integration**: does the creature integrate with existing verlet physics? Or have its own kinematic locomotion? Soft-body or rigid-point? Collision semantics (eats prims? severs bonds?).
- **AI behavior**: target selection (enemy structures preferred, fallback to player's own), approach (steering / pathfinding / BFS over spatial grid?), attack action (zap = SEVER_BOND on adjacent bond within attack range?). Behavior tree vs FSM vs HTN — decide.
- **Visual rig**: current `voltkin-zap.png` is a single static frame. Need walk cycle / attack cycle / idle. **Imagen spritesheet via side session?** Or procedural transform on a single sprite? Per-frame PNG sequence? Decide.
- **Audio**: voltkin-voice.ogg currently plays once on intro. Per-attack zap sound? Footstep? Death/despawn sound? Generate via WaveNet TTS or proceduralWeb Audio?
- **Net sync (1v1)**: host-authoritative creature state. NetSnapshot extension to include creature positions + behavior state. Client-side interpolation.
- **Player interaction**: what happens when player's spark collides with the creature? With its zap? Can player attack the creature back (PvE) or is it purely visual?
- **Performance**: how many creatures can coexist? AI tick rate budget (every-frame vs every-N-frames). Spatial grid integration cost.
- **Codex page**: codex currently shows the static sprite. Should show animated preview? Add behavior description?

### S25 — Phase 2A: Creature entity infrastructure
- `src/game/creature.ts` — Creature type + factory + makeCreatureFromGodlyMatch
- `src/state/creatureLifecycle.ts` — SPAWN_CREATURE / DESPAWN_CREATURE dispatch handlers + tick advance
- `src/state/world.ts` — `world.creatures` map + tick hook + integration with existing dispatch
- `src/render/creatureRenderer.ts` — replaces static sprite display with creature-driven render
- Cinematic ends → SPAWN_CREATURE dispatched → creature exists in world
- Test: trigger Voltkin, see creature spawn at chain target, exists for 10s, despawns cleanly
- **Goal**: creature exists in world state, renders as static sprite at target.pos, despawns after 10s. **No movement, no AI yet.**

### S26 — Phase 2B: Physics + locomotion
- Position integration (verlet or separate kinematic system)
- Direction / heading vector
- Collision detection vs prims + bonds (read-only first; severing comes in Phase 2C)
- Spatial grid registration so collision queries are fast
- Smooth movement (steering behaviors / lerp toward target / pathfinding stub)
- Test: creature wanders toward a randomly-picked target point, respects play-area bounds, doesn't penetrate prims
- **Goal**: creature MOVES, looks alive even with stub AI

### S27 — Phase 2C: AI behavior
- Target selection: find enemy structure (1v1) → fallback to player's own
- Approach: pathfinding or steering toward target prim
- Attack action: zap nearest bond within attack range (SEVER_BOND with cause='creature')
- React to environment: avoid spawner zone, react to bond severs / prim deletions
- Test: creature seeks targets, attacks them, structures get severed by attacks
- **Goal**: creature feels intelligent, makes visible decisions

### S28 — Phase 2D: Sprite animation + polish + 1v1 sync
- Sprite frames (Imagen side session if needed for walk/attack/idle frames)
- Animation state machine (idle / walk / attack / hurt-react)
- Per-attack zap visual (electric arc to target bond) + audio
- NetSnapshot creature sync for 1v1
- Polish: screen shake on attack, smoke trail, particle effects
- Test: in-game playtest looks polished, in-game vibe matches the design brief
- **Goal**: ship-ready, feels alive, user-approved

---

## KEY OPEN QUESTIONS (for S24 Council to answer)

1. **Physics**: shared verlet or separate kinematic? Cost/benefit of each.
2. **AI architecture**: behavior tree (composable, testable) vs FSM (simple, fast) vs scripted sequence (predictable, brittle).
3. **Sprite rig**: spritesheet (one PNG, frames laid out grid) vs per-frame PNGs vs procedural transform (rotation/scale on single sprite).
4. **Player interaction**: PvE (player can damage creature) vs visual-only (creature acts on structures, ignores player). Affects 1v1 balance.
5. **Lifecycle gate**: time-based (10s) OR HP-based OR both?
6. **1v1 net sync**: full creature state per snapshot (heavy) OR delta (complex). Tied to NetSnapshot v2.
7. **Spawn animation**: instant pop, fade-in, materialize from light, or rise-from-ground? Tied to cinematic-to-creature handoff.
8. **Despawn animation**: dissolve, retreat, explode, fade?
9. **Attack range**: melee (touch bond) or ranged (lightning arc to bond)?
10. **Multi-creature**: 1 at a time, OR could Anvil + Voltkin coexist?

---

## PRIOR ART / READING LIST (for S24 boot)

- `src/physics/verlet.ts`, `src/physics/bonds.ts`, `src/physics/spatial.ts` — existing physics
- `src/state/world.ts`, `src/state/godlyRecipes/types.ts` — existing dispatch + recipe contract
- `src/render/effectsRenderer.ts`, `src/render/structureRenderer.ts` — existing render pipeline
- `src/state/godlyRecipes/voltkin.ts` — current trigger predicate (don't touch)
- `src/render/cutsceneOverlay.ts` — current cinematic playback
- `src/state/godlyCooldown.ts` — current cooldown mechanism
- `assets-source/godly-voltkin/` — current asset pack + canonical sprite

---

## ABSOLUTE NON-NEGOTIABLES

1. Build stays under Vite's 500 KB hard limit (current 455 KB — 45 KB headroom).
2. Solo + 1v1 net sync both work end-to-end.
3. Cinematic intro + voice line stays as Phase 1 currently ships (don't break what works).
4. No regression in existing 432 vitest tests.
5. Existing Voltkin trigger predicate unchanged (S23 cursor fix is locked).
6. New tests for every new game-state action (SPAWN_CREATURE, DESPAWN_CREATURE, CREATURE_TICK, CREATURE_ATTACK).

---

## SUCCESS CRITERIA (Phase 2 final, user-facing)

User plays the game, builds SQ4-TR4 chain, sees:
1. Cinematic intro (Phase 1, unchanged)
2. Voltkin creature **spawns** at chain target (NEW Phase 2)
3. Creature **looks alive**: animates, moves with purpose
4. Creature **finds** something to attack (enemy structure or own if none)
5. Creature **attacks**: severs bonds with visible zap + audio
6. Creature **reacts**: avoids spawner zone, adjusts course on target deletion
7. After ~10s (or HP-zero): creature **despawns** cleanly (animated exit)
8. Cooldown applies (60s) before re-trigger

---

## NEXT-SESSION CHECKLIST (S24 boot)

- [ ] Read this entire file before anything else.
- [ ] Read `reflexion_log.md` S23 entries (cursor fix, debug-overlay-as-diagnostic, PRIME-AUDIT-Δ1).
- [ ] Read the prior-art file list above (skim, not deep-read).
- [ ] Open Full-tier Council deliberation. Present scope. Get R1 from Claude + Grok + Gemini parallel. Quality Gate. R2 synthesis. PRIME-AUDIT.
- [ ] Produce: detailed architecture blueprint in `.claude/plans/voltkin_phase2_blueprint_v1.md` (this file evolves into that on S24 close, OR a new file is created and this one references it).
- [ ] Get user-approved blueprint before S25 begins.
- [ ] **ZERO CODE this session.** Pure deliberation + design.

---

## TRACEABILITY (S23 prerequisites — all done)

- ✅ S23 P1: Voltkin recipe rewritten to strict SQ4-TR4 typed chain
- ✅ S23 P2: debug overlay shipped for runtime diagnostic
- ✅ S23 P3: predicate triggerer-fallback + audio call counters
- ✅ S23 P4: cursor `<=` → `<` bug fix — Voltkin fires + SFX works
- ✅ S23 close: Phase 1 (cinematic + sprite stamp + SEVER cascade) ships and works end-to-end

Phase 2 builds ON TOP of working Phase 1, not in place of it.
