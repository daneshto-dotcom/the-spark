Boot SPARK systematically: read `boot-snapshot.md` first (it supersedes the handoff+backlog+reflexion
reads), then `HANDOFF_S128.md` in the project root and `.claude/session-state.json`. Latest commit
`c3e8acb` on master.

TWO BLOCKERS BEFORE ANY WORK — do not propose a technical priority until you have raised both with me:

A. **NOTHING IS PUSHED.** `gh auth status` reports "The token in default is invalid", and `git push`
   HANGS (Git Credential Manager waiting on an invisible prompt) rather than erroring. 8 commits and
   the tag `v0.5.2-pre-pivot` are LOCAL ONLY. I have to run `gh auth login -h github.com` myself —
   don't try to do it for me. Then `git push origin master && git push origin v0.5.2-pre-pivot`.
   ⚠ That push FIRES A PRODUCTION DEPLOY (`c69d761` touches src/). Only production delta is +114 B of
   inert module record; everything else is DEV-stripped and verified absent from dist/. Because CI
   can't be dispatched without auth, the e2e gating lane was NOT run in S128 — unit suite (1922/1922)
   and `npm run build` stood in. Re-verify the lane once auth is back.

B. **MY PLAYTEST GATES PHASE 1.** S128 built a dev-only economy probe harness whose entire job is to
   settle two blockers before 7 slots of protocol/reducer surgery commit to them. Ask me whether I've
   run it. `npm run dev -- --port 16267` → `http://localhost:16267/?probe=1&regime=new&slots=8`.
   Keys: `[` regime · `]` slots 4/8/12/∞ · `1`-`6` stock a type · `Q` draw · `\` reset · `&spawn=N`
   sweeps λ. **Do not open V6-1.3 or V6-1.4 before I've ruled on B3/B4.**

STATE: tsc 0 · vitest 1922/1922 (126 files) · bundle 640.9/750 KiB entry (758.1 KiB real download incl.
the simWorker chunk) · PROTOCOL_VERSION 15 unchanged · gitleaks clean · live site UNCHANGED (no deploy
has fired).

WHAT S128 DID (slot V6-0.1). Landed my v0.6 pivot on master, reconciled and corrected. My branch
forked at S125 and never saw S126/S127, so a naive merge would have deleted 429 lines including LOCKED
§DEPLOY-PATH and all of §15 SOAK-CALIBRATION — merged keeping BOTH sides of the BACKLOG.md conflict,
5 gates asserted, both parents recorded, no force-push. Roadmap relabelled V6-0.1 … V6-4.3
(phase-relative, so an inserted session no longer invalidates the plan — the failure mode that ate the
S86 roadmap). 43 factual corrections. LOCKED unlock pass finished for everything gating Phase 1,
including the §11 Carry-1 row — the one lock the roadmap silently violated. A CARRY-FORWARD LEDGER now
binds 4 parked CI items and 23 engineering risks to the slots that must clear them.

THE TWO DESIGN BLOCKERS, both now in the spec marked PROVISIONAL — PRE-PROBE:
- B3 the faucet, not transport, is the bottleneck. SPAWN_RATE_PER_SECOND=0.1875 with a 10s TTL ⇒ a
  standing pool of ~1.9 sparks ARENA-WIDE. An 8-slot bank fills in ~256s, not the specified 20-40s;
  "squares only" is served by one square per ~25s for all six seats combined. FREE_SPARK_SOFT_CAP=50
  is unreachable dead code. The constant appeared in none of my four pivot docs.
- B4 directives + a bank of 8-10 would DELETE the carve-down tactic the pivot exists to protect. Every
  godly recipe is an exact isolated component (5/6/7/8/8) and scoring has no per-component term, so a
  cap ≥ every recipe makes "assemble it directly, first try" rational. Carving was never economically
  motivated — it was forced by random types + carry-1.

HOW TO READ MY PLAYTEST RESULT — the harness is deliberately asymmetric. Falsification (I still build
large and carve at 8 slots) is STRONG: B4 is dead, directives+bank are safe. Confirmation (I assemble
directly) is WEAK, because I know the hypothesis and an inventory UI prompts optimal play — it
authorises a SECOND probe, not a redesign of directives. Corroborate with the overlay's sever-action
and peak-primitive counters rather than my self-report, and ask whether I dropped the dial to 4 (below
pentagram's 5) to find the threshold.

MY OTHER OPEN DECISIONS (all in the ledger — prompt me, don't guess):
1. B6 reversibility, hard precondition on V6-1.1: (A) develop Phase 1 on a branch off
   v0.5.2-pre-pivot with no prod deploys until the gate passes, or (B) additive-only keeping
   CarryingPlayer live and build-from-bank as a parallel reducer, deletion moved to V6-4.3.
2. `worker` → `gatherer` rename. NOT applied in S128 because it's my word and no code entity exists
   yet. The constraint is real though: the code identifier CANNOT be `Worker` — that already names the
   Web Worker owning the authoritative World (workerSim.ts, workerSim.differential.test.ts) — and both
   Council reviewers held a split vocabulary (docs "worker" / code `Gatherer`) is worse than either
   pure choice. Decide at V6-1.1.
3. V6-2.1 ordering: 3 of its 5 targeting priorities have NO damageable target (DEFENDER_HP is a 1e9
   sentinel, CreatureSpawner has no hp field, the only damage fn is damageCreature). Insert a
   structure-HP + damageEntity slot before it, or move it after V6-2.4.
4. Pages `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow` → verify the live asset hash
   → THEN optionally delete origin/gh-pages, IN THAT ORDER. Needs auth first.

NEXT SLOT IF I CLEAR THE GATES: V6-0.2 Learnability I — but it was RESCOPED by the audit. The no-HUD
lock has been de-facto dead ~65 sessions: an N-player leaderboard with a crown and `<YOU` marker
already ships (ui.ts:297-325), plus a combos counter, the energy gauge, and SCORE_TIER as a real
rendered 48-tick effect. The real residual is score/standing in SOLO (the leaderboard is gated
`isNetworked(world)` at ui.ts:295) plus making the existing tier pulse legible. Budget amplification,
not plumbing. If B4 confirms, Phase 1 needs a design round ahead of V6-0.2 instead.

FIVE TRAPS FROM S128 — do not relearn them:
1. Never run `python -c` through bash when the payload contains backticks. Shell command substitution
   silently ate ~20 backticked identifiers from 3 markdown lines WHILE the script reported "4 of 5
   applied" — a true success count over corrupt content. Write a script FILE and execute that.
2. A verification whose verdict comes from a pipeline's exit status is testing the LAST command.
   `if grep -rl X dist/ | grep -v map | head -3; then` always takes the then-branch because `head`
   exits 0 — it could not report a pass for any input. Make the check emit a NUMBER, assert on it.
3. A hidden Browser pane pauses requestAnimationFrame, so the Pixi ticker never advances and the sim
   does not run. Synthetic canvas clicks silently do nothing and rAF-awaiting scripts time out. DOM
   reads and window globals still work. Drop to the reducer level when you need a frame.
4. When an artifact's job is to MEASURE, audit the measurement path as a first-class deliverable. The
   probe's first metric compared owned-primitive COUNTS, so a placement and a sever in the same window
   cancelled to nothing and carving was under-reported — the exact false negative that would have
   wrongly confirmed B4. "Does it run?" and "can it tell the difference?" are different questions.
5. Reviewers fabricate mechanisms — grep-verify cited symbols and code paths BEFORE triage. Third
   session running. In S128 GEMINI elevated to HIGH a claim that the overlay reads the URL for the
   spawn rate; it reads the imported constant, so a failed override displays the true 0.1875.

Also still true: `git push` on master IS a production deploy for src/ public/ index.html
vite.config.ts tsconfig.json package*.json deploy.yml. Never trust `gh api .../pages` (reports stale
legacy/gh-pages) — trust the deployments API + live asset hash. `npm run deploy` and
scripts/deploy-pages.sh no longer exist — do not recreate them. `e2e/**` is NOT type-checked, so after
editing a spec run `npx playwright test <spec> --list`. MCV hard-fails unless a **completed** priority
carries an ABSOLUTE-path verification[] binding for BACKLOG.md. And MODEL DRIFT: S128 ran
claude-opus-5 against a claude-opus-4-8 pin — root-cause the override before any long autonomous run.
