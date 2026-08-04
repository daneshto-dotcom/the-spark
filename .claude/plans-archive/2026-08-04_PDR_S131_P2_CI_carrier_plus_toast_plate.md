STATUS: COMPLETED
<!-- S131: BOTH shipped. P2 CI carrier = 9b50c89 (deploy.yml gated on npx vitest run +
     explicit typecheck + per-job timeouts; guard src/ci.deployGate.test.ts). P3 backing plates =
     1eb68e9 (both HUD surfaces). CHECK remediation = 2fd05b8 + 05ea263. NOT exercisable in CI:
     deploy.yml has never run with its gate, because write auth is absent. -->

# PDR — S131 · P2 CI carrier + P3 centre-column backing plate

**Tier:** Micro ×2 (each <10K, 1–2 files) → OBJECTIVE + SCOPE + TESTING, no deliberation round.
Micro deliberation is opt-in and auto-waived when `pdr_approved` + `unlock_source:user`.
**Approval:** owner said **`go`** (S131), in direct reply to a message that named all three follow-ups
(P2 CI carrier · the backing plate · the Triumvirate CHECK). Rule 16 amendment artifact = this file.
**Baseline at write time:** tsc 0 · vitest 1964/1964 (129 files) · bundle 644.7/750 KiB · HEAD `7b64243`
· 23 commits unpushed, `gh` write auth still absent.

---

## P2 — CI carrier

### OBJECTIVE
Make a red test block a master-push deploy. Today `deploy.yml` gates on `npm run build` alone, so
every "vitest 1964/1964" figure in every handoff is local and self-reported with no mechanical carrier.

### SCOPE — IN (`.github/workflows/deploy.yml` only)

**⚠ A.0 STATE FINDING THAT CHANGES THE OWNER'S RULING (Rule 21).** The ruling was "add a gating
`vitest` + `typecheck` step", resting on the recorded claim *"NO CI job runs vitest OR typecheck —
zero hits across `.github/workflows/`"*. That claim is **HALF WRONG**, and the error is the grep:
`package.json` defines `build` as `tsc -b && vite build && node scripts/check-bundle-size.mjs`, so
`npm run build` **already runs `tsc -b`** — a type error already fails the deploy today, transitively.
It also already enforces the bundle cap. So:

1. **`vitest` is the genuine gap** — add it as a gating step. **MUST be `npx vitest run`, never
   `npm test`**: `package.json`'s `test` script is bare `vitest`, which is WATCH mode and would hang
   the runner to its ceiling instead of failing.
2. **`typecheck` becomes an explicit step anyway**, not because it is missing but because a
   *transitive* gate is an invisible one: `npm run typecheck` (`tsc -b --noEmit`) fails in seconds
   with a type error as the stated reason, rather than surfacing as a generic build failure minutes
   later. Legibility, plus fast-fail ordering.
3. **`timeout-minutes` on BOTH jobs.** `deploy.yml` currently sets none, so it inherits the 6-hour
   default — a hung step burns six hours of wall clock. `e2e.yml` already pairs every lane with a
   timeout; this file was simply never given one.

Steps go INSIDE the existing `build` job, before `npm run build`, reusing its `npm ci` — the owner
ruled a "step", and a separate job would need its own checkout + install for no added signal.

### SCOPE — OUT (carry-forward, nothing dropped)
- **`package.json`'s bare `vitest` = watch-mode trap** stays unfixed. A `test:run`/`test:ci` script
  would be the durable fix, but that is a different file and a different concern from "add a CI gate"
  (Rule 16). Logged as a carry-forward; the workflow comment carries the warning meanwhile.
- **e2e.yml is untouched.** It has no push trigger by design (weekly cron + PR + dispatch, retained
  on wall-clock/concurrency grounds — the old "free minutes" argument is dead, the repo is PUBLIC).
- **A timeout-killed job still reports `cancelled`, not `failure`** — no email, no artifacts. The
  `timeout-minutes` added here bounds the waste but does NOT fix the silent-signal class; vitest has
  no global-suite-timeout flag to place below it the way `PW_GLOBAL_TIMEOUT_MIN` sits below
  Playwright's. Stated, not solved.
- **Not exercisable until the owner's push lands** (write auth absent). It ships unverified-in-CI by
  construction; that was true of the owner's ruling too.

### TESTING
`npx vitest run` + `npm run build` locally (unchanged expectations). Static validation of the YAML:
assert it parses and that the new steps precede the build step. Because the workflow cannot be
dispatched while write auth is down, verification is (a) YAML parse, (b) a source-order assertion in
the repo's own test suite so the gate's ORDER is pinned the way `ui.drainOrder.test.ts` pins the
frame's, and (c) the negative control — confirm `npm test` does NOT appear in the workflow.

---

## P3 — centre-column backing plate

### OBJECTIVE
Both V6-0.3 surfaces sit in the centre column and render over live world geometry: the S131 playtest
showed the tier banner (glyph band y 34–59) crossing the spawner rings and the topmost structure, and
the sever toast (y 228–249) crossing a structure. Text draws on top so it stays readable, but thin
cyan strokes running through glyphs is avoidable noise on the two lines that exist to be READ.

### SCOPE — IN
A dark, semi-transparent plate behind each of the two texts, following the shipped precedent
`betaBadgePlate` (`main.ts:540`) which exists for exactly this purpose and is already layered
"immediately BELOW betaBadge (see addChild order)".

- Tier banner: plate owned by `HUD`, sized from the text's measured bounds, alpha-driven by the same
  `tierBannerFrames` countdown so plate and glyphs appear and fade as one object.
- Sever toast: plate inside the existing `SeverToastRenderer` container, so the container's own alpha
  already drives it and no second animation path is introduced.
- Both plates must be **invisible whenever their text is invisible** — a plate that outlives its text
  is a black rectangle sitting on the board.

### SCOPE — OUT
- No repositioning of either surface. The owner ruled PASS on the banner's placement; this changes
  legibility only.
- No change to fonts, colours, hold durations, or the combo toast.

### TESTING
`npx vitest run` + `npm run build`. Then the same runtime proof used for both surfaces this session —
headless Chromium, genuine emitter for the banner (leader score → `SCORE_TIER_STEP-1`) and a genuine
`SEVER_BOND` dispatch for the toast — with before/after crops so the owner judges the actual pixels.
Pure-function coverage for any new plate-geometry helper.
