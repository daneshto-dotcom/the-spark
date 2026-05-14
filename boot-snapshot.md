# Boot Snapshot (auto-generated at S29 close)
Generated: 2026-05-14 | Session closed: S29 → next: S30 | Last commit: 84d6ed4 (S29 P0a cinematic luma-key shader fix GLSL ES 300 + Voltkin body-part slice spec)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay)

## Status

**S29 P0a SHIPPED** — Cinematic luma-key shader fix. Resolves cinematic-bug #1 (black screen instead of mp4) at root cause: shader mixed GLSL ES 300 `in vec2` with legacy GLSL 100 `gl_FragColor` (removed in 300 ES) → silent compile failure under Pixi v8/WebGL 2 auto-300-version prelude → video sprite never painted. Fix: declare `out vec4 finalColor;` + write to it. Likely resolves bug #2 (no voice) as side-effect (voice setTimeout was being cancelled by aborted cinematic cleanup path). Bug #3 (5s active window perception) confirmed-not-a-bug by lifecycle math 6s window.

**S29 P0b DEFERRED** to S30 — Voltkin Visual Overhaul (rig system + body-part animation + Alive Gate). Standard-tier Council R1+R2 + user-requested PRE-MORTEM Triumvirate audit revised plan from Full-tier 58K skeletal-rig + Imagen-body-parts (11 CRITICAL/HIGH findings flagged false-payback claim, Imagen-consistency unverified theater, no success metric, spring-jiggle non-determinism, Verlet-rig coupling) to Standard-tier 28K manual-slice + keyframe-pose-interp + continuous-overlays + Alive Gate (15-sec vs MapleStory mob clip, ship at 7+ rating). Asset prereq is user-provided GIMP slice of canonical Voltkin into 8 PNGs per `public/godly/voltkin/parts/SLICE_SPEC.md`. Imagen reference-conditioning empirically confirmed NON-FUNCTIONAL with API-key auth per gcp-vertex MCP tool description; Imagen text-only ($0.02 probe) produces visibly-different voltkin.

## Next Steps (S30+ candidates)

1. **S30 P0 — Voltkin rig + body-part animation** (Standard ~25K): blocked on user GIMP slice. Once `parts ready`, build `godlyAnimator.ts` (~180 LOC flat-sprite hierarchy under single Container, integer-tick math, linear interp between 2-4 keyframe poses per FSM state) + `voltkin.ts` poses (SPAWNING rise-fade, SEEKING 4-pose walk cycle, ATTACKING wind-up→fire-snap→recovery, DESPAWNING collapse-fade) + continuous overlays (breathing torso.scale.y sine 2Hz, head tracking atan2 toward targetBondId midpoint clamped ±30°, mohawk damped sine on head rotation velocity) + creatureRenderer.ts refactor (existing procedural transforms layer ON TOP) + Alive Gate test against MapleStory mob clip.

2. **S30 alt — Anvil creature** (Standard ~25K): if Voltkin slice is still pending, ship Anvil first using same FSM + Verlet + AI architecture from S25-S28. Per-type CreatureConfig table comes online (Gemini Q2 carry-forward S26+S27+S28). Voltkin gets visual upgrade later.

3. **S30 alt — Bond UX RMB-drag multi-target** (Micro/Standard): long-standing S23 P2 carry. Smaller scope, no asset blocker.

4. **S30 alt — P3 NET enhancements** (Full-tier): client prediction + delta NetSnapshot + host migration + live cursor.

5. **AC11 manual smoke**: open https://spark-online.space/?debug=1 in solo, build SQ4-TR4 chain, verify S29 P0a shader fix shows the mp4 cinematic (not black) + "Volt-kiiin!" voice plays + then S28 procedural transforms run.

## Blockers

- **S30 P0 Voltkin visual rig**: blocked on user GIMP slice of canonical (8 PNGs per `public/godly/voltkin/parts/SLICE_SPEC.md`, ~45-60 min wall-clock). Send "parts ready" when files dropped.
- None for alternative S30 P0s (Anvil / Bond UX / NET / smoke).

## Manual Smoke (AC11 ready — S29 P0a verification)

Build SQ4-TR4 chain in solo at `?debug=1`. Observe:
- Cinematic NOW SHOWS the mp4 video (Voltkin emerging from TV) for ~4s — NOT pure black like before S29
- "Volt-kiiin!" voice plays at ~3.5s mark
- Then S28 procedural transforms run (scale-pulse SPAWNING, ease-in yellow wind-up, white fire-flash, 1.20× scale punch, cyan ARC_FLASH cyan lightning, audible lightning-crackle.ogg, DESPAWN shrink + alpha-fade)
- 1v1: brother retest (7+ session carry, NetSnapshot v2 mirror still works as in S28)
- If video STILL black or voice STILL silent in spite of shader fix: console.log scan + report symptoms for S30 diagnostic

## Pending Backlog
- [ ] S30 P0 Voltkin rig + Alive Gate (blocked on slice)
- [ ] Anvil + Pac-Predator using proven Phase 2 architecture
- [ ] 1v1 CONNECT brother retest (NetSnapshot v2 unblocks)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (S23 P2 carry)
- [ ] Per-type CreatureConfig table (Gemini Q2 carry S26+S27+S28)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational — creatures 8s ephemeral; low priority)

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 29 (P0a Cinematic shader fix — Standard-tier Council R1+R2 + user-requested PRE-MORTEM Triumvirate audit; P0b rig system DEFERRED to S30 pending GIMP slice)
- S29 #user-requested-pre-mortem-found-11-issues-r2-synthesis-missed: User-requested adversarial PRE-MORTEM (Grok+Gemini+RALPH) on R2-locked plan found 11 CRITICAL/HIGH issues R1+R2 missed. Fatal: "rig pays back across godlies" FALSE (Anvil+Pac-Predator non-humanoid), Imagen consistency unverified theater, no success metric, spring-jiggle non-deterministic. Cost ~$0.05 + ~5K tokens vs 25K+ rebuild. Pattern: run pre-mortem BEFORE scope lock on any Standard/Full PDR touching assets/network/payback.
- S29 #imagen-reference-conditioning-non-functional-with-api-key-auth: `gcp-vertex` MCP `imagen_edit` description explicit: "Currently non-functional with API key auth." For style-locked characters, this collapses Imagen-based asset prep to text-only generation (lower fidelity).
- S29 #imagen-text-only-cannot-hold-locked-canonical-style: $0.02 probe with detailed style-prompt produced visibly-different voltkin (same 6-prior-failure pattern). Manual slice from canonical is only reliable path for style-locked characters.
- S29 #alive-needs-concrete-reference-not-mechanical-interpretation: "alive" → MapleStory mob reference. Probe concrete references BEFORE designing for abstract aesthetic words.
- S29 #rig-pays-back-claim-must-be-roadmap-verified: "Pays back across X" claims must be verified against actual roadmap entity topologies. Anvil + Pac-Predator non-humanoid invalidated Voltkin rig payback assumption.
- S29 #glsl-es-300-vs-legacy-100-silent-shader-failure-class: cinematicLumaKey.ts mixed `in vec2` (300 ES) with `gl_FragColor` (legacy GLSL 100) → silent compile failure under Pixi v8. Fix: `out vec4 finalColor` + write to it.
- S29 #askuserquestion-tool-can-return-empty-answers: AskUserQuestion tool returned empty twice this session. Use inline-prose-with-numbered-options for load-bearing architectural decisions.
- S29 #pre-mortem-cheaper-than-rebuild-codify-protocol: pre-mortem caught 11 issues for ~$0.05; codify into Standard/Full tier protocol if S30 confirms third utility.

### 2026-05-14 — Session 28 (P0 Voltkin Phase 2D polish — Standard-tier Council CODE-EXECUTION; Phase 2 finale)
- S28 #a-0-state-discovery-should-enumerate-assets-not-just-code: Biggest A.0 delta wasn't in code — it was in `assets-source/godly-voltkin/`. Probes for "where does X live?" should grep both `src/` AND `assets-source/` + `public/`.
- S28 #council-q-compromise-game-feel-at-equal-loc-cost: Q3 Gemini-B ease-in `t²` over Grok+Claude-A linear at equal 1-LOC cost. "Simplicity" defense moot when costs are equal.
- S28 #trimmed-wire-shape-when-consumer-is-render-only: Q4 trimmed 36 B over full 80 B mirror. Render-only consumer doesn't need AI fields.
- S28 #cross-council-unanimous-check-finding-now-3x-observed: 2 cross-Council UNANIMOUS CHECK findings. Codify as auto-accept signal.
- S28 #gemini-check-redesign-self-contradiction-now-3x-observed: G2 array-queue contradicts same-Gemini Q2 R1 vote. Reject with R1 cite, no debate.
- S28 #wall-clock-state-mutation-refactor-pays-prime-audit-dividend: Wall-clock setTimeout → tick-deterministic flag refactor caught Δ4 round + Δ5 abort clear BEFORE landing.
