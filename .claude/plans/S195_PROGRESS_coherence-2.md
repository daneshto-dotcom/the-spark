# S195 PROGRESS — T19 coherence-2 (`s195/coherence-2`)

**NEXT STEP:** item 10 (render-heap e2e running in background → read result), mutation checks, then merge `ccr-26eaab43-fa9mg3` and the final gates (tc, full vitest --maxWorkers=2, build, touched e2e specs).

## Done
- #1 Helga death beat (princessRenderer: DORMANT edge → beat + sprite fall + `unitFalls` slot) — tc 0, touched tests 0.
- #3 chewer stun stars → same call as goblin (fade + `creatureSpriteScaleMul`).
- #4 `SFX_SLOTS` + `playSlotSFX` (probe-once, silent when absent) + entropy arm (`drainAudioEffects` 3rd arg `localSeat`; main.ts hunk owed).
- #5 N4: `coherence/helgaAudience.ts`; theme + slap gated on owner/victim seat. VERDICT: both LEAKED before (theme: any Helga anywhere; slap: anyone not fogged).

## Findings so far
- Brief premise for #1 is pre-S189: a killed Helga does NOT leave `world.defenders`; `damage.ts:455` sets `state='DORMANT'`, `ehp=null` (serialized + hashed). The BUILD-edge sweep removes only a record whose HALL fell. So the kill is a synced state edge → derive per frame; no wire field, no bump.
- #2 chewer goo + goblin corpse on `classifyCreatureDeparture` (+ CreatureWatchEpoch rule 3); census 3 → 5 consumers, allow-list empty.
- #6 stink ramp row (`RAMP_SPECS_PENDING_ART`) + manifest probe handover in stinkTowerRenderer; hit test stays on rows WITH art (`rampSpecWithArtFor`); canon §7 row + pin.
- #7 VERIFIED: `controls.ts:1505-1508` plays `playUiRefusedSFX()`; REACH test already exists (`controls.refusedCue.test.ts:86`), green. No fix, no controls.ts hunk.
- #8 `coherence/syncedCuesRenderer.ts` (repaired sparkle off `world.repairJobs` leaving with bonds risen; castle-gun fire slot) + `repairedSparkleFx.ts`; main.ts hunk: 5 lines (import, new, clear, sync, drainAudioEffects 3rd arg).
- #9 B-1 pinned in towerHealthHold.ts + `towerHealthHold.ruling.test.ts`.
- Tests: sfxSlots (13), helgaAudience (12), helgaDeath (8), syncedCues (8), stinkTowerRamp (3), ruling (2) — all green.
