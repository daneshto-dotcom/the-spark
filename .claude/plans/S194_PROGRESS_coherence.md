# S194 · T9 COHERENCE — progress (`s194/coherence`)

**STATUS: DONE (audit round + batch-2 merge) — ready for the merge owner.**

## FINAL REPORT — AUDIT ROUND + BATCH 2 (supersedes the pre-audit report below where they differ)
- **Merges:**
  - `6490ce47` (master `864cee98`, T2 visuals-3), clean.
  - `33b90e8e` (master `b968d940`: PROTOCOL 64, T5 UI restyle, T8 fixes, T7 bots, entropy), clean, **no conflicts**.
- **Gates on `85d41ad9`:** typecheck **0** · vitest **0** (550 files / **8432 tests** passed, 4 files / 11 tests skipped) · build **0**.
- **Entry:** **1154.8 KiB** against master `b968d940` built with the same three files swapped back: **1150.0** = **+4.8 KiB**. Headroom 95.2 KiB.
- **Bump verdict: NO.** Still render-only: no wire field, no sim change, and `PROTOCOL_VERSION` (64) untouched.
- **Audit fixes:**
  - F1, endgame pants removed at the FIGHT→BUILD edge → `'swept'`.
  - F2, sapper/drone self-detonation → `'detonated'`. The host still classifies a shot-down one as `'killed'`, using its kill record. On a peer it reads as detonated; that ambiguity is stated at `DETONATION_KILL_MATCH_PX`.
  - F3, a kill during the DESPAWNING fade is a kill; it is `'expired'` only once `tick ≥ despawnAtTick − 1 snapshot`.
  - Item 4, a test with the REAL `concealment.ts`.
  - Item 5, departures in ascending id before the caps (`departedInIdOrder`); pops age by `world.tick`.
  - Item 6, REACH per removal class: `departureClasses.test.ts` covers damage kill, age-out, a kill in the fade, the pants sweep, a pants kill, sapper/drone detonation, a drone shot down, and the title clear.
  - Item 7, the docblock nits.
  - I broke each of the three F-rules on purpose; the tests caught every one.
- **Entropy (batch 2):** `applyEntropyTax` only severs bonds through `applySeverBond`. No creature-removal site was added; the production list is unchanged. A REACH test runs a real tax on a 145-connector lattice with units on it: bonds snap, every unit survives, and no death beat fires.
- **Perf on the merged tree:**
  - 18 A/B pairs; the first 12 are noise-bound (machine contended, frames up to 16 ms).
  - The final 6 on `9e8de1da` gave mean **−0.22 ms**, median −0.32 ms: no measurable cost.
  - The earlier clean measurement on `18560cd8` was +0.26 ms.
  - Batch 2 added only a test, so I did not re-bench.
- **Routed gaps, NOT DONE, and MINE questions:** unchanged from the report below. The Helga death beat is still open. T8's "Helga RISEN" landed on master, but it does not change the kill-vs-sweep ambiguity for a peer.
- Nothing left running. Port 41937 is clear.

## FINAL REPORT
- **Tip:** see `git log -1 s194/coherence` (the commit that lands this file). Merge: `git merge master` fast-forwarded to `18560cd8`, **no conflicts**. Not re-merged after RESUME (rules: master not touched).
- **Gates (final, on the tip, exit codes captured to files):** `npm run typecheck` **0** · `npx vitest run --maxWorkers=3` **0** — 523 files passed / 4 skipped, **7913 tests passed** / 11 skipped · `npm run build` **0**.
- **Entry KiB:** **1125.9 KiB** (cap 1250, headroom 124.1). Against the rules' 1121.9 baseline: **+4.0 KiB**.
- **Perf** (Playwright, GPU, 120 creatures, forced fight of 20 kills/s plus 100 hits/s, 6 s, last 300 frames of `__SPARK__.frameMs`; A/B interleaved ×3 against master's three files on the same port 41937):
  - first caps (24 death beats / 40 pops): branch 5.73 vs master 5.30 = **+0.43 ms**, over budget;
  - final caps (12 / 20): branch **5.29** vs master **5.03** = **+0.26 ms**, within the +0.3 budget.
  - This is a forced worst case; a real fight's kill rate is far lower. The machine is shared, so noise is about ±0.3 per run, and only the paired means carry weight.
  - `__SPARK__.fx.bench(120)` does not exist. The seam is `fx.horde` + `frameMs`; the harness is in `.tmp-gates/fx/` (gitignored).
- **Screenshots:** `.tmp-gates/fx/death-{before,after}.png` and `crop-{before,after}.png`. Before: the goblin takes a "12" with nothing on the body. After: a red-rimmed pop on the victim, and a death beat under the kill.
- **Bump verdict: NO.** Every change is render-only. It is derived from fields every peer already holds (`world.creatures`, `Creature.state`/`pos`/`ehp`, `structureWatchEpoch`, `gameState`, concealment). It adds no wire field and changes no sim code. Two builds that shake hands compute an identical game; only local pixels differ.

### What is MINE (owner LOOK questions, one line each, with a recommendation)
1. The death beat look and size (`fx/unitDeathFx.ts` `UNIT_DEATH_LOOK`, 36 ticks, seat-colour flash, dust, motes). Recommend: keep, and judge it live on a goblin wave.
2. The hit pop (`fx/hitPopFx.ts`, 12 frames, white core with a red rim). Recommend: keep; if a big scrum reads as too busy, halve `HIT_POP_MAX_LIVE`.
3. Fog now hides damage numbers on a concealed spot, the castle excepted. This follows his S170 *"nothing in their zone"*. Recommend: keep.
4. Sound parity is a taste call; see the matrix. Missing: fire SFX for the stink tower and the castle gun, and death SFX for every unit except chewer, Voltkin and pants. Recommend: he auditions one generic "unit falls" .ogg and one "keep fires" .ogg. Nothing was added here.

### Merge seams
- `src/render/damageNumbers.ts`: imports, the `Watched` fields, the epoch latch, the kill-sweep classifier line, the fog gates, and the hit pop. Anyone else touching the vanish sweep or `emit`/`emitAt` will conflict. The source-text window in `damageNumbersLifecycle.test.ts` (2500 chars, `seen.has(id)` → `this.emit(`) still holds.
- `src/main.ts`: 4 small lines (import, construct, `unitDeathRenderer.sync(world)` after `goblinRenderer.sync`, `unitDeathRenderer.clear()` on title return).
- `src/render/creatureRenderer.ts`: the death-watcher condition now calls `classifyCreatureDeparture` and owns a `CreatureWatchEpoch`.
- `src/render/fx/floaterFxReach.test.ts`: two asserts re-pinned to count only the heal sparkle (`isHitPopEmit` filter). The intent is unchanged, and a third assert pins that a hit now pops.
- `unitDeath.census.test.ts` lists `chewerRenderer.ts` as the one render file allowed to keep a private `wasState !== 'DESPAWNING'` test. When T2's branch routes the chewer to `classifyCreatureDeparture`, move it from that allow-list to the consumer list (3 → 4).
- Untouched per the RESUME boundary: `towerCover.ts`, every `markTowerCover` caller, and `buttonFeedback.ts`.
- `pentagramBuildability.test.ts.snap` gets an LF/CRLF-only rewrite from vitest on Windows after every full run. The content is identical, so it is benign; it was restored, not committed.

### NOT DONE
- **Helga death beat.** She vanishes with no beat. A kill and the turn-boundary sweep both leave `world.defenders` through `destroyDefender`, and a peer cannot tell them apart without the host-local `structureKillHits`. Needs a decision on a derivable cue, or acceptance that it shows on the host only.
- No world-space hover or selection highlight for any family (uniformly absent, so not an inconsistency); listed for T5.

## Commits
- C1 `b46d3e3d` — one shared unit-departure rule (`src/render/coherence/unitDeparture.ts`). `damageNumbers` stops printing a killing blow for an expiry, a mass clear or a fogged spot; `creatureRenderer`'s zap uses the same rule.
- C2 `6f5ea1f7` — one death beat for all 28 creature types (`fx/unitDeathFx.ts` + `coherence/unitDeathRenderer.ts`), keyed by `UNIT_FAMILY: Record<CreatureType, …>`. Census with REACH for every type, negatives, and a consumer census.
- C3 `3fc09a94` — every red damage number lands a hit pop on its victim (`fx/hitPopFx.ts`, drawn from `DamageNumbers`). Pairing census: damage floaters == pops.
- C4 `4bae25a9` — perf caps (12 beats / 20 pops) set from the A/B bench.

## THE PARITY MATRIX (grep evidence at `18560cd8`; ✓ = has it · ✗ = lacks it · ≠ = differs for no reason · → = fixed here · R = routed)

### Units (`world.creatures`: goblinRenderer = goblins ×6, race, tier-3, bosses ×6, direwolf, endgame/pants; creatureRenderer = Voltkin, drone, locust; chewerRenderer = chewer)
| channel | goblins ×6 | race/T3 units | T9 bosses | direwolf | Voltkin | chewer | drone / locust | endgame / pants |
|---|---|---|---|---|---|---|---|---|
| spawn-in | fade (goblinRenderer) | fade | fade | fade | scale pulse + TV `spawning` row | — | scale pulse | fade |
| damage number | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| number on expiry | — | — | — | ≠ printed → | ≠ printed "40" → | — (persistent) | locust ≠ printed → | — |
| number on mass clear | ≠ printed → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → |
| number inside fog | ≠ printed → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → | ≠ → |
| hit impact at victim | ✗ melee → pop | ✗ melee → pop | ✗ melee → pop | ✗ → pop | arc sparks ✓ | ✗ → pop | ✗ → pop | ✗ → pop |
| health bar (`healthBar.ts`, T4) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stun stars (`stunStars.ts`) | ✓ scaled | ✓ scaled | ✓ scaled | ✓ scaled | ✓ unscaled (scale 1 anyway) | ≠ alpha fixed at 1, unscaled — R T2 | ✓ | ✓ scaled |
| RESIST cue | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| death visual | ✗ no `die` row → beat | `die` row ✓ (+ beat) | `die` row ✓ (+ beat) | `die` row ✓ (+ beat) | zap cloud ✓ (+ beat) | goo splat ✓ (+ beat) | ✗ → beat (drone: blast on detonation) | ✗ → beat |
| death SFX | ✗ | ✗ | ✗ | ✗ | zap ✓ | splat ✓ | ✗ | pants ✓ |
| kill rule (expiry / fog / PLAYING) | corpse plays regardless — R T2 | same | same | same | ✓ → shared | private copy — R T2 | ✓ → shared | same as goblins |

### Towers (spawners: race T3/T9 via towerRenderer; goblin tower, pentagram, lightning hub via structureRamp; Voltkin TV via voltkinTowerRenderer · defenders: laser turret, Helga hall, stink tower · castle)
| channel | race T3/T9 | goblin tower / pentagram / hub | Voltkin TV | laser turret | Helga hall | stink tower | castle |
|---|---|---|---|---|---|---|---|
| place / grow / merge (GameEffects) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| connector-fade sparkle + aura (spawnerZoneRenderer) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | n/a — **R T4 (A2)** |
| cover fade of shapes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a (T4) |
| damage-ramp art | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ no art (owner art) | ✓ castleFrames |
| connector damage numbers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | keep ✓ |
| hit pop on connector / keep | → | → | → | → | → | → | → (keep size) |
| destroy beat | crumble sheets ✓ | ramp crumble ✓ (+ hub blast) | ruins ✓ | ramp crumble ✓ | ramp crumble ✓ | blast ✓ | rubble ✓ |
| fire / impact visual | n/a | n/a | n/a | beam + sparks ✓ | slap impact ✓ | lob + cloud ✓ | shot + impact ✓ |
| fire SFX | n/a | n/a | n/a | laser ✓ | slap ✓ | ✗ (owner taste) | ✗ (owner taste) |
| health bar | structure bar ✓ | ✓ | ✓ | ✓ | ✓ (+ Helga unit bar) | ✓ | keep bar ✓ |
| world hover / selection highlight | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (uniformly absent; R T5) |

### Structures, blasts, projectiles, heals, status, UI
- **Shapes / connectors / welds:** commit, sever, grow, merge and raided all go through the shared `buildFx` ✓. Damage numbers ✓, removal-not-kill ✓ (S179). The fog gate was missing (→ fixed). Hit pop → added.
- **Blasts:** one `BOMB_EXPLODE` drawer (`blastFx`) for all six producers ✓.
- **Projectiles:** arrow/harpoon trail + impact ✓ (`creatureProjectile.ts`, T8), castle shot ✓, laser ✓, Voltkin arc ✓, slap ✓. Melee had nothing → fixed by the hit pop.
- **Heals:** creature, structure, castle — numbers + sparkle ✓ (uniform).
- **Status:** stun is shared (`stunStars`) ✓, except the chewer's alpha and scale (R T2). Rage and burn are drawn by `perkFx` / `goblinRenderer` (T2). RESIST: creatures only, uniform ✓.
- **UI sounds:** every refused control plays `playUiRefusedSFX` except two. ⛔ An **illegal blueprint stamp click** (`controls.ts` `!canStampAt` → silent `return`, ~:1504) and an **illegal drag release** (`dragPreview.ts` gate) are both silent. **R T5 / merge owner.**

## Routed gaps (for the merge owner)
1. **T4** — build/destroy sparkle + aura parity for defenders (turret, Helga hall, stink tower); `spawnerZoneRenderer` walks spawners only. Already T4's A2 item.
2. **T2** — `chewerRenderer.ts` death watcher should call `classifyCreatureDeparture` (census allow-list names it); `goblinRenderer.ts` corpse should skip an expiry (last seen DESPAWNING) and a concealed spot through the same helper; chewer `drawStunStars` passes alpha 1 and no scale.
3. **T5 / merge owner** — refused-placement silence in `controls.ts` (blueprint stamp) and `dragPreview.ts` (drag release): add `playUiRefusedSFX()` like every other refused control.
4. **Owner (taste)** — the SFX gaps in the matrix; stink-tower damage-ramp art.
5. **Open** — Helga death beat (see NOT DONE).
