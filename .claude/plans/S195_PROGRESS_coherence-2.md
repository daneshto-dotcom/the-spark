# S195 PROGRESS — T19 coherence-2 (`s195/coherence-2`)

**NEXT STEP:** tests for items 1/3/4/5 (helgaAudience.test.ts, helgaDeath.test.ts, sfxSlots.test.ts), then item 2 (chewer/goblin onto the shared departure rule).

## Done
- #1 Helga death beat (princessRenderer: DORMANT edge → beat + sprite fall + `unitFalls` slot) — tc 0, touched tests 0.
- #3 chewer stun stars → same call as goblin (fade + `creatureSpriteScaleMul`).
- #4 `SFX_SLOTS` + `playSlotSFX` (probe-once, silent when absent) + entropy arm (`drainAudioEffects` 3rd arg `localSeat`; main.ts hunk owed).
- #5 N4: `coherence/helgaAudience.ts`; theme + slap gated on owner/victim seat. VERDICT: both LEAKED before (theme: any Helga anywhere; slap: anyone not fogged).

## Findings so far
- Brief premise for #1 is pre-S189: a killed Helga does NOT leave `world.defenders`; `damage.ts:455` sets `state='DORMANT'`, `ehp=null` (serialized + hashed). The BUILD-edge sweep removes only a record whose HALL fell. So the kill is a synced state edge → derive per frame; no wire field, no bump.
