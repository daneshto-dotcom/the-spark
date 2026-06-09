═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S77: Global-reach entities fog-EXEMPT
═══════════════════════════════════════════════════════════
Status: DRAFT → Council → PRIME-AUDIT → GATE (awaiting user `go`)
Tier: STANDARD (10-30K) · 3-way Council (1 round, Battle Ledger) mandated

OBJECTIVE
  Make global-reach hazard entities (potato, rainbow, hunter, Voltkin creature)
  render THROUGH the fog-of-war so EVERY player can see threats that can affect
  them — implementing the user rule "visible-to-all iff can-affect-all." Pure
  client-side render z-order change; NO protocol / netcode / game-logic change.

CURRENT STATE
  • Fog = a single full-screen opaque overlay Sprite (render/fogRenderer.ts) added
    to app.stage LAST among gameplay layers (main.ts:306). It paints over every
    entity OUTSIDE the local player's vision holes. Concealment works by
    PAINTING OVER, not by culling — so "fog-exempt" == "rendered above the fog."
  • The above-fog pattern already exists: FogRenderer adds its memoryLayer to the
    stage AFTER the fog container (the dim enemy-structure ghosts ride above fog).
  • netSnapshot() (state/save.ts:388-422) already serializes ALL primitives,
    creatures, hunters, potatoes, rainbows to EVERY peer (no owner filter); clients
    rehydrate the full set (applySnapshotCore). The fog is PURELY a client-side
    visual overlay → exemption is render-only, no wire change.
  • All 4 target renderers add ONE display object to app.stage in their ctor:
    potatoRenderer:28 (graphics), hunterRenderer:30 (graphics),
    rainbowRenderer:29 (graphics), creatureRenderer:184 (container).
  • Reach audit (this session): GLOBAL-REACH = Potato (owner-agnostic AoE,
    potatoLifecycle.ts:128) · Rainbow (global colour shuffle of all players+prims,
    rainbowLifecycle.ts:95) · Hunter (board-wide chaser, hunterLifecycle.ts) ·
    Voltkin (attacks cross-player enemy bonds, creatures/creatureAI.ts:73).
    NOT global-reach = Bomb (severs only the PICKER's OWN bonds,
    bombLifecycle.ts:104) → EXCLUDED by the rule despite being on the handoff's
    candidate list. Avatars/sparks/structures = per-player (the core concealment).
  • Rainbow clicks are POSITION-based (controls.ts:pickRainbow, vs cursor within
    RAINBOW_RADIUS), not Pixi-interactive on the graphics → re-parenting cannot
    affect clickability (and it finally makes the rainbow VISIBLE to click).

SCOPE (6 changes, 6 files)
──────────────────────────────────────────────────────────
1. src/main.ts (modify)
   • Create `const aboveFogLayer = new Container(); aboveFogLayer.eventMode='none';`
     BEFORE the renderer-construction block (so the 4 renderers can addChild into
     it at construction).
   • Pass `aboveFogLayer` as a new `parent` arg to the potato / rainbow / hunter /
     creature renderer constructors.
   • `app.stage.addChild(aboveFogLayer)` IMMEDIATELY AFTER the FogRenderer ctor
     (~line 307) → sits above fog + memoryLayer, below the gameplay `hint` (392).
   • Add `aboveFogLayer.destroy({ children:true })` to the teardown path IF one
     exists (renderers already self-destroy their own objects; layer is otherwise
     an empty container).

2. src/render/potatoRenderer.ts (modify)
   • ctor `(app: Application, parent: Container = app.stage)`; `parent.addChild(this.graphics)`.

3. src/render/rainbowRenderer.ts (modify)  — same param + `parent.addChild(this.graphics)`.

4. src/render/hunterRenderer.ts (modify)   — same param + `parent.addChild(this.graphics)`.

5. src/render/creatureRenderer.ts (modify) — same param + `parent.addChild(this.container)`.

6. e2e/fog.spec.ts (modify) + a renderer unit test (modify/create)
   • Unit: `new XRenderer(app, customParent)` adds its display object to
     customParent, NOT app.stage (4 small asserts — one per renderer).
   • e2e: during fog-active 1v1, a global-reach entity (potato/hunter) in a fogged
     region is visible (pixel sample ≠ fog-black at its position OR display-tree
     parent assertion) while an enemy structure in the same fog is NOT. Existing
     fog assertions (mask, memory ghosts, win-lift) must still pass.

NO CHANGES TO
  • Protocol — PROTOCOL_VERSION stays 6. No netcode, no NetSnapshot shape change
    (all entities already replicated to all peers).
  • Vision math (state/vision.ts) — own-creature/own-primitive/personal/spawner
    vision sources UNCHANGED → the SCOUTING asymmetry is preserved (only your own
    units reveal the surrounding enemy BOARD; enemy global-reach entities show as
    bare sprites above the fog, NOT a board reveal).
  • Bomb renderer (single-owner → stays fogged), avatar renderer (per-player; your
    own avatar is always inside the personal-vision hole anyway), spark + structure
    renderers (the core build concealment that makes the game work).
  • Transient effects (render/effectsRenderer.ts) — potato-blast / creature-attack
    flashes stay fogged. EXPLICIT DEFERRED follow-up (would widen to Full).
  • Game logic, scoring, spawn cadence, RNG streams.

RISK ASSESSMENT
  • R1 z-order: a mis-placed aboveFogLayer leaves entities under the fog (no
    exemption) or over the gameplay hint. Mitigation: add immediately after the
    FogRenderer ctor + before `hint`; preview-verify entities show through fog and
    the hint stays on top.
  • R2 corner-HUD overlap: aboveFogLayer sits above the corner badges (BETA/mute/
    settings — ALREADY fog-covered during 1v1 play); a potato at the extreme
    top-right could overlap a badge. Negligible (entities spawn in the play area;
    badges already under fog). Preview confirms; no code mitigation needed.
  • R3 info-leak (Voltkin): an always-visible ENEMY Voltkin telegraphs an
    opponent's offensive slightly earlier than today (currently enemy creatures are
    concealed until they enter your vision). This IS the intended "see the threat
    coming"; it is symmetric and reveals only the creature sprite, not the enemy
    board. ACCEPT (the user ask). ← Council decision point.
  • R4 creature-flash ordering: the creature now renders above its OWN arc-flash
    attack effect (effects stay below fog). Cosmetic only; flash still mostly
    visible around the small creature sprite. ACCEPT.
  • R5 regression: existing fog.spec.ts (mask, memory ghosts, win-lift) must be
    unaffected. Mitigation: full Playwright gating lane + full vitest before ship.

TESTING PLAN
  • tsc -b → 0 errors. Full vitest (1142 baseline) → no regressions.
    vite build main bundle < 550 KB charter.
  • New unit asserts (×4): each renderer honors the `parent` param.
  • e2e/fog.spec.ts: global-reach entity visible-in-fog while enemy structure is
    concealed; all existing fog assertions still pass.
  • Playwright gating lane: 32 pass + 1 pre-existing Sym-E skip (baseline) green.
  • MANUAL/PREVIEW (mandated — fogRenderer.ts is the "un-unit-testable GPU half,
    verified live"): dev server, networked 1v1; confirm potato/rainbow/hunter/
    Voltkin visible through fog; enemy STRUCTURES still concealed; win-lift +
    memory ghosts unaffected. Screenshot proof.

TOOL TRIAGE
  Visual output needed?     Yes (VERIFICATION only) → preview_* screenshots of
                            entities-through-fog. No Imagen/Veo — renderers are
                            existing vector art, no new assets.
  Research/external data?   No — the reach audit + snapshot-serializer read are
                            complete from the local codebase this session.
  Artifact delivery needed? No — code change + this PDR doc; no Drive/PPTX/PDF/DOCX.

DIFFERENTIAL_TEST_REQUIRED: false
  Scope is render-layer (src/render + main.ts wiring). Touches none of ~/.claude/lib,
  hooks, router, LLM-prompt code, or schema migrations. Pure additive z-order layer —
  no behavioral-equivalence surface to byte-compare.

HOT_PATH_REFACTOR: false
  Same rationale — no router/hook/lib/prompt/schema edit. Render z-order is not a
  hot path in the S94/95/96 silent-breakage sense.

ESTIMATED TOKENS: ~18K (Standard)
MODEL: Opus 4.8 (ALWAYS — S154)

═══════════════════════════════════════════════════════════
    GATE: Awaiting approval to proceed
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
    COUNCIL DELIBERATION — S77 (Standard, R1, Battle Ledger)
═══════════════════════════════════════════════════════════
TRIUMVIRATE POSITIONS
  Claude (Prime Architect): render-only z-order via aboveFogLayer; exempt set
    = potato/rainbow/hunter/Voltkin by the rule; bomb excluded; effects deferred.
  Grok (Disruptor): bomb-exclusion AGREE; CHALLENGE hunter (rule says affect-ALL,
    hunter locks one), Voltkin info-leak (HIGH), effects-deferral ("invisible
    death", MED), mechanism (prefers zIndex/sortableChildren over 4 ctor changes).
  Gemini (Quality Auditor): REVISE — Voltkin visibility is a balance change needing
    design sign-off; owner-ID/CVD gap on bare above-fog sprites; e2e must prove the
    fog still OCCLUDES terrain behind the entity (no terrain leak), not just "renders".

BATTLE LEDGER
| # | Decision | Claude | Grok | Gemini | Authority | Resolution |
|---|----------|--------|------|--------|-----------|------------|
| 1 | Bomb excluded (single-owner) | exclude | AGREE | (implicit ok) | — | AGREED (unanimous) |
| 2 | Hunter included | include | CHALLENGE | sign-off | Claude(impl)+user | INCLUDE — dynamic target (any leader); neutral entity, ZERO concealment cost; user enumerated it. Rule-tension noted, not blocking. |
| 3 | Voltkin visibility | include | CHALLENGE(HIGH) | REVISE(balance) | Gemini(quality 1.75)+Grok(risk 1.75) | ESCALATE TO USER — genuine balance change (removes enemy-creature stealth). Default=include (user listed it); options: defer-creature / visible-while-attacking. |
| 4 | Effects deferred | defer | CHALLENGE(MED) | missing | Claude(impl 1.75) | DEFER (refuted) — owners ALWAYS see their own structures (every own primitive is a vision beacon, vision.ts:63), so no "invisible death"; the now-visible potato ARMED ring telegraphs the threat. Risk MED→LOW. |
| 5 | Mechanism (aboveFogLayer + parent) | keep | CHALLENGE(zIndex) | — | Claude(impl 1.75) | KEEP — matches the EXISTING memoryLayer precedent (addChild order, not zIndex); sortableChildren adds a per-frame full-stage sort, rejected by this codebase's software-WebGL perf doctrine. Grok's zIndex OVERRULED on impl authority. |
| 6 | Test strategy | e2e+unit | ADD(membership) | visual-regression | SYNTHESIS | SYNTHESIS — (a) layer-membership unit asserts in EXISTING renderer tests (no new heavy files, Grok); (b) e2e DUAL-pixel: entity pixel ≠ fog-black AND an adjacent fogged enemy-structure pixel == fog-black (proves visible AND no terrain leak, Gemini). |

QUALITY SCORECARD (Gemini): Verdict REVISE (pre-synthesis) → addressed via DP3 escalation + DP6 test upgrade + CVD carry-forward.
VETO LOG: No vetoes used.
CONFIDENCE: HIGH on mechanism + exempt set (minus Voltkin); Voltkin is a user game-feel call.

═══════════════════════════════════════════════════════════
    PRIME-AUDIT DELTA (Rule 20 — adversarial self-review)
═══════════════════════════════════════════════════════════
  Δ1 Voltkin RE-CLASSIFIED render-tweak → game-balance decision; escalated to user
     (council convergence in BOTH authority domains — not rubber-stamped).
  Δ2 Effects-deferral rationale HARDENED with the own-primitive-vision invariant
     (vision.ts:63) → "invisible death" cannot occur for the owner. Grok MED→LOW.
  Δ3 Test plan UPGRADED to the dual-pixel assertion (visible AND terrain-still-fogged)
     — the highest-signal proof; catches a terrain-leak regression a "renders?" test misses.
  Δ4 Mechanism CONFIRMED vs the zIndex alternative on precedent + perf grounds.
  Δ5 CVD/owner-ID = PRE-EXISTING project-wide (ownership=colour everywhere); tracked
     as backlog #3 (EYES fog/CVD shape-icons). OUT OF SCOPE here; this PDR raises the
     value of #3 (now enemy Voltkin is visible) → logged carry-forward, NOT dropped.
  Runtime-verifiability: mechanism is pure Pixi scenegraph (identical to the proven
     memoryLayer) → high confidence, but MANDATORY live-preview verification per the
     fogRenderer "GPU half verified live" doctrine (in TESTING PLAN).

REVISED OPEN DECISION (the only one): Voltkin treatment — see DP3.
  (A) Include — always-visible (matches your handoff ask; removes creature stealth)
  (B) Defer creature — ship potato+rainbow+hunter now; keep enemy Voltkin concealed
  (C) Visible-while-attacking — rule-faithful middle; +logic (renderer reads creature state)
═══════════════════════════════════════════════════════════
