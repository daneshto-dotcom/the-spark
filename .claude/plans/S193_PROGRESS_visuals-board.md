# S193 · `s193/visuals-board` (visuals-5) · progress

## FINAL REPORT (V16, V20, V23, V24, V25, V27 built; V28 NOT DONE: s189/weld had not landed)
- merge: master b72e7790 merged in (clean, no conflicts). Base was dc1e96c3.
- gates on the merged tree: typecheck 0 · vitest 0 (488 files, 7473 passed, 11 skipped) · build 0, 1075.2 KiB / 1250 cap.
  Pre-merge on this branch: build 1049.3 KiB vs 1035.9 base = +13.4 KiB (AlphaFilter 3.0 of it). e2e:gating 0 (70/70) on port 27145 pre-merge (after the boundsArea fix; the first run was 1 red, fog.spec ghost probe, caused by this branch, fixed).
- bump verdict: NO BUMP. Render-only; nothing under src/net, no sim write, no hash/wire field. Two builds that shake hands cannot disagree about anything either computes.
- MINE (owner LOOK): every fx number; mist tint/strength 0x8090a8 @ 0.26; stain scale 1.12 (half-alpha on the S185 rim); AlphaFilter one-fade on HIGH (LOW/legacy = S185 drawing).
- seams: e2e/fog.spec.ts roll calls (aboveFog +stinkCloudRenderer.smoke at 24 -> spriteLayer 25; ground index 1 _Graphics -> _Container); groundDecalRenderer.ts (weld's S189 C2 territory); healthBar.ts untouched; fxLab.ts untouched.

## Batch: V16 stink · V20 build juice · V23 raided · V24 decals + race ground · V25 free sparks · V27 fog mist · V28 health ghost (LAST, after weld lands)

## Log
- step 0: worktree created from master dc1e96c3, npm install exit 0. Baseline build 1035.9 KiB (headroom 64.1).

- gates @ 49f1e526: typecheck 0 · vitest 1 → 4 red in stinkBagPortrait.test.ts (Object.create stub lacked the new smoke layer; FIXED next commit, file re-run 0) · build 0, 1049.1 KiB (+13.2 vs 1035.9 base; AlphaFilter = 3.0 of it, measured by stubbing it out).
- pentagramBuildability snapshot LF churn after vitest: reverted (pre-existing, benign, noted by S192).

- screenshots: 3 passes (.tmp-gates/fx/board.spec.ts), tuned stink puffs, mist visibility, stain footprint (1.12x). Pairs + index.html at C:/Users/onesh/OneDrive/Desktop/SPARK_Visuals_Pilot/visuals-5/.
  Harness failures, each ruled: draft overlay covered board (cleared w.draft) / FIGHT refused builds (removed) / solo has 1 seat (raider colour fixed) / one clock.pauseAt "fast-forward to the past" (harness timing, offset widened, re-run green).
- bench (FX_GPU=1, 120 creatures + 4 towers + 4 stink clouds + build/raided pushes every 330 ms, machine shared with ~12 worktrees):
  batch1 legacy 4.15/4.55, HIGH 4.45/5.27, LOW 5.73/4.82; batch2 legacy 6.99/6.50, HIGH 6.37/6.30, LOW 5.75/5.80 ms avg. Paired delta HIGH -0.6..+0.7 ms: within the +1.0 contract, dominated by load noise.

- e2e:gating run 1: 1 red (fog.spec remembers-a-ghost: ghostA green 0) — CAUSED BY THIS BRANCH: mist puffs overhang the board, stage bounds grew, extract.pixels mapping shifted. Proven by disabling the mist (green). Fixed 50ad0bf8 (boundsArea on mist/glow/smoke). fog.spec 6/6, e2e:gating 70/70.
- merged master b72e7790, post-merge tc 0 / vitest 0 (7473) / build 0 1075.2 KiB.

- AUDIT ROUND (coordinator, audit CLEAN): merged master (c7eac682, only S193_DISPATCH_LOG.md, no conflicts), npm install 0.
  MED grow/merge fog cull (structureGrow.ts/structureMerge.ts, isConcealed per prim/bond, both paths) + REACH test growMergeFog.test.ts (mutation red).
  LOW1 mist bump 60/100/180 + pinned auditor sample fogMistSample.test.ts (inside-visible max 0, own 0; old values -> red).
  LOW2 keep scaled to cap + spread test (unscaled -> red). LOW4 decal root boundsArea. Commits b358dfe7, cbff206c.

## NEXT STEP
- audit-round gates running (r-*.exit). Then short report. V28 waits for weld.
