# S195 PROGRESS — T19 coherence-2 (`s195/coherence-2`)

**NEXT STEP:** item 1 — Helga death beat off the synced DORMANT edge in `princessRenderer.ts` (no new field: `damage.ts:449-457` R190-J). Then items 2–10 in order.

## Findings so far
- Brief premise for #1 is pre-S189: a killed Helga does NOT leave `world.defenders`; `damage.ts:455` sets `state='DORMANT'`, `ehp=null` (serialized + hashed). The BUILD-edge sweep removes only a record whose HALL fell. So the kill is a synced state edge → derive per frame; no wire field, no bump.
