# PDR — Session 22 (Batch, Full-tier)

**Created:** 2026-05-13 | **Status:** DRAFT awaiting Council R1
**Tier:** Full (>30K tokens, multi-file architecture)
**Branch:** master | **Last commit:** `998cbf3` (Voltkin Phase 4-6 READY)
**Author:** ZERO (orchestrator), driven from S21 Battle Ledger + Voltkin integration-notes.md

---

## §0 — A.0 STATE-DISCOVERY GATE (Rule 21)

All claims in boot snapshot + handoff verified before locking scope:

| Claim | Verifier | Result |
|---|---|---|
| `src/net/transport.ts` exists at 317 LOC | `wc -l` | ✓ 317 LOC |
| `src/render/lobbyScreen.ts` exists at 565 LOC | `wc -l` | ✓ 565 LOC |
| `src/state/protocol.ts` exists | path probe | ✗ **DELTA**: actual path `src/net/protocol.ts` |
| `src/sim/controls.ts` exists | path probe | ✗ **DELTA**: actual path `src/input/controls.ts` |
| `src/state/world.ts` has `world.tick` | grep | ✗ **DELTA**: no `world.tick`; physics ticking lives in `main.ts` fixed-step accumulator. D5 "no freeze of world.tick" reinterpreted as "do not pause the main.ts physics loop during cutscene." |
| 9 Voltkin sprites at documented paths | `ls assets-source/godly-voltkin/sprites/` | ✓ all 9 present |
| 1 cinematic mp4, 5 audio ogg | `ls cinematic/ audio/` | ✓ all present |
| `READY.md` signal | `ls READY.md` | ✓ "READY 2026-05-13" |
| `BOND_FORMED` effect exists | grep | ✓ defined `src/game/effects.ts:101`, emitted `src/state/placePrimitive.ts:474`, drained `src/render/effectsRenderer.ts:108` and `src/render/audioManager.ts:375` |
| `src/state/godlyRecipes/` folder | `ls src/state/` | ✗ **EXPECTED**: will create new (D2 lock from S21 Council) |
| `src/render/cutsceneOverlay.ts` | path probe | ✗ **EXPECTED**: will create new (D3 lock) |
| `src/render/codexOverlay.ts` | path probe | ✗ **EXPECTED**: will create new (D8 lock) |
| `src/render/settingsOverlay.ts` (precedent) | path probe | ✓ 242 LOC, will mirror class structure |
| npm scripts: `dev`, `build`, `test`, `typecheck` | grep package.json | ✓ all present |

**A.0 verdict: GREEN.** Path corrections applied below; no claim invalidates the original SCOPE intent.

---

## §1 — OBJECTIVE

Execute a four-priority batch that (a) finishes deferred §XV anti-bloat work (P1, P2), (b) lays the godly-combo infrastructure decided in S21 Council R2 (P3), and (c) ships Voltkin as the first concrete godly combo using the asset pack the side session just delivered (P4). At session close: the cinematic-triggered godly combo loop must be end-to-end demonstrable in 1v1 with a host-validated recipe, asymmetric input-lock, MK-style Codex, and Voltkin's voice playing over the assassinated structure.

---

## §2 — SCOPE

### P1 — transport.ts §XV extraction (Standard tier)

**Files:**
- **MODIFY** `src/net/transport.ts` (317 → ≤280 LOC; target ~250)
- **CREATE** `src/net/iceConfig.ts` (~45 LOC) — extract `NOSTR_RELAYS`, `ICE_SERVERS`, `HANDSHAKE_TIMEOUT_MS`, `classifyJoinError`, ICE-poll constants
- No test changes (existing `transport.test.ts` keeps green; iceConfig pure constants need none)

**LOC budget:** transport ≤280 ✓ (relaxation if 281–290, codify in §XV log)

### P2 — lobbyScreen.ts §XV extraction (Standard tier)

**Files:**
- **MODIFY** `src/render/lobbyScreen.ts` (565 → ≤500 LOC; target ~480)
- **CREATE** `src/render/connectionLostOverlay.ts` (~45 LOC) — extract `connectionLostOverlay` Container + its bg/text/return-button construction
- No test changes (existing `lobbyScreen.test.ts` keeps green; pure helpers stay in lobbyScreen)

**LOC budget:** lobbyScreen ≤500 ✓

### P3 — Godly infrastructure (Full tier)

**Files (NEW):**
- `src/state/godlyRecipes/index.ts` (barrel, ≤30 LOC)
- `src/state/godlyRecipes/types.ts` (≤40 LOC) — `GodlyRecipe`, `GodlyId`, `RecipePredicate`, `GodlyTriggerContext`
- `src/state/godlyRecipes/spatialHashMatcher.ts` (≤120 LOC) — generic spatial-hash predicate runner, hooked on `BOND_FORMED` effect drain
- `src/state/godlyCooldown.ts` (≤60 LOC) — `Player.godlyCooldownEndsAtTick: number | null` field + helpers `setCooldown`, `isOnCooldown`, `tickCooldown` (60s @ 60Hz = 3600 ticks)
- `src/render/cutsceneOverlay.ts` (≤280 LOC) — asset-driven full-screen overlay class. Async asset loader, skippable lifecycle, fires `onComplete`/`onSkip` callbacks. Wall-clock animation (NOT physics-tick driven, per D5). Reusable across all godlies (Voltkin uses it in P4).
- `src/render/codexOverlay.ts` (≤200 LOC) — MK-style top-level screen showing locked/unlocked recipe tiles. Entry from title screen. Per-player localStorage-persisted unlock state.

**Files (MODIFY):**
- `src/net/protocol.ts` (84 → ~115 LOC) — add `GodlyTriggerMsg` to `NetMessage` union: `{ kind: 'GODLY_TRIGGER', godlyId, triggererPlayerId, targetStructureId, triggerTick }`
- `src/net/sync.ts` (presumed exists per main.ts import) — host-side validator + 60s cooldown enforcement + counter-window broadcast. Read at exec-time before edit; cap edit at ~+80 LOC.
- `src/input/controls.ts` (546 → ~570 LOC) — asymmetric input-lock: gate `dispatchFn` calls during `world.activeCinematicPlayerId === this.playerId`; opponent unaffected. Pure mechanism — no UI text changes here.
- `src/state/world.ts` (275 → ~310 LOC) — add `World.activeGodlyTrigger: GodlyTriggerEvent | null` + reducer case `'GODLY_TRIGGER'` (host-only) + `Player.godlyCooldownEndsAtTick`. Recipe matcher attaches to `placePrimitive`'s BOND_FORMED emission point.
- `src/main.ts` (521 → ~555 LOC) — mount `cutsceneOverlay`, route `GODLY_TRIGGER` net message → host validates → broadcast → both clients play overlay, route title-screen → codexOverlay.
- `src/render/titleScreen.ts` (cap edit at ~+20 LOC) — add "CODEX" button → opens codexOverlay.

**No-go scope (explicit):**
- Anvil recipe (S24 territory)
- Pac-Predator (S25+)
- Compress sprites or pre-process voltkin-voice.ogg reverb (call-out in §6 risks; deferred TODO)
- Counter-recipe execution (Triangle-arc → redirect/trampoline) — recipe slot reserved, runtime defer to S23+
- HTTP-80 redirect on spark-online.space (non-blocking)

### P4 — Voltkin integration (Standard tier, gated on P3 green)

**Voltkin canonical identity (LOCKED post-user-review 2026-05-13):**
The side session generated 9 sprites but the 6 character poses depict **at least 4 different designs** (Round Looney-Tunes gremlin, muscular anime-shonen warrior, pastel cat, boxy-square-head chibi). Only `voltkin-zap.png` matches the user-attached canonical reference image (Round Looney-Tunes screaming pose, both paws raised, yellow aura). The other 5 character poses are declared **off-model** for v1 and archived. Proper consistent multi-pose asset pack (walk cycle / attack / idle / victory / hurt all matching the Round Zap design) deferred to **S24 v2 asset pack** as a follow-up Imagen side session (~$5-10, ~1-2 hrs).

**v1 ships:** ONE character sprite (`voltkin-zap.png` canonical) + the cinematic (luma-keyed onto black) + voltkin-voice.ogg. No idle bob, no walk cycle, no victory frame. The cinematic IS the character animation in v1.

**Files (NEW):**
- `src/state/godlyRecipes/voltkin.ts` (≤90 LOC) — recipe predicate (lightning-bolt-silhouette + tv-frame-silhouette components adjacency <200 px via existing `silhouettes/` infra per Battle Ledger row 6, PRIME-AUDIT Δ1 fallback if infra doesn't support), `GodlyId = 'voltkin'`, asset paths, sustained-effect window 8 s
- `src/render/voltkinCinematic.ts` (≤150 LOC) — Voltkin-specific extension/configuration of `cutsceneOverlay`: mp4 timing (4 s) + voltkin-voice.ogg playback at t=3.5 s + zap-attack sprite crossfade at t=5.0 s on the destroyed structure pos
- **`src/render/cinematicLumaKey.ts` (≤80 LOC) — NEW custom PixiJS Filter** that converts brightness > threshold (default 0.88) to alpha=0. Removes the white background from voltkin-intro.mp4 so the TV pops up cleanly over the black game canvas. Reusable — future godly cinematics get free background removal. Threshold preview-verified at execution.
- **Asset deploy:** copy ONLY `voltkin-zap.png` + `tv-{off,static,glowing}.png` + `voltkin-intro.mp4` + `voltkin-voice.ogg` from `assets-source/godly-voltkin/` → `public/godly/voltkin/`. Move off-model sprites (idle-1, idle-2, charge, victory, hurt) to `assets-source/godly-voltkin/sprites/off-model-v1/` with `README.md` documenting why each failed the consistency check.

**Files (MODIFY):**
- `src/state/godlyRecipes/index.ts` — register `voltkin` recipe
- `src/render/codexOverlay.ts` — show Voltkin tile using `voltkin-zap.png` cropped to 256×256 (locked = grayscale α 0.15; unlocked = full color). Tile uses canonical sprite, NOT idle-2 (which is off-model).
- `src/render/audioManager.ts` (cap edit at ~+30 LOC) — register Voltkin audio cues (`voltkin-voice.ogg`; cinematic-bundled audio handled by the mp4 element; SFX time-slices NOT used in v1 since Veo's native AAC carries them)

---

## §3 — CONSTRAINTS

### Quality
- All 401 existing tests must stay green
- New tests added for: spatialHashMatcher (predicate runner, pure), voltkin recipe predicate (pure), godlyCooldown (pure), protocol.ts GodlyTriggerMsg discriminated-union narrowing
- Typecheck `tsc -b --noEmit` exit 0
- Build `npm run build` must succeed; bundle ≤ 420 KB (current 397.65 KB + Voltkin assets shipped separately as static)
- Asset pack total ≤ 4 MB on disk in `public/godly/voltkin/` (already verified 3.62 MB)

### Architectural
- BOND_FORMED is the **only** detection trigger (D12). Recipe matcher MUST NOT run every physics tick.
- Cutscene overlay is **wall-clock animated**, not physics-tick driven (D5). Physics loop in main.ts keeps ticking during the 3 s cinematic.
- Cooldown is **host-validated server-side** (D7 + PRIME-AUDIT-S21 anti-cheat). Client-side preview only.
- Asymmetric input-lock: only the **triggering player's** dispatch is gated during their own cinematic; opponent stays free (D6 counter-window).
- Codex defaults to **empty on first 1v1** — no spoilers (D8 PRIME-AUDIT-S21).
- Voltkin design constraints locked in `assets-source/godly-voltkin/notes/character-locked.md` — no code-side mutation.
- IP-vibe-not-likeness policy applies — no Pokémon names, terms, or palette echoes in code identifiers (`voltkin` not `voltchu`, etc.)

### Performance
- 60 Hz physics + 10 Hz net snapshot UNCHANGED during cinematic
- Voltkin cinematic mp4 lazy-loaded on first eligible BOND_FORMED, not at boot (D9)
- Sprite preload triggered on Codex unlock-tile-hover (cheap, <50 KB delta on hover)

### Scope discipline
- §XV anti-bloat: transport ≤280, lobbyScreen ≤500, every new file ≤ its budget
- No backwards-compat shims for the GODLY_TRIGGER addition: bump protoVersion 1→2, peer mismatch surfaces existing classifyJoinError flow
- Solo mode (no transport): godly triggers locally dispatch + play cinematic, no GODLY_TRIGGER network message (skip the host-validator call site)

### Net wire safety
- Wire format unchanged at envelope level (still JSON string in makeAction<string>) — only adds new discriminant kind
- Sequence numbers: GODLY_TRIGGER rides on host→client direction with `snapshotSeq` reused (it's a host-broadcast event, not a client-intent)
- Backwards compat: with protoVersion bump, mixed-version peer is rejected at lobby. Both peers always upgrade together via deploy.

---

## §4 — APPROACH

### P1 design
`iceConfig.ts` is a pure-data + pure-function module. Move `NOSTR_RELAYS`, `ICE_SERVERS`, `HANDSHAKE_TIMEOUT_MS`, `ICE_POLL_INTERVAL_MS`, `ICE_POLL_MAX_DURATION_MS`, `classifyJoinError`, and `APP_ID` (still used in `transport.ts` connect log). transport.ts imports them. Net delta: transport drops ~70 LOC (constants + classifyJoinError + 2 comment blocks); gains 1 import line. Zero behavior change.

### P2 design
`connectionLostOverlay.ts` exports a `makeConnectionLostOverlay(app, onReturn): { container, setVisible }` factory. `LobbyScreen` constructor calls it, holds the returned handle, and the constructor body sheds ~30 LOC (overlayBg + lostText + lostHelp + returnBtn construction). LOC of lobbyScreen drops to ~510, then trimming the in-line comment of S17 P0' BLOCKER fix (lines 240-243 + 259-260 + 328-331 — historical context, can compress to one-liner since it shipped) puts it ≤500. Existing API surface unchanged.

### P3 design — Recipe matcher

```typescript
// src/state/godlyRecipes/types.ts
export type GodlyId = 'voltkin'; // extends to 'anvil' | 'pac-predator' in S24+
export interface RecipePredicate {
  (ctx: GodlyTriggerContext): GodlyMatch | null;
}
export interface GodlyMatch {
  triggererPlayerId: PlayerId;
  targetStructureId: StructureId;
  metadata: Record<string, number>; // recipe-specific (e.g. 'lightningSilhouetteId', 'tvSilhouetteId')
}
export interface GodlyRecipe {
  id: GodlyId;
  predicate: RecipePredicate;
  cinematicAsset: string;       // mp4 path
  voiceAsset: string;           // ogg path
  sustainedEffectMs: number;    // 8000 for Voltkin
  cinematicMs: number;          // 4000 for Voltkin
}
```

The matcher runs **once per BOND_FORMED effect** (D12). It's wired at the `placePrimitive.ts` BOND_FORMED emission site OR at effectsRenderer drain — preferred: drain site (no state.ts pollution; matcher is a rendering-adjacent decision = wrong: it's *state* because it dispatches GODLY_TRIGGER). Final wire: **at effects drain in main.ts loop**, post-physics-tick, scanning for BOND_FORMED effects, running registered recipe predicates on each. **Host-side only** (sync.ts isHost gate). If match → dispatch local `GODLY_TRIGGER` reducer + broadcast `GodlyTriggerMsg`.

### P3 design — Cutscene overlay

```typescript
// src/render/cutsceneOverlay.ts (≤280 LOC)
export class CutsceneOverlay {
  // Wall-clock animated, NOT physics-tick. Uses requestAnimationFrame + Date.now().
  // Pre-loads recipe.cinematicAsset + recipe.voiceAsset on play().
  // Skippable via Space/Esc keypress.
  // Composition: full-screen black bg (alpha 1.0 fade-in 0.3s), centered <video> element
  //   absolutely positioned over canvas, audio routed through audioManager.
  // Lifecycle: play(recipe, ctx) → [fade-in 0.3s] → [video 4s] → [hold final 0.5s] →
  //   [zap-attack sprite crossfade on canvas at ctx.targetStructurePos 1.0s] →
  //   [fade-out 0.3s] → onComplete().
  // Audio: video plays with native AAC (already has all SFX baked in per Veo).
  //   voltkin-voice.ogg overlayed at t=3.5s via audioManager.playOneShot.
}
```

### P3 design — Codex

`codexOverlay.ts` mirrors `settingsOverlay.ts` structure: top-level container, dark bg, grid of recipe tiles (locked = silhouette, unlocked = colored tile + name + recipe hint). Per-player unlock state in `localStorage` under `spark:codex:unlocked:v1` JSON array of GodlyId. Empty on first 1v1 (D8 PRIME-AUDIT).

### P3 design — Asymmetric input-lock

`controls.ts` gets a guard at the top of `onDown`, `onUp`, `onKeyDown`:
```typescript
if (this.world.activeCinematicPlayerId === this.playerId) return;
```
Opponent (`this.playerId ≠ activeCinematicPlayerId`) is unaffected — they continue building counter. `world.activeCinematicPlayerId` is set by `GODLY_TRIGGER` reducer + cleared after `cinematicMs + sustainedEffectMs` via main.ts setTimeout (wall-clock, mirrors overlay lifecycle).

### P3 design — Cooldown

`Player.godlyCooldownEndsAtTick: number | null`. On host validation of incoming GODLY_TRIGGER intent (or local solo trigger): check `world.tick < player.godlyCooldownEndsAtTick`. Reject if not. On accept: set `endsAtTick = currentTick + 60 * PHYSICS_HZ` (= 3600 at 60 Hz). Tick-based survives net lag better than wall-clock; client preview converts to seconds for UI hint.

### P3 design — GODLY_TRIGGER net flow

```
[host or client BOND_FORMED] → recipe matcher (HOST ONLY) → match found
  ↓
[host] dispatch local GODLY_TRIGGER reducer (sets world.activeCinematicPlayerId, applies sustained effect, sets cooldown)
  ↓
[host] include GodlyTriggerMsg in next NetSnapshot OR send standalone (decision: standalone for latency — recipient renders cinematic 0-100ms sooner; pick standalone)
  ↓
[client] receive GodlyTriggerMsg → apply same reducer locally → play cinematic
  ↓
[both] cutsceneOverlay.play(recipe, ctx) → 4s cinematic → 8s sustained effect → cooldown 60s
```

### P4 design — Voltkin specifics

**Canonical sprite policy:**
Only `voltkin-zap.png` ships in v1. Selection criterion: matches user-attached reference image (Round Looney-Tunes gremlin, both paws raised, yellow aura, anime eyes, wide toothy scream). Other 5 character poses (charge/victory/idle-1/idle-2/hurt) fail consistency gate and move to `off-model-v1/` archive with documented rationale. TV bezels (`tv-off.png`, `tv-static.png`, `tv-glowing.png`) are independent assets and all ship. Codex tile = `voltkin-zap.png` cropped client-side via Pixi to 256×256.

**Recipe predicate** (`voltkin.ts`):
Per Battle Ledger row 6 + PRIME-AUDIT Δ1: matches by **silhouette-component IDs** using existing `src/render/effects/silhouettes/` infra. Lightning-bolt silhouette + TV-frame silhouette adjacency (<200 px centroid distance). Triggerer must own the lightning component, must NOT be on cooldown. Δ1 verification at P3 pre-flight determines whether to use silhouette-component approach (Plan A) or primitive-tag fallback (Plan B).

**Voltkin cinematic config** (`voltkinCinematic.ts`):
```typescript
export const VOLTKIN_RECIPE: GodlyRecipe = {
  id: 'voltkin',
  predicate: voltkinPredicate, // imports from voltkin.ts
  cinematicAsset: '/godly/voltkin/cinematic/voltkin-intro.mp4',
  voiceAsset: '/godly/voltkin/audio/voltkin-voice.ogg',
  characterSprite: '/godly/voltkin/sprites/voltkin-zap.png', // canonical
  sustainedEffectMs: 8000,
  cinematicMs: 4000,
  lumaKey: { enabled: true, threshold: 0.88 }, // remove white bg
};
```

**Cinematic luma-key shader** (`cinematicLumaKey.ts`):
PixiJS `Filter` subclass implementing a fragment shader:
```glsl
vec4 c = texture2D(uSampler, vTextureCoord);
float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114)); // ITU-R BT.601 luma
if (lum > threshold) c.a = 0.0; // mostly-white → transparent
else if (lum > threshold - 0.05) c.a *= (threshold - lum) / 0.05; // soft fade (5%)
gl_FragColor = c;
```
Soft-edge band (5% below threshold) anti-aliases the white-to-transparent transition. Threshold 0.88 chosen because Voltkin's yellow body (~RGB 255, 214, 10 → luma ≈ 0.77) is safely below cutoff while pure white (luma 1.0) is removed. Threshold tuned at execution via preview_screenshot of mp4 keyframe + verify yellow preserved, white transparent. Applied to the mp4 texture in `cutsceneOverlay` only when `recipe.lumaKey.enabled`. Reusable for all future cinematics.

**Asset deploy:**
```bash
mkdir -p public/godly/voltkin/{sprites,audio,cinematic}
cp assets-source/godly-voltkin/sprites/voltkin-zap.png public/godly/voltkin/sprites/
cp assets-source/godly-voltkin/sprites/tv-{off,static,glowing}.png public/godly/voltkin/sprites/
cp assets-source/godly-voltkin/audio/voltkin-voice.ogg public/godly/voltkin/audio/
cp assets-source/godly-voltkin/cinematic/voltkin-intro.mp4 public/godly/voltkin/cinematic/
mkdir -p assets-source/godly-voltkin/sprites/off-model-v1
mv assets-source/godly-voltkin/sprites/voltkin-{idle-1,idle-2,charge,victory,hurt}.png \
   assets-source/godly-voltkin/sprites/off-model-v1/
```
+ write `off-model-v1/README.md` documenting per-sprite consistency-failure rationale.

**Sustained effect runtime (Voltkin-specific):**
The "zap destroys target structure" effect: at cinematic+0.5s (during the 8s sustained window), dispatch a SEVER_BOND series on all bonds in `ctx.targetStructureId`. Existing SEVER_BOND machinery handles the visual + physics fallout. No new structure-destruction primitive needed; reuse SEVER_BOND with cause='godly'. Add new SEVER_BOND `cause` variant (extends 'player' | 'physics' | 'godly').

**Deferred to S24+ (Voltkin v2 asset pack, side session, ~$5-10):**
- Walk cycle (4-frame) matching Round-Zap canonical
- Attack-charge animation (4-frame, build-up to zap)
- Idle bob (2-frame, alive feel)
- Matched victory + hurt poses (consistent silhouette)
- Optional: Imagen pre-cinematic shatter + post-cinematic destruction sprite sheets (Gemini R1 creative-tier upgrade, Battle Ledger row 13 DEFERRED)

---

## §5 — RISKS

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R1 | Recipe matcher false-positive at high bond rate (3+ structures form simultaneously) | Med | Med | Predicate runs once per BOND_FORMED, not once per matching pair — deterministic ordering by BOND_FORMED.tick + bondId. Cooldown gate prevents double-trigger same player. |
| R2 | Cinematic mp4 fails to load (CDN blip, mobile data) | Low | High | Promise<HTMLVideoElement> with 5s timeout in cutsceneOverlay; on timeout, fall back to instant SEVER_BOND of target structure (skip cinematic), log warn. Anti-frustration. |
| R3 | Asymmetric input-lock leaks to opponent on protocol race | Low | High | `activeCinematicPlayerId` is host-authoritative; client trusts host snapshot. Local-prediction-only solo path always uses local playerId. |
| R4 | GODLY_TRIGGER msg delivered before BOND_FORMED snapshot — client confused | Med | Med | Client's protocol handler queues GodlyTriggerMsg until snapshotSeq ≥ triggerTick's snapshot. ~16-100 ms desync acceptable. |
| R5 | Codex shows recipe on first 1v1 (spoiling brother surprise) | Med | High | Codex defaults to empty; unlock fires only on **successful** GODLY_TRIGGER. PRIME-AUDIT-S21 #4 locked. |
| R6 | Voltkin name unexpectedly trademarked post-ship | Low | Med | Side session cleared web/Steam/Play; pre-cleared fallback names in trademark-check.md. Code uses `GodlyId = 'voltkin'` as a string literal — find/replace swap is one PR. |
| R7 | Recipe matcher introduces 60Hz hot-path regression | Low | High | Matcher fires on BOND_FORMED only (effect-driven, not tick-driven). At <10 BOND_FORMED/sec typical, predicate runs 10×/sec. Bench in P3 final integration. |
| R8 | Bundle size jumps past 420 KB | Low | Low | mp4 + ogg served from public/, not bundled. JS-only delta ~8-12 KB (new files mostly types + small predicates). |
| R9 | TypeScript discriminated-union narrowing breaks somewhere on protoVersion bump | Med | Low | Add `parseNetMessage(raw): NetMessage \| null` validator in protocol.ts that rejects unknown kinds + unknown protoVersions. Existing tests + new test cover. |
| R10 | "world.tick" path correction (no such property) destabilizes D5 lock | Low | Med | Reinterpreted in §0 A.0. main.ts physics loop continues unchanged during cinematic — overlay is async, lifecycle decoupled. Council R1 should validate this interpretation. |
| R11 | Recipe predicate "TV-frame silhouette" not actually decidable from primitive geometry | Med | Med | v1 uses crude rectangular-bbox heuristic. If predicate proves fragile in playtest, swap to explicit "PrimitiveTag" marker user assigns. Punt to S23 follow-up if cropped. |
| R12 | placePrimitive.ts BOND_FORMED emission emits in mid-reducer — matcher hooking there violates reducer purity | Med | High | Hook at **effects drain in main.ts** post-physics-tick, scanning the effects queue. Reducer stays pure. Decision logged §4 design. |

---

## §6 — TESTING

### Automated (vitest)
- `iceConfig.test.ts` (NEW) — classifyJoinError patterns regression
- `connectionLostOverlay.test.ts` (NEW) — factory returns valid container + setVisible toggles
- `godlyRecipes/spatialHashMatcher.test.ts` (NEW) — runs predicates on synthetic BOND_FORMED + asserts match shape
- `godlyRecipes/voltkin.test.ts` (NEW) — predicate matches lightning+tv adjacency, rejects too-far, rejects on cooldown
- `godlyCooldown.test.ts` (NEW) — tick-based cooldown math, setCooldown/isOnCooldown/tickCooldown
- `protocol.test.ts` (EXTEND) — GodlyTriggerMsg added to discriminated union, parse round-trip, protoVersion 2 narrowing
- `world.test.ts` (EXTEND) — GODLY_TRIGGER reducer sets activeCinematicPlayerId + cooldown + does not pause tick
- `controls.test.ts` (EXTEND) — asymmetric input-lock: locked player rejects, opponent passes

**Target: 401 → ~415 tests, all green.**

### Manual / preview-driven
- `npm run typecheck` exit 0
- `npm run test` 415/415 green
- `npm run build` succeeds, bundle ≤ 420 KB
- `npm run dev` on `$SESSION_PORT` (29592 if not stale)
- Preview verification (preview_* tools):
  - Title screen → CODEX button visible, opens overlay, all tiles locked
  - Solo mode: build lightning + TV adjacency, place bond, cinematic fires (4s mp4), structure destroyed, Codex tile unlocks
  - Network mode: brother + me would test asymmetric input-lock; this session: not testable without 2 peers but solo path proves the mechanism
  - Cooldown: after trigger, try again within 60s → should silently no-op (no second cinematic)

### Verification proof to user
- preview_screenshot of CODEX overlay (locked default + unlocked after trigger)
- preview_screenshot of cinematic mid-frame
- preview_logs showing GODLY_TRIGGER dispatch + BOND_FORMED match
- `npm run test` output 415/415

---

## §7 — SUCCESS CRITERIA

P1 done iff: transport.ts ≤280 LOC ✓, all transport tests pass, no behavior change demonstrable in solo + 1v1 connect flow.
P2 done iff: lobbyScreen.ts ≤500 LOC ✓, all lobby tests pass, connection-lost overlay still appears on peer drop (preview-verified).
P3 done iff: solo godly trigger fires cinematic (any test predicate hardwired-true), cutscene plays 4s wall-clock, world physics keeps ticking during cinematic (verified by snapshotting world.tick before/after), Codex overlay opens from title and shows empty grid, asymmetric input-lock works (locked player's clicks no-op, opponent free).
P4 done iff: Voltkin recipe predicate matches lightning + TV adjacency, asset paths resolve at `/godly/voltkin/...`, full cinematic plays, voltkin-voice.ogg audible at t=3.5s, target structure visibly destroyed via SEVER_BOND cascade, Codex tile unlocks on success.
**Batch done iff:** all four ✓ AND `git commit + push` for each priority sequentially AND HANDOFF written + boot-snapshot regenerated for S23.

---

## §8 — ROLLOUT

Per-priority:
1. Implement → typecheck → test
2. `git add -p` (named files only, no `-A`) → `git commit -m "[S22 PX] …"` → `git push`
3. Update session-state.json: status→completed, check_method, checkpoint_commit SHA, real_context_tokens
4. Write reflexion entry
5. Announce next priority

Final:
6. Run `npm run dev` on $SESSION_PORT → preview verification of P4 cinematic end-to-end
7. preview_screenshot proof
8. Run `/handoff` (generates HANDOFF_2026-05-14.md or so + archives 2026-05-13 + regenerates boot-snapshot)
9. Final push, verify deploy at https://spark-online.space/

---

## §9 — CONTEXT BUDGET

Pre-execution: ~70K (this session's reads + PDR draft + Council R1 + R2 + Triumvirate)
Per-priority budget allocation (after Council finalizes):
- P1: ~15K (small extraction)
- P2: ~20K (file is dense)
- P3: ~80K (multi-file, multi-pattern)
- P4: ~25K (integration on top of P3)
- Overhead (Council, commits, tests): ~30K
**Projected close:** ~240K / 1M = 24% (GREEN throughout, comfortable headroom)

---

## §10 — DELIBERATION REQUIREMENT

Per CLAUDE.md DELIBERATION protocol — Full tier batch:
- **3-way Council** (Claude + Grok + Gemini), 2 rounds, Battle Ledger
- **PRIME-AUDIT** after R2 synthesis, before user presentation
- **CHECK phase:** Triumvirate (RALPH:PATROL + GROK-ANALYST + GEMINI-AUDITOR) after each priority
- **A.0 state-discovery:** ✓ complete (§0)

User `go` after PRIME-AUDIT seals the gate — all four priorities then execute sequentially.

---

**Awaiting Council R1.**
