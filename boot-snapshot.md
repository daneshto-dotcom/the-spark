# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-30 | Session: S128 (v0.6 pivot landed + economy probe harness — slot V6-0.1, 2/2 shipped)

## ⛔ TWO BLOCKERS BEFORE ANY WORK

**1. NOTHING IS PUSHED. The GitHub token is invalid.** `gh auth status` → *"The token in default is
invalid."* `git push` **hangs** (Git Credential Manager waiting on an invisible prompt) rather than
erroring. **8 commits + tag `v0.5.2-pre-pivot` are local only.** Owner must run
`gh auth login -h github.com`, then `git push origin master && git push origin v0.5.2-pre-pivot`.
⚠ That push **fires a production deploy** (`c69d761` touches `src/`); the only production delta is
**+114 B** of inert module record. It also blocks the Pages `build_type` flip and CI dispatch — so
the **e2e gating lane was NOT run in S128** (unit suite + build stood in).

**2. THE OWNER'S PLAYTEST GATES PHASE 1.** `npm run dev -- --port 16267` →
`http://localhost:16267/?probe=1&regime=new&slots=8`. Keys `[` regime · `]` slots · `1`-`6` stock ·
`Q` draw · `\` reset · `&spawn=N` sweeps λ. **Do not open V6-1.3 or V6-1.4 before B3/B4 are ruled.**

## STATE
tsc 0 · vitest **1922/1922** (126 files) · bundle **640.9/750 KiB** entry (+117.3 KiB simWorker =
**758.1 KiB real download**) · PROTOCOL_VERSION 15 unchanged · HEAD `c3e8acb` · gitleaks clean.
The live site is **unchanged** — no deploy has fired.

## WHAT S128 DELIVERED (slot V6-0.1)
The owner's v0.6 pivot is now on `master`, reconciled and corrected. Their branch forked at **S125**
and never saw S126/S127, so a naive merge would have deleted **429 lines** including LOCKED
`§DEPLOY-PATH` and all of `§15 SOAK-CALIBRATION`; merged keeping BOTH sides of the `BACKLOG.md`
conflict, 5 gates asserted, both parents recorded, no force-push. Roadmap relabelled
**`V6-0.1 … V6-4.3`** (phase-relative, decoupled from session numbers). 43 corrections landed.
LOCKED unlock pass finished for everything gating Phase 1. A **CARRY-FORWARD LEDGER** now binds the
4 parked CI items and 23 engineering risks to the slots that must clear them.

Plus a **dev-build-only economy probe harness** (A/B: carry-1+uniform vs an exact-type N-slot
inventory, slot dial 4/8/12/∞) to settle B3 and B4 empirically. Stripped from production — 0 grep
hits for 4 needles.

## THE TWO BLOCKERS IN THE DESIGN (now in the spec, marked PROVISIONAL — PRE-PROBE)
- **B3 · the faucet, not transport, is the bottleneck.** `SPAWN_RATE_PER_SECOND = 0.1875` with
  `FREE_SPARK_TTL_TICKS = 600` (10 s, reaped every tick) ⇒ standing pool **~1.9 sparks arena-wide**
  (Little's Law). `FREE_SPARK_SOFT_CAP = 50` is unreachable dead code. An 8-slot bank fills in
  **~256 s**, not the specified 20–40 s; "squares only" is served by one square per ~25 s for all six
  seats combined. The constant appeared in **none** of the four pivot docs.
- **B4 · directives + a bank of 8–10 would delete the carve-down tactic** the pivot exists to protect.
  Every godly recipe is an **exact isolated component** (pentagram 5 · lightningHub 6 · Helga 7 ·
  Voltkin 8 · laserTurret 8) and scoring has **no per-component term**, so a cap ≥ every recipe makes
  "assemble it directly, first try" rational. Carving was never economically motivated — it was
  *forced* by random types + carry-1. **Keep the recipe-size table beside the cap number forever.**

## Next Steps
1. **OWNER: `gh auth login` + push.** Then the Pages `build_type=workflow` flip → verify live asset
   hash → *then* optionally delete `origin/gh-pages`, IN THAT ORDER.
2. **OWNER: playtest the probe.** Falsification (still carving at 8 slots) is STRONG evidence;
   confirmation is WEAK (you know the hypothesis; an inventory UI prompts optimal play) and authorises
   a second probe, not a directive redesign. Drop to 4 slots to find the threshold.
3. **OWNER: B6 reversibility** — (A) branch off `v0.5.2-pre-pivot`, or (B) additive-only keeping
   `CarryingPlayer` live. Hard precondition on V6-1.1.
4. **OWNER: `worker`→`gatherer`** — not applied; it's your word. The code identifier cannot be
   `Worker` (the Web Worker owns the authoritative World).
5. **V6-0.2 Learnability I** is next in the plan but was **rescoped**: no-HUD has been de-facto dead
   ~65 sessions (leaderboard + crown + combos counter + tier pulse all ship). Real residual =
   score/standing in **solo** (gated `isNetworked(world)` at `ui.ts:295`) + making the tier pulse
   legible. Budget amplification, not plumbing.

## Blockers
- Push + playtest, as above. No technical blockers in the code.
- **V6-2.1 cannot be built as written (R6):** 3 of 5 targeting priorities have no damageable target
  — `DEFENDER_HP = 1_000_000_000` is an explicit sentinel, `CreatureSpawner` has no hp field, and the
  only damage function in the game is `damageCreature`. Insert a structure-HP + `damageEntity` slot
  before it, or move it after V6-2.4. **Owner decision.**
- **V6-1.5 is mis-tiered Standard→Full (R7):** deleting `CarryingPlayer` silently changes shipped
  hazard rules — the LMB chain is gated on Idle (`controls.ts:245`) so bomb/rainbow/potato become
  always-grabbable; poop loses 3 of 4 surfaces; the hunter loses confiscation until V6-2.2.

## Pending Backlog
- **PARKED CI x4** (not dropped, each with its blocker): permanent soak window/threshold shape —
  needs the **Mon 2026-08-03 07:00 UTC** cron sample, do NOT decide on n=3-4 · worker-isolate ceiling
  10MB→~3MB — BLOCKED on `readWorkerFloorMB()` being a single read at `worker-heap.spec.ts:182`,
  outside the stabilization loop at `:174-181` · Playwright `deviceScaleFactor` raster lever ·
  `e2e/**` outside tsconfig coverage.
- **23 engineering risks R1–R23**, each bound to its V6 slot in the ledger. Earliest-biting:
  **R1** `stateHash.ts:45-48` `HashableWorld` omits every entity family, so the desync oracle is blind
  to gatherers in the very slot that flips the worker default on · **R5** `WIN_TRIGGER` destroys 7
  entity families at t=0 (`world.ts:431-451`), so castle survival into the ceremony is a V6-1.2
  decision · **R10** the r=188 shrink hard-fails `collision.pile.test.ts` (2.89 px vs a 1.5 px
  assertion) · **R12** the host sends the full payload once per active transport strategy and 10 Hz is
  a cap measured collapsing to 2.2 Hz ⇒ delta encoding is Phase-1-adjacent, not V6-4.2 cleanup.

## CRITICAL TRAPS FOR THE NEXT SESSION
- **NEW S128 — never run `python -c` through bash when the payload has backticks.** Shell command
  substitution silently ate ~20 backticked identifiers from 3 markdown lines **while the script
  reported "4 of 5 applied"** — a true success count over corrupt content. Write a script FILE. I hit
  a heredoc quoting failure earlier in the same session, switched to files, then regressed.
- **NEW S128 — a verification whose verdict comes from a pipeline's exit status tests the LAST
  command.** `if grep -rl X dist/ | grep -v map | head -3; then` always takes the then-branch because
  `head` exits 0; it could not report a pass for any input. Make the check emit a **number** and
  assert on the number.
- **NEW S128 — a hidden Browser pane pauses `requestAnimationFrame`**, so the Pixi ticker never
  advances and the sim does not run. Synthetic canvas clicks do nothing; rAF-awaiting scripts time
  out. DOM reads and window globals still work. Drop to the reducer level when a frame is needed.
- **NEW S128 — run mechanical renames BEFORE edits that add new references to the old tokens.**
  Corrections legitimately mention the real S126/S127; landing them before the relabel regex would
  have rewritten true historical refs into V6 labels — a corruption that greps clean.
- **NEW S128 — when an artifact's job is to MEASURE, audit the measurement path as a first-class
  deliverable.** The probe's metric compared owned-primitive COUNTS, so a placement and a sever in the
  same window cancelled to nothing and carving was under-reported — the exact false negative that
  would have wrongly confirmed B4. "Does it run?" and "can it tell the difference?" are different
  questions.
- **Reviewers fabricate mechanisms — grep-verify before triage.** Third session running. S128:
  GEMINI elevated to HIGH a claim that the overlay reads the URL for the spawn rate; it reads the
  imported constant. GROK's 3 refuted claims included one conflating the gated entry chunk with real
  download.
- **Audit CI run CONCLUSIONS, not just that a workflow exists.** A job killed by `timeout-minutes`
  concludes `cancelled`, not `failure` — no email, and the SIGKILL destroys the artifacts.
- **`git push` on master IS a production deploy** for `src/ public/ index.html vite.config.ts
  tsconfig.json package*.json deploy.yml` — note `package.json`, so a "harmless" npm-script tweak
  ships. **Do NOT trust `gh api .../pages`** (reports stale legacy/gh-pages) — trust the deployments
  API + live asset hash. `npm run deploy` / `scripts/deploy-pages.sh` are DELETED; do not recreate.
- **`e2e/**` is NOT type-checked** (`tsconfig include: ["src"]`) — after editing a spec run
  `npx playwright test <spec> --list` (~2 s module eval).
- **MCV** needs an ABSOLUTE-path `verification[]` binding on a **completed** priority for
  `BACKLOG.md`. Fired in S125, S126, mid-S127.
- **Before touching the `PW_RETRIES` guard, read LOCKED §15.4** — three required properties, two
  reviewers pulled in opposite directions to get there.
- **MODEL DRIFT:** S128 ran `claude-opus-5` against a `claude-opus-4-8` pin (2 consecutive boots after
  a run of 6). Root-cause the override before a long autonomous run.

## Recent Reflexion (S128)
- **#the-same-blocker-was-nearly-missed-twice-at-two-different-layers** — B4 escaped once at DESIGN
  (my first probe gave free material under carry-1, which forces the old behaviour; both Council legs
  caught it independently) and once at IMPLEMENTATION (count-delta aliasing; GEMINI caught it, GROK
  missed it). Same question, two layers, both caught by an adversarial reviewer rather than by me.
- **#never-run-python--c-through-bash-when-the-payload-has-backticks** — see traps.
- **#a-pipeline-verification-can-false-pass-because-the-last-command-decides-the-exit-status** — see traps.
- **#measure-the-delta-by-building-both-sides-rather-than-trusting-a-remembered-baseline** — rebuilt
  the true baseline by moving files aside; it reproduced exactly at 656186 B, making the delta a
  precise +114 B rather than "unchanged" or "noise".
- **#a-hidden-browser-pane-freezes-requestAnimationFrame-so-gameplay-cannot-be-driven** — see traps.
- **#relabel-a-numbering-scheme-before-introducing-new-references-to-the-old-numbers** — see traps.
