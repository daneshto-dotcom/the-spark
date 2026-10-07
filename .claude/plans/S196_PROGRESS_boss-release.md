# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- FIX ROUND: merged master 71cfa975 (no conflicts). tc 0, vitest 1 = endgameAudit TIMEOUT only (alone: 0, 18 passed), build 0 (1275.4 KiB). e2e RUNNING detached to
  .tmp-gates/fr-{tc,vt,build,gating,render}.exit, then the FIX ROUND REPORT section below + final message.

## FIX ROUND REPORT (audit FIX FIRST: HIGH-1, LOW-1)
- HIGH-1 (fixed): a joiner's clock steps BACK when a snapshot lands; both trackers re-primed on any step back (and the
  release tracker pruned `tick < startTick`). New `sameTimeline()` (bossReleaseTrack.ts): primed = same World object &&
  PLAYING && -PEER_CLOCK_STEP_BACK_TICKS(12, MINE) <= gap <= forward cap. Big jumps (900->10) and forward gaps still re-prime.
  Falls are never pruned for tick < startTick; drawn ages clamp at 0. SAME FIX in SpawnerZoneRenderer.trackBirths (birth
  flare), its actAge clamped >= 0.
  Tests: unit (step back keeps fall + catches a release ON a step-back frame + no prune below start; new World / not
  PLAYING re-prime; past-tolerance re-prime); reach `bossReleaseReach` joiner REAL clock loop (tick++ x7 then snapshot
  +6, 16 snapshots, every frame in the window draws the release); `towerSignatureReach` joiner REAL clock birth flare on
  a step-back frame + still flaring after the next snapshot.
  Mutations: H1a tolerance reverted to `gap >= 0` -> 3 RED (unit + both reach); H1b prune `tick < startTick` restored ->
  unit RED; NM World identity ignored -> new-match unit RED. H1c (birth actAge clamp removed) -> GREEN: ruled
  defence-in-depth — births and falls only appear on snapshot frames and a snapshot never lowers the tick below an earlier
  snapshot's, so `tick < born` is unreachable on a peer; the clamp stays for safety.
- LOW-1 (fixed): the false comment is corrected (ENDLESS DYNASTY raises a mummies Pharaoh within 46 px of its keep); a boss
  first seen within BOSS_RELEASE_KEEP_EXCLUDE_PX (50, MINE) of its OWNER's keep is never a sighting. Test: Pharaoh 40 px from
  the keep with a broken mummies tower in range -> no release; control at 60 px -> release. Mutation L1 (drop the
  exclusion) -> RED.
- Hygiene: bossRelease.test.ts had mixed CRLF/LF lines from an earlier patch; normalised.

## FINAL REPORT
- **Tip:** see the last commit on `s196/boss-release`. Merges: master fb8f6b42 → 485dbddc, then 2722124c. No conflicts in either.
- **How the release is derived (render only, nothing new on the wire):** `src/render/fx/bossReleaseTrack.ts`. The host's
  tier-9 arm (`hostTick.ts`) does three things in ONE tick: it spawns the race boss at the ring anchor, razes the ring, and
  calls `REMOVE_SPAWNER`. Every client sees both changes in the same snapshot.
  - A tier-9 spawner that VANISHES from the synced `creatureSpawners` is a fall, and it plays the crumble.
  - A boss of that tower's race + owner, first SEEN within 12 ticks and 96 px of the anchor, upgrades the fall to a
    release.
  - Matching is a global total order: squared distance, then spawner id, then creature id.
  - The tracker is unprimed on its first frame. It re-primes after a gap of more than 30 ticks, a clock reset, or
    `clear()`. So a joiner gets no replay.
  - Seed = spawner id, place = the foot the tower renderer published. Both are synced, so host and peer agree.
  - It never reads `spawnedAtTick` or the spawner's tick fields, and there is no `world.effects` push.
- **Draws:** `src/render/fx/bossReleaseFx.ts` (pure), called from `SpawnerZoneRenderer.syncBossReleases`. That call is in
  the fx branch, ABOVE the signatures' empty-map return, because the release frame can empty `creatureSpawners`.
  - Fogged with `isConcealed` at the foot.
  - MINIMAL/legacy never reach it. LOW = half the particles, no dust curtain, no ripple.
- **Crumble (any t9 fall):**
  - the seal flashes and shatters into flying arcs;
  - glowing ground cracks;
  - staggered stone debris that tumbles and lands;
  - a ground dust cloud and a wall dust curtain;
  - embers.
  - 150 ticks = `TOWER_CRUMBLE_FRAMES` (pinned by a test).
- **Release (96 ticks):** a flash, a race-colour pillar, a shock ring and a HIGH ripple, then per race:
  - demons: a hellfire burst (flames + fire column + souls);
  - mummies: a sand-storm vortex column + gold glints + sand skirt;
  - nagas: a water geyser (jet, droplets raining down, splash rings);
  - orcs: a war-fire fireball + embers + smoke mushroom;
  - vampires: a crimson burst, 12 bats spiralling out, blood rain + stains;
  - zombies: goo blobs lobbed high that splat, a gas cloud, bubbles.
- **Per-tier cost** (orc release looped via the dev seam, 6 interleaved on/off rounds, Δ mean frame CPU):
  - HIGH +0.19 ms (2.15 vs 1.96; p95 3.0 vs 2.7);
  - LOW +0.04 ms;
  - MINIMAL draws 0 sprites, Δ −0.03 (noise).
  - Raw data: Desktop/SPARK_S196_BossRelease/bench-orcs.json.
- **Desktop:** `C:/Users/onesh/OneDrive/Desktop/SPARK_S196_BossRelease/`. It holds the README, 6 per-race 16-frame GIFs
  (cropped from 1920×1080), strips, release and crumble 1920×1080 PNGs, a BEFORE GIF + strip (orcs, demons) and the bench
  JSON.
  - The vite server was fresh for every capture (Playwright webServer, own port 27196, reuseExistingServer false).
  - Capture tooling: `.tmp-gates/cap/` (force-added).
  - `frames/` and `raw/` are superseded capture rounds. Deleting them needs owner approval (the destructive guard).
- **Gates on the merged tree (exit codes from files):**
  - typecheck **0**;
  - vitest **0** (631 files / 9478 passed, 14 skipped);
  - build **0**;
  - e2e:gating **0** (72 passed);
  - e2e:render **0** (10 passed), own per-worktree port.
- **Entry:** 1273.1 / 1350 KiB. Same tree with master's spawnerZoneRenderer: 1261.5 → **+11.6 KiB**, all mine.
- **Bump verdict: NONE.** Render-only: no sim, wire, hash or serialize change. It reads only synced state (spawner
  membership, creature id/type/owner/pos). Two builds that shake hands compute identical sims.
- **Tests:**
  - `src/render/fx/bossRelease.test.ts` (25): the deriver covers release, the boss seen a snapshot later,
    destroyed/scrapped, a pre-existing boss, wrong race/owner/place/time, the radius edge, joiner, gap, clock back, two
    towers in one tick, prune/reset, foot fallback. The drawers: per race deterministic, no NaN, LOW < 0.75×HIGH, no
    normal blend on top; races distinct; ripple HIGH-only; the dev seam is inert.
  - `src/render/bossReleaseReach.test.ts` (7): the REAL tier-9 release goes host → `netSnapshot` → JSON →
    `applyNetSnapshot` → the PEER's TowerRenderer + SpawnerZoneRenderer, and the exact sprites are asserted at ages 0
    and 6. Also covered: the host; a joiner gets nothing; a real ring-break destroy crumbles but never releases; enemy in
    fog draws nothing while in vision it does; LOW < HIGH; legacy 0.
- **Mutations (all RED, restored):**
  - M1 the vanish ignores priming;
  - M2 the release is drawn when unreleased;
  - M3 the fog gate is dropped;
  - M4 the sync is not called;
  - M5 a production write to the dev seam.
- **Self-audit fixes:**
  - (1) the first matching was greedy per fall in Map order, so a fall could steal its neighbour's boss and host/peer
    could disagree. It is now a global total order.
  - (2) master's `teams.sites` census went red on my inline seat compare. It is now `releaseKey(race, owner)`, an
    identity, deliberately not `sameTeam`, since a teammate's boss is not this tower's release.
- **Merge seams:**
  - `spawnerZoneRenderer.ts`: imports + the `syncBossReleases` call + method + `clear()` reset.
  - The census: if you prefer an inline compare pinned in `PINNED_SEATVAR` (src/state, outside my boundary), swap
    `releaseKey` back.
  - `BOSS_RELEASE_DEV` is a dev-only mutable export (off/loop). Nothing in src writes it, and a test enforces that.
- **MINE (owner LOOK items):**
  1. Every colour/count/timing (release 96 t, crumble 150 t, match 12 t / 96 px). Recommend: approve, overrule per race
     from the GIFs.
  2. The crumble fx is tier-9 only; tier-3 towers keep the sprite-only crumble. Recommend: extend the debris/dust to
     tier-3 (small follow-up).
  3. The opening flash whites out the tower ~1/3 s. Recommend: keep, trim on request.
- **NOT DONE:**
  - The crumble is not applied to tier-3 towers (see MINE 2).
  - The bench covered the orc release only. The other races emit equal or fewer sprites by construction, but that was
    not measured.
  - Capture note: the sim ticks in real time (worker), so GIF frames are ~19 ticks apart and play at real speed.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
- unit tests 23/23 + reach 7/7 + fxGuards green. SELF-AUDIT FIX: matching was greedy per fall (in Map order) -> a fall stole its neighbour's boss; now a global total order (d2, spawnerId, creatureId).
- MUTATIONS (all RED, restored, status clean): M1 vanish unprimed -> gap test red; M2 release drawn when !released -> destroyed reach red; M3 fog gate dropped -> fog reach red; M4 syncBossReleases not called -> 5 reach red.
