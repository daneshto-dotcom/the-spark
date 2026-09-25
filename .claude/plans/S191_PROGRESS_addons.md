# S191 PROGRESS — `s191/addons` (worktree `s191-addons`)

Brief: `.claude/plans/S191_BRIEFS/addons.md` (main checkout). Rules: S191 PDR §4 + S189 PDR §4.
Merge owner = the main session. This branch never merges, never pushes.

## Status

| step | what | state | commit |
|---|---|---|---|
| 0 | `npm ci` (NPM_CI_EXIT=0) + this skeleton | DONE | (this commit) |
| A-1 | Warlord rage 25 s + cooldown | next | — |
| A-2 | Alt toggles the footer while a tower is armed | — | — |
| A-3 | R190-G opaque panels swallow right-clicks | — | — |
| A-4 | A1 CI e2e lane | — | — |
| A-5 | magic-attack DESIGN doc | — | — |

## Decisions / owner answers received mid-task

- **A-1 open gate ANSWERED by the owner (via the merge owner, S191):** when the 25 s rage ends and the
  Warlord is still under half, it is **"COOLDOWN FIRST"**, not an immediate re-trigger. No length given →
  build `WARLORD_RAGE_COOLDOWN_TICKS` = 25 × 60, flagged `⚠ MINE` (length only). One rage-start field
  must carry both windows (start + rage length + cooldown length).

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

_none yet_

## footerBand.ts / controls.ts hunks (s191/owner edits the same files)

_none yet_

## Numbers that are MINE

_none yet_
