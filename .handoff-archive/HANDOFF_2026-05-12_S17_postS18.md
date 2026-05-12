# SPARK — Handoff S17 → S18
**Generated:** 2026-05-12 (post-Session-17)
**Branch:** master | **Last meaningful commit:** S17 P3 closeout (this commit)
**Working dir:** `C:\Users\onesh\OneDrive\Desktop\The Spark`
**Live URL:** **https://daneshto-dotcom.github.io/the-spark/** (P0' lobby fix LIVE)

═══════════════════════════════════════════════════════════
## QUICK SUMMARY

SPARK S17 closed. **Phase-2 Tier-1 (Sever-as-disruption + multi-color bond rendering) SHIPPED.** Lobby Connect BLOCKER (S16 P1 ship had a double-offset position bug — Connect button at stage (2090, 940), 170px past canvas right edge) FIXED + Enter-key UX fallback added. Custom-domain swap committed locally and GATED on user explicit "go push" after Squarespace DNS + GH Pages Custom Domain toggle (S16 Scope Amendment #2 carry-forward closed). Council R1 (Grok DISRUPTOR + Gemini AUDITOR) on the Phase-2 work surfaced Gemini's BLOCKER (placerColor not ownerColor per §X.2 "reveal contributions"), the Pixi v8 native-gradient API myth (stroke decomposition adopted), and the hostile-if-EITHER-endpoint-placerColor-differs auth rule. PRIME-AUDIT delta added cycle-bond no-charge-consume + connectionDot relocation. 5 commits authored: `fd016c2` P0' BLOCKER (pushed), `c6f636d` P0 custom-domain (local), `629044a` P1 Sever (local), `91e1e21` P2 multi-color (local), this P3 closeout (local).

═══════════════════════════════════════════════════════════
## THE LIVE URL

**https://daneshto-dotcom.github.io/the-spark/** (P0' fix LIVE; P0+P1+P2+P3 push gated)

After P0 push (user-gated): **https://spark-online.space/** (Let's Encrypt auto-issues ~15min after Pages Custom Domain Save)

**Cross-network playtest path (now actually playable end-to-end):**
1. You (host): open the URL → click "1v1 (2 Player)" → click "Host New Room" → 6-char room code appears in the HOST pane → share with friend.
2. Friend: opens the URL → clicks "1v1 (2 Player)" → JOIN pane → clicks in the cyan-border input → types the 6-char code → clicks **"Connect" (now visible inside canvas, S17 P0' fix!)** OR presses **Enter** (S17 P0' new UX fallback) → status: "Connecting..." then "Connected. Waiting for host..."
3. You: "Player 2 connected! Press Begin Match." Click "Begin Match."
4. Both: same world appears. Build primitives. **NEW IN S17:**
   - **Charge dots** (top-left, below score readout): 0/1/2 filled player-colored circles indicating remaining disruption charges. Hollow rings when 0.
   - **Cross-player Sever (§VIII.3 row 1):** RMB-click an enemy bond. Costs 1 charge per destructive sever. Cycle-bond severs are FREE (no prims die, charge preserved).
   - **Multi-color bonds (§VI.4):** when P2 builds a primitive bonded to P1's structure (or vice versa), the bond renders a red→cyan 4-sub-segment gradient stroke instead of a single solid color.

═══════════════════════════════════════════════════════════
## WHAT TO DO NEXT (S18 priority order)

1. **P0 (still-gated, READY-TO-PUSH) — Custom-domain swap.** Commit `c6f636d` queued locally with `vite.config.ts` base='/' + `public/CNAME=spark-online.space`. Plus P1 (629044a) + P2 (91e1e21) + S17 closeout (this commit) all queued behind it. **User-flow before push:**
   - Squarespace DNS panel → Custom Records:
     - 4 A records: Host=`@`, values=`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     - 1 CNAME: Host=`www`, value=`daneshto-dotcom.github.io.` (trailing dot per RFC)
   - Wait for DNS resolve: `dig +short spark-online.space @8.8.8.8` should return the 4 GitHub Pages IPs.
   - GitHub Settings → Pages → Custom domain = `spark-online.space` → Save → wait for green check + Enforce HTTPS toggle.
   - Tell Claude "go push" → `git push origin master` ships all 4 queued commits. Verify HTTP 200 on https://spark-online.space/. LOCKED §13.9 amend post-push.

2. **P1 (Micro, optional) — Cloudflare DNS migration.** User preference. Do AFTER P0 first cross-network playtest succeeds.

3. **P2 (Micro, playtest-gated) — NET feel tuning.** After cross-network 1v1 playtest with friend (now actually possible since lobby works), tune:
   - `NET_SNAPSHOT_HZ = 10` (lower if bandwidth tight; higher if cursor feel sluggish)
   - `NET_INTERPOLATION_MS = 100` (lower if too laggy; higher if too jumpy)
   - Avatar pulse, redundant-bond geometry (from S14)

4. **P3 (Standard, playtest-signal-gated) — NET enhancements.** Per S15+ carry-forward:
   - Client-side AttractDrag prediction + reconciliation (~150 LOC)
   - Delta-encoded NetSnapshot for bandwidth
   - Host-migration stub
   - Live cursor-move sync (currently avatarPos only on commit)

5. **P4 (Standard) — disruptionManager.ts extraction from world.ts.** §XV anti-bloat carry-forward: world.ts at 308 LOC (10% over 280 target) after S17 P1 add. Extract Phase-2 §VIII.3 logic per Council R1 Grok #8 deferred. ~40 LOC moved out.

6. **P5 (Standard) — Phase-2 next mechanic.** Per `docs/phase-2-design-options.md`, pick one:
   - **D Inject Spiral** (`§VIII.3` row 2) — spec-ambiguous chaos propagation, design risk. ~200 LOC.
   - **E Steal** (`§VIII.3` row 3) — couples with F polish; closes territorial loop. ~250 LOC.
   - **A Fog of war** (`§III.4`/§X.4`) — foundation for visibility-gated raiding. ~250 LOC.
   - **G Mega-combos via connector chain** (`§VI.3`) — standalone, no prereqs. ~150 LOC.

7. **P6 (Micro) — Per-silhouette gradient polish.** S17 P2 multi-color rendering applied to default-line only; 12 magic silhouettes use colorA primary. Apply 4-sub-segment decomposition to each magic silhouette's primary stroke. ~80 LOC.

8. **P7 (Micro) — Bond-hover cost preview.** Council R1 Grok #4 deferred-PARTIAL. On hover over enemy bond, show "−1" cost + remaining charge dots near cursor. ~30 LOC.

9. **P8 (asset-gated) — Audio.** Suno didgeridoo trance track upload still pending since S5.

═══════════════════════════════════════════════════════════
## ACTIVE PLAN
→ None — S17 PDR archived at `.claude/plans-archive/2026-05-12_PDR_Session_17_COMPLETED.md`.
STATUS: COMPLETED.

═══════════════════════════════════════════════════════════
## CARRY-FORWARD

- **S18 P0 (push-ready, gated):** Custom-domain commit `c6f636d` + 3 queued (629044a P1 + 91e1e21 P2 + this P3 closeout). Push when user does DNS + Pages Custom Domain Save.
- **§XV anti-bloat:** world.ts 308 LOC (10% over 280); S18 P4 `disruptionManager.ts` extract.
- **Phase-2 §VI.4 polish:** 12 magic silhouettes use colorA primary — per-silhouette gradient deferred (S18 P6).
- **Bond-hover cost preview:** Council R1 Grok #4 deferred-PARTIAL (S18 P7).
- **PLAYTEST-GATED:** Cross-network 1v1 with friend (now functional); NET feel tuning; NET enhancements.
- **PHASE-2-GATED:** D Inject Spiral / E Steal / A Fog / G Mega-combos.
- **ASSET-GATED:** Audio (Suno track pending since S5).

═══════════════════════════════════════════════════════════
## PRE-FLIGHT CHECKLIST (next session boot)

- [ ] Read this HANDOFF + boot-snapshot.md (compact)
- [ ] git status: master, 4 local commits ahead of origin (P0+P1+P2+P3) IF user hasn't done DNS yet
- [ ] git log shows S17 closeout commit on top, then 91e1e21 → 629044a → c6f636d → fd016c2 (P0' pushed) → 58b3fcf → ...
- [ ] `curl -sI https://daneshto-dotcom.github.io/the-spark/` → HTTP 200 (or `https://spark-online.space/` if P0 pushed)
- [ ] `npx vitest run` → 330/330 (or 331+ if S18 adds tests)
- [ ] `npx tsc -b --noEmit` → exit 0
- [ ] Read CLAUDE.md for protocol details

═══════════════════════════════════════════════════════════
## SESSION RULES (S17 amendments)

- 1v1 networking LIVE via Trystero/Nostr; LOCKED §13 v1 spec
- §13.10 BETA badge text `BETA · S17 PHASE-2`; connectionDot at `(CANVAS_WIDTH-24, 48)` (moved from 24 to clear longer badge — PRIME-AUDIT E)
- §13.11 NEW Phase-2 §VIII.3 Sever-as-disruption codified (cause discriminator + auth rule + cycle-no-consume)
- §13.12 NEW Phase-2 §VI.4 multi-color bond rendering codified (stroke decomp + placerColor sourcing)
- §13.9 Deployment: github.io primary until P0 push then spark-online.space
- 500-LOC anti-bloat §XV: world.ts 308 (target 280, 10% over, S18 extract), bondVisualRenderer.ts ~430 (under 500), lobbyScreen.ts ~480 (under 500), controls.ts 543 (under 600)
- Git: master only, push at every commit (when not gated), identity = daneshto@gmail.com

═══════════════════════════════════════════════════════════
## QUICK COMMANDS

```bash
# Verify live URL works
curl -sI https://daneshto-dotcom.github.io/the-spark/

# Watch latest GH Actions deploy run
gh run list --limit 1

# Run tests
npx vitest run

# Dev server (port from $SESSION_PORT)
npm run dev

# Once user has done DNS — push the queued commits:
git push origin master

# Verify custom-domain after push:
curl -sI https://spark-online.space/
dig +short spark-online.space @8.8.8.8
```

═══════════════════════════════════════════════════════════
## FULL HANDOFF DOC
→ Detailed session narrative in `.claude/plans-archive/2026-05-12_PDR_Session_17_COMPLETED.md`
→ S16 archive: `.handoff-archive/HANDOFF_2026-05-12_S16_postS17.md`

═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
