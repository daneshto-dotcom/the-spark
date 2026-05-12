# SPARK — Handoff S16 → S17
**Generated:** 2026-05-12 (post-Session-16)
**Branch:** master | **Last meaningful commit:** S16 P4 closeout (this commit)
**Working dir:** `C:\Users\onesh\OneDrive\Desktop\The Spark`
**Live URL:** **https://daneshto-dotcom.github.io/the-spark/** ✅

═══════════════════════════════════════════════════════════
## QUICK SUMMARY

SPARK S16 closed: **the cross-network playtest is ready TODAY.** Both
S15 BLOCKERS gone — lobby JOIN pane now uses a real HTML `<input>`
overlay (with full a11y + mobile guards), and the game is publicly
deployed via GitHub Pages official Actions pipeline.

Council R1 (Standard tier, 3-way deliberation) drove three key
improvements: switched deploy from peaceiris@v3 to GitHub's official
deploy-pages@v4 (audited modern path); added 5 a11y attrs to the input;
added `visualViewport.resize` for iOS mobile-keyboard. Scope Amendment #1
folded a persistent BETA badge into P3. Scope Amendment #2 deferred the
spark-online.space custom-domain swap (Step 2) to S17 ready-to-ship to
avoid breaking the github.io fallback URL during DNS propagation.

5 commits shipped: `b2979fc` P0 charter, `5ff7865` P1 lobby HTML input,
`4011862` P2 Step 1+1.5 deploy, `9d9d9ee` P3 BETA badge + ring/legend
visibility (re-triggered the deploy after Pages was enabled via
`gh api`), and the S16 P4 closeout commit (this one). 307/307 tests
green, typecheck exit 0, deploy run 25732727978 success in 1m4s,
HTTP 200 verified on the live URL.

═══════════════════════════════════════════════════════════
## THE LIVE URL

**https://daneshto-dotcom.github.io/the-spark/**

- HTTP 200 ✅
- HSTS enforced ✅
- favicon.svg + robots.txt + OG meta tags served ✅
- BETA badge top-right of canvas ✅
- Lobby JOIN HTML `<input>` works ✅

**Cross-network playtest path:**
1. You (host): open the URL → click "1v1 (2 Player)" → click "Host New
   Room" → 6-char room code appears in the HOST pane → share with friend
   (text/Slack/whatever).
2. Friend: opens the URL on their machine in a different country → clicks
   "1v1 (2 Player)" → JOIN pane → clicks in the cyan-border input →
   types the 6-char code (auto-uppercases, rejects 0/O/1/I) → clicks
   "Connect" → status: "Connecting..." then "Connected. Waiting for
   host..."
3. You: status changes to "Player 2 connected! Press Begin Match." Click
   "Begin Match."
4. Both: same world appears. You can drag sparks + build primitives.
   SPACE ends your turn. First to PHASE_1_WIN_SCORE wins.

═══════════════════════════════════════════════════════════
## WHAT TO DO NEXT (S17 priority order)

1. **P0 (Micro, ready-to-ship) — spark-online.space custom-domain swap.**
   Deferred from S16 P2 Step 2 per Scope Amendment #2.
   **User-flow before the commit:**
   - Squarespace DNS panel → Custom Records:
     - 4 A records: Host=`@`, values=`185.199.108.153`, `185.199.109.153`,
       `185.199.110.153`, `185.199.111.153`
     - 1 CNAME: Host=`www`, value=`daneshto-dotcom.github.io.`
       (trailing dot per RFC)
   - Wait for DNS resolve: `dig +short spark-online.space @8.8.8.8`
     should return the 4 GitHub Pages IPs (typically 15min–2h).
   - GitHub Settings → Pages → Custom domain = `spark-online.space` →
     Save → wait for green check + Enforce HTTPS toggle (Let's Encrypt
     auto-issues ~15min).
   **The commit (Claude will ship next session on go):**
   - `vite.config.ts` flip `base: '/'`
   - `public/CNAME` create with single line `spark-online.space\n`
   - LOCKED §13.9 row update (primary URL flipped to custom domain)
   - Build verified: `npm run build` → dist/index.html references
     `/assets/...` and `dist/CNAME` exists with correct content
   - Push; GH Actions deploys; visit https://spark-online.space/

2. **P1 (Micro, optional) — Cloudflare DNS migration.** User preference
   noted ("most of my domains are on cloudflare anyways"). Plan:
   - Squarespace Domains panel → Nameservers → "Use custom nameservers"
     → enter Cloudflare's pair (Cloudflare account dashboard will tell
     you the exact two — typically `ada.ns.cloudflare.com` +
     `cole.ns.cloudflare.com`).
   - Add domain to Cloudflare → re-add the 4 A records + www CNAME in CF
     DNS UI.
   - 24-48h propagation. github.io fallback continues working in the
     meantime since custom domain DNS lives at CF after the swap.
   - **Do this AFTER P0 first playtest succeeds**, not before — keeps the
     simple path simple.

3. **P2 (Micro, playtest-gated) — NET feel tuning.** After your first
   cross-network playtest with friend, tune:
   - `NET_SNAPSHOT_HZ = 10` (lower if bandwidth tight; higher if cursor
     feel sluggish)
   - `NET_INTERPOLATION_MS = 100` (lower if too laggy; higher if too
     jumpy)
   - Avatar pulse, redundant-bond geometry (from S14)
   If transient drops annoy, evaluate Grok R2's mandatory host-migration
   stub (Council R2 deferred this to S16 — now S17+).

4. **P3 (Standard, playtest-signal-gated) — NET enhancements.** Per
   S15 carry-forward:
   - Client-side AttractDrag prediction + reconciliation (~150 LOC)
   - Delta-encoded NetSnapshot for bandwidth
   - Host-migration stub
   - Live cursor-move sync (currently avatarPos only on commit)

5. **P4 (Standard) — Phase-2 Tier-1+ disruption suite.** Per
   `docs/phase-2-design-options.md`, recommended next pair: C
   (Sever-as-disruption) + F (Multi-color rendering). ~220 LOC.

6. **P5 (asset-gated) — Audio.** Suno didgeridoo trance track upload
   still pending since S5.

═══════════════════════════════════════════════════════════
## ACTIVE PLAN
→ None — S16 PDR archived at
  `.claude/plans-archive/2026-05-12_PDR_Session_16_COMPLETED.md`.
STATUS: COMPLETED.

═══════════════════════════════════════════════════════════
## CARRY-FORWARD

- **S17 P0 ready-to-ship** (custom-domain swap, ~3-line commit after user
  DNS + Pages Custom Domain toggle)
- **Cloudflare DNS migration** optional (user preference)
- **PLAYTEST-GATED:** Post-deploy cross-network 1v1; NET feel tuning
- **NET ENHANCEMENT (if playtest signals):** client prediction, delta
  NetSnapshot, host-migration stub, live cursor sync
- **ASSET-GATED:** Audio (Suno track pending)
- **PHASE-2-GATED:** docs/phase-2-design-options.md Tier-1+ pick
  (recommended C+F)

═══════════════════════════════════════════════════════════
## PRE-FLIGHT CHECKLIST (next session boot)

- [ ] Read this HANDOFF + boot-snapshot.md (compact)
- [ ] git status clean on master
- [ ] git log shows S16 closeout commit on top, then 9d9d9ee → 4011862 →
  5ff7865 → b2979fc → ef681a6
- [ ] `curl -sI https://daneshto-dotcom.github.io/the-spark/` → HTTP 200
- [ ] `npx vitest run` → 307/307 (or 308+ if S17 adds tests)
- [ ] `npx tsc -b --noEmit` → exit 0
- [ ] Read CLAUDE.md for protocol details

═══════════════════════════════════════════════════════════
## SESSION RULES (unchanged from S15)

- 1v1 networking LIVE via Trystero/Nostr; LOCKED §13 v1 spec
- §13.10 BETA badge persistent across all gameState (S16 add)
- §13.9 Deployment: github.io URL primary until S17 swap to
  spark-online.space (custom domain DNS at Squarespace; CF migration
  optional)
- 500-LOC anti-bloat §XV: world.ts at 290 (S16 cleaned, target met
  within 3.5%); controls.ts 542 (under 600 trip-wire); lobbyScreen.ts
  ~440 (under 500 soft charter)
- Git: master only, push at every commit, identity =
  daneshto@gmail.com

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

# DNS check for spark-online.space (after Squarespace records added)
dig +short spark-online.space @8.8.8.8
# Should return: 185.199.108.153 / .109.153 / .110.153 / .111.153
```

═══════════════════════════════════════════════════════════
## FULL HANDOFF DOC
→ Detailed session narrative in
  `.claude/plans-archive/2026-05-12_PDR_Session_16_COMPLETED.md`
→ S15 archive: `.handoff-archive/HANDOFF_2026-05-12_S15_postS16.md`

═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
