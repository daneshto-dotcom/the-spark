# PDR — S112 — HELGA Veo Character (idle / walk / slap) + state-driven audio

**Tier:** Standard (render + asset + audio; **NO wire/protocol change**)
**Status:** DRAFT → Council → owner go
**Owner intent (verbatim, this session):** the veo walk mp4 is "genuinely good… I want this to be how helga walks and everything." Theme music in-game, looping **only when walking & attacking** (idle/no-target → back to base game music). On slap: a **strong HHWAPAH battle-cry + clap** ("hear the slap really land"). All assets owner-approved.

## OBJECTIVE
Replace HELGA's in-world **procedural puppet** with her **veo-generated animated character** (owner-approved clips), tick-synced + replay-safe, and add **state-driven audio**: Helga's theme during walk/attack, base game music when idle; a strong slap SFX on each hit.

## SCOPE — IN
1. **Asset pipeline** (`scripts/matte-helga-anim.py`, committed): matte the 3 veo clips → transparent **frame atlas + manifest** in `public/godly/helga/anim/` (border-flood, interior-white-safe, no-box — S110 `matte-art-keepers.py` precedent; + handle veo **drop-shadow** via low-sat∧bright border-flood candidate, and **skip the first ~4 ramp-in frames** that carry the gray transition artifact). Lazy-loaded static file ⇒ **zero JS-bundle**.
2. **Renderer** (`src/render/princessRenderer.ts`): draw the atlas frame chosen by a **PURE mapping** of synced `(state, ticksInState, world.tick, defenderId)`:
   - `IDLE` → idle clip, loop on `world.tick`
   - `WALK` → walk clip, loop
   - `WINDUP/FIRE/RECOVER` → slap clip phased; **impact frame on FIRE entry**
   Keep `helgaPose` procedural puppet as **instant first-paint + atlas-load-fail fallback** (S83 Voltkin precedent). Keep impact star-burst + facing logic intact.
3. **Audio** (`src/render/audioManager.ts` + a per-frame call from `main.ts`):
   - **Slap SFX**: swap procedural `playSlapSFX` → `playOneShot('/godly/helga/audio/helga-slap.ogg')` (= `battlecry_plus_clap_v5`: HHWAPAH + clap), positional, on the FIRE edge (existing edge detector).
   - **Helga theme**: new state-driven theme on the music bus — plays while **any** princess is engaged (`state≠IDLE || targetCreatureId≠null`); reverts to **base game music** when none engaged. Must **compose** with master/music mute, the auto-duck, and the NONET realm swap (NONET overrides).
4. Constants/tuning, unit tests, live-verify, deploy via `npm run deploy`.

## SCOPE — OUT
- **No wire/protocol change** — all render-relevant defender state is already synced; `PROTOCOL_VERSION` stays **13**.
- No FSM / gameplay / balance change (durations, ranges, damage, leash unchanged).
- No new veo/TTS generation (assets locked).
- Turret renderer + `helgaPose.ts` (kept as fallback) untouched in behavior.

## A.0 STATE-DISCOVERY (empirical, this session)
- **veo reference-conditioning**: VERIFIED on-model for idle+walk (contact sheets); slap = gestural sweep → impact sold by SFX + star-burst + a tick-synced lunge (owner-accepted).
- **Audio bus** (`audioManager.ts`): has music bus, `playOneShot` (cached, positional, sfx-gated), `duckMusic`, `enterNonetRealm/exitNonetRealm` theme-swap, master/music/sfx mute. → Helga theme follows the proven `enterNonetRealm` swap pattern.
- **Defender state** (`defender.ts`): `state / ticksInState / pos / targetCreatureId / lastStrikePos / walkTargetPos` ALL synced ⇒ frame mapping + theme trigger are **pure fns of synced state** (deterministic, 1v1-mirror-safe). Princess FSM: IDLE→WALK(to target)→WINDUP→FIRE→RECOVER.
- **Matte**: S110 border-flood is the proven base; veo adds drop-shadow + ramp frames → mitigations above. **OWNER-EYEBALL the dark-bg matte preview before atlas wiring** (matte-art-keepers precedent).
- **Voltkin atlas walk-back (precedent, residual)**: S83 built a veo atlas, later simplified to static PNGs (reason not fully documented). Mitigated regardless by zero-bundle static-file load + retained puppet fallback. To confirm in execution.

## DETERMINISM / MULTIPLAYER
Frame selection + theme activation are pure functions of already-synced state → host and 1v1 client render/hear identically. No new serialized fields. `lastStrikePos`+FIRE state already synced → the slap SFX edge fires on both peers (current `princessRenderer` precedent). Replay byte-equivalence preserved (render-only change).

## RISKS & MITIGATIONS
1. **Matte quality** (owner burn history: checkerboard/holes/box) → proven border-flood + interior-safe labeling + **owner preview checkpoint** + opaque-fraction sanity gate.
2. **Atlas size** → separate static PNG, lazy `Assets.load`, downscaled; not in JS entry chunk (bundle gate unaffected).
3. **Audio theme fighting base music / NONET / duck** → single source-of-truth `helgaThemeActive(world)`; NONET overrides; reuse music bus + mute gates; unit tests.
4. **Style pop** idle↔walk↔slap → all clips share the veo seed/style; transitions brief.
5. **Multiple Helgas** → theme is a single **global** bus state (active if ANY engaged), not per-instance; per-instance render phase via defenderId.
6. **Autoplay/first-gesture** → theme start guarded like existing music (no-op pre-gesture).

## TESTING
- Pure frame-mapping unit tests: each state → expected cell range; FIRE impact frame; loop wrap; per-id phase.
- `helgaThemeActive` pure-fn tests: idle/no-target=false; walk/windup/fire OR has-target=true; multi-instance.
- Matte sanity: opaque fraction in band; bbox crop ⇒ no transparent margin (no box).
- `tsc` 0 · full vitest · preview live-verify (spawn Helga, watch all states + audio transitions) · deploy hash-verify.

## ROLLBACK
Renderer retains the `helgaPose` puppet path as fallback; revert = flip the atlas-on flag to puppet + drop the theme call. Assets are additive static files (no removal needed).

## CANONICAL ASSET MAP (locked)
- walk → `veo_1782628876.mp4` · idle → `veo_1782629522.mp4` · slap → `veo_1782629482.mp4`
- theme → walk-clip music extract (`helga_theme_loop.ogg`) · slap SFX → `battlecry_plus_clap_v5.ogg`
(staged into the repo only after PDR approval)

---

## COUNCIL (2-way — Grok ANALYST + Claude; Gemini DOWN: 429 credits depleted → noted warning)
Grok verdict: BLOCK (3 challenges). PRIME-AUDIT against the actual codebase resolves to **SHIP-WITH-FIXES**:

- **Δ1 — Music policy resolver (ACCEPT Grok #1, the real new risk).** Replace "compose cleanly" hand-wave with a single source-of-truth `resolveMusicPolicy(world)` → priority-ordered desired track: **NONET realm (highest) > Helga theme (any princess engaged) > base game music**. Helga-engaged predicate gets a **~1s disengage debounce** (anti flap-thrash). Per-frame: compute desired vs current, **transition only on change** (idempotent start/stop — never re-trigger an already-playing track). **Reset to base on START_GAME / RETURN_TO_TITLE** (rainbow-yell-latch precedent). Theme rides the music bus ⇒ master/music mute+volume + auto-duck apply for free. Both peers evaluate the same pure predicate from synced state.
- **Δ2 — Shared-frame-box matte (ACCEPT Grok #3).** Matte all frames to a **fixed canvas with a consistent foot-anchor** — NOT per-frame bbox crop (which would make her jitter/shift). Pivot identical across the slap clip so the impact aligns with `lastStrikePos`.
- **Δ3 — FIRE SFX / observability (REFUTE Grok #2 with evidence).** `DEFENDER_FIRE_HOLD_TICKS=12` is explicitly designed for "≥2 snapshot intervals"; existing edge detector = exactly-once; renderer keys off SYNCED `world.tick`+`ticksInState`. CONSTRAINT codified: atlas phase MUST key off synced values + reuse the existing edge detector — do NOT free-run a local clock.
- **Δ4 — Load-fail (ACCEPT Grok, lower).** Atlas-load-fail → puppet fallback on that peer is **cosmetic-only** (gameplay state identical) — documented acceptable. `defenderId` used only for IDLE ambient phase offset, not divergent animations.

**Post-audit verdict: SHIP-WITH-FIXES** (Δ1+Δ2 into execution; Δ3 verified already-handled; Δ4 documented).
