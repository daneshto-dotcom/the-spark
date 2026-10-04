# S195 PROGRESS — teams (T12), branch s195/teams

## NEXT STEP (exact)
Item 5 (N16 host re-seats): RosterEntry.slot (protocol.ts validate 0..3), session.slotByPeer/selfSlot, presence + Begin roster stamp slot, host MOVE chip on each tile in seatRack (cycles clockwise via seatBoardSlots swap), bot lobby corner chip per row -> onStart slots -> main.ts roster slot.

## Log
- setup: worktree created from master 57754ec7, merged master e0c8d1c1 (ff), npm install OK.
- item 1 DONE (commit below): vision/concealment/ghost-memory/fog lit zones ask sameTeam; teams.vision.test.ts 7 tests; census re-pinned; mutation (vision prim filter reverted) -> red. Bump: NO (render-side per peer; bot vision host-only).
- merged master fdc7c8d3 (session-state/preserved-branches only, clean).
- item 2 DONE: seat stays identity; `world.layout` = `QUADRANTS_4P:<owner seat per zone>` (zones.ts) from `arrangeTeamZones`/`layoutForMatch` (teams.ts), stamped in applyStartGame from roster team+slot (new optional StartGame roster `slot`). Retired arrangeTeamSeats/permuteSeats/permuteBots + arrangeRosterForTeams (main.ts bots path, hostHandlers). Readers decided: canBuildAt + canReclaimNow + creatureAI chase-home = ANY owned zone; wallSeparatesSides/wallRenderer/tintForZone/scorchedEarthAim = seatOfZone; castleAnchor/zoneOwner = HOME zone (lowest owned); Scorched Ground/Earth = HOME quadrant only (MINE). save.ts validates layout. Old S192 reach fixtures pinned to the identity board. teams.zones.test.ts 12 tests; mutation (canBuildAt owned-zone arm) -> red. BUMP: YES (layout value set + zone ownership sim).
- ⚠ avatar start pos (radialSpawnPos by seat) not remapped on a mapped board — cosmetic, first cursor move fixes it.
- full suite run 1 after item 2: 1 red (endgameS193 owner-compare census: vision/exploredMemory pins) -> re-pinned; pentagram snapshot file EOL-only churn restored.
- art: 36 webp in public/art/race-zones/teams/ (867 KB), transcode script .tmp-gates/transcode_teams.py (Pillow 12.2, already installed).
- item 3 DONE: zoneBackdropPlan (pair art top/bottom crop, east mirrored; 2v1 solo = zone-<race>-2p across his half; 1v1v2 solos + 3v1 = 4p single art; FFA identical) + cropHalfTexture + per-quadrant sync with per-zone tint (extra corner never washed). trioBackdropUrl seam returns null. teamBackdrop.test.ts 10 tests; mutation (east mirror dropped) -> 5 red. Pair art grade = none (MINE). No bump (render-only).
- item 4 DONE: getSeatRect clock order; SeatView.slot from seatBoardSlots (arrangeTeamZones over dense occupied seats); seatRack positions tiles by slot; e2e teams-lobby clicks chip at slot; lobbyBoardOrder.test.ts 7 tests; mutation (row-major col) -> red. Bot lobby is a vertical list (no rack geometry) -> gets a board-corner chip in item 5.
