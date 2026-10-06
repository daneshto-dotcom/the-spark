# S195 — WHAT HAS EARNED A DELIBERATE DEEP-REASONING PASS (written at the cloud run's close, 2026-10-05)

The owner asked, at the close of the cloud run: *"would this project benefit from a Fable 5.1 run … anything that could
benefit from it"* — then noticed the cloud run itself WAS Fable 5.1 (every tree agent and auditor inherited it). So this
is not a "which model" list. It is the honest version: **where depth of reasoning changes the outcome**, versus where the
work is mechanical and any capable model at medium effort is enough. One data point governs the whole list: on this run
the independent audit found a real defect in 6 of the 9 code trees it audited — the same rate S194 saw on Opus. Model
tier did NOT make the audit optional. Whatever runs these, the audit stays.

## A · HIGH leverage — design + determinism work where reasoning depth decides (run these with the most capable
##     model available, effort HIGH, one tree each, an independent auditor each)

1. **The entropy rule redesign (N18 → owner ruling, then build).** `S195_PROGRESS_fight-wipe.md` proves the ruled
   rule deletes ~45 % of a welded quadrant at one whistle (split multiplier ×2.07–2.34). Options (a) roll per structure,
   (b) gentler ramp/cap, (c) a snap never deletes a large split side, (e) entropy-broken hubs go dormant. Whichever he
   picks changes `severSplit` semantics, every entropy pin, the bots' derived break-even limits (`entropyBreakEvenConnectors`,
   s195/fixes), the canon table, and earns a bump. The hard part is not the code; it is proving the new rule's expected
   loss curve against the owner's intent ("players decide: keep building onto this tower, or build more structures") and
   re-deriving the bot limits so HARD bots do not lose their castles again (the flat-10 limit measured exactly that).
   Deliverable before code: the loss table per option × structure size, through `runHostTick`, like fight-wipe did.
2. **Delta snapshots (lag option B) + compressed snapshots (option A).** `S195_LAG_REPORT.md` §3: 7–25× fewer bytes
   at wave 8+, the structural fix for the brother's lag. It is a four-sites change for EVERY entity family, a keyframe +
   resync protocol, the host-migration successor path, and a long randomised "apply deltas == apply full" oracle. One
   missed field = a joiner silently sees a wrong board. This is the single highest-value piece of engineering left in
   the project and the one most likely to go wrong quietly. Bump YES. Prerequisite: the owner's `?debug=1` reading at
   wave 8–9 (network vs his PC) — two minutes of his time, §1c of the lag report.
3. **The reconnect hard-blip root cause.** s195/net-mp measured two attempts in the traced run, the first attempt's ICE
   completing THROUGH the second attempt's teardown (survived only because Trystero's shared peer kept the pc alive), and
   left T8's `connectedPeer/offerAnswered` early-return OPEN for a SILENT drop (sleeping laptop, dead Wi-Fi: the host's
   channel stays `open` until ICE fails, announces in that window are ignored). Owed: a reproduction that blocks UDP on
   one side (not `pc.close()`) with the live-mp harness on the desktop, then a fix that touches `transport.ts`'s
   `pendingLeaves` / attempt teardown — reasoning about three state machines (SPARK's rejoin plan, Trystero's signal
   handler, WebRTC ICE) at once. Candidate fix already named: do not tear down an attempt whose ICE is still progressing.
4. **Structure render caching (N17, the graphics-tier lever that ACTUALLY moves the frame).** The lag report measured
   fx HIGH/LOW/legacy = 53/50/51 ms at wave 5 under 4× throttle — the toggle does nothing because Pixi re-strokes every
   bond/structure each frame. Caching static structure geometry and redrawing only on change is render-only (no bump)
   but must not change a single pixel in normal mode and must invalidate on every structure mutation (weld, sever,
   repair, entropy, ownership change, scorched ground). The desktop `s195/lag` tree may already hold this — check before
   opening it.
5. **Uneven teams (N2, R195-T2) + host seat moves (N16) + team points race (R195-T1).** Lobby + zones + win rule across
   `teams.ts`, `lobbyRoster.ts`, `zoneBackgroundRenderer.ts`, `gameState.ts`. In flight on the desktop `s195/teams`
   tree; listed here because the WIN RULE part (team total vs bar × player count, ⚠ MINE) is a sim rule with a bump
   and deserves the loss-curve treatment, not a guess.

## B · MEDIUM — real work, well-specified, medium effort is enough with an auditor

6. Owner-only entropy readability v2 (option (d) of N18): the card's `~N lost/fight` → realised expectation, toast
   "N SNAPPED, M LOST" from the T22 `lostToEntropy` delta, a distinct erase cue without the shockwave. Render-only.
7. World-space hover/selection highlight (ui-4 proposal, needs his ring-vs-glow answer). Render-only.
8. NONET home + campaign (T13 option B, ~5–7 agent-days, `src/nonet/`, no bump) — after he answers the 10 questions.
9. The desktop-owned census REACH rows (settings overlay, lobby) and the `settingsOverlay` `:active` CSS seam.
10. Team music wiring (T14) when the tracks exist; 2v2 backdrops (T12-A) if not already landed on the desktop.

## C · LOW — mechanical; any model, low effort

11. Stink-tower ramp art + MRES card art landing (owner stills → `build-upgrade-cards.py`, atlas guard).
12. TURN secret re-paste (owner account action; text ready in `TURN_SETUP.md`).
13. Bundle charter raise 1250 → 1300 in its own commit when the next real feature needs it (47.4 KiB headroom now).
14. Docblock/canon sweeps after each landing (carry-forwards pattern).

## What this run showed about process (keep)
- The audit is the product. 6 of 9 audited code trees had a real defect while green: N11's home arm never fired for a
  real chewer (vacuous fixtures); the footer collapse tab had no press; `shiftChainedId` went stale; the hover tip drew
  under the POSTGAME scrim; the hard-blip "single attempt" claim contradicted its own trace; a test mock turned a module
  into a thenable and hung the suite. None of these would have been found by the author's gates.
- Never run the full suite on the main checkout while a merge can land under it (one contaminated run here); run it
  detached from the harness (two background runs were killed at exit 144).
- Say "fix ONLY these" and send the delta back to the author; the merge owner takes the one-liners.
