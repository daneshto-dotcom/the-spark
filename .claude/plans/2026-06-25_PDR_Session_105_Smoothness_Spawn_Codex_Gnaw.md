# PDR — Session 105 (BATCH, FULL tier)
**Smoothness-regardless-of-host · Random+faster spawns · Codex exact recipes · Gnaw reliability**

Date: 2026-06-25 · Branch: master · Base commit: ae07c75
Owner approval: **EXPLICIT** — "the all inclusive broad and targeting PDR is APPROVED ... work session to the best of your ability." (`unlock_source: user`)

---

## CONTEXT (owner playtest — quickmatch with a friend)
1. **Lag asymmetry** — owner (Player One) lagged badly; friend (Player Two) smooth.
   Root cause (verified): host-authoritative model — the HOST runs the full Verlet sim
   + all entity polls + 10Hz full-world serialization ON the render thread; the client
   only renders interpolated 10Hz snapshots (`main.ts:990-1049`, `net/sync.ts:13-17`).
   The S100-S104 TD entities grew the host's per-frame cost → host FPS drops.
2. **Chewers gnaw silently** — synth + FSM are correct (`audioManager.playGnawSFX`,
   chewer holds ATTACKING 300 ticks, gate fires ~5×/chew on host). Suspect: chewers
   stayed SEEKING (hop makes the mouth gape — *looks* like chewing while idle), gnaw
   too quiet/sparse, and/or `ticksInState` not wired for the client.
3. **Line + 4 Spirals → no laser torrent** — BY DESIGN: recipe needs 1 Line + **7**
   Spirals (`laserTurret.ts:31`). Pure discoverability gap: the codex hides the recipe
   behind an unlock ("??? / build it to reveal", `codexOverlay.ts:270`) so you can't
   check requirements before building. The turret already renders a charging lens when
   built correctly (`turretRenderer.ts:115`).

Owner directives added this turn:
- **Codex exact recipes** for godlies, towers, connectors — "so we can check requirements".
- **Spawns ~20% quicker + fully randomized** (today every match replays the identical
  sequence: `main.ts:329 SEED = 0xc0ffee` hardcoded → "always square/triangle/square").
- **Smooth no matter who hosts; best + scalable for future real players.**

---

## P1 — Fully-random + 20%-faster spark spawning  (Standard; determinism-critical)
**OBJECTIVE** Each match gets a different, unpredictable spawn sequence; primitives arrive ~20% sooner.
**ROOT CAUSE** `ALL_SPARK_TYPES` (6 shapes) + `rngPick` are already random, but the spawner RNG is
seeded with a hardcoded constant `0xc0ffee` at module-init and never reseeded → identical sequence
every match. λ `SPAWN_RATE_PER_SECOND = 0.15` (LOCKED Item 3).
**SCOPE**
- `constants.ts`: `SPAWN_RATE_PER_SECOND` 0.15 → **0.1875** (×1.25 = 20% shorter interarrival).
  **LOCKED_DECISIONS Item 3 amendment — owner-authorized this session.** Keep the `__TEST_*__` seam.
- `game/spawner.ts`: add `reseed(baseSeed)` — `setState` all 5 streams (same xor-derivation as main.ts)
  + re-sample countdowns. Mirrors the existing `getState/restoreState` (S79 P5).
- `main.ts`: derive the base seed from a fresh random draw (host-local, browser `crypto`/`Math.random`);
  call `spawner.reseed(seed)` + set `world.rngSeed` at **START_GAME** (host path) so every match differs.
**DETERMINISM GUARDRAIL (the one risk)** The spawner + world sim are **host-only** (`!isClient` gates
`stepPhysics`); the client receives sparks via snapshots and never runs the spawner → **no wire change,
no PROTOCOL bump, no desync**. Replay tests pin their OWN seeds (`save.replay.test.ts` uses 0xc0ffee/
0xbeef/…), not main.ts's → unaffected. Saved-game replay captures spawner rng *words* via `getState`,
not the seed → reproducible. tickdeterminism (no wall-clock in sim) preserved — randomness is drawn
ONCE at match start, then the seeded stream is fully deterministic.
**TESTING** new spawner.reseed test (two different base seeds → different first-N type sequences;
same base seed → identical); existing replay/spawner determinism gates stay green; tsc 0; vitest all green.

## P2 — Codex EXACT recipes + reveal-when-locked  (Standard)  ← the real fix for bug #3
**OBJECTIVE** Every godly / tower / connector shows its EXACT build recipe, viewable BEFORE you've built it.
**SCOPE**
- `main.ts recipeHint()`: make ALL hints exact + unambiguous (counts + arrangement):
  - voltkin → "4 Squares then 4 Triangles bonded in ONE straight line (8 in a row, nothing else attached)."
  - pentagram → "5 Triangles bonded in a closed ring (each Triangle bonds exactly 2 others)."
  - laserTurret → "1 Line + 7 Spirals, every Spiral bonded to the Line (8 shapes). Beams enemy chewers."
  - helga → "1 Triangle hub + 3 Spirals + 3 Circles, all 6 bonded to the hub. She slaps chewers." (verify princessHelga.ts)
  - NONET → exact (already).
- `render/codexOverlay.ts`: **show the recipeHint on LOCKED tiles too** (keep name/sprite as the
  surprise: locked tile shows "??? — <recipe>" so requirements are checkable pre-build). Combos tab
  already shows glyph→glyph=name; add the magic-effect line so connectors read as exact recipes.
**TESTING** codex opens (G+C) with zero console errors; locked tiles render the recipe text; tsc 0; vitest green.
**NOTE** Recipes are NOT rebalanced (owner said "for now ... check the requirements"); the 7-spiral turret stays.

## P3 — Smooth regardless of host (scalable foundation)  (FULL; architecture)
**OBJECTIVE** The host stays smooth at TD-entity scale; architecture is portable toward more players /
a dedicated authority later.
**APPROACH** Per the S105 architecture judge-panel workflow (`wf_22b3c4c6`): adopt the recommended
approach + its `shippableNow:true` ordered change list this session; log the milestone follow-ups.
Default direction (pending the reco): **bound + cheapen the host's dominant per-frame cost** (the
profiler's `dominantCost`) and keep render decoupled from sim, with the Web-Worker-authority migration
as the logged scalable milestone. Exact change list filled from the workflow recommendation.
**DETERMINISM GUARDRAIL** No change to the seeded-RNG / replay / snapshot contract; render-only vs
sim-state separation preserved; any throttle stays tick-deterministic (no wall-clock in sim).
**TESTING** vitest green incl. replay determinism gates; build < 750 KiB; boot-smoke; owner playtest for felt smoothness.

## P4 — Gnaw SFX reliability  (Micro→Standard)
**OBJECTIVE** A chewing chewer is unmistakably audible on host AND client.
**SCOPE** `chewerRenderer.ts` gnaw gate: fire on each bite reliably (host real ticksInState; client wired);
`audioManager.playGnawSFX` louder/punchier (0.2 → ~0.32 peak). Wire `creature.ticksInState` (and/or
`chewProgress`) into the NetSnapshot if not already present so the client's render-driven gnaw fires.
**DETERMINISM** Render-only SFX; any new wired field is additive (PROTOCOL bump only if a stale peer
would desync — a creature stat field is render-only, evaluate). **TESTING** tsc 0; vitest green; owner playtest hears gnaw.

## CARRY-FORWARDS (stretch, budget-permitting)
- Leader crown + enhance existing BOND_COMMIT flair (re-scope, NOT a parallel burst).
- TD connector visible-damage (render Bond.hp). Ghost build-hint (live next-primitive scaffold).
- bot-self-break-its-own-pentagram polish.

---
## COMPLETION PROTOCOL (per priority): commit+push · session-state (check_completed+method+checkpoint_commit+tokens) · reflexion entry · announce.
## VERIFY: tsc 0 · full vitest green (esp. replay determinism) · build < 750 KiB · boot-smoke (G+C, spawns, gnaw) · owner playtest.
