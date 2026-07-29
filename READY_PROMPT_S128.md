Boot SPARK systematically off the last handoff: read HANDOFF_S127.md in the project root (durable
copy: .handoff-archive/HANDOFF_S127.md), plus boot-snapshot.md and .claude/session-state.json.
Latest commit 331ba16 on master.

State: tsc 0 · vitest 1914/1914 · bundle 640.8/750 KiB · PROTOCOL_VERSION 15 · live on
spark-online.space. S127 shipped ONE priority: soak-lane CI viability, fixed by recalibrating the
INSTRUMENTS rather than the budget. Zero src/ files changed, so the live game is byte-identical to
S126 and the push deliberately shipped no deploy (verified: no deploy run fired).

S127 is FULLY CI-VERIFIED — nothing left hanging. Dispatch run 30395046615 concluded success:
`e2e` gating success (24 passed + 1 flaky, 4m06s) and **`e2e-soak` SUCCESS in 22m41s, 4 passed / 0
failed — down from 44m + globalTimeout (-48%)**. Quarantine failed as expected (non-gating, CI can't
hold P2P data channels). Every mechanism was verified in the CI log rather than inferred: the warm-up
now completes (1233/1284/1255 of 1200 ticks, all capped=false, vs 648-693 pre-fix), the two-regime
gate declared its own sensitivity per test (2304 ticks -> SHORT 4.4 KB/tick, 8598 -> STRICT 1.2, 2409
-> SHORT 4.3), the scaled census exercised its floor path, and **the determinism oracle executed in CI
for worker-heap:333 for the first time ever and passed.**

One thing to carry: the gating lane's single flake was worker-bots.spec.ts asserting
`hashMismatches === 0` — the determinism oracle flaking under CI load (it retried and passed, which
incidentally proves retries:2 survives outside the soak lane). Don't read a future soak oracle failure
as a real determinism regression without checking that it reproduces.

Root mechanism S127 established, now LOCKED §15.1 — do not re-derive it: sim ticks are FRAME-bound.
main.ts:1389 clamps dtSec to 0.05s and PHYSICS_HZ=60, so at most 3 ticks advance per RENDERED frame.
Bots worlds manage 7.2-7.7 ticks/s on a 2-core SwiftShader runner (~2.5 fps) vs ~26 local. So "ticks
achieved" measures the runner's GPU, not the code — which is why a tick-floor assertion was the single
thing failing 5/5 while every real threshold passed. Any option that buys ticks with wall-clock is
structurally doomed; relaxing the dt clamp is REJECTED (production sim code on the deploy path).

Top candidates, in order:
1. Permanent window/threshold shape from the tick-rate curve now logged every run. Decide from data —
   deciding from n=3-4 cost three iterations in S127.
2. Tighten the worker-isolate ceiling 10MB → ~3MB. Direction is right (its spread is 0.76MB vs the
   main thread's 5.5MB, so ~3MB would resolve ~1.4KB/tick — near the original design intent) but it is
   BLOCKED on instrument repeatability: readWorkerFloorMB() is a SINGLE read at worker-heap.spec.ts:182,
   outside the stabilization loop at :174-181. Add stabilization or median-of-N, THEN re-measure.
3. Unexplored legitimate lever: Playwright deviceScaleFactor to cut raster cost and buy real FPS ⇒ real
   ticks, with zero src/ change. Needs a before/after, since rasterization is partly what the
   render-side audit measures.

Five traps that cost real time in S127 — do not relearn them:
1. A code comment is a CLAIM about external state, not evidence of it. I copied "CI minutes are a hard
   constraint" out of e2e.yml's own header into the A.0 packet as fact; the repo is PUBLIC and Actions
   minutes are free. It had already anchored a Council recommendation to DELETE the lane. Probe every
   external-state noun in a premise, including the ones a repo file appears to answer.
2. The SECOND time a threshold needs retuning, stop tuning and check the UNITS. The census limit went
   1500 → 75 → 30 → 40 (the last passing by ONE object) before the dimensional model appeared. Both
   signal (t/30) and noise (~t/220) scale with the window, so a FRACTION of the signal was right all
   along — the shape Grok proposed and I rejected on n=4 evidence.
3. An early expect() in a shared helper voids every assertion below it, invisibly on a
   continue-on-error lane. The determinism oracle had NEVER executed in CI for worker-heap:333. When a
   test fails, the assertions after the failing line produced NO evidence — never cite them as passing.
4. e2e/** is NOT type-checked (tsconfig include:["src"]; typecheck and build are both `tsc -b`). After
   editing any spec run `npx playwright test <spec> --list` (~2s module evaluation) and/or `npx tsc
   --noEmit` pointed at the spec. A temporal-dead-zone ReferenceError cost a full 16-minute soak run.
5. Before touching the PW_RETRIES guard, read LOCKED §15.4 — it has THREE required properties and two
   reviewers pulled in OPPOSITE directions to reach it. "Simplifying" it re-opens either a silent
   degradation or an all-lane config-load outage that kills the GATING lane with zero artifacts.

Also still true: `git push` on master IS a production deploy for src/ public/ index.html/
vite.config.ts/tsconfig.json/package.json/package-lock.json/deploy.yml — note package.json is in that
list, so a "harmless" npm-script tweak ships to prod. Do NOT trust `gh api .../pages` (reports stale
legacy/gh-pages); trust the deployments API + live asset hash. `npm run deploy` and
scripts/deploy-pages.sh no longer exist — do not recreate them (LOCKED §DEPLOY-PATH). And MCV
hard-fails unless a **completed** priority carries an ABSOLUTE-path verification[] binding for
BACKLOG.md — this fired in S125, S126, and again mid-S127 while the priority was still in_progress.

Owner-gated (don't start these without my go): ?worker=1 weak-device playtest ·
BOT_INTELLIGENCE_DESIGN.md §7 answers · `gh api -X PUT .../pages -f build_type=workflow` then
optionally delete origin/gh-pages, in that order.
