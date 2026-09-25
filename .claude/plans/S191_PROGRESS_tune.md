# S191 PROGRESS — `s191/tune` (worktree agent; the main session is the MERGE OWNER)

Branch `s191/tune`, forked at master `9cbc2e5` (deploy #4, PROTOCOL 51). Commits are LOCAL only; never pushed.
Brief: `.claude/plans/S191_BRIEFS/tune.md` (main checkout). Canon notes: `.claude/plans/S191_CANON_NOTES_tune.md`.

## Messages received

- The dispatch brief (ITEM 1 Ra strength · ITEM 2 castle no-build radius).
- ⭐ **OWNER CORRECTION to ITEM 1** (coordinator, S191): the column deals **35 fifths IN TOTAL, SPLIT** across
  everything it hits — *"it's not like 30 to each thing in the vicinity. No, it's 30 split … we can do it 35
  per hit."* Each creature / Helga / lone built shape / stink bag = one target; each enemy STRUCTURE = ONE
  target whose share lands on its connector nearest the column centre. Share = floor(35/n); remainder +1 to
  the first targets in a total order (sq. distance, kind, id); n > 35 → first 35 get 1 (⚠ MINE). Self-contained
  helper (do not import s191/carry's hub-blast split). The Pharaoh boss stays at 300.

## Steps

| # | step | status | commit |
|---|---|---|---|
| 0 | `npm ci` — `NPMCI_EXIT=0` | DONE | (this commit) |
| 1 | ITEM 1 — Ra perk: 35 fifths split, one hit per structure, boss decoupled | TODO | |
| 2 | ITEM 2 — castle no-build radius 121 → 61, porch slot discs | TODO | |
| 3 | Gates + report | TODO | |

## Decisions / numbers that are MINE

(filled in per step)

## Hotspot hunks

None planned (`save.ts`, `stateHashFull.ts`, `worldTypes.ts`, `main.ts` untouched).
