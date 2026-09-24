# S189 PROGRESS — `s189/units` (worktree agent `s189-units`)

Brief: PDR §5.2 / P7 of `.claude/plans/2026-09-24_S189_BATCH_PDR.md` — C3 Voltkin, C8 Helga,
C10 Kraken + four sim LOWs (a corpse-eater latch, b castle regen of effective max, c serialized
`nextCreatureId`, d spawn-queue gap). Branch `s189/units` off `15035b9` (deploy #2, PROTOCOL 50).
Order: C3 → C8 → C10 → LOWs, one commit each. Never push. Never touch PROTOCOL_VERSION / canon.

## Status

| step | state | commit |
|---|---|---|
| 0 · progress skeleton | done | 550c765 |
| C3 · Voltkin prefers enemy structures | done — GUARD ONLY, no production change (see C3 below) | (this commit) |
| C8 · Helga patrol clamped to the board | next | |
| C10 · Kraken sonar short knockback + stun | pending | |
| LOW a · corpse-eater bite latch | pending | |
| LOW b · castle regen of effective max | pending | |
| LOW c · serialized nextCreatureId | pending | |
| LOW d · spawn-queue gap outside runHostTick | pending | |

## C3 — what was measured (the merge owner should read this before merging)

⛔ **THE REPORTED BEHAVIOUR DOES NOT REPRODUCE IN THE SIM.** Run, not read:

1. `findNearestBondTarget` (Voltkin passes `enemyOnly: false`) keeps own bonds strictly as a
   FALLBACK — `bestEnemyId ?? bestOwnId`: an enemy connector 1100 px away beats an own one 30 px away.
2. `voltkinChainFrom` hops are enemy-only (`isEnemyBond`, creature owner compare).
3. The brother's board through the real host tick (Voltkin seat 0 at x 360 beside two seat-0
   buildings, six seat-1 buildings at x 1400): 0 ticks aimed at an own bond, 0 own connectors
   touched, the Voltkin crosses to x > 1200 and damages 22 enemy connectors in its 20 s life.
4. The FULL production summon path (seat 1 stamps the Voltkin blueprint → `runGodlyMatcherCore`
   fires with `triggererPlayerId` 1 → `tickWorkerCinematics` schedules `pendingCreatureSpawn` →
   `SPAWN_CREATURE` → FIGHT): the Voltkin is owned by seat 1 and every target it takes is seat 0's.

So the Voltkin can attack its own buildings ONLY through the fallback, i.e. only when EVERY bond on
the board reads as its owner's colour (`placerColor` vs the owner's live `player.color`). Checked
and ruled out as causes of that: players are never deleted mid-match (only on title-return,
`gameMode.ts:553`); every primitive is born with `placerColor = player.color` (placePrimitive,
blueprintBuild, structureRepair); auto-bond is same-colour only; the lobby resolves race-colour
collisions (`resolveRosterRaceCollisions`); nothing writes `creature.ownerPlayerId` after birth.

**Two candidate explanations for what he saw, both OUTSIDE this brief's layer — for the merge owner:**

- **(most likely) CREATURE-FIRST PINNING, which is shipped behaviour (S103 #8), not a targeting
  bug.** A Voltkin with an enemy unit inside its 180 px `attackRange` zaps the unit before its
  building target. Measured through the real host tick: with enemy goblins arriving at its base every
  2.5 s it spent **1199 of 1199** life ticks at home (x < 700), zapping raiders on 688 of them, and
  never reached the enemy; its OWN buildings took damage — from the raiders. With a single raid it
  kills them and marches on (reached x 1273 by tick 650). From across the board that reads exactly
  as *"he just started attacking the buildings around him"*: the bolts land among his own buildings
  and his buildings lose health. Whether a Voltkin should IGNORE raiders and march is an owner call
  (it would reverse S103 #8 for the Voltkin and interact with R183 retaliation) — NOT changed here.
- **(unverified) an upstream seat/colour attribution fault** — if some path ever stamps a shape
  with another seat's colour (C6's quick-match seat swap is the only live report in that area), the
  Voltkin's fallback would fire exactly as described. Belongs to `s189/net`; not investigated further.

**Shipped in this commit:** `src/state/creatures/voltkinEnemyFirst.test.ts` (5 cases) — the
preference arithmetic, the brother's board through the real host tick, the chain never jumping onto
own, the real summon path's ownership, and the zero-enemy fallback (negative). ⭐ MUTATION-TESTED:
replacing `bestEnemyId ?? bestOwnId` with "nearest bond of either owner" turned 3 of 5 red
(preference, host-tick board, summon path); restored with Edit (no EOL flip — `git diff` empty).

Protocol: C3 changes NO rule and NO wire field → owes no bump.

## In flight

C8 — Helga's patrol clamp (`defenders/defenderMotion.ts`, `clampIntoPlayfield`).

## Decisions

- C3: no production change. The owner's rule ("own buildings only once every enemy building is
  gone") is already the code; a targeting change would be fixing the wrong layer. Guarded instead.

## Numbers that are MINE (not the owner's)

(none yet)

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

(none yet)

## Wire / hash / shared-rule changes (for the merge owner's bump decision)

- C3: none.

## Creature-birth touches (s188/draft-atk merges after this branch)

(none yet)

## Failed commands and their verdicts

- probe `zzProbeVoltkin.test.ts` (scratch, deleted) — `TypeError: Cannot read properties of undefined
  (reading 'aId')`: RULED BENIGN — my probe's logging read a bond the Voltkin had just severed; the
  sim was fine and the probe was rewritten into the committed test.
- `voltkinEnemyFirst.test.ts` under the deliberate mutation — EXIT 1, 3 failed: EXPECTED (that is
  the mutation test); restored, EXIT 0.
