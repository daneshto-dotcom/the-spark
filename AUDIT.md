# Audit — SPARK — 2026-05-21 — Pass 2

## Executive summary

- **Stack**: TypeScript 5.4, Vite 5.2, Vitest 1.5, Pixi.js 8.5, Trystero 0.24 (unchanged from Pass 1)
- **Scale**: 305 tracked files (+3: AUDIT.md, README.md, findings.1.json), 41 test files, 740 passing tests (+11 from 729 baseline)
- **Git**: HEAD `5750cd6` "[audit P1-P5] Wire net trust boundary + audio cursor + README + cleanup"
- **Pass 1 findings closed by commit 5750cd6**: 8 of 17 (47% closure rate in a single session)
- **Carry-forward from Pass 1**: 9 findings (3 dep CVEs/staleness, 2 main.ts hypertrophy/test-gap, 2 deprecate candidates, 1 TODO stale, 1 workflow signal)
- **New findings discovered in Pass 2**: 3 (2 TYPE_DEBT, 1 ARCH_DRIFT — all introduced by or surfaced via the Pass-1 fix commit)
- **Total findings in this pass**: 12 (0 CRITICAL, 1 HIGH, 4 MEDIUM, 5 LOW, 2 INFO)
- **Build**: 472.40 KB main bundle (+1.29 KB from Pass-1 baseline 471.11; headroom 27.6 KB on 500 KB cap); total JS payload incl Pixi chunks: ~729 KB
- **Tools invoked**: knip, npm audit, tsc -b --noEmit (clean), vitest run, vite build, git show/log

### Pass 1 → Pass 2 closure ledger

| Pass 1 ID | Type | Closed in | Verification |
|---|---|---|---|
| `d3f0e22b` | SECURITY HIGH | `5750cd6` | `parseNetMessage` wired at transport.ts:148; protocol.test.ts +60 LOC strengthening tests pass |
| `e698a17a` | BUG MEDIUM | `5750cd6` | try/catch around applyNetSnapshot at sync.ts:91; sync.test.ts +38 LOC verifies no throw escapes |
| `3c8630d7` | BUG MEDIUM | `5750cd6` | resetAudioDrainCursor wired in save.ts:306 + main.ts:359; save.test.ts +1 case verifies cursor reset |
| `9f242f92` | DOC_DRIFT MEDIUM | `5750cd6` | README.md exists at root (5003 B), covers quick-start + arch + tech stack + docs index |
| `8e68eff1` | ARCH_DRIFT INFO | `5750cd6` | boot-snapshot.md:12 now distinguishes app-code cap vs total JS payload |
| `5f1f62c8` | DEPRECATE LOW | `5750cd6` | NET_CONNECTION_TIMEOUT_MS removed from constants.ts; knip count dropped 13→9 in that file |
| `d0f4efc8` | DEPRECATE LOW | `5750cd6` | BOND_LINE_WIDTH + BOND_GLOW_INTENSITY + AUDIO_MASTER_VOLUME_DB removed; same knip drop |
| `561e37ce` | TYPE_DEBT LOW | `5750cd6` | parseNetMessage strengthened: GameAction allowlist + schemaVersion check + numeric playerId/color + string godlyId |

### Top risks remaining

1. **HIGH** — `913e7046` main.ts hypertrophy: LOC 975 → 984 (+9 from Pass-1 fix). Still no direct test file. Multi-priority refactor batch deferred.
2. **MEDIUM** — `acc5551a + 2d797b09` Two unfixed dev-dep CVEs. Coordinated vite/vitest major bump pending dedicated session.
3. **MEDIUM** — `8053a5045` main.ts test gap (paired with #1).

### Top new findings (Pass 2 discoveries)

1. **TYPE_DEBT LOW** — `ce51b032` `KNOWN_GAME_ACTION_TYPES` allowlist in protocol.ts is hand-maintained alongside GameAction union in world.ts. No compile-time link — adding a new action variant without updating the allowlist silently rejects valid wire payloads.
2. **TYPE_DEBT LOW** — `d4541985` parseNetMessage permits NETSNAPSHOT with `snapshot:{schemaVersion:undefined}` (test-double back-compat carve-out). A peer can bypass the wire version check; defense-in-depth try/catch in sync.ts catches the downstream throw, so blast radius is one frame. Trivial fix: tighten validator + update one test fixture.
3. **ARCH_DRIFT INFO** — `622a7c7f` Pass-1 fix introduced first state→render import in the codebase (save.ts → audioManager.ts). Pinpointed and documented; concern is precedent for future creep.

## Findings by category

### SECURITY

(none — Pass-1 SECURITY HIGH `d3f0e22b` closed by commit 5750cd6)

### BUG

(none — Pass-1 BUG MEDIUM `e698a17a` and `3c8630d7` both closed by commit 5750cd6)

### DEP_CVE

> ### MEDIUM — esbuild dev-server CORS bypass (GHSA-67mh-4wv8-2f99)
> **File**: `package-lock.json` · **ID**: `acc5551a` · **Confidence**: HIGH · **[CARRY-FORWARD]**
> Unchanged from Pass 1. Re-ran `npm audit --json`: 4 moderate vulnerabilities still present (esbuild, vite, vite-node, vitest). Dev-server only. `fixAvailable: vite@8.0.14` semVerMajor. Deferred to a dedicated regression-test session.
> **Recommendation**: UPGRADE (coordinated vite + vitest major bump, single PDR closes both CVEs + DEP_STALE).
> **Verification**: `npm audit --json` shows zero moderate+; 740 tests pass; build under cap.

> ### MEDIUM — Vite path-traversal in optimized-deps .map handling (GHSA-4w7w-66w2-5vf9)
> **File**: `package-lock.json` · **ID**: `2d797b09` · **Confidence**: HIGH · **[CARRY-FORWARD]**
> Direct dep, dev-server only. Same upgrade path as `acc5551a`.

### HYPERTROPHY

> ### HIGH — `src/main.ts`: 984 LOC (+9 from Pass 1), no direct test
> **File**: `src/main.ts:0` · **ID**: `913e7046` · **Confidence**: HIGH · **[CARRY-FORWARD-WORSE]**
> Pass-1 fix `3c8630d7` added 9 LOC (1 import addition + 8-line comment + `resetAudioDrainCursor()` call in teardownNet). Magnitude slightly worse; kind unchanged. The fix itself is correct and minimal; the underlying hypertrophy is independent. Multi-priority refactor (extract netMessageRouter + godlyMatcher + cinematicStateMachine + teardownNet) remains the recommended fix.
> **Recommendation**: REFACTOR — multi-priority Standard-tier batch; defer to a dedicated session.

### TEST_GAP

> ### MEDIUM — `src/main.ts` has no direct test file
> **File**: `src/main.ts:0` · **ID**: `8053a504` · **Confidence**: HIGH · **[CARRY-FORWARD]**
> Companion to `913e7046`. `find src -name 'main.test.ts'` returns empty.

### TYPE_DEBT

> ### LOW — `KNOWN_GAME_ACTION_TYPES` allowlist not compile-time linked to GameAction union *(NEW Pass 2)*
> **File**: `src/net/protocol.ts:100` · **ID**: `ce51b032` · **Confidence**: HIGH
> Pass-1 fix `561e37ce` introduced this 19-string allowlist as the wire validator's source-of-truth for `INTENT.action.type`. The structural type lives in `src/state/world.ts:GameAction`. Adding a new action variant to GameAction without updating the protocol.ts set silently rejects valid INTENT payloads (logged at console.warn only — easy to miss). Audit code comment frames this as deliberate (wire allowlist independent of in-process type widening), which is defensible, but creates a maintenance trap.
> **Recommendation**: REFACTOR — two patterns: (a) `as const` array in world.ts deriving the union via indexed access, protocol.ts imports the runtime array; (b) `satisfies Set<GameAction['type']>` compile-time check in protocol.ts. Pattern (b) is lower-risk. Micro-tier ~5K tokens.
> **Verification**: Stub a new GameAction variant in a test branch; assert tsc fails (b) or protocol.ts auto-includes it (a).

> ### LOW — `parseNetMessage` permits NETSNAPSHOT.snapshot.schemaVersion=undefined *(NEW Pass 2)*
> **File**: `src/net/protocol.ts:145` · **ID**: `d4541985` · **Confidence**: MEDIUM
> Pass-1 added `if (schemaVersion !== undefined && schemaVersion !== WIRE_SCHEMA_VERSION) return null` — the `!== undefined` carve-out preserves the existing protocol.test.ts:83 test-double pattern (`snapshot: {}`). Production `netSnapshot()` always carries `schemaVersion=1`, so a peer can send `{kind:'NETSNAPSHOT', snapshotSeq:1, snapshot:{}}` and bypass the version gate. `applyNetSnapshot` throws downstream; the Pass-1 try/catch in sync.ts catches and skips. Net blast radius: one dropped frame per malformed message.
> **Recommendation**: DESIGN_FIX — drop the `!== undefined` carve-out; update the 1 affected test fixture to include `schemaVersion: 1`. Two single-line changes. Micro-tier ~2K tokens.
> **Verification**: Updated test asserts `{snapshot:{}}` returns null; `{snapshot:{schemaVersion:1}}` accepts. All other tests stay green.
> *Hypothesis*: Peer sends `{kind:'NETSNAPSHOT', snapshotSeq:1, snapshot:{}}` → parseNetMessage accepts → ClientSync.receive accepts → applyNetSnapshot throws on bad schemaVersion → sync.ts catch logs + skips → one frame dropped.
> *Fix design*: tighten validator + update fixture. Defense-in-depth try/catch remains as belt-and-suspenders.

### ARCH_DRIFT

> ### INFO — Pass-1 fix introduced first state→render import *(NEW Pass 2)*
> **File**: `src/state/save.ts:57` · **ID**: `622a7c7f` · **Confidence**: HIGH
> Pre-Pass-1, all `src/state/` imports referenced `src/state/`, `src/game/`, `src/physics/`, `src/types.ts`. The Pass-1 fix `3c8630d7` added `import { resetAudioDrainCursor } from '../render/audioManager.ts'` at save.ts:57. The audit fix comment frames it as deliberate and pinpointed, but it sets a precedent that may invite future creep.
> **Recommendation**: INVESTIGATE — pick: (1) revert via a publish/subscribe reset hook in `src/state/audioCursor.ts`; (2) accept precedent and codify in project AGENTS.md or CLAUDE.md.
> **Verification**: Either a one-line policy note OR a follow-up PR with grep-test enforcing zero `'../render/'` imports under `src/state/`.

### DEPRECATE_CANDIDATE

> ### LOW — `loadFromLocalStorage` still no production caller
> **File**: `src/state/save.ts:683` · **ID**: `835b5e0a` · **Confidence**: MEDIUM · **[CARRY-FORWARD]**
> Pass-1 product decision still pending — Continue UI vs. document save-as-telemetry.

> ### LOW — 42 unused exports remain (knip)
> **File**: `(repo-wide)` · **ID**: `336929dc` · **Confidence**: MEDIUM · **[CARRY-FORWARD]**
> Pass-1 P5 cleared 4 from constants.ts (46 → 42). Distribution: constants.ts:9, audioManager.ts:5, save.ts:4 (2 exports + 2 types), creature.ts:4, lifetime.ts:3, codexOverlay.ts:2, godlyRecipes:2 types, spark.ts:2, plus 8 singletons. Continue per-symbol triage.

### TODO_STALE

> ### LOW — `assets-source/godly-voltkin/notes/integration-notes.md:90`
> **File**: `assets-source/godly-voltkin/notes/integration-notes.md:90` · **ID**: `2dbca34b` · **Confidence**: MEDIUM · **[CARRY-FORWARD]**
> Asset-author notes — likely intentional working doc. Unchanged.

### COLLATERAL_CHANGE

> ### INFO — Workflow scope-convention obstructs mechanical K3 detection
> **File**: `(commit-log workflow signal)` · **ID**: `d8f9c8ae` · **Confidence**: MEDIUM · **[CARRY-FORWARD]**
> Pass-2 self-check on commit `5750cd6`: 13 files touched (9 src/ + 4 root docs). Each file touch documented in commit body with finding-ID cross-ref. K3 self-check passes for this commit (no out-of-scope creep). Pass-2 audit commit itself is scope-clean; broader sweep across `[S<N> P<N>]` historical priorities still recommended.

### DEP_STALE

> ### LOW — vite ^5.2.0 / vitest ^1.5.0 — two majors behind
> **File**: `package.json` · **ID**: `97152f00` · **Confidence**: HIGH · **[CARRY-FORWARD]**
> Unchanged. Bundled with the DEP_CVE upgrade plan.

### DEAD_CODE

(none — knip flagged 42 unused *exports* but no files. See DEPRECATE_CANDIDATE.)

### DOC_DRIFT

(none — Pass-1 DOC_DRIFT MEDIUM `9f242f92` closed by commit 5750cd6's new README.md)

## Deletions staged

None. Carry-forward DEPRECATE candidates still require per-symbol Chesterton review (Pass-1 reasoning unchanged). `cleanup/audit-2026-05-21` branch not created.

## Open questions for user

1. **`622a7c7f` state→render import policy** — accept the precedent (Pass-1 fix as exception) or refactor to a publish/subscribe pattern? Both are project-style choices, not safety choices.
2. **`835b5e0a` Continue-UI decision** — ship a "Continue" button using existing loadFromLocalStorage, or downgrade the export to internal/test-only? User-facing product question.
3. **`acc5551a + 97152f00` vite/vitest bump timing** — block on a dedicated session, or fold into the next feature batch?

## Pass-3 input

Recommended Pass-3 priority queue (5 finding IDs):

1. `ce51b032` — make `KNOWN_GAME_ACTION_TYPES` compile-time linked to GameAction union (Micro, ~5K tokens, fast win + closes maintenance trap)
2. `d4541985` — tighten parseNetMessage to reject schemaVersion=undefined (Micro, ~2K tokens, fastest win)
3. `913e7046` — main.ts hypertrophy refactor (multi-priority Standard batch; this is the biggest unresolved structural issue)
4. `97152f00` — coordinated vite + vitest major bump (closes 2 CVEs; isolated session due to regression risk)
5. `336929dc` — second per-symbol triage session for remaining 42 unused exports
