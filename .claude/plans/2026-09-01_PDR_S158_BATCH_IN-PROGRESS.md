# BATCH PDR — S158 · "finish what we already know needs finishing"

Date: 2026-09-01 | Session: S158 | Entry commit: 668ecd3 | Tier: **Full** (batch takes the highest tier)
Status: **APPROVED BY OWNER** — verbatim: *"i pre-approve the pdr ... Autonomous run and full session
top priority batch APPROVED!"* plus *"Do everything that you know is already in priority
backlog/project roadmap as well as anything you added to top priorities/carry-forwards in the
previous sessions that we already know needs to be done"* and *"DO NOT close the session"*.

Scope rule applied: **only work with an existing owner ruling or an empirically-proven defect.**
Anything needing a NEW ruling is deferred to the question list at the end, not guessed at.

---

## A.0 — STATE-DISCOVERY (Rule 21), run BEFORE locking scope

Every claim below was probed on disk/CI this session, not inherited from the handoff.

| # | Check | Expected (from handoff) | ACTUAL (measured) | Δ |
|---|---|---|---|---|
| 1 | `npx tsc --noEmit` | clean | clean, exit 0 | — |
| 2 | `npx vitest run` | **3220 / 3220** | ⛔ **3219 / 3220 — one TIMEOUT** | **DELTA** |
| 3 | CI conclusions (`gh run list`) | green | green; last deploy 33275300499 success; scheduled E2E 2026-08-31 success | — |
| 4 | `npm run verify-deploy` | PASS 4/4 | PASS 4/4, content-hash equality | — |
| 5 | bundle | 749.8 / 900 KiB | 749.8 KiB, headroom 150.2 KiB | — |
| 6 | `.env` present | absent (owner action pending) | absent | — |
| 7 | **does CI pass `VITE_TURN_*` to the build?** | implied by `TURN_SETUP.md` step 4 | ⛔ **NO. `deploy.yml` build step has no `env:` at all; `gh secret list` and `gh variable list` are both EMPTY; `.env` is gitignored so a clean CI checkout can never see it** | **DELTA — the runbook cannot fix the live site** |
| 8 | CF-S157-f: does the godly latch still block? | "burns that godly for all players" | ⛔ **NO LONGER TRUE. S157 B4 removed the gate from `findGodlyMatch`; `godlyFiredThisMatch` has zero remaining production readers. The bug is LATENT — a prerequisite for CF-S157-d, not a live defect** | **DELTA** |
| 9 | CF-S157-e: goblinSuicide wiring | drone path, no unit damage | CONFIRMED — `GOBLIN_SUICIDE_CONFIG` sets **both** `selfExplode:true` and `targetsStructures:true`, and `hostTick.ts:688` tests `selfExplode` FIRST | — |
| 10 | CF-S157-b: stink-bag art | "committed, nothing draws it" | CONFIRMED — `public/godly/stink-bag/anim/` has atlas+json; **zero `src/` references** | — |
| 11 | CF-S157-c: Helga hp | "needs mutable hp back on the wire" | CONFIRMED — `unitStats:{hp,def}` is static config; the mutable `hp` field was removed from the defender record AND the wire at S151 P2 | — |
| 12 | N2 raid parity | "unprobed" | reducers are seat-agnostic (`action.playerId`); `grantRaidProgress` fires on **both** build paths (`blueprintBuild.ts:350`, `placePrimitive.ts:589`). **No asymmetry found in the sim.** | needs an owner observation, not code |
| 13 | live IN-PROGRESS plans | pre-flight WARNed 3 | those 3 files **do not exist**; the only one is S152 PLAYTEST, whose A1–A5 all shipped | stale artifact |

**Two deltas change the batch**: #7 promotes the TURN last-mile from "owner action" to **code work**, and
#2 is a live CI-gate hazard. #8 demotes CF-S157-f from bug to prerequisite.

---

## OBJECTIVE

Close every carry-forward that already carries an owner ruling or a proven defect, and make the one
owner action that remains (provisioning TURN) actually reach the live site when they take it.

## SCOPE — 8 priorities, ordered so partial completion still helps

### P1 — TURN actually reaches production (CF-S157-a last mile) ⭐ the owner's #1 pain
**Why now:** the S157 runbook is a dead end. Owner creates `.env` → pushes → **CI builds from a clean
checkout with no env** → live site still `relay:0` → multiplayer still broken. Found at boot (A.0 #7).
- `deploy.yml`: `env:` on the build step sourcing `secrets.VITE_TURN_*`.
- `.env.example` committed; `TURN_SETUP.md` rewritten around **GitHub secrets** as the live path,
  `.env` demoted to local-dev-only.
- **In-game connection self-test** so the owner verifies without devtools: a button that gathers ICE
  and reports host/srflx/**relay** in plain language.
- Honest note: a browser TURN credential is inherently public in the bundle. Recorded, with the
  quota-cap mitigation and the short-lived-credential upgrade path.

### P2 — the flaky test that gates every deploy
`towerDefense.test.ts` "per-victim cap" **times out at 5000 ms** under full-suite parallelism (2.1 s
alone). `npx vitest run` is a deploy gate → this can block a ship at random. Fix the cost, do not
just raise the timeout.

### P3 — CF-S157-e: `goblinSuicide` takes the drone path
`selfExplode` is tested before `targetsStructures`, so the terrorist goblin navigates to **bonds**,
deals **no unit damage**, and uses the drone's blast radius instead of its own.

### P4 — CF-S157-f: abort leaves the godly record set
Latent today (A.0 #8) but a **prerequisite** for P5. `applyGodlyAbort` clears everything except
`godlyFiredThisMatch`.

### P5 — CF-S157-d: the Voltkin cinematic once per game (owner ruling, S157 B4 half-shipped)
Owner: *"voltkin cinematic SHOULD be once per game for the first person to have built him. but the
voltkin spawn himself should be generated every time someone builds his tower."* Requires separating
cinematic **timing** (sim-owned, direct + worker) from its **visuals** — the overlay's `onComplete` is
currently the sole driver of `GODLY_COMPLETE`, so naively skipping it wedges the queue.

### P6 — CF-S157-b: the landed stink bag as a real entity (owner ask; art already done)
A thrown bag is an instantaneous splash today. Needs a serialized hazard entity + wire + state hash +
the worker differential's seeding coverage, or it ships with the blind-guard hole S156 P3 closed.

### P7 — CF-S157-c: make Helga killable (owner ask)
Restore mutable defender `hp` on the record and the wire (+ protocol bump) and give units a targeting
path to her. Today she is bounded by the FIGHT, which is why she is not immortal but also not killable.

### P8 — housekeeping the boot surfaced
Archive the stale S152 plan; correct the stale review-gate card; `.gitignore`/state hygiene.

## OUT OF SCOPE (deferred — needs an owner ruling or an owner observation)
- **CF-S157-g** — should area hazards raze the shapes they orphan? Needs a ruling.
- **N2** — raid parity across seats. No asymmetry found in the sim (A.0 #12); needs their observation.
- Chewer/goblin balance retunes — no ruling.

## TESTING (all priorities)
`npx tsc --noEmit` · `npx vitest run` (**baseline 3220, and it must be 3220/3220 green REPEATEDLY**
once P2 lands) · `npm run e2e:gating` · `npm run build` (bundle cap) · `npm run verify-deploy`.
Per priority: a test that **fails before the fix** is the carrier — no fix ships without one.

## RISK
- P5/P6/P7 each touch the wire or the sim's determinism → protocol bump + worker-differential seeding
  are mandatory, not optional. The S156 lesson (a coverage hole hid a live desync for 13 sessions) is
  the reason.
- P1 touches the deploy workflow — verified by a real run, not by reading YAML.
