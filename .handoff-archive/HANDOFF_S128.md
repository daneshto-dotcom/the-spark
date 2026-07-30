# HANDOFF S128 — v0.6 PIVOT LANDED · ECONOMY PROBE BUILT · NOTHING PUSHED

**Session:** S128 · 2026-07-30 · Full tier, 2 priorities, both COMPLETE
**Slot delivered:** **V6-0.1** (doc reconciliation + economy probe harness)
**HEAD:** `c3e8acb` · **8 commits local, ZERO pushed** · tag `v0.5.2-pre-pivot` local
**State:** tsc 0 · vitest **1922/1922** (126 files, +8 new) · bundle **640.9/750 KiB**
(entry; +117.3 KiB simWorker = 758.1 KiB real download) · PROTOCOL_VERSION 15 unchanged

---

## ⛔ READ FIRST — TWO HARD BLOCKERS

### 1. The GitHub token is invalid. Nothing has shipped.

```
gh auth status → "The token in default is invalid."
```

`git push` **hangs** — Git Credential Manager is waiting on an invisible prompt, so it times out
rather than erroring. This is a credentials action; only the owner can clear it:

```bash
gh auth login -h github.com
git push origin master && git push origin v0.5.2-pre-pivot
```

**8 unpushed commits** (4 from S128 + the owner's 3 pivot commits, now reachable via the merge):
`c3e8acb` CHECK fixes · `d23073d` close · `c69d761` probe harness · `058fd8a` the v0.6 merge ·
`e69c65d` audit + PDR · plus `54831a4`/`eb495a2`/`817ac60` from the pivot branch.

⚠ **Pushing WILL fire a production deploy** — `c69d761` touches `src/`. The only production delta
is **+114 B** of inert module record (measured by building both sides). Everything else is
DEV-stripped. This also blocks the Pages `build_type=workflow` flip and any CI dispatch, so the
**e2e gating lane was NOT run this session** (unit suite + build stand in for it).

### 2. The owner's playtest is the gate on Phase 1.

The probe harness exists to answer two questions that block V6-1.3 and V6-1.4. Until it is played,
**do not open those slots.**

```bash
npm run dev -- --port 16267
```

→ `http://localhost:16267/?probe=1&regime=new&slots=8`
Keys: `[` regime · `]` slots 4/8/12/∞ · `1`-`6` stock a type · `Q` draw · `\` reset. `&spawn=N` sweeps λ.

**The one question:** with an 8-slot exact-type inventory, does the player *still* build large and
carve down to a recipe, or just assemble the recipe directly? Then drop to **4 slots** (below
pentagram's 5) and see whether carving returns — that is the threshold, and it is more informative
than the binary.

**The evidence is asymmetric, by construction.** Falsification (still carving) is STRONG. Confirmation
(assembling directly) is WEAK, because the owner knows the hypothesis and an inventory UI prompts
optimal play. A weak "confirmed" authorises a second probe, **not** a redesign of directives.
⚠ Restart the match after toggling regime — `[` resets counters but cannot reset the world, and the
overlay warns when primitives predate a reset.

---

## WHAT LANDED

### P1 — the pivot is on `master`, reconciled and corrected

The owner's branch forked at **S125** and never saw S126/S127, so a naive merge would have deleted
**429 lines** including LOCKED `§DEPLOY-PATH` and all of `§15 SOAK-CALIBRATION`. Merged with
`--no-commit`, kept **both** sides of the `BACKLOG.md` conflict, asserted 5 gates before committing.
The merge commit records both parents, so the branch stays reachable as provenance — **no force-push.**

- **Roadmap relabelled `V6-0.1 … V6-4.3`** (owner ruling), phase-relative, with an "executed in"
  column. 64 roadmap tokens rewritten via a range-restricted regex (S126–S150 only, so historical
  refs ≤S125 survived). 3 residual S126–S150 mentions are deliberate references to the *original*
  numbering.
- **43 corrections** across the four docs. The load-bearing ones: combo count is **14 of 36**, not 24
  (the Blueprint contradicted *itself* 144 lines apart, so the Energy substrate is 42% smaller than
  advertised) · NONET swing is **5×** via `NONET_LOSER_MULT = 0.4`, not "4×" and not "a ÷2", so
  "drop the ÷2" would have reverted the owner's own S106 ask · a bundle breach **blocks the deploy**
  (the doc had it inverted — the exact mislabel that cost S100) · the wire is **6.7–8.5 KB** live and
  **38.5 KB** at six seats, not "~3 KB", so +30 agents is **+17%, not +100%** · "spawn rate scales
  with build events" was **never implemented** · towers **do** auto-retarget today · energy is idle
  **82 days**, not "a year", and has **zero reads**.
- **B3 and B4 are now inside the spec**, adjacent to the claims they govern and marked
  `PROVISIONAL — PRE-PROBE`: the faucet constants beside the bank-cap reasoning, the recipe-size
  table beside the cap number.
- **LOCKED unlock pass finished** for everything gating Phase 1, each ruling placed *in the section
  it governs*: §2 vision placeholders (`R_personal` was recorded as 300 px for ~65 sessions; real
  value **75**) · §3 energy rewritten (it was locking the very stub its own header called superseded)
  · **§11 Carry-1 row RULED — amended, not revoked.** That was the one lock the roadmap silently
  violated, and V6-1.3/V6-1.5 cannot be built without changing it.
- **CARRY-FORWARD LEDGER** added: the 4 parked CI items with blocking reasons, the 23 engineering
  risks each bound to its slot, and the owner-gated decisions.

### P2 — the economy probe harness (dev-build-only)

Council R1 **killed my first design**: free material under carry-1 forces the *old* behaviour and so
could only have illustrated starvation, never tested B4. Replaced with a live A/B (OLD = carry-1 +
uniform · NEW = exact-type N-slot inventory) and a **slot dial**, turning a binary into a threshold
measurement.

Reaches the world through **two already-shipped actions only** — `SPAWN_SPARK` then `PICKUP_SPARK`
— so no new action type, reducer, protocol bump, snapshot field, save change or `stateHash` change.
Asserted by test, so the claim can't rot silently.

**Stripped from production, verified not asserted:** `grep` across `dist/assets/*.js` returns **0
files** for the sentinel, `installProbeHarness`, `diffOwned` and the overlay string. Production delta
**+114 B**, measured by rebuilding the true baseline (656186 B → 656300 B).

---

## THE CHECK PHASE FOUND SOMETHING SERIOUS — read this before trusting any future metric

Triumvirate CHECK caught that the **redesigned** harness still had a metric that **could not measure
B4**. The sampler compared owned-primitive *counts*: place one and sever one in the same window and
the net delta is **zero**, so *both* events vanished. That bias runs in the worst possible direction
— it **under-reports carving**, which is precisely the false negative that would have wrongly
"confirmed" B4. Fixed with a set difference (`diffOwned`), pinned by 3 tests.

So the same blocker was nearly missed **twice, at two different layers** — design, then
implementation — and was caught both times by an adversarial reviewer, not by me. Transferable
lesson: when an artifact's purpose is to *measure*, audit the measurement path as a first-class
deliverable. "Does it run?" and "can it tell the difference?" are different questions.

Also fixed in CHECK: the harness would have **silently broken under `?worker=1`** (verified:
`SPAWN_SPARK` is absent from `CLIENT_INTENT_TYPES_RECORD` while `PICKUP_SPARK: true` is present, so
the spawn intent is dropped and the pickup references a nonexistent spark) — it now refuses to arm ·
`prevPrimCount` started at 0 · a solo-gate race between sampler and keypress · fixed-base probe ids ·
HMR accumulation of overlays/timers/listeners.

**Refuted:** GEMINI elevated to HIGH a claim that a failed `?spawn=` override would make the overlay
*falsely report* OVERRIDDEN. The displayed value is the **imported constant**, so a failed override
shows the true `0.1875 (shipped default)`. Mechanism fabricated — third session running where a
reviewer cited a mechanism that doesn't exist. Grep-verify before triage. The underlying worry was
cheap to action anyway, so the overlay now compares requested vs observed and shouts.

---

## OWNER DECISIONS OUTSTANDING (all logged in the ledger, none dropped)

| # | Decision | Gates |
|---|---|---|
| 1 | `gh auth login` then push | everything |
| 2 | **Playtest** → B3 faucet rate + B4 directive semantics (bias vs hard filter) and bank cap | V6-1.3, V6-1.4 |
| 3 | **B6 reversibility**: (A) branch off `v0.5.2-pre-pivot`, no prod deploys of Phase-1 work, or (B) additive-only keeping `CarryingPlayer` live | V6-1.1 |
| 4 | `worker` → `gatherer` rename. **Not applied** — it's the owner's word and no code entity exists yet. Constraint on record: the code identifier **cannot** be `Worker` (the Web Worker owns the authoritative World), and both reviewers held a split vocabulary is worse than either pure choice | V6-1.1 |
| 5 | **V6-2.1 ordering** — 3 of 5 targeting priorities have no damageable target (`DEFENDER_HP` is a 1e9 sentinel, `CreatureSpawner` has no hp field, the only damage fn is `damageCreature`). Insert a structure-HP slot first, or move V6-2.1 after V6-2.4 | V6-2.1 |
| 6 | Pages `gh api -X PUT .../pages -f build_type=workflow` → verify live asset hash → *then* optionally delete `origin/gh-pages`, **in that order** | cosmetic; needs #1 |

---

## TRAPS FOR THE NEXT SESSION

- **Never run `python -c` through bash when the payload contains backticks.** Command substitution
  silently ate ~20 backticked identifiers from 3 markdown lines *while my script reported "4 of 5
  applied"* — a true success count over corrupt content. Write a script FILE and execute that. I hit
  a heredoc quoting failure earlier in the same session, switched to files, then regressed two steps
  later.
- **A verification whose verdict comes from a pipeline's exit status is testing the last command.**
  `if grep -rl X dist/ | grep -v map | head -3; then` **always** takes the then-branch, because
  `head` exits 0. It could not have reported a pass for any input. Make the check emit a **number**
  and assert on the number. I only doubted it because it disagreed with an independent measurement.
- **A hidden Browser pane pauses `requestAnimationFrame`**, so the Pixi ticker never advances and the
  sim does not run — which is why synthetic canvas clicks did nothing and an rAF-awaiting script timed
  out. DOM reads and window globals still work. When a frame is required and the pane is unavailable,
  drop to the reducer level.
- **Run mechanical renames BEFORE edits that introduce new references to the old tokens.** Several
  corrections legitimately mention the real S126/S127; had they landed before the relabel regex, those
  true historical refs would have been rewritten into V6 slot labels — a corruption that greps clean.
- **Still true:** `git push` on master IS a production deploy for `src/ public/ index.html
  vite.config.ts tsconfig.json package*.json deploy.yml` · never trust `gh api .../pages` (reports
  stale legacy/gh-pages) — trust the deployments API + the live asset hash · `npm run deploy` and
  `scripts/deploy-pages.sh` are DELETED, do not recreate them · `e2e/**` is NOT type-checked, so run
  `npx playwright test <spec> --list` after editing a spec · MCV needs an ABSOLUTE-path
  `verification[]` binding on a **completed** priority for `BACKLOG.md`.
- **MODEL DRIFT persists:** this session ran `claude-opus-5` against a `claude-opus-4-8` pin. Now 2
  consecutive boots after a run of 6. Root-cause the override (CLI `--model`, `/model`, or a client
  update) before a long autonomous run.

---

## NEXT SLOT

**V6-0.2 — Learnability I** is next in the plan, but it was **rescoped by the audit**: the no-HUD
lock has been de-facto dead ~65 sessions (an N-player leaderboard with a crown and `<YOU` marker
already ships at `ui.ts:297-325`, plus a combos counter, the energy gauge, and `SCORE_TIER` as a real
rendered 48-tick effect). The real residual is **score/standing in solo** (the leaderboard is gated
`isNetworked(world)` at `ui.ts:295`) plus making the existing tier pulse legible. Budget
*amplification*, not plumbing.

**But the playtest result may reorder Phase 1 ahead of it.** If B4 confirms, the directive/bank design
needs rework before any of Phase 1 opens — which is a design round, not a code slot.
