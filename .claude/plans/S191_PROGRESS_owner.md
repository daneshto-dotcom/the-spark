# S191 PROGRESS — `s191/owner` (Scorched Earth · pencil chewers)

Brief: `.claude/plans/S191_BRIEFS/owner.md` (main checkout). Rules: S191 PDR §4 + S189 PDR §4.

## Owner answers to the open gates (received by message, S191)
1. Casts / duration — ONCE PER FIGHT, the scorch lasts until that FIGHT ends. **HIS number.**
2. Castle — NOT burned. **HIS ruling.**
3. Own-zone passive vs buildings — moot (*"enemies cant build buildings in your zone so stupid and
   redundant question."*). Passive unchanged, nothing added.
4. NEW — *"also enemy structures will take half the damage that units take."* A structure in a scorched
   zone burns at HALF the units' rate (1 %/s of its structure pool). The own-zone double applies to
   outsiders' UNITS.

## Item 2 WIDENED by the owner (message, S191)
*"the same bug that makes the pencil chewers disappear … It does the same thing to the drones from the
drone hub … three drones in each tower, and then the fight started. Boom, they disappeared, and it
started producing them from zero … when you fix a pencil chewer, it should be a systemic fix for all the
other spawn that get the same … bug."* → (a) enumerate every tower-spawned type and its phase-edge
fate; (b) failing REACH tests for chewers AND drones; (c) ONE mechanism — tower-produced units are
STOCK (survive BUILD at home, released at FIGHT, production continues up to the existing ceiling);
consumed-by-own-action is fine; (d) tests per affected type, wide hash over two waves, mutation per
root cause, the table in the final report.

## Done
- Step 0 — `npm ci` EXIT=0. Progress skeleton.

## In flight
- 1a (tint FIGHT-only)

## Next
- 1b-sim, 1b-UI, 1b-bots, item 2

## Decisions / numbers that are MINE
_none yet_

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
_none yet_
