# Audit — SPARK — 2026-05-21 — Pass 1

## Executive summary

- **Stack**: TypeScript 5.4, Vite 5.2, Vitest 1.5, Pixi.js 8.5, Trystero 0.24 (Nostr P2P)
- **Scale**: 302 tracked files (1 dirty: `.claude/session-state.json` — counter-hook drift, expected per S37 reflexion), 41 test files, ~71 modules under critical-path import walk
- **Git**: HEAD `a9d07dd` "[state-autocommit] S37" — repo healthy, master in sync with origin (modulo hook-driven dirty file)
- **Tools invoked**: knip, npm audit, tsc -b --noEmit (clean), vitest run (729/729 green), vite build (471.11 KB main + 257.62 KB Pixi chunks), git log/log -S/log --numstat archaeology
- **Tools skipped**: vulture/cargo-udeps/staticcheck/pip-audit/govulncheck/cargo-audit (no python/rust/go); dependency-cruiser graph (TRACKED_FILES=302 < threshold 500 — manual import walk used instead)
- **Total findings**: 17 (0 CRITICAL, 2 HIGH, 4 MEDIUM, 8 LOW, 3 INFO)
- **Top 3 risks** (severity × confidence):
  1. **HIGH/HIGH** — `parseNetMessage` validator defined but NEVER wired at `transport.ts:148` (peer trust-boundary bypass) — `d3f0e22b`
  2. **HIGH/HIGH** — `src/main.ts` hypertrophy: 975 LOC, 6090 churn in 180d, zero direct test coverage — `913e7046`
  3. **MEDIUM/HIGH** — `applyNetSnapshot` throws uncaught on malformed peer data; propagates to Pixi ticker — `e698a17a`
- **Top 3 deletion/deprecation candidates** (signals: knip + Chesterton review):
  1. `NET_CONNECTION_TIMEOUT_MS` in `src/constants.ts:269` — duplicate of iceConfig.ts:HANDSHAKE_TIMEOUT_MS (S15 P2 planning leftover) — `5f1f62c8`
  2. `BOND_LINE_WIDTH` / `BOND_GLOW_INTENSITY` / `AUDIO_MASTER_VOLUME_DB` in `src/constants.ts:257-261` — initial-commit placeholders, renderers use inline literals — `d0f4efc8`
  3. `loadFromLocalStorage` in `src/state/save.ts:683` — save-half wired in production, load-half exists only for tests; no "Continue" UI — `835b5e0a`

Constitutional notes: no fake quality score. No deletions staged (Rule 3: per-symbol Chesterton-fence answers are recoverable but uncertain — downgraded to DEPRECATE_CANDIDATE pending operator triage). Every finding has empirical anchors (Rule 1) and a verification path (Rule 4 / K4).

---

## Findings by category

### SECURITY

> ### HIGH — `parseNetMessage` validator unused at the wire boundary
> **File**: `src/net/transport.ts:148` · **ID**: `d3f0e22b` · **Confidence**: HIGH
> `transport.ts:148` reads `JSON.parse(data) as NetMessage` — a raw type assertion — and forwards the cast object to `messageHandlers`. The `parseNetMessage(raw)` function at `protocol.ts:99` was added in commit `318039f` (S22 P3) explicitly for *"defense against malformed peers"* per its docstring. Grep across `src/` finds zero production callers; the only call sites are in `protocol.test.ts`. `main.ts:270/305` switch on `msg.kind` directly, trusting fields like `INTENT.action`, `NETSNAPSHOT.snapshot`, `ENDGAME.winnerId`. A peer can: (1) bypass the documented `protoVersion` gate by sending HELLO with mismatched version (no enforcement at wire); (2) send malformed NETSNAPSHOT whose downstream `applyNetSnapshot` then throws uncaught from the render loop (see `e698a17a`); (3) send any `INTENT` with arbitrary `action.type`. Threat model: room codes are 6 chars over a 32-char alphabet (~10⁹ combos, brute-forceable in days from a single peer), shared via screenshot/chat (leakable). Karpathy K1 (silent assumption that wire payload = `NetMessage`) + K3 (the introducing commit touched `protocol.ts` only — `transport.ts` was never updated to call the validator).
> **Recommendation**: DESIGN_FIX — At `transport.ts:148` replace the raw cast with `parseNetMessage(JSON.parse(data))`; on null route to `emitError` + drop. Strengthen validator (see `561e37ce`). Standard-tier PDR; ~12-15K tokens.
> **Verification**: New `transport.test.ts` cases assert malformed wire (unknown kind / wrong protoVersion / non-number winnerId / missing snapshot fields) is dropped via `emitError`, not forwarded.
> *Hypothesis*: Peer-sent `{"kind":"NETSNAPSHOT","snapshotSeq":999999,"snapshot":{"schemaVersion":2}}` crashes the client render loop via `applyNetSnapshot`'s `throw new Error('unsupported schemaVersion 2')` (save.ts:328) that propagates through `ClientSync.interpolateInto` (sync.ts:91) into the unguarded `app.ticker.add(...)` callback.
> *Repro*: stub via existing `transport.test.ts` harness — peer A `send(msg as any)` with that literal; observe peer B's handler receives non-NetMessage; calling `clientSync.receive` + `interpolateInto` throws.
> *Fix design*: wire `parseNetMessage`; validator additionally asserts `INTENT.action.type ∈ <GameAction kinds>` and `NETSNAPSHOT.snapshot.schemaVersion === 1`.
> *Verification plan*: `npm test` keeps 729 green; new tests assert payload rejection at transport, not at apply.

### BUG

> ### MEDIUM — `applyNetSnapshot` throws uncaught into the render loop
> **File**: `src/net/sync.ts:91` · **ID**: `e698a17a` · **Confidence**: HIGH
> `save.ts:328` throws on `schemaVersion !== 1`. `save.ts:435` throws on bond referencing a missing primitive. Both are reachable via peer-supplied payloads (combined with `d3f0e22b`: no wire-level validation). `sync.ts:88-102` calls `applyNetSnapshot(this.currentSnap, world)` with no try/catch. `interpolateInto` is invoked from `main.ts` `app.ticker.add` callback (unguarded — searched for `try {.*applyNetSnapshot|applyNetSnapshot.*} catch` across `src/`, multiline, zero matches). Worse, `applySnapshotCore` mutates world state in stages (clears Maps before re-populating); a throw mid-bonds-loop leaves the world half-mutated with no rollback.
> **Recommendation**: DESIGN_FIX — Either (a) refactor `applySnapshotCore` to build new Maps locally and commit-or-abort atomically, or (b) guard the call site in `sync.ts:91` with try/catch routing to `emitError` while preserving the previous frame. Pair with `d3f0e22b` in the same PDR.
> **Verification**: Test asserts malformed snapshot (bond → missing primitive, or schemaVersion=2) does NOT throw out of `interpolateInto`; world state remains unchanged from prior snapshot.

> ### MEDIUM — `resetAudioDrainCursor` never called on save-load path
> **File**: `src/render/audioManager.ts:706` · **ID**: `3c8630d7` · **Confidence**: HIGH
> Defined and exported; only callers are `audioManager.test.ts:174,248`. Production `save.ts:restore()` and `main.ts:teardownNet (L338)` / RETURN_TO_TITLE reducer do not call it. Latent since S18 P1 introduced the cursor pattern; affects ALL audio effects (CHARGE, clave, fart, lightning-crackle). On restore, audio whose `tick` straddles the cursor cannot replay until enough new ticks pass. Documented as deferred "Δ4 audit" in `HANDOFF_2026-05-18_S37close.md:56`.
> **Recommendation**: DESIGN_FIX — Add `resetAudioDrainCursor()` calls inside `save.ts:restore()` (after `applySnapshotCore` writes `world.tick`) and inside the `RETURN_TO_TITLE` handler (or `main.ts:338 teardownNet`). Single-line each. Micro-tier PDR; ~3-5K tokens.
> **Verification**: New `save.replay.test.ts` + `audioManager.test.ts` cases assert cursor reset on restore + RETURN_TO_TITLE.

### DEP_CVE

> ### MEDIUM — esbuild dev-server CORS bypass (GHSA-67mh-4wv8-2f99)
> **File**: `package-lock.json` · **ID**: `acc5551a` · **Confidence**: HIGH
> CVSS 5.3 (AV:N/AC:H/PR:N/UI:R). Transitive via vite 5.2. Dev-server only — esbuild is not in the production GH Pages bundle. `fixAvailable: vite@8.0.14` (semVerMajor). Developer-machine risk only when running `npm run dev` adjacent to untrusted browsing.
> **Recommendation**: UPGRADE — coordinated vite + vitest major bump (see `97152f00`). Same patch resolves `2d797b09`.
> **Verification**: `npm audit --json` reports zero moderate+ vulnerabilities; `npm test` keeps 729 green; `npm run build` produces dist/.

> ### MEDIUM — Vite path-traversal in optimized-deps .map handling (GHSA-4w7w-66w2-5vf9)
> **File**: `package-lock.json` · **ID**: `2d797b09` · **Confidence**: HIGH
> CWE-22 + CWE-200, dev-server only, direct dep (vite 5.2). Range: `<=6.4.1`. Same upgrade path as `acc5551a`.
> **Recommendation**: UPGRADE — single PDR addresses both CVEs.
> **Verification**: `npm audit --json` clean.

### HYPERTROPHY

> ### HIGH — `src/main.ts`: 975 LOC, 6090 churn (180d), no direct test
> **File**: `src/main.ts:0` · **ID**: `913e7046` · **Confidence**: HIGH
> Highest-churn production file (per-file numstat: 6090; path-scoped under `src/`: 1191 — main.ts still tops the list either way). No `main.test.ts` exists. Code-to-test ratio: undefined (well above HYPERTROPHY_RATIO=15). Contents include: Pixi app bootstrap, all overlay wiring, lobby callbacks, net transport message handlers, ticker loop, godly matcher, cinematic state machine, debug overlay wiring. Karpathy K2 fires hard.
> **Recommendation**: REFACTOR — Extract testable subsystems into pure modules: `netMessageRouter` (L270-281 + L305-315), `godlyMatcher` (L459-495), `cinematicStateMachine`, `teardownNet`. main.ts becomes thin wiring. Then add `src/main.test.ts` smoke test against jsdom asserting boot-into-TITLE. Multi-priority Standard-tier batch.
> **Verification**: New test files cover extracted subsystems; total tests ≥ ~770; main.ts LOC drops below ~500.

### TEST_GAP

> ### MEDIUM — `src/main.ts` has no direct test file
> **File**: `src/main.ts:0` · **ID**: `8053a504` · **Confidence**: HIGH
> Companion to `913e7046`. Indirect coverage via `src/game/session*.test.ts`, `src/net/sync.test.ts`, and renderer `*.test.ts` files. No test directly bootstraps the app or unit-tests lobby callbacks / message-router handlers / godlyMatcher cursor logic — all non-trivial conditional code that has shifted across S15-S37 (per commit log).
> **Recommendation**: ADD_TEST — Pair with refactor. Once subsystems extracted, unit-test them; optional jsdom smoke test.
> **Verification**: `src/main.test.ts` exists; extracted subsystem tests verify message-routing and matcher logic.

### DOC_DRIFT

> ### MEDIUM — No README.md at repo root
> **File**: `README.md` (missing) · **ID**: `9f242f92` · **Confidence**: HIGH
> `ls README*` empty. Project has substantial docs (`BACKLOG.md` 97 KB, `LOCKED_DECISIONS.md` 54 KB, `SPARK_Blueprint.md` 60 KB, `reflexion_log.md` 51 KB) but no quick-start entry point. CLAUDE.md is session-protocol oriented. New contributors / GitHub repo home renders blank.
> **Recommendation**: UPDATE_DOC — ~200-line README with (1) one-paragraph what-is-SPARK, (2) quick-start (npm install / dev / test / build), (3) live URL https://spark-online.space, (4) architecture pointers (main.ts → net → state → render), (5) deeper-doc links. Synthesis only, no new content.
> **Verification**: README.md exists; renders on GitHub repo home; commands match package.json.

### DEP_STALE

> ### LOW — vite ^5.2.0 and vitest ^1.5.0 are two majors behind
> **File**: `package.json` · **ID**: `97152f00` · **Confidence**: HIGH
> `fixAvailable.name`: vite@8.0.14 (so current is 7.x/8.x), vitest@4.1.7. WEB_RESEARCH=off so cannot verify last-published dates, but two-majors-behind on a fast-moving build toolchain is a maintainability signal that compounds with the CVE findings.
> **Recommendation**: UPGRADE — single coordinated bump. ~6-10K tokens. Closes 2 CVEs + addresses staleness.
> **Verification**: `npm run build` clean; `npm test` ≥729 passing; `npm audit` reports zero vulnerabilities.

### TYPE_DEBT

> ### LOW — `parseNetMessage` does only minimal kind+key-presence validation
> **File**: `src/net/protocol.ts:99` · **ID**: `561e37ce` · **Confidence**: HIGH
> Validator checks `kind` discriminant + 1-2 key types per branch. Does NOT assert: `INTENT.action.type ∈ <GameAction kinds>`; `NETSNAPSHOT.snapshot.schemaVersion === 1`; `GODLY_TRIGGER.event.godlyId ∈ <known recipes>`. So `{kind:'INTENT',intentSeq:1,action:{type:'NUKE_THE_PLANET'}}` passes the validator (because `action` is defined). Combined with `d3f0e22b` (validator unused), this is presently no defense; once wired, it becomes the actual trust boundary and needs to actually validate.
> **Recommendation**: DESIGN_FIX — Strengthen alongside wiring (same PDR as `d3f0e22b`). Import the GameAction discriminant union; assert closed-set membership; pre-validate `schemaVersion` and `godlyId`.
> **Verification**: Tests assert: unknown action.type → null; snapshot.schemaVersion=2 → null; unknown godlyId → null.

### TODO_STALE

> ### LOW — `assets-source/godly-voltkin/notes/integration-notes.md:90`
> **File**: `assets-source/godly-voltkin/notes/integration-notes.md:90` · **ID**: `2dbca34b` · **Confidence**: MEDIUM
> Only non-code TODO marker in the repo. Asset-author notes file with a "What's missing / TODOs for main session" header. The single other grep hit (`debugOverlay.ts:73 'DEBUG (click to copy)'`) is a UI string, false positive.
> Chesterton's fence: asset directories conventionally carry author/integration notes — recoverable intent is handoff scratch pad, not stale debt.
> **Recommendation**: NO_ACTION (or archive if every line corresponds to shipped features).
> **Verification**: Manual read; archive if all items are shipped.

### DEAD_CODE

(none — knip flagged 46 unused *exports* across 17 files but no *files* as dead. See DEPRECATE_CANDIDATE category.)

### DEPRECATE_CANDIDATE

> ### LOW — `NET_CONNECTION_TIMEOUT_MS` (constants.ts:269) duplicates iceConfig.ts:HANDSHAKE_TIMEOUT_MS
> **File**: `src/constants.ts:269` · **ID**: `5f1f62c8` · **Confidence**: MEDIUM
> Grep finds only the definition. Functional equivalent (`HANDSHAKE_TIMEOUT_MS`) imported from `src/net/iceConfig.ts` and used in `transport.ts:105`.
> Chesterton's fence: introduced in commit `add497f` "S15 P2: networked 1v1 multiplayer MVP". Likely planning constant; implementation moved to iceConfig.ts. Safe to (a) delete from constants.ts, or (b) flip iceConfig.ts to import from constants.ts so it becomes single-source.
> **Recommendation**: INVESTIGATE — pick (a) or (b); single-line change.
> **Verification**: `grep -rn 'NET_CONNECTION_TIMEOUT_MS' src/` reflects intended state; npm test green.

> ### LOW — `BOND_LINE_WIDTH` / `BOND_GLOW_INTENSITY` / `AUDIO_MASTER_VOLUME_DB` (constants.ts:257-261)
> **File**: `src/constants.ts:257` · **ID**: `d0f4efc8` · **Confidence**: MEDIUM
> All three: 0 imports across `src/`. Bond renderer (`bondVisualRenderer.ts`) and audio chain (`audioManager.ts`) use inline literals.
> Chesterton's fence: initial commit `bc89a53` (2026-05-09) — placeholder design-time configurability; renderers shipped with inline values.
> **Recommendation**: INVESTIGATE — per-symbol decide: (a) wire into the corresponding renderer (preserves design intent) or (b) delete.
> **Verification**: knip --reporter json shows fewer unused exports in constants.ts; tests green.

> ### LOW — `loadFromLocalStorage` (save.ts:683) has no production caller
> **File**: `src/state/save.ts:683` · **ID**: `835b5e0a` · **Confidence**: MEDIUM
> main.ts imports `saveToLocalStorage` but NOT `loadFromLocalStorage`. No "Continue" / "Load Game" UI hook. User save state is written but never restored — latent feature gap.
> Chesterton's fence: initial commit. Save-half wired Phase 1, load-half deferred. Save without load is valid (telemetry/forensics), but "Load" is the natural next step.
> **Recommendation**: INVESTIGATE — (a) wire `TitleScreen.onContinueSelected` → loadFromLocalStorage + restore, or (b) downgrade to internal/test-only export and document as save-only-telemetry.
> **Verification**: Either round-trip test for Continue UI, or symbol moved out of public surface.

> ### LOW — 46 unused exports across 17 files (knip)
> **File**: (repo-wide) · **ID**: `336929dc` · **Confidence**: MEDIUM
> knip JSON: constants.ts:13, audioManager.ts:5, save.ts:4, creature.ts:4, protocol.ts:3, lifetime.ts:3, codexOverlay.ts:2, godlyRecipes/index.ts:2, spark.ts:2, plus 8 more files with 1 each. Many are type exports (test-time public), enum members (additive-future-use), and audio singleton API (likely test-only). Three top-confidence candidates broken out (`5f1f62c8`, `d0f4efc8`, `835b5e0a`).
> Chesterton's fence: initial commit + S15 P2 + S22 P3 each added speculative surface area. Many constants referenced in design docs but not yet wired. Per-symbol archaeology required; mass deletion would be reckless.
> **Recommendation**: INVESTIGATE — session-internal triage pass per symbol; classify as (a) wire-up missed, (b) speculative/abandoned, (c) test-only public. 5-10 deletions per session over 3-4 sessions, not one big sweep.
> **Verification**: After each triage session, knip-flagged count drops; tests green.

### COLLATERAL_CHANGE

> ### INFO — Commit-message convention obstructs mechanical K3 detection
> **File**: `(commit-log workflow signal)` · **ID**: `d8f9c8ae` · **Confidence**: MEDIUM
> Recent-100 commits: ~60% follow `[S<N> P<N>]` priority-tag convention (no module scope), ~30% `[state-autocommit] S<N>` (hook-generated, no scope), <10% conventional `feat(scope):` / `fix(scope):`. Mechanical K3 detection (commit-scope vs file-paths-touched) requires per-priority lookup against BACKLOG.md / PDR archives. ONE K3 instance verified manually: commit `318039f` (S22 P3 "Godly infrastructure (Full tier)") added `parseNetMessage` validator but did NOT touch `transport.ts` where it was meant to be wired — yielding finding `d3f0e22b`.
> **Recommendation**: INVESTIGATE — Pass-2 sweep: re-read each S<N> priority's PDR + diff to confirm scope alignment. The S22 P3 example is confirmed; other Standard/Full-tier priorities that touched multiple files deserve manual review for similar "added but not wired" regressions.
> **Verification**: Per-priority PDR diff review identifies any other X-added-but-not-wired patterns.

### ARCH_DRIFT

> ### INFO — Boot-snapshot "Bundle: 471.11 KB / 500 KB cap" framing
> **File**: `boot-snapshot.md:12` · **ID**: `8e68eff1` · **Confidence**: HIGH
> Build output: `dist/assets/index-*.js` is 471.11 KB (app code), plus 9 Pixi chunks totaling 257.62 KB. Total transferred-JS-on-cold-load: 728.73 KB. The 500 KB cap is meaningful for the main app code (which Vite tree-shakes and grows linearly with feature additions); Pixi chunks are external and roughly fixed. Framing drift, not metric drift.
> **Recommendation**: UPDATE_DOC — boot-snapshot.md text: "Bundle (app code): 471.11 KB / 500 KB cap. Total JS payload incl. Pixi chunks: ~729 KB." Single-line edit.
> **Verification**: boot-snapshot.md reflects both numbers.

## Deletions staged

None. Per Rule 3 (Chesterton's Fence), every knip-flagged unused export has a plausibly-recoverable "why was this added" answer pointing at speculative future use from the initial commit or from S15 P2 / S22 P3 multi-file infrastructure landings. All deletion candidates downgraded to DEPRECATE_CANDIDATE pending operator per-symbol triage. The `cleanup/audit-2026-05-21` branch was not created (Rule 3.A conditional: at least one stage_deletion finding required).

## Open questions for user

None. All 17 findings are VERIFIED with empirical anchors. No UNVERIFIED findings.

## Pass-2 input

Recommended Pass-2 priority queue (5 finding IDs):

1. `d3f0e22b` — `parseNetMessage` wiring (centerpiece — fix design needs Council-level Q&A on whether to strengthen at wire vs at `applyNetSnapshot`)
2. `913e7046` — main.ts hypertrophy refactor (multi-priority batch — needs architecture deliberation on subsystem boundaries)
3. `e698a17a` — `applyNetSnapshot` atomic-apply refactor (paired with `d3f0e22b`, but the atomic-apply design has independent merits)
4. `336929dc` — per-symbol triage of the 46 knip-flagged exports (separate session, isolated scope)
5. `d8f9c8ae` — workflow-scope-vs-diff sweep across `[S<N> P<N>]` priorities (Pass 2 manual review; the S22 P3 instance is verified — others likely exist)
