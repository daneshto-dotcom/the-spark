# PDR — S58 batch (fog + netcode fixes)

- **Date:** 2026-05-30
- **Tier:** Standard (driven by P3/P4)
- **Status:** IN-PROGRESS
- **Approval:** user ("Approved", 2026-05-30) on the presented batch (all 4 asks + E2E gate; Voltkin 2.5×)
- **Deliberation:** 3-way Council (1 round) covers P3 + P4 before their implementation; P0/P1/P2 are Micro/mechanical (Council waived, user-path).

## OBJECTIVE
Four user-requested gameplay/fog fixes + repair the red master E2E gate that blocks CI verification.

## A.0 STATE-DISCOVERY (source-verified 2026-05-30)
- `R_PERSONAL = 300` (constants.ts:116); consumed at live cursor in vision.ts:50. Reveal adds VISION_FADE_PX=40.
- `VOLTKIN_CONFIG.lifetimeTicks = 480` (voltkin-config.ts:119); active attack window = 480 − spawn60 − despawn60 = 360 ticks (6s). Cascades via creature.ts back-compat re-exports. save.replay.test.ts is the determinism guard.
- Creatures serialize to joiner (save.ts:285) but `ownerPlayerId` deliberately omitted (save.ts:569,695 → client gets 0). Additive-optional precedent: `killCount`.
- Spark pickup: LMB-down enters local `AttractDrag`, spark stays **Free** (no authoritative claim); LMB-up dispatches atomic `PLACE_FROM_FREE` (controls.ts:379). Race window = 10Hz snapshot lag → both peers grab same Free spark; loser gets silent `pickupSparkNotFree`.
- Dormant claim infra EXISTS: spark `Carried{carrierId}` (spark.ts:17) serializes (save.ts:515); `PICKUP_SPARK` reducer Free→Carried (sparkLifecycle.ts:150); DROP reducer →Free (sparkLifecycle.ts:202); carry-follow pins spark to cursor (controls.ts:222); carrier-attached render (renderer.ts:76); local drag auto-cancels when spark≠Free (controls.ts:204). S52 removed the live use because persistent Carrying lacked a robust DROP path ("glued spark", controls.ts:338).

## PRIORITIES

### P0 — Restore red E2E gate (Micro)
- master E2E red: Sym I (smoke.spec.ts:417) + the 2 protocol-mismatch tests (~517,559) build contexts manually and never set `__FOG_DISABLE__` (only open2Peers does, lines 69-73). Fog-on halves the swiftshader sim → Sym I can't reach `freeSparks.length>=8` (line 451) in 30s.
- **SCOPE:** e2e/smoke.spec.ts — extract `disableFogOn(ctx)`; call from open2Peers + Sym I + the 2 protocol tests.
- **TEST:** local headless e2e (swiftshader) green + runtime ~3min; push → E2E workflow green.

### P1 — (#1) Spark vision radius ½ (Micro)
- R_PERSONAL 300 → **150** (constants.ts:116). Update vision.test.ts assertions; tsc; preview visual.

### P2 — (#4) Voltkin 2.5× (Micro)
- VOLTKIN_CONFIG.lifetimeTicks 480 → **1200** (voltkin-config.ts:119). Cinematic unchanged.
- **TEST:** voltkin-config.test.ts + **save.replay.test.ts byte-exact green**; solo summon despawn timing.

### P3 — (#3) Own-creature fog vision (Standard; Council)
- Add `ownerPlayerId` to SerializedCreature (additive-optional) + rehydrate (save.ts) + own-creature beacon(s) in computeVisionSources (vision.ts). Beacon radius = Council decision.
- **TEST:** vision.test.ts (own included / enemy excluded / joiner symmetry); replay-determinism; 2-peer where feasible.

### P4 — (#2) Spawner pickup claim (Standard; Council — capstone)
- Re-activate authoritative claim: dispatch `PICKUP_SPARK` (Free→Carried{me}) on LMB-down as intent + local prediction; **guaranteed release** (DROP→Free) on place-reject / RMB-cancel / disconnect / timeout (S52 regression guard). Opponent sees it attached (renderer.ts:76) + their grab auto-cancels (controls.ts:204).
- **RISK:** reverses S52; fragile core (S52/S56 history); requires updating gameplay e2e (Sym A/G/I assume atomic place) + replay determinism.
- **TEST:** unit (claim/drop/reconcile); replay-determinism; new 2-peer e2e (B can't grab A's claimed spark + sees it attached); full suite green.

## VERIFICATION STANCE
Runtime-verify GPU/netcode (preview pixel-extraction + real 2-peer e2e under swiftshader), not just tsc. Per-priority commit + CHECK (Micro = RALPH+Grok; Standard = Triumvirate). End-of-session audit before /handoff.

## CARRY-FORWARD (if #2 runs long)
P4 may continue next session; quick wins (P0–P3) bank independently. Memory-fog + victory cinematic + opponent-view attract-drag parity (S52 Δ6) remain queued.
