# S195 PROGRESS — teams (T12), branch s195/teams

## NEXT STEP (exact)
Item 2 DESIGN (decided): seat stays identity (host=seat 0); board position rides in world.layout as `QUADRANTS_4P:<owner seat per zone>` (zones.ts: baseLayout/zoneOwners/seatOwnsZone/seatOfZone/zonesOfSeat/isZoneLayout DONE, typecheck green).
NEXT: teams.ts `arrangeTeamZones(picks, slots)` rule-based (3v1 solo NW + trio NE,SE,SW in slot order; 2v1 solo NW+SW, pair NE,SE; 1v1v2 pair east, solos NW,SW; 2v2 pair with lowest slot west, top=lower slot; FFA = slots) + `layoutForMatch`; stamp in gameMode.applyStartGame (roster `slot` optional); drop arrangeTeamSeats seat permutation (main.ts bots path, lobbyRoster.arrangeRosterForTeams); save.ts validate layout; walls.wallSeparatesSides via seatOfZone; enumerate zoneOwner readers.

## Log
- setup: worktree created from master 57754ec7, merged master e0c8d1c1 (ff), npm install OK.
- item 1 DONE (commit below): vision/concealment/ghost-memory/fog lit zones ask sameTeam; teams.vision.test.ts 7 tests; census re-pinned; mutation (vision prim filter reverted) -> red. Bump: NO (render-side per peer; bot vision host-only).
- merged master fdc7c8d3 (session-state/preserved-branches only, clean).
