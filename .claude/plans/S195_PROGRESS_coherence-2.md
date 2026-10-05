# S195 PROGRESS — T19 coherence-2 (`s195/coherence-2`)

**NEXT STEP:** item 6 (stink ramp behind manifest check), item 8 (repaired sparkle + castle-gun slot in `coherence/syncedCuesRenderer.ts` + main.ts hunk), item 9 pin, then tests for 1/2/4/5, then item 10 + gates.

## Done
- #1 Helga death beat (princessRenderer: DORMANT edge → beat + sprite fall + `unitFalls` slot) — tc 0, touched tests 0.
- #3 chewer stun stars → same call as goblin (fade + `creatureSpriteScaleMul`).
- #4 `SFX_SLOTS` + `playSlotSFX` (probe-once, silent when absent) + entropy arm (`drainAudioEffects` 3rd arg `localSeat`; main.ts hunk owed).
- #5 N4: `coherence/helgaAudience.ts`; theme + slap gated on owner/victim seat. VERDICT: both LEAKED before (theme: any Helga anywhere; slap: anyone not fogged).

## Findings so far
- Brief premise for #1 is pre-S189: a killed Helga does NOT leave `world.defenders`; `damage.ts:455` sets `state='DORMANT'`, `ehp=null` (serialized + hashed). The BUILD-edge sweep removes only a record whose HALL fell. So the kill is a synced state edge → derive per frame; no wire field, no bump.
- #2 chewer goo + goblin corpse on `classifyCreatureDeparture` (+ CreatureWatchEpoch rule 3); census 3 → 5 consumers, allow-list empty.
