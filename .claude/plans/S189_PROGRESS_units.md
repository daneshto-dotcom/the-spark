# S189 PROGRESS — `s189/units` (worktree agent `s189-units`)

Brief: PDR §5.2 / P7 of `.claude/plans/2026-09-24_S189_BATCH_PDR.md` — C3 Voltkin, C8 Helga,
C10 Kraken + four sim LOWs (a corpse-eater latch, b castle regen of effective max, c serialized
`nextCreatureId`, d spawn-queue gap). Branch `s189/units` off `15035b9` (deploy #2, PROTOCOL 50).
Order: C3 → C8 → C10 → LOWs, one commit each. Never push. Never touch PROTOCOL_VERSION / canon.

## Status

| step | state | commit |
|---|---|---|
| 0 · progress skeleton | done | (this commit) |
| C3 · Voltkin prefers enemy structures | next | |
| C8 · Helga patrol clamped to the board | pending | |
| C10 · Kraken sonar short knockback + stun | pending | |
| LOW a · corpse-eater bite latch | pending | |
| LOW b · castle regen of effective max | pending | |
| LOW c · serialized nextCreatureId | pending | |
| LOW d · spawn-queue gap outside runHostTick | pending | |

## In flight

C3 — reading `creatureAI.ts` / `voltkin-config.ts` for the structure scan.

## Decisions

(none yet)

## Numbers that are MINE (not the owner's)

(none yet)

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

(none yet)

## Wire / hash / shared-rule changes (for the merge owner's bump decision)

(none yet)

## Creature-birth touches (s188/draft-atk merges after this branch)

(none yet)

## Failed commands and their verdicts

(none yet)
