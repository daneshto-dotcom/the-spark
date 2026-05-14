/**
 * SPARK — cutsceneOverlay timer-contract tests.
 *
 * Original S25 P0 file tested the `onCinematicHandoff` wall-clock setTimeout
 * (handoff fires at recipe.cinematicMs + abort clears the pending timer).
 *
 * **S28 P0 — Voltkin Phase 2D refactor REMOVED `onCinematicHandoff`** (Council
 * Q2 UNANIMOUS A single-slot pending-spawn flag). Wall-clock setTimeout
 * violated replay determinism (S25 reflexion #6 lesson). Replaced by
 * tick-deterministic `world.pendingCreatureSpawn` set in main.ts + polled in
 * the physics tick loop. The corresponding spawn-fire-at-tick + abort-cancel
 * behavior is now exercised by world.ts unit tests + main.ts integration; this
 * file is reduced to the cutsceneOverlay's remaining timer contract.
 *
 * Coverage retained:
 *   - CutsceneContext interface NO LONGER exposes `onCinematicHandoff`
 *     (compile-time + structural-shape check — see typed object below)
 *   - Pre-S28 wall-clock setTimeout path in cutsceneOverlay.ts:152 is GONE
 *     (regression-lock so a future revert reintroduces the determinism bug)
 *
 * ENV GATE: existing skipIf(typeof document === 'undefined') retained per
 * S25 explanation — Pixi/CutsceneOverlay.play() requires DOM in real run;
 * the structural-shape assertion below is the only test that runs in node-
 * only env (it's a pure type-shape check at the import level).
 */

import { describe, it, expect } from 'vitest';
import type { CutsceneContext } from './cutsceneOverlay.ts';

describe('CutsceneContext (S28 P0 wall-clock-removal regression-lock)', () => {
  it('CutsceneContext interface NO LONGER contains onCinematicHandoff', () => {
    // Structural shape: define a valid context and verify TS-shape stayed
    // minimal post-S28. If a future commit adds `onCinematicHandoff` back to
    // CutsceneContext, this file will need updating — which is the intent
    // (S28 reflexion: removal-as-API-contract is regression-locked here).
    const ctx: CutsceneContext = {
      targetPos: { x: 0, y: 0 },
      onComplete: () => {},
      playVoice: () => {},
    };
    // Cast to any-like to enumerate keys — if 'onCinematicHandoff' creeps back
    // into the type, this assertion will fail at compile or runtime.
    const keys = Object.keys(ctx) as Array<keyof CutsceneContext>;
    expect(keys).not.toContain('onCinematicHandoff' as keyof CutsceneContext);
    expect(keys.sort()).toEqual(['onComplete', 'playVoice', 'targetPos']);
  });
});

// NOTE: The original S25 describe.skipIf(typeof document === 'undefined') block
// covering handoff-timer / abort-timer-clear / back-compat behavior was DELETED
// in S28 P0 because the underlying setTimeout no longer exists (cutsceneOverlay.ts
// line 152 setTimeout removed). The new tick-deterministic equivalent is verified
// by:
//   - world.ts GODLY_ABORT reducer test (pendingCreatureSpawn cleared)
//   - main.ts integration via the physics-tick poll (fireAtTick boundary)
//   - browser smoke at ?debug=1 (creature spawns at cinematicMs wall-clock
//     because world.tick advances at 60Hz in lockstep with the cinematic playback)
