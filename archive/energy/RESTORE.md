# SPARK — ENERGY ARCHIVE (the passive energy pool, its gauge, and the score rail)

Archived + **REMOVED FROM THE LIVE TREE**: **2026-09-09 (S169)** · Base commit: `7267f61` ·
`PROTOCOL_VERSION` at archive time: **45**

Owner ruling, verbatim:

> *"I don't think we have a mechanic for energy, do we? like, the energy doesn't really do anything.
> It doesn't control anything. So we should remove that bar and the other white bar. Those two are
> redundant. It's just extra shit that we don't need there. So let's remove those. We will discuss
> energy if we need to. So far, we're paying everything with victory points, you know, all the
> upgrades and everything, which is fine."*

and then, explicitly:

> *"Remove the energy mechanic, uh, archive the code. We don't need it. Like, we did archive the, um,
> the rainbow, the tidal bomb, everything in the old version. We don't need that for now."*

---

## ⚠ HOW THIS DIFFERS FROM `archive/hazards/`

The hazard archive is a **copy** — the owner chose "archive now, remove later" and the live code stayed
in `src/`. This one is a **removal**: he asked for the mechanic gone. So this file is the restore
source of record, and the code below is the whole feature as it stood at `7267f61`.

## ⭐ THE EVIDENCE THAT IT WAS DEAD, BECAUSE HE ASKED RATHER THAN ASSERTED

He said *"tell me, if energy doesn't have anything, then we will remove it"*. Checked before touching
anything:

- `tickEnergy` **was** running — dispatched once per player per physics tick from `physicsLoop`, so
  the pool really did accrue at `ENERGY_PER_SECOND_FLAT` (5.0/sec).
- **Nothing ever read `player.energy`** except the gauge that drew it (`ui.ts`) and the serializer.
  No spend, no gate, no cost, no threshold — grep of `\.energy\b` across `src/` returned only: the
  field declaration, two struct copies, the accrual, the gauge, and save/load.
- It was **clamped at 100** by the gauge and **zeroed** on phase transitions
  (`gameMode.ts` / `gameState.ts`), which is exactly the owner's observation that the bar *"moves up,
  and then it restarts"*.

So: a pool that filled, capped, reset, and was never spent. He was right.

## ⚠ NOT HASHED, AND NO PROTOCOL BUMP — BOTH CHECKED

- `energy` is **absent from `stateHashFull.ts`**, so removing it cannot move the determinism oracle.
- `TICK_ENERGY` was on the `KNOWN_ACTION` allowlist but **absent from `CLIENT_INTENT_TYPES_RECORD`**,
  so no peer could ever send it. Removing it is an **allowlist TIGHTEN**, and this codebase already
  set that precedent in writing at the same table: *"S42 — END_TURN removed … no protoVersion bump
  needed because this is an allowlist tighten, not a structural message change."* Same reasoning,
  same table, so `PROTOCOL_VERSION` stays **45**.

## ⚠ WHAT THE TWO BARS CARRIED THAT THE REMOVAL COSTS

The **energy gauge** carried nothing — it drew a number nothing consumed.

The **score rail** did carry two things the top-left `SCORE n/1500` text does not, and they are gone
with it. Recorded so they can be re-sited rather than rediscovered:
- a **ghost tick** showing the LEADER's position, i.e. the gap between you and first place;
- a **red flash** when your own score DROPPED (a NONET halving), plus an amber tint while coasting
  above 75%. `armSpendSuppression()` existed solely so that a VOLUNTARY spend (buying a gatherer)
  did not trip that alarm.

If either is missed in play, the owner's own suggestion is the right home: *"we'll add app and put it
on that … you'll click macro, you can see everyone in your map."*

---

## THE REMOVED CODE, verbatim from `7267f61`

### `src/constants.ts`
```ts
// === Energy & Claim ===
export const ENERGY_PER_SECOND_FLAT = 5.0;
```

### `src/game/player.ts`
```ts
// on the PlayerCommon interface:
  energy: number;

// in makeIdlePlayer(...):
    energy: 0,

// in the two struct copies (toIdle / toCarrying, ~lines 236 and 288):
    energy: player.energy,

/** Passive flat energy accrual (§ XIV.8). */
export function tickEnergy(player: Player, deltaSec: number, ratePerSec: number): void {
  player.energy += deltaSec * ratePerSec;
}
```

### `src/state/sparkLifecycle.ts`
```ts
export interface TickEnergyAction {
  readonly type: 'TICK_ENERGY';
  readonly playerId: PlayerId;
  readonly deltaSec: number;
}

/** Tick player energy by deltaSec at the flat regen rate. The 1v1 gate does
 *  NOT apply here — energy ticks for both players each frame (regen accrues
 *  while inactive); only PLACE_PRIMITIVE / PICKUP gate on active-player. */
export function applyTickEnergy(world: World, action: TickEnergyAction): World {
  const player = requirePlayer(world, action.playerId);
  tickEnergy(player, action.deltaSec, ENERGY_PER_SECOND_FLAT);
  return world;
}
```

### `src/state/world.ts`
```ts
    case 'TICK_ENERGY':
      return applyTickEnergy(world, action);
```

### `src/physics/physicsLoop.ts`
```ts
  for (const player of world.players.values()) {
    dispatch(world, { type: 'TICK_ENERGY', playerId: player.id, deltaSec: PHYSICS_DT });
  }
```

### `src/net/protocol.ts`
```ts
  TICK_ENERGY: true,
```

### `src/state/save.ts`
```ts
// on SerializedPlayer:
  energy: number;

// in serializePlayer / the snapshot writer:
      energy: p.energy,
    energy: p.energy,
```

### `src/state/gameMode.ts` / `src/state/gameState.ts` (per-match resets)
```ts
    p1.energy = 0;
    player.energy = 0;
```

### `src/render/ui.ts` — the gauge and the rail
Both vertical bars, their draw methods (`drawEnergyGauge`, `drawProgress`), the pure
`progressBarFractions(world, decayEnabled)` helper, the `armSpendSuppression()` API, the
`energy-gauge` / `progress-rail` entries in `hudSurfaces()`, and the layout constants
`GAUGE_Y_TOP` / `GAUGE_Y_BOTTOM` / `GAUGE_WIDTH` / `ENERGY_GAUGE_FULL` / `PROGRESS_X` /
`PROGRESS_Y_TOP` / `PROGRESS_Y_BOTTOM` / `PROGRESS_WIDTH`.

⚠ `GAUGE_X` was **KEPT** and re-exported as `GAUGE_X_COLUMN`: the settings gear and the connection
dot now anchor to it as the right-hand HUD column. Restoring the bars means restoring their own Y
constants, not that one.

Full text of every removed block is in `git show 7267f61` for the files listed above.

## TO RESTORE

1. `git show 7267f61 -- src/render/ui.ts src/game/player.ts src/state/sparkLifecycle.ts` and take the
   marked blocks back.
2. Re-add `TICK_ENERGY: true` to the `KNOWN_ACTION` table (still no bump — widening an allowlist that
   no client can reach).
3. Re-add `energy` to `SerializedPlayer` **and** both struct copies in `player.ts`, or a loaded world
   will carry `undefined` into the accrual and produce `NaN`.
4. The tests removed with it: the `progressBarFractions` suites in `render/ui.progress.test.ts`, the
   two right-edge-rail geometry tests in `render/hudLayout.test.ts`, and the energy assertions in
   `game/player.test.ts`, `state/sparkLifecycle.test.ts`, `state/world.test.ts`,
   `state/gameState.test.ts`, `state/save.test.ts`.
