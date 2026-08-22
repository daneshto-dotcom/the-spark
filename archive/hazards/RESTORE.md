# SPARK — HAZARD ARCHIVE (bombs · potatoes · rainbows · seagulls + poops)

Archived: **2026-08-22 (S151 P1)** · Base commit: `7176295` · PROTOCOL_VERSION at archive time: **28**

Owner ruling **R73**:

> *"dude seagull, rainbow, potato bomb and regular bomb just archive them for now and leave it inactive.
> i will let you know how and when to implement them if at all. you can remove their code from the current
> game we are building but keep it whole somewhere in a spec archive folder so we can bring them back as
> they are now or tweaked later if we wish to..."*

---

## ⚠ READ THIS FIRST — WHAT WAS AND WAS NOT DONE

**The live code was NOT removed.** The owner selected *"archive now, remove later"*. This directory is a
**faithful byte-identical copy** of all 26 hazard-owned files as they stood at `7176295`; the originals are
still in `src/` and `e2e/`, still compiling, still tested.

**They were already dormant before this archive existed.** `HAZARD_SPAWN_ENABLED` has been `false` in the
production build since **S147** (owner rulings R14/R23) and is pinned false by
`src/game/spawnerRngInvariance.test.ts`. No hazard has spawned in a real match for three sessions. Only e2e
specs re-enable them, via `window.__TEST_HAZARDS_ENABLED__`.

**So this archive is insurance, not a migration.** Its job is to guarantee that whenever the excision session
happens, the *whole* feature can be restored exactly as it was — or tweaked — without archaeology.

### What DID change in the live tree during S151 P1
Only one thing: the five hazard e2e specs were tagged **`@archived-hazard`** in their `test.describe` titles
and excluded from the gating lane. Nothing else in `src/` was touched.

- `package.json` → `e2e:gating` now excludes `@archived-hazard` alongside `@quarantine-flaky|@soak|@perf-measure`
- `package.json` → new `e2e:archived` script runs exactly this set, so the coverage is **retired, not lost**

---

## THE ARCHIVED SET — 26 files, byte-identical to `7176295`'s `src/`+`e2e/`

Paths below are relative to this directory and mirror the repo layout exactly, so a restore is a copy, not a
re-derivation.

### State (9)
```
src/state/bomb.ts                       src/state/bombLifecycle.ts       src/state/bombLifecycle.test.ts
src/state/potato.ts                     src/state/potatoLifecycle.ts     src/state/potatoLifecycle.test.ts
src/state/rainbow.ts                    src/state/rainbowLifecycle.ts    src/state/rainbowLifecycle.test.ts
```
### Seagulls (3)
```
src/state/seagulls/seagull.ts           src/state/seagulls/seagullLifecycle.ts
src/state/seagulls/seagull.test.ts
```
### Render (8)
```
src/render/bombRenderer.ts              src/render/effects/bombExplode.ts
src/render/potatoRenderer.ts            src/render/poopRenderer.ts
src/render/rainbowRenderer.ts           src/render/rainbowFlyoverRenderer.ts
src/render/rainbowFlyoverRenderer.test.ts
src/render/seagullRenderer.ts
```
> ⚠ `src/render/effects/bombExplode.ts` is easy to miss — it does not sit beside the other bomb files. It was
> found by enumerating filenames, not by reading imports. Do not restore from memory; restore from this list.

### Render tests (1)
```
src/render/keepRainbowTint.test.ts
```
### e2e (5)
```
e2e/bomb.spec.ts   e2e/potato.spec.ts   e2e/rainbow.spec.ts   e2e/rainbow-castle.spec.ts   e2e/seagull.spec.ts
```

**The rainbow keeps its two dependent visuals** (owner-ruled): the **flyover cinematic**
(`rainbowFlyoverRenderer.ts`) and the **S137 rainbow-castle recolour** (`rainbow-castle.spec.ts`,
`keepRainbowTint.test.ts`) archive *with* the rainbow. The feature stays whole.

---

## THE EXCISION CHECKLIST — what a future removal session must touch

The 26 files above are hazard-*owned*. The integration points below are **shared files with hazard-shaped
holes in them**, and they are where the real work is. This list is the reason the excision was deferred.

### 1. `World` fields — 5 Maps (`src/state/worldTypes.ts:315,342,352,398,407`)
```ts
bombs:     Map<BombId, Bomb>          potatoes: Map<PotatoId, Potato>
rainbows:  Map<RainbowId, Rainbow>    seagulls: Map<SeagullId, Seagull>
poops:     Map<PoopId, Poop>
```

### 2. Wire surface — `src/state/save.ts`
Five additive-optional `NetSnapshot` arrays plus their `SerializedX` interfaces and
`serializeX`/`deserializeX` pairs. **Removing these is a wire change and needs a `PROTOCOL_VERSION` bump.**

### 3. State hash — `src/state/stateHashFull.ts:255-264, 312-317`
```
BombHashed · PotatoHashed · RainbowHashed · SeagullHashed · PoopHashed
_bombComplete · _potatoComplete · _rainbowComplete · _seagullComplete · _poopComplete
```
⚠ The file's own warning applies: the hashed-field union is checked by `tsc`, but the projection beneath it is
a **hand-written string template with no executable link to the union**. Deleting a name from the union is not
enough — the template must be edited too, or the change compiles clean and passes every test while silently
changing nothing.

### 4. Action types — `src/net/protocol.ts:782-819` (`KNOWN_GAME_ACTION_TYPES_RECORD`)
```
SPAWN_BOMB · TRIGGER_BOMB · DISSIPATE_BOMB
SPAWN_POTATO · PICKUP_POTATO · PLACE_POTATO · DROP_POTATO · POTATO_DETONATE · DISSIPATE_POTATO
SPAWN_RAINBOW · TRIGGER_RAINBOW · DISSIPATE_RAINBOW
SPAWN_SEAGULL · SEAGULL_TICK · POOP_TICK · CLEAN_POOP
```
and **four of these are also CLIENT INTENTS** (`protocol.ts:878-881`):
`TRIGGER_BOMB · TRIGGER_RAINBOW · PICKUP_POTATO · PLACE_POTATO`.

### 5. Id brands — `src/types.ts:17-26, 39-44`
`BombId · PotatoId · RainbowId · SeagullId · PoopId` and their `asXId` constructors.

### 6. The spawn gate — `src/constants.ts:446`
```ts
export const HAZARD_SPAWN_ENABLED = readTestHazardsEnabled() ?? false;
```
Consulted at **four dispatch sites in `src/physics/physicsLoop.ts` only** (≈ lines 117-138).
⚠ **INVARIANT — gate AFTER the draw, never at the draw.** The flag sits downstream of every RNG call so that
hazards-off stays RNG-neutral and every spawner stream is byte-identical either way.
`spawnerRngInvariance.test.ts` asserts exactly this and will fail if it is violated. Preserve this property in
any restore *and* in any removal.

### 7. The e2e seam — `src/constants.ts:912-923`
`readTestHazardsEnabled()` reads `window.__TEST_HAZARDS_ENABLED__`. `e2e/match-clock.spec.ts:129-146` is the
deliberate **complement** of the hazard specs — it withholds the flag to prove zero hazards appear — so it must
keep working after any removal.

### 8. The picker chain — `src/input/controls.ts` (≈ 611-633)
`onDown` tries `pickBomb → pickRainbow → pickPotato → pickSpark`, so a hazard under the cursor claims a click
before the shape does. Removing hazards **shortens this chain**, which is a behavioural change to input, not
just a deletion.

### 9. Poop's separate reach
Poops are not merely seagull ammunition — they debuff. `isCruiserDebuffed` gates
`src/state/placeFromFree.ts:150` and `src/state/sparkLifecycle.ts`, and `Spark.poopyUntilTick` is a **hashed,
round-tripped field** (`SparkHashed` includes `poopyUntilTick`). Removing seagulls without removing the poop
debuff — or vice versa — leaves a live half-feature.

### 10. Cross-cutting prose
Dozens of shared files carry hazard references in comments and rationale (`damage.ts:232` explains why
`placerColor` is not used for ownership *because the rainbow remaps colours mid-match*). Those comments become
**wrong** rather than merely stale once the rainbow is gone. Grep and fix them, or the next reader inherits a
false explanation.

---

## HOW TO RESTORE

1. Copy every file in this directory back over the repo root, preserving relative paths.
2. Untag the five e2e specs: remove ` @archived-hazard` from each `test.describe` title.
3. Revert `package.json` — drop `@archived-hazard` from `e2e:gating`; remove `e2e:archived` if unwanted.
4. If the excision session has already run, the checklist above is your re-integration list — work it in order
   1→9, and bump `PROTOCOL_VERSION` (items 2 and 4 are wire surface).
5. To actually make them *spawn*, flip `HAZARD_SPAWN_ENABLED` — but read invariant §6 first.

### Verify a restore
```
npm run build && npx vitest run && npm run e2e:archived && npm run e2e:gating
```

---

## ⚠ ONE KNOWN DEFECT, ARCHIVED AS-IS AND DELIBERATELY NOT FIXED

`e2e/rainbow.spec.ts` is **~50% flaky** — measured S151: 2 failures in 4 observations, flaky even run alone.
It is **not** a regression (`git diff --name-only 3bc8a7e..HEAD` touches no `src/` or `e2e/` file), and S150's
recorded "53/0/0" was a single lucky observation.

Its failure signature, from the S150 diagnostic:
```
bombs:0 · rainbows:1 · poops:10 · lockedByCinematic:FALSE · [attempt 4/4] · zero primitives placed
```

**The cause recorded in carry-forward CF-S150-b is REFUTED by that evidence.** CF-S150-b predicted the flyover
cinematic swallowing build clicks; `lockedByCinematic` is `false` in both observed failures. The invariant
across both is `poops:10`, and the spec suppresses bombs and potatoes but leaves **seagulls** live while
claiming to be *"race-free by design"* — the same false reasoning `bomb.spec` carried for three sessions.

**Unconfirmed hypothesis for whoever restores this:** the pooped-cruiser arrival gate at
`src/state/placeFromFree.ts:150`, which increments `world.diagnostics.rejectReasons.pickupPoopedTooFar` — a
counter `placeFreeSparkAndConfirm` does **not** sample. Add it to the helper's diagnostic and the cause names
itself in one run. Do not fix it by suppressing seagulls until that counter has been read; that would be
treating the symptom, which is exactly how this spec's sibling cost two wrong hypotheses.
