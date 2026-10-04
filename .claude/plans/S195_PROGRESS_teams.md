# S195 PROGRESS — teams (T12), branch s195/teams

## NEXT STEP (exact)
Item 2 core DONE (commit below). NEXT: run full vitest once (`npx vitest run --maxWorkers=3` -> .tmp-gates/full1.log) to catch zone-geometry fallout, then item 3 backdrops (zoneBackgroundRenderer.ts zoneArtUrl ~:284, sync ~:661/716; transcode C:/Users/onesh/Downloads/*X*.jpg with Pillow -> public/art/race-zones/teams/).

## Log
- setup: worktree created from master 57754ec7, merged master e0c8d1c1 (ff), npm install OK.
- item 1 DONE (commit below): vision/concealment/ghost-memory/fog lit zones ask sameTeam; teams.vision.test.ts 7 tests; census re-pinned; mutation (vision prim filter reverted) -> red. Bump: NO (render-side per peer; bot vision host-only).
- merged master fdc7c8d3 (session-state/preserved-branches only, clean).
- item 2 DONE: seat stays identity; `world.layout` = `QUADRANTS_4P:<owner seat per zone>` (zones.ts) from `arrangeTeamZones`/`layoutForMatch` (teams.ts), stamped in applyStartGame from roster team+slot (new optional StartGame roster `slot`). Retired arrangeTeamSeats/permuteSeats/permuteBots + arrangeRosterForTeams (main.ts bots path, hostHandlers). Readers decided: canBuildAt + canReclaimNow + creatureAI chase-home = ANY owned zone; wallSeparatesSides/wallRenderer/tintForZone/scorchedEarthAim = seatOfZone; castleAnchor/zoneOwner = HOME zone (lowest owned); Scorched Ground/Earth = HOME quadrant only (MINE). save.ts validates layout. Old S192 reach fixtures pinned to the identity board. teams.zones.test.ts 12 tests; mutation (canBuildAt owned-zone arm) -> red. BUMP: YES (layout value set + zone ownership sim).
- ⚠ avatar start pos (radialSpawnPos by seat) not remapped on a mapped board — cosmetic, first cursor move fixes it.
